// Service Worker — PMYNET Push Notifications + PWA
// File ini harus ada di /public/sw.js agar scope-nya root (/)

// Install: langsung selesai, tidak blokir apapun
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: klaim semua client
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PMY NET', body: event.data.text() };
  }

  const title = payload.title || 'PMY NET';
  const options = {
    body: payload.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: payload.data?.type || 'general',  // group by type agar tidak spam
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  // Arahkan ke halaman yang relevan berdasarkan tipe notifikasi
  if (data.type === 'payment_received' || data.type === 'bulk_payment_received') {
    url = '/?tab=billing';
  } else if (data.type === 'new_customer_assigned') {
    url = '/kolektor?tab=dashboard';
  } else if (data.type === 'payment_confirmed' || data.type === 'due_soon' || data.type === 'isolated') {
    url = '/portal';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Fokus tab yang sudah terbuka jika ada
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Buka tab baru jika belum ada
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

