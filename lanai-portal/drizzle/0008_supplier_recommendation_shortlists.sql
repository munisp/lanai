CREATE TYPE "public"."supplier_recommendation_status" AS ENUM('draft', 'presented', 'approved', 'archived');--> statement-breakpoint
CREATE TABLE "supplier_recommendation_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"shortlistId" integer NOT NULL,
	"supplierId" integer NOT NULL,
	"rank" integer NOT NULL,
	"roomTier" varchar(64),
	"startingRate" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'GBP',
	"rationale" text,
	"selected" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_recommendation_shortlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"destination" varchar(255) NOT NULL,
	"travelRequestId" integer,
	"status" "supplier_recommendation_status" DEFAULT 'draft' NOT NULL,
	"generatedByUserId" integer,
	"context" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_recommendation_items" ADD CONSTRAINT "supplier_recommendation_items_shortlistId_supplier_recommendation_shortlists_id_fk" FOREIGN KEY ("shortlistId") REFERENCES "public"."supplier_recommendation_shortlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_rec_items_shortlistId_idx" ON "supplier_recommendation_items" USING btree ("shortlistId");--> statement-breakpoint
CREATE INDEX "supplier_rec_shortlists_memberId_idx" ON "supplier_recommendation_shortlists" USING btree ("memberId");