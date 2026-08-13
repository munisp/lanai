/*
 * Daily staging financial evidence collector.
 *
 * This runner reads no credentials from source and refuses databases whose DSN
 * does not clearly identify a staging/load-test target. It summarizes durable
 * financial state and verifies every transfer in the selected time window with
 * the real TigerBeetle cluster before writing a tamper-evident JSON summary.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, gte, inArray } from "drizzle-orm";
import {
  auditLogs,
  eventDeliveries,
  ledgerTransfers,
  outboxEvents,
  workflowExecutions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { TigerBeetle } from "../_core/infrastructure";

function option(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? "") : (fallback ?? "");
}

function assertStaging(): void {
  if (process.env.LANAI_AUDIT_COLLECTION_APPROVED !== "true") {
    throw new Error("Refusing audit collection without LANAI_AUDIT_COLLECTION_APPROVED=true");
  }
  if (!/loadtest|staging/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Refusing audit collection against a database not clearly labelled staging/loadtest");
  }
}

async function main(): Promise<void> {
  assertStaging();
  const sinceHours = Number(option("since-hours", "24"));
  const outputDir = option("output-dir", "/evidence");
  if (!Number.isInteger(sinceHours) || sinceHours < 1 || sinceHours > 168) {
    throw new Error("since-hours must be an integer from 1 to 168");
  }
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const collectedAt = new Date().toISOString();
  const db = await getDb();

  const transfers = await db
    .select()
    .from(ledgerTransfers)
    .where(gte(ledgerTransfers.createdAt, since));
  const outbox = await db
    .select()
    .from(outboxEvents)
    .where(and(gte(outboxEvents.createdAt, since), eq(outboxEvents.aggregateType, "financial")));
  const outboxIds = outbox.map((event) => event.id);
  const deliveries = outboxIds.length
    ? await db.select().from(eventDeliveries).where(inArray(eventDeliveries.outboxEventId, outboxIds))
    : [];
  const workflows = await db
    .select()
    .from(workflowExecutions)
    .where(gte(workflowExecutions.startedAt, since));
  const auditCount = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(gte(auditLogs.createdAt, since));

  const ledgerStates = { pending: 0, posted: 0, voided: 0, other: 0 };
  let tigerBeetleVerified = 0;
  for (const transfer of transfers) {
    if (transfer.status === "pending") ledgerStates.pending += 1;
    else if (transfer.status === "posted") ledgerStates.posted += 1;
    else if (transfer.status === "voided") ledgerStates.voided += 1;
    else ledgerStates.other += 1;

    // Every local mirror must have a real pending transfer. Posted/voided states
    // must also have an immutable settlement transfer with a distinct ID.
    const pending = await TigerBeetle.lookupTransfer(BigInt(transfer.tigerBeetleTransferId));
    if (pending.id.toString() !== transfer.tigerBeetleTransferId) {
      throw new Error(`TigerBeetle pending ID mismatch for transfer key ${transfer.transferKey}`);
    }
    if (transfer.status !== "pending") {
      if (!transfer.tigerBeetleSettlementTransferId) {
        throw new Error(`Settled mirror ${transfer.transferKey} has no settlement transfer ID`);
      }
      const settlement = await TigerBeetle.lookupTransfer(BigInt(transfer.tigerBeetleSettlementTransferId));
      if (settlement.id.toString() !== transfer.tigerBeetleSettlementTransferId) {
        throw new Error(`TigerBeetle settlement ID mismatch for transfer key ${transfer.transferKey}`);
      }
    }
    tigerBeetleVerified += 1;
  }

  const deliveryStates = { delivered: 0, failed: 0, pending: 0 };
  for (const delivery of deliveries) {
    if (delivery.status === "delivered") deliveryStates.delivered += 1;
    else if (delivery.status === "failed") deliveryStates.failed += 1;
    else deliveryStates.pending += 1;
  }
  const invalidFinancialEvents = outbox.filter((event) => event.status !== "published" && event.status !== "pending");
  const failedFluvioDeliveries = deliveries.filter((delivery) => delivery.target === "fluvio" && delivery.status !== "delivered");
  const failedWorkflows = workflows.filter((workflow) => ["failed", "cancelled", "timed_out"].includes(workflow.status));

  const summary = {
    collectedAt,
    since: since.toISOString(),
    until: collectedAt,
    scope: "staging/loadtest only",
    ledger: {
      transferCount: transfers.length,
      tigerBeetleVerified,
      states: ledgerStates,
      invalidSettledMirrors: transfers.filter((transfer) => transfer.status !== "pending" && !transfer.tigerBeetleSettlementTransferId).map((transfer) => transfer.transferKey),
    },
    outbox: {
      financialEventCount: outbox.length,
      invalidFinancialEvents: invalidFinancialEvents.map((event) => ({ eventId: event.eventId, status: event.status })),
      deliveryStates,
      failedFluvioDeliveries: failedFluvioDeliveries.map((delivery) => ({ outboxEventId: delivery.outboxEventId, attempts: delivery.attempts, lastError: delivery.lastError })),
    },
    workflows: {
      total: workflows.length,
      failed: failedWorkflows.map((workflow) => ({ workflowId: workflow.workflowId, status: workflow.status, lastError: workflow.error })),
    },
    auditLogRecords: auditCount.length,
  };
  const passed =
    summary.ledger.invalidSettledMirrors.length === 0 &&
    summary.outbox.invalidFinancialEvents.length === 0 &&
    summary.outbox.failedFluvioDeliveries.length === 0 &&
    summary.workflows.failed.length === 0;

  await mkdir(outputDir, { recursive: true });
  const filename = `staging-financial-audit-${collectedAt.replace(/[:.]/g, "-")}.json`;
  const serialized = JSON.stringify({ ...summary, passed }, null, 2) + "\n";
  const sha256 = createHash("sha256").update(serialized).digest("hex");
  await writeFile(join(outputDir, filename), serialized);
  await writeFile(join(outputDir, `${filename}.sha256`), `${sha256}  ${filename}\n`);
  console.log(JSON.stringify({ ...summary, passed, sha256 }));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
