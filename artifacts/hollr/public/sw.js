/* hollr.chat service worker — offline shell + push notifications */
/* Strategy: Cache-first for assets, network-first for API, app-shell for navigation */

const CACHE_VERSION = 'hollr-v12';
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE   = `${CACHE_VERSION}-api`;

const SHELL_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg',
];

const EXTENDED_URLS = [
  '/icon-48.png',
  '/icon-72.png',
  '/icon-96.png',
  '/icon-128.png',
  '/icon-144.png',
  '/icon-152.png',
  '/icon-384.png',
];

// ── Install: pre-cache app shell (resilient — one miss doesn't abort) ────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // Cache critical shell URLs individually — a single failure won't abort install
      await Promise.allSettled(
        SHELL_URLS.map((url) =>
          fetch(url, { cache: 'no-cache' })
            .then((res) => { if (res.ok) cache.put(url, res); })
            .catch(() => { /* non-fatal */ })
        )
      );
      // Cache extended icons in background (best-effort)
      Promise.allSettled(
        EXTENDED_URLS.map((url) =>
          fetch(url)
            .then((res) => { if (res.ok) cache.put(url, res); })
            .catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
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
        .catch(async () => {
          const cached = await caches.match('/');
          if (cached) return cached;
          const offline = await caches.match('/offline.html');
          return offline || new Response('Offline — open hollr when connected to load the app.', {
            headers: { 'Content-Type': 'text/html' },
          });
        })
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
  const isAnswerAction = isCall && event.action === 'answer';

  const messageToClient = isAnswerAction
    ? { type: 'CALL_ANSWER_FROM_NOTIFICATION', callerId: notifData.callerId, callerName: notifData.callerName, dmThreadId: notifData.dmThreadId, notifType: notifData.notifType }
    : { type: 'NOTIFICATION_NAVIGATE', nav, url: targetUrl };

  const openUrl = isAnswerAction
    ? (() => {
        const u = new URL(targetUrl, self.location.origin);
        u.searchParams.set('swCallAction', 'answer');
        u.searchParams.set('swCallerId', notifData.callerId || '');
        u.searchParams.set('swCallerName', notifData.callerName || '');
        u.searchParams.set('swDmThreadId', notifData.dmThreadId || '');
        return u.toString();
      })()
    : targetUrl;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.postMessage(messageToClient);
        } else {
          self.clients.openWindow(openUrl);
        }
      })
  );
});

// ── Notification close (user swiped away a call notification) ───────────────
self.addEventListener('notificationclose', (event) => {
  const notifData = event.notification.data || {};
  const isCall = notifData.notifType === 'call' || notifData.notifType === 'video_call';
  if (!isCall) return;

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
});

// ── Background sync (retry failed message sends when back online) ────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'hollr-message-queue') {
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
          if (clients.length > 0) {
            clients.forEach((c) => c.postMessage({ type: 'FLUSH_MESSAGE_QUEUE' }));
          } else {
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
