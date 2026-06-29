/**
 * Lanai AI — Pillar 2: LLM Proposal Co-Pilot
 * Advisor fills in client details, AI generates a full proposal framework
 * Two modes:
 *   - Streaming (default): word-by-word markdown output via SSE
 *   - Structured: JSON proposal with expandable sections
 */
import { useState, useRef, useCallback } from "react";
import { Brain, Sparkles, Copy, RefreshCw, ChevronDown, ChevronUp, Zap, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TRIP_TYPES = ["Honeymoon","Family Holiday","Adventure","Cultural","Wellness & Spa","Safari","Cruise","City Break","Ski","Bespoke Multi-Destination"];
const BUDGETS    = ["£5,000–£10,000","£10,000–£25,000","£25,000–£50,000","£50,000–£100,000","£100,000+","Flexible / No Limit"];
const DURATIONS  = ["3–5 days","1 week","10 days","2 weeks","3 weeks","1 month+"];

interface ProposalResult {
  proposal_title?: string;
  executive_summary?: string;
  why_this_destination?: string;
  destination_rationale?: string;
  day_by_day?: Array<{ day: number | string; title: string; description: string; accommodation?: string }>;
  accommodation?: { name: string; description: string; why_chosen: string };
  accommodation_recommendations?: Array<{ name: string; type: string; why: string; est_cost: string }>;
  included_experiences?: string[];
  exclusive_experiences?: string[];
  estimated_investment?: string;
  next_steps?: string | string[];
  advisor_note?: string;
  personal_touches?: string[];
}

// Simple markdown renderer for streaming output
function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="prose prose-sm max-w-none text-foreground">
      {lines.map((line, i) => {
        if (line.startsWith("# ")) return <h1 key={i} className="text-xl font-bold mt-4 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} className="text-base font-semibold mt-4 mb-1.5 text-primary">{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-semibold mt-3 mb-1">{line.slice(4)}</h3>;
        if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="text-sm ml-4 list-disc text-foreground">{line.slice(2)}</li>;
        if (line.match(/^\d+\. /)) return <li key={i} className="text-sm ml-4 list-decimal text-foreground">{line.replace(/^\d+\. /, "")}</li>;
        if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="text-sm font-semibold">{line.slice(2, -2)}</p>;
        if (line === "") return <div key={i} className="h-2" />;
        // Inline bold
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className="text-sm leading-relaxed text-foreground">
            {parts.map((part, j) =>
              part.startsWith("**") && part.endsWith("**")
                ? <strong key={j}>{part.slice(2, -2)}</strong>
                : part
            )}
          </p>
        );
      })}
    </div>
  );
}

