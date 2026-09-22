/**
 * Lanai — Members page
 * Data: Live platform members (members.list) via the CRM aggregator.
 */
import { useState, useEffect, useCallback } from "react";
import { Crown, Search, Star, RefreshCw, AlertCircle, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchMembers, timeAgo, type CRMPerson } from "@/lib/crmApi";

const TIER_COLORS: Record<string, string> = {
  platinum: "bg-purple-50 text-purple-700",
  gold: "bg-amber-50 text-amber-700",
  silver: "bg-gray-50 text-gray-600",
};

function tierLabel(tier?: string): string {
  if (!tier) return "Silver";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export default function MembersPage() {
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<CRMPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMembers(200);
      setMembers(res.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    const name = `${m.name.firstName} ${m.name.lastName}`.toLowerCase();
    const email = m.emails.primaryEmail.toLowerCase();
    return !q || name.includes(q) || email.includes(q);
  });

  const platinum = members.filter(m => (m.tier ?? "").toLowerCase() === "platinum").length;
  const gold = members.filter(m => (m.tier ?? "").toLowerCase() === "gold").length;
  const silver = members.filter(m => (m.tier ?? "").toLowerCase() === "silver").length;

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
          <span>Error: {error}. <button onClick={load} className="underline">Retry</button></span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Platinum", value: loading ? "…" : platinum, color: "oklch(0.55 0.18 300)" },
          { label: "Gold", value: loading ? "…" : gold, color: "oklch(0.72 0.12 75)" },
          { label: "Silver", value: loading ? "…" : silver, color: "oklch(0.6 0 0)" },
          { label: "Total Members", value: loading ? "…" : members.length, color: "oklch(0.35 0.09 145)" },
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
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Member</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Tier</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden md:table-cell">Email</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Phone</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Joined</th>
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
                  <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  {search ? `No members matching "${search}"` : "No members found"}
                </td>
              </tr>
            ) : filtered.map(m => {
              const tier = (m.tier ?? "silver").toLowerCase();
              const fullName = `${m.name.firstName} ${m.name.lastName}`.trim();
              return (
                <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                        <Crown className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground text-sm truncate max-w-[200px]">{fullName}</div>
                        <div className="text-xs text-muted-foreground">Member</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 w-fit", TIER_COLORS[tier] ?? TIER_COLORS.silver)}>
                      <Star className="w-3 h-3" />{tierLabel(m.tier)}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">
                    {m.emails.primaryEmail || <span className="italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">
                    {m.phones.primaryPhoneNumber || <span className="italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(m.createdAt)}</td>
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
              {platinum} platinum · {gold} gold · {silver} silver
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
