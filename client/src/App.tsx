import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import CreateGroup from "./pages/CreateGroup";
import JoinGroup from "./pages/JoinGroup";
import GroupDashboard from "./pages/GroupDashboard";
import SleeveManager from "./pages/SleeveManager";
import AdminPanel from "./pages/AdminPanel";
import AdminLedger from "./pages/AdminLedger";
import AddEmail from "./pages/AddEmail";
import { useAuth } from "./_core/hooks/useAuth";
import { useEffect } from "react";

/** Routes that are always accessible — no email gate applied */
const PUBLIC_PATHS = ["/login", "/join", "/add-email"];

/**
 * Redirects users with a placeholder email (@portfoligo.local) to /add-email
 * before they can access any protected page. Runs after auth is resolved.
 */
function EmailGate() {
  const { user, isAuthenticated, loading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !user) return;
    // Already on a public path — don't redirect
    if (PUBLIC_PATHS.some((p) => location.startsWith(p))) return;

    const isPlaceholder = user.email?.endsWith("@portfoligo.local") || !user.email;
    if (isPlaceholder) {
      setLocation("/add-email");
    }
  }, [loading, isAuthenticated, user, location, setLocation]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/join" component={JoinGroup} />
      <Route path="/join/:code" component={JoinGroup} />
      <Route path="/add-email" component={AddEmail} />
      <Route path="/create-group" component={CreateGroup} />
      <Route path="/group/:id" component={GroupDashboard} />
      <Route path="/group/:id/sleeve/:sleeveId" component={SleeveManager} />
      <Route path="/group/:id/admin" component={AdminPanel} />
      <Route path="/group/:id/admin/ledger" component={AdminLedger} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <EmailGate />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
