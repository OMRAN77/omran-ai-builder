// tests/studio-bands.test.cjs — v-studio-bands (لقطة المالك ٧ نوفمبر «الصوره مش كامله»: سيلفي مصدَّر من CapCut — صورة طوليّة في وسط
// مربّع وجانباه نسخة مكبّرة مغبّشة منها؛ نتيجة «المكياج» خرجت بالحافّتين المغبّشتين). كاشف «الحشو» studioBandBox يُستخرج من الجزء نفسه
// ويُشغَّل في vm على صور اصطناعيّة: الحشو المغبّش والأسود يُقصّان، والصور العاديّة (شخص على خلفيّة ناعمة، كتفان على الحافّة، صورة
// كاملة التفاصيل، حافّة واحدة، وسط ضيّق) لا تُمسّ. ورفع المستخدم وحده يطلب القصّ — لا خطوات السلسلة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-13-stocks-init.js'), 'utf8');
function extract(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  let depth = 0, j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (!depth) return SRC.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}
const ctx = vm.createContext({});
vm.runInContext(extract('studioBandBox') + '\nthis.studioBandBox = studioBandBox;', ctx);
const box = (g, w, h) => ctx.studioBandBox(g, w, h);

/* مولّد عشوائيّ ثابت */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
/* «صورة» بتفاصيل: ضجيج + خطوط + بقع (كصورة حقيقيّة بعد التصغير) */
function photo(w, h, seed) {
  const r = rng(seed), g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const base = 110 + 60 * Math.sin(x * 0.21 + y * 0.07) * Math.cos(y * 0.13);
    g[y * w + x] = Math.max(0, Math.min(255, base + (r() - 0.5) * 70));
  }
  return g;
}
/* حشو ناعم: إضاءة تتغيّر ببطء (نسخة مكبّرة مغبّشة) مع ضجيج ضغط ±١ */
function smooth(w, h, seed, x0, y0) {
  const r = rng(seed), g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 90 + 50 * Math.sin((x + x0) * 0.025) + 30 * Math.cos((y + y0) * 0.02) + (r() - 0.5) * 2;
  return g;
}
/* صورة pw×ph في وسط لوحة W×H وحولها الحشو */
function framed(W, H, pw, ph, fill) {
  const g = fill, p = photo(pw, ph, 7), ox = Math.round((W - pw) / 2), oy = Math.round((H - ph) / 2);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) g[(y + oy) * W + (x + ox)] = p[y * pw + x];
  return { g, ox, oy };
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('١. صورة طوليّة ٩:١٦ في وسط مربّع بحشو مغبّش (CapCut) ← قصّ إلى الصورة نفسها بدقّة بكسلين', () => {
  const W = 240, H = 240, pw = 135, ph = 240;
  const { g, ox } = framed(W, H, pw, ph, smooth(W, H, 3, 0, 0));
  const b = box(g, W, H);
  assert.ok(b, 'كُشف الحشو');
  assert.ok(near(b.x0 * W, ox, 2) && near(b.x1 * W, ox + pw, 2), JSON.stringify(b));
  assert.equal(b.y0, 0); assert.equal(b.y1, 1);
});

test('٢. حشو أسود (letterbox) يمينًا ويسارًا، وحشو مغبّش فوق وتحت (صورة عرضيّة في لوحة طوليّة) ← قصّ', () => {
  const W = 240, H = 240, pw = 150, ph = 240;
  const { g, ox } = framed(W, H, pw, ph, new Float32Array(W * H));
  const b = box(g, W, H);
  assert.ok(b && near(b.x0 * W, ox, 2) && near(b.x1 * W, ox + pw, 2), JSON.stringify(b));
  const W2 = 135, H2 = 240, pw2 = 135, ph2 = 90;
  const t = framed(W2, H2, pw2, ph2, smooth(W2, H2, 5, 0, 0));
  const b2 = box(t.g, W2, H2);
  assert.ok(b2 && near(b2.y0 * H2, t.oy, 2) && near(b2.y1 * H2, t.oy + ph2, 2), JSON.stringify(b2));
  assert.equal(b2.x0, 0); assert.equal(b2.x1, 1);
});

