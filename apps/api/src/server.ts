import { appConfig } from "@agent-marketplace/config";
import { createApp } from "./app.js";

const start = async () => {
  const app = await createApp();
  await app.listen({
    host: appConfig.apiHost,
    port: appConfig.apiPort,
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
