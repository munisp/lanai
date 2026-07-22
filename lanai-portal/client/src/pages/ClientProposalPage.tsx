import { Link, useRoute } from "wouter";
import { CheckCircle2, MapPinned, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type ItineraryDay = {
  day: number;
  title: string;
  location?: string;
  description?: string;
  imageUrl?: string;
  mapUrl?: string;
  activities?: string[];
};

type PricingTier = {
  name: string;
  description?: string;
  totalPrice: string;
  currency?: string;
  inclusions?: string[];
  recommended?: boolean;
};

function formatCurrency(value: string | number | null | undefined, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export default function ClientProposalPage() {
  const [, params] = useRoute("/client/proposals/:id");
  const proposalId = Number(params?.id);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.proposals.myProposalDetail.useQuery(
    { id: proposalId },
    { enabled: Number.isSafeInteger(proposalId) && proposalId > 0 },
  );
  const respond = trpc.proposals.respond.useMutation({
    onSuccess: (_, variables) => {
      toast.success(
        variables.decision === "approved"
          ? "Your approval has been received. Your concierge will confirm the next steps."
          : "Your feedback has been recorded. Your concierge will follow up.",
      );
      utils.proposals.myProposalDetail.invalidate({ id: proposalId });
      utils.proposals.myProposals.invalidate();
    },
    onError: (error) => toast.error(error.message || "Unable to record your decision."),
  });

  if (isLoading) {
    return <div className="min-h-screen bg-background p-6"><Skeleton className="mx-auto h-96 max-w-4xl" /></div>;
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-background grid place-items-center p-6 text-center">
        <div className="space-y-3"><h1 className="text-2xl font-semibold">Proposal unavailable</h1><p className="text-muted-foreground">This proposal is no longer available for your account.</p><Link href="/client/dashboard"><Button>Return to your portal</Button></Link></div>
      </div>
    );
  }

  const itinerary = (data.proposal.itinerary ?? []) as ItineraryDay[];
  const tiers = (data.proposal.pricingTiers ?? []) as PricingTier[];
  const proposal = data.proposal;
  const canRespond = proposal.status === "sent";

  return (
    <div className="min-h-screen bg-[oklch(0.985_0.012_85)] pb-16">
      <header className="border-b bg-background/95 sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/client/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Member portal</Link>
          <span className="text-xs uppercase tracking-[0.22em] text-primary">Your Lanai Proposal</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-8 px-5 pt-8">
        <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          {proposal.heroImageUrl && <img src={proposal.heroImageUrl} alt="Destination selected for your proposal" className="h-72 w-full object-cover" />}
          <div className="space-y-4 p-7 sm:p-10">
            <div className="flex items-center gap-2 text-primary"><Sparkles className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Curated for you</span></div>
            <h1 className="text-3xl font-bold sm:text-4xl" style={{ fontFamily: "'Playfair Display', serif" }}>{proposal.title}</h1>
            {proposal.clientMessage && <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{proposal.clientMessage}</p>}
            {proposal.description && <p className="max-w-3xl whitespace-pre-wrap leading-relaxed text-foreground/85">{proposal.description}</p>}
            {proposal.totalPrice && <div className="pt-2 text-xl font-semibold">From {formatCurrency(proposal.totalPrice, proposal.currency ?? "GBP")}</div>}
          </div>
        </section>

        {tiers.length > 0 && <section className="space-y-4"><div><h2 className="text-2xl font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>Choose Your Experience</h2><p className="text-sm text-muted-foreground">Your concierge can refine any option before confirmation.</p></div><div className="grid gap-4 md:grid-cols-3">{tiers.map((tier) => <article key={`${tier.name}-${tier.totalPrice}`} className={`rounded-xl border bg-background p-5 ${tier.recommended ? "border-primary ring-1 ring-primary/30" : ""}`}><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{tier.name}</h3>{tier.recommended && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">Recommended</span>}</div>{tier.description && <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>}<p className="mt-4 text-xl font-bold">{formatCurrency(tier.totalPrice, tier.currency ?? proposal.currency ?? "GBP")}</p>{tier.inclusions?.length ? <ul className="mt-4 space-y-1 text-sm">{tier.inclusions.map((item) => <li key={item}>• {item}</li>)}</ul> : null}</article>)}</div></section>}

        {itinerary.length > 0 && <section className="space-y-4"><div><h2 className="text-2xl font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>Your Interactive Itinerary</h2><p className="text-sm text-muted-foreground">Every day is designed to be tailored with your concierge.</p></div><div className="space-y-4">{itinerary.sort((a, b) => a.day - b.day).map((day) => <article key={day.day} className="overflow-hidden rounded-xl border bg-background sm:flex">{day.imageUrl && <img src={day.imageUrl} alt={`Day ${day.day}: ${day.title}`} className="h-48 w-full object-cover sm:h-auto sm:w-56" />}<div className="flex-1 p-5"><div className="text-xs font-semibold uppercase tracking-widest text-primary">Day {day.day}{day.location ? ` · ${day.location}` : ""}</div><h3 className="mt-1 text-lg font-semibold">{day.title}</h3>{day.description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{day.description}</p>}{day.activities?.length ? <div className="mt-3 flex flex-wrap gap-2">{day.activities.map((activity) => <span key={activity} className="rounded-full bg-muted px-2.5 py-1 text-xs">{activity}</span>)}</div> : null}{day.mapUrl && <a className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline" href={day.mapUrl} target="_blank" rel="noreferrer"><MapPinned className="h-4 w-4" />Open map</a>}</div></article>)}</div></section>}

        {proposal.mapEmbedUrl && <section className="overflow-hidden rounded-xl border bg-background"><iframe title="Proposal destination map" src={proposal.mapEmbedUrl} className="h-96 w-full" loading="lazy" referrerPolicy="no-referrer" /></section>}

        <section className="rounded-xl border bg-background p-6 text-center"><h2 className="text-xl font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>Ready to move forward?</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Your approval authorizes your concierge to confirm availability and final booking details. No charge is taken through this approval.</p>{canRespond ? <div className="mt-5 flex flex-wrap justify-center gap-3"><Button disabled={respond.isPending} onClick={() => respond.mutate({ id: proposalId, decision: "approved" })} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" />Approve proposal</Button><Button disabled={respond.isPending} variant="outline" onClick={() => respond.mutate({ id: proposalId, decision: "rejected" })} className="gap-2"><XCircle className="h-4 w-4" />Request changes</Button></div> : <p className="mt-4 text-sm text-muted-foreground">Current status: <span className="font-medium capitalize">{proposal.status}</span></p>}</section>
      </main>
    </div>
  );
}
