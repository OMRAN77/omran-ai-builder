// tests/portrait-ring.test.cjs — v-ring-i18n + v-no-flag (تدقيق ١٨ أكتوبر، g08 portrait-open):
// - أسماء حلقة الستايلات إنجليزيّة ثابتة (RING_EN: Anime وPixel Art…) بلا t()، وتبقى بعد تبديل اللغة (الحلقة تُبنى مرّة).
// - الأسماء مقصوصة «yberpun» و«Watercolo»: الاسم في أسفل الدائرة (bottom:0، nowrap) حيث الوتر أضيق من الكلمة.
// - علم الإمارات يظهر «AE» على ويندوز (لا رموز أعلام ملوّنة فيه): «🇦🇪 إطار وطني» تُعرض كما هي في البطاقة والشريط السفليّ والمشغّل.
// الآن: الاسم من خيار القائمة المترجَم بلا إيموجي، ويتحدّث في كلّ فتحة، وفي الشريط العريض من الدائرة سطرين؛ وnoFlag يزيل أزواج
// علامات المناطق من الأسماء المعروضة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const A12 = read('js/app-12-studios.js');
const cut = (s, a, b) => {
  const i = s.indexOf(a); assert.ok(i >= 0, 'مقطع مفقود: ' + a);
  const j = s.indexOf(b, i + a.length); assert.ok(j > i, 'نهاية مفقودة: ' + b);
  return s.slice(i, j);
};
function boot(texts, lang) {
  const opts = Object.keys(texts).map((v) => ({ value: v, textContent: texts[v], hasAttribute: (k) => k === 'data-i18n', getAttribute: () => null }));
  const styleEl = { querySelector: (s) => opts.find((o) => s === 'option[value="' + o.value + '"]') || null };
  const ctx = { styleEl, localStorage: { getItem: () => lang || 'ar' }, window: {}, STU_XL: {}, PSTYLE_SUBS: {}, stuL: (a) => a, Array, String };
  vm.createContext(ctx);
  vm.runInContext(cut(A12, '  function pstyleLang(){', '  function pstyleOpts(){') + '\nthis.noFlag = typeof noFlag === "function" ? noFlag : null; this.refreshRingLabels = typeof refreshRingLabels === "function" ? refreshRingLabels : null;', ctx);
  return { ctx, opts };
}
function hero(vals) {
  const tiles = vals.map((v) => { const t = { attrs: { 'data-pstyle-ring': v }, getAttribute(k) { return this.attrs[k]; } }; t.i = { parentNode: t, textContent: '' }; return t; });
  return { tiles, querySelectorAll: (s) => (s === '[data-pstyle-ring] > i' ? tiles.map((t) => t.i) : []) };
}

test('١. noFlag يزيل علم الإمارات (وغيره من الأعلام) ويترك بقيّة الإيموجي والنصّ', () => {
  const { ctx } = boot({});
  assert.ok(ctx.noFlag, 'noFlag معرّفة في نطاق أنماط الصور');
  assert.equal(ctx.noFlag('🇦🇪 إطار وطني'), 'إطار وطني');
  assert.equal(ctx.noFlag('🇸🇦 تراث سعودي'), 'تراث سعودي');
  assert.equal(ctx.noFlag('🎬 أنيمي ياباني'), '🎬 أنيمي ياباني');
  assert.equal(ctx.noFlag('National Day Frame 🇦🇪'), 'National Day Frame');
  assert.equal(ctx.noFlag(''), '');
});

test('٢. أسماء الحلقة من الخيارات المترجَمة بلا إيموجي، وتتحدّث في النداء الثاني (تبديل اللغة)', () => {
  const { ctx, opts } = boot({ anime: '🎬 أنيمي ياباني', cyberpunk: '🚀 سايبربانك نيون', watercolor: '🖌️ ألوان مائية', lego: '🧱 شخصية ليغو' });
  assert.ok(ctx.refreshRingLabels, 'refreshRingLabels معرّفة');
  const h = hero(['anime', 'cyberpunk', 'watercolor', 'lego']);
  ctx.refreshRingLabels(h);
  assert.deepEqual(h.tiles.map((t) => t.i.textContent), ['أنيمي ياباني', 'سايبربانك نيون', 'ألوان مائية', 'شخصية ليغو']);
  opts[0].textContent = '🎬 Anime japonais';
  opts[1].textContent = '🚀 Cyberpunk néon';
  ctx.refreshRingLabels(h);
  assert.equal(h.tiles[0].i.textContent, 'Anime japonais');
  assert.equal(h.tiles[1].i.textContent, 'Cyberpunk néon');
  // «Comic/Manga» كلمة واحدة تفيض عن الدائرة — فاصل صفريّ بعد الشرطة المائلة
  const b = boot({ comic: '💥 Comic/Manga' }, 'en');
  const hc = hero(['comic']);
  b.ctx.refreshRingLabels(hc);
  assert.equal(hc.tiles[0].i.textContent, 'Comic/​Manga');
});

test('٣. لا RING_EN، والحلقة تُحدَّث في كلّ ensurePsheetChrome لا عند بنائها فقط', () => {
  assert.doesNotMatch(A12, /RING_EN/);
  const fn = cut(A12, '  function ensurePsheetChrome(){', '  function refreshPortraitFoot(){');
  const build = fn.indexOf("if(!hero){");
  const close = fn.indexOf('scroller.insertBefore(hero, styleCardsGrid);', build);
  const call = fn.indexOf('refreshRingLabels(hero);');
  assert.ok(build > 0 && close > build && call > close, 'النداء بعد كتلة البناء');
});

test('٤. قاعدة اسم الحلقة: في الشريط العريض سطرين، لا bottom:0 مع nowrap، وبلا direction:ltr', () => {
  const css = cut(A12, 'function ensurePsheetCss', 'function bindPsheetHeaderCollapse');
  const rule = (css.match(/'\.pstyleHero \.pstyleHeroT i\{[^}]*\}'/) || [''])[0];
  assert.ok(rule, 'القاعدة موجودة');
  assert.doesNotMatch(rule, /bottom:0[;\s]/);
  assert.doesNotMatch(rule, /white-space:nowrap/);
  assert.doesNotMatch(rule, /direction:ltr/);
  assert.match(rule, /white-space:normal/);
  assert.match(rule, /unicode-bidi:plaintext/);
  assert.match(rule, /-webkit-line-clamp:2/);
  assert.match(rule, /bottom:(1[6-9]|2[0-9])%/, 'الاسم مرفوع إلى حيث الوتر ≈ عرض الدائرة');
});

test('٥. الأسماء المعروضة تمرّ بـnoFlag: البطاقة والشريط السفليّ والمشغّل', () => {
  const cards = cut(A12, '  function renderPortraitStyleCards(){', '  if(styleTrigger) styleTrigger.onclick');
  assert.match(cards, /nameEl\.textContent = noFlag\(title\);/);
  assert.match(cut(A12, '  function refreshPortraitFoot(){', '  function showPortraitWork('), /pt\.textContent = o \? noFlag\(optLabel\(o\)\) : '';/);
  assert.match(cut(A12, '  function refreshStyleTrigger(){', '  /* v-psheet-oneface'), /nameEl\.textContent = opt \? noFlag\(opt\.textContent\) : '';/);
});
