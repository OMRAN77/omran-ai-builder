// tests/studio-basket-compare.test.cjs — v-studio-basket-honest + v-studio-compare-max + v-studio-handle + v-studio-compare-sticky
// (تدقيق ١٨ أكتوبر، g08 style-basket/style-compare/style-generate):
// - «ولّد بالاختيارات (5)» والنتيجة ٣ صور بصمت: خمسة خيارات من الميزة نفسها = خمس توليفات تُقصّ إلى STUDIO_IMAGES_MAX (٣).
//   الآن الاختيار الذي يجاوز ٣ صور يُرفض برسالة studioBasketImgMax (١٤ لغة)، وحدّ الخمسة للميزات المختلفة كما هو.
// - رسالة «الحدّ 5 اختيارات» تبقى بعد تفريغ السلّة: حذف شريحة يمسحها.
// - العلامة الرابعة في «قارن الستايلات» تُلغى بصمت: الجملة القائمة studioCompareHint تظهر على زرّ المقارنة ٢٫٥ ث.
// - زرّ «قارن الستايلات» بعد ١٠٤ بطاقة (~٥٠٠٠px): لاصق أسفل النافذة ما دامت القائمة مفتوحة.
// - نصّ مقبض المقارنة مقصوص على الخطّ: المقبض كان ابن طبقة «قبل» المقصوصة (overflow:hidden) — صار ابن حاوية النتيجة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const A13 = read('js/app-13-stocks-init.js');
const PC = read('js/partials-core.js');
const cut = (s, a, b) => {
  const i = s.indexOf(a); assert.ok(i >= 0, 'مقطع مفقود: ' + a);
  const j = s.indexOf(b, i + a.length); assert.ok(j > i, 'نهاية مفقودة: ' + b);
  return s.slice(i, j);
};
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];

function makeDoc() {
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.style = {}; this.textContent = ''; this.id = ''; this.parentNode = null; this.attrs = {}; }
    appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c); c.parentNode = this; this.children.push(c); return c; }
    set innerHTML(h) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._html = h; }
    get innerHTML() { return this._html || ''; }
    setAttribute(k, v) { this.attrs[k] = v; }
    walk(fn) { for (const c of this.children) { fn(c); c.walk(fn); } }
  }
  const body = new El('body');
  return { El, body, document: { body, createElement: (t) => new El(t), getElementById: (id) => { let f = null; body.walk((c) => { if (!f && c.id === id) f = c; }); return f; } } };
}
function bootBasket() {
  const { body, document } = makeDoc();
  const studioCardsEl = document.createElement('div'); body.appendChild(studioCardsEl);
  const statusEl = { style: { display: 'none' }, textContent: '' };
  const ctx = {
    document, studioCardsEl, statusEl, feature: 'hair', Array, Object, Math, JSON,
    styleEl: { value: 'black', options: [] },
    tabsWrap: { querySelector: () => null },
    btnGenerate: null, studioMissing: () => true,
    bT: (a) => a, t2: (k) => (k === 'studioBasketImgMax' ? 'max {n} images' : k),
    setStatus(text) { statusEl.style.display = text ? 'block' : 'none'; statusEl.textContent = text || ''; },
  };
  vm.createContext(ctx);
  vm.runInContext(cut(A13, '  const STUDIO_BASKET_MAX = 5', '  async function studioChainOne(') + '\nthis.basket = () => studioBasket; this.combos = studioCombos; this.render = renderStudioBasket;', ctx);
  ctx.render();
  const box = () => document.getElementById('studioBasket');
  const add = (f, v) => { ctx.feature = f; ctx.styleEl.value = v; ctx.render(); box().children[0].onclick(); };
  const chips = () => box().children.filter((c) => c.tagName === 'SPAN');
  return { ctx, statusEl, add, chips };
}

