ALTER TABLE "proposals" ADD COLUMN "aiContent" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "heroImageUrl" varchar(512);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "mapEmbedUrl" varchar(512);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "pricingTiers" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "upgrades" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "marginPct" numeric(5, 2);