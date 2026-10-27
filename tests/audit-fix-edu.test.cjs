// tests/audit-fix-edu.test.cjs — v-audit-edu (فحص التطبيق كلّه، ٢٦ أكتوبر ٢٠٢٦): عناقيد «التعليم».
// العرض والقرار في رأس DECISIONS.md؛ كلّ اختبار يبدأ برقم الملاحظة نفسها في الفحص:
//  srv-edu-bots-1  لغة الطالب ترسل «ar» دائمًا (AL() غير معرّفة) فيخرج المحتوى بالعربيّة في الـ١٣ لغة الأخرى.
//  srv-edu-bots-4  سكربت الدرس المرئيّ يُقطع بعد ٣٠ث (لا signal)، و«timed out» لا تطابق فحص المهلة.
//  srv-edu-bots-5  سبعة إجراءات تتعطّل حين يكون مفتاح OpenRouter وحده.
//  srv-edu-bots-6  «الحفظ على الجهاز» عند فشل الحفظ السحابيّ لا يظهر للمسجَّل أبدًا.
//  srv-edu-bots-8  أسماء المزوّدين ونصوصه الخامّة تصل الطالب (ومعها x-prod-3 وpages-static-10).
//  srv-edu-bots-9  رسائل الخادم عربيّة فقط وتُعرض حرفيًّا في واجهات الـ١٤ لغة.
//  x-i18n-3        الأرديّة تُعامَل عربيّة في التعليم (ومعها x-runtime-ui-1).
//  pages-static-2  صانع فيديو الدرس يطلب ffmpeg-core.wasm من مسار غير موجود في المستودع.
// الخادم: المعالج الحقيقيّ api/edu.js مع kv وauth في الذاكرة وfetch مسجِّل — لا شبكة ولا مفاتيح.
// العميل: js/edu.js كاملًا في vm بـDOM مزيّف، وedu-old/index.html ودوالّ edu-algo.js مستخرجة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

process.env.FETCH_TIMEOUT_MS = '200'; // مهلة أوّل بايت العامّة (٣٠ث في الإنتاج) مصغّرة — يقرؤها _fetch-timeout عند التحميل
process.env.AUTH_SECRET = 'audit-fix-edu-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
delete process.env.OPENROUTER_API_KEY;
delete process.env.EDU_ECON_MODEL;
delete process.env.EDU_ECON_TIERS;
delete process.env.EDU_GUEST_TOTAL_DAILY;
delete process.env.EDU_GUEST_LIGHT_TOTAL_DAILY;
delete process.env.EDU_LAB_MODEL;

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const LEAK = /Anthropic|OpenAI|OpenRouter|Claude|GPT|gpt-|credit balance|API_KEY|Edu error|Upstash|Upstream|timed out/i;

/* ================= الخادم ================= */
const db = new Map();
let kvThrow = null; // (key) => Error | null
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => { const e = kvThrow && kvThrow(k); if (e) throw e; return db.has(k) ? db.get(k) : null; },
  kvPutJSON: async (k, v) => { db.set(k, v); },
  kvDel: async (k) => { db.delete(k); },
  kvIncr: async (k) => { const n = (Number(db.get(k)) || 0) + 1; db.set(k, n); return n; },
  kvExpire: async () => true,
});
const users = new Map();
const sign = (p) => crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
function makeToken(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 3600_000 })).toString('base64url'); return p + '.' + sign(p); }
function verifyToken(t) {
  try {
    const [p, s] = String(t).split('.');
    if (s !== sign(p)) return null;
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp < Date.now() ? null : d.u;
  } catch (e) { return null; }
}
stub('api/_lib/auth.js', {
  verifyToken,
  getUser: async (u) => users.get(String(u).toLowerCase()) || null,
  getUserOnce: async (u) => users.get(String(u).toLowerCase()) || null,
  putUser: async (u, rec) => { users.set(String(u).toLowerCase(), rec); },
  isBanned: async () => false,
});
function addUser(name) { users.set(name.toLowerCase(), { username: name, createdAt: Date.now() - 86400000 * 3, points: 70 }); return makeToken(name); }

const LESSON = {
  title: 't', subject: 's', summary: 'ملخّص', flashcards: [{ q: 'a', a: 'b' }],
  quiz: [{ q: 'q', options: ['1', '2', '3', '4'], correct: 0 }], written: [],
  reply: 'r', score: 5, steps: [{ hint: 'h', work: 'w' }], answer: 'a',
  cvHtml: '<html></html>', coverLetter: '', total: 1, categories: [{ name: 'n', amount: 1 }],
};
const LAB_HTML = '```html\n<!doctype html><html><head><title>lab</title></head><body>' + 'x'.repeat(600) + '</body></html>\n```';
const SCRIPT = { title: 'درس', slides: [{ heading: 'h', bullets: ['b'], narration: 'n' }] };
const calls = [];
let upstream = null; // (call) => Response | Promise<Response> | null
const jsonRes = (status, obj) => new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const sleepOrAbort = (ms, signal) => new Promise((resolve, reject) => {
  const tm = setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(tm); reject(signal.reason || new DOMException('aborted', 'AbortError')); }, { once: true });
});
global.fetch = async (url, init) => {
  let body = {};
  try { body = JSON.parse((init && init.body) || '{}'); } catch (e) { body = {}; }
  let host = '';
  try { host = new URL(String(url)).host; } catch (e) { host = ''; }
  const c = { url: String(url), host, model: body.model, system: String(body.system || ''), signal: init && init.signal, hasSignal: !!(init && init.signal) };
  calls.push(c);
  await new Promise((r) => setImmediate(r));
  const custom = upstream && (await upstream(c));
  if (custom) return custom;
  if (host === 'api.openai.com') return jsonRes(200, { choices: [{ message: { content: JSON.stringify(SCRIPT) } }] });
  if (/مطوّر ألعاب/.test(c.system)) return jsonRes(200, { content: [{ type: 'text', text: LAB_HTML }], stop_reason: 'end_turn' });
  return jsonRes(200, { content: [{ type: 'text', text: JSON.stringify(LESSON) }], stop_reason: 'end_turn' });
};

