/**
 * Lanai AI — Pillar 1: WhatsApp AI Inbox
 */
import { useState } from "react";
import { MessageCircle, Phone, Clock, Tag, Zap, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  from: string;
  phone: string;
  message: string;
  time: string;
  intent?: string;
  sentiment?: string;
  urgency?: string;
  draft_reply?: string;
  status: "new" | "triaged" | "replied";
}

const DEMO_MESSAGES: Message[] = [
  { id:"1", from:"James Whitfield", phone:"+447700900400", message:"Hi, I was wondering if you could help me plan a trip to the Maldives for my wife and I in October? We're looking for something very private and special — it's our 10th anniversary.", time:"2 min ago", intent:"TRAVEL_ENQUIRY", sentiment:"POSITIVE", urgency:"HIGH", draft_reply:"Dear James, how wonderful — congratulations on your upcoming 10th anniversary! The Maldives is a perfect choice for such a milestone. I have a few exceptional private villa options in mind that I think would be absolutely perfect for you both. Could we arrange a brief call this week so I can understand exactly what would make this trip truly special?", status:"triaged" },
  { id:"2", from:"Unknown (+447911123456)", phone:"+447911123456", message:"Hello, I got your number from a friend. I'm looking for help planning a luxury safari for a group of 8.", time:"45 min ago", intent:"TRAVEL_ENQUIRY", sentiment:"POSITIVE", urgency:"MEDIUM", draft_reply:"Thank you so much for reaching out — and what a wonderful recommendation from your friend! A private safari for 8 guests is something we absolutely specialise in. I'd love to learn more about what you have in mind. Could I ask your name and when you're hoping to travel?", status:"triaged" },
  { id:"3", from:"Emma Thompson", phone:"+447700900123", message:"Just checking in — any news on the Tuscany villa availability for September?", time:"2 hours ago", intent:"BOOKING_FOLLOW_UP", sentiment:"NEUTRAL", urgency:"MEDIUM", draft_reply:"Emma, lovely to hear from you! I've been chasing the villa team and have some exciting news — I'll call you this afternoon to discuss. The September dates are looking very promising.", status:"triaged" },
  { id:"4", from:"Oliver Bennett", phone:"+447700900789", message:"Hi, I need to renew my membership. Can you help?", time:"3 hours ago", intent:"MEMBERSHIP_ENQUIRY", sentiment:"POSITIVE", urgency:"LOW", draft_reply:"Oliver, of course! Your Gold membership renewal is coming up and I'd love to walk you through the updated benefits for the coming year. Shall I send over the renewal pack, or would you prefer a quick call?", status:"triaged" },
];

const INTENT_COLORS: Record<string, string> = {
  TRAVEL_ENQUIRY:    "bg-blue-50 text-blue-700",
  BOOKING_FOLLOW_UP: "bg-amber-50 text-amber-700",
  MEMBERSHIP_ENQUIRY:"bg-purple-50 text-purple-700",
  COMPLAINT:         "bg-red-50 text-red-700",
  GENERAL:           "bg-gray-50 text-gray-600",
};
const SENTIMENT_COLORS: Record<string, string> = {
  POSITIVE: "text-emerald-600",
  NEUTRAL:  "text-amber-600",
  NEGATIVE: "text-red-600",
};
const URGENCY_COLORS: Record<string, string> = {
  HIGH:   "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW:    "bg-blue-50 text-blue-700 border-blue-200",
};

