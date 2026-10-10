'use strict';
/* v-perf-idle-timers (المالك ٢٩ سبتمبر: «الأدوات مو سريعة» + تتمّة سلسلة v-perf-*).
   أربعة مصادر حِمل خلفيّ دائم/غير مشروط بالاستخدام الفعليّ:
   ١) ساعة الهيدر (app-06-checkout.js): setInterval كلّ ثانية للأبد لعنصر #btnClock مخفيّ دومًا بلا أيّ
      كود يُظهره — Intl.DateTimeFormat جديد يُبنى في كلّ نبضة.
   ٢) نجوم موجة مها (app-30-maha-wave.js): حتّى ١١٠ عنصر DOM يُبنون فور تحميل كلّ صفحة رغم أنّ #mahaGoldWave
      مخفيّ إلّا أثناء مكالمة فعليّة.
   ٣) شبكة ترندات الفيديو (app-11-video-trends.js): ٤٥ بطاقة (+٤٥ صورة معاينة) تُبنى عند DOMContentLoaded
      حتّى لو لم يُفتح صانع الفيديو إطلاقًا.
   ٤) قائمة مزوّدي المالك (modes.js): renderPop() تبني DOM لتسعة مزوّدين وعشرات الأزرار لكلّ زائر رغم أنّ
      الميزة كلّها مخفيّة لغير المالك أصلًا (CSS فقط). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const checkout = fs.readFileSync('js/app-06-checkout.js', 'utf8');
const wave = fs.readFileSync('js/app-30-maha-wave.js', 'utf8');
const trends = fs.readFileSync('js/app-11-video-trends.js', 'utf8');
const video = fs.readFileSync('js/app-11-video.js', 'utf8');
const modes = fs.readFileSync('js/modes.js', 'utf8');

test('١. ساعة الهيدر: المؤقّت يبدأ فقط لو #btnClock ظاهر فعلًا، ويتوقّف لو اختفى، وIntl.DateTimeFormat يُبنى مرّة لا كلّ ثانية', () => {
  assert.match(checkout, /const __headerClockFmt = \{[\s\S]{0,120}new Intl\.DateTimeFormat/, 'التنسيق يُبنى خارج الدالّة');
  const fnBody = /function updateHeaderClock\(\)\{[\s\S]*?\n\}/.exec(checkout);
  assert.ok(fnBody, 'updateHeaderClock موجودة');
  assert.doesNotMatch(fnBody[0], /new Intl\.DateTimeFormat/, 'لا بناء جديد داخل الدالّة نفسها — تستعمل الكاش');
  assert.match(checkout, /getComputedStyle\(btn\)\.display !== 'none'/, 'فحص الظهور الفعليّ قبل تشغيل المؤقّت');
  assert.match(checkout, /clearInterval\(__headerClockTimer\)/, 'يتوقّف عند الاختفاء');
  assert.match(checkout, /new MutationObserver\(__headerClockSync\)\.observe\(__btnClockEl/, 'يراقب تغيّر الظهور مستقبلًا (تفعيل لاحق آمن)');
});

test('٢. موجة مها: طبقة النجوم لا تُبنى فور تحميل الصفحة — فقط عند أوّل استدعاء حقيقيّ (ensureCtx/prime)', () => {
  const fnBody = /function buildSkyStars\(\)\{[\s\S]*?\n  \}/.exec(wave);
  assert.ok(fnBody, 'buildSkyStars() موجودة');
  assert.match(fnBody[0], /document\.body\.appendChild\(sky\);/, 'بناء الطبقة انتقل داخل الدالّة');
  assert.doesNotMatch(fnBody[0], /\}\)\(\);/, 'ليست IIFE ذاتيّة التنفيذ — دالّة عاديّة تُستدعى صراحةً');
  assert.doesNotMatch(wave.slice(0, wave.indexOf('function buildSkyStars')), /document\.body\.appendChild\(sky\)/, 'لا بناء آخر يسبقها');
  assert.match(wave, /if\(__skyBuilt \|\| document\.getElementById\('mahaSkyLayer'\)\) return;/, 'حارس عدم التكرار');
  assert.match(wave, /function ensureCtx\(\)\{\n\s*try\{ buildSkyStars\(\); \}/, 'تُستدعى من أوّل سطر في ensureCtx (المدخل الحقيقيّ لأيّ مكالمة)');
});

test('٣. شبكة ترندات الفيديو: لا بناء عند DOMContentLoaded — تُبنى فقط عند فتح صانع الفيديو فعليًّا (المسارين معًا)', () => {
  assert.doesNotMatch(trends, /document\.addEventListener\('DOMContentLoaded', boot\)/, 'لا ربط بحدث التحميل');
  assert.doesNotMatch(trends, /setTimeout\(boot, 900\)/, 'ولا مؤقّت احتياطيّ بعده');
  assert.match(trends, /window\.__videoTrendsBoot = boot;/, 'مُعرَّضة للاستدعاء من app-11-video.js');
  const openFn = /window\.omranOpenVideoMaker = function\(prompt, heroDataUrl, heroMimeType\)\{\n\s*try\{ if\(typeof window\.__videoTrendsBoot === 'function'\) window\.__videoTrendsBoot\(\); \}/;
  assert.match(video, openFn, 'مسار الفتح من المحادثة/الصوت يبني الشبكة أوّلًا');
  const btnOpenFn = /btnOpen\.onclick = \(\) => \{\n\s*try\{ if\(typeof window\.__videoTrendsBoot === 'function'\) window\.__videoTrendsBoot\(\); \}/;
  assert.match(video, btnOpenFn, 'مسار زرّ القائمة المباشر يبنيها أيضًا (المسار الثاني المستقلّ)');
});

test('٤. قائمة مزوّدي المالك: renderPop() (تسعة مزوّدين) تُبنى للمالك وحده لا لكلّ زائر', () => {
  assert.match(modes, /if\(isOwner\(\)\) renderPop\(\);/, 'مشروطة بالمالك');
  assert.doesNotMatch(modes, /^\s*renderPop\(\);\s*$/m, 'لا استدعاء غير مشروط منفصل باقٍ');
});