const edu = require(rp('api/edu.js'));
function call(ip, body) {
  const start = calls.length;
  return new Promise((resolve) => {
    const res = {
      code: 200, setHeader() {}, getHeader() {},
      status(c) { this.code = c; return this; },
      json(j) { resolve({ code: this.code, j, calls: calls.slice(start) }); return this; },
      end() { resolve({ code: this.code, calls: calls.slice(start) }); return this; },
    };
    edu({ method: 'POST', body, headers: { 'x-forwarded-for': ip }, query: {} }, res);
  });
}
let ipN = 0;
const ip = () => '10.9.' + Math.floor(++ipN / 250) + '.' + (ipN % 250);

/* ================= العميل: js/edu.js كاملًا في vm ================= */
function el(id) {
  return {
    id, style: {}, dataset: {}, innerHTML: '', textContent: '', value: '', disabled: false, kids: [], onclick: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { this['@' + k] = v; }, getAttribute(k) { return this['@' + k] || null; },
    addEventListener() {}, removeEventListener() {}, appendChild(c) { this.kids.push(c); return c; },
    querySelectorAll() { return []; }, querySelector() { return null; }, remove() {}, focus() {}, closest() { return null; },
    getBoundingClientRect() { return { left: 0, right: 0, width: 0 }; },
  };
}
function store(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}
const EDU_SRC = read('js/edu.js');
/* يكشف دوالّ داخليّة للاختبار وحده (لا يمسّ الملفّ): قبل إغلاق الـIIFE */
const EDU_TESTABLE = EDU_SRC.replace(/\}\)\(\);\s*$/, 'window.__eduTest={processContent:processContent,persistLesson:persistLesson,deleteLesson:deleteLesson,eduRegenQuestions:eduRegenQuestions,localLessons:localLessons,listLessons:listLessons,getLesson:getLesson};\n})();');
function boot(opts) {
  const o = opts || {};
  const ids = new Map();
  const get = (id) => { if (!ids.has(id)) ids.set(id, el(id)); return ids.get(id); };
  const document = {
    getElementById: get, createElement: (t) => el(t), head: el('head'), body: el('body'), documentElement: el('html'),
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  };
  const ls = store(Object.assign({ eduHubIntroSeen: '1' }, o.lang ? { aiapp_lang: o.lang } : {}, o.token ? { aiapp_auth_token: o.token } : {}, o.user ? { aiapp_username: o.user } : {}, o.ls || {}));
  const sent = [];
  const ctx = {
    document, localStorage: ls, sessionStorage: store(), console, URL, Response, AbortController,
    setTimeout: (f, ms) => { const h = setTimeout(f, ms); if (h && h.unref) h.unref(); return h; }, clearTimeout,
    __swallow() {}, alert() {}, confirm: () => true,
    fetch: async (u, init) => {
      const p = JSON.parse(init.body);
      sent.push(p);
      const r = o.route ? await o.route(p) : null;
      const out = r || { status: 200, body: { ok: true } };
      return new Response(typeof out.body === 'string' ? out.body : JSON.stringify(out.body), { status: out.status || 200 });
    },
  };
  if (o.lang) ctx.lang = o.lang;
  if (o.t) ctx.t = o.t;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(EDU_TESTABLE, ctx);
  return { ctx, core: ctx.__eduCore, x: ctx.__eduTest, sent, ls, get };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 15));
const plain = (x) => JSON.parse(JSON.stringify(x));

/* ---------------- srv-edu-bots-1 ---------------- */
test('srv-edu-bots-1: لغة الطالب الأمّ = لغة الواجهة (لا «ar» ثابتة) — وتصل كذلك مع التحليل والأسئلة', async () => {
  for (const lg of ['en', 'hi', 'ur', 'fr', 'ar']) {
    const h = boot({ lang: lg });
    assert.equal(typeof h.ctx.AL, 'undefined', 'AL غير معرّفة في الحزمة كما في الإنتاج');
    assert.equal(h.core.nativeLang(), lg, lg);
  }
  assert.equal(boot({}).core.nativeLang(), 'ar', 'بلا لغة محفوظة: العربيّة كما كانت');
  const h = boot({ lang: 'en', route: () => ({ status: 200, body: { ok: true, lesson: { title: 'T', subject: 'S', summary: 'sum', flashcards: [], quiz: [], written: [] } } }) });
  h.x.processContent({ text: 'lecture', lang: 'en' });
  await tick(30);
  const proc = h.sent.find((p) => p.action === 'process');
  assert.equal(proc.nativeLang, 'en', 'nativeLang المرسلة مع process');
  // والخادم يأخذها: «write EVERYTHING … in English» لا «in Arabic»
  calls.length = 0;
  const r = await call(ip(), { action: 'process', text: 'lecture', lang: 'en', nativeLang: proc.nativeLang });
  assert.equal(r.code, 200);
  assert.ok(r.calls.length && r.calls.every((c) => /options — in English\. /.test(c.system) && !/options — in Arabic\./.test(c.system)), "تعليمة اللغة الإلزاميّة بالإنجليزيّة");
});

