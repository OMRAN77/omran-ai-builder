// v-img-run-bind (فحص سجلّ العمل، المالك ١٤ أكتوبر «صلّح الثلاثة الباقية»): مع المحادثات المتوازية كانت حالة الصور عامّة — رسمة
// المحادثة أ تُكتب في المحادثة المعروضة ب (agentImgIds وlastEditedImage)، وedit_image في أ يعدّل صورة ب (تعديل مدفوع للصورة الخطأ)،
// وطلب ب يصفّر __genImages فتضيع رسمات أ. الآن لكلّ طلب سياق تشغيل (محادثته وخريطة صوره ومرجعه وكلمات مستخدمه) يصل الأدوات.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function tools(current) {
  const calls = [];
  const ctx = {
    Promise, JSON, String, Object, Array, Date, Error, Math, Number, setTimeout, clearTimeout,
    getCurrent: () => current,
    omranOwnerUi: () => true,
    localStorage: { getItem: () => 'claude' },
    authGet: () => 'tok',
    fetch: async (url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : null;
      calls.push({ url: String(url), body });
      if (/action=maha-image/.test(url)) return { ok: true, status: 200, json: async () => ({ imageBase64: 'TkVX' + calls.length, mimeType: 'image/png', engine: 'gemini' }) };
      if (/action=img/.test(url)) return { ok: true, status: 200, json: async () => ({ url: '/i/abcdef1' + calls.length + '.png', id: 'abcdef1' + calls.length }) };
      return { ok: true, status: 200, json: async () => ({}) };
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(read('js/app-17-agent-tools.js'), ctx);
  return { run: ctx.omranAgentTools.run, calls, ctx };
}

test('١. أدوات الصور تكتب في محادثة التشغيل لا المعروضة: الرسمة ورمزها ومعرّفها وآخر صورة، والتعديل على صورة محادثته', async () => {
  const A = { id: 'A', messages: [], lastEditedImage: { b64: 'QUFB', mime: 'image/png' } };
  const B = { id: 'B', messages: [], lastEditedImage: { b64: 'QkJC', mime: 'image/png' } };
  const { run, calls, ctx } = tools(B); // المالك فتح ب والرسم في أ ما زال يعمل
  const rcA = { chat: A, imgs: {}, ref: null, userText: 'ارسم تفاحة' };
  const out = await run('generate_image', { prompt: 'a red apple' }, rcA);
  const tok = (out.match(/__IMG_\d+__/) || [])[0];
  assert.ok(tok, out);
  assert.ok(rcA.imgs[tok], 'الرسمة في خريطة طلبها');
  assert.ok(!(ctx.__genImages || {})[tok], 'لا في العامّ الذي يصفّره طلب محادثة أخرى');
  assert.ok(A.agentImgIds && A.agentImgIds[tok], 'رمزها ← معرّفها في محادثتها');
  assert.equal(B.agentImgIds, undefined, 'المعروضة لا يُكتب فيها');
  assert.ok(/^TkVX/.test(A.lastEditedImage.b64));
  assert.equal(B.lastEditedImage.b64, 'QkJC', 'آخر صورة في ب كما هي');
  const draw = calls.find((c) => /maha-image/.test(c.url));
  assert.equal(draw.body.userText, 'ارسم تفاحة', 'كلمات مستخدم طلبه لا العامّ');

  calls.length = 0;
  const lastA = A.lastEditedImage.b64;
  await run('edit_image', { instruction: 'make it blue' }, rcA);
  const edit = calls.find((c) => /maha-image/.test(c.url));
  assert.equal(edit.body.editImageBase64, lastA, 'التعديل على آخر صورة في أ — لا صورة ب (تعديل مدفوع للصورة الخطأ)');
  assert.equal(B.lastEditedImage.b64, 'QkJC');

  calls.length = 0;
  const saved = await run('save_image', { token: tok }, rcA);
  assert.match(saved, /^✅ حُفظت/, 'حفظ الرسمة برمزها من خريطة طلبها');
});

test('٢. مستدعٍ بلا سياق (القديم) كما كان: المعروضة والعامّ', async () => {
  const B = { id: 'B', messages: [] };
  const { run, ctx } = tools(B);
  const out = await run('generate_image', { prompt: 'x' });
  const tok = (out.match(/__IMG_\d+__/) || [])[0];
  assert.ok(ctx.__genImages[tok]);
  assert.ok(B.agentImgIds[tok]);
});

test('٣. app-18: الطلب يحمل محادثته من app-09 — imgIds منها، والأدوات تأخذ سياقه، وخريطة صوره باسمها، والعامّ صوره عند العودة', async () => {
  const src = read('js/app-18-chat-tools.js');
  const body = src.slice(0, src.indexOf('// v478'));
  const A = { id: 'A', messages: [], agentImgIds: { __IMG_3__: 'abc1234' } };
  const B = { id: 'B', messages: [], agentImgIds: { __IMG_1__: 'bbb1234' } };
  const ran = [];
  const sent = [];
  const enc = new TextEncoder();
  let once = false;
  const lines = [{ clientTool: { id: 'c1', name: 'generate_image', input: { prompt: 'x' } } }, { delta: 'تم' }].map((e) => 'data: ' + JSON.stringify(e) + '\n').join('');
  const window = { omranAgentTools: { run: async (n, a, rc) => { ran.push({ n, rc }); rc.imgs.__IMG_4__ = 'data:image/png;base64,QQ=='; return 'ok'; } } };
  const ctx = {
    window, TextDecoder, TextEncoder, Promise, setTimeout, clearTimeout, JSON, String, Array, Date, Error,
    tStatus: (ev) => ev.status, getCurrent: () => B, omranOwnerUi: () => true,
    fetch: async (url, init) => {
      sent.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
      if (!/action=chat/.test(url)) return { ok: true, json: async () => ({}) };
      return { ok: true, body: { getReader: () => ({ read: async () => { if (once) { await new Promise((r) => setTimeout(r, 5)); return { done: true }; } once = true; return { done: false, value: enc.encode(lines) }; }, cancel() {} }) } };
    },
  };
  vm.runInNewContext(body, ctx);
  const onDelta = () => {};
  onDelta.__chat = A;
  const r = await window.callChatWithTools([{ role: 'user', content: 'ارسم' }], onDelta, 'claude');
  assert.equal(r.reply, 'تم');
  assert.deepEqual(sent[0].body.imgIds, { __IMG_3__: 'abc1234' }, 'رموز محادثة الطلب لا المعروضة');
  assert.equal(ran.length, 1);
  assert.equal(ran[0].rc.chat, A, 'الأداة تعرف محادثتها');
  assert.equal(window.__genImagesByChat.A, ran[0].rc.imgs, 'خريطة صوره باسم محادثته — العرض يقرؤها');
  assert.equal(window.__genImages, ran[0].rc.imgs, 'عند العودة العامّ صور هذا الطلب (substUserImage في المستدعي)');
  window.__genImages = { other: 1 }; // طلب محادثة أخرى صفّره أثناء العمل
  assert.ok(window.__genImagesByChat.A.__IMG_4__, 'رسمات أ باقية في خريطتها');
});

test('٤. الأسلاك: app-09 يمرّر المحادثة (__sigFn) ووضع الوكيل سياقه، والعرض يقرأ صور محادثته — في الأجزاء والحزمة', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes('fn.__signal = __runCtl.signal; fn.__status = chatStatus; fn.__chat = cur;'), f);
    assert.ok(s.includes("const __agRc = { chat: cur, imgs: window.__genImages, ref: null, userText: '' };"), f);
    assert.ok(s.includes('try{ out = await window.omranAgentTools.run(ct.name, ct.input, __agRc); }'), f);
  }
  for (const f of ['js/app-04-i18n-state.js', 'js/app.bundle.js']) {
    assert.ok(read(f).includes('const url = m._imgCache[tok] || (((window.__genImagesByChat || {})[cur && cur.id]) || window.__genImages || {})[tok];'), f);
  }
  for (const f of ['js/app-18-chat-tools.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes('serveClientTool(ev.clientTool, __rc); }') && s.includes('window.__genImages = __rc.imgs;'), f);
  }
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/img-run-bind.test.cjs'));
});
