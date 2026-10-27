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

test('١. إعلان سيارة «لاندكروزر» ليس كودًا: «زر» كلمةً وحدها فقط، والطلبات البرمجيّة بالزرّ باقية كودًا', () => {
  for (const s of ['اعلان سيارة لاندكروزر للبيع موديل 2020', 'اعلان سيارة لاندكروزر للبيع موديل 2020 السعر 90 الف', 'للبيع لاندكروزر 2018 نظيفة']) {
    assert.equal(R.codeWord.test(s), false, s);
  }
  for (const s of ['سوي زر تسجيل', 'ابي زر للموقع', 'زر دخول أزرق', 'اعمل لي كود', 'صفحة هبوط']) {
    assert.equal(R.codeWord.test(s), true, s);
  }
});

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

test('٤. «رجعها زي أول» من جهاز ثانٍ (بلا lastEditedImage) مع صور مولَّدة في المحادثة تأخذ فرع التراجع المحلّيّ لا المحادثة', () => {
  const AST = acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'script' });
  const fn = AST.body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'omranUndoHasImages');
  assert.ok(fn, 'omranUndoHasImages خارج __sendPromptCore');
  const has = vm.runInNewContext('(' + SRC.slice(fn.start, fn.end) + ')');
  const img = (d) => ({ isImage: true, name: 'image.png', dataUrl: d });
  /* الجهاز الثاني: الصور مصغّرات (v-gen-thumb) أو معرّفات مخزن، ولا lastEditedImage */
  assert.equal(has({ messages: [{ role: 'user', content: 'ارسم قطة' }, { role: 'assistant', attachments: [img('data:image/jpeg;base64,AA')] },
    { role: 'user', content: 'خلها حمراء' }, { role: 'assistant', attachments: [{ isImage: true, vaultId: 'v2', dataUrl: '' }] }] }), true);
  assert.equal(has({ lastEditedImage: { b64: 'x' }, messages: [] }), true, 'الجهاز نفسه كما كان');
  assert.equal(has({ messages: [{ role: 'user', attachments: [img('data:image/png;base64,AA')] }] }), false, 'صورة المستخدم وحدها ليست سلسلة تعديل');
  assert.equal(has({ messages: [{ role: 'assistant', content: 'مرحبا' }] }), false);
  assert.equal(has({ messages: [{ role: 'assistant', attachments: [{ isImage: true, purged: true, dataUrl: '' }] }] }), false, 'المحذوفة بلا معرّف لا تُعدّ');
  /* الشرط الحقيقيّ في __sendPromptCore يستعملها بدل lastEditedImage */
  const cond = lineOf('(!__ownerProvTurn || omranOwnerUndoIsImage(cur.messages)) /* v-owner-solo-all */ && __undoRe.test(text)');
  assert.ok(cond.includes('omranUndoHasImages(cur)'), 'شرط فرع التراجع');
  assert.ok(!/cur\.lastEditedImage && cur\.lastEditedImage\.b64 && \(!__ownerProvTurn/.test(cond), 'لم يعد يشترط الحالة المحلّيّة');
  /* والنسخة المختارة المخزونة بمصغّرة تُقرأ من المخزن قبل استعمالها (الجهاز نفسه: الأصل لا المصغّرة) */
  const rd = lineOf("try{ await __vaultRead(__pick); }catch(e){ __swallow(e, 'img:undo-vault'); }");
  assert.ok(/__pick\.vaultId && !__isBigDataImg\(__pick\.dataUrl\)/.test(rd), 'قراءة المخزن لكلّ نسخة بلا أصلها');
});
