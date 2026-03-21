import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@workspace/replit-auth-web";

const BASE = import.meta.env.BASE_URL;

export interface NotificationPrefs {
  muteDms: boolean;
  mutedChannelIds: string[];
}

export interface UsePushNotifications {
  permission: NotificationPermission | "unsupported";
  isSubscribed: boolean;
  isLoading: boolean;
  prefs: NotificationPrefs;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  updatePrefs: (prefs: Partial<NotificationPrefs>) => Promise<void>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
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

  // Load notification preferences from backend when logged in
  useEffect(() => {
    if (!user) return;
    fetch(`${BASE}api/push/preferences`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setPrefs(d); })
      .catch(() => {});
  }, [user]);

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
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      setSubscription(sub);

      const json = sub.toJSON();
      await fetch(`${BASE}api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
    } catch (err) {
      console.error("[push] subscribe failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [vapidKey]);

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
    } catch (err) {
      console.error("[push] unsubscribe failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [subscription]);

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

  return {
    permission,
    isSubscribed: !!subscription,
    isLoading,
    prefs,
    subscribe,
    unsubscribe,
    updatePrefs,
  };
}