/* ---------------- srv-edu-bots-4 ---------------- */
test('srv-edu-bots-4: سكربت الدرس الطويل لا يُقطع بمهلة أوّل البايت العامّة (يمرّر مهلته الخاصّة)', async () => {
  upstream = async (c) => {
    if (c.host !== 'api.openai.com') return null;
    await sleepOrAbort(500, c.signal); // التوليد غير المتدفّق: لا رؤوس قبل اكتماله
    return jsonRes(200, { choices: [{ message: { content: JSON.stringify(SCRIPT) } }] });
  };
  try {
    const r = await call(ip(), { action: 'lesson-script', topic: 'الدورة الدموية', durationMinutes: 40, lang: 'ar' });
    assert.equal(r.code, 200, JSON.stringify(r.j));
    assert.equal(r.j.slides.length, 1);
    assert.ok(r.calls.filter((c) => c.host === 'api.openai.com').every((c) => c.hasSignal), 'النداء يحمل signal خاصًّا');
  } finally { upstream = null; }
});

test('srv-edu-bots-4: «Upstream request timed out» (UpstreamTimeoutError) تُعامل مهلة 504 لا خطأ 500 خامًّا', async () => {
  const tok = addUser('timeout-user');
  kvThrow = (k) => (k === 'edu:lessons:timeout-user'
    ? Object.assign(new Error('تعذّر الاتصال بالخدمة الخارجية خلال 30 ثانية. Upstream request timed out after 30000ms.'), { name: 'UpstreamTimeoutError' })
    : null);
  try {
    const r = await call(ip(), { action: 'list', token: tok });
    assert.equal(r.code, 504, JSON.stringify(r.j));
    assert.equal(r.j.code, 'timeout');
    assert.doesNotMatch(r.j.error, LEAK);
  } finally { kvThrow = null; }
  // مهلة نداء النموذج نفسه (AbortSignal.timeout ٢٨٠ث) داخل الإجراء: 504 timeout لا «تعذر تحليل المحاضرة: The operation was aborted…»
  upstream = async (c) => { if (c.host === 'api.anthropic.com') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); return null; };
  try {
    const r = await call(ip(), { action: 'process', text: 'x' });
    assert.equal(r.code, 504, JSON.stringify(r.j));
    assert.equal(r.j.code, 'timeout');
    assert.doesNotMatch(r.j.error, /operation|aborted/i);
  } finally { upstream = null; }
});

/* ---------------- srv-edu-bots-5 ---------------- */
test('srv-edu-bots-5: مفتاح OpenRouter وحده يكفي للإجراءات السبعة (process/explain/questions/lab/cv/expense/grade)', async () => {
  const savedA = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  try {
    const cases = {
      process: { text: 'محاضرة' },
      explain: { subject: 'رياضيات', lesson: 'المعادلات' },
      questions: { summary: 'ملخّص الدرس' },
      lab: { title: 'الضوء', summary: 'ملخّص الضوء' },
      cv: { info: { name: 'سارة' } },
      expense: { text: 'بنزين 50' },
      grade: { question: 'q', rubric: ['a'], answer: 'x' },
    };
    for (const [action, extra] of Object.entries(cases)) {
      const r = await call(ip(), Object.assign({ action }, extra));
      assert.equal(r.code, 200, action + ': ' + JSON.stringify(r.j));
      assert.ok(r.calls.length >= 1 && r.calls.every((c) => c.host === 'openrouter.ai'), action + ' عبر openrouter.ai وحده');
    }
  } finally {
    process.env.ANTHROPIC_API_KEY = savedA;
    delete process.env.OPENROUTER_API_KEY;
  }
});

/* ---------------- srv-edu-bots-6 ---------------- */
test('srv-edu-bots-6: فشل الحفظ السحابيّ للمسجَّل — الدرس يبقى في «موادي» ويُفتح، ثمّ يُرفع في الفتحة التالية', async () => {
  const tok = addUser('sara');
  let saveOk = false;
  const saved = [];
  const SRV = [{ id: 'srv1', subject: 'فيزياء', title: 'الضوء', createdAt: 1 }];
  const route = (p) => {
    if (p.action === 'process') return { status: 200, body: { ok: true, lesson: { title: 'الخليّة', subject: 'أحياء', summary: 'ملخّص الخليّة', flashcards: [], quiz: [], written: [] } } };
    if (p.action === 'save') { if (!saveOk) return { status: 500, body: { error: 'تعذّر الحفظ' } }; saved.push(p.lesson); SRV.unshift({ id: p.lesson.id, subject: p.lesson.subject, title: p.lesson.title }); return { status: 200, body: { ok: true, id: p.lesson.id } }; }
    if (p.action === 'list') return { status: 200, body: { ok: true, lessons: SRV.slice(), streak: {} } };
    if (p.action === 'get') { const f = SRV.find((l) => l.id === p.id); return f ? { status: 200, body: { ok: true, lesson: f } } : { status: 404, body: { error: 'الدرس غير موجود' } }; }
    if (p.action === 'delete') return { status: 200, body: { ok: true } };
    return null;
  };
  const h = boot({ lang: 'ar', token: tok, user: 'sara', route });
  h.x.processContent({ text: 'محاضرة الخليّة', lang: 'ar' });
  await tick(40);
  const local = h.x.localLessons().find((l) => l.title === 'الخليّة');
  assert.ok(local, 'النسخة المحلّيّة محفوظة');
  const id = local.id;
  const list1 = await h.x.listLessons();
  assert.deepEqual(plain(list1.lessons.map((l) => l.id)).sort(), ['srv1', id].sort(), 'القائمة = الخادم + المحلّيّ المعلّق');
  const got = await h.x.getLesson(id);
  assert.equal(got.summary, 'ملخّص الخليّة', 'يُفتح من الجهاز لا 404');
  // الفتحة التالية والحفظ عاد يعمل: يُرفع مرّة واحدة ثمّ يُزال المعلّق المحلّيّ
  saveOk = true;
  await h.x.listLessons();
  await tick(40);
  assert.equal(saved.filter((l) => l.id === id).length, 1, 'رُفع للسحابة');
  assert.ok(!h.x.localLessons().some((l) => l.id === id && l.pendingSync), 'لا نسخة معلّقة بعد الرفع');
  const list2 = await h.x.listLessons();
  assert.equal(list2.lessons.filter((l) => l.id === id).length, 1, 'بلا تكرار');
  // ضيف أو حساب آخر على الجهاز نفسه لا يرى معلّقات «sara» ولا يرفعها لحسابه
  const h2 = boot({ lang: 'ar', ls: { eduHubLessons: JSON.stringify([{ id: 'pz', title: 'x', summary: 's', subject: 'm', pendingSync: true, pendingFor: 'sara' }]) } });
  assert.equal((await h2.x.listLessons()).lessons.length, 0, 'الضيف لا يرى معلّق حساب');
  const tokB = addUser('omar');
  const h3 = boot({ lang: 'ar', token: tokB, user: 'omar', route: (p) => (p.action === 'list' ? { status: 200, body: { ok: true, lessons: [], streak: {} } } : null),
    ls: { eduHubLessons: JSON.stringify([{ id: 'pz', title: 'x', summary: 's', subject: 'm', pendingSync: true, pendingFor: 'sara' }]) } });
  assert.equal((await h3.x.listLessons()).lessons.length, 0, 'حساب آخر لا يرى معلّق sara');
  await tick(20);
  assert.ok(!h3.sent.some((p) => p.action === 'save'), 'ولا يرفعه لحسابه');
});

