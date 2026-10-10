// tests/fair-video.test.cjs — الجدول الثاني (قرار المالك ٥ أكتوبر ٢٠٢٦، «ابدأ ١ ٢ ٣»):
//   v-fair-video       كلّ خدمة ≈ ٣ أضعاف تكلفتها على سعر نقطة Pro (الفيديو بالصوت ٢٧٥←١٧٥، السينمائيّ ٣٥٠←١٢٠)،
//                      Plus فيديو باقة واحد، رزمة ٩٠٠ ← ١٬٠٥٠ نقطة بالسعر نفسه، والوسطى في الوسائط ضعف الأساسيّة.
//   v-honest-cards     Pro بلا «أولوية في السرعة» (لا تنفيذ لها) في الطبقتين وبالـ١٤ لغة، و«بلا حدود» صارت الحدّ الحقيقيّ.
//   v-gold-badge-plan  «الشارة الذهبيّة» الموعودة لـPro تظهر بجانب الاسم في رأس الإعدادات لمشترك Pro وMax.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'fair-video-secret';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));

test('١. لا خدمة تحت ضعفَي تكلفتها على أرخص نقطة نبيعها (Pro)، والفيديو لم يعد ×٥ و×٩', () => {
  const { COSTS } = require(rp('api/_lib/points.js'));
  const { UNIT_COST } = require(rp('api/_lib/_mediaPlans.js'));
  assert.equal(COSTS.veo_video, 175);
  assert.equal(COSTS.omni_video, 120);
  const proNet = (20 - (20 * 0.029 + 0.30)) / 920; // دولار لكلّ نقطة بعد رسوم الدفع
  for (const k of Object.keys(UNIT_COST)) {
    if (!COSTS[k]) continue;
    const cost = (k === 'image_creative' ? UNIT_COST.image + UNIT_COST.image_creative : UNIT_COST[k]) / 100 / 3.6725;
    const margin = COSTS[k] * proNet / cost;
    assert.ok(margin >= 2, k + ': ×' + margin.toFixed(2));
    assert.ok(margin <= 4, k + ': ×' + margin.toFixed(2) + ' (لا خدمة مسعّرة أضعافًا فوق البقيّة)');
  }
  const worst = Math.min(...Object.keys(UNIT_COST).filter((k) => COSTS[k] && k !== 'image_creative').map((k) => COSTS[k] / UNIT_COST[k]));
  assert.equal(worst, COSTS.maha_minute / UNIT_COST.maha_minute, 'أسوأ ربح يبقى على مها — تخفيض الفيديو لا ينقصه');
});

test('٢. Plus فيديو باقة واحد، ورزمة ٩٠٠ تمنح ١٬٠٥٠ ويقولها زرّها ونافذة الدفع', () => {
  assert.deepEqual(require(rp('api/_lib/_planVideos.js')).PLAN_VIDEOS, { basic: 1, pro: 2, max: 3 });
  assert.equal(require(rp('api/_lib/create-checkout-session.js')).PLANS.pack900.points, 1050);
  const a6 = read('js/app-06-checkout.js');
  assert.match(a6, /const PACK_POINTS = \{ pack100: 100, pack300: 300, pack700: 700, pack900: 1050 \};/);
  assert.match(a6, /Number\(PACK_POINTS\[plan\] \|\| String\(plan\)\.slice\(4\)\)\.toLocaleString\('en-US'\)/);
  const ps = read('js/partials-settings.js');
  assert.ok(ps.includes('onclick="buyPointsPack(900)"') && ps.includes('<b style="font-size: var(--fs-3);">1,050</b>'));
  // v-media-merge (قرار المالك ٨ أكتوبر): بطاقات الصور/الفيديو المنفصلة صارت «صور وفيديو» بأمثلة تقريبيّة (media-merge.test ١٢)؛ مها كما هي.
  for (const n of ['data-i18n="mixApprox1">يكفي تقريبًا 50 صورة أو 12 فيديو', 'data-i18n="mixApprox2">يكفي تقريبًا 100 صورة أو 24 فيديو', '<b>92</b> <span data-i18n="mahaMinPlain">']) assert.ok(ps.includes(n), n);
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'pricing.html')), 'v-cleanup: صفحة الأسعار اليتيمة حُذفت بموافقة المالك — بطاقات الإعدادات هي المرجع');
});

