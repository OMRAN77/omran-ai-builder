'use strict';
// tests/video-write-ask.test.cjs — v-video-write-ask (لقطة مشترك Max ١٦ أكتوبر)
// العرض: «اكتب حياتي و قلب لون ابيض في الفيديو» بعد فيديو في المحادثة نفسها ← طلب فيديو مدفوع جديد وصفُه الجملة نفسها (نافذتا خصم ٥٥ نقطة)،
// ثمّ «⚠️ video_cooldown». الجذر: «ابي» في __routeCmdRe بلا حدّ كلمة طابق داخل «ابيض» فصار الطلب أمر فيديو؛ والكتابة على فيديو قائم
// ليست إنشاء فيديو ولا يملك التطبيق الكتابة على الفيديو بعد.
// القرار: (١) «اكتب/حط … على|في|بال الفيديو» = جواب صادق محلّيّ بلا شبكة ولا خصم (vwWriteNo بالـ١٤ لغة)، قبل بوّابات الوسائط؛
// (٢) «ابي» لا تطابق داخل «ابيض» (وتوأمها GATE_CMD_RE)، و«هات» في أوّل الكلمة فقط (لا «فيديوهات» ولا «هاتف»). «طور» كما كانت: «تقدر تطور لي موقع» بناء.
// مراجعة النقض: الجواب لا يُعترض إلّا بفيديو فعليّ (مرفق أو في آخر ٨ رسائل)، ولا مع صورة مرفقة، ولا بكود مفتوح أو وضع cc/agent، ولا لطلب إنشاء فيديو.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SRC = read('js/app-09-attach.js');
const line = (head) => { const i = SRC.indexOf(head); assert.ok(i >= 0, head); return SRC.slice(i, SRC.indexOf('\n', i)); };
const block = (head, end) => { const i = SRC.indexOf(head); assert.ok(i >= 0, head); const j = SRC.indexOf(end, i); assert.ok(j > i, end); return SRC.slice(i, j + end.length); };

const H = {};
const HELPERS = [line('const __VW_PUT_RE = '), line('const __VW_ON_RE = '), line('const __VW_PLACE_RE = '), line('const __VW_ABOUT_RE = '), line('const __VW_MAKE_RE = '),
  block('function omranVideoWriteAsk(text, hasVideo){', '\n}'), block('function omranRecentVideo(c){', '\n}'), block('function omranVideoWriteGate(text, vwAtt){', '\n}')].join('\n');
vm.runInNewContext(HELPERS + '\nthis.ask = omranVideoWriteAsk;', H);
/* البوّابة بسياقها: المحادثة الحاليّة، المرفقات المعلّقة، والوضع */
const gate = (text, ctx) => { const G = { pendingAttachments: ctx.pending || [], window: { __omMode: ctx.mode || '' }, getCurrent: () => ctx.cur || null };
  vm.runInNewContext(HELPERS + '\nthis.g = omranVideoWriteGate;', G); return G.g(text, ctx.vwAtt || null); };
const withVideo = { messages: [{ role: 'user', content: 'سوي فيديو' }, { role: 'assistant', content: '🎬 فيديوك جاهز', attachments: [{ isVideo: true, url: 'https://x/v.mp4' }] }] };
const noVideo = { messages: [{ role: 'user', content: 'اكتب قصيدة' }, { role: 'assistant', content: 'المقطع الأوّل…' }] };