test('srv-edu-bots-6: الأسئلة المولَّدة في eduRegenQuestions لا تضيع إن فشل حفظها (ولا رفض غير معالَج)', async () => {
  const tok = addUser('lina');
  const route = (p) => {
    if (p.action === 'questions') return { status: 200, body: { ok: true, flashcards: [{ q: 'a', a: 'b' }], quiz: [{ q: 'q', options: ['1', '2', '3', '4'], correct: 0 }], written: [] } };
    if (p.action === 'save') return { status: 500, body: { error: 'تعذّر الحفظ' } };
    if (p.action === 'list') return { status: 200, body: { ok: true, lessons: [], streak: {} } };
    return null;
  };
  const unhandled = [];
  const onU = (e) => unhandled.push(e);
  process.on('unhandledRejection', onU);
  try {
    const h = boot({ lang: 'ar', token: tok, user: 'lina', route });
    const pane = el('pane');
    const lesson = { id: 'lq1', title: 'درس', subject: 'م', summary: 'ملخّص', flashcards: [], quiz: [], written: [] };
    h.x.eduRegenQuestions(pane, lesson, 'cards');
    h.get('eduRegenQsBtn').onclick();
    await tick(60);
    const kept = h.x.localLessons().find((l) => l.id === 'lq1');
    assert.ok(kept && kept.quiz.length === 1 && kept.pendingSync, 'الأسئلة محفوظة على الجهاز معلّقة للرفع');
    assert.equal(unhandled.length, 0, 'لا رفض غير معالَج');
  } finally { process.off('unhandledRejection', onU); }
});

/* خادم دروس في الذاكرة يشترك فيه «جهازان»: save = ok | fail (القاعدة لا تقبل الكتابة والقراءة تعمل) | ghost (وصل وضاع ردّه) */
function eduServer() {
  const SRV = new Map();
  const st = { save: 'ok', saved: [] };
  const light = (l) => ({ id: l.id, subject: l.subject, title: l.title, createdAt: l.createdAt, quizCount: (l.quiz || []).length });
  const route = (p) => {
    if (p.action === 'questions') return { status: 200, body: { ok: true, flashcards: [{ q: 'a', a: 'b' }], quiz: [{ q: 'q', options: ['1', '2', '3', '4'], correct: 0 }], written: [] } };
    if (p.action === 'process') return { status: 200, body: { ok: true, lesson: { title: 'الخليّة', subject: 'أحياء', summary: 'ملخّص الخليّة', flashcards: [], quiz: [], written: [] } } };
    if (p.action === 'save') {
      if (st.save === 'fail') return { status: 500, body: { error: 'تعذّر الحفظ' } };
      const write = () => {
        SRV.set(p.lesson.id, p.lesson); st.saved.push(p.lesson);
        return st.save === 'ghost' ? { status: 500, body: { error: 'تعذّر الحفظ' } } : { status: 200, body: { ok: true, id: p.lesson.id } };
      };
      return st.lag ? new Promise((r) => setTimeout(() => r(write()), st.lag)) : write(); // lag: الكتابة تصل الخادم بعد زمن
    }
    if (p.action === 'list') return { status: 200, body: { ok: true, lessons: [...SRV.values()].map(light), streak: {} } };
    if (p.action === 'get') { const f = SRV.get(p.id); return f ? { status: 200, body: { ok: true, lesson: f } } : { status: 404, body: { error: 'الدرس غير موجود' } }; }
    if (p.action === 'delete') { SRV.delete(p.id); return { status: 200, body: { ok: true } }; }
    return null;
  };
  return { SRV, st, route };
}

