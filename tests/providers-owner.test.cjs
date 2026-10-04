// tests/providers-owner.test.cjs — v-providers-owner (أمر المالك ٤ أكتوبر «رجّع المزوّدين إلى المالك فقط»، بعد فحص #795):
// منتقي المزوّد كان يظهر للمالك وVIP ومشترك Max، والخادم يطبّق اختيارهم المحفوظ. صار للمالك وحده — وإخفاؤه وحده كان
// سيُبقي اختيارًا قديمًا ساريًا بلا طريق لتغييره، فالخادم يتجاهله: Max بجدول باقته، وVIP بافتراضيّ التطبيق (GPT).
// على معالج المحادثة الحقيقيّ بلا شبكة: ما يصل المزوّد فعلًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'providers-owner-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const users = new Map();
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null),
  kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {},
  kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1, kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
const realAuth = require(rp('api/_lib/auth.js'));
stub('api/_lib/auth.js', Object.assign({}, realAuth, { getUser: async (u) => users.get(u) || null }));
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async (tok, g, bucket, ip, o) => ({ allowed: true, username: 'x', tier: o && o.tier && o.tier.tier, subscriber: !!(o && o.tier && o.tier.subscriber) }),
});
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
const textStream = (text) => new Response([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
].map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

async function ask(user, provider) {
  const bodies = [];
  const save = global.fetch;
  global.fetch = async (url, init) => { bodies.push({ url: String(url), body: JSON.parse(init.body) }); return textStream('هلا'); };
  const req = { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'هلا كيف الحال' }], token: token(user), provider } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write() {}, end() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  return bodies;
}

test('١. VIP اختياره القديم المحفوظ (DeepSeek) لا يسري — افتراضيّ التطبيق GPT', async () => {
  const b = await ask('vipuser', 'deepseek');
  assert.ok(b.length >= 1, 'وصل المزوّد');
  assert.match(b[0].url, /openrouter\.ai/);
  assert.match(b[0].body.model, /^openai\//, 'GPT لا DeepSeek: ' + b[0].body.model);
});

test('٢. مشترك Max: الدردشة بجدول باقته (Haiku) لا باختياره المحفوظ', async () => {
  users.set('maxuser', { username: 'maxuser', plan: 'max', planUpdatedAt: Date.now() - 86400000 });
  const b = await ask('maxuser', 'deepseek');
  assert.ok(b.length >= 1);
  assert.match(b[0].body.model, /claude-haiku-4[.-]5/, 'Haiku لا DeepSeek: ' + b[0].body.model);
});

test('٣. العميل: المنتقي يُفتح للمالك وحده — VIP وMax وبقيّة الباقات مقفولون', () => {
  const a5 = fs.readFileSync(path.join(root, 'js/app-05-ui.js'), 'utf8');
  const i = a5.indexOf('function applyPlanGate(d){');
  const j = a5.indexOf('window.applyPlanGate = applyPlanGate;', i);
  const cls = new Set();
  const ctx = { window: {}, document: { documentElement: { classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } } } }, __swallow: () => {} };
  vm.runInNewContext(a5.slice(i, j), ctx);
  const locked = (d) => { ctx.applyPlanGate(d); return cls.has('plan-locked'); };
  assert.equal(locked({ tier: 'owner' }), false);
  for (const d of [{ tier: 'vip' }, { tier: 'sub', plan: 'max' }, { tier: 'sub', plan: 'pro' }, { tier: 'sub', plan: 'basic' }, { tier: 'free' }, { authed: false }]) {
    assert.equal(locked(d), true, JSON.stringify(d));
  }
});
