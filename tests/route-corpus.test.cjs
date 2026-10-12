// tests/route-corpus.test.cjs — مدوّنة التوجيه في المستودع (tests/fixtures/route-corpus/*.json، ٦٨٠ خطوة موسومة مع r1 للمراجعة)
// العرض: مجموعات المسبار العمياء (b1–b6، c7–c9، ومدوّنة الـ١١٥) كانت في مجلّد مؤقّت فقط، واختبارات التوجيه تثبّت نصّ الكود لا قراره.
// القرار: المدوّنة هنا، والمسبار الكامل scripts/route-probe.mjs (sendPrompt الحقيقيّ في Chromium)، وهذا الاختبار السريع يشغّل قرارات
// التعابير الحقيقيّة (tests/_route-src.cjs) على كلّ خطوة في إحدى عشرة عائلة، ويثبّت ما بقي خطأً بأسمائه: أيّ رجوع يضيف معرّفًا فيفشل،
// وأيّ إصلاح يحذف معرّفًا فيفشل حتّى تُحدَّث القائمة — فالباقي معروف بالاسم دائمًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, corpusMisses, loadCorpus } = require('./_route-src.cjs');

const sets = loadCorpus();
const EXPECT = new Set(['chat', 'chat-search', 'chat-or-vision', 'chat-ambig', 'vision', 'image', 'edit', 'edit-text', 'video', 'video-ask', 'ad', 'ask', 'build-gate', 'build', 'video-from-image', 'project-edit']);
const EXP = new Set(['CHAT', 'CHAT_IMG', 'IMG_GEN', 'IMG_EDIT', 'IMG_TEXT', 'VIDEO', 'AD', 'PHOTOS', 'LOGO_FETCH', 'BUILD_GATE', 'BUILD_HTML']);

/* الباقي المعروف (١١ أكتوبر ٢٠٢٦) — كلّه خارج هذه الدفعة:
   textImage: اسم تصميم بلا فعل («بوستر لافتتاح محل عطور»، «دعوة زواج بالذهبي»، «بطاقة دعوة…»، «خلفية للايفون…») يحتاج المصنّف إيجابيًّا
   (البند ٥ في خطّة الموثوقيّة، باب مال)، و«ابي انفوجرافيك عن خطوات…» يغلقها فيتو كلمة «خطوات» في __MEDIA_TALK_RE. */
/* مراجعة الدفعة A (r1.json: مجموعات المراجع العمياء الثلاث + خطوات rel-1..rel-7، ١٢٠ خطوة): أربع عائلات جديدة — chatImg (كلام أو بوّابة
   بناء لا يصل بانِي الصور، والمصنّف oracle ثمّ متعذّر)، attEdit (الكتابة على صورة مرفقة ليست قراءة)، afterEdit، fromImage (الفيديو من الصورة
   المولَّدة). على cae646c تفشل كلّها بأسماء rel: chatImg ‏x01 x02 x08 y01 y02 y03 y05 y06 z05 z06، attEdit ‏x37 x38 y14 y15، afterEdit ‏y11a،
   fromImage ‏z01a z02a z03a z07a z08a z10a، ack ‏r01a r02a، chatSafe ‏x04 x05 x06 y07 y08. الباقي هنا قبل الدفعة كلّه:
   chatSafe ‏r1:x07 «بدي فيلم كوميدي عائلي للويكند» لا يفرقه تعبير عن طلب فيديو (يحسمه المصنّف؛ متعذّرًا = نافذة الصانع المجّانيّة)؛
   chatImg ‏b2:g25 «صورة لي وأنا في مكتبي» (ملتبس) وb5:c17 «…برومبت لتوليد صورة» حين يتعذّر المصنّف؛ attEdit ‏b1:p7 «…أهلا بكم» تلتقط «بكم» سؤالَ سعر. */
const KNOWN = {
  ack: [], ask: [], photoVideo: [], ocr: [], textVideo: [], afterEdit: [], fromImage: [],
  textImage: ['b1:i5', 'c115:X16', 'c7:m8', 'c8:nn0', 'c8:nn1', 'c8:nn2', 'c8:nn5', 'c9:j7'],
  chatSafe: ['r1:x07'],
  chatImg: ['b2:g25', 'b5:c17'],
  attEdit: ['b1:p7'],
};

test('١. المدوّنة سليمة: معرّفات فريدة، ووسوم معروفة، ونصّ في كلّ خطوة (أو صورة بلا نصّ)', () => {
  assert.ok(sets.length >= 11, 'المجموعات الإحدى عشرة (ومعها r1 للمراجعة)');
  let steps = 0;
  for (const s of sets) {
    const ids = new Set();
    for (const c of s.cases) {
      for (const st of [c].concat(c.then || [])) {
        steps++;
        assert.ok(typeof st.text === 'string' && (st.text.trim() || st.attach), s.name + ': نصّ (أو مرفق بلا نصّ) ' + (st.id || c.id));
        if (st.expect !== undefined) assert.ok(EXPECT.has(st.expect), s.name + ': وسم ' + st.expect);
        else assert.ok(Array.isArray(st.exp) && st.exp.every((e) => EXP.has(e)), s.name + ': exp ' + JSON.stringify(st.exp));
        if (st.attach) assert.ok(['photo', 'shot'].includes(st.attach), s.name + ': مرفق ' + st.attach);
      }
      assert.ok(!ids.has(c.id), s.name + ': معرّف مكرّر ' + c.id); ids.add(c.id);
    }
  }
  assert.ok(steps >= 550, 'خطوات: ' + steps);
});

test('٢. قرارات التعابير على المدوّنة كلّها: لا خطأ إلّا الباقي المعروف بالاسم', () => {
  const { misses, counts } = corpusMisses(load(), sets);
  for (const k of Object.keys(KNOWN)) {
    assert.ok(counts[k] > 0, k + ': العائلة فيها خطوات');
    assert.deepEqual(misses[k].slice().sort(), KNOWN[k].slice().sort(), k + ' (' + counts[k] + ' خطوة)');
  }
});
