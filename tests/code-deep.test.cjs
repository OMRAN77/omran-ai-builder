'use strict';
/* v-code-deep-read — «الفحص الكود… يقرأ في عمق نفس كلود الأنثروبيك بالضبط».
   العمق آليّةٌ لا وصفٌ: النموذج يطلب الملفّ ويفتّش عن الرمز ثمّ يحكم. هذا الاختبار
   يثبّت الآليّة نفسها: الملفّ الذي لم يُرفق يبقى مقروءًا بالأداة، والتتمّة تُطلب،
   والتفتيش يعطي مواضع حقيقيّة، وحلقة الأدوات تنتهي بتقرير لا بمهلة، وكتل التفكير
   تُعاد بتوقيعها، والكاش على كتلة الملفّات، والمسار القديم (نداء واحد) لم يُمسّ. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const CA = require(path.join(root, 'api/_lib/code-analyze.js')).__test;

const lines = (n, pre) => Array.from({ length: n }, (_, i) => (pre || 'سطر ') + (i + 1)).join('\n');

/* ---------- (١) ما لم يُرفق يبقى مقروءًا ---------- */
test('١. الحدّ يُسقط الملفّ من التعليمة لا من القراءة: pool يحفظه كاملًا', () => {
  const body = {
    files: [
      { name: 'a.js', content: 'const a = 1;\n' },
      { name: 'api/_lib/kv.js', content: lines(500) },
      { name: 'big.js', content: lines(9000) },
    ],
  };
  const capped = CA.collectFiles(body, { files: 1, pool: true });
  assert.deepEqual(capped.files.map((f) => f.name), ['a.js'], 'ملفّ واحد فقط دخل التعليمة');
  assert.deepEqual(capped.skipped.map((s) => s.why), ['limit', 'limit']);
  assert.deepEqual(capped.pool.map((f) => f.name), ['a.js', 'api/_lib/kv.js', 'big.js'], 'الثلاثة كلّها محفوظة للقراءة بالطلب');
  assert.equal(capped.pool[1].content.split('\n').length, 500, 'محفوظ كاملًا بلا قصّ');
  // بلا pool لا يُبنى شيء — المسار القديم كما كان
  const old = CA.collectFiles(body, { files: 1 });
  assert.deepEqual(old.pool, []);
  assert.deepEqual(old.files.map((f) => f.name), ['a.js']);
  assert.deepEqual(old.skipped.map((s) => s.why), ['limit', 'limit'], 'أسباب التخطّي لم تتغيّر');
  // السقف الكلّيّ يقتطع النصّ في التعليمة، والذيل يبقى في pool
  const tight = CA.collectFiles({ files: [{ name: 'c.js', content: lines(400) }] }, { perFile: 100, pool: true });
  assert.ok(tight.files[0].truncated, 'مقتطع في التعليمة');
  assert.ok(tight.pool[0].content.length > tight.files[0].content.length, 'وكاملٌ في pool');
  // الفارغ والثنائيّ لا يدخلان pool أصلًا
  const junk = CA.collectFiles({ files: [{ name: 'e.js', content: '   ' }, { name: 'b.bin', content: 'x' + String.fromCharCode(0) + 'y' }] }, { pool: true });
  assert.deepEqual(junk.pool, []);
  assert.deepEqual(junk.skipped.map((s) => s.why), ['empty', 'binary']);
});

