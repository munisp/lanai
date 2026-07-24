import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  MessageCircle,
  Phone,
  RefreshCw,
  Send,
  Tag,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Conversation = {
  id: number;
  chatwootId: string;
  contactName: string;
  contactEmail?: string | null;
  contactIdentifier?: string | null;
  lastMessage?: string | null;
  status: string;
  updatedAt: Date | string;
  advisorResponded?: boolean;
};
type ThreadMessage = {
  id: number;
  content: string;
  messageType: "inbound" | "outbound";
  createdAt: Date | string;
};

export default function WhatsAppPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const { data: envConfig } = trpc.system.env.useQuery();
  const {
    data: conversations = [],
    isLoading,
    error,
    refetch,
  } = trpc.chatwoot.listConversations.useQuery(undefined, {
    enabled: !!envConfig?.chatwootEnabled,
  });
  const selected = useMemo(
    () =>
      (conversations as Conversation[]).find(
        (conversation) => conversation.id === selectedId,
      ) ?? null,
    [conversations, selectedId],
  );
  const { data: detail, refetch: refetchDetail } =
    trpc.chatwoot.getConversation.useQuery(
      { chatwootId: selected?.chatwootId ?? "" },
      { enabled: Boolean(selected?.chatwootId) },
    );
  const sendMutation = trpc.chatwoot.sendMessage.useMutation({
    onSuccess: async () => {
      setReplyText("");
      await Promise.all([refetch(), refetchDetail()]);
      toast.success("Message sent through Chatwoot.");
    },
    onError: (mutationError) =>
      toast.error(`Message was not sent: ${mutationError.message}`),
  });

  useEffect(() => {
    if (!selectedId && conversations.length > 0)
      setSelectedId((conversations[0] as Conversation).id);
  }, [conversations, selectedId]);

  const messages = (detail?.messages ?? []) as ThreadMessage[];
  const latestInbound = [...messages]
    .reverse()
    .find((message) => message.messageType === "inbound");
  const formattedTime = (value: Date | string | undefined) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";

  const regenerateDraft = async () => {
    if (!selected || !latestInbound?.content) {
      toast.error(
        "An inbound persisted message is required to create a draft.",
      );
      return;
    }
    setDrafting(true);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 120_000);
      const response = await fetch("/api/whatsapp/api/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: latestInbound.content,
          client_name: selected.contactName,
          context: selected.lastMessage ?? "",
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as { output?: string };
      if (!result.output)
        throw new Error("The AI service returned an empty draft.");
      setReplyText(result.output);
      toast.success("AI draft generated from the persisted conversation.");
    } catch (draftError) {
      toast.error(
        draftError instanceof Error
          ? `Draft generation failed: ${draftError.message}`
          : "Draft generation failed. No substitute text was created.",
      );
    } finally {
      setDrafting(false);
    }
  };

  const sendReply = () => {
    if (!selected || !replyText.trim()) return;
    sendMutation.mutate({
      chatwootConversationId: selected.chatwootId,
      content: replyText.trim(),
    });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-5 h-5 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-widest">
            AI Pillar 1
          </span>
        </div>
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          WhatsApp Intelligence
        </h1>
        <p className="text-muted-foreground mt-1">
          Chatwoot-backed messages with local AI drafting. No conversation is
          shown unless it has been synchronized from the connected inbox.
        </p>
      </div>
      <hr className="lanai-divider" />

      <div className="grid lg:grid-cols-5 gap-4" style={{ minHeight: "60vh" }}>
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Synchronized inbox ({conversations.length})
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
              />
            </Button>
          </div>
          {error && (
            <p className="text-sm text-destructive">
              Inbox synchronization failed: {error.message}
            </p>
          )}
          {!isLoading && conversations.length === 0 && (
            <div className="lanai-card p-5 text-sm text-muted-foreground">
              No synchronized conversations are available. Connect Chatwoot and
              synchronize an inbox to begin.
            </div>
          )}
          {(conversations as Conversation[]).map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => {
                setSelectedId(conversation.id);
                setReplyText("");
              }}
              className={cn(
                "w-full text-left lanai-card p-4 transition-all",
                selected?.id === conversation.id
                  ? "border-primary/50 bg-primary/5"
                  : "hover:border-border/80",
                conversation.status === "resolved" && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between mb-1">
                <span className="text-sm font-medium text-foreground">
                  {conversation.contactName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formattedTime(conversation.updatedAt)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {conversation.lastMessage ?? "No persisted message content"}
              </p>
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                {conversation.status}
              </span>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-4">
          {selected ? (
            <>
              <div className="lanai-card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {selected.contactName}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <Phone className="w-3 h-3" />
                      {selected.contactIdentifier ??
                        selected.contactEmail ??
                        "No contact identifier"}
                      <span className="mx-1">·</span>
                      <Clock className="w-3 h-3" />
                      {formattedTime(selected.updatedAt)}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 bg-muted">
                    <Tag className="w-3 h-3" />
                    {selected.status}
                  </span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No persisted messages are available for this conversation.
                    </p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "rounded-lg p-3 text-sm",
                          message.messageType === "outbound"
                            ? "bg-primary/10 ml-8"
                            : "bg-muted mr-8",
                        )}
                      >
                        <p>{message.content}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {message.messageType} ·{" "}
                          {formattedTime(message.createdAt)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="lanai-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    AI Draft Reply
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={regenerateDraft}
                    disabled={drafting || !latestInbound}
                  >
                    {drafting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    )}
                    Regenerate
                  </Button>
                </div>
                <Textarea
                  rows={6}
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  className="text-sm"
                  placeholder="Generate a draft from the latest persisted inbound message, then edit it before sending."
                />
                <Button
                  onClick={sendReply}
                  disabled={!replyText.trim() || sendMutation.isPending}
                  className="gap-2 w-full"
                  style={{ background: "oklch(0.35 0.09 145)" }}
                >
                  <Send className="w-4 h-4" />
                  {sendMutation.isPending ? "Sending…" : "Send via Chatwoot"}
                </Button>
              </div>
            </>
          ) : (
            <div className="lanai-card p-8 text-center text-muted-foreground">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                Select a synchronized conversation to inspect persisted messages
                and create a real draft.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
