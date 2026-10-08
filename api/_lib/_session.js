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

module.exports = { sessionUser, tokenOf };
