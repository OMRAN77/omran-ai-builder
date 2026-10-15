// tests/owner-route-tools.test.cjs — v-claude-code-level (المالك: «ولا يبني ولا يقرى»).
// كلود المالك كان يُعطى صفر أدوات في أهمّ أدواره: «صلّح/خطأ» أو فعل تعديل على محادثة فيها كود = __routeFix → المسار القديم
// بلا أدوات، وكلّ طلب بناء يمرّ بدور استئذان بلا أدوات. للمالك وحده الآن: الإصلاح والتعديل والبناء على مسار الأدوات،
// بلا دور استئذان، ومعه تعليمة «المشروع المفتوح يُعدَّل في الردّ» كي لا يفتح طلب سحب لتعديل معاينة. غير المالك كما كان.
// الطريقة: شرائح __sendPromptCore الحقيقيّة من js/app-09-attach.js (البوّابة ← التوجيه ← المزوّد ← تعليمات الدور) في vm.
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
  strong: cut(A9, '  const __strongBuildRe =', '  const __IMGF_NEW_RE ='), // v-route-want · v-route-write: __rtWantLookup و__rtWriteAsk بين الاثنين، والبوّابة تقرؤهما
  imgf: cut(A9, '  const __IMGF_NEW_RE =', '  let __gateNoBuild = false;'),
  gate: cut(A9, '  let __gateNoBuild = false;', '  // Guest gate:'),
  route: cut(A9, '  const __routeBuildRe =', '  // آخر نص كامل وصل من البث'),
  sys: cut(A9, '    const __bldRe = /(ابني', '    // v469: Q&A = بروم خفيف'),
  prov: cut(A9, '      const isBuildTask = __routeFix && !__gateNoBuild;', '      if(__gateApprovedText && __toolsWillRun){'),
  notes: cut(A9, '      if(__gateApprovedText && __toolsWillRun){', '      // v469: Q&A system prompt'),
  repoNote: cut(A9, 'function omranOwnerRepoNote(', '\nasync function __sendPromptCore'),
};
const H6 = [
  cut(A6, 'const OMRAN_EDIT_BIG = 24000;', '\n'),
  cut(A6, 'function omranEditBigOpen(cur){', 'function omranEditTruncated'),
  cut(A6, 'const TOOL_PROVIDERS = [', '\n'),
  cut(A6, 'const CASUAL_RE =', '// ⏱️ v-fallback-idle'),
].join('\n');

function makeCtx(owner, toolsOn) {
  const store = { aiapp_provider: 'claude' };
  const window = { innerWidth: 1440, callChatWithTools: async () => ({ reply: 'x' }) };
  if (toolsOn === false) window.__chatToolsOn = false; // مفتاح الأدوات مطفأ
  const ctx = {
    window, console, Promise, Error, String, Number, Date, JSON, Math, Object, Array, RegExp,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: { documentElement: { classList: { contains: () => false } } },
    __swallow() {}, saveState() {}, t: (k) => k, functionalLabel: (k) => k,
    omranOwnerUi: () => owner,
  };
  window.window = window;
  vm.createContext(ctx);
  vm.runInContext(H6, ctx);
  vm.runInContext(S.repoNote, ctx); /* v-prov-app-edit: الدالّة خارج __sendPromptCore */
  return ctx;
}

// دور واحد بالترتيب الحقيقيّ: البوّابة (قبل تعريف __editIntent) ← التوجيه ← برومبت البناء ← المزوّد ← تعليمات الدور
const TURN = `(async function __turn(INPUT, CUR){
  let text = INPUT;
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
  const __staticSys = { role: 'system', content: 'STATIC' };
  const apiMessages = [__staticSys];
  if(cur.code) apiMessages.push({ role: 'assistant', content: cur.code });
  apiMessages.push({ role: 'user', content: text });
  const chatStatus = { isReleased: () => true, note(){}, phase(){}, release(){} };
  ${S.prov}
  ${S.notes}
  return { text, __gateNoBuild, __routeFix, __editIntent, __ownerFree, __effProv, __toolsWillRun,
    __ownerBuildAsk: typeof __ownerBuildAsk === 'undefined' ? null : __ownerBuildAsk,
    notes: apiMessages.slice(apiMessages.findIndex(m => m.role === 'user') + 1).filter(m => m.role === 'system').map(m => String(m.content)) };
})`;

