CREATE TABLE "favourite_suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"supplierId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_spending" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"bookingId" integer,
	"supplierId" integer,
	"category" varchar(128),
	"amount" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'GBP',
	"spentAt" timestamp DEFAULT now() NOT NULL,
	"description" varchar(512),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fav_suppliers_member_idx" ON "favourite_suppliers" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "fav_suppliers_supplier_idx" ON "favourite_suppliers" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "member_spending_member_idx" ON "member_spending" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "member_spending_spentAt_idx" ON "member_spending" USING btree ("spentAt");