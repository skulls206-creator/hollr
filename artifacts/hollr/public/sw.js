/* hollr.chat service worker — push notifications + offline shell */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// --- Push notifications ---
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}

  const title = data.title || "hollr.chat";
  const options = {
    body: data.body || "",
    icon: data.icon || "/images/icon-192.png",
    badge: "/images/icon-192.png",
    tag: data.tag || "hollr-message",
    renotify: true,
    silent: !!data.quiet,                // per-device quiet mode — no sound/vibration
    vibrate: data.quiet ? [] : [100, 50, 100],
    data: {
      url: data.url || "/app",
      nav: data.nav || null,
    },
    // Action buttons — "Open" to jump directly, "Dismiss" to close quietly
    actions: [
      { action: "open",    title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // "dismiss" action just closes — nothing more to do
  if (event.action === "dismiss") return;

  // "open" action or clicking the notification body both navigate
  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || "/app";
  const nav = notifData.nav || null;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.postMessage({ type: "NOTIFICATION_NAVIGATE", nav, url: targetUrl });
        } else {
          self.clients.openWindow(targetUrl);
        }
      })
  );
});
