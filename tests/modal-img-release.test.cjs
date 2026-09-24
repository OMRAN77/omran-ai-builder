'use strict';
/* v-modal-img-release (المالك ٢٤ سبتمبر، الجولة الرابعة: «نفس المشكلة… تقدر ولا ما تقدر»).
   قياس «فحص النظام» من جهازه بعد v-art-defer: صور ظاهرة 1 (0MB) كلّ 33 (151MB) — ٣٢ صورة
   مخفيّة بـ١٥١ م.ب. صور المعارض ٠٫٧٤ م.ب لكلّ واحدة فلا تفسّرها؛ صور النتائج المولَّدة (2K =
   ١٦ م.ب) الباقية في نوافذ مغلقة تفسّرها: عشرة ≈ ١٦٠ م.ب.
   يشغّل هذا الاختبار الوحدة الحقيقيّة من js/app-10-features.js في vm بـDOM مصغّر. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SRC = fs.readFileSync('js/app-10-features.js', 'utf8');
const START = SRC.indexOf('(function omranModalImgRelease(){');
assert.ok(START > 0, 'الوحدة موجودة');
const BODY = SRC.slice(START, SRC.indexOf('\n})();', START) + 6);

/* ——— DOM مصغّر: ما تلمسه الوحدة فقط ——— */
function img(nw, nh, src) {
  var a = { src: src };
  return {
    naturalWidth: nw, naturalHeight: nh, __omHold: null,
    getAttribute: function (k) { return k === 'src' ? (a.src || null) : null; },
    removeAttribute: function (k) { if (k === 'src') a.src = null; },
    set src(v) { a.src = v; }, get src() { return a.src; },
  };
}
function modal(id, imgs, visible) {
  return {
    id: id, __imgs: imgs, offsetParent: visible ? {} : null, __obs: null,
    getElementsByTagName: function () { return this.__imgs; },
  };
}
function run(modals) {
  const byId = {};
  modals.forEach(function (m) { byId[m.id] = m; });
  const ctx = {
    window: {}, console,
    __swallow: function () {},
    document: {
      readyState: 'complete',
      getElementById: function (id) { return byId[id] || null; },
      addEventListener: function () {},
    },
    getComputedStyle: function (el) { return { display: el.offsetParent ? 'flex' : 'none' }; },
    MutationObserver: function (fn) { this.observe = function (el) { el.__obs = fn; }; },
    setTimeout: function () {},
  };
  vm.createContext(ctx);
  vm.runInContext(BODY, ctx);
  return ctx;
}
const BIG = 'data:image/jpeg;base64,AAAA';

test('١. إغلاق النافذة يفرّغ صورة النتيجة 2K (١٦ م.ب) ويحفظ مصدرها', () => {
  const big = img(2048, 2048, BIG);
  const m = modal('fashionAiModal', [big], true);
  run([m]);
  assert.ok(m.__obs, 'النافذة مُراقَبة');
  assert.equal(big.getAttribute('src'), BIG, 'قبل الإغلاق المصدر موجود');
  m.offsetParent = null; m.__obs();                       // أُغلقت
  assert.equal(big.getAttribute('src'), null, 'فُرِّغت — البكسلات تُحرَّر');
  assert.equal(big.__omHold, BIG, 'المصدر محفوظ لا مفقود');
});

test('٢. إعادة الفتح تعيد الصورة كاملة قبل أن يراها المستخدم', () => {
  const big = img(2048, 2048, BIG);
  const m = modal('designAiModal', [big], true);
  run([m]);
  m.offsetParent = null; m.__obs();
  assert.equal(big.getAttribute('src'), null);
  m.offsetParent = {}; m.__obs();                          // فُتحت
  assert.equal(big.getAttribute('src'), BIG, 'عادت');
  assert.equal(big.__omHold, null, 'والحافظة فُرِّغت فلا تتراكم');
});

test('٣. الصغيرة لا تُمسّ — بطاقات المعارض (360×540) والأيقونات تبقى كما هي', () => {
  const card = img(360, 540, '/assets/fashion/looks/women/evening.webp'); // ٠٫٧٤ م.ب
  const icon = img(64, 64, '/icons/omran-mark-64.png');
  const big = img(2048, 2048, BIG);
  const m = modal('pickerSheet', [card, icon, big], true);
  run([m]);
  m.offsetParent = null; m.__obs();
  assert.equal(card.getAttribute('src'), '/assets/fashion/looks/women/evening.webp', 'البطاقة باقية');
  assert.equal(icon.getAttribute('src'), '/icons/omran-mark-64.png', 'الأيقونة باقية');
  assert.equal(big.getAttribute('src'), null, 'الكبيرة وحدها فُرِّغت');
  // الحدّ: مليون بكسل = ١٠٢٤×١٠٢٤ (٤ م.ب مفكوكة)
  assert.match(BODY, /MIN_PX = 4 \* 1048576 \/ 4/);
});

test('٤. صورة قيد التحميل لا تُمسّ — لا يُقطع توليد جارٍ', () => {
  const loading = img(0, 0, BIG);   // naturalWidth == 0 ⇒ لم تكتمل
  const m = modal('studioAiModal', [loading], true);
  run([m]);
  m.offsetParent = null; m.__obs();
  assert.equal(loading.getAttribute('src'), BIG, 'بقيت — التوليد لم يُقطع');
  assert.equal(loading.__omHold, null);
});

test('٥. مَن يقرأ المصدر ونافذته مغلقة يجده عبر omranModalImgSrc', () => {
  const big = img(2048, 2048, BIG);
  const m = modal('cvModal', [big], true);
  const ctx = run([m]);
  m.offsetParent = null; m.__obs();
  assert.equal(big.getAttribute('src'), null, 'الوسم فارغ');
  assert.equal(ctx.window.omranModalImgSrc(big), BIG, 'والمساعد يرجعه كاملًا');
  // ومفتوحة: يرجع الوسم نفسه
  m.offsetParent = {}; m.__obs();
  assert.equal(ctx.window.omranModalImgSrc(big), BIG);
});

test('٦. لا تكرار ولا تسريب: تسلّح مرّتين = مراقب واحد، وتبديل بلا تغيّر لا يفعل شيئًا', () => {
  const big = img(2048, 2048, BIG);
  const m = modal('videoMakerModal', [big], true);
  run([m]);
  const first = m.__obs;
  m.__obs();                                   // حالة لم تتغيّر (ما زالت ظاهرة)
  assert.equal(big.getAttribute('src'), BIG, 'ظاهرة ⇒ لا تفريغ');
  assert.equal(m.__omImgWatch, 1, 'علامة التسلّح');
  assert.equal(m.__obs, first, 'لم يُركَّب مراقب ثانٍ');
});

test('٧. كلّ نوافذ الاستوديوهات مشمولة، والوحدة قبل v-modal-close-fix في الملفّ', () => {
  const ids = JSON.parse(BODY.match(/var IDS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const need of ['fashionAiModal', 'designAiModal', 'studioAiModal', 'portraitStyleModal',
    'videoMakerModal', 'pickerSheet', 'portraitStyleSheet', 'cvModal']) {
    assert.ok(ids.includes(need), 'مشمولة: ' + need);
  }
  assert.ok(SRC.indexOf('omranModalImgRelease') < SRC.indexOf('omranModalCloseFix'));
  // الحزمة مطابقة لأجزائها
  assert.ok(fs.readFileSync('js/app.bundle.js', 'utf8').includes('omranModalImgRelease'));
});
