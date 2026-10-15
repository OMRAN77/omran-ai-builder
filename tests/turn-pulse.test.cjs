// tests/turn-pulse.test.cjs — v-turn-pulse (لقطة المالك ١٢ أكتوبر: «⚠️ ما قدرت أردّ الحين — ما وصل شي من الخادم» بعد ردّ طويل بأدوات):
// النبض كان لبثّ المزوّد وحده؛ بين خطوتين (تنفيذ أدوات الخادم ثمّ انتظار ترويسة النداء التالي) يصمت الخادم وهو يعمل فيستسلم حارس
// العميل (٩٠ ث). الآن نبض للدور كلّه مقيّد بميزانيّته وبحياة المجرى. المعالج الحقيقيّ أمام موديل مزيّف يطلب web_search وبحث مزيّف بطيء.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'turn-pulse-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.TAVILY_API_KEY = 'test-tavily';
process.env.CHAT_KA_MS = '15';
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'PERPLEXITY_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX', 'GOOGLE_PLACES_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {} });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: 'sub-user' }), checkAndConsumeCustom: async () => ({ allowed: true, username: 'sub-user', remaining: 9 }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });
const chat = require(rp('api/_lib/chat.js'));

function token(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); }
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const toolTurn = (q) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name: 'web_search', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ query: q }) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 1 } },
]);
const textTurn = (t) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kaCount = (s) => (s.match(/: ka\n\n/g) || []).length;

async function run(question, o) {
  const saved = global.fetch;
  let turn = 0; const log = { model: 0, during: null };
  let written = '';
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/openrouter\.ai/.test(u)) { log.model++; if (turn++ === 0 && !o.noTool) return toolTurn('x'); await sleep(o.modelDelay || 0); return textTurn('تم'); }
    if (/api\.tavily\.com/.test(u)) {
      const before = kaCount(written); await sleep(o.toolDelay || 0); log.during = { before, after: kaCount(written) };
      return new Response(JSON.stringify({ results: [{ url: 'https://example.com/a', title: 'A', content: 'c' }] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const res = { writableEnded: false, setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write(c) { if (this.writableEnded) throw new Error('write after end'); written += String(c || ''); }, end() { this.writableEnded = true; }, flushHeaders() {} };
  const req = { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: question }], token: token(o.user || 'sub-user'), provider: 'deepseek' } };
  try { await chat(req, res); } finally { global.fetch = saved; }
  const atEnd = kaCount(written); await sleep(60);
  return { written, log, atEnd, afterEnd: kaCount(written), ended: res.writableEnded };
}

test('١. دور بأدوات: النبض يصل أثناء تنفيذ أداة الخادم (كان صمتًا)، ويتوقّف مع نهاية الردّ', async () => {
  const r = await run('كم دقة قلب النملة؟', { toolDelay: 120, modelDelay: 60 });
  assert.equal(r.log.model, 2);
  assert.ok(r.log.during && r.log.during.after > r.log.during.before, 'نبضات أثناء البحث: ' + JSON.stringify(r.log.during));
  assert.match(r.written, /"delta":"تم"/);
  assert.ok(r.ended, 'المجرى أُغلق');
  assert.equal(r.afterEnd, r.atEnd, 'لا نبض بعد النهاية');
});

test('٢. الكود: النبض مقيّد بميزانيّة الدور وبحياة المجرى (درس #527)، ويُلغى عند done وبإغلاق المجرى', () => {
  const s = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');
  // v-turn-close: الحدّ صار owner-loop.pulse — غير المالك MAX_MS كما كان، والمالك حتّى FN_BUDGET_MS، وأداة بعد CLOSE_AT_MS = سطر «كمل» والنبض حتّى PULSE_MAX_MS (turn-close.test)
  assert.ok(s.includes("const __turnKa = (toolTurn || __ownerReq) ? setInterval(() => { const __pw = (res.writableEnded || __cut.gone) ? 'end' : __ol.pulse(__olS, { t0, MAX_MS }); if (__pw === 'end') { clearInterval(__turnKa); return; } if (__pw === 'close') __turnClose();"));
  assert.ok(s.includes('__turnKaStop(); send({ done: true });'));
  assert.ok(!s.includes('__turnKaStop(); } catch'), 'لا إيقاف في catch (خارج نطاق التعريف) — writableEnded بعد res.end يكفي');
  assert.ok(s.includes('let kaTimer = (!toolTurn || __longUserMsg || lastUserHasImage || __ownerReq) ? setInterval('), 'نبض البثّ كما هو');
});
