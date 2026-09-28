// v-cohere-coach (أمر المالك ٢٧ سبتمبر: «غذّه بمعلومات عامّة وآخر التحديثات والبحث في الويب… كأنّه طفلي
// وأعلّمه ما هو الأفضل»): المالك خام (v-owner-raw2) فكان Cohere يصله بلا نظام أصلًا — بلا تاريخ ولا
// توجيه للبحث ولا تعليماته المخصّصة. الآن Cohere وحده للمالك يحمل ملاحظة التوجيه + تعليماته + التاريخ،
// وبقيّة المزوّدين للمالك خام كما كانوا، وغير المالك بلا تغيير.
//
// يشغّل api/_lib/chat.js الحقيقيّ بمخزن ذاكرة وfetch مزيّف يلتقط طلب الوسيط.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'cohere-coach-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.OWNER_USERNAMES = 'coach-owner';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

const root = path.join(__dirname, '..');
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
  checkAndConsume: async () => ({ allowed: true, username: 'x' }),
} };
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '\n\n[ملفّ-المالك-للفحص]' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
const chat = require(rp('api/_lib/chat.js'));

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
const textStream = (text) => new Response([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
].map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

async function ask(provider, user) {
  const bodies = [];
  const saveFetch = global.fetch;
  global.fetch = async (url, options) => { bodies.push(JSON.parse(options.body)); return textStream('تمام'); };
  const req = { method: 'POST', headers: {}, body: {
    messages: [{ role: 'user', content: 'وش آخر تحديثات الهواتف هالشهر؟' }],
    token: token(user), provider, tz: 'Asia/Dubai',
    customInstructions: 'علّمتك: قارن دائمًا بالسعر قبل المواصفات.',
  } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write() {}, end() {} };
  try { await chat(req, res); } finally { global.fetch = saveFetch; }
  const sys = bodies[0].system;
  return { body: bodies[0], sysText: Array.isArray(sys) ? sys.map((b) => b.text).join('') : String(sys || '') };
}

test('١. المالك على Cohere: توجيه + بحث + تعليماته + ملفّه + التاريخ', async () => {
  const r = await ask('cohere', 'coach-owner');
  assert.equal(r.body.model, 'cohere/command-a');
  assert.ok(r.body.tools.some((t) => t.name === 'web_search'), 'أداة البحث موصولة');
  assert.match(r.sysText, /بيانات تدريبك قديمة/);
  assert.match(r.sysText, /استدعِ web_search أوّلًا/);
  assert.match(r.sysText, /اختر واحدًا وقل لماذا/);
  assert.ok(r.sysText.includes('علّمتك: قارن دائمًا بالسعر قبل المواصفات.'), 'ما علّمه المالك يصل');
  assert.ok(r.sysText.includes('[ملفّ-المالك-للفحص]'), 'ملفّ المالك يصل');
  assert.match(r.sysText, /التاريخ والوقت الآن/);
  assert.ok(!r.sysText.includes('أنت «عمران»'), 'بلا بصمة الشخصيّة العامّة — التوجيه خاصّ بالمالك');
  const sys = r.body.system;
  assert.ok(Array.isArray(sys) && sys.length === 2 && sys[0].cache_control && !/التاريخ والوقت الآن/.test(sys[0].text), 'الثابت مخزّن والتاريخ خارج الكاش');
});

test('٢. المالك على غير Cohere: خام كما كان (v-owner-raw2)', async () => {
  const r = await ask('mistral', 'coach-owner');
  assert.equal(r.sysText, '');
});

test('٣. غير المالك على Cohere: النظام العامّ كما كان بلا توجيه المالك', async () => {
  const r = await ask('cohere', 'someone-else');
  assert.ok(r.sysText.includes('أنت «عمران»'));
  assert.ok(!/بيانات تدريبك قديمة/.test(r.sysText));
});
