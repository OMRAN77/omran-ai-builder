// api/_lib/log-error.js — تسجيلٌ من داخل `catch`، بلا أن يوقف شيئًا.
//
// `reportError` في `_errors.js` لا يصلح للنداء من داخل `catch {}`: هو async
// وينتظر الشبكة، والمسار الذي فشل أصلًا لا يجوز أن ينتظر تسجيل فشله. وهذه
// نسخة «أطلق وانسَ»: لا وعدًا تُرجعه لتنتظره، ولا استثناءً ترميه أبدًا — لأنّها
// تُنادى من داخل catch، ورميُها استثناءً يحوّل خطأً مبتلعًا إلى خطأ ينتشر.
//
// هي نظير `window.__swallow` في الواجهة (js/app-00-swallow.js) لكن للخادم:
// **لا تغيّر مسار التنفيذ إطلاقًا**. الخطأ يبقى مبتلعًا كما كان، لكنّه يُرى.
const MAX_PER_SITE = 3;    // الموضع نفسه لا يُسجَّل أكثر من ثلاث مرّات
const MAX_REPORTED = 20;   // سقف ما يُكتب في سجل المالك لكل عملية تشغيل
const seen = Object.create(null);
let reported = 0;

function brief(meta) {
  try { return meta ? ' ' + JSON.stringify(meta).slice(0, 200) : ''; } catch (e) { return ''; }
}

/**
 * @param {string} scope  اسم الموضع: 'ملف/عملية' — يظهر كما هو في سجل المالك.
 * @param {any}    err    ما أمسكه catch.
 * @param {object} [meta] حقائق تُعين على الفهم، بلا أسرار ولا بيانات مستخدم.
 */
const FLUSH_TIMEOUT_MS = 1500; // على serverless لا ننتظر Upstash المتعطّل أكثر من هذا

// النواة المشتركة: تسجّل الموضع (متزامنًا في سجل Vercel) وتُطلق الحفظ في KV،
// وتُعيد وعد الحفظ (reportError) لمن يريد انتظاره — أو null إن لم يُطلَق شيء
// (تجاوز السقف، أو الموضع تكرّر فوق الحد). لا ترمي استثناءً أبدًا.
function record(scope, err, meta) {
  try {
    const key = String(scope || 'unknown');
    const msg = String((err && err.message) || err || 'unknown').slice(0, 300);
    const site = key + '|' + msg;
    seen[site] = (seen[site] || 0) + 1;
    if (seen[site] > MAX_PER_SITE) return null;
    console.error('[swallowed] ' + key + ': ' + msg + brief(meta));
    if (reported >= MAX_REPORTED) return null;
    reported++;
    // require متأخّر: لا كلفة إقلاع على المسار السليم، ولا دورة استيراد.
    const { reportError } = require('./_errors.js');
    return Promise.resolve(reportError(err, { route: 'swallowed:' + key, action: (meta && meta.action) || null }))
      .catch(() => { /* الإبلاغ نفسه لا يجوز أن يصير خطأً جديدًا */ });
  } catch (e) {
    /* لا استثناء يخرج من هنا أبدًا — انظر رأس الملف. */
    return null;
  }
}

// «أطلِق وانسَ»: للمسارات التي لا ينتظر ردّها الحفظ (خادم دائم، أو رد لا يعتمد عليه).
function logError(scope, err, meta) {
  record(scope, err, meta);
}

// نسخة تُنتظَر: على serverless (Vercel) يتجمّد العامل بعد `res.json()` فيُسقَط أيّ
// وعد معلّق — فكتابة KV غير المنتظَرة تضيع ولا تبلغ لوحة المالك. هنا ننتظر الحفظ
// قبل الرد، لكن بسقف زمني (Promise.race) كي لا يعلّق ردّ المستخدم إذا تعطّل Upstash.
// لا ترمي استثناءً أبدًا.
function logErrorAndFlush(scope, err, meta) {
  let p = null;
  try { p = record(scope, err, meta); } catch (e) { p = null; }
  if (!p) return Promise.resolve();
  return new Promise(function (resolve) {
    const t = setTimeout(resolve, FLUSH_TIMEOUT_MS);
    p.then(function () { clearTimeout(t); resolve(); }, function () { clearTimeout(t); resolve(); });
  });
}

module.exports = { logError, logErrorAndFlush };
