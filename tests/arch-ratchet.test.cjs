// tests/arch-ratchet.test.cjs — v-arch-ratchet: سقّاطة البنية في npm run guard (scripts/arch-ratchet.mjs).
// العرض: بين تدقيقَي ١٠ و١١ أكتوبر نما __sendPromptCore ١٩٠ سطرًا و٣٧ تعبيرًا نمطيًّا و٥٢ نداء .test(،
// وبقيت ١٧ نسخة من function verifyToken، وزادت الاختبارات المثبِّتة لوسوم ?v= — ولا شيء يفشل.
// القرار: سقف لكلّ مقياس في scripts/arch-baseline.json؛ الحارس يفشل إن ساء، والسقف ينزل ولا يرتفع.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const acorn = require('acorn');

const root = path.resolve(__dirname, '..');
const load = () => import(pathToFileURL(path.join(root, 'scripts', 'arch-ratchet.mjs')).href);
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'arch-baseline.json'), 'utf8'));

// السقف الأوّل يوم وُلدت السقّاطة (8687179). الأساس لا يتجاوزه أبدًا: رفعه هنا تغيير معنى يراه المراجع.
const CEILING = { sendPromptCoreLines: 3672, sendPromptCoreRegex: 264, sendPromptCoreTests: 306, verifyTokenDefs: 17, vPinTests: 80 };

const CORE = fs.readFileSync(path.join(root, 'js', 'app-09-attach.js'), 'utf8');
function growCore(extra) { // يحقن سطرًا في أوّل جسم __sendPromptCore
  const ast = acorn.parse(CORE, { ecmaVersion: 'latest', sourceType: 'script' });
  const fn = ast.body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === '__sendPromptCore');
  const at = fn.body.start + 1;
  return CORE.slice(0, at) + '\n' + extra + CORE.slice(at);
}
// قرص حقيقيّ مع تبديل ملفّات بعينها — بلا كتابة.
async function ioWith(over) {
  const { fsIO } = await load();
  const real = fsIO(root);
  return {
    read: (rel) => (rel in over ? over[rel] : real.read(rel)),
    list: (dir) => [...new Set(real.list(dir).concat(Object.keys(over).filter((k) => path.posix.dirname(k) === dir).map((k) => path.posix.basename(k))))],
  };
}

test('١. الشجرة الحاليّة داخل السقوف، والسقوف لا تتجاوز سقفها الأوّل (تنزل ولا ترتفع)', async () => {
  const { measure, compare, fsIO, METRICS } = await load();
  for (const k of Object.keys(METRICS)) {
    assert.ok(Number.isFinite(baseline[k]), 'سقف مفقود: ' + k);
    assert.ok(baseline[k] <= CEILING[k], `${k}: السقف ${baseline[k]} فوق سقفه الأوّل ${CEILING[k]} — السقّاطة لا ترتفع`);
  }
  const { worse } = compare(measure(fsIO(root)).metrics, baseline);
  assert.deepEqual(worse, [], 'مقياس ساء عن سقفه');
});

test('٢. سطر واحد في __sendPromptCore فيه تعبير نمطيّ و.test( → المقاييس الثلاثة تسوء', async () => {
  const { measure, compare } = await load();
  const now = measure(await ioWith({ 'js/app-09-attach.js': growCore(';/zz-ratchet/.test(String(1));') })).metrics;
  const before = measure(await ioWith({})).metrics;
  assert.equal(now.sendPromptCoreLines, before.sendPromptCoreLines + 1);
  assert.equal(now.sendPromptCoreRegex, before.sendPromptCoreRegex + 1);
  assert.equal(now.sendPromptCoreTests, before.sendPromptCoreTests + 1);
  const keys = compare(now, before).worse.map((w) => w.key).sort();
  assert.deepEqual(keys, ['sendPromptCoreLines', 'sendPromptCoreRegex', 'sendPromptCoreTests']);
  // القسمة والتعليق والنصّ ليست تعابير نمطيّة: المحلّل يميّزها
  const div = measure(await ioWith({ 'js/app-09-attach.js': growCore('void (4 / 2 / 1); // /x/.test(y) "/z/.test(w)"') })).metrics;
  assert.equal(div.sendPromptCoreRegex, before.sendPromptCoreRegex);
  assert.equal(div.sendPromptCoreTests, before.sendPromptCoreTests);
});

