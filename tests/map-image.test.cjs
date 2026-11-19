// tests/map-image.test.cjs — v-map-image (المالك ١١ نوفمبر، محادثة ملصقة: «ابغي خريطة عن جابر بن حيان خريطة تبين قديمة و مافيها كتابة ولا شى
// فقط خريطة» فردّ التطبيق «ما أقدر أطلع لك صورة… دوّر في مكتبة الكونغرس»): الخريطة المرسومة صورة في الطبقات الثلاث — البانِي المباشر في
// العميل (__unifiedBuildRe)، وبوّابة أداة الرسم لطلب المالك (owner-media)، ومصنّف النيّة ونصّ أداة المحادثة — والخريطة الذهنيّة وخريطة
// الطريق والموقع وسؤال «وين الخريطة» كلام كما كانت.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const MSG = 'ابغي خريطة عن جابر بن حيان خريطة تبين قديمة و مافيها كتابة ولا شى فقط خريطة';

test('١. البانِي المباشر في العميل: «ارسم/سوّ لي خريطة» و«ابغي خريطة» بوصف بصريّ صورة، والذهنيّة والطريق والموقع والسؤال لا', () => {
  const a = read('js/app-09-attach.js');
  const re = eval(a.match(/const __unifiedBuildRe = (\/.+\/i);/)[1]);
  for (const t of [MSG, 'ارسم لي خريطة قديمة لجابر بن حيان', 'سوي لي خريطة قديمة بدون كتابة', 'ابي خريطة مرسومة لبغداد القديمة', 'make a map of ancient Baghdad', 'صمم خريطة كنز'])
    assert.ok(re.test(t), 'صورة: ' + t);
  for (const t of ['سوي لي خريطة ذهنية للدرس', 'ارسم خريطة مفاهيم', 'ابغي خريطة الرياض', 'وين الخريطة', 'خريطة الطريق للمشروع', 'make a mind map', 'ابغي خريطة طريق للمشروع', 'اعطني موقع المطعم على الخريطة', 'سوي لي خريطة جوجل للمحل'])
    assert.ok(!re.test(t), 'كلام: ' + t);
  assert.ok(re.test('ابغي صورة لقطة') && re.test('ارسم لي صورة') && !re.test('كيف ارسم'), 'ما كان قبل باقٍ');
});

test('٢. طلب المالك: الخريطة اسم وسائط — أداة الرسم لا تُقفل على «ابغي خريطة…» (كانت ترفضها فيعتذر النموذج)', () => {
  const om = require(path.join(root, 'api/_lib/owner-media.js'));
  assert.equal(om.askedMedia(MSG, false), true);
  assert.equal(om.askedMedia('ارسم خريطة قديمة للخليج', false), true);
  assert.equal(om.askedMedia('خريطة الطريق للمشروع', false), false, 'ذكر بلا طلب');
  assert.equal(om.askedMedia('ليش ما طلعت الخريطة؟', false), false, 'شكوى لا طلب');
});

test('٣. المصنّف ونصّ المحادثة: الخريطة المرسومة صورة، ولا اعتذار ولا إحالة لمواقع أخرى؛ ودور الطلب ليس دور سؤال (أداة الرسم متاحة)', () => {
  const mi = require(path.join(root, 'api/_lib/media-intent.js'));
  assert.match(mi.buildMediaIntentPrompt(MSG), /lane=image: [^\n]*map \([^\n]*"ابغي خريطة قديمة بدون كتابة"/);
  const chat = read('api/_lib/chat.js');
  assert.ok(chat.includes('والخريطة المرسومة أو القديمة صورة: ارسمها (وبلا كتابة إن طلب) ولا تعتذر ولا تحِل لمواقع أخرى.'));
  const c = require(path.join(root, 'api/_lib/chat.js'));
  assert.equal(c.__imgAsk.isClarifyTurn(MSG), false);
});