test('srv-edu-bots-6 (مراجعة): أسئلة درسٍ في الخادم فشل حفظها — تُفتح من الجهاز، وتُرفع حين يعود الحفظ، ثمّ لا تحجب الخادم ولا تعيد المحذوف', async () => {
  const tok = addUser('huda');
  const S = eduServer();
  S.SRV.set('s0', { id: 's0', title: 'الضوء', subject: 'فيزياء', summary: 'ملخّص الضوء', flashcards: [], quiz: [], written: [], createdAt: 1 });
  const h = boot({ lang: 'ar', token: tok, user: 'huda', route: S.route });
  const opened = await h.x.getLesson('s0');
  assert.equal(opened.quiz.length, 0);
  S.st.save = 'fail';
  h.x.eduRegenQuestions(el('pane'), opened, 'quiz');
  h.get('eduRegenQsBtn').onclick();
  await tick(40);
  assert.ok(h.x.localLessons().some((l) => l.id === 's0' && l.pendingSync && l.quiz.length === 1), 'الأسئلة معلّقة على الجهاز');
  // يرجع للقائمة ويفتح الدرس والكتابة ما زالت معطّلة: يرى أسئلته لا «ولّد الأسئلة» (حصّة يوم أخرى)
  await h.x.listLessons(); await tick(30);
  assert.equal((await h.x.getLesson('s0')).quiz.length, 1, 'الجهاز يعرض الأسئلة المولَّدة');
  assert.equal(S.st.saved.length, 0);
  // عاد الحفظ: فتحتان للقائمة → رُفعت مرّة واحدة، والخادم فيه الأسئلة للأجهزة الأخرى، ولا معلّق
  S.st.save = 'ok';
  await h.x.listLessons(); await tick(30);
  await h.x.listLessons(); await tick(30);
  assert.deepEqual(S.st.saved.map((l) => l.id), ['s0'], 'رُفعت مرّة واحدة');
  assert.equal(S.SRV.get('s0').quiz.length, 1, 'الخادم فيه الأسئلة');
  assert.ok(!('pendingSync' in S.SRV.get('s0')) && !('pendingFor' in S.SRV.get('s0')), 'وسوم الجهاز لا تُرفع');
  assert.ok(!h.x.localLessons().some((l) => l.id === 's0' && l.pendingSync), 'لا معلّق بعد الرفع');
  // جهاز آخر يعدّل ثمّ يحذف: هذا الجهاز يرى نسخة الخادم، والمحذوف لا يعود ولا يُرفع
  S.SRV.get('s0').quiz.push({ q: 'q2', options: ['1', '2', '3', '4'], correct: 1 });
  const fresh = await h.x.getLesson('s0');
  assert.equal(fresh.quiz.length, 2, 'نسخة الخادم الأحدث لا تحجبها نسخة الجهاز');
  assert.ok(!fresh.pendingSync);
  S.SRV.delete('s0');
  const after = await h.x.listLessons(); await tick(30);
  assert.ok(!after.lessons.some((l) => l.id === 's0'), 'المحذوف من جهاز آخر لا يعود');
  assert.equal(S.st.saved.length, 1, 'ولا يُرفع من جديد');
});

test('srv-edu-bots-6 (مراجعة): الحفظ الناجح يُزيل النسخة المعلّقة، والحفظ الذي وصل وضاع ردّه لا يُبقي نسخة تحجب الخادم أو تعيد المحذوف', async () => {
  const tok = addUser('rana');
  const S = eduServer();
  const h = boot({ lang: 'ar', token: tok, user: 'rana', route: S.route });
  // (١) فشل حفظ درس جديد → معلّق يُفتح من الجهاز (الخادم 404)
  S.st.save = 'fail';
  h.x.processContent({ text: 'محاضرة الخليّة', lang: 'ar' });
  await tick(40);
  const p = h.x.localLessons().find((l) => l.pendingSync);
  assert.ok(p, 'معلّق على الجهاز');
  const opened = await h.x.getLesson(p.id);
  assert.equal(opened.summary, 'ملخّص الخليّة');
  // (٢) عاد الحفظ وولّد الطالب الأسئلة على المعلّق: الحفظ نجح → لا معلّق، والفتح التالي نسخة الخادم
  S.st.save = 'ok';
  h.x.eduRegenQuestions(el('pane'), opened, 'quiz');
  h.get('eduRegenQsBtn').onclick();
  await tick(40);
  assert.ok(!h.x.localLessons().some((l) => l.id === p.id && l.pendingSync), 'الحفظ الناجح أزال المعلّق');
  const got = await h.x.getLesson(p.id);
  assert.equal(got.quiz.length, 1);
  assert.ok(!got.pendingSync && !('pendingFor' in S.SRV.get(p.id)), 'بلا وسم معلّق');
  await h.x.listLessons(); await tick(30);
  assert.equal(S.st.saved.filter((l) => l.id === p.id).length, 1, 'لا رفع مكرّر');
  // (٣) حفظ وصل الخادم وضاع ردّه: أوّل فتح يرفع النسخة ويزيلها، ثمّ نسخة الخادم هي المعروضة
  S.st.save = 'ghost';
  h.x.processContent({ text: 'محاضرة ثانية', lang: 'ar' });
  await tick(40);
  const g = h.x.localLessons().find((l) => l.pendingSync);
  assert.ok(g && S.SRV.has(g.id), 'وصل الخادم والجهاز يظنّه فشل');
  S.st.save = 'ok';
  const g1 = await h.x.getLesson(g.id);
  assert.equal(g1.summary, 'ملخّص الخليّة');
  assert.ok(!g1.pendingSync, 'فُتح بلا وسم معلّق');
  assert.ok(!h.x.localLessons().some((l) => l.id === g.id && l.pendingSync), 'زال المعلّق');
  S.SRV.get(g.id).summary = 'ملخّص معدّل من جهاز آخر';
  assert.equal((await h.x.getLesson(g.id)).summary, 'ملخّص معدّل من جهاز آخر', 'نسخة الخادم لا تحجبها نسخة الجهاز');
  S.SRV.delete(g.id);
  const n = S.st.saved.length;
  const after = await h.x.listLessons(); await tick(30);
  assert.ok(!after.lessons.some((l) => l.id === g.id), 'المحذوف من جهاز آخر لا يعود');
  assert.equal(S.st.saved.length, n, 'ولا يُرفع من جديد');
  // حذف درس من هذا الجهاز أثناء رفع معلّقه لا يعيده (الحذف ينتظر الرفع)
  S.st.save = 'fail';
  h.x.processContent({ text: 'محاضرة ثالثة', lang: 'ar' });
  await tick(40);
  const d = h.x.localLessons().find((l) => l.pendingSync);
  S.st.save = 'ok'; S.st.lag = 25;
  await h.x.listLessons(); // الرفع بدأ ولم يصل
  await h.x.deleteLesson(d.id); await tick(60);
  assert.ok(!S.SRV.has(d.id), 'المحذوف لا يعود من رفع كان في الطريق');
  assert.ok(!h.x.localLessons().some((l) => l.id === d.id), 'ولا نسخة على الجهاز');
});

