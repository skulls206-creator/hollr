import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, useParams } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { Layout } from "@/pages/Layout";
import { Login } from "@/pages/Login";
import { JoinServer } from "@/pages/JoinServer";
import { useAppStore } from "@/store/use-app-store";
import { ContextMenuProvider } from "@/contexts/ContextMenuContext";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location);
    setTimeout(() => setLocation(`/login?returnTo=${returnTo}`), 0);
    return null;
  }

  return <>{children}</>;
}

function JoinServerRoute() {
  const params = useParams<{ code: string }>();
  return (
    <RequireAuth>
      <JoinServer code={params.code || ""} />
    </RequireAuth>
  );
}

function NotFound() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  useEffect(() => {
    if (!isLoading) setLocation(isAuthenticated ? "/app" : "/login");
  }, [isLoading, isAuthenticated]);
  return null;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && location === "/") {
      setLocation(isAuthenticated ? "/app" : "/login");
    }
  }, [isLoading, isAuthenticated, location, setLocation]);

  if (location === "/" && isLoading) return null;

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/join/:code" component={JoinServerRoute} />
      <Route path="/app">
        <RequireAuth>
          <Layout />
        </RequireAuth>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

const THEME_BAR_COLORS: Record<string, string> = {
  ember:     '#130E07',
  bloom:     '#130A0E',
  slate:     '#222426',
  blueapple: '#0A0A0C',
  light:     '#f2f3f5',
};

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useAppStore();
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    // Keep the OS title bar / PWA chrome in sync with the active theme
    const color = THEME_BAR_COLORS[theme] ?? '#0A0D14';
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta') as HTMLMetaElement;
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [theme]);
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL}>
        <ThemeProvider>
          <TooltipProvider>
            <ContextMenuProvider>
              <Router />
              <Toaster />
            </ContextMenuProvider>
          </TooltipProvider>
        </ThemeProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
