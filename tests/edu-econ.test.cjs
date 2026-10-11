// tests/edu-econ.test.cjs — v-edu-econ (ثغرات الفلوس، ١١ أكتوبر).
// العرض: كلّ تحليل في /api/edu للضيف والمجّانيّ كان نداءين على النموذج الأغلى (claude-sonnet-5)، والضيف يتجدّد
// بتدوير الـIP بلا سقف كلّيّ، واحتياط OpenRouter يرسل معرّف الاقتصاديّ بالشرطة (anthropic/claude-haiku-4-5) لا بالنقطة.
// القرار: الضيف والمجّانيّ على EDU_ECON_MODEL (افتراضيًّا claude-haiku-4-5) والمدفوع والمالك على MODEL؛ الملفّ الضخم
// الذي يرفضه الاقتصاديّ بـ400 يُعاد مرّة على الافتراضيّ؛ معرّف OpenRouter بالنقطة؛ وسقف ضيوف كلّيّ يوميّ
// EDU_GUEST_TOTAL_DAILY (٢٠٠) يُفحص قبل النداء الثقيل وبنصّ الضيف نفسه.
// الاختبار: المعالج الحقيقيّ api/edu.js مع kv وauth في الذاكرة وfetch مسجِّل — لا شبكة ولا مفاتيح حقيقيّة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'edu-econ-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
delete process.env.OPENROUTER_API_KEY;
delete process.env.EDU_ECON_MODEL;
delete process.env.EDU_ECON_TIERS;
delete process.env.EDU_GUEST_TOTAL_DAILY;
delete process.env.EDU_GUEST_LIGHT_TOTAL_DAILY;
delete process.env.EDU_LAB_MODEL;

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// ---- kv في الذاكرة (مع مفتاح يمكن إفشاله لاختبار «فشل KV لا يقفل») ----
const db = new Map();
let failIncr = null; // RegExp لمفاتيح يرمي عندها kvIncr
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? db.get(k) : null),
  kvPutJSON: async (k, v) => { db.set(k, v); },
  kvDel: async (k) => { db.delete(k); },
  kvIncr: async (k) => {
    if (failIncr && failIncr.test(k)) throw new Error('kv down');
    const n = (Number(db.get(k)) || 0) + 1; db.set(k, n); return n;
  },
  kvExpire: async () => true,
});

// ---- auth: توكن HMAC وسجلّات الحسابات من Map ----
const users = new Map();
const sign = (p) => crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
function makeToken(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 3600_000 })).toString('base64url'); return p + '.' + sign(p); }
function verifyToken(t) {
  try {
    const [p, s] = String(t).split('.');
    if (s !== sign(p)) return null;
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp < Date.now() ? null : d.u;
  } catch (e) { return null; }
}
stub('api/_lib/auth.js', {
  verifyToken,
  getUser: async (u) => {
    const rec = users.get(String(u).toLowerCase());
    if (rec === 'THROW') throw new Error('kv read failed');
    return rec || null;
  },
  getUserOnce: async (u) => users.get(String(u).toLowerCase()) || null,
  putUser: async (u, rec) => { users.set(String(u).toLowerCase(), rec); },
  isBanned: async () => false,
});
function addUser(name, plan) {
  const rec = { username: name, createdAt: Date.now() - 86400000 * 3, points: 70 };
  if (plan) { rec.plan = plan; rec.planUpdatedAt = Date.now() - 86400000; }
  users.set(name.toLowerCase(), rec);
  return makeToken(name);
}

