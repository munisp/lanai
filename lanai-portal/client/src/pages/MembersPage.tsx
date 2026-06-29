/**
 * Lanai — Members page
 * Data: Live from Twenty CRM — CUSTOMER stage opportunities as membership proxy
 */
import { useState, useEffect, useCallback } from "react";
import { Crown, Search, Star, Calendar, RefreshCw, AlertCircle, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchOpportunities, formatCurrency, timeAgo, type CRMOpportunity } from "@/lib/crmApi";

// Assign tier based on pipeline value
function getTier(amountMicros: number): "Platinum" | "Gold" | "Silver" {
  const gbp = amountMicros / 1_000_000;
  if (gbp >= 50000) return "Platinum";
  if (gbp >= 20000) return "Gold";
  return "Silver";
}

const TIER_COLORS: Record<string, string> = {
  Platinum: "bg-purple-50 text-purple-700",
  Gold: "bg-amber-50 text-amber-700",
  Silver: "bg-gray-50 text-gray-600",
};

export default function MembersPage() {
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<CRMOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOpportunities(200);
      // Use CUSTOMER + CLOSED_WON as "members" proxy
      const memberOpps = res.opportunities.filter(o => o.stage === "CUSTOMER" || o.stage === "CLOSED_WON");
      setMembers(memberOpps);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    const name = m.name.toLowerCase();
    const contact = m.pointOfContact ? `${m.pointOfContact.name.firstName} ${m.pointOfContact.name.lastName}`.toLowerCase() : "";
    return !q || name.includes(q) || contact.includes(q);
  });

  const platinum = members.filter(m => getTier(m.amount?.amountMicros ?? 0) === "Platinum").length;
  const gold = members.filter(m => getTier(m.amount?.amountMicros ?? 0) === "Gold").length;
  const silver = members.filter(m => getTier(m.amount?.amountMicros ?? 0) === "Silver").length;
  const totalValue = members.reduce((sum, m) => sum + (m.amount?.amountMicros ?? 0) / 1_000_000, 0);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><Crown className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily:"'Playfair Display', serif" }}>Members</h1>
          <p className="text-muted-foreground mt-1">
            {loading ? "Loading membership data…" : `Lanai Lifestyle membership programme — ${members.length} active members`}
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Platinum", value: loading ? "…" : platinum, color: "oklch(0.55 0.18 300)" },
          { label: "Gold", value: loading ? "…" : gold, color: "oklch(0.72 0.12 75)" },
          { label: "Silver", value: loading ? "…" : silver, color: "oklch(0.6 0 0)" },
          { label: "Total Value", value: loading ? "…" : `£${(totalValue / 1000).toFixed(0)}k`, color: "oklch(0.35 0.09 145)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="lanai-card p-4 text-center">
            <div className="text-2xl font-bold mb-1" style={{ color, fontFamily: "'Playfair Display', serif" }}>{value}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="lanai-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Member / Trip</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Tier</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden md:table-cell">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Value</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Close Date</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0" />
                      <div className="h-4 bg-muted rounded animate-pulse w-40" />
                    </div>
                  </td>
                  <td className="px-4 py-3"><div className="h-5 bg-muted rounded animate-pulse w-16" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {search ? `No members matching "${search}"` : "No members found"}
                </td>
              </tr>
            ) : filtered.map(m => {
              const tier = getTier(m.amount?.amountMicros ?? 0);
              return (
                <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                        <Crown className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground text-sm truncate max-w-[200px]">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.stage === "CLOSED_WON" ? "Confirmed" : "Active booking"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 w-fit", TIER_COLORS[tier])}>
                      <Star className="w-3 h-3" />{tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">
                    {m.pointOfContact
                      ? `${m.pointOfContact.name.firstName} ${m.pointOfContact.name.lastName}`
                      : <span className="italic text-xs">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell font-mono text-xs font-medium" style={{ color: "oklch(0.35 0.09 145)" }}>
                    {m.amount?.amountMicros ? formatCurrency(m.amount.amountMicros, m.amount.currencyCode) : "—"}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {m.closeDate ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {new Date(m.closeDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(m.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
            <span>Showing {filtered.length} of {members.length} members</span>
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Total portfolio: £{(totalValue / 1000).toFixed(0)}k
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