test('١. ثلاثة شعر ثمّ رابع يُرفض برسالة studioBasketImgMax — الزرّ لا يعد بصور لن تُولَّد', () => {
  const { ctx, statusEl, add } = bootBasket();
  add('hair', 'black'); add('hair', 'blonde'); add('hair', 'red');
  assert.equal(ctx.basket().length, 3);
  assert.equal(ctx.combos().length, 3);
  add('hair', 'silver');
  assert.equal(ctx.basket().length, 3, 'الرابع من الميزة نفسها لا يُضاف');
  assert.equal(statusEl.textContent, 'max 3 images', 'رسالة بالـ١٤ لغة ورقم الحدّ من الثابت');
  assert.equal(statusEl.style.display, 'block');
  add('makeup', 'glam');
  assert.equal(ctx.basket().length, 4, 'ميزة أخرى مع ثلاثة شعر = ٣ صور، مقبولة');
  assert.equal(ctx.combos().length, 3);
  add('makeup', 'natural');
  assert.equal(ctx.basket().length, 4, '٣ شعر × ٢ مكياج = ٦ صور، مرفوض');
});

test('٢. ميزات مختلفة تُقبل حتّى خمسة (صورة واحدة)، والسادس يُرفض، وحذف شريحة يمسح رسالة الحدّ', () => {
  const { ctx, statusEl, add, chips } = bootBasket();
  for (const f of ['hair', 'makeup', 'glasses', 'beard', 'nails']) add(f, 'x');
  assert.equal(ctx.basket().length, 5);
  assert.equal(ctx.combos().length, 1);
  add('tattoo', 'x');
  assert.equal(ctx.basket().length, 5);
  assert.match(statusEl.textContent, /الحدّ 5/);
  chips()[0].children[0].onclick();
  assert.equal(ctx.basket().length, 4);
  assert.equal(statusEl.textContent, '', 'الرسالة لم تبقَ بعد الحذف');
  assert.equal(statusEl.style.display, 'none');
});

test('٣. حذف شريحة لا يمسح رسالة أخرى غير رسالة الحدّ', () => {
  const { ctx, statusEl, add, chips } = bootBasket();
  add('hair', 'black');
  ctx.setStatus('✅ تم');
  chips()[0].children[0].onclick();
  assert.equal(statusEl.textContent, '✅ تم');
});

