'use strict';
/* api/_lib/_session.js — v-video-open-lock: رمز جلسة حقيقيّ فقط.

   نسخ verifyToken المتفرّقة تقارن `data.exp < Date.now()`، وحمولة موقّعة بلا exp تمرّ منها (undefined < رقم = false)
   فتُقبل للأبد. تذكرة مهمّة البناء (construction-create.signJob: {u,p,h,r,n,e}) موقّعة بالسرّ نفسه وبلا exp، فتمرّ
   «رمز جلسة» لا ينتهي. هنا شكل الجلسة كما يصنعها auth.makeToken حرفيًّا: { u: نصّ، exp: رقم في المستقبل }.
   السرّ يُقرأ عند النداء لا في نطاق الوحدة (نقاط api/*.js تُحمَّل في بيئة عارية). */
const crypto = require('crypto');

/** اسم المستخدم من رمز جلسة صالح، وإلّا null — لا يرمي. */
function sessionUser(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const expected = crypto.createHmac('sha256', require('./_secrets.js').AUTH_SECRET).update(parts[0]).digest('base64url');
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!data || typeof data.u !== 'string' || !data.u.trim()) return null;
    if (typeof data.exp !== 'number' || !(data.exp > Date.now())) return null;
    return data.u;
  } catch (e) {
    return null; // رمز مشوّه = لا جلسة
  }
}

/** الرمز من الجسم أو ?token= أو ترويسة Authorization: Bearer — بهذا الترتيب. */
function tokenOf(req) {
  const b = (req && req.body && typeof req.body === 'object') ? req.body : {};
  const q = (req && req.query) || {};
  if (b.token) return String(b.token);
  if (q.token) return String(q.token);
  const h = String((req && req.headers && (req.headers.authorization || req.headers.Authorization)) || '');
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : '';
}

/* v-session-revoke (فحص Desloppify ٩ نوفمبر ٢٠٢٦): تغيير كلمة المرور أو استعادتها يزيد sv في سجلّ الحساب، لكنّ الرفض كان في
   auth.js وحده؛ المحادثة والذاكرة والنقاط والبريد والنشر تقبل الرمز القديم حتّى انتهائه (٣٠ يومًا). سجلّ الحساب لا يُقرأ في
   كلّ طلب، فإصدارات من غيّر كلمته تُنسخ إلى جدول صغير واحد (Redis hash) يُقرأ مرّة في الدقيقة لكلّ نسخة خادم —
   لا قراءة لكلّ طلب (حدّ الطلبات اليوميّ). تعذّر القراءة = يُقبل الرمز كما كان قبل هذا القرار (لا يُطرد أحد بعطل عابر). */
const SV_KEY = 'db/session-versions';
const SV_TTL_MS = 60 * 1000;
let __sv = { at: 0, map: {} };

/** رقم إصدار الرمز (v)، وصفر لرمز بلا إصدار. */
function tokenVersion(token) {
  try {
    const d = JSON.parse(Buffer.from(String(token || '').split('.')[0], 'base64url').toString());
    const v = Number(d && d.v);
    return Number.isInteger(v) && v > 0 ? v : 0;
  } catch (e) { return 0; } // رمز مشوّه = إصدار صفر؛ sessionUser يرفضه قبل ذلك
}

async function sessionVersions() {
  if (Date.now() - __sv.at < SV_TTL_MS) return __sv.map;
  try {
    const [flat] = await require('./kv.js').kvPipeline([['HGETALL', SV_KEY]]);
    const map = {};
    if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) map[String(flat[i])] = Number(flat[i + 1]) || 0;
    else if (flat && typeof flat === 'object') for (const k of Object.keys(flat)) map[k] = Number(flat[k]) || 0;
    __sv = { at: Date.now(), map };
  } catch (e) {
    __sv = { at: Date.now(), map: __sv.map }; // العطل لا يُعاد كلّ طلب؛ آخر جدول معروف يبقى
    require('./_swallow.js').swallow(e, '_session:sessionVersions');
  }
  return __sv.map;
}

/** true إذا كان الرمز صالح التوقيع لكنّه أقدم من آخر تغيير لكلمة مرور صاحبه. */
async function sessionRevoked(token) {
  const u = sessionUser(token);
  if (!u) return false;
  const need = (await sessionVersions())[u.trim().toLowerCase()] || 0;
  return need > 0 && tokenVersion(token) < need;
}

/** يُنادى حين يزيد sv (تغيير كلمة المرور، الاستعادة) وعند verify لمن له sv — يكتب فقط إذا كان الجدول أقدم. لا يرمي. */
async function recordSessionVersion(username, sv) {
  const u = String(username || '').trim().toLowerCase();
  const v = Number(sv);
  if (!u || !Number.isInteger(v) || v <= 0) return;
  try {
    if (((await sessionVersions())[u] || 0) >= v) return;
    await require('./kv.js').kvPipeline([['HSET', SV_KEY, u, String(v)]]);
    __sv.map = Object.assign({}, __sv.map, { [u]: v });
  } catch (e) { require('./_swallow.js').swallow(e, '_session:recordSessionVersion'); }
}

function __resetSessionVersionsForTest() { __sv = { at: 0, map: {} }; }

module.exports = { sessionUser, tokenOf, tokenVersion, sessionRevoked, recordSessionVersion, __resetSessionVersionsForTest };
