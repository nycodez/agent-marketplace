import { createMigration, getMigrationStatus, migrate } from "./migrator";

const command = process.argv[2];

const run = async () => {
  switch (command) {
    case "migrate": {
      const result = await migrate();
      if (!result.appliedCount) {
        console.log("No pending migrations.");
        return;
      }

      console.log(`Applied ${result.appliedCount} migration(s):`);
      for (const filename of result.applied) {
        console.log(`- ${filename}`);
      }
      return;
    }

    case "status": {
      const status = await getMigrationStatus();
      console.log(`Applied: ${status.applied.length}`);
      for (const migration of status.applied) {
        console.log(`- ${migration.filename} (${migration.applied_at})`);
      }

      console.log(`Pending: ${status.pending.length}`);
      for (const migration of status.pending) {
        console.log(`- ${migration.filename}`);
      }
      return;
    }

    case "create": {
      const name = process.argv.slice(3).join(" ").trim();
      const result = await createMigration(name);
      console.log(`Created ${result.filename}`);
      return;
    }

    default:
      throw new Error("Unknown command. Use migrate, status, or create.");
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
