// tests/three-colors.test.cjs — v-three-colors (المالك ١٦ أكتوبر بلقطتي المقاولات والقبلة: «الأسطر كلّها خلّها لون واحد… فقط ٣ ألوان»؛
// «الحدود كلّها ذهبي»، «عند التضليل عليها الحدّ يصير رماديّ أفتح»، الأزرار الذهبيّة الكبيرة باقية، واستوديو الإعلانات أسود بدل المجرّة).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const src = read('js/app-41-three-colors.js');
const pick = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const sb = {};
vm.runInNewContext(pick('  function rgba(s){', '  function mark(el, inTool){') + '\nthis.rgba=rgba;this.boxFill=boxFill;this.gradBox=gradBox;this.lineOf=lineOf;', sb);
const side = (w, c, st) => ({ W: w, C: c, S: st || 'solid' });
const cs = (t, r, b, l, anim) => { const o = { animationName: anim || 'none' }; [['Top', t], ['Right', r], ['Bottom', b], ['Left', l]].forEach(([k, v]) => { o['border' + k + 'Width'] = v.W + 'px'; o['border' + k + 'Color'] = v.C; o['border' + k + 'Style'] = v.S; }); return o; };

test('١. تعبئة الصندوق: الرماديّ الشفيف والداكن والمسحة الذهبيّة/البنّيّة تُسوَّد — الذهبيّ المصمت والألوان المشبعة لا', () => {
  for (const c of ['rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.04)', 'rgb(11, 11, 13)', 'rgb(32, 36, 44)', 'rgba(212, 175, 55, 0.14)', 'rgba(212, 175, 55, 0.06)']) assert.ok(sb.boxFill(sb.rgba(c)), c);
  for (const c of ['rgb(212, 175, 55)', 'rgb(233, 199, 102)', 'rgb(220, 38, 38)', 'rgb(37, 99, 235)', 'rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)']) assert.ok(!sb.boxFill(sb.rgba(c)), c);
  assert.ok(sb.gradBox('linear-gradient(135deg, rgba(212, 175, 55, 0.16), rgba(212, 175, 55, 0.04))'), 'صندوق الصلاة القادمة');
  assert.ok(!sb.gradBox('linear-gradient(160deg, rgb(233, 199, 102), rgb(184, 144, 42))'), 'زرّ ذهبيّ كبير باقٍ');
  assert.ok(!sb.gradBox('url("a.webp"), linear-gradient(rgb(0, 0, 0), rgb(0, 0, 0))'), 'الصور لا تُمسّ');
});

test('٢. الحدّ: الظاهر الموحَّد الجوانب فقط — لا الدوّارات ولا المثلّثات ولا الشفّاف', () => {
  const g = 'rgba(255, 255, 255, 0.12)';
  assert.ok(sb.lineOf(cs(side(1, g), side(1, g), side(1, g), side(1, g))));
  assert.ok(!sb.lineOf(cs(side(3, 'rgb(212, 175, 55)'), side(3, g), side(3, g), side(3, g))), 'دوّار: جانب مختلف');
  assert.ok(!sb.lineOf(cs(side(1, g), side(1, g), side(1, g), side(1, g), 'spin')), 'متحرّك');
  assert.ok(!sb.lineOf(cs(side(1, 'rgba(0, 0, 0, 0)'), side(1, 'rgba(0, 0, 0, 0)'), side(1, 'rgba(0, 0, 0, 0)'), side(1, 'rgba(0, 0, 0, 0)'))), 'شفّاف لا يصير خطًّا جديدًا');
  assert.ok(sb.lineOf(cs(side(0, g), side(0, g), side(1, g), side(0, g))), 'خطّ سفليّ وحده');
});

