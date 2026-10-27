'use strict';
// tests/lock-fix-chatvid.test.cjs — v-lock-chatvid (باب المال بموافقة المالك ٢٧ أكتوبر: «صلح الخطير وابدا فيهم كلهم»).
// فيديو المحادثة (js/app-09-attach.js):
//  cli-chat-attach-1 — الاستطلاع كان على متحكّم الدور العامّ: الحارس الصلب (٣٠٠ ث من بدء الدور) وحارس الرجوع (٦٠ ث بعد العودة
//    لدور أقدم من دقيقتين) يقطعانه والاستطلاع يسمح بستّ دقائق، وcatch الداخليّ يبتلع AbortError بلا رسالة: نقاط مخصومة ومهمّة
//    تكتمل عند المزوّد ولا تصل، والكنس يعدّها «مُسلَّمة» فلا يردّ شيئًا.
//  cli-chat-attach-2 — قفل الإرسال (btnSend.disabled وgenAbortController) لا يُضبط إلّا بعد انتظار المصنّف (حتّى ٢٫٥ ث) والنصّ
//    باقٍ في الصندوق، فنقرة ثانية أو Enter تبدأ دورًا ثانيًا بالنصّ نفسه = صورتان وخصمان.
//  cli-chat-attach-5 — إعادة الإنشاء بعد فشل غير نهائيّ قبل سؤال السعر (500 retryable، 502/504) كانت ترسل confirmed:true فيتخطّى
//    الخادم requireConfirmation ويخصم بلا أن يرى المستخدم السعر.
// الكود الحقيقيّ بنصّه في vm (سجلّ الأدوار وحارساه، وكتلتا الفيديو، وpostWithConfirm، وsendPrompt) بساعة مزيّفة وشبكة مزيّفة —
// لا نداء لأيّ مزوّد ولا خصم حقيقيّ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'js/app-09-attach.js'), 'utf8');
const block = (src, head, end) => { const i = src.indexOf(head); assert.ok(i >= 0, 'مفقود: ' + head); const j = src.indexOf(end, i); assert.ok(j > i, 'نهاية مفقودة: ' + head); return src.slice(i, j + end.length); };
const maybe = (head, end) => (SRC.includes(head) ? block(SRC, head, end) : '');

const REGISTRY = (() => { const s = SRC.indexOf('var __OMRAN_WD_HARD_MS'); const e = SRC.indexOf("__swallow(e, 'misc:wd-vis')", s); assert.ok(s > 0 && e > s); return SRC.slice(s, SRC.indexOf('\n', e) + 1); })();
const VIDEO = block(SRC, "    if(__wantsVideo){\n      chatPhase('🎬'", "      cur.lastMsgWasImageEdit = false;\n      renderAll(); saveState();\n      return;\n    }");
const TALK = block(SRC, '    if(__wantsTalkChar){\n', '      cur.lastMsgWasImageEdit = false;\n      renderAll(); saveState();\n      return;\n    }');
const SEND = block(SRC, 'async function sendPrompt(){', '\n}\n');
const HELPERS = [
  block(SRC, 'function omranAttachT(', '\n}\n'),
  block(SRC, 'function __friendlyErr(e){', '\n}\n'),
  block(SRC, 'function omranVideoCodeText(', '\n}\n'),
  block(SRC, 'async function postWithConfirm(url, payload', '\n}\n'),
  block(SRC, 'function omranStopMsg(', '\n}\n'),
  maybe('async function omranChatVidPoll(', '\n}\n'), // الإصلاح (غائب في الأساس)
].join('\n');

const I18N = { stTimeout: '⏱️ انتهت مهلة الردّ.', vidCancelled: 'أُلغي إنشاء الفيديو — لم تُخصم أيّ نقاط.', svcPaused: 'الخدمة متوقّفة مؤقّتًا' };
const VID_URL = 'https://cdn.example/out.mp4';
const TIMEOUT_AR = 'تأخر إنشاء الفيديو، جرّب مرة ثانية.';

