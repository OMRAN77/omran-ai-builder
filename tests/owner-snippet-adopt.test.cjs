// tests/owner-snippet-adopt.test.cjs — v-claude-code-level (المالك: «ولا يبني ولا يقرى»).
// v491 جعل أيّ كود يُستخرج من الردّ مشروعًا (cur.code): فمقتطف يشرح به كلود ملفًّا من المستودع (فيه <div>)، أو رأس index.html،
// أو مثال بايثون كان يقلب المحادثة «مشروعًا مفتوحًا» وقد يمحو مشروعًا صغيرًا. وسياج ```html لم يُغلق (ردّ انقطع لطوله) كان
// يحلّ محلّ المشروع المفتوح الصغير. للمالك وحده الآن يُعتمد الكود مشروعًا فقط إن كان رقعة طُبّقت، أو مستندًا كاملًا، أو بايثون
// طلبه، أو أيّ كود في محادثة بلا مشروع على طلب بناء صريح؛ مقطع على مشروع مفتوح لا يحلّ محلّه أبدًا، و__routeFix ليس إشارة.
// الطريقة: extractReply الحقيقيّة من app-06 + شرائح __sendPromptCore الحقيقيّة من app-09 في vm بالترتيب الحقيقيّ:
// البوّابة ← التوجيه (__routeFix) ← isBuildTask ← قرار الاعتماد ← «if(code) cur.code = code». لا أعلام مصنوعة: كلّها من التوجيه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const A9 = read('js/app-09-attach.js');
const A6 = read('js/app-06-checkout.js');
function cut(src, start, end) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, 'مرساة غير موجودة: ' + start.slice(0, 60));
  assert.equal(src.indexOf(start, a + 1), -1, 'مرساة غير فريدة: ' + start.slice(0, 60));
  const b = end === '\n' ? src.indexOf('\n', a) : src.indexOf(end, a + start.length);
  assert.ok(b > a, 'نهاية غير موجودة: ' + String(end).slice(0, 60));
  return src.slice(a, b);
}
const S = {
  strong: cut(A9, '  const __strongBuildRe =', '\n'),
  imgf: cut(A9, '  const __IMGF_NEW_RE =', '  let __gateNoBuild = false;'),
  gate: cut(A9, '  let __gateNoBuild = false;', '  // Guest gate:'),
  route: cut(A9, '  const __routeBuildRe =', '  // آخر نص كامل وصل من البث'),
  sys: cut(A9, '    const __bldRe = /(ابني', '    // v469: Q&A = بروم خفيف'),
  task: cut(A9, '      const isBuildTask = __routeFix && !__gateNoBuild;', '\n'),
  owner: cut(A9, "      const __ownerFree = (typeof omranOwnerUi === 'function' && omranOwnerUi());", '\n'),
  adopt: cut(A9, '      let { code, explanation, codeType } = extractReply(reply, cur.code);', '      // v-reveal-live:'),
};
const EXTRACT = cut(A6, 'function substUserImage(code){', 'function throwProviderError(');

const TURN = `(function __turn(INPUT, CUR, reply, FENCE_CUT){
  let text = INPUT;
  const __ctFenceCut = !!FENCE_CUT; // app-18 أغلق سياجًا قطعه خطأ المزوّد (v-claude-code-level)
  const pendingAttachments = [], imageAttachments = [], textAttachments = [];
  const cur = CUR;
  const getCurrent = () => cur;
  ${S.strong}
  ${S.imgf}
  ${S.gate}
  const __fileAnalyze = false;
  const __textAtPush = String(text || '');
  let customProviders = null;
  ${S.route}
  ${S.sys}
  ${S.task}
  ${S.owner}
  ${S.adopt}
  if(code) cur.code = code;
  return JSON.stringify({ code, explanation, codeType, cur: cur.code, isBuildTask, __routeFix, __gateNoBuild });
})`;
function makeCtx(owner) {
  const store = {};
  const window = {};
  const ctx = {
    window, console, __swallow() {}, t: (k) => k,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    omranOwnerUi: () => owner,
  };
  window.window = window;
  vm.createContext(ctx);
  vm.runInContext(EXTRACT + '\nthis.extractReply = extractReply;', ctx);
  return ctx;
}
// دور واحد في سياق جديد (البوّابة تكتب الطلب المعلّق في localStorage)
const turn = (reply, cur, text, owner, fenceCut) => JSON.parse(vm.runInContext(TURN, makeCtx(owner))(text, cur, reply, fenceCut));

