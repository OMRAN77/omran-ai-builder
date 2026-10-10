'use strict';
/* v-maha-vad-hold — بلاغ المالك: مها ترد بعد الكلمة الثانية مباشرة (قطع كلام مبكّر).
   السبب: SILENCE_HOLD_MS (طول السكوت المسموح قبل اعتبار المستخدم انتهى) كان قصيرًا
   (1200م.ث) فسكتة تفكير طبيعية وسط الجملة تُقطع كأنها نهاية الكلام. رُفعت إلى 2000.

   ملاحظة مهمّة: اقتُرح أيضًا رفع MIN_TALK_MS من 600 إلى 1500 — هذا كان سيرجع نفس
   عطل «نعم/هلا القصيرة كانت تضيع» الذي حُلّ عمدًا بخفض القيمة من 1000 إلى 600 (التعليق
   القائم في الكود). MIN_TALK_MS سقفٌ زمنيّ منذ بداية التسجيل لا شرط مرتبط بعدد الكلمات،
   فرفعه لا يعالج «قطع بعد كلمتين» أصلًا — السبب الحقيقي كان SILENCE_HOLD_MS وحدها.
   هذا الاختبار يقفل MIN_TALK_MS عند 600 كي لا يتكرر هذا الخطأ لاحقًا. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');
const fn = src.slice(src.indexOf('async function mahaRecordUntilSilence('), src.indexOf('async function mahaRecordUntilSilence(') + 3700);

test('SILENCE_HOLD_MS رُفعت إلى 2000 — سكتة تفكير طبيعية لا تُقطع بعد كلمتين', () => {
  assert.match(fn, /const SILENCE_HOLD_MS = 2000;/, 'القيمة الجديدة');
});

test('MIN_TALK_MS تبقى 600 — رفعها كان سيرجع فقدان الكلمات القصيرة («نعم»/«هلا»)', () => {
  assert.match(fn, /const MIN_TALK_MS = 600;/, 'لا تراجع عن إصلاح سابق موثَّق في نفس السطر');
});

test('منطق القرار: MIN_TALK_MS سقفٌ منذ بداية التسجيل، وSILENCE_HOLD_MS هي بوّابة اكتشاف الصمت الفعلية', () => {
  assert.match(fn, /elapsed > MAX_TURN_MS \|\| \(everLoud && elapsed > MIN_TALK_MS && silentFor > SILENCE_HOLD_MS\)/, 'الشرط كما هو — لا تغيير في البنية، القيم فقط');
});

test('معادلة عتبة الصمت الديناميكية كما هي (لم تُغيَّر بلا تحقّق حيّ بمايك فعليّ)', () => {
  assert.match(fn, /silenceThreshold = Math\.min\(0\.028, Math\.max\(0\.013, noiseFloor \* 2\.2 \+ 0\.004\)\);/, 'المعامل 2.2 و0.004 كما كانا — تعديل حسّاسية الضجيج يحتاج تحقّقًا حيًّا بمايك حقيقيّ لا نظريًّا');
});

console.log('✓ maha-vad-silence: سكتة أطول قبل اعتبار المستخدم انتهى، بلا رجوع عن إصلاح فقدان الكلمات القصيرة');
