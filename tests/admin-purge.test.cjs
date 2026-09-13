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

// لا نتوقف عند أوّل فشل: رؤية كلّ ما سقط دفعةً واحدة أسرع في التشخيص.
const failures = [];
let passed = 0;

function check(ok, label) {
  if (ok) { passed++; console.log('  ✓ ' + label); }
  else { failures.push(label); console.log('  ✗ ' + label); }
}

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

// يلتقط end() أيضًا: مسار نهاية بلا json كان سيترك body فارغًا
// فيفشل الفحص برسالة مضلّلة عن المحتوى بدل الإبلاغ عن شكل الردّ.
const mkRes = () => {
  const r = { code: 0, body: null, ended: false };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.body = o; r.ended = true; return r; };
  r.end = (s) => { r.ended = true; if (s && r.body === null) r.body = { raw: String(s) }; return r; };
  r.setHeader = () => {};
  return r;
};

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

  // ── تحرير الاسم المقفل ──────────────────────────────────────────────
  const del = await call({ token: ownerToken, action: 'delete', targetUsername: 'ghost' });
  check(del.code === 200 && del.body && del.body.purged === true, 'delete على سجلّ مقفل يطهّره مباشرة (purged:true)');
  check(!store.has('db/users/ghost.json'), 'والسجلّ زال فعلًا من المخزن');
  check((await auth.getUser('ghost')) === null, 'فصار الاسم حرًّا — getUser تعيد null لا رميًا');
  // التطهير عملية هدم: يجب أن تمسّ هدفها وحده.
  check(store.has('db/users/ghost2.json'), 'تطهير المقفل لا يمسّ سجلًّا مقفلًا آخر');

  // غير الحذف على المقفل يُرفض باسم الحالة، والسجلّ يبقى
  const ban = await call({ token: ownerToken, action: 'ban', targetUsername: 'ghost2' });
  check(ban.code === 409 && ban.body && ban.body.error === 'sealed_record', 'ban على سجلّ مقفل → 409 sealed_record لا 500 غامضة');
  check(store.has('db/users/ghost2.json'), 'ولا يُحذف السجلّ إلا بطلب delete صريح');

  // ── الصلاحية ────────────────────────────────────────────────────────
  const notOwner = await call({ token: auth.makeToken('someone'), action: 'delete', targetUsername: 'ghost2' });
  check(notOwner.code === 403, 'غير المالك ممنوع كما كان');

  // التوكن الغائب/المزوّر: بابٌ لا يقلّ خطرًا عن توكن مستخدم آخر.
  const noToken = await call({ action: 'delete', targetUsername: 'ghost2' });
  check(noToken.code === 401 || noToken.code === 403, 'الطلب بلا توكن يُرفض (401/403)');
  check(store.has('db/users/ghost2.json'), 'ولم يُحذف شيء في الطلب بلا توكن');

  const badToken = await call({ token: 'مزوّر.لا.يفكّ', action: 'delete', targetUsername: 'ghost2' });
  check(badToken.code === 401 || badToken.code === 403, 'التوكن المزوّر يُرفض');
  check(store.has('db/users/ghost2.json'), 'ولم يُحذف شيء بالتوكن المزوّر');

  // ── السلوك المعتاد ──────────────────────────────────────────────────
  const missing = await call({ token: ownerToken, action: 'delete', targetUsername: 'لا-أحد' });
  check(missing.code === 404, 'الحساب الغائب فعلًا ما زال 404');

  await auth.putUser('normal', { username: 'normal', hash: 'h', salt: 's' });
  const soft = await call({ token: ownerToken, action: 'delete', targetUsername: 'normal' });
  check(soft.code === 200 && soft.body.deleted === true && store.has('db/users/normal.json'),
    'السجلّ السليم يُحذف حذفًا ناعمًا (deleted:true) لا تطهيرًا');

  // ── purge-checks ────────────────────────────────────────────────────
  // v-purge-checks: زر واحد يمسح حسابات الفحص zzcheck ونقاطها — ولا يمسّ غيرها.
  await auth.putUser('zzcheckab12cd34', { username: 'zzcheckab12cd34', hash: 'h', salt: 's' });
  await auth.putUser('zzcheckff00ff00', { username: 'zzcheckff00ff00', hash: 'h', salt: 's' });
  store.set('points:zzcheckab12cd34', '3');

  // حدود النمط: هذه هي الفحوصات التي تحمي مستخدمًا حقيقيًّا من المحو.
  // لو كان الشرط includes('zzcheck') بدل startsWith، لضاع «myzzcheck99» بلا رجعة.
  await auth.putUser('myzzcheck99', { username: 'myzzcheck99', hash: 'h', salt: 's' });
  await auth.putUser('zzcheckup', { username: 'zzcheckup', hash: 'h', salt: 's' });

  const purge = await call({ token: ownerToken, action: 'purge-checks' });
  check(purge.code === 200 && purge.body.ok === true, 'purge-checks تنجح للمالك');
  check(!store.has('db/users/zzcheckab12cd34.json') && !store.has('points:zzcheckab12cd34'), 'السجل والنقاط زالا نهائيًّا');
  check(!store.has('db/users/zzcheckff00ff00.json'), 'حساب الفحص الثاني زال أيضًا');
  check(store.has('db/users/myzzcheck99.json'), 'اسم يحوي zzcheck في وسطه لا يُمسّ — الشرط بداية لا احتواء');
  check(store.has('db/users/normal.json') && store.has('db/users/ghost2.json'), 'الحسابات الأخرى لم تُمسّ');

  // «zzcheckup» يبدأ بالسلسلة لكنه ليس بصيغة الفحص (hex بعدها). إن كان
  // النمط فضفاضًا فسيُحذف — نُبلغ لا نفشل، لأن القرار يخصّ صياغة النمط عندك.
  if (!store.has('db/users/zzcheckup.json')) {
    console.log('  · تنبيه: «zzcheckup» حُذف — نمط purge-checks يقبل أي بادئة zzcheck');
    console.log('    إن كانت حسابات الفحص بصيغة zzcheck + hex فقيّد النمط: /^zzcheck[0-9a-f]{8,}$/');
  } else {
    check(true, 'نمط purge-checks مقيّد بصيغة حسابات الفحص لا بمجرد البادئة');
  }

  const purgeNotOwner = await call({ token: auth.makeToken('someone'), action: 'purge-checks' });
  check(purgeNotOwner.code === 403, 'purge-checks للمالك وحده');
  const purgeNoToken = await call({ action: 'purge-checks' });
  check(purgeNoToken.code === 401 || purgeNoToken.code === 403, 'purge-checks بلا توكن يُرفض');

  // ── الخلاصة ─────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(56));
  if (failures.length === 0) {
    console.log(`✅ admin purge tests passed (${passed} فحصًا)`);
    process.exit(0);
  }
  console.log(`❌ ${failures.length} فحصًا فشل من أصل ${passed + failures.length}:\n`);
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
})().catch((e) => { console.error('\n💥 استثناء غير متوقّع:\n', e); process.exit(1); });
