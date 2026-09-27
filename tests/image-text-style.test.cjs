'use strict';
/* v-text-colors + v-text-harmony — لقطة المالك بعد نشر #803: صورة مرفوعة طُبع عليها «بخط صغير ومزخرف»، و«اكتب حبيبه قلبي
   بخط لونه وردي» خرجت بيضاء («وردي» لم يكن لونًا معروفًا). ثمّ: «لا ما ابا شريط صغير ابا تنسيق اللون مع الصوره». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseImageTextSpec } = require('../js/app-08-image-text.js');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const attach = read('js/app-09-attach.js');
const plain = (x) => JSON.parse(JSON.stringify(x));

test('the owner\'s words: «اكتب حبيبه قلبي بخط لونه وردي» writes the text in pink', () => {
  const s = parseImageTextSpec('اكتب حبيبه قلبي بخط لونه وردي');
  assert.equal(s.wantsText, true);
  assert.equal(s.exactText, 'حبيبه قلبي', 'الذيل تنسيق لا يُطبع');
  assert.equal(s.color, '#ff4f9a');
  assert.equal(s.colorSet, true);
  for (const p of ['اكتب حبيبة قلبي بلون وردي', 'اكتب عليها حبيبة قلبي باللون الوردي', 'اكتب حبيبة قلبي لونه وردي', 'اكتب «حبيبة قلبي» بخط لونه وردي', 'اكتب حبيبة قلبي بالوردي']) {
    const t = parseImageTextSpec(p);
    assert.equal(t.exactText, 'حبيبة قلبي', p);
    assert.equal(t.color, '#ff4f9a', p);
    assert.equal(t.visualEdit, null, p + ' — لا يُرسل «وردي» للمولّد تعديلًا بصريًّا');
  }
});

test('one colour map: new colours, whole words only, explicit white differs from the default', () => {
  const col = (p) => parseImageTextSpec(p).color;
  assert.equal(col('اكتب عمران بخط بنفسجي'), '#a05ad6');
  assert.equal(col('اكتب عمران بخط برتقالي'), '#ff8a1f');
  assert.equal(col('اكتب عمران بالبني'), '#8b5a2b');
  assert.equal(col('اكتب عمران بخط سماوي'), '#5ec8ff');
  assert.equal(col('اكتب عمران بخط وردي فاتح'), '#ffb3d1');
  assert.equal(col('اكتب عمران بخط ازرق'), '#2979ff', 'الألوان القديمة كما هي');
  assert.equal(col('اكتب ابني الغالي'), '#ffffff', '«ابني» ليست «بني»');
  assert.equal(parseImageTextSpec('اكتب ابني الغالي').exactText, 'ابني الغالي');
  assert.equal(col('اكتب عمران بخط ابيض'), '#fdfdfd', 'أبيض صريح يغلب لون الكتابة السابقة ولا يصير ذهبًا');
  assert.equal(col('اكتب «عمران»'), '#ffffff', 'الافتراضيّ كما كان');
});

test('«اكتب بخط صغير ومزخرف» restyles the existing text instead of printing the style words', () => {
  const s = parseImageTextSpec('اكتب بخط صغير ومزخرف');
  assert.equal(s.wantsText, false);
  assert.equal(s.exactText, null);
  assert.equal(s.styleOnlyWrite, true);
  assert.deepEqual(plain(s.styleEdit), { color: '#f4cf65', fontKey: 'diwani', position: null, size: 'small' });
  for (const [p, want] of [['اكتبه بخط وردي', { color: '#ff4f9a' }], ['اكتبها بالوردي', { color: '#ff4f9a' }], ['اكتب بخط كبير', { size: 'large' }]]) {
    const t = parseImageTextSpec(p);
    assert.equal(t.wantsText, false, p);
    assert.equal(t.styleOnlyWrite, true, p);
    for (const k of Object.keys(want)) assert.equal(t.styleEdit[k], want[k], p + ' ' + k);
  }
  assert.equal(parseImageTextSpec('اكتب وردي').exactText, 'وردي', 'بلا سابقة «ب» تبقى كلمة تُكتب');
  assert.equal(parseImageTextSpec('اكتب دعاء بخط ديواني').prayerRequest, 'اكتب دعاء بخط ديواني', 'طلب تأليف الدعاء لا يتحوّل تنسيقًا');
});

test('restyle follow-ups: colour, size and fancy font; a named scene target stays a visual edit', () => {
  assert.equal(parseImageTextSpec('خليه وردي').styleEditLoose.color, '#ff4f9a');
  assert.equal(parseImageTextSpec('نفس الكلام بس وردي').styleEdit.color, '#ff4f9a');
  assert.equal(parseImageTextSpec('غير لون الخط الى وردي').styleEdit.color, '#ff4f9a');
  assert.equal(parseImageTextSpec('كبر الخط').styleEdit.size, 'larger');
  assert.equal(parseImageTextSpec('صغر الكلام').styleEdit.size, 'smaller');
  assert.equal(parseImageTextSpec('بخط صغير ومزخرف').styleEditLoose.fontKey, 'diwani');
  assert.equal(parseImageTextSpec('خلي الخلفية وردي').styleEditLoose, null, 'الخلفيّة تعديل للمشهد لا للكتابة');
  assert.equal(parseImageTextSpec('خلي الورد احمر').styleEditLoose, null);
  const w = parseImageTextSpec('اكتب عليها حبيبة قلبي باللون الوردي وبخط صغير');
  assert.equal(w.exactText, 'حبيبة قلبي');
  assert.equal(w.size, 'small');
});

test('client: size is a clamped scale, relative words multiply the current one', () => {
  const src = /function __textScale\(prev, size\)\{[\s\S]*?\n\}/.exec(attach);
  assert.ok(src, '__textScale موجودة');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src[0] + ';this.f=__textScale;', ctx);
  assert.equal(ctx.f(1, 'small'), 0.68);
  assert.equal(ctx.f(1, 'large'), 1.3);
  assert.equal(ctx.f(1, 'larger'), 1.25);
  assert.equal(ctx.f(0.68, 'larger'), 0.85);
  assert.equal(ctx.f(1.6, 'larger'), 1.7, 'سقف');
  assert.equal(ctx.f(0.45, 'smaller'), 0.4, 'أرضيّة');
  assert.equal(ctx.f(undefined, null), 1);
  assert.match(attach, /async function overlayTextOnImage\(b64, mime, txt, fontKey, colorStr, position, scale\)/);
  assert.match(attach, /const __maxH = Math\.min\(c\.height \* 0\.5, maxHeight \* __sc\)/);
  assert.match(attach, /cur\.imageTextLayer = __byCanvas \? \{[^}]*scale:__scale/, 'الكتابة الجديدة تحفظ حجمها وترثه');
});

test('client: «حبيبه قلبي» is spelled «حبيبة قلبي» before drawing, «قلبه» alone is untouched', () => {
  const src = /const __QURAN_FIXES = \[[\s\S]*?\n\];/.exec(attach);
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src[0] + ';this.F=__QURAN_FIXES;', ctx);
  const fix = (t) => ctx.F.reduce((s, [re, rep]) => s.replace(re, rep), t);
  assert.equal(fix('حبيبه قلبي'), 'حبيبة قلبي');
  assert.equal(fix('غاليه عمري'), 'غالية عمري');
  assert.equal(fix('قره عيني'), 'قرة عيني');
  assert.equal(fix('حبيبه'), 'حبيبه', 'بلا مضاف إليه يبقى كما هو');
});

test('client: a style-only write with no text on the image asks for the text instead of editing the photo', () => {
  assert.match(attach, /if\(__textSpec\.styleOnlyWrite && !cur\.imageTextLayer\)\{/);
});

test('client: with no colour asked, the text takes a tint of the image\'s own vivid colour, readable on its background', () => {
  const a = attach.indexOf('function __hslHex'), b = attach.indexOf('async function overlayTextOnImage');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(attach.slice(a, b) + ';this.P=__pickTextHarmony;', ctx);
  const img = (fn, n = 96 * 96) => { const d = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { const [r, g, bl] = fn(i / n); d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = bl; d[i * 4 + 3] = 255; } return d; };
  const hue = (hex) => { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b2 = parseInt(hex.slice(5, 7), 16) / 255, mx = Math.max(r, g, b2), mn = Math.min(r, g, b2), d = mx - mn; return ((mx === r ? ((g - b2) / d) % 6 : mx === g ? (b2 - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360; };
  const lum = (hex) => (parseInt(hex.slice(1, 3), 16) * 0.2126 + parseInt(hex.slice(3, 5), 16) * 0.7152 + parseInt(hex.slice(5, 7), 16) * 0.0722) / 255;
  /* صورة المالك: فستان وردي على كنبة بيج وبشرة — الوردي يغلب البشرة والبيج */
  const photo = img((t) => t < 0.12 ? [232, 120, 160] : t < 0.3 ? [235, 200, 175] : [200, 185, 165]);
  const onDark = ctx.P(photo, 0.2), onLight = ctx.P(photo, 0.8);
  assert.ok(hue(onDark) > 300 || hue(onDark) < 5, 'ورديّ لا خوخيّ: ' + onDark);
  assert.ok(lum(onDark) > 0.6, 'فاتح فوق الداكن: ' + onDark);
  assert.ok(lum(onLight) < 0.2, 'غامق فوق الفاتح: ' + onLight);
  const dusk = ctx.P(img((t) => t < 0.3 ? [240, 140, 50] : [30, 30, 40]), 0.2);
  assert.ok(hue(dusk) > 15 && hue(dusk) < 45, 'غروب ← دافئ: ' + dusk);
  assert.equal(ctx.P(img((t) => [100 + t * 80, 100 + t * 80, 100 + t * 80]), 0.2), '#ffffff', 'صورة رماديّة تبقى بيضاء');
  assert.match(attach, /if\(\/\^#ffffff\$\/i\.test\(base\)\)\{ \/\* v-text-harmony/, 'الافتراضيّ وحده يتنسّق؛ اللون المطلوب يغلب');
  assert.doesNotMatch(attach, /__omranTextStyleBar/, 'بلا شريط اختيار — طلب المالك');
});
