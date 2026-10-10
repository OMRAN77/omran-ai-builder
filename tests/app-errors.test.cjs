'use strict';
/* tests/app-errors.test.cjs — v-provider-errors: «صلا حيه كامله لي المزود عندما يفحص الكود او
   التطبيق وتقوى المزود بي المعلومات ويشوف الاخطاء والتصحيح».
   المزوّد كان يفحص أعمى: سجلّ أخطاء الإنتاج (خادمًا ومتصفّحًا) في KV ولوحة المالك وحدها تقرؤه.
   هنا يُثبت: صياغة السجلّ نصًّا للنموذج (الموضع والتكرار وآخر ظهور وبصمة النشر وأثر النداء)،
   وفصل قياسات المسبار عن الأخطاء، وصدق الفراغ، وسقف الحروف كي لا يُبتر ذيل التعليمة عند ٨٠٠٠،
   والبوّابة (المالك وحده في المحادثة والوكيل)، وحقن السجلّ في تحليل الكود مع حدّ ملفّات أوسع. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-app-errors';
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));

const db = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null),
  kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvIncr: async () => 1, kvExpire: async () => {}, kvDel: async () => {},
} };

const AE = require(rp('api/_lib/app-errors.js'));

const SRV = [
  { at: '2026-09-28T10:00:00Z', lastAt: '2026-09-29T08:10:00Z', route: 'swallowed:chat/upstream-fail', action: 'text-turn', message: '402 billing hard limit', count: 3, deploy: 'dpl_new', stack: 'Error: 402\n    at callUpstream (chat.js:1509)' },
  { at: '2026-09-20T09:00:00Z', lastAt: '2026-09-21T09:00:00Z', route: 'swallowed:video-job/settle', message: 'redis timeout', count: 9, deploy: 'dpl_old' },
];
const CLI = [
  { message: 'Uncaught TypeError: x is not a function', source: 'https://omran.ai/js/app.bundle.js', line: 4412, col: 17, count: 6, firstSeen: '2026-09-29T07:00:00Z', lastSeen: '2026-09-29T08:20:00Z', url: 'https://omran.ai/?tab=video', ua: 'Mozilla/5.0 (Linux; Android 14)', build: 'a1b2c3', stack: 'TypeError\n    at omGen (app.bundle.js:4412:17)' },
  { message: 'v-mem-probe ٥ دقائق: heap 12/1048MB · صور ظاهرة 103', source: 'selfdiag.js', count: 1, lastSeen: '2026-09-29T08:00:00Z' },
  { message: 'diag line', source: 'diag:mem', count: 1, lastSeen: '2026-09-29T07:59:00Z' },
];

function seed(srv, cli) {
  db.clear();
  db.set(AE.LOG_SERVER, srv || SRV);
  db.set(AE.LOG_CLIENT, cli || CLI);
}

test('١. القراءة: الأحدث ظهورًا أوّلًا، وقياسات المسبار تُفصل عن الأخطاء ولا تُعدّ منها', async () => {
  seed();
  process.env.VERCEL_DEPLOYMENT_ID = 'dpl_new';
  try {
    const d = await AE.readAppErrors();
    assert.equal(d.deploy, 'dpl_new');
    assert.deepEqual(d.server.map((e) => e.route), ['swallowed:chat/upstream-fail', 'swallowed:video-job/settle']);
    assert.equal(d.client.length, 1, 'الخطأ الحقيقيّ وحده');
    assert.equal(d.diag.length, 2, 'سطر v-mem-probe وسطر diag: قياسان لا خطآن');
  } finally { delete process.env.VERCEL_DEPLOYMENT_ID; }
});

test('٢. القراءة لا ترمي أبدًا: سجلّ غائب أو تالف = لا أخطاء لا انهيار', async () => {
  db.clear();
  const empty = await AE.readAppErrors();
  assert.deepEqual([empty.server, empty.client, empty.diag], [[], [], []]);
  db.set(AE.LOG_SERVER, { not: 'an array' });
  db.set(AE.LOG_CLIENT, 'nope');
  const bad = await AE.readAppErrors();
  assert.deepEqual([bad.server, bad.client], [[], []]);
  assert.match(AE.formatAppErrors(bad), /لا خطأ مسجَّل الآن/);
});

test('٣. الصياغة: موضع وتكرار وآخر ظهور وبصمة نشر وأثر، وملفّ العميل بسطره وحزمته', async () => {
  seed();
  process.env.VERCEL_DEPLOYMENT_ID = 'dpl_new';
  let text;
  try { text = await AE.appErrorsText(); } finally { delete process.env.VERCEL_DEPLOYMENT_ID; }
  assert.match(text, /النشر الحاليّ: dpl_new/);
  assert.match(text, /1\. \[swallowed:chat\/upstream-fail · text-turn\] 402 billing hard limit — تكرّر 3 · آخر ظهور 2026-09-29 08:10 · النشر الحاليّ/);
  assert.match(text, /الأثر: Error: 402 at callUpstream \(chat\.js:1509\)/);
  assert.match(text, /2\. \[swallowed:video-job\/settle\] redis timeout — تكرّر 9 · آخر ظهور 2026-09-21 09:00 · نشر سابق/);
  assert.match(text, /1\. Uncaught TypeError: x is not a function — https:\/\/omran\.ai\/js\/app\.bundle\.js:4412:17 · تكرّر 6 · آخر ظهور 2026-09-29 08:20 · الصفحة https:\/\/omran\.ai\/\?tab=video · الحزمة a1b2c3/);
  assert.match(text, /قياسات جهاز المالك \(ليست أخطاء\): v-mem-probe ٥ دقائق/);
  // الجسر من الخطأ إلى الكود: بلا هذا يعرف النموذج الرسالة ولا يعرف أين يقرأ
  assert.match(text, /logError\('ملفّ\/عمليّة'\)/);
  assert.match(text, /js\/app-NN-\*\.js/);
  assert.equal(AE.countErrors(text), 3, 'خطآن في الخادم وواحد في المتصفّح');
});

test('٤. الفراغ يُقال صريحًا: لا أخطاء = نصّ يمنع التخمين', async () => {
  seed([], []);
  const text = await AE.appErrorsText();
  assert.match(text, /لا تفترض عطلًا ولا تخترع خطأً/);
  assert.equal(AE.countErrors(text), 0);
});

test('٥. الميزانيّة: ٤٠ خطأً طويلًا لا تُبتر ذيل التعليمة عند سقف ٨٠٠٠ حرفًا لناتج الأداة', async () => {
  const many = (n, kind) => Array.from({ length: n }, (_, i) => ({
    route: 'swallowed:mod' + i + '/' + 'x'.repeat(100), action: 'a'.repeat(60), message: 'm'.repeat(400), count: i + 1,
    lastAt: '2026-09-2' + (i % 9) + 'T08:00:00Z', stack: 's'.repeat(900), deploy: 'dpl_new',
    source: 'https://omran.ai/js/' + 'p'.repeat(200), line: 99, col: 9, lastSeen: '2026-09-2' + (i % 9) + 'T08:00:00Z',
    url: 'u'.repeat(200), ua: 'ua'.repeat(100), build: 'b1b2c3', kind,
  }));
  seed(many(20, 's'), many(20, 'c'));
  const text = await AE.appErrorsText();
  assert.ok(text.length < 8000, 'طول النصّ ' + text.length + ' — يجب أن يبقى دون سقف القصّ');
  assert.ok(text.trim().endsWith('وسطور القياسات ليست أخطاءً ولا تُصلَح.'), 'ذيل التعليمة سليم لا مبتور');
  assert.match(text, /أخطاء الخادم \(\d+ من 12/, 'القراءة تقف عند ١٢ سطرًا، والمعروض منها يُعلَن عدده');
  assert.match(text, /… و\d+ أقدم لم تُعرض/);
  assert.ok(AE.countErrors(text) >= 2, 'قسم المتصفّح يأخذ خطأً واحدًا على الأقلّ ولو استنفد الخادم الميزانيّة');
  assert.equal(AE.formatAppErrors(null).length > 0, true, 'مدخل فارغ لا يرمي');
});

/* ---------- البوّابة: المالك وحده ---------- */
test('٦. الأداة تُعرض للمالك وحده في الوكيل والمحادثة، وحارسٌ ثانٍ في التنفيذ', () => {
  const agent = require(rp('api/_lib/agent.js'));
  const names = (u) => agent.__test.toolsFor(u).map((t) => t.name);
  assert.ok(names('omran').includes('read_app_errors'));
  assert.ok(!names('someone').includes('read_app_errors'), 'غير المالك لا يرى الأداة');
  const a = read('api/_lib/agent.js');
  assert.match(a, /cb\.name === 'read_app_errors'\)? \{\n\s+result = isOwner\(runUser\) \? await appErrors\.appErrorsText\(\) : '✗ قراءة أخطاء التطبيق للمالك وحده\.'/);
  const c = read('api/_lib/chat.js');
  assert.match(c, /const OWNER_TOOLS = \[require\('\.\/app-errors\.js'\)\.TOOL, /); // v-providers-like-agent: ومعها أدوات الوكيل
  assert.match(c, /const toolsFor = \(owner, noMedia\) => \(noMedia \? TOOLS_NO_MEDIA : TOOLS\)\.concat\(owner \? OWNER_TOOLS : \[\]\);/);
  assert.match(c, /tools: toolTurn \? toolsFor\(__ownerReq, isClarifyTurn\(lastUserText\) \|\| __analyzeDoc \|\| __ownerUiShot\) : undefined/); // v-img-ask · v-providers-like-agent
  assert.match(c, /result = __ownerReq \? await require\('\.\/app-errors\.js'\)\.appErrorsText\(\)/);
  assert.ok(!/TOOLS\.push|TOOLS\.concat\(OWNER_TOOLS\)[\s\S]*TOOLS\.concat\(OWNER_TOOLS\)/.test(c), 'الأدوات لا تُحوَّر مرّتين');
  // وصف الأداة يحمل تعليمتها: المالك يصله المزوّد خامًا بلا نظام (v-owner-raw2)
  assert.match(AE.TOOL.description, /للمالك وحده/);
  assert.match(AE.TOOL.description, /قبل أن تقترح أيّ إصلاح/);
  assert.ok(!/كلود|Claude|Gemini|GPT|OpenAI/i.test(AE.TOOL.description), 'لا اسم مزوّد في نصّ الأداة');
  assert.deepEqual(AE.TOOL.input_schema, { type: 'object', properties: {} }, 'بلا مُدخلات = بلا سوء استعمال');
});

test('٧. أثر الأداة صادق في الوكيل والمحادثة بلا نصّ واجهة جديد', async () => {
  seed();
  const text = await AE.appErrorsText();
  const a = read('api/_lib/agent.js');
  assert.match(a, /if \(name === 'read_app_errors'\) return 'قرأتُ سجلّ أخطاء التطبيق الحيّ';/);
  assert.match(a, /فوجدتُ ' \+ n \+ ' خطأً مسجَّلًا/);
  const c = read('api/_lib/chat.js');
  assert.match(c, /return R\('قرأتُ ' \+ h \+ ' — ' \+ n \+ ' خطأً', 'trFetch', \{ h: h, n: n \}\)/, 'مفتاح ترجمة قائم');
  const i18n = read('js/app-03-i18n-data.js');
  assert.ok(i18n.includes('trFetch: "قرأتُ {h}') && i18n.includes('trFetchFail:'), 'المفتاحان موجودان في اللغات');
  assert.equal(AE.countErrors(text), 3, 'الأثر يعدّ ما عاد فعلًا لا ما ادّعاه النموذج');
});

/* ---------- تحليل الكود: صلاحيّة أوسع + سجلّ حيّ ---------- */
test('٨. تحليل الكود: السجلّ الحيّ في التعليمة وقاعدة «مشكلة مؤكّدة لا احتمال»، وبلا سجلّ لا أثر', () => {
  const CA = require(rp('api/_lib/code-analyze.js')).__test;
  const files = [{ name: 'a.js', content: 'var a = 1;' }];
  const m = CA.metricsOf(files);
  const live = '[أخطاء تطبيق عمران الحيّة — مقروءة الآن من سجلّ الإنتاج]\n1. [swallowed:a/boom] x';
  const p = CA.buildPrompt(files, m, '', 'ar', live);
  assert.ok(p.user.includes(live), 'السجلّ يُرفق بالتعليمة كما هو');
  assert.match(p.system, /مشكلة مؤكّدة لا احتمال/);
  assert.match(p.system, /بخطورة لا تقلّ عن high/);
  assert.ok(p.system.indexOf('أخطاء حيّة مرفقة') > p.system.indexOf('@@REPORT'), 'القاعدة في الذيل — الأحدث أوزن');
  const bare = CA.buildPrompt(files, m, '', 'ar');
  assert.ok(!bare.system.includes('أخطاء حيّة مرفقة'), 'بلا سجلّ لا قاعدة معلّقة في الهواء');
  assert.ok(!bare.user.includes('أخطاء تطبيق عمران الحيّة'));
  assert.equal(CA.buildPrompt(files, m, '', 'ar', '   ').system.includes('أخطاء حيّة مرفقة'), false, 'سجلّ فارغ = لا قاعدة');
});

test('٩. تحليل الكود: حدّ ملفّات المالك ٣٠٠ لا ٦٠، والسقف الكلّيّ للحروف لم يُمسّ', () => {
  const CA = require(rp('api/_lib/code-analyze.js')).__test;
  assert.equal(CA.LIMITS.files, 60);
  assert.equal(CA.LIMITS.filesOwner, 300);
  assert.equal(CA.LIMITS.total, 500000, 'سقف نافذة النموذج — لا يُرفع');
  const many = { files: Array.from({ length: 200 }, (_, i) => ({ name: 'f' + i + '.js', content: 'let x' + i + ' = 1;' })) };
  assert.equal(CA.collectFiles(many).files.length, 60, 'الافتراضيّ كما كان');
  assert.equal(CA.collectFiles(many, { files: CA.LIMITS.filesOwner }).files.length, 200, 'المالك يرى المجلّد كلّه');
  const h = read('api/_lib/code-analyze.js');
  assert.match(h, /owner = require\('\.\/_owner\.js'\)\.isOwnerName\(who\)/);
  assert.match(h, /collectFiles\(body, owner \? \{ files: LIMITS\.filesOwner, pool: deepRead \}/);
  assert.match(h, /live = await require\('\.\/app-errors\.js'\)\.appErrorsText\(\)/);
  // v-code-deep-read: صار للتعليمة وسيط سادس (الفهرس)، والسجلّ الحيّ في موضعه الخامس كما هو
  assert.match(h, /buildPrompt\(col\.files, metrics, body\.ask, body\.lang, live,\n\s+reader \? \{ index: deepIndex\(col\.pool, col\.files\) \} : null\)/);
});

test('١٠. لوحة فحص النظام تقرأ قاعدة فصل القياسات من app-errors (مصدر واحد)', () => {
  const h = read('api/_lib/health.js');
  assert.match(h, /const \{ isDiag \} = require\('\.\/app-errors\.js'\);/);
  assert.ok(!/function isDiag\(/.test(h), 'لا تعريف مكرّر للقاعدة');
  assert.equal(AE.isDiag({ source: 'diag:mem' }), true);
  assert.equal(AE.isDiag({ message: 'v-mem-probe x' }), true);
  assert.equal(AE.isDiag({ message: 'Uncaught TypeError', source: 'app.bundle.js' }), false);
  assert.equal(AE.isDiag(null), false);
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('tests/app-errors.test.cjs'));
});
