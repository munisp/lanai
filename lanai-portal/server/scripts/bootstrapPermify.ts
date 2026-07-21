import { readFile } from "node:fs/promises";
import * as permify from "@permify/permify-node";

async function main(): Promise<void> {
  const endpoint = process.env.PERMIFY_GRPC_ADDRESS;
  const tenantId = process.env.PERMIFY_TENANT_ID ?? "lanai";
  const schemaFile = process.env.PERMIFY_SCHEMA_FILE;
  if (!endpoint || !schemaFile)
    throw new Error(
      "PERMIFY_GRPC_ADDRESS and PERMIFY_SCHEMA_FILE are required",
    );
  const schema = await readFile(schemaFile, "utf8");
  const client = (permify as any).grpc.newClient({
    endpoint,
    insecure: process.env.PERMIFY_INSECURE !== "false",
    timeout: 10_000,
  });
  await client.tenancy
    .create({ id: tenantId, name: "Lanai Lifestyle Platform" })
    .catch((error: unknown) => {
      // A pre-existing tenant is an idempotent success. Other errors must still halt startup.
      if (!String(error).toLowerCase().includes("already")) throw error;
    });
  const result = await client.schema.write({ tenantId, schema });
  if (!result?.schemaVersion)
    throw new Error("Permify returned no schema version");
  console.log(`[permify] schema applied: ${result.schemaVersion}`);
}

main().catch((error) => {
  console.error("[permify] bootstrap failed", error);
  process.exit(1);
});
