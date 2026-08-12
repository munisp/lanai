import { NativeConnection, Worker } from "@temporalio/worker";
import { ENV } from "../_core/env";
import * as activities from "./activities";
import * as financialActivities from "./financialActivities";

async function run(): Promise<void> {
  const connection = await NativeConnection.connect({
    address: ENV.temporalAddress,
  });
  const worker = await Worker.create({
    connection,
    namespace: ENV.temporalNamespace,
    taskQueue: ENV.temporalTaskQueue,
    workflowsPath: new URL("./workflows.js", import.meta.url).pathname,
    activities: { ...activities, ...financialActivities },
  });
  await worker.run();
}

run().catch((error) => {
  console.error("[Temporal worker] fatal error", error);
  process.exit(1);
});
