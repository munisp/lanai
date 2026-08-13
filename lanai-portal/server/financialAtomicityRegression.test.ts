import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const serverRoot = __dirname;
const read = (relativePath: string) =>
  readFileSync(join(serverRoot, relativePath), "utf8");

describe("financial atomicity and idempotency regression guardrails", () => {
  it("uses native TigerBeetle two-phase transfers with payload verification", () => {
    const source = read("_core/infrastructure.ts");
    expect(source).toContain("TransferFlags.pending");
    expect(source).toContain("TransferFlags.post_pending_transfer");
    expect(source).toContain("TransferFlags.void_pending_transfer");
    expect(source).toContain("lookupTransfers([transferId])");
    expect(source).toContain("does not match its idempotency payload");
  });

  it("persists a pending financial mirror before settlement and records a settlement identifier", () => {
    const source = read("workflows/financialActivities.ts");
    expect(source).toContain('status: "pending"');
    expect(source).toContain("tigerBeetleSettlementTransferId");
    expect(source).toContain("persistPendingMirror");
    expect(source).toContain("settlePendingTransfer");
    expect(source).toContain("compensatePendingTransfer");
    expect(source).toContain("enqueueDomainEvent");
  });

  it("derives every financial transfer and outbox identity from the business idempotency key", () => {
    const source = read("workflows/financialActivities.ts");
    expect(source).toContain("financialTransferKey(input.idempotencyKey");
    expect(source).toContain("pending:${input.transferKey}");
    expect(source).toContain("post:${input.transferKey}");
    expect(source).toContain("void:${input.transferKey}");
    expect(source).toContain("financial:${input.transferKey}:posted");
  });

  it("prohibits manual paid invoice status changes and routes commission settlement through Temporal", () => {
    const source = read("phase2Router.ts");
    expect(source).toContain("Invoice payment status is controlled by the Stripe financial saga");
    expect(source).toContain('"commissionReconciliationSaga"');
    expect(source).toContain("financial-commission-reconciliation-invoice-");
  });

  it("routes signed invoice payment intents into a deterministic Temporal saga", () => {
    const source = read("stripeRouter.ts");
    expect(source).toContain('case "payment_intent.succeeded"');
    expect(source).toContain('lanai_financial_type !== "invoice_payment"');
    expect(source).toContain('"invoicePaymentSaga"');
    expect(source).toContain("financial-stripe-payment-");
    expect(source).toContain("amount_received !== amountToMinor(invoice.totalAmount)");
  });

  it("does not post forecast commissions directly to a hard-coded TigerBeetle account", () => {
    const source = read("platformRouter.ts");
    const commissionCreate = source.slice(
      source.indexOf("/** Advisor: create a commission entry"),
      source.indexOf("/** Advisor: mark commission as received"),
    );
    expect(commissionCreate).not.toContain("TigerBeetle.createTransfer");
    expect(commissionCreate).toContain("enqueueDomainEvent");
  });
});
