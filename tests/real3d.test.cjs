// v-real3d: مفتاح المباني الحقيقيّة يُقرأ داخل المعالج، ويُخدم عبر موجّه system، ولا يُكتب في صفحة الإثبات.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function call(handler) {
  return new Promise((resolve) => {
    const res = { headers: {}, code: 0, setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b, headers: this.headers }); } };
    handler({ query: {} }, res);
  });
}

test('بلا مفتاح: 503 no-key ولا يُخزَّن', async () => {
  delete process.env.GOOGLE_MAPS_KEY;
  const r = await call(require('../api/_lib/maps-key.js'));
  assert.strictEqual(r.code, 503);
  assert.strictEqual(r.body.error, 'no-key');
  assert.strictEqual(r.headers['Cache-Control'], 'no-store');
});

test('بمفتاح: يُقرأ وقت الطلب لا وقت التحميل', async () => {
  const h = require('../api/_lib/maps-key.js');
  process.env.GOOGLE_MAPS_KEY = '  synthetic-maps-key  ';
  const r = await call(h);
  delete process.env.GOOGLE_MAPS_KEY;
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.key, 'synthetic-maps-key');
});

test('موجّه system يوزّع maps-key', () => {
  const s = fs.readFileSync(path.join(root, 'api/system.js'), 'utf8');
  assert.match(s, /case 'maps-key': return require\('\.\/_lib\/maps-key\.js'\)/);
});

test('صفحة الإثبات: المفتاح من الخادم، لا مفتاح مكتوب، ونسبة Google ظاهرة', () => {
  const h = fs.readFileSync(path.join(root, 'inspire/real3d.html'), 'utf8');
  assert.match(h, /\/api\/system\?action=maps-key/);
  assert.doesNotMatch(h, /AIza[0-9A-Za-z_-]{20,}/);
  assert.match(h, /id="credit"/);
  assert.match(h, /'Google'/);
  // إصدارات مثبّتة لا «أحدث»
  assert.match(h, /three@0\.180\.0/);
  assert.match(h, /3d-tiles-renderer@0\.5\.2/);
});
