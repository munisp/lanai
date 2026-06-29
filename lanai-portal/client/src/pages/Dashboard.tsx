/**
 * Lanai Lifestyle — Dashboard
 * Design: Ivory Coast — warm ivory, forest green, champagne gold
 * Data: Live from Twenty CRM via /crm GraphQL proxy
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  Users, Plane, Crown, TrendingUp, AlertCircle, Sunrise,
  Brain, ArrowRight, MessageCircle, Calendar, DollarSign, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchDashboardStats, fetchRecentNotes, stageLabel, stageColor,
  timeAgo, formatCurrency, type CRMOpportunity
} from "@/lib/crmApi";

interface StatCard { label: string; value: string | number; note?: string; icon: React.ElementType; color: string; }

function StatusBadge({ status }: { status: string }) {
  const map: Record<string,string> = {
    NEW:"bg-blue-50 text-blue-700 border-blue-200",
    CONFIRMED:"bg-emerald-50 text-emerald-700 border-emerald-200",
    DRAFT:"bg-amber-50 text-amber-700 border-amber-200",
    RENEWAL:"bg-purple-50 text-purple-700 border-purple-200",
    URGENT:"bg-red-50 text-red-700 border-red-200",
    ENQUIRY:"bg-sky-50 text-sky-700 border-sky-200",
    "DEPOSIT PAID":"bg-teal-50 text-teal-700 border-teal-200",
    CUSTOMER:"bg-emerald-50 text-emerald-700 border-emerald-200",
    PROPOSAL:"bg-orange-50 text-orange-700 border-orange-200",
    MEETING:"bg-amber-50 text-amber-700 border-amber-200",
    SCREENING:"bg-purple-50 text-purple-700 border-purple-200",
    CLOSED_WON:"bg-green-50 text-green-700 border-green-200",
    CLOSED_LOST:"bg-red-50 text-red-700 border-red-200",
  };
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", map[status] ?? "bg-gray-50 text-gray-600 border-gray-200")}>{stageLabel(status)}</span>;
}

export default function Dashboard() {
  const [greeting, setGreeting] = useState("Good morning");
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ activeClients: number; openRequests: number; activeMembers: number; pipelineValue: number; recentOpportunities: CRMOpportunity[] } | null>(null);
  const [notes, setNotes] = useState<{ id: string; title: string; createdAt: string }[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, notesData] = await Promise.all([
        fetchDashboardStats(),
        fetchRecentNotes(6),
      ]);
      setStats(statsData);
      setNotes(notesData.notes);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load CRM data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
    const t = setInterval(() => setTime(new Date()), 60000);
    load();
    return () => clearInterval(t);
  }, [load]);

  const statCards: StatCard[] = [
    { label: "Active Clients",  value: loading ? "…" : (stats?.activeClients ?? "—"), note: "in CRM",       icon: Users,       color: "text-emerald-600" },
    { label: "Open Requests",   value: loading ? "…" : (stats?.openRequests ?? "—"),  note: "in pipeline",  icon: Plane,       color: "text-amber-600" },
    { label: "Active Members",  value: loading ? "…" : (stats?.activeMembers ?? "—"), note: "customers",    icon: Crown,       color: "text-purple-600" },
    { label: "Pipeline Value",  value: loading ? "…" : (stats ? `£${(stats.pipelineValue / 1000).toFixed(0)}k` : "—"), note: "total value", icon: DollarSign, color: "text-teal-600" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted-foreground text-sm mb-1">
            {time.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
          </p>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily:"'Playfair Display', serif" }}>
            {greeting}, Advisor
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {loading ? "Loading live CRM data…" : error ? <span className="text-red-500">CRM error — {error}</span> : lastRefresh ? `Live data · refreshed ${timeAgo(lastRefresh.toISOString())}` : "Here is your Lanai overview for today."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 hidden sm:flex">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Loading…" : "Refresh"}
          </Button>
          <Link href="/briefing">
            <Button className="gap-2 hidden sm:flex" style={{ background:"oklch(0.35 0.09 145)" }}>
              <Sunrise className="w-4 h-4" />Morning Briefing
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>CRM connection error. Ensure Twenty CRM is running on port 3000. <button onClick={load} className="underline ml-1">Retry</button></span>
        </div>
      )}

      <hr className="lanai-divider" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {statCards.map(stat => (
          <div key={stat.label} className="lanai-card p-5 animate-fade-in-up">
            <div className="flex items-start justify-between mb-3">
              <div className={cn("p-2 rounded-lg bg-muted", stat.color)}><stat.icon className="w-4 h-4" /></div>
              {stat.note && <span className="text-xs text-muted-foreground">{stat.note}</span>}
            </div>
            <div className={cn("text-2xl font-bold text-foreground mb-0.5", loading && "animate-pulse")}>{stat.value}</div>
            <div className="text-xs text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Pipeline Activity — LIVE */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ fontFamily:"'Playfair Display', serif" }}>
              Recent Pipeline Activity
              {!loading && stats && <span className="ml-2 text-xs font-normal text-muted-foreground">(live from CRM)</span>}
            </h2>
            <Link href="/travel-requests"><button className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">View all <ArrowRight className="w-3 h-3" /></button></Link>
          </div>
          <div className="lanai-card divide-y divide-border">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-muted rounded animate-pulse w-48" />
                    <div className="h-3 bg-muted rounded animate-pulse w-32" />
                  </div>
                  <div className="h-5 w-16 bg-muted rounded animate-pulse" />
                </div>
              ))
            ) : stats?.recentOpportunities.length ? (
              stats.recentOpportunities.map(opp => (
                <div key={opp.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Plane className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{opp.name}</span>
                      <StatusBadge status={opp.stage} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {opp.pointOfContact ? `${opp.pointOfContact.name.firstName} ${opp.pointOfContact.name.lastName} · ` : ""}
                      {opp.amount?.amountMicros ? formatCurrency(opp.amount.amountMicros, opp.amount.currencyCode) : "No value set"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(opp.updatedAt)}</span>
                </div>
              ))
            ) : (
              <div className="px-4 py-10 text-center text-muted-foreground text-sm">No pipeline data found</div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Recent Notes — LIVE */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold" style={{ fontFamily:"'Playfair Display', serif" }}>Recent Notes</h2>
              <span className="text-xs text-muted-foreground">{notes.length} shown</span>
            </div>
            <div className="lanai-card divide-y divide-border">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-4 py-3 space-y-2">
                    <div className="h-3.5 bg-muted rounded animate-pulse w-full" />
                    <div className="h-3 bg-muted rounded animate-pulse w-20" />
                  </div>
                ))
              ) : notes.length ? notes.map(note => (
                <div key={note.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                  <p className="text-sm text-foreground truncate">{note.title || "Untitled note"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(note.createdAt)}</p>
                </div>
              )) : (
                <div className="px-4 py-6 text-center text-muted-foreground text-sm">No notes found</div>
              )}
            </div>
          </div>

          {/* AI Quick Actions */}
          <div>
            <h2 className="text-lg font-semibold mb-3" style={{ fontFamily:"'Playfair Display', serif" }}>AI Tools</h2>
            <div className="space-y-2">
              {[
                { href:"/proposals",    icon:Brain,         label:"Generate Proposal",   desc:"AI co-pilot" },
                { href:"/intelligence", icon:TrendingUp,    label:"Client Intelligence", desc:"Insights & scoring" },
                { href:"/briefing",     icon:Sunrise,       label:"Morning Briefing",    desc:"Daily digest" },
                { href:"/whatsapp",     icon:MessageCircle, label:"WhatsApp Inbox",      desc:"AI-triaged messages" },
              ].map(action => (
                <Link key={action.href} href={action.href}>
                  <div className="lanai-card px-4 py-3 flex items-center gap-3 hover:border-primary/30 transition-all cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <action.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{action.label}</div>
                      <div className="text-xs text-muted-foreground">{action.desc}</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Trips — from CRM opportunities with future close dates */}
      {!loading && stats?.recentOpportunities && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold" style={{ fontFamily:"'Playfair Display', serif" }}>Upcoming Confirmed Trips</h2>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.recentOpportunities
              .filter(o => o.closeDate && new Date(o.closeDate) > new Date())
              .slice(0, 4)
              .map(opp => (
                <div key={opp.id} className="lanai-card px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-medium" style={{ color:"oklch(0.72 0.12 75)" }}>
                      {new Date(opp.closeDate).toLocaleDateString("en-GB", { day:"numeric", month:"short" })}
                    </span>
                    <StatusBadge status={opp.stage} />
                  </div>
                  <div className="text-sm font-medium text-foreground truncate">
                    {opp.pointOfContact ? `${opp.pointOfContact.name.firstName} ${opp.pointOfContact.name.lastName}` : "Unknown client"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{opp.name}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
