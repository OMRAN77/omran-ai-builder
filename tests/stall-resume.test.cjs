// tests/stall-resume.test.cjs — v-stall-resume (لقطة المالك ١٢ أكتوبر ١٠:٠٠، Opus 5.5: «تقدر تسويه كلهم» ← «⚠️ ما قدرت أردّ
// الحين — ما وصل شي من الخادم»، والخادم في اللحظة نفسها أنجز المهمّة وفتح طلب السحب #1012 الساعة 17:58). الجوّال يجمّد التطبيق في
// الخلفيّة (تبديل تطبيق، لقطة شاشة)؛ مؤقّت الصمت (٩٠ ث) الذي حلّ موعده أثناء التجميد يطلق فور الرجوع قبل أن تُقرأ البايتات المنتظرة
// في المقبس، فيُسمّى ردٌّ حيٌّ «ما وصل شي». وحارس الرجوع (طلب أقدم من دقيقتين) يقطع بعد ٦٠ ث ولو كان البثّ يتدفّق.
// هنا: callChatWithTools الحقيقيّ وسجلّ الطلبات الحقيقيّ في vm بساعة ومؤقّتات وهميّة ومقبس نتحكّم بتوقيته.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function clock() {
  const c = { now: 1_000_000, timers: new Map(), seq: 0 };
  c.setTimeout = (f, ms) => { const id = ++c.seq; c.timers.set(id, { f, at: c.now + (Number(ms) || 0) }); return id; };
  c.clearTimeout = (id) => { c.timers.delete(id); };
  // كما يفعل المتصفّح عند الرجوع من التجميد: كلّ مؤقّت حلّ موعده يطلق مرّة واحدة بترتيبه
  c.runDue = () => { const due = [...c.timers.entries()].filter(([, t]) => t.at <= c.now).sort((a, b) => a[1].at - b[1].at); for (const [id, t] of due) { c.timers.delete(id); t.f(); } };
  c.Date = class extends Date { static now() { return c.now; } };
  return c;
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const enc = new TextEncoder();
function socket() {
  const q = [];
  const s = { reads: 0, cancelled: false };
  s.reader = { read: () => { s.reads++; return new Promise((resolve, reject) => q.push({ resolve, reject })); }, cancel: () => { s.cancelled = true; return Promise.resolve(); } };
  s.push = (text) => { const d = q.shift(); assert.ok(d, 'قراءة منتظرة'); d.resolve({ done: false, value: enc.encode(text) }); };
  s.end = () => { const d = q.shift(); assert.ok(d, 'قراءة منتظرة'); d.resolve({ done: true, value: undefined }); };
  return s;
}

const app18 = read('js/app-18-chat-tools.js');
const app18Core = app18.slice(0, app18.indexOf('// v478:'));
function startClient(c, opts) {
  const sock = socket();
  let headers;
  const headersP = new Promise((r) => { headers = r; });
  const ctx = {
    window: { authGet: () => 'tok', claudeModelGet: () => '' },
    document: { visibilityState: 'visible' },
    fetch: async () => { await headersP; return { ok: true, status: 200, body: { getReader: () => sock.reader } }; },
    TextDecoder, Promise, Error, String, JSON, Date: c.Date, Array, Math, console, Intl, Object, Number, RegExp,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
  };
  vm.runInNewContext(app18Core, ctx);
  const ac = new AbortController();
  const onDelta = () => {}; onDelta.__signal = ac.signal;
  const out = { done: false };
  out.p = ctx.window.callChatWithTools([{ role: 'user', content: 'تقدر تسويه كلهم' }], onDelta, 'claude')
    .then((r) => { out.done = true; out.reply = r.reply; }, (e) => { out.done = true; out.error = e.message; });
  if (!(opts && opts.holdHeaders)) headers();
  return { ctx, sock, out, headers, signal: ac.signal };
}
// ساعة تتقدّم ثانية ثانية والصفحة ظاهرة (المؤقّتات تطلق في وقتها)
async function visibleSeconds(c, n) { for (let i = 0; i < n; i++) { c.now += 1000; c.runDue(); await flush(); } }

