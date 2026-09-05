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

/* safeParse/safeParseLS: قيمة تالفة واحدة في localStorage كانت تكفي لرمي
 * استثناء في المستوى الأعلى للحزمة فتموت كل الملفّات بعده. هنا يُرجَع
 * البديل، ويُسجَّل الفشل، ويُنظَّف المفتاح التالف فلا يتكرّر كل إقلاع. */
function safeParse(raw, fallback, scope){
  if(raw === null || raw === undefined || raw === '') return fallback;
  try{ var v = JSON.parse(raw); return (v === null || v === undefined) ? fallback : v; }
  catch(e){ window.__swallow(e, 'parse:' + (scope || '?')); return fallback; }
}
function safeParseLS(key, fallback){
  var raw = null;
  try{ raw = localStorage.getItem(key); }catch(e){ window.__swallow(e, 'parse:read:' + key); return fallback; }
  var v = safeParse(raw, undefined, 'ls:' + key);
  if(v !== undefined) return v;
  if(raw !== null && raw !== ''){ try{ localStorage.removeItem(key); }catch(e){ window.__swallow(e, 'parse:purge:' + key); } }
  return fallback;
}

/* v-old-webview (رفض هواوي 4.1 — المراجعة على Mate 30 Pro/EMUI 10 وP20/EMUI 8.1):
   متصفحات هذه الأجهزة أقدم من Chrome 80: بلا AbortSignal.timeout ولا
   Promise.allSettled ولا flatMap — فتسقط الميزات التي تستعملها بصمت. بدائل
   خفيفة تُركَّب فقط عند غيابها؛ المتصفحات الحديثة لا تُمسّ. */
(function(){
  try{
    if(typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function'){
      AbortSignal.timeout = function(ms){ var c = new AbortController(); setTimeout(function(){ try{ c.abort(); }catch(e){ /* guard-ok */ } }, ms); return c.signal; };
    }
    if(typeof Promise !== 'undefined' && typeof Promise.allSettled !== 'function'){
      Promise.allSettled = function(list){ return Promise.all(Array.from(list).map(function(p){ return Promise.resolve(p).then(function(v){ return { status: 'fulfilled', value: v }; }, function(e){ return { status: 'rejected', reason: e }; }); })); };
    }
    if(!Array.prototype.flatMap){
      Object.defineProperty(Array.prototype, 'flatMap', { configurable: true, writable: true, value: function(fn, thisArg){ var out = []; for(var i = 0; i < this.length; i++){ var r = fn.call(thisArg, this[i], i, this); if(Array.isArray(r)) out.push.apply(out, r); else out.push(r); } return out; } });
    }
    if(!Array.prototype.flat){
      Object.defineProperty(Array.prototype, 'flat', { configurable: true, writable: true, value: function(d){ d = (d === undefined) ? 1 : d; var out = []; for(var i = 0; i < this.length; i++){ var v = this[i]; if(Array.isArray(v) && d > 0) out.push.apply(out, v.flat(d - 1)); else out.push(v); } return out; } });
    }
    if(typeof globalThis === 'undefined'){ try{ window.globalThis = window; }catch(e){ /* guard-ok */ } }
  }catch(e){ /* guard-ok: البدائل ترف — غيابها لا يوقف الإقلاع */ }
})();
