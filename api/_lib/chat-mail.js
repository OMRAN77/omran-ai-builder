'use strict';
/* v-chat-mail (أمر المالك ٤ نوفمبر: «اريد الدردشه الي في التطبيق تتحول كله على الايميل لكي اطور التطبيق من المستخدمين»):
   كلّ دور في المحادثة الرئيسيّة لغير المالك (كلامه + ردّ التطبيق + الخطأ إن وقع) يُحفظ في قائمة يومه (توقيت الإمارات) في KV،
   ويصل المالك إيميل واحد في اليوم بمحادثات الأمس كلّها مجمّعة بالمستخدم — من جرد البريد (email-sweep، Vercel Cron ٧:٢٣ الإمارات).
   - لماذا يوميّ لا رسالة لكلّ دور: Resend المجّانيّ ١٠٠ رسالة في اليوم، ومنها رموز الدخول وإشعار الحساب الجديد؛ رسالة لكلّ دور
     تستنفدها فيتوقّف دخول المستخدمين.
   - الخصوصيّة: لا صور (علامة «صورة مرفقة» فقط)، المفاتيح وأرقام البطاقات تُحذف قبل الحفظ، النصّ مقصوص، والقائمة تُحذف بعد
     الإرسال وتنتهي وحدها بعد ٤ أيّام إن فشل. الزائر باسم مستعار من بصمة معرّفه لا بالمعرّف نفسه.
   - يعمل فقط بوجود OWNER_NOTIFY_EMAIL وRESEND_API_KEY (بدونهما لا يُحفظ شيء)، وCHAT_MAIL=off يطفئه. لا سرّ يُقرأ في نطاق الوحدة. */
const crypto = require('crypto');

const DAY_PREFIX = 'db/chat-mail/day/';
const DROP_PREFIX = 'db/chat-mail/drop/';
const USER_MAX = 6000;      // كلام المستخدم مع ما ألصقه: مواصفات ٤ ك.ب (luki، ٤ نوفمبر) تصل كاملة — v-inbox-own-words
const REPLY_MAX = 1200;     // ردّ التطبيق: ما يكفي للحكم على جودته
const ERR_MAX = 240;
const DAY_MAX = 1000;       // سقف أدوار اليوم (سعة Redis محدودة — v-redis-capacity)؛ الزائد يُعدّ ولا يُحفظ
const TTL_S = 4 * 86400;
const LOOKBACK_DAYS = 3;    // الجرد يرسل الأمس وما فشل قبله
const UAE_MS = 4 * 3600000;

const _seam = { waitUntil: null }; // للاختبارات وحدها

function uaeDay(ms) { return new Date(ms + UAE_MS).toISOString().slice(0, 10); }
function uaeClock(ms) { return new Date(ms + UAE_MS).toISOString().slice(11, 16); }

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}
const CARD_RE = /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g;
const EXTRA_KEY_RE = /\b(?:sk-or-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g;

/** نصّ آمن للحفظ: بلا مفاتيح ولا أرقام بطاقات ولا محارف تحكّم، مقصوص إلى max. */
function scrub(text, max) {
  let s = String(text == null ? '' : text);
  s = require('./_msgs.js').redactSecrets(s);
  s = s.replace(EXTRA_KEY_RE, '[مفتاح محذوف]');
  s = s.replace(CARD_RE, (m) => { const d = m.replace(/\D/g, ''); return d.length >= 13 && luhn(d) ? '[رقم بطاقة محذوف]' : m; });
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > max) { const cut = s.slice(0, max); s = (typeof cut.toWellFormed === 'function' ? cut.toWellFormed() : cut) + '…'; }
  return s;
}

function enabled(env) {
  const e = env || process.env;
  if (String(e.CHAT_MAIL || '').trim().toLowerCase() === 'off') return false;
  return !!(String(e.OWNER_NOTIFY_EMAIL || '').trim() && e.RESEND_API_KEY);
}
function isOwnerUser(user) { try { return require('./_owner.js').isOwnerName(user); } catch (e) { return false; } } // guard-ok — بلا ملفّ المالك: ليس مالكًا
function guestAlias(guestId) {
  const g = String(guestId || '').trim();
  return g ? 'زائر-' + crypto.createHash('sha256').update(g).digest('hex').slice(0, 6) : '';
}

