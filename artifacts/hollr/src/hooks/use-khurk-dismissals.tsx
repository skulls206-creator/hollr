import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { KHURK_APPS } from '@/lib/khurk-apps';

const BASE = import.meta.env.BASE_URL;

export function useKhurkDismissals() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchDismissed = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${BASE}api/khurk-apps/dismissed`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDismissed(new Set(data.dismissed ?? []));
      }
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => { fetchDismissed(); }, [fetchDismissed]);

  const dismissOne = useCallback(async (appId: string) => {
    setDismissed(prev => new Set([...prev, appId]));
    await fetch(`${BASE}api/khurk-apps/dismiss/${appId}`, { method: 'POST', credentials: 'include' });
  }, []);

  const dismissAll = useCallback(async () => {
    setDismissed(new Set(KHURK_APPS.map(a => a.id)));
    await fetch(`${BASE}api/khurk-apps/dismiss-all`, { method: 'POST', credentials: 'include' });
  }, []);

  const restoreAll = useCallback(async () => {
    setDismissed(new Set());
    await fetch(`${BASE}api/khurk-apps/dismissed`, { method: 'DELETE', credentials: 'include' });
  }, []);

  const visibleApps = useMemo(
    () => KHURK_APPS.filter(a => !dismissed.has(a.id)),
    [dismissed]
  );
  const hasAnyDismissed = dismissed.size > 0;

  return { visibleApps, hasAnyDismissed, dismissOne, dismissAll, restoreAll };
}
