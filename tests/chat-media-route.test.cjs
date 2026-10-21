'use strict';
/* تدقيق ١٨–١٩ أكتوبر (g05): أربعة مسارات توجيه في المحادثة، بتعابير __sendPromptCore الحقيقيّة (tests/_route-src.cjs) أو بنصّ شرطها:
   - chat-ad-image: «اعلان سيارة لاندكروزر للبيع» سقط للمحادثة لأنّ «زر\s» في __codeWordRe التقط ذيل «لاندكروزر».
   - chat-video-request: «Make me a video of a cat…» بدأ فيديو مدفوعًا (__wantsVideo) بدل فتح الصانع — الفرع الإنجليزيّ في __VID_MAKE_RE
     كان يشترط الاسم بعد الفعل مباشرة («make video»).
   - stamps: «Name stamps for Ahmed» مع صورة لا يفتح لوحة الطوابع (التشغيل عربيّ وحده)، والاسم يُستخرج بالعربيّة وحدها.
   - attach-image-edit: «رجعها زي أول» من جهاز ثانٍ ذهبت للمحادثة — الشرط على lastEditedImage المحلّيّ الذي لا يُزامَن. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const { load } = require('./_route-src.cjs');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const h = load();
const R = h.R;
const lineOf = (needle) => { const l = SRC.split('\n').find((x) => x.includes(needle)); assert.ok(l, 'مفقود: ' + needle); return l; };

test('٢. طلب الفيديو بالإنجليزيّ يفتح الصانع: «make me a video…» و«make a short video…»، لا «make me a website» ولا سؤال', () => {
  const opens = (t) => R.VID_MAKE.test(t) && !R.VID_Q.test(t);
  for (const s of ['Make me a video of a cat playing with a ball', 'make a short video of the sea', 'create a cinematic clip of a falcon', 'Generate an animation of a rocket launch', 'make video of my car']) {
    assert.equal(opens(s), true, s);
  }
  for (const s of ['make me a website', 'make a website for my shop', 'how to make a video?', 'what is a good video editor', 'make me a logo']) {
    assert.equal(opens(s), false, s);
  }
  /* والعربيّ القائم كما هو */
  assert.equal(opens('سوّ لي فيديو لقطة تلعب'), true);
  assert.equal(opens('كيف اسوي فيديو؟'), false);
});

test('٣. لوحة الطوابع تُفتح بالإنجليزيّ: تشغيل stamps/stickers/labels، والاسم من «for <name>»، والعربيّ كما هو', () => {
  const line = lineOf('v-owner-solo-all: مزوّد المالك يرسمها بأداته');
  const m = line.match(/\*\/ && (\/.+?\/i)\.test\(text\)/);
  assert.ok(m, 'تعبير التشغيل في شرط الفرع');
  const trig = vm.runInNewContext(m[1]);
  for (const s of ['Name stamps for Ahmed', 'stickers for Sara', 'school labels for Omar', 'طوابع باسم أحمد', 'ملصقات باسم سارة']) assert.equal(trig.test(s), true, s);
  for (const s of ['postage stampsheet design?', 'timestamps in my code', 'relabel the axis', 'add labels to the chart']) assert.equal(trig.test(s), false, s);
  const nl = lineOf('const __stNameM = text.match(');
  const nameRe = vm.runInNewContext(nl.match(/text\.match\((\/.+\/[a-z]*)\);/)[1]);
  const name = (t) => { const x = t.match(nameRe); return x ? x[1].trim() : ''; };
  assert.equal(name('Name stamps for Ahmed'), 'Ahmed');
  assert.equal(name('stickers for Sara and Omar'), 'Sara and Omar');
  assert.equal(name('طوابع باسم أحمد'), 'أحمد');
});