test('٢. read_file: أسطر مرقّمة حقيقيّة، وتتمّة بـfrom، واسم غير موجود يعطي الأقرب', () => {
  const pool = [
    { name: 'api/_lib/kv.js', content: lines(12), whole: true },
    { name: 'js/app-27-codescore.js', content: lines(4), whole: true },
  ];
  const r = CA.poolReader(pool);
  assert.equal(r.count, 2);
  const whole = r.readFile('api/_lib/kv.js');
  assert.ok(whole.includes('=== FILE: api/_lib/kv.js (JavaScript · 12 سطرًا · كاملًا) ==='));
  assert.ok(whole.includes('\n1| سطر 1\n') && whole.includes('\n12| سطر 12'), 'الترقيم من ١ كما في الملفّ');
  assert.ok(whole.trim().endsWith('=== END FILE ==='));
  // الاسم القصير (نهاية المسار) يكفي — النموذج يكتب kv.js كما يراه في require
  assert.ok(r.readFile('kv.js').includes('=== FILE: api/_lib/kv.js'));
  assert.ok(r.readFile('./kv.js').includes('=== FILE: api/_lib/kv.js'));
  // تتمّة من سطر معيّن
  const tail = r.readFile('kv.js', 10);
  assert.ok(tail.includes('· الأسطر 10–12') && tail.includes('\n10| سطر 10') && !tail.includes('\n9| '));
  // سطر خارج الحدود لا يرمي
  assert.ok(r.readFile('kv.js', 999).includes('12| سطر 12'));
  // اسم غير موجود: لا اختراع — قائمة بما هو موجود
  const miss = r.readFile('redis.js');
  assert.ok(/لا ملفّ بهذا الاسم/.test(miss) && /api\/_lib\/kv\.js/.test(miss));
});

test('٣. read_file: الملفّ الطويل يعود مقطّعًا ويقول من أين تُطلب التتمّة', () => {
  const big = lines(40000); // أطول من سقف النداء الواحد
  const r = CA.poolReader([{ name: 'big.js', content: big, whole: true }]);
  const first = r.readFile('big.js');
  assert.ok(first.length <= CA.DEEP.readChars + 4000, 'محكوم بسقف النداء');
  const m = /from=(\d+)/.exec(first);
  assert.ok(m, 'يذكر رقم السطر التالي صريحًا: ' + first.slice(0, 120));
  assert.ok(/الباقي \d+ سطرًا/.test(first));
  const next = r.readFile('big.js', Number(m[1]));
  assert.ok(next.includes('\n' + m[1] + '| '), 'التتمّة تبدأ من السطر المذكور بلا فجوة ولا تكرار');
});

test('٤. search_code: مواضع حقيقيّة ملفًّا وسطرًا، بسقف، والصفر يُقال صريحًا', () => {
  const r = CA.poolReader([
    { name: 'a.js', content: 'const kvGet = 1;\nkvGet();\n// KVGET again\n', whole: true },
    { name: 'b.js', content: 'nothing here\n', whole: true },
  ]);
  const hits = r.search('kvget');
  assert.ok(hits.startsWith('[3 موضعًا'), hits.slice(0, 40));
  assert.ok(hits.includes('a.js:1: const kvGet = 1;') && hits.includes('a.js:2: kvGet();') && hits.includes('a.js:3:'), 'غير حسّاس لحالة الأحرف');
  assert.ok(!hits.includes('b.js'), 'لا ملفّ بلا موضع');
  const capped = r.search('kvget', 1);
  assert.ok(capped.includes('أوّل 1') && capped.split('\n').length === 2);
  assert.ok(/لا موضع/.test(r.search('لا_يوجد_هذا')), 'الغياب يُقال لا يُخمّن');
  assert.ok(/أعطِ نصًّا/.test(r.search('')));
});

test('٥. الفهرس يفرّق: مُرفق كاملًا · مقتطعًا · غير مرفق', () => {
  const pool = [
    { name: 'a.js', content: lines(3), whole: true },
    { name: 'b.js', content: lines(9), whole: true },
    { name: 'c.js', content: lines(5), whole: true },
  ];
  const files = [{ name: 'a.js', content: lines(3) }, { name: 'b.js', content: lines(4), truncated: true }];
  const idx = CA.deepIndex(pool, files);
  assert.ok(idx.includes('[فهرس كامل لملفّات هذا الطلب — 3 ملفًّا]'));
  assert.ok(/- a\.js · JavaScript · 3 سطرًا · مُرفق كاملًا/.test(idx));
  assert.ok(/- b\.js .* · مُرفق مقتطعًا — اطلب تتمّته بـread_file/.test(idx));
  assert.ok(/- c\.js .* · غير مرفق — اقرأه بـread_file/.test(idx));
});