/* ---------------- srv-edu-bots-8 ---------------- */
test('srv-edu-bots-8: نفاد رصيد المزوّد في التحليل — نصّ وظيفيّ ورمز، لا «credit balance … Anthropic API»', async () => {
  upstream = (c) => (c.host === 'api.anthropic.com' ? jsonRes(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } }) : null);
  try {
    for (const action of ['process', 'explain', 'questions', 'tutor', 'solve', 'grade', 'lab', 'docask']) {
      const extra = { process: { text: 'x' }, explain: { subject: 'م', lesson: 'د' }, questions: { summary: 'م' }, tutor: { question: 'q' }, solve: { text: '2x=4' },
        grade: { question: 'q', rubric: ['a'], answer: 'x' }, lab: { title: 't', summary: 's' }, docask: { docText: 'نص', question: 'س' } }[action];
      const r = await call(ip(), Object.assign({ action }, extra));
      assert.ok(r.code >= 400, action);
      assert.doesNotMatch(r.j.error, LEAK, action + ': ' + r.j.error);
      assert.equal(r.j.code, 'unavailable', action);
    }
  } finally { upstream = null; }
});

test('srv-edu-bots-8: سكربت الدرس 429 من المزوّد — لا «OpenAI error: {…}» ولا جسمه الخامّ', async () => {
  upstream = (c) => (c.host === 'api.openai.com' ? jsonRes(429, '{"error":{"message":"Rate limit reached for gpt-6-luna in organization org-abc on tokens per min","type":"tokens"}}') : null);
  try {
    const r = await call(ip(), { action: 'lesson-script', topic: 'الخليّة', lang: 'ar' });
    assert.equal(r.code, 429);
    assert.doesNotMatch(r.j.error, LEAK);
    assert.doesNotMatch(JSON.stringify(r.j), /org-abc|Rate limit/);
    assert.equal(r.j.code, 'unavailable');
  } finally { upstream = null; }
  upstream = (c) => (c.host === 'api.openai.com' ? jsonRes(200, { choices: [{ message: { content: 'not json' } }] }) : null);
  try {
    const r = await call(ip(), { action: 'lesson-script', topic: 'الخليّة', lang: 'ar' });
    assert.equal(r.code, 502);
    assert.doesNotMatch(r.j.error, /Model returned|invalid JSON/);
    assert.equal(r.j.code, 'failed');
  } finally { upstream = null; }
});

