'use strict';
/* api/_lib/owner-live.js — v-owner-live (المالك ١٨ نوفمبر: «أيّ محادثة في التطبيق أريدها في نفس الوقت، وأيّ شخص يسجّل يوصل في نفس الوقت،
   مش اليوم الثاني»).
   إيميل المحادثات يوميّ عن قصد (chat-mail: Resend المجّانيّ ١٠٠ رسالة في اليوم، ومنها رموز الدخول). الفوريّ هنا إشعار Web Push إلى هاتف
   المالك (pushToOwners — المسار نفسه لإشعار الأخطاء والرصيد وصندوق المالك): مجّانيّ وبلا سقف يوميّ، ويصل لحظة الدور.
   - كلّ دور في المحادثة الرئيسيّة لغير المالك: الاسم (أو اسم الزائر المستعار نفسه في الإيميل)، وكلامه، وأوّل ردّ التطبيق، والخطأ إن وقع.
     الإشعار بوسم ثابت لكلّ مستخدم: رسائله الجديدة تحلّ محلّ القديمة على الشاشة بدل كومة، وبلا «يبقى حتّى تلمسه».
   - كلّ حساب جديد (المسارات الثلاثة عبر signup-notify): الاسم والطريقة والدولة، ويبقى على الشاشة حتّى يُلمس.
   - الخصوصيّة كالإيميل: المفاتيح وأرقام البطاقات تُحذف (chat-mail.scrub)، والنصّ مقصوص، ولا صورة. OWNER_LIVE=off يطفئه.
   لا يرمي أبدًا، ولا يؤخّر الردّ (waitUntil المنصّة)، ولا سرّ يُقرأ في نطاق الوحدة. */
const crypto = require('crypto');

const Q_MAX = 160;      // كلام المستخدم في الإشعار
const A_MAX = 90;       // أوّل الردّ
const ERR_MAX = 80;
const METHOD = { password: 'اسم وكلمة مرور', google: 'Google', 'email-otp': 'رمز البريد' };

const _seam = { push: null, waitUntil: null }; // للاختبارات وحدها

function enabled(env) { return String((env || process.env).OWNER_LIVE || '').trim().toLowerCase() !== 'off'; }
function pusher(o) { return (o && o.push) || _seam.push || require('./_owner-alert.js').pushToOwners; }
function tagOf(prefix, who) { return prefix + crypto.createHash('sha256').update(String(who)).digest('hex').slice(0, 10); }
function oneLine(s, n) {
  const t = String(s || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
function later(job) {
  try {
    const w = _seam.waitUntil || require('./signup-notify.js').platformWaitUntil();
    if (w) w(job);
  } catch (e) { typeof require === 'function' && require('./_swallow.js').swallow(e, '_lib/owner-live:later'); /* guard-ok — بلا سياق طلب يكمل الوعد وحده */ }
  return job;
}

/** دور واحد في المحادثة. args كـchat-mail.noteTurn: { user, guestId, prov, text, reply, error, image, country } */
async function turn(args, opts) {
  const a = args || {}, o = opts || {};
  try {
    if (!enabled(o.env)) return 'off';
    const mail = require('./chat-mail.js');
    const user = String(a.user || '').trim();
    if (user && require('./_owner.js').isOwnerName(user)) return 'owner';
    const who = user ? user.slice(0, 40) : mail.guestAlias(a.guestId);
    if (!who) return 'skip';
    const q = oneLine(mail.scrub(a.text, 2000), Q_MAX);
    if (!q && !a.image) return 'skip';
    const reply = oneLine(mail.scrub(a.reply, 1200), A_MAX);
    const err = a.error ? oneLine(mail.scrub(typeof a.error === 'string' ? a.error : JSON.stringify(a.error), 400), ERR_MAX) : '';
    const cc = String(a.country || '').trim().toUpperCase();
    const title = (err ? '⚠️ ' : '💬 ') + who + (user ? '' : ' (زائر)') + (/^[A-Z]{2}$/.test(cc) ? ' · ' + cc : '');
    const body = (q || '📷 صورة') + (q && a.image ? ' 📷' : '') + (reply ? '\n↩ ' + reply : '') + (err ? '\n⚠️ ' + err : '');
    const r = await pusher(o)({ title, body, url: '/', tag: tagOf('om-chat-', who), sticky: false }, o.pushOpts);
    return r && r.sent ? 'sent' : ((r && r.reason) || 'none');
  } catch (e) {
    try { require('./log-error.js').logError('owner-live:turn', e); } catch (e2) { typeof require === 'function' && require('./_swallow.js').swallow(e2, '_lib/owner-live:turn'); /* guard-ok — فشل التسجيل لا يوقف شيئًا */ }
    return 'error';
  }
}

/** حساب جديد. info كـsignup-notify: { key, user, method, req, note } */
async function signup(info, opts) {
  const i = info || {}, o = opts || {};
  try {
    if (!enabled(o.env)) return 'off';
    if (!i.key || !i.user) return 'skip';
    const name = oneLine(i.user.username || i.key, 40);
    const code = String((i.req && i.req.headers && i.req.headers['x-vercel-ip-country']) || '').trim().toUpperCase();
    const body = [METHOD[i.method] || String(i.method || ''), /^[A-Z]{2}$/.test(code) ? code : '', i.user.email ? oneLine(i.user.email, 60) : ''].filter(Boolean).join(' · ');
    const r = await pusher(o)({ title: '👤 حساب جديد: ' + name, body: body || 'تسجيل جديد', url: '/', tag: tagOf('om-signup-', i.key), sticky: true }, o.pushOpts);
    return r && r.sent ? 'sent' : ((r && r.reason) || 'none');
  } catch (e) {
    try { require('./log-error.js').logError('owner-live:signup', e); } catch (e2) { typeof require === 'function' && require('./_swallow.js').swallow(e2, '_lib/owner-live:signup'); /* guard-ok — فشل التسجيل لا يوقف شيئًا */ }
    return 'error';
  }
}

/* مطفأ = لا وعد يُسلَّم لـwaitUntil أصلًا (لا عمل في الخلفيّة باسم ميزة مطفأة) */
function turnLater(args) { return enabled() ? later(turn(args)) : Promise.resolve('off'); }
function signupLater(info) { return enabled() ? later(signup(info)) : Promise.resolve('off'); }

module.exports = { turn, signup, turnLater, signupLater, enabled, _seam, Q_MAX, A_MAX };
