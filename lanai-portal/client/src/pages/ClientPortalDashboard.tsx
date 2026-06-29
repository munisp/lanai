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
  Lock, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { stageLabel, stageColor, formatCurrency, type CRMOpportunity } from "@/lib/crmApi";

type Tab = "trips" | "request" | "documents" | "messages";
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
    { id: "request", label: "New Request", icon: Plus },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "messages", label: "Messages", icon: MessageCircle },
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
      </main>
    </div>
  );
}
