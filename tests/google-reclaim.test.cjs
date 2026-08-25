// استرداد السجلّ المقفل عبر جوجل: بريد أثبتته جوجل يستعيد حسابه المقفل.
//
// «مستخدم جديد» يدخل بجوجل فلا يكمل: بريده مرّ على التطبيق أيّام السرّ
// القديم، فسجلّه g_<email> مقفل، وgetUser ترميه (سدّ #26)، فينتهي كلّ دخول
// بـ server_error أبديّة — لا هو يدخل ولا السجلّ يُصلَح. جوجل أثبتت للتوّ
// ملكيّة البريد نفسه، فالاسترداد مشروع: يُنشأ السجلّ فوق المقفل ويدخل.
//
// يشغّل api/_lib/auth-google-callback.js الحقيقيّ: مخزن في الذاكرة بدل
// Redis، وfetch مزيّف يردّ ردود جوجل المعلّبة — قياس المعالِج لا قراءته.
const assert = require('node:assert/strict');

function check(ok, label) { assert.ok(ok, label); console.log('  ✓ ' + label); }

process.env.AUTH_SECRET = 'سرّ-قديم-A';
process.env.OWNER_USERNAME = 'boss';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.SITE_URL = 'https://example.test';
process.env.UPSTASH_REDIS_REST_URL = 'http://فحص-محلّيّ';

const store = new Map();
const kvPath = require.resolve('../api/_lib/kv.js');
require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvDel: async (k) => { store.delete(k); },
  kvList: async () => [...store.keys()],
  kvIncr: async () => 1, kvExpire: async () => {}, kvIncrBy: async () => 1,
  kvDecrBy: async () => 1, kvSetIfAbsent: async () => true,
  kvGetRaw: async (k) => store.get(k) || null, kvSetRaw: async (k, v) => store.set(k, v),
} };

// fetch مزيّف: مبادلة الرمز ثمّ الملفّ الشخصيّ — بريد مثبَت
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('oauth2.googleapis.com/token'))
    return { ok: true, json: async () => ({ access_token: 'at' }) };
  if (u.includes('googleapis.com/oauth2/v3/userinfo'))
    return { ok: true, json: async () => ({ email: 'user@example.com', email_verified: true, name: 'مستخدم', picture: null }) };
  throw new Error('نداء خارجيّ غير متوقّع: ' + u);
};

const authPath = require.resolve('../api/_lib/auth.js');
const cbPath = require.resolve('../api/_lib/auth-google-callback.js');
const reload = () => { delete require.cache[authPath]; delete require.cache[cbPath]; return { auth: require(authPath), cb: require(cbPath) }; };
const mkRes = () => { const r = { code: 0, headers: null }; r.writeHead = (c, h) => { r.code = c; r.headers = h; }; r.end = () => {}; r.status = (c) => { r.code = c; return r; }; r.json = () => {}; return r; };

(async () => {
  // سجلّ قديم لبريد جوجل — سيُقفل بتغيّر السرّ
  let { auth } = reload();
  await auth.putUser('g_user@example.com', { username: 'قديم', email: 'user@example.com', hash: 'h', salt: 's' });

  process.env.AUTH_SECRET = 'سرّ-جديد-B';
  delete process.env.AUTH_SECRET_PREVIOUS;
  const fresh = reload();
  auth = fresh.auth;

  const r = mkRes();
  await fresh.cb({ query: { code: 'c', state: 'st' } }, r);
  check(r.code === 302, 'العودة تحويل 302 لا انهيار');
  const loc = (r.headers && r.headers.Location) || '';
  check(!/gerror=/.test(loc), 'لا gerror — الدخول اكتمل رغم السجلّ المقفل: ' + loc.slice(0, 60));
  check(/gtoken=/.test(loc) && /state=st/.test(loc), 'ومعه gtoken وstate كما هما');

  const reborn = await auth.getUser('g_user@example.com');
  check(reborn && reborn.email === 'user@example.com' && reborn.googleAuth === true,
    'السجلّ أُعيد إنشاؤه فوق المقفل ويُقرأ بالسرّ الجديد');

  // والدخول الثاني بعد الاسترداد طبيعيّ تمامًا
  const r2 = mkRes();
  await fresh.cb({ query: { code: 'c2', state: 'st2' } }, r2);
  check(r2.code === 302 && /gtoken=/.test((r2.headers || {}).Location || ''), 'الدخول التالي يمرّ من المسار العاديّ');

  console.log('google reclaim tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
