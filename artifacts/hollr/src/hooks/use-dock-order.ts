import { useEffect, useState } from 'react';

// Dock layout saves mixed server+app IDs here
const DOCK_KEY = 'hollr:dock:order';
// Classic layout saves KHURK-only app IDs here
const CLASSIC_KHURK_KEY = 'hollr:sidebar:khurk-order';

/**
 * Read the best available app order from localStorage.
 * Dock key is preferred because it reflects the most recent explicit reorder.
 * Falls back to the classic sidebar's KHURK key so classic-layout users also
 * get their order mirrored in the dashboard.
 */
function readOrder(): string[] {
  try {
    const dock = localStorage.getItem(DOCK_KEY);
    if (dock) return JSON.parse(dock) ?? [];
  } catch {}
  try {
    const classic = localStorage.getItem(CLASSIC_KHURK_KEY);
    if (classic) return JSON.parse(classic) ?? [];
  } catch {}
  return [];
}

/**
 * Returns the current ordered list of entry IDs from whichever layout is active.
 *
 * In dock mode: contains server IDs + app IDs mixed (DockBar saves both).
 * In classic mode: contains only KHURK app IDs (ServerSidebar saves apps only).
 *
 * Both layouts dispatch the same 'hollr:dock-order' CustomEvent when the order
 * changes, so consumers get a live update immediately without needing to poll.
 *
 * DashboardView filters server IDs out itself, so both formats work fine there.
 */
export function useDockOrder(): string[] {
  const [order, setOrder] = useState<string[]>(readOrder);

  useEffect(() => {
    const onSameTab = (e: Event) => {
      setOrder((e as CustomEvent<string[]>).detail);
    };
    const onCrossTab = (e: StorageEvent) => {
      if (e.key === DOCK_KEY || e.key === CLASSIC_KHURK_KEY) {
        setOrder(readOrder());
      }
    };
    window.addEventListener('hollr:dock-order', onSameTab);
    window.addEventListener('storage', onCrossTab);
    return () => {
      window.removeEventListener('hollr:dock-order', onSameTab);
      window.removeEventListener('storage', onCrossTab);
    };
  }, []);

  return order;
}