// ── ساعة مزيّفة: المؤقّتات لا تعمل إلّا بـadvance، وjump = صفحة مجمّدة (الوقت يمضي ولا شيء يعمل) ──
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
function clock() {
  const c = { now: 1_800_000_000_000, timers: [], seq: 0 };
  c.setTimeout = (fn, ms) => { const id = ++c.seq; c.timers.push({ id, at: c.now + (Number(ms) || 0), fn }); return id; };
  c.clearTimeout = (id) => { c.timers = c.timers.filter((t) => t.id !== id); };
  c.Date = { now: () => c.now };
  c.advance = async (ms) => {
    const end = c.now + ms;
    for (;;) {
      await flush();
      c.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const t = c.timers[0];
      if (!t || t.at > end) break;
      c.timers.shift(); c.now = Math.max(c.now, t.at); t.fn();
    }
    c.now = end; await flush();
  };
  c.jump = (ms) => { c.now += ms; };
  return c;
}
const abortErr = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
// fetch معلّق كالمتصفّح: لا يعود أبدًا، ويُرفض بـAbortError حين تُقطع إشارته (إن وُجدت)
const hang = (init) => new Promise((_, rej) => { const s = init && init.signal; if (s) { if (s.aborted) rej(abortErr()); else s.addEventListener('abort', () => rej(abortErr())); } });
// جسم يُقرأ مرّة كالمتصفّح: postWithConfirm يقرأ عرض السعر (428) فقراءة المتّصل بعده ترمي
const reply = (status, body) => { let used = false; return { ok: status >= 200 && status < 300, status, json: async () => { if (used) throw new TypeError('Body is unusable'); used = true; return body; } }; };
const plain = (v) => JSON.parse(JSON.stringify(v)); // كائنات vm من عالم آخر — deepStrictEqual يقارن النموذج الأوّليّ

/* بيئة فيديو المحادثة: سجلّ الأدوار الحقيقيّ (__omranRunStart وحارساه) + كتلة الفيديو بنصّها + postWithConfirm الحقيقيّ.
   o.create(body, n, init) ردّ /api/video-create (أو veo-create)، o.status(n, init) ردّ الاستطلاع. */
