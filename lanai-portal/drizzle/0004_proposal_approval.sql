-- Add digital-approval support to proposals.
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "approvedByUserId" integer;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "signatureData" text;
