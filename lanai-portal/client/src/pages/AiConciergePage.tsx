import {
  Brain, Sparkles, MapPin, TrendingUp, Gift, MessageSquare,
  RefreshCw, Star, ChevronRight, Loader2, Wand2, Send
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Recommendation Card ──────────────────────────────────────────────────────
function RecommendationCard({ rec, index }: {
  rec: { destination: string; reason: string; estimatedBudget?: string; bestTime?: string; highlights?: string[] };
  index: number;
}) {
  return (
    <div className="lanai-card p-5 space-y-3 animate-fade-in-up" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold text-foreground">{rec.destination}</div>
            {rec.bestTime && <div className="text-xs text-muted-foreground">Best time: {rec.bestTime}</div>}
          </div>
        </div>
        {rec.estimatedBudget && (
          <div className="text-sm font-semibold text-right" style={{ color: "oklch(0.35 0.09 145)" }}>
            {rec.estimatedBudget}
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{rec.reason}</p>
      {rec.highlights && rec.highlights.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rec.highlights.map((h, i) => (
            <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{h}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Upgrade Card ─────────────────────────────────────────────────────────────
function UpgradeCard({ upgrade, index }: {
  upgrade: { type: string; description: string; estimatedCost?: string; priority?: string };
  index: number;
}) {
  const priorityColors: Record<string, string> = {
    high: "bg-red-50 text-red-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-gray-50 text-gray-600",
  };
  return (
    <div className="flex items-start gap-3 p-4 bg-muted/20 rounded-lg animate-fade-in-up" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
        <Star className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold capitalize">{upgrade.type.replace("_", " ")}</span>
          {upgrade.priority && (
            <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", priorityColors[upgrade.priority] ?? "bg-gray-100 text-gray-600")}>
              {upgrade.priority}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{upgrade.description}</p>
        {upgrade.estimatedCost && (
          <p className="text-xs font-semibold mt-1" style={{ color: "oklch(0.35 0.09 145)" }}>{upgrade.estimatedCost}</p>
        )}
      </div>
    </div>
  );
}

// ─── Campaign Card ────────────────────────────────────────────────────────────
function CampaignCard({ campaign, index }: {
  campaign: { type: string; subject: string; body: string; sendAt?: string };
  index: number;
}) {
  const [copied, setCopied] = useState(false);
  const typeColors: Record<string, string> = {
    birthday: "bg-pink-50 text-pink-700",
    anniversary: "bg-red-50 text-red-700",
    re_engagement: "bg-blue-50 text-blue-700",
    post_trip: "bg-emerald-50 text-emerald-700",
    upgrade_offer: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="lanai-card p-5 space-y-3 animate-fade-in-up" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="flex items-center justify-between">
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", typeColors[campaign.type] ?? "bg-gray-100 text-gray-600")}>
          {campaign.type.replace("_", " ")}
        </span>
        {campaign.sendAt && (
          <span className="text-xs text-muted-foreground">Send: {new Date(campaign.sendAt).toLocaleDateString("en-GB")}</span>
        )}
      </div>
      <div className="font-semibold text-sm">{campaign.subject}</div>
      <p className="text-xs text-muted-foreground line-clamp-3">{campaign.body}</p>
      <Button
        variant="outline" size="sm" className="gap-2 text-xs"
        onClick={() => { navigator.clipboard.writeText(campaign.body); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      >
        {copied ? <CheckIcon /> : <MessageSquare className="w-3 h-3" />}
        {copied ? "Copied!" : "Copy Message"}
      </Button>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AiConciergePage({ memberId }: { memberId?: number }) {
  const id = memberId ?? 1;
  const [activeSection, setActiveSection] = useState<"destinations" | "upgrades" | "campaigns" | "chat">("destinations");

  // Destinations
  const { data: destinations, isLoading: destLoading, refetch: refetchDest } =
    trpc.aiConcierge.recommendDestinations.useQuery({});

  // Upgrades
  const { data: upgrades, isLoading: upgradesLoading, refetch: refetchUpgrades } =
    trpc.aiConcierge.suggestUpgrades.useQuery({ proposalId: 1, memberId: id });

  // Campaigns
  const { data: campaigns, isLoading: campaignsLoading, refetch: refetchCampaigns } =
    trpc.aiConcierge.generateFollowUpMessage.useQuery({ memberId: id, context: "re_engagement" });

  // Chat
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Hello! I'm your AI Concierge Assistant. I can help you with destination recommendations, upgrade suggestions, and personalised follow-up campaigns for your members. How can I assist you today?" }
  ]);
  const chat = trpc.aiConcierge.chat.useMutation({
    onSuccess: (data: { reply: string }) => {
      setChatHistory(prev => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: () => toast.error("AI assistant unavailable"),
  });

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatHistory(prev => [...prev, { role: "user", content: msg }]);
    setChatInput("");
    chat.mutate({ message: msg, history: chatHistory });
  };

  const sections = [
    { id: "destinations", label: "Destinations", icon: MapPin },
    { id: "upgrades", label: "Upgrades", icon: TrendingUp },
    { id: "campaigns", label: "Campaigns", icon: Gift },
    { id: "chat", label: "AI Chat", icon: MessageSquare },
  ] as const;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-5 h-5 text-primary" />
          <Sparkles className="w-4 h-4 text-amber-500" />
        </div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
          AI Concierge Assistant
        </h1>
        <p className="text-muted-foreground mt-1">
          Personalised recommendations based on travel history, preferences, and spending patterns
        </p>
      </div>
      <hr className="lanai-divider" />

      {/* Section Tabs */}
      <div className="flex gap-2 flex-wrap">
        {sections.map(({ id: sId, label, icon: Icon }) => (
          <button
            key={sId}
            onClick={() => setActiveSection(sId)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
              activeSection === sId
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Destinations */}
      {activeSection === "destinations" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Recommended Destinations
            </h2>
            <Button variant="outline" size="sm" onClick={() => refetchDest()} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
          {destLoading ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
            </div>
          ) : destinations && (destinations as { recommendations?: { destination: string; reason: string; estimatedBudget?: string; bestTime?: string; highlights?: string[] }[] }).recommendations ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {(destinations as { recommendations: { destination: string; reason: string; estimatedBudget?: string; bestTime?: string; highlights?: string[] }[] }).recommendations.map((rec, i) => (
                <RecommendationCard key={i} rec={rec} index={i} />
              ))}
            </div>
          ) : (
            <div className="lanai-card p-12 text-center text-muted-foreground">
              <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No recommendations available yet</p>
            </div>
          )}
        </div>
      )}

      {/* Upgrades */}
      {activeSection === "upgrades" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Suggested Upgrades
            </h2>
            <Button variant="outline" size="sm" onClick={() => refetchUpgrades()} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
          {upgradesLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : upgrades && (upgrades as unknown as { upgrades?: { type: string; description: string; estimatedCost?: string; priority?: string }[] }).upgrades ? (
            <div className="space-y-3">
              {(upgrades as unknown as { upgrades: { type: string; description: string; estimatedCost?: string; priority?: string }[] }).upgrades.map((u, i) => (
                <UpgradeCard key={i} upgrade={u} index={i} />
              ))}
            </div>
          ) : (
            <div className="lanai-card p-12 text-center text-muted-foreground">
              <Star className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No upgrade suggestions available</p>
            </div>
          )}
        </div>
      )}

      {/* Campaigns */}
      {activeSection === "campaigns" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Follow-up Campaigns
            </h2>
            <Button variant="outline" size="sm" onClick={() => refetchCampaigns()} className="gap-2">
              <Wand2 className="w-3.5 h-3.5" /> Regenerate
            </Button>
          </div>
          {campaignsLoading ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
            </div>
          ) : campaigns && (campaigns as { suggestedMessage?: string }).suggestedMessage ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {[{ type: "re_engagement", subject: "We miss you!", body: (campaigns as { suggestedMessage: string }).suggestedMessage, sendAt: undefined }].map((c, i) => (
                <CampaignCard key={i} campaign={c} index={i} />
              ))}
            </div>
          ) : (
            <div className="lanai-card p-12 text-center text-muted-foreground">
              <Gift className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No campaigns generated yet</p>
            </div>
          )}
        </div>
      )}

      {/* AI Chat */}
      {activeSection === "chat" && (
        <div className="lanai-card overflow-hidden flex flex-col" style={{ height: "520px" }}>
          {/* Chat Header */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-muted/20">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Lanai AI Concierge</div>
              <div className="text-xs text-emerald-500">● Online</div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatHistory.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className="max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm"
                  style={
                    msg.role === "user"
                      ? { background: "oklch(0.25 0.06 145)", color: "white", borderBottomRightRadius: "4px" }
                      : { background: "oklch(0.96 0.01 80)", color: "oklch(0.2 0 0)", borderBottomLeftRadius: "4px" }
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chat.isPending && (
              <div className="flex justify-start">
                <div className="px-4 py-2.5 rounded-2xl bg-muted/50" style={{ borderBottomLeftRadius: "4px" }}>
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-border flex gap-2">
            <Input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat())}
              placeholder="Ask about member preferences, destinations, upgrades..."
              className="flex-1"
            />
            <Button
              onClick={sendChat}
              disabled={!chatInput.trim() || chat.isPending}
              size="sm"
              className="text-white shrink-0"
              style={{ background: "oklch(0.25 0.06 145)" }}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
