'use strict';
/* v-text-layout — لقطة المالك ٢٧ سبتمبر: «اكتب على اليمين مشكور اخوي» على صورته خرجت «على / اليمين / مشكور / آخوي» كلمةً في
   كلّ سطر، في عمود ضيّق على اليسار. الكتلة القصيرة تُبنى الآن بقواعد __textBlockLayout الخالصة (تُشغَّل هنا في vm بقياس
   تقريبيّ لا متصفّح)، والمواضع تُطبَّع بـ__textPosNorm، والمستهلكون يمرّرون «auto» أو الجانب وحده بـ__textPosArg. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const attach = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');

const a = attach.indexOf('function __textPosNorm'), b = attach.indexOf('async function __textFontsReady');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(attach.slice(a, b) + ';this.norm=__textPosNorm;this.arg=__textPosArg;this.lay=__textBlockLayout;', ctx);
const plain = (x) => JSON.parse(JSON.stringify(x));
/* قياس تقريبيّ لخطّ النسخ العريض: نحو ٠٫٤٥ من الخطّ لكلّ حرف (مشكور اخوي ≈ ٤٫٥ em كما قيس في المتصفّح) */
const em = (s) => 0.45 * String(s).length;
const layout = (text, position, o = {}) => plain(ctx.lay(Object.assign({ W: 960, H: 1280, lines: String(text).split('\n'), em, role: String(text).split(/\s+/).length <= 6 ? 'hero' : 'body', pos: ctx.norm(position), sc: 1, boxes: [], rate: null }, o)));
const POS = ['auto', 'right', 'left', 'right-top', 'right-center', 'bottom-right', 'right-bottom', 'bottom-left', 'left-top', 'top', 'center', 'bottom'];
const SIZES = [[960, 1280], [1280, 960], [1024, 1024], [720, 1280], [1600, 900]];

test('a 2-word phrase is one line on a portrait photo, at every position', () => {
  for (const p of POS) {
    const r = layout('مشكور اخوي', p);
    assert.equal(r.lines.length, 1, p);
    assert.deepEqual(r.lines, ['مشكور اخوي'], p);
    assert.ok(r.F >= 0.07 * 960, p + ' — خطّ بطل لا نصّ صغير: ' + r.F);
  }
  const long = layout('عبدالرحمنالعظيم محمدالعبدالهادي', 'right');
  assert.equal(long.lines.length, 1, 'كلمتان سطر واحد دائمًا حتّى أرضيّة ٠٫٠٤٥W');
  assert.ok(long.w <= 960 * 0.88 + 1, 'ولا يخرج عن الصورة');
});

test("'right' puts the block's right edge at the margin and right-aligns it; 'left' mirrors it", () => {
  for (const [W, H] of SIZES) for (const p of ['right', 'right-top', 'right-center', 'bottom-right', 'right-bottom']) {
    const r = layout('مشكور اخوي', p, { W, H });
    assert.equal(r.side, 'right', p);
    assert.equal(r.align, 'right', p);
    assert.ok(W - (r.x0 + r.w) <= 0.07 * W && r.x0 + r.w <= W, p + ' حافّة يمنى عند الهامش');
    assert.equal(r.ax, W - 0.06 * W);
  }
  for (const p of ['left', 'left-top', 'bottom-left']) {
    const r = layout('مشكور اخوي', p);
    assert.deepEqual([r.side, r.align], ['left', 'left'], p);
    assert.ok(r.x0 <= 0.07 * 960 && r.x0 >= 0, p);
  }
  const c = layout('مشكور اخوي', 'top');
  assert.equal(c.align, 'center');
  assert.ok(Math.abs(c.x0 + c.w / 2 - 480) < 1);
  assert.equal(layout('مشكور اخوي', 'bottom-right').vert, 'bottom', 'bottom-right لا يسقط إلى تلقائيّ');
  assert.equal(layout('مشكور اخوي', 'right-bottom').vert, 'bottom');
});