const CODE = '<!DOCTYPE html><html><body><button id="send" style="background:red">إرسال</button><script>document.getElementById("send").onclick=()=>alert(1)</script></body></html>';
const open = () => ({ id: 'p2', messages: [{ role: 'user', content: 'سوّ لي صفحة فيها زر' }, { role: 'assistant', content: 'تم', code: CODE }], code: CODE, codeType: 'html' });
const fresh = () => ({ id: 'p1', messages: [], code: '', codeType: 'html' });
const REPO_JS = 'في js/app-05-ui.js الدالّة تبني الزر هكذا:\n```js\nfunction renderBtn(){ box.innerHTML = \'<div class="send">إرسال</div>\'; }\n```\nالمشكلة أنّ الحدث يُربط قبل الرسم.';
const REPO_HEAD = 'بداية index.html:\n```html\n<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="utf-8">\n<title>عمران AI</title>\n<link rel="stylesheet" href="css/app.css?v=12">\n```\nالسطر الثاني يحدّد الاتجاه.';
const FRAG = 'السطر المسؤول في التصميم:\n```html\n<div class="send-row"><button id="send" class="btn">إرسال</button></div>\n```\nهذا ما يرسم الزر.';
const PY = 'الفرق باختصار:\n```python\nt = (1, 2)\nl = [1, 2]\n```\nالأولى لا تتغيّر.';
const CUT = 'هذي اللعبة:\n```html\n<!DOCTYPE html><html><head><style>body{margin:0;background:#111}</style></head><body><canvas id=c width=400 height=400></canvas><script>let snake=[{x:10,y:10}];function loop(){ /* ...';
const GREEN = 'تفضّل:\n```html\n' + CODE.replace('red', 'green') + '\n```';
const PARTIAL = 'ما طبّقت التعديل — الردّ وصل ناقصًا أو بصيغة غير سليمة، فبقي التصميم كما هو. اطلبه مرّة ثانية.';

test('١. المالك: مقتطف من المستودع (```js فيه <div>) في جواب سؤال → يبقى في الفقاعة، ولا يصير مشروعًا', () => {
  const r = turn(REPO_JS, fresh(), 'اشرح لي كيف يبني app-05 زر الإرسال', true);
  assert.equal(r.code, ''); assert.equal(r.cur, '', 'المحادثة لا تنقلب مشروعًا مفتوحًا');
  assert.ok(r.explanation.includes('```js\nfunction renderBtn()'), 'الكود ظاهر في الفقاعة');
});

test('٢. المالك: مقتطف html في شرحٍ على مشروع صغير مفتوح → لا يمحو المشروع', () => {
  const r = turn(FRAG, open(), 'وين الكود اللي يرسم الزر؟', true);
  assert.equal(r.code, ''); assert.equal(r.cur, CODE, 'المشروع كما هو');
  assert.ok(r.explanation.includes('<div class="send-row">'));
});

test('٣. المالك: مثال بايثون في جواب سؤال → فقاعة؛ وطلب «سكربت بايثون» صريح → يُعتمد بايثون', () => {
  const q = turn(PY, fresh(), 'وش الفرق بين list و tuple؟', true);
  assert.equal(q.code, ''); assert.equal(q.cur, '');
  const ask = turn(PY, fresh(), 'اكتب لي سكربت بايثون يفرّق بينهم', true);
  assert.equal(ask.codeType, 'python'); assert.match(ask.cur, /t = \(1, 2\)/);
});

