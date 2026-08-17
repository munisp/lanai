/**
 * Durable financial Sagas.
 *
 * Each Saga reserves a TigerBeetle pending transfer, persists its PostgreSQL
 * mirror, settles the pending transfer, then records an idempotent outbox event.
 * Database failure before settlement triggers a real TigerBeetle void operation.
 * After settlement, retries only replay idempotent PostgreSQL/outbox mutations;
 * they cannot create another transfer.
 */
import { proxyActivities, ApplicationFailure } from "@temporalio/workflow";
import type { PendingFinancialTransfer } from "./financialActivities";

export type BookingCommissionInput = {
  bookingId: number;
  memberId: number;
  amount: string;
  currency: string;
  advisorUserId: number;
  idempotencyKey: string;
};

export type InvoicePaymentInput = {
  invoiceId: number;
  memberId: number;
  amount: string;
  currency: string;
  stripePaymentIntentId: string;
  idempotencyKey: string;
};

export type CommissionReconciliationInput = {
  invoiceId: number;
  supplierId: number;
  amount: string;
  currency: string;
  idempotencyKey: string;
};

type Settlement = { settlementTransferId: string };
type Persisted = { ledgerTransferId: number };

/**
 * Compensation must not share the ordinary five-attempt activity limit. A
 * pending TigerBeetle reserve cannot be left outstanding simply because a
 * transient network or worker outage outlives normal business retries. The
 * underlying void transfer has a deterministic ID, so replay is safe.
 */
const compensation = proxyActivities<{
  voidCommissionInTigerBeetle(input: PendingFinancialTransfer): Promise<void>;
}>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 0,
    initialInterval: "1s",
    maximumInterval: "5m",
    backoffCoefficient: 2,
    nonRetryableErrorTypes: ["INVALID_INPUT", "DUPLICATE_TRANSFER"],
  },
});

const financial = proxyActivities<{
  reserveCommissionInTigerBeetle(input: BookingCommissionInput): Promise<PendingFinancialTransfer>;
  persistCommissionToPostgres(input: BookingCommissionInput & PendingFinancialTransfer): Promise<Persisted>;
  settleCommissionInTigerBeetle(input: PendingFinancialTransfer): Promise<Settlement>;
  voidCommissionInTigerBeetle(input: PendingFinancialTransfer): Promise<void>;
  enqueueCommissionEvent(input: BookingCommissionInput & PendingFinancialTransfer & Settlement): Promise<void>;
  markBookingCommissionPosted(input: { bookingId: number; settlementTransferId: string }): Promise<void>;

  reservePaymentInTigerBeetle(input: InvoicePaymentInput): Promise<PendingFinancialTransfer>;
  persistPaymentToPostgres(input: InvoicePaymentInput & PendingFinancialTransfer): Promise<Persisted>;
  settlePaymentInTigerBeetle(input: PendingFinancialTransfer): Promise<Settlement>;
  enqueuePaymentEvent(input: InvoicePaymentInput & PendingFinancialTransfer & Settlement): Promise<void>;
  markInvoicePaid(input: { invoiceId: number; settlementTransferId: string; paidAt: string }): Promise<void>;

  reserveCommissionPayableInTigerBeetle(input: CommissionReconciliationInput): Promise<PendingFinancialTransfer>;
  persistCommissionReconciliationToPostgres(input: CommissionReconciliationInput & PendingFinancialTransfer): Promise<Persisted>;
  settleCommissionPayableInTigerBeetle(input: PendingFinancialTransfer): Promise<Settlement>;
  enqueueReconciliationEvent(input: CommissionReconciliationInput & PendingFinancialTransfer & Settlement): Promise<void>;
  markCommissionInvoiceSent(input: { invoiceId: number; settlementTransferId: string }): Promise<void>;
}>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 5,
    initialInterval: "1s",
    maximumInterval: "30s",
    backoffCoefficient: 2,
    nonRetryableErrorTypes: ["INVALID_INPUT", "DUPLICATE_TRANSFER", "SAGA_COMPENSATION"],
  },
});

function compensationFailure(stage: string, error: unknown): ApplicationFailure {
  return ApplicationFailure.create({
    message: `Financial Saga failed at ${stage}: ${String(error)}`,
    type: "SAGA_COMPENSATION",
    nonRetryable: true,
  });
}

/** Booking commission: pending reserve → DB mirror → post → outbox → booking state. */
export async function bookingCommissionSaga(
  input: BookingCommissionInput,
): Promise<{ pendingTransferId: string; settlementTransferId: string; status: "posted" }> {
  const pending = await financial.reserveCommissionInTigerBeetle(input);
  try {
    await financial.persistCommissionToPostgres({ ...input, ...pending });
  } catch (error) {
    await compensation.voidCommissionInTigerBeetle(pending);
    throw compensationFailure("commission mirror persistence", error);
  }
  const settlement = await financial.settleCommissionInTigerBeetle(pending);
  await financial.enqueueCommissionEvent({ ...input, ...pending, ...settlement });
  await financial.markBookingCommissionPosted({
    bookingId: input.bookingId,
    settlementTransferId: settlement.settlementTransferId,
  });
  return { pendingTransferId: pending.pendingTransferId, settlementTransferId: settlement.settlementTransferId, status: "posted" };
}

/** Invoice payment: pending reserve → DB mirror → post → invoice state → outbox. */
export async function invoicePaymentSaga(
  input: InvoicePaymentInput,
): Promise<{ pendingTransferId: string; settlementTransferId: string }> {
  const pending = await financial.reservePaymentInTigerBeetle(input);
  try {
    await financial.persistPaymentToPostgres({ ...input, ...pending });
  } catch (error) {
    // Payment uses the same pending-transfer compensation contract as commission.
    await compensation.voidCommissionInTigerBeetle(pending);
    throw compensationFailure("payment mirror persistence", error);
  }
  const settlement = await financial.settlePaymentInTigerBeetle(pending);
  await financial.markInvoicePaid({
    invoiceId: input.invoiceId,
    settlementTransferId: settlement.settlementTransferId,
    paidAt: new Date().toISOString(),
  });
  await financial.enqueuePaymentEvent({ ...input, ...pending, ...settlement });
  return { pendingTransferId: pending.pendingTransferId, settlementTransferId: settlement.settlementTransferId };
}

/** Supplier commission reconciliation: pending reserve → mirror → post → invoice state → outbox. */
export async function commissionReconciliationSaga(
  input: CommissionReconciliationInput,
): Promise<{ pendingTransferId: string; settlementTransferId: string }> {
  const pending = await financial.reserveCommissionPayableInTigerBeetle(input);
  try {
    await financial.persistCommissionReconciliationToPostgres({ ...input, ...pending });
  } catch (error) {
    await compensation.voidCommissionInTigerBeetle(pending);
    throw compensationFailure("reconciliation mirror persistence", error);
  }
  const settlement = await financial.settleCommissionPayableInTigerBeetle(pending);
  await financial.markCommissionInvoiceSent({
    invoiceId: input.invoiceId,
    settlementTransferId: settlement.settlementTransferId,
  });
  await financial.enqueueReconciliationEvent({ ...input, ...pending, ...settlement });
  return { pendingTransferId: pending.pendingTransferId, settlementTransferId: settlement.settlementTransferId };
}
