// v-car3d: توليد السيّارات للمالك وحده، والسقف الماليّ يُحجز في الخادم قبل أيّ نداء مدفوع ويُردّ عند الفشل.
const test = require('node:test');
const assert = require('node:assert');
const car3d = require('../api/_lib/car3d.js');

function memKV() {
  const m = new Map();
  return {
    m,
    async kvGetJSON(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async kvPutJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async kvIncrBy(k, n) { const v = (Number(m.get(k)) || 0) + n; m.set(k, String(v)); return v; },
    async kvDecrBy(k, n) { const v = (Number(m.get(k)) || 0) - n; m.set(k, String(v)); return v; },
  };
}
function call(req, deps) {
  return new Promise((resolve) => {
    const res = { code: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } };
    car3d(req, res, deps);
  });
}
const owner = async () => ({ allowed: true, username: 'omran' });
const guest = async () => ({ allowed: false, reason: 'forbidden' });
const j = (status, obj) => ({ ok: status < 400, status, json: async () => obj });

test('غير المالك يُرفض قبل أيّ نداء مدفوع', async () => {
  process.env.FAL_KEY = 'synthetic';
  let calls = 0;
  const r = await call({ method: 'POST', body: { token: 'x' } }, { kv: memKV(), ownerGate: guest, fetch: async () => { calls++; return j(200, {}); } });
  assert.strictEqual(r.code, 403);
  assert.strictEqual(calls, 0);
});

test('المسار الكامل: صورة ← طابور المجسّم الملوّن، والحجز ٢٥ سنتًا', async () => {
  process.env.FAL_KEY = 'synthetic';
  const kv = memKV(); const seen = [];
  const fetchMock = async (url, o) => {
    seen.push({ url, body: o && o.body && JSON.parse(o.body) });
    if (url.startsWith('https://fal.run/')) return j(200, { images: [{ url: 'https://img.test/car.jpg' }] });
    return j(200, { request_id: 'req-12345678' });
  };
  const r = await call({ method: 'POST', body: { token: 't', desc: 'white sedan' } }, { kv, ownerGate: owner, fetch: fetchMock });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.id, 'req-12345678');
  assert.strictEqual(seen[1].url, 'https://queue.fal.run/' + car3d.MODEL_3D_DEFAULT);
  assert.deepStrictEqual(seen[1].body, { input_image_url: 'https://img.test/car.jpg', textured_mesh: true });
  assert.match(seen[0].body.prompt, /no logos/);
  assert.strictEqual(Number(kv.m.get('car3d/spent_cents')), 25);
});

test('السقف: الطلب الرابع يُرفض (٧٥ سنتًا = ثلاث سيّارات) بلا أيّ نداء', async () => {
  process.env.FAL_KEY = 'synthetic';
  delete process.env.CAR3D_CAP_CENTS;
  const kv = memKV(); kv.m.set('car3d/spent_cents', '75');
  let calls = 0;
  const r = await call({ method: 'POST', body: { token: 't' } }, { kv, ownerGate: owner, fetch: async () => { calls++; return j(200, {}); } });
  assert.strictEqual(r.code, 402);
  assert.strictEqual(calls, 0);
  assert.strictEqual(Number(kv.m.get('car3d/spent_cents')), 75);
});

test('فشل الإرسال يردّ الحجز', async () => {
  process.env.FAL_KEY = 'synthetic';
  const kv = memKV();
  const r = await call({ method: 'POST', body: { token: 't', imageUrl: 'https://img.test/a.jpg' } }, { kv, ownerGate: owner, fetch: async () => j(500, {}) });
  assert.strictEqual(r.code, 502);
  assert.strictEqual(Number(kv.m.get('car3d/spent_cents')), 0);
});

test('الاستطلاع: الاكتمال يضيف السيّارة للقائمة مرّة واحدة', async () => {
  process.env.FAL_KEY = 'synthetic';
  const kv = memKV();
  await kv.kvPutJSON('car3d/req/req-12345678', { s: 'https://q/s', r: 'https://q/r', image: 'https://img.test/a.jpg', desc: 'suv' });
  const fetchMock = async (url) => url === 'https://q/s' ? j(200, { status: 'COMPLETED' }) : j(200, { model_mesh: { url: 'https://cdn.test/car.glb' } });
  const r = await call({ method: 'GET', query: { id: 'req-12345678' } }, { kv, fetch: fetchMock });
  assert.strictEqual(r.body.status, 'SUCCEEDED');
  assert.strictEqual(r.body.car.glb, 'https://cdn.test/car.glb');
  await call({ method: 'GET', query: { id: 'req-12345678' } }, { kv, fetch: fetchMock });
  assert.strictEqual((await kv.kvGetJSON('car3d/list')).length, 1);
});

test('رابط المجسّم أيًّا كان اسم حقله', () => {
  assert.strictEqual(car3d.meshUrlOf({ model_glb: { url: 'u1' } }), 'u1');
  assert.strictEqual(car3d.meshUrlOf({ glb: 'u2' }), 'u2');
  assert.strictEqual(car3d.meshUrlOf({}), '');
});
