/**
 * MemberBillingPage — shown inside the client portal at /client/billing
 *
 * Features:
 *  - Current subscription status (tier, renewal date, cancel-at-period-end)
 *  - Saved payment methods (cards)
 *  - Upgrade / subscribe to a membership tier via Stripe Checkout
 *  - Cancel subscription (at period end)
 *  - Open Stripe Billing Portal for full invoice history + card management
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";

const TIER_ICONS: Record<string, React.ReactNode> = {
  platinum: <Crown className="w-4 h-4 text-amber-400" />,
  gold: <Star className="w-4 h-4 text-yellow-500" />,
  silver: <Sparkles className="w-4 h-4 text-slate-400" />,
};

const TIER_COLORS: Record<string, string> = {
  platinum: "bg-amber-950/30 border-amber-700/40 text-amber-300",
  gold: "bg-yellow-950/30 border-yellow-700/40 text-yellow-300",
  silver: "bg-slate-800/40 border-slate-600/40 text-slate-300",
};

function formatGBP(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
  }).format(pence / 100);
}

function CardBrand({ brand }: { brand: string }) {
  const labels: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
  };
  return <span className="capitalize">{labels[brand] ?? brand}</span>;
}

export default function MemberBillingPage() {
  const utils = trpc.useUtils();

  const { data: subData, isLoading: subLoading } =
    trpc.memberPayments.getSubscription.useQuery();
  const { data: pmData, isLoading: pmLoading } =
    trpc.memberPayments.getPaymentMethods.useQuery();
  const { data: plansData, isLoading: plansLoading } =
    trpc.memberPayments.plans.useQuery();

  const createCheckout = trpc.memberPayments.createCheckout.useMutation({
    onSuccess: ({ checkoutUrl }) => {
      toast.info("Redirecting to secure checkout…");
      window.open(checkoutUrl, "_blank");
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelSub = trpc.memberPayments.cancelSubscription.useMutation({
    onSuccess: ({ currentPeriodEnd }) => {
      toast.success(
        `Subscription will end on ${new Date(currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
      );
      void utils.memberPayments.getSubscription.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const billingPortal = trpc.memberPayments.billingPortal.useMutation({
    onSuccess: ({ portalUrl }) => {
      window.open(portalUrl, "_blank");
    },
    onError: (err) => toast.error(err.message),
  });

  const isLoading = subLoading || pmLoading || plansLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sub = subData?.subscription;
  const cards = pmData?.paymentMethods ?? [];
  const plans = plansData?.plans ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8 px-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing & Membership</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your Lanai membership subscription and payment methods.
        </p>
      </div>

      {/* Current Subscription */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Current Membership
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sub ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${TIER_COLORS[sub.planName?.toLowerCase().includes("platinum") ? "platinum" : sub.planName?.toLowerCase().includes("gold") ? "gold" : "silver"]}`}
                  >
                    {TIER_ICONS[
                      sub.planName?.toLowerCase().includes("platinum")
                        ? "platinum"
                        : sub.planName?.toLowerCase().includes("gold")
                          ? "gold"
                          : "silver"
                    ]}
                    {sub.planName}
                  </div>
                  <Badge
                    variant={subData?.active ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {sub.status}
                  </Badge>
                </div>
                <span className="text-lg font-semibold">
                  {formatGBP(sub.amount)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{sub.interval}
                  </span>
                </span>
              </div>

              <Separator />

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {sub.cancelAtPeriodEnd ? "Ends on" : "Renews on"}
                </span>
                <span className="font-medium">
                  {new Date(sub.currentPeriodEnd).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>

              {sub.cancelAtPeriodEnd && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                  Your subscription is set to cancel at the end of the current
                  billing period. You will retain access until then.
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    billingPortal.mutate({ origin: window.location.origin })
                  }
                  disabled={billingPortal.isPending}
                >
                  {billingPortal.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-2" />
                  ) : (
                    <ExternalLink className="w-3 h-3 mr-2" />
                  )}
                  Manage Billing
                </Button>
                {!sub.cancelAtPeriodEnd && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (
                        confirm(
                          "Cancel your subscription? You will retain access until the end of the current billing period."
                        )
                      ) {
                        cancelSub.mutate();
                      }
                    }}
                    disabled={cancelSub.isPending}
                  >
                    {cancelSub.isPending && (
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                    )}
                    Cancel Subscription
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                You do not have an active membership subscription.
              </p>
              <p className="text-xs text-muted-foreground">
                Choose a plan below to get started.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Saved Payment Methods */}
      {cards.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              Saved Cards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      <CardBrand brand={card.brand} /> ending {card.last4}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Expires {String(card.expMonth).padStart(2, "0")}/
                    {String(card.expYear).slice(-2)}
                  </span>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() =>
                billingPortal.mutate({ origin: window.location.origin })
              }
              disabled={billingPortal.isPending}
            >
              <ExternalLink className="w-3 h-3 mr-2" />
              Add or Remove Cards
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Membership Plans */}
      <div>
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          {sub ? "Change Plan" : "Choose a Plan"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.tier}
              className={`relative overflow-hidden transition-all ${
                plan.tier === "platinum"
                  ? "border-amber-700/50 shadow-amber-900/20 shadow-md"
                  : ""
              }`}
            >
              {plan.tier === "platinum" && (
                <div className="absolute top-0 right-0 bg-amber-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-bl-md tracking-wider">
                  RECOMMENDED
                </div>
              )}
              <CardHeader className="pb-2 pt-5">
                <div className="flex items-center gap-2 mb-1">
                  {TIER_ICONS[plan.tier]}
                  <CardTitle className="text-sm capitalize">{plan.tier}</CardTitle>
                </div>
                <div className="text-2xl font-bold">
                  {formatGBP(plan.unitAmount)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /mo
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {plan.description}
                </p>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <ul className="space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <span className="text-primary mt-0.5">✓</span>
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  size="sm"
                  variant={plan.tier === "platinum" ? "default" : "outline"}
                  onClick={() =>
                    createCheckout.mutate({
                      tier: plan.tier as "platinum" | "gold" | "silver",
                      origin: window.location.origin,
                    })
                  }
                  disabled={createCheckout.isPending}
                >
                  {createCheckout.isPending &&
                  createCheckout.variables?.tier === plan.tier ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-2" />
                  ) : null}
                  {sub ? "Switch to " : "Subscribe — "}
                  <span className="capitalize ml-1">{plan.tier}</span>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4 text-center">
          Payments are processed securely by Stripe. Test card: 4242 4242 4242 4242.
        </p>
      </div>
    </div>
  );
}
