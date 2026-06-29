import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
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

function AdvisorRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/"                component={Dashboard} />
        <Route path="/clients"         component={ClientsPage} />
        <Route path="/travel-requests" component={TravelRequestsPage} />
        <Route path="/members"         component={MembersPage} />
        <Route path="/proposals"       component={ProposalEnginePage} />
        <Route path="/intelligence"    component={IntelligencePage} />
        <Route path="/briefing"        component={MorningBriefingPage} />
        <Route path="/suppliers"       component={SuppliersPage} />
        <Route path="/whatsapp"        component={WhatsAppPage} />
        <Route path="/settings"        component={SettingsPage} />
        <Route path="/404"             component={NotFound} />
        <Route                         component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Switch>
            {/* Client-facing portal — no advisor sidebar */}
            <Route path="/client"           component={ClientPortalLogin} />
            <Route path="/client/dashboard" component={ClientPortalDashboard} />
            {/* Advisor portal — full sidebar layout */}
            <Route component={AdvisorRouter} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
