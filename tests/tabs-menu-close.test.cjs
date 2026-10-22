'use strict';
/* v-review-menu-close (تدقيق ١٨ أكتوبر، g06/work-tabs-menu): «مراجعة» و«تحليل» في قائمة ⋮ يوقفان انتشار النقرة
   (e.stopPropagation) فلا يصل مستمع الإغلاق على القائمة نفسها (app-10)، فتبقى مفتوحة: على الجوّال فوق النافذة
   (zIndex 99999 > 99000) تغطّي «اختر ملفًّا»، وعلى الحاسوب خلفها.
   القرار: app-10 يعرّض إغلاق القائمة (window.omranCloseTabsMenu — يعيدها لمكانها ويطفئ الزرّ)، والزرّان يناديانه قبل فتح
   النافذة، واحتياطًا يزيلان show مباشرة إن غاب. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeDom } = require('./_mini-dom.cjs');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const A10 = read('js/app-10-features.js');
const MENU_IIFE = (() => {
  const a = A10.indexOf('// v207: قائمة ⋮ في شريط التبويبات');
  const b = A10.indexOf('// v207: تقسيم قائمة ⋮ الرئيسية');
  assert.ok(a > 0 && b > a, 'كتلة قائمة ⋮ في app-10');
  return A10.slice(a, b);
})();

function world(mobile, withMenuIife = true) {
  const { document } = makeDom();
  if (mobile) document.documentElement.classList.add('mobile-ui');
  const wrap = document.createElement('div'); wrap.id = 'tabDownloadWrap'; document.body.appendChild(wrap);
  const btn = document.createElement('button'); btn.id = 'btnTabsMenu'; wrap.appendChild(btn);
  const dd = document.createElement('div'); dd.id = 'tabsMenuDropdown'; wrap.appendChild(dd);
  const ctx = {
    document, lang: 'en', t: (k) => k, console, innerWidth: 390,
    sessionStorage: { getItem: () => '' }, localStorage: { getItem: () => '' },
    fetch: () => Promise.reject(new Error('x')), TextDecoder, TextEncoder, Intl,
    setTimeout, clearTimeout, setInterval, clearInterval, getCurrent: () => null,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  if (withMenuIife) vm.runInContext(MENU_IIFE, ctx);
  vm.runInContext(read('js/app-24-codefix.js'), ctx);
  vm.runInContext(read('js/app-27-codescore.js'), ctx);
  return { ctx, document, btn, dd, wrap };
}

for (const [id, ov] of [['btnCodeFix', 'cfxOverlay'], ['btnCodeScore', 'csOverlay']]) {
  for (const mobile of [false, true]) {
    test(id + (mobile ? ' (جوّال)' : ' (حاسوب)') + ': القائمة تُغلق وتعود لمكانها والنافذة تنفتح', () => {
      const { document, btn, dd, wrap } = world(mobile);
      btn.click();
      assert.ok(dd.classList.contains('show'), 'القائمة مفتوحة');
      if (mobile) assert.equal(dd.parentNode, document.body, 'على الجوّال تنتقل إلى body');
      document.getElementById(id).click();
      assert.ok(!dd.classList.contains('show'), 'القائمة ما زالت مفتوحة فوق النافذة');
      assert.ok(!btn.classList.contains('active'), 'زرّ ⋮ مطفأ');
      assert.equal(dd.parentNode, wrap, 'القائمة عادت لمكانها');
      assert.equal(dd.style.zIndex, '', 'بلا zIndex الجوّال');
      assert.ok(document.getElementById(ov), 'النافذة مفتوحة');
    });
  }
  test(id + ': بلا إغلاق app-10 المعرَّض يُزال show مباشرة', () => {
    const { document, dd } = world(false, false);
    dd.classList.add('show');
    document.getElementById(id).click();
    assert.ok(!dd.classList.contains('show'));
    assert.ok(document.getElementById(ov));
  });
}