test('٣. Pro بلا «أولوية في السرعة» في الطبقتين (li وul) وباللغات الـ١٤، و«بلا حدود» صارت الحدّ الحقيقيّ', () => {
  const PRIORITY = /أولوية|Priority|prioritaria|prioritaire|prioritas|Приоритет|Öncelikli|ترجیحی|优先|অগ্রাধিকার|प्राथमिकता|മുൻഗണന/;
  const a3 = read('js/app-03-i18n-data.js');
  for (const k of ['plProPriority', 'planProFeats']) for (const m of a3.matchAll(new RegExp('\\b' + k + ":\\s*'([^']*)'", 'g'))) assert.doesNotMatch(m[1], PRIORITY, 'app-03 ' + k);
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const ctx = { I18N: { [l]: {} }, window: {} }; vm.createContext(ctx);
    vm.runInContext(read('i18n/' + l + '.js'), ctx);
    const d = ctx.I18N[l];
    assert.doesNotMatch(d.plProPriority, PRIORITY, l);
    assert.doesNotMatch(d.planProFeats, PRIORITY, l);
    assert.ok(d.planProFeats.includes('<li>' + d.plProPriority + '</li>'), l + ': الطبقتان متطابقتان');
    assert.match(d.pricingPointsDesc, /175/); assert.match(d.pricingPointsDesc, /120/); assert.doesNotMatch(d.pricingPointsDesc, /275/);
  }
  assert.ok(!read('js/partials-settings.js').includes('أولوية في السرعة'));
  const tier = require(rp('api/_lib/tier.js'));
  assert.doesNotMatch(tier.FREE_TEXT.freeLimit, /بلا حدود/);
  assert.match(tier.FREE_TEXT.freeLimit, /50–250/);
  process.env.SUB_DAILY_BASIC = '60';
  try { assert.match(tier.FREE_TEXT.freeLimit, /60–250/, 'من حدود البيئة لا رقمًا ثابتًا'); } finally { delete process.env.SUB_DAILY_BASIC; }
});

test('٤. الشارة الذهبيّة: Pro وMax يريانها بجانب اسمهم في رأس الإعدادات، وPlus والمجّانيّ والمالك لا', () => {
  const src = read('js/app-05-ui.js');
  const fn = src.slice(src.indexOf('function applyPlanGate(d){'), src.indexOf('window.applyPlanGate = applyPlanGate;'));
  const cls = new Set();
  const vars = {};
  const style = { setProperty(k, v) { vars[k] = v; }, removeProperty(k) { delete vars[k]; } };
  const ctx = { window: {}, __swallow: (e) => { throw e; }, document: { documentElement: { style, classList: { toggle(c, on) { if (on) cls.add(c); else cls.delete(c); } } }, getElementById: () => null } };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nthis.applyPlanGate = applyPlanGate;', ctx);
  ctx.applyPlanGate({ tier: 'sub', plan: 'pro' });
  assert.ok(cls.has('plan-gold')); assert.equal(vars['--plan-badge'], '"PRO"', 'نصّ CSS مقتبس');
  ctx.applyPlanGate({ tier: 'sub', plan: 'max' });
  assert.equal(vars['--plan-badge'], '"MAX"');
  for (const d of [{ tier: 'sub', plan: 'basic' }, { tier: 'free' }, { tier: 'owner' }]) {
    ctx.applyPlanGate(d);
    assert.ok(!cls.has('plan-gold'), JSON.stringify(d)); assert.equal(vars['--plan-badge'], undefined);
  }
  // الاسم الظاهر في رأس الإعدادات (الرأس العلويّ بلا اسم منذ v-auth-optional-3)، ومتغيّر على html يصل الجزء ولو حُقن بعد النداء.
  const idx = read('index.html');
  assert.match(idx, /html\.plan-gold \.setProfileName::after\{ content: var\(--plan-badge, ""\);/);
  assert.ok(read('js/partials-settings.js').includes('<div id="setProfileName" class="setProfileName"></div>'));
  assert.ok(idx.includes('/js/partials-settings.js?v=694'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=734'"));
  assert.ok(read('js/app.bundle.js').includes("root.style.setProperty('--plan-badge', JSON.stringify(plan.toUpperCase()));"), 'الحزمة مبنيّة');
});
