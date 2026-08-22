import { NativeConnection, Worker } from "@temporalio/worker";
import { pathToFileURL } from "node:url";
import { ENV } from "../_core/env";
import * as activities from "./activities";
import * as financialActivities from "./financialActivities";

export async function runWorker(): Promise<void> {
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorker().catch((error) => {
    console.error("[Temporal worker] fatal error", error);
    process.exit(1);
  });
}
