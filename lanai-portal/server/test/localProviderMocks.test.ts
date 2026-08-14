import { afterEach, describe, expect, it } from "vitest";
import { startLocalProviderMocks, type LocalProviderMocks } from "./localProviderMocks";

const stripeHeaders = {
  authorization: "Bearer sk_test_local_provider",
  "content-type": "application/x-www-form-urlencoded",
};
const crmHeaders = {
  authorization: "Bearer crm_local_provider_token",
  "content-type": "application/json",
};

async function requestStripe(baseUrl: string, idempotencyKey?: string): Promise<Response> {
  return fetch(`${baseUrl}/v1/customers`, {
    method: "POST",
    headers: { ...stripeHeaders, ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
    body: "email=fixture%40lanai.test",
  });
}

describe("deterministic local provider fixtures", () => {
  let providers: LocalProviderMocks | undefined;

  afterEach(async () => {
    await providers?.close();
    providers = undefined;
  });

  it("replays Stripe POST responses for the same idempotency key without a second provider mutation", async () => {
    providers = await startLocalProviderMocks();
    const first = await requestStripe(providers.stripeBaseUrl, "customer-create-001");
    const second = await requestStripe(providers.stripeBaseUrl, "customer-create-001");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(await first.json()).toEqual(await second.json());
    expect(providers.requests.filter((request) => request.provider === "stripe" && request.path === "/v1/customers")).toHaveLength(2);
  });

  it("emits a deterministic Stripe rate-limit response before the retried request succeeds", async () => {
    providers = await startLocalProviderMocks({
      failures: [{ provider: "stripe", path: "/v1/customers", count: 1, status: 429, retryAfterSeconds: 2 }],
    });
    const limited = await requestStripe(providers.stripeBaseUrl, "customer-create-retry");
    const retried = await requestStripe(providers.stripeBaseUrl, "customer-create-retry");

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("2");
    expect((await limited.json()).error.type).toBe("rate_limit_error");
    expect(retried.status).toBe(200);
  });

  it("rejects unauthenticated and malformed CRM requests without returning a success payload", async () => {
    providers = await startLocalProviderMocks();
    const unauthenticated = await fetch(`${providers.crmBaseUrl}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    const malformed = await fetch(`${providers.crmBaseUrl}/graphql`, {
      method: "POST",
      headers: crmHeaders,
      body: "{ malformed",
    });

    expect(unauthenticated.status).toBe(401);
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).errors[0].message).toContain("Malformed");
  });

  it("models transient CRM failure followed by a successful retry", async () => {
    providers = await startLocalProviderMocks({
      failures: [{ provider: "crm", path: "/graphql", count: 1, status: 503 }],
    });
    const first = await fetch(`${providers.crmBaseUrl}/graphql`, {
      method: "POST",
      headers: crmHeaders,
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    const second = await fetch(`${providers.crmBaseUrl}/graphql`, {
      method: "POST",
      headers: crmHeaders,
      body: JSON.stringify({ query: "{ __typename }" }),
    });

    expect(first.status).toBe(503);
    expect((await first.json()).error.type).toBe("api_error");
    expect(second.status).toBe(200);
    expect((await second.json()).data.__typename).toBe("Query");
  });
});