test('١. «اكتب/حط … على|في|بال الفيديو» طلب كتابة على فيديو قائم — والكلام عن الفيديو أو إنشاؤه ليس كذلك', () => {
  for (const s of ['اكتب حياتي و قلب لون ابيض في الفيديو', 'حط قلب ابيض على الفيديو', 'ابي تكتب حياتي على الفيديو', 'اكتب اسمي بالفيديو',
    'ضيف ايموجي 🤍 فوق الفيديو', 'اكتب «مبروك» على المقطع', 'ممكن تكتب اسمي على الفيديو؟', 'write my name on the video',
    'حط قلب على الفيديو اللي سويته', 'حطّ اسمي على الفيديو', 'اكتبيلي حياتي في الفيديو', 'add my name to the video']) assert.equal(H.ask(s, false), true, s);
  for (const s of ['اكتب تحت خوات بلون الأحمر و حط قلب ابيض', 'حط قلب ابيض']) assert.equal(H.ask(s, true), true, 'مع فيديو مرفق: ' + s);
  for (const s of ['اكتب لي ملخص الفيديو', 'اكتب سكربت فيديو عن السلامة', 'اكتب لي وش يقول في الفيديو', 'اكتب الكلام اللي في الفيديو',
    'اكتب كابشن للفيديو', 'ترجم الفيديو', 'سوي فيديو عن صقر يطير فوق البحر', 'اكتب حياتي و قلب لون ابيض', 'ضيف زر تحميل على الفيديو في الصفحة',
    'وش مكتوب في الفيديو؟', 'سوي فيديو اعلان لمطعمي واكتب في الفيديو رقم الجوال', 'make a promo video for my cafe and put the logo in the video',
    'اكتب رأيك في الفيديو', 'ضيف خاصية الكتابة على الفيديو']) assert.equal(H.ask(s, false), false, s);
  for (const s of ['لخص الفيديو', 'حلل هذا الفيديو', 'اكتب لي ملاحظاتك على المونتاج', 'اكتب المكونات الموجودة في الفيديو', 'اكتب كلمات الأغنية في الفيديو',
    'write down the steps in the video', 'write your feedback on my editing']) assert.equal(H.ask(s, true), false, 'مع فيديو مرفق (مشاهدة): ' + s);
});

test('١ب. البوّابة: يُعترض فقط بفيديو فعليّ في المحادثة أو مرفق — لا بقصيدة «مقطع»، ولا مع صورة مرفقة (لقطة الفيديو)، ولا بكود مفتوح أو وضع cc/agent', () => {
  const MAX = 'اكتب حياتي و قلب لون ابيض في الفيديو';
  assert.equal(gate(MAX, { cur: withVideo }), true, 'لقطة المشترك: فيديو في المحادثة');
  assert.equal(gate(MAX, { cur: noVideo }), false, 'لا فيديو = كلام عاديّ للنموذج');
  for (const s of ['ضيف جملة في المقطع الثاني', 'اكتب بيت زيادة في المقطع الأخير', 'اكتب خاتمة في المقطع الأخير من الرسالة']) assert.equal(gate(s, { cur: noVideo }), false, s);
  assert.equal(gate(MAX, { cur: withVideo, pending: [{ isImage: true, dataUrl: 'data:image/png;base64,x' }] }), false, 'اللقطة المرفقة تذهب للكتابة على الصورة — لا حلقة رفض');
  assert.equal(gate('حط ايقونة تشغيل فوق الفيديو', { cur: Object.assign({ code: '<video src=a.mp4></video>' }, withVideo) }), false, 'تعديل صفحة فيها فيديو');
  assert.equal(gate(MAX, { cur: withVideo, mode: 'cc' }), false);
  assert.equal(gate(MAX, { cur: withVideo, mode: 'agent' }), false);
  assert.equal(gate('اكتب تحت خوات بلون الأحمر و حط قلب ابيض', { cur: noVideo, vwAtt: { isVideoWatch: true } }), true, 'فيديو مرفق');
  const old = { messages: [{ role: 'assistant', attachments: [{ isVideo: true }] }].concat(Array.from({ length: 9 }, () => ({ role: 'user', content: 'كلام' }))) };
  assert.equal(gate(MAX, { cur: old }), false, 'فيديو أقدم من ٨ رسائل لا يُعدّ');
});

test('٢. «ابي» لا تطابق داخل «ابيض»، و«هات» في أوّل الكلمة — فلا يصير وصفٌ أمرَ فيديو مدفوع؛ وبناء «تطور لي» باقٍ', () => {
  const R = require('./_route-src.cjs').load().R;
  for (const s of ['اكتب حياتي و قلب لون ابيض في الفيديو', 'الفيديوهات اللي نزلتها امس كانت حلوة', 'هاتفي فيه فيديو'])
    assert.equal(R.routeCmd.test(s), false, s);
  for (const s of ['ابي فيديو عن صقر', 'أبي فيديو', 'وطوّر الصفحة', 'طور التطبيق', 'تقدر تطور لي موقع لمطعمي؟', 'هات فيديو عن البحر', 'وهات صورة'])
    assert.equal(R.routeCmd.test(s), true, s);
  assert.ok(line('    const GATE_CMD_RE = /(').includes('|ابي(?!ض)|أبي(?!ض)|'), 'توأمها في بوّابة البناء');
});

