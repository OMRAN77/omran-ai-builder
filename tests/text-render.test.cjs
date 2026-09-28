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
      fillText(t) { log.push({ op: 'fillText', t, fill: st.fillStyle, shadow: st.shadowColor, blur: this.shadowBlur, px: px() }); },
      strokeText(t) { log.push({ op: 'strokeText', t, stroke: st.strokeStyle, shadow: st.shadowColor, blur: this.shadowBlur, lw: this.lineWidth, px: px() }); },
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
const TREE = (x, y) => ((x + y) % 2 ? [235, 235, 228] : [95, 112, 88]); /* شجرة المالك على اليمين: متوسّطة الإضاءة مزدحمة (≈٠٫٦٧، sd≈0.25) فتُعدّ «داكنة» */
const DARK_BUSY = (x, y) => ((x + y) % 2 ? [0, 0, 0] : [100, 100, 120]); /* سماء داكنة بنسيج (≈٠٫٢، sd≈0.2) */
async function draw(bg, text, color, pos, scale, avoid) {
  const env = makeEnv(bg);
  await env.sb.overlay('QUJD', 'image/png', text, 'default', color, pos, scale, avoid);
  return { log: env.log, info: plain(env.sb.__lastTextDesign) };
}
const feathers = (log) => log.filter((e) => e.op === 'fill' && e.gco === 'source-over').map((e) => e.shadow);
const blackFeather = (log) => feathers(log).some((c) => /^rgba\(0,0,0,/.test(c));
const hue = (s) => { const m = /^hsla?\((\d+),(\d+)%,(\d+)%/.exec(String(s)); return m ? [+m[1], +m[2], +m[3]] : null; };

test('v-text-ink/veil: colours are classed by relative luminance, and the veil always pushes the background away from the ink', () => {
  const { sb } = makeEnv(LIGHT);
  const k = (hex, lum, dark, a) => plain(sb.ink(hex, lum, dark, a));
  const pick = (r) => [r.lowC, r.haloDark, r.veil];
  /* الأحمر والأزرق والبنفسجيّ والورديّ «فاتحة» في HSL (L>0.5) ونصوعها ٠٫١٦–٠٫٢٩ */
  for (const hex of ['#d32f2f', '#2979ff', '#a05ad6', '#ff4f9a', '#2e8b57', '#8e1b3a', '#111111', '#1c2f66']) assert.equal(k(hex, 0.8, false).lightInk, false, hex + ' حبر داكن');
  for (const hex of ['#fdfdfd', '#ffd400', '#5ec8ff', '#d7dbe0', '#ead9bd', '#ffb3d1']) assert.equal(k(hex, 0.8, false).lightInk, true, hex + ' حبر فاتح');
  /* جدار فاتح: الأحمر والأزرق والبنفسجيّ بلا حافّة ووشاحها أبيض؛ الورديّ/البرتقاليّ/الرماديّ (تباين < ٢٫٢) حافّة داكنة ووشاح أبيض */
  for (const hex of ['#d32f2f', '#2979ff', '#a05ad6']) assert.deepEqual(pick(k(hex, 0.8, false)), [false, false, 'light'], hex);
  for (const hex of ['#ff4f9a', '#ff8a1f', '#9aa0a6']) { const r = k(hex, 0.8, false); assert.ok(r.cr < 2.2, hex + ' ' + r.cr); assert.deepEqual(pick(r), [true, true, 'light'], hex); }
  /* فاتح على فاتح (أبيض/أصفر على الجدار): حافّة داكنة وحدها — لا ضباب أبيض من قطبيّة الحبر ولا «دخان» أسود */
  for (const hex of ['#fdfdfd', '#ffd400']) assert.deepEqual(pick(k(hex, 0.85, false)), [true, true, ''], hex);
  /* جدول المراجِع (الجولة الثانية) على شجرة المالك (إضاءة ٠٫٦٨ مزدحمة ← darkBg): الداكن والمتوسّط وراءه ضباب فاتح لا وشاح أسود،
     والتباين بعده أعلى ممّا قبله؛ الكحليّ والأسود والعنّابيّ والأخضر والأحمر والأزرق بحافّة فاتحة كما في dc3df69 */
  for (const hex of ['#1c2f66', '#111111', '#8e1b3a', '#2e8b57', '#d32f2f', '#2979ff', '#ff4f9a']) {
    const r = k(hex, 0.68, true, 0.38);
    assert.equal(r.veil, 'light', hex + ' على الشجرة: ضباب فاتح لا وشاح أسود');
    assert.ok(r.crLight > r.cr && r.crLight > r.crDark, hex + ' ' + [r.cr, r.crLight, r.crDark].map((v) => v.toFixed(2)));
  }
  for (const hex of ['#1c2f66', '#111111', '#8e1b3a', '#2e8b57', '#d32f2f', '#2979ff']) assert.equal(k(hex, 0.68, true).haloDark, false, hex);
  for (const [hex, lum, a] of [['#1c2f66', 0.58, 0.4], ['#8e1b3a', 0.58, 0.4], ['#111111', 0.58, 0.4], ['#1c2f66', 0.4, 0.33], ['#111111', 0.4, 0.33], ['#111111', 0.09, 0.28]]) assert.equal(k(hex, lum, true, a).veil, 'light', hex + '@' + lum);
  /* الأبيض على الشجرة: ظلّ داكن (الحبر فاتح)؛ والمتوسّط (برتقاليّ/فيروزيّ/رماديّ) فوق منطقة فاتحة: لا دخان أسود، وحافّة داكنة */
  assert.equal(k('#fdfdfd', 0.68, true, 0.38).veil, 'dark');
  for (const hex of ['#ff8a1f', '#18b6a4', '#9aa0a6']) { const r = k(hex, 0.68, true, 0.38); assert.notEqual(r.veil, 'dark', hex); assert.equal(r.haloDark, true, hex); }
  /* البرتقاليّ فوق سماء داكنة أفتح منها: الوشاح الداكن يبعد الخلفيّة عنه */
  assert.equal(k('#ff8a1f', 0.27, true, 0.3).veil, 'dark');
  /* الثابت: الوشاح لا يقرّب الخلفيّة من الحبر أبدًا، ولا فاتح خلف حبر فاتح، ولا داكن فوق منطقة فاتحة خلف حبر غير فاتح */
  const inks = ['#fdfdfd', '#ffd400', '#5ec8ff', '#ff8a1f', '#18b6a4', '#9aa0a6', '#ff4f9a', '#2979ff', '#2e8b57', '#a05ad6', '#d32f2f', '#8e1b3a', '#1c2f66', '#111111'];
  for (const hex of inks) for (let l = 0; l <= 1.0001; l += 0.05) for (const dark of [false, true]) for (const a of [0.2, 0.35, 0.5]) {
    const r = k(hex, l, dark, a), tag = hex + ' lum=' + l.toFixed(2) + ' dark=' + dark + ' a=' + a;
    assert.ok(['', 'light', 'dark'].includes(r.veil), tag);
    if (r.veil) assert.ok((r.veil === 'light' ? r.crLight : r.crDark) > r.cr, tag + ' — وشاح يخفض التباين');
    if (r.lightInk) assert.notEqual(r.veil, 'light', tag + ' — ضباب أبيض خلف حبر فاتح');
    if (!r.lightInk && l >= 0.5) assert.notEqual(r.veil, 'dark', tag + ' — دخان أسود فوق منطقة فاتحة');
    if (r.lightInk && !dark) assert.equal(r.veil, '', tag + ' — الفاتح فوق الفاتح بالحافّة وحدها');
  }
});

test('v-text-veil: the real renderer paints no black feather behind dark ink on the tree, the dark sky or the light wall; white on a light wall is outline only', async () => {
  const feather = async (bg, hex) => { const r = await draw(bg, 'مشكور اخوي', hex, 'top', 1); return { f: feathers(r.log), info: r.info, log: r.log }; };
  /* جدار فاتح بنسيج: وشاح أبيض واحد للداكن والمتوسّط، ولا وشاح للأبيض والأصفر */
  for (const [hex, name] of [['#d32f2f', 'أحمر'], ['#2979ff', 'أزرق'], ['#a05ad6', 'بنفسجيّ'], ['#ff4f9a', 'ورديّ'], ['#9aa0a6', 'رماديّ']]) {
    const r = await feather(LIGHT_BUSY, hex);
    assert.ok(r.info.lum >= 0.7 && r.info.sd > 0.14, 'خلفيّة فاتحة مزدحمة: ' + JSON.stringify([r.info.lum, r.info.sd]));
    assert.ok(r.f.length === 1 && /^rgba\(255,255,255,/.test(r.f[0]), name + ' — وشاح أبيض يهدّئ النسيج: ' + r.f.join(' | '));
  }
  for (const [hex, name] of [['#fdfdfd', 'أبيض'], ['#ffd400', 'أصفر']]) assert.deepEqual((await feather(LIGHT_BUSY, hex)).f, [], name + ' على الجدار الفاتح: لا وشاح (لا ضباب باهت ولا دخان)');
  /* الشجرة (مزدحمة متوسّطة ← darkBg): جدول المراجِع — الكحليّ والأسود والعنّابيّ والأخضر والأحمر والأزرق والورديّ وراءها ضباب فاتح */
  for (const hex of ['#1c2f66', '#111111', '#8e1b3a', '#2e8b57', '#d32f2f', '#2979ff', '#ff4f9a']) {
    const r = await feather(TREE, hex);
    assert.ok(r.info.sd > 0.16 && r.info.lum < 0.75 && r.info.lum >= 0.58, 'منطقة الشجرة: ' + JSON.stringify([r.info.lum, r.info.sd]));
    assert.ok(r.f.length === 1 && /^rgba\(255,255,255,/.test(r.f[0]), hex + ' على الشجرة: لا وشاح أسود حول حبر داكن — ' + r.f.join(' | '));
  }
  const navy = await feather(TREE, '#1c2f66');
  assert.ok(navy.log.filter((e) => e.op === 'strokeText').every((e) => /^rgba\(255,255,255,/.test(e.stroke)), 'الكحليّ بحافّة فاتحة');
  assert.ok((await feather(TREE, '#ff8a1f')).f.every((c) => !/^rgba\(0,0,0,/.test(c)), 'البرتقاليّ فوق الشجرة: لا دخان أسود');
  assert.ok(/^rgba\(0,0,0,/.test((await feather(TREE, '#fdfdfd')).f[0] || ''), 'الأبيض على الشجرة: ظلّ داكن (الحبر فاتح)');
  /* سماء داكنة بنسيج: الكحليّ والأسود ضباب فاتح (كانا وشاحًا أسود فوق الداكن)؛ البرتقاليّ أفتح من السماء فظلّ داكن */
  for (const hex of ['#1c2f66', '#111111']) { const r = await feather(DARK_BUSY, hex); assert.ok(r.info.lum < 0.4 && r.info.sd > 0.14, JSON.stringify([r.info.lum, r.info.sd])); assert.ok(r.f.length === 1 && /^rgba\(255,255,255,/.test(r.f[0]), hex + ' على الداكن: ' + r.f.join(' | ')); }
  assert.ok(/^rgba\(0,0,0,/.test((await feather(DARK_BUSY, '#ff8a1f')).f[0] || ''));
  /* الأحمر على الجدار بلا حافّة (التباين كافٍ)؛ الورديّ بحافّة داكنة */
  const red = await draw(LIGHT_BUSY, 'مشكور اخوي', '#d32f2f', 'top', 1);
  assert.equal(red.log.filter((e) => e.op === 'strokeText').length, 0, 'الأحمر بلا حافّة');
  const pink = await draw(LIGHT_BUSY, 'مشكور اخوي', '#ff4f9a', 'top', 1);
  const ps = pink.log.filter((e) => e.op === 'strokeText');
  assert.ok(ps.length && ps.every((e) => /^rgba\(16,12,8,/.test(e.stroke)), 'الورديّ بحافّة داكنة: ' + ps.map((e) => e.stroke).join(','));
});

test('v-text-crisp: white on a light wall keeps its white and reads through a crisp dark outline — no wide black glow, no grey gradient', async () => {
  for (const bg of [LIGHT, LIGHT_BUSY]) {
    const r = await draw(bg, 'مشكور اخوي', '#fdfdfd', 'top', 1);
    const st = r.log.filter((e) => e.op === 'strokeText'), fl = r.log.filter((e) => e.op === 'fillText' && e.t === 'مشكور اخوي');
    assert.equal(st.length, 1); assert.equal(fl.length, 1);
    assert.match(st[0].stroke, /^rgba\(16,12,8,\.9\d?\)$/, 'حافّة شبه معتمة');
    assert.ok(st[0].lw >= st[0].px / 13.5, 'حافّة أعرض: ' + st[0].lw + ' @' + st[0].px);
    assert.ok(st[0].blur <= st[0].px * 0.05, 'ظلّ الحافّة قصير لا توهّج عريض: ' + st[0].blur + ' @' + st[0].px);
    assert.equal(fl[0].shadow, 'rgba(0,0,0,0)', 'لا ضباب أسود حول التعبئة');
    const ls = fl[0].fill.stops.map((c) => hue(c)[2]);
    assert.ok(ls.every((l) => l >= 94), 'الأبيض أبيض (لا ينزل إلى رماديّ ٨٧٪): ' + ls.join(','));
    assert.deepEqual(feathers(r.log), [], 'بلا وشاح');
  }
  /* الأسطر الطويلة بالأبيض على الجدار: حافّة داكنة وظلّ قصير */
  const long = await draw(LIGHT_BUSY, 'اللهم اجعل هذا اليوم بداية خير وبركة لنا ولأهلنا ولكل من نحب', '#fdfdfd', 'top', 1);
  const lf = long.log.filter((e) => e.op === 'fillText'), lst = long.log.filter((e) => e.op === 'strokeText');
  assert.ok(lst.length >= 2 && lst.every((e) => /^rgba\(16,12,8,/.test(e.stroke)));
  assert.ok(lf.length >= 2 && lf.every((e) => e.blur <= e.px * 0.07), 'ظلّ الأسطر قصير: ' + lf.map((e) => e.blur + '@' + e.px).join(','));
  /* الأبيض فوق الداكن كما هو: ظلّ داكن عريض يحمله (لا يمسّه هذا الإصلاح) */
  const dark = await draw(DARK, 'مشكور اخوي', '#fdfdfd', 'top', 1);
  assert.equal(dark.log.find((e) => e.op === 'fillText').shadow, 'rgba(0,0,0,.35)');
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

test('v-text-face: the real renderer never enlarges a phrase, a prayer or a poster onto a face (girls avoid boxes, «كبّر» ×1–3)', async () => {
  const GIRLS = [{ box: [0.17, 0.4, 0.33, 0.55], label: 'face' }, { box: [0.37, 0.41, 0.5, 0.54], label: 'face' }, { box: [0.52, 0.42, 0.64, 0.55], label: 'face' }, { box: [0.66, 0.42, 0.82, 0.56], label: 'face' }, { box: [0.05, 0.38, 0.95, 1], label: 'person' }];
  const MID = 'كل عام وانتم بخير يا أحلى عائلة'; /* النصّ الطويل (٢٠ كلمة) لا يسع فوق الوجوه في اللوحة المربّعة — مثبّت بقياس صورة البنات في text-layout */
  const POSTER = 'البَحر\n\nيا بَحرُ خُذْ هَمِّي بَعيدًا\nوَأَعِدْ لِي ضَحِكَتي الأُولى\nفَفيكَ الحَياةُ تَبتَسِمُ';
  /* اللوحة المزيّفة ١٠٠٠×١٠٠٠؛ الكتلة المرسومة من __lastTextDesign (cx, w, top, h) */
  const ov = (i) => GIRLS.filter((g) => g.label === 'face').reduce((a, g) => a + Math.max(0, Math.min(i.cx + i.w / 2, g.box[2] * 1000) - Math.max(i.cx - i.w / 2, g.box[0] * 1000)) * Math.max(0, Math.min(i.top + i.h, g.box[3] * 1000) - Math.max(i.top, g.box[1] * 1000)), 0);
  for (const [text, pos] of [[POSTER, 'top'], [POSTER, 'auto'], [POSTER, 'right'], ['ألف مبروك يا بطل', 'top'], ['ألف مبروك يا بطل', 'right'], ['مشكور اخوي', 'auto'], [MID, 'right'], [MID, 'top']]) {
    const rs = [];
    for (const sc of [1, 1.25, 1.56, 1.7]) rs.push(Object.assign({ sc }, (await draw(LIGHT, text, '#ffffff', pos, sc, GIRLS)).info));
    const tag = text.slice(0, 8) + ' @' + pos + ' F=' + rs.map((r) => r.F + (r.bFs && r.tFs ? '/' + r.bFs : '')).join(',');
    assert.equal(ov(rs[0]), 0, tag + ' — الطبيعيّ بعيد عن الوجوه');
    rs.forEach((r) => assert.ok(ov(r) <= 2, tag + ' — تغطية الوجوه عند ' + r.sc + ': ' + Math.round(ov(r)) + 'px²'));
    rs.forEach((r, i) => { if (i) assert.ok(r.F >= rs[i - 1].F && (r.bFs || 0) >= (rs[i - 1].bFs || 0), tag + ' — «كبّر» لا تصغّر'); });
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
