/**
 * Financial activities for Temporal Sagas.
 *
 * Each funds movement uses a TigerBeetle two-phase transfer:
 *   1. reserve a deterministic pending transfer;
 *   2. durably mirror it in PostgreSQL with status=pending;
 *   3. post that exact pending transfer with a second deterministic ID; and
 *   4. persist an idempotent outbox event for downstream delivery.
 *
 * A downstream PostgreSQL failure before settlement voids the pending transfer.
 * Posted transfers are immutable by design; later retries only repeat idempotent
 * state transitions and never create a second monetary transfer.
 */
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import {
  bookings,
  invoices,
  ledgerAccounts,
  ledgerTransfers,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { TigerBeetle } from "../_core/infrastructure";
import { ENV } from "../_core/env";
import { enqueueDomainEvent } from "../_core/outbox";
import type {
  BookingCommissionInput,
  InvoicePaymentInput,
  CommissionReconciliationInput,
} from "./financialWorkflows";

export type PendingFinancialTransfer = {
  pendingTransferId: string;
  debitAccountId: string;
  creditAccountId: string;
  transferKey: string;
};

function deterministicUint128(key: string): bigint {
  const value = BigInt(
    `0x${crypto.createHash("sha256").update(key).digest("hex").slice(0, 32)}`,
  );
  return value === 0n ? 1n : value;
}

function amountToMinor(amount: string): bigint {
  const normalized = amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Financial amounts must be positive decimal with at most 2 fractional digits");
  }
  const [whole, fractional = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fractional + "00").slice(0, 2));
  if (minor <= 0n) throw new Error("Financial amounts must be positive");
  return minor;
}

/**
 * The business idempotency key is the canonical source for every cross-service
 * identity: Temporal workflow ID, TigerBeetle transfer IDs, PostgreSQL mirror,
 * and outbox delivery. Amount is included so a changed monetary request cannot
 * silently reuse an older funds movement.
 */
function financialTransferKey(idempotencyKey: string, amountMinor: bigint): string {
  const key = idempotencyKey.trim();
  if (!key || key.length > 100 || !/^[a-zA-Z0-9:_-]+$/.test(key)) {
    throw new Error("Financial idempotency key must be 1-100 URL-safe characters");
  }
  return `${key}:amount:${amountMinor}`;
}

async function ensureAccount(
  accountKey: string,
  options: { memberId?: number; supplierId?: number } = {},
) {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.accountKey, accountKey))
    .limit(1);
  if (existing) return existing;

  const tigerBeetleAccountId = deterministicUint128(accountKey);
  await TigerBeetle.createAccount(
    tigerBeetleAccountId,
    ENV.tigerBeetleLedger,
    ENV.tigerBeetleTransferCode,
  );

  const [created] = await db
    .insert(ledgerAccounts)
    .values({
      accountKey,
      tigerBeetleAccountId: tigerBeetleAccountId.toString(),
      ledger: ENV.tigerBeetleLedger,
      code: ENV.tigerBeetleTransferCode,
      memberId: options.memberId ?? null,
      supplierId: options.supplierId ?? null,
      advisorUserId: null,
    })
    .onConflictDoNothing({ target: ledgerAccounts.accountKey })
    .returning();
  if (created) return created;

  const [raced] = await db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.accountKey, accountKey))
    .limit(1);
  if (!raced) throw new Error(`Unable to persist ledger account ${accountKey}`);
  return raced;
}

async function persistPendingMirror(input: {
  transferKey: string;
  pendingTransferId: string;
  debitLedgerAccountId: number;
  creditLedgerAccountId: number;
  amountMinor: bigint;
  currency: string;
  referenceType: string;
  referenceId: string;
}): Promise<{ ledgerTransferId: number }> {
  const db = await getDb();
  const [created] = await db
    .insert(ledgerTransfers)
    .values({
      transferKey: input.transferKey,
      tigerBeetleTransferId: input.pendingTransferId,
      debitLedgerAccountId: input.debitLedgerAccountId,
      creditLedgerAccountId: input.creditLedgerAccountId,
      amountMinor: input.amountMinor.toString(),
      currency: input.currency,
      status: "pending",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    })
    .onConflictDoNothing({ target: ledgerTransfers.transferKey })
    .returning({ id: ledgerTransfers.id });
  if (created) return { ledgerTransferId: created.id };

  const [existing] = await db
    .select()
    .from(ledgerTransfers)
    .where(eq(ledgerTransfers.transferKey, input.transferKey))
    .limit(1);
  if (!existing) throw new Error(`Unable to read existing ledger transfer ${input.transferKey}`);
  if (
    existing.tigerBeetleTransferId !== input.pendingTransferId ||
    existing.debitLedgerAccountId !== input.debitLedgerAccountId ||
    existing.creditLedgerAccountId !== input.creditLedgerAccountId ||
    existing.amountMinor !== input.amountMinor.toString() ||
    existing.currency !== input.currency
  ) {
    throw new Error(`Ledger idempotency payload mismatch for ${input.transferKey}`);
  }
  return { ledgerTransferId: existing.id };
}

