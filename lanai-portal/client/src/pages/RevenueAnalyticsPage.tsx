import {
  TrendingUp, DollarSign, Users, Hotel, Car, Anchor, Home, Building,
  BarChart3, RefreshCw, Calendar, ArrowUp, ArrowDown, Crown
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, trend, color = "green",
}: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  trend?: { value: string; up: boolean }; color?: "green" | "gold" | "blue" | "purple";
}) {
  const colors = {
    green: "bg-emerald-50 text-emerald-600",
    gold: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="lanai-card p-5">
      <div className="flex items-start justify-between">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", colors[color])}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={cn("flex items-center gap-1 text-xs font-medium", trend.up ? "text-emerald-600" : "text-red-500")}>
            {trend.up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {trend.value}
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
          {value}
        </div>
        <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Category Bar ─────────────────────────────────────────────────────────────
function CategoryBar({ label, value, total, icon: Icon, color }: {
  label: string; value: number; total: number; icon: React.ElementType; color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">{pct}%</span>
          <span className="font-semibold font-mono" style={{ color: "oklch(0.35 0.09 145)" }}>
            £{value.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ─── Membership Tier Card ─────────────────────────────────────────────────────
function TierCard({ tier, amount, count }: { tier: string; amount: string; count: number }) {
  const tierColors: Record<string, string> = {
    platinum: "bg-slate-100 text-slate-700 border-slate-200",
    gold: "bg-amber-50 text-amber-700 border-amber-200",
    silver: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return (
    <div className={cn("rounded-lg border p-4", tierColors[tier])}>
      <div className="flex items-center gap-2 mb-2">
        <Crown className="w-4 h-4" />
        <span className="font-semibold capitalize">{tier}</span>
      </div>
      <div className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
        £{parseFloat(amount || "0").toLocaleString()}
      </div>
      <div className="text-xs mt-1 opacity-70">{count} members</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RevenueAnalyticsPage() {
  const [days, setDays] = useState("30");

  const { data: snapshot, isLoading: snapshotLoading, refetch } =
    trpc.revenueAnalytics.todaySnapshot.useQuery();

  const { data: categoryData, isLoading: catLoading } =
    trpc.revenueAnalytics.revenueByCategory.useQuery({ days: parseInt(days) });

  const { data: membershipData, isLoading: membershipLoading } =
    trpc.revenueAnalytics.membershipFeesSummary.useQuery();

  const totalRevenue = categoryData?.total ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Revenue Analytics
          </h1>
          <p className="text-muted-foreground mt-1">Real-time operational view of platform performance</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>
      <hr className="lanai-divider" />

      {/* Today's KPIs */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Today's Performance
        </h2>
        {snapshotLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={DollarSign}
              label="Total Daily Revenue"
              value={`£${parseFloat(snapshot?.totalDailyRevenue ?? "0").toLocaleString()}`}
              trend={{ value: "+12% vs yesterday", up: true }}
              color="green"
            />
            <StatCard
              icon={TrendingUp}
              label="Average Booking Value"
              value={`£${parseFloat(snapshot?.averageBookingValue ?? "0").toLocaleString()}`}
              sub={`${snapshot?.bookingsCount ?? 0} bookings today`}
              color="gold"
            />
            <StatCard
              icon={Crown}
              label="Membership Fees Collected"
              value={`£${parseFloat(snapshot?.membershipFeesCollected ?? "0").toLocaleString()}`}
              sub="Year to date"
              color="purple"
            />
            <StatCard
              icon={Users}
              label="Active Requests"
              value={String(snapshot?.activeRequestsCount ?? 0)}
              sub={`${snapshot?.newMembersCount ?? 0} new members today`}
              color="blue"
            />
          </div>
        )}
      </div>

      {/* Revenue by Category */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="lanai-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Revenue by Category
            </h2>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {catLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : (
            <div className="space-y-5">
              <CategoryBar
                label="Hotels & Resorts" icon={Hotel}
                value={categoryData?.hotels ?? 0} total={totalRevenue}
                color="oklch(0.35 0.09 145)"
              />
              <CategoryBar
                label="Villas" icon={Home}
                value={categoryData?.villas ?? 0} total={totalRevenue}
                color="oklch(0.55 0.08 145)"
              />
              <CategoryBar
                label="Luxury Transport (Jets/Yachts)" icon={Anchor}
                value={categoryData?.transport ?? 0} total={totalRevenue}
                color="oklch(0.72 0.12 75)"
              />
              <CategoryBar
                label="Ancillary Services" icon={Car}
                value={categoryData?.ancillary ?? 0} total={totalRevenue}
                color="oklch(0.85 0.08 75)"
              />
              <CategoryBar
                label="Apartments" icon={Building}
                value={categoryData?.apartments ?? 0} total={totalRevenue}
                color="oklch(0.65 0.05 200)"
              />
              <div className="pt-3 border-t border-border flex items-center justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-lg font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.35 0.09 145)" }}>
                  £{totalRevenue.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Membership Fees */}
        <div className="lanai-card p-6">
          <h2 className="text-lg font-semibold mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
            Membership Fees Collected
          </h2>
          {membershipLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-3">
              <TierCard tier="platinum" amount={(membershipData as { platinum?: string })?.platinum ?? "0"} count={0} />
              <TierCard tier="gold" amount={(membershipData as { gold?: string })?.gold ?? "0"} count={0} />
              <TierCard tier="silver" amount={(membershipData as { silver?: string })?.silver ?? "0"} count={0} />
              <div className="pt-3 border-t border-border flex items-center justify-between">
                <span className="text-sm font-semibold">Total Fees</span>
                <span className="text-xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.35 0.09 145)" }}>
                  £{parseFloat(membershipData?.total ?? "0").toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="lanai-card p-6">
        <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
          Today's Snapshot
        </h2>
        {snapshotLoading ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { label: "Hotels", value: `£${(snapshot?.revenueByCategory as Record<string, number>)?.hotels?.toLocaleString() ?? "0"}` },
              { label: "Ancillary", value: `£${(snapshot?.revenueByCategory as Record<string, number>)?.ancillary?.toLocaleString() ?? "0"}` },
              { label: "Transport", value: `£${(snapshot?.revenueByCategory as Record<string, number>)?.transport?.toLocaleString() ?? "0"}` },
              { label: "Villas", value: `£${(snapshot?.revenueByCategory as Record<string, number>)?.villas?.toLocaleString() ?? "0"}` },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.35 0.09 145)" }}>
                  {value}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Date context */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="w-3.5 h-3.5" />
        <span>Snapshot date: {snapshot?.snapshotDate ?? new Date().toISOString().split("T")[0]}</span>
      </div>
    </div>
  );
}
