CREATE TABLE "whatsapp_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_event_id" varchar(256) NOT NULL,
	"payload_sha256" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"outbox_event_id" integer NOT NULL,
	"processed_at" timestamp,
	"claim_token" varchar(64),
	"claim_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "claimToken" varchar(64);--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "claimExpiresAt" timestamp;--> statement-breakpoint
ALTER TABLE "whatsapp_webhook_events" ADD CONSTRAINT "whatsapp_webhook_events_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_webhook_events_provider_event_unique" ON "whatsapp_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_webhook_events_outbox_event_unique" ON "whatsapp_webhook_events" USING btree ("outbox_event_id");--> statement-breakpoint
CREATE INDEX "whatsapp_webhook_events_status_next_attempt_idx" ON "whatsapp_webhook_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "whatsapp_webhook_events_created_at_idx" ON "whatsapp_webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_webhook_events_processing_claim_idx" ON "whatsapp_webhook_events" USING btree ("status","claim_expires_at");--> statement-breakpoint
CREATE INDEX "outbox_events_publishing_claim_idx" ON "outbox_events" USING btree ("status","claimExpiresAt");