function videoEnv(c, o) {
  const listeners = {};
  const log = { seq: [], bodies: [], polls: 0, confirms: 0 };
  const ctx = {
    state: { currentId: 'A' }, genAbortController: null,
    messagesEl: { appendChild() {} },
    document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: (n, f) => { listeners[n] = f; }, visibilityState: 'visible' },
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, Date: c.Date, AbortController, console,
    __swallow() {}, renderMessages() {}, renderAll() {}, saveState() {}, chatPhase() {},
    lang: 'ar', t: (k) => I18N[k] || k, authGet: () => 'tok', getGuestId: () => 'g-1',
    confirm: () => { log.confirms++; log.seq.push('confirm'); return o.approve !== false; },
    cur: { messages: [] }, thinkingDiv: null,
    text: 'سوّ لي فيديو لصقر يطير فوق البحر وقت الغروب', __wantsVideo: true, __vidSrc: null, __srcImg: null, __animateRe: /(?!)/,
    // الشخصيّة الناطقة: جاهزة من المكتبة (بلا كرتنة مدفوعة) — السعر سُئل قبلها (omranTalkPriceCheck)
    __wantsTalkChar: true, __alreadyCartoon: true, __charImg: { b64: 'iVBORw0KGgo=', mime: 'image/png' },
    omranTalkPriceCheck: async () => true,
    fetch: async (url, init) => {
      const u = String(url);
      if (u === '/api/video-create' || u === '/api/video?action=veo-create') {
        const body = JSON.parse(init.body);
        log.bodies.push(body); log.seq.push('create:' + (body.confirmed === true ? 'confirmed' : 'ask'));
        return o.create(body, log.bodies.length, init);
      }
      if (u.startsWith('/api/video-status?id=') || u.startsWith('/api/video?action=veo-status')) { log.polls++; return o.status(log.polls, init); }
      throw new Error('fetch غير متوقّع: ' + u);
    },
  };
  ctx.window = ctx;
  ctx.askTalkCharOpts = async () => ({ motion: 'moving', duration: 6 });
  vm.createContext(ctx);
  vm.runInContext(REGISTRY + '\n' + HELPERS
    + '\nthis.goVideo = async function(__run, __runCtl){\n' + VIDEO + '\n};'
    + '\nthis.goTalk = async function(__run, __runCtl){ text = "خل الشخصية تتكلم وتقول: هلا والله";\n' + TALK + '\n};', ctx);
  // دور في المحادثة A بمتحكّمه وحارسَيه الحقيقيّين، ثمّ مسار الفيديو داخله
  const ctl = new AbortController();
  const run = ctx.__omranRunStart('A', ctl);
  const t0 = c.now;
  const out = { done: false, err: null };
  const p = (o.talk ? ctx.goTalk : ctx.goVideo)(run, ctl).then(() => { out.done = true; }, (e) => { out.done = true; out.err = e; });
  const last = () => ctx.cur.messages[ctx.cur.messages.length - 1];
  const video = () => { const m = last(); return !!(m && Array.isArray(m.attachments) && m.attachments[0] && m.attachments[0].isVideo && m.attachments[0].url === VID_URL); };
  return { ctx, listeners, log, ctl, run, t0, out, p, last, video };
}
const okCreate = (talk) => () => reply(200, talk ? { op: 'op-veo-1' } : { id: 'rw-1' });
const doneAt = (c, t0, ms) => () => reply(200, c.now - t0 >= ms ? { status: 'SUCCEEDED', output: [VID_URL] } : { status: 'RUNNING' });

// ───────────────────────── cli-chat-attach-1 ─────────────────────────

test('cli-chat-attach-1 أ. فيديو يأخذ ٥ دقائق ونصف: الحارس الصلب (٣٠٠ ث من بدء الدور) لا يقطع الاستطلاع — الفيديو المدفوع يصل', async () => {
  const c = clock();
  let e;
  e = videoEnv(c, { create: okCreate(false), status: (n) => doneAt(c, e.t0, 330_000)() });
  await c.advance(420_000);
  assert.equal(e.out.done, true, 'المسار انتهى');
  assert.equal(e.video(), true, 'رسالة الفيديو لم تصل: ' + JSON.stringify(e.ctx.cur.messages));
  assert.equal(e.ctl.signal.aborted, false, 'الحارس قطع دور الفيديو');
  assert.equal(e.run.timedOut, false);
  assert.equal(e.log.bodies.length, 1, 'إنشاء واحد — لا خصم ثانٍ');
});

test('cli-chat-attach-1 ب. خرج من التطبيق دقيقتين أثناء الاستطلاع ثمّ رجع: حارس الرجوع لا يقطعه — الفيديو يصل', async () => {
  const c = clock();
  let e;
  e = videoEnv(c, { create: okCreate(false), status: () => doneAt(c, e.t0, 240_000)() });
  await c.advance(20_000);           // أُنشئت المهمّة والاستطلاع يعمل
  c.jump(130_000);                   // التطبيق في الخلفيّة (مجمّد) ١٣٠ ث
  e.listeners.visibilitychange();    // رجع: الدور أقدم من دقيقتين ← مهلة سماح ٦٠ ث ثمّ القطع (كان)
  await c.advance(200_000);
  assert.equal(e.video(), true, 'الفيديو ضاع بعد الرجوع: ' + JSON.stringify(e.ctx.cur.messages));
  assert.equal(e.ctl.signal.aborted, false);
  assert.equal(e.log.bodies.length, 1);
});

