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
  assert.match(attach, /async function overlayTextOnImage\(b64, mime, txt, fontKey, colorStr, position, scale, avoid\)/);
  /* v-text-layout: العبارة والأسطر بلا عنوان من __textBlockLayout (سقفها ٠٫١٢W وأسطر ٠٫٠٧٥W)، والملصق من measure.
     v-text-size: الحجم يُضرب في الخطّ بعد الملاءمة واختيار الموضع (كان يضرب السقوف وحدها فلا يتغيّر شيء حين يحدّ العرض) —
     سلوكه في text-layout (رتابة الخطّ في كلّ دور وموضع) وtext-render (الراسم الحقيقيّ) */
  assert.match(attach, /const FMAX = Math\.min\(0\.12 \* W, 0\.11 \* H\), HERO_MIN = 0\.07 \* W, FMIN = 0\.045 \* W, BODY_MAX = 0\.075 \* W;/, 'السقوف بالحجم الطبيعيّ');
  assert.match(attach, /const want = B0\.F \* sc;/, 'الحجم يضرب خطّ الموضع المختار');
  assert.match(attach, /pos: P, sc: __sc, boxes,/, 'والراسم يمرّره للكتلة');
  assert.match(attach, /Math\.round\(base \* 0\.03 \* S \* Math\.max\(0\.9, kk\)\)/, 'ويضرب خطّ أسطر الملصق');
  assert.match(attach, /L2 = measure\(Math\.min\(W \* 0\.92, L0\.maxW \* __sc\), Math\.min\(H - 2 \* mY, L0\.maxH \* __sc\), L0\.k0, __sc\)/, 'والملصق يُعاد قياسه بالحجم في موضعه');
  assert.match(attach, /cur\.imageTextLayer = __byCanvas \? \{[^}]*scale:__scale/, 'الكتابة الجديدة تحفظ حجمها وترثه');
});

test('client: «حبيبه قلبي» is spelled «حبيبة قلبي» before drawing, «قلبه» alone is untouched', () => {
  /* v-spell-literal: القاعدة نفسها انتقلت من __QURAN_FIXES إلى قاموس literalSpellFix المقطَّع على الكلمات */
  const a = attach.indexOf('const __SPELL_PHRASES'), b = attach.indexOf('async function omranSpellFix');
  assert.ok(a > 0 && b > a, 'literalSpellFix موجودة قبل omranSpellFix');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(attach.slice(a, b) + ';this.fix=literalSpellFix;', ctx);
  const fix = (t) => ctx.fix(t);
  assert.equal(fix('حبيبه قلبي'), 'حبيبة قلبي');
  assert.equal(fix('يا حبيبه قلبي، يا غاليه عمري'), 'يا حبيبة قلبي، يا غالية عمري', 'كلّ تكرار، والترقيم حدّ');
  assert.equal(fix('غاليه عمري'), 'غالية عمري');
  assert.equal(fix('قره عيني'), 'قرة عيني');
  assert.equal(fix('حبيبه'), 'حبيبه', 'بلا مضاف إليه يبقى كما هو');
});

test('client: a style-only write with no text on the image asks for the text instead of editing the photo', () => {
  assert.match(attach, /if\(__textSpec\.styleOnlyWrite && !cur\.imageTextLayer\)\{/);
});

test('client (v-text-design يخلف v-text-harmony): ذهب شمبانيا فوق الداكن، برونز فوق الفاتح، فضّة للصورة الباردة بلا ضوء دافئ، ولون المستخدم طقم نغميّ', () => {
  assert.match(attach, /\['#fff3d6', '#fcd28a', '#f6b95f', '#e49f4a', '#f9d494'\]/);
  assert.match(attach, /!lightInk \? \['#b98232', '#8f5a17', '#6e4210', '#8f5a17', '#c79342'\]/);
  assert.match(attach, /cool: \(sb - sr\) \/ \(n \* 255\) > 0\.04 && warm \/ n < 0\.03/, 'غروب مرجع المالك يبقى ذهبيًّا');
  /* v-text-rebuild: لون المستخدم كما طلبه (أبيض يبقى أبيض)، والتباين بحافّة وظلّ بعكس اللون — كان يُعتَّم فوق الفاتح فخرج «بالأبيض» رماديًّا */
  /* v-text-ink: القطبيّة بالنصوع النسبيّ (__textInk) لا بإضاءة HSL — سلوكها في text-render */
  assert.match(attach, /const uL = user \? user\[2\] : 0, tone = user \? __textInk\(colorStr, st\.lum, darkBg\) : null;/);
  assert.match(attach, /const lowC = !!tone && tone\.lowC, haloDark = tone \? tone\.haloDark : lightInk, scrimDark = tone \? tone\.scrimDark : lightInk;/);
  assert.match(attach, /if\(haloDark \|\| lowC\)\{/);
  assert.doesNotMatch(attach, /__pickTextHarmony/, 'تنسيق v-text-harmony القديم أُزيل');
  const a = attach.indexOf('function __hexHsl'), b = attach.indexOf('const __hsl =');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(attach.slice(a, b) + ';this.H=__hexHsl;', ctx);
  const [h, s2, l] = ctx.H('#ff4f9a');
  assert.ok(h > 325 && h < 335 && s2 > 0.99 && Math.abs(l - 0.655) < 0.01);
});

test('review #804 (bugbot): style first, text after — the words after the style run are still printed', () => {
  for (const [p, t, c] of [['اكتب بخط وردي حبيبة قلبي', 'حبيبة قلبي', '#ff4f9a'], ['اكتب بلون وردي حبيبة قلبي', 'حبيبة قلبي', '#ff4f9a'], ['اكتب بالوردي حبيبة قلبي', 'حبيبة قلبي', '#ff4f9a'], ['اكتب بخط وردي فاتح حبيبة قلبي بخط كبير', 'حبيبة قلبي', '#ffb3d1']]) {
    const s = parseImageTextSpec(p);
    assert.equal(s.wantsText, true, p);
    assert.equal(s.exactText, t, p);
    assert.equal(s.color, c, p);
  }
  const d = parseImageTextSpec('اكتب بخط ديواني عمران');
  assert.equal(d.exactText, 'عمران');
  assert.equal(d.fontKey, 'diwani');
  assert.equal(parseImageTextSpec('اكتب بخط وردي فاتح حبيبة قلبي بخط كبير').size, 'large');
});

test('review #804 (bugbot): the text colour comes from its own style words, the scene colour goes to the image', () => {
  const s = parseImageTextSpec('اكتب «حبيبة قلبي» بخط لونه وردي والخلفية زرقاء');
  assert.equal(s.color, '#ff4f9a', 'الكتابة ورديّة لا زرقاء');
  assert.equal(s.visualEdit, 'الخلفية زرقاء', 'بلا «ردي» ولا «وردي» في تعديل المشهد');
  assert.equal(parseImageTextSpec('اكتب «عمران» بالأصفر').color, '#ffd400', 'اللون بلا «بخط» كما كان');
});
