import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getDb: vi.fn(),
    createAccount: vi.fn(),
    createPendingTransfer: vi.fn(),
    postPendingTransfer: vi.fn(),
    voidPendingTransfer: vi.fn(),
    enqueueDomainEvent: vi.fn(),
  },
}));

vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../_core/infrastructure", () => ({
  TigerBeetle: {
    createAccount: mocks.createAccount,
    createPendingTransfer: mocks.createPendingTransfer,
    postPendingTransfer: mocks.postPendingTransfer,
    voidPendingTransfer: mocks.voidPendingTransfer,
  },
}));
vi.mock("../_core/env", () => ({
  ENV: { tigerBeetleLedger: 1, tigerBeetleTransferCode: 1 },
}));
vi.mock("../_core/outbox", () => ({ enqueueDomainEvent: mocks.enqueueDomainEvent }));

import {
  enqueueCommissionEvent,
  reserveCommissionInTigerBeetle,
  settleCommissionInTigerBeetle,
  voidCommissionInTigerBeetle,
} from "./financialActivities";

function querySequence(rows: unknown[][]) {
  let index = 0;
  const limit = vi.fn(async () => rows[index++] ?? []);
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: 1 }]),
        })),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPendingTransfer.mockResolvedValue({ transferId: 99n });
  mocks.postPendingTransfer.mockResolvedValue({ transferId: 100n });
  mocks.voidPendingTransfer.mockResolvedValue({ transferId: 101n });
  mocks.enqueueDomainEvent.mockResolvedValue(undefined);
});

describe("TigerBeetle financial activities", () => {
  it("reserves a deterministic two-phase commission transfer using existing ledger accounts", async () => {
    mocks.getDb.mockResolvedValue(
      querySequence([
        [{ id: 1, tigerBeetleAccountId: "11" }],
        [{ id: 2, tigerBeetleAccountId: "12" }],
      ]),
    );

    await expect(
      reserveCommissionInTigerBeetle({
        bookingId: 7,
        memberId: 11,
        amount: "125.50",
        currency: "GBP",
        advisorUserId: 3,
        idempotencyKey: "booking:7:commission",
      }),
    ).resolves.toEqual({
      pendingTransferId: "99",
      debitAccountId: "11",
      creditAccountId: "12",
      transferKey: "booking:7:commission:amount:12550",
    });

    expect(mocks.createAccount).not.toHaveBeenCalled();
    expect(mocks.createPendingTransfer).toHaveBeenCalledWith(
      12550n,
      11n,
      12n,
      "pending:booking:7:commission:amount:12550",
    );
  });

  it("rejects malformed or non-positive monetary inputs before attempting a ledger mutation", async () => {
    await expect(
      reserveCommissionInTigerBeetle({
        bookingId: 7,
        memberId: 11,
        amount: "12.345",
        currency: "GBP",
        advisorUserId: 3,
        idempotencyKey: "booking:7:commission",
      }),
    ).rejects.toThrow("Financial amounts must be positive decimal");
    await expect(
      reserveCommissionInTigerBeetle({
        bookingId: 7,
        memberId: 11,
        amount: "0",
        currency: "GBP",
        advisorUserId: 3,
        idempotencyKey: "booking:7:commission",
      }),
    ).rejects.toThrow("Financial amounts must be positive");
    expect(mocks.createPendingTransfer).not.toHaveBeenCalled();
  });

  it("posts the exact pending transfer and records the matching settlement mirror", async () => {
    mocks.getDb.mockResolvedValue(
      querySequence([
        [
          {
            id: 4,
            status: "pending",
            tigerBeetleSettlementTransferId: null,
          },
        ],
      ]),
    );
    const pending = {
      pendingTransferId: "99",
      debitAccountId: "11",
      creditAccountId: "12",
      transferKey: "booking:7:commission:amount:12550",
    };

    await expect(settleCommissionInTigerBeetle(pending)).resolves.toEqual({
      settlementTransferId: "100",
    });
    expect(mocks.postPendingTransfer).toHaveBeenCalledWith(
      99n,
      11n,
      12n,
      "post:booking:7:commission:amount:12550",
    );
  });

  it("voids the deterministic pending transfer even when a local mirror was never persisted", async () => {
    mocks.getDb.mockResolvedValue(querySequence([[]]));
    const pending = {
      pendingTransferId: "99",
      debitAccountId: "11",
      creditAccountId: "12",
      transferKey: "booking:7:commission:amount:12550",
    };

    await expect(voidCommissionInTigerBeetle(pending)).resolves.toBeUndefined();
    expect(mocks.voidPendingTransfer).toHaveBeenCalledWith(
      99n,
      11n,
      12n,
      "void:booking:7:commission:amount:12550",
    );
  });

  it("emits a deterministic financial outbox identity after settlement", async () => {
    const input = {
      bookingId: 7,
      memberId: 11,
      amount: "125.50",
      currency: "GBP",
      advisorUserId: 3,
      idempotencyKey: "booking:7:commission",
      pendingTransferId: "99",
      debitAccountId: "11",
      creditAccountId: "12",
      transferKey: "booking:7:commission:amount:12550",
      settlementTransferId: "100",
    };

    await enqueueCommissionEvent(input);
    expect(mocks.enqueueDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: "financial",
        aggregateId: 7,
        eventType: "commission_posted",
        idempotencyKey: "financial:booking:7:commission:amount:12550:posted",
      }),
    );
  });
});
