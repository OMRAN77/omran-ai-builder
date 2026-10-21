'use strict';
/* v-img-fail-say (تدقيق ١٨–١٩ أكتوبر، g05/chat-decor + chat-architecture): فشل صور المحادثة كان صامتًا.
   - الديكور: الحلقة تبتلع كلّ فشل ثمّ تدفع «اختر النمط الي أعجبك» دائمًا ولو لم تخرج صورة، وبعد أوّل 402 تحاول ثلاث مرّات أخرى.
   - المعماريّ: __archGen يرجع null عند 402 بلا سبب، والمسار يكمل للمحادثة كأنّ شيئًا لم يحدث («انتهت الرسائل المجانية» وحدها).
   الكتلتان الحقيقيّتان من __sendPromptCore تُشغَّلان هنا في vm بـfetch مزيّف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const AST = acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'script' });
const topOpt = (name) => { const n = AST.body.find((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === name); return n ? SRC.slice(n.start, n.end) : ''; };
const lineStart = (i) => SRC.lastIndexOf('\n', i) + 1;
const T = { plansWhyPoints: 'POINTS', voiceImageFailed: 'FAILED' };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function decorBlock() {
  const i = SRC.indexOf('for(let __di2 = 0; __di2 < __decorStyles.length; __di2++){');
  assert.ok(i > 0, 'حلقة الديكور');
  const hint = SRC.indexOf("'Pick a style and say", i);
  const endMark = 'renderAll(); saveState();\n        return;';
  const j = SRC.indexOf(endMark, hint);
  assert.ok(hint > i && j > hint, 'نهاية كتلة الديكور');
  return SRC.slice(lineStart(i), j + endMark.length);
}
function runDecor(responses) {
  const calls = [];
  const cur = { messages: [] };
  const sb = {
    Promise, JSON, String, console,
    lang: 'ar', t: (k) => T[k] || k,
    __decorStyles: ['عصري', 'فاخر', 'بسيط', 'عربي كلاسيك'].map((ar, k) => ({ ar, en: 'S' + k, prompt: 'p' + k })),
    __decCmp: { b64: 'QQ==', mime: 'image/jpeg' }, __runCtl: { signal: null }, thinkingDiv: {},
    chatPhase() {}, renderAll() {}, saveState() {}, __swallow() {}, authGet: () => '', window: { getGuestId: () => 'g' },
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); const r = responses[Math.min(calls.length - 1, responses.length - 1)]; return r; },
    cur,
  };
  vm.createContext(sb);
  vm.runInContext(topOpt('omranImgFailLine'), sb);
  return vm.runInContext('(async () => {\n' + decorBlock() + '\n})()', sb).then(() => ({ calls, cur }));
}

test('١. الديكور: 402 (نقاط) من أوّل نمط = نداء واحد، ورسالة النقاط بدل «اختر النمط»، ولا صورة ولا متابعة تعديل', async () => {
  const { calls, cur } = await runDecor([res(402, { error: 'points_insufficient' })]);
  assert.equal(calls.length, 1, 'لا نداءات زائدة بعد ردّ نهائيّ');
  const last = cur.messages[cur.messages.length - 1];
  assert.ok(last && /POINTS/.test(last.content), 'سطر النقاط: ' + (last && last.content));
  assert.ok(!cur.messages.some((m) => /اختر النمط/.test(m.content || '')), 'لا «اختر النمط» بلا صور');
  assert.ok(!cur.lastMsgWasImageEdit, 'لا متابعة تعديل على لا شيء');
});

test('٢. الديكور: الأربعة فشلت بخطأ عابر (502) = أربع محاولات ثمّ «ما قدرت أسوي الصورة»', async () => {
  const { calls, cur } = await runDecor([res(502, { error: 'image_generation_busy', retryable: true })]);
  assert.equal(calls.length, 4);
  assert.ok(/FAILED/.test(cur.messages[cur.messages.length - 1].content));
  assert.ok(!cur.messages.some((m) => /اختر النمط/.test(m.content || '')));
});

test('٣. الديكور: نجاح واحد يكفي للتلميح كما كان، والصورة في المحادثة', async () => {
  const ok = res(200, { imageBase64: 'SU1H', mimeType: 'image/jpeg' });
  const { calls, cur } = await runDecor([res(502, { retryable: true }), ok, res(502, { retryable: true }), res(502, { retryable: true })]);
  assert.equal(calls.length, 4);
  assert.equal(cur.messages.filter((m) => m.attachments).length, 1);
  assert.ok(/اختر النمط/.test(cur.messages[cur.messages.length - 1].content), 'التلميح باقٍ');
  assert.equal(cur.lastMsgWasImageEdit, true);
});

function archEnv(responses) {
  const calls = [];
  const cur = { messages: [] };
  const i = SRC.indexOf('const __archGen = async (label, prompt) => {');
  assert.ok(i > 0, '__archGen');
  const endMark = 'return __k ? __d : null;\n      };';
  const j = SRC.indexOf(endMark, i);
  const gen = SRC.slice(lineStart(i), j + endMark.length);
  const chkAt = SRC.indexOf('__archImagesDone = !!(__planImg || __extImg);');
  assert.ok(chkAt > j, 'سطر نتيجة الصورتين');
  const chk = SRC.slice(lineStart(chkAt), SRC.indexOf('\n', chkAt));
  const sb = {
    Promise, JSON, String, console, setTimeout,
    lang: 'ar', t: (k) => T[k] || k, thinkingDiv: {}, __runCtl: { signal: null },
    __showImgLoading() {}, renderAll() {}, saveState() {}, __swallow() {}, authGet: () => '', window: { getGuestId: () => 'g' },
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return responses[Math.min(calls.length - 1, responses.length - 1)]; },
    cur,
  };
  vm.createContext(sb);
  vm.runInContext(topOpt('omranImgFailLine'), sb);
  const run = vm.runInContext('(async () => { let __archImagesDone = false;\n' + gen + '\nconst __planImg = await __archGen("a", "plan");\nconst __extImg = await __archGen("b", "ext");\n' + chk + '\nreturn __archImagesDone; })', sb);
  return { run, calls, cur };
}

test('٤. المعماريّ: 402 للصورتين = نداءان فقط، وسطر النقاط يُدفع قبل أن يكمل المسار للمحادثة', async () => {
  const { run, calls, cur } = archEnv([res(402, { error: 'points_insufficient' })]);
  const done = await run();
  assert.equal(done, false);
  assert.equal(calls.length, 2, 'نداء لكلّ صورة بلا إعادة');
  assert.equal(cur.messages.length, 1);
  assert.ok(/POINTS/.test(cur.messages[0].content), cur.messages[0].content);
});

test('٥. المعماريّ: فشل نهائيّ آخر (422 بلا إعادة) = «ما قدرت أسوي الصورة»، ونجاح صورة واحدة لا يدفع شيئًا', async () => {
  const a = archEnv([res(422, { error: 'image_generation_failed', retryable: false })]);
  await a.run();
  assert.equal(a.calls.length, 2);
  assert.ok(/FAILED/.test(a.cur.messages[0].content));
  const b = archEnv([res(200, { imageBase64: 'SU1H' }), res(402, { error: 'points_insufficient' })]);
  assert.equal(await b.run(), true);
  assert.equal(b.cur.messages.length, 0, 'المخطط نجح فالمسار يكمل كما كان');
});
