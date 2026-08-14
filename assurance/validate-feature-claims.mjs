#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const strict = process.argv.includes("--strict-release");
const manifestPath = path.resolve(
  process.cwd(),
  "assurance/feature-claims.json",
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const requiredFields = [
  "id",
  "claim",
  "classification",
  "authoritativeSources",
  "implementation",
  "configuration",
  "evidence",
  "status",
  "owner",
  "limitations",
];
const validStatuses = new Set([
  "verified",
  "evidence_pending",
  "blocked",
  "incomplete",
  "retired",
  "not_applicable",
]);
let failures = 0;
for (const claim of manifest.claims ?? []) {
  for (const field of requiredFields) {
    const value = claim[field];
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      console.error(`[claims] ${claim.id ?? "unknown"}: missing ${field}`);
      failures += 1;
    }
  }
  if (!validStatuses.has(claim.status)) {
    console.error(`[claims] ${claim.id}: invalid status ${claim.status}`);
    failures += 1;
  }
  if (claim.status === "verified") {
    if (!claim.lastVerifiedRevision || !claim.lastVerifiedAt || !claim.evidence?.length) {
      console.error(
        `[claims] ${claim.id}: verified claims require revision, timestamp, and executable evidence`,
      );
      failures += 1;
    }
  }
  if (strict && ["blocked", "evidence_pending", "incomplete"].includes(claim.status)) {
    console.error(
      `[claims] ${claim.id}: release gate blocked by status=${claim.status}: ${claim.limitations}`,
    );
    failures += 1;
  }
}
if (!Array.isArray(manifest.claims) || manifest.claims.length === 0) {
  console.error("[claims] manifest must contain at least one material claim");
  failures += 1;
}
if (failures > 0) process.exit(1);
console.log(
  `[claims] ${strict ? "strict release" : "structural"} validation passed for ${manifest.claims.length} claims`,
);
