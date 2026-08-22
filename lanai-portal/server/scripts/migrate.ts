import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabase, getDb } from "../db";

export function resolveMigrationsFolder(): string {
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

export async function runMigrations(): Promise<void> {
  const db = await getDb();
  await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  await closeDatabase();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().catch(async (error) => {
    console.error("[migrations] failed", error);
    await closeDatabase();
    process.exit(1);
  });
}
