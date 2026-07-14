import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";
import { getLoginUrl } from "./const";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import ClientsPage from "./pages/ClientsPage";
import TravelRequestsPage from "./pages/TravelRequestsPage";
import MembersPage from "./pages/MembersPage";
import ProposalEnginePage from "./pages/ProposalEnginePage";
import IntelligencePage from "./pages/IntelligencePage";
import MorningBriefingPage from "./pages/MorningBriefingPage";
import SuppliersPage from "./pages/SuppliersPage";
import WhatsAppPage from "./pages/WhatsAppPage";
import SettingsPage from "./pages/SettingsPage";
import ClientPortalLogin from "./pages/ClientPortalLogin";
import ClientPortalDashboard from "./pages/ClientPortalDashboard";
import ClientPortalOnboard from "./pages/ClientPortalOnboard";
import MemberManagementPage from "./pages/MemberManagementPage";
import MemberBillingPage from "./pages/MemberBillingPage";
import RevenueAnalyticsPage from "./pages/RevenueAnalyticsPage";
import MemberProfilePage from "./pages/MemberProfilePage";
import InvoicingPage from "./pages/InvoicingPage";
import CommunicationHubPage from "./pages/CommunicationHubPage";
import CelebrationsPage from "./pages/CelebrationsPage";
import NpsPage from "./pages/NpsPage";
import TripTimelinePage from "./pages/TripTimelinePage";
import SupplierServicesPage from "./pages/SupplierServicesPage";
import AiConciergePage from "./pages/AiConciergePage";
import TaskTemplatesPage from "./pages/TaskTemplatesPage";
import MemberPortalEnhancedPage from "./pages/MemberPortalEnhancedPage";
import { Crown, Loader2 } from "lucide-react";
import { Button } from "./components/ui/button";

// ─── Advisor portal guard ─────────────────────────────────────────────────────

function AdvisorPortalGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: "oklch(0.97 0.015 80)" }}
      >
        <div className="w-full max-w-sm text-center px-8">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: "oklch(0.25 0.06 145)" }}
          >
            <Crown className="w-6 h-6 text-white" />
          </div>
          <h1
            className="text-2xl font-bold text-gray-900 mb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Lanai Advisor Portal
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            Sign in with your Manus account to access the advisor dashboard.
          </p>
          <Button
            className="w-full text-white gap-2"
            style={{ background: "oklch(0.25 0.06 145)" }}
            onClick={() => { window.location.href = getLoginUrl(); }}
          >
            Sign In
          </Button>
          <p className="text-xs text-gray-400 mt-4">
            Member? Visit{" "}
            <a href="/client" className="underline hover:text-gray-600">
              the member portal
            </a>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ─── Member portal guard ──────────────────────────────────────────────────────

function MemberPortalGuard({ children }: { children: React.ReactNode }) {
  const { data: member, isLoading } = trpc.memberAuth.me.useQuery();
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!member) {
    // Not authenticated — redirect to member login
    navigate("/client");
    return null;
  }

  return <>{children}</>;
}

// ─── Advisor router (all pages behind auth gate) ──────────────────────────────

function AdvisorRouter() {
  return (
    <AdvisorPortalGuard>
      <DashboardLayout>
        <Switch>
          <Route path="/"                component={Dashboard} />
          <Route path="/clients"         component={ClientsPage} />
          <Route path="/travel-requests" component={TravelRequestsPage} />
          <Route path="/members"         component={MembersPage} />
          <Route path="/member-management" component={MemberManagementPage} />
          <Route path="/proposals"       component={ProposalEnginePage} />
          <Route path="/intelligence"    component={IntelligencePage} />
          <Route path="/briefing"        component={MorningBriefingPage} />
          <Route path="/suppliers"           component={SuppliersPage} />
          <Route path="/supplier-services"    component={SupplierServicesPage} />
          <Route path="/whatsapp"             component={WhatsAppPage} />
          <Route path="/communication-hub">{() => <CommunicationHubPage />}</Route>
          <Route path="/analytics"            component={RevenueAnalyticsPage} />
          <Route path="/invoicing"            component={InvoicingPage} />
          <Route path="/celebrations">{() => <CelebrationsPage memberId={1} />}</Route>
          <Route path="/nps"                  component={NpsPage} />
          <Route path="/trip-timeline">{() => <TripTimelinePage memberId={1} />}</Route>
          <Route path="/ai-concierge">{() => <AiConciergePage memberId={1} />}</Route>
          <Route path="/task-templates"       component={TaskTemplatesPage} />
          <Route path="/member/:id">{(params) => <MemberProfilePage memberId={Number(params.id) || 1} />}</Route>
          <Route path="/settings"             component={SettingsPage} />
          <Route path="/404"                  component={NotFound} />
          <Route                              component={NotFound} />
        </Switch>
      </DashboardLayout>
    </AdvisorPortalGuard>
  );
}

// ─── Root app ─────────────────────────────────────────────────────────────────

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Switch>
            {/* Client-facing portal — public login, onboarding, and guarded dashboard */}
            <Route path="/client"           component={ClientPortalLogin} />
            <Route path="/client/onboard"   component={ClientPortalOnboard} />
            <Route path="/client/dashboard">
              <MemberPortalGuard>
                <ClientPortalDashboard />
              </MemberPortalGuard>
            </Route>
            <Route path="/client/billing">
              <MemberPortalGuard>
                <MemberBillingPage />
              </MemberPortalGuard>
            </Route>
            <Route path="/client/profile">
              <MemberPortalGuard>
                <MemberPortalEnhancedPage />
              </MemberPortalGuard>
            </Route>
            {/* Advisor portal — full sidebar layout, gated by Manus OAuth */}
            <Route component={AdvisorRouter} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
