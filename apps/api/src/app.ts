import cors from "@fastify/cors";
import Fastify from "fastify";
import { appConfig } from "@agent-marketplace/config";
import { registerRoutes } from "./routes/index.js";
import { initStoreFromDatabase } from "./services/store.js";

export const createApp = async () => {
  await initStoreFromDatabase();

  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: [appConfig.appUrl],
    credentials: true,
    exposedHeaders: ["x-session-token"],
  });

  await registerRoutes(app);
  return app;
};
