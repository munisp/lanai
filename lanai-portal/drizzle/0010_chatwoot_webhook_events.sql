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
--> statement-breakpoint
CREATE INDEX "chatwoot_webhook_events_status_created_idx"
  ON "chatwoot_webhook_events" USING btree ("status", "created_at");