// ---- fetch مسجِّل: ردّ صالح لكلّ الإجراءات، أو ما يعيده upstream ----
const LESSON = {
  title: 't', subject: 's', summary: 'ملخّص', flashcards: [{ q: 'a', a: 'b' }],
  quiz: [{ q: 'q', options: ['1', '2', '3', '4'], correct: 0 }], written: [],
  reply: 'r', score: 5, steps: [{ hint: 'h', work: 'w' }], answer: 'a',
  cvHtml: '<html></html>', coverLetter: '', total: 1, categories: [{ name: 'n', amount: 1 }],
};
const calls = [];
let upstream = null;
const jsonRes = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
global.fetch = async (url, init) => {
  let body = {};
  try { body = JSON.parse((init && init.body) || '{}'); } catch (e) { /* ليس JSON — لا يحدث هنا */ }
  const c = { url: String(url), host: new URL(String(url)).host, model: body.model, max_tokens: body.max_tokens, raw: String((init && init.body) || '') };
  calls.push(c);
  await new Promise((r) => setImmediate(r)); // يتشابك الطلبان المتزامنان فعلًا
  const custom = upstream && upstream(c);
  return custom || jsonRes(200, { content: [{ type: 'text', text: JSON.stringify(LESSON) }], stop_reason: 'end_turn' });
};

const edu = require(rp('api/edu.js'));

function call(ip, body) {
  const start = calls.length;
  return new Promise((resolve) => {
    const res = {
      code: 200, setHeader() {}, getHeader() {},
      status(c) { this.code = c; return this; },
      json(j) { resolve({ code: this.code, j, calls: calls.slice(start) }); return this; },
      end() { resolve({ code: this.code, calls: calls.slice(start) }); return this; },
    };
    edu({ method: 'POST', body, headers: { 'x-forwarded-for': ip }, query: {} }, res);
  });
}
const models = (r) => r.calls.map((c) => c.model);
const HAIKU = 'claude-haiku-4-5', SONNET = 'claude-sonnet-5';
const resetGuestTotal = () => { for (const k of [...db.keys()]) if (k.startsWith('edu:guest-total:')) db.delete(k); };
const guestTotal = () => Number(db.get('edu:guest-total:*:' + new Date().toISOString().slice(0, 10)) || 0);

test('١. تحليل الضيف: نداءان فقط إلى Anthropic وكلاهما على الاقتصاديّ، بميزانيّتي 8000 و9000', async () => {
  const r = await call('10.0.0.1', { action: 'process', text: 'محاضرة عن الخليّة' });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  assert.ok(r.j.ok && r.j.lesson.summary && r.j.guest === true);
  assert.equal(r.calls.length, 2);
  assert.ok(r.calls.every((c) => c.host === 'api.anthropic.com'));
  assert.deepEqual(models(r), [HAIKU, HAIKU]);
  assert.deepEqual(r.calls.map((c) => c.max_tokens).sort(), [8000, 9000]);
});

test('٢. كلّ إجراءات الضيف الأخرى على الاقتصاديّ (explain/questions/solve/tutor/grade/docask/docqa/cv/expense)', async () => {
  const cases = {
    explain: { subject: 'رياضيات', lesson: 'المعادلات' },
    questions: { summary: 'ملخّص الدرس' },
    solve: { text: '2x+3=7' },
    tutor: { title: 't', summary: 's', question: 'ما فهمت' },
    grade: { question: 'q', rubric: ['a'], answer: 'x' },
    docask: { docText: 'نصّ', question: 'كم المبلغ؟' },
    docqa: { text: 'عقد إيجار' },
    cv: { info: { name: 'سارة' } },
    expense: { text: 'بنزين 50' },
  };
  let i = 10;
  for (const [action, extra] of Object.entries(cases)) {
    const r = await call('10.0.1.' + (i++), Object.assign({ action }, extra));
    assert.equal(r.code, 200, action + ': ' + JSON.stringify(r.j));
    assert.ok(r.calls.length >= 1, action);
    assert.deepEqual([...new Set(models(r))], [HAIKU], action + ' ← ' + models(r).join(','));
  }
});

