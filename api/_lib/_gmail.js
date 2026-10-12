'use strict';
/* api/_lib/_gmail.js — v-email-best: ما تتشاركه نقاط مساعد البريد الأربع (القائمة، الإرسال، التقويم، التجاهل).

   كانت كلّ نقطة تحمل نسختها من «الجلسة ثمّ السجلّ ثمّ رمز الوصول»، وبها ثلاث ثغرات معًا:
   (١) verifyToken المتساهل — حمولة موقّعة بلا exp تمرّ جلسةً للأبد (انظر _session.js)؛ هنا sessionUser الصارم.
   (٢) الحساب المحظور أو الشاهد (تغيير الاسم/الحذف) كان يصل Gmail ونداءات الذكاء — هنا ٤٠١ الجلسة القائمة كما isBanned.
   (٣) انتهاء ربط جوجل (invalid_grant: سحب الإذن، أو انتهاء الأيّام السبعة لتطبيق في وضع الاختبار) كان يظهر في الإرسال
       والتقويم نصًّا خامًا «Email send error: invalid_grant» — هنا notConnected في كلّ النقاط فتعرض الواجهة زرّ إعادة الربط.
   ومعها قراءة نصّ الرسالة: بترميزها المعلن (windows-1256 العربيّ كان يُقرأ UTF-8 فيخرج رموزًا)، وHTML بلا CSS/سكربت
   وبكياناته مفكوكة، وكشف البريد الآليّ (لا ردّ عليه، فلا مسودّة ولا نداء ذكاء). */
const { sessionUser, tokenOf } = require('./_session.js');

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me/';
const DEFAULT_TZ = 'Asia/Dubai';
const SESSION_MSG = 'الجلسة منتهية، سجل الدخول من جديد';
const MSG_ID_RE = /^[0-9a-f]{6,32}$/i;

/** المستخدم الحيّ صاحب الجلسة: { username, user } أو { status, json } للردّ مباشرة. */
async function emailAccount(body) {
  const username = sessionUser(tokenOf({ body }));
  if (!username) return { status: 401, json: { error: SESSION_MSG } };
  const { getUser } = require('./auth.js');
  const user = await getUser(username);
  if (!user || user.banned || user.deleted) return { status: 401, json: { error: SESSION_MSG } };
  return { username, user };
}

async function accessTokenFrom(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    const err = new Error((d && d.error) || 'refresh_failed');
    err.code = (d && d.error) || 'refresh_failed';
    throw err;
  }
  return d.access_token;
}

/** حساب مربوط بـGmail ورمز وصول صالح: { username, user, accessToken } أو { status, json }. */
async function gmailSession(body) {
  const acct = await emailAccount(body);
  if (acct.status) return acct;
  const ea = acct.user.emailAssist;
  if (!ea || !ea.connected) return { status: 400, json: { error: 'لم يتم ربط Gmail بعد', notConnected: true } };
  const { decrypt } = require('./_emailCrypto.js');
  const refreshToken = decrypt(ea.refreshTokenEnc);
  if (!refreshToken) return { status: 400, json: { error: 'تعذر قراءة صلاحية Gmail، أعد الربط', notConnected: true } };
  try {
    acct.accessToken = await accessTokenFrom(refreshToken);
  } catch (e) {
    if (e && (e.code === 'invalid_grant' || e.code === 'unauthorized_client')) {
      return { status: 401, json: { error: 'invalid_grant', notConnected: true, reconnect: true } };
    }
    throw e;
  }
  return acct;
}