/** يحفظ دورًا واحدًا. لا يرمي أبدًا. args: { user, guestId, prov, text, reply, error, image, country } */
async function noteTurn(args, opts) {
  const a = args || {};
  const o = opts || {};
  try {
    if (!enabled(o.env)) return 'off';
    const user = String(a.user || '').trim();
    if (user && isOwnerUser(user)) return 'owner';
    const who = user ? user.slice(0, 40) : guestAlias(a.guestId);
    if (!who) return 'skip';
    const q = scrub(a.text, USER_MAX);
    if (!q && !a.image) return 'skip';
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const item = { t: now, u: who, q };
    if (!user) item.g = 1;
    if (a.prov) item.p = String(a.prov).slice(0, 20);
    const reply = scrub(a.reply, REPLY_MAX);
    if (reply) item.a = reply;
    if (a.error) item.e = scrub(typeof a.error === 'string' ? a.error : JSON.stringify(a.error), ERR_MAX);
    if (a.image) item.i = 1;
    const cc = String(a.country || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(cc)) item.c = cc;
    const kv = o.kv || require('./kv.js');
    const key = DAY_PREFIX + uaeDay(now);
    const r = await kv.kvPipeline([['RPUSH', key, JSON.stringify(item)], ['LTRIM', key, '0', String(DAY_MAX - 1)], ['EXPIRE', key, String(TTL_S)]]);
    if (Number(r && r[0]) > DAY_MAX) {
      const dk = DROP_PREFIX + uaeDay(now);
      await kv.kvPipeline([['INCR', dk], ['EXPIRE', dk, String(TTL_S)]]);
      return 'capped';
    }
    return 'saved';
  } catch (e) {
    try { require('./log-error.js').logError('chat-mail:note', e); } catch (e2) { typeof require === 'function' && require('./_swallow.js').swallow(e2, '_lib/chat-mail:93'); /* guard-ok — فشل التسجيل لا يوقف المحادثة */ }
    return 'error';
  }
}

/** من chat.js عند نهاية الردّ: الحفظ يكمل بعد الردّ بـwaitUntil المنصّة ولا يؤخّره. */
function noteTurnLater(args) {
  const job = noteTurn(args);
  try {
    const w = _seam.waitUntil || require('./signup-notify.js').platformWaitUntil();
    if (w) w(job);
  } catch (e) { typeof require === 'function' && require('./_swallow.js').swallow(e, '_lib/chat-mail:104'); /* guard-ok — بلا سياق طلب يكمل الوعد وحده */ }
  return job;
}