test('١. تجميد ٣ دقائق في الخلفيّة والخادم حيّ: الرجوع يقرأ ما انتظر في المقبس — لا «ما وصل شي»', async () => {
  const c = clock();
  const { ctx, sock, out, signal } = startClient(c);
  await flush();
  sock.push(': ka\n\n'); await flush();               // نبض الخادم قبل الخروج من التطبيق
  ctx.document.visibilityState = 'hidden';
  c.now += 180_000;                                   // التطبيق مجمّد: لا مؤقّت ولا قراءة
  ctx.document.visibilityState = 'visible';
  c.runDue(); await flush();                          // عند الرجوع: المؤقّتات التي حلّ موعدها تطلق أوّلًا
  assert.equal(out.done, false, 'لم يستسلم عند الرجوع: ' + (out.error || ''));
  assert.equal(sock.cancelled, false, 'المقبس لم يُغلق');
  sock.push('data: {"delta":"تمّ — فتحت طلب السحب"}\n\n'); await flush();
  assert.ok(signal.__omLastByte >= c.now - 1000, 'آخر بايت يُعلَّم على إشارة الطلب (لحارس الرجوع)');
  sock.end(); await out.p;
  assert.equal(out.error, undefined);
  assert.equal(out.reply, 'تمّ — فتحت طلب السحب');
});

test('٢. صمت حقيقيّ والصفحة ظاهرة: يستسلم بعد ٩٠ ث كما كان (درس #527)', async () => {
  const c = clock();
  const { sock, out } = startClient(c);
  await flush(); sock.push(': ka\n\n'); await flush();
  await visibleSeconds(c, 85);
  assert.equal(out.done, false, '٨٥ ث ظاهرة ما زالت داخل المهلة');
  await visibleSeconds(c, 6);
  await out.p;
  assert.match(out.error || '', /stalled/, 'صمت ظاهر ٩٠ ث = تعثّر');
  assert.equal(sock.cancelled, true);
});

test('٣. انتظار الترويسة أثناء التجميد لا يُحسب؛ وصمت الترويسة الظاهر ٩٠ ث يبقى __chat_no_headers__', async () => {
  let c = clock();
  let s = startClient(c, { holdHeaders: true });
  await flush();
  s.ctx.document.visibilityState = 'hidden'; c.now += 150_000; s.ctx.document.visibilityState = 'visible'; c.runDue(); await flush();
  assert.equal(s.out.done, false, 'لم يستسلم عند الرجوع: ' + (s.out.error || ''));
  s.headers(); await flush();
  s.sock.push('data: {"delta":"هلا"}\n\n'); await flush(); s.sock.end(); await s.out.p;
  assert.equal(s.out.reply, 'هلا');
  c = clock();
  s = startClient(c, { holdHeaders: true });
  await flush(); await visibleSeconds(c, 91); await s.out.p;
  assert.equal(s.out.error, '__chat_no_headers__');
});

// ── حارس الرجوع في سجلّ الطلبات (app-09) ──
const a9 = read('js/app-09-attach.js');
function loadRegistry(c) {
  const start = a9.indexOf('var __OMRAN_WD_HARD_MS');
  const end = a9.indexOf("__swallow(e, 'misc:wd-vis')", start);
  const src = a9.slice(start, a9.indexOf('\n', end) + 1);
  const listeners = {};
  const ctx = {
    state: { currentId: 'A' }, genAbortController: null,
    messagesEl: { appendChild() {} },
    document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: (n, f) => { listeners[n] = f; }, visibilityState: 'visible' },
    window: {}, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, AbortController, Date: c.Date, Object, String,
    __swallow: (e) => { throw e; }, renderMessages() {}, renderAll() {},
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { ctx, listeners };
}

test('٤. الرجوع بعد دقيقتين والبثّ يتدفّق: حارس الرجوع لا يقطع ما دامت البايتات تصل؛ وبلا بايت يقطع كما كان', async () => {
  const c = clock();
  const { ctx, listeners } = loadRegistry(c);
  const ctl = new AbortController();
  const r = vm.runInContext('__omranRunStart', ctx)('A', ctl);
  c.now += 150_000;                                  // ردّ طويل والمالك خارج التطبيق
  listeners.visibilitychange();                      // رجع: الطلب «قديم» ← مهلة سماح ٦٠ ث
  c.now += 60_000; ctl.signal.__omLastByte = c.now - 2000;
  c.runDue();
  assert.equal(ctl.signal.aborted, false, 'البثّ حيّ (بايت قبل ثانيتين) — لا قطع');
  assert.equal(r.timedOut, false);
  c.now += 60_000; c.runDue();                       // ثمّ صمت دقيقة كاملة بعد الرجوع
  assert.equal(ctl.signal.aborted, true, 'بلا بايت طوال مهلة السماح ← يقطع');
  assert.equal(r.timedOut, true);
  // طلب بلا أيّ بايت (معلّق فعلًا) ← يقطع بعد مهلة السماح كما كان (v586)
  const ctl2 = new AbortController();
  const r2 = vm.runInContext('__omranRunStart', ctx)('B', ctl2);
  c.now += 150_000; listeners.visibilitychange(); c.now += 60_000; c.runDue();
  assert.equal(ctl2.signal.aborted, true); assert.equal(r2.timedOut, true);
});
