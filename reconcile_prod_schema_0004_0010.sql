-- Reconcile production schema with the repo migration chain, 0004-0010.
-- Evidence base (verified read-only against prod 23 Sep 2026):
--   journal: 4 rows = exactly 0000-0003 (hashes match local files)
--   co-dev hand-applied: 0005's clients TABLE (shape verified identical),
--     0007 table, 0008 claimToken/claimExpiresAt, 0009 claim_token/claim_expires_at
--   missing in prod: 0004 index, 0005 invoice/ledger columns + advisor index,
--     0006 constraints (table empty), 0009 status check constraint, 0010 table
-- Safety checks passed: chatwootId duplicates = 0 (0004 safe);
--   ledger_transfers rows = 0 (0006 safe); clients shape matches 0005 exactly.
-- Each block is transactional; ON_ERROR_STOP aborts the whole run.
\set ON_ERROR_STOP on

BEGIN;
-- 0004: unique index on chatwoot_messages.chatwootId
CREATE UNIQUE INDEX IF NOT EXISTS "chatwoot_msg_chatwootId_uq" ON "chatwoot_messages" USING btree ("chatwootId");
COMMIT;

BEGIN;
-- 0005 minus CREATE TABLE clients (already exists in prod, shape verified)
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "sentAt" timestamp;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tigerBeetleTransferId" varchar(128);
ALTER TABLE "ledger_transfers" ADD COLUMN IF NOT EXISTS "tigerBeetleSettlementTransferId" varchar(39);
CREATE INDEX IF NOT EXISTS "clients_email_idx" ON "clients" USING btree ("email");
CREATE INDEX IF NOT EXISTS "clients_assigned_advisor_idx" ON "clients" USING btree ("assignedAdvisorId");
ALTER TABLE "ledger_transfers" ADD CONSTRAINT "ledger_transfers_tigerBeetleSettlementTransferId_unique" UNIQUE("tigerBeetleSettlementTransferId");
COMMIT;

BEGIN;
-- 0006: ledger_transfers invariants (table verified empty)
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
COMMIT;

BEGIN;
-- 0008 remainder: publishing claim index (columns already exist in prod)
CREATE INDEX IF NOT EXISTS "outbox_events_publishing_claim_idx" ON "outbox_events" ("status", "claimExpiresAt");
COMMIT;

BEGIN;
-- 0009 remainder: status check with dead_letter + processing claim index
-- (co-dev applied the claim columns but not the constraint or index)
ALTER TABLE "whatsapp_webhook_events" DROP CONSTRAINT IF EXISTS "whatsapp_webhook_events_status_check";
ALTER TABLE "whatsapp_webhook_events" ADD CONSTRAINT "whatsapp_webhook_events_status_check" CHECK ("status" IN ('received', 'processing', 'processed', 'failed', 'dead_letter'));
CREATE INDEX IF NOT EXISTS "whatsapp_webhook_events_processing_claim_idx" ON "whatsapp_webhook_events" ("status", "claim_expires_at");
COMMIT;

BEGIN;
-- 0010: chatwoot webhook idempotency table (verified absent in prod)
CREATE TABLE "chatwoot_webhook_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "delivery_id" varchar(128) NOT NULL,
  "event_type" varchar(128) NOT NULL,
  "payload_sha256" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'received',
  "processed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "chatwoot_webhook_events_delivery_unique" UNIQUE("delivery_id"),
  CONSTRAINT "chatwoot_webhook_events_payload_sha256_check" CHECK ("payload_sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "chatwoot_webhook_events_status_check" CHECK ("status" IN ('received', 'processed', 'ignored'))
);
CREATE INDEX "chatwoot_webhook_events_status_created_idx"
  ON "chatwoot_webhook_events" USING btree ("status", "created_at");
COMMIT;

BEGIN;
-- Journal backfill: record 0004-0010 as applied, using each file's real
-- sha256 and its folderMillis from meta/_journal.json. After this, the last
-- journal row is 0010 (created_at 1787222400000), so dist/migrate.js will
-- apply exactly 0011 (folderMillis 1789968403983) and nothing else.
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('293113e44c1c1b005fd5b2df6c37e561970575c6e214157b7332fb60ff11a699', 1786552352013),
  ('049531f383527eef3f4ae4a35ea13a7dd8eaeb7cc180596d36c73b6a61a32558', 1786582340976),
  ('c5d811270283619639669892b5a437f2731cdecde674380f2356d99740c0d804', 1786935256172),
  ('4a70c183c0f2df5913f0e61242ff9a21e50d755849c37f0ded3fcd78e5ac0f48', 1787022205674),
  ('3d787ce96d3a95e0c0a95ee9d9953d146f5ae2a936615bffda2d23b986c7f379', 1787024700000),
  ('edd59ecbd36d83215786850172937a16492b5a24b1427c7aa19e1c404fa79b66', 1787024800000),
  ('d9187e5224014a0aee327dc71c226c2002de4c709250fae14932e7c0420f2fcf', 1787222400000);
COMMIT;
