CREATE TABLE "storage_objects" (
	"storageKey" varchar(1024) PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"source" varchar(48) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "storage_objects_memberId_idx" ON "storage_objects" USING btree ("memberId");
--> statement-breakpoint
-- Backfill ownership for existing storage-backed URLs across every table that
-- references /manus-storage/ keys, so the download proxy can authorize
-- downloads of objects created before the registry existed.
--> statement-breakpoint
INSERT INTO "storage_objects" ("storageKey", "memberId", "source")
SELECT REPLACE("fileUrl", '/manus-storage/', ''), "memberId", 'document'
FROM "documents"
WHERE "fileUrl" LIKE '/manus-storage/%'
ON CONFLICT ("storageKey") DO NOTHING;
--> statement-breakpoint
INSERT INTO "storage_objects" ("storageKey", "memberId", "source")
SELECT REPLACE("heroImageUrl", '/manus-storage/', ''), "memberId", 'proposal'
FROM "proposals"
WHERE "heroImageUrl" LIKE '/manus-storage/%'
ON CONFLICT ("storageKey") DO NOTHING;
--> statement-breakpoint
INSERT INTO "storage_objects" ("storageKey", "memberId", "source")
SELECT REPLACE("mapEmbedUrl", '/manus-storage/', ''), "memberId", 'proposal'
FROM "proposals"
WHERE "mapEmbedUrl" LIKE '/manus-storage/%'
ON CONFLICT ("storageKey") DO NOTHING;
--> statement-breakpoint
INSERT INTO "storage_objects" ("storageKey", "memberId", "source")
SELECT REPLACE(elem->>'imageUrl', '/manus-storage/', ''), p."memberId", 'proposal'
FROM "proposals" p, jsonb_array_elements(p."itinerary") AS elem
WHERE p."itinerary" IS NOT NULL AND (elem->>'imageUrl') LIKE '/manus-storage/%'
ON CONFLICT ("storageKey") DO NOTHING;
--> statement-breakpoint
INSERT INTO "storage_objects" ("storageKey", "memberId", "source")
SELECT REPLACE(elem->>'mapUrl', '/manus-storage/', ''), p."memberId", 'proposal'
FROM "proposals" p, jsonb_array_elements(p."itinerary") AS elem
WHERE p."itinerary" IS NOT NULL AND (elem->>'mapUrl') LIKE '/manus-storage/%'
ON CONFLICT ("storageKey") DO NOTHING;
--> statement-breakpoint
INSERT INTO "storage_objects" ("storageKey", "memberId", "source")
SELECT REPLACE(pi."imageUrl", '/manus-storage/', ''), p."memberId", 'proposal'
FROM "proposal_items" pi JOIN "proposals" p ON pi."proposalId" = p."id"
WHERE pi."imageUrl" LIKE '/manus-storage/%'
ON CONFLICT ("storageKey") DO NOTHING;