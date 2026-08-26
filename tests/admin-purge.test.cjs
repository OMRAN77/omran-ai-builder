// تطهير السجلّ المقفل: هل يستطيع المالك تحرير اسمٍ سجلُّه لا يُفكّ؟
//
// بعد ضياع AUTH_SECRET صارت السجلّات القديمة ترمي USER_RECORD_UNDECRYPTABLE
// (سدّ #26) بدل التنكّر في هيئة «غير موجود». لكنّ delete الإداريّ كان يقرأ
// السجلّ أوّلًا ليكتب فيه deleted:true — فيرمي هو الآخر، ويبقى الاسم أسيرًا
// بلا أيّ مخرج: لا يُقرأ ولا يُحذف ولا يُنشأ. هذا الاختبار يثبّت المخرج:
// delete على سجلّ مقفل = حذف مباشر من المخزن، والاسم يتحرّر.
//
// يشغّل admin-actions.js الحقيقيّ بمخزن في الذاكرة — قياس سلوك لا قراءة نصّ.
const assert = require('node:assert/strict');

function check(ok, label) { assert.ok(ok, label); console.log('  ✓ ' + label); }

process.env.AUTH_SECRET = 'سرّ-قديم-A';
process.env.OWNER_USERNAME = 'boss';

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
process.env.UPSTASH_REDIS_REST_URL = 'http://فحص-محلّيّ';

const authPath = require.resolve('../api/_lib/auth.js');
const adminPath = require.resolve('../api/_lib/admin-actions.js');
const reload = () => {
  delete require.cache[authPath];
  delete require.cache[adminPath];
  return { auth: require(authPath), admin: require(adminPath) };
};
const mkRes = () => { const r = { code: 0, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (o) => { r.body = o; }; r.setHeader = () => {}; return r; };

(async () => {
  // بالسرّ القديم: سجلّان سيُقفلان
  let { auth } = reload();
  await auth.putUser('ghost', { username: 'ghost', hash: 'h', salt: 's' });
  await auth.putUser('ghost2', { username: 'ghost2', hash: 'h', salt: 's' });

  // تغيّر السرّ بلا سابق — تمامًا كما وقع في الإنتاج
  process.env.AUTH_SECRET = 'سرّ-جديد-B';
  delete process.env.AUTH_SECRET_PREVIOUS;
  const fresh = reload();
  auth = fresh.auth;
  const admin = fresh.admin;
  const ownerToken = auth.makeToken('boss');
  const call = async (body) => { const r = mkRes(); await admin({ method: 'POST', body }, r); return r; };

  // delete على المقفل = تطهير مباشر
  const del = await call({ token: ownerToken, action: 'delete', targetUsername: 'ghost' });
  check(del.code === 200 && del.body && del.body.purged === true, 'delete على سجلّ مقفل يطهّره مباشرة (purged:true)');
  check(!store.has('db/users/ghost.json'), 'والسجلّ زال فعلًا من المخزن');
  check((await auth.getUser('ghost')) === null, 'فصار الاسم حرًّا — getUser تعيد null لا رميًا');

  // غير الحذف على المقفل يُرفض باسم الحالة، والسجلّ يبقى
  const ban = await call({ token: ownerToken, action: 'ban', targetUsername: 'ghost2' });
  check(ban.code === 409 && ban.body && ban.body.error === 'sealed_record', 'ban على سجلّ مقفل → 409 sealed_record لا 500 غامضة');
  check(store.has('db/users/ghost2.json'), 'ولا يُحذف السجلّ إلا بطلب delete صريح');

  // السلوك القديم سليم: غير المالك 403، والغائب 404، والسليم يُحذف حذفًا ناعمًا
  const notOwner = await call({ token: auth.makeToken('someone'), action: 'delete', targetUsername: 'ghost2' });
  check(notOwner.code === 403, 'غير المالك ممنوع كما كان');
  const missing = await call({ token: ownerToken, action: 'delete', targetUsername: 'لا-أحد' });
  check(missing.code === 404, 'الحساب الغائب فعلًا ما زال 404');
  await auth.putUser('normal', { username: 'normal', hash: 'h', salt: 's' });
  const soft = await call({ token: ownerToken, action: 'delete', targetUsername: 'normal' });
  check(soft.code === 200 && soft.body.deleted === true && store.has('db/users/normal.json'),
    'السجلّ السليم يُحذف حذفًا ناعمًا (deleted:true) لا تطهيرًا');

  // v-purge-checks: زر واحد يمسح حسابات الفحص zzcheck ونقاطها — ولا يمسّ غيرها.
  await auth.putUser('zzcheckab12cd34', { username: 'zzcheckab12cd34', hash: 'h', salt: 's' });
  await auth.putUser('zzcheckff00ff00', { username: 'zzcheckff00ff00', hash: 'h', salt: 's' });
  store.set('points:zzcheckab12cd34', '3');
  const purge = await call({ token: ownerToken, action: 'purge-checks' });
  check(purge.code === 200 && purge.body.ok === true && purge.body.removed === 2, 'purge-checks تحذف حسابي الفحص معًا');
  check(!store.has('db/users/zzcheckab12cd34.json') && !store.has('points:zzcheckab12cd34'), 'السجل والنقاط زالا نهائيًّا');
  check(store.has('db/users/normal.json') && store.has('db/users/ghost2.json'), 'الحسابات الأخرى لم تُمسّ');
  const purgeNotOwner = await call({ token: auth.makeToken('someone'), action: 'purge-checks' });
  check(purgeNotOwner.code === 403, 'purge-checks للمالك وحده');

  console.log('admin purge tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
