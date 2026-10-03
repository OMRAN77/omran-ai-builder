// v-provider-mastery (المالك ٣ أكتوبر: «كلّ مزوّد يوصل مستوى كلاود في التحليل وجيمي في التتبّع… من غير إنفاق»):
// منهج التحليل والتحقّق يصل كلّ مزوّد في الكتلة الثابتة المخزّنة، للمالك ولغيره، ولا يصل دور المجاملة.
// يشغّل api/_lib/chat.js الحقيقيّ بمخزن ذاكرة وfetch مزيّف يلتقط طلب الوسيط.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'mastery-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.OWNER_USERNAMES = 'mastery-owner';
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
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
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

async function ask(provider, user, text, extra) {
  const bodies = [];
  const saveFetch = global.fetch;
  global.fetch = async (url, options) => { bodies.push(JSON.parse(options.body)); return textStream('تمام'); };
  const req = { method: 'POST', headers: {}, body: Object.assign({
    messages: [{ role: 'user', content: text }],
    token: token(user), provider, tz: 'Asia/Dubai',
    customInstructions: 'علّمتك: قارن دائمًا بالسعر قبل المواصفات.',
  }, extra || {}) };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write() {}, end() {} };
  try { await chat(req, res); } finally { global.fetch = saveFetch; }
  const sys = bodies[0].system;
  return { body: bodies[0], sys, sysText: Array.isArray(sys) ? sys.map((b) => b.text).join('') : String(sys || '') };
}

const MARK = '[منهج الإتقان';
const PROVIDERS = ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere', 'openrouter'];

test('١. كلّ مزوّد، للمالك ولغيره: المنهج في الكتلة الثابتة المخزّنة مع الأدوات', async () => {
  for (const prov of PROVIDERS) {
    for (const user of ['mastery-owner', 'someone-else']) {
      const r = await ask(prov, user, 'قارن لي بين أحدث هاتفين من سامسونج وأبل هالشهر');
      const tag = prov + '/' + user;
      assert.ok(r.body.tools.some((t) => t.name === 'fetch_page'), tag + ': fetch_page موصولة للتعمّق');
      assert.ok(Array.isArray(r.sys) && r.sys[0].cache_control && r.sys[0].text.includes(MARK), tag + ': المنهج في الثابت المخزّن');
      assert.match(r.sysText, /افتح أقوى مصدر أو مصدرين بـfetch_page/, tag);
      assert.match(r.sysText, /اختر واحدًا وقل لماذا/, tag);
      assert.ok(r.sysText.indexOf(MARK) < r.sysText.indexOf('علّمتك: قارن دائمًا'), tag + ': تعليمات المستخدم بعده فتغلبه');
    }
  }
});

test('٢. دور المجاملة لغير المالك بلا منهج', async () => {
  const r = await ask('gemini', 'someone-else', 'السلام عليكم');
  assert.ok(!r.sysText.includes(MARK));
});

test('٣. تحليل نصّ طويل (بلا أدوات) يأخذ المنهج أيضًا', async () => {
  const doc = 'حلّل هذا التقرير:\n' + 'المبيعات ارتفعت في الربع الثالث مع انخفاض الهامش بسبب الشحن. '.repeat(15);
  const r = await ask('mistral', 'someone-else', doc);
  assert.equal(r.body.tools, undefined, 'دور الوثيقة بلا أدوات كما كان');
  assert.ok(r.sysText.includes(MARK));
});

test('٤. الخام الاختياريّ للمالك يبقى خامًا', async () => {
  const r = await ask('mistral', 'mastery-owner', 'وش آخر الأخبار؟', { raw: true });
  assert.equal(r.sysText, '');
});
