CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"firstName" varchar(128) NOT NULL,
	"lastName" varchar(128) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(64),
	"city" varchar(128),
	"country" varchar(128),
	"company" varchar(255),
	"notes" text,
	"assignedAdvisorId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clients_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "sentAt" timestamp;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tigerBeetleTransferId" varchar(128);--> statement-breakpoint
ALTER TABLE "ledger_transfers" ADD COLUMN "tigerBeetleSettlementTransferId" varchar(39);--> statement-breakpoint
CREATE INDEX "clients_email_idx" ON "clients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "clients_assigned_advisor_idx" ON "clients" USING btree ("assignedAdvisorId");--> statement-breakpoint
ALTER TABLE "ledger_transfers" ADD CONSTRAINT "ledger_transfers_tigerBeetleSettlementTransferId_unique" UNIQUE("tigerBeetleSettlementTransferId");