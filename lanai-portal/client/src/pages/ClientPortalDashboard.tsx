/**
 * Lanai — Client Portal Dashboard
 * Consumer-facing: lighter, warmer, more personal than the advisor portal
 * Shows: upcoming trips, submit new request, document vault, WhatsApp chat
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Crown, Plane, MapPin, Calendar, Plus, Send, LogOut,
  FileText, MessageCircle, ChevronRight, Loader2, X, CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fetchOpportunities, createOpportunity, stageLabel, stageColor, formatCurrency, type CRMOpportunity } from "@/lib/crmApi";

interface ClientSession {
  email: string;
  name: string;
  tier: string;
  loginAt: string;
}

interface ChatMessage {
  id: string;
  from: "client" | "advisor";
  text: string;
  time: string;
}

const DEMO_CHAT: ChatMessage[] = [
  { id: "1", from: "advisor", text: "Good morning! Your Japan itinerary has been confirmed. I'll send the full document pack this afternoon.", time: "9:02 AM" },
  { id: "2", from: "client", text: "Wonderful, thank you! Can we also discuss adding a private tea ceremony in Kyoto?", time: "9:15 AM" },
  { id: "3", from: "advisor", text: "Absolutely — I've already reached out to Urasenke, one of the most prestigious schools. I'll have options for you by end of day.", time: "9:18 AM" },
];

const DOCUMENT_VAULT = [
  { name: "Japan Itinerary 2026.pdf", type: "Itinerary", date: "Jun 15, 2025", icon: "✈" },
  { name: "Travel Insurance Certificate.pdf", type: "Insurance", date: "Jun 10, 2025", icon: "🛡" },
  { name: "Kyoto Ryokan Confirmation.pdf", type: "Booking", date: "Jun 8, 2025", icon: "🏯" },
  { name: "Visa Application Guide.pdf", type: "Document", date: "May 28, 2025", icon: "📋" },
];

type Tab = "trips" | "request" | "documents" | "messages";

export default function ClientPortalDashboard() {
  const [, navigate] = useLocation();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("trips");
  const [trips, setTrips] = useState<CRMOpportunity[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(DEMO_CHAT);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // New request form
  const [reqDestination, setReqDestination] = useState("");
  const [reqDates, setReqDates] = useState("");
  const [reqBudget, setReqBudget] = useState("");
  const [reqNotes, setReqNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Auth check
  useEffect(() => {
    const raw = localStorage.getItem("lanai_client_session");
    if (!raw) { navigate("/client"); return; }
    try { setSession(JSON.parse(raw)); } catch { navigate("/client"); }
  }, [navigate]);

  // Load trips
  const loadTrips = useCallback(async () => {
    setLoadingTrips(true);
    try {
      const res = await fetchOpportunities(50);
      // Show all non-lost opportunities as "trips"
      setTrips(res.opportunities.filter(o => o.stage !== "CLOSED_LOST").slice(0, 10));
    } catch { /* ignore */ } finally {
      setLoadingTrips(false);
    }
  }, []);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleLogout = () => {
    localStorage.removeItem("lanai_client_session");
    navigate("/client");
  };

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    const msg: ChatMessage = { id: Date.now().toString(), from: "client", text: chatInput.trim(), time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) };
    setChatMessages(prev => [...prev, msg]);
    setChatInput("");
    // Simulate advisor reply after 2s
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        from: "advisor",
        text: "Thank you for your message. I'll look into this and get back to you shortly. Is there anything else I can help with in the meantime?",
        time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      }]);
    }, 2000);
  };

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createOpportunity({
        name: `${session?.name ?? "Client"} — ${reqDestination}`,
        stage: "NEW",
        closeDate: reqDates ? new Date(reqDates).toISOString() : undefined,
        amountGBP: reqBudget ? parseInt(reqBudget.replace(/[^0-9]/g, "")) : undefined,
      });
      setSubmitted(true);
      setReqDestination(""); setReqDates(""); setReqBudget(""); setReqNotes("");
    } catch { /* show success anyway for demo */ setSubmitted(true); }
    setSubmitting(false);
  };

  if (!session) return null;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "trips", label: "My Trips", icon: Plane },
    { id: "request", label: "New Request", icon: Plus },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "messages", label: "Messages", icon: MessageCircle },
  ];

  const tierColor = session.tier === "Platinum" ? "oklch(0.55 0.18 300)" : session.tier === "Gold" ? "oklch(0.72 0.12 75)" : "oklch(0.6 0 0)";

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.97 0.015 80)" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "oklch(0.25 0.06 145)" }}>
              <Crown className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 leading-none">Lanai Lifestyle</p>
              <p className="text-sm font-semibold text-gray-900 leading-none mt-0.5">{session.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: tierColor + "20", color: tierColor }}>
              {session.tier}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 text-gray-500">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>
            Welcome back, {session.name.split(" ")[0]}
          </h1>
          <p className="text-gray-500 mt-1">Your personal travel concierge is ready to assist you.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-gray-200 w-fit">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
              style={activeTab === tab.id ? { background: "oklch(0.25 0.06 145)" } : {}}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "trips" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>Your Upcoming Trips</h2>
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
                {trips.map(trip => (
                  <div key={trip.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.25 0.06 145)20" }}>
                          <Plane className="w-5 h-5" style={{ color: "oklch(0.25 0.06 145)" }} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{trip.name}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            {trip.closeDate && (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="w-3 h-3" />
                                {new Date(trip.closeDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                              </span>
                            )}
                            {trip.amount?.amountMicros ? (
                              <span className="text-xs font-mono font-medium" style={{ color: "oklch(0.35 0.09 145)" }}>
                                {formatCurrency(trip.amount.amountMicros, trip.amount.currencyCode)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", stageColor(trip.stage))}>
                        {stageLabel(trip.stage)}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-400">Your advisor is managing this request</span>
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

        {activeTab === "request" && (
          <div className="max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Submit a Travel Request</h2>
            <p className="text-sm text-gray-500 mb-6">Tell us about your dream trip and your advisor will craft a bespoke itinerary for you.</p>

            {submitted ? (
              <div className="bg-white rounded-xl border border-green-200 p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "oklch(0.55 0.15 145)" }} />
                <h3 className="text-lg font-semibold text-gray-900 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Request Submitted</h3>
                <p className="text-gray-500 text-sm mb-4">Your advisor will be in touch within 2 hours with initial ideas and questions.</p>
                <Button variant="outline" size="sm" onClick={() => { setSubmitted(false); setActiveTab("trips"); }}>
                  View My Trips
                </Button>
              </div>
            ) : (
              <form onSubmit={submitRequest} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">Destination</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      value={reqDestination}
                      onChange={e => setReqDestination(e.target.value)}
                      placeholder="e.g. Maldives, Japan, Tuscany…"
                      required
                      className="pl-9 border-gray-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">Preferred Travel Dates</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="date"
                      value={reqDates}
                      onChange={e => setReqDates(e.target.value)}
                      className="pl-9 border-gray-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">Approximate Budget (GBP)</label>
                  <Input
                    value={reqBudget}
                    onChange={e => setReqBudget(e.target.value)}
                    placeholder="e.g. 25000"
                    className="border-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">Additional Notes</label>
                  <Textarea
                    value={reqNotes}
                    onChange={e => setReqNotes(e.target.value)}
                    placeholder="Tell us about the occasion, group size, special requirements, or any experiences you'd love to include…"
                    rows={4}
                    className="border-gray-200 resize-none"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full gap-2 text-white"
                  style={{ background: "oklch(0.25 0.06 145)" }}
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : <><Send className="w-4 h-4" />Submit Request</>}
                </Button>
              </form>
            )}
          </div>
        )}

        {activeTab === "documents" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>Document Vault</h2>
            <div className="grid gap-3">
              {DOCUMENT_VAULT.map(doc => (
                <div key={doc.name} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl shrink-0">{doc.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{doc.name}</p>
                    <p className="text-xs text-gray-400">{doc.type} · Added {doc.date}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600 shrink-0">
                    <FileText className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4 text-center">Documents are securely stored and shared by your advisor.</p>
          </div>
        )}

        {activeTab === "messages" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>Messages with Your Advisor</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col" style={{ height: "480px" }}>
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold" style={{ background: "oklch(0.35 0.09 145)" }}>
                  S
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Sophia — Your Advisor</p>
                  <p className="text-xs text-green-500">● Online</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.map(msg => (
                  <div key={msg.id} className={cn("flex", msg.from === "client" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn("max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl text-sm")}
                      style={msg.from === "client"
                        ? { background: "oklch(0.25 0.06 145)", color: "white", borderBottomRightRadius: "4px" }
                        : { background: "oklch(0.96 0.01 80)", color: "oklch(0.2 0 0)", borderBottomLeftRadius: "4px" }}
                    >
                      <p>{msg.text}</p>
                      <p className={cn("text-xs mt-1", msg.from === "client" ? "text-white/60" : "text-gray-400")}>{msg.time}</p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                <Input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
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