function buildMail(day, items, dropped, esc) {
  const users = new Map();
  for (const x of items) {
    if (!users.has(x.u)) users.set(x.u, []);
    users.get(x.u).push(x);
  }
  const guests = Array.from(users.values()).filter((l) => l[0].g).length;
  const box = 'margin:8px 0;padding:8px 10px;background:#f6f7f9;border-radius:8px';
  const parts = [];
  parts.push('<div dir="rtl" style="font-family:sans-serif;max-width:760px;margin:0 auto;font-size:14px;line-height:1.6">');
  parts.push('<h2 style="margin:0 0 6px">محادثات المستخدمين — ' + esc(day) + '</h2>');
  parts.push('<p style="margin:0 0 12px;color:#666">الرسائل: ' + items.length + ' · المستخدمون: ' + users.size + ' (مسجّل: ' + (users.size - guests) + ' · زائر: ' + guests + ')'
    + (dropped > 0 ? ' · لم تُحفظ بعد سقف اليوم (' + DAY_MAX + '): ' + dropped : '') + ' · التوقيت توقيت الإمارات.</p>');
  parts.push('<table style="border-collapse:collapse;margin:0 0 16px">'
    + Array.from(users.entries()).map(([u, l]) => '<tr><td style="padding:3px 10px;border-bottom:1px solid #eee"><b dir="auto">' + esc(u) + '</b></td><td style="padding:3px 10px;border-bottom:1px solid #eee;color:#666">'
      + 'الرسائل: ' + l.length + (l.some((x) => x.e) ? ' · ⚠️ خطأ' : '') + '</td></tr>').join('') + '</table>');
  for (const [u, l] of users) {
    parts.push('<h3 style="margin:18px 0 4px;padding-top:10px;border-top:2px solid #ddd"><span dir="auto">' + esc(u) + '</span>' + (l[0].c ? ' <span style="color:#888;font-weight:normal;font-size:13px">· ' + esc(l[0].c) + '</span>' : '') + '</h3>');
    for (const x of l) {
      parts.push('<div style="' + box + '">'
        + '<div style="color:#888;font-size:12px">' + esc(uaeClock(Number(x.t) || 0)) + (x.p ? ' · ' + esc(x.p) : '') + (x.i ? ' · صورة مرفقة' : '') + '</div>'
        + '<div style="margin-top:4px"><b>المستخدم:</b></div><div dir="auto" style="white-space:pre-wrap">' + esc(x.q || '') + '</div>' // نصّ إنجليزيّ في سطر عربيّ يُقلب ترتيبه — سطره وحده بـdir=auto
        + (x.a ? '<div style="margin-top:6px"><b>التطبيق:</b></div><div dir="auto" style="white-space:pre-wrap;color:#333">' + esc(x.a) + '</div>' : '')
        + (x.e ? '<div dir="auto" style="margin-top:6px;color:#a33">⚠️ ' + esc(x.e) + '</div>' : '')
        + '</div>');
    }
  }
  parts.push('</div>');
  return parts.join('');
}

/** الإيميل اليوميّ: أيّام الأمس وما قبله (حتّى ٣) التي فيها محادثات، رسالة لكلّ يوم، والقائمة تُحذف بعد الإرسال الناجح. يُنادى من email-sweep. */
async function dailyDigest(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const to = String(env.OWNER_NOTIFY_EMAIL || '').trim();
  if (!to || !env.RESEND_API_KEY) return { sent: 0, reason: 'off' };
  const kv = o.kv || require('./kv.js');
  const now = typeof o.now === 'number' ? o.now : Date.now();
  const days = [];
  for (let d = LOOKBACK_DAYS; d >= 1; d--) days.push(uaeDay(now - d * 86400000));
  const got = await kv.kvPipeline(days.flatMap((day) => [['LRANGE', DAY_PREFIX + day, '0', '-1'], ['GET', DROP_PREFIX + day]]));
  const auth = require('./auth.js');
  const send = o.sendMail || auth.sendMail;
  const esc = (s) => auth.escapeHtml(String(s == null ? '' : s));
  const out = { sent: 0, days: [] };
  for (let i = 0; i < days.length; i++) {
    const raw = Array.isArray(got && got[i * 2]) ? got[i * 2] : [];
    const items = raw.map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter((x) => x && x.u); // guard-ok — سطر تالف يُتخطّى
    if (!items.length) continue;
    const dropped = Number(got && got[i * 2 + 1]) || 0;
    const users = new Set(items.map((x) => x.u)).size;
    const subject = ('محادثات المستخدمين ' + days[i] + ' — الرسائل: ' + items.length + ' · المستخدمون: ' + users).slice(0, 120);
    const ok = await send(to, subject, buildMail(days[i], items, dropped, esc));
    if (ok) {
      await kv.kvPipeline([['DEL', DAY_PREFIX + days[i]], ['DEL', DROP_PREFIX + days[i]]]);
      out.sent++;
    }
    out.days.push({ day: days[i], count: items.length, users, ok: !!ok });
  }
  if (!out.days.length) out.reason = 'empty';
  return out;
}

module.exports = { noteTurn, noteTurnLater, dailyDigest, scrub, guestAlias, uaeDay, buildMail, enabled, _seam, DAY_PREFIX, DROP_PREFIX, DAY_MAX, USER_MAX, REPLY_MAX, TTL_S };
