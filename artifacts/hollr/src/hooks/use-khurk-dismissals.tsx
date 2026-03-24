import { useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { KHURK_APPS } from '@/lib/khurk-apps';
import { useAppStore } from '@/store/use-app-store';

const BASE = import.meta.env.BASE_URL;

export function useKhurkDismissals() {
  const { user } = useAuth();
  const khurkDismissedIds = useAppStore(s => s.khurkDismissedIds);
  const setKhurkDismissedIds = useAppStore(s => s.setKhurkDismissedIds);

  useEffect(() => {
    if (!user) return;
    fetch(`${BASE}api/khurk-apps/dismissed`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setKhurkDismissedIds(data.dismissed ?? []); })
      .catch(() => {});
  }, [user, setKhurkDismissedIds]);

  const dismissOne = useCallback(async (appId: string) => {
    setKhurkDismissedIds([...khurkDismissedIds, appId]);
    await fetch(`${BASE}api/khurk-apps/dismiss/${appId}`, { method: 'POST', credentials: 'include' });
  }, [khurkDismissedIds, setKhurkDismissedIds]);

  const dismissAll = useCallback(async () => {
    setKhurkDismissedIds(KHURK_APPS.map(a => a.id));
    await fetch(`${BASE}api/khurk-apps/dismiss-all`, { method: 'POST', credentials: 'include' });
  }, [setKhurkDismissedIds]);

  const restoreAll = useCallback(async () => {
    setKhurkDismissedIds([]);
    await fetch(`${BASE}api/khurk-apps/dismissed`, { method: 'DELETE', credentials: 'include' });
  }, [setKhurkDismissedIds]);

  const dismissed = useMemo(() => new Set(khurkDismissedIds), [khurkDismissedIds]);

  const visibleApps = useMemo(
    () => KHURK_APPS.filter(a => !dismissed.has(a.id)),
    [dismissed]
  );
  const hasAnyDismissed = khurkDismissedIds.length > 0;

  return { visibleApps, hasAnyDismissed, dismissOne, dismissAll, restoreAll };
}
