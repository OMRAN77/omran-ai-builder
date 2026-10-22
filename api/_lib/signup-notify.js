'use strict';
// api/_lib/signup-notify.js — v-signup-notify (المالك ١٨ أكتوبر): إيميل للمالك عند كلّ حساب جديد، من المسارات الثلاثة التي تنشئ حسابًا
// (اسم وكلمة مرور في auth.js، وGoogle في auth-google-callback.js، ورمز البريد في auth.js). الدخول والتسجيل المرفوض لا يصلان هنا.
// العنوان من OWNER_NOTIFY_EMAIL في Vercel (المستودع عامّ — لا يُكتب في الكود)، والإرسال بـsendMail (Resend) في الخلفيّة:
// لا يؤخّر التسجيل ولا يوقفه، وفشله يُسجَّل فقط. لا كلمة مرور ولا رمز ولا تجزئة ولا عنوان IP في الرسالة.
const { logError } = require('./log-error.js');

const METHOD_LABEL = { password: 'اسم مستخدم وكلمة مرور', google: 'Google', 'email-otp': 'رمز البريد (بدون كلمة مرور)' };
const NOTE_LABEL = { 'over-deleted': 'فوق حساب محذوف بالمفتاح نفسه' };
const DEDUPE_TTL_SEC = 3600;   // تسجيلان متزامنان بالاسم نفسه (الكتابة ليست SET NX) = رسالة واحدة
const RACE_MS = 15000;         // العلامة نفسها بفارق أكبر في createdAt = حساب أُعيد إنشاؤه (Google فوق محذوف) لا سباق
const COUNT_KEY = 'db/stats/accounts-total', COUNT_TTL_SEC = 86400; // عدّاد يُبذَر من مسح واحد يوميًّا — لا مسح لكلّ تسجيل
const FALLBACK_WAIT_MS = 1200; // بلا waitUntil: انتظار محدود ثمّ يكمل الردّ (الإرسال المتروك بعد الردّ قد يُجمَّد ويضيع)

const _seam = { waitUntil: null }; // للاختبارات وحدها

/* waitUntil منصّة Vercel (ما تفعله @vercel/functions داخليًّا): الوعد يكمل بعد الردّ دون أن يؤخّره */
function platformWaitUntil() {
  try {
    const c = globalThis[Symbol.for('@vercel/request-context')];
    const ctx = c && typeof c.get === 'function' ? c.get() : null;
    return ctx && typeof ctx.waitUntil === 'function' ? (p) => ctx.waitUntil(p) : null;
  } catch (e) { return null; } // guard-ok — خارج Vercel لا سياق طلب: الانتظار المحدود بديله
}

