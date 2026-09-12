// tests/code-analyze.test.cjs — v-code-score: تحليل الكود وتقييمه.
// يثبت سلوك الوحدة نفسها (جمع الملفّات، القياسات، التعليمة، استخراج JSON،
// التطبيع، المحرّكان بشبكة مزيّفة) ثمّ حراسة نصّية للتوصيل (المسار والزرّ).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-code-analyze';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const CA = require('../api/_lib/code-analyze.js').__test;

/* ---------- أرشيف zip مخزَّن (بلا ضغط) لاختبار مسار fileBase64 ---------- */
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(entries) {
  const locals = [], centrals = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data));
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc32(data), 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc32(data), 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, data); centrals.push(ch, name);
    off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat(locals.concat([cd, eocd]));
}

/* ---------- جمع الملفّات ---------- */
test('collectFiles: text files, per-file and total caps, empty/binary skipped', () => {
  const big = 'x'.repeat(500);
  const r = CA.collectFiles({ files: [
    { name: 'a.js', content: 'let a = 1;' },
    { name: 'empty.js', content: '   ' },
    { name: 'bin.dat', content: 'ab' + String.fromCharCode(0) + 'cd' },
    { name: 'big.js', content: big },
    { name: 'c.js', content: big },
  ] }, { perFile: 300, total: 2500 });
  assert.deepEqual(r.files.map((f) => f.name), ['a.js', 'big.js', 'c.js']);
  assert.equal(r.files[1].content.length, 300, 'يُقصّ عند سقف الملفّ');
  assert.equal(r.files[1].truncated, true);
  assert.deepEqual(r.skipped.map((s) => s.why).sort(), ['binary', 'empty']);
  assert.equal(r.total, 10 + 300 + 300);
});

test('collectFiles: total cap truncates then skips', () => {
  const r = CA.collectFiles({ files: [
    { name: 'a.js', content: 'a'.repeat(5000) },
    { name: 'b.js', content: 'b'.repeat(5000) },
    { name: 'c.js', content: 'c'.repeat(5000) },
  ] }, { total: 8000 });
  assert.equal(r.files.length, 2);
  assert.equal(r.files[1].content.length, 3000, 'الثاني يأخذ ما بقي من السقف');
  assert.equal(r.files[1].truncated, true);
  assert.equal(r.skipped[0].why, 'total');
});

test('collectFiles: zip archive — text entries in, node_modules and binaries out', () => {
  const zip = makeZip([
    { name: 'src/app.js', data: 'console.log(1)\n' },
    { name: 'node_modules/x/index.js', data: 'module.exports=1' },
    { name: 'logo.png', data: Buffer.from([1, 2, 3]) },
    { name: 'README.md', data: '# hi' },
    { name: 'dir/', data: '' },
  ]);
  const r = CA.collectFiles({ fileBase64: zip.toString('base64'), filename: 'p.zip', files: [{ name: 'extra.py', content: 'x = 1' }] });
  assert.deepEqual(r.files.map((f) => f.name), ['extra.py', 'src/app.js', 'README.md']);
  assert.equal(r.files[1].content, 'console.log(1)\n');
});

