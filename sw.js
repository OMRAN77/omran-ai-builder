const CACHE_NAME = 'omran-ai-builder-rail-0cff0cf5';
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
  './icons/icon-192-v2.png?icon=gold-20260819',
  './icons/icon-512-v2.png?icon=gold-20260819',
  './icons/apple-touch-icon-v2.png?icon=gold-20260819',
  './icons/favicon-32-v2.png?icon=gold-20260819',
];

// هل هذا تنصيب أول أم تحديث فوق عامل قديم؟ التحديث وحده يعيد تحميل الصفحات.
let __swIsUpdate = false;
self.addEventListener('install', (event) => {
  __swIsUpdate = !!self.registration.active;
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
      icon: './icons/icon-192-v2.png?icon=gold-20260819',
      badge: './icons/icon-192-v2.png?icon=gold-20260819',
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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
    // جوهر «التحديث يوصل كل الأجهزة»: الصفحات العالقة على نسخة قديمة لا
    // تملك كود إعادة التحميل، فالعامل الجديد يعيد تحميلها بنفسه لحظة
    // توليه — بلا أي خطوة من المستخدم. التنصيب الأول لا يعيد تحميل شيء.
    if (__swIsUpdate) {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) {
        /* v653 — الملاحة القسريّة كانت تمسح ردًّا يُكتب أمام المستخدم. الآن
           النافذة المرئيّة لا تُقاطَع: تصلها الرسالة فقط وهي تقرّر اللحظة
           الآمنة. النوافذ المخفيّة تُحدَّث فورًا كما كان. */
        var __vis = 'visible';
        try { __vis = c.visibilityState || 'visible'; } catch (e) { /* بعض المتصفّحات لا تكشفها */ }
        if (__vis !== 'visible') {
          try { await c.navigate(c.url); } catch (e) { /* iOS Safari لا يدعم client.navigate إطلاقًا */ }
        }
        // v-boot-watchdog3: قناة الرسائل تعمل على iOS — selfdiag (يُحمَّل مبكرًا
        // حتى في صفحة نصف معطوبة) يستقبلها ويعيد التحميل فورًا.
        try { c.postMessage({ type: 'omran-reload' }); } catch (e) { /* احتياط فقط */ }
      }
    }
  })());
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

// Share Target: المستخدم يضغط "مشاركة" على لقطة شاشة من هاتفه → تصل هنا كـPOST.
// هذا الاستثناء الوحيد لقاعدة "SW لا يلمس POST" — موثّق هنا عمداً.
// الصورة تُخزَّن مؤقتاً في cache خاص (sg-share) ثم تُحذف بعد 5 دقائق.
self.addEventListener('fetch', (shareEvent) => {
  const req = shareEvent.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.searchParams.get('share') === 'screen-guide') {
    shareEvent.respondWith((async () => {
      try {
        const fd = await req.formData();
        const file = fd.get('screenshot') || fd.getAll('files')[0] || null;
        if (file && file instanceof File) {
          const cache = await caches.open('sg-share');
          await cache.put('/__sg_shared_image__', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }));
          // حذف تلقائي بعد 5 دقائق حتى لا تبقى الصورة في الكاش
          setTimeout(() => caches.open('sg-share').then(c => c.delete('/__sg_shared_image__')).catch(() => {}), 5 * 60 * 1000);
        }
      } catch (e) { /* فشل صامت — الصفحة تُفتح عادياً */ }
      return Response.redirect('./?share=screen-guide', 303);
    })());
    return;
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never touch POST/PUT (auth, AI calls)

  const url = new URL(req.url);

  // v-pdf-noleave: روابط التنزيل /p/<id> (PDF) و /i/<id> (صور) لا يلمسها
  // العامل أبدًا — كان مسار «القشرة» يرجّع index.html كاحتياط عند أي تعثّر،
  // فيهبط المستخدم على صفحة المحادثة بدل ملفه. المتصفح يتولاها مباشرة.
  if (/^\/(p|i)\/[A-Za-z0-9]/.test(url.pathname)) return;

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
  // v669: الجوال كان يعلق على نسخة قديمة — القشرة (index/البندل) تُجلب دائماً
  // من الشبكة متجاوزةً كاش المتصفح، والكاش يبقى فقط احتياط انقطاع النت.
  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