test('٤. العلامة الرابعة لا تُلغى بصمت: studioCompareHint على زرّ المقارنة ثمّ يعود نصّه', () => {
  const timers = [];
  const checks = [];
  const compareChecksEl = { innerHTML: '', appendChild(l) { checks.push(l); }, querySelectorAll: () => checks.map((l) => l.cb).filter((c) => c.checked) };
  const mk = (tag) => {
    const e = { tagName: tag, style: {}, kids: [], classList: { s: new Set(), toggle(c, on) { if (on) this.s.add(c); else this.s.delete(c); } } };
    e.appendChild = (c) => { e.kids.push(c); if (c.tagName === 'input') e.cb = c; return c; };
    return e;
  };
  const compareBtn = { textContent: 'T:studioCompareBtn' };
  const ctx = {
    compareChecksEl, compareBtn, feature: 'hair', Array, window: {},
    styleEl: { options: ['a', 'b', 'c', 'd', 'e'].map((v) => ({ value: v, textContent: v })) },
    optionImgs: (f, v) => ({ img: v + '.webp', img2: '' }),
    document: { createElement: (t) => mk(t) }, t2: (k) => 'T:' + k,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(cut(A13, '  /* ---- 📊 compare checkboxes', '  /* v-studio-cards:') + '\nbuildCompareChecks();', ctx);
  const cbs = checks.map((l) => l.cb);
  for (let i = 0; i < 4; i++) { cbs[i].checked = true; cbs[i].onchange(); }
  assert.equal(cbs[3].checked, false, 'الحدّ ثلاثة كما هو');
  assert.equal(compareBtn.textContent, 'T:studioCompareHint', 'الجملة القائمة تظهر على الزرّ اللاصق');
  assert.ok(timers.some((x) => x.ms === 2500));
  timers.forEach((x) => x.fn());
  assert.equal(compareBtn.textContent, 'T:studioCompareBtn', 'يعود نصّ الزرّ');
});

test('٥. المقبض ابن حاوية النتيجة لا طبقة «قبل» المقصوصة، ويتبع الخطّ ويظهر ويختفي معها', () => {
  const wrap = cut(PC, '<div id="studioAiResultWrap"', '<a id="studioAiDownloadLink"');
  const before = cut(wrap, '<div id="studioAiBeforeWrap"', '</div>');
  assert.doesNotMatch(before, /studioAiCompareHandle/, 'ليس داخل الطبقة المقصوصة');
  const handle = (wrap.match(/<div id="studioAiCompareHandle"[^>]*>/) || [''])[0];
  assert.ok(handle, 'المقبض في حاوية النتيجة');
  assert.match(handle, /left:50%/); assert.match(handle, /translate\(-50%,-50%\)/); assert.match(handle, /display:none/);
  assert.doesNotMatch(handle, /right:-20px/);
  const beforeWrap = { style: { display: 'none' } }, compareHandle = { style: {} }, beforeImg = { style: {} };
  const ctx = { beforeWrap, beforeImg, compareHandle, resultWrap: { clientWidth: 500 }, feature: 'hair', selectedBase64A: 'QQ==', selectedMimeA: 'image/jpeg', Math };
  vm.createContext(ctx);
  vm.runInContext(cut(A13, '  function studioBaShow(on){', '  let __studioBaDragging = false;'), ctx);
  ctx.updateSliderClip(30);
  assert.equal(compareHandle.style.left, '30%');
  assert.equal(beforeWrap.style.width, '30%');
  ctx.setupBeforeAfter();
  assert.equal(beforeWrap.style.display, 'block'); assert.equal(compareHandle.style.display, 'flex');
  assert.equal(compareHandle.style.left, '50%');
  ctx.selectedBase64A = '';
  ctx.setupBeforeAfter();
  assert.equal(beforeWrap.style.display, 'none'); assert.equal(compareHandle.style.display, 'none', 'بلا صورة لا مقبض');
  assert.doesNotMatch(A13, /beforeWrap\.style\.display = 'none'/, 'كلّ إخفاء للطبقة يمرّ بـstudioBaShow فيُخفي المقبض معها');
});

test('٦. زرّ «قارن الستايلات» لاصق أسفل النافذة ما دامت القائمة مفتوحة', () => {
  assert.match(PC, /#studioAiCompareMore\[open\] #studioAiCompareBtn\{position:sticky; bottom:8px;[^}]*\}/);
});

test('٧. مفتاح studioBasketImgMax بالـ١٤ لغة وفيه {n}', () => {
  const ctx = { window: {} }; ctx.window = ctx;
  vm.createContext(ctx);
  const a3 = read('js/app-03-i18n-data.js').replace(/^const (codeEl|previewFrame|emptyState|historyEl) = .*$/mg, '');
  vm.runInContext(a3 + '\n;this.I18N = I18N;', ctx);
  for (const l of LANGS) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  const I = ctx.I18N;
  assert.match(I.ar.studioBasketImgMax || '', /[؀-ۿ]/);
  for (const l of ['ar', 'en'].concat(LANGS)) {
    assert.ok(I[l] && I[l].studioBasketImgMax, l);
    assert.ok(I[l].studioBasketImgMax.includes('{n}'), l + ' {n}');
  }
  assert.match(cut(A13, '  const STUDIO_BASKET_MAX = 5', '  async function studioChainOne('), /t2\('studioBasketImgMax'\)\.replace\('\{n\}', STUDIO_IMAGES_MAX\)/, 'لا bT ثنائيّ اللغة للرسالة الجديدة');
});