const CODE = '<!DOCTYPE html><html><body><button id="send" style="background:red">إرسال</button><script>document.getElementById("send").onclick=()=>alert(1)</script></body></html>';
const fresh = () => ({ id: 'p1', messages: [], code: '', codeType: 'html' });
const withCode = () => ({ id: 'p2', messages: [{ role: 'user', content: 'سوّ لي صفحة فيها زر' }, { role: 'assistant', content: 'تم', code: CODE }], code: CODE, codeType: 'html' });
async function turn(owner, text, cur, toolsOn) {
  const ctx = makeCtx(owner, toolsOn);
  return JSON.parse(JSON.stringify(await vm.runInContext(TURN, ctx)(text, cur))); // مصفوفات vm من عالم آخر — تُنسخ للمقارنة
}
const GATE = 'المستخدم طلب بناء شيء. ممنوع أن تبنيه الآن';
const OPEN = 'المشروع المفتوح = عدّله في الردّ (رقعة أو ملفّ كامل)؛ مستودع التطبيق فقط إن ذكره صراحةً (مستودع/GitHub/التطبيق/الواجهة)';
const FIX = 'صلّح الخطأ في زر الإرسال';
const BUILD = 'ابني لي لعبة ثعبان';
const EDIT = 'عدّل لون الزر في الصفحة اللي سويتها';

test('١. المالك: «صلّح الخطأ…» على محادثة فيها كود → مسار الأدوات (كان المسار القديم بلا أدوات) ومعه تعليمة المشروع المفتوح', async () => {
  const r = await turn(true, FIX, withCode());
  assert.equal(r.__routeFix, true, 'الكاشف نفسه لم يتغيّر');
  assert.equal(r.__toolsWillRun, true, 'الأدوات تعمل');
  assert.equal(r.__gateNoBuild, false);
  assert.deepEqual(r.notes, [OPEN]);
});

test('٢. المالك: «ابني لي لعبة ثعبان» → يُبنى في الدور نفسه بالأدوات، بلا دور استئذان ولا تعليمته', async () => {
  const r = await turn(true, BUILD, fresh());
  assert.equal(r.__gateNoBuild, false, 'لا بوّابة للمالك');
  assert.equal(r.__toolsWillRun, true);
  assert.ok(!r.notes.some((n) => n.includes(GATE)), 'لا «ممنوع أن تبنيه الآن»');
  assert.deepEqual(r.notes, []);
});

test('٣. المالك: «عدّل لون الزر في الصفحة اللي سويتها» (صفحة + سوي داخل سويتها) → أدوات + تعليمة المشروع المفتوح، لا بوّابة', async () => {
  const r = await turn(true, EDIT, withCode());
  assert.equal(r.__editIntent, true);
  assert.equal(r.__gateNoBuild, false);
  assert.equal(r.__toolsWillRun, true);
  assert.deepEqual(r.notes, [OPEN]);
});

test('٤. غير المالك كما كان حرفيًّا: الإصلاح للمسار القديم، والبناء والتعديل لدور الاستئذان — ولا تعليمة المالك', async () => {
  const fix = await turn(false, FIX, withCode());
  assert.equal(fix.__toolsWillRun, false, 'الإصلاح: المسار القديم');
  assert.equal(fix.__effProv, 'claude');
  assert.deepEqual(fix.notes, []);
  const build = await turn(false, BUILD, fresh());
  assert.equal(build.__gateNoBuild, true, 'البناء: بوّابة');
  assert.equal(build.__toolsWillRun, false);
  assert.equal(build.notes.length, 1); assert.ok(build.notes[0].startsWith(GATE));
  const edit = await turn(false, EDIT, withCode());
  assert.equal(edit.__gateNoBuild, true, 'التعديل على صفحة صغيرة: بوّابة كما كان');
  assert.equal(edit.__toolsWillRun, false);
  assert.equal(edit.notes.length, 1); assert.ok(edit.notes[0].startsWith(GATE));
  for (const r of [fix, build, edit]) assert.ok(!r.notes.includes(OPEN));
});

test('٥. غير المالك على طلب بناء: لا ReferenceError (إعفاء المالك لا يقرأ __editIntent المعرَّف بعد البوّابة)', async () => {
  await assert.doesNotReject(turn(false, BUILD, fresh()));
  await assert.doesNotReject(turn(false, 'ممكن تسوي لي موقع لمطعمي', withCode()));
  const gateBranch = S.gate.slice(S.gate.indexOf('&& !GATE_FIX_RE.test(text)'), S.gate.indexOf('__gateNoBuild = true;'));
  assert.ok(!/__editIntent|__routeFix/.test(gateBranch), 'شرط البوّابة لا يلمس ثوابت تُعرَّف بعده');
  assert.ok(gateBranch.includes("&& !(typeof omranOwnerUi === 'function' && omranOwnerUi())"), 'إعفاء المالك داخل شرط البوّابة');
  assert.ok(gateBranch.indexOf('omranOwnerUi()') < gateBranch.indexOf('&& !omranEditBigOpen(getCurrent())){'), 'قبل المرساة المثبّتة في chat-edit');
});

