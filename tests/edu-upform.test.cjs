'use strict';
/* v-edu-upform (تصميم المالك ١٦ أكتوبر، لقطة جوّال «التعليم»: «يوم نضغط على ارفع المحاضرة يطلع لنا اسم المحاضرة بعدين الموضوع بعدين
   الفصل بعدين نختار الملف أو الصورة وبعدين وصف الموضوع اللي تباه»): نموذج قبل المسار القائم نفسه، و«محاضراتك المرفوعة» تحت «موادي».
   الخادم: المعالج الحقيقيّ api/edu.js بـkv وauth في الذاكرة وfetch مسجِّل (نمط edu-econ). العميل: دوالّ edu.js الحقيقيّة
   مستخرجة بـacorn في vm. كلّ حالة تفشل على ما قبل v-edu-upform. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

process.env.AUTH_SECRET = 'edu-upform-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
delete process.env.OPENROUTER_API_KEY;

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

/* ---------- الخادم ---------- */
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? JSON.parse(JSON.stringify(db.get(k))) : null),
  kvPutJSON: async (k, v) => { db.set(k, JSON.parse(JSON.stringify(v))); },
  kvDel: async (k) => { db.delete(k); },
  kvIncr: async (k) => { const n = (Number(db.get(k)) || 0) + 1; db.set(k, n); return n; },
  kvExpire: async () => true,
});
const users = new Map();
const sign = (p) => crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
const makeToken = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 3600_000 })).toString('base64url'); return p + '.' + sign(p); };
function verifyToken(t) {
  try { const [p, s] = String(t).split('.'); if (s !== sign(p)) return null; const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.exp < Date.now() ? null : d.u; } catch (e) { return null; }
}
stub('api/_lib/auth.js', {
  verifyToken,
  getUser: async (u) => users.get(String(u).toLowerCase()) || null,
  getUserOnce: async (u) => users.get(String(u).toLowerCase()) || null,
  putUser: async (u, rec) => { users.set(String(u).toLowerCase(), rec); },
  isBanned: async () => false,
});
users.set('sara', { username: 'sara', createdAt: Date.now() - 86400000 * 3, points: 70 });
const TOKEN = makeToken('sara');
const calls = [];
global.fetch = async (url, init) => {
  calls.push({ url: String(url), raw: String((init && init.body) || '') });
  const LESSON = { title: 'عنوان النموذج', subject: 'مادّة النموذج', summary: 'ملخّص', flashcards: [{ q: 'a', a: 'b' }], quiz: [{ q: 'q', options: ['1', '2', '3', '4'], correct: 0 }], written: [] };
  return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(LESSON) }], stop_reason: 'end_turn' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const edu = require(rp('api/edu.js'));
function call(body) {
  const start = calls.length;
  return new Promise((resolve) => {
    const res = {
      code: 200, setHeader() {}, getHeader() {},
      status(c) { this.code = c; return this; },
      json(j) { resolve({ code: this.code, j, calls: calls.slice(start) }); return this; },
      end() { resolve({ code: this.code, calls: calls.slice(start) }); return this; },
    };
    edu({ method: 'POST', body: Object.assign({ token: TOKEN }, body), headers: { 'x-forwarded-for': '10.9.9.9' }, query: {} }, res);
  });
}
const INFO_HEAD = 'معلومات أدخلها الطالب مع الملفّ';

test('١. التحليل: ما كتبه الطالب (الاسم، المادّة، الوصف) يصل النموذج سياقًا مع الملفّ — وبلا نموذج لا يتغيّر الطلب', async () => {
  const r = await call({ action: 'process', text: 'محتوى عن المعادلات', upTitle: 'مقدمة في الجبر', upSubject: 'رياضيات', note: 'ركّز على المعادلات التربيعيّة' });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  assert.ok(r.calls.length >= 1);
  for (const c of r.calls) {
    const sent = JSON.parse(c.raw);
    const txt = JSON.stringify(sent.messages);
    assert.ok(txt.includes(INFO_HEAD) && txt.includes('مقدمة في الجبر') && txt.includes('رياضيات') && txt.includes('ركّز على المعادلات التربيعيّة'), 'السياق في كلا النداءين');
    assert.ok(txt.indexOf(INFO_HEAD) < txt.indexOf('حلل هذه المحاضرة'), 'قبل تعليمة التحليل');
  }
  const plain = await call({ action: 'process', text: 'محتوى عن الخليّة' });
  assert.equal(plain.code, 200);
  assert.ok(plain.calls.every((c) => !c.raw.includes(INFO_HEAD)), 'اللصق والرفع القديم كما هما');
  const onlyInfo = await call({ action: 'process', upTitle: 'x', note: 'y' });
  assert.equal(onlyInfo.code, 400, 'الوصف وحده ليس محتوى للتحليل');
  assert.equal(onlyInfo.calls.length, 0, 'ولا نداء مدفوع');
});

