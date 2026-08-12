import { Settings, Key, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";


export default function SettingsPage() {
  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1"><Settings className="w-5 h-5 text-primary" /></div>
        <h1 className="text-3xl font-bold" style={{ fontFamily:"'Playfair Display', serif" }}>Platform Settings</h1>
        <p className="text-muted-foreground mt-1">Service status, configuration, and integration overview.</p>
      </div>
      <hr className="lanai-divider" />

      <div className="lanai-card p-5 space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Integration Verification</h2>
        <p className="text-sm text-muted-foreground">
          Live status is shown only after a service returns a verified response. This page does not infer health from localhost URLs, deployment assumptions, or saved configuration.
        </p>
        <p className="text-xs text-muted-foreground">
          Use the test action for each integration before relying on it in member workflows. Platform-wide readiness is available through the protected operational health endpoint.
        </p>
      </div>

      {/* WhatsApp Setup */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">WhatsApp Business Setup</h2>
        <div className="lanai-card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-2"><Key className="w-4 h-4 text-primary" /><span className="text-sm font-semibold">To go live with real WhatsApp</span></div>
          <ol className="space-y-2">
            {[
              "Create a Meta Developer App at developers.facebook.com",
              "Add the WhatsApp Business product and get a Phone Number ID",
              "Set the webhook URL to: https://your-server:5555/webhook/whatsapp",
              "Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to /home/ubuntu/lanai_ai/pillars/whatsapp/.env",
              "Restart the WhatsApp bridge service",
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground">
                <span className="font-mono text-xs text-primary font-bold w-5 flex-shrink-0">{i+1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Chatwoot Configuration */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Chatwoot Integration</h2>
        <ChatwootConfigSection />
      </div>
    </div>
  );
}

// ─── Chatwoot Config UI ─────────────────────────────────────────────────────

function ChatwootConfigSection() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: config, isLoading, refetch } = trpc.chatwoot.getConfig.useQuery();
  const updateMutation = trpc.chatwoot.updateConfig.useMutation();
  const testMutation = trpc.chatwoot.testConnection.useMutation();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (config) {
      setUrl(config.instanceUrl);
      // Access tokens are intentionally redacted from API responses. A blank
      // field preserves the existing secret; entering a value rotates it.
      setToken("");
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      await updateMutation.mutateAsync({
        instanceUrl: url,
        accessToken: token.trim() || undefined,
        enabled: true,
      });
      setTestResult({ success: true, message: "Configuration saved and remote connection verified." });
      await refetch();
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Configuration verification failed.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testMutation.mutateAsync();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Connection verification failed.",
      });
    }
  };

  if (isLoading) return <div className="lanai-card p-4">Loading...</div>;

  return (
    <div className="lanai-card p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Headphones className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Chatwoot Instance Settings</span>
        </div>
        {config?.enabled && (
          <Badge className="text-xs bg-green-100 text-green-700 border-green-200">Active</Badge>
        )}
        {!config?.enabled && (
          <Badge variant="outline" className="text-xs">Inactive</Badge>
        )}
      </div>

      <div className="grid gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Instance URL</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://chatwoot.lanai.com"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Access Token</label>
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={config?.hasAccessToken ? "Configured — enter a new token only to rotate it" : "Enter your Chatwoot access token"}
            className="mt-1"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? "Saving..." : "Save Configuration"}
        </Button>
        <Button variant="outline" onClick={() => handleTest()} disabled={testMutation.isPending}>
          Test Connection
        </Button>
      </div>

      {testResult && (
        <div className={cn(
          "p-3 rounded-lg text-sm",
          testResult.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        )}>
          {testResult.message}
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t border-border pt-3 mt-2">
        <p className="font-medium mb-1">Setup Instructions:</p>
        <ol className="space-y-1 list-decimal list-inside">
          <li>Deploy Chatwoot via Docker (see chatwoot.com/docs)</li>
          <li>Create a personal access token in Chatwoot Settings</li>
          <li>Enter the instance URL and token above</li>
          <li>Click "Test Connection" to verify</li>
          <li>Members can now chat via the floating widget</li>
        </ol>
      </div>
    </div>
  );
}
