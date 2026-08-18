ALTER TABLE "outbox_events"
  ADD COLUMN "claimToken" varchar(64),
  ADD COLUMN "claimExpiresAt" timestamp;

CREATE INDEX "outbox_events_publishing_claim_idx"
  ON "outbox_events" ("status", "claimExpiresAt");

-- Existing rows cannot be actively owned by a dispatcher after this migration.
-- A deployment-safe recovery pass will move only expired, future lease-based
-- publishing claims back to `failed` for a durable retry.