export default function WhatsAppPage() {
  const [messages,  setMessages]  = useState<Message[]>(DEMO_MESSAGES);
  const [selected,  setSelected]  = useState<Message | null>(DEMO_MESSAGES[0]);
  const [replyText, setReplyText] = useState(DEMO_MESSAGES[0]?.draft_reply ?? "");
  const [loading,   setLoading]   = useState(false);

  const select = (msg: Message) => {
    setSelected(msg);
    setReplyText(msg.draft_reply ?? "");
  };

  const markReplied = () => {
    if (!selected) return;
    setMessages(ms => ms.map(m => m.id === selected.id ? { ...m, status:"replied" } : m));
    toast.success("Marked as replied");
  };

  const regenerateDraft = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      const res = await fetch("/api/whatsapp/api/draft-reply", { signal: controller.signal, method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ message: selected.message, client_name: selected.from, intent: selected.intent }) });
      clearTimeout(timer);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReplyText(data.draft_reply ?? "");
      toast.success("Draft reply regenerated");
    } catch {
      toast.info("AI warming up — using existing draft. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-5 h-5 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-widest">AI Pillar 1</span>
        </div>
        <h1 className="text-3xl font-bold" style={{ fontFamily:"'Playfair Display', serif" }}>WhatsApp Intelligence</h1>
        <p className="text-muted-foreground mt-1">AI-triaged inbound messages with intent detection, sentiment analysis, and draft replies.</p>
      </div>
      <hr className="lanai-divider" />

      <div className="grid lg:grid-cols-5 gap-4" style={{ minHeight:"60vh" }}>
        {/* Message List */}
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Inbox ({messages.filter(m => m.status !== "replied").length} unread)</h2>
          </div>
          {messages.map(msg => (
            <div key={msg.id} onClick={() => select(msg)} className={cn("lanai-card p-4 cursor-pointer transition-all", selected?.id === msg.id ? "border-primary/50 bg-primary/5" : "hover:border-border/80", msg.status === "replied" && "opacity-50")}>
              <div className="flex items-start justify-between mb-1">
                <span className="text-sm font-medium text-foreground">{msg.from}</span>
                <span className="text-xs text-muted-foreground">{msg.time}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{msg.message}</p>
              <div className="flex gap-1.5 flex-wrap">
                {msg.intent && <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", INTENT_COLORS[msg.intent] ?? "bg-gray-50 text-gray-600")}>{msg.intent?.replace(/_/g," ")}</span>}
                {msg.urgency && <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium border", URGENCY_COLORS[msg.urgency])}>{msg.urgency}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Message Detail */}
        <div className="lg:col-span-3 space-y-4">
          {selected ? (
            <>
              {/* Header */}
              <div className="lanai-card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{selected.from}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <Phone className="w-3 h-3" />{selected.phone}
                      <span className="mx-1">·</span>
                      <Clock className="w-3 h-3" />{selected.time}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {selected.intent && <span className={cn("px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1", INTENT_COLORS[selected.intent] ?? "bg-gray-50 text-gray-600")}><Tag className="w-3 h-3" />{selected.intent?.replace(/_/g," ")}</span>}
                    {selected.sentiment && <span className={cn("text-xs font-medium flex items-center gap-1", SENTIMENT_COLORS[selected.sentiment])}><Zap className="w-3 h-3" />{selected.sentiment}</span>}
                  </div>
                </div>
                {/* Original message */}
                <div className="bg-muted rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1 uppercase tracking-widest">Inbound Message</div>
                  <p className="text-sm text-foreground">{selected.message}</p>
                </div>
              </div>

              {/* Draft Reply */}
              <div className="lanai-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">AI Draft Reply</div>
                  <Button variant="outline" size="sm" onClick={regenerateDraft} disabled={loading} className="gap-1">
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Regenerate
                  </Button>
                </div>
                <Textarea rows={6} value={replyText} onChange={e => setReplyText(e.target.value)} className="text-sm" placeholder="AI draft reply will appear here…" />
                <div className="flex gap-2">
                  <Button onClick={markReplied} className="gap-2 flex-1" style={{ background:"oklch(0.35 0.09 145)" }}>
                    <Send className="w-4 h-4" />Mark as Replied
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Edit the draft above before sending via WhatsApp Business. The AI draft is a starting point — always personalise before sending.</p>
              </div>
            </>
          ) : (
            <div className="lanai-card p-8 text-center text-muted-foreground">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a message to view details and the AI draft reply.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
