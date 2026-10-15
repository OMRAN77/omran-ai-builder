// tests/chat-img-budget.test.cjs — v-chat-img-budget (لقطة مستخدم ١٥ أكتوبر على الجوّال): بعد «اكتب تحت الله يشفيج» على صورة، سؤال نصّيّ
// «ابا معلومات عن هندسه الطيران» سقط «413 FUNCTION_PAYLOAD_TOO_LARGE» على المسار الأوّل وكلّ الاحتياط، وسطر الفشل سمّى «(كلود)».
// السلسلة: «ابا» لم يكن في حارس طلب المخرَج النصّيّ (route-intent ١٥) فأُرفقت صورة الذاكرة — PNG بدقّة الأصل ~٦٫٩ مليون حرف —
// ولا سقف لحجم الصور على السلك، فالجسم ~٦٫٩ ميغا > حدّ فيرسل ٤٫٥ ميغا، والجسم نفسه يُعاد سبع مرّات.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const between = (a, b) => { const i = SRC.indexOf(a); assert.ok(i >= 0, a); const j = SRC.indexOf(b, i); assert.ok(j > i, b); return SRC.slice(i, j); };
const W = { Blob, JSON, Math, Object, String, Promise, functionalLabel: (k) => ({ openai: 'العميق', claude: 'المتقن', gemini: 'السريع' })[k] || k, __swallow: () => {} };
vm.runInNewContext(between('const OMRAN_CHAT_IMG_BUDGET = ', '/* v-chat-img-budget (اللقطة نفسها') + between('function omranPrimaryErrLine(', '/* يطبّق الميزانيّة') + between('async function omranApplyChatImgBudget(', '\n}\n') + '\n}\nthis.budget = omranChatImgBudget; this.apply = omranApplyChatImgBudget; this.line = omranPrimaryErrLine; this.CAP = OMRAN_CHAT_IMG_BUDGET;', W);

const img = (n, extra) => Object.assign({ dataUrl: 'data:image/png;base64,' + 'A'.repeat(n), mime: 'image/png', name: 'x.png' }, extra || {});
const MEMORY_PNG = 6877812; // المقاس في إعادة الإنتاج: صورة «اكتب تحت…» المحفوظة

test('تحت السقف: الصور تمرّ حرفيًّا كما هي — لا تصغير ولا إسقاط (لا يتغيّر أيّ طلب ينجح اليوم)', async () => {
  const a = img(1273999), b = img(900000);
  let calls = 0;
  const r = await W.budget([a, b], 6000, async () => { calls++; return 'data:image/jpeg;base64,B'; });
  assert.equal(calls, 0);
  assert.equal(r.dropped, 0);
  assert.equal(r.images[0], a); assert.equal(r.images[1], b);
});

test('لقطة المستخدم: صورة الذاكرة ٦٫٩ مليون حرف تُصغَّر JPEG ≤1568 فيصير الجسم تحت السقف', async () => {
  const seen = [];
  const r = await W.budget([img(MEMORY_PNG, { fromMemory: true, name: 'memory.png' })], 6313, async (u, side) => { seen.push(side); return 'data:image/jpeg;base64,' + 'J'.repeat(600000); });
  assert.deepEqual(seen, [1568]);
  assert.equal(r.dropped, 0);
  assert.equal(r.images[0].mime, 'image/jpeg');
  assert.ok(6313 + r.images[0].dataUrl.length < W.CAP);
});

test('التصغير فشل: صورة الذاكرة تُسقط أوّلًا، وأحدث صورة أرفقها المستخدم تبقى دائمًا', async () => {
  const fail = async () => '';
  const r1 = await W.budget([img(MEMORY_PNG, { fromMemory: true })], 6000, fail);
  assert.equal(r1.images.length, 0); assert.equal(r1.dropped, 1); assert.equal(r1.droppedMemory, true);
  const older = img(2000000, { name: 'old.jpg' }), newer = img(2000000, { name: 'new.jpg' });
  const r2 = await W.budget([older, newer], 6000, async (u) => u /* يرجع الأصل كما omranShrinkForEdit عند الفشل */);
  assert.deepEqual(r2.images.map((x) => x.name), ['new.jpg']);
  const r3 = await W.budget([img(5000000, { name: 'only.jpg' })], 6000, fail);
  assert.equal(r3.images.length, 1, 'صورة المستخدم الوحيدة لا تُسقط');
});

test('على الدور: المُسقط يُذكر للنموذج، وملاحظة memory.png تُزال إن أُسقطت صورتها', async () => {
  const turn = { role: 'user', content: 'ابا معلومات عن هندسه الطيران\n\n[ملاحظة للنموذج: الصورة memory.png أُرفقت تلقائيًّا من ذاكرة المحادثة لأنّ الرسالة قد تشير إليها. إن كانت الرسالة لا تخصّ الصورة فتجاهلها تمامًا]' };
  const big = img(MEMORY_PNG, { fromMemory: true });
  // المتصفّح غائب هنا (لا Image) فالتصغير الافتراضيّ يرجع '' — مثل فشل فكّ الصورة
  W.Image = function () { const o = {}; setTimeout(() => o.onerror && o.onerror(), 0); return o; };
  W.document = { createElement: () => ({}) };
  const r = await W.apply(turn, [big], [turn]);
  assert.equal(r.dropped, 1);
  assert.equal(turn.images, undefined, 'لا صور على الدور');
  assert.ok(!turn.content.includes('memory.png'), 'ملاحظة الذاكرة أُزيلت');
  assert.match(turn.content, /^ابا معلومات عن هندسه الطيران\n\n\[ملاحظة للنموذج: 1 صورة من هذه المحادثة لم تُرسل لكبر حجمها/);
  const ok = { role: 'user', content: 'وش فيها؟' }, small = img(800000);
  await W.apply(ok, [small], [ok]);
  assert.deepEqual(ok.images, [small]); assert.equal(ok.content, 'وش فيها؟');
});

test('السلك: الخطوة ⑤ تمرّ بالميزانيّة وتحمل علامة الذاكرة', () => {
  assert.ok(SRC.includes("name: a.name || '', fromMemory: !!a._fromMemory }; }) : []);"));
  assert.ok(SRC.includes('await omranApplyChatImgBudget(__lastTurn, __turnImgs, __turns); // v-chat-img-budget'));
  assert.ok(!SRC.includes('__turnImgs.length) __lastTurn.images = __turnImgs;'), 'لا إسناد خام بلا سقف');
});

test('سطر الفشل لغير المالك: الاسم الوظيفيّ للمسار الذي فشل فعلًا والرقم وحده', () => {
  const raw = 'Error: chat 413: Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n\nbom1::zjztx-1792078315718-c0d98543a23a';
  assert.equal(W.line(raw, 'openai', 'ar'), 'المسار الأوّل (العميق): خطأ 413');
  assert.equal(W.line(raw, 'openai', 'en'), 'Primary path (العميق): error 413');
  assert.equal(W.line('Error: stalled', 'gemini', 'ar'), 'المسار الأوّل (السريع): stalled');
  assert.ok(!/كلود|Claude|claude|anthropic/i.test(W.line(raw, '', 'ar').replace('المتقن', '')), 'لا اسم مزوّد');
});
