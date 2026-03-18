import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { Login } from "@/pages/Login";
import { Layout } from "@/pages/Layout";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// Auth Guard Component
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  if (isLoading) return null; // Handled nicely inside Layout/Login

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  return <>{children}</>;
}

function Router() {
  const { isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();

  // Redirect root to layout if authed, else login
  if (location === "/") {
    setLocation(isAuthenticated ? "/app" : "/login");
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/app">
        <RequireAuth>
          <Layout />
        </RequireAuth>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