test('٣. الطبقة تحدّد النموذج: المجّانيّ اقتصاديّ، Basic والمالك على الافتراضيّ، وEDU_ECON_* تضبط ذلك', async () => {
  const free = addUser('econ-free'), basic = addUser('econ-basic', 'basic'), owner = makeToken('omran');
  assert.deepEqual(models(await call('10.0.2.1', { action: 'process', token: free, text: 'x' })), [HAIKU, HAIKU], 'المجّانيّ');
  assert.deepEqual(models(await call('10.0.2.1', { action: 'process', token: basic, text: 'x' })), [SONNET, SONNET], 'Basic');
  assert.deepEqual(models(await call('10.0.2.1', { action: 'process', token: owner, text: 'x' })), [SONNET, SONNET], 'المالك');
  assert.deepEqual(models(await call('10.0.2.1', { action: 'tutor', token: basic, question: 'q' })), [SONNET], 'Basic في المعلّم');

  process.env.EDU_ECON_TIERS = 'guest';
  try {
    const free2 = addUser('econ-free2');
    assert.deepEqual(models(await call('10.0.2.2', { action: 'process', token: free2, text: 'x' })), [SONNET, SONNET], 'EDU_ECON_TIERS=guest يعيد المجّانيّ للافتراضيّ');
    assert.deepEqual(models(await call('10.0.2.3', { action: 'process', text: 'x' })), [HAIKU, HAIKU], 'والضيف باقٍ اقتصاديًّا');
    process.env.EDU_ECON_TIERS = '';
    assert.deepEqual(models(await call('10.0.2.4', { action: 'process', text: 'x' })), [SONNET, SONNET], 'فارغ = لا طبقة اقتصاديّة');
  } finally { delete process.env.EDU_ECON_TIERS; }

  process.env.EDU_ECON_MODEL = 'claude-haiku-5-5';
  try {
    assert.deepEqual(models(await call('10.0.2.5', { action: 'process', text: 'x' })), ['claude-haiku-5-5', 'claude-haiku-5-5'], 'EDU_ECON_MODEL يبدّل الاقتصاديّ');
  } finally { delete process.env.EDU_ECON_MODEL; }
});

test('٤. لا حالة مشتركة: ضيف ومشترك متزامنان على نسخة واحدة — لكلٍّ نموذجه', async () => {
  const basic = addUser('econ-conc', 'basic');
  const [g, b] = await Promise.all([
    call('10.0.3.1', { action: 'process', text: 'وسم-الضيف' }),
    call('10.0.3.2', { action: 'process', token: basic, text: 'وسم-المشترك' }),
  ]);
  assert.equal(g.code, 200); assert.equal(b.code, 200);
  const of = (tag) => calls.filter((c) => c.raw.includes(tag)).map((c) => c.model);
  assert.deepEqual(of('وسم-الضيف'), [HAIKU, HAIKU]);
  assert.deepEqual(of('وسم-المشترك'), [SONNET, SONNET]);
});

test('٥. عرض المكتب: ٣ تحليلات ضيف من IP واحد ثمّ 402 «سجّل الدخول» بلا نداء، والمسجّلون من الـIP نفسه يمرّون', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await call('10.0.4.1', { action: 'process', text: 'x' })).code, 200);
  const r4 = await call('10.0.4.1', { action: 'process', text: 'x' });
  assert.equal(r4.code, 402);
  assert.match(r4.j.error, /سجّل الدخول/);
  assert.equal(r4.calls.length, 0);
  for (let i = 0; i < 5; i++) {
    const r = await call('10.0.4.1', { action: 'process', token: addUser('office-' + i), text: 'x' });
    assert.equal(r.code, 200, 'المسجّل ' + i);
    assert.deepEqual(models(r), [HAIKU, HAIKU]);
  }
});