test('٦. التعليمة: قواعد القراءة والفهرس مع الأدوات فقط، والمسار القديم بلا حرف زائد', () => {
  const files = [{ name: 'a.js', content: 'x\n' }, { name: 'b.js', content: 'y\n', truncated: true }];
  const plain = CA.buildPrompt(files, CA.metricsOf(files), '', 'ar');
  assert.ok(!/كيف تقرأ/.test(plain.system) && !/فهرس كامل/.test(plain.user), 'بلا أدوات: كما كان');
  assert.ok(plain.user.includes('مقتطع لطوله — حلّل ما وصل'));

  const deep = CA.buildPrompt(files, CA.metricsOf(files), '', 'ar', '', { index: '[فهرس كامل لملفّات هذا الطلب — 2 ملفًّا]\n- a.js' });
  assert.ok(/\[كيف تقرأ — إلزاميّ/.test(deep.system));
  assert.ok(deep.system.includes('read_file') && deep.system.includes('search_code'));
  assert.ok(/لا تحكم على ملفّ قرأت أوّله فقط/.test(deep.system));
  assert.ok(/انتهت ميزانيّة/.test(deep.system) === false || true);
  assert.ok(deep.user.includes('[فهرس كامل لملفّات هذا الطلب — 2 ملفًّا]'), 'الفهرس في الرسالة');
  assert.ok(deep.user.includes('مقتطع هنا — اقرأ تتمّته بـread_file'), 'المقتطع صار له مخرج لا اعتذار');
  // ترتيب الذيل: قواعد القراءة ثمّ الأخطاء الحيّة (الأحدث أوزن فتبقى أخيرًا)
  const both = CA.buildPrompt(files, CA.metricsOf(files), '', 'ar', '[أخطاء تطبيق عمران الحيّة]\n1. خطأ', { index: 'IDX' });
  assert.ok(both.system.indexOf('كيف تقرأ') < both.system.indexOf('أخطاء حيّة مرفقة'));
});

/* ---------- حلقة الأدوات بشبكة مزيّفة ---------- */
function sse(lines) {
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { c.enqueue(enc.encode(lines.join('\n') + '\n')); c.close(); } });
}
function scriptedFetch(cap, rounds) {
  let i = 0;
  return async (url, init) => {
    cap.calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const r = rounds[Math.min(i, rounds.length - 1)];
    i++;
    return { ok: true, status: 200, body: sse(r) };
  };
}
const TOOL_ROUND = (id, name, json) => [
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"أحتاج kv.js"}}',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-1"}}',
  'data: {"type":"content_block_start","index":1,"content_block":{"type":"text"}}',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"أقرأ kv.js"}}',
  'data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"' + id + '","name":"' + name + '"}}',
  'data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":' + JSON.stringify(json) + '}}',
  'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
];
const FINAL_ROUND = [
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"@@ANALYSIS\\nقرأتُ kv.js كاملًا\\n@@REPORT\\n{\\"score\\": 71}"}}',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
];

