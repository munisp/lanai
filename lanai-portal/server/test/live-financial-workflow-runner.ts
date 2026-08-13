/*
 * Live staging financial workflow runner.
 *
 * This runner deliberately invokes the deployed Temporal worker rather than
 * calling financial activities directly. Each completed workflow must produce:
 *  - a deterministic TigerBeetle pending transfer and settlement transfer;
 *  - a posted PostgreSQL ledger mirror; and
 *  - a durable outbox event delivered through Fluvio/Dapr/Lakehouse.
 *
 * It is fail-closed and intended only for an isolated staging/load-test stack.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Connection, Client } from "@temporalio/client";
import { and, eq, inArray } from "drizzle-orm";
import {
  bookings,
  ledgerAccounts,
  ledgerTransfers,
  members,
  outboxEvents,
  proposals,
  travelRequests,
  workflowExecutions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { TigerBeetle } from "../_core/infrastructure";
import { dispatchOutboxBatch } from "../_core/outbox";

type Options = {
  runId: string;
  count: number;
  concurrency: number;
  amount: string;
  currency: string;
  evidenceDir: string;
};

function parseOptions(argv: string[]): Options {
  const options: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Usage: --run-id <id> --count <n> --concurrency <n> --amount <decimal> --currency <code> --evidence-dir <path>");
    }
    options[key.slice(2)] = value;
  }
  const runId = options.runId ?? "";
  const count = Number(options.count ?? 100);
  const concurrency = Number(options.concurrency ?? 20);
  const amount = options.amount ?? "150.00";
  const currency = (options.currency ?? "GBP").toUpperCase();
  const evidenceDir = options.evidenceDir ?? "/evidence";
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(runId)) throw new Error("run-id must be 8-64 URL-safe characters");
  if (!Number.isInteger(count) || count < 1 || count > 10_000) throw new Error("count must be 1-10000");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 500) throw new Error("concurrency must be 1-500");
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) throw new Error("amount must be a positive decimal with at most two decimals");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a three-letter ISO code");
  return { runId, count, concurrency, amount, currency, evidenceDir };
}

function ensureStagingGuard(options: Options): void {
  if (process.env.LANAI_LOADTEST_APPROVED !== "true") {
    throw new Error("Refusing live workflow writes: set LANAI_LOADTEST_APPROVED=true only for an approved change window");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!/loadtest|staging/i.test(databaseUrl)) {
    throw new Error("Refusing live workflow writes: DATABASE_URL must clearly target a dedicated staging/loadtest database");
  }
  for (const [name, value] of Object.entries({
    TEMPORAL_ADDRESS: ENV.temporalAddress,
    TIGERBEETLE_ADDRESS: ENV.tigerBeetleAddress,
    FLUVIO_ENDPOINT: ENV.fluvioEndpoint,
  })) {
    if (!value) throw new Error(`${name} is required for the live financial workflow runner`);
  }
  if (options.count > 2_000 && process.env.LANAI_LOADTEST_LARGE_RUN_APPROVED !== "true") {
    throw new Error("Runs above 2,000 workflows require LANAI_LOADTEST_LARGE_RUN_APPROVED=true");
  }
}

async function getOrCreateMember(runId: string): Promise<number> {
  const db = await getDb();
  const email = `loadtest-${runId}@staging.invalid`;
  const [created] = await db
    .insert(members)
    .values({ email, name: `Load Test ${runId}`, tier: "gold", notes: "Automated financial workflow load-test fixture" })
    .onConflictDoNothing({ target: members.email })
    .returning({ id: members.id });
  if (created) return created.id;
  const [existing] = await db.select({ id: members.id }).from(members).where(eq(members.email, email)).limit(1);
  if (!existing) throw new Error("Unable to create or load staging member fixture");
  return existing.id;
}

async function createProposalFixture(options: Options, memberId: number): Promise<number> {
  const db = await getDb();
  const [request] = await db
    .insert(travelRequests)
    .values({
      memberId,
      destination: "Load-test destination",
      dates: "2030-01-01 to 2030-01-02",
      pax: 1,
      status: "new",
      notes: `financial workflow staging fixture ${options.runId}`,
    })
    .returning({ id: travelRequests.id });
  if (!request) throw new Error("Unable to create staging travel request fixture");
  const [proposal] = await db
    .insert(proposals)
    .values({
      travelRequestId: request.id,
      memberId,
      title: `Financial workflow load test ${options.runId}`,
      status: "approved",
      totalPrice: options.amount,
      currency: options.currency,
      approvedAt: new Date(),
    })
    .returning({ id: proposals.id });
  if (!proposal) throw new Error("Unable to create staging proposal fixture");
  return proposal.id;
}

async function createBookings(options: Options, memberId: number, proposalId: number): Promise<Array<{ id: number }>> {
  const db = await getDb();
  const batchSize = 250;
  const records: Array<{ id: number }> = [];
  for (let offset = 0; offset < options.count; offset += batchSize) {
    const size = Math.min(batchSize, options.count - offset);
    const created = await db
      .insert(bookings)
      .values(Array.from({ length: size }, (_, index) => ({
        proposalId,
        memberId,
        referenceNumber: `loadtest-${options.runId}-${offset + index + 1}`,
        status: "confirmed" as const,
        totalAmount: options.amount,
        currency: options.currency,
        commissionExpected: options.amount,
        commissionAmount: options.amount,
        notes: `financial workflow staging fixture ${options.runId}`,
        confirmedAt: new Date(),
      })))
      .returning({ id: bookings.id });
    records.push(...created);
  }
  return records;
}

async function recordWorkflow(
  workflowId: string,
  input: Record<string, unknown>,
  status: "running" | "completed" | "failed",
  error?: string,
): Promise<void> {
  const db = await getDb();
  await db
    .insert(workflowExecutions)
    .values({
      workflowId,
      runId: workflowId,
      workflowType: "bookingCommissionSaga",
      taskQueue: ENV.temporalTaskQueue,
      aggregateType: "booking",
      aggregateId: String(input.bookingId ?? ""),
      status,
      input,
      result: status === "completed" ? { completedAt: new Date().toISOString() } : null,
      error: error ?? null,
      completedAt: status === "running" ? null : new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workflowExecutions.workflowId,
      set: {
        status,
        result: status === "completed" ? { completedAt: new Date().toISOString() } : null,
        error: error ?? null,
        completedAt: status === "running" ? null : new Date(),
        updatedAt: new Date(),
      },
    });
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  action: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      const value = values[index];
      if (value === undefined) return;
      await action(value);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  ensureStagingGuard(options);
  const startedAt = new Date().toISOString();
  const connection = await Connection.connect({ address: ENV.temporalAddress });
  const client = new Client({ connection, namespace: ENV.temporalNamespace });
  const memberId = await getOrCreateMember(options.runId);
  const proposalId = await createProposalFixture(options, memberId);
  const workflowBookings = await createBookings(options, memberId, proposalId);

  const workflowResults: Array<{ bookingId: number; pendingTransferId: string; settlementTransferId: string }> = [];
  await runWithConcurrency(workflowBookings, options.concurrency, async (booking) => {
    const idempotencyKey = `financial_staging_${options.runId}_booking_${booking.id}`;
    const workflowId = `financial-commission-${options.runId}-${booking.id}`;
    const workflowInput = {
      bookingId: booking.id,
      memberId,
      amount: options.amount,
      currency: options.currency,
      advisorUserId: 0,
      idempotencyKey,
    };
    await recordWorkflow(workflowId, workflowInput, "running");
    try {
      const handle = await client.workflow.start("bookingCommissionSaga", {
        taskQueue: ENV.temporalTaskQueue,
        workflowId,
        args: [workflowInput],
      });
      const result = await handle.result() as { pendingTransferId: string; settlementTransferId: string };
      await recordWorkflow(workflowId, workflowInput, "completed");
      workflowResults.push({ bookingId: booking.id, ...result });
    } catch (error) {
      await recordWorkflow(workflowId, workflowInput, "failed", error instanceof Error ? error.message : String(error));
      throw error;
    }
  });

  // Dispatch every due event. The run fails if Fluvio/Dapr/Lakehouse delivery
  // leaves a run-owned financial event short of published state.
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const batch = await dispatchOutboxBatch(500);
    if (batch.attempted === 0) break;
    if (batch.failed > 0) throw new Error(`Outbox delivery failed for ${batch.failed} event(s)`);
  }

  const db = await getDb();
  const bookingIds = workflowResults.map((result) => result.bookingId);
  const mirrors = await db
    .select()
    .from(ledgerTransfers)
    .where(and(eq(ledgerTransfers.referenceType, "booking"), inArray(ledgerTransfers.referenceId, bookingIds.map(String))));
  if (mirrors.length !== options.count) {
    throw new Error(`Expected ${options.count} ledger mirrors, found ${mirrors.length}`);
  }

  const mirrorByBooking = new Map(mirrors.map((mirror) => [Number(mirror.referenceId), mirror]));
  const accountIds = [...new Set(mirrors.flatMap((mirror) => [mirror.debitLedgerAccountId, mirror.creditLedgerAccountId]))];
  const accounts = await db.select().from(ledgerAccounts).where(inArray(ledgerAccounts.id, accountIds));
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  for (const result of workflowResults) {
    const mirror = mirrorByBooking.get(result.bookingId);
    if (!mirror || mirror.status !== "posted" || mirror.tigerBeetleSettlementTransferId !== result.settlementTransferId) {
      throw new Error(`Invalid financial mirror for booking ${result.bookingId}`);
    }
    const debit = accountById.get(mirror.debitLedgerAccountId);
    const credit = accountById.get(mirror.creditLedgerAccountId);
    if (!debit || !credit) throw new Error(`Missing ledger accounts for booking ${result.bookingId}`);
    const pending = await TigerBeetle.lookupTransfer(BigInt(result.pendingTransferId));
    const settlement = await TigerBeetle.lookupTransfer(BigInt(result.settlementTransferId));
    if (pending.debitAccountId !== BigInt(debit.tigerBeetleAccountId) || pending.creditAccountId !== BigInt(credit.tigerBeetleAccountId)) {
      throw new Error(`TigerBeetle debit/credit mismatch for booking ${result.bookingId}`);
    }
    if (settlement.debitAccountId !== BigInt(debit.tigerBeetleAccountId) || settlement.creditAccountId !== BigInt(credit.tigerBeetleAccountId)) {
      throw new Error(`TigerBeetle settlement account mismatch for booking ${result.bookingId}`);
    }
  }

  const expectedEventKeys = mirrors.map((mirror) => `financial:${mirror.transferKey}:posted`);
  const events = await db.select().from(outboxEvents).where(inArray(outboxEvents.idempotencyKey, expectedEventKeys));
  if (events.length !== options.count || events.some((event) => event.status !== "published")) {
    throw new Error(`Expected ${options.count} published financial outbox events; found ${events.length}`);
  }

  const evidence = {
    runId: options.runId,
    startedAt,
    completedAt: new Date().toISOString(),
    workflowCount: options.count,
    memberId,
    proposalId,
    ledgerMirrors: mirrors.length,
    publishedFinancialEvents: events.length,
    tigerBeetleVerified: workflowResults.length,
    temporalNamespace: ENV.temporalNamespace,
    temporalTaskQueue: ENV.temporalTaskQueue,
    result: "passed",
  };
  await mkdir(options.evidenceDir, { recursive: true });
  await writeFile(join(options.evidenceDir, `live-financial-${options.runId}-summary.json`), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence));
  await connection.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
