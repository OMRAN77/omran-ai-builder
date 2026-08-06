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
function logError(scope, err, meta) {
  try {
    const key = String(scope || 'unknown');
    const msg = String((err && err.message) || err || 'unknown').slice(0, 300);
    const site = key + '|' + msg;
    seen[site] = (seen[site] || 0) + 1;
    if (seen[site] > MAX_PER_SITE) return;
    console.error('[swallowed] ' + key + ': ' + msg + brief(meta));
    if (reported >= MAX_REPORTED) return;
    reported++;
    // require متأخّر: لا كلفة إقلاع على المسار السليم، ولا دورة استيراد.
    const { reportError } = require('./_errors.js');
    Promise.resolve(reportError(err, { route: 'swallowed:' + key, action: (meta && meta.action) || null }))
      .catch(() => { /* الإبلاغ نفسه لا يجوز أن يصير خطأً جديدًا */ });
  } catch (e) {
    /* لا استثناء يخرج من هنا أبدًا — انظر رأس الملف. */
  }
}

module.exports = { logError };