test('srv-edu-bots-8: غياب المفاتيح وعطب الخادم — 503/500 برمز ونصّ وظيفيّ، لا اسم متغيّر ولا «Edu error: …»', async () => {
  const savedA = process.env.ANTHROPIC_API_KEY, savedO = process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.OPENROUTER_API_KEY;
  try {
    for (const [action, extra] of [['process', { text: 'x' }], ['tutor', { question: 'q' }], ['solve', { text: 'x' }], ['docask', { docText: 'a', question: 'b' }], ['lesson-script', { topic: 'الخليّة' }]]) {
      const r = await call(ip(), Object.assign({ action }, extra));
      assert.equal(r.code, 503, action);
      assert.equal(r.j.code, 'unavailable', action);
      assert.doesNotMatch(r.j.error, LEAK, action);
      assert.equal(r.calls.length, 0, action + ': بلا نداء');
    }
  } finally { process.env.ANTHROPIC_API_KEY = savedA; process.env.OPENAI_API_KEY = savedO; }
  const tok = addUser('oom-user');
  kvThrow = (k) => (k === 'edu:lessons:oom-user' ? new Error("Upstash error: OOM command not allowed when used memory > 'maxmemory'.") : null);
  try {
    const r = await call(ip(), { action: 'list', token: tok });
    assert.equal(r.code, 500);
    assert.equal(r.j.code, 'failed');
    assert.doesNotMatch(r.j.error, LEAK);
  } finally { kvThrow = null; }
  const src = read('api/edu.js');
  assert.doesNotMatch(src, /error: 'OpenAI error: |'Edu error: '|error: 'Server is missing/, 'لا نصّ مزوّد/متغيّر في الردود');
  assert.doesNotMatch(src, /json\(\{ error: '[^']*: ' \+ \(?(?:e\.message|msg)\b/, 'لا يُلصق e.message بنصّ المستخدم');
});

test('srv-edu-bots-8 (pages-static-10): صانع الفيديو لا يعرض نصّ الخادم/المزوّد الخامّ — نصّ واجهته بلغة الدرس', async () => {
  const page = read('edu-old/index.html');
  const js = page.slice(page.indexOf('<script>\n(function(){'), page.lastIndexOf('</script>'));
  const strSrc = js.slice(js.indexOf('const STR = {'), js.indexOf('const RTL_LANGS'));
  const tSrc = js.slice(js.indexOf('function T(k){'), js.indexOf('function applyLang(){'));
  const hStart = js.indexOf("$('#btnGenerateScript').onclick = async () => {");
  const hEnd = js.indexOf('// ---------- Video building');
  assert.ok(hStart > 0 && hEnd > hStart);
  const handler = js.slice(hStart, hEnd);
  async function run(lg, resp) {
    const els = new Map();
    const $ = (s) => { if (!els.has(s)) els.set(s, Object.assign(el(s), { value: s === '#topic' ? 'الخليّة' : '10', scrollIntoView() {} })); return els.get(s); };
    const ctx = { $, console, lang: lg, lessonData: null, renderSlides() {}, syncLangFromDd() {}, status: '',
      fetch: async () => { if (resp instanceof Error) throw resp; return new Response(JSON.stringify(resp.body), { status: resp.status }); } };
    ctx.setStatus1 = (m) => { ctx.status = m || ''; };
    vm.createContext(ctx);
    vm.runInContext(strSrc + '\n' + tSrc + '\n' + handler + '\nthis.STR = STR;', ctx);
    await $('#btnGenerateScript').onclick();
    return { status: ctx.status, STR: ctx.STR };
  }
  // ردّ قديم (أو أيّ ردّ) فيه نصّ المزوّد الخامّ
  const a = await run('en', { status: 429, body: { error: 'OpenAI error: {"error":{"message":"Rate limit reached for gpt-6-luna"}}' } });
  assert.doesNotMatch(a.status, LEAK);
  assert.equal(a.status, a.STR.en.genScriptErr + a.STR.en.svcPaused);
  const b = await run('fr', { status: 402, body: { error: 'وصلت للحد اليومي لدروس الفيديو. عد غدًا 🌙', code: 'daily_cap' } });
  assert.equal(b.status, b.STR.fr.genScriptErr + b.STR.fr.axEduCapUser, 'السقف بلغة الدرس لا بالعربيّة');
  const c = await run('ur', new TypeError('Failed to fetch'));
  assert.equal(c.status, c.STR.ur.genScriptErr + c.STR.ur.svcPaused);
  for (const lg of ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ne', 'es', 'fil', 'id', 'ml', 'ru', 'tr', 'zh']) {
    for (const k of ['svcPaused', 'axEduCapUser']) {
      assert.ok(a.STR[lg] && a.STR[lg][k] && !/[​-‏﻿]/.test(a.STR[lg][k]), lg + '.' + k);
      if (lg !== 'ar' && lg !== 'ur') assert.doesNotMatch(a.STR[lg][k], /[؀-ۿ]/, lg + '.' + k + ' بلا عربيّة');
    }
  }
  assert.notEqual(a.STR.ur.axEduCapUser, a.STR.ar.axEduCapUser, 'الأرديّة لغتها لا العربيّة');
});

/* ---------------- srv-edu-bots-9 ---------------- */
test('srv-edu-bots-9: الخادم يرسل رمز السقف مع نصّه (guest/user) — والنصّ العربيّ كما كان', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await call('10.8.0.1', { action: 'process', text: 'x' })).code, 200);
  const g = await call('10.8.0.1', { action: 'process', text: 'x' });
  assert.equal(g.code, 402);
  assert.equal(g.j.code, 'daily_cap'); assert.equal(g.j.scope, 'guest');
  assert.equal(g.j.error, 'وصلت للحد اليومي المجاني (3 محاضرات). سجّل الدخول أو عد غدًا 🌙');
  const tok = addUser('cap-user');
  for (let i = 0; i < 5; i++) await call('10.8.0.2', { action: 'process', token: tok, text: 'x' });
  const u = await call('10.8.0.2', { action: 'process', token: tok, text: 'x' });
  assert.equal(u.code, 402); assert.equal(u.j.code, 'daily_cap'); assert.equal(u.j.scope, 'user');
  const big = await call(ip(), { action: 'process', fileBase64: 'x'.repeat(14 * 1024 * 1024 + 1), mime: 'application/pdf' });
  assert.equal(big.code, 413); assert.equal(big.j.code, 'too_big');
});