test('cli-chat-attach-1 ج. عثرة شبكة في استطلاع (Failed to fetch عند الرجوع): يُعاد الاستطلاع، لا «أعد إرسال سؤالك» (= خصم ثانٍ)', async () => {
  const c = clock();
  const e = videoEnv(c, { create: okCreate(false), status: (n) => { if (n === 2) throw new TypeError('Failed to fetch'); return n >= 4 ? reply(200, { status: 'SUCCEEDED', output: [VID_URL] }) : reply(200, { status: 'RUNNING' }); } });
  await c.advance(60_000);
  assert.equal(e.video(), true, 'عثرة واحدة أسقطت الفيديو: ' + JSON.stringify(e.ctx.cur.messages));
  assert.equal(e.log.bodies.length, 1, 'لا إنشاء ثانٍ');
});

test('cli-chat-attach-1 د. استطلاع معلّق (شبكة ميتة لا تردّ): مهلة لكلّ استطلاع ثمّ إعادة — لا يبقى الفيديو رهينة حتّى يقطعه الحارس', async () => {
  const c = clock();
  const e = videoEnv(c, { create: okCreate(false), status: (n, init) => (n === 1 ? hang(init) : reply(200, { status: 'SUCCEEDED', output: [VID_URL] })) });
  await c.advance(90_000);
  assert.equal(e.video(), true, 'الاستطلاع المعلّق لم يُعَد خلال دقيقة ونصف: ' + JSON.stringify(e.ctx.cur.messages));
  assert.ok(e.log.polls >= 2);
});

test('cli-chat-attach-1 هـ. المهلة الكلّيّة (٦ د) بلا نتيجة: سطر صريح ويتوقّف الاستطلاع — لا صمت ولا استطلاع بلا نهاية', async () => {
  const c = clock();
  const e = videoEnv(c, { create: okCreate(false), status: () => reply(200, { status: 'RUNNING' }) });
  await c.advance(7 * 60_000);
  assert.equal(e.out.done, true, 'الحلقة لم تنتهِ');
  const m = e.last();
  assert.ok(m && m.role === 'assistant' && String(m.content).includes(TIMEOUT_AR), 'لا سطر مهلة: ' + JSON.stringify(e.ctx.cur.messages));
  const polls = e.log.polls;
  await c.advance(5 * 60_000);
  assert.equal(e.log.polls, polls, 'استطلاع بعد النهاية');
});

test('cli-chat-attach-1 و. زرّ الإيقاف أثناء الاستطلاع كما كان: يتوقّف بلا رسالة ولا استطلاع بعده', async () => {
  const c = clock();
  const e = videoEnv(c, { create: okCreate(false), status: () => reply(200, { status: 'RUNNING' }) });
  await c.advance(30_000);
  e.ctl.abort(); // btnStop: genAbortController.abort() — run.timedOut يبقى false
  await c.advance(30_000);
  assert.equal(e.out.done, true);
  assert.equal(e.ctx.cur.messages.length, 0, 'الإيقاف يبقى صامتًا كما كان');
  const polls = e.log.polls;
  await c.advance(60_000);
  assert.equal(e.log.polls, polls, 'استطلاع بعد الإيقاف');
});

test('cli-chat-attach-1 ز. قطع الحارس (لا زرّ الإيقاف) قبل قبول المهمّة: سطر المهلة المترجم بدل الصمت', async () => {
  const c = clock();
  const e = videoEnv(c, { create: (b, n, init) => hang(init), status: () => reply(200, { status: 'RUNNING' }) });
  await c.advance(310_000);
  assert.equal(e.run.timedOut, true, 'الإنشاء ما زال تحت الحارس الصلب (لم تُقبل مهمّة بعد)');
  assert.equal(e.out.done, true);
  const m = e.last();
  assert.ok(m && m.content === I18N.stTimeout, 'قطع الحارس بلا رسالة: ' + JSON.stringify(e.ctx.cur.messages));
});

