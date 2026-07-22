/**
 * Stripe router — handles membership subscriptions and card-on-file for members.
 *
 * Routes:
 *   memberPayments.createCheckout   — creates a Stripe Checkout Session for a tier
 *   memberPayments.getSubscription  — returns current subscription status
 *   memberPayments.getPaymentMethods — lists saved cards
 *   memberPayments.cancelSubscription — cancels at period end
 *   memberPayments.billingPortal    — Stripe customer portal URL
 *
 * Webhook (Express route, not tRPC):
 *   POST /api/stripe/webhook        — handles checkout.session.completed, etc.
 */

import Stripe from "stripe";
import { z } from "zod";
import { memberProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { members } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { MEMBERSHIP_PLANS } from "./stripeProducts";
import type { Express, Request, Response } from "express";

// ─── Stripe client ────────────────────────────────────────────────────────────

export function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");

  const endpointOverride = process.env.STRIPE_API_BASE_URL;
  const options: Stripe.StripeConfig = { apiVersion: "2026-06-24.dahlia" };
  if (endpointOverride && process.env.NODE_ENV === "production") {
    throw new Error("STRIPE_API_BASE_URL is only permitted outside production");
  }
  if (endpointOverride) {
    const endpoint = new URL(endpointOverride);
    if (endpoint.pathname !== "/" && endpoint.pathname !== "") {
      throw new Error("STRIPE_API_BASE_URL must not include a path");
    }
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      throw new Error("STRIPE_API_BASE_URL must use http or https");
    }
    options.host = endpoint.hostname;
    options.port = endpoint.port || undefined;
    options.protocol = endpoint.protocol.slice(0, -1) as Stripe.HttpProtocol;
  }
  return new Stripe(key, options);
}

function getStripe(): Stripe {
  return createStripeClient();
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function setMemberStripeIds(
  memberId: number,
  customerId: string,
  subscriptionId?: string,
) {
  const db = await getDb();
  const update: Record<string, unknown> = { stripeCustomerId: customerId };
  if (subscriptionId !== undefined)
    update.stripeSubscriptionId = subscriptionId;
  await db.update(members).set(update).where(eq(members.id, memberId));
}

async function getMemberById(memberId: number) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Ensure Stripe customer exists for this member ───────────────────────────

async function ensureStripeCustomer(
  stripe: Stripe,
  memberId: number,
  email: string,
  name: string,
): Promise<string> {
  const member = await getMemberById(memberId);
  if (member?.stripeCustomerId) return member.stripeCustomerId;

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { memberId: String(memberId) },
  });

  await setMemberStripeIds(memberId, customer.id);
  return customer.id;
}

// ─── Ensure Stripe Price exists for a tier (creates on first use in test mode) ─

const _priceCache: Record<string, string> = {};

async function ensureStripePriceId(
  stripe: Stripe,
  tier: "platinum" | "gold" | "silver",
): Promise<string> {
  if (_priceCache[tier]) return _priceCache[tier];

  const configuredPriceId =
    process.env[`STRIPE_PRICE_ID_${tier.toUpperCase()}`];
  if (configuredPriceId) {
    _priceCache[tier] = configuredPriceId;
    return configuredPriceId;
  }

  const plan = MEMBERSHIP_PLANS[tier];
  if (!plan) throw new Error(`Unknown tier: ${tier}`);

  // Search for an existing price with matching metadata
  const existing = await stripe.prices.search({
    query: `metadata['lanai_tier']:'${tier}' AND active:'true'`,
    limit: 1,
  });

  if (existing.data.length > 0) {
    _priceCache[tier] = existing.data[0].id;
    return existing.data[0].id;
  }

  // Create product + price
  const product = await stripe.products.create({
    name: plan.name,
    description: plan.description,
    metadata: { lanai_tier: tier },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.unitAmount,
    currency: plan.currency,
    recurring: { interval: "month" },
    metadata: { lanai_tier: tier },
  });

  _priceCache[tier] = price.id;
  return price.id;
}

// ─── tRPC router ──────────────────────────────────────────────────────────────

