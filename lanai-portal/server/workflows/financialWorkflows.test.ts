import { beforeEach, describe, expect, it, vi } from "vitest";

const { compensationActivities, financialActivities } = vi.hoisted(() => ({
  compensationActivities: {
    voidCommissionInTigerBeetle: vi.fn(),
  },
  financialActivities: {
    reserveCommissionInTigerBeetle: vi.fn(),
    persistCommissionToPostgres: vi.fn(),
    settleCommissionInTigerBeetle: vi.fn(),
    voidCommissionInTigerBeetle: vi.fn(),
    enqueueCommissionEvent: vi.fn(),
    markBookingCommissionPosted: vi.fn(),
    reservePaymentInTigerBeetle: vi.fn(),
    persistPaymentToPostgres: vi.fn(),
    settlePaymentInTigerBeetle: vi.fn(),
    enqueuePaymentEvent: vi.fn(),
    markInvoicePaid: vi.fn(),
    reserveCommissionPayableInTigerBeetle: vi.fn(),
    persistCommissionReconciliationToPostgres: vi.fn(),
    settleCommissionPayableInTigerBeetle: vi.fn(),
    enqueueReconciliationEvent: vi.fn(),
    markCommissionInvoiceSent: vi.fn(),
  },
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: vi.fn((options: { retry?: { maximumAttempts?: number } }) =>
    options.retry?.maximumAttempts === 0
      ? compensationActivities
      : financialActivities,
  ),
  ApplicationFailure: {
    create: vi.fn((input: { message: string; type: string; nonRetryable: boolean }) => {
      const error = new Error(input.message) as Error & {
        type: string;
        nonRetryable: boolean;
      };
      error.type = input.type;
      error.nonRetryable = input.nonRetryable;
      return error;
    }),
  },
}));

import {
  bookingCommissionSaga,
  commissionReconciliationSaga,
  invoicePaymentSaga,
} from "./financialWorkflows";

const pending = {
  pendingTransferId: "101",
  debitAccountId: "11",
  creditAccountId: "12",
  transferKey: "commission-key:amount:12500",
};
const settlement = { settlementTransferId: "102" };

function resetActivityMocks() {
  for (const activity of [
    ...Object.values(compensationActivities),
    ...Object.values(financialActivities),
  ]) {
    activity.mockReset();
  }
}

beforeEach(() => {
  resetActivityMocks();
  financialActivities.reserveCommissionInTigerBeetle.mockResolvedValue(pending);
  financialActivities.persistCommissionToPostgres.mockResolvedValue({ ledgerTransferId: 1 });
  financialActivities.settleCommissionInTigerBeetle.mockResolvedValue(settlement);
  financialActivities.enqueueCommissionEvent.mockResolvedValue(undefined);
  financialActivities.markBookingCommissionPosted.mockResolvedValue(undefined);
  financialActivities.reservePaymentInTigerBeetle.mockResolvedValue(pending);
  financialActivities.persistPaymentToPostgres.mockResolvedValue({ ledgerTransferId: 2 });
  financialActivities.settlePaymentInTigerBeetle.mockResolvedValue(settlement);
  financialActivities.markInvoicePaid.mockResolvedValue(undefined);
  financialActivities.enqueuePaymentEvent.mockResolvedValue(undefined);
  financialActivities.reserveCommissionPayableInTigerBeetle.mockResolvedValue(pending);
  financialActivities.persistCommissionReconciliationToPostgres.mockResolvedValue({ ledgerTransferId: 3 });
  financialActivities.settleCommissionPayableInTigerBeetle.mockResolvedValue(settlement);
  financialActivities.markCommissionInvoiceSent.mockResolvedValue(undefined);
  financialActivities.enqueueReconciliationEvent.mockResolvedValue(undefined);
  compensationActivities.voidCommissionInTigerBeetle.mockResolvedValue(undefined);
});

