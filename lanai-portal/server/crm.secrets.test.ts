/**
 * Validates that TWENTY_CRM_API_TOKEN and TWENTY_CRM_URL are correctly set
 * by making a lightweight GraphQL introspection call to the live CRM.
 */
import { describe, expect, it } from "vitest";
import "dotenv/config";

// These are integration tests that require a live CRM instance.
// They are skipped automatically when TWENTY_CRM_API_TOKEN is not set.
const crmAvailable = !!process.env.TWENTY_CRM_API_TOKEN;

describe("CRM secrets", () => {
  it.skipIf(!crmAvailable)("TWENTY_CRM_API_TOKEN and TWENTY_CRM_URL are set", () => {
    expect(process.env.TWENTY_CRM_API_TOKEN, "TWENTY_CRM_API_TOKEN must be set").toBeTruthy();
    expect(process.env.TWENTY_CRM_URL, "TWENTY_CRM_URL must be set").toBeTruthy();
  });

  it.skipIf(!crmAvailable)("can reach the Twenty CRM GraphQL endpoint with the token", async () => {
    const token = process.env.TWENTY_CRM_API_TOKEN!;
    const url = process.env.TWENTY_CRM_URL ?? "http://localhost:3002";

    const res = await fetch(`${url}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: "{ __typename }" }),
    });

    expect(res.ok, `CRM returned HTTP ${res.status}`).toBe(true);
    const json = (await res.json()) as { data?: { __typename?: string }; errors?: unknown[] };
    expect(json.errors).toBeUndefined();
    expect(json.data?.__typename).toBe("Query");
  }, 10_000);
});
