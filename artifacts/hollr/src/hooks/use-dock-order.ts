import { useEffect, useState } from 'react';

const LS_KEY = 'hollr:dock:order';

function readOrder(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') ?? [];
  } catch { return []; }
}

/**
 * Returns the current dock order (array of entry IDs — servers + apps mixed).
 * Updates in real-time when the dock saves a new order (same tab) or when
 * another tab changes localStorage (cross-tab via the storage event).
 */
export function useDockOrder(): string[] {
  const [order, setOrder] = useState<string[]>(readOrder);

  useEffect(() => {
    const onSameTab = (e: Event) => {
      setOrder((e as CustomEvent<string[]>).detail);
    };
    const onCrossTab = (e: StorageEvent) => {
      if (e.key === LS_KEY && e.newValue) {
        try { setOrder(JSON.parse(e.newValue)); } catch {}
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
