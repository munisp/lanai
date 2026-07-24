/**
 * Lanai Lifestyle — Chatwoot Inbox
 * Omnichannel communication hub — WhatsApp, email, web chat, SMS.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  MessageCircle, Send, Search, Users, Settings,
  ArrowLeft, Paperclip, CheckCheck, RefreshCw, AlertCircle,
  Phone, Mail, Globe, MessageSquare, MoreVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatwootContact {
  id: number;
  name: string;
  email: string;
  phone: string;
  lastActivityAt: string;
  conversationCount: number;
  unreadCount: number;
}

interface InboxConversation {
  id: number;
  chatwootId: string;
  contactName: string;
  contactEmail: string;
  contactIdentifier: string;
  channel: string;
  status: string;
  lastMessage: string;
  advisorResponded: boolean;
  memberSeen: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ChatwootThreadMessage {
  id: number;
  chatwootId: string;
  messageType: "inbound" | "outbound";
  content: string;
  attachmentUrl: string | null;
  isTemplate: boolean;
  createdAt: string;
}

// ── Channel icons ───────────────────────────────────────────────────────────

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case "whatsapp": return <Phone className="w-3.5 h-3.5 text-green-600" />;
    case "email": return <Mail className="w-3.5 h-3.5 text-blue-600" />;
    case "sms": return <Phone className="w-3.5 h-3.5 text-purple-600" />;
    default: return <Globe className="w-3.5 h-3.5 text-gray-600" />;
  }
}

// ── Time formatter ──────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// ── Conversation list item ─────────────────────────────────────────────────

function ConversationItem({
  conv,
  selected,
  onClick,
}: {
  conv: InboxConversation;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors",
        selected && "bg-muted"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <MessageCircle className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {conv.contactName || conv.contactEmail || "Unknown"}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatTimeAgo(conv.updatedAt)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ChannelIcon channel={conv.channel} />
            <p className="text-xs text-muted-foreground truncate">
              {conv.lastMessage || "No messages yet"}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs h-4 px-1">
              {conv.channel}
            </Badge>
            {conv.status === "resolved" && (
              <Badge className="text-xs h-4 px-1 bg-green-100 text-green-700 border-green-200">
                Resolved
              </Badge>
            )}
            {conv.status === "pending" && (
              <Badge className="text-xs h-4 px-1 bg-amber-100 text-amber-700 border-amber-200">
                Pending
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {!conv.advisorResponded && (
            <div className="w-2 h-2 rounded-full bg-primary" />
          )}
          {conv.memberSeen && (
            <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
          )}
        </div>
      </div>
    </button>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatwootThreadMessage }) {
  const isOutbound = message.messageType === "outbound";
  return (
    <div className={cn("flex gap-2", isOutbound && "justify-end")}>
      {!isOutbound && (
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
          <Users className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div className={cn(
        "max-w-[70%] rounded-xl px-3 py-2",
        isOutbound
          ? "bg-primary text-primary-foreground rounded-br-sm"
          : "bg-muted text-foreground rounded-bl-sm"
      )}>
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <div className={cn(
          "flex items-center gap-1.5 mt-1",
          isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          <span className="text-[10px]">{formatTimeAgo(message.createdAt)}</span>
          {message.isTemplate && (
            <Badge variant="outline" className="text-[9px] h-3.5 px-1">Template</Badge>
          )}
          {isOutbound && <CheckCheck className="w-3 h-3" />}
        </div>
      </div>
    </div>
  );
}

// ── Chatwoot settings modal ────────────────────────────────────────────────

function ChatwootSettings({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: config, refetch } = trpc.chatwoot.getConfig.useQuery(undefined, {
    enabled: isOpen,
  });

  const updateMutation = trpc.chatwoot.updateConfig.useMutation({
    onSuccess: () => {
      refetch();
      onClose();
    },
  });

  const testMutation = trpc.chatwoot.testConnection.useMutation({
    onSuccess: (result: { success: boolean; message: string }) => {
      alert(result.message);
    },
  });

  if (!isOpen || !config) return null;

  const handleSave = async () => {
    setSaving(true);
    await updateMutation.mutateAsync({
      instanceUrl: url || config.instanceUrl,
      accessToken: token || config.accessToken,
      enabled: true,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <Card className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Chatwoot Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Instance URL</label>
            <Input
              value={url || config.instanceUrl}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://chatwoot.lanai.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Access Token</label>
            <Input
              value={token || config.accessToken}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter Chatwoot access token"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
            <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
              Test Connection
            </Button>
          </div>
          <Button variant="ghost" onClick={onClose} className="w-full">
            Close
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Inbox Page ───────────────────────────────────────────────────────

export default function ChatwootInboxPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: envConfig } = trpc.system.env.useQuery();
  const { data: conversations = [], isLoading: loadingConvs, refetch } = trpc.chatwoot.listConversations.useQuery(
    undefined,
    { enabled: !!envConfig?.chatwootEnabled }
  );
  const { data: messages = [], isLoading: loadingMessages } = trpc.chatwoot.getMessages.useQuery(
    { conversationId: selectedConvId ?? 0 },
    { enabled: selectedConvId !== null && !!envConfig?.chatwootEnabled }
  );

  const sendMutation = trpc.chatwoot.sendMessage.useMutation({
    onSuccess: () => {
      setMessageInput("");
      refetch();
    },
  });

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedConvId]);

  const filteredConvs = conversations.filter((c: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.contactName?.toLowerCase().includes(q) ||
      c.contactEmail?.toLowerCase().includes(q) ||
      c.lastMessage?.toLowerCase().includes(q)
    );
  });

  const selectedConv = conversations.find((c: any) => c.id === selectedConvId);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedConvId || !selectedConv) return;
    sendMutation.mutate({
      chatwootConversationId: selectedConv.chatwootId,
      content: messageInput.trim(),
    });
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Chatwoot Inbox
          </h1>
          <Badge variant="outline" className="text-xs">
            {conversations.length} conversations
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loadingConvs}>
            <RefreshCw className={cn("w-3.5 h-3.5", loadingConvs && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list */}
        <div className={cn(
          "w-full md:w-80 border-r border-border flex flex-col",
          selectedConvId && "hidden md:flex"
        )}>
          {/* Search */}
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Conversation items */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <MessageCircle className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No conversations yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Configure Chatwoot to start receiving messages
                </p>
              </div>
            ) : (
              filteredConvs.map((conv: any) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  selected={conv.id === selectedConvId}
                  onClick={() => setSelectedConvId(conv.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Conversation detail / chat */}
        <div className={cn(
          "flex-1 flex flex-col",
          !selectedConvId && "hidden md:flex"
        )}>
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-6">
                <MessageCircle className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <h2 className="text-lg font-medium text-muted-foreground">
                  Select a conversation
                </h2>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Choose a conversation from the list to view messages
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedConvId(null)}
                    className="md:hidden"
                  >
                    <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      {selectedConv.contactName || selectedConv.contactEmail}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedConv.contactEmail || selectedConv.contactIdentifier} · {selectedConv.channel}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Badge variant="outline" className="text-xs">
                        {selectedConv.status}
                      </Badge>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      {selectedConv.advisorResponded ? "Advisor Responded" : "Unanswered"}
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      {selectedConv.memberSeen ? "Member Seen" : "Unseen by member"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageCircle className="w-8 h-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No messages in this conversation yet
                    </p>
                  </div>
                ) : (
                  messages.map((msg: any) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="border-t border-border p-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="w-9 h-9 flex-shrink-0">
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  <Input
                    placeholder="Type a message..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim() || sendMutation.isPending}
                    className="w-9 h-9 flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Settings modal */}
      <ChatwootSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
