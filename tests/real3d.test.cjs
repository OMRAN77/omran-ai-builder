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

test('سياسة الأمان تسمح بجلب blob: — صور المباني مضمّنة في ملفّاتها وتُقرأ بـfetch(blob:)', () => {
  const v = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const csp = v.headers.flatMap((h) => h.headers).find((x) => x.key === 'Content-Security-Policy').value;
  const connect = (csp.match(/connect-src([^;]*)/) || [])[1] || '';
  assert.match(connect, /\bblob:/);
});

test('v-car-drop: زرّ «نزّل سيّارتك» يقرأ سيّارات المختبر، والقيادة بشعاع أرض واصطدام، والمسبار خلف ?debug=1 فقط', () => {
  const h = fs.readFileSync(path.join(root, 'inspire/real3d.html'), 'utf8');
  assert.match(h, /id="dropBtn"/);
  assert.match(h, /action=car3d&list=1/);
  assert.match(h, /function groundAt\(/);
  assert.match(h, /DRV\.speed = 0/); // الاصطدام يوقف السيّارة
  assert.match(h, /if \(window\.__diag && window\.__diag\.on\) window\.__real3d =/);
});

test('v-life-stat-pos (تدقيق ١٨ أكتوبر، g14): حالة الشوارع تحت شريط المدن أيًّا كان عدد صفوفه — لا top:56px ثابت يغطّي أبوظبي والرياض في الجوّال', () => {
  const h = fs.readFileSync(path.join(root, 'inspire/real3d.html'), 'utf8');
  const tag = (h.match(/<div id="lifeStat"[^>]*>/) || [''])[0];
  assert.ok(tag, '#lifeStat موجود');
  assert.doesNotMatch(tag, /top:\s*56px/, 'لا موضع ثابت يفترض صفًّا واحدًا من الأزرار');
  // الموضع من أسفل #bar الحقيقيّ عند الإظهار وعند تغيّر المقاس
  const fn = (h.match(/function placeLifeStat\(\)\s*\{[^\n]*\}/) || [''])[0];
  assert.match(fn, /\$\('bar'\)\.getBoundingClientRect\(\)\.bottom \+ 6/);
  assert.match(fn, /\$\('lifeStat'\)\.style\.top =/);
  assert.match(h, /el\.style\.display = st \? 'block' : 'none'; if \(st\) placeLifeStat\(\);/);
  assert.match(h, /addEventListener\('resize', \(\) => \{[\s\S]{0,300}placeLifeStat\(\)/);
});