test('٢. الحفظ والقائمة: المرفوعة من النموذج تحفظ فصلها ووصفها واسم ملفّها، والقائمة تعيد علامتها وفصلها؛ وغيرها بلا حقول جديدة', async () => {
  db.clear();
  const base = { summary: 'ملخّص', flashcards: [], quiz: [], written: [] };
  const up = await call({ action: 'save', lesson: Object.assign({ id: 'lup', title: 'مقدمة في الجبر', subject: 'رياضيات', src: 'upload', term: 't2', note: 'و'.repeat(2500), fileName: 'lec.pdf', createdAt: 1760000000000 }, base) });
  assert.equal(up.code, 200, JSON.stringify(up.j));
  const old = await call({ action: 'save', lesson: Object.assign({ id: 'lold', title: 'درس ملصوق', subject: 'عام', term: 't1', note: 'x' }, base) });
  assert.equal(old.code, 200);
  const stored = db.get('edu:lessons:sara');
  const sUp = stored.find((l) => l.id === 'lup'), sOld = stored.find((l) => l.id === 'lold');
  assert.equal(sUp.src, 'upload'); assert.equal(sUp.term, 't2'); assert.equal(sUp.fileName, 'lec.pdf');
  assert.equal(sUp.note.length, 2000, 'الوصف مقصوص ٢٠٠٠');
  assert.ok(!('src' in sOld) && !('term' in sOld) && !('note' in sOld), 'غير المرفوع من النموذج لا يكبر');
  const list = await call({ action: 'list' });
  const lUp = list.j.lessons.find((l) => l.id === 'lup'), lOld = list.j.lessons.find((l) => l.id === 'lold');
  assert.equal(lUp.src, 'upload'); assert.equal(lUp.term, 't2');
  assert.ok(!('note' in lUp), 'الوصف في get لا في القائمة الخفيفة');
  assert.ok(!('src' in lOld) && !('term' in lOld));
  const got = await call({ action: 'get', id: 'lup' });
  assert.equal(got.j.lesson.note.length, 2000);
});

