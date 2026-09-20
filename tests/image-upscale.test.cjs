// tests/image-upscale.test.cjs — v-img-upscale (٢٠ سبتمبر ٢٠٢٦): «نانو وGPT مش بذيك الدقّة»: مكبّر دقّة متخصّص
// (Real-ESRGAN عبر Replicate) تلقائيًّا لكلّ ناتج دون 2K، وزرّ «دقّة أعلى» بـ٥ نقاط، وMax على 4K افتراضيًّا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-upscale'; // points.js يرفض الإقلاع بلا سرّ
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const up = require('../api/_lib/upscale.js');

// ترويسة حقيقيّة + حشو كي يتجاوز base64 حدّ المدخل الأدنى (١٠٠ حرفًا) — الأبعاد تُقرأ من الترويسة وحدها.
function png(w, h) { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return Buffer.concat([b, Buffer.alloc(200, 7)]); }
function jpeg(w, h) { const b = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03]); b.writeUInt16BE(h, 25); b.writeUInt16BE(w, 27); return Buffer.concat([b, Buffer.alloc(8)]); }
function webpX(w, h) { const b = Buffer.alloc(30); b.write('RIFF', 0); b.writeUInt32LE(22, 4); b.write('WEBP', 8); b.write('VP8X', 12); b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; }

test('١. imageDims: PNG · JPEG · WebP · GIF من الترويسة، والتالف = null', () => {
  assert.deepEqual(up.imageDims(png(1024, 768)), { w: 1024, h: 768 });
  assert.deepEqual(up.imageDims(jpeg(1536, 1024)), { w: 1536, h: 1024 });
  assert.deepEqual(up.imageDims(webpX(2048, 2048)), { w: 2048, h: 2048 });
  const gif = Buffer.alloc(24); gif.write('GIF89a', 0); gif.writeUInt16LE(640, 6); gif.writeUInt16LE(480, 8);
  assert.deepEqual(up.imageDims(gif), { w: 640, h: 480 });
  assert.equal(up.imageDims(Buffer.from('not an image at all, really not')), null);
  assert.equal(up.imageDims(null), null);
});

test('٢. pickScale: ≤٨٠٠ → ×٤، دون 2K → ×٢، ≥ 2K → لا ترقية', () => {
  assert.equal(up.pickScale(512, 512), 4); assert.equal(up.pickScale(800, 600), 4);
  assert.equal(up.pickScale(1024, 1024), 2); assert.equal(up.pickScale(1536, 1024), 2); assert.equal(up.pickScale(1024, 1536), 2);
  assert.equal(up.pickScale(2048, 1152), 0); assert.equal(up.pickScale(4096, 4096), 0); assert.equal(up.pickScale(0, 0), 0);
});

