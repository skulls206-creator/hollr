import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/use-app-store';

const BASE = import.meta.env.BASE_URL;
const POLL_INTERVAL = 60_000; // 60s

export function useDockPresence(serverIds: string[]) {
  const setPresenceCounts = useAppStore(s => s.setPresenceCounts);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idsKey = serverIds.join(',');

  useEffect(() => {
    if (!idsKey) return;

    const fetchCounts = async () => {
      try {
        const r = await fetch(`${BASE}api/presence/summary?serverIds=${idsKey}`, { credentials: 'include' });
        if (r.ok) {
          const data = await r.json();
          setPresenceCounts(data);
        }
      } catch { /* non-fatal */ }
    };

    fetchCounts();
    timerRef.current = setInterval(fetchCounts, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [idsKey, setPresenceCounts]);
}