test('≤6 words never take more than 2 lines, and never one word per line', () => {
  const words = ['على', 'اليمين', 'مشكور', 'اخوي', 'ألف', 'مبروك', 'يا', 'بطل', 'عيد', 'مبارك', 'وكل', 'عام', 'وانتم', 'بخير', 'عبدالرحمن', 'الحبيب'];
  for (let n = 1; n <= 6; n++) for (let off = 0; off < 10; off++) {
    const text = words.slice(off, off + n).join(' ');
    for (const p of POS) for (const [W, H] of SIZES) for (const sc of [0.68, 1, 1.3]) {
      const r = layout(text, p, { W, H, sc });
      assert.ok(r.lines.length <= 2, text + ' @' + p + ' ' + W + 'x' + H + ' → ' + r.lines.length + ' أسطر');
      if (n === 2) assert.equal(r.lines.length, 1, text + ' @' + p);
      if (n >= 4 && r.lines.length === 2) r.lines.forEach((l) => assert.ok(l.split(' ').length >= 2, 'كلمة يتيمة: ' + JSON.stringify(r.lines)));
      assert.ok(r.x0 >= 0 && r.x0 + r.w <= W + 0.5 && r.top >= 0 && r.top + r.h <= H + 0.5, 'داخل الصورة: ' + text + ' @' + p);
    }
  }
  /* نصّ المالك نفسه لو وصل كاملًا (محلّل قديم): سطران على الأكثر لا أربعة */
  for (const p of ['auto', 'right', 'right-center']) assert.ok(layout('على اليمين مشكور اخوي', p).lines.length <= 2, p);
});

test('7+ words: balanced lines (≤4 up to 20 words) with a font of at least 0.045W — no 0.036 cliff', () => {
  const seven = 'كل عام وانتم بخير يا أحلى عائلة';
  for (const p of POS) for (const [W, H] of SIZES) {
    const r = layout(seven, p, { W, H, role: 'body' });
    assert.ok(r.F >= Math.floor(0.045 * W), seven + ' @' + p + ' F=' + r.F + ' W=' + W);
    assert.ok(r.lines.length >= 2 && r.lines.length <= 4, p + ' ' + r.lines.length);
    assert.equal(r.lines.join(' '), seven, 'لا كلمة تضيع ولا تتكرّر');
  }
  const twenty = Array.from({ length: 20 }, (_, i) => ['اللهم', 'اجعل', 'هذا', 'اليوم', 'خيرا'][i % 5]).join(' ');
  const r = layout(twenty, 'auto', { role: 'body' });
  assert.ok(r.lines.length <= 4 && r.F >= Math.floor(0.045 * 960), JSON.stringify([r.lines.length, r.F]));
  const user = layout('سطر أول كتبه المستخدم\nوسطر ثانٍ بعده تمامًا', 'bottom', { role: 'body' });
  assert.deepEqual(user.lines, ['سطر أول كتبه المستخدم', 'وسطر ثانٍ بعده تمامًا'], 'أسطر المستخدم تُحترم');
});

test('positions: every spelling is normalised, the side alone is flexible, and an unknown value is flagged — never a silent auto', () => {
  const n = (p) => { const r = plain(ctx.norm(p)); return [r.side, r.vert, r.flex, r.auto, r.unknown]; };
  assert.deepEqual(n('right'), ['right', '', true, false, false]);
  assert.deepEqual(n('left'), ['left', '', true, false, false]);
  assert.deepEqual(n('right-center'), ['right', 'center', false, false, false]);
  assert.deepEqual(n('bottom-right'), n('right-bottom'));
  assert.deepEqual(n('bottom-right'), ['right', 'bottom', false, false, false]);
  assert.deepEqual(n('top-left'), ['left', 'top', false, false, false]);
  assert.deepEqual(n('middle'), ['', 'center', false, false, false]);
  assert.deepEqual(n('top'), ['', 'top', false, false, false]);
  for (const p of ['auto', '', null, undefined]) assert.deepEqual(n(p), ['', '', false, true, false], String(p));
  for (const p of ['upper-right', 'يمين', 'right-left', 'nowhere']) assert.deepEqual(n(p), ['', '', false, true, true], p);
  /* المستهلكون: بلا موضع مسمّى = «auto» (كان المولَّد الجديد يُكتب أسفل دائمًا)، والجانب وحده = «right»/«left» */
  assert.equal(ctx.arg('bottom', true, false), 'auto');
  assert.equal(ctx.arg('right-center', false, true), 'right');
  assert.equal(ctx.arg('left-center', false, true), 'left');
  assert.equal(ctx.arg('right-center', false, undefined), 'right-center', 'بلا علَم المحلّل: كما كان');
  assert.equal(ctx.arg('right-top', false, true), 'right-top', 'ارتفاع مسمّى لا يلين');
  assert.equal(ctx.arg('', false, false), 'auto');
});

