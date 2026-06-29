/**
 * Lanai AI — Pillar 6: Morning Briefing / Intelligence Engine
 */
import { useState } from "react";
import { Sunrise, RefreshCw, AlertTriangle, Lightbulb, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BriefingData {
  date?: string;
  greeting?: string;
  summary?: string;
  urgent_actions?: Array<{ client: string; action: string; priority: string }>;
  opportunities?: Array<{ client: string; opportunity: string; estimated_value: string }>;
  follow_ups?: Array<{ client: string; last_contact: string; suggestion: string }>;
  renewals?: Array<{ member: string; renewal_date: string; tier: string }>;
  market_insights?: string[];
  todays_focus?: string;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string,string> = { HIGH:"bg-red-50 text-red-700 border-red-200", MEDIUM:"bg-amber-50 text-amber-700 border-amber-200", LOW:"bg-blue-50 text-blue-700 border-blue-200" };
  return <span className={cn("px-2 py-0.5 rounded text-xs font-medium border", map[priority] ?? "bg-gray-50 text-gray-600 border-gray-200")}>{priority}</span>;
}

const DEMO_BRIEFING: BriefingData = {
  date: new Date().toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" }),
  greeting: "Good morning. Here is your Lanai Intelligence briefing.",
  summary: "You have 3 urgent client actions today, 2 high-value opportunities to pursue, and 1 membership renewal approaching. The week looks strong — focus on James Whitfield's Maldives enquiry first.",
  urgent_actions: [
    { client:"James Whitfield", action:"Respond to Maldives villa enquiry — received 2h ago via WhatsApp", priority:"HIGH" },
    { client:"Emma Thompson", action:"92 days since last contact — personal outreach required", priority:"HIGH" },
    { client:"Oliver Bennett", action:"Membership renewal in 14 days — schedule renewal call", priority:"MEDIUM" },
  ],
  opportunities: [
    { client:"The Harrington Family", opportunity:"Anniversary trip — Tuscany private villa, September 2025", estimated_value:"£28,000" },
    { client:"Priya Sharma", opportunity:"New York Fashion Week package — September 2025", estimated_value:"£15,000" },
  ],
  follow_ups: [
    { client:"Sarah Chen", last_contact:"3 days ago", suggestion:"Send Japan pre-departure pack and check visa status" },
    { client:"David Okafor", last_contact:"1 week ago", suggestion:"Confirm Maldives villa transfer arrangements" },
  ],
  renewals: [
    { member:"Oliver Bennett", renewal_date:"14 days", tier:"Gold" },
  ],
  market_insights: [
    "Japan cherry blossom season bookings are 40% up year-on-year — ideal upsell opportunity for clients who haven't visited",
    "Aman Kenya opens October 2025 — exclusive pre-launch rates available through Lanai supplier network",
    "Maldives peak season (Nov–Apr) booking window now open — several preferred villas already 60% reserved",
  ],
  todays_focus: "Prioritise James Whitfield's Maldives enquiry — high-value client, fast response expected. Then reach out to Emma Thompson with a curated destination suggestion to re-engage.",
};

export default function MorningBriefingPage() {
  const [loading,  setLoading]  = useState(false);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);
      const res = await fetch("/api/briefing/morning-briefing", { signal: controller.signal, method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ advisor_name: "Lanai Advisor", date: new Date().toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" }) }) });
      clearTimeout(timer);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBriefing(data.briefing ? (typeof data.briefing === 'string' ? JSON.parse(data.briefing) : data.briefing) : data);
      toast.success("Briefing generated");
    } catch {
      setBriefing(DEMO_BRIEFING);
      toast.info("Showing demo briefing (AI service warming up — try again in a moment)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sunrise className="w-5 h-5 text-primary" />
            <span className="text-xs font-medium text-primary uppercase tracking-widest">AI Pillar 6</span>
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily:"'Playfair Display', serif" }}>Morning Briefing</h1>
          <p className="text-muted-foreground mt-1">Your AI-generated daily digest — urgent actions, opportunities, and insights.</p>
        </div>
        <Button onClick={generate} disabled={loading} className="gap-2" style={{ background:"oklch(0.35 0.09 145)" }}>
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sunrise className="w-4 h-4" />}
          {loading ? "Generating…" : "Generate Briefing"}
        </Button>
      </div>
      <hr className="lanai-divider" />

      {!briefing && !loading && (
        <div className="lanai-card p-12 text-center text-muted-foreground">
          <Sunrise className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm">Click <strong>Generate Briefing</strong> to get your personalised morning digest from the Lanai Intelligence Engine.</p>
        </div>
      )}

      {loading && (
        <div className="lanai-card p-12 text-center">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Intelligence Engine is preparing your briefing…</p>
        </div>
      )}

      {briefing && !loading && (
        <div className="space-y-6 animate-fade-in">
          {/* Header card */}
          <div className="lanai-card p-6" style={{ background:"oklch(0.18 0.06 145)", color:"white" }}>
            <div className="text-xs opacity-60 mb-1 uppercase tracking-widest">{briefing.date}</div>
            <h2 className="text-xl font-semibold mb-2" style={{ fontFamily:"'Playfair Display', serif" }}>{briefing.greeting}</h2>
            <p className="text-sm opacity-80 leading-relaxed">{briefing.summary}</p>
          </div>

          {/* Today's Focus */}
          {briefing.todays_focus && (
            <div className="lanai-card p-4 border-l-4 flex gap-3" style={{ borderLeftColor:"oklch(0.72 0.12 75)" }}>
              <TrendingUp className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color:"oklch(0.72 0.12 75)" }} />
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Today's Focus</div>
                <p className="text-sm text-foreground">{briefing.todays_focus}</p>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Urgent Actions */}
            {briefing.urgent_actions && briefing.urgent_actions.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-red-600"><AlertTriangle className="w-4 h-4" />Urgent Actions ({briefing.urgent_actions.length})</h3>
                <div className="lanai-card divide-y divide-border">
                  {briefing.urgent_actions.map((a, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{a.client}</span>
                        <PriorityBadge priority={a.priority} />
                      </div>
                      <p className="text-xs text-muted-foreground">{a.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Opportunities */}
            {briefing.opportunities && briefing.opportunities.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-emerald-600"><Lightbulb className="w-4 h-4" />Opportunities ({briefing.opportunities.length})</h3>
                <div className="lanai-card divide-y divide-border">
                  {briefing.opportunities.map((o, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{o.client}</span>
                        <span className="text-xs font-mono font-semibold" style={{ color:"oklch(0.35 0.09 145)" }}>{o.estimated_value}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{o.opportunity}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-ups */}
            {briefing.follow_ups && briefing.follow_ups.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-blue-600"><Clock className="w-4 h-4" />Follow-ups</h3>
                <div className="lanai-card divide-y divide-border">
                  {briefing.follow_ups.map((f, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{f.client}</span>
                        <span className="text-xs text-muted-foreground">{f.last_contact}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{f.suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Renewals */}
            {briefing.renewals && briefing.renewals.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-purple-600"><CheckCircle2 className="w-4 h-4" />Renewals Due</h3>
                <div className="lanai-card divide-y divide-border">
                  {briefing.renewals.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">{r.member}</div>
                        <div className="text-xs text-muted-foreground">{r.tier} Membership</div>
                      </div>
                      <span className="text-xs text-amber-600 font-medium">Due in {r.renewal_date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Market Insights */}
          {briefing.market_insights && briefing.market_insights.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Market Intelligence</h3>
              <div className="lanai-card divide-y divide-border">
                {briefing.market_insights.map((insight, i) => (
                  <div key={i} className="px-4 py-3 flex gap-3">
                    <span className="text-primary mt-0.5 flex-shrink-0">✦</span>
                    <p className="text-sm text-foreground">{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
