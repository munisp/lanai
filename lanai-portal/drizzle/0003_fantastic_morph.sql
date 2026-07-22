CREATE TYPE "public"."crm_conflict_status" AS ENUM('open', 'resolved_lanai', 'resolved_crm', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."crm_field_policy" AS ENUM('lanai_authoritative', 'crm_authoritative', 'lanai_publish_only', 'manual_conflict');--> statement-breakpoint
CREATE TYPE "public"."crm_inbound_status" AS ENUM('received', 'processed', 'ignored', 'conflicted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."crm_sync_status" AS ENUM('pending', 'synced', 'conflicted', 'failed', 'dead_letter', 'detached');--> statement-breakpoint
CREATE TABLE "crm_field_conflicts" (
	"id" serial PRIMARY KEY NOT NULL,
	"crmObjectLinkId" integer NOT NULL,
	"fieldName" varchar(128) NOT NULL,
	"lanaiValue" jsonb,
	"crmValue" jsonb,
	"policy" "crm_field_policy" NOT NULL,
	"status" "crm_conflict_status" DEFAULT 'open' NOT NULL,
	"resolvedByUserId" integer,
	"resolutionNote" text,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_inbound_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"crmEventId" varchar(192) NOT NULL,
	"eventType" varchar(128) NOT NULL,
	"crmObjectType" varchar(64) NOT NULL,
	"crmObjectId" varchar(128) NOT NULL,
	"payload" jsonb NOT NULL,
	"signatureValid" boolean DEFAULT false NOT NULL,
	"status" "crm_inbound_status" DEFAULT 'received' NOT NULL,
	"processingError" text,
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	"processedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_inbound_events_crmEventId_unique" UNIQUE("crmEventId")
);
--> statement-breakpoint
CREATE TABLE "crm_object_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"lanaiObjectType" varchar(64) NOT NULL,
	"lanaiObjectId" varchar(64) NOT NULL,
	"crmObjectType" varchar(64) NOT NULL,
	"crmObjectId" varchar(128) NOT NULL,
	"lastLanaiVersion" integer DEFAULT 0 NOT NULL,
	"lastCrmRevision" varchar(128),
	"lanaiProjectionHash" varchar(64),
	"crmProjectionHash" varchar(64),
	"syncState" "crm_sync_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"lastSyncedAt" timestamp,
	"detachedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_sync_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"outboxEventId" integer,
	"crmObjectLinkId" integer,
	"operation" varchar(32) NOT NULL,
	"idempotencyKey" varchar(192) NOT NULL,
	"requestHash" varchar(64) NOT NULL,
	"status" "crm_sync_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"remoteRevision" varchar(128),
	"lastError" text,
	"deliveredAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_sync_deliveries_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE INDEX "crm_field_conflicts_link_status_idx" ON "crm_field_conflicts" USING btree ("crmObjectLinkId","status");--> statement-breakpoint
CREATE INDEX "crm_field_conflicts_status_created_idx" ON "crm_field_conflicts" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "crm_inbound_events_status_received_idx" ON "crm_inbound_events" USING btree ("status","receivedAt");--> statement-breakpoint
CREATE INDEX "crm_inbound_events_object_idx" ON "crm_inbound_events" USING btree ("crmObjectType","crmObjectId");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_object_links_lanai_object_unique" ON "crm_object_links" USING btree ("lanaiObjectType","lanaiObjectId","crmObjectType");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_object_links_crm_object_unique" ON "crm_object_links" USING btree ("crmObjectType","crmObjectId");--> statement-breakpoint
CREATE INDEX "crm_object_links_state_updated_idx" ON "crm_object_links" USING btree ("syncState","updatedAt");--> statement-breakpoint
CREATE INDEX "crm_sync_deliveries_status_created_idx" ON "crm_sync_deliveries" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "crm_sync_deliveries_outbox_event_idx" ON "crm_sync_deliveries" USING btree ("outboxEventId");--> statement-breakpoint
CREATE INDEX "crm_sync_deliveries_link_idx" ON "crm_sync_deliveries" USING btree ("crmObjectLinkId");