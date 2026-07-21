import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabase, getDb } from "../db";

async function main(): Promise<void> {
  const db = await getDb();
  const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
  await migrate(db, { migrationsFolder });
  await closeDatabase();
}

main().catch(async (error) => {
  console.error("[migrations] failed", error);
  await closeDatabase();
  process.exit(1);
});
