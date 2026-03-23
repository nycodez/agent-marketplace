import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../migrations");
const repoRoot = path.resolve(__dirname, "../../..");

const migrationTableSql = `
  create table if not exists schema_migrations (
    id text primary key,
    filename text not null unique,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
`;

let envLoaded = false;

const parseEnvLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return {
    key,
    value,
  };
};

const loadEnvFile = async (filename: string) => {
  const fullPath = path.join(repoRoot, filename);

  try {
    const content = await fs.readFile(fullPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }

      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
};

const ensureEnvLoaded = async () => {
  if (envLoaded) {
    return;
  }

  await loadEnvFile(".env");
  await loadEnvFile(".env.local");
  envLoaded = true;
};

export type MigrationFile = {
  id: string;
  filename: string;
  fullPath: string;
  sql: string;
  checksum: string;
};

export type AppliedMigrationRecord = {
  id: string;
  filename: string;
  checksum: string;
  applied_at: string;
};

export type MigrationStatus = {
  pending: MigrationFile[];
  applied: AppliedMigrationRecord[];
};

const readDatabaseUrl = () => {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("Missing DATABASE_URL. Set it before running migrations.");
  }

  return value;
};

const createClient = async () => {
  await ensureEnvLoaded();
  const client = new Client({
    connectionString: readDatabaseUrl(),
  });

  await client.connect();
  return client;
};

const ensureMigrationTable = async (client: Client) => {
  await client.query(migrationTableSql);
};

const computeChecksum = (sql: string) =>
  crypto.createHash("sha256").update(sql, "utf8").digest("hex");

const parseMigrationId = (filename: string) => {
  const match = filename.match(/^(\d+)_.*\.sql$/);
  if (!match) {
    throw new Error(`Invalid migration filename "${filename}". Expected format 0001_name.sql`);
  }

  return match[1];
};

const loadMigrationFiles = async (): Promise<MigrationFile[]> => {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    files.map(async (filename) => {
      const fullPath = path.join(migrationsDir, filename);
      const sql = await fs.readFile(fullPath, "utf8");
      return {
        id: parseMigrationId(filename),
        filename,
        fullPath,
        sql,
        checksum: computeChecksum(sql),
      };
    }),
  );
};

const loadAppliedMigrations = async (client: Client): Promise<AppliedMigrationRecord[]> => {
  const result = await client.query<AppliedMigrationRecord>(
    `
      select id, filename, checksum, applied_at::text
      from schema_migrations
      order by id asc
    `,
  );

  return result.rows;
};

export const getMigrationStatus = async (): Promise<MigrationStatus> => {
  const client = await createClient();

  try {
    await ensureMigrationTable(client);
    const [files, applied] = await Promise.all([loadMigrationFiles(), loadAppliedMigrations(client)]);
    const appliedIds = new Set(applied.map((migration) => migration.id));

    return {
      pending: files.filter((file) => !appliedIds.has(file.id)),
      applied,
    };
  } finally {
    await client.end();
  }
};

export const migrate = async () => {
  const client = await createClient();

  try {
    await ensureMigrationTable(client);
    const files = await loadMigrationFiles();
    const applied = await loadAppliedMigrations(client);
    const appliedById = new Map(applied.map((migration) => [migration.id, migration]));
    const pending = files.filter((file) => !appliedById.has(file.id));

    for (const file of files) {
      const existing = appliedById.get(file.id);
      if (existing && existing.checksum !== file.checksum) {
        throw new Error(
          `Migration ${file.filename} was already applied with a different checksum. Create a new migration instead of editing applied files.`,
        );
      }
    }

    for (const migration of pending) {
      await client.query("begin");

      try {
        await client.query(migration.sql);
        await client.query(
          `
            insert into schema_migrations (id, filename, checksum)
            values ($1, $2, $3)
          `,
          [migration.id, migration.filename, migration.checksum],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(
          `Failed while applying ${migration.filename}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    return {
      appliedCount: pending.length,
      applied: pending.map((migration) => migration.filename),
    };
  } finally {
    await client.end();
  }
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const createMigration = async (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Migration name is required.");
  }

  const files = await loadMigrationFiles().catch(async (error: unknown) => {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      await fs.mkdir(migrationsDir, { recursive: true });
      return [];
    }

    throw error;
  });

  const nextIndex = files.length + 1;
  const filename = `${String(nextIndex).padStart(4, "0")}_${slugify(trimmed)}.sql`;
  const fullPath = path.join(migrationsDir, filename);
  const template = `-- ${trimmed}\n\nbegin;\n\n-- write migration here\n\ncommit;\n`;

  await fs.writeFile(fullPath, template, "utf8");

  return {
    filename,
    fullPath,
  };
};
