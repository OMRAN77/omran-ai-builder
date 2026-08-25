// scripts/storage-check.mjs — هل يثبت ما يُكتب في قاعدة البيانات فعلًا؟
//
// «التسجيل ما يثبت» عرَضٌ له سببان مختلفان تمامًا، ولا يفرّق بينهما شيء من
// الخارج لأنّ كليهما ينتهي إلى «الحساب غير موجود»:
//
//   ① Upstash لا تُكتب أو لا تُقرأ. kv.js يبتلع كلّ خطأ قراءة ويعيد null
//      (kv.js:51)، فالسجلّ الغائب والخادم الميت سواء.
//   ② السجلّ يُكتب ويُقرأ، لكنّ فكّ تعميته يفشل — لأنّ المفتاح مشتقّ من
//      AUTH_SECRET، فتغييره يجعل كلّ الحسابات القديمة غير مقروءة دفعةً
//      واحدة. auth.js:135 يسجّل ثمّ يعيد null: «سجلّ تالف = غير موجود».
//
// هذا الفحص يفصل بينهما بلا أيّ سرّ وبلا إنشاء حساب: مسار المشاركة
// (POST /api/account?action=share) عامّ ويكتب في نفس Redis التي تحمل سجلّات
// المستخدمين، وقراءته بالمعرّف عامّة كذلك — وهي غير معمّاة.
//
//   يكتب ثمّ يقرأ  ✓  → التخزين حيّ، فالعطب في التعمية أي في AUTH_SECRET
//   يكتب ثمّ يقرأ  ✗  → التخزين نفسه هو العطب
//
// يقرأ مرّتين: فورًا وبعد ثانية ونصف، فيميّز الفشل الدائم من تأخّر الاتّساق.
// يترك سجلّ مشاركة واحدًا صغيرًا لكلّ تشغيل (الحذف يتطلّب توكن مالك السجلّ)،
// ولذلك يُشغَّل عند الطلب لا مع كلّ نشرة.
//
//   node scripts/storage-check.mjs [BASE_URL]
const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const no = (m) => { fail++; console.log('  ✗ ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// علامة فريدة لهذا التشغيل: لا Date.now في المقارنة، بل نصّ نكتبه ونطلبه.
const stamp = 'storage-check ' + process.pid + ' ' + Math.random().toString(36).slice(2, 10);

console.log('① كتابة سجلّ في نفس قاعدة بيانات الحسابات');
let id = null;
try {
  const r = await fetch(BASE + '/api/account?action=share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'فحص تخزين — يُهمَل', code: stamp, isPublic: false, username: 'storage-check' }),
  });
  const t = await r.text();
  if (r.status !== 200) {
    no(`الكتابة → ${r.status} ${t.slice(0, 160)}`);
    if (/UPSTASH/i.test(t)) console.log('  · الخادم يقول إنّ متغيّر Upstash غائب — هذا هو السبب مباشرةً.');
  } else {
    let j = null;
    try { j = JSON.parse(t); } catch (e) { /* يُعالَج أدناه */ }
    if (j && j.id) { id = j.id; ok(`كُتب السجلّ (${id})`); }
    else no('الكتابة ردّت ٢٠٠ بلا معرّف: ' + t.slice(0, 160));
  }
} catch (e) { no('الكتابة تعذّرت — ' + e.message); }

if (!id) {
  console.log('\n✗ لا يمكن المتابعة: الكتابة لم تنجح، والتخزين نفسه هو العطب.');
  process.exit(1);
}

console.log('② قراءته مرّة أولى — فورًا');
const read = async () => {
  try {
    const r = await fetch(BASE + '/api/account?action=share&id=' + encodeURIComponent(id));
    const t = await r.text();
    if (r.status !== 200) return { status: r.status, body: t };
    try { return { status: 200, json: JSON.parse(t) }; } catch (e) { return { status: 200, body: t }; }
  } catch (e) { return { status: 0, body: e.message }; }
};

let first = await read();
if (first.status === 200 && first.json && first.json.code === stamp) ok('قُرئ فورًا ومحتواه مطابق');
else if (first.status === 404) no('غاب فورًا (404) — كُتب ولم يُقرأ');
else no(`القراءة الأولى → ${first.status} ${(first.body || JSON.stringify(first.json || {})).slice(0, 160)}`);

console.log('③ قراءته مرّة ثانية — بعد ثانية ونصف');
await sleep(1500);
const second = await read();
if (second.status === 200 && second.json && second.json.code === stamp) ok('ما زال موجودًا ومطابقًا');
else if (second.status === 404) no('اختفى بعد ثانية ونصف — الكتابة لا تثبت');
else no(`القراءة الثانية → ${second.status}`);

console.log('\nالخلاصة');
if (fail === 0) {
  console.log('  · التخزين حيّ: ما يُكتب يُقرأ ويثبت.');
  console.log('  · إذًا «التسجيل ما يثبت» ليس سببه Redis، بل فكّ تعمية سجلّات');
  console.log('    المستخدمين — أي أنّ AUTH_SECRET تغيّر عمّا كُتبت به.');
  console.log('    ابحث في سجلّ Vercel عن auth:decrypt لتأكيد ذلك.');
} else {
  console.log('  · التخزين نفسه هو العطب: راجع UPSTASH_REDIS_REST_URL و');
  console.log('    UPSTASH_REDIS_REST_TOKEN في Vercel ثمّ أعد النشر.');
}
console.log(`\n${fail === 0 ? '✓ التخزين يثبت' : '✗ التخزين لا يثبت'} — نجح ${pass} · فشل ${fail} · ${BASE}`);
process.exit(fail === 0 ? 0 : 1);
