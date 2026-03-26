import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@workspace/replit-auth-web";

const BASE = import.meta.env.BASE_URL;

export interface NotificationPrefs {
  muteDms: boolean;
  mutedChannelIds: string[];
}

export interface PushDevice {
  id: string;
  label: string | null;
  quiet: boolean;
  createdAt: string;
  endpoint: string;        // full endpoint — used to identify "this device"
  endpointHint: string;    // last 16 chars for display
}

export interface UsePushNotifications {
  permission: NotificationPermission | "unsupported";
  isSubscribed: boolean;
  isLoading: boolean;
  prefs: NotificationPrefs;
  devices: PushDevice[];
  currentEndpoint: string | null;   // endpoint of this browser's active subscription
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  updatePrefs: (prefs: Partial<NotificationPrefs>) => Promise<void>;
  updateDevice: (id: string, patch: { label?: string | null; quiet?: boolean }) => Promise<void>;
  removeDevice: (id: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Guess a friendly device name from the browser user-agent
function guessDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) {
    if (/Mobile/i.test(ua)) return "Android Phone";
    return "Android Tablet";
  }
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux";
  return "Browser";
}

export function usePushNotifications(): UsePushNotifications {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>({ muteDms: false, mutedChannelIds: [] });
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [devices, setDevices] = useState<PushDevice[]>([]);

  // Load VAPID public key
  useEffect(() => {
    fetch(`${BASE}api/push/vapid-public-key`)
      .then((r) => r.json())
      .then((d) => setVapidKey(d.publicKey ?? null))
      .catch(() => {});
  }, []);

  // Check current subscription state
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscription(sub);
      });
    });
  }, []);

  // Re-check Notification.permission whenever tab becomes visible (user may have granted it elsewhere)
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    const onVisible = () => {
      const current = Notification.permission;
      setPermission((prev) => (prev !== current ? current : prev));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!user) return;
    try {
      const r = await fetch(`${BASE}api/push/devices`, { credentials: "include" });
      if (r.ok) setDevices(await r.json());
    } catch {}
  }, [user]);

  // Load notification preferences + device list when logged in
  useEffect(() => {
    if (!user) return;
    fetch(`${BASE}api/push/preferences`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setPrefs(d); })
      .catch(() => {});
    refreshDevices();
  }, [user, refreshDevices]);

  // Auto-subscribe: if user already granted permission but has no push subscription registered, silently register them
  const [autoSubAttempted, setAutoSubAttempted] = useState(false);
  useEffect(() => {
    if (autoSubAttempted) return;
    if (!vapidKey || !user || permission !== "granted" || subscription !== null || isLoading) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setAutoSubAttempted(true);
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });
        setSubscription(sub);
        const json = sub.toJSON();
        await fetch(`${BASE}api/push/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, label: guessDeviceLabel() }),
        });
        await refreshDevices();
      } catch {}
    })();
  }, [vapidKey, user, permission, subscription, isLoading, autoSubAttempted, refreshDevices]);

  const subscribe = useCallback(async () => {
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setIsLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      setSubscription(sub);

      const json = sub.toJSON();
      await fetch(`${BASE}api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          label: guessDeviceLabel(),
        }),
      });
      await refreshDevices();
    } catch (err) {
      console.error("[push] subscribe failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [vapidKey, refreshDevices]);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;
    setIsLoading(true);
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      setSubscription(null);
      await fetch(`${BASE}api/push/subscribe`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ endpoint }),
      });
      await refreshDevices();
    } catch (err) {
      console.error("[push] unsubscribe failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [subscription, refreshDevices]);

  const updatePrefs = useCallback(async (partial: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    await fetch(`${BASE}api/push/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(next),
    }).catch(() => {});
  }, [prefs]);

  const updateDevice = useCallback(async (id: string, patch: { label?: string | null; quiet?: boolean }) => {
    setDevices((prev) => prev.map((d) => d.id === id ? { ...d, ...patch } : d));
    await fetch(`${BASE}api/push/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  const removeDevice = useCallback(async (id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
    await fetch(`${BASE}api/push/devices/${id}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {});
  }, []);

  return {
    permission,
    isSubscribed: !!subscription,
    isLoading,
    prefs,
    devices,
    currentEndpoint: subscription?.endpoint ?? null,
    subscribe,
    unsubscribe,
    updatePrefs,
    updateDevice,
    removeDevice,
    refreshDevices,
  };
}
