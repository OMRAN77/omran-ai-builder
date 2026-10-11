'use strict';
/* v-rating-guard-search (فحص ١١ أكتوبر، أمر المالك «التحذير: يشتغل بس لما يكون فيه بحث فعلي»): حارس v608 كان يقارن أرقام
   التقييم في الردّ بناتج الأدوات — وبلا أداة الناتج فارغ، فكلّ «٣ من ٥» و«٨ من ١٠» وتاريخ «2026/5/10» يُختم بـ«⚠️ أرقام التقييم
   أعلاه لم تظهر في نتائج البحث» ولا بحث أصلًا، ويُحفظ مع الردّ ويُسجَّل خطأَ خادم. الآن: لا تحذير إلّا بعد بحث فعليّ
   (web_search أو fetch_page)، وبعده يبقى كما كان. المعالج الحقيقيّ أمام مزوّد مزيّف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'rating-guard-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
for (const k of ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'CHAT_CLAUDE_MODEL', 'CHAT_IMAGE_MODEL', 'TAVILY_API_KEY', 'BRAVE_API_KEY', 'SERPER_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetJSON: async (key) => db.has(key) ? structuredClone(db.get(key)) : null,
  kvPutJSON: async (key, value) => { db.set(key, structuredClone(value)); },
  kvDel: async (key) => { db.delete(key); },
  kvExpire: async () => {},
} };
require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async () => ({ allowed: true, username: 'omran' }),
} };
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' } };
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
const sse = (chunks) => new Response(chunks.map((c) => 'data: ' + JSON.stringify(c) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const text = (t) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
const searchCall = () => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name: 'web_search', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"مطعم البيك"}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 1 } },
]);

async function run(messages, script) {
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url) => {
    if (!/api\.anthropic\.com\/v1\/messages/.test(String(url))) return new Response('{}', { status: 503 }); // أيّ مزوّد بحث خارجيّ = متعذّر
    const step = script[Math.min(i++, script.length - 1)];
    return step();
  };
  let written = '';
  const req = { method: 'POST', headers: {}, body: { token: token('omran'), provider: 'claude', model: 'claude-sonnet-5', messages } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {}, flush() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return events.filter((e) => e.delta).map((e) => e.delta).join('');
}
const WARN = /أرقام التقييم أعلاه لم تظهر في نتائج البحث/;

test('١. بلا بحث: «٨ من ١٠» و«الخطوة ٣ من ٥» وتاريخ و«rating: 7» بلا تحذير', async () => {
  for (const t of ['التقييم: 8 من 10 للتطبيق الحين', 'الخطوة 3 من 5 خلصت', 'الموعد 2026/5/10', 'rating: 7 overall', 'نجح 12 من 50 اختبار']) {
    const out = await run([{ role: 'user', content: 'قيّم لي الشغل' }], [() => text(t)]);
    assert.ok(out.includes(t.split(' ')[0]), 'الردّ وصل');
    assert.doesNotMatch(out, WARN, t);
  }
});

test('٢. بعد بحث فعليّ: تقييم مخترع لم يظهر في النتائج يبقى محذَّرًا كما كان (v608)', async () => {
  const out = await run([{ role: 'user', content: 'كم تقييم مطعم البيك؟' }], [searchCall, () => text('تقييمه 4.7 من 5 على الخرائط')]);
  assert.match(out, WARN);
});

test('٣. الوحدة كما هي، والبوّابة في الكود: علم البحث من web_search/fetch_page وحدهما', () => {
  const { unsourcedRatings } = chat.__v608;
  assert.deepEqual(unsourcedRatings('تقييمه 4.7 من 5', 'المطعم 4.7 ★'), []);
  assert.deepEqual(unsourcedRatings('تقييمه 4.7 من 5', ''), ['4.7']);
  const s = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');
  assert.ok(s.includes("const badRatings = __searchRan ? unsourcedRatings(fullText, toolCorpus) : [];"));
  assert.ok(s.includes("if (st.cb.name === 'web_search' || st.cb.name === 'fetch_page') __searchRan = true;"));
});
