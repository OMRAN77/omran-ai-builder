'use strict';
/* v-cpu-calm (المالك ٢٩ سبتمبر: «التطبيق ثقيل، يتأخّر إذا يدخل أيّ مكان، وإذا أكتب يعلّق ويقمل الكتابة — الحين
   التطبيق كامل»): تطبيق هواوي يرسم بالمعالج المركزيّ، فكلّ إطار = الشاشة كلّها في المعالج. مسبار التتبّع (الشاشة
   ساكنة ٤ ثوانٍ، ?store=huawei): ٦٠ إعادة رسم بلا خلفيّة (نجوم الشعار ×٣، نجوم زرّ المحادثة الجديدة ×٤، أيقونة
   الشريط)، و٢٤٢ مع المجرّة (٦٠ إطارًا/ث). بعد الإصلاح: ٢ في الحالات الثلاث. هنا يعمل الكود الحقيقيّ في vm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const HTML = fs.readFileSync('index.html', 'utf8');
const UI = fs.readFileSync('js/app-05-ui.js', 'utf8');
const BUNDLE = fs.readFileSync('js/app.bundle.js', 'utf8');

/* ── العلامة المبكّرة في index.html ── */
const A = HTML.indexOf('/* v-cpu-calm (المالك');
const SNIP = HTML.slice(A, HTML.indexOf('})();', A) + 5);
function flag({ bridge, search = '', store = null, storeThrows = false }) {
  const cls = new Set();
  const ctx = {
    window: bridge === undefined ? {} : { OmranRender: { mode: () => bridge } },
    location: { search },
    sessionStorage: { getItem: () => { if (storeThrows) throw new Error('blocked'); return store; } },
    document: { documentElement: { classList: { add: (c) => cls.add(c) } } },
    String, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(SNIP, ctx);
  return cls.has('omCpu');
}

test('١. العلامة قبل أوّل رسم: الجسر يقول cpu، أو حزمة هواوي بلا جسر — والمتصفّح والأجهزة العاديّة بلا علامة', () => {
  assert.ok(A > 0 && HTML.indexOf('v-cpu-calm') < HTML.indexOf('/js/app.bundle.js'), 'قبل الحزمة');
  assert.equal(flag({ bridge: 'cpu' }), true);
  assert.equal(flag({ bridge: 'gpu-video' }), true, 'أثناء فيديو يبقى جهاز المعالج');
  assert.equal(flag({ bridge: 'gpu' }), false, 'غلاف على جهاز بمعالج رسوم سليم');
  assert.equal(flag({ search: '?store=huawei' }), true);
  assert.equal(flag({ store: 'huawei' }), true, 'العلم المحفوظ للجلسة');
  assert.equal(flag({ search: '?store=huawei', storeThrows: true }), true, 'تخزين مقفل لا يُسقطها');
  assert.equal(flag({}), false, 'متصفّح عاديّ');
  assert.equal(flag({ bridge: 'gpu', search: '?store=huawei' }), false, 'الجسر أصدق من الرابط');
});

test('٢. الزخرفة الدائمة تسكن تحت العلامة كما في «تقليل الحركة» — ونجوم الشعار تبقى ظاهرة', () => {
  assert.match(HTML, /html\.omCpu #omranNewChatBtn > \.omStar, html\.omCpu #omranNewChatBtn::after\{ animation:none!important; \}/);
  assert.match(HTML, /html\.omCpu \.omBrandStar\{ animation:none!important; opacity:1; transform:none; \}/);
  assert.match(HTML, /html\.omCpu #stockTickerAiIcon\{ animation:none!important; \}/);
});

/* ── الخلفيّات: initCustomBg3D الحقيقيّة في vm بلوحة مزيّفة ── */
const FN = UI.slice(UI.indexOf('function bg3dStill()'), UI.indexOf('function getBg3DAccentColorHex('));
function bootBg(id, still) {
  const listeners = [];
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (/^create(Linear|Radial)Gradient$/.test(k) ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
  const canvas = { style: {}, width: 0, height: 0, getContext: () => ctx2d };
  const galaxy = { draws: 0, resizes: 0 };
  const sb = {
    Math, performance: { now: () => 1000 },
    document: {
      documentElement: { classList: { contains: (c) => still && c === 'omCpu' } },
      getElementById: () => ({ appendChild() {} }),
      createElement: () => canvas,
    },
    window: { innerWidth: 400, innerHeight: 800, devicePixelRatio: 2, addEventListener: (t, f) => listeners.push([t, f]), removeEventListener: (t, f) => { const i = listeners.findIndex((l) => l[0] === t && l[1] === f); if (i >= 0) listeners.splice(i, 1); } },
    requestAnimationFrame: () => { sb.rafs++; return 1; },
    rafs: 0,
    setTimeout: (f) => { f(); return 1; }, clearTimeout: () => {},
    bg3dGalaxy: () => ({ resize: () => { galaxy.resizes++; }, draw: () => { galaxy.draws++; } }),
    bg3dPalette: () => new Proxy({}, { get: (t, k) => (k === 'wave' ? ['#000', '#000', '#000'] : k === 'light' ? false : '0,0,0') }),
    currentCustomBg: null,
  };
  vm.createContext(sb);
  vm.runInContext(FN + '\ninitCustomBg3D(' + JSON.stringify(id) + ');', sb);
  return { sb, galaxy, listeners };
}

test('٣. المجرّة في رسم هواوي: لقطة واحدة بلا حلقة rAF، وتُعاد بعد التحجيم فقط — وخارجه الحلقة كما كانت', () => {
  const s = bootBg('galaxy', true);
  assert.equal(s.sb.rafs, 0, 'لا حلقة');
  assert.ok(s.galaxy.draws >= 1, 'رُسمت اللقطة');
  const resizeHandlers = s.listeners.filter((l) => l[0] === 'resize');
  assert.equal(resizeHandlers.length, 1, 'مستمع تحجيم واحد (اللقطة) — القديم أُزيل');
  assert.equal(s.sb.currentCustomBg.resizeHandler, resizeHandlers[0][1], 'destroyBg3D يزيله');
  const before = s.galaxy.draws;
  resizeHandlers[0][1]();
  assert.ok(s.galaxy.draws > before && s.galaxy.resizes >= 2, 'التحجيم يعيد البناء واللقطة');
  const live = bootBg('galaxy', false);
  assert.equal(live.sb.rafs, 1, 'المتصفّح: الحلقة كما كانت');
});

test('٤. خلفيّات Canvas الأخرى (نجوم، مطر، ثلج…) لقطة ثابتة كذلك', () => {
  for (const id of ['stars', 'rain', 'snow', 'bubbles', 'fireflies', 'ocean']) {
    const s = bootBg(id, true);
    assert.equal(s.sb.rafs, 0, id + ': لا حلقة');
    assert.equal(s.listeners.filter((l) => l[0] === 'resize').length, 1, id + ': مستمع واحد');
    assert.equal(bootBg(id, false).sb.rafs, 1, id + ': المتصفّح كما كان');
  }
});

test('٥. Vanta تُوقف حلقته بعد أوّل الإطارات تحت العلامة، والحزمة تحمل الأجزاء', () => {
  assert.match(UI, /if\(bg3dStill\(\) && currentVantaEffect\)\{[\s\S]*?cancelAnimationFrame\(eff0\.req\); eff0\.req = null;/);
  assert.ok(BUNDLE.includes('function bg3dStill(){'), 'الحزمة أُعيد بناؤها');
  assert.ok(BUNDLE.includes('const onStill = () => { resizeAndReset(); draw(); };'));
});
