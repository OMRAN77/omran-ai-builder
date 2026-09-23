'use strict';
/* v-android-gpu + v-maha-wd (المالك ٢٣ سبتمبر): «التطبيق كامل يشوش» (فيديو أندرويد/هواوي) و«زرّ مها ما يفتح في الآيفون». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/redesign.css', 'utf8');
const sd = fs.readFileSync('js/selfdiag.js', 'utf8');

test('١. علامة html.omAndroid تُوضع قبل أيّ رسم لأندرويد/هواوي فقط', () => {
  const m = html.match(/try \{ if \((\/Android\|HarmonyOS\|HUAWEI\|HONOR\/i)\.test\(navigator\.userAgent \|\| ''\)\) document\.documentElement\.classList\.add\('omAndroid'\); \}/);
  assert.ok(m, 'السكربت المبكّر موجود');
  assert.ok(html.indexOf(m[0]) < html.indexOf('<link rel="stylesheet"'), 'قبل أوّل ورقة أنماط');
  const re = /Android|HarmonyOS|HUAWEI|HONOR/i;
  assert.ok(re.test('Mozilla/5.0 (Linux; Android 12; ELS-NX9) AppleWebKit/537.36 Chrome/120 Mobile'));
  assert.ok(re.test('Mozilla/5.0 (Linux; HarmonyOS; HONOR) HuaweiBrowser/14'));
  assert.ok(!re.test('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1'));
  assert.ok(!re.test('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'));
});

test('٢. على أندرويد: النجوم بلا فلتر، الأيقونة تنبض بالشفافيّة وحدها، ولا تغبيش تحت الأدوات', () => {
  assert.match(css, /html\.omAndroid #omranNewChatBtn > \.omStar,\nhtml\.omAndroid #omSkyLayer \.omSkyStar,\nhtml\.omAndroid #mahaSkyLayer \.omSkyStar\{filter:none;\}/);
  assert.match(css, /html\.omAndroid #stockTickerToggle\.tickerAiCollapsed #stockTickerAiIcon\{animation:tickerAiPulseLite 2\.2s ease-in-out infinite; filter:none;\}/);
  assert.match(css, /@keyframes tickerAiPulseLite\{0%,100%\{opacity:\.72;\} 50%\{opacity:1;\}\}/);
  assert.doesNotMatch(css.slice(css.indexOf('@keyframes tickerAiPulseLite')), /filter:drop-shadow/);
  assert.match(css, /html\.omAndroid #sectionsToolsOverlay\{backdrop-filter:none; -webkit-backdrop-filter:none;\}/);
  assert.match(html, /css\/redesign\.css\?v=683/);
});

test('٣. رقيب الإقلاع لا يعيد التحميل ومكالمة مها جارية أو تبدأ أو شاشتها ظاهرة', () => {
  const src = sd.slice(sd.indexOf('var blackHome = false;'), sd.indexOf('if(bootDone){', sd.indexOf('var blackHome = false;')));
  const run = (env) => new Function('document', 'getComputedStyle', 'mahaCallActive', 'mahaCallStarting',
    src + '; return "reload-path";')(env.doc, env.gcs, env.active, env.starting);
  const shown = { doc: { getElementById: () => ({}) }, gcs: () => ({ display: 'flex' }), active: false, starting: false };
  const hidden = { doc: { getElementById: () => ({}) }, gcs: () => ({ display: 'none' }), active: false, starting: false };
  assert.equal(run(shown), undefined, 'الشاشة ظاهرة ⇒ خروج');
  assert.equal(run(Object.assign({}, hidden, { active: true })), undefined, 'مكالمة جارية ⇒ خروج');
  assert.equal(run(Object.assign({}, hidden, { starting: true })), undefined, 'مكالمة تبدأ ⇒ خروج');
  assert.equal(run(hidden), 'reload-path', 'بلا مكالمة يكمل الرقيب فحصه كما كان');
  assert.match(html, /\/js\/selfdiag\.js\?v=hw-twa-3/);
});
