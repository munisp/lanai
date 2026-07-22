import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Plane,
  Crown,
  FileText,
  Brain,
  Sunrise,
  Building2,
  MessageCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  UserCog,
  BarChart2,
  Receipt,
  Star,
  CheckSquare,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  // Overview
  { href: "/", icon: LayoutDashboard, label: "Dashboard", group: "main" },
  {
    href: "/briefing",
    icon: Sunrise,
    label: "Morning Briefing",
    group: "main",
  },
  {
    href: "/analytics",
    icon: BarChart2,
    label: "Revenue Analytics",
    group: "main",
  },

  // Client Management
  { href: "/clients", icon: Users, label: "Clients", group: "crm" },
  { href: "/members", icon: Crown, label: "Members", group: "crm" },
  {
    href: "/travel-requests",
    icon: Plane,
    label: "Travel Requests",
    group: "crm",
  },

  // AI Intelligence
  { href: "/proposals", icon: FileText, label: "Proposal Engine", group: "ai" },
  {
    href: "/intelligence",
    icon: Brain,
    label: "Client Intelligence",
    group: "ai",
  },

  // Operations
  { href: "/suppliers", icon: Building2, label: "Suppliers", group: "ops" },
  {
    href: "/supplier-services",
    icon: Star,
    label: "Supplier Services",
    group: "ops",
  },
  { href: "/whatsapp", icon: MessageCircle, label: "WhatsApp", group: "ops" },
  { href: "/inbox", icon: MessageSquare, label: "Unified Inbox", group: "ops" },
  {
    href: "/chatwoot",
    icon: MessageCircle,
    label: "Chatwoot Inbox",
    group: "ops",
  },
  {
    href: "/communication-hub",
    icon: MessageSquare,
    label: "Communication Hub",
    group: "ops",
  },
  {
    href: "/task-templates",
    icon: CheckSquare,
    label: "Task Templates",
    group: "ops",
  },

  // Finance
  { href: "/invoicing", icon: Receipt, label: "Invoicing", group: "finance" },
  { href: "/nps", icon: Star, label: "NPS & Feedback", group: "finance" },

  // System
  {
    href: "/member-management",
    icon: UserCog,
    label: "Member Portal",
    group: "system",
  },
  { href: "/crm-sync", icon: RefreshCw, label: "CRM Sync", group: "system" },
  { href: "/settings", icon: Settings, label: "Settings", group: "system" },
];

const GROUP_LABELS: Record<string, string> = {
  main: "Overview",
  crm: "Client Management",
  ai: "AI Intelligence",
  ops: "Operations",
  finance: "Finance & Feedback",
  system: "System",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const groups = Array.from(new Set(NAV_ITEMS.map((i) => i.group)));

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-3 px-5 py-6 border-b border-sidebar-border",
          collapsed && "justify-center px-3",
        )}
      >
        <img
          src="/manus-storage/lanai_logo_mark_81fa1679.png"
          alt="Lanai"
          className="w-8 h-8 object-contain flex-shrink-0"
        />
        {!collapsed && (
          <div className="animate-fade-in">
            <div
              className="text-sidebar-foreground font-semibold text-sm tracking-widest uppercase"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Lanai
            </div>
            <div className="text-sidebar-foreground/50 text-xs tracking-wider">
              Lifestyle
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {groups.map((group) => (
          <div key={group}>
            {!collapsed && (
              <div
                className="px-3 mb-2 text-xs font-medium tracking-widest uppercase text-sidebar-foreground/40"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {GROUP_LABELS[group]}
              </div>
            )}
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-150",
                        "text-sm font-medium",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        collapsed && "justify-center px-2",
                      )}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {!collapsed && (
                        <span className="animate-fade-in truncate">
                          {item.label}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Gold divider + version */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        {!collapsed && (
          <div
            className="text-sidebar-foreground/30 text-xs text-center"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            v2.0 · Lanai Intelligence
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col flex-shrink-0 transition-all duration-200",
          "relative",
          collapsed ? "w-16" : "w-60",
        )}
        style={{ background: "oklch(0.18 0.06 145)" }}
      >
        {/* Subtle texture overlay */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: `url(/manus-storage/lanai_sidebar_texture_e855e839.jpg)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative z-10 flex flex-col h-full">
          <SidebarContent />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "absolute -right-3 top-20 z-20",
            "w-6 h-6 rounded-full flex items-center justify-center",
            "bg-sidebar-primary text-sidebar-primary-foreground",
            "shadow-md transition-transform duration-150 hover:scale-110",
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 bottom-0 w-64 flex flex-col"
            style={{ background: "oklch(0.18 0.06 145)" }}
          >
            <div className="relative z-10 flex flex-col h-full">
              <SidebarContent />
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/manus-storage/lanai_logo_mark_81fa1679.png"
              alt="Lanai"
              className="w-6 h-6 object-contain"
            />
            <span
              className="font-semibold text-sm"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Lanai Lifestyle
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
