ALTER TABLE "chatwoot_messages" ADD COLUMN "transcription" text;--> statement-breakpoint
ALTER TABLE "chatwoot_messages" ADD COLUMN "transcriptionStatus" varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "chatwoot_messages" ADD COLUMN "transcriptionError" text;--> statement-breakpoint
CREATE INDEX "chatwoot_msg_transcription_status_idx" ON "chatwoot_messages" USING btree ("transcriptionStatus");