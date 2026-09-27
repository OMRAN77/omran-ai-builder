'use strict';
/* v-merge-803 — ما بقي من #803 فوق تصميم #798 (الاستبدال والحذف والاسترجاع المشكول مغطّاة في image-text-replace):
   فيديو المالك مقابل ChatGPT بالطلب «ابغي صوره مكتوب عليها ان الله و ان اليه واجعون و الصوره تعبر عن وفات شخص عزيز»:
   تطبيقنا رسم أصيص ورد، وChatGPT رسم مقبرة وفانوسًا ووردة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseImageTextSpec } = require('../js/app-08-image-text.js');
const { buildGenerationPrompt } = require('../api/_lib/image-prompt');

const cond = (p) => /condolence composition/.test(buildGenerationPrompt(p, { reserveTextArea: true, textPosition: 'bottom' }));

test('server: a condolence scene gets a symbolic mourning direction, not a portrait or product polish', () => {
  const p = buildGenerationPrompt('الصوره تعبر عن وفات شخص عزيز', { reserveTextArea: true, textPosition: 'bottom' });
  assert.match(p, /quiet, dignified condolence composition/);
  assert.match(p, /Show no faces, portraits or identifiable people/);
  assert.doesNotMatch(p, /portrait treatment|SIGNATURE POLISH|product hero render/);
  const person = buildGenerationPrompt('صورة شخص يمشي في الحديقة');
  assert.match(person, /portrait treatment/, 'غير العزاء كما كان');
  assert.match(person, /SIGNATURE POLISH/);
});

test('server: whole condolence words only — greetings, «dear», names and professions are not mourning', () => {
  for (const p of ['الصوره تعبر عن موت شخص عزيز', 'صورة توفي فيها جدي', 'مشهد تعزية بلا وجوه: غروب', 'funeral flowers']) assert.equal(cond(p), true, p);
  for (const p of ['ارسم صورة حفل افتتاح مطعم مع ضيوفنا الأعزاء', 'بطاقة معايدة السلام عليكم ورحمة الله وبركاته', 'صورة صالة فيها صوفات رمادية',
    'a mourning dove on a branch', 'ارسم طيور راجعون لأعشاشها', 'ارسم جدي رحمه الله جالس في المجلس', 'صورة محل حداد يصنع بابًا']) {
    assert.equal(cond(p), false, p);
  }
});

test('a condolence text with no scene gets a quiet mourning scene (was a random stadium/bridge)', () => {
  for (let i = 0; i < 12; i++) {
    const s = parseImageTextSpec('ابغي صوره مكتوب عليها إنا لله وإنا إليه راجعون');
    assert.equal(s.visualEdit, null);
    assert.match(s.visualPrompt, /^مشهد تعزية هادئ بلا أشخاص ولا وجوه/);
    assert.equal(cond(s.visualPrompt), true, 'المشهد الاحتياطيّ يفعّل اتّجاه العزاء في الخادم');
  }
  assert.match(parseImageTextSpec('اكتب عليها الله يرحمه').visualPrompt, /تعزية/);
  for (const t of ['السلام عليكم ورحمة الله وبركاته', 'أهلا بضيوفنا الأعزاء', 'حجاجنا راجعون بالسلامة', 'رحم الله امرأ عرف قدر نفسه']) {
    assert.doesNotMatch(parseImageTextSpec('اكتب عليها ' + t).visualPrompt, /تعزية/, t);
  }
});

test('the owner request: condolence text + a scene the user described → the scene stays condolence', () => {
  const s = parseImageTextSpec('ابغي صوره مكتوب عليها ان الله و ان اليه واجعون و الصوره تعبر عن موت شخص عزيز');
  assert.match(s.visualPrompt, /^مشهد تعزية بلا وجوه: /);
  assert.equal(cond(s.visualPrompt), true);
  assert.equal(cond(parseImageTextSpec('ابغى صوره مكتوب عليها ان الله و ان اليه واجعون و الصوره تعبر عن وفات شخص عزيز').visualPrompt), true);
});

test('names and phrases containing «والصورة/والمشهد + ال…» are printed whole, not cut into a scene', () => {
  assert.equal(parseImageTextSpec('ابغي صوره مكتوب عليها مؤسسة الصوت والصورة للإنتاج الفني').exactText, 'مؤسسة الصوت والصورة للإنتاج الفني');
  assert.equal(parseImageTextSpec('اكتب عليها الحياة مسرح والمشهد الاخير لك').exactText, 'الحياة مسرح والمشهد الاخير لك');
  assert.equal(parseImageTextSpec('ابي صوره بحر مكتوب عليها جمعة مباركة و الخلفيه زرقاء').exactText, 'جمعة مباركة', 'الوصف الحقيقيّ ما زال يُقطع');
});

test('«غيّر الاسم/احذف الكلام واكتب…» is not sent to the image model as a visual edit', () => {
  for (const p of ['غير الاسم واكتب سيف', 'احذف الكلام واكتب «عمران»', 'غير الكلام واكتب عليها «عمران»']) {
    assert.equal(parseImageTextSpec(p).visualEdit, null, p);
  }
  assert.equal(parseImageTextSpec('غير الخلفية واكتب عليها عمران').visualEdit, 'غير الخلفية', 'تعديل بصريّ حقيقيّ يبقى');
});

test('the owner\'s exact turn-2 wording «ان الله وآنه اليه راجعون» is corrected to the verse', () => {
  const { fixKnownPhrases } = require('../js/app-08-image-text.js');
  assert.equal(fixKnownPhrases('ان الله وآنه اليه راجعون'), 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ');
  assert.equal(parseImageTextSpec('لا في الصوره بس مكتوب فيها ان الله وآنه اليه راجعون').exactText, 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ');
});

test('review #803: «احذف الكلام وحط وردة» removes the text and never prints the object word', () => {
  for (const p of ['احذف الكلام وحط وردة', 'احذف هذا الكلام وحط كرسي', 'امسح الكتابة وضيف شجرة']) {
    const s = parseImageTextSpec(p);
    assert.notEqual(s.wantsText, true, p);
    assert.equal(s.removeText, true, p);
  }
  for (const [p, want] of [['احذف الكلام وحط اسمي عمران', 'عمران'], ['احذف الكلام وحط «مبروك»', 'مبروك'], ['امسح الكلام واكتب سيف', 'سيف']]) {
    assert.equal(parseImageTextSpec(p).exactText, want, p);
  }
});

test('review #803 (bugbot): longer layer-only clauses are never sent as a visual edit', () => {
  for (const p of ['احذف الكلام الي تحت واكتب «سيف»', 'غير اسمي واكتب سيف', 'امسح الكتابة اللي فوق واكتب «مبروك»']) {
    assert.equal(parseImageTextSpec(p).visualEdit, null, p);
  }
});

test('review #803 (bugbot): figurative «بموت/للموت» is romance, not mourning', () => {
  for (const p of ['صورة رومانسية مكتوب عليها بموت عليك', 'قلب أحمر وأحبك للموت', 'صورة قطة تموت من الضحك', 'ارسم فيلم رعب عن ملك الموت الخيالي في قلعة']) {
    assert.equal(cond(p), false, p);
  }
  for (const p of ['الصوره تعبر عن موت شخص عزيز', 'صورة حزينة عن الموت والفقد', 'مشهد عن موت صديق']) assert.equal(cond(p), true, p);
});

test('review #803 (bugbot): death of a relative with a possessive ending is condolence', () => {
  for (const p of ['صورة عن موت ابوي', 'صورة حزينة لموت امي', 'الصوره تعبر عن موت جدي', 'مات اخوي وابي صورة', 'ماتت جدتي', 'توفيت امي الله يرحمها', 'صورة وفاة صديقي']) {
    assert.equal(cond(p), true, p);
  }
  for (const p of ['بموت عليك', 'أحبك للموت', 'مات من الضحك']) assert.equal(cond(p), false, p);
});
