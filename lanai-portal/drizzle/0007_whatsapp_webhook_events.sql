CREATE TABLE "whatsapp_webhook_events" (
  "id" serial PRIMARY KEY,
  "provider" varchar(32) NOT NULL,
  "provider_event_id" varchar(256) NOT NULL,
  "payload_sha256" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'received',
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "last_error" text,
  "outbox_event_id" integer NOT NULL REFERENCES "outbox_events"("id") ON DELETE RESTRICT,
  "processed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "whatsapp_webhook_events_provider_event_unique" UNIQUE ("provider", "provider_event_id"),
  CONSTRAINT "whatsapp_webhook_events_outbox_event_unique" UNIQUE ("outbox_event_id"),
  CONSTRAINT "whatsapp_webhook_events_payload_sha256_check" CHECK ("payload_sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "whatsapp_webhook_events_status_check" CHECK ("status" IN ('received', 'processing', 'processed', 'failed')),
  CONSTRAINT "whatsapp_webhook_events_attempts_nonnegative_check" CHECK ("attempts" >= 0)
);

CREATE INDEX "whatsapp_webhook_events_status_next_attempt_idx"
  ON "whatsapp_webhook_events" ("status", "next_attempt_at");

CREATE INDEX "whatsapp_webhook_events_created_at_idx"
  ON "whatsapp_webhook_events" ("created_at");
