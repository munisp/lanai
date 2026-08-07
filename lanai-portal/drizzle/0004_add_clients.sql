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
CREATE INDEX "clients_email_idx" ON "clients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "clients_assignedAdvisor_idx" ON "clients" USING btree ("assignedAdvisorId");--> statement-breakpoint
CREATE UNIQUE INDEX "chatwoot_msg_chatwootId_unique" ON "chatwoot_messages" USING btree ("chatwootId");