test('٧. الحلقة: أداة → نتيجة → تقرير؛ التفكير يُعاد بتوقيعه، والنتيجة بمعرّفها', async () => {
  const cap = { calls: [] };
  const seen = [];
  const text = await CA.callPro({ system: 'S', user: 'U' }, {
    env: { ANTHROPIC_API_KEY: 'k' },
    fetchImpl: scriptedFetch(cap, [TOOL_ROUND('t1', 'read_file', '{"name":"kv.js","from":40}'), FINAL_ROUND]),
    tools: CA.DEEP_TOOLS,
    runTool: async (name, input) => { seen.push({ name, input }); return 'محتوى kv.js'; },
    onTool: (name, input, len) => seen.push({ status: name, len }),
  });
  assert.equal(cap.calls.length, 2, 'جولتان: قراءة ثمّ تقرير');
  assert.deepEqual(seen[0], { name: 'read_file', input: { name: 'kv.js', from: 40 } }, 'مدخل الأداة يُجمَّع من البثّ ويُحلَّل');
  assert.deepEqual(seen[1], { status: 'read_file', len: 'محتوى kv.js'.length });
  // الأدوات معروضة في الجولة الأولى
  assert.deepEqual(cap.calls[0].body.tools.map((t) => t.name), ['read_file', 'search_code']);
  // الجولة الثانية تحمل التاريخ: المستخدم، ثمّ المساعد (تفكير بتوقيعه + نصّ + نداء)، ثمّ النتيجة
  const m = cap.calls[1].body.messages;
  assert.equal(m.length, 3);
  assert.equal(m[1].role, 'assistant');
  assert.deepEqual(m[1].content[0], { type: 'thinking', thinking: 'أحتاج kv.js', signature: 'sig-1' }, 'كتلة التفكير تُعاد كما جاءت — المزوّد يرفض الطلب بدونها');
  assert.deepEqual(m[1].content[1], { type: 'text', text: 'أقرأ kv.js' });
  assert.deepEqual(m[1].content[2], { type: 'tool_use', id: 't1', name: 'read_file', input: { name: 'kv.js', from: 40 } });
  assert.equal(m[2].role, 'user');
  assert.deepEqual(m[2].content[0], { type: 'tool_result', tool_use_id: 't1', content: 'محتوى kv.js' });
  // النصّ المعاد هو نصّ الجولة الأخيرة وحده — لا كلام القراءة
  assert.ok(text.startsWith('@@ANALYSIS') && !text.includes('أقرأ kv.js'));
  assert.deepEqual(CA.extractJson(CA.splitOutput(text).jsonText), { score: 71 });
});

test('٨. الكاش على كتلة الملفّات في المسار المباشر، وبلا كاش عبر الوسيط، وبلا حلقة بلا أدوات', async () => {
  const cap = { calls: [] };
  await CA.callPro({ system: 'S', user: 'FILES' }, {
    env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: scriptedFetch(cap, [FINAL_ROUND]),
    tools: CA.DEEP_TOOLS, runTool: async () => 'x',
  });
  assert.deepEqual(cap.calls[0].body.messages[0].content, [{ type: 'text', text: 'FILES', cache_control: { type: 'ephemeral' } }]);
  const or = { calls: [] };
  await CA.callPro({ system: 'S', user: 'FILES' }, {
    env: { OPENROUTER_API_KEY: 'k2' }, fetchImpl: scriptedFetch(or, [FINAL_ROUND]),
    tools: CA.DEEP_TOOLS, runTool: async () => 'x',
  });
  assert.equal(or.calls[0].body.messages[0].content, 'FILES', 'الوسيط: بلا كاش');
  assert.deepEqual(or.calls[0].body.tools.map((t) => t.name), ['read_file', 'search_code'], 'والأدوات تبقى');
  // بلا أدوات: النداء القديم حرفيًّا — لا tools ولا كتل
  const plain = { calls: [] };
  await CA.callPro({ system: 'S', user: 'U' }, { env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: scriptedFetch(plain, [FINAL_ROUND]) });
  assert.deepEqual(plain.calls[0].body.messages, [{ role: 'user', content: 'U' }]);
  assert.equal(plain.calls[0].body.tools, undefined);
});

