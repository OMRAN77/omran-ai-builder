/* ───────── __swallow: لا خطأ يختفي بلا أثر ─────────
 *
 * كان في الواجهة 468 كتلة `catch(e){}` فارغة تمامًا. معظمها متعمّد — فشل
 * `localStorage` أو `scrollIntoView` لا يجب أن يوقف التطبيق. لكن الفارغة
 * تعني أن الخطأ **لا يُرى إطلاقًا**: لا في الطرفية، ولا في تتبّع الأخطاء
 * الذي ركّبناه. وهذا بالضبط كيف عاش خطأ `js/app.js` في الـ service worker
 * شهورًا وقتل ميزة العمل دون اتصال بلا أن يلاحظ أحد.
 *
 * القاعدة هنا: **لا نغيّر مسار التنفيذ إطلاقًا**. الخطأ يبقى مبتلعًا كما كان،
 * لكنه يُسجَّل. تحويل `catch(e){}` إلى `catch(e){ throw e; }` كان سيكسر
 * التطبيق في مئة مكان؛ تحويلها إلى تسجيل لا يكسر شيئًا.
 *
 * والتصعيد انتقائي: المسارات التي يعني فشلها **فقدان بيانات أو مال** ترسل
 * إلى تتبّع الأخطاء. الباقي يبقى في الطرفية — وإلا أغرق 468 موضعًا السجل.
 */
(function () {
  'use strict';

  var seen = Object.create(null);
  var MAX_PER_SITE = 3;      // نفس الموضع لا يُسجَّل أكثر من ثلاث مرات
  var reported = 0;
  var MAX_REPORTED = 12;     // سقف ما يُرسل للخادم في الجلسة الواحدة

  /* المسارات التي يعني فشلها خسارة حقيقية — لا مجرد تجميل. */
  var CRITICAL = /^(auth|save|sync|points|pay|chats|upload|edu)\b/;

  function report(ctx, err) {
    if (reported >= MAX_REPORTED) return;
    reported++;
    try {
      fetch('/api/system?action=client-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '[swallowed] ' + ctx + ': ' + String((err && err.message) || err),
          source: 'swallow',
          stack: (err && err.stack) ? String(err.stack).slice(0, 800) : null,
          url: location.href,
          ua: navigator.userAgent,
        }),
        keepalive: true,
      }).catch(function () { /* الإبلاغ نفسه لا يجوز أن يوقف شيئًا */ });
    } catch (e) { /* المتصفح بلا fetch */ }
  }

  window.__swallow = function (err, ctx) {
    try {
      ctx = ctx || 'unknown';
      seen[ctx] = (seen[ctx] || 0) + 1;
      if (seen[ctx] > MAX_PER_SITE) return;
      console.warn('[swallowed] ' + ctx + ':', (err && err.message) || err);
      if (CRITICAL.test(ctx)) report(ctx, err);
    } catch (e) {
      /* بلا استثناء هنا أبدًا — هذه الدالة تُستدعى من داخل catch،
         ورميها استثناءً يحوّل خطأً مبتلعًا إلى خطأ ينتشر. */
    }
  };
})();
