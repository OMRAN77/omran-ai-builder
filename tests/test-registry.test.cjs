// tests/test-registry.test.cjs — v-parallel-tests: كلّ ملفّ tests/*.test.cjs مسجّل مرّة واحدة، و`npm run ci` يشغّل المتوازي.
// العرض (تدقيق البنية ١١ أكتوبر): ٣ ملفّات لم تُسجَّل قطّ (اثنان منها يفشلان بصمت منذ أسابيع)، ومدخلان مشوّهان
// «node a node a» في السلسلة؛ ولا شيء ينبّه حين يُكتب اختبار ولا يُسجَّل — فلا يُشغَّل في CI أبدًا.
// القرار: القائمة في package.json (pretest + test) هي المصدر الوحيد، ويقرؤها scripts/run-tests.mjs نفسه هنا؛
// ما لا يُسجَّل يُستثنى صراحةً بسبب مكتوب.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// ملفّات تبقى في المجلّد بلا تسجيل — كلّ واحد بسببه. لا تُضِف هنا لتسكت فشلًا جديدًا: أصلحه أو سجّله.
const UNREGISTERED_OK = {
  'tests/floorplan-provider.test.cjs': 'يفشل على main ولم يُسجَّل قطّ: يثبّت نصّ فشل عربيًّا في js/app-15-floorplan.js نُقل إلى جدول اللغات — إصلاحه مهمّة مستقلّة',
  'tests/pdf-font.test.cjs': 'يفشل على main ولم يُسجَّل قطّ: يقيّم شريحة من app-05/app-08 بلا omranNativeBridge فيرمي ReferenceError — إصلاحه مهمّة مستقلّة',
};

const load = async () => import(pathToFileURL(path.join(root, 'scripts', 'run-tests.mjs')).href);

test('١. كلّ tests/*.test.cjs مسجّل (أو مستثنى بسبب مكتوب)، وكلّ مسجّل موجود', async () => {
  const { registered } = await load();
  const reg = new Set(registered(pkg).map((e) => e.file));
  const all = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.cjs')).map((f) => 'tests/' + f);
  const orphans = all.filter((f) => !reg.has(f) && !UNREGISTERED_OK[f]);
  assert.deepEqual(orphans, [], 'ملفّات اختبار لا يشغّلها CI — أضفها في آخر سلسلة test: ' + orphans.join(' '));
  for (const f of reg) assert.ok(fs.existsSync(path.join(root, f)), 'مسجّل وغير موجود: ' + f);
  for (const f of Object.keys(UNREGISTERED_OK)) {
    assert.ok(fs.existsSync(path.join(root, f)), 'استثناء لملفّ حُذف — احذف سطره: ' + f);
    assert.ok(!reg.has(f), 'سُجّل فارفع استثناءه: ' + f);
  }
});

test('٢. سلسلة test: كلّ مقطع «node tests/x.test.cjs» وحده، ولا ملفّ مرّتين', () => {
  const segs = pkg.scripts.test.split('&&').map((s) => s.trim());
  const odd = segs.filter((s) => !/^node tests\/\S+\.test\.cjs$/.test(s));
  assert.deepEqual(odd, [], 'مقاطع مشوّهة');
  const files = segs.map((s) => s.slice('node '.length));
  const dup = files.filter((f, i) => files.indexOf(f) !== i);
  assert.deepEqual(dup, [], 'مسجّل مرّتين');
});

test('٣. npm run ci يشغّل المشغّل المتوازي، والسلسلة باقية احتياطًا (test:serial)', () => {
  const s = pkg.scripts;
  assert.equal(s['test:parallel'], 'node scripts/run-tests.mjs');
  assert.match(s.ci, /&& npm run test:parallel$/, 'ci ينتهي بالمتوازي');
  assert.doesNotMatch(s.ci, /npm test\b/, 'لا تشغيل تسلسليّ مكرّر داخل ci');
  assert.equal(s['test:serial'], 'npm test', 'الاحتياط: pretest ثمّ السلسلة كما كانت');
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'run-tests.mjs')));
});
