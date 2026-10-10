// v-city-life: شوارع الخرائط المفتوحة عبر الخادم — مرايا احتياطيّة، رد مختصر، ومخبّأ في الشبكة لا في قاعدة البيانات.
const test = require('node:test');
const assert = require('node:assert');
const osm = require('../api/_lib/osm.js');
const fs = require('node:fs');
const path = require('node:path');

function call(query, fetchImpl) {
  return new Promise((resolve) => {
    const res = { code: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b, headers: this.headers }); } };
    osm({ query }, res, { fetch: fetchImpl });
  });
}
const ok = (obj) => ({ ok: true, status: 200, json: async () => obj });
const way = { type: 'way', tags: { highway: 'residential', oneway: 'yes' }, nodes: [1, 2], geometry: [{ lat: 25.0791234567, lon: 55.1391 }, { lat: 25.0799, lon: 55.1399 }] };

test('المرآة الأولى تفشل ← الثانية تُجرَّب، والرد مختصر ومخبّأ أسبوعًا', async () => {
  const urls = [];
  const r = await call({ lat: '25.07912', lon: '55.13901', r: '700' }, async (u) => { urls.push(u); return urls.length === 1 ? { ok: false, status: 429 } : ok({ elements: [way, { type: 'node' }] }); });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(urls.length, 2);
  assert.deepStrictEqual(r.body.ways[0], { t: 'residential', o: 1, n: [1, 2], p: [[25.079123, 55.1391], [25.0799, 55.1399]] });
  assert.match(r.headers['Cache-Control'], /s-maxage=604800/);
});

test('الإحداثيّات تُقرَّب لثلاث خانات ونصف القطر يُقصّ إلى ٩٠٠', () => {
  const q = osm.query(25.079, 55.139, 900);
  assert.match(q, /around:900,25\.079,55\.139/);
});

test('كلّ المرايا تفشل ← 502 بلا تخبئة', async () => {
  const r = await call({ lat: '25.08', lon: '55.14' }, async () => { throw new Error('down'); });
  assert.strictEqual(r.code, 502);
  assert.strictEqual(r.headers['Cache-Control'], 'no-store');
});

test('إحداثيّات ناقصة ← 400 بلا أيّ نداء', async () => {
  let n = 0;
  const r = await call({}, async () => { n++; return ok({ elements: [] }); });
  assert.strictEqual(r.code, 400);
  assert.strictEqual(n, 0);
});

test('صفحة المدينة: حياة المدينة موصولة، والعدّ التنازليّ بلا إيموجي', () => {
  const h = fs.readFileSync(path.join(__dirname, '../inspire/real3d.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../inspire/real3d-life.js'), 'utf8');
  assert.match(h, /import \{ initLife \} from '\.\/real3d-life\.js\?v=\d+'/);
  assert.match(js, /action=osm&lat=/);
  assert.match(js, /QUARTER = 402\.3/);
  assert.doesNotMatch(js, /[\u{1F300}-\u{1FAFF}]/u);
});
