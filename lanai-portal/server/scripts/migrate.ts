import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabase, getDb } from "../db";

function resolveMigrationsFolder(): string {
  // Source execution: server/scripts/migrate.ts -> ../../drizzle.
  // Production image: dist/migrate.js -> ../drizzle (copied by the Dockerfile).
  const candidates = [
    fileURLToPath(new URL("../../drizzle/", import.meta.url)),
    fileURLToPath(new URL("../drizzle/", import.meta.url)),
  ];
  const migrationsFolder = candidates.find((candidate) =>
    fs.existsSync(`${candidate}/meta/_journal.json`),
  );
  if (!migrationsFolder) {
    throw new Error(
      `Unable to locate Drizzle migrations; checked ${candidates.join(", ")}`,
    );
  }
  return migrationsFolder;
}

async function main(): Promise<void> {
  const db = await getDb();
  await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  await closeDatabase();
}

main().catch(async (error) => {
  console.error("[migrations] failed", error);
  await closeDatabase();
  process.exit(1);
});