test('٦. سقف الضيوف الكلّيّ: يُفحص قبل النداء الثقيل بنصّ الضيف نفسه، ولا يستنزفه طلب فارغ، ولا يمسّ المسجّل والخفيف', async () => {
  process.env.EDU_GUEST_TOTAL_DAILY = '2';
  resetGuestTotal();
  try {
    const empty = await call('10.0.5.9', { action: 'process' });
    assert.equal(empty.code, 400);
    assert.equal(guestTotal(), 0, 'طلب بلا محتوى لا يحرق السقف الكلّيّ');

    assert.equal((await call('10.0.5.1', { action: 'process', text: 'x' })).code, 200);
    assert.equal((await call('10.0.5.2', { action: 'process', text: 'x' })).code, 200);
    assert.equal(guestTotal(), 2);
    const over = await call('10.0.5.3', { action: 'process', text: 'x' });
    assert.equal(over.code, 402);
    assert.equal(over.j.error, 'وصلت للحد اليومي المجاني (3 محاضرات). سجّل الدخول أو عد غدًا 🌙');
    assert.equal(over.calls.length, 0, 'بلا أيّ نداء نموذج');

    const heavy = {
      explain: [{ subject: 'علوم', lesson: 'الضوء' }, /دروس\)\. سجّل الدخول/],
      questions: [{ summary: 'ملخّص' }, /سجّل الدخول/],
      docqa: [{ text: 'عقد' }, /مستندات\)\. سجّل الدخول/],
      expense: [{ text: 'بنزين 50' }, /كشوفات/],
      cv: [{ info: { name: 'سارة' } }, /سير ذاتية/],
      solve: [{ text: '2x=4' }, /لحلّ المسائل/],
    };
    let i = 20;
    for (const [action, [extra, re]] of Object.entries(heavy)) {
      const r = await call('10.0.5.' + (i++), Object.assign({ action }, extra));
      assert.equal(r.code, 402, action);
      assert.match(r.j.error, re, action);
      assert.equal(r.calls.length, 0, action + ': بلا نداء');
    }

    const light = await call('10.0.5.40', { action: 'tutor', question: 'q' });
    assert.equal(light.code, 200, 'المعلّم (خفيف) خارج السقف الكلّيّ');
    const free = await call('10.0.5.3', { action: 'process', token: addUser('after-total'), text: 'x' });
    assert.equal(free.code, 200, 'المسجّل لا يمسّه سقف الضيوف');
    assert.equal((await call('10.0.5.3', { action: 'process', token: makeToken('omran'), text: 'x' })).code, 200, 'المالك');

    failIncr = /^edu:guest-total:/;
    const kvDown = await call('10.0.5.50', { action: 'process', text: 'x' });
    assert.equal(kvDown.code, 200, 'عطب KV لا يقفل الضيف (كبقيّة العدّادات)');
  } finally {
    failIncr = null;
    delete process.env.EDU_GUEST_TOTAL_DAILY;
    resetGuestTotal();
  }
  // الافتراضيّ ٢٠٠: بعد إزالة المتغيّر يعود الضيف يمرّ
  assert.equal((await call('10.0.5.60', { action: 'process', text: 'x' })).code, 200);
});