describe("financial Temporal sagas", () => {
  it("posts a booking commission through reserve, mirror, settlement, outbox, and booking state", async () => {
    const input = {
      bookingId: 7,
      memberId: 11,
      amount: "125.00",
      currency: "GBP",
      advisorUserId: 3,
      idempotencyKey: "booking:7:commission",
    };

    await expect(bookingCommissionSaga(input)).resolves.toEqual({
      pendingTransferId: "101",
      settlementTransferId: "102",
      status: "posted",
    });

    expect(financialActivities.reserveCommissionInTigerBeetle).toHaveBeenCalledWith(input);
    expect(financialActivities.persistCommissionToPostgres).toHaveBeenCalledWith({
      ...input,
      ...pending,
    });
    expect(financialActivities.settleCommissionInTigerBeetle).toHaveBeenCalledWith(pending);
    expect(financialActivities.enqueueCommissionEvent).toHaveBeenCalledWith({
      ...input,
      ...pending,
      ...settlement,
    });
    expect(financialActivities.markBookingCommissionPosted).toHaveBeenCalledWith({
      bookingId: input.bookingId,
      settlementTransferId: settlement.settlementTransferId,
    });
    expect(compensationActivities.voidCommissionInTigerBeetle).not.toHaveBeenCalled();
  });

  it("uses the unlimited compensation activity and stops settlement when the commission mirror fails", async () => {
    financialActivities.persistCommissionToPostgres.mockRejectedValueOnce(
      new Error("postgres transient failure"),
    );

    await expect(
      bookingCommissionSaga({
        bookingId: 7,
        memberId: 11,
        amount: "125.00",
        currency: "GBP",
        advisorUserId: 3,
        idempotencyKey: "booking:7:commission",
      }),
    ).rejects.toMatchObject({
      type: "SAGA_COMPENSATION",
      nonRetryable: true,
    });

    expect(compensationActivities.voidCommissionInTigerBeetle).toHaveBeenCalledWith(pending);
    expect(financialActivities.settleCommissionInTigerBeetle).not.toHaveBeenCalled();
    expect(financialActivities.enqueueCommissionEvent).not.toHaveBeenCalled();
    expect(financialActivities.markBookingCommissionPosted).not.toHaveBeenCalled();
  });

  it("posts an invoice payment before emitting its downstream event", async () => {
    const input = {
      invoiceId: 19,
      memberId: 11,
      amount: "25.50",
      currency: "GBP",
      stripePaymentIntentId: "pi_test_19",
      idempotencyKey: "invoice:19:payment",
    };

    await expect(invoicePaymentSaga(input)).resolves.toEqual({
      pendingTransferId: "101",
      settlementTransferId: "102",
    });

    expect(financialActivities.persistPaymentToPostgres).toHaveBeenCalledWith({ ...input, ...pending });
    expect(financialActivities.settlePaymentInTigerBeetle).toHaveBeenCalledWith(pending);
    expect(financialActivities.markInvoicePaid).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: input.invoiceId, settlementTransferId: "102" }),
    );
    expect(financialActivities.enqueuePaymentEvent).toHaveBeenCalledWith({
      ...input,
      ...pending,
      ...settlement,
    });
  });

  it("voids a pending supplier payable transfer if reconciliation persistence fails", async () => {
    financialActivities.persistCommissionReconciliationToPostgres.mockRejectedValueOnce(
      new Error("mirror unavailable"),
    );

    await expect(
      commissionReconciliationSaga({
        invoiceId: 44,
        supplierId: 9,
        amount: "72.00",
        currency: "GBP",
        idempotencyKey: "invoice:44:commission",
      }),
    ).rejects.toMatchObject({ type: "SAGA_COMPENSATION", nonRetryable: true });

    expect(compensationActivities.voidCommissionInTigerBeetle).toHaveBeenCalledWith(pending);
    expect(financialActivities.settleCommissionPayableInTigerBeetle).not.toHaveBeenCalled();
    expect(financialActivities.markCommissionInvoiceSent).not.toHaveBeenCalled();
    expect(financialActivities.enqueueReconciliationEvent).not.toHaveBeenCalled();
  });
});
