// v-render-ai: لقطة المدينة ← صورة واقعيّة — للمالك وحده، والسقف (١٥ سنتًا) يُحجز قبل النداء ويُردّ عند الفشل.
const test = require('node:test');
const assert = require('node:assert');
const ra = require('../api/_lib/render-ai.js');
function memKV() { const m = new Map(); return { m,
  async kvIncrBy(k, n) { const v = (Number(m.get(k)) || 0) + n; m.set(k, String(v)); return v; },
  async kvDecrBy(k, n) { const v = (Number(m.get(k)) || 0) - n; m.set(k, String(v)); return v; } }; }
function call(body, deps) { return new Promise((resolve) => { const res = { code: 0, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } }; ra({ method: 'POST', body }, res, deps); }); }
const IMG = 'data:image/jpeg;base64,AAAA';
const owner = async () => ({ allowed: true }), guest = async () => ({ allowed: false, reason: 'forbidden' });
const j = (status, obj) => ({ ok: status < 400, status, json: async () => obj });

test('غير المالك يُرفض بلا نداء', async () => {
  process.env.FAL_KEY = 'x'; let n = 0;
  const r = await call({ token: 't', image: IMG }, { kv: memKV(), ownerGate: guest, fetch: async () => { n++; return j(200, {}); } });
  assert.strictEqual(r.code, 403); assert.strictEqual(n, 0);
});
test('النجاح: صورة إلى صورة بنصّ الطقس، والحجز ٥ سنتات', async () => {
  process.env.FAL_KEY = 'x'; const kv = memKV(); let sent;
  const r = await call({ token: 't', image: IMG, mood: 'night+rain' }, { kv, ownerGate: owner, fetch: async (u, o) => { sent = { u, b: JSON.parse(o.body) }; return j(200, { images: [{ url: 'https://cdn.test/a.jpg' }] }); } });
  assert.strictEqual(r.body.url, 'https://cdn.test/a.jpg');
  assert.strictEqual(sent.u, 'https://fal.run/' + ra.MODEL_DEFAULT);
  assert.strictEqual(sent.b.image_url, IMG);
  assert.match(sent.b.prompt, /at night/); assert.match(sent.b.prompt, /heavy rain/); assert.match(sent.b.prompt, /no logos/);
  assert.strictEqual(Number(kv.m.get('renderai/spent_cents')), 5);
});
test('السقف: الرابع يُرفض بلا نداء', async () => {
  process.env.FAL_KEY = 'x'; delete process.env.RENDER_AI_CAP_CENTS; const kv = memKV(); kv.m.set('renderai/spent_cents', '15'); let n = 0;
  const r = await call({ token: 't', image: IMG }, { kv, ownerGate: owner, fetch: async () => { n++; return j(200, {}); } });
  assert.strictEqual(r.code, 402); assert.strictEqual(n, 0); assert.strictEqual(Number(kv.m.get('renderai/spent_cents')), 15);
});
test('الفشل يردّ الحجز، والصورة غير الصالحة تُرفض قبل كلّ شيء', async () => {
  process.env.FAL_KEY = 'x'; const kv = memKV();
  const r = await call({ token: 't', image: IMG }, { kv, ownerGate: owner, fetch: async () => j(500, {}) });
  assert.strictEqual(r.code, 502); assert.strictEqual(Number(kv.m.get('renderai/spent_cents')), 0);
  const bad = await call({ token: 't', image: 'http://x/y.jpg' }, { kv, ownerGate: owner, fetch: async () => j(200, {}) });
  assert.strictEqual(bad.code, 400);
});
