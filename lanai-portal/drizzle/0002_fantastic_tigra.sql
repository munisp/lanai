ALTER TABLE "advisor_tasks" ADD COLUMN "taskTemplateId" integer;--> statement-breakpoint
ALTER TABLE "advisor_tasks" ADD COLUMN "automationKey" varchar(255);--> statement-breakpoint
ALTER TABLE "celebrations" ADD COLUMN "giftBudget" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "celebrations" ADD COLUMN "giftStatus" varchar(32) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "communication_timeline" ADD COLUMN "inquiryCategory" varchar(64);--> statement-breakpoint
ALTER TABLE "communication_timeline" ADD COLUMN "aiAnalysis" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "reconciliationPeriod" varchar(7);--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "dateOfBirth" timestamp;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "passportExpiry" timestamp;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "favouriteSupplierIds" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "heroImageUrl" varchar(1024);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "mapEmbedUrl" varchar(2048);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "itinerary" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "pricingTiers" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "clientMessage" text;--> statement-breakpoint
CREATE INDEX "advisor_tasks_template_idx" ON "advisor_tasks" USING btree ("taskTemplateId");--> statement-breakpoint
CREATE UNIQUE INDEX "advisor_tasks_automationKey_unique" ON "advisor_tasks" USING btree ("automationKey");--> statement-breakpoint
CREATE INDEX "comm_timeline_inquiry_category_idx" ON "communication_timeline" USING btree ("inquiryCategory");--> statement-breakpoint
CREATE INDEX "invoices_reconciliationPeriod_idx" ON "invoices" USING btree ("supplierId","invoiceType","reconciliationPeriod");--> statement-breakpoint
CREATE INDEX "proposals_member_status_idx" ON "proposals" USING btree ("memberId","status");