test('an explicit side is a hard constraint; a named vertical moves only off a face', () => {
  const faceRightTop = [{ box: [0.62, 0.02, 0.98, 0.3], label: 'face' }];
  const flex = layout('مشكور اخوي', 'right', { boxes: faceRightTop });
  assert.equal(flex.side, 'right', 'الوجه لا ينقل الكتابة إلى اليسار');
  assert.notEqual(flex.vert, 'top', 'الجانب وحده يختار ارتفاعًا بلا وجه');
  const fixed = layout('مشكور اخوي', 'right-top', { boxes: faceRightTop });
  assert.equal(fixed.side, 'right');
  assert.ok(fixed.top / 1280 >= 0.3, 'انزلق تحت الوجه على الجهة نفسها: ' + fixed.top);
  const person = layout('مشكور اخوي', 'right-top', { boxes: [{ box: [0.5, 0, 1, 1], label: 'person' }] });
  assert.equal(Math.round(person.top), Math.round(0.045 * 1280), 'الشخص (لا الوجه) لا يزيح موضعًا مسمّى — الوشاح يكفي');
  const busy = layout('مشكور اخوي', 'right-top', { rate: (x0) => ({ rel: x0 > 0.5 ? 3 : 0.1, sd: 0.3, lum: 0.5 }) });
  assert.deepEqual([busy.side, busy.vert], ['right', 'top'], 'الازدحام تحت موضع مسمّى لا ينقله');
  const auto = layout('مشكور اخوي', 'auto', { rate: (x0, y0, x1) => ({ rel: y0 > 0.5 && x1 < 0.6 ? 0.05 : 2 }) });
  assert.deepEqual([auto.side, auto.vert], ['left', 'bottom'], 'التلقائيّ يذهب إلى الأهدأ');
});

test('client wiring: fonts measured as drawn, the poster kept, and every writer passes auto or the side', () => {
  assert.match(attach, /const fontsOk = await __textFontsReady\(\[titleW \+ ' 40px "' \+ titleCss \+ '"', bodyW \+ ' 40px "' \+ bodyCss \+ '"'\]/, 'خطّ احتياطيّ عريض حوّل ٣ أسطر إلى ٤');
  assert.match(attach, /new Promise\(\(r\) => setTimeout\(r, 2500\)\)/, 'الانتظار محدود');
  assert.match(attach, /const poster = !!\(T\.title && T\.lines\.length\), P = __textPosNorm\(position\);/, 'الملصق «عنوان\\n\\nأسطر» كما صُمّم');
  assert.match(attach, /const __pos = __textPosArg\(__textSpec\.position, __textSpec\.positionAuto, __textSpec\.positionFlex\);/);
  assert.match(attach, /const __genPos = __textPosArg\(textSpec\.position, textSpec\.positionAuto, textSpec\.positionFlex\);/);
  assert.match(attach, /position:__textPosArg\(__genTextSpec\.position, __genTextSpec\.positionAuto, __genTextSpec\.positionFlex\)/);
  assert.match(attach, /__textSpec\.styleEdit\[k\]\)__l\[k\]=k==='position'\?__textPosArg\(__textSpec\.styleEdit\[k\],false,__textSpec\.positionFlex\)/);
  assert.doesNotMatch(attach, /overlayTextOnImage\([^)]*__genTextSpec\.position,/, 'المولَّد الجديد لا يُكتب أسفل دائمًا');
});
