import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  Lightbulb,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AnalysisTab = "profile" | "churn" | "opportunity";
type InferenceResponse = {
  output?: string;
  structured?: Record<string, unknown>;
  model?: string;
  provider?: string;
  latency_ms?: number;
  request_id?: string;
};

function StructuredResult({ result }: { result: InferenceResponse }) {
  if (result.structured) {
    return (
      <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs leading-relaxed text-foreground">
        {JSON.stringify(result.structured, null, 2)}
      </pre>
    );
  }
  return (
    <div className="whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm leading-relaxed text-foreground">
      {result.output}
    </div>
  );
}

export default function IntelligencePage() {
  const [memberId, setMemberId] = useState("");
  const [activeTab, setActiveTab] = useState<AnalysisTab>("profile");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InferenceResponse | null>(null);
  const {
    data: members,
    isLoading: membersLoading,
    error: membersError,
  } = trpc.members.list.useQuery();

  const selectedMember = members?.find(
    (member) => String(member.id) === memberId,
  );

  const run = async () => {
    if (!memberId) {
      toast.error("Select a persisted member before requesting AI analysis.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const paths: Record<AnalysisTab, string> = {
        profile: "/api/intelligence/client-profile",
        churn: "/api/intelligence/churn-risk",
        opportunity: "/api/intelligence/opportunity-spot",
      };
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 180_000);
      const response = await fetch(paths[activeTab], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: Number(memberId) }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as InferenceResponse;
      if (!payload.output && !payload.structured)
        throw new Error("The inference service returned no usable analysis.");
      setResult(payload);
      toast.success("Analysis completed using persisted member data.");
    } catch (error) {
      setResult(null);
      toast.error(
        error instanceof Error
          ? `Analysis failed: ${error.message}`
          : "Analysis failed. No substitute result was created.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-5 h-5 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-widest">
            AI Pillar 3
          </span>
        </div>
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Client Intelligence
        </h1>
        <p className="text-muted-foreground mt-1">
          Analysis uses the selected member’s persisted profile, requests,
          bookings, and proposals. It does not generate demo data.
        </p>
      </div>
      <hr className="lanai-divider" />

      <div className="lanai-card p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="intelligence-member">
            Member
          </label>
          <select
            id="intelligence-member"
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            disabled={membersLoading}
          >
            <option value="">
              {membersLoading ? "Loading members…" : "Select a member…"}
            </option>
            {members
              ?.filter((member) => member.active)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} — {member.tier}
                </option>
              ))}
          </select>
          {membersError && (
            <p className="text-sm text-destructive">
              Unable to load persisted members: {membersError.message}
            </p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {(
            [
              ["profile", "Profile Analysis", TrendingUp],
              ["churn", "Churn Risk", AlertTriangle],
              ["opportunity", "Opportunity", Lightbulb],
            ] as const
          ).map(([tab, label, Icon]) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setResult(null);
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <Button
          onClick={run}
          disabled={loading || !memberId}
          className="gap-2"
          style={{ background: "oklch(0.35 0.09 145)" }}
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Brain className="w-4 h-4" />
          )}
          {loading ? "Analysing…" : "Run Analysis"}
        </Button>
      </div>

      {loading && (
        <div className="lanai-card p-8 text-center">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            AI is analysing {selectedMember?.name ?? "the selected member"}{" "}
            using recorded platform data…
          </p>
        </div>
      )}

      {!loading && result && (
        <div className="lanai-card p-6 space-y-4 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              className="text-lg font-semibold"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {activeTab === "profile"
                ? "Profile Analysis"
                : activeTab === "churn"
                  ? "Churn Risk Assessment"
                  : "Opportunity Analysis"}{" "}
              — {selectedMember?.name}
            </h2>
            <span className="text-xs text-muted-foreground">
              {result.provider ?? "local"} ·{" "}
              {result.model ?? "configured model"}
              {result.latency_ms ? ` · ${result.latency_ms} ms` : ""}
            </span>
          </div>
          <StructuredResult result={result} />
        </div>
      )}
    </div>
  );
}
