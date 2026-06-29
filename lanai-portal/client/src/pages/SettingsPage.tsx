import { Settings, Server, MessageCircle, Brain, Key, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const SERVICES = [
  { name:"Twenty CRM",         url:"http://localhost:3000", status:"online",  icon:Server,        desc:"Core CRM platform — contacts, pipeline, tasks" },
  { name:"WhatsApp AI Bridge", url:"http://localhost:5555", status:"online",  icon:MessageCircle, desc:"Inbound WhatsApp triage, intent detection, draft replies" },
  { name:"Proposal Engine",    url:"http://localhost:5556", status:"online",  icon:Brain,         desc:"LLM proposal co-pilot and itinerary builder" },
  { name:"Client Intelligence",url:"http://localhost:5557", status:"online",  icon:Brain,         desc:"Preference inference, churn risk, opportunity spotting" },
  { name:"Morning Briefing",   url:"http://localhost:5558", status:"online",  icon:Bell,          desc:"Daily AI digest — urgent actions, opportunities, insights" },
  { name:"Ollama LLM",         url:"http://localhost:11434",status:"online",  icon:Brain,         desc:"Local llama3.2:3b model — fully on-premise, no cloud API" },
];

const CONFIG = [
  { key:"LLM Model",         value:"llama3.2:3b (local)",   note:"Running via Ollama — no external API keys required" },
  { key:"CRM Backend",       value:"Twenty v0.32 (Docker)", note:"PostgreSQL + Redis on host network" },
  { key:"WhatsApp Webhook",  value:"Port 5555",             note:"Configure in Meta Developer Console → Webhooks" },
  { key:"Proposal Engine",   value:"Port 5556",             note:"REST API — POST /api/generate-proposal" },
  { key:"Intelligence API",  value:"Port 5557",             note:"REST API — POST /api/client-profile, /api/churn-risk, /api/opportunity-spot" },
  { key:"Briefing API",      value:"Port 5558",             note:"REST API — POST /api/morning-briefing" },
];

export default function SettingsPage() {
  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1"><Settings className="w-5 h-5 text-primary" /></div>
        <h1 className="text-3xl font-bold" style={{ fontFamily:"'Playfair Display', serif" }}>Platform Settings</h1>
        <p className="text-muted-foreground mt-1">Service status, configuration, and integration overview.</p>
      </div>
      <hr className="lanai-divider" />

      {/* Service Status */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Service Status</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SERVICES.map(svc => {
            const Icon = svc.icon;
            return (
              <div key={svc.name} className="lanai-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{svc.name}</span>
                  </div>
                  <span className={cn("w-2 h-2 rounded-full", svc.status === "online" ? "bg-emerald-500" : "bg-red-500")} />
                </div>
                <p className="text-xs text-muted-foreground">{svc.desc}</p>
                <div className="text-xs font-mono text-muted-foreground mt-2">{svc.url}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Configuration */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Configuration</h2>
        <div className="lanai-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Setting</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Value</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden md:table-cell">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CONFIG.map(c => (
                <tr key={c.key} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{c.key}</td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{c.value}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    </div>
  );
}
