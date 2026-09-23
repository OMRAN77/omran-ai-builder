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

test('v-lanes: maha-image no longer wires the request check (one call, no retry) — the caption report covers new generations and edits (v-img-report)', () => {
  assert.ok(!/verifyRequestApplied|requestCheckEnabled/.test(maha), 'فحص التطبيق وإعادته أُزيلا من maha-image');
  assert.ok(!/CORRECTION: your previous attempt did NOT satisfy the request/.test(maha));
  /* v-caption-report: تقرير مختصر + «هل أعجبتك؟ ولا أسوي لك … أو …؟» بلغة المستخدم، من كلماته الحرفية.
     v-img-honest (٢٣ سبتمبر): التقرير انتقل إلى image-verify وصار حكمًا وتقريرًا في نداء الرؤية الواحد — بلا إعادة بأمر «CORRECTION»؛
     المحرّك الآخر مرّة فقط حين لم يُنفَّذ (بكسل أو حكم)، لا حلقة تصحيح. */
  const verify = fs.readFileSync('api/_lib/image-verify.js', 'utf8');
  assert.ok(!/CORRECTION: your previous attempt did NOT satisfy the request/.test(verify));
  assert.match(verify, /one short sentence stating exactly what changed, describing only what is truly visible in the result; \(2\) if any part of the request is NOT visible or came out different, say so plainly/); // v-img-report: والاعتراف بما لم يتحقّق
  assert.match(verify, /offering TWO concrete next options specific to this image/);
  assert.match(verify, /Gulf Arabic if they wrote Gulf Arabic/);
  assert.match(maha, /await sendImg\(r\.best\.b64, r\.best\.mime, r\.engine, r\.report, r\.best\.verdict\);/, 'v-img-report: التقرير للتوليد والتعديل');
});
