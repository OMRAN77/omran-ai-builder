'use strict';
/* v-first-run-floating (تدقيق ١٨–١٩ أكتوبر، g01 وg13): أوّل تشغيل والطبقات العائمة.
   أ. شاشة الافتتاح (#omranIntro) حُذفت نهائيًّا (v-no-intro، المالك ٢٦ أكتوبر) — كان هنا اختبارا ترجمتها وكبسولتها.
   ج. زرّا الموافقة نصّهما في الوسط (‎.btn‎ ‏inline-flex بلا justify-content).
   د. التلميح الأوّل لا يُحسب مُشاهَدًا وهو خلف ورقة الموافقة: مؤقّت الـ٢٥ ثانية يبدأ بعد زوالها.
   هـ. شريطا الانقطاع والتجمّد كبسولة متوسّطة على الحاسوب لا شريط يغطّي أيقونات الرأس.
   و. لوحة التشخيص لا تسمّي كروم «سفاري». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const APP10 = rd('js/app-10-features.js');
const DIAG = rd('js/selfdiag.js');
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

test('أ. شاشة الافتتاح حُذفت نهائيًّا (v-no-intro): لا وسم ولا أنماط ولا سكربت ولا جزء ولا مفتاح إعدادات، والصورة باقية', () => {
  assert.doesNotMatch(HTML, /id="omranIntro"|v-intro-splash|oiOn|introSkip/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'js/app-00-intro.js')), 'جزء الحزمة حُذف');
  assert.doesNotMatch(rd('js/partials-settings.js'), /chkIntroSplash|introSplashLabel/);
  assert.doesNotMatch(APP10, /omranIntro/);
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/intro/splash.jpg')), 'الوسائط الكبيرة غير المستعملة تبقى (قرار مالك)');
});

test('ج. زرّا «قراءة السياسة» و«أوافق وأتابع» نصّهما في الوسط', () => {
  const fn = (APP10.match(/\(function privacyFirstLaunch\(\)\{[\s\S]*?\n\}\)\(\);/) || [''])[0];
  assert.ok(fn, 'privacyFirstLaunch');
  const read = (fn.match(/<a href="\/privacy\.html" target="_blank" rel="noopener" class="btn" style="([^"]+)"/) || [])[1] || '';
  const agree = (fn.match(/id="privacyAgreeBtn" class="btn primary" style="([^"]+)"/) || [])[1] || '';
  assert.ok(read && agree, 'نمطا الزرّين');
  assert.match(read, /justify-content:center/, 'قراءة السياسة');
  assert.match(agree, /justify-content:center/, 'أوافق وأتابع');
});

/* ── د. كتلة «اسأل الكل + التلميح الأوّل» الحقيقيّة بمؤقّتات وهميّة ── */
function hintWorld(blockers) {
  const src = (APP10.match(/\/\/ 🧠 Ask-All toggle button \+ first-time hint\n\(function\(\)\{[\s\S]*?\n\}\)\(\);/) || [''])[0];
  assert.ok(src, 'كتلة التلميح');
  let now = 0; const timers = [];
  const setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), fn }); return timers.length; };
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift(); now = t.at; t.fn();
    }
    now = end;
  };
  const ls = new Map();
  const tip = { id: 'askAllHintTip', style: {}, removed: false, attrs: {}, setAttribute(k, v) { tip.attrs[k] = v; }, addEventListener() {}, remove() { tip.removed = true; } };
  const present = new Set(blockers);
  const bar = { parentNode: { insertBefore() {} } };
  const document = {
    getElementById: (id) => {
      if (id === 'btnAskAllToggle') return { style: {}, addEventListener() {} };
      if (id === 'inputbar') return bar;
      return present.has(id) ? { id } : null;
    },
    createElement: () => tip,
  };
  const ctx = {
    window: {}, document, setTimeout, __swallow() {},
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) },
    t: (k) => k,
  };
  vm.runInNewContext(src, ctx);
  return { advance, ls, tip, present };
}

test('د. التلميح خلف شاشة الموافقة لا يُحسب مُشاهَدًا؛ المؤقّت يبدأ بعد زوالها', () => {
  for (const blocker of ['privacyConsent']) {
    const w = hintWorld([blocker]);
    w.advance(30000);
    assert.equal(w.ls.get('askAllHintSeen'), undefined, blocker + ': بعد ٣٠ث خلفه لم يُحسب مُشاهَدًا');
    assert.equal(w.tip.removed, false, blocker + ': التلميح باقٍ');
    w.present.delete(blocker);
    w.advance(20000);
    assert.equal(w.tip.removed, false, blocker + ': بعد زواله بـ٢٠ث ما زال ظاهرًا');
    w.advance(7000);
    assert.equal(w.ls.get('askAllHintSeen'), '1', blocker + ': بعد زواله بأكثر من ٢٥ث يُغلق ويُحفظ');
    assert.equal(w.tip.removed, true);
  }
  const free = hintWorld([]);
  free.advance(25000);
  assert.equal(free.ls.get('askAllHintSeen'), '1', 'بلا حاجب: ٢٥ ثانية كما كان');
});