function mockFetch(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const step = script.shift();
    if (!step) throw new Error('unexpected fetch ' + url);
    if (step.bytes) return new Response(step.bytes, { status: 200, headers: { 'content-type': step.ct || 'image/png' } });
    return new Response(JSON.stringify(step.json), { status: step.status || 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

test('٣. upscaleImage: بلا مفتاح/معطّل/≥2K = لا شيء؛ والصغيرة data URI → تنبّؤ ناجح → جلب الناتج', async () => {
  const small = png(1024, 768).toString('base64');
  assert.deepEqual(await up.upscaleImage(small, 'image/png', { env: {} }), { ok: false, reason: 'no_token' });
  assert.equal((await up.upscaleImage(small, 'image/png', { env: { REPLICATE_API_TOKEN: 'r8', IMAGE_UPSCALE: 'off' } })).reason, 'disabled');
  assert.equal((await up.upscaleImage(png(2048, 2048).toString('base64'), 'image/png', { env: { REPLICATE_API_TOKEN: 'r8' } })).reason, 'already_sharp');
  const out = png(2048, 1536);
  const { calls, fetchImpl } = mockFetch([
    { json: { status: 'succeeded', output: 'https://replicate.delivery/out.png' } },
    { bytes: out },
  ]);
  const r = await up.upscaleImage(small, 'image/png', { env: { REPLICATE_API_TOKEN: 'r8' }, fetchImpl });
  assert.equal(r.ok, true); assert.equal(r.scale, 2); assert.deepEqual([r.w, r.h], [2048, 1536]); assert.equal(r.mime, 'image/png');
  assert.equal(Buffer.from(r.b64, 'base64').length, out.length);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /api\.replicate\.com\/v1\/models\/nightmareai\/real-esrgan\/predictions$/);
  assert.equal(calls[0].init.headers.Prefer, 'wait=60'); assert.equal(calls[0].init.headers.Authorization, 'Bearer r8');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.input.scale, 2); assert.equal(body.input.face_enhance, false); assert.match(body.input.image, /^data:image\/png;base64,/);
  assert.equal(calls[1].url, 'https://replicate.delivery/out.png');
});

test('٤. upscaleImage: الكبيرة تُرفع ملفًّا أوّلًا، وقيد المعالجة يُستطلع حتّى النجاح، والفشل يُعاد سببه', async () => {
  const big = Buffer.concat([png(700, 700), Buffer.alloc(300000, 1)]).toString('base64');
  const { calls, fetchImpl } = mockFetch([
    { json: { urls: { get: 'https://api.replicate.com/v1/files/abc/download?x=1' } }, status: 201 },
    { json: { status: 'processing', urls: { get: 'https://api.replicate.com/v1/predictions/p1' } }, status: 201 },
    { json: { status: 'succeeded', output: ['https://replicate.delivery/big.png'] } },
    { bytes: png(2800, 2800) },
  ]);
  const r = await up.upscaleImage(big, 'image/png', { env: { REPLICATE_API_TOKEN: 'r8' }, fetchImpl });
  assert.equal(r.ok, true); assert.equal(r.scale, 4, '≤ ٨٠٠ → ×٤');
  assert.match(calls[0].url, /\/v1\/files$/); assert.ok(calls[0].init.body instanceof FormData);
  assert.equal(JSON.parse(calls[1].init.body).input.image, 'https://api.replicate.com/v1/files/abc/download?x=1');
  assert.equal(calls[2].url, 'https://api.replicate.com/v1/predictions/p1');
  const bad = mockFetch([{ json: { status: 'failed', error: 'CUDA out of memory' } }]);
  const f = await up.upscaleImage(png(1000, 1000).toString('base64'), 'image/png', { env: { REPLICATE_API_TOKEN: 'r8' }, fetchImpl: bad.fetchImpl });
  assert.deepEqual([f.ok, f.reason], [false, 'predict_error']); assert.match(f.detail, /CUDA/);
  const boom = await up.upscaleImage(png(1000, 1000).toString('base64'), 'image/png', { env: { REPLICATE_API_TOKEN: 'r8' }, fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  assert.deepEqual([boom.ok, boom.reason], [false, 'exception']);
});

test('٥. الإجراء upscale: ٤٠١ بلا جلسة، ٥ نقاط لغير المالك تُردّ عند الفشل، والمالك بلا خصم', async () => {
  const rp = (f) => require.resolve(path.join(root, f));
  const ledger = [];
  require.cache[rp('api/_lib/points.js')] = { id: rp('api/_lib/points.js'), filename: rp('api/_lib/points.js'), loaded: true, exports: {
    COSTS: { image_upscale: 5 },
    verifyPointsToken: (t) => (t === 'tok-sara' ? 'sara' : (t === 'tok-omran' ? 'omran' : null)),
    isOwnerUsername: (u) => u === 'omran',
    spendPoints: async (u, n, why) => { ledger.push(['spend', u, n, why]); return u === 'poor' ? { ok: false, reason: 'insufficient', points: 2 } : { ok: true, points: 95 }; },
    refundPoints: async (u, n) => { ledger.push(['refund', u, n]); },
  } };
  delete require.cache[rp('api/_lib/upscale.js')];
  const mod = require(rp('api/_lib/upscale.js'));
  const call = async (body) => { let code = 0, out = null; const res = { status(c) { code = c; return this; }, json(v) { out = v; }, end() {} }; await mod({ method: 'POST', body }, res); return { code, out }; };
  const b64 = png(1024, 1024).toString('base64');
  assert.equal((await call({ imageBase64: b64, token: 'nope' })).code, 401);
  assert.equal((await call({ imageBase64: 'tiny', token: 'tok-sara' })).code, 400);
  mod.upscaleImage = async () => ({ ok: false, reason: 'no_token' });
  let r = await call({ imageBase64: b64, mime: 'image/png', token: 'tok-sara' });
  assert.equal(r.code, 503); assert.deepEqual(ledger, [['spend', 'sara', 5, 'image_upscale'], ['refund', 'sara', 5]], 'الفشل يردّ الخصم');
  ledger.length = 0;
  mod.upscaleImage = async (b, m, o) => ({ ok: true, b64: 'QUJD', mime: 'image/png', w: 2048, h: 2048, scale: o.scale });
  r = await call({ imageBase64: b64, mime: 'image/png', token: 'tok-sara' });
  assert.equal(r.code, 200); assert.deepEqual(r.out, { imageBase64: 'QUJD', mimeType: 'image/png', width: 2048, height: 2048, scale: 2 });
  assert.deepEqual(ledger, [['spend', 'sara', 5, 'image_upscale']]);
  ledger.length = 0;
  r = await call({ imageBase64: b64, mime: 'image/png', token: 'tok-omran' });
  assert.equal(r.code, 200); assert.deepEqual(ledger, [], 'المالك بلا خصم');
  delete require.cache[rp('api/_lib/points.js')]; delete require.cache[rp('api/_lib/upscale.js')];
});

test('٦. التوصيل: مخرج maha-image يرقّي دون 2K إلّا الخام، وMax على 4K، والمسار والسعر مسجّلان', () => {
  const mi = read('api/_lib/maha-image.js');
  assert.match(mi, /async function sendImg\(b64, mime, engine\) \{\n\s+\/\* v-img-upscale[\s\S]*?if \(!__pureRaw && String\(process\.env\.IMAGE_UPSCALE \|\| ''\)\.toLowerCase\(\) !== 'off'\) \{\n\s+try \{ __up = await require\('\.\/upscale\.js'\)\.upscaleImage\(b64, mime \|\| 'image\/png'\); \}/);
  assert.match(mi, /if \(__up && __up\.ok\) \{ b64 = __up\.b64; mime = __up\.mime; engine = engine \+ '\+up' \+ __up\.scale; \}/);
  assert.ok(mi.indexOf("const cap = (prayerPlan || editImageBase64) ? '' : await imageCaption(") > mi.indexOf("engine = engine + '+up'"), 'الترقية قبل التفسير والإرسال');
  assert.match(mi, /__maxPlan4K = !!\(__tp && __tp\.tier === 'sub' && String\(__tp\.plan \|\| ''\)\.toLowerCase\(\) === 'max'\);/);
  assert.match(mi, /const __want4K = __optWant4K \|\| \/[^\n]*\/i\.test\(intentText \+ ' ' \+ String\(prompt \|\| ''\)\) \|\| __maxPlan4K;/);
  assert.match(mi, /const imageConfig = \{ imageSize: __want4K \? '4K' : '2K' \};/, 'الاختبار القائم في image-intent يبقى صادقًا');
  assert.match(read('api/media.js'), /case 'upscale': return require\('\.\/_lib\/upscale\.js'\);/);
  assert.equal(require('../api/_lib/points.js').COSTS.image_upscale, 5);
  const env = read('api/_lib/env.js');
  for (const k of ['REPLICATE_API_TOKEN', 'IMAGE_UPSCALE', 'UPSCALE_MAX_MS']) { assert.ok(env.includes(k + ':'), 'env.js: ' + k); assert.ok(read('.env.example').includes('# ' + k + '='), '.env.example: ' + k); }
});

test('٧. العميل: زرّا «تعديل» و«دقّة أعلى» فوق الصورة حُذفا نهائيًّا (v-img-buttons-off) — الترقية التلقائية بلا زرّ لم تُمَسّ', () => {
  const a9 = read('js/app-09-attach.js');
  assert.ok(a9.includes('window.__omranImgTools = function(wrap, dataUrl, att){'), 'المرفق يُمرَّر');
  assert.ok(!/mk\(['"]txt['"]/.test(a9), 'لا زرّ نصّي فوق الصورة (تعديل/دقّة أعلى) بعد الحذف');
  assert.ok(!a9.includes("fetch('/api/media?action=upscale'"), 'زرّ الترقية اليدويّة حُذف من العميل');
  assert.ok(!/\bimgUpscale(?:Btn|Fail|NoPoints|Login)\b/.test(a9), 'مفاتيح الترجمة القديمة للزرّ غير مستعملة');
  const files = ['js/app-03-i18n-data.js'].concat(['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'].map((l) => 'i18n/' + l + '.js'));
  for (const f of files) assert.ok(!/imgUpscale/.test(read(f)), f + ': لا أثر لمفاتيح الزرّ المحذوف');
  assert.ok(!read('js/app.bundle.js').includes("t('imgUpscaleBtn')"), 'الحزمة مبنيّة بلا الزرّ المحذوف');
});
