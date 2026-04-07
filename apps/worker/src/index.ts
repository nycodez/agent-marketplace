import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "@agent-marketplace/config";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const start = async () => {
  const connection = await NativeConnection.connect({
    address: appConfig.temporalAddress,
  });

  const workflowsPath = path.join(__dirname, "workflows.ts");

  const runWorker = await Worker.create({
    connection,
    namespace: appConfig.temporalNamespace,
    taskQueue: appConfig.temporalRunTaskQueue,
    workflowsPath,
    activities,
  });

  const publicationWorker = await Worker.create({
    connection,
    namespace: appConfig.temporalNamespace,
    taskQueue: appConfig.temporalPublicationTaskQueue,
    workflowsPath,
    activities,
  });

  console.log("[worker] temporal workers online", {
    temporalAddress: appConfig.temporalAddress,
    namespace: appConfig.temporalNamespace,
    runTaskQueue: appConfig.temporalRunTaskQueue,
    publicationTaskQueue: appConfig.temporalPublicationTaskQueue,
  });

  await Promise.all([runWorker.run(), publicationWorker.run()]);
};

start().catch((error) => {
  console.error("[worker] failed to start temporal workers", error);
  process.exit(1);
});