test('cli-chat-attach-1 ح. الشخصيّة الناطقة: الحارس الصلب لا يقطع استطلاعها — الفيديو الناطق المدفوع يصل', async () => {
  const c = clock();
  let e;
  e = videoEnv(c, { talk: true, create: okCreate(true), status: () => doneAt(c, e.t0, 320_000)() });
  await c.advance(420_000);
  assert.equal(e.out.done, true);
  assert.equal(e.video(), true, 'الفيديو الناطق ضاع: ' + JSON.stringify(e.ctx.cur.messages));
  assert.equal(e.ctl.signal.aborted, false);
  assert.equal(e.log.bodies.length, 1);
});

test('cli-chat-attach-1 ي. الحارس يقطع بعد أن قبل المزوّد المهمّة وخصم (ردّ الإنشاء وصل عند ٢٩٨ ث وجسمه بعد الحدّ): الاستطلاع يكمل والفيديو يصل مرّة', async () => {
  const c = clock();
  const e = videoEnv(c, {
    create: () => new Promise((res) => c.setTimeout(() => res({ ok: true, status: 200, json: () => new Promise((r2) => c.setTimeout(() => r2({ id: 'rw-1' }), 3000)) }), 298_000)),
    status: () => reply(200, { status: 'SUCCEEDED', output: [VID_URL] }),
  });
  await c.advance(330_000);
  assert.equal(e.run.timedOut, true, 'الحارس قطع الدور أثناء قراءة ردّ الإنشاء');
  assert.equal(e.video(), true, 'المهمّة المخصومة ضاعت بعد قطع الحارس: ' + JSON.stringify(e.ctx.cur.messages));
  assert.equal(e.ctx.cur.messages.filter((m) => m.attachments).length, 1, 'الفيديو مرّة واحدة');
  assert.equal(e.log.bodies.length, 1, 'لا إنشاء ثانٍ');
});

test('cli-chat-attach-1 ط. ما سوى الفيديو كما كان: دور عاديّ ما زال يقطعه الحارس الصلب عند ٣٠٠ ث', async () => {
  const c = clock();
  const e = videoEnv(c, { create: (b, n, init) => hang(init), status: () => reply(200, { status: 'RUNNING' }) });
  const ctl2 = new AbortController();
  e.ctx.state.currentId = 'B';
  const r2 = e.ctx.__omranRunStart('B', ctl2);
  await c.advance(301_000);
  assert.equal(ctl2.signal.aborted, true);
  assert.equal(r2.timedOut, true);
});

// ───────────────────────── cli-chat-attach-5 ─────────────────────────

const QUOTE = { error: 'confirm_required', cost: 60, message_ar: 'هذه العملية تخصم 60 نقطة (فيديو بالذكاء الاصطناعي).' };
const okPoll = () => reply(200, { status: 'SUCCEEDED', output: [VID_URL] });
// كلّ طلب confirmed:true يسبقه سؤال سعر رآه المستخدم
const confirmedOnlyAfterDialog = (seq) => { let seen = false; for (const s of seq) { if (s === 'confirm') seen = true; if (s === 'create:confirmed' && !seen) return false; } return true; };

test('cli-chat-attach-5 أ. أوّل إنشاء يفشل قبل سؤال السعر (500 retryable): الإعادة بلا confirmed فيسأل الخادم ويرى المستخدم السعر قبل أيّ خصم', async () => {
  const c = clock();
  const e = videoEnv(c, {
    create: (b, n) => (n === 1 ? reply(500, { error: 'تعذّر بدء الفيديو مؤقتًا — أعد المحاولة بعد لحظات.', retryable: true })
      : (b.confirmed === true ? reply(200, { id: 'rw-1' }) : reply(428, QUOTE))),
    status: okPoll,
  });
  await c.advance(60_000);
  assert.notEqual(e.log.bodies[1] && e.log.bodies[1].confirmed, true, 'الإعادة تخطّت سؤال السعر (confirmed:true بلا موافقة)');
  assert.equal(e.log.confirms, 1, 'نافذة السعر مرّة واحدة');
  assert.ok(confirmedOnlyAfterDialog(e.log.seq), 'طلب مؤكَّد قبل أن يرى المستخدم السعر: ' + e.log.seq.join(' → '));
  assert.equal(e.video(), true);
});