/** GET على Gmail: { ok, status, data } — لا يرمي على ردّ خطأ، ومهلته ١٥ ثانية. */
async function gmailGet(accessToken, pathAndQuery) {
  const r = await fetch(GMAIL + pathAndQuery, {
    headers: { Authorization: 'Bearer ' + accessToken },
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok && !(data && data.error), status: r.status, data: data || {} };
}

function headerOf(headers, name) {
  const n = String(name).toLowerCase();
  const h = (headers || []).find((x) => x && String(x.name).toLowerCase() === n);
  return h ? String(h.value || '') : '';
}

/** المنطقة الزمنيّة من الواجهة إن كانت اسم IANA صالحًا، وإلّا دبيّ (السلوك القديم). */
function validTz(tz) {
  const s = String(tz || '');
  if (!s || s.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(s)) return DEFAULT_TZ;
  try { new Intl.DateTimeFormat('en', { timeZone: s }); return s; } catch (e) { return DEFAULT_TZ; } // اسم مجهول = الافتراضيّ
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', zwnj: '\u200c', zwj: '\u200d', rlm: '\u200f', lrm: '\u200e' };
function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const v = NAMED[e.toLowerCase()];
    return v != null ? v : m;
  });
}

function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** بايتات الجزء بترميزه المعلن في Content-Type (Gmail يفكّ ترميز النقل ويُبقي المحارف كما أُرسلت). */
function decodePart(part) {
  const buf = Buffer.from(String(part.body.data).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const m = /charset\s*=\s*"?([^";\s]+)/i.exec(headerOf(part.headers, 'content-type'));
  const cs = m ? m[1].toLowerCase() : 'utf-8';
  try { return new TextDecoder(cs).decode(buf); } catch (e) { return buf.toString('utf8'); } // ترميز لا يعرفه Node = UTF-8 كالسابق
}

function findPart(payload, mime) {
  if (!payload) return null;
  if (payload.mimeType === mime && payload.body && payload.body.data) return payload;
  for (const p of payload.parts || []) {
    const hit = findPart(p, mime);
    if (hit) return hit;
  }
  return null;
}

/** نصّ الرسالة المقروء: النصّيّ أوّلًا، ثمّ HTML منظَّفًا، ثمّ المقتطف. */
function messageText(msg) {
  const payload = msg && msg.payload;
  const plain = findPart(payload, 'text/plain');
  if (plain) { const t = decodePart(plain).trim(); if (t) return t; }
  const html = findPart(payload, 'text/html');
  if (html) { const t = htmlToText(decodePart(html)); if (t) return t; }
  if (payload && payload.body && payload.body.data) { const t = htmlToText(decodePart(payload)); if (t) return t; }
  return decodeEntities((msg && msg.snippet) || '');
}

/** العناوين الصالحة في ترويسة From/Reply-To — بلا اسم عرض ولا CR/LF (لا حقن ترويسات). */
function addressesOf(header) {
  const found = String(header || '').match(/[^\s<>()[\],;:"'\\]+@[^\s<>()[\],;:"'\\]+\.[^\s<>()[\],;:"'\\]+/g) || [];
  const out = [];
  for (const a of found) if (!out.includes(a.toLowerCase())) out.push(a.toLowerCase());
  return out.slice(0, 10);
}

// بريد آليّ لا يُنتظر عليه ردّ: لا مسودّة ولا نداء ذكاء، ويبقى ظاهرًا (مع «تجاهل») كي لا يبدو الوارد فارغًا.
const AUTO_LOCAL = /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?|newsletters?|alerts?)([._+-]|$)/i;
function isAutomated(msg) {
  const h = (msg && msg.payload && msg.payload.headers) || [];
  const from = addressesOf(headerOf(h, 'from'))[0] || '';
  if (AUTO_LOCAL.test(from.split('@')[0] || '')) return true;
  const autoSub = headerOf(h, 'auto-submitted').trim();
  if (autoSub && !/^no$/i.test(autoSub)) return true;
  if (/^(bulk|junk|list)$/i.test(headerOf(h, 'precedence').trim())) return true;
  if (headerOf(h, 'list-unsubscribe')) return true;
  const labels = (msg && msg.labelIds) || [];
  return labels.includes('CATEGORY_PROMOTIONS') || labels.includes('CATEGORY_SOCIAL');
}

module.exports = {
  emailAccount, gmailSession, gmailGet, accessTokenFrom, headerOf, validTz, decodeEntities, htmlToText,
  messageText, addressesOf, isAutomated, DEFAULT_TZ, MSG_ID_RE,
};
