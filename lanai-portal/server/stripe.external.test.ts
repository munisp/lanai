import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { createStripeClient } from "./stripeRouter";
import { getDb } from "./db";
import { members, type Member } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { installLegacySmokeHarness } from "./test/legacySmokeHarness";
import { startLocalProviderMocks, type LocalProviderMocks } from "./test/localProviderMocks";

const requiredVariables = [
  "DATABASE_URL",
  "PERMIFY_GRPC_ADDRESS",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID_PLATINUM",
] as const;
const externalRunRequested = process.env.RUN_EXTERNAL_STRIPE_TESTS === "1";
const localProviderRunRequested = process.env.RUN_LOCAL_PROVIDER_TESTS === "1";
const missingVariables = requiredVariables.filter((name) => !process.env[name]);

if (externalRunRequested && missingVariables.length > 0) {
  throw new Error(
    `[Stripe external tests] Missing required environment variables: ${missingVariables.join(", ")}`,
  );
}

const externalStripeEnabled = externalRunRequested && missingVariables.length === 0;
const localStripePrerequisitesPresent = Boolean(process.env.DATABASE_URL && process.env.PERMIFY_GRPC_ADDRESS);
if (localProviderRunRequested && !localStripePrerequisitesPresent) {
  throw new Error("[Stripe local provider tests] DATABASE_URL and PERMIFY_GRPC_ADDRESS are required");
}
const stripeSuiteEnabled = externalStripeEnabled || (localProviderRunRequested && localStripePrerequisitesPresent);
let localProviders: LocalProviderMocks | undefined;
const originalStripeEnvironment = {
  apiBaseUrl: process.env.STRIPE_API_BASE_URL,
  secretKey: process.env.STRIPE_SECRET_KEY,
  priceId: process.env.STRIPE_PRICE_ID_PLATINUM,
};

if (stripeSuiteEnabled) installLegacySmokeHarness();

beforeAll(async () => {
  if (!localProviderRunRequested || externalStripeEnabled) return;
  localProviders = await startLocalProviderMocks();
  process.env.STRIPE_API_BASE_URL = localProviders.stripeBaseUrl;
  process.env.STRIPE_SECRET_KEY = "sk_test_local_provider";
  process.env.STRIPE_PRICE_ID_PLATINUM = "price_local_provider";
});

afterAll(async () => {
  await localProviders?.close();
  for (const [key, value] of Object.entries(originalStripeEnvironment)) {
    const environmentKey = key === "apiBaseUrl" ? "STRIPE_API_BASE_URL" : key === "secretKey" ? "STRIPE_SECRET_KEY" : "STRIPE_PRICE_ID_PLATINUM";
    if (value === undefined) delete process.env[environmentKey];
    else process.env[environmentKey] = value;
  }
});

function makeMemberContext(): TrpcContext {
  const member: Member = {
    id: 10,
    email: "member@lanai.test",
    name: "Lanai External Stripe Test Member",
    pinHash: "$2b$12$external-test-hash",
    tier: "platinum",
    crmPersonId: "crm-member-10",
    onboardingComplete: true,
    active: true,
    invitedByUserId: 1,
    assignedAdvisorId: 1,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    phone: null,
    nationality: null,
    passportNumber: null,
    passportExpiry: null,
    dateOfBirth: null,
    dietaryRequirements: null,
    accessibilityNeeds: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user: undefined,
    member,
    req: { protocol: "https", headers: {} } as never,
    res: { clearCookie: () => undefined, cookie: () => undefined } as never,
  };
}

let customerId: string | undefined;
let subscriptionId: string | undefined;

async function seedStripeSandboxMember(): Promise<void> {
  const stripe = createStripeClient();
  const namespace = process.env.EXTERNAL_TEST_NAMESPACE ?? "lanai-ci";
  const runId = process.env.EXTERNAL_TEST_RUN_ID ?? `local-${Date.now()}`;
  const customer = await stripe.customers.create({
    email: `stripe-${runId}@lanai.test`,
    name: "Lanai External Stripe Test Member",
    metadata: { lanai_test_namespace: namespace, lanai_test_run_id: runId },
  });
  customerId = customer.id;

  const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: customer.id,
  });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: process.env.STRIPE_PRICE_ID_PLATINUM! }],
    metadata: { lanai_test_namespace: namespace, lanai_test_run_id: runId },
  });
  subscriptionId = subscription.id;

  const db = await getDb();
  await db
    .update(members)
    .set({
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      updatedAt: new Date(),
    })
    .where(eq(members.id, 10));
}

async function cleanupStripeSandboxMember(): Promise<void> {
  if (!customerId) return;
  const stripe = createStripeClient();
  try {
    if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId);
  } finally {
    await stripe.customers.del(customerId);
    customerId = undefined;
    subscriptionId = undefined;
  }
}

if (stripeSuiteEnabled) {
  beforeEach(async () => {
    await seedStripeSandboxMember();
  }, 60_000);

  afterEach(async () => {
    await cleanupStripeSandboxMember();
  }, 60_000);
}