test('srv-edu-bots-9: العميل يترجم رمز الخادم بلغة الواجهة — العربيّة وحدها تقرأ نصّ الخادم، والأرديّة لغتها', async () => {
  const CAP = { status: 402, body: { error: 'وصلت للحد اليومي المجاني (3 محاضرات). سجّل الدخول أو عد غدًا 🌙', code: 'daily_cap', scope: 'guest' } };
  const err = async (h) => { try { await h.core.api({ action: 'process' }); } catch (e) { return e.message; } return null; };
  // بلا قاموس عامّ بعد: البديل الإنجليزيّ في الكود
  const en = await err(boot({ lang: 'en', route: () => CAP }));
  assert.doesNotMatch(en, /[؀-ۿ]/, en);
  assert.match(en, /sign in/i);
  // بالقاموس العامّ (t): المفتاح بلغة الواجهة
  const DICT = { ur: { axEduCapGuest: 'آج کی مفت حد پوری', svcPaused: 'سروس عارضی طور پر دستیاب نہیں', axEduCapUser: 'آج کی حد پوری' }, fr: { axEduCapGuest: 'Limite gratuite atteinte', svcPaused: 'Service indisponible', axEduCapUser: 'Limite atteinte' } };
  const tFor = (lg) => (k) => (DICT[lg] && DICT[lg][k]) || k;
  assert.equal(await err(boot({ lang: 'ur', t: tFor('ur'), route: () => CAP })), 'آج کی مفت حد پوری', 'الأرديّة لا ترى النصّ العربيّ');
  assert.equal(await err(boot({ lang: 'fr', t: tFor('fr'), route: () => ({ status: 402, body: { error: 'وصلت للحد اليومي. عد غدًا 🌙', code: 'daily_cap', scope: 'user' } }) })), 'Limite atteinte');
  assert.equal(await err(boot({ lang: 'fr', t: tFor('fr'), route: () => ({ status: 503, body: { error: 'الخدمة متوقّفة مؤقّتًا — جرّب بعد قليل.', code: 'unavailable' } }) })), 'Service indisponible');
  // العربيّة: نصّ الخادم نفسه (فيه العدد)
  assert.equal(await err(boot({ lang: 'ar', route: () => CAP })), CAP.body.error);
  // ردّ بلا رمز (نسخة خادم قديمة أو تحقّق) لا يظهر عربيًّا لغير العربيّ — خطأ الواجهة المترجم
  const old = await err(boot({ lang: 'en', route: () => ({ status: 400, body: { error: 'اكتب سؤالك أولًا.' } }) }));
  assert.doesNotMatch(old, /[؀-ۿ]/);
  // ما كتبه النموذج بلغة الطالب (code:'reason') يمرّ كما هو
  assert.equal(await err(boot({ lang: 'en', route: () => ({ status: 422, body: { error: 'The photo is not readable.', code: 'reason' } }) })), 'The photo is not readable.');
});

/* ---------------- x-i18n-3 ---------------- */
test('x-i18n-3: eduL للأرديّة يأخذ ترجمتها الجاهزة (EDU_X.ur)، وما لا ترجمة أرديّة له إنجليزيّ لا عربيّ', () => {
  const h = boot({ lang: 'ur' });
  const KEY = 'درس من المنهج — اختر البلد والصف والمادة';
  assert.equal(h.core.eduL(KEY, 'Lesson from curriculum'), 'نصاب سے سبق — ملک، جماعت اور مضمون چنیں');
  assert.equal(h.core.eduL('نص لا ترجمة له', 'Untranslated'), 'Untranslated');
  assert.equal(boot({ lang: 'ar' }).core.eduL(KEY, 'x'), KEY, 'العربيّة كما هي');
  // مسار «خوارزميات الألعاب»: محتواه عربيّ/إنجليزيّ — الأرديّة تأخذ الإنجليزيّ
  const algo = read('js/edu-algo.js');
  const pick = (head) => { const a = algo.indexOf(head); assert.ok(a >= 0, head); return algo.slice(a, algo.indexOf('\n', a)); };
  const ctx = { C: () => ({ appLang: () => 'ur' }) };
  vm.createContext(ctx);
  vm.runInContext(pick('function isAr(){') + '\n' + pick('function tx(o){'), ctx);
  assert.equal(vm.runInContext("tx({ar:'عربي',en:'English'})", ctx), 'English');
  ctx.C = () => ({ appLang: () => 'ar' });
  assert.equal(vm.runInContext("tx({ar:'عربي',en:'English'})", ctx), 'عربي');
});

/* ---------------- pages-static-2 ---------------- */
test('pages-static-2: كلّ ملفّ يطلبه getFFmpeg في صانع فيديو الدرس موجود في المستودع (منشور)', async () => {
  const page = read('edu-old/index.html');
  const a = page.indexOf('async function getFFmpeg(){');
  assert.ok(a > 0);
  let d = 0, i = page.indexOf('{', a);
  for (; i < page.length; i++) { if (page[i] === '{') d++; else if (page[i] === '}') { d--; if (!d) break; } }
  const fn = page.slice(a, i + 1).replace(/import\(\s*\/\*[^*]*\*\/\s*/g, '__imp(');
  const urls = [];
  class FFmpeg { async load(cfg) { this.cfg = cfg; } }
  const ctx = {
    console: { warn() {}, log() {} }, ffmpegInstance: null, setStatus2() {}, T: (k) => k,
    withTimeout: (p) => p,
    __imp: async (u) => { urls.push(u); return { FFmpeg, toBlobURL: async (x) => { urls.push(x); return 'blob:' + x; } }; },
  };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nthis.getFFmpeg = getFFmpeg;', ctx);
  await ctx.getFFmpeg();
  assert.ok(urls.some((u) => /\.wasm$/.test(u)) && urls.some((u) => /ffmpeg-core\.js$/.test(u)));
  let tracked = null;
  try { tracked = new Set(execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n')); } catch (e) { tracked = null; }
  for (const u of urls) {
    const p = u.replace(/^\//, '');
    if (tracked) assert.ok(tracked.has(p), 'غير متتبَّع في git (لا يُنشر): ' + u);
    else assert.ok(fs.existsSync(path.join(root, p)), 'مفقود: ' + u);
  }
  // النواة والـwasm من الحزمة نفسها (ffmpeg-core.js المتطابق في المسارين)
  const core = urls.find((u) => /ffmpeg-core\.js$/.test(u)), wasm = urls.find((u) => /\.wasm$/.test(u));
  const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(path.join(root, f))).digest('hex');
  assert.equal(md5(core.slice(1)), md5(path.posix.join(path.posix.dirname(wasm.slice(1)), 'ffmpeg-core.js')), 'ffmpeg-core.js مطابق لنسخة الـwasm');
});
