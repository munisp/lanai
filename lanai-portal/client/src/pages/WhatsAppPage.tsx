/**
 * Lanai AI — Pillar 1: WhatsApp Intelligence Inbox
 * Live inbox backed by the platform DB (whatsapp_messages).
 * Inbound messages arrive via the AI bridge webhook; advisors reply from here
 * and the message is sent out through the WhatsApp Cloud API.
 */
import { useState, useEffect, useCallback } from "react";
import { MessageCircle, Phone, Clock, Tag, Zap, Send, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface WMsg {
  id: number;
  phone: string;
  direction: "inbound" | "outbound";
  body: string;
  triage: any | null;
  contactName: string | null;
  read: boolean;
  createdAt: string;
}
interface Conversation {
  phone: string;
  contactName: string;
  messages: WMsg[];
  lastMessageAt: string;
  unread: number;
}

const INTENT_COLORS: Record<string, string> = {
  TRAVEL_ENQUIRY: "bg-blue-50 text-blue-700",
  TRAVEL_REQUEST: "bg-blue-50 text-blue-700",
  BOOKING_FOLLOW_UP: "bg-amber-50 text-amber-700",
  MEMBERSHIP_ENQUIRY: "bg-purple-50 text-purple-700",
  COMPLAINT: "bg-red-50 text-red-700",
  URGENT: "bg-red-50 text-red-700",
  GENERAL_ENQUIRY: "bg-gray-50 text-gray-600",
  GENERAL: "bg-gray-50 text-gray-600",
};
const SENTIMENT_COLORS: Record<string, string> = {
  POSITIVE: "text-emerald-600",
  NEUTRAL: "text-amber-600",
  NEGATIVE: "text-red-600",
};
const URGENCY_COLORS: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700 border-red-200",
  URGENT: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-blue-50 text-blue-700 border-blue-200",
};

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function WhatsAppPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/messages", { credentials: "include" });
      const data = await res.json();
      const convs: Conversation[] = data.conversations ?? [];
      setConversations(convs);
      if (!selectedPhone && convs.length) setSelectedPhone(convs[0].phone);
    } catch (e) {
      toast.error("Failed to load WhatsApp inbox");
    } finally {
      setLoading(false);
    }
  }, [selectedPhone]);

  useEffect(() => { load(); }, [load]);

  const selected = conversations.find((c) => c.phone === selectedPhone) ?? null;

  const regenerateDraft = async () => {
    if (!selected) return;
    const lastInbound = [...selected.messages].reverse().find((m) => m.direction === "inbound");
    if (!lastInbound) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/api/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: lastInbound.body, client_name: selected.contactName, intent: lastInbound.triage?.intent }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReplyText(data.draft_reply ?? "");
      toast.success("Draft reply regenerated");
    } catch {
      toast.info("AI warming up — using existing draft. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: selected.phone, message: replyText.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Reply sent via WhatsApp");
      setReplyText("");
      await load();
    } catch {
      toast.error("Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-5 h-5 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-widest">AI Pillar 1 · Live</span>
        </div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>WhatsApp Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          AI-triaged inbound messages with intent detection, sentiment analysis, and draft replies — reply directly from your laptop.
        </p>
      </div>
      <hr className="lanai-divider" />

      <div className="grid lg:grid-cols-5 gap-4" style={{ minHeight: "60vh" }}>
        {/* Conversation List */}
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Inbox ({conversations.reduce((n, c) => n + c.unread, 0)} unread)
            </h2>
            <Button variant="ghost" size="sm" onClick={load} className="gap-1"><RefreshCw className="w-3.5 h-3.5" />Refresh</Button>
          </div>
          {loading ? (
            <div className="lanai-card p-8 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin opacity-40" /></div>
          ) : conversations.length === 0 ? (
            <div className="lanai-card p-8 text-center text-muted-foreground text-sm">
              No conversations yet. When a client messages the Lanai WhatsApp number, it appears here.
            </div>
          ) : (
            conversations.map((c) => (
              <div key={c.phone} onClick={() => setSelectedPhone(c.phone)} className={cn("lanai-card p-4 cursor-pointer transition-all", selectedPhone === c.phone ? "border-primary/50 bg-primary/5" : "hover:border-border/80")}>
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{c.contactName}</span>
                  <span className="text-xs text-muted-foreground">{fmtTime(c.lastMessageAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.messages[c.messages.length - 1]?.body}</p>
                {c.unread > 0 && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">{c.unread} new</span>}
              </div>
            ))
          )}
        </div>

        {/* Conversation Detail */}
        <div className="lg:col-span-3 space-y-4">
          {selected ? (
            <>
              <div className="lanai-card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{selected.contactName}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <Phone className="w-3 h-3" />{selected.phone}
                    </div>
                  </div>
                  {selected.messages.find((m) => m.direction === "inbound")?.triage && (
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {(() => {
                        const t = selected.messages.find((m) => m.direction === "inbound")!.triage;
                        return (
                          <>
                            {t.intent && <span className={cn("px-2 py-0.5 rounded text-xs font-medium", INTENT_COLORS[t.intent] ?? "bg-gray-50 text-gray-600")}><Tag className="w-3 h-3 inline" />{t.intent?.replace(/_/g, " ")}</span>}
                            {t.sentiment && <span className={cn("text-xs font-medium", SENTIMENT_COLORS[t.sentiment])}><Zap className="w-3 h-3 inline" />{t.sentiment}</span>}
                            {t.urgency && <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium border", URGENCY_COLORS[t.urgency])}>{t.urgency}</span>}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                  {selected.messages.map((m) => (
                    <div key={m.id} className={cn("rounded-lg p-3 text-sm", m.direction === "inbound" ? "bg-muted" : "bg-primary/10 ml-8")}>
                      <div className="text-xs text-muted-foreground mb-1 uppercase tracking-widest">{m.direction === "inbound" ? "Inbound" : "Outbound"} · {fmtTime(m.createdAt)}</div>
                      <p className="text-foreground whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lanai-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Reply</div>
                  <Button variant="outline" size="sm" onClick={regenerateDraft} disabled={sending} className="gap-1">
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Regenerate draft
                  </Button>
                </div>
                <Textarea rows={5} value={replyText} onChange={(e) => setReplyText(e.target.value)} className="text-sm" placeholder="Type your reply — it will be sent via WhatsApp Business…" />
                <div className="flex gap-2">
                  <Button onClick={sendReply} disabled={sending || !replyText.trim()} className="gap-2 flex-1" style={{ background: "oklch(0.35 0.09 145)" }}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send via WhatsApp
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Messages are sent from the verified Lanai WhatsApp number through the Meta Cloud API.</p>
              </div>
            </>
          ) : (
            <div className="lanai-card p-8 text-center text-muted-foreground">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a conversation to view the thread and reply.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
