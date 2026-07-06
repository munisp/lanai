/**
 * Lanai — Chatwoot Unified Inbox
 * 
 * Displays real-time conversations from Chatwoot with AI-powered triage,
 * draft replies, and CRM integration.
 */
import { useState, useEffect, useRef } from "react";
import {
  MessageCircle,
  Phone,
  Mail,
  Clock,
  Tag,
  Zap,
  Send,
  RefreshCw,
  Search,
  Filter,
  Loader2,
  User,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { chatwoot } from "@/lib/chatwoot";
import { trpc } from "@/lib/trpc";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatwootConversation {
  id: number;
  identifier?: string;
  status: "open" | "closed" | "archived";
  priority: string;
  labels: string[];
  contact: {
    id: number;
    name: string;
    phone: string;
    email: string;
  };
  lastMessage: string;
  lastMessageAt: string;
  inbox: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatwootMessage {
  id: number;
  content: string;
  message_type: string;
  created_at: string;
  sender_name: string;
  attachments: any[];
}

interface AIResponse {
  draft_reply: string;
  suggested_action: string;
  intent: string;
  urgency: string;
  sentiment: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { text: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { text: "Open", variant: "default" },
  closed: { text: "Closed", variant: "secondary" },
  archived: { text: "Archived", variant: "outline" },
};

const INTENT_COLORS: Record<string, string> = {
  TRAVEL_ENQUIRY: "bg-blue-50 text-blue-700 border-blue-200",
  BOOKING_FOLLOW_UP: "bg-amber-50 text-amber-700 border-amber-200",
  MEMBERSHIP_ENQUIRY: "bg-purple-50 text-purple-700 border-purple-200",
  COMPLAINT: "bg-red-50 text-red-700 border-red-200",
  URGENT: "bg-red-50 text-red-700 border-red-300",
  GENERAL: "bg-gray-50 text-gray-600 border-gray-200",
};

const SENTIMENT_COLORS: Record<string, string> = {
  POSITIVE: "text-emerald-600",
  NEUTRAL: "text-amber-600",
  NEGATIVE: "text-red-600",
};

const URGENCY_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 border-red-300",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
  LOW: "bg-blue-100 text-blue-800 border-blue-300",
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ChatwootPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [aiDraft, setAiDraft] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | "archived">("open");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  const { data: conversationsData, isLoading: conversationsLoading, refetch: refetchConversations } = 
    chatwoot.listConversations.useQuery({
      status: statusFilter,
      limit: 50,
    });

  const conversations = conversationsData?.conversations || [];

  // Fetch selected conversation details
  const { data: conversationData, refetch: refetchConversation } =
    chatwoot.getConversation.useQuery(
      { conversationId: selectedConversationId! },
      { enabled: selectedConversationId !== null }
    );

  const messages = conversationData?.messages || [];

  // Send message mutation
  const sendMessageMutation = chatwoot.sendMessage.useMutation({
    onSuccess: () => {
      setReplyText("");
      setAiDraft(null);
      toast.success("Message sent");
      refetchConversation();
      refetchConversations();
    },
    onError: (error) => {
      toast.error(`Failed to send message: ${error.message}`);
    },
  });

  // Generate AI draft mutation
  const generateDraftMutation = chatwoot.generateDraftReply.useMutation({
    onSuccess: (data) => {
      setAiDraft(data);
      setReplyText(data.draft_reply);
      toast.success("AI draft generated");
    },
    onError: (error) => {
      toast.error(`AI error: ${error.message}`);
    },
  });

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset state when conversation changes
  useEffect(() => {
    setReplyText("");
    setAiDraft(null);
  }, [selectedConversationId]);

  // Handlers
  const handleSendMessage = async () => {
    if (!replyText.trim() || !selectedConversationId) return;

    setLoading(true);
    try {
      await sendMessageMutation.mutateAsync({
        conversationId: selectedConversationId,
        content: replyText.trim(),
        message_type: "outgoing",
      });
    } catch {
      // Error handled in mutation
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!conversationData?.conversation) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.content) {
      toast.info("No message to generate draft for");
      return;
    }

    setLoading(true);
    try {
      await generateDraftMutation.mutateAsync({
        conversationId: selectedConversationId!,
        message: lastMessage.content,
        clientName: conversationData.conversation.contact.name || undefined,
      });
    } catch {
      // Error handled in mutation
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConversation = (id: number) => {
    setSelectedConversationId(id);
    refetchConversation();
  };

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      conv.contact.name?.toLowerCase().includes(query) ||
      conv.contact.phone?.includes(query) ||
      conv.contact.email?.toLowerCase().includes(query) ||
      conv.lastMessage.toLowerCase().includes(query)
    );
  });

  const selectedConversation = conversations.find(
    (c) => c.id === selectedConversationId
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-5 h-5 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-widest">AI Pillar 7</span>
        </div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
          Chatwoot Unified Inbox
        </h1>
        <p className="text-muted-foreground mt-1">
          AI-powered message management across WhatsApp, web chat, email, and more.
        </p>
      </div>

      <hr className="lanai-divider" />

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {chatwoot.getStats.useQuery(undefined, {
          onSuccess: (data) => {
            // Stats displayed in real-time
          },
        }) && (
          <>
            <div className="lanai-card p-4">
              <div className="text-2xl font-bold text-primary">
                {conversationsData?.total || 0}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Total Conversations</div>
            </div>
            <div className="lanai-card p-4">
              <div className="text-2xl font-bold text-emerald-600">
                {conversations.filter((c) => c.status === "open").length}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Open</div>
            </div>
            <div className="lanai-card p-4">
              <div className="text-2xl font-bold text-amber-600">
                {conversations.filter((c) => c.priority === "urgent").length}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Urgent</div>
            </div>
            <div className="lanai-card p-4">
              <div className="text-2xl font-bold text-purple-600">
                {new Set(conversations.map((c) => c.inbox)).size}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Inboxes</div>
            </div>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-5 gap-4" style={{ minHeight: "70vh" }}>
        {/* Conversation List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search & Filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex gap-2">
              {(["open", "closed", "archived"] as const).map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                  className="flex-1"
                >
                  <Filter className="w-3.5 h-3.5 mr-1.5" />
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {/* Conversation Items */}
          <div className="space-y-2" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {conversationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="lanai-card p-8 text-center text-muted-foreground">
                <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No conversations found.</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={cn(
                    "lanai-card p-4 cursor-pointer transition-all hover:border-border/80",
                    selectedConversationId === conv.id
                      ? "border-primary/50 bg-primary/5"
                      : ""
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        {conv.contact.name || "Unknown"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {conv.lastMessageAt
                        ? new Date(conv.lastMessageAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {conv.lastMessage || "No messages"}
                  </p>

                  <div className="flex gap-1.5 flex-wrap">
                    <Badge variant={STATUS_LABELS[conv.status]?.variant || "outline"}>
                      {STATUS_LABELS[conv.status]?.text || conv.status}
                    </Badge>
                    {conv.priority === "urgent" && (
                      <Badge variant="destructive">Urgent</Badge>
                    )}
                    {conv.labels.slice(0, 2).map((label) => (
                      <Badge key={label} variant="secondary">
                        <Tag className="w-3 h-3 mr-1" />
                        {label}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    {conv.contact.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {conv.contact.phone}
                      </span>
                    )}
                    {conv.contact.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {conv.contact.email}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Conversation Detail */}
        <div className="lg:col-span-3 space-y-4">
          {selectedConversationId ? (
            <>
              {/* Conversation Header */}
              {conversationData?.conversation && (
                <div className="lanai-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {conversationData.conversation.contact.name || "Unknown Contact"}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        {conversationData.conversation.contact.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {conversationData.conversation.contact.phone}
                          </span>
                        )}
                        {conversationData.conversation.contact.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {conversationData.conversation.contact.email}
                          </span>
                        )}
                        <span className="mx-1">·</span>
                        <Clock className="w-3 h-3" />
                        {conversationData.conversation.inbox}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge variant={STATUS_LABELS[conversationData.conversation.status]?.variant || "outline"}>
                        {STATUS_LABELS[conversationData.conversation.status]?.text || conversationData.conversation.status}
                      </Badge>
                      {conversationData.conversation.labels.map((label: string) => (
                        <Badge key={label} variant="secondary">
                          <Tag className="w-3 h-3 mr-1" />
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="lanai-card p-4 space-y-3" style={{ maxHeight: "50vh", overflowY: "auto" }}>
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No messages in this conversation.</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "rounded-lg p-3",
                        msg.message_type === "outgoing" || msg.sender_name === "Advisor"
                          ? "bg-primary/10 ml-12"
                          : "bg-muted mr-12"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground">
                          {msg.sender_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* AI Draft Section */}
              {aiDraft && (
                <div className="lanai-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      AI Analysis
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Intent: </span>
                      <span className={cn("px-2 py-0.5 rounded border", INTENT_COLORS[aiDraft.intent] || "bg-gray-50")}>
                        {aiDraft.intent || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Urgency: </span>
                      <span className={cn("px-2 py-0.5 rounded border", URGENCY_COLORS[aiDraft.urgency] || "bg-gray-50")}>
                        {aiDraft.urgency || "N/A"}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Sentiment: </span>
                      <span className={cn("font-medium", SENTIMENT_COLORS[aiDraft.sentiment] || "text-gray-600")}>
                        {aiDraft.sentiment || "N/A"}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Suggested Action: </span>
                      <span className="font-medium">{aiDraft.suggested_action || "N/A"}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Reply Section */}
              <div className="lanai-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Reply</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateDraft}
                    disabled={loading || !messages.length}
                    className="gap-1"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    Generate AI Draft
                  </Button>
                </div>

                <Textarea
                  rows={4}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="text-sm"
                  placeholder="Type your reply..."
                />

                <div className="flex gap-2">
                  <Button
                    onClick={handleSendMessage}
                    disabled={loading || !replyText.trim()}
                    className="gap-2 flex-1"
                    style={{ background: "oklch(0.35 0.09 145)" }}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Send Message
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Use the AI draft feature to generate professional replies. Always personalize before sending.
                </p>
              </div>
            </>
          ) : (
            <div className="lanai-card p-8 text-center text-muted-foreground">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a conversation to view details and respond.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
