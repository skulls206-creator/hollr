import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { setPresenceRefetchTrigger } from './use-realtime';

const BASE = import.meta.env.BASE_URL;
const POLL_INTERVAL = 60_000; // 60s

export function useDockPresence(serverIds: string[]) {
  const setPresenceCounts = useAppStore(s => s.setPresenceCounts);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idsKey = serverIds.join(',');

  const fetchCounts = useCallback(async () => {
    if (!idsKey) return;
    try {
      const r = await fetch(`${BASE}api/presence/summary?serverIds=${idsKey}`, { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        setPresenceCounts(data);
      }
    } catch { /* non-fatal */ }
  }, [idsKey, setPresenceCounts]);

  // Register as the realtime refetch trigger so PRESENCE_UPDATE events cause an immediate refresh
  useEffect(() => {
    setPresenceRefetchTrigger(fetchCounts);
    return () => setPresenceRefetchTrigger(null);
  }, [fetchCounts]);

  useEffect(() => {
    if (!idsKey) return;

    fetchCounts();
    timerRef.current = setInterval(fetchCounts, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [idsKey, fetchCounts]);
}
