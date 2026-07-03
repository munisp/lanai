/**
 * Chatwoot Web Widget — injects the Chatwoot live chat widget into the client portal.
 * Renders a floating chat button that opens the Chatwoot widget when clicked.
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Extend Window type for Chatwoot
declare global {
  interface Window {
    $chatwoot?: { run?: () => void };
  }
}

export default function ChatwootWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<{ enabled: boolean; siteScriptId: string } | null>(null);

  const { data: envConfig } = (trpc as any).system.env.useQuery();

  useEffect(() => {
    // Load config from system env or try to fetch from API
    if ((envConfig as any)?.chatwootEnabled) {
      setConfig({ enabled: true, siteScriptId: (envConfig as any).chatwootSiteScriptId ?? "" });
    }
  }, [envConfig]);

  // Load Chatwoot widget script
  useEffect(() => {
    if (!config?.enabled || !config.siteScriptId) return;

    // Check if script already loaded
    if (document.getElementById("chatwoot-script")) return;

    const script = document.createElement("script");
    script.id = "chatwoot-script";
    script.src = "https://cdn.jsdelivr.net/npm/@chatwoot/widget@latest/widget.js";
    script.async = true;
    script.onload = () => {
      // @ts-ignore - Chatwoot global
      (window.$chatwoot = window.$chatwoot || {}).run = () => {
        // @ts-ignore - Chatwoot global
        window.$chatwoot.init(config.siteScriptId);
      };
      window.$chatwoot.run();
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup: don't remove script, just don't re-init
    };
  }, [config]);

  if (!config?.enabled) return null;

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200",
          isOpen
            ? "bg-gray-700 text-white"
            : "bg-primary text-white hover:bg-primary/90"
        )}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </button>

      {/* Inline chat panel (fallback if widget script fails) */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-80 max-w-[calc(100vw-3rem)] bg-white rounded-xl shadow-2xl border border-border overflow-hidden">
          <div className="bg-primary text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              <span className="font-medium">Chat with Lanai</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Connect to your Chatwoot instance to start chatting with your advisor team.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Configure Chatwoot in Settings → Chatwoot Configuration
            </p>
          </div>
        </div>
      )}
    </>
  );
}
