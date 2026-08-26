CREATE TYPE "public"."room_tier" AS ENUM('standard', 'deluxe', 'junior_suite', 'suite', 'presidential', 'other');--> statement-breakpoint
CREATE TYPE "public"."supplier_property_type" AS ENUM('hotel', 'villa', 'yacht', 'jet', 'transfer', 'experience', 'other');--> statement-breakpoint
CREATE TABLE "supplier_amenities" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplierId" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"benefitType" varchar(64),
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_room_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplierId" integer NOT NULL,
	"roomTier" "room_tier" NOT NULL,
	"startingRate" numeric(12, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'GBP',
	"seasonNotes" varchar(255),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "propertyType" "supplier_property_type";--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "isVirtuoso" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "preferredPartnerNetwork" varchar(64);--> statement-breakpoint
ALTER TABLE "supplier_amenities" ADD CONSTRAINT "supplier_amenities_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_room_rates" ADD CONSTRAINT "supplier_room_rates_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_amenities_supplierId_idx" ON "supplier_amenities" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "supplier_room_rates_supplierId_idx" ON "supplier_room_rates" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "suppliers_isVirtuoso_city_idx" ON "suppliers" USING btree ("isVirtuoso","city");