/* شخص على خلفيّة ناعمة: رأس بيضاويّ، كتفان، ذراعان، ساقان — حدّه يتغيّر من صفّ إلى صفّ */
function person(W, H, opts) {
  const o = opts || {}, g = smooth(W, H, 11, 0, 0), p = photo(W, H, 13);
  const inside = (x, y) => {
    const cx = W / 2;
    const head = ((x - cx) / (W * 0.11)) ** 2 + ((y - H * 0.16) / (H * 0.08)) ** 2 <= 1;
    const t = (y - H * 0.25) / (H * 0.75);
    const torsoHalf = o.shouldersToEdge ? (W * 0.18 + t * W * 0.6) : W * (o.armsStraight ? 0.22 : 0.17 + 0.1 * Math.max(0, Math.min(1, t * 2)));
    const torso = y >= H * 0.25 && y <= H * (o.armsStraight ? 0.62 : 0.6) && Math.abs(x - cx) <= torsoHalf;
    const legs = y > H * 0.6 && y < H * 0.97 && Math.abs(x - cx) <= W * 0.1;
    return head || torso || legs;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) g[y * W + x] = p[y * W + x];
  return g;
}

test('٣. صور عاديّة لا تُمسّ: شخص كامل على خلفيّة ناعمة، وذراعان مستقيمتان، وكتفان يبلغان الحافّة، وصورة مليئة بالتفاصيل', () => {
  const W = 160, H = 240;
  assert.equal(box(person(W, H), W, H), null, 'شخص كامل على خلفيّة ناعمة');
  assert.equal(box(person(W, H, { armsStraight: true }), W, H), null, 'ذراعان مستقيمتان على الجانبين (أقلّ من نصف الطول)');
  assert.equal(box(person(W, H, { shouldersToEdge: true }), W, H), null, 'رأس وكتفان يبلغان حافّة الصورة');
  assert.equal(box(photo(200, 240, 21), 200, 240), null, 'صورة كاملة التفاصيل');
});

test('٤. لا قصّ: حشو على جانب واحد، أو جانبان غير متناظرين، أو وسط أضيق من ٣٠٪، أو حشو أضيق من ٦٪', () => {
  const W = 240, H = 240;
  const one = smooth(W, H, 3, 0, 0), p = photo(170, 240, 9);
  for (let y = 0; y < H; y++) for (let x = 0; x < 170; x++) one[y * W + (x + 70)] = p[y * 170 + x];
  assert.equal(box(one, W, H), null, 'جانب واحد');
  const asym = smooth(W, H, 3, 0, 0), q = photo(120, 240, 9);
  for (let y = 0; y < H; y++) for (let x = 0; x < 120; x++) asym[y * W + (x + 30)] = q[y * 120 + x];
  assert.equal(box(asym, W, H), null, 'غير متناظرين');
  assert.equal(box(framed(W, H, 60, 240, smooth(W, H, 3, 0, 0)).g, W, H), null, 'وسط ٢٥٪');
  assert.equal(box(framed(W, H, 222, 240, smooth(W, H, 3, 0, 0)).g, W, H), null, 'حافّتا ٤٪');
});

test('٥. رفع المستخدم وحده يطلب القصّ (studioSetPhoto)؛ خطوة السلسلة تُطبَّع كما كانت، والقصّ قبل نسبة القناع ومن موضعه', () => {
  assert.match(SRC, /normalizeStudioPhoto\(file, \{ trimBands: true \}\)\.then\(\(r\) => \{ \/\* v-studio-bands/);
  assert.match(SRC, /const n = await normalizeStudioPhoto\(new File\(\[blob\], 'step\.png', \{ type: last\.mime \}\)\);/, 'السلسلة بلا trimBands');
  assert.match(SRC, /const sx = bx \+ Math\.round\(\(iw - sw\) \/ 2\), sy = by \+ Math\.round\(\(ih - sh\) \/ 2\);/, 'القصّ إلى النسبة داخل الصورة المقصوصة');
  assert.match(SRC, /\}catch\(e\)\{ __swallow\(e, 'studio:bands'\); \}/, 'تعذّر الكشف = الصورة كما هي');
});
