'use strict';
/* v-chat-solve-homework (طلب المالك ٣٠ سبتمبر: «نفس الفكرة، ارفع الصورة ويعطيني الجواب الدقيق،
   لكن في التعليم خلّيها نفس ماهي»): أداة جديدة solve_homework في المحادثة العامّة تستدعي نفس
   /api/edu?action=solve الحقيقيّ (محرّك «حلّ الواجب» المتخصّص) — صفر تعديل على api/edu.js أو
   js/edu-plus.js. هذا الملفّ يختبر: (أ) تعريف الأداة والتوجيه في api/_lib/chat.js، و(ب) منطق
   التنفيذ الفعليّ في js/app-17-agent-tools.js (الصورة/النصّ → نداء الخادم → نصّ منسَّق). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const chat = read('api/_lib/chat.js');
const tools = read('js/app-17-agent-tools.js');

/* ---------- api/_lib/chat.js: التعريف والتوجيه ---------- */
test('chat.js: أداة solve_homework معرَّفة، وتُوجَّه لـrunInClient بمهلة كافية، وتذكر نفسها بدل التحليل الذاتي', () => {
  const toolsSrc = chat.slice(chat.indexOf('const TOOLS = ['), chat.indexOf('\n];\n', chat.indexOf('const TOOLS = [')) + 4);
  assert.match(toolsSrc, /name: 'solve_homework'/);
  assert.match(toolsSrc, /input_schema:[\s\S]{0,300}text:[\s\S]{0,150}string/);
  assert.match(chat, /else if \(cb\.name === 'solve_homework'\) result = await runInClient\(send, 'solve_homework', input, 285000\);/, 'توجيه بمهلة تكفي ورقة عمل كاملة — أطول من مهلة anthropicJSON نفسها (٢٨٠ث) لا أقصر منها');
  const imgRule = chat.slice(chat.indexOf('[الصورة المرفقة — اقرأها أولًا'), chat.indexOf('[الصورة المرفقة — اقرأها أولًا') + 1200);
  assert.match(imgRule, /استدعِ solve_homework فورًا بدل تحليلك النصّي الخاصّ/, 'استثناء الواجب/الامتحان من التحليل الذاتي');
  assert.match(chat, /• solve_homework — واجب أو سؤال دراسيّ/, 'بند مستقلّ في TOOLS_NOTE');
});

test('chat.js: سطر الأثر يستعمل مفتاح trTool العامّ المترجَم فعلًا — لا مفتاح جديد بلا ترجمات', () => {
  const trailFn = chat.slice(chat.indexOf('function trailLine('), chat.indexOf('\n}\n', chat.indexOf('function trailLine(')) + 3);
  assert.doesNotMatch(trailFn, /'trSolve/, 'لا مفتاح ترجمة جديد لم يُترجَم بالـ١٤ لغة');
});

/* ---------- js/app-17-agent-tools.js: التنفيذ الفعليّ ---------- */
function extract(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, 'موجود: ' + head);
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error('لم يُغلق: ' + head);
}
const block = extract(tools, "if (name === 'solve_homework') {");

function run(opts) {
  const calls = [];
  const ctx = {
    window: {
      __chatVideoReference: opts.ref || null,
      authGet: () => 'tok-123',
      getGuestId: () => 'guest-9',
    },
    document: { documentElement: { lang: opts.lang || 'ar' } },
    fetch: async (url, init) => { calls.push({ url, init }); return opts.fetchImpl ? opts.fetchImpl(url, init) : { ok: true, json: async () => ({}) }; },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext('async function run(name, args){ ' + block + ' }', ctx);
  return { result: ctx.run('solve_homework', opts.args || {}), calls };
}

test('بلا صورة مرفقة وبلا نصّ: لا نداء خادم، ورسالة واضحة للنموذج', async () => {
  const { result, calls } = run({ args: {} });
  assert.equal(calls.length, 0);
  assert.match(await result, /لا صورة مرفقة ولا نصّ واجب/);
});

test('صورة مرفقة: يُبنى نداء /api/edu action=solve بالصورة والمصادقة، والردّ يُنسَّق كاملًا', async () => {
  const dataUrl = 'data:image/png;base64,QUFBQQ==';
  const solution = {
    subject: 'لغة عربية', grade: 'الصف الثالث', problem: 'صنّف الكلمات', understand: 'صنّف كلّ كلمة',
    steps: [{ hint: 'راجع القاعدة', work: 'أرنب: همزة قطع' }, { hint: '', work: 'ابن: همزة وصل' }],
    answer: 'قطع: أرنب — وصل: ابن', check: 'انطق بعد واو', tip: 'راجع الأسماء المشهورة',
  };
  const { result, calls } = run({
    ref: { dataUrl, mime: 'image/png' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, solution }) }),
  });
  const out = await result;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/edu');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.action, 'solve');
  assert.deepEqual(body.image, { base64: 'QUFBQQ==', mime: 'image/png' });
  assert.equal(body.token, 'tok-123');
  assert.equal(body.guestId, 'guest-9');
  assert.match(out, /المادّة: لغة عربية · الصفّ: الصف الثالث/);
  assert.match(out, /المسألة: صنّف الكلمات/);
  assert.match(out, /خطوة 1: أرنب: همزة قطع/);
  assert.match(out, /خطوة 2: ابن: همزة وصل/);
  assert.match(out, /الجواب: قطع: أرنب — وصل: ابن/);
  assert.match(out, /التحقّق: انطق بعد واو/);
});

test('نصّ بلا صورة: image غير مُرسَل في الجسم', async () => {
  const { result, calls } = run({
    args: { text: 'ما حلّ ٢+٢' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, solution: { answer: '٤' } }) }),
  });
  await result;
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.text, 'ما حلّ ٢+٢');
  assert.equal(body.image, undefined);
});

test('فشل الخادم أو غياب الحلّ: رسالة تعذّر لا كسر صامت', async () => {
  const { result } = run({
    ref: { dataUrl: 'data:image/png;base64,QUFBQQ==' },
    fetchImpl: async () => ({ ok: false, status: 402, json: async () => ({ error: 'وصلت للحد اليومي' }) }),
  });
  assert.match(await result, /تعذّر حلّ الواجب: وصلت للحد اليومي/);
});