function countryOf(req) {
  // x-vercel-ip-country وحده (تضعه المنصّة)؛ x-country يرسله العميل نفسه
  const code = String((req && req.headers && req.headers['x-vercel-ip-country']) || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return 'غير معروف';
  try { return new Intl.DisplayNames(['ar'], { type: 'region' }).of(code) + ' (' + code + ')'; }
  catch (e) { return code; } // guard-ok — Intl بلا بيانات المناطق: الرمز وحده يكفي
}

function uaeTime(ms) {
  try { return new Intl.DateTimeFormat('ar-AE', { timeZone: 'Asia/Dubai', dateStyle: 'full', timeStyle: 'short' }).format(new Date(ms)); }
  catch (e) { return new Date(ms + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 16) + ' (UTC+4)'; } // guard-ok — Intl ناقص: الساعة يدويًّا
}

/* إجمالي الحسابات (رقم «إجمالي الحسابات» في لوحة المالك نفسه: مفاتيح db/users/ بعد الكتابة). عدّاد INCR؛ غيابه (أوّل مرّة أو بعد يوم)
   يُبذَر بمسح واحد — فسيل تسجيلات لا يمسح Redis كلّه مع كلّ واحد، وانحراف الحذف لا يتجاوز يومًا. */
async function countAccounts(kv) {
  try {
    const n = Number(await kv.kvIncr(COUNT_KEY));
    if (n > 1) return n;
    const keys = await kv.kvList('db/users/');
    if (!Array.isArray(keys)) return null;
    await kv.kvSetRaw(COUNT_KEY, String(keys.length), COUNT_TTL_SEC);
    return keys.length;
  } catch (e) { logError('signup-notify:count', e); return null; }
}

async function send(info) {
  const { to, key, user, method, req, note } = info;
  const kv = require('./kv.js');
  const mark = 'db/notify/new-account/' + encodeURIComponent(key), born = Number(user.createdAt) || Date.now();
  if (!(await kv.kvSetIfAbsent(mark, String(born), DEDUPE_TTL_SEC))) {
    const prev = Number(await kv.kvGetRaw(mark)) || 0;
    if (Math.abs(prev - born) < RACE_MS) return 'dup';
    await kv.kvSetRaw(mark, String(born), DEDUPE_TTL_SEC); // إنشاء جديد للمفتاح نفسه بعد حذف — يُبلَّغ
  }
  const total = await countAccounts(kv);
  const { sendMail, escapeHtml } = require('./auth.js'); // متأخّر: auth.js يطلب هذا الملفّ
  const name = String(user.username || key);
  const rows = [
    ['اسم المستخدم', name + (String(key).toLowerCase() !== name.toLowerCase() ? ' — المفتاح: ' + key : '')],
    ['طريقة التسجيل', (METHOD_LABEL[method] || String(method)) + (note && NOTE_LABEL[note] ? ' — ' + NOTE_LABEL[note] : '')],
    ['الإيميل', user.email ? String(user.email) : 'لا يوجد'],
    ['الدولة', countryOf(req)],
    ['وقت التسجيل (الإمارات)', uaeTime(Number(user.createdAt) || Date.now())],
    ['إجمالي الحسابات بعد التسجيل', total == null ? 'تعذّر العدّ' : String(total)],
  ];
  const html = '<div dir="rtl" style="font-family:sans-serif;max-width:520px;margin:0 auto">'
    + '<h2 style="margin:0 0 12px">حساب جديد في om ai</h2>'
    + '<table style="border-collapse:collapse;width:100%">'
    + rows.map(([k, v]) => '<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd;color:#666;white-space:nowrap">' + escapeHtml(k)
      + '</td><td style="padding:6px 10px;border-bottom:1px solid #ddd"><b>' + escapeHtml(v) + '</b></td></tr>').join('')
    + '</table></div>';
  const subject = ('حساب جديد في om ai: ' + name).replace(/[\r\n]+/g, ' ').slice(0, 120);
  const ok = await sendMail(to, subject, html);
  if (!ok) logError('signup-notify:send', new Error('mail_not_sent'), { method, testSender: /@resend\.dev>?\s*$/i.test(String(process.env.MAIL_FROM || '@resend.dev')) });
  return ok ? 'sent' : 'failed';
}

/** يُنادى مرّة بعد كتابة حساب جديد ناجحة. لا يرمي أبدًا، ولا ينتظر الإرسال إن وُجد waitUntil (وإلّا ١٫٢ ث حدًّا). */
function notifyNewAccount(info) {
  try {
    const to = String(process.env.OWNER_NOTIFY_EMAIL || '').trim();
    if (!to || !process.env.RESEND_API_KEY) return Promise.resolve('off');
    if (!info || !info.key || !info.user) return Promise.resolve('skip');
    const job = send(Object.assign({}, info, { to })).catch((e) => { logError('signup-notify', e); return 'error'; });
    const w = _seam.waitUntil || platformWaitUntil();
    if (w) { w(job); return Promise.resolve('background'); }
    let timer = null;
    const cap = new Promise((r) => { timer = setTimeout(() => r('timeout'), FALLBACK_WAIT_MS); });
    return Promise.race([job, cap]).then((v) => { clearTimeout(timer); return v; });
  } catch (e) {
    logError('signup-notify', e);
    return Promise.resolve('error');
  }
}

module.exports = { notifyNewAccount, _seam };
