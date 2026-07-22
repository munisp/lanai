import "dotenv/config";
import { ENV } from "../_core/env";
import { TwentyCrmClient } from "../_core/twentyClient";

async function main() {
  if (!ENV.twentyCrmSyncEnabled) {
    throw new Error(
      "TWENTY_CRM_SYNC_ENABLED=true is required before bootstrapping Twenty metadata",
    );
  }
  if (!ENV.twentyCrmMetadataBootstrapEnabled) {
    throw new Error(
      "TWENTY_CRM_METADATA_BOOTSTRAP_ENABLED=true is required to modify Twenty workspace metadata",
    );
  }

  const client = new TwentyCrmClient();
  await client.ensureLanaiMetadata();
  console.info("Twenty CRM metadata bootstrap completed");
}

main().catch((error) => {
  console.error("Twenty CRM metadata bootstrap failed", error);
  process.exitCode = 1;
});
