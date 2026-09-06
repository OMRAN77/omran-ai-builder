'use strict';
/* v-request-check — «هل نُفِّذ الطلب كما كُتب؟» بعد كل تعديل، وإعادة محاولة واحدة عند الفشل */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const rc = require('../api/_lib/request-check');
const maha = fs.readFileSync('api/_lib/maha-image.js', 'utf8');

test('request-check parses strictly and is on by default', () => {
  assert.deepEqual(rc.parseRequestCheck('{"applied": false, "missing": "the people were not changed to match the names"}'), { applied: false, missing: 'the people were not changed to match the names' });
  assert.deepEqual(rc.parseRequestCheck('```json\n{"applied": true, "missing": ""}\n```'), { applied: true, missing: '' });
  assert.equal(rc.parseRequestCheck('{"applied": "no"}'), null, 'applied غير منطقي = لا إعادة');
  assert.equal(rc.parseRequestCheck('garbage'), null);
  assert.equal(rc.requestCheckEnabled({}), true);
  assert.equal(rc.requestCheckEnabled({ IMAGE_REQUEST_CHECK: 'off' }), false);
  const p = rc.buildRequestCheckPrompt('غير على "اسم" الشخصية\nتحت');
  assert.match(p, /verbatim: "غير على  اسم  الشخصية تحت"/);
  assert.match(p, /people matching the names written next to them/);
  assert.match(p, /Ignore taste and quality/);
});

test('maha-image retries once with the missing part and accepts the retry only if it passes', () => {
  assert.match(maha, /if \(editImageBase64 && !extras\.length && !__pureRaw && !prayerPlan && !pipelineActive && requestCheckEnabled\(process\.env\)\) \{/);
  assert.match(maha, /const __rc = await verifyRequestApplied\(\{ apiKey, request: intentText, source: __src, result: \{ b64: imgPart\.inlineData\.data/);
  assert.match(maha, /CORRECTION: your previous attempt did NOT satisfy the request\. What was missing: "/);
  assert.match(maha, /if \(__guardLane\) \{\n\s+const g3 = await verifyLocalizedImageEdit\(/, 'المسار الموضعي: المحاولة الثانية تمرّ بحارس الهوية أيضًا');
  assert.match(maha, /if \(!__rc2 \|\| __rc2\.applied !== false\) \{ imgPart = __fixImg; duoEngine = \(duoEngine \|\| 'gemini'\) \+ '\+fix'; \}/);
  /* الفحص بعد الحكم/المرشّح الثاني وقبل التعليق */
  assert.ok(maha.indexOf('const __rc = await verifyRequestApplied') > maha.indexOf("duoEngine = 'gemini x2+judge'"));
  assert.ok(maha.indexOf('const __rc = await verifyRequestApplied') < maha.indexOf("const caption = prayerPlan ? '' : await imageCaption("));
});
