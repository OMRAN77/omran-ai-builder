// api/_lib/session.js — v-account-guard: الجلسة الموقّعة في مكان واحد.
//
// قبل اليوم: تسعة ملفّات تنسخ فحص التوقيع نفسه، والرمز يعيش ٣٠ يومًا ويتجدّد ذاتيًّا بلا
// نهاية، ولا شيء يبطله — تغيير كلمة المرور لا يُخرج جهازًا سُرقت جلسته.
// بعد اليوم:
//   • الرمز صالح ٢٤ ساعة (exp) ويتجدّد عبر action=verify حتّى ٣٠ يومًا (rx) — والتجديد
//     يقرأ السجلّ ويرفض إن تغيّر رقم الجلسة v (تغيير/استرجاع كلمة المرور، «الخروج من كلّ
//     الأجهزة»، تفعيل التحقّق بخطوتين). فأقصى عمر لجلسة مسروقة يوم واحد.
//   • جلسة المالك لا تُقبل إلّا بعلامة m=1 (اجتازت التحقّق بخطوتين) — في كلّ بوّابة، لأنّ
//     كلّ نسخ الفحص صارت تنادي هنا. مخرج طوارئ: OWNER_MFA_OFF=1 في Vercel.
//   • بطاقة التحقّق (ticket) موقّعة بمفتاح مشتقّ مختلف، فلا تُقبل جلسةً أبدًا.
// السرّ يُقرأ عند النداء لا عند التحميل (cold-start).
'use strict';
const crypto = require('crypto');
const { isOwnerName } = require('./_owner.js');

const ACCESS_MS = 24 * 60 * 60 * 1000;
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const TICKET_MS = 10 * 60 * 1000;

const secret = () => require('./_secrets.js').AUTH_SECRET;

function sign(obj, purpose) {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const key = purpose ? secret() + ':' + purpose : secret();
  return payload + '.' + crypto.createHmac('sha256', key).update(payload).digest('base64url');
}

function open(token, purpose) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const key = purpose ? secret() + ':' + purpose : secret();
    const expected = Buffer.from(crypto.createHmac('sha256', key).update(payload).digest('base64url'));
    const given = Buffer.from(sig);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

function ownerMfaRequired() {
  return String(process.env.OWNER_MFA_OFF || '').trim() !== '1';
}

function makeSession(username, o) {
  o = o || {};
  const now = Date.now();
  const p = { u: username, exp: now + ACCESS_MS, rx: now + REFRESH_MS, v: Number(o.v) || 0 };
  if (o.m) p.m = 1;
  return sign(p);
}

// allowRefresh: يقبل رمزًا انتهت ساعاته الـ٢٤ ما دام داخل نافذة التجديد — لـaction=verify وحده،
// وهو الذي يتحقّق من رقم الجلسة في السجلّ قبل أن يصدر رمزًا جديدًا.
function readSession(token, opts) {
  const d = open(token);
  if (!d || typeof d.u !== 'string' || !d.u || d.t) return null;
  const now = Date.now();
  const live = Number(d.exp) > now;
  const refreshable = !!(opts && opts.allowRefresh) && Number(d.rx) > now;
  if (!live && !refreshable) return null;
  if (isOwnerName(d.u) && ownerMfaRequired() && d.m !== 1) return null;
  return d;
}

function verifySession(token) {
  const d = readSession(token);
  return d ? d.u : null;
}

function makeTicket(username, kind, v) {
  return sign({ t: kind, u: username, v: Number(v) || 0, exp: Date.now() + TICKET_MS, n: crypto.randomBytes(6).toString('hex') }, 'mfa-ticket');
}

function readTicket(ticket, kind) {
  const d = open(ticket, 'mfa-ticket');
  if (!d || d.t !== kind || typeof d.u !== 'string' || !(Number(d.exp) > Date.now())) return null;
  return d;
}

module.exports = { makeSession, readSession, verifySession, makeTicket, readTicket, ownerMfaRequired, ACCESS_MS, REFRESH_MS };
