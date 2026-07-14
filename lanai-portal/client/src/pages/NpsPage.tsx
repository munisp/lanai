import {
  BarChart2, Star, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle, MessageSquare, RefreshCw
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── NPS Score Gauge ──────────────────────────────────────────────────────────
function NpsGauge({ score }: { score: number }) {
  const color = score >= 50 ? "text-emerald-600" : score >= 0 ? "text-amber-500" : "text-red-500";
  const label = score >= 50 ? "Excellent" : score >= 0 ? "Good" : "Needs Improvement";
  return (
    <div className="text-center">
      <div className={cn("text-6xl font-bold", color)} style={{ fontFamily: "'Playfair Display', serif" }}>
        {score}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">Net Promoter Score</div>
    </div>
  );
}

// ─── Response Row ─────────────────────────────────────────────────────────────
function NpsRow({ response }: {
  response: {
    id: number; score: number; category: string; feedback?: string | null;
    followUpRequired?: boolean | null; followUpCompleted?: boolean | null; createdAt: Date;
  };
}) {
  const categoryColors: Record<string, string> = {
    promoter: "bg-emerald-50 text-emerald-700",
    passive: "bg-amber-50 text-amber-700",
    detractor: "bg-red-50 text-red-700",
  };
  const CategoryIcon = response.category === "promoter" ? TrendingUp :
    response.category === "passive" ? Minus : TrendingDown;

  return (
    <div className="flex items-start gap-4 p-4 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0",
        response.score >= 9 ? "bg-emerald-100 text-emerald-700" :
        response.score >= 7 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
      )}>
        {response.score}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium", categoryColors[response.category])}>
            <CategoryIcon className="w-3 h-3" />
            {response.category.charAt(0).toUpperCase() + response.category.slice(1)}
          </span>
          {response.followUpRequired && !response.followUpCompleted && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
              <AlertTriangle className="w-3 h-3" /> Follow-up needed
            </span>
          )}
          {response.followUpCompleted && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 font-medium">
              <CheckCircle className="w-3 h-3" /> Resolved
            </span>
          )}
        </div>
        {response.feedback && (
          <p className="text-sm text-foreground mt-1.5 line-clamp-2">{response.feedback}</p>
        )}
        <div className="text-xs text-muted-foreground mt-1">
          {new Date(response.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NpsPage() {
  const { data: summary, isLoading: summaryLoading, refetch } = trpc.nps.summary.useQuery();
  const { data: responses, isLoading: responsesLoading } = trpc.nps.list.useQuery({});
  const { data: detractors } = trpc.nps.detractors.useQuery();

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><BarChart2 className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Net Promoter Score
          </h1>
          <p className="text-muted-foreground mt-1">Member satisfaction tracking and follow-up management</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>
      <hr className="lanai-divider" />

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : summary && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* NPS Gauge */}
          <div className="lanai-card p-6 flex items-center justify-center">
            <NpsGauge score={Math.round(summary.npsScore ?? 0)} />
          </div>
          {/* Promoters */}
          <div className="lanai-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">Promoters</span>
            </div>
            <div className="text-3xl font-bold text-emerald-600" style={{ fontFamily: "'Playfair Display', serif" }}>
              {summary.promoters}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Score 9–10</div>
          </div>
          {/* Passives */}
          <div className="lanai-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Minus className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-700">Passives</span>
            </div>
            <div className="text-3xl font-bold text-amber-500" style={{ fontFamily: "'Playfair Display', serif" }}>
              {summary.passives}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Score 7–8</div>
          </div>
          {/* Detractors */}
          <div className="lanai-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium text-red-700">Detractors</span>
            </div>
            <div className="text-3xl font-bold text-red-500" style={{ fontFamily: "'Playfair Display', serif" }}>
              {summary.detractors}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Score 0–6</div>
          </div>
        </div>
      )}

      {/* Detractors Needing Follow-up */}
      {detractors && detractors.length > 0 && (
        <div className="lanai-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-red-700">Detractors Requiring Follow-up</h2>
            <span className="ml-auto text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {detractors.length} pending
            </span>
          </div>
          <div className="divide-y divide-border/50">
            {detractors.map(r => (
              <NpsRow key={r.id} response={r as {
                id: number; score: number; category: string; feedback?: string | null;
                followUpRequired?: boolean | null; followUpCompleted?: boolean | null; createdAt: Date;
              }} />
            ))}
          </div>
        </div>
      )}

      {/* All Responses */}
      <div className="lanai-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">All NPS Responses</h2>
          <span className="ml-auto text-xs text-muted-foreground">{responses?.length ?? 0} responses</span>
        </div>
        {responsesLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : responses && responses.length > 0 ? (
          <div>
            {responses.map(r => (
              <NpsRow key={r.id} response={r as {
                id: number; score: number; category: string; feedback?: string | null;
                followUpRequired?: boolean | null; followUpCompleted?: boolean | null; createdAt: Date;
              }} />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-muted-foreground">
            <Star className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No NPS responses yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
