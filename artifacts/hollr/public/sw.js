/* hollr.chat service worker — push notifications + offline shell */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// --- Push notifications ---
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}

  const isCall = data.notifType === "call" || data.notifType === "video_call";
  const title = data.title || "hollr.chat";

  const options = {
    body: data.body || "",
    icon: data.icon || "./icon-192.png",
    badge: "./icon-192.png",
    tag: data.tag || "hollr-message",
    renotify: true,
    silent: isCall ? false : !!data.quiet,       // calls always make sound
    vibrate: (isCall || !data.quiet) ? [200, 100, 200] : [],
    requireInteraction: isCall,                  // call notifs stay until tapped
    data: {
      url: data.url || "/app",
      nav: data.nav || null,
      notifType: data.notifType || "message",
      callerId: data.callerId || null,
      callerName: data.callerName || null,
      dmThreadId: data.dmThreadId || null,
    },
    actions: isCall
      ? [
          { action: "answer",  title: "📞 Answer"  },
          { action: "decline", title: "🚫 Decline" },
        ]
      : [
          { action: "open",    title: "Open"    },
          { action: "dismiss", title: "Dismiss" },
        ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// --- Notification click / action ---
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const isCall = notifData.notifType === "call" || notifData.notifType === "video_call";

  // "dismiss" or "decline" — for calls, tell the app to decline if it's still open
  if (event.action === "dismiss") return;

  if (event.action === "decline") {
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          clients.forEach((c) =>
            c.postMessage({
              type: "CALL_DECLINE_FROM_NOTIFICATION",
              callerId: notifData.callerId,
              notifType: notifData.notifType,
            })
          );
        })
    );
    return;
  }

  // "answer" or clicking the call notification body — open/focus app
  // "open" or clicking a message notification body — open/focus app
  const targetUrl = notifData.url || "/app";
  const nav = notifData.nav || null;

  const messageToClient = isCall && event.action === "answer"
    ? {
        type: "CALL_ANSWER_FROM_NOTIFICATION",
        callerId: notifData.callerId,
        notifType: notifData.notifType,
      }
    : { type: "NOTIFICATION_NAVIGATE", nav, url: targetUrl };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.postMessage(messageToClient);
        } else {
          self.clients.openWindow(targetUrl);
        }
      })
  );
});
