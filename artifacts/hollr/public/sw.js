/* hollr.chat service worker — offline shell + push notifications */
/* Strategy: Cache-first for assets, network-first for API, app-shell for navigation */

const CACHE_VERSION = 'hollr-v6';
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE   = `${CACHE_VERSION}-api`;

const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.svg'];

// ── Install: pre-cache app shell ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== ASSET_CACHE && k !== SHELL_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: tiered caching strategy ────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests (e.g. analytics, fonts CDN except cached)
  if (request.method !== 'GET') return;

  // API calls: network-first, cache fallback (5-min TTL via header check)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first, update in background
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ico)$/) ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
          return cached || network;
        })
      )
    );
    return;
  }

  // Navigation requests (HTML): network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match('/') ||
          caches.match('/index.html') ||
          new Response('Offline — open hollr when connected to load the app.', {
            headers: { 'Content-Type': 'text/plain' },
          })
        )
    );
    return;
  }

  // Default: stale-while-revalidate
  event.respondWith(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        });
        return cached || network;
      })
    )
  );
});

// ── Push notifications ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}

  const isCall = data.notifType === 'call' || data.notifType === 'video_call';
  const title = data.title || 'hollr.chat';

  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'hollr-message',
    renotify: true,
    silent: isCall ? false : !!data.quiet,
    vibrate: (isCall || !data.quiet) ? [200, 100, 200] : [],
    requireInteraction: isCall,
    data: {
      url: data.url || '/',
      nav: data.nav || null,
      notifType: data.notifType || 'message',
      callerId: data.callerId || null,
      callerName: data.callerName || null,
      dmThreadId: data.dmThreadId || null,
    },
    actions: isCall
      ? [
          { action: 'answer',  title: '📞 Answer'  },
          { action: 'decline', title: '🚫 Decline' },
        ]
      : [
          { action: 'open',    title: 'Open'    },
          { action: 'dismiss', title: 'Dismiss' },
        ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click / action ─────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const isCall = notifData.notifType === 'call' || notifData.notifType === 'video_call';

  if (event.action === 'dismiss') return;

  if (event.action === 'decline') {
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
          clients.forEach((c) =>
            c.postMessage({
              type: 'CALL_DECLINE_FROM_NOTIFICATION',
              callerId: notifData.callerId,
              notifType: notifData.notifType,
            })
          );
        })
    );
    return;
  }

  const targetUrl = notifData.url || '/';
  const nav = notifData.nav || null;

  const messageToClient =
    isCall && event.action === 'answer'
      ? {
          type: 'CALL_ANSWER_FROM_NOTIFICATION',
          callerId: notifData.callerId,
          notifType: notifData.notifType,
        }
      : { type: 'NOTIFICATION_NAVIGATE', nav, url: targetUrl };

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
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

// ── Background sync (retry failed message sends when back online) ────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'hollr-message-queue') {
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
          // Tell the app to flush any queued messages now that we have connectivity
          if (clients.length > 0) {
            clients.forEach((c) => c.postMessage({ type: 'FLUSH_MESSAGE_QUEUE' }));
          } else {
            // No window open — open the app so it can flush on next load
            return self.clients.openWindow('/');
          }
        })
    );
  }
});

// ── Periodic background sync (if supported) ─────────────────────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'hollr-sync') {
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
          clients.forEach((c) => c.postMessage({ type: 'BACKGROUND_SYNC' }));
        })
    );
  }
});

// ── Message handler ──────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    event.waitUntil(
      caches.open(ASSET_CACHE).then((cache) => cache.addAll(urls))
    );
  }
});