export default function ProposalEnginePage() {
  const [form, setForm] = useState({
    client_name: "", destination: "", trip_type: "", duration: "",
    budget: "", party_size: "2", special_requests: "", known_preferences: "",
    occasion: ""
  });
  const [mode, setMode] = useState<"stream" | "structured">("stream");
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [proposal, setProposal] = useState<ProposalResult | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ summary: true, dest: true, days: true });
  const abortRef = useRef<AbortController | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const generateStreaming = useCallback(async () => {
    setLoading(true);
    setStreamText("");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/proposals/generate-proposal-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: form.client_name,
          destination: form.destination,
          travel_type: form.trip_type || "luxury travel",
          budget: form.budget,
          dates: form.duration,
          preferences: form.known_preferences,
          special_requirements: form.special_requests,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") { setLoading(false); return; }
            try {
              const { token, error } = JSON.parse(payload);
              if (error) { toast.error(`AI error: ${error}`); break; }
              if (token) setStreamText(prev => prev + token);
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("Streaming failed — AI service may be warming up. Try again.");
      // Show a demo fallback
      setStreamText(`# A Bespoke ${form.destination} Experience\n\n## Executive Summary\n\nWe have curated an exceptional luxury journey to ${form.destination} tailored exclusively for ${form.client_name}. This proposal combines the finest accommodations, private experiences, and curated moments that define the Lanai standard of travel.\n\n## Why ${form.destination}\n\n${form.destination} offers an unparalleled combination of luxury, culture, and natural beauty — a destination that rewards the discerning traveller with experiences unavailable to the ordinary visitor.\n\n## Your Advisor's Note\n\nThis proposal has been personally crafted for you. Every detail has been considered, and we look forward to bringing your dream journey to life.`);
    } finally {
      setLoading(false);
    }
  }, [form]);

  const generateStructured = useCallback(async () => {
    setLoading(true);
    setProposal(null);
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = setTimeout(() => controller.abort(), 180000);
      const res = await fetch("/api/proposals/generate-proposal", {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: form.client_name,
          destination: form.destination,
          travel_type: form.trip_type || "luxury travel",
          budget: form.budget,
          dates: form.duration,
          preferences: form.known_preferences,
          special_requirements: form.special_requests,
        }),
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("Service unavailable");
      const data = await res.json();
      setProposal(data);
      toast.success("Proposal generated!");
    } catch {
      setProposal({
        proposal_title: `A Private ${form.destination} Experience`,
        executive_summary: `A bespoke luxury journey to ${form.destination} has been crafted exclusively for ${form.client_name}.`,
        why_this_destination: `${form.destination} offers an unparalleled combination of luxury, culture, and natural beauty.`,
        accommodation: { name: "Private Villa / Boutique Resort", description: "Handpicked for privacy and exceptional service.", why_chosen: "Matches your preference for intimate, exclusive settings." },
        day_by_day: [
          { day: 1, title: "Arrival & Welcome", description: "Private transfer from airport, welcome champagne, check-in to your exclusive villa." },
          { day: 2, title: "Exploration & Discovery", description: "Private guided tour of key landmarks, exclusive access to cultural sites." },
          { day: 3, title: "Leisure & Departure", description: "Morning at leisure, spa treatment, private farewell dinner." },
        ],
        included_experiences: ["Private airport transfers", "Daily gourmet breakfast", "Curated excursions", "24/7 Lanai concierge"],
        estimated_investment: form.budget || "To be confirmed",
        next_steps: "Please review and let us know if you'd like to adjust any element.",
        advisor_note: `This proposal has been personally curated for ${form.client_name}.`,
      });
      toast.info("Showing demo proposal (AI warming up)");
    } finally {
      setLoading(false);
    }
  }, [form]);

  const generate = () => {
    if (!form.client_name || !form.destination) {
      toast.error("Please enter at least a client name and destination.");
      return;
    }
    if (mode === "stream") generateStreaming();
    else generateStructured();
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const copyOutput = () => {
    const text = mode === "stream" ? streamText : JSON.stringify(proposal, null, 2);
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const toggle = (k: string) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const hasOutput = mode === "stream" ? streamText.length > 0 : proposal !== null;

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-5 h-5 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-widest">AI Pillar 2</span>
        </div>
        <h1 className="text-3xl font-bold" style={{ fontFamily:"'Playfair Display', serif" }}>Proposal Co-Pilot</h1>
        <p className="text-muted-foreground mt-1">Describe the client's dream trip. The AI generates a full proposal — you personalise and present.</p>
      </div>
      <hr className="lanai-divider" />

      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("stream")}
          className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all", mode === "stream" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50")}
        >
          <Zap className="w-4 h-4" />Streaming (live output)
        </button>
        <button
          onClick={() => setMode("structured")}
          className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all", mode === "structured" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50")}
        >
          <FileText className="w-4 h-4" />Structured (sections)
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Input Form */}
        <div className="space-y-5">
          <h2 className="text-lg font-semibold" style={{ fontFamily:"'Playfair Display', serif" }}>Trip Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Client Name *</label>
              <Input placeholder="e.g. The Harrington Family" value={form.client_name} onChange={e => set("client_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Destination *</label>
              <Input placeholder="e.g. Japan, Maldives, Kenya" value={form.destination} onChange={e => set("destination", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Trip Type</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.trip_type} onChange={e => set("trip_type", e.target.value)}>
                <option value="">Select type…</option>
                {TRIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Duration</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.duration} onChange={e => set("duration", e.target.value)}>
                <option value="">Select duration…</option>
                {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Budget Range</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.budget} onChange={e => set("budget", e.target.value)}>
                <option value="">Select budget…</option>
                {BUDGETS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Party Size</label>
              <Input type="number" min="1" max="20" value={form.party_size} onChange={e => set("party_size", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Special Occasion</label>
            <Input placeholder="e.g. 25th wedding anniversary, 50th birthday" value={form.occasion} onChange={e => set("occasion", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Known Preferences</label>
            <Textarea rows={2} placeholder="e.g. Loves private villas, no group tours, vegetarian…" value={form.known_preferences} onChange={e => set("known_preferences", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Special Requests</label>
            <Textarea rows={2} placeholder="e.g. Surprise element, specific experiences, accessibility needs…" value={form.special_requests} onChange={e => set("special_requests", e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button onClick={generate} disabled={loading} className="flex-1 gap-2" style={{ background:"oklch(0.35 0.09 145)" }}>
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? (mode === "stream" ? "Generating…" : "Generating proposal…") : "Generate Proposal"}
            </Button>
            {loading && (
              <Button variant="outline" onClick={stopGeneration} className="shrink-0">Stop</Button>
            )}
          </div>

          {mode === "stream" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-amber-500" />
              Streaming mode: proposal appears word-by-word as the AI writes it
            </p>
          )}
        </div>

        {/* Output Panel */}
        <div className="space-y-4">
          {!hasOutput && !loading && (
            <div className="lanai-card p-8 text-center text-muted-foreground">
              <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Fill in the trip details and click <strong>Generate Proposal</strong> to create a personalised luxury travel proposal.</p>
              {mode === "stream" && <p className="text-xs mt-2 text-muted-foreground/70">The proposal will appear word-by-word as the AI writes it.</p>}
            </div>
          )}

          {/* Streaming output */}
          {mode === "stream" && (streamText || loading) && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold" style={{ fontFamily:"'Playfair Display', serif" }}>
                  Generated Proposal
                  {loading && <span className="ml-2 inline-block w-1.5 h-4 bg-primary animate-pulse rounded-sm" />}
                </h2>
                {streamText && (
                  <Button variant="outline" size="sm" onClick={copyOutput} className="gap-1">
                    <Copy className="w-3.5 h-3.5" />Copy
                  </Button>
                )}
              </div>
              <div className="lanai-card p-5 min-h-48 overflow-auto max-h-[600px]">
                {streamText ? (
                  <MarkdownRenderer text={streamText} />
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Connecting to AI…
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Structured output */}
          {mode === "structured" && loading && (
            <div className="lanai-card p-8 text-center">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">The AI is crafting your proposal…</p>
              <p className="text-xs text-muted-foreground mt-1">This may take 30–60 seconds with local Ollama</p>
            </div>
          )}

          {mode === "structured" && proposal && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold" style={{ fontFamily:"'Playfair Display', serif" }}>
                  {proposal.proposal_title || "Generated Proposal"}
                </h2>
                <Button variant="outline" size="sm" onClick={copyOutput} className="gap-1">
                  <Copy className="w-3.5 h-3.5" />Copy JSON
                </Button>
              </div>

              <ProposalSection title="Executive Summary" expanded={expanded["summary"]} onToggle={() => toggle("summary")}>
                <p className="text-sm text-foreground leading-relaxed">{proposal.executive_summary}</p>
              </ProposalSection>

              {(proposal.why_this_destination || proposal.destination_rationale) && (
                <ProposalSection title="Why This Destination" expanded={expanded["dest"]} onToggle={() => toggle("dest")}>
                  <p className="text-sm text-foreground leading-relaxed">{proposal.why_this_destination || proposal.destination_rationale}</p>
                </ProposalSection>
              )}

              {proposal.accommodation && (
                <ProposalSection title="Accommodation" expanded={expanded["accom"]} onToggle={() => toggle("accom")}>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{proposal.accommodation.name}</div>
                    <div className="text-xs text-muted-foreground">{proposal.accommodation.description}</div>
                    <div className="text-xs text-muted-foreground italic">Why chosen: {proposal.accommodation.why_chosen}</div>
                  </div>
                </ProposalSection>
              )}

              {proposal.day_by_day?.length ? (
                <ProposalSection title={`Itinerary (${proposal.day_by_day.length} days)`} expanded={expanded["days"]} onToggle={() => toggle("days")}>
                  <div className="space-y-3">
                    {proposal.day_by_day.map((day, i) => (
                      <div key={i} className="border-l-2 border-primary/30 pl-3">
                        <div className="text-xs font-mono text-primary font-medium">Day {day.day}</div>
                        <div className="text-sm font-medium text-foreground">{day.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{day.description}</div>
                      </div>
                    ))}
                  </div>
                </ProposalSection>
              ) : null}

              {(proposal.included_experiences || proposal.exclusive_experiences)?.length ? (
                <ProposalSection title="Included Experiences" expanded={expanded["exp"]} onToggle={() => toggle("exp")}>
                  <ul className="space-y-1">
                    {(proposal.included_experiences || proposal.exclusive_experiences || []).map((e, i) => (
                      <li key={i} className="text-sm text-foreground flex items-start gap-2"><span className="text-primary mt-0.5">✦</span>{e}</li>
                    ))}
                  </ul>
                </ProposalSection>
              ) : null}

              <div className="lanai-card p-4 border-l-4" style={{ borderLeftColor:"oklch(0.72 0.12 75)" }}>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Estimated Investment</div>
                <div className="text-xl font-bold text-foreground">{proposal.estimated_investment || "To be confirmed"}</div>
              </div>

              {proposal.advisor_note && (
                <div className="lanai-card p-4 bg-primary/5">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Advisor's Note</div>
                  <p className="text-sm text-foreground italic">{proposal.advisor_note}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProposalSection({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="lanai-card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && <div className="px-4 pb-4 border-t border-border pt-3">{children}</div>}
    </div>
  );
}
