// tests/pack.test.cjs — الحالات التي وُجدت وحدة الترتيب من أجلها.
// كل اختبار هنا يعيد إنتاج عطبٍ مقيس، لا فرضية.
const test = require('node:test');
const assert = require('node:assert');
const { rankFiles, packFiles, renderPack } = require('../api/_lib/_pack.js');

// العطب الأصليّ حرفيًّا: قياس على omran-ai-builder.zip نفسه.
const REPO = [
  { name: 'templates-data.js', size: 41201 },
  { name: 'app.bundle.js', size: 1339551 },   // مولَّد — كان يبتلع الميزانيّة
  { name: 'sw.js', size: 4700 },
  { name: 'README.md', size: 18 },
  { name: 'index.html', size: 71257 },
  { name: 'package-lock.json', size: 10277 },
  { name: 'node_modules/left-pad/index.js', size: 300 },
  { name: 'api/_lib/chat.js', size: 40000 },  // كان الترتيب ١٢٨ ⇒ يُقصى
  { name: 'api/_lib/auth.js', size: 22000 },
  { name: 'tests/cors.test.cjs', size: 1200 },
];

test('الناتج المولَّد لا يُقرأ مهما تصدّر ترتيب الأرشيف', () => {
  const r = rankFiles(REPO);
  const bundle = r.find((f) => f.name === 'app.bundle.js');
  assert.strictEqual(bundle.score, -1);
  assert.strictEqual(bundle.skip, 'ناتج آليّ');
  assert.strictEqual(r.find((f) => f.name === 'package-lock.json').score, -1);
});

test('node_modules تُستبعد', () => {
  const r = rankFiles(REPO);
  assert.strictEqual(r.find((f) => f.name.startsWith('node_modules')).score, -1);
});

test('العطب المقيس: chat.js كان رقم ١٢٨ — الآن ضمن العشرة الأوائل', () => {
  const r = rankFiles(REPO).filter((f) => f.score >= 0);
  const pos = r.findIndex((f) => f.name === 'api/_lib/chat.js');
  assert.ok(pos >= 0 && pos < 10, 'chat.js في الموضع ' + pos);
});

test('سؤال المستخدم يرفع الملفّ المعنيّ إلى القمّة ولو كان عميقًا', () => {
  const r = rankFiles(REPO, 'اشرح لي منطق auth والجلسات');
  assert.strictEqual(r[0].name, 'api/_lib/auth.js');
});

test('الاختبارات تنزل تحت المصدر', () => {
  const r = rankFiles(REPO).filter((f) => f.score >= 0);
  const src = r.findIndex((f) => f.name === 'api/_lib/chat.js');
  const tst = r.findIndex((f) => f.name === 'tests/cors.test.cjs');
  assert.ok(src < tst, 'المصدر يجب أن يسبق الاختبار');
});

test('الترتيب ثابت بين تشغيلين', () => {
  const a = rankFiles(REPO).map((f) => f.name).join('|');
  const b = rankFiles(REPO.slice().reverse()).map((f) => f.name).join('|');
  assert.strictEqual(a, b);
});

test('ملفّ واحد يُعطى كاملًا بلا حدّ فرديّ', () => {
  const one = [{ name: 'index.html', size: 90000 }];
  const body = 'x'.repeat(90000);
  const p = packFiles(rankFiles(one), () => body, { budget: 300000 });
  assert.strictEqual(p.picked[0].truncated, false);
  assert.strictEqual(p.picked[0].text.length, 90000);
});

test('ملفّ ضخم لا يبتلع ميزانيّة البقيّة', () => {
  const many = [
    { name: 'big.js', size: 500000 },
    { name: 'small-a.js', size: 100 },
    { name: 'small-b.js', size: 100 },
  ];
  const p = packFiles(rankFiles(many), (n) => (n === 'big.js' ? 'y'.repeat(500000) : 'ok'), {
    budget: 100000, perFile: 60000,
  });
  assert.strictEqual(p.picked.length, 3, 'الثلاثة كلّها تُقرأ');
  assert.ok(p.picked.find((f) => f.name === 'big.js').truncated);
});

test('المحتوى الثنائيّ يُرفض ولا يُحقن في السياق', () => {
  const f = [{ name: 'fake.js', size: 10 }];
  const p = packFiles(rankFiles(f), () => 'ab\u0000cd', {});
  assert.strictEqual(p.picked.length, 0);
  assert.strictEqual(p.skipped[0].why, 'محتوى ثنائيّ');
});

test('قراءة تفشل لا تُسقط الأرشيف كلّه', () => {
  const f = [{ name: 'a.js', size: 10 }, { name: 'b.js', size: 10 }];
  const p = packFiles(rankFiles(f), (n) => { if (n === 'a.js') throw new Error('boom'); return 'fine'; }, {});
  assert.strictEqual(p.picked.length, 1);
  assert.strictEqual(p.picked[0].name, 'b.js');
});

test('الناتج يحمل أرقام أسطر حقيقيّة للاقتباس', () => {
  const f = [{ name: 'a.js', size: 20 }];
  const p = packFiles(rankFiles(f), () => 'line1\nline2\nline3', {});
  const out = renderPack('t.zip', f, p);
  assert.match(out, /1│ line1/);
  assert.match(out, /3│ line3/);
});

test('البيان يذكر كلّ ملفّ حتّى غير المقروء', () => {
  const p = packFiles(rankFiles(REPO), () => 'ok', {});
  const out = renderPack('omran.zip', REPO, p);
  assert.match(out, /app\.bundle\.js {2}\(ناتج آليّ\)/);
  assert.match(out, /node_modules/);
});