export const memberPaymentsRouter = router({
  /**
   * Create a Stripe Checkout Session for a membership subscription.
   * Returns a URL to redirect the member to.
   */
  createCheckout: memberProcedure
    .input(
      z.object({
        tier: z.enum(["platinum", "gold", "silver"]),
        origin: z.string().url(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      const { member } = ctx;

      const customerId = await ensureStripeCustomer(
        stripe,
        member.id,
        member.email,
        member.name,
      );

      const priceId = await ensureStripePriceId(stripe, input.tier);
      const plan = MEMBERSHIP_PLANS[input.tier];

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        subscription_data: {
          metadata: {
            memberId: String(member.id),
            memberEmail: member.email,
            tier: input.tier,
          },
        },
        client_reference_id: String(member.id),
        metadata: {
          user_id: String(member.id),
          customer_email: member.email,
          customer_name: member.name,
          tier: input.tier,
        },
        success_url: `${input.origin}/client/dashboard?payment=success&tier=${input.tier}`,
        cancel_url: `${input.origin}/client/dashboard?payment=cancelled`,
      });

      return {
        checkoutUrl: session.url!,
        planName: plan.name,
        tier: input.tier,
      };
    }),

  /**
   * Get the member's current subscription status from Stripe.
   */
  getSubscription: memberProcedure.query(async ({ ctx }) => {
    const stripe = getStripe();
    const member = await getMemberById(ctx.member.id);
    if (!member?.stripeSubscriptionId) {
      return { active: false, subscription: null };
    }

    try {
      const sub = (await stripe.subscriptions.retrieve(
        member.stripeSubscriptionId,
        { expand: ["default_payment_method", "items.data.price.product"] },
      )) as unknown as Stripe.Subscription;

      const item = sub.items.data[0];
      const price = item?.price;
      const product = price?.product as Stripe.Product | undefined;

      return {
        active: sub.status === "active" || sub.status === "trialing",
        subscription: {
          id: sub.id,
          status: sub.status,
          currentPeriodEnd: new Date(
            (sub as unknown as { current_period_end: number })
              .current_period_end * 1000,
          ).toISOString(),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          planName: product?.name ?? "Lanai Membership",
          amount: price?.unit_amount ?? 0,
          currency: price?.currency ?? "gbp",
          interval: price?.recurring?.interval ?? "month",
        },
      };
    } catch {
      return { active: false, subscription: null };
    }
  }),

  /**
   * List saved payment methods (cards) for the member.
   */
  getPaymentMethods: memberProcedure.query(async ({ ctx }) => {
    const stripe = getStripe();
    const member = await getMemberById(ctx.member.id);
    if (!member?.stripeCustomerId) return { paymentMethods: [] };

    const pms = await stripe.paymentMethods.list({
      customer: member.stripeCustomerId,
      type: "card",
    });

    return {
      paymentMethods: pms.data.map((pm: Stripe.PaymentMethod) => ({
        id: pm.id,
        brand: pm.card?.brand ?? "unknown",
        last4: pm.card?.last4 ?? "****",
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
      })),
    };
  }),

  /**
   * Cancel the member's subscription at the end of the current billing period.
   */
  cancelSubscription: memberProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe();
    const member = await getMemberById(ctx.member.id);
    if (!member?.stripeSubscriptionId) {
      throw new Error("No active subscription found");
    }

    const sub = (await stripe.subscriptions.update(
      member.stripeSubscriptionId,
      { cancel_at_period_end: true },
    )) as unknown as Stripe.Subscription;

    return {
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd: new Date(
        (sub as unknown as { current_period_end: number }).current_period_end *
          1000,
      ).toISOString(),
    };
  }),

  /**
   * Generate a Stripe Billing Portal URL so the member can manage their
   * payment methods, download invoices, and update billing details.
   */
  billingPortal: memberProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      const member = await getMemberById(ctx.member.id);

      const customerId = await ensureStripeCustomer(
        stripe,
        ctx.member.id,
        ctx.member.email,
        ctx.member.name,
      );

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${input.origin}/client/dashboard`,
      });

      return { portalUrl: session.url };
    }),

  /**
   * Return the available membership plans (for the upgrade UI).
   */
  plans: memberProcedure.query(() => {
    return {
      plans: Object.values(MEMBERSHIP_PLANS).map((p) => ({
        tier: p.tier,
        name: p.name,
        description: p.description,
        unitAmount: p.unitAmount,
        currency: p.currency,
        features: p.features,
      })),
    };
  }),
});

// ─── Express webhook handler ──────────────────────────────────────────────────

export function registerStripeWebhook(app: Express): void {
  app.post(
    "/api/stripe/webhook",
    // Raw body required for signature verification — must be registered BEFORE
    // express.json() parses the body. The _core/index.ts registers this route
    // early via registerStripeWebhook().
    (req: Request, res: Response) => {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!stripeSecretKey || !webhookSecret) {
        res
          .status(503)
          .json({ error: "Stripe webhook processing is unavailable" });
        return;
      }
      const sig = req.headers["stripe-signature"] as string | undefined;
      if (!sig) {
        res.status(400).send("Missing Stripe signature");
        return;
      }
      const stripe = getStripe();

      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          sig,
          webhookSecret,
        );
      } catch (err) {
        console.error("[Stripe Webhook] Signature verification failed:", err);
        res.status(400).send("Webhook signature verification failed");
        return;
      }

      // Test event — return verification response
      if (event.id.startsWith("evt_test_")) {
        console.log(
          "[Stripe Webhook] Test event detected, returning verification response",
        );
        res.json({ verified: true });
        return;
      }

      console.log(`[Stripe Webhook] Event: ${event.type} (${event.id})`);

      // Handle events asynchronously — respond 200 immediately
      void handleStripeEvent(event);
      res.json({ received: true });
    },
  );

  console.log("[Stripe Webhook] Registered at POST /api/stripe/webhook");
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const memberId = parseInt(session.metadata?.user_id ?? "0", 10);
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string | null;
        const tier = session.metadata?.tier as
          "platinum" | "gold" | "silver" | undefined;

        if (!memberId || !customerId) break;

        await setMemberStripeIds(
          memberId,
          customerId,
          subscriptionId ?? undefined,
        );

        // Upgrade member tier if they subscribed to a higher tier
        if (tier) {
          const db = await getDb();
          if (db) {
            await db
              .update(members)
              .set({ tier })
              .where(eq(members.id, memberId));
          }
        }

        console.log(
          `[Stripe Webhook] Member ${memberId} subscribed — tier: ${tier ?? "unknown"}`,
        );
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const memberId = parseInt(sub.metadata?.memberId ?? "0", 10);
        if (!memberId) break;

        const db = await getDb();
        if (db) {
          await db
            .update(members)
            .set({ stripeSubscriptionId: null })
            .where(eq(members.id, memberId));
        }

        console.log(
          `[Stripe Webhook] Subscription cancelled for member ${memberId}`,
        );
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(
          `[Stripe Webhook] Payment failed for customer ${invoice.customer}`,
        );
        break;
      }

      default:
        // Unhandled event type — no action needed
        break;
    }
  } catch (err) {
    console.error("[Stripe Webhook] Error handling event:", err);
  }
}