test('٣. الألوان الثلاثة في CSS للوضع الأسود وحده، والصلاة القادمة «مختارة»، واستوديو الإعلانات أسود', () => {
  const css = read('css/أدوات-أسود.css');
  // v-no-lines (المالك: «شيل كلّ الخطوط… الذهبي بس لما أمرّ عليها»، «الخلفيّات لونين أسود بس: #000 و#101013»)
  assert.ok(css.includes('html:not([data-mode="light"]):not(.skin) .om3-line{border-color:transparent !important;}'), 'بلا خطوط');
  assert.ok(css.includes('.om3-hot.om3-line:hover') && css.includes('[aria-checked="true"]){border-color:rgba(212,175,55,.85) !important;}'), 'ذهبيّ عند المرور والاختيار فقط');
  assert.ok(!/#c9c9c9|212,175,55,\.6\)/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'لا رماديّ ولا ذهبيّ دائم');
  const fills = [...css.matchAll(/\.om3-fill[^{]*\{background:(#[0-9a-f]+) !important;\}/gi)].map((m) => m[1]);
  assert.deepEqual(fills, ['#101013', '#000', '#101013'], 'تناوب الأسودين');
  assert.ok(Number((read('index.html').match(/css\/أدوات-أسود\.css\?v=(\d+)/) || [])[1]) >= 2, 'وسم الكاش مرفوع');
  assert.ok(read('js/app-26-qibla.js').includes("'<div' + (isNext ? ' class=\"sel\"' : '') + ' style="), 'الصلاة القادمة مختارة');
  const ad = read('ad-studio.html');
  const blk = ad.slice(ad.indexOf('v-three-colors'), ad.indexOf('</style>'));
  assert.ok(blk.includes('body{background:#000 !important}') && blk.includes('.hero{background:none !important}'), 'لا مجرّة');
  assert.ok(blk.includes('.hero .tile i{background:#000 !important;border-color:rgba(212,175,55,.6) !important'), 'حلقات الفئات ذهبيّة لا ملوّنة');
  assert.ok(read('js/app.bundle.js').includes('window.__om3Mark'), 'الحزمة مبنيّة');
});

/* v-om3-still (المالك ٢١ أكتوبر: «صفحة الفيديوات فيها وميض»): نموذج لمحرّك الانتقالات — كلّ قراءة لأسلوب العنصر «تُثبّته»، وإن تغيّر لون
   الحدّ والانتقال غير معطَّل بدأ انتقال (ثمّ transitionend يعيد التصنيف: الحلقة). mark الحقيقيّ من الملفّ يجري عليه. */
function om3Engine(honorStill, baseDur) {
  const ops = [];
  const cls = new Set(['vmk-tab', 'om3-line', 'om3-hot']);
  const el = {
    nodeType: 1, tagName: 'BUTTON', parentElement: null, closest: () => null,
    classList: {
      add: (...c) => { c.forEach((x) => cls.add(x)); ops.push('+' + c.join(',')); },
      remove: (...c) => { c.forEach((x) => cls.delete(x)); ops.push('-' + c.join(',')); },
      contains: (c) => cls.has(c),
    },
  };
  /* CSS الوضع الأسود: om3-line = حدّ شفّاف، وإلّا حدّ التبويب الأصليّ؛ والتبويب انتقاله .15s إلّا تحت om3-still */
  const styleNow = () => ({ border: cls.has('om3-line') ? 'rgba(0, 0, 0, 0)' : 'rgba(255, 255, 255, 0.12)', dur: honorStill && cls.has('om3-still') ? '0s' : (baseDur || '0.15s') });
  const st = { committed: styleNow().border, transitions: 0 };
  const flush = () => { const s = styleNow(); if (s.border !== st.committed && s.dur !== '0s') st.transitions++; st.committed = s.border; return s; };
  const cs = new Proxy({}, { get(_, k) {
    const s = flush();
    if (/^border(Top|Right|Bottom|Left)Color$/.test(k)) return s.border;
    if (/^border(Top|Right|Bottom|Left)Width$/.test(k)) return '1px';
    if (/^border(Top|Right|Bottom|Left)Style$/.test(k)) return 'solid';
    return { transitionDuration: s.dur, animationName: 'none', cursor: 'pointer', backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', position: 'static' }[k];
  } });
  const box = { getComputedStyle: () => cs };
  vm.runInNewContext(pick('  var SKIP', '  /* طابور عناصر') + '\nthis.mark=mark;', box);
  return { el, cls, ops, st, mark: box.mark };
}

test('٤. v-om3-still: إعادة التصنيف لا تبدأ انتقالًا — فلا حلقة transitionend ولا وميض على تبويبات صانع الفيديو', () => {
  // بلا om3-still (كما كان): كلّ إعادة تصنيف تبدأ انتقالين (إلى الحدّ الأصليّ ثمّ إلى الشفّاف) — هذا ما يعيد transitionend الحلقة به
  const old = om3Engine(false);
  old.mark(old.el, true);
  assert.equal(old.st.transitions, 2, 'النموذج يُظهر العطل: انتقالان لكلّ إعادة تصنيف');
  // مع om3-still: صفر انتقال، والأصناف نفسها، والصنف المؤقّت زال
  const e = om3Engine(true);
  for (let i = 0; i < 5; i++) e.mark(e.el, true);
  assert.equal(e.st.transitions, 0, 'لا انتقال يبدأ من القياس');
  assert.deepEqual([...e.cls].sort(), ['om3-hot', 'om3-line', 'vmk-tab'], 'التصنيف كما هو، وom3-still أُزيل');
  assert.deepEqual(e.ops.slice(0, 5), ['+om3-still', '-om3-line,om3-fill,om3-hot,om3-field', '+om3-line', '+om3-hot', '-om3-still'], 'معطَّل قبل الإزالة، ويُزال بعد إعادة الأصناف');
  // عنصر بلا انتقال: لا om3-still أصلًا (لا كلفة زائدة على آلاف العناصر)
  const z = om3Engine(true, '0s');
  z.mark(z.el, true);
  assert.ok(!z.ops.some((o) => /om3-still/.test(o)) && z.st.transitions === 0, 'بلا انتقال: لا om3-still');
  const src2 = read('js/app-41-three-colors.js');
  assert.ok(src2.includes("var cs = getComputedStyle(el), still = /[1-9]/.test(cs.transitionDuration || '');") && src2.includes("if(still) el.classList.add('om3-still');"), 'om3-still لما له انتقال فقط');
  assert.ok(src2.includes("finally{ if(still){ void cs.borderTopColor; el.classList.remove('om3-still'); } }"), 'الأسلوب النهائيّ يُثبَّت قبل إعادة الانتقال');
  assert.ok(src2.includes("st.textContent = '.om3-still{transition:none !important}'; document.head.appendChild(st);"), 'القاعدة لكلّ الأوضاع، في head (أدوات-أسود.css للأسود وألوانه وحدها — tools-black)');
  assert.ok(!read('css/أدوات-أسود.css').includes('om3-still'));
  assert.ok(read('js/app.bundle.js').includes("el.classList.add('om3-still')") && read('js/app.bundle.js').includes("st.id = 'om3StillCss'"), 'الحزمة مبنيّة');
});
