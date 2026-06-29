/**
 * Lanai Lifestyle — Stripe product/price definitions.
 *
 * These are the Stripe Price IDs for each membership tier.
 * In test mode, prices are created dynamically via the Stripe API on first use.
 * In production, replace with real Price IDs from your Stripe dashboard.
 *
 * Pricing (monthly, GBP):
 *   Platinum — £2,500/mo  (full service, document vault, priority messaging)
 *   Gold     — £1,200/mo  (standard service)
 *   Silver   — £500/mo    (basic access)
 */

export interface MembershipPlan {
  tier: "platinum" | "gold" | "silver";
  name: string;
  description: string;
  /** Monthly price in pence (GBP) */
  unitAmount: number;
  currency: string;
  features: string[];
}

export const MEMBERSHIP_PLANS: Record<string, MembershipPlan> = {
  platinum: {
    tier: "platinum",
    name: "Lanai Platinum Membership",
    description: "Full-service private travel management with priority access",
    unitAmount: 250000, // £2,500/mo
    currency: "gbp",
    features: [
      "Dedicated senior advisor",
      "24/7 priority support",
      "Document vault",
      "Unlimited travel requests",
      "Exclusive supplier access",
      "Bespoke itinerary design",
    ],
  },
  gold: {
    tier: "gold",
    name: "Lanai Gold Membership",
    description: "Premium travel management for discerning travellers",
    unitAmount: 120000, // £1,200/mo
    currency: "gbp",
    features: [
      "Dedicated advisor",
      "Business hours support",
      "Up to 6 travel requests per month",
      "Curated itineraries",
      "Preferred supplier rates",
    ],
  },
  silver: {
    tier: "silver",
    name: "Lanai Silver Membership",
    description: "Essential travel management services",
    unitAmount: 50000, // £500/mo
    currency: "gbp",
    features: [
      "Shared advisor team",
      "Email support",
      "Up to 2 travel requests per month",
      "Standard itineraries",
    ],
  },
};
