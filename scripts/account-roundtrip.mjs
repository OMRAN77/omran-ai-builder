// scripts/account-roundtrip.mjs — هل يثبت حسابٌ يُنشأ الآن؟
//
// storage-check.mjs أثبت أنّ Redis حيّة: ما يُكتب يُقرأ ويثبت. لكنّ سجلّ
// المشاركة نصّ صريح، وسجلّ المستخدم معمّى بمفتاح مشتقّ من AUTH_SECRET. فبقي
// احتمالان مختلفان تمامًا في العلاج، ولا يفرّق بينهما ذلك الفحص:
//
//   (أ) AUTH_SECRET تغيّر مرّة واحدة في الماضي.
//       ⇒ الحسابات القديمة ضاعت، والجديد يُنشأ ويثبت.
//       ⇒ لا يُستعاد القديم إلا بإرجاع القيمة السابقة حرفيًّا.
//
//   (ب) AUTH_SECRET غير متّسق **الآن** بين استدعاءين — بيئتان مختلفتان، أو
//       قيمة فيها سطر جديد، أو نشرتان بقيمتين.
//       ⇒ حتّى الحساب الجديد لا يثبت، ويستحيل الدخول أصلًا.
//       ⇒ والعلاج ضبط القيمة، لا البحث عن قديمة.
//
// الفرق بينهما هو كلّ شيء، ولا يحسمه إلا إنشاء حساب الآن ومحاولة الدخول به:
// السجلّ يُكتب معمّى ثمّ يُقرأ ويُفكّ في استدعاء لاحق مستقلّ. فإن نجح، فالتعمية
// متّسقة اليوم والعطب (أ). وإن فشل، فهي غير متّسقة والعطب (ب).
//
// يُنشئ حسابًا واحدًا باسم يبدأ بـ zzcheck ليسهل تمييزه، وكلمة مرور عشوائية
// لا تُطبع. للمالك حذفه من لوحة الإدارة (admin-actions → delete).
//
//   node scripts/account-roundtrip.mjs [BASE_URL]
import { randomBytes } from 'node:crypto';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const no = (m) => { fail++; console.log('  ✗ ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const user = 'zzcheck' + randomBytes(4).toString('hex');
const pw = randomBytes(16).toString('base64url');   // لا يُطبع أبدًا

const call = async (payload) => {
  try {
    const r = await fetch(BASE + '/api/account?action=auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch (e) { /* نُبقي النصّ الخام للتشخيص */ }
    return { status: r.status, json: j, text: t };
  } catch (e) { return { status: 0, text: e.message }; }
};

console.log(`① إنشاء حساب جديد (${user})`);
const su = await call({ action: 'signup', username: user, password: pw, lang: 'ar' });
let token = su.json && su.json.token;
if (su.status === 200 && token) ok('أُنشئ الحساب وأُعيد توكن');
else { no(`الإنشاء → ${su.status} ${(su.text || '').slice(0, 200)}`); }

if (su.status !== 200) {
  console.log('\n✗ تعذّر الإنشاء، فلا معنى لبقيّة الفحص.');
  process.exit(1);
}

// كلّ نداء تالٍ استدعاء مستقلّ: يقرأ السجلّ من Redis ويفكّ تعميته من جديد.
console.log('② الدخول به فورًا — يقرأ السجلّ ويفكّ تعميته');
const l1 = await call({ action: 'login', username: user, password: pw, lang: 'ar' });
if (l1.status === 200 && l1.json && l1.json.token) ok('الدخول نجح — السجلّ قُرئ وفُكّت تعميته');
else if (l1.status === 401) no('الدخول رُفض ٤٠١ — السجلّ كُتب قبل ثانية ولم يُقرأ الآن');
else no(`الدخول → ${l1.status} ${(l1.text || '').slice(0, 200)}`);

console.log('③ الدخول به بعد أربع ثوانٍ — من نسخة خادم قد تكون أخرى');
await sleep(4000);
const l2 = await call({ action: 'login', username: user, password: pw, lang: 'ar' });
if (l2.status === 200) ok('ما زال يُقرأ ويُفكّ');
else no(`الدخول الثاني → ${l2.status}`);

console.log('④ التحقّق من التوكن — توقيعه بنفس السرّ');
const v = await call({ action: 'verify', token, lang: 'ar' });
if (v.status === 200) ok('التوكن صالح — التوقيع متّسق بين الاستدعاءين');
else if (v.status === 401) no('التوكن رُفض ٤٠١ — السرّ يختلف بين استدعاء وآخر');
else no(`التحقّق → ${v.status}`);

console.log('\nالخلاصة');
if (fail === 0) {
  console.log('  · حسابٌ يُنشأ الآن يثبت ويُقرأ ويُفكّ. التعمية متّسقة اليوم.');
  console.log('  · إذًا AUTH_SECRET تغيّر مرّة في الماضي، فضاعت الحسابات');
  console.log('    السابقة له وحدها. الجديدة تعمل، ولا تُستعاد القديمة إلا');
  console.log('    بإرجاع القيمة السابقة حرفيًّا.');
  console.log('  · ولا تغيّره بعد اليوم: كلّ تغيير يمحو كلّ الحسابات.');
} else {
  console.log('  · حتّى الحساب الجديد لا يثبت: AUTH_SECRET غير متّسق **الآن**');
  console.log('    بين استدعاء وآخر — بيئتان مختلفتان، أو سطر جديد في القيمة،');
  console.log('    أو نشرتان بقيمتين. اضبطه لقيمة واحدة في Production ثمّ انشر.');
}
console.log(`\n  · احذف الحساب ${user} من لوحة الإدارة متى شئت.`);
console.log(`\n${fail === 0 ? '✓ الحساب الجديد يثبت' : '✗ الحساب الجديد لا يثبت'} — نجح ${pass} · فشل ${fail} · ${BASE}`);
process.exit(fail === 0 ? 0 : 1);
