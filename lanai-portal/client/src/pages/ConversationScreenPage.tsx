/**
 * Lanai Lifestyle: Unified Conversation Screen (SR-700/701).
 *
 * Three-column advisor view over a single Chatwoot conversation:
 *   - Left: full message history with voice-note transcription playback.
 *   - Center: shared working sheet (triage chips, editable draft, human send).
 *   - Right: client panel with personal context, open tasks, and SLA timer.
 *
 * Sending stays human-only: this page never auto-sends anything. The advisor
 * reviews the AI draft, edits it, and presses Send only when ready. The
 * member-safety note below is surfaced in the UI per SR-204 awareness.
 *
 * The conversations.getUnified tRPC procedure is owned by another agent and
 * may not yet be wired into AppRouter. The page is written against the
 * described shape with a local type and a defensive cast on trpc so it
 * compiles today and becomes fully type-safe once the router is registered.
 */
import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  RefreshCw, Inbox, AlertTriangle, Sparkles, Copy, Send,
  StickyNote, Phone, Mail, Globe, MessageSquare, User,
  CheckCircle2, Circle, Clock, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// SR-306 holding note. Inserted into the draft only, never sent automatically.
const HOLDING_NOTE =
  "Thank you for your message. The concierge team has received it and will respond shortly.";

// SR-204 member-safety awareness note.
const MEMBER_SAFETY_NOTE =
  "Never store card numbers or family-office instructions in notes or replies.";

// ── Local types matching conversations.getUnified shape ──────────────────────

type MemberTier = "platinum" | "gold" | "silver" | string | null;

interface UnifiedMessage {
  chatwootId: string;
  messageType: "inbound" | "outbound";
  content: string | null;
  transcription: string | null;
  transcriptionStatus: string | null;
  transcriptionError: string | null;
  attachmentUrl: string | null;
  createdAt: string | Date | null;
}

interface UnifiedConversation {
  chatwootId: string;
  channel: string;
  status: string;
  contactName: string | null;
  contactIdentifier: string | null;
  updatedAt: string | Date | null;
}

interface UnifiedMember {
  name: string | null;
  tier: MemberTier;
  notes: string | null;
  dietaryRequirements: string | null;
  accessibilityNeeds: string | null;
  nationality: string | null;
}

interface UnifiedTriage {
  intent?: string | null;
  urgency?: string | null;
  sentiment?: string | null;
  summary?: string | null;
  tags?: string[];
  draft_reply?: string | null;
}

interface UnifiedTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  automationKey: string | null;
  slaFlag: boolean;
}

interface UnifiedSla {
  urgency: string | null;
  openedAt: string | Date | null;
  firstResponseAt: string | Date | null;
  breachWarnedAt: string | Date | null;
}

interface UnifiedConversationData {
  conversation: UnifiedConversation;
  member: UnifiedMember | null;
  messages: UnifiedMessage[];
  triage: UnifiedTriage | null;
  tasks: UnifiedTask[];
  sla: UnifiedSla | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip the leading "msg_" prefix from a Chatwoot message id. */
function numericIdSuffixOf(chatwootId: string): string {
  return chatwootId.replace(/^msg_/, "");
}

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case "whatsapp":
      return <Phone className="w-3.5 h-3.5 text-green-600" />;
    case "email":
      return <Mail className="w-3.5 h-3.5 text-blue-600" />;
    case "sms":
      return <Phone className="w-3.5 h-3.5 text-purple-600" />;
    default:
      return <Globe className="w-3.5 h-3.5 text-gray-600" />;
  }
}

