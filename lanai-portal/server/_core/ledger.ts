import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { ledgerAccounts, ledgerTransfers } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "./env";
import { TigerBeetle } from "./infrastructure";

function deterministicUint128(key: string): bigint {
  const value = BigInt(
    `0x${crypto.createHash("sha256").update(key).digest("hex").slice(0, 32)}`,
  );
  return value === 0n ? 1n : value;
}

function amountToMinor(amount: string): bigint {
  const normalized = amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error(
      "Financial amounts must be positive decimal values with at most two fractional digits",
    );
  const [whole, fractional = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fractional + "00").slice(0, 2));
  if (minor <= 0n) throw new Error("Financial amounts must be positive");
  return minor;
}

async function ensureLedgerAccount(
  accountKey: string,
  options: { memberId?: number; supplierId?: number; advisorUserId?: number },
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
      advisorUserId: options.advisorUserId ?? null,
    })
    .onConflictDoNothing({ target: ledgerAccounts.accountKey })
    .returning();
  if (created) return created;
  const raced = await db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.accountKey, accountKey))
    .limit(1);
  if (!raced[0])
    throw new Error(`Unable to persist ledger account ${accountKey}`);
  return raced[0];
}

/**
 * Posts a commission receivable transfer for a confirmed booking. The transfer
 * identifier is deterministic from the booking, monetary amount, and currency,
 * so retries use TigerBeetle's explicit `exists` semantics rather than duplicating money.
 */
export async function recordBookingCommission(input: {
  bookingId: number;
  memberId: number;
  amount: string;
  currency: string;
}): Promise<{ transferId: string; created: boolean }> {
  const db = await getDb();
  const amountMinor = amountToMinor(input.amount);
  const memberAccount = await ensureLedgerAccount(
    `member:${input.memberId}:payable`,
    { memberId: input.memberId },
  );
  const commissionAccount = await ensureLedgerAccount(
    `platform:${input.currency}:commission-receivable`,
    {},
  );
  const transferKey = `booking:${input.bookingId}:commission:${input.currency}:${amountMinor}`;
  const result = await TigerBeetle.createTransfer(
    amountMinor,
    BigInt(memberAccount.tigerBeetleAccountId),
    BigInt(commissionAccount.tigerBeetleAccountId),
    transferKey,
  );
  await db
    .insert(ledgerTransfers)
    .values({
      transferKey,
      tigerBeetleTransferId: result.transferId.toString(),
      debitLedgerAccountId: memberAccount.id,
      creditLedgerAccountId: commissionAccount.id,
      amountMinor: amountMinor.toString(),
      currency: input.currency,
      status: "posted",
      referenceType: "booking",
      referenceId: String(input.bookingId),
    })
    .onConflictDoNothing({ target: ledgerTransfers.transferKey });
  return { transferId: result.transferId.toString(), created: result.created };
}
