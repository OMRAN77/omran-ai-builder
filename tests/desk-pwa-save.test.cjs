// tests/desk-pwa-save.test.cjs — v-desk-pwa-save (لقطة المالك ٧ نوفمبر: «شوفلي تحميل الصور في الانماط لي الكمبوتر ماقدر بعض الصور»
// ثمّ «مايشتغل» بلقطتين: زرّ «تحميل الصورة» يفتح لوحة «مشاركة» ويندوز تدور بلا نهاية).
// الجذر: التطبيق المثبّت على الكمبيوتر (PWA، display-mode: standalone) كان omranLikelyApp() = غلاف جوّال، فيمرّ حفظ الصور بلوحة مشاركة
// النظام بدل التنزيل المباشر. المسبار (.shots/portrait-download/probe.mjs، Chromium): قبل — مشاركة ١ وتنزيل لا شيء؛ بعد — مشاركة ٠
// وتنزيل omran-portrait-style.png؛ وتطبيق أندرويد المثبّت كما كان (لوحة النظام).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-05-ui.js'), 'utf8');
function fn(name) {
  const a = SRC.indexOf('function ' + name + '(');
  assert.ok(a >= 0, name);
  const b = SRC.indexOf('\n}\n', a);
  return SRC.slice(a, b + 2);
}
const CODE = ['omranNativeBridge', 'omranHwWebView', 'omranMobileUA', 'omranLikelyApp'].map(fn).join('\n');

const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};
function likelyApp(o) {
  const store = (init) => { const m = new Map(Object.entries(init || {})); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
  const ctx = {
    navigator: { userAgent: o.ua, platform: o.platform || '', maxTouchPoints: o.touch || 0, standalone: o.iosStandalone },
    document: { referrer: '' },
    localStorage: store(o.local), sessionStorage: store(o.session),
    matchMedia: (q) => ({ matches: !!o.standalone && /display-mode:\s*standalone/.test(q) }),
    __swallow() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(CODE + '\n;this.__r = omranLikelyApp();', ctx);
  return ctx.__r;
}

test('١. التطبيق المثبّت على الكمبيوتر (ويندوز وماك، standalone) ليس غلاف جوّال — الحفظ تنزيل مباشر', () => {
  assert.equal(likelyApp({ ua: UA.windows, platform: 'Win32', standalone: true }), false);
  assert.equal(likelyApp({ ua: UA.mac, platform: 'MacIntel', standalone: true }), false);
});

test('٢. تطبيق الجوّال المثبّت (أندرويد، آيفون، آيباد) يبقى تطبيقًا كما كان', () => {
  assert.equal(likelyApp({ ua: UA.android, platform: 'Linux armv8l', standalone: true }), true);
  assert.equal(likelyApp({ ua: UA.iphone, platform: 'iPhone', standalone: true }), true);
  assert.equal(likelyApp({ ua: UA.iphone, platform: 'iPhone', iosStandalone: true }), true);
  assert.equal(likelyApp({ ua: UA.mac, platform: 'MacIntel', touch: 5, standalone: true }), true, 'آيباد بواجهة ماك');
});

test('٣. أغلفة المتجر تبقى تطبيقًا على أيّ جهاز، والمتصفّح العاديّ ليس تطبيقًا', () => {
  assert.equal(likelyApp({ ua: UA.windows, platform: 'Win32', local: { aiapp_twa: '1' } }), true);
  assert.equal(likelyApp({ ua: UA.windows, platform: 'Win32', session: { aiapp_store: 'huawei' } }), true);
  assert.equal(likelyApp({ ua: UA.windows, platform: 'Win32' }), false);
  assert.equal(likelyApp({ ua: UA.android, platform: 'Linux armv8l' }), false, 'متصفّح الجوّال ليس تطبيقًا (omranMobileUA يغطّيه)');
});

test('٤. زرّ «تحميل الصورة» في الأنماط يسلك التنزيل المباشر حين لا جوّال ولا تطبيق', () => {
  const st = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-12-studios.js'), 'utf8');
  assert.match(st, /const mobile = \(typeof omranMobileUA === 'function' && omranMobileUA\(\)\) \|\| \(typeof omranLikelyApp === 'function' && omranLikelyApp\(\)\);\n\s*if\(!mobile \|\| typeof window\.omranSaveImage !== 'function'\) return;/);
});