test('٧. ملفّ ضخم: رفض الاقتصاديّ بـ400 (صفحات PDF/طول) يُعاد مرّة على الافتراضيّ، وغيره لا يُعاد', async () => {
  upstream = (c) => (/haiku/.test(c.model) ? jsonRes(400, { type: 'error', error: { type: 'invalid_request_error', message: 'A maximum of 100 PDF pages may be provided.' } }) : null);
  try {
    const free = addUser('pdf-free');
    const r = await call('10.0.6.1', { action: 'process', token: free, fileBase64: 'JVBERi0=', mime: 'application/pdf' });
    assert.equal(r.code, 200, JSON.stringify(r.j));
    assert.ok(r.j.lesson.summary);
    assert.deepEqual(models(r), [HAIKU, HAIKU, SONNET, SONNET]);

    upstream = (c) => (/haiku/.test(c.model) ? jsonRes(400, { type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long: 230000 tokens > 200000 maximum' } }) : null);
    const ex = await call('10.0.6.2', { action: 'expense', token: free, text: 'كشف طويل' });
    assert.equal(ex.code, 200, JSON.stringify(ex.j));
    assert.deepEqual(models(ex), [HAIKU, SONNET]);

    upstream = (c) => (/haiku/.test(c.model) ? jsonRes(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Image does not match the provided media type' } }) : null);
    const bad = await call('10.0.6.3', { action: 'expense', token: free, text: 'x' });
    assert.equal(bad.code, 502);
    assert.deepEqual(models(bad), [HAIKU], '400 آخر لا يصعد للأغلى');

    upstream = () => jsonRes(400, { type: 'error', error: { type: 'invalid_request_error', message: 'A maximum of 600 PDF pages may be provided.' } });
    const paid = await call('10.0.6.4', { action: 'process', token: addUser('pdf-basic', 'basic'), fileBase64: 'JVBERi0=', mime: 'application/pdf' });
    assert.equal(paid.code, 502);
    assert.deepEqual(models(paid), [SONNET, SONNET], 'الافتراضيّ لا يُعاد على نفسه');
  } finally { upstream = null; }
});

test('٨. احتياط OpenRouter: معرّف الاقتصاديّ بالنقطة، وclaude-sonnet-5 كما هو، ومعرّف التجربة الحيّة المؤرَّخ يُصحَّح', async () => {
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  upstream = (c) => (c.host === 'api.anthropic.com' ? jsonRes(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }) : null);
  try {
    const r = await call('10.0.7.1', { action: 'process', token: addUser('or-free'), text: 'x' });
    assert.equal(r.code, 200, JSON.stringify(r.j));
    const or = r.calls.filter((c) => c.host === 'openrouter.ai');
    assert.equal(or.length, 2);
    assert.deepEqual(or.map((c) => c.model), ['anthropic/claude-haiku-4.5', 'anthropic/claude-haiku-4.5']);

    const p = await call('10.0.7.2', { action: 'process', token: addUser('or-basic', 'basic'), text: 'x' });
    assert.deepEqual(p.calls.filter((c) => c.host === 'openrouter.ai').map((c) => c.model), ['anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5']);

    const lab = await call('10.0.7.3', { action: 'lab', title: 'الضوء', summary: 'ملخّص الضوء' });
    assert.equal(lab.calls.find((c) => c.host === 'openrouter.ai').model, 'anthropic/claude-haiku-4.5');
  } finally { upstream = null; delete process.env.OPENROUTER_API_KEY; }
});

test('٩. عطب قراءة الطبقة: المسجّل يُعامل مجّانيًّا (اقتصاديّ) — لا يُحجب ولا يصل الأغلى', async () => {
  users.set('broken-user', 'THROW');
  const r = await call('10.0.8.1', { action: 'process', token: makeToken('broken-user'), text: 'x' });
  assert.equal(r.code, 200);
  assert.deepEqual(models(r), [HAIKU, HAIKU]);

  // resolveTier نفسها ترمي → احتياط المعالج { tier: 'free' } للمسجّل، والضيف ضيف
  const mod = require.cache[rp('api/_lib/tier.js')];
  const saved = mod.exports;
  mod.exports = Object.assign({}, saved, { resolveTier: async () => { throw new Error('tier down'); } });
  try {
    const u = await call('10.0.8.2', { action: 'process', token: makeToken('tier-down-user'), text: 'x' });
    assert.equal(u.code, 200);
    assert.deepEqual(models(u), [HAIKU, HAIKU]);
    const g = await call('10.0.8.3', { action: 'process', text: 'x' });
    assert.equal(g.code, 200);
    assert.deepEqual(models(g), [HAIKU, HAIKU]);
  } finally { mod.exports = saved; }
});

test('١٠. فحص ثابت: نصوص السقف الكلّيّ مُعادة حرفيًّا بلا اسم مزوّد، والأقفال القديمة باقية', () => {
  const src = fs.readFileSync(rp('api/edu.js'), 'utf8');
  const lines = src.split('\n').filter((l) => l.includes('if (await __guestTotalOver())'));
  assert.equal(lines.length, 8, 'process/explain/questions/lab/cv/expense/docqa/solve');
  const RE = /\b(Claude|Anthropic|OpenAI|GPT|Gemini|Groq|Sonnet|Haiku|Opus)\b|كلود|جيمناي/i;
  for (const l of lines) {
    const lits = (l.match(/'[^']*'/g) || []).filter((s) => /[؀-ۿ]/.test(s));
    assert.ok(lits.length >= 1, l);
    for (const s of lits) {
      assert.ok(!RE.test(s), 'اسم مزوّد في نصّ يراه المستخدم: ' + s);
      assert.ok(src.split(s).length - 1 >= 2, 'نصّ جديد غير مُعاد: ' + s);
    }
  }
  // الخفيفة خارج السقف الكلّيّ
  for (const [a, b] of [["if (action === 'tutor')", "if (action === 'solve')"], ["if (action === 'grade')", "if (action === 'tutor')"], ["if (action === 'docask')", "if (action === 'grade')"]]) {
    assert.ok(!src.slice(src.indexOf(a), src.indexOf(b)).includes('__guestTotalOver'), a);
  }
  // لا قراءة بيئة في نطاق الوحدة للمتغيّرات الجديدة، ولا نموذج مشترك على مستوى الوحدة
  const top = src.slice(0, src.indexOf('module.exports'));
  assert.ok(!/^(const|let|var)\s+\S+\s*=.*process\.env\.(EDU_ECON|EDU_GUEST_TOTAL|EDU_GUEST_LIGHT)/m.test(top));
  assert.ok(!/^let\s+\S*[Mm]odel\S*\s*=\s*(null|'|")/m.test(top.replace('let RESOLVED_MODEL = null;', '')), 'لا متغيّر نموذج على مستوى الوحدة');
  // fashion-locks ㉟/㊳ وmodels-latest ٣
  for (const s of ['v-edu-split', 'await Promise.all([', 'anthropicJSON(apiKey, sysSummary', 'anthropicJSON(apiKey, sysQuestions', '.catch(() => null)', 'quiz = 15 سؤالًا بالضبط', 'anthropicJSON(apiKey, sysQuestions, contentBlocks, 9000)', 'oaLightFetch(']) {
    assert.ok(src.includes(s), s);
  }
});

test('١١. المراجعة: المختبر تحت سقف الضيوف الكلّيّ، و«اسأل المستند» تحت سقف خفيف كلّيّ — تدوير الـIP لا يفتحهما، والمسجّل يمرّ', async () => {
  process.env.EDU_GUEST_TOTAL_DAILY = '1';
  process.env.EDU_GUEST_LIGHT_TOTAL_DAILY = '2';
  resetGuestTotal();
  const lightKey = 'edu:guest-light-total:*:' + new Date().toISOString().slice(0, 10);
  db.delete(lightKey);
  const lab = { action: 'lab', title: 'الضوء', subject: 'علوم', summary: 'ملخّص الدرس' };
  const ask = { action: 'docask', docText: 'نصّ العقد', question: 'ما المدّة؟' };
  try {
    assert.notEqual((await call('10.0.11.1', lab)).code, 402, 'أوّل مختبر ضيف ضمن السقف');
    const over = await call('10.0.11.2', lab);
    assert.equal(over.code, 402, 'IP جديد بعد امتلاء السقف الكلّيّ');
    assert.equal(over.calls.length, 0, 'المختبر بلا نداء');
    const reg = await call('10.0.11.2', Object.assign({ token: addUser('lab-reg') }, lab));
    assert.notEqual(reg.code, 402, 'المسجّل لا يمسّه سقف الضيوف');
    assert.ok(reg.calls.length >= 1);

    assert.equal((await call('10.0.11.10', ask)).code, 200);
    assert.equal((await call('10.0.11.11', ask)).code, 200);
    const askOver = await call('10.0.11.12', ask);
    assert.equal(askOver.code, 402, 'السؤال الثالث من IP ثالث');
    assert.equal(askOver.calls.length, 0, 'السؤال بلا نداء');
    const askReg = await call('10.0.11.12', Object.assign({ token: addUser('ask-reg') }, ask));
    assert.equal(askReg.code, 200, 'المسجّل يسأل');
    assert.equal((await call('10.0.11.13', { action: 'tutor', question: 'q' })).code, 200, 'المعلّم خارج السقف الخفيف');
  } finally {
    delete process.env.EDU_GUEST_TOTAL_DAILY;
    delete process.env.EDU_GUEST_LIGHT_TOTAL_DAILY;
    resetGuestTotal();
    db.delete(lightKey);
  }
});
