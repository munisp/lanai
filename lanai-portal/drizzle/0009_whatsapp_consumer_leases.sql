ALTER TABLE "whatsapp_webhook_events"
  ADD COLUMN "claim_token" varchar(64),
  ADD COLUMN "claim_expires_at" timestamp;

ALTER TABLE "whatsapp_webhook_events"
  DROP CONSTRAINT "whatsapp_webhook_events_status_check";

ALTER TABLE "whatsapp_webhook_events"
  ADD CONSTRAINT "whatsapp_webhook_events_status_check"
  CHECK ("status" IN ('received', 'processing', 'processed', 'failed', 'dead_letter'));

CREATE INDEX "whatsapp_webhook_events_processing_claim_idx"
  ON "whatsapp_webhook_events" ("status", "claim_expires_at");
