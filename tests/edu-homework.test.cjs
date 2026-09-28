'use strict';
/* v-edu-homework — طلب المالك (٢٨ سبتمبر) مع صورة «بطاقة تقييم أعمال السعي» (بوستر أفراد الأسرة الإماراتيّة):
   «ارفع صورة الواجب ويعطيني التحليل والجواب كامل في كلّ المناهج»، ثمّ «الاثنين، وأريد البوستر يصمّم».
   قبلها كان «حلّ مسألة» يرفض كلّ ما ليس مسألة حسابيّة، ولا يعرف المشاريع، ولا يعطي الحلّ كاملًا دفعة واحدة. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = (p) => path.join(__dirname, '..', p);
const read = (p) => fs.readFileSync(R(p), 'utf8');
const N = (x) => JSON.parse(JSON.stringify(x));

/* يشغّل action=solve الحقيقيّ مع مزوّد مزيّف يعيد `reply` نصًّا، ويلتقط ما أُرسل له */
async function runSolve(reply, body) {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const edu = require(R('api/edu.js'));
  const realFetch = global.fetch;
  let sent = null;
  global.fetch = async (url, init) => {
    if (/anthropic\.com\/v1\/messages|openrouter/.test(String(url))) {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(reply) }] }) };
    }
    throw new Error('no network in tests: ' + url);
  };
  const out = { code: 0, json: null };
  const res = {
    setHeader() {}, end() {},
    status(c) { out.code = c; return this; },
    json(j) { out.json = j; return this; },
  };
  try {
    await edu({ method: 'POST', headers: {}, body: Object.assign({ action: 'solve', lang: 'ar' }, body) }, res);
  } finally { global.fetch = realFetch; }
  return { out, sent };
}

const RUBRIC_REPLY = {
  kind: 'project', subject: 'الدراسات الاجتماعيّة', grade: 'الصفّ الثالث والرابع — الإمارات',
  problem: 'تصميم بوستر يتضمّن أفراد الأسرة الإماراتيّة (الأب، الأم، الابن، الابنة، الجدّ، الجدّة) بطريقة إبداعيّة.',
  topic: 'أفراد الأسرة الإماراتيّة', understand: 'المطلوب بوستر فيه أفراد الأسرة مع أسمائهم.',
  steps: [{ hint: 'من هم أفراد الأسرة؟', work: 'الأب، الأم، الابن، الابنة، الجدّ، الجدّة.' }, { hint: '', work: 'ارسم كلّ فرد واكتب اسمه تحته.' }],
  answer: 'بوستر بعنوان «أفراد الأسرة الإماراتيّة» فيه ستّة أفراد مع أسمائهم.',
  project: {
    content: ['العنوان: أفراد الأسرة الإماراتيّة', 'الأب', 'الأم', 'الابن', 'الابنة', 'الجدّ', 'الجدّة'],
    design: ['خلفيّة نخيل وعلم الإمارات'],
    checklist: [{ criterion: 'تحديد أفراد الأسرة بشكل صحيح', points: 2, how: 'ستّة أفراد كاملون' }],
    poster: 'A colorful children poster titled "أفراد الأسرة الإماراتية" showing an Emirati family with Arabic labels',
  },
};

test('بطاقة مشروع (مثل صورة المالك) تُقبل ويعود معها المحتوى والمعايير ووصف البوستر', async () => {
  const { out, sent } = await runSolve(RUBRIC_REPLY, { image: { base64: 'AAAA', mime: 'image/jpeg' } });
  assert.strictEqual(out.code, 200, JSON.stringify(out.json));
  const s = N(out.json.solution);
  assert.strictEqual(s.kind, 'project');
  assert.strictEqual(s.subject, 'الدراسات الاجتماعيّة');
  assert.ok(s.grade.includes('الثالث'));
  assert.ok(s.understand.includes('بوستر'));
  assert.strictEqual(s.project.content.length, 7);
  assert.deepStrictEqual(s.project.checklist[0], { criterion: 'تحديد أفراد الأسرة بشكل صحيح', points: 2, how: 'ستّة أفراد كاملون' });
  assert.ok(/poster/i.test(s.project.poster));
  assert.strictEqual(sent.messages[0].content[0].type, 'image', 'الصورة وصلت للنموذج');
});

test('التعليمات تقبل أيّ واجب من أيّ مادّة ومنهج، ولا ترفض ما ليس مسألة حسابيّة', async () => {
  const { sent } = await runSolve(RUBRIC_REPLY, { text: 'اكتب موضوع تعبير عن الوطن' });
  const sys = sent.system;
  assert.ok(!/ليست مسألة/.test(sys), 'الرفض القديم لكلّ ما ليس مسألة أُزيل');
  ['problem', 'questions', 'writing', 'project'].forEach((k) => assert.ok(sys.includes('"' + k + '"'), 'النوع ' + k));
  assert.ok(/كلّ المواد/.test(sys) && /المنهج/.test(sys) && /الصفّ/.test(sys));
  assert.ok(/كلّ سؤال/.test(sys), 'ورقة العمل: كلّ سؤال برقمه');
  assert.ok(/لا تذكر اسم أيّ نموذج/.test(sys));
  assert.ok(sent.max_tokens >= 6000, 'ورقة عمل كاملة تحتاج مساحة');
});