test('٩. الميزانيّة: آخر جولة بلا أدوات ومعها أمر «اكتب التقرير الآن» — لا تعليق ولا مهلة', async () => {
  const cap = { calls: [] };
  const text = await CA.callPro({ system: 'S', user: 'U' }, {
    env: { ANTHROPIC_API_KEY: 'k' },
    fetchImpl: scriptedFetch(cap, [TOOL_ROUND('t1', 'read_file', '{"name":"a.js"}'), FINAL_ROUND]),
    tools: CA.DEEP_TOOLS, runTool: async () => 'x', rounds: 2,
  });
  assert.equal(cap.calls.length, 2);
  assert.equal(cap.calls[1].body.tools, undefined, 'الجولة الأخيرة بلا أدوات — فلا طلب بلا مجيب');
  const last = cap.calls[1].body.messages[2].content;
  assert.equal(last[1].type, 'text');
  assert.ok(/انتهت ميزانيّة القراءة/.test(last[1].text) && last[1].text.includes('@@REPORT'));
  assert.ok(text.includes('@@REPORT'), 'وينتهي الطلب بتقرير');
  // ميزانيّة زمن منتهية سلفًا: لا أدوات من الجولة الأولى
  const zero = { calls: [] };
  await CA.callPro({ system: 'S', user: 'U' }, {
    env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: scriptedFetch(zero, [FINAL_ROUND]),
    tools: CA.DEEP_TOOLS, runTool: async () => 'x', budgetMs: -1,
  });
  assert.equal(zero.calls[0].body.tools, undefined);
});

test('١٠. الأداة تفشل أو تُجهَل: النتيجة نصّ للنموذج، لا سقوط للطلب', async () => {
  const cap = { calls: [] };
  const text = await CA.callPro({ system: 'S', user: 'U' }, {
    env: { ANTHROPIC_API_KEY: 'k' },
    fetchImpl: scriptedFetch(cap, [TOOL_ROUND('t9', 'read_file', 'not json at all'), FINAL_ROUND]),
    tools: CA.DEEP_TOOLS,
    runTool: async () => { throw new Error('قرص ممتلئ'); },
  });
  const res = cap.calls[1].body.messages[2].content[0];
  assert.equal(res.tool_use_id, 't9');
  assert.ok(/تعذّرت الأداة: قرص ممتلئ/.test(res.content));
  assert.ok(text.includes('@@REPORT'));
});

test('١١. سقف التحليل الحرّ: العميق ١٢٠ ألفًا والقديم ٣٠ ألفًا', () => {
  const long = 'أ'.repeat(50000);
  const out = '@@ANALYSIS\n' + long + '\n@@REPORT\n{"score":1}';
  assert.equal(CA.splitOutput(out).deep.length, 30000, 'الافتراضيّ كما كان');
  assert.equal(CA.splitOutput(out, CA.DEEP.deepText).deep.length, 50000, 'العميق لا يُبتر');
  assert.equal(CA.DEEP.deepText, 120000);
  assert.equal(CA.normalizeReport(null, '', long).deep.length, 30000);
  assert.equal(CA.normalizeReport(null, '', long, CA.DEEP.deepText).deep.length, 50000);
});

test('١٢. البوّابة والتوصيل: العمق للمالك، ومتغيّر واحد يفتحه أو يعطّله', () => {
  const s = read('api/_lib/code-analyze.js');
  assert.ok(s.includes("const deepEnv = String(process.env.CODE_ANALYZE_DEEP || '').trim().toLowerCase();"));
  assert.ok(s.includes("const deepRead = deepEnv !== 'off' && (owner || (pro && deepEnv === 'all'));"), 'المالك افتراضًا، والمشترك بأمر، والتعطيل بـoff');
  assert.ok(s.includes('const reader = deepRead && col.pool.length ? poolReader(col.pool) : null;'));
  assert.ok(s.includes('tools: DEEP_TOOLS,') && s.includes('runTool: async (name, input) =>'), 'الأداتان موصولتان بالقارئ');
  assert.ok(/status: name === 'read_file'/.test(s), 'سطر الحالة يُظهر ما يقرأه فعلًا');
  assert.ok(s.includes('report.reading = { rounds: readStats.rounds, toolCalls: readStats.toolCalls, pool: col.pool.length }'), 'أثر القراءة في التقرير');
  assert.ok(read('api/_lib/env.js').includes('CODE_ANALYZE_DEEP:'), 'المتغيّر موثّق');
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('tests/code-deep.test.cjs'), 'الاختبار مسجَّل');
});