async function settleMirror(input: {
  transferKey: string;
  settlementTransferId: string;
}): Promise<void> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(ledgerTransfers)
    .where(eq(ledgerTransfers.transferKey, input.transferKey))
    .limit(1);
  if (!existing) throw new Error(`Ledger transfer ${input.transferKey} is missing before settlement`);
  if (
    existing.status === "posted" &&
    existing.tigerBeetleSettlementTransferId === input.settlementTransferId
  ) return;
  if (existing.status === "voided") {
    throw new Error(`Ledger transfer ${input.transferKey} has already been voided`);
  }
  if (
    existing.tigerBeetleSettlementTransferId &&
    existing.tigerBeetleSettlementTransferId !== input.settlementTransferId
  ) {
    throw new Error(`Settlement idempotency payload mismatch for ${input.transferKey}`);
  }
  const updated = await db
    .update(ledgerTransfers)
    .set({
      status: "posted",
      tigerBeetleSettlementTransferId: input.settlementTransferId,
    })
    .where(eq(ledgerTransfers.id, existing.id))
    .returning({ id: ledgerTransfers.id });
  if (updated.length !== 1) throw new Error(`Unable to settle ledger transfer ${input.transferKey}`);
}

async function voidPendingMirror(input: {
  transferKey: string;
  settlementTransferId: string;
}): Promise<void> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(ledgerTransfers)
    .where(eq(ledgerTransfers.transferKey, input.transferKey))
    .limit(1);
  // The mirror may not exist if the failure occurred before its insert; the
  // TigerBeetle void still succeeds and there is nothing local to update.
  if (!existing) return;
  if (existing.status === "voided" && existing.tigerBeetleSettlementTransferId === input.settlementTransferId) {
    return;
  }
  if (existing.status === "posted") {
    throw new Error(`Cannot void already-posted ledger transfer ${input.transferKey}`);
  }
  const updated = await db
    .update(ledgerTransfers)
    .set({
      status: "voided",
      tigerBeetleSettlementTransferId: input.settlementTransferId,
    })
    .where(eq(ledgerTransfers.id, existing.id))
    .returning({ id: ledgerTransfers.id });
  if (updated.length !== 1) throw new Error(`Unable to mark ledger transfer ${input.transferKey} voided`);
}

async function reserveTransfer(input: {
  transferKey: string;
  amountMinor: bigint;
  debitAccountId: string;
  creditAccountId: string;
}): Promise<PendingFinancialTransfer> {
  const result = await TigerBeetle.createPendingTransfer(
    input.amountMinor,
    BigInt(input.debitAccountId),
    BigInt(input.creditAccountId),
    `pending:${input.transferKey}`,
  );
  return {
    pendingTransferId: result.transferId.toString(),
    debitAccountId: input.debitAccountId,
    creditAccountId: input.creditAccountId,
    transferKey: input.transferKey,
  };
}

async function settlePendingTransfer(input: PendingFinancialTransfer): Promise<{ settlementTransferId: string }> {
  const result = await TigerBeetle.postPendingTransfer(
    BigInt(input.pendingTransferId),
    BigInt(input.debitAccountId),
    BigInt(input.creditAccountId),
    `post:${input.transferKey}`,
  );
  await settleMirror({
    transferKey: input.transferKey,
    settlementTransferId: result.transferId.toString(),
  });
  return { settlementTransferId: result.transferId.toString() };
}

async function compensatePendingTransfer(input: PendingFinancialTransfer): Promise<void> {
  const result = await TigerBeetle.voidPendingTransfer(
    BigInt(input.pendingTransferId),
    BigInt(input.debitAccountId),
    BigInt(input.creditAccountId),
    `void:${input.transferKey}`,
  );
  await voidPendingMirror({
    transferKey: input.transferKey,
    settlementTransferId: result.transferId.toString(),
  });
}