describe("Stripe external sandbox", () => {
  it.skipIf(!stripeSuiteEnabled)(
    "returns the normalized subscription status for a real sandbox subscription",
    async () => {
      const result = await appRouter
        .createCaller(makeMemberContext())
        .memberPayments.getSubscription();

      expect(result.active).toBe(true);
      expect(result.subscription?.id).toBe(subscriptionId);
      expect(result.subscription?.currency).toBeTruthy();
      expect(result.subscription?.interval).toBe("month");
    },
    60_000,
  );

  it.skipIf(!stripeSuiteEnabled)(
    "lists a real sandbox card payment method for the member customer",
    async () => {
      const result = await appRouter
        .createCaller(makeMemberContext())
        .memberPayments.getPaymentMethods();

      expect(result.paymentMethods.length).toBeGreaterThan(0);
      expect(result.paymentMethods[0]).toMatchObject({
        brand: "visa",
        last4: "4242",
      });
    },
    60_000,
  );

  it.skipIf(!stripeSuiteEnabled)(
    "creates a real Checkout subscription session with the corrected router contract",
    async () => {
      const result = await appRouter
        .createCaller(makeMemberContext())
        .memberPayments.createCheckout({
          tier: "platinum",
          origin: "https://lanai.test",
        });

      expect(result.checkoutUrl).toMatch(/^https:\/\//);
      expect(result.tier).toBe("platinum");
      expect(result.planName).toBeTruthy();
    },
    60_000,
  );

  it.skipIf(!stripeSuiteEnabled)(
    "creates a real Billing Portal session with the corrected router contract",
    async () => {
      const result = await appRouter
        .createCaller(makeMemberContext())
        .memberPayments.billingPortal({ origin: "https://lanai.test" });

      expect(result.portalUrl).toMatch(/^https:\/\//);
    },
    60_000,
  );

  it.skipIf(!stripeSuiteEnabled)(
    "creates an idempotent one-time checkout session only for the authenticated member invoice",
    async () => {
      const result = await appRouter
        .createCaller(makeMemberContext())
        .memberPayments.createInvoiceCheckout({
          invoiceId: 1,
          origin: "https://lanai.test",
        });

      expect(result).toEqual({
        invoiceId: 1,
        checkoutUrl: expect.stringMatching(/^https:\/\//),
      });
      if (localProviders) {
        expect(localProviders.requests).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              provider: "stripe",
              method: "POST",
              path: "/v1/checkout/sessions",
              idempotencyKey: "invoice-payment-checkout:1",
            }),
          ]),
        );
      }
      await expect(
        appRouter
          .createCaller(makeMemberContext())
          .memberPayments.createInvoiceCheckout({ invoiceId: 999_999, origin: "https://lanai.test" }),
      ).rejects.toThrow("Invoice was not found for the authenticated member");
    },
    60_000,
  );

  it.skipIf(!stripeSuiteEnabled)(
    "marks the current subscription for end-of-period cancellation",
    async () => {
      const result = await appRouter
        .createCaller(makeMemberContext())
        .memberPayments.cancelSubscription();

      expect(result.cancelAtPeriodEnd).toBe(true);
      expect(result.currentPeriodEnd).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      if (localProviders) {
        expect(localProviders.requests).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ method: "POST", path: `/v1/subscriptions/${subscriptionId}` }),
          ]),
        );
      }
    },
    60_000,
  );

  it.skipIf(!stripeSuiteEnabled)(
    "creates a Stripe customer when a persisted member has none and exposes the catalog plans",
    async () => {
      const db = await getDb();
      await db
        .update(members)
        .set({ stripeCustomerId: null })
        .where(eq(members.id, 10));

      const caller = appRouter.createCaller(makeMemberContext());
      const checkout = await caller.memberPayments.createCheckout({
        tier: "platinum",
        origin: "https://lanai.test",
      });
      expect(checkout).toEqual(
        expect.objectContaining({ tier: "platinum", checkoutUrl: expect.stringMatching(/^https:\/\//) }),
      );
      const plans = await caller.memberPayments.plans();
      expect(plans.plans).toEqual(
        expect.arrayContaining([expect.objectContaining({ tier: "platinum" })]),
      );
      if (localProviders) {
        expect(localProviders.requests).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ method: "POST", path: "/v1/customers" }),
          ]),
        );
      }
    },
    60_000,
  );

  it.skipIf(!stripeSuiteEnabled)(
    "returns an inactive response without a provider lookup when no subscription is persisted",
    async () => {
      const db = await getDb();
      await db
        .update(members)
        .set({ stripeSubscriptionId: null })
        .where(eq(members.id, 10));
      await expect(
        appRouter.createCaller(makeMemberContext()).memberPayments.getSubscription(),
      ).resolves.toEqual({ active: false, subscription: null });
    },
    60_000,
  );
});
