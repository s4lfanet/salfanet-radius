const CACHE_NAME = 'salfanet-pwa-v2';
const OFFLINE_URL = '/offline';
const STATIC_ASSETS = [
  OFFLINE_URL,
  '/manifest.json',
  '/pwa/icon-192.svg',
  '/pwa/icon-512.svg',
  '/pwa/badge.svg',
];

function offlineFallbackResponse(returnUrl) {
  const retUrl = returnUrl || '/';
  return new Response(
    `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Salfanet — Offline</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, #0b2942, #020912 70%); color: #e6faff; font-family: Arial, sans-serif; }
      main { width: min(92vw, 440px); padding: 32px; border: 1px solid rgba(34, 211, 238, 0.28); border-radius: 24px; background: rgba(2, 13, 22, 0.92); box-shadow: 0 20px 60px rgba(6, 182, 212, 0.18); }
      h1 { margin: 0 0 12px; font-size: 26px; }
      p { margin: 0 0 10px; color: rgba(230, 250, 255, 0.78); line-height: 1.6; }
      a { display: inline-block; margin-top: 16px; padding: 12px 18px; border-radius: 999px; color: #041018; background: linear-gradient(135deg, #67e8f9, #06b6d4); text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>⚡ Sedang Offline</h1>
      <p>Tidak bisa terhubung ke server Salfanet. Periksa koneksi internet lalu coba lagi.</p>
      <a href="${retUrl}">Coba lagi</a>
    </main>
  </body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch {
        const cachedPage = await caches.match(request);
        if (cachedPage) {
          return cachedPage;
        }

        const offlinePage = await caches.match(OFFLINE_URL);
        // Pass the original URL as return URL for the "try again" link
        return offlinePage || offlineFallbackResponse(new URL(request.url).pathname);
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      if (cached) {
        fetch(request).then((response) => cache.put(request, response.clone())).catch(() => undefined);
        return cached;
      }

      const networkResponse = await fetch(request);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    })());
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload = {};

  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Salfanet', body: event.data.text() };
  }

  const title = payload.title || 'Salfanet';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/pwa/icon-192.svg',
    badge: payload.badge || '/pwa/badge.svg',
    image: payload.image,
    tag: payload.tag || 'salfanet-notification',
    requireInteraction: Boolean(payload.requireInteraction),
    data: payload.data || { url: '/customer' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || '/customer', self.location.origin).toString();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});