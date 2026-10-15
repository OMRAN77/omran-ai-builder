'use strict';
/* v-provider-max (المالك ١٥ أكتوبر: «كيف أوصل للمزوّدين معلومات الكود… أوصلهم لمستوى كودي على الأقلّ ٨٠٪»، ثمّ «لا تحرّك موضوع المال،
   أريد أن يكونوا في مستوى عالٍ جدًّا»): ما ينقص المزوّد في المحادثة عن Claude Code بلا مسّ المال —
   (١) v-repo-map: خريطة المستودع وأحدث الفخاخ في الكتلة الثابتة المخزَّنة من أوّل سطر (كان يبدأ كلّ ردّ بالبحث من الصفر)؛
   (٢) v-deep-read/v-deep-search: دفعة القراءة ٤٨ ألفًا (كانت ٢٤)، والبحث يرجع رأس الدالّة الحاوية والمستدعين من النصّ المجلوب نفسه؛
   (٣) v-branch-test: اختبار واحد على جهاز GitHub في نحو دقيقة (manage_github action=test)؛
   (٤) v-model-card: بطاقة الموديل (نافذة، خرج، رؤية، أدوات) من بيانات الوسيط الحيّة + حقائق التطبيق، بلا تخمين؛
   (٥) الخطوات ١٦ (كانت ١٢)، والمنهج يأمر بآخر التزامات الملفّ قبل تعديله. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const GH = require('../api/_lib/github-read.js');
const GM = require('../api/_lib/github-manage.js');
const BT = require('../api/_lib/branch-test.js');
const PM = require('../api/_lib/provider-models.js');
const PL = require('../api/_lib/provider-level.js');
const GE = require('../api/_lib/github-edit.js');
const MAP = require('../api/_lib/repo-map.js');

const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
const res = (obj, status) => ({ ok: !status || status < 400, status: status || 200, headers: new Headers(), json: async () => obj, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
function net(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url).replace('https://api.github.com', '');
    calls.push({ u, method: (init && init.method) || 'GET', body: init && init.body ? JSON.parse(init.body) : null, auth: !!(init && init.headers && init.headers.Authorization) });
    for (const [re, r] of routes) if (re.test(u)) return typeof r === 'function' ? r(u) : r;
    return res({ message: 'Not Found' }, 404);
  };
  return { calls, opts: { fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' } } };
}

test('١. v-deep-search: المطابقة داخل دالّة تأتي مع رأسها، والمعرّف مع عدّ مستدعيه في الملفّات المعروضة؛ الحلقات ليست دوالّ؛ وبلا نداء شبكة إضافيّ', async () => {
  const A = ['// helpers', 'function alpha(x) {', '  if (x) {', '    return beta(x) + 1;', '  }', '  return 0;', '}', 'const beta = (y) => y * 2;', 'const gamma = () => {', '  for (const z of []) {', '    beta(z);', '  }', '};', 'module.exports = { alpha, beta, gamma };'];
  assert.deepEqual(GH.enclosingHead(A, 3), { n: 2, text: 'function alpha(x) {' }, 'داخل alpha لا داخل if');
  assert.deepEqual(GH.enclosingHead(A, 10), { n: 9, text: 'const gamma = () => {' }, 'داخل gamma لا داخل for');
  assert.equal(GH.enclosingHead(A, 7), null, 'سهم بتعبير واحد بلا جسم ليس حاويًا لما بعده');
  assert.equal(GH.enclosingHead(A, 13), null, 'نطاق أعلى');
  const n = net([
    [/^\/repos\/o\/r$/, res({ default_branch: 'main' })],
    [/\/git\/trees\/main\?recursive=1$/, res({ tree: [{ path: 'src/a.js', type: 'blob', size: 200 }, { path: 'src/b.js', type: 'blob', size: 100 }, { path: 'README.md', type: 'blob', size: 50 }] })],
    [/\/contents\/src\/a\.js\?ref=main$/, res(A.join('\n'))],
    [/\/contents\/src\/b\.js\?ref=main$/, res('const r = require("./a.js");\nfunction run() {\n  return r.beta(3) + r.beta(4);\n}\n')],
    [/\/contents\/README\.md\?ref=main$/, res('beta is documented here')],
  ]);
  const t = GH.parseTarget({ url: 'o/r', path: 'src' });
  const out = await GH.readContentSearch(t, Object.assign({ deep: true }, n.opts), 'beta');
  assert.match(out, /\n📄 src\/a\.js\n {2}4\| return beta\(x\) \+ 1;\n {5}↳ داخل 2\| function alpha\(x\) \{/, 'الرأس بعد سطر المطابقة مباشرة');
  assert.match(out, /\n {2}8\| const beta = \(y\) => y \* 2;\n {2}11\| beta\(z\);\n {5}↳ داخل 9\| const gamma = \(\) => \{/);
  assert.match(out, /\n📄 src\/b\.js\n {2}3\| return r\.beta\(3\) \+ r\.beta\(4\);\n {5}↳ داخل 2\| function run\(\) \{/);
  assert.match(out, /\nالمستدعون لـbeta\( في الملفّات المعروضة: src\/a\.js \(2\)، src\/b\.js \(1\)/, 'التعريف لا يُعدّ، والنداء في أوّل السطر يُعدّ، والعدّ بالأسطر');
  assert.equal(n.calls.filter((c) => /\/contents\//.test(c.u)).length, 2, 'ملفّا الكود مرّة واحدة — لا نداء إضافيّ للدالّة الحاوية ولا للمستدعين');
  const plain = await GH.readContentSearch(t, Object.assign({ deep: true }, n.opts), 'beta(');
  assert.ok(!/المستدعون/.test(plain), 'غير المعرّف بلا سطر المستدعين');
  assert.equal(GH.DEEP_CHUNK, 48000, 'v-deep-read: الدفعة ٤٨ ألفًا');
  assert.ok(read('api/_lib/chat.js').includes("const __outMax = (__ownerReq && st.cb.name === 'read_github') ? 60000 : 8000;") && /read_github'\) \? 60000 : 8000\)/.test(read('api/_lib/agent.js')), 'سقف ناتج الأداة ٦٠ ألفًا في المسارين');
});

test('٢. v-branch-test: المدخل ملفّ اختبار واحد مسجّل؛ الورك فلو قراءة فقط والمدخلات بيئةً؛ والسكربت بلا صدفة ويرفض غير المسجّل', async () => {
  for (const f of ['tests/work-log.test.cjs', 'tests/خلفيات.test.cjs', 'tests/a1_b-c.test.cjs']) assert.deepEqual(BT.fileOf({ file: f }), { file: f }, f);
  for (const f of ['', 'x.test.cjs', 'tests/../x.test.cjs', 'tests/a b.test.cjs', 'tests/a.test.cjs;rm -rf /', 'tests/sub/a.test.cjs', 'tests/a.js', 'tests/' + 'a'.repeat(90) + '.test.cjs']) assert.ok(BT.fileOf({ file: f }).error, 'يُرفض: ' + f);
  assert.equal(BT.titleOf('omran-agent/x', 'tests/a.test.cjs'), 'test omran-agent/x tests/a.test.cjs');
  const y = read('.github/workflows/branch-test.yml');
  assert.match(y, /permissions:\n  contents: read/); assert.match(y, /persist-credentials: false/); assert.match(y, /workflow_dispatch:/);
  for (const l of y.split('\n').filter((x) => x.includes('${{'))) assert.match(l, /^(?:run-name:|\s+group:|\s+ref: \$\{\{ inputs\.ref \}\}$|\s+TEST_FILE: \$\{\{ inputs\.file \}\}$)/, 'المدخلات في الأسماء والبيئة وحدها: ' + l);
  assert.match(y, /TEST_FILE: \$\{\{ inputs\.file \}\}\n\s+run: node scripts\/branch-test\.mjs/);
  const rn = (y.match(/^run-name: "(.*)"$/m) || [])[1];
  assert.equal(BT.norm(rn.replace('${{ inputs.ref }}', 'b').replace('${{ inputs.file }}', 'tests/a.test.cjs')), BT.titleOf('b', 'tests/a.test.cjs'), 'عنوان التشغيل = ما يطابقه الخادم');
  const sc = read('scripts/branch-test.mjs');
  assert.ok(sc.includes('spawnSync(process.execPath, [v.file]') && !/shell:\s*true|execSync|exec\(/.test(sc), 'بلا صدفة');
  assert.ok(sc.includes('registered(pkg).some((e) => e.file === v.file)'), 'قائمة السماح من package.json');
  const { spawnSync } = require('node:child_process');
  const bad = spawnSync(process.execPath, ['scripts/branch-test.mjs'], { cwd: root, env: Object.assign({}, process.env, { TEST_FILE: 'tests/zz-not-registered.test.cjs' }), encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.match(bad.stdout, /##\[error\] الملفّ tests\/zz-not-registered\.test\.cjs غير مسجّل/);
  const inj = spawnSync(process.execPath, ['scripts/branch-test.mjs'], { cwd: root, env: Object.assign({}, process.env, { TEST_FILE: 'tests/a.test.cjs;id' }), encoding: 'utf8' });
  assert.equal(inj.status, 1); assert.match(inj.stdout, /##\[error\] file يقبل/);
});

test('٣. manage action=test: بلا تشغيل ← يبدأ branch-test.yml بالفرع والملفّ؛ قيد العمل ← ينتظر؛ أخضر؛ أحمر ← سطور الفشل نفسها بلا مفتاح على المخزن', async () => {
  const SHA = 'abcdef1234567890abcdef1234567890abcdef12';
  let runs = [];
  const LOG = '2026-10-15T03:00:01.000Z not ok 2 - ٢. الحيّ: لا صندوق\n2026-10-15T03:00:01.000Z   expected: false\n2026-10-15T03:00:01.000Z   actual: true\n2026-10-15T03:00:02.000Z ##[error]Process completed with exit code 1.';
  const n = net([
    [/^\/repos\/o\/r\/commits\/fix-1$/, res({ sha: SHA })],
    [/^\/repos\/o\/r\/actions\/workflows\/branch-test\.yml\/runs\?/, () => res({ workflow_runs: runs })],
    [/^\/repos\/o\/r\/actions\/workflows\/branch-test\.yml\/dispatches$/, res(null, 204)],
    [/^\/repos\/o\/r\/actions\/runs\/9\/jobs\?/, res({ jobs: [{ id: 91, name: 'test', conclusion: 'failure' }] })],
    [/^\/repos\/o\/r\/actions\/jobs\/91\/logs$/, () => ({ ok: false, status: 302, headers: new Headers({ location: 'https://productionresults.blob.core.windows.net/logs/91?sig=x' }) })],
    [/blob\.core\.windows\.net\/logs\/91/, res(LOG)],
  ]);
  const ask = { repo: 'o/r', action: 'test', branch: 'fix-1', file: 'tests/work-log.test.cjs' };
  let out = await GM.manage(ask, n.opts);
  assert.match(out.text, /^🧪 بدأتُ اختبار tests\/work-log\.test\.cjs على الفرع fix-1 \(abcdef1\) — يأخذ نحو دقيقة\. أعد manage_github action=test بالمدخلات نفسها في ردّك التالي/);
  assert.deepEqual(n.calls.find((c) => /dispatches$/.test(c.u)).body, { ref: 'fix-1', inputs: { ref: 'fix-1', file: 'tests/work-log.test.cjs' } });
  runs = [{ id: 9, head_sha: SHA, display_title: 'test fix-1 tests/work-log.test.cjs', status: 'in_progress', html_url: 'https://github.com/o/r/actions/runs/9' }];
  n.calls.length = 0;
  out = await GM.manage(ask, n.opts);
  assert.match(out.text, /قيد العمل \(https:\/\/github\.com\/o\/r\/actions\/runs\/9\)/); assert.ok(!n.calls.some((c) => /dispatches$/.test(c.u)));
  runs[0].status = 'completed'; runs[0].conclusion = 'success';
  assert.match((await GM.manage(ask, n.opts)).text, /^✅ tests\/work-log\.test\.cjs على الفرع fix-1 \(abcdef1\) أخضر: https:\/\/github\.com\/o\/r\/actions\/runs\/9$/);
  runs[0].conclusion = 'failure'; n.calls.length = 0;
  out = await GM.manage(ask, n.opts);
  assert.match(out.text, /^✗ tests\/work-log\.test\.cjs على الفرع fix-1 \(abcdef1\) فشل: https:\/\/github\.com\/o\/r\/actions\/runs\/9 — أصلح ما يلي ثمّ أعد الاختبار\.\n/);
  assert.match(out.text, /not ok 2 - ٢\. الحيّ/); assert.match(out.text, /expected: false\n\s*actual: true/); assert.ok(!/2026-10-15T/.test(out.text));
  assert.equal(n.calls.find((c) => /blob\.core/.test(c.u)).auth, false, 'الرابط الموقَّع بلا مفتاح');
  // ملفّ آخر = تشغيل آخر (العنوان يحمله)؛ مدخل مرفوض بسببه؛ قراءة بلا إذن
  assert.match((await GM.manage(Object.assign({}, ask, { file: 'tests/other.test.cjs' }), n.opts)).text, /بدأتُ اختبار tests\/other\.test\.cjs/);
  assert.match((await GM.manage(Object.assign({}, ask, { file: 'tests/x y.test.cjs' }), n.opts)).error, /file يقبل ملفّ اختبار واحد/);
  assert.ok(GM.ACTIONS.includes('test') && GM.ownerAllows('test', ''));
  assert.match(GM.MANAGE_TOOL.description, /test \(اختبار واحد file=tests\/x\.test\.cjs على فرعك/); assert.ok(GM.MANAGE_TOOL.input_schema.properties.file);
  assert.match(GE.WORK_NOTE, /- أثناء الشغل: manage_github action=test file=tests\/x\.test\.cjs branch=فرعك يشغّل اختبارًا واحدًا في نحو دقيقة/);
});

test('٤. v-model-card: البيانات الوصفيّة من قائمة الوسيط بمفتاح يطابق المباشر والوسيط، وبطاقة بلا تخمين (الحيّ إن وُجد + حقائق التطبيق)، داخل كتلة المستوى', async () => {
  PM.__resetCache();
  assert.equal(PL.selfCard('cohere', 'cohere/command-a'), '\nبطاقتك: سقف الخرج المرسَل لك في هذا التطبيق ١٢٨ ألف توكن (يُخفَّض تلقائيًّا إن رفضه موديلك)، ودفعة read_github الواحدة حتّى ٤٨ ألف حرف (~١٢ ألف توكن) — خطّط قراءتك على قدر نافذتك.', 'بارد: حقائق التطبيق وحدها — لا رقم مخمَّن');
  const data = [
    { id: 'cohere/command-a', name: 'Cohere: Command A', created: 1700000000, context_length: 256000, top_provider: { max_completion_tokens: 8192 }, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: ['tools'] },
    { id: 'openai/gpt-6-sol', name: 'OpenAI: GPT-6 Sol', created: 1760000000, context_length: 400000, top_provider: { max_completion_tokens: 128000 }, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, supported_parameters: ['tools'] },
    { id: 'anthropic/claude-opus-5.5', name: 'Anthropic: Claude Opus 5.5', created: 1750000000, context_length: 1000000, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, supported_parameters: ['tools'] },
    { id: 'openai/gpt-6-sol:free', name: 'free', context_length: 10 },
    { id: 'someone/else', context_length: 5 },
  ];
  const meta = PM.parseMeta({ data });
  assert.deepEqual(Object.keys(meta).sort(), ['claude-opus-5-5', 'command-a', 'gpt-6-sol'], 'شركات التطبيق فقط، بلا متغيّرات :free');
  assert.deepEqual(meta['gpt-6-sol'], { ctx: 400000, out: 128000, vision: true, tools: true });
  assert.deepEqual(meta['claude-opus-5-5'], { ctx: 1000000, vision: true, tools: true }, 'المفقود لا يُكتب');
  assert.equal(PM.metaKey('claude-opus-5-5'), PM.metaKey('anthropic/claude-opus-5.5'), 'المباشر والوسيط مفتاح واحد');
  let calls = 0;
  const r = await PM.loadModels({ noKv: true, fetch: async () => { calls++; return { ok: true, json: async () => ({ data }) }; } });
  assert.equal(r.source, 'network'); assert.equal(calls, 1);
  assert.deepEqual(PM.metaOf('gpt-6-sol'), { ctx: 400000, out: 128000, vision: true, tools: true }, 'metaOf من الذاكرة الدافئة');
  const card = PL.selfCard('openai', 'gpt-6-sol');
  assert.match(card, /^\nبطاقتك \(من بيانات الوسيط المحدّثة\): نافذة السياق ~400 ألف توكن · أقصى خرج 128 ألف توكن · ترى الصور · أدوات الدوالّ متاحة\. سقف الخرج المرسَل لك/);
  assert.match(PL.selfCard('cohere', 'cohere/command-a'), /نافذة السياق ~256 ألف توكن · أقصى خرج 8 ألف توكن · لا ترى الصور/);
  assert.match(PL.selfCard('claude', 'claude-opus-5-5'), /~1 مليون توكن · ترى الصور · أدوات الدوالّ متاحة\./, 'بلا سقف خرج معروف = لا يُكتب');
  const note = PL.levelNote('openai', 'gpt-6-sol');
  assert.ok(note.indexOf('\nبطاقتك') > note.indexOf('ما تعوّضه') && note.indexOf('\nبطاقتك') < note.indexOf('معلومة محدّثة'), 'بين الثغرة وقائمة الموديلات');
  assert.equal(PL.levelNote('openrouter', 'unknown/xyz'), '', 'عائلة مجهولة كما كانت');
  PM.__resetCache();
});

test('٥. v-repo-map: الخريطة مولَّدة من المستودع (كلّ ما فيها موجود، والفخاخ من PITFALLS.md)، ضمن السقف، وتصل الكتلة الثابتة المخزَّنة للمالك في المحادثة والوكيل', async () => {
  const { buildMap, render, MAX_CHARS } = await import(pathToFileURL(path.join(root, 'scripts/repo-map.mjs')).href);
  const map = buildMap();
  assert.ok(MAP.REPO_NOTE.length > 2000 && MAP.REPO_NOTE.length <= MAX_CHARS, 'الحجم: ' + MAP.REPO_NOTE.length);
  assert.ok(MAP.REPO_NOTE.startsWith('[خريطة المستودع OMRAN77/omran-ai-builder'));
  for (const p of map.parts) assert.ok(MAP.REPO_NOTE.includes(' ' + p + ' ') || MAP.REPO_NOTE.includes(' ' + p + '.'), 'جزء الواجهة في الخريطة: ' + p);
  for (const l of ['chat', 'owner-loop', 'github-read', 'github-manage', 'provider-level', 'repo-map']) assert.ok(MAP.REPO_NOTE.includes(l + ' ('), 'وظيفة الملفّ المركزيّ: ' + l);
  // ما في الملفّ المولَّد موجود فعلًا (حذف/إعادة تسمية = جدّد الخريطة: npm run map)
  const gen = /\(\d+ جزءًا[^:]*\): (.+?)\.\n/.exec(MAP.REPO_NOTE)[1].split(' · ');
  for (const p of gen) assert.ok(fs.existsSync(path.join(root, 'js/app-' + p + '.js')), 'الخريطة تذكر جزءًا غير موجود — npm run map: ' + p);
  const pit = read('knowledge/PITFALLS.md').replace(/`/g, '');
  assert.equal(MAP.PITFALLS.length, 10);
  for (const t of MAP.PITFALLS) assert.ok(pit.includes(t.replace(/…$/, '')), 'فخّ في الخريطة غير موجود في PITFALLS.md — npm run map: ' + t);
  assert.equal(render(map).includes('module.exports = { REPO_NOTE, PITFALLS };'), true);
  assert.ok(read('package.json').includes('"bundle": "node scripts/repo-map.mjs && node scripts/build.mjs"'), 'npm run bundle يجدّد الخريطة');
  assert.ok(read('api/_lib/chat.js').includes("sysParts.splice(1, 0, require('./provider-level.js').OWNER_METHOD, require('./repo-map.js').REPO_NOTE);"), 'بعد المنهج في الثابت');
  assert.ok(read('api/_lib/agent.js').includes("(isOwner(runUser) ? '\\n\\n' + require('./repo-map.js').REPO_NOTE : '')"), 'الوكيل للمالك');
  assert.ok(read('api/_lib/chat.js').includes('const MAX_STEPS = Math.max(1, Math.min(20, Number(process.env.CHAT_MAX_STEPS) || 16));'), 'الخطوات ١٦ وسقفها ٢٠');
  assert.match(PL.OWNER_METHOD, /وقبل تعديل ملفّ آخر التزاماته \(what=commits path=\)/); assert.ok(PL.OWNER_METHOD.length < 3200, 'سقف المنهج: ' + PL.OWNER_METHOD.length);
});