test('٦. المالك بلا كود مفتوح: الأسئلة كما كانت (أدوات بلا تعليمات إضافيّة)، و«نعم» على عرض مزوّده تصله كما كتبها — غير المالك كما كان', async () => {
  const q = await turn(true, 'وش أخبار الذهب اليوم', fresh());
  assert.equal(q.__toolsWillRun, true); assert.deepEqual(q.notes, []);
  const offered = () => { const c = fresh(); c.messages.push({ role: 'user', content: 'عندي فكرة لعبة' }, { role: 'assistant', content: 'أقدر أبنيلك لعبة ثعبان بسيطة، تبيني أبدأ البناء؟' }); return c; };
  /* v-owner-solo-all: كانت «نعم» تُستبدل بأمر «ابنِ ملفّ html واحدًا» — فـ«نعم» على «أسوي لك طلب سحب؟» تبني صفحة محادثة،
     و«نعم ادمج» بعد «أدمج وأنشر؟» تصل الخادم طلبًا قديمًا فترفض بوّابة «ادمج». مزوّد المالك يرى عرضه في السجلّ ويكمله بنفسه. */
  const yes = await turn(true, 'نعم', offered());
  assert.equal(yes.text, 'نعم', 'كلام المالك نفسه');
  assert.equal(yes.__toolsWillRun, true);
  assert.deepEqual(yes.notes, [], 'لا أمر «ملفّ html واحد» يُفرض على مزوّده');
  const other = await turn(false, 'نعم', offered());
  assert.match(other.text, /^نعم، ابدأ الآن ببناء/, 'غير المالك: الموافقة على العرض تبني كما كانت');
});

test('٧. المالك ومفتاح الأدوات مطفأ: «صلّح…» يذهب للمسار بلا أدوات، فلا تُرسَل تعليمة المشروع المفتوح (كلامها عن المستودع للأدوات وحدها)', async () => {
  const r = await turn(true, FIX, withCode(), false);
  assert.equal(r.__routeFix, true);
  assert.equal(r.__toolsWillRun, false);
  assert.deepEqual(r.notes, []);
});

test('٨. نيّة بناء المالك تُحفظ من شرط البوّابة نفسه (بلا دور استئذان) — للمالك وحده، والسؤال والإصلاح ليسا بناءً', async () => {
  for (const q of [BUILD, 'أبي لعبة ثعبان', 'عطني موقع لمطعمي', 'ممكن تسوي لي صفحة هبوط']) {
    const r = await turn(true, q, fresh());
    assert.equal(r.__ownerBuildAsk, true, q); assert.equal(r.__gateNoBuild, false, q);
  }
  for (const q of ['how does the app build its bundle?', 'كيف أبني صفحة مثل هذي؟', 'ليش التطبيق ما يكمل التحميل؟', 'اقرأ كود التطبيق وقل لي كيف أعدل زر الإرسال', 'فيه خطأ في اللعبة اللي سويتها', 'وش أخبار الذهب اليوم']) {
    assert.equal((await turn(true, q, fresh())).__ownerBuildAsk, false, q);
  }
  const other = await turn(false, 'أبي لعبة ثعبان', fresh());
  assert.equal(other.__ownerBuildAsk, false, 'غير المالك: لا شيء'); assert.equal(other.__gateNoBuild, true, 'وبوّابته كما كانت');
});

const REPO = 'طلب على التطبيق الحيّ = اقرأ بـread_github ثمّ عدّل بـedit_github';
test('٩. طلب على التطبيق نفسه والمشروع مفتوح: المزوّد يعدّل المستودع لا المعاينة — «عدّل التطبيق» كانت تُمنَع من GitHub', async () => {
  for (const q of ['عدّل التطبيق: رجّع صور لمسات الديكور', 'غيّر الواجهة', 'صلّح الإعدادات', 'ارفع تعديل على المستودع', 'أفكارك تعديلات على التطبيق المزودين لين الحين مش قادرين']) {
    const r = await turn(true, q, withCode());
    assert.equal(r.__toolsWillRun, true, q);
    assert.ok(r.notes.some((n) => n.includes(REPO)), q + ': تعليمة المستودع — ' + JSON.stringify(r.notes));
    assert.ok(!r.notes.some((n) => n.includes('مستودع التطبيق فقط إن ذكره صراحةً')), q + ': لا منع GitHub');
  }
  const page = await turn(true, EDIT, withCode());
  assert.deepEqual(page.notes, [OPEN], 'تعديل الصفحة المبنية يبقى على المعاينة');
});
