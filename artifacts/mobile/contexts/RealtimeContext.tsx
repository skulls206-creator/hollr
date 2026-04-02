import React, { createContext, useContext, useState, useEffect } from 'react';
import { subscribe, onConnectionChange } from '@/lib/ws';
import { useAuth } from './AuthContext';

interface RealtimeContextType {
  connected: boolean;
  subscribe(event: string, handler: (payload: any) => void): () => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const unsub = onConnectionChange(setConnected);
    return unsub;
  }, []);

  return (
    <RealtimeContext.Provider value={{ connected, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}