test('cli-chat-attach-5 ب. فشل عابر ثمّ يرفض المستخدم السعر: لا طلب مؤكَّد أبدًا (لا خصم)، وسطر «أُلغي»', async () => {
  const c = clock();
  const e = videoEnv(c, {
    approve: false,
    create: (b, n) => (n === 1 ? reply(502, { error: 'bad gateway', retryable: true }) : (b.confirmed === true ? reply(200, { id: 'rw-1' }) : reply(428, QUOTE))),
    status: okPoll,
  });
  await c.advance(60_000);
  assert.ok(!e.log.bodies.some((b) => b.confirmed === true), 'خُصم بلا موافقة: ' + e.log.seq.join(' → '));
  assert.equal(e.log.polls, 0);
  assert.equal(e.last() && e.last().content, I18N.vidCancelled);
});

test('cli-chat-attach-5 ج. وافق المستخدم ثمّ فشل عابر: الإعادة بالموافقة نفسها (نافذة واحدة، v-talkchar-confirm) — ومهمّة واحدة', async () => {
  const c = clock();
  const e = videoEnv(c, {
    create: (b, n) => (b.confirmed !== true ? reply(428, QUOTE) : (n === 2 ? reply(500, { error: 'x', retryable: true }) : reply(200, { id: 'rw-1' }))),
    status: okPoll,
  });
  await c.advance(60_000);
  assert.deepEqual(e.log.seq.slice(0, 4), ['create:ask', 'confirm', 'create:confirmed', 'create:confirmed']);
  assert.equal(e.log.confirms, 1, 'لا نافذة سعر ثانية');
  assert.equal(e.video(), true);
});

test('cli-chat-attach-5 د. postWithConfirm يعلّم الموافقة الفعليّة على الردّ وحده: بلا 428 لا علامة، والرفض لا علامة', async () => {
  const c = clock();
  const e = videoEnv(c, { create: () => reply(200, { id: 'x' }), status: okPoll });
  const ctx = e.ctx;
  const seqs = [[reply(500, { retryable: true })], [reply(428, QUOTE), reply(200, { id: 'y' })]];
  for (const [i, seq] of seqs.entries()) {
    let k = 0;
    ctx.fetch = async () => seq[Math.min(k++, seq.length - 1)];
    const r = await ctx.postWithConfirm('/api/video-create', { promptText: 'p' });
    assert.equal(r.__omApproved === true, i === 1, 'العلامة ' + i);
  }
  const ctx2 = videoEnv(clock(), { approve: false, create: () => reply(200, {}), status: okPoll }).ctx;
  ctx2.fetch = async () => reply(428, QUOTE);
  const r2 = await ctx2.postWithConfirm('/api/video-create', { promptText: 'p' });
  assert.equal(r2.status, 428);
  assert.notEqual(r2.__omApproved, true);
});

// ───────────────────────── cli-chat-attach-2 ─────────────────────────

/* sendPrompt الحقيقيّ + سجلّ الأدوار الحقيقيّ، و__sendPromptCore بديل بشكل الأصل: (v301) ← قراءة النصّ ← انتظار المصنّف قبل أيّ
   قفل ← مسح الصندوق ← __omranRunStart ← الخصم ← الدور. الشكل نفسه مثبّت على الأصل في الاختبار «و». */
