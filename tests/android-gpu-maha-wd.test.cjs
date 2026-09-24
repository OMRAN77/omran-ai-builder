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
  assert.match(html, /css\/redesign\.css\?v=685/);
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
  assert.match(html, /\/js\/selfdiag\.js\?v=hw-twa-6/);
});

test('٤. v-mem-probe: جهاز المالك وحده يرسل أرقام الذاكرة لسجلّ «فحص النظام» بعد ٢٠ث ودقيقتين وخمس', () => {
  const a = sd.indexOf('(function memProbe(){');
  assert.ok(a > 0 && a > sd.indexOf('function report(msg'), 'بعد تعريف المُبلِّغ');
  const src = sd.slice(a, sd.indexOf('})();', a) + 5);
  assert.match(src, /if\(!ownerNow\(\)\) return;/);
  assert.match(src, /=== 'omran'/);
  assert.match(src, /\[\[20000, '٢٠ث'\], \[120000, 'دقيقتان'\], \[300000, '٥ دقائق'\]\]/);
  assert.match(src, /report\('v-mem-probe ' \+ tag/);
  assert.match(src, /window\.__omrS && window\.__omrS\.projects/);
  assert.doesNotMatch(src, /getContext\(/, 'بلا WebGL/لوحة — لا حِمل جديد على معالج الرسوم');
});

/* ————— الجولة الثانية (المالك ٢٤ سبتمبر: «صلّح الدنيا كلّها») ————— */

test('٥. v-bdf-off: لا backdrop-filter على أندرويد إطلاقًا — ولا يمسّ الآيفون ولا الكمبيوتر', () => {
  // قياس قبلها: تسعة عناصر بتغبيش حيّ (قائمة الرأس، الرقائق، التعليم، التجارب،
  // المستندات، الحكومة، السيرة، الملاحظات) + أغلفة تُحقَن من JS بنمط سطريّ.
  assert.match(css, /html\.omAndroid \*\{backdrop-filter:none !important; -webkit-backdrop-filter:none !important;\}/);
  // !important لازم: النمط السطريّ من JS لا تغلبه قاعدة عاديّة
  const injected = require('node:fs').readFileSync('js/app-10-features.js', 'utf8');
  assert.match(injected, /backdrop-filter:blur/, 'ما زال هناك تغبيش سطريّ من JS — لذلك !important');
  // القاعدة تحت html.omAndroid وحدها
  const rule = css.match(/html\.omAndroid \*\{backdrop-filter[^}]+\}/)[0];
  assert.ok(rule.startsWith('html.omAndroid '), 'أندرويد وحده — لا قاعدة عامّة تصيب الجميع');
  assert.match(html, /css\/redesign\.css\?v=685/);
});

test('٦. v-intro-gpu: المقدّمة على أندرويد بلا طبقة تغبيش ملء الشاشة وبلا عزل مزج', () => {
  // قبلها: oiBg يمرّر blur(30px) على 892×970 (أكبر من الشاشة، مكبّرة 1.12)،
  // وoiSheen يفرض عزل طبقة بـmix-blend-mode:screen — في أثقل لحظة (الإقلاع).
  assert.match(html, /html\.omAndroid #omranIntro \.oiBg\{display:none\}/);
  assert.match(html, /html\.omAndroid #omranIntro \.oiSheen\{mix-blend-mode:normal;opacity:\.5\}/);
  // الأصل باقٍ للآيفون والكمبيوتر
  assert.match(html, /#omranIntro \.oiBg\{[^}]*filter:blur\(30px\) brightness\(\.5\)/);
  assert.match(html, /#omranIntro \.oiSheen\{[^}]*mix-blend-mode:screen/);
  // الحاوية نفسها معتمة فالإطار يبقى داكنًا نظيفًا بلا الخلفيّة المغبّشة
  assert.match(html, /#omranIntro\{[^}]*background:#07070B/);
  // الأمر يأتي بعد قاعدة تقليل الحركة فلا يُلغيها
  assert.ok(html.indexOf('@media (prefers-reduced-motion:reduce){#omranIntro') < html.indexOf('html.omAndroid #omranIntro .oiBg'));
});

test('٧. v-stars-lite: نجوم أندرويد نصفها (١٢ بدل ٢٥) والآيفون والكمبيوتر كما كانا', () => {
  // كلّ نجمة طبقة تركيب متحرّكة دائمة — الخطوة التي سمّاها v-android-gpu ولم تُنفَّذ
  const starsSrc = html.match(/var STARS = (\[[\s\S]*?\n  \];)/);
  assert.ok(starsSrc, 'مصفوفة نجوم الزرّ');
  const STARS = new Function('return ' + starsSrc[1].replace(/;$/, ''))();
  assert.equal(STARS.length, 7, 'سبع نجوم على زرّ المحادثة كما كانت');
  const pick = (lite) => STARS.filter((_, i) => !lite || i % 2 === 0);
  assert.equal(pick(true).length, 4, 'أندرويد: أربع');
  assert.equal(pick(false).length, 7, 'غيره: سبع كما كان');
  assert.match(html, /STARS\.filter\(function\(_, i\)\{ return !OM_LITE \|\| i % 2 === 0; \}\)/);
  assert.match(html, /OM_LITE = document\.documentElement\.classList\.contains\('omAndroid'\)/);
  // نجوم الشريط الجانبيّ
  assert.match(html, /var COUNT = 18, layer = null;/, 'الأصل ١٨ للآيفون والكمبيوتر');
  assert.match(html, /if \(document\.documentElement\.classList\.contains\('omAndroid'\)\) COUNT = 8;/);
  // كلّ حارس له طريق رجوع صامت
  assert.equal((html.match(/guard-ok: بلا العلامة يبقى العدد الكامل/g) || []).length, 2);
});
