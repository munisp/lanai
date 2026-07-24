/**
 * Lanai — Travel Requests (Opportunities) page
 * Data: Live from Twenty CRM via /crm GraphQL proxy
 */
import { useState, useEffect, useCallback } from "react";
import { Plane, Search, Calendar, RefreshCw, AlertCircle, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchOpportunities, stageLabel, stageColor, timeAgo, formatCurrency, type CRMOpportunity } from "@/lib/crmApi";
import { trpc } from "@/lib/trpc";

const STAGES = ["ALL", "NEW", "SCREENING", "MEETING", "PROPOSAL", "CUSTOMER", "CLOSED_WON", "CLOSED_LOST"];

export default function TravelRequestsPage() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: envConfig } = trpc.system.env.useQuery();

  const load = useCallback(async () => {
    if (!envConfig?.crmEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOpportunities(200);
      setOpportunities(res.opportunities);
      setTotalCount(res.totalCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load travel requests");
    } finally {
      setLoading(false);
    }
  }, [envConfig?.crmEnabled]);

  useEffect(() => { if (envConfig !== undefined) load(); }, [load, envConfig]);

  const filtered = opportunities.filter(o => {
    const q = search.toLowerCase();
    const name = o.name.toLowerCase();
    const contact = o.pointOfContact ? `${o.pointOfContact.name.firstName} ${o.pointOfContact.name.lastName}`.toLowerCase() : "";
    const matchesSearch = !q || name.includes(q) || contact.includes(q);
    const matchesStage = stageFilter === "ALL" || o.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  // Stage summary counts
  const stageCounts = STAGES.slice(1).reduce<Record<string, number>>((acc, s) => {
    acc[s] = opportunities.filter(o => o.stage === s).length;
    return acc;
  }, {});

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><Plane className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily:"'Playfair Display', serif" }}>Travel Requests</h1>
          <p className="text-muted-foreground mt-1">
            {loading ? "Loading pipeline…" : `${totalCount.toLocaleString()} requests across the pipeline`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>
      <hr className="lanai-divider" />

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>CRM error: {error}. <button onClick={load} className="underline">Retry</button></span>
        </div>
      )}

      {/* Stage filter pills */}
      <div className="flex flex-wrap gap-2">
        {STAGES.map(s => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-all",
              stageFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/50"
            )}
          >
            {s === "ALL" ? "All" : stageLabel(s)}
            {s !== "ALL" && !loading && <span className="ml-1 opacity-60">({stageCounts[s] ?? 0})</span>}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name or client…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {(search || stageFilter !== "ALL") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStageFilter("ALL"); }} className="gap-1.5 text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />Clear filters
          </Button>
        )}
      </div>

      <div className="lanai-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Request</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden md:table-cell">Client</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Value</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Close Date</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Stage</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden md:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-48" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                  <td className="px-4 py-3"><div className="h-5 bg-muted rounded animate-pulse w-20" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {search || stageFilter !== "ALL" ? "No matching travel requests" : "No travel requests found"}
                </td>
              </tr>
            ) : filtered.map(opp => (
              <tr key={opp.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground max-w-xs">
                  <div className="flex items-center gap-2">
                    <Plane className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{opp.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">
                  {opp.pointOfContact
                    ? `${opp.pointOfContact.name.firstName} ${opp.pointOfContact.name.lastName}`
                    : <span className="italic text-xs">Unassigned</span>}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs font-mono font-medium" style={{ color:"oklch(0.35 0.09 145)" }}>
                  {opp.amount?.amountMicros ? formatCurrency(opp.amount.amountMicros, opp.amount.currencyCode) : "—"}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {opp.closeDate ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(opp.closeDate).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={cn("px-2 py-0.5 rounded text-xs font-medium", stageColor(opp.stage))}>
                    {stageLabel(opp.stage)}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{timeAgo(opp.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            Showing {filtered.length} of {totalCount.toLocaleString()} travel requests
          </div>
        )}
      </div>
    </div>
  );
}
