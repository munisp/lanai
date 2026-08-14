import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStripeClient } from "./stripeRouter";
import { startLocalProviderMocks, type LocalProviderMocks } from "./test/localProviderMocks";

const stripeMockRunRequested = process.env.RUN_STRIPE_MOCK_TESTS === "1";
const localProviderRunRequested = process.env.RUN_LOCAL_PROVIDER_TESTS === "1";
if (stripeMockRunRequested && !process.env.STRIPE_API_BASE_URL && !localProviderRunRequested) {
  throw new Error(
    "[Stripe mock tests] STRIPE_API_BASE_URL is required when RUN_STRIPE_MOCK_TESTS=1",
  );
}

const stripeMockEnabled = (stripeMockRunRequested && !!process.env.STRIPE_API_BASE_URL) || localProviderRunRequested;
let localProviders: LocalProviderMocks | undefined;
const originalApiBaseUrl = process.env.STRIPE_API_BASE_URL;

beforeAll(async () => {
  if (!localProviderRunRequested) return;
  localProviders = await startLocalProviderMocks();
  process.env.STRIPE_API_BASE_URL = localProviders.stripeBaseUrl;
});

afterAll(async () => {
  await localProviders?.close();
  if (originalApiBaseUrl === undefined) delete process.env.STRIPE_API_BASE_URL;
  else process.env.STRIPE_API_BASE_URL = originalApiBaseUrl;
});

describe("Stripe mock-server contract", () => {
  it.skipIf(!stripeMockEnabled)(
    "accepts the platform's customer creation request through the Stripe API shape fixture",
    async () => {
      const priorKey = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = "sk_test_stripe_mock_contract";
      try {
        const customer = await createStripeClient().customers.create({
          email: "stripe-mock-contract@lanai.test",
          metadata: { lanai_test_namespace: "provider-contract" },
        });
        expect(customer.id).toBeTruthy();
        expect(customer.object).toBe("customer");
      } finally {
        if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
        else process.env.STRIPE_SECRET_KEY = priorKey;
      }
    },
    20_000,
  );
});
