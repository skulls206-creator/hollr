import { useState, useEffect } from 'react';

const BASE = import.meta.env.BASE_URL;

/**
 * Shared hook — returns the current user's supporter status.
 * null = loading, true/false = resolved.
 * Re-checks on window focus so the badge updates after Stripe checkout.
 */
export function useIsSupporter(): boolean | null {
  const [isSupporter, setIsSupporter] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    const fetchStatus = () => {
      fetch(`${BASE}api/supporter/status`, { credentials: 'include', signal: controller.signal })
        .then(r => r.json())
        .then(data => { if (alive) setIsSupporter(data.isSupporter ?? false); })
        .catch(() => { if (alive) setIsSupporter(false); });
    };

    fetchStatus();
    window.addEventListener('focus', fetchStatus);

    return () => {
      alive = false;
      controller.abort();
      window.removeEventListener('focus', fetchStatus);
    };
  }, []);

  return isSupporter;
}
