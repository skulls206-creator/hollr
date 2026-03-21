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
    data: { url: data.url || "/" },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If the app is already open, focus it and post a navigation message
        const existing = windowClients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.postMessage({ type: "NOTIFICATION_NAVIGATE", url: targetUrl });
        } else {
          self.clients.openWindow(targetUrl);
        }
      })
  );
});
