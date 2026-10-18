'use strict';
/* v-desk-strips — المالك ١٨ أكتوبر: «في اشياء موجوده في الهاتف وغير موجوده في الكمبيوتر». فحص ورك فلو (٤ عدسات + مشكّك لكلّ ملاحظة):
   صفوف أفقيّة يسحبها الهاتف باللمس وكانت مقصوصة على الكمبيوتر (أشرطة التمرير مخفيّة): مقارنة الأزياء (٣ من ٣٧)، مقارنة الديكور ونتائجها
   (١٠ من ٤٨)، رفوف شاشة الأدوات (١٠٢٥–١٢٠٣ بكسل)؛ وأسماء «الكود المقروء» تُقصّ بعد الرابع؛ و«الملفات» لا يفعل شيئًا واللوحة مطويّة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const A13 = read('js/app-13-stocks-init.js');
const A = A13.indexOf('function stripDesktopScroll(el){');
const B = A13.indexOf('stripDesktopScroll(tabsWrap);', A);
const W0 = A13.indexOf('  const omranDeskStrip = (el) =>', B);
const W1 = A13.indexOf('\n', A13.indexOf("document.querySelectorAll('#sectionsToolsPopup .ptCarousel').forEach(omranDeskStrip);", W0));

function run({ phone = false } = {}) {
  const els = {}, win = {}, bound = [];
  const mk = (id) => ({ id, scrollWidth: 4984, clientWidth: 1100, scrollLeft: 0, n: 0, addEventListener() { this.n++; } });
  ['fashionAiCompareChecks', 'designCompareChecks', 'designCompareResults'].forEach((id) => { els[id] = mk(id); });
  const shelves = [mk('shelf0'), mk('shelf1')];
  const window = { addEventListener: (t, f) => { (win[t] = win[t] || []).push(f); } };
  const ctx = {
    Math, Date, window,
    document: {
      documentElement: { classList: { contains: (c) => c === 'mobile-ui' && phone } },
      getElementById: (id) => els[id] || null,
      querySelectorAll: (s) => (s === '#sectionsToolsPopup .ptCarousel' ? shelves : []),
    },
    getComputedStyle: () => ({ direction: 'rtl' }),
  };
  vm.createContext(ctx);
  vm.runInContext(A13.slice(A, A13.lastIndexOf('\n', B)) + '\n' + A13.slice(W0, W1), ctx); // بعد #1163 النداء «const stripUnlatch = stripDesktopScroll(tabsWrap);» — القصّ عند بداية سطره
  return { els, shelves, window, win };
}

test('١. الدالّة نفسها (#1154) بلا تعديل، وغلاف يُعرَض ويربط الصفوف الثلاثة والرفوف مرّة واحدة لكلّ عنصر', () => {
  assert.ok(A > 0 && B > A && W0 > B && W1 > W0, 'الغلاف بعد نداء tabsWrap فلا يدخل قصّ اختبار studio-strip-desktop');
  const r = run();
  assert.equal(typeof r.window.omranStripDesktopScroll, 'function');
  for (const id of ['fashionAiCompareChecks', 'designCompareChecks', 'designCompareResults']) {
    assert.equal(typeof r.els[id].__deskStrip, 'function', id + ': مربوط ومعه «فكّ القفل» (#1163)');
    assert.ok(r.els[id].n >= 4, id + ': العجلة والسحب والنقر وسحب الصورة');
  }
  r.shelves.forEach((s) => assert.equal(typeof s.__deskStrip, 'function'));
  const n0 = r.els.fashionAiCompareChecks.n;
  const u = r.window.omranStripDesktopScroll(r.els.fashionAiCompareChecks);
  assert.equal(r.els.fashionAiCompareChecks.n, n0, 'لا ربط مرّتين');
  assert.equal(u, r.els.fashionAiCompareChecks.__deskStrip, 'يرجع «فكّ القفل» نفسه');
  assert.equal(r.window.omranStripDesktopScroll(null), null, 'لا خطأ');
  // فتح نافذتي الأزياء والديكور يفكّ قفل صفّيهما كما يفعل الاستوديو (#1163)
  const tail = A13.slice(W1, A13.indexOf('\n  btnOpen.onclick', W1));
  assert.ok(tail.includes("[['btnFashionAI', ['fashionAiCompareChecks']], ['btnDesignAI', ['designCompareChecks', 'designCompareResults']]]"));
  assert.ok(tail.includes("if(b) b.addEventListener('click', () => ids.forEach((id) => { const u = omranDeskStrip(document.getElementById(id)); if(u) u(); }));"));
});

test('٢. الجزء الذي يبني الرفوف يربط ما يُبنى بعده، و«الملفات» يفرد اللوحة على الكمبيوتر وحده', () => {
  const a10 = read('js/app-10-features.js');
  assert.ok(a10.includes("if(viewport && typeof window.omranStripDesktopScroll === 'function') window.omranStripDesktopScroll(viewport);"));
  const h = a10.slice(a10.indexOf('btnToggleHistory.onclick = () => {'), a10.indexOf('};', a10.indexOf('btnToggleHistory.onclick = () => {')) + 2);
  assert.match(h, /switchWorkTab\('code'\); openDrawer\(workareaEl\);/, 'مسار الهاتف كما هو');
  assert.match(h, /if\(!document\.documentElement\.classList\.contains\('mobile-ui'\) && typeof window\.waAutoExpand === 'function'\) window\.waAutoExpand\(\);/);
  // تشغيل المعالج: كمبيوتر مطويّ يُفرَد، والهاتف لا
  for (const phone of [false, true]) {
    let expanded = 0, drawer = 0, tab = '';
    const ctx = { document: { documentElement: { classList: { contains: (c) => c === 'mobile-ui' && phone } } }, window: { waAutoExpand: () => { expanded++; } },
      switchWorkTab: (t) => { tab = t; }, openDrawer: () => { drawer++; }, workareaEl: {}, btnToggleHistory: {} };
    vm.createContext(ctx);
    vm.runInContext(h, ctx);
    ctx.btnToggleHistory.onclick();
    assert.equal(tab, 'code'); assert.equal(drawer, 1);
    assert.equal(expanded, phone ? 0 : 1, phone ? 'الهاتف بلا تغيير' : 'الكمبيوتر يفرد اللوحة');
  }
});

test('٣. CSS للكمبيوتر وحده: لا التقاط في الصفوف التي تمرّرها الفأرة، وأسماء «الكود المقروء» تلتفّ، والوسم رُفع، والحزمة مبنيّة', () => {
  const css = read('css/redesign.css');
  assert.ok(css.includes('html:not(.mobile-ui) :is(#fashionAiCompareChecks, #designCompareChecks, #designCompareResults, #sectionsToolsPopup .ptCarousel){ scroll-snap-type:none !important; }'));
  assert.ok(css.includes('html:not(.mobile-ui) .rdFiles{ flex-wrap:wrap; max-height:92px; overflow-y:auto; }'));
  const tail = css.slice(css.indexOf('/* v-desk-strips'));
  assert.ok(!/(^|\n)\s*(#fashionAiCompareChecks|#designCompareChecks|\.rdFiles|html\.mobile-ui)/.test(tail), 'لا قاعدة للهاتف');
  assert.ok(Number((/redesign\.css\?v=(\d+)/.exec(read('index.html')) || [])[1]) >= 693);
  const b = read('js/app.bundle.js');
  assert.ok(b.includes('window.omranStripDesktopScroll = omranDeskStrip;') && b.includes("window.omranStripDesktopScroll(viewport);"));
});
