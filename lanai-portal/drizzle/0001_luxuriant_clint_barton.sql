CREATE TYPE "public"."whatsapp_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar(32) NOT NULL,
	"direction" "whatsapp_direction" NOT NULL,
	"body" text NOT NULL,
	"triage" jsonb,
	"contactName" varchar(255),
	"read" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_timeline" ADD COLUMN "tripCategory" varchar(64);--> statement-breakpoint
CREATE INDEX "whatsapp_messages_phone_idx" ON "whatsapp_messages" USING btree ("phone");