test('٤. المالك: مستند كامل، أو رقعة طُبّقت، أو كود على طلب بناء/موافقة في محادثة بلا مشروع → يُعتمد كما كان', () => {
  assert.match(turn(GREEN, fresh(), 'وريني مثال', true).cur, /background:green/, 'مستند كامل في محادثة جديدة');
  const e = turn(GREEN, open(), 'غيّر لون الزر للأخضر', true);
  assert.equal(e.isBuildTask, true); assert.match(e.cur, /background:green/, 'مستند كامل في دور تعديل يحلّ محلّ المشروع');
  const patch = 'خلّيت الزر أزرق.\n```patch\n@@PATCH\n@@WHY اللون\n@@OLD\n<button id="send" style="background:red">\n@@NEW\n<button id="send" style="background:blue">\n@@END\n```';
  const p = turn(patch, open(), 'وش رأيك في الزر؟', true);
  assert.ok(p.cur.includes('background:blue') && p.cur.length === CODE.length + 1, 'رقعة طُبّقت على المشروع');
  assert.match(turn(FRAG, fresh(), 'ابني لي لعبة ثعبان', true).cur, /send-row/, 'طلب بناء صريح');
  // «أبي/عطني…» بلا فعل بناء كانت تمرّ بالبوّابة وتُعلَّم بـ«نعم» — المالك بلا بوّابة الآن، ونيّة البناء ما زالت إشارة
  assert.match(turn(FRAG, fresh(), 'أبي لعبة ثعبان', true).cur, /send-row/, 'طلب بصيغة أبي');
  const offered = fresh();
  offered.messages.push({ role: 'user', content: 'عندي فكرة لعبة' }, { role: 'assistant', content: 'أقدر أبنيلك لعبة ثعبان بسيطة، تبيني أبدأ البناء؟' });
  assert.match(turn(FRAG, offered, 'نعم', true).cur, /send-row/, 'موافقة على عرض بناء');
});

test('٥. المالك: مقطع (لا مستند ولا رقعة) في دور تعديل على مشروع صغير مفتوح → لا يحلّ محلّه، والسبب مكتوب', () => {
  const r = turn(FRAG, open(), 'غيّر لون الزر للأزرق', true);
  assert.equal(r.__routeFix, true, 'التوجيه الحقيقيّ يعدّه دور تعديل');
  assert.equal(r.code, ''); assert.equal(r.cur, CODE, 'المشروع الصغير لا يُستبدل بمقطع');
  assert.ok(r.explanation.includes('<div class="send-row">'), 'المقطع في الفقاعة');
  assert.ok(r.explanation.endsWith('\n\n' + PARTIAL), 'وسبب عدم التطبيق');
});

test('٦. المالك — ملاحظات المراجعة (A/B/C/E): أدوار يلتقطها __routeFix أو «تطبيق+فعل» خطأً لا تعتمد المقتطف', () => {
  // (A) «خلنا» = فعل تعديل «خل» → __routeFix=true في التوجيه الحقيقيّ، ومع ذلك المقتطف لا يمحو المشروع
  for (const q of ['خلنا نراجع ملف chat.js في المستودع', 'اكتب لي ملخص عن الكود']) {
    const a = turn(REPO_JS, open(), q, true);
    assert.equal(a.isBuildTask, true, 'isBuildTask=true هنا: ' + q);
    assert.equal(a.cur, CODE, 'المشروع كما هو: ' + q); assert.ok(a.explanation.includes('function renderBtn()'));
  }
  // (B/C) رأس index.html مقتبس (بلا </html>) — لا يُحسب «مستندًا كاملًا»
  const b = turn(REPO_HEAD, fresh(), 'وش أول سطور index.html؟', true);
  assert.equal(b.cur, ''); assert.ok(b.explanation.includes('<html lang="ar" dir="rtl">'));
  assert.equal(turn(REPO_HEAD, open(), 'وش أول سطور index.html؟', true).cur, CODE);
  // (E) أسئلة عن التطبيق في محادثة جديدة: __bldRe+__appWd (أو build+app) لم تعد إشارة
  for (const q of ['اقرأ كود التطبيق وقل لي كيف أعدل زر الإرسال', 'ليش التطبيق ما يكمل التحميل؟', 'وش آخر update صار على التطبيق؟', 'how does the app build its bundle?']) {
    const r = turn(REPO_JS, fresh(), q, true);
    assert.equal(r.code, '', 'فقاعة: ' + q); assert.equal(r.cur, '', 'لا مشروع: ' + q);
    assert.ok(r.explanation.includes('function renderBtn()'));
  }
});

