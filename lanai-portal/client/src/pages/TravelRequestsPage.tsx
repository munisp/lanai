/**
 * Lanai — Travel Requests page
 * Data: Live from Postgres `travel_requests` (created by members via the
 * member portal). Advisors can filter, search and update request status.
 */
import { useState, useMemo } from "react";
import { Plane, Search, Calendar, RefreshCw, AlertCircle, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TravelStatus =
  | "new"
  | "in_progress"
  | "proposal_sent"
  | "booked"
  | "completed"
  | "cancelled";

const STATUS_LABELS: Record<TravelStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  proposal_sent: "Proposal Sent",
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<TravelStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  proposal_sent: "bg-violet-100 text-violet-700",
  booked: "bg-emerald-100 text-emerald-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as TravelStatus[];

function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function TravelRequestsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TravelStatus | "ALL">("ALL");

  const { data: requests = [], isLoading, isError, error, refetch } = trpc.travelRequests.list.useQuery();
  const updateStatus = trpc.travelRequests.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Travel request status updated");
      refetch();
    },
    onError: (e) => toast.error(e.message || "Failed to update status"),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return requests.filter((r) => {
      const name = `${r.destination} ${r.memberName ?? ""} ${r.memberEmail ?? ""}`.toLowerCase();
      const matchesSearch = !q || name.includes(q);
      const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [requests, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of requests) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  }, [requests]);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><Plane className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>Travel Requests</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? "Loading…" : `${requests.length.toLocaleString()} requests from members`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          {isLoading ? "Loading…" : "Refresh"}
        </Button>
      </div>
      <hr className="lanai-divider" />

      {isError && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Error loading travel requests: {error?.message}. <button onClick={() => refetch()} className="underline">Retry</button></span>
        </div>
      )}

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("ALL")}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium border transition-all",
            statusFilter === "ALL"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary/50"
          )}
        >
          All
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-all",
              statusFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/50"
            )}
          >
            {STATUS_LABELS[s]}
            {!isLoading && <span className="ml-1 opacity-60">({statusCounts[s] ?? 0})</span>}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by destination or member…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {(search || statusFilter !== "ALL") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("ALL"); }} className="gap-1.5 text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />Clear filters
          </Button>
        )}
      </div>

      <div className="lanai-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Request</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden md:table-cell">Member</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Dates</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Pax</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden md:table-cell">Updated</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-48" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-10" /></td>
                  <td className="px-4 py-3"><div className="h-5 bg-muted rounded animate-pulse w-20" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                  <td className="px-4 py-3"><div className="h-8 bg-muted rounded animate-pulse w-28 ml-auto" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  {search || statusFilter !== "ALL" ? "No matching travel requests" : "No travel requests yet"}
                </td>
              </tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground max-w-xs">
                  <div className="flex items-center gap-2">
                    <Plane className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{r.destination}</span>
                  </div>
                  {r.notes && <div className="text-xs text-muted-foreground truncate mt-0.5">{r.notes}</div>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="text-sm text-foreground">{r.memberName ?? "Unknown member"}</div>
                  {r.memberEmail && <div className="text-xs text-muted-foreground">{r.memberEmail}</div>}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {r.dates}
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">{r.pax}</td>
                <td className="px-4 py-3">
                  <span className={cn("px-2 py-0.5 rounded text-xs font-medium", STATUS_COLORS[r.status as TravelStatus] ?? STATUS_COLORS.new)}>
                    {STATUS_LABELS[r.status as TravelStatus] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{timeAgo(r.updatedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <Select
                      value={r.status as TravelStatus}
                      onValueChange={(value) => updateStatus.mutate({ id: r.id, status: value as TravelStatus })}
                      disabled={updateStatus.isPending}
                    >
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue placeholder="Update status" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            Showing {filtered.length} of {requests.length.toLocaleString()} travel requests
          </div>
        )}
      </div>
    </div>
  );
}