test('٣. نسخة verifyToken جديدة (تصريح أو سهم أو خاصيّة) تُعدّ؛ الاستيراد والإسناد لا', async () => {
  const { measure, verifyTokenDefs } = await load();
  const before = measure(await ioWith({})).metrics.verifyTokenDefs;
  const now = measure(await ioWith({ 'api/_lib/zz-ratchet-copy.js': "'use strict';\nfunction verifyToken(t) { return null; }\nmodule.exports = { verifyToken };\n" })).metrics.verifyTokenDefs;
  assert.equal(now, before + 1);
  assert.equal(verifyTokenDefs('const verifyToken = (t) => t;'), 1);
  assert.equal(verifyTokenDefs('exports.verifyToken = async function (t) { return t; };'), 1);
  assert.equal(verifyTokenDefs('module.exports = { verifyToken(t) { return t; } };'), 1);
  assert.equal(verifyTokenDefs("const { verifyToken } = require('./auth.js'); module.exports.verifyToken = verifyToken; // function verifyToken"), 0);
});

test('٤. ملفّ اختبار جديد يثبّت وسم ?v= حرفيًّا يُعدّ؛ القراءة من index.html ورابط يوتيوب لا', async () => {
  const { measure, V_PIN } = await load();
  const q = '?' + 'v='; // لا يُكتب الوسم حرفيًّا هنا وإلّا عدّ هذا الملفّ نفسه
  const before = measure(await ioWith({})).metrics.vPinTests;
  const now = measure(await ioWith({ 'tests/zz-ratchet-pin.test.cjs': "assert.ok(html.includes('js/modes.js" + q + "777'));\n" })).metrics.vPinTests;
  assert.equal(now, before + 1);
  assert.ok(V_PIN.test('/\\/js\\/design-gen\\.js\\' + q + '610/'), 'نمط regex مثبَّت');
  assert.ok(!V_PIN.test("/css\\/tokens\\.css\\" + q + "(\\d+)/"), 'التقاط الرقم ليس تثبيتًا');
  assert.ok(!V_PIN.test("'app.bundle.js" + q + "' + hash"), 'البصمة المحسوبة ليست تثبيتًا');
  assert.ok(!V_PIN.test('https://www.youtube.com/watch' + q + 'abc'), 'رابط يوتيوب ليس وسم كاش');
});

test('٥. الحارس نفسه: نموّ __sendPromptCore يُفشل npm run guard، والتحسّن ينبّه بلا فشل', () => {
  // نسخة مرآة: روابط رمزيّة لكلّ المستودع، و js/app-09-attach.js وحده معدَّل، والحارس يقرأ جذره من موضعه.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-ratchet-'));
  try {
    for (const n of fs.readdirSync(root)) if (n !== 'js' && n !== 'scripts' && n !== '.git') fs.symlinkSync(path.join(root, n), path.join(dir, n));
    fs.mkdirSync(path.join(dir, 'js'));
    for (const n of fs.readdirSync(path.join(root, 'js'))) if (n !== 'app-09-attach.js') fs.symlinkSync(path.join(root, 'js', n), path.join(dir, 'js', n));
    fs.mkdirSync(path.join(dir, 'scripts'));
    for (const n of fs.readdirSync(path.join(root, 'scripts'))) if (n !== 'arch-baseline.json') fs.symlinkSync(path.join(root, 'scripts', n), path.join(dir, 'scripts', n));
    // الحارس يحسب جذره من import.meta.url: الرابط الرمزيّ يُحلّ إلى الأصل، فننسخ الحارس ووحدته نسخًا حقيقيّة.
    for (const n of ['guard.mjs', 'arch-ratchet.mjs']) { fs.unlinkSync(path.join(dir, 'scripts', n)); fs.copyFileSync(path.join(root, 'scripts', n), path.join(dir, 'scripts', n)); }
    const writeBase = (b) => fs.writeFileSync(path.join(dir, 'scripts', 'arch-baseline.json'), JSON.stringify(b));
    const guard = () => spawnSync(process.execPath, [path.join(dir, 'scripts', 'guard.mjs')], { encoding: 'utf8', cwd: dir });

    fs.writeFileSync(path.join(dir, 'js', 'app-09-attach.js'), growCore('void 0;'));
    writeBase(baseline);
    const bad = guard();
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stderr, new RegExp('سقّاطة البنية ساءت → أسطر __sendPromptCore[^\\n]*: ' + (baseline.sendPromptCoreLines + 1) + ' > ' + baseline.sendPromptCoreLines));

    fs.writeFileSync(path.join(dir, 'js', 'app-09-attach.js'), CORE);
    writeBase(Object.assign({}, baseline, { sendPromptCoreLines: baseline.sendPromptCoreLines + 5 }));
    const ok = guard();
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /↓ سقّاطة البنية تحسّنت: sendPromptCoreLines/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