// ─── Booking commission activities ────────────────────────────────────────────
export async function reserveCommissionInTigerBeetle(
  input: BookingCommissionInput,
): Promise<PendingFinancialTransfer> {
  const amountMinor = amountToMinor(input.amount);
  const memberAccount = await ensureAccount(`member:${input.memberId}:payable`, { memberId: input.memberId });
  const commissionAccount = await ensureAccount(`platform:${input.currency}:commission-receivable`);
  return reserveTransfer({
    transferKey: financialTransferKey(input.idempotencyKey, amountMinor),
    amountMinor,
    debitAccountId: memberAccount.tigerBeetleAccountId,
    creditAccountId: commissionAccount.tigerBeetleAccountId,
  });
}

export async function persistCommissionToPostgres(
  input: BookingCommissionInput & PendingFinancialTransfer,
): Promise<{ ledgerTransferId: number }> {
  const db = await getDb();
  const amountMinor = amountToMinor(input.amount);
  const [debit] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.tigerBeetleAccountId, input.debitAccountId)).limit(1);
  const [credit] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.tigerBeetleAccountId, input.creditAccountId)).limit(1);
  if (!debit || !credit) throw new Error("Commission ledger accounts are missing");
  return persistPendingMirror({
    transferKey: input.transferKey,
    pendingTransferId: input.pendingTransferId,
    debitLedgerAccountId: debit.id,
    creditLedgerAccountId: credit.id,
    amountMinor,
    currency: input.currency,
    referenceType: "booking",
    referenceId: String(input.bookingId),
  });
}

export async function settleCommissionInTigerBeetle(input: PendingFinancialTransfer) {
  return settlePendingTransfer(input);
}

export async function voidCommissionInTigerBeetle(input: PendingFinancialTransfer): Promise<void> {
  return compensatePendingTransfer(input);
}

export async function enqueueCommissionEvent(input: BookingCommissionInput & PendingFinancialTransfer & { settlementTransferId: string }): Promise<void> {
  await enqueueDomainEvent({
    aggregateType: "financial",
    aggregateId: input.bookingId,
    eventType: "commission_posted",
    payload: {
      bookingId: input.bookingId, memberId: input.memberId, amount: input.amount,
      currency: input.currency, pendingTransferId: input.pendingTransferId,
      settlementTransferId: input.settlementTransferId,
    },
    idempotencyKey: `financial:${input.transferKey}:posted`,
  });
}

export async function markBookingCommissionPosted(input: { bookingId: number; settlementTransferId: string }): Promise<void> {
  const db = await getDb();
  const updated = await db.update(bookings).set({
    commissionReceived: true, commissionReceivedAt: new Date(), updatedAt: new Date(),
  }).where(eq(bookings.id, input.bookingId)).returning({ id: bookings.id });
  if (updated.length !== 1) throw new Error(`Booking ${input.bookingId} was not found while posting commission`);
}

// ─── Invoice payment activities ───────────────────────────────────────────────
export async function reservePaymentInTigerBeetle(input: InvoicePaymentInput): Promise<PendingFinancialTransfer> {
  const amountMinor = amountToMinor(input.amount);
  const cashAccount = await ensureAccount(`platform:${input.currency}:cash`);
  const receivableAccount = await ensureAccount(`member:${input.memberId}:receivable`, { memberId: input.memberId });
  return reserveTransfer({
    transferKey: financialTransferKey(input.idempotencyKey, amountMinor),
    amountMinor,
    debitAccountId: receivableAccount.tigerBeetleAccountId,
    creditAccountId: cashAccount.tigerBeetleAccountId,
  });
}

export async function persistPaymentToPostgres(input: InvoicePaymentInput & PendingFinancialTransfer): Promise<{ ledgerTransferId: number }> {
  const db = await getDb();
  const amountMinor = amountToMinor(input.amount);
  const [debit] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.tigerBeetleAccountId, input.debitAccountId)).limit(1);
  const [credit] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.tigerBeetleAccountId, input.creditAccountId)).limit(1);
  if (!debit || !credit) throw new Error("Payment ledger accounts are missing");
  return persistPendingMirror({
    transferKey: input.transferKey, pendingTransferId: input.pendingTransferId,
    debitLedgerAccountId: debit.id, creditLedgerAccountId: credit.id,
    amountMinor, currency: input.currency, referenceType: "invoice", referenceId: String(input.invoiceId),
  });
}