/* ---------- العميل: دوالّ edu.js الحقيقيّة ---------- */
const EDU = read('js/edu.js');
const AST = acorn.parse(EDU, { ecmaVersion: 'latest', sourceType: 'script' });
function fnSrc(name) {
  let found = null;
  (function walk(n) {
    if (!n || found || typeof n.type !== 'string') return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) { found = EDU.slice(n.start, n.end); return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(AST);
  assert.ok(found, 'دالّة مفقودة: ' + name);
  return found;
}
function varSrc(name) {
  let found = null;
  (function walk(n) {
    if (!n || found || typeof n.type !== 'string') return;
    if (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === name)) { found = EDU.slice(n.start, n.end); return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(AST);
  assert.ok(found, 'متغيّر مفقود: ' + name);
  return found;
}

test('٣. processContent: بيانات النموذج (تمرّ مع الرفع نفسه) تسمّي الدرس ومادّته لا تخمين النموذج، وتُحفظ معه، وتصل التحليل؛ واللصق و«ألّف لي الدرس» بلاها', async () => {
  const sent = [], persisted = [];
  const sb = {
    console, Promise, JSON, Object, Date, Math, String,
    PALETTE: ['#a', '#b'],
    showBusy() {}, eduNativeLang: () => 'ar', eduExamLang: () => '', eduL: (a) => a, T: (k) => k, esc: (s) => s,
    api: async (p) => { sent.push(p); return { lesson: { title: 'عنوان النموذج', subject: 'مادّة النموذج', summary: 'ملخّص', flashcards: [], quiz: [], written: [] } }; },
    listLessons: async () => ({ lessons: [] }),
    persistLesson: async (l) => { persisted.push(l); return l.id; },
    localLessons: () => [], saveLocalLessons() {}, showLesson() {}, showHome() {},
    body: { innerHTML: '' }, document: { getElementById: () => ({}) }, setBack() {}, navStack: [],
  };
  vm.createContext(sb);
  vm.runInContext(fnSrc('processContent') + ';this.pc=processContent;', sb);
  const META = { title: 'مقدمة في الجبر', subject: 'رياضيات', term: 't1', note: 'ركّز على المعادلات', fileName: 'lec.png', src: 'upload' };
  sb.pc({ images: [{ base64: 'QQ==', mime: 'image/png' }], lang: 'ar' }, '', META);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sent[0].action, 'process');
  assert.equal(sent[0].upTitle, 'مقدمة في الجبر'); assert.equal(sent[0].upSubject, 'رياضيات'); assert.equal(sent[0].note, 'ركّز على المعادلات');
  const L = persisted[0];
  assert.equal(L.title, 'مقدمة في الجبر', 'اسم الطالب لا عنوان النموذج');
  assert.equal(L.subject, 'رياضيات', 'مادّة الطالب لا تخمين النموذج');
  assert.deepEqual([L.src, L.term, L.note, L.fileName], ['upload', 't1', 'ركّز على المعادلات', 'lec.png']);
  sb.pc({ text: 'نصّ ملصوق', lang: 'ar' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(persisted[1].title, 'عنوان النموذج', 'اللصق بلا بيانات نموذج');
  assert.ok(!('src' in persisted[1]) && !('upTitle' in sent[1]));
  sb.pc({ subject: 'رياضيات', lesson: 'المعادلات' }, 'explain', META);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sent[2].action, 'explain'); assert.ok(!('upTitle' in sent[2]), '«ألّف لي الدرس» لا يأخذ بيانات النموذج');
  assert.ok(!/eduUploadMeta/.test(EDU), 'لا متغيّر عامّ يمسحه فتح التعليم أثناء التجهيز');
});

test('٣ب. handleFiles: بيانات النموذج تمرّ في كلّ فرع (PDF، صور، DOCX، أرشيف) حتّى processContent', async () => {
  const got = [];
  const sb = {
    Array, Promise, alert() {}, T: (k) => k, eduL: (a) => a, appLang: () => 'ar', showBusy() {}, showHome() {},
    eduPdfPayload: async () => ({ fileBase64: 'QQ==', mime: 'application/pdf' }),
    eduImagesForUpload: async (imgs) => imgs.map(() => ({ base64: 'QQ==', mime: 'image/jpeg' })),
    processContent: (p, a, m) => got.push(['pc', a, m]),
    handleDocx: (f, m) => got.push(['docx', m]), handleArchive: (f, m) => got.push(['zip', m]),
    window: {},
  };
  vm.createContext(sb);
  vm.runInContext(fnSrc('handleFiles') + ';this.hf=handleFiles;', sb);
  const M = { title: 't', src: 'upload' };
  sb.hf([{ name: 'a.pdf', type: 'application/pdf', size: 10 }], M);
  sb.hf([{ name: 'p.png', type: 'image/png', size: 10 }], M);
  sb.hf([{ name: 'a.docx', type: '', size: 10 }], M);
  sb.hf([{ name: 'a.zip', type: '', size: 10 }], M);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(got.length, 4);
  assert.ok(got.every((g) => g[g.length - 1] === M), JSON.stringify(got.map((g) => g[0])));
});

test('٣ج. البطاقة تُغلق مع التعليم ومع شاشة جديدة، والسحب للرجوع يغلقها هي أوّلًا، والخلفيّة لا تُغلق بنقرتين أو سحب تحديد، والإفلات على البطاقة كلّها', () => {
  assert.ok(fnSrc('closeModal').includes('if(eduUpCloseFn) eduUpCloseFn();'), 'إغلاق التعليم يغلق البطاقة ومستمع Escape');
  assert.ok(fnSrc('showHome').includes('if(eduUpCloseFn) eduUpCloseFn();'), 'فتح التعليم من جديد لا يُظهر بطاقة قديمة');
  assert.ok(EDU.includes('modal.__omranSwipeBackStep=function(){ if(eduUpCloseFn){ eduUpCloseFn(); return true; }'), 'السحب: البطاقة أوّلًا');
  const form = fnSrc('showUploadForm');
  assert.ok(form.includes("ov.addEventListener('pointerdown',function(e){ downOnOv=(e.target===ov); });") && form.includes('e.target===ov&&downOnOv&&!(e.detail>1)'), 'الخلفيّة');
  assert.ok(form.includes("ov.addEventListener('drop',function(e){ if(e.defaultPrevented) return; e.preventDefault();"), 'الإفلات خارج المربّع المنقّط');
  assert.ok(form.includes("if(eduUpCloseFn===close) eduUpCloseFn=null;") && form.includes("if(e.key==='Escape'&&ov.parentNode)"), 'لا مستمع يبتلع Escape بعد الإغلاق');
  assert.ok(form.includes("join(isRTL()?'، ':', ')"), 'فاصلة اللغة');
});

test('٤. «محاضراتك المرفوعة»: المرفوعة من النموذج وحدها، بتاريخ رفعها yyyy/mm/dd وفصلها، والضغط يفتح الدرس؛ وبلا مرفوعة لا قسم', () => {
  const wrap = { innerHTML: '', querySelectorAll: () => [] };
  const sb = {
    JSON, Object, Date, Math, String, Array,
    T: (k) => ({ myUploads: 'محاضراتك المرفوعة:', upOn: 'رُفعت في', upTerm1: 'الفصل الأول', upTerm2: 'الفصل الثاني', upTerm3: 'الفصل الثالث', upTermS: 'الفصل الصيفي' }[k] || k),
    esc: (s) => String(s).replace(/</g, '&lt;'),
    document: { getElementById: (id) => (id === 'eduUpWrap' ? wrap : (id === 'eduUpCss' ? {} : null)), createElement: () => ({}), head: { appendChild() {} } },
    body: {}, getLesson: async () => ({}), showLesson() {}, showHome() {}, alert() {},
  };
  vm.createContext(sb);
  vm.runInContext([varSrc('EDU_TERMS'), fnSrc('eduTermLabel'), fnSrc('eduYmd'), fnSrc('eduUpIcon'), fnSrc('eduUpCss'), fnSrc('renderUploads')].join('\n'), sb);
  const ts = new Date(2026, 9, 16, 10, 0).getTime();
  sb.renderUploads([{ id: 'a', title: 'مقدمة في الجبر', src: 'upload', term: 't1', createdAt: ts }, { id: 'b', title: 'درس ملصوق', createdAt: ts }]);
  assert.ok(wrap.innerHTML.includes('محاضراتك المرفوعة:'));
  assert.ok(wrap.innerHTML.includes('مقدمة في الجبر') && !wrap.innerHTML.includes('درس ملصوق'), 'المرفوعة وحدها');
  assert.ok(wrap.innerHTML.includes('رُفعت في 2026/10/16 · الفصل الأول'), 'التاريخ والفصل');
  assert.ok(wrap.innerHTML.includes('data-up="a"'));
  sb.renderUploads([{ id: 'b', title: 'درس ملصوق', createdAt: ts }]);
  assert.equal(wrap.innerHTML, '', 'بلا مرفوعة لا قسم فارغ');
});

test('٥. فحص الملفّ قبل الإرسال: PDF/DOCX/ZIP/صور مقبولة، وغيرها يُرفض في النموذج نفسه (لا تبقى بيانات معلّقة)', () => {
  const sb = { Array };
  vm.createContext(sb);
  vm.runInContext(fnSrc('eduUpTypeOk') + ';this.ok=eduUpTypeOk;', sb);
  const f = (name, type) => ({ name, type });
  assert.ok(sb.ok([f('a.pdf', 'application/pdf')]) && sb.ok([f('a.docx', '')]) && sb.ok([f('a.zip', '')]) && sb.ok([f('p.jpg', 'image/jpeg'), f('q.png', 'image/png')]));
  assert.ok(!sb.ok([f('a.exe', 'application/x-msdownload')]) && !sb.ok([f('notes.txt', 'text/plain')]) && !sb.ok([]));
});

test('٦. الزرّ يفتح النموذج، والحقول بترتيب التصميم، والنصوص بالـ14 لغة، ووسم edu.js مرفوع', () => {
  assert.ok(EDU.includes("document.getElementById('eduUploadBtn').onclick=showUploadForm;"), 'الزرّ → النموذج');
  const form = fnSrc('showUploadForm');
  const order = ["id=\"eduUpName\"", "id=\"eduUpSubject\"", "id=\"eduUpTerm\"", "id=\"eduUpDrop\"", "id=\"eduUpDesc\"", "id=\"eduUpSave\""].map((x) => form.indexOf(x));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), 'الاسم ← الموضوع ← الفصل ← الملفّ ← الوصف ← حفظ ورفع: ' + order);
  assert.ok(form.includes("drop.addEventListener('drop'") && form.includes('dataTransfer'), 'السحب والإفلات');
  assert.ok(form.includes('handleFiles(picked,meta)'), 'المسار القائم نفسه، والبيانات معه');
  const i = EDU.indexOf('var EX3={'), j = EDU.indexOf('};', i);
  const EX3 = vm.runInNewContext('(' + EDU.slice(i + 'var EX3='.length, j + 1) + ')');
  const KEYS = ['upName', 'upNamePh', 'upSubject', 'upSubjectPh', 'upTerm', 'upTerm1', 'upTerm2', 'upTerm3', 'upTermS', 'upFile', 'upDrop', 'upPick', 'upDesc', 'upDescPh', 'upSave', 'upNeed', 'upBadType', 'myUploads', 'upOn'];
  const LANGS = ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'ml'];
  assert.deepEqual(Object.keys(EX3).sort(), LANGS.slice().sort());
  for (const lg of LANGS) for (const k of KEYS) assert.ok(String(EX3[lg][k] || '').trim(), lg + '.' + k);
  assert.equal(EX3.ar.upSave, 'حفظ ورفع'); assert.equal(EX3.ar.upPick, 'اختر ملف'); assert.equal(EX3.ar.upDrop, 'اسحب ملف المحاضرة هنا أو');
  const v = Number((read('index.html').match(/\/js\/edu\.js\?v=(\d+)/) || [])[1]);
  assert.ok(v > 668, 'وسم edu.js رُفع');
});
