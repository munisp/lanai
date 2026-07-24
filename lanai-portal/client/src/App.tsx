import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";
import { getLoginUrl } from "./const";
import DashboardLayout from "./components/DashboardLayout";
import ChatwootWidget from "./components/ChatwootWidget";
const NotFound = lazy(() => import("./pages/NotFound"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const TravelRequestsPage = lazy(() => import("./pages/TravelRequestsPage"));
const MembersPage = lazy(() => import("./pages/MembersPage"));
const MemberManagementPage = lazy(() => import("./pages/MemberManagementPage"));
const ProposalEnginePage = lazy(() => import("./pages/ProposalEnginePage"));
const IntelligencePage = lazy(() => import("./pages/IntelligencePage"));
const MorningBriefingPage = lazy(() => import("./pages/MorningBriefingPage"));
const SuppliersPage = lazy(() => import("./pages/SuppliersPage"));
const SupplierServicesPage = lazy(() => import("./pages/SupplierServicesPage"));
const WhatsAppPage = lazy(() => import("./pages/WhatsAppPage"));
const ChatwootInboxPage = lazy(() => import("./pages/ChatwootInboxPage"));
const ChatwootPage = lazy(() => import("./pages/ChatwootPage"));
const CommunicationHubPage = lazy(() => import("./pages/CommunicationHubPage"));
const RevenueAnalyticsPage = lazy(() => import("./pages/RevenueAnalyticsPage"));
const InvoicingPage = lazy(() => import("./pages/InvoicingPage"));
const CelebrationsPage = lazy(() => import("./pages/CelebrationsPage"));
const NpsPage = lazy(() => import("./pages/NpsPage"));
const TripTimelinePage = lazy(() => import("./pages/TripTimelinePage"));
const AiConciergePage = lazy(() => import("./pages/AiConciergePage"));
const TaskTemplatesPage = lazy(() => import("./pages/TaskTemplatesPage"));
const MemberProfilePage = lazy(() => import("./pages/MemberProfilePage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ClientPortalLogin = lazy(() => import("./pages/ClientPortalLogin"));
const ClientPortalDashboard = lazy(
  () => import("./pages/ClientPortalDashboard"),
);
const ClientPortalOnboard = lazy(() => import("./pages/ClientPortalOnboard"));
const MemberBillingPage = lazy(() => import("./pages/MemberBillingPage"));
const MemberPortalEnhancedPage = lazy(
  () => import("./pages/MemberPortalEnhancedPage"),
);
const ClientProposalPage = lazy(() => import("./pages/ClientProposalPage"));
const CrmSyncPage = lazy(() => import("./pages/CrmSyncPage"));
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
            Sign in to access the advisor dashboard.
          </p>
          <Button
            className="w-full text-white gap-2"
            style={{ background: "oklch(0.25 0.06 145)" }}
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
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
          <Route path="/" component={Dashboard} />
          <Route path="/clients" component={ClientsPage} />
          <Route path="/travel-requests" component={TravelRequestsPage} />
          <Route path="/members" component={MembersPage} />
          <Route path="/member-management" component={MemberManagementPage} />
          <Route path="/proposals" component={ProposalEnginePage} />
          <Route path="/intelligence" component={IntelligencePage} />
          <Route path="/briefing" component={MorningBriefingPage} />
          <Route path="/suppliers" component={SuppliersPage} />
          <Route path="/supplier-services" component={SupplierServicesPage} />
          <Route path="/whatsapp" component={WhatsAppPage} />
          <Route path="/inbox" component={ChatwootInboxPage} />
          <Route path="/chatwoot" component={ChatwootPage} />
          <Route path="/communication-hub">
            {() => <CommunicationHubPage />}
          </Route>
          <Route path="/analytics" component={RevenueAnalyticsPage} />
          <Route path="/invoicing" component={InvoicingPage} />
          <Route path="/member/:memberId/celebrations">
            {(params) => {
              const memberId = Number(params.memberId);
              return Number.isSafeInteger(memberId) && memberId > 0 ? (
                <CelebrationsPage memberId={memberId} />
              ) : (
                <NotFound />
              );
            }}
          </Route>
          <Route path="/nps" component={NpsPage} />
          <Route path="/member/:memberId/trip-timeline">
            {(params) => {
              const memberId = Number(params.memberId);
              return Number.isSafeInteger(memberId) && memberId > 0 ? (
                <TripTimelinePage memberId={memberId} />
              ) : (
                <NotFound />
              );
            }}
          </Route>
          <Route path="/member/:memberId/ai-concierge">
            {(params) => {
              const memberId = Number(params.memberId);
              return Number.isSafeInteger(memberId) && memberId > 0 ? (
                <AiConciergePage memberId={memberId} />
              ) : (
                <NotFound />
              );
            }}
          </Route>
          <Route path="/task-templates" component={TaskTemplatesPage} />
          <Route path="/member/:id">
            {(params) => {
              const memberId = Number(params.id);
              return Number.isSafeInteger(memberId) && memberId > 0 ? (
                <MemberProfilePage memberId={memberId} />
              ) : (
                <NotFound />
              );
            }}
          </Route>
          <Route path="/crm-sync" component={CrmSyncPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
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
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <Toaster richColors position="top-right" />
            <Switch>
              {/* Client-facing portal — public login, onboarding, and guarded dashboard */}
              <Route path="/client" component={ClientPortalLogin} />
              <Route path="/client/onboard" component={ClientPortalOnboard} />
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
              <Route path="/client/proposals/:id">
                <MemberPortalGuard>
                  <ClientProposalPage />
                </MemberPortalGuard>
              </Route>
              <Route path="/client/profile">
                <MemberPortalGuard>
                  <MemberPortalEnhancedPage />
                </MemberPortalGuard>
              </Route>
              {/* Advisor portal — full sidebar layout, gated by Keycloak OAuth */}
              <Route component={AdvisorRouter} />
            </Switch>
            {/* Floating Chatwoot widget — available on all pages */}
            <ChatwootWidget />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