test('٧. المالك: ```html لم يُغلق (انقطع لطوله) على مشروع مفتوح → لا يحلّ محلّه؛ و``` حرفيّة في النصّ بعد مستند كامل لا تُسقطه', () => {
  const r = turn(CUT, open(), 'عدّل اللعبة', true);
  assert.equal(r.code, ''); assert.equal(r.cur, CODE, 'المشروع الصغير لا يُستبدل بملفّ مقطوع');
  assert.ok(r.explanation.startsWith('هذي اللعبة:\n```html\n<!DOCTYPE html>'));
  assert.ok(r.explanation.endsWith('/* ...\n```\n\nالردّ انقطع قبل اكتمال الملفّ، فما استبدلت التصميم — بقي كما هو.'), 'السياج يُغلق ثمّ السبب');
  // التاريخ (المالك، مشروع مفتوح) يطوي الكتلة المغلقة «مقتطفًا لم يُطبَّق» — لا يُعاد إرسال الملفّ المقطوع كلّ دور
  assert.equal((r.explanation.match(/```/g) || []).length % 2, 0);
  assert.ok(A9.includes("(role === 'assistant' && !m.code && cur.code) ? String(__src || '').replace(/```[\\s\\S]*?```/g, '[مقتطف كود في الردّ — لم يُطبَّق على المشروع]')"));
  // عدد السياجات فرديّ بسبب ``` حرفيّة في النصّ، والمستخرَج مستند كامل → يُعتمد (لا «انقطع»)
  const lit = turn(GREEN + '\nوإذا تبي تنسخه انسخ ما بين علامتي ``` فقط.', open(), 'غيّر لون الزر للأخضر', true);
  assert.match(lit.cur, /background:green/); assert.ok(!lit.explanation.includes('انقطع'));
});

test('٨. غير المالك كما كان حرفيًّا (v491): كلّ ما يستخرجه extractReply يُعتمد', () => {
  const cases = [[REPO_JS, fresh, 'اشرح لي كيف يبني app-05 زر الإرسال'], [FRAG, open, 'وين الكود اللي يرسم الزر؟'], [PY, fresh, 'وش الفرق بين list و tuple؟'],
    [CUT, open, 'عدّل اللعبة'], [FRAG, open, 'غيّر لون الزر للأزرق'], [REPO_JS, open, 'خلنا نراجع ملف chat.js في المستودع'], [REPO_HEAD, fresh, 'وش أول سطور index.html؟'],
    [REPO_JS, fresh, 'ليش التطبيق ما يكمل التحميل؟']];
  const ref = makeCtx(false);
  for (const [reply, mk, text] of cases) {
    const want = JSON.parse(JSON.stringify(ref.extractReply(reply, mk().code)));
    const r = turn(reply, mk(), text, false);
    assert.deepEqual({ code: r.code, explanation: r.explanation, codeType: r.codeType }, { code: want.code, explanation: want.explanation, codeType: want.codeType }, text);
    assert.ok(r.code && r.cur === r.code, 'يصير المشروع كما كان: ' + text);
  }
});

test('٩. المالك: ردّ قطعه خطأ المزوّد داخل كتلة كود (app-18 أغلق السياج وعلّم fenceCut) → لا يصير مشروعًا ولا يحلّ محلّ المفتوح', () => {
  const cut = '```html\n<!DOCTYPE html><html><body><h1>نصف لعبة\n```\n\n⚠️ انقطع الاتّصال';
  const a = turn(cut, { id: 'p9', messages: [], code: '', codeType: 'html' }, 'ابني لي لعبة ثعبان', true, true);
  assert.equal(a.code, '', 'كود ناقص لا يُعتمد مشروعًا جديدًا');
  assert.equal(a.cur, '', 'المحادثة بلا مشروع تبقى بلا مشروع');
  const o = open();
  const b = turn(cut, o, 'عدّل لون الزر', true, true);
  assert.equal(b.cur, CODE, 'المشروع المفتوح لا يُستبدل بنصف ملفّ');
  assert.match(b.explanation, /انقطع قبل اكتمال الملفّ/, 'السبب مكتوب تحت الردّ: انقطع، لا «صيغة غير سليمة»');
  const c = turn(cut, { id: 'p9b', messages: [], code: '', codeType: 'html' }, 'ابني لي لعبة ثعبان', false, true);
  assert.ok(c.code, 'غير المالك كما كان (العلامة لا تمسّه)');
});
