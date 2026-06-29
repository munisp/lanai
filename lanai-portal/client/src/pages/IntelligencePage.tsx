/**
 * Lanai AI — Pillar 3: Client Intelligence Engine
 */
import { useState } from "react";
import { Brain, TrendingUp, AlertTriangle, Lightbulb, RefreshCw, User, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DEMO_CLIENTS = ["James Whitfield","Sarah Chen","Oliver Bennett","Emma Thompson","The Harrington Family","David Okafor","Priya Sharma"];

interface ProfileResult {
  preference_profile?: { destinations?: string; travel_style?: string; accommodation_type?: string; dining?: string; activities?: string };
  engagement_score?: number;
  ltv_estimate?: string;
  churn_risk?: string;
  next_trip_prediction?: string;
  opportunity_flags?: string[];
  advisor_talking_points?: string[];
}

interface ChurnResult {
  risk_level?: string;
  primary_reason?: string;
  recommended_action?: string;
  message_suggestion?: string;
  urgency_score?: number;
}

interface OpportunityResult {
  opportunity_title?: string;
  suggested_destination?: string;
  suggested_timing?: string;
  estimated_value?: number;
  why_perfect_for_client?: string;
  experience_highlights?: string[];
  outreach_message?: string;
}

function RiskBadge({ level }: { level?: string }) {
  const map: Record<string,string> = { LOW:"bg-emerald-50 text-emerald-700", MEDIUM:"bg-amber-50 text-amber-700", HIGH:"bg-orange-50 text-orange-700", CRITICAL:"bg-red-50 text-red-700" };
  if (!level) return null;
  return <span className={cn("px-2 py-0.5 rounded text-xs font-semibold", map[level] ?? "bg-gray-50 text-gray-600")}>{level}</span>;
}

function ScoreBar({ value, max = 10 }: { value?: number; max?: number }) {
  if (value === undefined) return null;
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width:`${pct}%`, background:"oklch(0.35 0.09 145)" }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{value}/{max}</span>
    </div>
  );
}