export async function settlePaymentInTigerBeetle(input: PendingFinancialTransfer) {
  return settlePendingTransfer(input);
}

export async function markInvoicePaid(input: { invoiceId: number; settlementTransferId: string; paidAt: string }): Promise<void> {
  const db = await getDb();
  const [updated] = await db.update(invoices).set({
    status: "paid", paidAt: new Date(input.paidAt), tigerBeetleTransferId: input.settlementTransferId, updatedAt: new Date(),
  }).where(eq(invoices.id, input.invoiceId)).returning({ id: invoices.id });
  if (!updated) throw new Error(`Invoice ${input.invoiceId} not found during payment posting`);
}

export async function enqueuePaymentEvent(input: InvoicePaymentInput & PendingFinancialTransfer & { settlementTransferId: string }): Promise<void> {
  await enqueueDomainEvent({
    aggregateType: "financial", aggregateId: input.invoiceId, eventType: "payment_received",
    payload: {
      invoiceId: input.invoiceId, memberId: input.memberId, amount: input.amount, currency: input.currency,
      stripePaymentIntentId: input.stripePaymentIntentId, pendingTransferId: input.pendingTransferId,
      settlementTransferId: input.settlementTransferId,
    },
    idempotencyKey: `financial:${input.transferKey}:posted`,
  });
}

// ─── Commission reconciliation activities ─────────────────────────────────────
export async function reserveCommissionPayableInTigerBeetle(input: CommissionReconciliationInput): Promise<PendingFinancialTransfer> {
  const amountMinor = amountToMinor(input.amount);
  const commissionReceivable = await ensureAccount(`platform:${input.currency}:commission-receivable`);
  const supplierPayable = await ensureAccount(`supplier:${input.supplierId}:payable`, { supplierId: input.supplierId });
  return reserveTransfer({
    transferKey: financialTransferKey(input.idempotencyKey, amountMinor),
    amountMinor,
    debitAccountId: commissionReceivable.tigerBeetleAccountId,
    creditAccountId: supplierPayable.tigerBeetleAccountId,
  });
}

export async function persistCommissionReconciliationToPostgres(input: CommissionReconciliationInput & PendingFinancialTransfer): Promise<{ ledgerTransferId: number }> {
  const db = await getDb();
  const amountMinor = amountToMinor(input.amount);
  const [debit] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.tigerBeetleAccountId, input.debitAccountId)).limit(1);
  const [credit] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.tigerBeetleAccountId, input.creditAccountId)).limit(1);
  if (!debit || !credit) throw new Error("Reconciliation ledger accounts are missing");
  return persistPendingMirror({
    transferKey: input.transferKey, pendingTransferId: input.pendingTransferId,
    debitLedgerAccountId: debit.id, creditLedgerAccountId: credit.id,
    amountMinor, currency: input.currency, referenceType: "invoice", referenceId: String(input.invoiceId),
  });
}

export async function settleCommissionPayableInTigerBeetle(input: PendingFinancialTransfer) {
  return settlePendingTransfer(input);
}

export async function markCommissionInvoiceSent(input: { invoiceId: number; settlementTransferId: string }): Promise<void> {
  const db = await getDb();
  const [updated] = await db.update(invoices).set({
    status: "sent", sentAt: new Date(), tigerBeetleTransferId: input.settlementTransferId, updatedAt: new Date(),
  }).where(eq(invoices.id, input.invoiceId)).returning({ id: invoices.id });
  if (!updated) throw new Error(`Commission invoice ${input.invoiceId} was not found during reconciliation`);
}

export async function enqueueReconciliationEvent(input: CommissionReconciliationInput & PendingFinancialTransfer & { settlementTransferId: string }): Promise<void> {
  await enqueueDomainEvent({
    aggregateType: "financial", aggregateId: input.invoiceId, eventType: "commission_reconciled",
    payload: {
      invoiceId: input.invoiceId, supplierId: input.supplierId, amount: input.amount, currency: input.currency,
      pendingTransferId: input.pendingTransferId, settlementTransferId: input.settlementTransferId,
    },
    idempotencyKey: `financial:${input.transferKey}:posted`,
  });
}
