'use strict';
// api/_lib/phone-link.js — v-phone-link (أمر المالك ٤ أكتوبر: «ربط الهاتف… بالواتساب أو تيليجرام، اللي يرسل بالمجان»).
//
// لا رسالة مدفوعة واحدة: المستخدم هو من يرسل. التطبيق يصدر رمزًا قصيرًا يعيش ١٠ دقائق، ثمّ:
//   • واتساب: رابط wa.me برسالة جاهزة فيها الرمز إلى رقم التطبيق — الرسائل الواردة مجّانيّة عند Meta، ولا نردّ.
//     الويب هوك (api/webhook.js?src=wa) موقَّع بسرّ التطبيق، ورقم المرسل يأتي من واتساب نفسه.
//   • تيليجرام: رابط t.me للبوت ‎/start <الرمز>‎ ثمّ زرّ «شارك رقمي» — تيليجرام يعطي رقم الحساب نفسه موثَّقًا
//     (contact.user_id = from.id، فلا يُقبل رقم شخص آخر).
// الرمز وحده يعرف أيّ طلب: ربط لحساب مسجَّل (purpose=link)، أو استرجاع لمن نسي (purpose=recover). رابط إعادة كلمة
// المرور (نفس رابط البريد ‎?resetToken=…&ru=…‎) يُرسَل داخل محادثة الرقم نفسه — لا إلى المتصفّح الذي يحمل الرمز —
// فمن خدع شخصًا ليرسل له رمزًا لا يأخذ شيئًا. ردّ البوت مجّانيّ، وردّ واتساب داخل نافذة الـ٢٤ ساعة مجّانيّ (رسالة خدمة).
const crypto = require('crypto');

const CODE_TTL_SEC = 600;
const CODE_RE = /PL[A-HJ-NP-Z2-9]{8}/;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function kvOf(o) { return (o && o.kv) || require('./kv.js'); }
function authOf(o) { return (o && o.auth) || require('./auth.js'); }

function newCode() {
  const b = crypto.randomBytes(8);
  let s = 'PL';
  for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length];
  return s;
}

/* الهاتف بصيغة دوليّة: + ثمّ ٨–١٥ رقمًا؛ ٠٠ بديل +، وأرقام واتساب تأتي بلا + أصلًا. */
function normalizePhone(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^[1-9]\d{7,14}$/.test(s)) s = '+' + s;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}
const maskPhone = (p) => String(p || '').replace(/^(\+\d{3})\d+(\d{2})$/, '$1•••••$2');

const botName = () => String(process.env.TELEGRAM_BOT_USERNAME || 'OmranAIBuilder_bot').replace(/^@/, '').trim();
const waNumber = () => String(process.env.WHATSAPP_NUMBER || '').replace(/\D/g, '');
const env = (k) => String(process.env[k] || '').trim();
const waCanReply = () => !!env('WHATSAPP_TOKEN') && !!env('WHATSAPP_PHONE_ID');
/* الاسترجاع يحتاج قناة تردّ (فيها يصل الرابط)؛ الربط يكفيه الاستقبال. */
function channelReady(channel, purpose) {
  if (channel === 'telegram') return !!env('TELEGRAM_BOT_TOKEN');
  if (channel === 'whatsapp') return !!waNumber() && !!env('WHATSAPP_APP_SECRET') && (purpose !== 'recover' || waCanReply());
  return false;
}

function prefill(code, purpose) {
  return purpose === 'recover'
    ? 'استرجاع حسابي في Omran AI — رمز: ' + code + ' (لا ترسلها إن لم تطلبها أنت)'
    : 'ربط رقمي بحسابي في Omran AI — رمز: ' + code;
}
function linkFor(channel, code, purpose) {
  if (channel === 'telegram') return 'https://t.me/' + botName() + '?start=' + code;
  return 'https://wa.me/' + waNumber() + '?text=' + encodeURIComponent(prefill(code, purpose));
}

