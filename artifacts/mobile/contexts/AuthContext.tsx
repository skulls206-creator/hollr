import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setSessionId, getSessionId } from '@/lib/api';
import { connect, disconnect } from '@/lib/ws';
import { registerForPushNotifications, unregisterPushToken, getStoredPushToken } from '@/lib/notifications';
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';

const SESSION_KEY = 'hollr_session_id';
const USER_KEY = 'hollr_user';

interface AuthUser {
  id: string;
  username: string;
  email: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  sessionId: string | null;
  loading: boolean;
  login(identifier: string, password: string): Promise<void>;
  signup(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionId, setSessionIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
    setBaseUrl(`https://${domain}/api`);
    setAuthTokenGetter(() => SecureStore.getItemAsync(SESSION_KEY));
  }, []);

  const applySession = useCallback(async (sid: string, userData: AuthUser) => {
    setSessionId(sid);
    setSessionIdState(sid);
    setUser(userData);
    await SecureStore.setItemAsync(SESSION_KEY, sid);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
    connect(userData.id, sid);
    registerForPushNotifications().catch(() => {});
  }, []);

  const clearSession = useCallback(async () => {
    setSessionId(null);
    setSessionIdState(null);
    setUser(null);
    disconnect();
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
    } catch (e) {
      console.warn("[auth] Failed to clear SecureStore:", e);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const storedSid = await SecureStore.getItemAsync(SESSION_KEY);
        if (!storedSid) {
          setLoading(false);
          return;
        }

        setSessionId(storedSid);

        const { user: currentUser } = await api<{ user: AuthUser | null }>('/auth/user');
        if (currentUser) {
          setSessionIdState(storedSid);
          setUser(currentUser);
          connect(currentUser.id, storedSid);
          registerForPushNotifications().catch(() => {});
        } else {
          await clearSession();
        }
      } catch {
        await clearSession();
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [clearSession]);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await api<{ id: string; username: string; email: string | null; sid: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      }
    );
    const userData: AuthUser = { id: data.id, username: data.username, email: data.email };
    await applySession(data.sid, userData);
  }, [applySession]);

  const signup = useCallback(async (username: string, password: string) => {
    const data = await api<{ id: string; username: string; email: string | null; sid: string }>(
      '/auth/signup',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }
    );
    const userData: AuthUser = { id: data.id, username: data.username, email: data.email };
    await applySession(data.sid, userData);
  }, [applySession]);

  const logout = useCallback(async () => {
    await unregisterPushToken().catch(() => {});
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn("[auth] Logout API error (continuing):", e);
    }
    await clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await api<AuthUser>('/users/me');
      setUser(prev => prev ? { ...prev, ...profile } : prev);
    } catch (e) {
      console.warn("[auth] refreshUser failed:", e);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, sessionId, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
