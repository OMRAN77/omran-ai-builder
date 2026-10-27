// v-read-panel (المالك ١٣ أكتوبر: «لوحة الكود + الأرقام»): ما يقرؤه المزوّد أو الوكيل من GitHub يصل للواجهة مقطعًا منظّمًا
// (المسار + أرقام الأسطر + الأسطر) فيظهر في تبويب «الكود المقروء»، و`مسار:سطر` في الردّ يصير رقمًا يفتح السطر نفسه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-read-panel-' + 'x'.repeat(40);
const gh = require('../api/_lib/github-read.js');

const SRC = Array.from({ length: 60 }, (_, i) => 'line ' + (i + 1)).join('\n');

test('الخادم: ناتج قراءة الملفّ يصير مقطعًا بالمسار الكامل من المُدخل وأسطره المتتالية', () => {
  const out = gh.formatFile('chat.js', 'main', 'a\n\nconst x = 1;\nend', 1, true);
  assert.deepEqual(gh.fileExcerpt({ url: 'OMRAN77/omran-ai-builder', path: 'api/_lib/chat.js' }, out),
    { p: 'api/_lib/chat.js', r: 'main', a: 1, b: 4, n: 4, l: ['a', '', 'const x = 1;', 'end'] }, 'السطر الفارغ يبقى سطرًا');
  const mid = gh.formatFile('x.js', '', SRC, 20, false);
  const x = gh.fileExcerpt({ url: 'https://github.com/o/r/blob/main/js/x.js', from: 20 }, mid);
  assert.equal(x.p, 'js/x.js', 'المسار من رابط blob');
  assert.equal(x.a, 20);
  assert.equal(x.b, 60);
  assert.equal(x.l[0], 'line 20');
  assert.equal(x.l.length, 41);
});

test('الخادم: غير الملفّ لا مقطع له — مجلّد، ثنائيّ، فشل، بحث، رفض غير المالك', () => {
  assert.equal(gh.fileExcerpt({ url: 'o/r' }, '📄 a.png — ملفّ ثنائيّ (2KB)، لا يُقرأ نصًّا.'), null);
  assert.equal(gh.fileExcerpt({ url: 'o/r' }, 'غير موجود أو خاصّ: o/r/x.js'), null);
  assert.equal(gh.fileExcerpt({ url: 'o/r' }, '📁 o/r/js · 12 مدخلة\n- a.js'), null);
  assert.equal(gh.fileExcerpt({ url: 'o/r' }, 'قراءة GitHub غير متاحة هنا.'), null);
  assert.equal(gh.fileExcerpt({ url: 'o/r' }, null), null);
});

test('الخادم: سطر الأثر يحمل المقطع لقراءة الملفّ وحدها، والوكيل يرسله مع اكتمال الخطوة', () => {
  const { trailDetail } = require('../api/_lib/chat.js').__vread;
  const out = gh.formatFile('a.js', '', 'x\ny', 1, true);
  const d = trailDetail('read_github', { url: 'o/r', path: 'js/a.js' }, out);
  assert.equal(d.cmd, 'o/r js/a.js');
  assert.deepEqual(d.code, { p: 'js/a.js', r: '', a: 1, b: 2, n: 2, l: ['x', 'y'] });
  assert.equal('code' in trailDetail('read_github', { url: 'o/r' }, 'قراءة GitHub غير متاحة هنا.'), false, 'غير المالك يأخذ نصّ الرفض فلا مقطع');
  assert.equal('code' in trailDetail('fetch_page', { url: 'https://a.com' }, out), false, 'لأداة GitHub وحدها');
  const agent = read('api/_lib/agent.js');
  assert.ok(agent.includes("const __code = __gr && typeof __gr.fileExcerpt === 'function' ? __gr.fileExcerpt(input, result) : null;"));
  assert.ok(agent.includes("send({ act: Object.assign({ k: 'done', id: cb.id, ok: !/^(ففشلت|فظهر خطأ|فلم يُنشر)/.test(got), out: String(result).slice(0, 1500) }, __code ? { code: __code } : {}) });"));
});

test('الخادم: وصف read_github للمالك يطلب `مسار:سطر` — وغيره كائن الأداة نفسه بلا تغيير', () => {
  const pl = require('../api/_lib/provider-level.js');
  const base = { name: 'read_github', description: 'اقرأ.' };
  const ro = pl.ownerReadTool(base);
  assert.ok(ro.description.startsWith('اقرأ.'));
  assert.match(ro.description, /بصيغة `مسار:سطر` أو `مسار:سطر-سطر`/);
  assert.equal(base.description, 'اقرأ.', 'الأصل لا يُمسّ');
});

function loadPanel(opts) {
  const o = opts || {};
  const calls = [];
  const window = {};
  const ctx = {
    window, console, Math, JSON, String, Number, Array, Object, RegExp, Infinity,
    document: { documentElement: { classList: { contains: (c) => c === 'mobile-ui' && !!o.mobile } }, getElementById: () => null },
    switchWorkTab: (t) => calls.push('tab:' + t),
    __swallow: (e) => { throw e; },
  };
  ctx.window.waAutoExpand = () => calls.push('expand');
  vm.runInNewContext(read('js/app-38-read-panel.js'), ctx);
  return { rp: window.omranReadPanel, calls };
}
const ex = (p, a, lines) => ({ p, r: '', a, b: a + lines.length - 1, n: 500, l: lines });

