'use strict';
/* v-frame-gold — الإطار الخارجيّ بخطّ ذهبيّ واحد ولمسة الضغط (أمر المالك بعد المعاينة: «ادمج»). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const CSS = rd('css/إطارات.css');
const D = 'html:not\\(\\[data-mode="light"\\]\\):not\\(\\.mobile-ui\\):not\\(\\.bgimg\\):not\\(\\.skin\\):not\\(\\.skin-wood\\)';
const L = 'html\\[data-mode="light"\\]:not\\(\\.mobile-ui\\):not\\(\\.bgimg\\):not\\(\\.skin\\):not\\(\\.skin-wood\\)';
const A = 'html:not\\(\\.mobile-ui\\):not\\(\\.bgimg\\):not\\(\\.skin\\):not\\(\\.skin-wood\\)';

test('١. خطّ ذهبيّ واحد حول اللوحات الثلاث بلا الخطّ الجوّانيّ، للكمبيوتر بلا الخلفيّات والثيمات', () => {
  const sec = CSS.slice(CSS.indexOf('v-frame-gold'));
  assert.ok(CSS.indexOf('v-frame-gold') > CSS.indexOf('@media (min-width:861px){'), 'داخل كتلة الكمبيوتر');
  assert.match(sec, new RegExp(A + ' #sidebar, ' + A + ' #workarea, ' + A + ' #omFrameCenter\\{ border:1px solid transparent !important; border-radius:22px !important;'));
  assert.match(sec, new RegExp(A + ' #omFrameCenter::after\\{ display:none !important; \\}'));
  assert.match(sec, /var\(--om-gold-line\) border-box !important/);
  assert.match(sec, /--om-gold-line:linear-gradient\(160deg,rgba\(212,175,55,\.6\)/);
  assert.match(sec, /--om-gold-line:linear-gradient\(160deg,rgba\(184,144,44,\.7\)/);
});

test('٢. الأسود كلّه #000 بلا توهّج، والعاجيّ كلّه #f9f2e4 بتوهّج أسفل اللوحات، والنقاط ٢٢px', () => {
  const sec = CSS.slice(CSS.indexOf('v-frame-gold'));
  assert.match(sec, new RegExp(A + '\\{[^}]*--om-panel:linear-gradient\\(#000,#000\\); --om-glow:linear-gradient\\(transparent,transparent\\);'));
  assert.match(sec, new RegExp(L + '\\{[^}]*--om-panel:linear-gradient\\(#f9f2e4,#f9f2e4\\); --om-glow:radial-gradient\\(120% 38% at 50% 100%,rgba\\(236,206,140,\\.32\\)'));
  assert.match(sec, new RegExp(D + ', ' + D + ' body, ' + D + ' body\\.omranWelcome\\{ background:#000 !important; \\}'));
  assert.match(sec, new RegExp(L + ' body, ' + L + ' body\\.omranWelcome\\{ background:#f9f2e4 !important; \\}'));
  assert.match(sec, new RegExp(D + ' #code\\{ background:#000 !important; \\}'));
  assert.match(sec, /background:var\(--om-dots\) 0 0 \/ 22px 22px padding-box/);
});

test('٣. الشعار بلا النجوم، وصينيّة الأدوات، والمختار ذهبيّ، والكتابة كما هي', () => {
  const sec = CSS.slice(CSS.indexOf('v-frame-gold'));
  assert.match(sec, new RegExp(A + ' #sidebarBrand \\.omStars\\{ display:none !important; \\}'));
  assert.match(sec, new RegExp(D + ' #omranSidebarFoot\\{ background:rgba\\(16,16,19,\\.85\\) !important;'));
  assert.match(sec, new RegExp(D + ' #tabs \\.tab\\.active\\{ background:linear-gradient\\(135deg,rgba\\(212,175,55,\\.2\\)'));
  assert.doesNotMatch(sec.replace(/\/\*[\s\S]*?\*\//g, ''), /#composerBox|#omranNewChatBtn|#inputbar/, 'الكتابة وزرّ المحادثة الجديدة لم يُمسّا');
  const v = rd('index.html').match(/css\/إطارات\.css\?v=(\d+)/);
  assert.ok(v && Number(v[1]) >= 6, 'الوسم مرفوع');
});

function run(opts) {
  const made = []; const ls = {}; const winLs = {}; let raf = 0;
  const mk = () => ({ listeners: {}, addEventListener(ev, fn) { this.listeners[ev] = fn; }, insertBefore(n) { made.push(n); }, firstChild: null, clientWidth: 300, clientHeight: 500, getBoundingClientRect: () => ({ left: 0, top: 0 }) });
  const sidebar = mk(), workarea = mk();
  const cls = new Set(opts.cls || []);
  const ctx2d = { setTransform() {}, clearRect() {}, fillText() {} };
  const document = {
    documentElement: { classList: { contains: (c) => cls.has(c), toggle() {} }, getAttribute: () => null, style: { setProperty() {}, removeProperty() {} } },
    getElementById: (id) => (id === 'sidebar' ? sidebar : id === 'workarea' ? workarea : null),
    createElement: () => ({ style: {}, setAttribute() {}, getContext: () => ctx2d }),
  };
  const window = { innerWidth: opts.w || 1400, devicePixelRatio: 1, addEventListener(ev, fn) { winLs[ev] = fn; }, matchMedia: () => ({ matches: !!opts.reduce }), performance: { now: () => 0 } };
  window.window = window;
  vm.runInNewContext(rd('js/frame-touch.js'), { window, document, Math, Float32Array, Date, requestAnimationFrame: () => { raf++; } });
  return { sidebar, workarea, made, winLs, raf: () => raf };
}

test('٤. لمسة الضغط: على فراغ القائمة ترسم، وعلى الأزرار لا، ولا على الجوّال/الثيمات/«قلّل الحركة»', () => {
  const ev = (inBtn) => ({ clientX: 50, clientY: 60, target: { closest: () => (inBtn ? {} : null) } });
  const a = run({});
  a.sidebar.listeners.pointerdown(ev(false));
  assert.equal(a.made.length, 1, 'لوحة رسم واحدة');
  assert.equal(a.made[0].className, 'omFx');
  assert.match(a.made[0].style.cssText, /pointer-events:none;z-index:-1/);
  assert.equal(a.raf(), 1, 'الرسم يبدأ مع الضغط وحده');
  a.workarea.listeners.pointerdown(ev(true));
  assert.equal(a.made.length, 1, 'الأزرار والخانات بلا أثر');
  for (const o of [{ cls: ['mobile-ui'] }, { cls: ['bgimg'] }, { cls: ['skin'] }, { cls: ['omCpu'] }, { reduce: true }, { w: 700 }]) {
    const b = run(o); b.sidebar.listeners.pointerdown(ev(false));
    assert.equal(b.made.length, 0, JSON.stringify(o));
  }
  assert.ok(a.winLs.pointerup, 'الإفلات على النافذة');
  assert.match(rd('index.html'), /<script defer src="\/js\/app\.bundle\.js\?v=[0-9a-f]+"><\/script>\n    <script defer src="\/js\/frame-touch\.js\?v=(\d+)"><\/script>/, 'تُحمَّل بعد الحزمة');
  assert.doesNotMatch(rd('js/frame-touch.js'), /\?\.|\?\?|=>|\blet\b|\bconst\b/, 'ES5 للمتصفّحات القديمة');
});
