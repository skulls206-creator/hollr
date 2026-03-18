import { useEffect } from "react";
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
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Only redirect from root once we know the auth state
  useEffect(() => {
    if (!isLoading && location === "/") {
      setLocation(isAuthenticated ? "/app" : "/login");
    }
  }, [isLoading, isAuthenticated, location, setLocation]);

  // Show nothing at root while loading (avoids flash-redirect to /login)
  if (location === "/" && isLoading) return null;

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
