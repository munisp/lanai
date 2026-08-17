ALTER TABLE "ledger_transfers"
  ADD CONSTRAINT "ledger_transfers_distinct_accounts_check"
    CHECK ("debitLedgerAccountId" <> "creditLedgerAccountId"),
  ADD CONSTRAINT "ledger_transfers_positive_amount_check"
    CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "ledger_transfers_status_check"
    CHECK ("status" IN ('pending', 'posted', 'voided')),
  ADD CONSTRAINT "ledger_transfers_final_status_requires_settlement_check"
    CHECK (
      "status" = 'pending'
      OR "tigerBeetleSettlementTransferId" IS NOT NULL
    );
