CREATE TYPE "public"."client_memory_category" AS ENUM('travel_history', 'preference', 'family', 'important_date', 'past_request', 'issue', 'pattern');--> statement-breakpoint
CREATE TYPE "public"."client_memory_review" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."client_memory_source" AS ENUM('message', 'task', 'trip', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sla_urgency" AS ENUM('urgent', 'ordinary');--> statement-breakpoint
CREATE TABLE "client_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer,
	"category" "client_memory_category" NOT NULL,
	"content" text NOT NULL,
	"sourceType" "client_memory_source" DEFAULT 'message' NOT NULL,
	"sourceId" integer,
	"reviewStatus" "client_memory_review" DEFAULT 'approved' NOT NULL,
	"createdByAdvisorId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_timers" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer,
	"urgency" "sla_urgency" NOT NULL,
	"openedAt" timestamp DEFAULT now() NOT NULL,
	"firstResponseAt" timestamp,
	"breachWarnedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalId" integer NOT NULL,
	"versionNo" integer NOT NULL,
	"documentRef" text,
	"status" "proposal_status" NOT NULL,
	"createdByAdvisorId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_memory" ADD CONSTRAINT "client_memory_memberId_members_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_timers" ADD CONSTRAINT "sla_timers_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposalId_proposals_id_fk" FOREIGN KEY ("proposalId") REFERENCES "public"."proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_memory_member_idx" ON "client_memory" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "client_memory_category_idx" ON "client_memory" USING btree ("category");--> statement-breakpoint
CREATE INDEX "sla_timers_conversation_idx" ON "sla_timers" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "sla_timers_open_idx" ON "sla_timers" USING btree ("firstResponseAt");--> statement-breakpoint
CREATE INDEX "proposal_versions_proposal_idx" ON "proposal_versions" USING btree ("proposalId");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_versions_unique" ON "proposal_versions" USING btree ("proposalId","versionNo");
