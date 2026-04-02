import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import CreateGroup from "./pages/CreateGroup";
import JoinGroup from "./pages/JoinGroup";
import GroupDashboard from "./pages/GroupDashboard";
import SleeveManager from "./pages/SleeveManager";
import AdminPanel from "./pages/AdminPanel";
import { EmailMigrationPrompt } from "./components/EmailMigrationPrompt";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/join" component={JoinGroup} />
      <Route path="/join/:code" component={JoinGroup} />
      <Route path="/create-group" component={CreateGroup} />
      <Route path="/group/:id" component={GroupDashboard} />
      <Route path="/group/:id/sleeve/:sleeveId" component={SleeveManager} />
      <Route path="/group/:id/admin" component={AdminPanel} />
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
          <EmailMigrationPrompt />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