function formatTimeAgo(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  if (Number.isNaN(diffMs)) return "";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatTimestamp(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function urgencyVariant(urgency: string | null | undefined) {
  if (!urgency) return "outline" as const;
  if (urgency === "urgent") return "destructive" as const;
  return "outline" as const;
}

function FactRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap">
        {value && value.trim().length > 0 ? value : "None recorded"}
      </p>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: UnifiedMessage }) {
  const isOutbound = message.messageType === "outbound";
  const isTranscribed = message.transcriptionStatus === "transcribed";
  const isFailed = message.transcriptionStatus === "failed";
  const mediaSrc = `/api/chatwoot/media/${numericIdSuffixOf(message.chatwootId)}`;
  const hasContent = message.content && message.content.trim().length > 0;

  return (
    <div className={cn("flex gap-2", isOutbound && "justify-end")}>
      {!isOutbound && (
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
          <User className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-xl px-3 py-2 space-y-2",
          isOutbound
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        {hasContent && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        )}

        {isTranscribed && (
          <audio controls src={mediaSrc} className="w-full max-w-xs" preload="none" />
        )}

        {isTranscribed && message.transcription && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "text-xs underline underline-offset-2",
                  isOutbound ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                Transcript
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p
                className={cn(
                  "text-xs whitespace-pre-wrap break-words mt-1",
                  isOutbound ? "text-primary-foreground/90" : "text-foreground",
                )}
              >
                {message.transcription}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}

        {isFailed && (
          <Badge
            variant="outline"
            className="text-xs border-amber-400 text-amber-700 bg-amber-50"
          >
            Transcription failed
          </Badge>
        )}

        {isTranscribed && !message.transcription && (
          <p
            className={cn(
              "text-xs italic",
              isOutbound ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            Transcript pending
          </p>
        )}

        {!hasContent && !isTranscribed && !isFailed && (
          <p
            className={cn(
              "text-sm italic",
              isOutbound ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            No message content
          </p>
        )}

        <div
          className={cn(
            "flex items-center gap-1.5",
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          <span className="text-[10px]">{formatTimeAgo(message.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Left column: conversation history ────────────────────────────────────────

function ConversationHistoryColumn({ data }: { data: UnifiedConversationData }) {
  const { conversation, messages } = data;
  return (
    <div className="w-full md:w-96 border-r border-border flex flex-col">
      {/* Conversation header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium text-foreground truncate">
              {conversation.contactName || conversation.contactIdentifier || "Unknown contact"}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ChannelIcon channel={conversation.channel} />
              <span className="capitalize">{conversation.channel}</span>
              <span>·</span>
              <span className="capitalize">{conversation.status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.chatwootId} message={m} />)
        )}
      </div>
    </div>
  );
}

// ── Center column: working sheet ─────────────────────────────────────────────

function TriageChips({ triage }: { triage: UnifiedTriage | null }) {
  if (!triage) {
    return (
      <p className="text-sm text-muted-foreground">No triage available yet.</p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {triage.intent && (
          <Badge variant="outline" className="text-xs capitalize">
            <Sparkles className="w-3 h-3 mr-1" />
            {triage.intent}
          </Badge>
        )}
        {triage.urgency && (
          <Badge
            variant={urgencyVariant(triage.urgency)}
            className="text-xs capitalize"
          >
            {triage.urgency}
          </Badge>
        )}
        {triage.sentiment && (
          <Badge variant="outline" className="text-xs capitalize">
            {triage.sentiment}
          </Badge>
        )}
        {Array.isArray(triage.tags) &&
          triage.tags.map((tag, i) => (
            <Badge key={`${tag}-${i}`} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
      </div>
      {triage.summary && (
        <div>
          <p className="text-xs text-muted-foreground">Summary</p>
          <p className="text-sm text-foreground">{triage.summary}</p>
        </div>
      )}
    </div>
  );
}

function DraftReplyEditor({
  conversationId,
  initialDraft,
  onSent,
}: {
  conversationId: string;
  initialDraft: string;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const utils = trpc.useUtils();

  const sendMutation = trpc.chatwoot.sendMessage.useMutation({
    onSuccess: () => {
      toast.success("Reply sent");
      // Invalidate the unified view so the new outbound message appears.
      try {
        (utils as unknown as {
          conversations?: {
            getUnified?: { invalidate: (args: unknown) => unknown };
          };
        })?.conversations?.getUnified?.invalidate({ chatwootConversationId: conversationId });
      } catch {
        /* router not registered yet; safe to ignore */
      }
      onSent();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Draft copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleHoldingNote = () => {
    setDraft((prev) =>
      prev.trim() ? `${prev.trim()}\n\n${HOLDING_NOTE}` : HOLDING_NOTE,
    );
  };

  const handleSend = () => {
    if (!draft.trim()) {
      toast.error("Draft is empty");
      return;
    }
    const ok = window.confirm(
      "Send this reply to the member now? Sending is human-only and cannot be undone.",
    );
    if (!ok) return;
    sendMutation.mutate({
      chatwootConversationId: conversationId,
      content: draft.trim(),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Draft reply</label>
        <Button variant="outline" size="sm" onClick={handleHoldingNote}>
          <StickyNote className="w-3.5 h-3.5 mr-1.5" />
          Insert holding note
        </Button>
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        placeholder="Review and edit the AI draft before sending."
        className="resize-y"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          <Copy className="w-3.5 h-3.5 mr-1.5" />
          Copy
        </Button>
        <Button
          size="sm"
          onClick={handleSend}
          disabled={sendMutation.isPending || !draft.trim()}
        >
          <Send className="w-3.5 h-3.5 mr-1.5" />
          Send reply (human send)
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Sending is human-only. Review the draft before sending.
      </p>
    </div>
  );
}

function WorkingSheetColumn({ data }: { data: UnifiedConversationData }) {
  const { conversation, triage } = data;
  const initialDraft = triage?.draft_reply ?? "";
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-primary" />
          <h1
            className="text-xl font-semibold"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Conversation
          </h1>
          <Badge variant="outline" className="text-xs">
            {conversation.channel}
          </Badge>
        </div>

        {/* Triage chips */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">AI triage</CardTitle>
          </CardHeader>
          <CardContent>
            <TriageChips triage={triage} />
          </CardContent>
        </Card>

        {/* Draft reply */}
        <Card>
          <CardContent className="p-4">
            <DraftReplyEditor
              key={conversation.chatwootId}
              conversationId={conversation.chatwootId}
              initialDraft={initialDraft}
              onSent={() => {
                /* unified view invalidated in mutation onSuccess */
              }}
            />
          </CardContent>
        </Card>

        {/* Member-safety note (SR-204 awareness) */}
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="text-xs">{MEMBER_SAFETY_NOTE}</p>
        </div>
      </div>
    </div>
  );
}

// ── Right column: client panel ───────────────────────────────────────────────

function TaskRow({ task }: { task: UnifiedTask }) {
  const isOpen = task.status !== "done" && task.status !== "completed" && task.status !== "cancelled";
  const Icon = isOpen ? Circle : CheckCircle2;
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon
        className={cn(
          "w-4 h-4 flex-shrink-0 mt-0.5",
          isOpen ? "text-muted-foreground" : "text-green-600",
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground break-words">{task.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          {task.priority && (
            <Badge variant="outline" className="text-xs capitalize">
              {task.priority}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs capitalize">
            {task.status}
          </Badge>
          {task.slaFlag && (
            <Badge variant="destructive" className="text-xs">
              SLA breach
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function SlaTimerBlock({ sla }: { sla: UnifiedSla }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          SLA timer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Urgency</p>
          {sla.urgency ? (
            <Badge
              variant={urgencyVariant(sla.urgency)}
              className="text-xs capitalize"
            >
              {sla.urgency}
            </Badge>
          ) : (
            <p className="font-medium">Not classified</p>
          )}
        </div>
        {sla.openedAt && (
          <div>
            <p className="text-xs text-muted-foreground">Opened</p>
            <p className="font-medium">{formatTimestamp(sla.openedAt)}</p>
            <p className="text-xs text-muted-foreground">
              {formatTimeAgo(sla.openedAt)}
            </p>
          </div>
        )}
        {sla.firstResponseAt ? (
          <div>
            <p className="text-xs text-muted-foreground">First response</p>
            <p className="font-medium text-green-700">
              {formatTimestamp(sla.firstResponseAt)}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground">First response</p>
            <p className="font-medium text-amber-700">Awaiting advisor reply</p>
          </div>
        )}
        {sla.breachWarnedAt && (
          <div className="flex items-start gap-2 text-amber-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-xs">
              Breach warned at {formatTimestamp(sla.breachWarnedAt)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientPanelColumn({ data }: { data: UnifiedConversationData }) {
  const { member, tasks, sla } = data;
  return (
    <div className="hidden lg:flex w-80 border-l border-border flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Personal context */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {member ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {member.name || "Unknown member"}
                  </span>
                  {member.tier && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {member.tier}
                    </Badge>
                  )}
                </div>
                {member.nationality && (
                  <FactRow label="Nationality" value={member.nationality} />
                )}
                <FactRow label="Dietary requirements" value={member.dietaryRequirements} />
                <FactRow label="Accessibility needs" value={member.accessibilityNeeds} />
                <FactRow label="Notes" value={member.notes} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No member profile linked to this conversation.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Open tasks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Open tasks
              <Badge variant="outline" className="text-xs ml-auto">
                {tasks.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 px-4">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No open tasks.</p>
            ) : (
              <div className="divide-y divide-border">
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SLA timer */}
        {sla && <SlaTimerBlock sla={sla} />}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ConversationScreenPage() {
  const search = useSearch();
  const chatwootConversationId = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("conversationId") ?? "";
  }, [search]);

  // The conversations.getUnified procedure is owned by another agent and may
  // not yet be wired into AppRouter. Cast defensively so the page compiles
  // today and becomes fully type-safe once the router is registered.
  const conversationsApi = (trpc as unknown as {
    conversations?: {
      getUnified: {
        useQuery: (
          input: { chatwootConversationId: string },
          opts?: { enabled?: boolean },
        ) => {
          data?: UnifiedConversationData | null;
          isLoading: boolean;
          error?: unknown;
        };
      };
    };
  }).conversations?.getUnified;

  const result = conversationsApi?.useQuery(
    { chatwootConversationId },
    { enabled: !!chatwootConversationId },
  ) ?? {
    data: null as UnifiedConversationData | null | undefined,
    isLoading: false,
  };

  const data = result.data ?? null;
  const isLoading = result.isLoading;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Inbox className="w-5 h-5 text-primary" />
          <h1
            className="text-xl font-semibold"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Unified Conversation
          </h1>
          {data?.conversation && (
            <Badge variant="outline" className="text-xs">
              {data.conversation.contactName ||
                data.conversation.contactIdentifier ||
                data.conversation.chatwootId}
            </Badge>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {!chatwootConversationId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-6">
              <Inbox className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-muted-foreground">
                No conversation selected
              </h2>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Open a conversation from the triage inbox to load the unified
                view.
              </p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-6">
              <MessageSquare className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-muted-foreground">
                Conversation not found.
              </h2>
            </div>
          </div>
        ) : (
          <>
            <ConversationHistoryColumn data={data} />
            <WorkingSheetColumn data={data} />
            <ClientPanelColumn data={data} />
          </>
        )}
      </div>
    </div>
  );
}