test('collectFiles: broken or oversized archive is reported, not thrown', () => {
  const bad = CA.collectFiles({ fileBase64: Buffer.from('not a zip at all').toString('base64') });
  assert.equal(bad.files.length, 0);
  assert.equal(bad.skipped[0].why, 'badzip');
  const huge = CA.collectFiles({ fileBase64: Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64'), filename: 'h.zip' });
  assert.equal(huge.skipped[0].why, 'toolarge');
});

/* ---------- القياسات المحلّية ---------- */
test('metricsOf: JS flags with line numbers, comments, long lines', () => {
  const js = [
    '// header comment',
    'var a = 1;',
    'if (a == 1) console.log(a);',
    'const f = eval("1+1"); // TODO clean',
    'el.innerHTML = a;',
    '',
    '/* block */',
    'x'.repeat(150),
    'const b = a === 1;',
  ].join('\n');
  const m = CA.metricsOf([{ name: 'a.js', content: js }]);
  const f = m.files[0];
  assert.equal(f.lang, 'JavaScript');
  assert.equal(f.lines, 9);
  assert.equal(f.blank, 1);
  assert.equal(f.comments, 2);
  const byKey = {};
  f.flags.forEach((x) => { byKey[x.key] = x; });
  assert.deepEqual(byKey.var.lines, [2]);
  assert.deepEqual(byKey.looseeq.lines, [3]);
  assert.deepEqual(byKey.console.lines, [3]);
  assert.deepEqual(byKey.eval.lines, [4]);
  assert.deepEqual(byKey.todo.lines, [4]);
  assert.deepEqual(byKey.innerhtml.lines, [5]);
  assert.equal(byKey.longline.count, 1);
  assert.equal(byKey.looseeq.count, 1, '=== لا يُحسب مقارنة غير صارمة');
  assert.equal(m.totals.flags.var, 1);
  assert.deepEqual(m.totals.languages, ['JavaScript']);
});

test('metricsOf: Python flags and hard-coded secret in any language', () => {
  const py = ['# comment', 'try:', '    pass', 'except:', '    print("x")', 'API_KEY = "abcdefghijklmnop"'].join('\n');
  const f = CA.metricsOf([{ name: 'a.py', content: py }]).files[0];
  const keys = f.flags.map((x) => x.key);
  assert.ok(keys.includes('bareexcept'));
  assert.ok(keys.includes('print'));
  assert.ok(keys.includes('secret'));
  assert.ok(!keys.includes('console'), 'أعلام JS لا تُطبَّق على بايثون');
  assert.equal(f.comments, 1);
});

/* ---------- التعليمة ---------- */
test('buildPrompt: numbered lines, file headers, hints, ask, output language', () => {
  const files = [{ name: 'a.js', content: 'var a = 1;\nvar b = 2;' }, { name: 'b.py', content: 'print(1)', truncated: true }];
  const m = CA.metricsOf(files);
  const p = CA.buildPrompt(files, m, 'ركّز على الأمان', 'ar');
  assert.ok(p.user.includes('=== FILE: a.js (JavaScript · 2 سطرًا) ==='));
  assert.ok(p.user.includes('1| var a = 1;\n2| var b = 2;'), 'الأسطر مرقّمة');
  assert.ok(p.user.includes('مقتطع لطوله'), 'الملفّ المقتطع يُعلَّم');
  assert.ok(p.user.includes('var بدل let/const: 2'), 'القياسات تُمرَّر كتلميح');
  assert.ok(p.user.includes('[تركيز إضافيّ طلبه المستخدم]: ركّز على الأمان'));
  assert.ok(p.system.includes('بلغة: العربية'));
  assert.ok(p.system.includes('"score"') && p.system.includes('"recommendations"') && p.system.includes('"files"'));
  const en = CA.buildPrompt(files, m, '', 'en');
  assert.ok(en.system.includes('بلغة: English'));
  assert.ok(!en.user.includes('[تركيز إضافيّ'), 'بلا تركيز = بلا سطر التركيز');
  const longAsk = CA.buildPrompt(files, m, 'q'.repeat(5000), 'ar');
  assert.ok(!longAsk.user.includes('q'.repeat(1201)), 'سؤال التركيز يُقصّ عند السقف');
});

/* ---------- استخراج JSON ---------- */
test('extractJson: raw, fenced, trailing commas, raw newlines inside strings', () => {
  assert.deepEqual(CA.extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(CA.extractJson('here you go:\n```json\n{"a": [1, 2]}\n```\nthanks'), { a: [1, 2] });
  assert.deepEqual(CA.extractJson('{"a": 1, "b": [1, 2,],}'), { a: 1, b: [1, 2] });
  assert.deepEqual(CA.extractJson('{"fix": "line one\nline two\ttab"}'), { fix: 'line one\nline two\ttab' });
  assert.deepEqual(CA.extractJson('{"s": "quote \\" inside\nnext"}'), { s: 'quote " inside\nnext' });
  assert.equal(CA.extractJson('no json here'), null);
  assert.equal(CA.extractJson(''), null);
  assert.equal(CA.extractJson('{"broken": '), null);
});

/* ---------- التطبيع ---------- */
test('gradeOf boundaries', () => {
  assert.equal(CA.gradeOf(90), 'A'); assert.equal(CA.gradeOf(89), 'B'); assert.equal(CA.gradeOf(75), 'B');
  assert.equal(CA.gradeOf(74), 'C'); assert.equal(CA.gradeOf(60), 'C'); assert.equal(CA.gradeOf(59), 'D');
  assert.equal(CA.gradeOf(45), 'D'); assert.equal(CA.gradeOf(44), 'F'); assert.equal(CA.gradeOf(null), null);
});

test('normalizeReport: clamps, severity order, file ranking, counts', () => {
  const r = CA.normalizeReport({
    summary: 'ok', language: 'JS', score: 140,
    categories: { correctness: -5, security: '72', performance: 'abc', readability: 80, maintainability: 70, best_practices: 60 },
    strengths: ['a', { text: 'b' }, ''],
    issues: [
      { severity: 'LOW', category: 'Best Practices', file: 'a.js', line: '12', title: 'x', detail: 'd', fix: 'f' },
      { severity: 'weird', category: 'nope', title: 'y', line: 0 },
      { severity: 'critical', category: 'security', title: 'z', line: 3.7 },
      { title: '' },
    ],
    recommendations: ['r1', 'r2'],
    files: [{ name: 'a.js', score: 40 }, { name: 'b.js', score: 90, note: 'good' }, { score: 10 }],
    verdict: 'v',
  }, '');
  assert.equal(r.score, 100); assert.equal(r.grade, 'A');
  assert.deepEqual(r.categories, { correctness: 0, security: 72, performance: null, readability: 80, maintainability: 70, best_practices: 60 });
  assert.deepEqual(r.strengths, ['a', 'b']);
  assert.deepEqual(r.issues.map((i) => i.severity), ['critical', 'medium', 'low'], 'مرتّبة من الأخطر والمجهول = متوسّط');
  assert.equal(r.issues[2].category, 'best_practices'); assert.equal(r.issues[2].line, 12);
  assert.equal(r.issues[1].category, 'best_practices'); assert.equal(r.issues[1].line, null);
  assert.equal(r.issues[0].line, 3);
  assert.deepEqual(r.counts, { critical: 1, high: 0, medium: 1, low: 1, info: 0 });
  assert.deepEqual(r.files.map((f) => f.name), ['b.js', 'a.js'], 'الأفضل أوّلًا والمجهول الاسم يسقط');
  assert.equal(r.parsed, true);
});

test('normalizeReport: score falls back to category average; unparsed keeps raw text', () => {
  const r = CA.normalizeReport({ categories: { correctness: 80, security: 60 } }, '');
  assert.equal(r.score, 70); assert.equal(r.grade, 'C');
  const u = CA.normalizeReport(null, 'the model rambled');
  assert.equal(u.parsed, false); assert.equal(u.score, null); assert.equal(u.grade, null);
  assert.equal(u.summary, 'the model rambled');
  assert.deepEqual(u.issues, []);
});

/* ---------- المحرّكان بشبكة مزيّفة ---------- */
function sseBody(lines) {
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { c.enqueue(enc.encode(lines.join('\n') + '\n')); c.close(); } });
}
function fakeFetch(capture, lines) {
  return async (url, init) => {
    capture.url = url; capture.body = JSON.parse(init.body); capture.headers = init.headers;
    return { ok: true, status: 200, body: sseBody(lines) };
  };
}

test('callPro: streams Anthropic text deltas, picks model from env, direct key wins', async () => {
  const cap = {};
  const lines = [
    'data: {"type":"content_block_start","index":0}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"{\\"score\\":"}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" 88}"}}',
    'data: {"type":"message_stop"}',
  ];
  const progress = [];
  const text = await CA.callPro({ system: 'S', user: 'U' }, { env: { ANTHROPIC_API_KEY: 'k1', OPENROUTER_API_KEY: 'k2', CODE_ANALYZE_MODEL: 'claude-opus-5' }, fetchImpl: fakeFetch(cap, lines), onProgress: (n) => progress.push(n) });
  assert.equal(text, '{"score": 88}');
  assert.equal(cap.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(cap.headers['x-api-key'], 'k1');
  assert.equal(cap.body.model, 'claude-opus-5');
  assert.equal(cap.body.system, 'S');
  assert.deepEqual(cap.body.messages, [{ role: 'user', content: 'U' }]);
  assert.equal(cap.body.stream, true);
  assert.deepEqual(progress, [9, 13]);
  assert.deepEqual(CA.extractJson(text), { score: 88 });
});

test('callPro: falls back to OpenRouter with vendor prefix; no key throws', async () => {
  const cap = {};
  await CA.callPro({ system: 'S', user: 'U' }, { env: { OPENROUTER_API_KEY: 'k2', CHAT_CLAUDE_MODEL: 'claude-sonnet-5' }, fetchImpl: fakeFetch(cap, ['data: {"type":"message_stop"}']) });
  assert.equal(cap.url, 'https://openrouter.ai/api/v1/messages');
  assert.equal(cap.body.model, 'anthropic/claude-sonnet-5');
  await assert.rejects(() => CA.callPro({ system: 'S', user: 'U' }, { env: {} }), /missing ANTHROPIC_API_KEY/);
});

test('callPro: upstream HTTP error surfaces as a thrown error', async () => {
  const fetchImpl = async () => ({ ok: false, status: 529, text: async () => 'overloaded' });
  await assert.rejects(() => CA.callPro({ system: 'S', user: 'U' }, { env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl }), /upstream 529: overloaded/);
});

test('callFree: uses the free chain (OpenAI-style SSE), no provider name leaks', async () => {
  const cap = {};
  const lines = [
    'data: {"choices":[{"delta":{"content":"{\\"score\\""}}]}',
    'data: {"choices":[{"delta":{"content":": 55}"}}]}',
    'data: [DONE]',
  ];
  const text = await CA.callFree({ system: 'S', user: 'U' }, { env: { GEMINI_API_KEY: 'g' }, fetchImpl: fakeFetch(cap, lines) });
  assert.equal(text, '{"score": 55}');
  assert.ok(cap.url.includes('generativelanguage.googleapis.com'));
  assert.equal(cap.body.messages[0].role, 'system');
  assert.equal(cap.body.messages[1].content, 'U');
  await assert.rejects(() => CA.callFree({ system: 'S', user: 'U' }, { env: {}, fetchImpl: fakeFetch({}, []) }), /free-busy/);
});

/* ---------- حراسة التوصيل ---------- */
test('wiring: tools router, vercel rewrite, bundle part, hand-off hook, test script', () => {
  assert.ok(read('api/tools.js').includes("case 'code-analyze': return require('./_lib/code-analyze.js');"));
  const v = JSON.parse(read('vercel.json'));
  assert.ok(v.rewrites.some((r) => r.source === '/api/code-analyze' && r.destination === '/api/tools?action=code-analyze'));
  const part = read('js/app-27-codescore.js');
  assert.ok(part.includes("'/api/tools?action=code-analyze'"));
  assert.ok(part.includes('btnCodeScore') && part.includes('window.omranCodeScoreOpen = open'));
  assert.ok(read('js/app-24-codefix.js').includes('window.omranCodeFixOpenWith = function (name, text, ask)'));
  assert.ok(read('js/app.bundle.js').includes('btnCodeScore'), 'الحزمة مبنيّة بالجزء الجديد');
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('tests/code-analyze.test.cjs'));
  const zip = require('../api/_lib/analyze-zip.js');
  assert.equal(typeof zip.unzip, 'function');
  assert.ok(zip.TEXT_EXT instanceof RegExp && zip.BINARY_EXT instanceof RegExp && Array.isArray(zip.SKIP_DIR_PATTERNS));
});
