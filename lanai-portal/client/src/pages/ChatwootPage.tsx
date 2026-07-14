/**
 * Lanai — Chatwoot Unified Inbox (AI-Powered)
 * Rewritten to match actual tRPC router shapes.
 */
import { useState, useEffect, useRef } from "react";
import {
  MessageCircle, Mail, Clock, Send, RefreshCw, Search,
  Loader2, User, AlertCircle, Zap, BarChart2, Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

type LocalConv = {
  id: number; chatwootId: string; memberId: number | null;
  contactName: string; contactEmail: string | null; channel: string | null;
  status: string; lastMessage: string | null; advisorResponded: boolean;
  createdAt: Date; updatedAt: Date;
};
type LocalMsg = {
  id: number; conversationId: number; content: string;
  messageType: "inbound" | "outbound"; chatwootId: string;
  isTemplate: boolean; attachmentUrl: string | null; createdAt: Date;
};

export default function ChatwootPage() {
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [selectedChatwootId, setSelectedChatwootId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: rawConvs = [], isLoading: convsLoading, refetch: refetchConvs } =
    trpc.chatwoot.listConversations.useQuery();
  const conversations = rawConvs as LocalConv[];

  const { data: rawDetail, refetch: refetchDetail } =
    trpc.chatwoot.getConversation.useQuery(
      { chatwootId: selectedChatwootId! },
      { enabled: !!selectedChatwootId }
    );
  const convDetail = rawDetail as (LocalConv & { messages: LocalMsg[] }) | null | undefined;
  const messages: LocalMsg[] = convDetail?.messages ?? [];

  const { data: rawStats } = trpc.chatwoot.getStats.useQuery();
  const stats = rawStats as { open: number; pending: number; resolved: number; unresponded: number; total: number } | undefined;

  const sendMutation = trpc.chatwoot.sendMessage.useMutation({
    onSuccess: () => { setReplyText(""); toast.success("Message sent"); refetchDetail(); refetchConvs(); },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const draftMutation = trpc.chatwoot.generateDraftReply.useMutation({
    onSuccess: (d) => { const data = d as { draft: string }; setReplyText(data.draft); toast.success("AI draft ready"); },
    onError: (e) => toast.error(`AI error: ${e.message}`),
  });

  const syncMutation = trpc.chatwoot.syncConversations.useMutation({
    onSuccess: () => { toast.success("Synced"); refetchConvs(); },
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function handleSelect(conv: LocalConv) {
    setSelectedConvId(conv.id); setSelectedChatwootId(conv.chatwootId);
  }

  function handleSend() {
    if (!replyText.trim() || !selectedChatwootId) return;
    sendMutation.mutate({ chatwootConversationId: selectedChatwootId, content: replyText.trim() });
  }

  function handleDraft() {
    if (!selectedConvId) return;
    const conv = conversations.find((c) => c.id === selectedConvId);
    draftMutation.mutate({ conversationId: selectedConvId, lastMessage: conv?.lastMessage ?? "", memberName: conv?.contactName });
  }

  const filtered = conversations.filter((c) => {
    const ms = statusFilter === "all" || c.status === statusFilter;
    const mq = !searchQuery || c.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.contactEmail ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.lastMessage ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    return ms && mq;
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Inbox className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold font-playfair">Chatwoot Unified Inbox</h1>
            <p className="text-sm text-muted-foreground">AI-powered omnichannel communication</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className={cn("h-4 w-4 mr-2", syncMutation.isPending && "animate-spin")} />Sync
        </Button>
      </div>

      {stats && (
        <div className="border-b bg-muted/30 px-6 py-2 flex items-center gap-6 text-sm">
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-muted-foreground">Open:</span><span className="font-semibold">{stats.open}</span></span>
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-amber-500" /><span className="text-muted-foreground">Pending:</span><span className="font-semibold">{stats.pending}</span></span>
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-slate-400" /><span className="text-muted-foreground">Resolved:</span><span className="font-semibold">{stats.resolved}</span></span>
          <span className="flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-red-500" /><span className="text-muted-foreground">Unresponded:</span><span className="font-semibold text-red-600">{stats.unresponded}</span></span>
          <span className="flex items-center gap-1.5 ml-auto"><BarChart2 className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Total:</span><span className="font-semibold">{stats.total}</span></span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 border-r flex flex-col bg-card">
          <div className="p-3 space-y-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." className="pl-8 h-8 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex gap-1">
              {["all", "open", "pending", "resolved"].map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={cn("flex-1 text-xs py-1 rounded capitalize transition-colors", statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{s}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convsLoading ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground"><MessageCircle className="h-8 w-8 mb-2 opacity-40" /><p className="text-sm">No conversations</p></div>
            ) : filtered.map((conv) => (
              <button key={conv.id} onClick={() => handleSelect(conv)} className={cn("w-full text-left p-3 border-b hover:bg-muted/50 transition-colors", selectedConvId === conv.id && "bg-primary/5 border-l-2 border-l-primary")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><User className="h-4 w-4 text-primary" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{conv.contactName}</p>
                      <p className="text-xs text-muted-foreground truncate">{conv.contactEmail ?? conv.channel ?? "Unknown"}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant={conv.status === "open" ? "default" : conv.status === "pending" ? "secondary" : "outline"} className="text-xs h-4">{conv.status}</Badge>
                    {!conv.advisorResponded && conv.status === "open" && <div className="h-2 w-2 rounded-full bg-red-500" />}
                  </div>
                </div>
                {conv.lastMessage && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 pl-10">{conv.lastMessage}</p>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          {!selectedConvId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">Select a conversation</p>
            </div>
          ) : (
            <>
              {convDetail && (
                <div className="border-b bg-card px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center"><User className="h-5 w-5 text-primary" /></div>
                    <div>
                      <p className="font-semibold text-sm">{convDetail.contactName}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {convDetail.contactEmail && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{convDetail.contactEmail}</span>}
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(convDetail.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Badge variant={convDetail.status === "open" ? "default" : convDetail.status === "pending" ? "secondary" : "outline"}>{convDetail.status}</Badge>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No messages yet</div>
                ) : messages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.messageType === "outbound" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[70%] rounded-2xl px-4 py-2.5 text-sm", msg.messageType === "outbound" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm")}>
                      <p>{msg.content}</p>
                      <p className={cn("text-xs mt-1", msg.messageType === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground")}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t bg-card p-4 space-y-3">
                <Textarea placeholder="Type a reply... (⌘↵ to send)" value={replyText} onChange={(e) => setReplyText(e.target.value)} className="min-h-[80px] resize-none text-sm" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }} />
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={handleDraft} disabled={draftMutation.isPending}>
                    {draftMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2 text-amber-500" />}AI Draft
                  </Button>
                  <Button size="sm" onClick={handleSend} disabled={!replyText.trim() || sendMutation.isPending}>
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