/* ── هـ. شريطا الانقطاع والتجمّد على الحاسوب ── */
function allCss() {
  const html = HTML.replace(/<!--[\s\S]*?-->/g, '');
  const re = /<link rel="stylesheet" href="(css\/[^"?]+)[^"]*"|<style\b[^>]*>([\s\S]*?)<\/style>/g;
  let m; let out = '';
  while ((m = re.exec(html))) out += '\n' + (m[1] ? rd(m[1]) : m[2]);
  return out.replace(/\/\*[\s\S]*?\*\//g, '');
}
test('هـ. #offlineBanner و#freezeBanner كبسولة متوسّطة تحت html:not(.mobile-ui) تغلب النمط المضمّن، والجوّال بلا قاعدة', () => {
  const css = allCss();
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(css))) if (/#(offline|freeze)Banner\b/.test(m[1])) rules.push({ sel: m[1].trim(), body: m[2] });
  for (const id of ['offlineBanner', 'freezeBanner']) {
    const desk = rules.find((r) => r.sel.split(',').some((s) => /html:not\(\.mobile-ui\)/.test(s) && s.includes('#' + id)));
    assert.ok(desk, id + ': قاعدة حاسوب');
    for (const [prop, val] of [['top', '8px'], ['left', '50%'], ['right', 'auto'], ['transform', 'translateX\\(-50%\\)'], ['width', 'max-content']]) {
      assert.match(desk.body, new RegExp('(^|;)\\s*' + prop + ':\\s*' + val + '\\s*!important'), id + ': ' + prop + ' بـ!important (النمط المضمّن top:0;left:0;right:0)');
    }
    assert.match(desk.body, /max-width:\s*\d+vw/, id + ': حدّ للعرض');
    const mob = rules.filter((r) => r.sel.split(',').some((s) => s.includes('#' + id) && !/html:not\(\.mobile-ui\)/.test(s)));
    assert.equal(mob.length, 0, id + ': لا قاعدة للجوّال — يبقى كما كان');
  }
  const tag = (HTML.match(/<div id="offlineBanner"[^>]*>/) || [''])[0];
  assert.match(tag, /position:fixed; top:0; left:0; right:0;/, 'النمط المضمّن نفسه (الجوّال) لم يُمسّ');
});

/* ── و. مصنّف المتصفّح في selfdiag ── */
test('و. selfdiag: كروم أندرويد وويندوز ليسا سفاري، وسفاري الآيفون سفاري، وكروم الآيفون ليس سفاري', () => {
  const ctx = { navigator: { userAgent: '' }, document: { documentElement: { classList: { add() {} }, style: { setProperty() {} } }, querySelector: () => null, addEventListener() {}, readyState: 'complete' }, location: { search: '', hash: '', pathname: '/' }, sessionStorage: { getItem: () => null, setItem() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, URLSearchParams, setTimeout: () => 0, addEventListener() {}, __swallow() {} };
  ctx.window = ctx;
  vm.runInNewContext(DIAG, ctx);
  const isSaf = ctx.window.__omranIsSafariUA;
  assert.equal(typeof isSaf, 'function', 'مصنّف واحد معرَّض');
  const UA = {
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    criosIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
    wkWrapper: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  };
  assert.equal(isSaf(UA.chromeAndroid), false, 'كروم أندرويد');
  assert.equal(isSaf(UA.chromeWin), false, 'كروم ويندوز');
  assert.equal(isSaf(UA.edgeWin), false, 'إيدج');
  assert.equal(isSaf(UA.safariIphone), true, 'سفاري آيفون ١٧');
  assert.equal(isSaf(UA.safariMac), true, 'سفاري ماك');
  assert.equal(isSaf(UA.criosIphone), false, 'كروم الآيفون');
  assert.equal(isSaf(UA.wkWrapper), false, 'غلاف WebView');
  // الموضعان يستعملان المصنّف نفسه، ولا يبقى فحص /Safari/ الخام
  assert.ok(/window\.__omranIsSafariUA = function\(ua\)/.test(DIAG), 'التعريف');
  assert.equal((DIAG.match(/window\.__omranIsSafariUA\((?:navigator\.userAgent|ua)\)/g) || []).length, 2, 'الموضعان (حبّة الآيفون ولوحة ?diag=2)');
  assert.ok(!/\/\(Safari\)\/\.test\(ua\)/.test(DIAG) && !/\/Safari\/\.test\(navigator\.userAgent\)/.test(DIAG), 'لا فحص Safari خام');
});
