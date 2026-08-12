/**
 * Financial Activities — Temporal Activity Implementations
 *
 * Each activity is an idempotent, retriable unit of work. TigerBeetle's
 * native idempotency (via deterministic transfer IDs) ensures that retries
 * do not double-post funds. PostgreSQL uses ON CONFLICT DO NOTHING for the
 * same guarantee.
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
import { TigerBeetle, Fluvio } from "../_core/infrastructure";
import { ENV } from "../_core/env";
import type {
  BookingCommissionInput,
  InvoicePaymentInput,
  CommissionReconciliationInput,
} from "./financialWorkflows";

function deterministicUint128(key: string): bigint {
  const value = BigInt(
    `0x${crypto.createHash("sha256").update(key).digest("hex").slice(0, 32)}`,
  );
  return value === 0n ? 1n : value;
}

function amountToMinor(amount: string): bigint {
  const normalized = amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error("Financial amounts must be positive decimal with at most 2 fractional digits");
  const [whole, fractional = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fractional + "00").slice(0, 2));
  if (minor <= 0n) throw new Error("Financial amounts must be positive");
  return minor;
}

async function ensureAccount(
  accountKey: string,
  options: { memberId?: number; supplierId?: number } = {},
) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.accountKey, accountKey))
    .limit(1);
  if (existing[0]) return existing[0];

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
  const raced = await db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.accountKey, accountKey))
    .limit(1);
  if (!raced[0]) throw new Error(`Unable to persist ledger account ${accountKey}`);
  return raced[0];
}

// ─── Booking Commission Activities ───────────────────────────────────────────

export async function reserveCommissionInTigerBeetle(
  input: BookingCommissionInput,
): Promise<{ transferId: string; debitAccountId: string; creditAccountId: string }> {
  const amountMinor = amountToMinor(input.amount);
  const memberAccount = await ensureAccount(
    `member:${input.memberId}:payable`,
    { memberId: input.memberId },
  );
  const commissionAccount = await ensureAccount(
    `platform:${input.currency}:commission-receivable`,
  );

  const transferKey = `booking:${input.bookingId}:commission:${input.currency}:${amountMinor}`;
  const result = await TigerBeetle.createTransfer(
    amountMinor,
    BigInt(memberAccount.tigerBeetleAccountId),
    BigInt(commissionAccount.tigerBeetleAccountId),
    transferKey,
  );

  return {
    transferId: result.transferId.toString(),
    debitAccountId: memberAccount.tigerBeetleAccountId,
    creditAccountId: commissionAccount.tigerBeetleAccountId,
  };
}

export async function persistCommissionToPostgres(
  input: BookingCommissionInput & { transferId: string },
): Promise<{ ledgerTransferId: number }> {
  const db = await getDb();
  const amountMinor = amountToMinor(input.amount);
  const transferKey = `booking:${input.bookingId}:commission:${input.currency}:${amountMinor}`;

  const memberAccount = await db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.accountKey, `member:${input.memberId}:payable`))
    .limit(1);
  const commissionAccount = await db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.accountKey, `platform:${input.currency}:commission-receivable`))
    .limit(1);

  if (!memberAccount[0] || !commissionAccount[0])
    throw new Error("Ledger accounts not found — TigerBeetle step may have been skipped");

  const [row] = await db
    .insert(ledgerTransfers)
    .values({
      transferKey,
      tigerBeetleTransferId: input.transferId,
      debitLedgerAccountId: memberAccount[0].id,
      creditLedgerAccountId: commissionAccount[0].id,
      amountMinor: amountMinor.toString(),
      currency: input.currency,
      status: "posted",
      referenceType: "booking",
      referenceId: String(input.bookingId),
    })
    .onConflictDoNothing({ target: ledgerTransfers.transferKey })
    .returning({ id: ledgerTransfers.id });

  return { ledgerTransferId: row?.id ?? -1 };
}

export async function emitCommissionEventToFluvio(
  input: BookingCommissionInput & { transferId: string },
): Promise<void> {
  await Fluvio.produce(
    "lanai.financial.commission",
    JSON.stringify({
      eventType: "commission_posted",
      bookingId: input.bookingId,
      memberId: input.memberId,
      amount: input.amount,
      currency: input.currency,
      transferId: input.transferId,
      timestamp: new Date().toISOString(),
    }),
    `booking:${input.bookingId}`,
  );
}

export async function markBookingCommissionPosted(
  input: { bookingId: number; transferId: string },
): Promise<void> {
  const db = await getDb();
  await db
    .update(bookings)
    .set({
      commissionReceived: true,
      commissionReceivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));
}

export async function voidTigerBeetleTransfer(transferId: string): Promise<void> {
  // TigerBeetle does not support voiding posted transfers (they are immutable).
  // Instead, we post a compensating (reverse) transfer.
  // For now, log the compensation requirement — in production, this would
  // create a reverse entry with a linked compensation transfer ID.
  console.error(
    `[Financial Saga] COMPENSATION REQUIRED: TigerBeetle transfer ${transferId} must be reversed`,
  );
  // In a real deployment, this would call:
  // await TigerBeetle.createTransfer(amount, creditAccount, debitAccount, `void:${transferId}`);
}

// ─── Invoice Payment Activities ──────────────────────────────────────────────

export async function postPaymentToTigerBeetle(
  input: InvoicePaymentInput,
): Promise<{ transferId: string }> {
  const amountMinor = amountToMinor(input.amount);
  const cashAccount = await ensureAccount(`platform:${input.currency}:cash`);
  const receivableAccount = await ensureAccount(
    `member:${input.memberId}:receivable`,
    { memberId: input.memberId },
  );

  const transferKey = `payment:${input.stripePaymentIntentId}:${input.currency}:${amountMinor}`;
  const result = await TigerBeetle.createTransfer(
    amountMinor,
    BigInt(receivableAccount.tigerBeetleAccountId),
    BigInt(cashAccount.tigerBeetleAccountId),
    transferKey,
  );

  return { transferId: result.transferId.toString() };
}

export async function markInvoicePaid(
  input: { invoiceId: number; transferId: string; paidAt: string },
): Promise<void> {
  const db = await getDb();
  const [updated] = await db
    .update(invoices)
    .set({
      status: "paid",
      paidAt: new Date(input.paidAt),
      tigerBeetleTransferId: input.transferId,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, input.invoiceId))
    .returning({ id: invoices.id });

  if (!updated)
    throw new Error(`Invoice ${input.invoiceId} not found during payment posting`);
}

export async function emitPaymentEventToFluvio(
  input: InvoicePaymentInput & { transferId: string },
): Promise<void> {
  await Fluvio.produce(
    "lanai.financial.payments",
    JSON.stringify({
      eventType: "payment_received",
      invoiceId: input.invoiceId,
      memberId: input.memberId,
      amount: input.amount,
      currency: input.currency,
      stripePaymentIntentId: input.stripePaymentIntentId,
      transferId: input.transferId,
      timestamp: new Date().toISOString(),
    }),
    `invoice:${input.invoiceId}`,
  );
}

// ─── Commission Reconciliation Activities ────────────────────────────────────

export async function postCommissionPayableToTigerBeetle(
  input: CommissionReconciliationInput,
): Promise<{ transferId: string }> {
  const amountMinor = amountToMinor(input.amount);
  const commissionReceivable = await ensureAccount(
    `platform:${input.currency}:commission-receivable`,
  );
  const supplierPayable = await ensureAccount(
    `supplier:${input.supplierId}:payable`,
    { supplierId: input.supplierId },
  );

  const transferKey = `reconciliation:${input.invoiceId}:${input.currency}:${amountMinor}`;
  const result = await TigerBeetle.createTransfer(
    amountMinor,
    BigInt(commissionReceivable.tigerBeetleAccountId),
    BigInt(supplierPayable.tigerBeetleAccountId),
    transferKey,
  );

  return { transferId: result.transferId.toString() };
}

export async function markCommissionInvoiceSent(
  input: { invoiceId: number; transferId: string },
): Promise<void> {
  const db = await getDb();
  await db
    .update(invoices)
    .set({
      status: "sent",
      sentAt: new Date(),
      tigerBeetleTransferId: input.transferId,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, input.invoiceId));
}

export async function emitReconciliationEventToFluvio(
  input: CommissionReconciliationInput & { transferId: string },
): Promise<void> {
  await Fluvio.produce(
    "lanai.financial.reconciliation",
    JSON.stringify({
      eventType: "commission_reconciled",
      invoiceId: input.invoiceId,
      supplierId: input.supplierId,
      amount: input.amount,
      currency: input.currency,
      transferId: input.transferId,
      timestamp: new Date().toISOString(),
    }),
    `supplier:${input.supplierId}`,
  );
}