async function readRec(code, o) {
  try { const raw = await kvOf(o).kvGetRaw('db/phone-link/' + code); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
async function writeRec(code, rec, o) {
  await kvOf(o).kvSetRaw('db/phone-link/' + code, JSON.stringify(rec), CODE_TTL_SEC);
}

/** يصدر رمزًا لقناة. purpose: link (مع username) أو recover. */
async function start(args, o) {
  const a = args || {};
  const purpose = a.purpose === 'recover' ? 'recover' : 'link';
  const channel = a.channel === 'whatsapp' ? 'whatsapp' : 'telegram';
  if (!channelReady(channel, purpose)) return { error: 'channel_unavailable', channel };
  if (purpose === 'link' && !a.username) return { error: 'auth' };
  const code = newCode();
  await writeRec(code, { purpose, channel, username: purpose === 'link' ? String(a.username).trim().toLowerCase() : null, status: 'pending', at: Date.now() }, o);
  return { code, link: linkFor(channel, code, purpose), expiresIn: CODE_TTL_SEC, channel };
}

async function phoneOwner(phone, o) {
  try {
    const idx = await kvOf(o).kvGetJSON('db/phone-index/' + phone);
    if (!idx || !idx.username) return null;
    const key = String(idx.username).trim().toLowerCase();
    const user = await authOf(o).getUser(key);
    if (user && !user.deleted && user.phone === phone) return { key, user };
  } catch (e) { /* فهرس متعثّر = لا مالك */ }
  return null;
}

/**
 * القناة (واتساب/تيليجرام) أثبتت أنّ هذا الرقم أرسل هذا الرمز. يرجع { ok, purpose, status } — status:
 * linked · taken (الرقم لحساب آخر) · verified (استرجاع وُجد صاحبه) · nouser (استرجاع بلا حساب) · expired.
 */
async function complete(code, rawPhone, channel, o) {
  const m = CODE_RE.exec(String(code || '').toUpperCase());
  if (!m) return { ok: false, status: 'expired' };
  const c = m[0];
  const rec = await readRec(c, o);
  if (!rec) return { ok: false, status: 'expired' };
  // Meta تعيد إرسال الويب هوك أحيانًا: معالجة واحدة لكلّ رمز (وإلّا رابطا استرجاع، الأوّل منهما ميّت) — والمكرَّر بلا ردّ.
  if (rec.status !== 'pending') return { ok: false, status: 'dup' };
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, status: 'bad_phone' };
  if (!(await kvOf(o).kvSetIfAbsent('db/phone-link/claim/' + c, '1', CODE_TTL_SEC))) return { ok: false, status: 'dup' };
  const owner = await phoneOwner(phone, o);
  rec.via = channel; rec.phone = phone; rec.doneAt = Date.now();
  if (rec.purpose === 'link') {
    if (owner && owner.key !== rec.username) { rec.status = 'taken'; await writeRec(c, rec, o); return { ok: false, purpose: 'link', status: 'taken' }; }
    const auth = authOf(o);
    const user = await auth.getUser(rec.username);
    if (!user || user.deleted) { rec.status = 'expired'; await writeRec(c, rec, o); return { ok: false, purpose: 'link', status: 'expired' }; }
    const old = user.phone;
    user.phone = phone;
    await auth.putUser(rec.username, user);
    await kvOf(o).kvPutJSON('db/phone-index/' + phone, { username: rec.username, at: Date.now() });
    if (old && old !== phone) { try { await kvOf(o).kvDel('db/phone-index/' + old); } catch (e) { /* القديم يسقط وحده: phoneOwner يشترط user.phone نفسه */ } }
    rec.status = 'linked'; await writeRec(c, rec, o);
    return { ok: true, purpose: 'link', status: 'linked' };
  }
  if (!owner) { rec.status = 'nouser'; await writeRec(c, rec, o); return { ok: false, purpose: 'recover', status: 'nouser' }; }
  const rt = crypto.randomBytes(24).toString('hex');
  owner.user.resetTokenHash = crypto.createHash('sha256').update(rt).digest('hex');
  owner.user.resetTokenExpiry = Date.now() + 1000 * 60 * 30;
  await authOf(o).putUser(owner.key, owner.user);
  rec.status = 'verified'; rec.username = owner.key; await writeRec(c, rec, o);
  const { siteUrl } = require('./_site.js');
  const resetLink = siteUrl() + '/?resetToken=' + encodeURIComponent(rt) + '&ru=' + encodeURIComponent(owner.user.username || owner.key);
  return { ok: true, purpose: 'recover', status: 'verified', username: owner.user.username || owner.key, resetLink };
}

/** نصّ الردّ داخل القناة لكلّ حالة — الرابط للاسترجاع الموثَّق وحده. */
function replyText(r) {
  if (r && r.status === 'verified') return '✓ حسابك: ' + r.username + '\nافتح هذا الرابط واكتب كلمة مرور جديدة (صالح ٣٠ دقيقة):\n' + r.resetLink + '\n\nلا تشارك الرابط مع أحد.';
  return {
    linked: '✓ تمّ ربط رقمك بحسابك في Omran AI. ارجع للتطبيق.',
    taken: 'هذا الرقم مرتبط بحساب آخر في Omran AI.',
    nouser: 'لا يوجد حساب مرتبط بهذا الرقم في Omran AI.',
  }[r && r.status] || 'انتهت صلاحيّة الرابط — اطلب رابطًا جديدًا من التطبيق.';
}

/* ردّ واتساب على رسالة المستخدم نفسه (نافذة الخدمة — مجّانيّ). بلا WHATSAPP_TOKEN/WHATSAPP_PHONE_ID لا ردّ. */
async function waSend(to, text) {
  if (!waCanReply()) return false;
  try {
    const r = await fetch('https://graph.facebook.com/v21.0/' + encodeURIComponent(env('WHATSAPP_PHONE_ID')) + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env('WHATSAPP_TOKEN'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: String(to).replace(/\D/g, ''), type: 'text', text: { body: text, preview_url: false } }),
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch (e) { return false; }
}

/** حالة الرمز لمن أصدره: الحالة والرقم مقنَّعًا وحدهما — لا اسم حساب ولا رابط (الرابط وصل محادثة الرقم). */
async function status(code, o) {
  const m = CODE_RE.exec(String(code || '').toUpperCase());
  if (!m) return { status: 'expired' };
  const rec = await readRec(m[0], o);
  if (!rec) return { status: 'expired' };
  return { status: rec.status, purpose: rec.purpose, channel: rec.channel, phone: rec.phone ? maskPhone(rec.phone) : null };
}

/* ويب هوك واتساب (Meta): التوقيع X-Hub-Signature-256 = sha256=HMAC(سرّ التطبيق، الجسم الخامّ). */
function verifyMetaSig(rawBody, header, appSecret) {
  try {
    const want = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const a = Buffer.from(String(header || '')), b = Buffer.from(want);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}
/** رسائل نصّيّة واردة من جسم ويب هوك واتساب: [{ from, text }]. */
function waMessages(payload) {
  const out = [];
  for (const e of (payload && payload.entry) || []) {
    for (const ch of (e && e.changes) || []) {
      for (const msg of (ch && ch.value && ch.value.messages) || []) {
        if (msg && msg.from && msg.type === 'text' && msg.text && msg.text.body) out.push({ from: String(msg.from), text: String(msg.text.body) });
      }
    }
  }
  return out;
}

module.exports = { CODE_TTL_SEC, CODE_RE, newCode, normalizePhone, maskPhone, channelReady, linkFor, prefill, start, complete, status, replyText, waSend, phoneOwner, verifyMetaSig, waMessages };