test('اللوحة الحيّة: أوّل مقطع في الدور يبدأ لوحة جديدة بلا فتح تلقائيّ (v-read-fold مطويّة كـClaude)؛ المقاطع تُدمج بأرقامها', () => {
  const { rp, calls } = loadPanel();
  rp.begin();
  rp.live(ex('api/_lib/chat.js', 1, ['a', 'b']));
  rp.live(ex('api/_lib/chat.js', 3, ['c']));
  rp.live(ex('js/app-18-chat-tools.js', 10, ['x']));
  let st = rp._state();
  assert.equal(st.files.length, 2, 'قراءتان للملفّ نفسه = ملفّ واحد');
  assert.deepEqual(Object.keys(st.files[0].rows).map(Number), [1, 2, 3]);
  assert.deepEqual(calls, [], 'v-read-fold: لا تبويب ولا توسيع وحدهما — كـRead في Claude Code');
  rp.begin();
  rp.live(ex('knowledge/DECISIONS.md', 1, ['#']));
  st = rp._state();
  assert.equal(st.files.length, 1, 'الدور الجديد يفرّغ ما قبله');
  const m = loadPanel({ mobile: true });
  m.rp.begin(); m.rp.live(ex('a.js', 1, ['x']));
  assert.deepEqual(m.calls, [], 'الجوّال: لا فتح تلقائيّ');
});

test('فتح الرقم: المسار كما كتبه المزوّد يطابق الملفّ المقروء (كامل، لاحقة، اسم وحيد) ويظلّل المدى', () => {
  const { rp, calls } = loadPanel();
  const reads = [ex('api/_lib/chat.js', 1, ['a', 'b', 'c']), ex('js/app-18-chat-tools.js', 5, ['x'])];
  assert.equal(rp.open(reads, 'api/_lib/chat.js', 2, 3), true);
  assert.deepEqual(JSON.parse(JSON.stringify(rp._state().hl)), [2, 3]); // مصفوفة من سياق vm آخر
  assert.equal(rp.open(reads, '_lib/chat.js', 1), true, 'لاحقة مسار');
  assert.equal(rp._state().cur.p, 'api/_lib/chat.js');
  assert.equal(rp.open(reads, 'app-18-chat-tools.js', 5), true, 'اسم الملفّ وحده');
  assert.equal(rp.open(reads, 'nope.js', 1), false);
  const twin = [ex('a/index.js', 1, ['x']), ex('b/index.js', 1, ['y'])];
  assert.equal(rp.open(twin, 'index.js', 1), false, 'اسم مكرّر بلا مسار = لا تخمين');
  assert.ok(calls.includes('tab:read'));
});

test('الأرقام: ما قُرئ سطره وحده يصير رقمًا، بترقيم واحد للموضع المكرّر — والباقي نصّ كما هو', () => {
  const { rp } = loadPanel();
  const reads = [ex('api/_lib/chat.js', 1880, Array.from({ length: 40 }, (_, i) => 'l' + i))];
  const s = rp._segs('الجذر في `api/_lib/chat.js:1896` ثمّ `chat.js:1900-1905`، ومرّة ثانية `api/_lib/chat.js:1896`.', reads);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), [
    'الجذر في ',
    { p: 'api/_lib/chat.js', a: 1896, b: 1896, raw: '`api/_lib/chat.js:1896`', n: 1 },
    ' ثمّ ',
    { p: 'api/_lib/chat.js', a: 1900, b: 1905, raw: '`chat.js:1900-1905`', n: 2 },
    '، ومرّة ثانية ',
    { p: 'api/_lib/chat.js', a: 1896, b: 1896, raw: '`api/_lib/chat.js:1896`', n: 1 },
    '.',
  ]);
  assert.equal(rp._segs('`api/_lib/chat.js:12` لم يُقرأ سطره', reads), null, 'سطر لم يُقرأ = لا رقم');
  assert.equal(rp._segs('`js/other.js:5` و10:30 والإصدار 1.5:2', reads), null, 'ملفّ لم يُقرأ ووقت ورقم إصدار = نصّ');
});

