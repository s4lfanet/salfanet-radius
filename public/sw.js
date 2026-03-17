const CACHE_NAME = 'salfanet-pwa-v3';
const OFFLINE_URL = '/offline';
const STATIC_ASSETS = [
  OFFLINE_URL,
  '/manifest.json',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
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
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache each asset individually — one failure won't abort entire install
    await Promise.all(
      STATIC_ASSETS.map((url) =>
        cache.add(url).catch((err) => console.warn('[SW] precache skip:', url, err))
      )
    );
    await self.skipWaiting();
  })());
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

  const data = event.notification.data || {};
  const targetPath = data.url || data.link || '/customer';
  const targetUrl = new URL(targetPath, self.location.origin).href;
  const targetPathname = new URL(targetPath, self.location.origin).pathname;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Find an existing open window whose pathname starts with the target pathname
      const existing = clients.find((c) => {
        try {
          const cu = new URL(c.url);
          return cu.origin === self.location.origin && cu.pathname.startsWith(targetPathname);
        } catch {
          return false;
        }
      });

      if (existing && 'focus' in existing) {
        // Tell the open tab to navigate to the exact URL (e.g. /customer/invoice/123)
        existing.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl, data });
        return existing.focus();
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});