'use strict';
/* مراجعة إعادة بناء «الكتابة على الصورة» (الراسم والمستهلكون): الراسم الحقيقيّ overlayTextOnImage يُشغَّل هنا في vm فوق لوحة
   مزيّفة تسجّل ما يُرسم (التعبئة والحافّة والوشاح)، ومسار «إنشاء صورة» من «+» (omModeGenerateImage) بمحلّل حقيقيّ ومولّد مزيّف.
   - v-text-size: «كبّر/صغّر» تغيّر الخطّ فعلًا في كلّ دور (العبارة والأسطر والملصق) ولا تنقل الكتابة.
   - v-text-ink: قطبيّة لون المستخدم بالنصوع النسبيّ لا بإضاءة HSL؛ لا وشاح أسود فوق الخلفيّة الفاتحة؛ «بالأصفر» يُطبع أصفر.
   - v-text-mode: الطبقة تحفظ الموضع الذي رُسمت عنده، والنصّ المنصَّص يمرّ على الإملاء الثابت (الاسترجاع برسم المصحف).
   - v-text-flex: إعادة التنسيق تحترم علَم المرونة من المحلّل، وإن غاب فالجانب بلا «وسط» مرن. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('../js/app-08-image-text.js');
const attach = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const slice = (from, to) => { const a = attach.indexOf(from), b = attach.indexOf(to, a); assert.ok(a > 0 && b > a, 'مقطع: ' + from); return attach.slice(a, b); };
const fnSrc = (head) => { const a = attach.indexOf(head); assert.ok(a > 0, head); let d = 0; for (let i = attach.indexOf('{', a); i < attach.length; i++) { if (attach[i] === '{') d++; else if (attach[i] === '}' && !--d) return attach.slice(a, i + 1); } throw new Error(head); };

/* ── لوحة مزيّفة: خلفيّة بنمط (ثابت أو شطرنج لنسيج مزدحم)، وقياس تقريبيّ ٠٫٤٥ من الخطّ لكلّ حرف ── */
function makeEnv(bg) {
  const log = [];
  const pixel = (x, y) => (typeof bg === 'function' ? bg(x, y) : bg);
  const makeCtx = () => {
    const st = { font: '10px x', fillStyle: '#000', strokeStyle: '#000', shadowColor: 'rgba(0,0,0,0)', globalCompositeOperation: 'source-over', lineWidth: 1 }, stack = [];
    const px = () => { const m = /(\d+(?:\.\d+)?)px/.exec(st.font); return m ? +m[1] : 10; };
    const c = {
      save() { stack.push(Object.assign({}, st)); }, restore() { Object.assign(st, stack.pop() || {}); },
      drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, closePath() {}, stroke() {},
      measureText(s) { const p = px(); return { width: 0.45 * String(s).length * p, actualBoundingBoxAscent: 0.8 * p, actualBoundingBoxDescent: 0.25 * p }; },
      createLinearGradient() { const g = { stops: [], addColorStop(o, col) { g.stops.push(col); } }; return g; },
      fillText(t) { log.push({ op: 'fillText', t, fill: st.fillStyle, shadow: st.shadowColor, px: px() }); },
      strokeText(t) { log.push({ op: 'strokeText', t, stroke: st.strokeStyle, shadow: st.shadowColor }); },
      fill() { log.push({ op: 'fill', shadow: st.shadowColor, gco: st.globalCompositeOperation }); },
      fillRect() { log.push({ op: 'fillRect' }); },
      getImageData(x, y, w, h) { const d = new Uint8ClampedArray(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const p = pixel(i, j), o = (j * w + i) * 4; d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = 255; } return { data: d }; },
    };
    for (const k of Object.keys(st)) Object.defineProperty(c, k, { get: () => st[k], set: (v) => { st[k] = v; }, enumerable: true });
    return c;
  };
  class FakeImage { constructor() { this.naturalWidth = 1000; this.naturalHeight = 1000; } set src(v) { this._src = v; setImmediate(() => this.onload && this.onload()); } get src() { return this._src; } }
  const sandbox = {
    Image: FakeImage, setTimeout, setImmediate, Promise, console,
    document: {
      createElement: () => { const ctx = makeCtx(); return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,T1VU' }; },
      getElementById: () => ({}), head: { appendChild() {} },
      fonts: { check: () => true, load: async () => [], ready: Promise.resolve() },
    },
    __swallow: () => {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(slice('const MAHA_FONTS = {', '\n/* v-edit-shrink') + ';this.overlay=overlayTextOnImage;this.ink=__textInk;this.stylePos=__textStylePos;', sandbox);
  return { sb: sandbox, log };
}
const LIGHT = [238, 232, 222], DARK = [22, 24, 40];
const LIGHT_BUSY = (x, y) => ((x + y) % 2 ? [248, 246, 240] : [150, 150, 146]); /* جدار فاتح بنسيج (sd≈0.18، إضاءة ≈٠٫٧٧) كصورة المالك */
async function draw(bg, text, color, pos, scale) {
  const env = makeEnv(bg);
  await env.sb.overlay('QUJD', 'image/png', text, 'default', color, pos, scale);
  return { log: env.log, info: plain(env.sb.__lastTextDesign) };
}
const feathers = (log) => log.filter((e) => e.op === 'fill' && e.gco === 'source-over').map((e) => e.shadow);
const blackFeather = (log) => feathers(log).some((c) => /^rgba\(0,0,0,/.test(c));
const hue = (s) => { const m = /^hsla?\((\d+),(\d+)%,(\d+)%/.exec(String(s)); return m ? [+m[1], +m[2], +m[3]] : null; };

test('v-text-ink: exact user colours are classed light/dark by relative luminance, not HSL lightness', () => {
  const { sb } = makeEnv(LIGHT);
  const k = (hex, lum, dark) => plain(sb.ink(hex, lum, dark));
  /* الأحمر والأزرق والبنفسجيّ والورديّ «فاتحة» في HSL (L>0.5) ونصوعها ٠٫١٦–٠٫٢٩ */
  for (const hex of ['#d32f2f', '#2979ff', '#a05ad6', '#ff4f9a', '#2e8b57', '#8e1b3a', '#111111', '#1c2f66']) assert.equal(k(hex, 0.8, false).lightInk, false, hex + ' حبر داكن');
  for (const hex of ['#fdfdfd', '#ffd400', '#5ec8ff', '#d7dbe0', '#ead9bd', '#ffb3d1']) assert.equal(k(hex, 0.8, false).lightInk, true, hex + ' حبر فاتح');
  /* فوق جدار فاتح: الأحمر والأزرق والبنفسجيّ مقروءة بلا حافّة ولا وشاح داكن؛ الوشاح أبيض */
  for (const hex of ['#d32f2f', '#2979ff', '#a05ad6']) { const r = k(hex, 0.8, false); assert.deepEqual([r.lowC, r.haloDark, r.scrimDark], [false, false, false], hex); }
  /* ورديّ/برتقاليّ/رماديّ على فاتح: تباين < ٢٫٢ ← حافّة داكنة (لا وشاح داكن) */
  for (const hex of ['#ff4f9a', '#ff8a1f', '#9aa0a6']) { const r = k(hex, 0.8, false); assert.ok(r.cr < 2.2, hex + ' ' + r.cr); assert.deepEqual([r.lowC, r.haloDark, r.scrimDark], [true, true, false], hex); }
  /* فاتح على فاتح: حافّة داكنة ووشاح أبيض — كان وشاحًا أسود («الدخان») */
  for (const hex of ['#fdfdfd', '#ffd400']) assert.deepEqual([k(hex, 0.85, false).lowC, k(hex, 0.85, false).haloDark, k(hex, 0.85, false).scrimDark], [true, true, false], hex);
  /* فوق الداكن: الداكن حافّة فاتحة، والفاتح (الأصفر والأبيض) حبر فاتح بلا تباين ضعيف */
  for (const hex of ['#d32f2f', '#2979ff', '#1c2f66']) assert.deepEqual([k(hex, 0.15, true).lowC, k(hex, 0.15, true).haloDark, k(hex, 0.15, true).scrimDark], [true, false, true], hex);
  for (const hex of ['#fdfdfd', '#ffd400']) assert.deepEqual([k(hex, 0.15, true).lowC, k(hex, 0.15, true).haloDark], [false, true], hex);
});

test('v-text-ink: red/blue/purple/pink on a light textured photo get no black (smoky) scrim; lowC never draws a black feather on a light background', async () => {
  for (const [hex, name] of [['#d32f2f', 'أحمر'], ['#2979ff', 'أزرق'], ['#a05ad6', 'بنفسجيّ'], ['#ff4f9a', 'ورديّ'], ['#fdfdfd', 'أبيض'], ['#ffd400', 'أصفر'], ['#9aa0a6', 'رماديّ']]) {
    const r = await draw(LIGHT_BUSY, 'مشكور اخوي', hex, 'top', 1);
    assert.ok(r.info.lum >= 0.7 && r.info.sd > 0.14, 'خلفيّة فاتحة مزدحمة: ' + JSON.stringify([r.info.lum, r.info.sd]));
    assert.ok(feathers(r.log).length >= 1, name + ' — الوشاح يهدّئ النسيج');
    assert.equal(blackFeather(r.log), false, name + ' — لا وشاح أسود فوق الجدار الفاتح: ' + feathers(r.log).join(' | '));
  }
  /* الأحمر فوق الفاتح: لا حافّة (التباين كافٍ)؛ الورديّ: حافّة داكنة حول الحروف */
  const red = await draw(LIGHT_BUSY, 'مشكور اخوي', '#d32f2f', 'top', 1);
  assert.equal(red.log.filter((e) => e.op === 'strokeText').length, 0, 'الأحمر بلا حافّة');
  const pink = await draw(LIGHT_BUSY, 'مشكور اخوي', '#ff4f9a', 'top', 1);
  const ps = pink.log.filter((e) => e.op === 'strokeText');
  assert.ok(ps.length && ps.every((e) => /^rgba\(20,14,8,/.test(e.stroke)), 'الورديّ بحافّة داكنة: ' + ps.map((e) => e.stroke).join(','));
  /* الداكن فوق الداكن: حافّة فاتحة، والوشاح (إن رُسم) أسود لا ضباب أبيض */
  const navy = await draw(DARK, 'مشكور اخوي', '#1c2f66', 'top', 1);
  const ns = navy.log.filter((e) => e.op === 'strokeText');
  assert.ok(ns.length && ns.every((e) => /^rgba\(255,255,255,/.test(e.stroke)), 'الكحليّ على الداكن بحافّة فاتحة');
  assert.ok(feathers(navy.log).every((c) => /^rgba\(0,0,0,/.test(c)), 'لا ضباب أبيض فوق الداكن');
});

test('v-text-ink: «بالأصفر» (#ffd400) prints yellow on light and dark photos — the gold gradient is for #f4cf65 only', async () => {
  assert.equal(parser.parseImageTextSpec('اكتب مشكور اخوي بالأصفر').color, '#ffd400');
  for (const bg of [LIGHT, LIGHT_BUSY, DARK]) {
    const short = await draw(bg, 'مشكور اخوي', '#ffd400', 'top', 1);
    const f = short.log.filter((e) => e.op === 'fillText' && e.t === 'مشكور اخوي');
    assert.equal(f.length, 1);
    const stops = (f[0].fill && f[0].fill.stops) || [];
    assert.ok(stops.length === 5 && stops.every((s) => { const h = hue(s); return h && h[0] === 50 && h[1] === 100; }), 'تدرّج أصفر (hsl 50,100%) لا برونز/ذهب: ' + stops.join(' '));
    const long = await draw(bg, 'اللهم اجعل هذا اليوم بداية خير وبركة لنا ولأهلنا ولكل من نحب', '#ffd400', 'top', 1);
    const body = long.log.filter((e) => e.op === 'fillText');
    assert.ok(body.length >= 2 && body.every((e) => e.fill === 'hsl(50,100%,50%)'), 'الأسطر صفراء لا كريميّة/سوداء: ' + body.map((e) => e.fill).join(','));
  }
  const gold = await draw(LIGHT, 'مشكور اخوي', '#f4cf65', 'top', 1);
  const gf = gold.log.find((e) => e.op === 'fillText');
  assert.deepEqual(gf.fill.stops, ['#b98232', '#8f5a17', '#6e4210', '#8f5a17', '#c79342'], 'الذهبيّ/«الخطّ الجميل» يبقى تدرّجه (برونز فوق الفاتح)');
  assert.match(attach, /const goldHex = \/\^#\(f4cf65\|f4d03f\|d4af37\|c9962e\)\$\/i\.test/);
});

test('v-text-size: the real renderer grows and shrinks the text with the scale, in place, for phrase, long text and poster', async () => {
  const LONG = 'اللهم اجعل هذا اليوم بداية خير وبركة لنا ولأهلنا ولكل من نحب واحفظهم من كل سوء يا رب العالمين';
  const POSTER = 'البَحر\n\nيا بَحرُ خُذْ هَمِّي بَعيدًا\nوَأَعِدْ لِي ضَحِكَتي الأُولى\nفَفيكَ الحَياةُ تَبتَسِمُ';
  for (const [text, pos] of [['مشكور اخوي', 'right'], ['مشكور اخوي', 'auto'], ['مشكور اخوي', 'top'], ['ألف مبروك يا بطل', 'right'], [LONG, 'right'], [LONG, 'auto'], [LONG, 'top'], [POSTER, 'top'], [POSTER, 'auto'], [POSTER, 'right']]) {
    const rs = [];
    for (const sc of [0.68, 0.8, 1, 1.25, 1.56, 1.7]) rs.push(Object.assign({ sc }, (await draw(LIGHT, text, '#ffffff', pos, sc)).info));
    const tag = text.slice(0, 10) + ' @' + pos + ' F=' + rs.map((r) => r.F).join(',');
    /* كلّ خطوة تغيّر الخطّ، إلّا أن تملأ الكتلة الصورة (١٠٠٠×١٠٠٠) عرضًا أو ارتفاعًا فلا مكان تكبر فيه */
    for (let i = 1; i < rs.length; i++) assert.ok(rs[i].F > rs[i - 1].F || (rs[i].F === rs[i - 1].F && (rs[i - 1].w >= 850 || rs[i - 1].h >= 880)), tag + ' — كلّ خطوة تغيّر الخطّ');
    assert.ok(rs[3].F > rs[2].F && rs[1].F < rs[2].F, tag + ' — «كبّر» و«صغّر» مرّة واحدة تغيّران دائمًا');
    assert.ok(rs.every((r) => r.side === rs[2].side && r.vert === rs[2].vert), tag + ' — الحجم لا ينقل الكتابة');
    if (!rs[2].poster) assert.ok(rs.every((r) => r.align === rs[2].align), tag);
  }
});

/* ── مسار «إنشاء صورة» من «+» بمولّد مزيّف ── */
async function plusMode(prompt) {
  const calls = [];
  const sb = {
    window: null, lang: 'ar', console, Promise, setTimeout, genAbortController: null, JSON, String,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ imageBase64: 'QkFTRQ==', mimeType: 'image/png' }) }),
    authGet: () => '', renderAll() {}, saveState() {}, __swallow() {}, t: (k) => k,
    overlayTextOnImage: async (b64, mime, txt, font, color, position, scale) => { calls.push({ txt, color, position, scale }); return 'T1VUUFVU'; },
    omranSharpenImage: async (u) => u, __imgEngineLine: () => '',
  };
  sb.window = sb;
  Object.assign(sb, { __parseImageTextSpec: parser.parseImageTextSpec, __fixKnownPhrases: parser.fixKnownPhrases, getGuestId: () => 'g' });
  vm.createContext(sb);
  vm.runInContext([slice('const __SPELL_PHRASES', 'async function omranSpellFix'), fnSrc('async function omranSpellFix('), fnSrc('function __textScale('), fnSrc('function __textPosArg('), fnSrc('async function omModeGenerateImage(')].join('\n') + ';this.run=omModeGenerateImage;', sb);
  const cur = { messages: [] };
  await sb.run(cur, prompt, null);
  return { cur, calls, layer: plain(cur.imageTextLayer) };
}

test('v-text-mode: the + image mode stores the position it actually drew at, so a restyle does not jump', async () => {
  for (const [prompt, want] of [['صورة بحر واكتب عليها «مرحبا»', 'auto'], ['صورة بحر واكتب يمين «مرحبا»', 'right'], ['صورة بحر واكتب فوق «مرحبا»', 'top'], ['صورة بحر واكتب «مرحبا» تحت على اليسار', 'left-bottom']]) {
    const r = await plusMode(prompt);
    assert.equal(r.calls.length, 1, prompt);
    assert.equal(r.calls[0].position, want, prompt + ' — رُسم عند');
    assert.equal(r.layer.position, r.calls[0].position, prompt + ' — والطبقة تحفظ ما رُسم (كانت «bottom»/«right-center»)');
    assert.equal(r.layer.scale, r.calls[0].scale);
    assert.equal(r.layer.text, r.calls[0].txt);
    assert.equal(r.layer.baseB64, 'QkFTRQ==', 'الأساس النظيف من المولّد');
  }
});

test('v-text-mode: the + image mode applies the deterministic spelling — quoted istirja in Mushaf form, dictionary fixes', async () => {
  const ISTIRJA = 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ';
  for (const q of ['انا لله وانا اليه راجعون', 'ان الله وانه اليه راجعون']) {
    const r = await plusMode('صمم صورة عزاء واكتب «' + q + '»');
    assert.equal(r.calls[0].txt, ISTIRJA, q + ' — يُرسم برسم المصحف');
    assert.equal(r.layer.text, ISTIRJA, 'والطبقة تحفظ المصحّح');
  }
  assert.equal((await plusMode('صورة ورد واكتب «حبيبه قلبي»')).calls[0].txt, 'حبيبة قلبي');
  assert.equal((await plusMode('صورة ورد واكتب «ماشالله عليك»')).calls[0].txt, 'ما شاء الله عليك');
  assert.equal((await plusMode('صورة ورد واكتب «مشكور اخوي»')).calls[0].txt, 'مشكور اخوي', 'ما لا يطابقه القاموس حرفًا بحرف');
});

test('v-text-flex: a restyle uses the parser flag when present, and a bare side stays flexible when the flag is absent', () => {
  const { sb } = makeEnv(LIGHT);
  const P = (spec, text) => sb.stylePos(spec, text);
  assert.equal(P({ styleEdit: { position: 'right-center' }, positionFlex: true }, 'خل الكتابة يمين'), 'right');
  assert.equal(P({ styleEdit: { position: 'right-center' }, positionFlex: false }, 'خل الكتابة يمين'), 'right-center', 'علَم المحلّل يغلب');
  assert.equal(P({ styleEdit: { position: 'left-center', positionFlex: true } }, 'x'), 'left', 'العلَم داخل styleEdit');
  /* بلا علَم (مسار «loose» في المحلّل الحاليّ): «لا، على اليمين» و«خله يمين» مرنة، و«يمين الوسط/بالنص» وسط */
  for (const t of ['لا، على اليمين', 'خله يمين', 'حطه يسار']) {
    const s = parser.parseImageTextSpec(t), se = s.styleEdit || s.styleEditLoose;
    assert.ok(se && /-center$/.test(se.position), t);
    assert.match(P(Object.assign({}, s, { styleEdit: se }), t), /^(right|left)$/, t + ' — جانب مرن لا منتصف الارتفاع');
  }
  assert.equal(P({ styleEdit: { position: 'right-center' } }, 'خله يمين الوسط'), 'right-center');
  assert.equal(P({ styleEdit: { position: 'left-center' } }, 'حطه يسار بالنص'), 'left-center');
  assert.equal(P({ styleEdit: { position: 'bottom' } }, 'نزله تحت'), 'bottom');
  assert.equal(P({ styleEdit: { color: '#d32f2f' } }, 'خليه أحمر'), null, 'بلا موضع لا يُمسّ الموضع');
});