test('الحفظ: تحت السقف كما هو؛ فوقه يُقصّ كلّ مقطع إلى نوافذ المواضع المذكورة ويسقط ما لم يُذكر', () => {
  const { rp } = loadPanel();
  const big = (p) => ex(p, 1, Array.from({ length: 2000 }, (_, i) => 'x'.repeat(30) + i));
  const small = [{ t: 'tool', code: ex('a.js', 1, ['x', 'y']) }, { t: 'think' }];
  assert.equal(rp.pack(small, 'لا شي')[0].code.l.length, 2);
  const parts = [{ t: 'tool', code: big('api/_lib/chat.js') }, { t: 'tool', code: big('js/app-09-attach.js') }, { t: 'tool', name: 'trFetch' }];
  rp.pack(parts, 'المشكلة في `chat.js:500-502`');
  assert.equal(parts[0].code.a, 488, '١٢ سطرًا قبل الموضع');
  assert.equal(parts[0].code.b, 514, '١٢ سطرًا بعده');
  assert.equal(parts[0].code.l[0], 'x'.repeat(30) + 487, 'الأسطر نفسها بأرقامها');
  assert.equal('code' in parts[1], false, 'ملفّ لم يُذكر في الردّ لا يُحفظ فوق السقف');
});

test('العميل: البثّ يغذّي اللوحة حيًّا ويحفظ المقطع مع خطوته', async () => {
  const src = read('js/app-18-chat-tools.js');
  const body = src.slice(0, src.indexOf('// v478'));
  const code = ex('api/_lib/chat.js', 1, ['a']);
  const events = [
    { status: '🐙 يقرأ من GitHub…', k: 'stFetchPage' },
    { status: '↳ قرأتُ GitHub o/r api/_lib/chat.js — حصلتُ 9 حرفًا', k: 'trFetch', cmd: 'o/r api/_lib/chat.js', out: '📄', code },
    { delta: 'في `api/_lib/chat.js:1`' },
    { done: true },
  ];
  const lines = events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('');
  const enc = new TextEncoder();
  let once = false;
  const seen = [];
  const window = { omranReadPanel: { begin: () => seen.push('begin'), live: (x) => seen.push('live:' + x.p), pack: (parts, reply) => seen.push('pack:' + parts.length + ':' + reply) } };
  const ctx = {
    window, TextDecoder, TextEncoder, Promise, setTimeout, clearTimeout, JSON, String, Array, Date, Error,
    tStatus: (ev) => ev.status,
    fetch: async () => ({ ok: true, body: { getReader: () => ({ read: async () => { if (once) return { done: true }; once = true; return { done: false, value: enc.encode(lines) }; }, cancel() {} }) } }),
  };
  vm.runInNewContext(body, ctx);
  const r = await window.callChatWithTools([{ role: 'user', content: 'x' }], null, 'claude');
  assert.deepEqual(seen, ['begin', 'live:api/_lib/chat.js', 'pack:1:في `api/_lib/chat.js:1`']);
  assert.deepEqual(JSON.parse(JSON.stringify(r.log[1].code)), code, 'المقطع محفوظ في خطوة السجلّ (m._agParts)');
});

test('الواجهة: التبويب واللوحة والربط والأنماط والترجمة بالأربع عشرة لغة', () => {
  const html = read('index.html');
  assert.match(html, /<div class="tab" id="tabRead" data-tab="read" data-i18n-title="readTab" data-i18n="\[aria-label\]readTab" title="الكود المقروء" aria-label="الكود المقروء" style="display:none;"><svg[\s\S]*?<\/svg><\/div>/);
  assert.ok(html.includes('<div class="panel" id="panel-read"></div>'));
  const r4 = read('js/app-04-i18n-state.js');
  const at = r4.indexOf('window.omranReadPanel.linkify(textDiv, m._agParts)');
  assert.ok(at > r4.indexOf('div.appendChild(textDiv);'), 'الأرقام بعد رسم النصّ');
  const a9 = read('js/app-09-attach.js');
  assert.ok(a9.includes("if(a.code && typeof a.code === 'object'){ p.code = a.code; if(window.omranReadPanel) window.omranReadPanel.live(a.code); }"), 'الوكيل يغذّي اللوحة');
  assert.ok(a9.includes('if(window.omranReadPanel) window.omranReadPanel.pack(log, tail);'), 'وسقف حفظه');
  assert.ok(read('js/app-38-read-panel.js').includes("wrap.setAttribute('data-keep-emoji', '');"), 'الكود لا يمرّ بمنظّف الإيموجي فتبقى مسافات البداية');
  const css = read('css/tokens.css');
  for (const sel of ['.rdWrap{', '.rdLn{', '.rdHl{', '.rdCite{', '.rdCiteN{', 'html[data-mode="light"] .rdWrap{']) assert.ok(css.includes(sel), sel);
  const i18n = read('js/app-03-i18n-data.js');
  assert.ok(i18n.includes("readTab: 'الكود المقروء', readCite: 'افتح السطر في لوحة الكود',"));
  assert.ok(i18n.includes("readTab: 'Code read', readCite: 'Open this line in the code panel',"));
  for (const f of fs.readdirSync(path.join(ROOT, 'i18n')).filter((n) => n !== 'ad-studio.js')) {
    assert.match(read('i18n/' + f), /readTab: '[^']+', readCite: '[^']+',/, f);
  }
  const tag = Number((r4.match(/sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]);
  assert.ok(tag >= 742, 'وسم ملفّات اللغات مرفوع');
  assert.ok(read('js/app.bundle.js').includes('window.omranReadPanel = {'), 'الحزمة مبنيّة من الأجزاء');
});
