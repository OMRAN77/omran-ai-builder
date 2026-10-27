'use strict';
/* v-trend-points — تدقيق ١٨–١٩ أكتوبر (صانع الفيديو، الترندات، لقطة ٠٢٠): نقص النقاط يظهر «تعذّر: points_insufficient» — رمز الخادم
   الإنجليزيّ خامًا. oneClip يرمي {error} رسالةً، وerrText (js/app-11-video-trends.js) لا يعرف إلّا video_cooldown و413. الآن رمزا
   النقاط والحدّ بنصّي الباقات القائمين بالـ١٤ لغة (plansWhyPoints / plansWhyLimit)، وأيّ رمز خامّ آخر «تعذّر» بلا الرمز. لا نصّ جديد،
   ولا تغيير في الخصم أو ترتيبه (باب المال): الصياغة وحدها. errText الحقيقيّة تُشغَّل في vm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-11-video-trends.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'app-03-i18n-data.js'), 'utf8');

function errText() {
  const a = SRC.indexOf('  function errText(e){');
  assert.ok(a > 0, 'errText');
  const b = SRC.indexOf('\n  }\n', a);
  const dict = { plansWhyPoints: 'نقاطك خلصت — اشحن من الباقات وكمّل مباشرة.', plansWhyLimit: 'وصلت حدّ باقتك لليوم — رقِّ باقتك أو انتظر إلى الغد.' };
  const UI = { fail: 'تعذّر', cooldown: 'جرّب بعد {m} دقيقة', tooBig: 'الصور كبيرة' };
  const ctx = { window: { t: (k) => (k in dict ? dict[k] : k) }, ui: (k) => UI[k] || k, noEmoji: (x) => String(x), lg: () => 'ar' /* v-trend-codes: errText تقرأ لغة الواجهة */ };
  vm.createContext(ctx);
  /* W من الملفّ نفسه (مساعد الكتابة) إن وُجدت: نصّ القاموس بلا إيموجي أو فراغ */
  const w = SRC.indexOf('  function W(k){');
  vm.runInContext((w > 0 ? SRC.slice(w, SRC.indexOf('\n', w)) : '') + '\n' + SRC.slice(a, b + 4), ctx);
  return { f: ctx.errText, dict };
}

test('١. نقص النقاط: نصّ الباقات بلغة الواجهة، بلا الرمز الخامّ', () => {
  const { f, dict } = errText();
  const out = f(Object.assign(new Error('points_insufficient'), { code: 'points_insufficient' }));
  assert.equal(out, dict.plansWhyPoints);
  assert.ok(!/points_insufficient/.test(out));
});

test('٢. حدّ اليوم: نصّ حدّ الباقة', () => {
  const { f, dict } = errText();
  assert.equal(f(Object.assign(new Error('daily_limit_reached'), { code: 'daily_limit_reached' })), dict.plansWhyLimit);
});

test('٣. أيّ رمز خامّ آخر («timeout»، «failed»، رمز جديد) = «تعذّر» بلا الرمز؛ والرسالة المقروءة تبقى', () => {
  const { f } = errText();
  for (const c of ['timeout', 'failed', 'some_new_code']) assert.equal(f(new Error(c)), 'تعذّر', c);
  assert.equal(f(new Error('Content was flagged by the safety filter.')), 'تعذّر: Content was flagged by the safety filter.');
});

test('٤. المهلة و413 كما كانتا', () => {
  const { f } = errText();
  assert.equal(f({ code: 'video_cooldown', retryAfter: 120, message: 'video_cooldown' }), 'جرّب بعد 2 دقيقة');
  assert.equal(f(new Error('HTTP 413')), 'الصور كبيرة');
});

test('٥. المفتاحان موجودان في القاموس الأساسيّ (ar+en) وفي ملفّات اللغات الاثنتي عشرة — لا نصّ جديد', () => {
  for (const k of ['plansWhyPoints', 'plansWhyLimit']) {
    assert.equal((I18N.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 2, k);
    for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
      assert.ok(new RegExp('"' + k + '":\\s*"[^"]+"').test(fs.readFileSync(path.join(ROOT, 'i18n', lg + '.js'), 'utf8')), lg + ' ← ' + k);
    }
  }
});