test('ورقة أسئلة: خطوة لكلّ سؤال حتّى ١٢، والمسألة العاديّة كما كانت (بلا project)', async () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ hint: '', work: 'جواب ' + (i + 1) }));
  const { out } = await runSolve({ kind: 'questions', problem: 'ورقة', steps: many, answer: '١) … ١٤) …' }, { text: 'ورقة' });
  assert.strictEqual(out.code, 200);
  assert.strictEqual(out.json.solution.steps.length, 12);
  assert.strictEqual(out.json.solution.kind, 'questions');
  const plain = await runSolve({ problem: '٢+٢', steps: [{ hint: 'اجمع', work: '٤' }], answer: '٤' }, { text: '٢+٢' });
  assert.strictEqual(plain.out.code, 200);
  assert.strictEqual(plain.out.json.solution.kind, 'problem', 'النوع الافتراضيّ');
  assert.strictEqual(plain.out.json.solution.project, undefined);
});

test('نوع مجهول يصير problem، والمشروع بلا وصف بوستر لا يكسر الردّ', async () => {
  const r = Object.assign({}, RUBRIC_REPLY, { kind: 'hack<script>', project: { content: ['أ'] } });
  const { out } = await runSolve(r, { text: 'x' });
  assert.strictEqual(out.json.solution.kind, 'problem');
  const p = await runSolve(Object.assign({}, RUBRIC_REPLY, { project: { content: ['أ'], checklist: 'x' } }), { text: 'x' });
  assert.strictEqual(p.out.code, 200);
  assert.deepStrictEqual(N(p.out.json.solution.project), { content: ['أ'], design: [], checklist: [], poster: '' });
});

/* ---------- الواجهة ---------- */
const plus = read('js/edu-plus.js'), edu = read('js/edu.js'), html = read('index.html');
function loadPlus() {
  const store = {};
  const window = {};
  const ctx = { window, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, document: { getElementById: () => ({}), head: { appendChild() {} }, createElement: () => ({}) }, Math, Date, JSON, Object, Array, String, Number, isNaN, Infinity, __swallow() {} };
  vm.runInNewContext(plus, ctx);
  return { window, store };
}

test('الوضعان: «الحلّ الكامل» افتراضيّ، و«علّمني خطوة خطوة» يُحفظ', () => {
  const { window, store } = loadPlus();
  const L = window.__eduPlus.lib;
  assert.strictEqual(L.solveMode(), 'full', 'المالك طلب الجواب كاملًا');
  L.setSolveMode('teach');
  assert.strictEqual(L.solveMode(), 'teach');
  assert.strictEqual(JSON.parse(store.eduSolveMode), 'teach');
  L.setSolveMode('???');
  assert.strictEqual(L.solveMode(), 'full', 'قيمة غريبة ترجع للافتراضيّ');
});

test('وصف البوستر: وصف النموذج + العنوان والأسماء بالعربيّة كما هي، مقصوص لحدّ معقول', () => {
  const { window } = loadPlus();
  const p = window.__eduPlus.lib.posterPrompt({ topic: 'أفراد الأسرة الإماراتيّة', grade: 'الصفّ الثالث', project: RUBRIC_REPLY.project });
  assert.ok(p.includes(RUBRIC_REPLY.project.poster));
  assert.ok(p.includes('الأب') && p.includes('الجدّة'), 'الأسماء تُكتب على البوستر');
  assert.ok(/poster/i.test(p) && /child|kid|student/i.test(p));
  assert.ok(p.length <= 1800);
  const fallback = window.__eduPlus.lib.posterPrompt({ topic: 'دورة الماء', project: { content: [], poster: '' } });
  assert.ok(fallback.includes('دورة الماء'), 'بلا وصف: يُبنى من الموضوع');
});

test('البوستر يمرّ بمسار الصور القائم (نفس الرصيد والخصم) ويشرح الخطأ بلغة المستخدم', () => {
  assert.ok(plus.includes("fetch('/api/maha-image'"), 'نفس مسار توليد الصور — لا مسار دفع جديد');
  assert.ok(plus.includes("'points_insufficient'") && plus.includes("'guest_image_used'"));
  assert.ok(/download = 'poster/.test(plus) || plus.includes("download=\"poster"), 'زرّ حفظ');
  assert.ok(!/api\/_lib\/points|refundPoints|COSTS\./.test(plus), 'لا لمس للنقاط من العميل');
});

test('الربط: البطاقة باسمها الجديد، والتلميح في المحادثة يفتح «حلّ الواجب» مباشرة، والوسم رُفع', () => {
  assert.ok(plus.includes("L('حلّ الواجب — أيّ مادّة'"));
  assert.ok(/واجب/.test(edu.slice(edu.indexOf('var HW_RE='), edu.indexOf('var HW_RE=') + 200)), 'كلمة «واجب» في المحادثة');
  assert.ok(edu.includes('window.__eduPlus.showSolver()'), 'يفتح الحلّ لا الصفحة الرئيسيّة');
  const hint = edu.match(/eduL\('(📷 عندك واجب[^']*)'/);
  assert.ok(hint, 'نصّ التلميح عبر eduL');
  const XL2 = loadPlus().window.__EDU_XL2[hint[1]];
  ['fr', 'hi', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'].forEach((l) => assert.ok(XL2 && XL2[l], 'تلميح المحادثة ← ' + l));
  assert.ok(!html.includes('/js/edu-plus.js?v=1"') && !html.includes('/js/edu.js?v=665"'), 'وسما الكاش رُفعا');
});
