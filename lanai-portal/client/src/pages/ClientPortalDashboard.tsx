/**
 * Lanai — Client Portal Dashboard
 * Route: /client/dashboard  (protected by MemberPortalGuard in App.tsx)
 *
 * - Session: from trpc.memberAuth.me — no localStorage, no hardcoded accounts
 * - Trips: from trpc.members.myTrips — filtered to THIS member's CRM person ID
 * - Travel request: via trpc.members.submitTravelRequest
 * - Documents: via trpc.members.myDocuments — tier-gated (Platinum only)
 * - Logout: via trpc.memberAuth.logout
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Crown, Plane, MapPin, Calendar, Plus, Send, LogOut,
  FileText, MessageCircle, ChevronRight, Loader2, CheckCircle,
  Lock, ExternalLink, CreditCard, Heart, Star, TrendingUp, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { stageLabel, stageColor, formatCurrency, type CRMOpportunity } from "@/lib/crmApi";
import MemberBillingPage from "./MemberBillingPage";

type Tab = "trips" | "request" | "documents" | "messages" | "billing" | "favourites" | "spending" | "proposals" | "itineraries";
type ChatMsg = { id: string; from: "advisor" | "client"; text: string; time: string };

export default function ClientPortalDashboard() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("trips");
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);


  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: member, isLoading: loadingMember } = trpc.memberAuth.me.useQuery();
  const utils = trpc.useUtils();

  const logoutMutation = trpc.memberAuth.logout.useMutation({
    onSuccess: async () => {
      await utils.memberAuth.me.invalidate();
      navigate("/client");
    },
  });

  // ── Trips (member-scoped) ─────────────────────────────────────────────────
  const { data: tripsData, isLoading: loadingTrips } = trpc.memberPortal.myTrips.useQuery(
    undefined,
    { enabled: !!member }
  );
  const trips: CRMOpportunity[] = (tripsData?.trips ?? []) as CRMOpportunity[];

  // ── Travel request ────────────────────────────────────────────────────────
  const [reqDestination, setReqDestination] = useState("");
  const [reqDates, setReqDates] = useState("");
  const [reqBudget, setReqBudget] = useState("");
  const [reqNotes, setReqNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitRequestMutation = trpc.memberPortal.submitRequest.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setReqDestination(""); setReqDates(""); setReqBudget(""); setReqNotes("");
      utils.memberPortal.myTrips.invalidate();
    },
  });

  // ── Documents (Platinum only) ─────────────────────────────────────────────
  const isPlatinum = member?.tier === "platinum";
  const { data: docsData, isLoading: loadingDocs } = trpc.memberPortal.myDocuments.useQuery(
    undefined,
    { enabled: !!member && isPlatinum }
  );

  // ── Favourites (member-scoped) ───────────────────────────────────────────
  const { data: favourites, isLoading: loadingFavs, refetch: refetchFavs } = trpc.memberPortal.favouriteSuppliers.useQuery(
    undefined,
    { enabled: !!member }
  );
  const { data: supplierDir } = trpc.memberPortal.suppliersDirectory.useQuery(
    { category: undefined },
    { enabled: !!member && activeTab === "favourites" }
  );
  const addFav = trpc.memberPortal.addFavouriteSupplier.useMutation({
    onSuccess: () => { utils.memberPortal.favouriteSuppliers.invalidate(); refetchFavs(); },
  });
  const removeFav = trpc.memberPortal.removeFavouriteSupplier.useMutation({
    onSuccess: () => { utils.memberPortal.favouriteSuppliers.invalidate(); refetchFavs(); },
  });

  // ── Spending history (member-scoped) ─────────────────────────────────────
  const { data: spending, isLoading: loadingSpend, refetch: refetchSpend } = trpc.memberPortal.spendingHistory.useQuery(
    { limit: 20 },
    { enabled: !!member && activeTab === "spending" }
  );

  // ── Proposals (member-scoped) ───────────────────────────────────────────────
  const { data: proposals, isLoading: loadingProposals, refetch: refetchProposals } = trpc.memberPortal.myProposals.useQuery(
    undefined,
    { enabled: !!member && activeTab === "proposals" }
  );
  const respondProposal = trpc.proposals.respond.useMutation({
    onSuccess: () => { toast.success("Thank you — your response has been recorded"); refetchProposals(); },
    onError: (e) => toast.error(`Could not respond: ${e.message}`),
  });

  // ── Itineraries (member-scoped) ─────────────────────────────────────────────
  const { data: itineraries, isLoading: loadingItins } = trpc.itineraries.myItineraries.useQuery(
    undefined,
    { enabled: !!member && activeTab === "itineraries" }
  );

  // ── Chat (in-memory for now — WhatsApp deep-link is the real channel) ─────
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { id: "1", from: "advisor", text: "Good morning! Your advisor is here to help. Send a message and we'll respond shortly.", time: "9:00 AM" },
  ]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    setChatMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), from: "client", text: chatInput.trim(), time: now },
    ]);
    setChatInput("");
  };

  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    submitRequestMutation.mutate({
      destination: reqDestination,
      travelDate: reqDates || undefined,
      budgetGBP: reqBudget ? parseInt(reqBudget.replace(/\D/g, "")) : undefined,
      notes: reqNotes || undefined,
      origin: window.location.origin,
    });
  };

  // ── Loading / unauthenticated ─────────────────────────────────────────────
  if (loadingMember) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "oklch(0.97 0.015 80)" }}>
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!member) return null; // MemberPortalGuard handles redirect

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "trips", label: "My Trips", icon: Plane },
    { id: "favourites", label: "Favourites", icon: Heart },
    { id: "spending", label: "Spending", icon: TrendingUp },
    { id: "request", label: "New Request", icon: Plus },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "messages", label: "Messages", icon: MessageCircle },
    { id: "proposals", label: "Proposals", icon: FileText },
    { id: "itineraries", label: "Itineraries", icon: MapPin },
    { id: "billing", label: "Billing", icon: CreditCard },
  ];

  const tierColor =
    member.tier === "platinum"
      ? "oklch(0.55 0.18 300)"
      : member.tier === "gold"
      ? "oklch(0.72 0.12 75)"
      : "oklch(0.6 0 0)";

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.97 0.015 80)" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "oklch(0.25 0.06 145)" }}
            >
              <Crown className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 leading-none">Lanai Lifestyle</p>
              <p className="text-sm font-semibold text-gray-900 leading-none mt-0.5">{member.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
              style={{ background: tierColor + "20", color: tierColor }}
            >
              {member.tier}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              className="gap-1.5 text-gray-500"
              disabled={logoutMutation.isPending}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold text-gray-900"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Welcome back, {member.name.split(" ")[0]}
          </h1>
          <p className="text-gray-500 mt-1">Your personal travel concierge is ready to assist you.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-gray-200 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.id ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
              style={activeTab === tab.id ? { background: "oklch(0.25 0.06 145)" } : {}}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Trips ─────────────────────────────────────────────────────── */}
        {activeTab === "trips" && (
          <div className="space-y-4">
            <h2
              className="text-lg font-semibold text-gray-900"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Your Trips
            </h2>
            {loadingTrips ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : trips.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Plane className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No trips found. Submit a new travel request to get started.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {trips.map((trip) => (
                  <div
                    key={trip.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "oklch(0.25 0.06 145)20" }}
                        >
                          <Plane className="w-5 h-5" style={{ color: "oklch(0.25 0.06 145)" }} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{trip.name}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            {trip.closeDate && (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="w-3 h-3" />
                                {new Date(trip.closeDate).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                })}
                              </span>
                            )}
                            {trip.amount?.amountMicros ? (
                              <span
                                className="text-xs font-mono font-medium"
                                style={{ color: "oklch(0.35 0.09 145)" }}
                              >
                                {formatCurrency(trip.amount.amountMicros, trip.amount.currencyCode)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
                          stageColor(trip.stage)
                        )}
                      >
                        {stageLabel(trip.stage)}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        Your advisor is managing this request
                      </span>
                      <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                        View details <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Favourites ─────────────────────────────────────────────── */}
        {activeTab === "favourites" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>
                Your Favourite Suppliers
              </h2>
              <p className="text-sm text-gray-500 mt-1">Suppliers you love for future journeys.</p>
            </div>

            {loadingFavs ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !favourites || favourites.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No favourites yet. Browse the directory below to add some.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {favourites.map((s: any) => (
                  <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden">
                      {s.logoUrl ? (
                        <img src={s.logoUrl} alt={s.name} className="w-full h-full object-contain" />
                      ) : (
                        <Building2 className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">{s.name}</p>
                        {s.preferredStatus && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Preferred</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{s.category}{s.country ? ` · ${s.country}` : ""}</p>
                      {s.rating ? (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {Array.from({ length: s.rating }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-red-500 shrink-0"
                      onClick={() => removeFav.mutate({ supplierId: s.supplierId })}
                      disabled={removeFav.isPending}
                    >
                      <Heart className="w-4 h-4 fill-red-500 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Browse directory */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Browse Supplier Directory</h3>
              {!supplierDir || supplierDir.length === 0 ? (
                <p className="text-sm text-gray-400">No suppliers available.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {supplierDir.map((s: any) => {
                    const isFav = (favourites ?? []).some((f: any) => f.supplierId === s.id);
                    return (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                          <p className="text-xs text-gray-400">{s.category}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn("shrink-0 gap-1", isFav ? "text-red-500" : "text-gray-500")}
                          onClick={() => isFav ? removeFav.mutate({ supplierId: s.id }) : addFav.mutate({ supplierId: s.id })}
                          disabled={addFav.isPending || removeFav.isPending}
                        >
                          <Heart className={cn("w-4 h-4", isFav && "fill-red-500")} />
                          {isFav ? "Saved" : "Add"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Spending ────────────────────────────────────────────────── */}
        {activeTab === "spending" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>
                Your Spending History
              </h2>
              <p className="text-sm text-gray-500 mt-1">A lifetime view of your curated experiences with Lanai.</p>
            </div>

            {loadingSpend ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !spending ? (
              <div className="text-center py-16 text-gray-400">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No spending recorded yet.</p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Lifetime Spend</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">£{Number(spending.total).toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">This Year</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">£{Number(spending.yearTotal).toLocaleString()}</p>
                  </div>
                </div>

                {spending.byCategory?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">By Category</h3>
                    <div className="space-y-2">
                      {spending.byCategory.map((c: any) => (
                        <div key={c.category} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{c.category}</span>
                          <span className="font-medium text-gray-900">£{Number(c.total).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {spending.recent?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Transactions</h3>
                    <div className="space-y-2">
                      {spending.recent.map((t: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{t.description}</p>
                            <p className="text-xs text-gray-400">{t.category} · {new Date(t.spentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">£{Number(t.amount).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── New Request ───────────────────────────────────────────────── */}
        {activeTab === "request" && (
          <div className="max-w-lg">
            <h2
              className="text-lg font-semibold text-gray-900 mb-1"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Submit a Travel Request
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Tell us about your dream trip and your advisor will craft a bespoke itinerary for you.
            </p>

            {submitted ? (
              <div className="bg-white rounded-xl border border-green-200 p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "oklch(0.55 0.15 145)" }} />
                <h3
                  className="text-lg font-semibold text-gray-900 mb-2"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  Request Submitted
                </h3>
                <p className="text-gray-500 text-sm mb-4">
                  Your advisor will be in touch within 2 hours with initial ideas and questions.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSubmitted(false); setActiveTab("trips"); }}
                >
                  View My Trips
                </Button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmitRequest}
                className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
              >
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">
                    Destination
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      value={reqDestination}
                      onChange={(e) => setReqDestination(e.target.value)}
                      placeholder="e.g. Maldives, Japan, Tuscany…"
                      required
                      className="pl-9 border-gray-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">
                    Preferred Travel Dates
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="date"
                      value={reqDates}
                      onChange={(e) => setReqDates(e.target.value)}
                      className="pl-9 border-gray-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">
                    Approximate Budget (GBP)
                  </label>
                  <Input
                    value={reqBudget}
                    onChange={(e) => setReqBudget(e.target.value)}
                    placeholder="e.g. 25000"
                    className="border-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">
                    Additional Notes
                  </label>
                  <Textarea
                    value={reqNotes}
                    onChange={(e) => setReqNotes(e.target.value)}
                    placeholder="Tell us about the occasion, group size, special requirements, or any experiences you'd love to include…"
                    rows={4}
                    className="border-gray-200 resize-none"
                  />
                </div>

                {submitRequestMutation.error && (
                  <p className="text-red-600 text-sm">{submitRequestMutation.error.message}</p>
                )}

                <Button
                  type="submit"
                  disabled={submitRequestMutation.isPending}
                  className="w-full gap-2 text-white"
                  style={{ background: "oklch(0.25 0.06 145)" }}
                >
                  {submitRequestMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</>
                  ) : (
                    <><Send className="w-4 h-4" />Submit Request</>
                  )}
                </Button>
              </form>
            )}
          </div>
        )}

        {/* ── Documents (Platinum only) ─────────────────────────────────── */}
        {activeTab === "documents" && (
          <div>
            <h2
              className="text-lg font-semibold text-gray-900 mb-6"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Document Vault
            </h2>

            {!isPlatinum ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <Lock className="w-10 h-10 mx-auto mb-4 text-gray-300" />
                <h3 className="font-semibold text-gray-700 mb-1">Platinum Feature</h3>
                <p className="text-sm text-gray-400">
                  The document vault is available exclusively to Platinum members.
                  Contact your advisor to upgrade your membership.
                </p>
              </div>
            ) : loadingDocs ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !docsData?.documents || docsData.documents.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No documents yet. Your advisor will upload files here.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {(docsData?.documents ?? []).map((doc, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{(doc as {name: string}).name}</p>
                    <p className="text-xs text-gray-400">
                      {(doc as {type: string}).type} · Added {(doc as {date: string}).date}
                    </p>
                    </div>
                    <a
                      href={(doc as {url: string}).url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                    >
                      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-4 text-center">
              Documents are securely stored and shared by your advisor.
            </p>
          </div>
        )}

        {/* ── Messages ─────────────────────────────────────────────────── */}
        {activeTab === "messages" && (
          <div>
            <h2
              className="text-lg font-semibold text-gray-900 mb-4"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Messages with Your Advisor
            </h2>
            <div
              className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col"
              style={{ height: "480px" }}
            >
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ background: "oklch(0.35 0.09 145)" }}
                  >
                    L
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Lanai Concierge Team</p>
                    <p className="text-xs text-green-500">● Available</p>
                  </div>
                </div>
                {/* WhatsApp deep-link — real channel */}
                <a
                  href="https://wa.me/447700000000"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <MessageCircle className="w-3.5 h-3.5 text-green-500" />
                    WhatsApp
                  </Button>
                </a>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn("flex", msg.from === "client" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className="max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl text-sm"
                      style={
                        msg.from === "client"
                          ? { background: "oklch(0.25 0.06 145)", color: "white", borderBottomRightRadius: "4px" }
                          : { background: "oklch(0.96 0.01 80)", color: "oklch(0.2 0 0)", borderBottomLeftRadius: "4px" }
                      }
                    >
                      <p>{msg.text}</p>
                      <p
                        className={cn(
                          "text-xs mt-1",
                          msg.from === "client" ? "text-white/60" : "text-gray-400"
                        )}
                      >
                        {msg.time}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())
                  }
                  placeholder="Message your advisor…"
                  className="border-gray-200 flex-1"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!chatInput.trim()}
                  size="sm"
                  className="text-white shrink-0"
                  style={{ background: "oklch(0.25 0.06 145)" }}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Proposals ─────────────────────────────────────────────────── */}
        {activeTab === "proposals" && (
          <div className="space-y-4">
            <div>
              <h2
                className="text-lg font-semibold text-gray-900"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Your Proposals
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Review itineraries crafted for you and approve to begin preparations.
              </p>
            </div>

            {loadingProposals ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !proposals || proposals.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No proposals yet. Your advisor will share curated itineraries here.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {proposals.map((p: any) => {
                  const statusColor =
                    p.status === "approved" ? "oklch(0.55 0.15 145)"
                      : p.status === "sent" ? "oklch(0.6 0.12 220)"
                      : p.status === "rejected" ? "oklch(0.6 0.2 25)"
                      : "oklch(0.6 0 0)";
                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-xl border border-gray-200 p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-gray-900">{p.title}</h3>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            <span
                              className="px-2 py-0.5 rounded-full font-medium capitalize"
                              style={{ background: statusColor + "20", color: statusColor }}
                            >
                              {p.status}
                            </span>
                            {p.totalPrice && (
                              <span className="font-mono font-medium" style={{ color: "oklch(0.35 0.09 145)" }}>
                                £{Number(p.totalPrice).toLocaleString()}
                              </span>
                            )}
                            {p.marginPct != null && (
                              <span className="text-gray-400">Advisor margin {p.marginPct}%</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {p.status === "sent" && (
                        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                          <Button
                            size="sm"
                            className="text-white gap-1.5"
                            style={{ background: "oklch(0.25 0.06 145)" }}
                            onClick={() => respondProposal.mutate({ id: p.id, decision: "approved" })}
                            disabled={respondProposal.isPending}
                          >
                            <CheckCircle className="w-4 h-4" /> Approve Proposal
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-red-600 border-red-200"
                            onClick={() => {
                              const reason = window.prompt("Let us know what to adjust (optional):");
                              if (reason !== null) respondProposal.mutate({ id: p.id, decision: "rejected" });
                            }}
                            disabled={respondProposal.isPending}
                          >
                            Request Changes
                          </Button>
                        </div>
                      )}
                      {p.status === "approved" && p.approvedAt && (
                        <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-green-600">
                          ✓ Approved on {new Date(p.approvedAt).toLocaleDateString("en-GB")} — your advisor is now making arrangements.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Itineraries ─────────────────────────────────────────────── */}
        {activeTab === "itineraries" && (
          <div className="space-y-4">
            <div>
              <h2
                className="text-lg font-semibold text-gray-900"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Your Itineraries
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Curated day-by-day journeys prepared by your advisor.
              </p>
            </div>

            {loadingItins ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !itineraries || itineraries.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No itineraries shared yet.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {itineraries.map((it: any) => (
                  <div key={it.id} className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{it.title}</h3>
                        {it.destination && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />{it.destination}
                          </p>
                        )}
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 capitalize">
                        {it.status}
                      </span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {(it.days ?? []).map((day: any, di: number) => (
                        <div key={di} className="border-l-2 border-gray-100 pl-3">
                          <p className="text-sm font-medium text-gray-800">
                            Day {day.day}{day.title ? ` — ${day.title}` : ""}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {day.activities?.map((a: any, ai: number) => (
                              <li key={ai} className="text-xs text-gray-500 flex gap-2">
                                {a.time && <span className="font-mono text-gray-400">{a.time}</span>}
                                <span>{a.title}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    {it.notes && (
                      <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">{it.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "billing" && (
          <div>
            <MemberBillingPage />
          </div>
        )}
      </main>
    </div>
  );
}
