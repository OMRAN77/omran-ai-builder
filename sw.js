// ملاحظة: BUILD_ID هو ما يجب أن يتغيّر عند كل إصدار (اربطه بسكربت البناء).
// الأصول الثابتة في كاش منفصل لا يُمسح مع كل إصدار.
const BUILD_ID     = 'd792ab56-034b86ff';
const SHELL_CACHE  = 'shell-' + BUILD_ID;   // القشرة + الحزمة — تُمسح كل إصدار
const ASSET_CACHE  = 'assets-v1';           // صور وأيقونات — تُمسح عند تغيّرها فقط

// الملفان الحرجان: فشلهما ليس تدهورًا للعمل دون اتصال بل تعطيل كامل.
const CRITICAL = [
  './',
  './index.html',
  './js/app.bundle.js',
];

const SHELL_ASSETS = [
  './css/tool-card-images.css?v=1',
  './js/tool-card-images.js?v=1',
  './templates-data.js',
  './manifest.json',
];

const ASSET_FILES = [
  './assets/tool-cards/portrait.png',
  './assets/tool-cards/suggestions.png',
  './assets/tool-cards/video.png',
  './assets/tool-cards/decor.png',
  './assets/tool-cards/fashion.png',
  './assets/tool-cards/style.png',
  './assets/tool-cards/ads.png',
  './assets/tool-cards/sections/stocks.png',
  './assets/tool-cards/sections/tv.png',
  './assets/tool-cards/sections/qibla.png',
  './assets/tool-cards/sections/expense.png',
  './assets/tool-cards/sections/education.png',
  './assets/tool-cards/sections/construction.png',
  './assets/tool-cards/sections/religion.png',
  './assets/tool-cards/sections/cv.png',
  './assets/tool-cards/sections/docs.png',
  './assets/tool-cards/sections/feedback.png',
  './assets/tool-cards/sections/email.png',
  './icons/icon-192-v2.png?icon=gold-20260819',
  './icons/icon-512-v2.png?icon=gold-20260819',
  './icons/apple-touch-icon-v2.png?icon=gold-20260819',
  './icons/favicon-32-v2.png?icon=gold-20260819',
];

// هل هذا تنصيب أول أم تحديث فوق عامل قديم؟ التحديث وحده يعيد تحميل الصفحات.
let __swIsUpdate = false;

