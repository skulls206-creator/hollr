import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => void;
  setAuthUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
  /** @deprecated – login is now handled inline by the Login page form */
  login: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetch("/api/auth/user", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  // Directly set the authenticated user — used by the login form so the
  // app transitions to /app immediately without relying on a cookie round-trip.
  const setAuthUser = useCallback((u: AuthUser) => {
    setUser(u);
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    window.location.href = import.meta.env.BASE_URL || "/";
  }, []);

  const login = useCallback(() => {
    // No-op: login is now handled by the Login page form
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    refresh,
    setAuthUser,
    logout,
    login,
  };
}
