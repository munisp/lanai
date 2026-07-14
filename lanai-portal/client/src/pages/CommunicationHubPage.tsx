import {
  MessageSquare, Phone, Mail, StickyNote, Plus, Search, Filter,
  Clock, CheckCircle, AlertTriangle, Smile, Meh, Frown,
  ArrowUpRight, ArrowDownLeft, Bell, BarChart2
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Type Icons ───────────────────────────────────────────────────────────────
const TYPE_ICONS: Record<string, React.ElementType> = {
  whatsapp: MessageSquare,
  email: Mail,
  phone_call: Phone,
  internal_note: StickyNote,
  portal_message: MessageSquare,
};

const TYPE_COLORS: Record<string, string> = {
  whatsapp: "bg-green-50 text-green-600",
  email: "bg-blue-50 text-blue-600",
  phone_call: "bg-purple-50 text-purple-600",
  internal_note: "bg-amber-50 text-amber-600",
  portal_message: "bg-gray-50 text-gray-600",
};

const SENTIMENT_ICONS: Record<string, React.ElementType> = {
  positive: Smile, neutral: Meh, negative: Frown,
};
const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-emerald-500", neutral: "text-amber-500", negative: "text-red-500",
};

// ─── Communication Entry Card ─────────────────────────────────────────────────
function CommEntry({ entry, onCompleteFollowUp }: {
  entry: {
    id: number; communicationType: string; direction: string; subject?: string | null;
    body?: string | null; summary?: string | null; sentiment?: string | null;
    followUpRequired?: boolean | null; followUpDueAt?: Date | null;
    responseTimeMinutes?: number | null; durationSeconds?: number | null;
    createdAt: Date;
  };
  onCompleteFollowUp: (id: number) => void;
}) {
  const Icon = TYPE_ICONS[entry.communicationType] ?? MessageSquare;
  const SentimentIcon = entry.sentiment ? SENTIMENT_ICONS[entry.sentiment] : null;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "border-l-4 pl-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer",
      entry.direction === "inbound" ? "border-blue-300" : "border-emerald-300"
    )} onClick={() => setExpanded(!expanded)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", TYPE_COLORS[entry.communicationType])}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold capitalize">{entry.communicationType.replace("_", " ")}</span>
              <span className={cn("flex items-center gap-1 text-xs", entry.direction === "inbound" ? "text-blue-500" : "text-emerald-500")}>
                {entry.direction === "inbound" ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                {entry.direction}
              </span>
              {entry.sentiment && SentimentIcon && (
                <SentimentIcon className={cn("w-3.5 h-3.5", SENTIMENT_COLORS[entry.sentiment])} />
              )}
              {entry.followUpRequired && (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                  <Bell className="w-3 h-3" /> Follow-up
                </span>
              )}
            </div>
            {entry.subject && <div className="text-sm font-medium text-foreground mt-0.5">{entry.subject}</div>}
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {entry.body ?? entry.summary ?? ""}
            </div>
            {expanded && (entry.body || entry.summary) && (
              <div className="mt-2 text-sm text-foreground bg-muted/30 rounded p-3 whitespace-pre-wrap">
                {entry.body ?? entry.summary}
              </div>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-muted-foreground">
            {new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </div>
          {entry.responseTimeMinutes && (
            <div className="text-xs text-muted-foreground mt-0.5">
              <Clock className="w-3 h-3 inline mr-0.5" />{entry.responseTimeMinutes}m
            </div>
          )}
          {entry.durationSeconds && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {Math.floor(entry.durationSeconds / 60)}m {entry.durationSeconds % 60}s
            </div>
          )}
          {entry.followUpRequired && (
            <Button
              variant="outline" size="sm"
              className="mt-1 h-6 text-xs gap-1"
              onClick={e => { e.stopPropagation(); onCompleteFollowUp(entry.id); }}
            >
              <CheckCircle className="w-3 h-3" /> Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Log Communication Dialog ─────────────────────────────────────────────────
function LogCommDialog({ memberId, onLogged }: { memberId: number; onLogged: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("whatsapp");
  const [direction, setDirection] = useState("outbound");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sentiment, setSentiment] = useState("neutral");
  const [followUp, setFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [duration, setDuration] = useState("");

  const logComm = trpc.communicationHub.log.useMutation({
    onSuccess: () => { toast.success("Communication logged"); setOpen(false); onLogged(); },
    onError: () => toast.error("Failed to log communication"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
          <Plus className="w-4 h-4" /> Log Communication
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>Log Communication</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Channel</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone_call">Phone Call</SelectItem>
                  <SelectItem value="internal_note">Internal Note</SelectItem>
                  <SelectItem value="portal_message">Portal Message</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Direction</label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound (to member)</SelectItem>
                  <SelectItem value="inbound">Inbound (from member)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Subject</label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject or topic" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {type === "phone_call" ? "Summary / Transcription" : "Message Body"}
            </label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Content..." className="min-h-24" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sentiment</label>
              <Select value={sentiment} onValueChange={setSentiment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">😊 Positive</SelectItem>
                  <SelectItem value="neutral">😐 Neutral</SelectItem>
                  <SelectItem value="negative">😞 Negative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === "phone_call" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Duration (seconds)</label>
                <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 300" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="followup" checked={followUp} onChange={e => setFollowUp(e.target.checked)} className="rounded" />
            <label htmlFor="followup" className="text-sm">Requires follow-up</label>
            {followUp && (
              <Input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} className="ml-2 flex-1" />
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => logComm.mutate({
                memberId,
                communicationType: type as "whatsapp" | "email" | "phone_call" | "internal_note" | "portal_message",
                direction: direction as "inbound" | "outbound",
                subject: subject || undefined,
                body: body || undefined,
                sentiment: sentiment as "positive" | "neutral" | "negative",
                followUpRequired: followUp,
                followUpDueAt: followUpDate ? new Date(followUpDate).toISOString() : undefined,
                durationSeconds: duration ? parseInt(duration) : undefined,
              })}
              disabled={logComm.isPending}
              className="text-white" style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {logComm.isPending ? "Logging..." : "Log Communication"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CommunicationHubPage({ memberId }: { memberId?: number }) {
  const id = memberId ?? 1;
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: timeline, isLoading, refetch } = trpc.communicationHub.getForMember.useQuery({
    memberId: id,
    communicationType: typeFilter !== "all" ? typeFilter as "whatsapp" | "email" | "phone_call" | "internal_note" | "portal_message" : undefined,
  });

  const { data: followUps } = trpc.communicationHub.pendingFollowUps.useQuery({ daysAhead: 7 });
  const { data: stats } = trpc.communicationHub.responseTimeStats.useQuery();

  const completeFollowUp = trpc.communicationHub.completeFollowUp.useMutation({
    onSuccess: () => { toast.success("Follow-up marked as complete"); refetch(); },
  });

  const filtered = (timeline ?? []).filter(e =>
    search === "" || (e.body ?? e.subject ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><MessageSquare className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>Communication Hub</h1>
          <p className="text-muted-foreground mt-1">Unified timeline: WhatsApp, email, calls, and internal notes</p>
        </div>
        <LogCommDialog memberId={id} onLogged={refetch} />
      </div>
      <hr className="lanai-divider" />

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="lanai-card p-4 text-center">
            <div className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.35 0.09 145)" }}>
              {Math.round(stats.avgResponseMinutes ?? 0)}m
            </div>
            <div className="text-xs text-muted-foreground mt-1">Avg Response Time</div>
          </div>
          <div className="lanai-card p-4 text-center">
            <div className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.72 0.12 75)" }}>
              {followUps?.length ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Pending Follow-ups (7d)</div>
          </div>
          <div className="lanai-card p-4 text-center">
            <div className={cn("text-2xl font-bold", (stats.slaBreaches ?? 0) > 0 ? "text-red-500" : "text-emerald-500")} style={{ fontFamily: "'Playfair Display', serif" }}>
              {stats.slaBreaches ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">SLA Breaches</div>
          </div>
        </div>
      )}

      {/* Pending Follow-ups */}
      {followUps && followUps.length > 0 && (
        <div className="lanai-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Pending Follow-ups (Next 7 Days)</h2>
          </div>
          <div className="space-y-2">
            {followUps.slice(0, 3).map(fu => (
              <div key={fu.id} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg text-sm">
                <div>
                  <span className="font-medium">{fu.subject ?? fu.body?.slice(0, 60) ?? "Follow-up required"}</span>
                  {fu.followUpDueAt && (
                    <span className="text-xs text-muted-foreground ml-2">
                      Due {new Date(fu.followUpDueAt).toLocaleDateString("en-GB")}
                    </span>
                  )}
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => completeFollowUp.mutate({ entryId: fu.id })}>
                  <CheckCircle className="w-3 h-3" /> Done
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search communications…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <Filter className="w-3.5 h-3.5 mr-2" />
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="phone_call">Phone Calls</SelectItem>
            <SelectItem value="internal_note">Internal Notes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <div className="lanai-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No communications logged yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50 px-4">
            {filtered.map(entry => (
              <CommEntry
                key={entry.id}
                entry={entry as {
                  id: number; communicationType: string; direction: string; subject?: string | null;
                  body?: string | null; summary?: string | null; sentiment?: string | null;
                  followUpRequired?: boolean | null; followUpDueAt?: Date | null;
                  responseTimeMinutes?: number | null; durationSeconds?: number | null;
                  createdAt: Date;
                }}
                onCompleteFollowUp={id => completeFollowUp.mutate({ entryId: id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
