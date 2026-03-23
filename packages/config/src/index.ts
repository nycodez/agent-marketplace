const read = (name: string, fallback?: string) => {
  const value = process.env[name];
  if (value && value.trim()) {
    return value.trim();
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required environment variable: ${name}`);
};

export const appConfig = {
  apiHost: read("API_HOST", "0.0.0.0"),
  apiPort: Number(read("API_PORT", "4001")),
  appUrl: read("APP_URL", "http://localhost:3000"),
  webApiBaseUrl: read("WEB_API_BASE_URL", "http://localhost:4001"),
  sessionSecret: read("SESSION_SECRET", "change-me"),
  databaseUrl: read("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/agent_marketplace"),
  redisUrl: read("REDIS_URL", "redis://localhost:6379"),
  temporalEnabled: read("TEMPORAL_ENABLED", "true") === "true",
  temporalAddress: read("TEMPORAL_ADDRESS", "localhost:7233"),
  temporalNamespace: read("TEMPORAL_NAMESPACE", "default"),
  temporalRunTaskQueue: read("TEMPORAL_RUN_TASK_QUEUE", "agent-marketplace-runs"),
  temporalPublicationTaskQueue: read(
    "TEMPORAL_PUBLICATION_TASK_QUEUE",
    "agent-marketplace-publications",
  ),
};

export type AppConfig = typeof appConfig;
