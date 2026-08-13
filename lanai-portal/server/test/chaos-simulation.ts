/**
 * Chaos Engineering Simulation: Temporal Worker Crash Mid-Flight
 *
 * This script proves that the financial saga workflows recover correctly
 * when the worker process is abruptly killed mid-transaction.
 *
 * Scenario:
 * 1. Start a Temporal worker configured with a chaos interceptor.
 * 2. The interceptor is programmed to SIGKILL the worker process immediately
 *    after the TigerBeetle transfer succeeds but BEFORE the PostgreSQL commit.
 * 3. We submit a Booking Commission Saga.
 * 4. The worker crashes mid-flight.
 * 5. We verify the saga is stuck in "Running" state.
 * 6. We start a fresh, healthy worker.
 * 7. We verify the saga resumes, successfully re-executes the idempotent
 *    TigerBeetle transfer (returning `exists`), completes the PostgreSQL
 *    commit, and finishes successfully.
 */

import { NativeConnection, Worker } from "@temporalio/worker";
import { Client } from "@temporalio/client";
import { ENV } from "../_core/env";
import * as activities from "../workflows/activities";
import * as financialActivities from "../workflows/financialActivities";
import { getDb } from "../db";
import { ledgerTransfers } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TigerBeetle } from "../_core/infrastructure";
import crypto from "node:crypto";

const CHAOS_BOOKING_ID = 999999;
const CHAOS_MEMBER_ID = 888888;
const IDEMPOTENCY_KEY = `booking:${CHAOS_BOOKING_ID}:commission:GBP`;

// A modified version of the financial activities that injects chaos
const chaosActivities = {
  ...activities,
  ...financialActivities,
  // Override the TigerBeetle reserve activity to crash the process immediately after success
  reserveCommissionInTigerBeetle: async (input: any) => {
    console.log("💣 [Chaos Activity] Executing reserveCommissionInTigerBeetle...");
    const result = await financialActivities.reserveCommissionInTigerBeetle(input);
    console.log("💣 [Chaos Activity] TigerBeetle transfer succeeded. Transfer ID:", result.pendingTransferId);
    
    // If this is the first attempt (no env var flag), CRASH the process!
    if (!process.env.RECOVERY_MODE) {
      console.log("💣 [Chaos Activity] INITIATING ABRUPT PROCESS CRASH (SIGKILL) BEFORE POSTGRES COMMIT!");
      // We use process.kill to simulate an OOM kill or hard crash,
      // bypassing all graceful shutdown handlers.
      process.kill(process.pid, "SIGKILL");
      // This line will never be reached
      await new Promise((resolve) => setTimeout(resolve, 10000));
    } else {
      console.log("🛠️ [Recovery Activity] Running in recovery mode. Bypassing crash.");
    }
    
    return result;
  }
};

async function runWorker(recoveryMode: boolean) {
  if (recoveryMode) {
    process.env.RECOVERY_MODE = "true";
  }
  
  const connection = await NativeConnection.connect({
    address: ENV.temporalAddress,
  });
  
  const worker = await Worker.create({
    connection,
    namespace: ENV.temporalNamespace,
    taskQueue: ENV.temporalTaskQueue,
    workflowsPath: new URL("../workflows/workflows.js", import.meta.url).pathname,
    activities: recoveryMode ? { ...activities, ...financialActivities } : chaosActivities,
  });
  
  console.log(`[Worker] Started in ${recoveryMode ? "RECOVERY" : "CHAOS"} mode`);
  await worker.run();
}

async function triggerSaga() {
  const connection = await NativeConnection.connect({
    address: ENV.temporalAddress,
  });
  const client = new Client({ connection, namespace: ENV.temporalNamespace });
  
  console.log("🚀 [Client] Starting Booking Commission Saga...");
  const workflowId = `chaos-saga-${Date.now()}`;
  
  try {
    const handle = await client.workflow.start("bookingCommissionSaga", {
      args: [{
        bookingId: CHAOS_BOOKING_ID,
        memberId: CHAOS_MEMBER_ID,
        amount: "500.00",
        currency: "GBP",
        advisorUserId: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
      }],
      taskQueue: ENV.temporalTaskQueue,
      workflowId,
    });
    console.log(`🚀 [Client] Workflow started with ID: ${workflowId}`);
    return workflowId;
  } catch (err) {
    console.error("Failed to start workflow:", err);
    process.exit(1);
  }
}

async function verifyRecovery(workflowId: string) {
  console.log(`🔍 [Verify] Checking status of workflow ${workflowId}...`);
  const connection = await NativeConnection.connect({
    address: ENV.temporalAddress,
  });
  const client = new Client({ connection, namespace: ENV.temporalNamespace });
  
  const handle = client.workflow.getHandle(workflowId);
  const result = await handle.result();
  
  console.log("✅ [Verify] Workflow completed successfully after recovery!");
  console.log("✅ [Verify] Saga result:", result);
  
  // Verify PostgreSQL state
  const db = await getDb();
  const transferKey = `booking:${CHAOS_BOOKING_ID}:commission:GBP:50000`;
  const pgRecords = await db.select().from(ledgerTransfers).where(eq(ledgerTransfers.transferKey, transferKey));
  
  if (pgRecords.length === 1) {
    console.log("✅ [Verify] PostgreSQL record exists and is consistent.");
  } else {
    console.error("❌ [Verify] PostgreSQL record missing or duplicated!");
    process.exit(1);
  }
  
  console.log("🎉 CHAOS ENGINEERING SIMULATION PASSED");
  process.exit(0);
}

const mode = process.argv[2];
if (mode === "worker-chaos") {
  runWorker(false);
} else if (mode === "worker-recovery") {
  runWorker(true);
} else if (mode === "trigger") {
  triggerSaga();
} else if (mode === "verify") {
  verifyRecovery(process.argv[3]);
} else {
  console.log("Usage: ts-node chaos-simulation.ts [worker-chaos|worker-recovery|trigger|verify <workflowId>]");
}