export default function IntelligencePage() {
  const [clientName, setClientName] = useState("");
  const [activeTab,  setActiveTab]  = useState<"profile"|"churn"|"opportunity">("profile");
  const [loading,    setLoading]    = useState(false);
  const [profile,    setProfile]    = useState<ProfileResult | null>(null);
  const [churn,      setChurn]      = useState<ChurnResult | null>(null);
  const [opportunity,setOpportunity]= useState<OpportunityResult | null>(null);

  const run = async () => {
    if (!clientName) { toast.error("Enter a client name"); return; }
    setLoading(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);
      const opts = (body: object) => ({ signal: controller.signal, method:"POST" as const, headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      if (activeTab === "profile") {
        const res = await fetch("/api/intelligence/client-profile", opts({ client_name: clientName }));
        clearTimeout(timer);
        if (!res.ok) throw new Error();
        setProfile(await res.json());
      } else if (activeTab === "churn") {
        const res = await fetch("/api/intelligence/churn-risk", opts({ client_name: clientName, last_contact_days: 65, last_booking_days: 280, total_bookings: 3, total_value: 28000 }));
        clearTimeout(timer);
        if (!res.ok) throw new Error();
        setChurn(await res.json());
      } else {
        const res = await fetch("/api/intelligence/opportunity-spot", opts({ client_name: clientName, last_trip: "Maldives 2024", preferences: "luxury, privacy, nature" }));
        clearTimeout(timer);
        if (!res.ok) throw new Error();
        setOpportunity(await res.json());
      }
      toast.success("Analysis complete");
    } catch {
      if (activeTab === "profile") setProfile(DEMO_PROFILE);
      else if (activeTab === "churn") setChurn(DEMO_CHURN);
      else setOpportunity(DEMO_OPPORTUNITY);
      toast.info("Showing demo data (AI warming up — try again in a moment)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-5 h-5 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-widest">AI Pillar 3</span>
        </div>
        <h1 className="text-3xl font-bold" style={{ fontFamily:"'Playfair Display', serif" }}>Client Intelligence</h1>
        <p className="text-muted-foreground mt-1">AI-powered preference inference, churn risk scoring, and proactive opportunity spotting.</p>
      </div>
      <hr className="lanai-divider" />

      {/* Client selector */}
      <div className="lanai-card p-5 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium">Client Name</label>
            <Input list="clients" placeholder="Type or select a client…" value={clientName} onChange={e => setClientName(e.target.value)} />
            <datalist id="clients">{DEMO_CLIENTS.map(c => <option key={c} value={c} />)}</datalist>
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex gap-2 flex-wrap">
          {([["profile","Profile Analysis",TrendingUp],["churn","Churn Risk",AlertTriangle],["opportunity","Opportunity",Lightbulb]] as const).map(([tab, label, Icon]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors", activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        <Button onClick={run} disabled={loading} className="gap-2" style={{ background:"oklch(0.35 0.09 145)" }}>
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {loading ? "Analysing…" : "Run Analysis"}
        </Button>
      </div>

      {/* Results */}
      {loading && <div className="lanai-card p-8 text-center"><RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" /><p className="text-sm text-muted-foreground">AI is analysing {clientName}…</p></div>}

      {!loading && activeTab === "profile" && profile && (
        <div className="grid lg:grid-cols-2 gap-4 animate-fade-in">
          <div className="lanai-card p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><User className="w-4 h-4 text-primary" />Preference Profile</h3>
            {profile.preference_profile && Object.entries(profile.preference_profile).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm border-b border-border pb-2 last:border-0">
                <span className="text-muted-foreground capitalize">{k.replace(/_/g," ")}</span>
                <span className="font-medium text-foreground text-right max-w-[60%]">{v}</span>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="lanai-card p-5 space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><Star className="w-4 h-4 text-primary" />Scores</h3>
              <div className="space-y-2">
                <div><div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Engagement</span><span className="font-medium">{profile.engagement_score}/10</span></div><ScoreBar value={profile.engagement_score} /></div>
                <div className="flex justify-between text-sm py-1 border-t border-border"><span className="text-muted-foreground">LTV Estimate</span><span className="font-semibold text-foreground">{profile.ltv_estimate}</span></div>
                <div className="flex justify-between text-sm py-1 border-t border-border"><span className="text-muted-foreground">Churn Risk</span><RiskBadge level={profile.churn_risk} /></div>
              </div>
            </div>
            {profile.next_trip_prediction && (
              <div className="lanai-card p-4 border-l-4" style={{ borderLeftColor:"oklch(0.72 0.12 75)" }}>
                <div className="text-xs text-muted-foreground mb-1">Next Trip Prediction</div>
                <p className="text-sm text-foreground">{profile.next_trip_prediction}</p>
              </div>
            )}
            {profile.advisor_talking_points && profile.advisor_talking_points.length > 0 && (
              <div className="lanai-card p-4">
                <div className="text-sm font-semibold mb-2">Advisor Talking Points</div>
                <ol className="space-y-1">{profile.advisor_talking_points.map((t,i) => <li key={i} className="text-xs text-foreground flex gap-2"><span className="text-primary font-mono">{i+1}.</span>{t}</li>)}</ol>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && activeTab === "churn" && churn && (
        <div className="lanai-card p-6 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg" style={{ fontFamily:"'Playfair Display', serif" }}>Churn Risk Assessment — {clientName}</h3>
            <RiskBadge level={churn.risk_level} />
          </div>
          {churn.urgency_score !== undefined && <div><div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Urgency Score</span><span className="font-medium">{churn.urgency_score}/10</span></div><ScoreBar value={churn.urgency_score} /></div>}
          <div className="grid grid-cols-2 gap-4">
            <div><div className="text-xs text-muted-foreground mb-1">Primary Reason</div><p className="text-sm text-foreground">{churn.primary_reason}</p></div>
            <div><div className="text-xs text-muted-foreground mb-1">Recommended Action</div><p className="text-sm text-foreground">{churn.recommended_action}</p></div>
          </div>
          {churn.message_suggestion && (
            <div className="bg-muted rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-2 uppercase tracking-widest">Suggested Outreach Message</div>
              <p className="text-sm text-foreground italic">"{churn.message_suggestion}"</p>
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === "opportunity" && opportunity && (
        <div className="lanai-card p-6 space-y-4 animate-fade-in">
          <h3 className="font-semibold text-lg" style={{ fontFamily:"'Playfair Display', serif" }}>{opportunity.opportunity_title}</h3>
          <div className="grid grid-cols-3 gap-4">
            <div><div className="text-xs text-muted-foreground mb-1">Destination</div><div className="text-sm font-medium">{opportunity.suggested_destination}</div></div>
            <div><div className="text-xs text-muted-foreground mb-1">Timing</div><div className="text-sm font-medium">{opportunity.suggested_timing}</div></div>
            <div><div className="text-xs text-muted-foreground mb-1">Est. Value</div><div className="text-sm font-semibold" style={{ color:"oklch(0.35 0.09 145)" }}>£{opportunity.estimated_value?.toLocaleString()}</div></div>
          </div>
          <p className="text-sm text-foreground">{opportunity.why_perfect_for_client}</p>
          {opportunity.experience_highlights && (
            <div><div className="text-xs text-muted-foreground mb-2">Experience Highlights</div><ul className="space-y-1">{opportunity.experience_highlights.map((h,i) => <li key={i} className="text-sm text-foreground flex gap-2"><span className="text-primary">✦</span>{h}</li>)}</ul></div>
          )}
          {opportunity.outreach_message && (
            <div className="bg-muted rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-2 uppercase tracking-widest">Suggested Outreach</div>
              <p className="text-sm text-foreground italic">"{opportunity.outreach_message}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DEMO_PROFILE: ProfileResult = {
  preference_profile: { destinations:"Japan, Maldives, East Africa", travel_style:"Ultra-luxury, private, immersive", accommodation_type:"Private villas and boutique resorts", dining:"Fine dining, local experiences", activities:"Cultural, nature, wellness" },
  engagement_score: 8, ltv_estimate: "£85,000+", churn_risk: "LOW",
  next_trip_prediction: "Safari or wellness retreat, likely Q4 2025",
  opportunity_flags: ["Anniversary coming up — perfect for a surprise trip", "Has not tried East Africa yet", "Wellness interest growing"],
  advisor_talking_points: ["Ask about the upcoming anniversary", "Mention the new Aman Kenya property", "Share the new wellness retreat in Bali"],
};
const DEMO_CHURN: ChurnResult = {
  risk_level: "MEDIUM", primary_reason: "65 days since last contact, no upcoming bookings", recommended_action: "Personal call within 48 hours + curated destination suggestion",
  message_suggestion: "I was thinking of you this week — I've just come across something that feels perfectly you. Would love to share it over a quick call?",
  urgency_score: 6,
};
const DEMO_OPPORTUNITY: OpportunityResult = {
  opportunity_title: "Private Safari — Kenya Exclusive Camp", suggested_destination: "Kenya, East Africa", suggested_timing: "October–November 2025 (peak season)",
  estimated_value: 32000, why_perfect_for_client: "Based on their love of nature, privacy, and immersive experiences, a private safari camp in Kenya would be a natural next chapter after their Maldives experience.",
  experience_highlights: ["Exclusive private camp — 6 tents maximum", "Daily game drives with expert guide", "Hot air balloon over the Masai Mara", "Sundowner cocktails on the plains"],
  outreach_message: "I've been holding something back for the right client — a private camp in Kenya that opens in October. Only 6 tents, completely exclusive. I immediately thought of you.",
};
