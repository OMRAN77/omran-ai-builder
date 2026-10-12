// tests/run-tests.test.cjs — v-parallel-tests: المشغّل المتوازي scripts/run-tests.mjs.
// العرض: سلسلة `&&` تقف عند أوّل فشل فتخفي ما بعده، وتشغّل الملفّات واحدًا واحدًا (~١٠ دقائق، ٧٥٪ انتظار).
// القرار: المشغّل يقرأ القائمة نفسها من package.json، يجمع كلّ إخفاق ويخرج ١، ويبدأ بالأطول.
// يُبنى مستودع صغير في مجلّد مؤقّت (لا شبكة ولا زمن حقيقيّ يُعتمد عليه في الحكم).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const RUNNER = path.join(root, 'scripts', 'run-tests.mjs');

const PASS = "require('node:test')('ok', () => {});\n";
const FAIL = "const assert = require('node:assert');\nrequire('node:test')('boom', () => { assert.equal(1, 2, 'FAILED-ON-PURPOSE'); });\n";

function fixture(scripts, files, durations) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tests-'));
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fx', scripts }));
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), body);
  if (durations) fs.writeFileSync(path.join(dir, 'scripts', 'test-durations.json'), JSON.stringify(durations));
  return dir;
}
const run = (dir, extra) => spawnSync(process.execPath, [RUNNER, '--root', dir].concat(extra || []), { encoding: 'utf8', env: Object.assign({}, process.env, { TEST_JOBS: '' }) });
const resultLines = (out) => out.split('\n').filter((l) => /^[✓✗] tests\//.test(l));

test('١. فشلان في السلسلة: كلاهما يُبلَّغ، والناجح بعد الفشل الأوّل يُشغَّل، والخروج ١', () => {
  const dir = fixture({
    pretest: 'npm run test:pre',
    'test:pre': 'node --test tests/pre.test.cjs',
    test: 'node tests/fail1.test.cjs && node tests/pass.test.cjs && node tests/fail2.test.cjs',
  }, { 'tests/pre.test.cjs': PASS, 'tests/fail1.test.cjs': FAIL, 'tests/pass.test.cjs': PASS, 'tests/fail2.test.cjs': FAIL });
  try {
    const r = run(dir, ['--jobs', '2']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const lines = resultLines(r.stdout);
    assert.equal(lines.length, 4, 'الملفّات الأربعة شُغّلت كلّها (pretest ضمنها): ' + lines.join(' | '));
    assert.ok(lines.some((l) => l.startsWith('✗ tests/fail1.test.cjs')) && lines.some((l) => l.startsWith('✗ tests/fail2.test.cjs')), 'الفشلان معًا لا الأوّل وحده');
    assert.ok(lines.some((l) => l.startsWith('✓ tests/pass.test.cjs')) && lines.some((l) => l.startsWith('✓ tests/pre.test.cjs')));
    assert.match(r.stdout, /FAILED-ON-PURPOSE/, 'مخرجات الفاشل تُطبع ليُرى السبب');
    assert.match(r.stdout, /الفاشلة:\n  tests\/fail1\.test\.cjs\n  tests\/fail2\.test\.cjs|الفاشلة:\n  tests\/fail2\.test\.cjs\n  tests\/fail1\.test\.cjs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('٢. الكلّ ناجح → خروج ٠، والأطول (من ملفّ المدد) يبدأ أوّلًا', () => {
  const dir = fixture(
    { test: 'node tests/a.test.cjs && node tests/b.test.cjs && node tests/slow.test.cjs' },
    { 'tests/a.test.cjs': PASS, 'tests/b.test.cjs': PASS, 'tests/slow.test.cjs': PASS },
    { 'tests/slow.test.cjs': 90000, 'tests/b.test.cjs': 2000 });
  try {
    const r = run(dir, ['--jobs', '1']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(resultLines(r.stdout).map((l) => l.split(/\s+/)[1]), ['tests/slow.test.cjs', 'tests/b.test.cjs', 'tests/a.test.cjs']);
    assert.match(r.stdout, /اختبارات node:test: 3 · نجح 3 · فشل 0/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('٣. مدخل مشوّه («node a node a») أو ملفّ مسجّل غائب → رفض صريح بخروج ٢ لا ابتلاع', () => {
  const bad = fixture({ test: 'node tests/a.test.cjs node tests/a.test.cjs' }, { 'tests/a.test.cjs': PASS });
  const gone = fixture({ test: 'node tests/a.test.cjs && node tests/missing.test.cjs' }, { 'tests/a.test.cjs': PASS });
  try {
    const r1 = run(bad);
    assert.equal(r1.status, 2);
    assert.match(r1.stderr, /مقاطع غير مفهومة/);
    const r2 = run(gone);
    assert.equal(r2.status, 2);
    assert.match(r2.stderr, /tests\/missing\.test\.cjs/);
  } finally { fs.rmSync(bad, { recursive: true, force: true }); fs.rmSync(gone, { recursive: true, force: true }); }
});

test('٤. ملفّ معلّق يُقتل بمهلته ويُعدّ فاشلًا بدل تعليق CI', () => {
  const dir = fixture({ test: 'node tests/hang.test.cjs && node tests/a.test.cjs' }, { 'tests/hang.test.cjs': 'setInterval(() => {}, 1000);\n', 'tests/a.test.cjs': PASS });
  try {
    const r = spawnSync(process.execPath, [RUNNER, '--root', dir, '--jobs', '2'], { encoding: 'utf8', env: Object.assign({}, process.env, { TEST_FILE_TIMEOUT_MS: '3000' }) });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /✗ tests\/hang\.test\.cjs .*\(timeout\)/);
    assert.match(r.stdout, /✓ tests\/a\.test\.cjs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('٥. على package.json الحقيقيّ: القائمة = pretest ثمّ test بلا تكرار، والفشل يحمل كلّ ملفّ مسجّل', async () => {
  const { registered, counts } = await import(require('node:url').pathToFileURL(RUNNER).href);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const list = registered(pkg);
  const files = list.map((e) => e.file);
  assert.equal(new Set(files).size, files.length, 'لا ملفّ مرّتين');
  assert.equal(files[0], 'tests/chat-route-credentials.test.cjs', 'pretest أوّلًا كما كان npm test');
  assert.ok(files.includes('tests/image-rejected-verdict.test.cjs') && files.includes('tests/reply-toolbar.test.cjs'), 'ملفّات pretest ضمن القائمة');
  assert.deepEqual(list.find((e) => e.file === 'tests/reply-toolbar.test.cjs').args, ['--test', 'tests/reply-toolbar.test.cjs'], 'تُشغَّل بأمرها المسجّل (node --test)');
  const chain = pkg.scripts.test.split('&&').length;
  assert.ok(files.length >= chain, 'كلّ مقطع من سلسلة test في القائمة');
  assert.deepEqual(counts('# tests 4\n# pass 3\n# fail 1\nℹ tests 2\nℹ pass 2\nℹ fail 0\n'), { tests: 6, pass: 5, fail: 1 });
});

test('٦. النداء عبر مسار فيه رابط رمزيّ يشغّل الاختبارات ويرى الفشل؛ والتشغيل الفارغ خروج ٢ لا نجاح (arch-2)', () => {
  const dir = fixture({ test: 'node tests/fail.test.cjs' }, { 'tests/fail.test.cjs': FAIL });
  const empty = fixture({ test: '' }, {});
  try {
    const link = path.join(dir, 'scripts-link');
    fs.symlinkSync(path.join(root, 'scripts'), link);
    const r = spawnSync(process.execPath, [path.join(link, 'run-tests.mjs'), '--root', dir, '--jobs', '1'], { encoding: 'utf8' });
    assert.equal(r.status, 1, 'كان ٠ بلا مخرجات: ' + r.stdout + r.stderr);
    assert.match(r.stdout, /✗ tests\/fail\.test\.cjs/);
    const e = run(empty);
    assert.equal(e.status, 2, e.stdout + e.stderr);
    assert.match(e.stderr, /لا ملفّ اختبار مسجّل/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(empty, { recursive: true, force: true }); }
});

test('٧. حفيد هارب يمسك الأنابيب: الملفّ الذي خرج ٠ ناجح بلا انتظاره، والمعلّق يُحسم بمهلته + المهلة القصيرة (arch-3)', () => {
  // حفيد في جلسة مستقلّة يرث الأنابيب ويعيش ١٢ ثانية — kill(-pid) لا يصله، و'close' لا يأتي قبله
  const LEAK = "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 12000)'], { detached: true, stdio: 'inherit' }).unref();\n";
  const dir = fixture({ test: 'node tests/leak.test.cjs && node tests/hang.test.cjs' }, {
    'tests/leak.test.cjs': LEAK + PASS,
    'tests/hang.test.cjs': LEAK + 'setInterval(() => {}, 1000);\n',
  });
  try {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [RUNNER, '--root', dir, '--jobs', '2'], { encoding: 'utf8', env: Object.assign({}, process.env, { TEST_FILE_TIMEOUT_MS: '2500', TEST_EXIT_GRACE_MS: '400' }) });
    const wall = Date.now() - t0;
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /✓ tests\/leak\.test\.cjs/, 'خرج ٠ = ناجح (كان «timeout» بعد ١٢ ثانية)');
    assert.match(r.stdout, /✗ tests\/hang\.test\.cjs .*\(timeout\)/);
    assert.ok(wall < 8000, 'حُسم خلال المهلة + المهلة القصيرة: ' + wall + 'ms (كان ينتظر الحفيد ١٢ ثانية)');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
