// مناوبة سرّ الجلسات: هل ينجو الحساب من تغيير AUTH_SECRET؟
//
// حدث فعلًا يوم ٢٥ أغسطس ٢٠٢٦: تغيّر AUTH_SECRET، فصار كلّ سجلّ مستخدم غير
// قابل للفكّ دفعةً واحدة — لأنّ مفتاح التعمية مشتقّ منه. والشيفرة كانت تعيد
// null عند فشل الفكّ، أي «حساب غير موجود»، فظهر العطب للمستخدم بوصفه
// «التسجيل ما يثبت»، وضاع يوم كامل في تشخيص عرَض كاذب.
//
// وكان تحته بابٌ أسوأ: signup يقرأ null فيظنّ الاسم حرًّا فيكتب فوق السجلّ —
// أي أنّ ضياع السرّ كان يتيح الاستيلاء على أسماء المستخدمين.
//
// الاختبار يشغّل api/_lib/auth.js نفسه — لا نسخة مكتوبة هنا — بمخزن في
// الذاكرة بدل Redis، فيقيس السلوك لا يقرأ النصّ.
const assert = require('node:assert/strict');

function check(ok, label) {
  assert.ok(ok, label);
  console.log('  ✓ ' + label);
}

process.env.AUTH_SECRET = 'secret-A-قديم';
process.env.OWNER_USERNAME = 'omran';

// مخزن وهميّ: نفس واجهة kv.js، بلا شبكة.
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

const authPath = require.resolve('../api/_lib/auth.js');
// السرّ يُقرأ داخل دالّة، لكنّ المفاتيح تُخزَّن — وإعادة التحميل تحاكي نشرة
// جديدة بمتغيّر بيئة مختلف، وهو ما يحدث فعلًا في Vercel.
const reload = () => { delete require.cache[authPath]; return require(authPath); };

(async () => {
  let auth = reload();
  await auth.putUser('omranx', { username: 'omranx', hash: 'h', salt: 's' });
  const same = await auth.getUser('omranx');
  check(same && same.username === 'omranx', 'يُكتب ويُقرأ بالسرّ نفسه');

  // ── تغيّر السرّ بلا ضبط السابق: كان يُعيد null بصمت ─────────────────────
  process.env.AUTH_SECRET = 'secret-B-جديد';
  delete process.env.AUTH_SECRET_PREVIOUS;
  auth = reload();
  let thrown = null, returned;
  try { returned = await auth.getUser('omranx'); } catch (e) { thrown = e; }
  check(thrown !== null, 'سجلّ لا يُفكّ يرمي بدل أن يُعاد null بصمت');
  check(thrown && thrown.code === 'USER_RECORD_UNDECRYPTABLE', 'الرمي يحمل رمزًا يسمّي السبب');
  check(returned === undefined, 'ولا يتسرّب منه «حساب غير موجود» إلى المُنادي');

  // ── وبضبط السابق: يُقرأ، ثمّ يُعاد تعميته بالجديد ───────────────────────
  process.env.AUTH_SECRET_PREVIOUS = 'secret-A-قديم';
  auth = reload();
  const migrated = await auth.getUser('omranx');
  check(migrated && migrated.username === 'omranx', 'السرّ السابق يقرأ السجلّ القديم');
  check(migrated.hash === 'h' && migrated.salt === 's', 'ويعيده كاملًا بلا فقد');

  // إزالة السابق بعد المناوبة: لو لم يُعَد التعمية لفشلت القراءة الآن.
  delete process.env.AUTH_SECRET_PREVIOUS;
  auth = reload();
  const afterRekey = await auth.getUser('omranx');
  check(afterRekey && afterRekey.username === 'omranx',
    'أُعيد تعميته بالمفتاح الجديد، فلم يعد يحتاج السابق');

  // ── حساب غائب فعلًا يبقى null: الرمي للسجلّ التالف وحده ────────────────
  const missing = await auth.getUser('لا-أحد-بهذا-الاسم');
  check(missing === null, 'حساب غير موجود فعلًا ما زال null لا رميًا');

  console.log('auth key rotation tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