function sendEnv(c) {
  const els = { '#prompt': { value: '' }, '#btnSend': { disabled: false, innerHTML: '', classList: { add() {}, remove() {}, contains: () => false, toggle() {} } }, '#btnStop': { classList: { add() {}, remove() {}, contains: () => false, toggle() {} } } };
  const gates = { intent: [], turn: [] };
  const log = { intents: [], charges: [] };
  const projects = [{ id: 'A', messages: [] }, { id: 'B', messages: [] }];
  const ctx = {
    state: { currentId: 'A', projects }, genAbortController: null, messagesEl: { appendChild() {} },
    document: { getElementById: (id) => els['#' + id] || null, querySelectorAll: () => [], addEventListener() {}, visibilityState: 'visible' },
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, Date: c.Date, AbortController, console: { error() {}, warn() {}, log() {} },
    __swallow() {}, renderMessages() {}, renderAll() {}, saveState() {}, alert() {},
    $: (s) => els[s], getCurrent: () => projects.find((p) => p.id === ctx.state.currentId),
    gate: (kind) => new Promise((res) => gates[kind].push(res)), log,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(REGISTRY + '\n' + SEND + `
async function __sendPromptCore(){
  const __sb = $('#btnSend');
  if(__sb && __sb.disabled){ if(genAbortController) return; __sb.disabled = false; }
  const text = $('#prompt').value.trim();
  if(!text) return;
  if(text === 'boom') throw new Error('boom');
  log.intents.push(text);
  await gate('intent');                 // await omranMediaIntent(text) — حتّى ٢٫٥ ث والنصّ في الصندوق
  const cur = getCurrent();
  $('#prompt').value = '';
  __sb.disabled = true;
  const __runCtl = new AbortController();
  const __run = __omranRunStart(cur.id, __runCtl);
  log.charges.push({ chat: cur.id, text: text }); // /api/maha-image يخصم بـspendPoints لكلّ طلب
  try{ await gate('turn'); } finally { __omranRunEnd(__run); __sb.disabled = false; }
}`, ctx);
  const type = (s) => { els['#prompt'].value = s; };
  const open = (n) => gates.intent.splice(0).slice(0, n || 99).forEach((r) => r()); // يردّ المصنّف
  const finish = () => gates.turn.splice(0).forEach((r) => r());
  return { ctx, els, log, type, open, finish, gates };
}

test('cli-chat-attach-2 أ. نقرة مزدوجة (أو Enter) أثناء انتظار المصنّف: دور واحد وخصم واحد لا اثنان', async () => {
  const c = clock();
  const s = sendEnv(c);
  s.type('ابي صورة قطة على البحر');
  const p1 = s.ctx.sendPrompt(); await flush();
  const p2 = s.ctx.sendPrompt(); await flush(); // بعد ١٥٠ م.ث: النصّ ما زال في الصندوق والزرّ مفعّل
  assert.equal(s.els['#prompt'].value, 'ابي صورة قطة على البحر', 'شكل الأصل: النصّ باقٍ أثناء الانتظار');
  s.open(); await flush(); s.finish(); await flush(); await p1; await p2;
  assert.equal(s.log.intents.length, 1, 'المصنّف نودي مرّتين');
  assert.deepEqual(plain(s.log.charges), [{ chat: 'A', text: 'ابي صورة قطة على البحر' }], 'خصمان لطلب واحد');
});

test('cli-chat-attach-2 ب. العلَم لكلّ محادثة: إرسال في محادثة ثانية أثناء انتظار الأولى يمرّ (v-parallel-chats)', async () => {
  const c = clock();
  const s = sendEnv(c);
  s.type('ابي صورة قطة'); const p1 = s.ctx.sendPrompt(); await flush();
  s.ctx.state.currentId = 'B'; s.type('ابي صورة صقر'); const p2 = s.ctx.sendPrompt(); await flush();
  s.ctx.state.currentId = 'A'; s.type('ابي صورة قطة'); const p3 = s.ctx.sendPrompt(); await flush(); // مكرّرة في A
  s.open(); await flush(); s.finish(); await flush(); await Promise.all([p1, p2, p3]);
  assert.deepEqual(s.log.charges.map((x) => x.text).sort(), ['ابي صورة صقر', 'ابي صورة قطة']);
});

test('cli-chat-attach-2 ج. العلَم يُفكّ حين يأخذ قفل الدور مكانه: دور معلّق قطعه الحارس لا يقفل المحادثة إلى الأبد', async () => {
  const c = clock();
  const s = sendEnv(c);
  s.type('ابي صورة قطة'); s.ctx.sendPrompt(); await flush();
  s.open(); await flush();                  // بدأ الدور (القفل لـ__omranRuns) ولن ينتهي (وعد معلّق، v583)
  assert.equal(s.log.charges.length, 1);
  await c.advance(310_000);                 // الحارس الصلب ٣٠٠ ث ثمّ «ضمان أخير» ٦ ث يفكّ قفل المحادثة
  s.els['#btnSend'].disabled = false;       // __omranRestoreSendBtn (document.getElementById بلا زرّ في هذه البيئة)
  s.type('ابي صورة صقر'); const p = s.ctx.sendPrompt(); await flush();
  assert.equal(s.log.intents.length, 2, 'المحادثة بقيت مقفلة بعد قطع الحارس');
  s.open(); await flush(); s.finish(); await flush(); await p;
  assert.equal(s.log.charges.length, 2);
});

test('cli-chat-attach-2 د. الرجوع المبكّر والرمي يفكّان العلَم فورًا، وانتظار معلّق قبل القفل لا يقفل المحادثة أكثر من دقيقة', async () => {
  const c = clock();
  const s = sendEnv(c);
  s.type(''); await s.ctx.sendPrompt();                   // رجوع مبكّر (لا نصّ)
  s.type('boom'); await s.ctx.sendPrompt();               // رمي قبل القفل — يلتقطه غلاف sendPrompt
  s.type('ابي صورة قطة'); const p1 = s.ctx.sendPrompt(); await flush();
  assert.equal(s.log.intents.length, 1, 'العلَم بقي بعد رجوع مبكّر أو رمي');
  // المصنّف لا يردّ أبدًا (شبكة معلّقة): نقرة بعد ثوانٍ مرفوضة، وبعد دقيقة تمرّ
  await c.advance(5_000); const p2 = s.ctx.sendPrompt(); await flush();
  assert.equal(s.log.intents.length, 1, 'نقرة ثانية أثناء الانتظار مرّت');
  await c.advance(60_000); const p3 = s.ctx.sendPrompt(); await flush();
  assert.equal(s.log.intents.length, 2, 'انتظار معلّق أقفل المحادثة أكثر من دقيقة');
  s.open(); await flush(); s.finish(); await flush(); await Promise.all([p1, p2, p3]);
});

test('cli-chat-attach-2 هـ. الأصل نفسه: sendPrompt يرفع العلَم قبل أوّل انتظار، و__omranRunStart يفكّه لمحادثته', () => {
  const firstAwait = SEND.indexOf('await ');
  const flag = SEND.search(/__omranSendPending\[[^\]]+\]\s*=/);
  assert.ok(flag > 0 && flag < firstAwait, 'العلَم بعد أوّل انتظار في sendPrompt (أو غائب)');
  const start = block(SRC, 'function __omranRunStart(pid, ctl){', '\n}\n');
  assert.match(start, /delete __omranSendPending\[r\.pid\]/, 'بدء الدور لا يفكّ علَم الإرسال');
});

test('cli-chat-attach-2 و. شكل الأصل الذي يقوم عليه البديل: انتظار المصنّف قبل مسح الصندوق وقبل __omranRunStart في __sendPromptCore', () => {
  const s = SRC.indexOf('async function __sendPromptCore(){');
  const core = SRC.slice(s, SRC.indexOf('\nlocalStorage.removeItem(\'autoSpeakReplies\');', s));
  const intent = core.indexOf('await omranMediaIntent(text)');
  const clear = core.indexOf("  promptEl.value = '';\n");
  const runStart = core.indexOf('const __run = __omranRunStart(cur.id, __runCtl);');
  assert.ok(intent > 0 && clear > intent && runStart > clear, 'تغيّر ترتيب الأصل — حدّث البديل');
  assert.ok(core.indexOf("if(typeof genAbortController !== 'undefined' && genAbortController) return;") < intent, 'قفل v301 قبل الانتظار');
});
