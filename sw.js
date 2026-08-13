const CACHE_NAME = 'omran-ai-builder-2518cf28';
const STATIC_ASSETS = [
  './',
  './index.html',
  // was './js/app.js' — that file has never existed (the bundle is
  // app.bundle.js). Because cache.addAll() is all-or-nothing, that single
  // wrong path rejected the whole precache on every install, and the
  // .catch(() => {}) below swallowed the error silently.
  './js/app.bundle.js',
  './templates-data.js',
  './manifest.json',
  './icons/icon-192-v2.png',
  './icons/icon-512-v2.png',
  './icons/apple-touch-icon-v2.png',
  './icons/favicon-32-v2.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Added one by one on purpose: a single 404 must degrade the offline
      // shell, not wipe it out entirely the way addAll() does.
      Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[sw] precache skipped:', url, err && err.message);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// مها reminders arrive as real Web Push messages so they wake the device even
// with the app fully closed (e.g. "ذكرني قبل صلاة العصر" / "صحّيني للدوام").
self.addEventListener('push', (event) => {
  let data = { title: 'مها', body: 'تذكير' };
  try { if (event.data) data = event.data.json(); } catch (e) { /* حِمْل الدفع ليس JSON — يمضي بالتذكير الافتراضي أعلاه */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'مها', {
      body: data.body || 'تذكير',
      icon: './icons/icon-192-v2.png',
      badge: './icons/icon-192-v2.png',
      tag: 'maha-reminder-' + Date.now(),
      silent: false,
      vibrate: [300, 150, 300, 150, 300],
      requireInteraction: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isStaticAsset(url) {
  return (
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('manifest.json')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never touch POST/PUT (auth, AI calls)

  const url = new URL(req.url);

  // API calls: always go to network. If offline, return a friendly JSON
  // error instead of letting the request fail with a generic network error.
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            JSON.stringify({ error: 'offline', message: 'لا يوجد اتصال بالإنترنت' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          )
      )
    );
    return;
  }

  // Static assets (icons, manifest): cache-first, they rarely change and
  // this keeps the app instant + fully usable offline.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
            return res;
          })
      )
    );
    return;
  }

  // App shell / navigation: network-first so updates land immediately,
  // falling back to the cached shell whenever there's no connection.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
