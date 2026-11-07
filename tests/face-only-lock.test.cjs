// tests/face-only-lock.test.cjs — v-body-bare-head (لقطة المالك ٧ نوفمبر بعد v-body-sport: صورة كاملة بلبس رياضيّ صحيح لكن فوق الجبين
// شريط غترة وعقال فوق شعر — «+»). الجذر: v-trend-hair-lock جعل قفل الوجه يلصق القصّة كلّها (الرأس بشعره وغطائه من الصورة الحقيقيّة)،
// وفي رسم الجسم كاملًا الغترة أُزيلت عمدًا («بدون أي شي فوق راسه»). الخيار faceOnly: أمر التبديل يطلب الوجه وحده بلا غطاء رأس،
// واللصق بيضاويّ الوجه وحده تحت خطّ الشعر — الشعر والرأس من الإطار. وبلا faceOnly اللصق كما هو (الرأس كلّه — الترندات والدمج).
// الوحدة الحقيقيّة بـfetch مزيّف وصور مصنوعة — بلا أيّ نداء مدفوع.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
for (const k of ['TREND_FACE_SWAP', 'FAL_KEY', 'FACE_SWAP_MODEL', 'FACE_SWAP_LORA', 'FACE_SWAP_CAP_CENTS']) delete process.env[k];
process.env.AUTH_SECRET = 'face-only-test-secret';
const FS = require(rp('api/_lib/face-swap.js'));
const FC = require(rp('api/_lib/face-composite.js'));

function png(w, h, c) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) { p.data[i * 4] = c[0]; p.data[i * 4 + 1] = c[1]; p.data[i * 4 + 2] = c[2]; p.data[i * 4 + 3] = 255; }
  return PNG.sync.write(p);
}
const jpg = (w, h, c) => Buffer.from(jpeg.encode({ width: w, height: h, data: Buffer.from(new Array(w * h).fill(c.concat(255)).flat()) }, 90).data);
const W = 1024, H = 1024, GRAY = [128, 128, 128];
const FRAME = png(W, H, GRAY).toString('base64');
const REF = jpg(64, 64, [200, 40, 40]).toString('base64');
const BOX = [300, 400, 500, 600]; // [ymin,xmin,ymax,xmax] ٠–١٠٠٠
const decode = (b64) => FC.decode(Buffer.from(b64, 'base64'));
const px = (img, x, y) => { const i = (y * img.w + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const near = (a, b, t) => a.every((v, i) => Math.abs(v - b[i]) <= t);

function stub() {
  const calls = { flash: 0, fal: [] };
  const f = async (url, init) => {
    const u = String(url);
    if (u.includes('generativelanguage.googleapis.com')) {
      calls.flash++;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: [{ ref: 0, box_2d: BOX, sure: true }], others: [] }) }] } }] }), { status: 200 });
    }
    if (u.startsWith('https://fal.run/')) {
      const body = JSON.parse(init.body);
      calls.fal.push(body);
      return new Response(JSON.stringify({ images: [{ url: 'data:image/png;base64,' + png(body.image_size.width, body.image_size.height, [230, 0, 0]).toString('base64') }] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  return { f, calls };
}
function kv() {
  const m = new Map();
  return { kvIncrBy: async (k, n) => { const v = Number(m.get(k) || 0) + n; m.set(k, v); return v; }, kvDecrBy: async (k, n) => { const v = Number(m.get(k) || 0) - n; m.set(k, v); return v; }, kvExpire: async () => {}, kvGetRaw: async () => '0' };
}
async function run(faceOnly) {
  process.env.FAL_KEY = 'fal-test-key';
  try {
    const s = stub();
    const r = await FS.lockFaces({ b64: FRAME, mime: 'image/png' }, [{ data: REF, mime: 'image/jpeg', face: true }], { apiKey: 'gm', enabled: true, until: Date.now() + 120000, fetchImpl: s.f, kv: kv(), faceOnly });
    return { r, calls: s.calls, img: r.swapped ? decode(r.b64) : null };
  } finally { delete process.env.FAL_KEY; }
}
const fx0 = BOX[1] / 1000 * W, fx1 = BOX[3] / 1000 * W, fy0 = BOX[0] / 1000 * H, fy1 = BOX[2] / 1000 * H, fh = fy1 - fy0;
const cx = Math.round((fx0 + fx1) / 2);

test('١. faceOnly: أمر التبديل يطلب الوجه وحده بلا غطاء رأس، واللصق بيضاويّ الوجه — خطّ الشعر وما فوقه وما حول الوجه من الإطار', async () => {
  const { r, calls, img } = await run(true);
  assert.equal(r.swapped, 1);
  assert.equal(calls.fal.length, 1);
  assert.ok(calls.fal[0].prompt.endsWith(FS.FACE_ONLY), 'نصّ الوجه وحده');
  assert.match(FS.FACE_ONLY, /never copy any hair, ghutra, scarf, agal, cap or other headwear from Picture 2/);
  assert.match(FS.FACE_ONLY, /Both eyes stay fully open and clear, looking at the camera as in Picture 1 — never closed, squinting or half-closed/, 'v-body-eyes-colors');
  assert.ok(near(px(img, cx, Math.round(fy0 + 0.55 * fh)), [230, 0, 0], 40), 'وسط الوجه مبدَّل');
  assert.ok(near(px(img, cx, Math.round(fy0 + 0.04 * fh)), GRAY, 6), 'خطّ الشعر وطرف الغطاء من الإطار');
  assert.ok(near(px(img, cx, Math.round(fy0 - 0.5 * fh)), GRAY, 6), 'الرأس فوق الوجه من الإطار');
  assert.ok(near(px(img, Math.round(fx0 - 0.3 * (fx1 - fx0)), Math.round(fy0 + 0.5 * fh)), GRAY, 6), 'جانب الرأس من الإطار');
});

test('٢. بلا faceOnly (الترندات والدمج): القصّة كلّها كما كانت — الرأس فوق الوجه مبدَّل، والأمر بلا نصّ الوجه وحده', async () => {
  const { r, calls, img } = await run(false);
  assert.equal(r.swapped, 1);
  assert.ok(!calls.fal[0].prompt.includes(FS.FACE_ONLY));
  assert.ok(near(px(img, cx, Math.round(fy0 + 0.04 * fh)), [230, 0, 0], 40), 'خطّ الشعر من القصّة');
  assert.ok(near(px(img, cx, Math.round(fy0 - 0.5 * fh)), [230, 0, 0], 40), 'الرأس من القصّة (v-trend-hair-lock)');
});

test('٣. رسم الجسم كاملًا يطلب faceOnly، والدمج لا يطلبه (الغترة فيه تبقى كما صُوّرت)', () => {
  const src = require('node:fs').readFileSync(path.join(root, 'api/_lib/studio-create.js'), 'utf8');
  assert.match(src, /gate: 'BODY_FACE_SWAP', faceOnly: true/);
  assert.match(src, /enabled: true, only, until: m\.t0 \+ 280000, faceOnly: !!m\.faceOnly \}/);
  const mergeCall = src.slice(src.indexOf("const lockOpts = { photos, crops, counts, userTask"), src.indexOf("const lockOpts = { photos, crops, counts, userTask") + 200);
  assert.ok(mergeCall && !/faceOnly/.test(mergeCall), 'الدمج بلا faceOnly');
});
