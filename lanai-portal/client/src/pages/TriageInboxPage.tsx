/**
 * Lanai Lifestyle: AI Triage Inbox
 *
 * Advisor-only view over inbound member messages captured from Chatwoot and
 * triaged by the AI triage pipeline. Sending stays human-only: this page
 * never auto-sends anything. The advisor reviews the AI draft, edits it, and
 * presses Send only when ready.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  RefreshCw, Inbox, AlertTriangle, Sparkles, Copy, Send,
  StickyNote, Phone, Mail, Globe, MessageSquare, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

// Holding note inserted into the draft when the advisor clicks the holding
// note button. Not sent automatically.
const HOLDING_NOTE =
  "Thank you for your message. I am reviewing your request and will come back to you shortly with a proper response.";

// Channel icons

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case "whatsapp": return <Phone className="w-3.5 h-3.5 text-green-600" />;
    case "email": return <Mail className="w-3.5 h-3.5 text-blue-600" />;
    case "sms": return <Phone className="w-3.5 h-3.5 text-purple-600" />;
    default: return <Globe className="w-3.5 h-3.5 text-gray-600" />;
  }
}

// Time formatter

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

// Inbox entry type (matches triageRouter.listInbox return)

interface TriageMeta {
  intent?: string;
  urgency?: string;
  sentiment?: string;
  summary?: string;
  tags?: string[];
  draft_reply?: string;
}

interface InboxEntry {
  conversationId: string;
  memberName: string | null;
  memberTier: "platinum" | "gold" | "silver" | null;
  channel: string;
  conversationStatus: string;
  lastMessage: string | null;
  latestInbound: {
    chatwootId: string;
    content: string | null;
    transcription: string | null;
    transcriptionStatus: string | null;
    createdAt: string | Date | null;
  } | null;
  triage: TriageMeta | null;
  triageRunStatus: string;
  triageError: string | null;
  unread: boolean;
  urgent: boolean;
  slaRisk: boolean;
  updatedAt: string | Date | null;
}

// Triage detail (matches triageRouter.getByMessageId return)

interface MemberFacts {
  notes: string | null;
  dietaryRequirements: string | null;
  accessibilityNeeds: string | null;
}

interface TriageDetail {
  message: {
    chatwootId: string;
    content: string | null;
    transcription: string | null;
    transcriptionStatus: string | null;
    createdAt: string | Date | null;
  };
  conversation: {
    chatwootId: string;
    memberName: string | null;
    memberTier: "platinum" | "gold" | "silver" | null;
    channel: string;
    status: string;
  };
  memberFacts: MemberFacts;
  triage: TriageMeta | null;
  triageRunStatus: string;
  triageError: string | null;
}

// Inbox list item

function InboxListItem({
  entry,
  selected,
  onClick,
}: {
  entry: InboxEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const name = entry.memberName || "Unknown member";
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors",
        selected && "bg-muted",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {name}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatTimeAgo(entry.updatedAt)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ChannelIcon channel={entry.channel} />
            <p className="text-xs text-muted-foreground truncate">
              {entry.lastMessage || "No message content"}
            </p>
          </div>
          <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
            <Badge variant="outline" className="text-xs h-4 px-1 capitalize">
              {entry.channel}
            </Badge>
            {entry.urgent && (
              <Badge variant="destructive" className="text-xs h-4 px-1">
                Urgent
              </Badge>
            )}
            {entry.triageRunStatus === "failed" && (
              <Badge
                variant="outline"
                className="text-xs h-4 px-1 border-amber-400 text-amber-700 bg-amber-50"
              >
                Triage failed
              </Badge>
            )}
            {entry.unread && (
              <Badge variant="secondary" className="text-xs h-4 px-1">
                New
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Draft editor (keyed on chatwootMessageId so state resets per message)

function DraftEditor({
  chatwootMessageId,
  initialDraft,
  conversationId,
  onSent,
}: {
  chatwootMessageId: string;
  initialDraft: string;
  conversationId: string;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const utils = trpc.useUtils();

  const sendMutation = trpc.chatwoot.sendMessage.useMutation({
    onSuccess: () => {
      toast.success("Reply sent");
      utils.triage.listInbox.invalidate();
      onSent();
    },
    onError: (err) => toast.error(err.message),
  });

  const regenerateMutation = trpc.triage.regenerate.useMutation({
    onSuccess: () => {
      toast.success("Triage regenerating");
      utils.triage.listInbox.invalidate();
      utils.triage.getByMessageId.invalidate({ chatwootMessageId });
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
    setDraft((prev) => (prev.trim() ? `${prev.trim()}\n\n${HOLDING_NOTE}` : HOLDING_NOTE));
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
          variant="outline"
          size="sm"
          onClick={() => regenerateMutation.mutate({ chatwootMessageId })}
          disabled={regenerateMutation.isPending}
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          Regenerate triage
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

// Detail panel

function DetailPanel({ entry }: { entry: InboxEntry }) {
  const messageId = entry.latestInbound?.chatwootId ?? "";
  const { data: detail, isLoading } = trpc.triage.getByMessageId.useQuery(
    { chatwootMessageId: messageId },
    { enabled: !!messageId },
  );

  const triage = (detail?.triage ?? entry.triage) as TriageMeta | null;
  const memberFacts = (detail?.memberFacts ?? null) as MemberFacts | null;

  const memberName = detail?.conversation?.memberName ?? entry.memberName ?? "Unknown member";
  const memberTier = detail?.conversation?.memberTier ?? entry.memberTier;
  const channel = detail?.conversation?.channel ?? entry.channel;

  // Latest inbound content: prefer content, fall back to transcription when
  // content is empty and the voice note was successfully transcribed.
  const inboundContent =
    entry.latestInbound?.content && entry.latestInbound.content.trim().length > 0
      ? entry.latestInbound.content
      : entry.latestInbound?.transcriptionStatus === "transcribed"
        ? entry.latestInbound.transcription
        : entry.lastMessage ?? "";
  const isTranscript =
    (!entry.latestInbound?.content || entry.latestInbound.content.trim().length === 0) &&
    entry.latestInbound?.transcriptionStatus === "transcribed";

  const draftInitial = triage?.draft_reply ?? entry.lastMessage ?? "";

  return (
    <div className="flex-1 overflow-y-auto">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Member header */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-4 h-4 text-primary flex-shrink-0" />
                  <h3 className="text-sm font-medium text-foreground truncate">
                    {memberName}
                  </h3>
                </div>
                {memberTier && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {memberTier}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ChannelIcon channel={channel} />
                <span className="capitalize">{channel}</span>
                <span>·</span>
                <span className="capitalize">{entry.conversationStatus}</span>
              </div>
            </CardContent>
          </Card>

          {/* Latest inbound message */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Latest inbound message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isTranscript && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Voice note transcript
                  </Badge>
                  {entry.latestInbound?.transcriptionStatus && (
                    <Badge variant="secondary" className="text-xs capitalize">
                      {entry.latestInbound.transcriptionStatus}
                    </Badge>
                  )}
                </div>
              )}
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                {inboundContent || "No message content available."}
              </p>
              {entry.latestInbound?.createdAt && (
                <p className="text-xs text-muted-foreground">
                  {formatTimeAgo(entry.latestInbound.createdAt)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Member facts */}
          {memberFacts && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Member facts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <FactRow label="Notes" value={memberFacts.notes} />
                <FactRow label="Dietary requirements" value={memberFacts.dietaryRequirements} />
                <FactRow label="Accessibility needs" value={memberFacts.accessibilityNeeds} />
              </CardContent>
            </Card>
          )}

          {/* Triage panel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">AI triage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {entry.triageRunStatus === "failed" ? (
                <div className="flex items-start gap-2 text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Triage failed</p>
                    {entry.triageError && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {entry.triageError}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Use Regenerate triage to retry.
                    </p>
                  </div>
                </div>
              ) : !triage ? (
                <p className="text-sm text-muted-foreground">
                  No triage available for this message yet.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Intent</p>
                      <p className="font-medium">{triage.intent || "Not classified"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Urgency</p>
                      {triage.urgency ? (
                        <Badge
                          variant={triage.urgency === "urgent" ? "destructive" : "outline"}
                          className="text-xs capitalize"
                        >
                          {triage.urgency}
                        </Badge>
                      ) : (
                        <p className="font-medium">Not classified</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sentiment</p>
                      {triage.sentiment ? (
                        <Badge variant="outline" className="text-xs capitalize">
                          {triage.sentiment}
                        </Badge>
                      ) : (
                        <p className="font-medium">Not classified</p>
                      )}
                    </div>
                  </div>
                  {triage.summary && (
                    <div>
                      <p className="text-xs text-muted-foreground">Summary</p>
                      <p className="text-sm text-foreground">{triage.summary}</p>
                    </div>
                  )}
                  {Array.isArray(triage.tags) && triage.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {triage.tags.map((tag, i) => (
                        <Badge key={`${tag}-${i}`} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Draft editor (keyed on chatwootMessageId so state resets) */}
          {messageId ? (
            <Card>
              <CardContent className="p-4">
                <DraftEditor
                  key={messageId}
                  chatwootMessageId={messageId}
                  initialDraft={draftInitial}
                  conversationId={entry.conversationId}
                  onSent={() => {
                    /* listInbox invalidated by mutation */
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                No inbound message to draft a reply for.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap">
        {value && value.trim() ? value : "None recorded"}
      </p>
    </div>
  );
}

// Main Triage Inbox Page

export default function TriageInboxPage() {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const { data: entries = [], isLoading, refetch } = trpc.triage.listInbox.useQuery(
    { limit: 50 },
  );

  const selectedEntry = (entries as InboxEntry[]).find(
    (e) => (e.latestInbound?.chatwootId ?? "") === selectedMessageId,
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Inbox className="w-5 h-5 text-primary" />
          <h1
            className="text-xl font-semibold"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Triage Inbox
          </h1>
          <Badge variant="outline" className="text-xs">
            {entries.length} messages
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left column: ranked list */}
        <div
          className={cn(
            "w-full md:w-96 border-r border-border flex flex-col",
            selectedMessageId && "hidden md:flex",
          )}
        >
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No captured messages yet. Inbound member messages captured from
                  Chatwoot appear here once triaged.
                </p>
              </div>
            ) : (
              (entries as InboxEntry[]).map((entry) => (
                <InboxListItem
                  key={entry.conversationId}
                  entry={entry}
                  selected={
                    (entry.latestInbound?.chatwootId ?? "") === selectedMessageId
                  }
                  onClick={() =>
                    setSelectedMessageId(entry.latestInbound?.chatwootId ?? null)
                  }
                />
              ))
            )}
          </div>
        </div>

        {/* Right detail panel */}
        <div
          className={cn(
            "flex-1 flex flex-col",
            !selectedMessageId && "hidden md:flex",
          )}
        >
          {!selectedEntry ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-6">
                <Inbox className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <h2 className="text-lg font-medium text-muted-foreground">
                  Select a message
                </h2>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Choose a message from the list to review its triage and draft a reply.
                </p>
              </div>
            </div>
          ) : (
            <DetailPanel entry={selectedEntry} />
          )}
        </div>
      </div>
    </div>
  );
}