self.addEventListener('install', (event) => {
  __swIsUpdate = !!self.registration.active;
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    const assets = await caches.open(ASSET_CACHE);

    // واحدًا واحدًا لا addAll: ملف 404 واحد كان يُسقط التخزين المسبق كلّه.
    await Promise.all([
      ...CRITICAL.map((u) => shell.add(u).catch((e) =>
        console.warn('[sw] precache critical failed:', u, e && e.message))),
      ...SHELL_ASSETS.map((u) => shell.add(u).catch((e) =>
        console.warn('[sw] precache skipped:', u, e && e.message))),
      ...ASSET_FILES.map((u) => assets.add(u).catch((e) =>
        console.warn('[sw] asset skipped:', u, e && e.message))),
    ]);

    // تحقّق من الحرِج: بلا index.html أو الحزمة يصبح الاحتياط وهمًا
    // ويظهر bundle=false عند أول انقطاع. محاولة ثانية قبل الاستسلام.
    const missing = [];
    for (const u of ['./index.html', './js/app.bundle.js']) {
      if (!(await shell.match(u))) missing.push(u);
    }
    if (missing.length) {
      console.error('[sw] القشرة ناقصة:', missing.join(', '));
      await Promise.all(missing.map((u) => shell.add(u).catch(() => {})));
    }

    // skipWaiting بعد اكتمال التخزين لا قبله: كان العامل الجديد يتولّى
    // ويمسح الكاش القديم بينما الجديد ما زال ناقصًا — نافذة الصفحة البيضاء.
    await self.skipWaiting();
  })());
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
      data: { url: data.url || '' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // v-news-push: إشعار خبر عاجل يفتح رابط الخبر نفسه؛ التذكيرات تفتح التطبيق
  const url = (event.notification && event.notification.data && event.notification.data.url) || '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      if (url) return self.clients.openWindow(url);
      const existing = clientsArr.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // امسح قشرات الإصدارات السابقة فقط — لا تُهدر صور لم تتغيّر.
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();

    // جوهر «التحديث يوصل كل الأجهزة»: الصفحات العالقة على نسخة قديمة لا
    // تملك كود إعادة التحميل، فالعامل الجديد يعيد تحميلها بنفسه لحظة
    // توليه. التنصيب الأول لا يعيد تحميل شيء.
    if (__swIsUpdate) {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) {
        /* v653 — الملاحة القسريّة كانت تمسح ردًّا يُكتب أمام المستخدم. النافذة
           المرئيّة لا تُقاطَع: تصلها رسالة مؤجَّلة وهي تقرّر اللحظة الآمنة. */
        let vis = 'visible';
        try { vis = c.visibilityState || 'visible'; } catch (e) { /* بعض المتصفّحات لا تكشفها */ }

        if (vis !== 'visible') {
          try { await c.navigate(c.url); } catch (e) { /* iOS Safari لا يدعم client.navigate إطلاقًا */ }
          try { c.postMessage({ type: 'omran-reload', force: true }); } catch (e) { /* احتياط */ }
        } else {
          // v-boot-watchdog3: قناة الرسائل تعمل على iOS. force:false يعني
          // «حدِّث حين تأمن» — على المستقبِل ألا يعيد التحميل أثناء بثّ جارٍ.
          try { c.postMessage({ type: 'omran-reload', force: false }); } catch (e) { /* احتياط */ }
        }
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
    url.pathname.endsWith('.webp') || /* v-picker-load: معاينات الأنماط تُخزَّن بعد أول تحميل */
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('manifest.json')
  );
}

// استجابة صالحة للتخزين فقط: صفحة خطأ 500 أو اعتراض شبكة كانت تُحفظ
// وتصبح هي الاحتياط الدائم.
function cacheable(res) {
  return res && res.ok && res.status === 200 && res.type !== 'opaque';
}

// v-vg-removed: مُعالج Share Target للمرشد البصري حُذف مع حذف الميزة نهائيًا.

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never touch POST/PUT (auth, AI calls)

  const url = new URL(req.url);

  // v-pdf-noleave: روابط التنزيل /p/<id> (PDF) و /i/<id> (صور) لا يلمسها
  // العامل أبدًا — كان مسار «القشرة» يرجّع index.html كاحتياط عند أي تعثّر،
  // فيهبط المستخدم على صفحة المحادثة بدل ملفه.
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

  // الأصول الثابتة: stale-while-revalidate — تُعرض فورًا من الكاش وتُحدَّث
  // في الخلفية، فبطاقة ديكور بُدّلت تصل في الزيارة التالية بلا إصدار جديد.
  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => { if (cacheable(res)) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      return cached || (await network) || Response.error();
    })());
    return;
  }

  // App shell / navigation: network-first so updates land immediately,
  // falling back to the cached shell whenever there's no connection.
  // v669: الجوال كان يعلق على نسخة قديمة — القشرة (index/البندل) تُجلب دائماً
  // من الشبكة متجاوزةً كاش المتصفح، والكاش يبقى فقط احتياط انقطاع النت.
  event.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-store' });
      if (cacheable(res)) {
        const cache = await caches.open(SHELL_CACHE);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (e) {
      const cache = await caches.open(SHELL_CACHE);
      return (await cache.match(req))
          || (await cache.match('./index.html'))
          || new Response(
               '<!doctype html><meta charset=utf-8><body style="font:16px system-ui;padding:2rem;text-align:center">'
               + 'تعذّر تحميل التطبيق ولا يوجد اتصال. أعد المحاولة.',
               { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
             );
    }
  })());
});
