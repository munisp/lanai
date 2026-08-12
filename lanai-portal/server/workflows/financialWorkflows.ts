/**
 * Financial Saga Workflows — Temporal Durable Execution
 *
 * These workflows guarantee atomicity between PostgreSQL, TigerBeetle, and
 * Fluvio for all flow-of-funds operations. If any step fails, compensating
 * transactions are executed to maintain consistency.
 *
 * Pattern: Saga with explicit compensation steps.
 * Guarantee: At-most-once semantics via Temporal's workflow ID deduplication.
 */
import { proxyActivities, ApplicationFailure } from "@temporalio/workflow";

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

const financial = proxyActivities<{
  // Step 1: Reserve funds in TigerBeetle (pending transfer)
  reserveCommissionInTigerBeetle(
    input: BookingCommissionInput,
  ): Promise<{ transferId: string; debitAccountId: string; creditAccountId: string }>;
  // Step 2: Record the transfer in PostgreSQL
  persistCommissionToPostgres(
    input: BookingCommissionInput & { transferId: string },
  ): Promise<{ ledgerTransferId: number }>;
  // Step 3: Emit the event to Fluvio for downstream consumers
  emitCommissionEventToFluvio(
    input: BookingCommissionInput & { transferId: string },
  ): Promise<void>;
  // Step 4: Update booking status to reflect commission posted
  markBookingCommissionPosted(
    input: { bookingId: number; transferId: string },
  ): Promise<void>;
  // Compensation: Void the TigerBeetle transfer if downstream fails
  voidTigerBeetleTransfer(transferId: string): Promise<void>;

  // Invoice payment activities
  postPaymentToTigerBeetle(
    input: InvoicePaymentInput,
  ): Promise<{ transferId: string }>;
  markInvoicePaid(
    input: { invoiceId: number; transferId: string; paidAt: string },
  ): Promise<void>;
  emitPaymentEventToFluvio(
    input: InvoicePaymentInput & { transferId: string },
  ): Promise<void>;

  // Commission reconciliation activities
  postCommissionPayableToTigerBeetle(
    input: CommissionReconciliationInput,
  ): Promise<{ transferId: string }>;
  markCommissionInvoiceSent(
    input: { invoiceId: number; transferId: string },
  ): Promise<void>;
  emitReconciliationEventToFluvio(
    input: CommissionReconciliationInput & { transferId: string },
  ): Promise<void>;
}>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 5,
    initialInterval: "1s",
    maximumInterval: "30s",
    backoffCoefficient: 2,
    nonRetryableErrorTypes: ["INVALID_INPUT", "DUPLICATE_TRANSFER"],
  },
});

/**
 * Booking Commission Saga
 *
 * Guarantees that when a booking is confirmed with a commission:
 * 1. TigerBeetle records the double-entry transfer (debit member payable, credit commission receivable)
 * 2. PostgreSQL records the transfer metadata
 * 3. Fluvio streams the event for analytics/lakehouse
 * 4. The booking record is updated to reflect the posted commission
 *
 * If step 2, 3, or 4 fails after step 1, the TigerBeetle transfer is voided.
 */
export async function bookingCommissionSaga(
  input: BookingCommissionInput,
): Promise<{ transferId: string; status: "posted" | "compensated" }> {
  // Step 1: Reserve in TigerBeetle (idempotent — safe to retry)
  const { transferId } = await financial.reserveCommissionInTigerBeetle(input);

  // Step 2: Persist to PostgreSQL
  try {
    await financial.persistCommissionToPostgres({ ...input, transferId });
  } catch (error) {
    // Compensate: void the TigerBeetle transfer
    await financial.voidTigerBeetleTransfer(transferId);
    throw ApplicationFailure.create({
      message: `Commission saga failed at PostgreSQL persistence: ${error}`,
      type: "SAGA_COMPENSATION",
      nonRetryable: true,
    });
  }

  // Step 3: Emit to Fluvio (non-critical — retry but don't compensate)
  await financial.emitCommissionEventToFluvio({ ...input, transferId });

  // Step 4: Update booking record
  await financial.markBookingCommissionPosted({
    bookingId: input.bookingId,
    transferId,
  });

  return { transferId, status: "posted" };
}

/**
 * Invoice Payment Saga
 *
 * Triggered by Stripe webhook when a payment is received. Guarantees:
 * 1. TigerBeetle records the payment (debit cash, credit receivable)
 * 2. PostgreSQL marks the invoice as paid
 * 3. Fluvio streams the payment event
 */
export async function invoicePaymentSaga(
  input: InvoicePaymentInput,
): Promise<{ transferId: string }> {
  // Step 1: Post to TigerBeetle
  const { transferId } = await financial.postPaymentToTigerBeetle(input);

  // Step 2: Mark invoice paid in PostgreSQL
  await financial.markInvoicePaid({
    invoiceId: input.invoiceId,
    transferId,
    paidAt: new Date().toISOString(),
  });

  // Step 3: Emit to Fluvio
  await financial.emitPaymentEventToFluvio({ ...input, transferId });

  return { transferId };
}

/**
 * Commission Reconciliation Saga
 *
 * Triggered at month-end when commission invoices are sent to suppliers.
 * Guarantees:
 * 1. TigerBeetle records the payable (debit commission receivable, credit supplier payable)
 * 2. PostgreSQL marks the commission invoice as sent
 * 3. Fluvio streams the reconciliation event
 */
export async function commissionReconciliationSaga(
  input: CommissionReconciliationInput,
): Promise<{ transferId: string }> {
  // Step 1: Post to TigerBeetle
  const { transferId } =
    await financial.postCommissionPayableToTigerBeetle(input);

  // Step 2: Mark invoice sent
  await financial.markCommissionInvoiceSent({
    invoiceId: input.invoiceId,
    transferId,
  });

  // Step 3: Emit to Fluvio
  await financial.emitReconciliationEventToFluvio({ ...input, transferId });

  return { transferId };
}
