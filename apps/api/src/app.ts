import cors from "@fastify/cors";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";
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

  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
  });

  await registerRoutes(app);
  return app;
};
