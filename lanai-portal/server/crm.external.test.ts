import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startLocalProviderMocks, type LocalProviderMocks } from "./test/localProviderMocks";

const requiredVariables = ["TWENTY_CRM_URL", "TWENTY_CRM_API_TOKEN"] as const;
const externalRunRequested = process.env.RUN_EXTERNAL_CRM_TESTS === "1";
const localProviderRunRequested = process.env.RUN_LOCAL_PROVIDER_TESTS === "1";
const missingVariables = requiredVariables.filter((name) => !process.env[name]);

if (externalRunRequested && missingVariables.length > 0) {
  throw new Error(
    `[CRM external tests] Missing required environment variables: ${missingVariables.join(", ")}`,
  );
}

const externalCrmEnabled = externalRunRequested && missingVariables.length === 0;
const crmSuiteEnabled = externalCrmEnabled || localProviderRunRequested;
let localProviders: LocalProviderMocks | undefined;
const originalCrmEnvironment = {
  url: process.env.TWENTY_CRM_URL,
  token: process.env.TWENTY_CRM_API_TOKEN,
};

beforeAll(async () => {
  if (!localProviderRunRequested || externalCrmEnabled) return;
  localProviders = await startLocalProviderMocks();
  process.env.TWENTY_CRM_URL = localProviders.crmBaseUrl;
  process.env.TWENTY_CRM_API_TOKEN = "crm_local_provider_token";
});

afterAll(async () => {
  await localProviders?.close();
  if (originalCrmEnvironment.url === undefined) delete process.env.TWENTY_CRM_URL;
  else process.env.TWENTY_CRM_URL = originalCrmEnvironment.url;
  if (originalCrmEnvironment.token === undefined) delete process.env.TWENTY_CRM_API_TOKEN;
  else process.env.TWENTY_CRM_API_TOKEN = originalCrmEnvironment.token;
});

describe("Twenty CRM external sandbox", () => {
  it.skipIf(!crmSuiteEnabled)(
    "authenticates to the configured test workspace GraphQL endpoint",
    async () => {
      const response = await fetch(`${process.env.TWENTY_CRM_URL!}/graphql`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.TWENTY_CRM_API_TOKEN!}`,
        },
        body: JSON.stringify({ query: "{ __typename }" }),
      });

      expect(response.ok, `Twenty CRM returned HTTP ${response.status}`).toBe(
        true,
      );
      const payload = (await response.json()) as {
        data?: { __typename?: string };
        errors?: unknown[];
      };
      expect(payload.errors).toBeUndefined();
      expect(payload.data?.__typename).toBe("Query");
    },
    20_000,
  );

  it.skipIf(!crmSuiteEnabled)(
    "exposes a schema that supports the portal's GraphQL transport contract",
    async () => {
      const response = await fetch(`${process.env.TWENTY_CRM_URL!}/graphql`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.TWENTY_CRM_API_TOKEN!}`,
        },
        body: JSON.stringify({
          query: "query LanaiCrmContract { __schema { queryType { name } } }",
        }),
      });

      expect(response.ok, `Twenty CRM returned HTTP ${response.status}`).toBe(
        true,
      );
      const payload = (await response.json()) as {
        data?: { __schema?: { queryType?: { name?: string } } };
        errors?: unknown[];
      };
      expect(payload.errors).toBeUndefined();
      expect(payload.data?.__schema?.queryType?.name).toBeTruthy();
    },
    20_000,
  );
});