test('٣. السلك: الجواب الصادق قبل مشاهدة الفيديو المرفق وقبل بوّابات الوسائط، على السطر نفسه (سقّاطة __sendPromptCore)', () => {
  const l = line("  if(typeof window.omranVideoWriteSend === 'function' && omranVideoWriteGate(text, __vwAtt))");
  assert.ok(l.indexOf('omranVideoWriteSend') < l.indexOf('omranVideoWatchSend'));
  assert.ok(SRC.indexOf(l) < SRC.indexOf('let __mediaLane'), 'قبل المصنّف ومسار الفيديو المدفوع');
  assert.ok(SRC.indexOf('function omranVideoWriteGate(') < SRC.indexOf('async function __sendPromptCore('), 'البوّابة خارج الدالة الكبيرة');
});

test('٤. app-32: الجواب محلّيّ — رسالة المستخدم وردّ vwWriteNo بلا أيّ نداء شبكة، والمرفق يُزال', async () => {
  const calls = [];
  const state = { projects: [], currentId: null };
  const att = { name: 'clip.mp4', isVideoWatch: true, label: '🎬 0:12', durationSec: 12 };
  const sb = {
    state, pendingAttachments: [att], console, setTimeout,
    fetch: async (u) => { calls.push(u); return { ok: true, json: async () => ({}) }; },
    getCurrent: () => state.projects.find((p) => p.id === state.currentId) || null,
    $: () => ({ value: 'x' }), t: (k) => (k === 'vwWriteNo' ? 'NO-WRITE' : k),
    renderAll() {}, saveState() {}, renderAttachStrip() {}, __swallow() {},
    document: { body: { classList: { remove() {} } }, createElement: () => ({}) },
  };
  sb.window = sb;
  vm.runInNewContext(read('js/app-32-video-watch.js'), sb);
  await sb.omranVideoWriteSend('اكتب تحت خوات بلون الأحمر و حط قلب ابيض', att);
  const cur = sb.getCurrent();
  assert.equal(calls.length, 0, 'لا رفع ولا تحليل ولا توليد');
  assert.equal(cur.messages.length, 2);
  assert.equal(cur.messages[0].role, 'user'); assert.equal(cur.messages[0].attachments[0].isVideoWatch, true);
  assert.deepEqual({ role: cur.messages[1].role, content: cur.messages[1].content }, { role: 'assistant', content: 'NO-WRITE' });
  assert.equal(sb.pendingAttachments.length, 0);
});

test('٥. vwWriteNo وvidCancelled بالـ١٤ لغة بلا اسم مزوّد، ووسم ملفّات اللغات مرفوع', () => {
  const I = read('js/app-03-i18n-data.js');
  for (const k of ['vwWriteNo', 'vidCancelled']) {
    assert.equal((I.match(new RegExp('\\b' + k + ": '", 'g')) || []).length, 2, k + ': العربيّة والإنجليزيّة');
    for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
      const m = read('i18n/' + lg + '.js').match(new RegExp('"' + k + '": "([^"]+)"'));
      assert.ok(m && m[1].length > 10, k + ' ' + lg);
      assert.ok(!/runway|veo|gemini|openai|claude|google|grok|kimi|groq/i.test(m[1]), 'لا اسم مزوّد: ' + k + ' ' + lg);
    }
  }
  const v = Number((read('js/app-04-i18n-state.js').match(/i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1] || 0);
  assert.ok(v > 746, 'كسر كاش ملفّات اللغات بعد إضافة المفتاح');
});

test('٦. أداة generate_video (المحادثة بالأدوات): طلب الكتابة على فيديو قائم لا يبدأ توليدًا ولا يخصم', async () => {
  const calls = [];
  const sb = { console, lang: 'ar', authGet: () => 'tok', localStorage: { getItem: () => null }, __chatLastUserText: 'اكتب حياتي و قلب لون ابيض في الفيديو' };
  sb.window = sb;
  sb.postWithConfirm = async (u) => { calls.push(u); return { ok: true, status: 200, json: async () => ({ id: 'x' }) }; };
  sb.fetch = async (u) => { calls.push(u); return { ok: true, json: async () => ({}) }; };
  vm.runInNewContext(HELPERS + '\n' + read('js/app-17-agent-tools.js'), sb);
  const out = await sb.omranAgentTools.run('generate_video', { prompt: 'قلب أبيض وكلمة حياتي', ratio: 'portrait' }, { imgs: {}, chat: null, ref: null, userText: 'اكتب حياتي و قلب لون ابيض في الفيديو' });
  assert.match(out, /^لم يبدأ أيّ توليد/);
  assert.equal(calls.length, 0);
});
