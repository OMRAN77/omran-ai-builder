'use strict';
/* v-lock-maha — باب المال بموافقة المالك (٢٧ أكتوبر «صلح الخطير وابدا فيهم كلهم»): فوترة مكالمة مها.
   cli-voice-1  إعادة الاتّصال الفاشلة كانت تترك مكالمة ميتة (العدّاد يخصم كلّ دقيقة والمايك مفتوح)، والناجحة تدفع دقيقة افتتاح
                فوق الدقيقة الجارية وتصفّر عدّاد حدّ المكالمة فيُتجاوز حدّ المشترك.
   cli-voice-2  المسار الأساسيّ كان يولّد صورة مدفوعة (٢٠ نقطة) من مطابقة جزء كلمة («الرسمي»، «بصورة»، «وغيرها»، «withdraw»).
   cli-voice-3  إنهاء المكالمة أثناء «أجهّز الجلسة» كان يخصم دقيقة الافتتاح أو يحرق التجربة بلا مكالمة.
   العميل: js/app-08-maha.js كاملًا في vm بساعة ومؤقّتات مزيّفة وDOM مزيّف. الخادم: api/_lib/realtime-session.js الحقيقيّ بتخزين
   ومزوّد مزيّفين — لا شبكة ولا مفتاح ولا إنفاق. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodeCrypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const MAHA_SRC = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');
const flush = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const PAID = { unlimited: false, points: 85, trial: false, prepaid: 'points', cost: 15, mahaMin: 0, capMin: 0 };

/* ───────── عالم العميل: app-08-maha.js كاملًا ───────── */
function world(o = {}) {
  const clock = { now: 1700000000000 };
  let seq = 0;
  const timers = new Map();
  const addTimer = (fn, ms, every) => { const id = ++seq; timers.set(id, { at: clock.now + Math.max(0, Number(ms) || 0), fn, every: every ? Math.max(1, Number(ms) || 0) : 0 }); return id; };
  const clearTimer = (id) => { timers.delete(id); };
  const errors = [];
  async function advance(ms) {
    const end = clock.now + ms;
    for (;;) {
      await flush();
      let best = null;
      for (const [id, tm] of timers) if (tm.at <= end && (!best || tm.at < best[1].at || (tm.at === best[1].at && id < best[0]))) best = [id, tm];
      if (!best) break;
      const [id, tm] = best;
      clock.now = Math.max(clock.now, tm.at);
      if (tm.every) tm.at += tm.every; else timers.delete(id);
      try { const r = tm.fn(); if (r && typeof r.catch === 'function') r.catch((e) => errors.push(e)); } catch (e) { errors.push(e); }
    }
    clock.now = end;
    await flush();
  }

  const cl = () => { const s = new Set(); return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c), toggle: (c, on) => { if (on === undefined ? !s.has(c) : on) s.add(c); else s.delete(c); } }; };
  const mkEl = (id, tag) => ({
    id: id || '', tagName: tag || 'div', style: {}, textContent: '', className: '', title: '', attrs: {}, classList: cl(),
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest(sel) { return String(sel).split(',').map((x) => x.trim()).includes('#' + this.id) ? this : null; },
    play() { return Promise.resolve(); }, pause() {},
  });
  const EXIST = new Set(['mahaPointsMeter', 'mahaPointsMeterValue', 'btnMahaDock']);
  const els = {};
  const byId = (id) => (EXIST.has(id) ? (els[id] = els[id] || mkEl(id)) : null);
  const clickL = [];
  const reqs = [], toasts = [], plans = [], pcs = [], streams = [];

  class FakeDC {
    constructor() { this.readyState = 'connecting'; this.l = {}; this.sent = []; }
    addEventListener(t, fn) { (this.l[t] = this.l[t] || []).push(fn); }
    fire(t, ev) { (this.l[t] || []).slice().forEach((f) => f(ev)); }
    send(x) { if (this.readyState !== 'open') throw new Error('dc not open'); this.sent.push(x); }
    close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.fire('close', {}); }
    open() { this.readyState = 'open'; this.fire('open', {}); }
    msg(obj) { this.fire('message', { data: JSON.stringify(obj) }); }
  }
  class FakePC {
    constructor() { this.connectionState = 'new'; this.l = {}; this.closed = false; this.n = pcs.push(this); }
    addEventListener(t, fn) { (this.l[t] = this.l[t] || []).push(fn); }
    addTrack() {}
    createDataChannel() { this.dc = new FakeDC(); return this.dc; }
    async createOffer() { return { sdp: 'offer-' + this.n }; }
    async setLocalDescription() {}
    async setRemoteDescription() {
      if (o.connect === false || (o.connectFor && !o.connectFor(this.n))) return; // لا اتّصال: تنتهي مهلة ١٠ث
      addTimer(() => { if (this.closed) return; this.setState('connected'); this.dc.open(); this.dc.msg({ type: 'session.created' }); }, 50);
    }
    setState(s) { this.connectionState = s; (this.l.connectionstatechange || []).slice().forEach((f) => f()); }
    close() { this.closed = true; this.connectionState = 'closed'; }
  }
  let mintN = 0, sdpN = 0;
  const route = async (url, init) => {
    let body = null;
    try { body = init && typeof init.body === 'string' && String(url).startsWith('/api') ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    const r = { url: String(url), body, at: clock.now };
    reqs.push(r);
    if (url === '/api/realtime-session') {
      if (body && body.action === 'cancel') return res(200, { ok: true, cancelled: true });
      const n = ++mintN;
      return o.mint ? o.mint(n, body) : res(200, { clientSecret: 'ek' + n, mahaBudget: Object.assign({}, PAID), turn: 'natural' });
    }
    if (String(url).startsWith('https://api.openai.com/v1/realtime/calls')) { const n = ++sdpN; return o.sdp ? o.sdp(n) : res(200, 'answer-sdp'); }
    if (url === '/api/points') {
      if (body && body.action === 'consume') return res(200, o.consume ? o.consume(body) : { ok: true, points: 70 });
      return res(200, { ok: true });
    }
    if (url === '/api/stt') return res(200, o.stt ? o.stt() : { text: 'hello', language: 'en' });
    if (url === '/api/maha-image') return res(200, { imageBase64: 'QUFB', mimeType: 'image/png', hold: '' });
    return res(404, {});
  };
  const store = new Map([['introTourDone', '1'], ['aiapp_voice_gender', 'female'], ['aiapp_lang', 'en']]);
  class VDate extends Date { constructor(...a) { if (a.length) super(...a); else super(clock.now); } static now() { return clock.now; } }
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms) => addTimer(fn, ms, false), clearTimeout: clearTimer,
    setInterval: (fn, ms) => addTimer(fn, ms, true), clearInterval: clearTimer,
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    Date: VDate, performance: { now: () => clock.now - 1700000000000 },
    Promise, JSON, Math, Object, Array, String, Number, Boolean, Error, RegExp, Map, Set, Intl, Uint8Array, Int16Array, Float32Array, AbortSignal, AbortController, URL, Blob,
    crypto: { randomUUID: () => nodeCrypto.randomUUID() },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: {
      getElementById: byId, createElement: (tag) => mkEl('', tag), querySelector: () => null, querySelectorAll: () => [],
      addEventListener: (t, fn) => { if (t === 'click') clickL.push(fn); }, removeEventListener: (t, fn) => { const i = clickL.indexOf(fn); if (i >= 0) clickL.splice(i, 1); },
      documentElement: mkEl('html'), body: mkEl('body'), readyState: 'complete', visibilityState: 'visible',
    },
    navigator: {
      permissions: { query: async () => ({ state: 'granted' }) },
      mediaDevices: { getUserMedia: async () => { const tr = { enabled: true, stopped: false, stop() { this.stopped = true; }, clone() { return Object.assign({}, this); } }; const s = { tr, getAudioTracks: () => [tr], getTracks: () => [tr] }; streams.push(s); return s; } },
    },
    RTCPeerConnection: FakePC, Audio: function () { return mkEl('', 'audio'); }, MediaStream: function () {}, MediaRecorder: function () {},
    fetch: (url, init) => route(url, init),
    t: (k) => k, lang: 'en', __swallow() {}, alert() {}, confirm: () => false,
    authGet: (k) => (k === 'aiapp_auth_token' ? (o.token === undefined ? 'tok' : o.token) : null),
    postWithConfirm() {}, stopAllSpeaking() {}, mahaAppHello: () => ({ lang: 'en', tools: [] }),
    settingsToast: (m) => toasts.push(m), voiceTr: (k, en) => en, voiceSttErrorText: () => 'stt-error',
    omranOpenPlans: (...a) => plans.push(a), requireLogin: (...a) => plans.push(['login'].concat(a)),
    blobToBase64: async () => 'eA==', callProviderAI: async () => 'a reply', AUTO_FALLBACK_ORDER: ['groq'], mahaAppBrief: () => '',
    getCurrent: () => null, state: { projects: [], currentId: null }, saveState() {}, renderAll() {},
  };
  ctx.window = ctx;
  ctx.getGuestId = () => 'g1';
  vm.createContext(ctx);
  vm.runInContext(MAHA_SRC, ctx, { filename: 'app-08-maha.js' });
  const v = (expr) => vm.runInContext(expr, ctx);
  // المستخدم يتكلّم بين حين وآخر — وإلّا تُنهي مهلة السكوت (٢٠ث، v-maha-band) كلّ مكالمة قبل ما يُختبر
  if (!o.quiet) addTimer(() => { try { v('mahaLastActivity = Date.now()'); } catch (e) { errors.push(e); } }, 5000, true);
  const tap = (target) => { const ev = { target: target || mkEl('chatArea'), prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} }; clickL.slice().forEach((f) => f(ev)); return ev; };
  const mints = () => reqs.filter((r) => r.url === '/api/realtime-session' && !(r.body && r.body.action === 'cancel'));
  const cancels = () => reqs.filter((r) => r.url === '/api/realtime-session' && r.body && r.body.action === 'cancel');
  const consumes = () => reqs.filter((r) => r.url === '/api/points' && r.body && r.body.action === 'consume');
  return { ctx, v, advance, tap, els, byId, reqs, mints, cancels, consumes, toasts, plans, pcs, streams, errors, clock, timers,
    pc: () => pcs[pcs.length - 1], micLive: () => streams.filter((s) => !s.tr.stopped).length };
}
// مكالمة فائقة جاهزة: البدء ← الجلسة ← المايك ← الاتّصال ← الجاهزيّة
async function liveCall(w) {
  const p = w.v('mahaStartCall()');
  let done = false;
  p.then(() => { done = true; }, () => { done = true; });
  await w.advance(2000);
  if (!done) await w.advance(13000); // سباق الإعداد ١٢ث يحسمها — لا انتظار حقيقيّ معلّق
  await p;
  assert.equal(w.v('mahaCallActive'), true, 'المكالمة قائمة');
  assert.equal(w.v('mahaRtReady'), true, 'الفائق جاهز');
  return p;
}
const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };

/* ═════════════ cli-voice-1: إعادة الاتّصال ═════════════ */
test('cli-voice-1 أ. فشل تبادل SDP في إعادة الاتّصال (الجلسة نجحت) ← تنتهي المكالمة: لا خصم بعدها، المايك مطفأ، الاتّصال مغلق', async () => {
  const w = world({ sdp: (n) => (n === 1 ? res(200, 'answer') : res(500, 'boom')) });
  await liveCall(w);
  await w.advance(20000);
  w.pc().setState('failed'); // انقطاع الشبكة في مصعد
  await w.advance(3000);
  const failedAt = w.clock.now;
  await w.advance(5 * 60000);
  assert.equal(w.v('mahaCallActive'), false, 'المكالمة الميتة انتهت — كانت تبقى active=true');
  assert.equal(w.consumes().filter((r) => r.at >= failedAt).length, 0, 'لا دقيقة تُخصم بلا جلسة — كانت ١٥ نقطة كلّ دقيقة حتّى ينفد الرصيد');
  assert.equal(w.v('mahaPointsTimer'), null, 'مؤقّت الخصم موقوف');
  assert.equal(w.micLive(), 0, 'كلّ مسارات المايك موقوفة — كان مؤشّر التسجيل يبقى مضاءً');
  assert.ok(w.pcs.every((pc) => pc.closed), 'كلّ اتّصالات WebRTC مغلقة');
  assert.ok(w.toasts.includes('mahaConnectionLost'), 'يعرف لماذا انتهت (mahaConnectionLost القائم بالـ١٤ لغة)');
});

test('cli-voice-1 ب. فشل طلب الجلسة نفسه في إعادة الاتّصال (الشبكة ما زالت مقطوعة) ← تنتهي المكالمة ولا خصم بعدها', async () => {
  const w = world({ mint: (n) => (n === 1 ? res(200, { clientSecret: 'ek1', mahaBudget: Object.assign({}, PAID), turn: 'natural' }) : Promise.reject(new TypeError('Failed to fetch'))) });
  await liveCall(w);
  await w.advance(15000);
  w.pc().setState('disconnected');
  await w.advance(1600); // مهلة الانقطاع العابر ١٫٥ث ثمّ إعادة الاتّصال
  const failedAt = w.clock.now;
  await w.advance(5 * 60000);
  assert.equal(w.v('mahaCallActive'), false);
  assert.equal(w.consumes().filter((r) => r.at >= failedAt).length, 0);
  assert.equal(w.micLive(), 0);
});

test('cli-voice-1 ج. إعادة اتّصال معلّقة (طلب الجلسة لا يعود) ← بعد ١٢ث تنتهي المكالمة ويُلغى الطلب المعلّق، ولا دقيقة تُخصم أثناءها', async () => {
  const hang = deferred();
  const w = world({ mint: (n) => (n === 1 ? res(200, { clientSecret: 'ek1', mahaBudget: Object.assign({}, PAID), turn: 'natural' }) : hang.p) });
  await liveCall(w);
  await w.advance(50000);
  w.pc().setState('failed');
  await w.advance(13000);
  assert.equal(w.v('mahaCallActive'), false, 'كانت معلّقة للأبد بالحالة thinking والعدّاد يخصم');
  const second = w.mints()[1];
  assert.ok(second && second.body.openId, 'طلب إعادة الاتّصال يحمل معرّف فتح');
  assert.deepEqual(w.cancels().map((r) => r.body.openId), [second.body.openId], 'والإلغاء له هو — يردّ الخادم الخصم إن لم يسلّم المفتاح');
  await w.advance(5 * 60000);
  assert.equal(w.consumes().length, 0, 'لا خصم للدقيقة التي بدأت والاتّصال يُعاد — كان يخصمها');
  hang.resolve(res(200, { clientSecret: 'late', mahaBudget: Object.assign({}, PAID), turn: 'natural' }));
  await w.advance(5 * 60000);
  assert.equal(w.consumes().length, 0, 'ولا عدّاد بعد وصول ردّ متأخّر');
  assert.equal(w.v('mahaPointsTimer'), null);
});

test('cli-voice-1 د. إعادة الاتّصال الناجحة لا تدفع دقيقة فوق الجارية: عدد الدقائق المدفوعة كما بلا انقطاع', async () => {
  const charges = (w) => w.mints().length + w.consumes().length; // كلّ طلب جلسة ناجح يدفع دقيقة افتتاح في الخادم
  const base = world();
  const t0 = base.clock.now;
  await liveCall(base);
  await base.advance(t0 + 299000 - base.clock.now);
  const rc = world();
  await liveCall(rc);
  await rc.advance(t0 + 90000 - rc.clock.now);
  rc.pc().setState('failed');
  await rc.advance(t0 + 299000 - rc.clock.now);
  assert.equal(rc.v('mahaCallActive'), true, 'المكالمة رجعت');
  assert.equal(rc.mints().length, 2);
  assert.equal(charges(rc), charges(base), 'كانت دقيقة زائدة في كلّ إعادة اتّصال (الافتتاح الثاني فوق الدقيقة المدفوعة)');
  assert.equal(rc.v('mahaPointsTimer') !== null, true, 'العدّاد مستمرّ بعد الرجوع');
});

test('cli-voice-1 هـ. مشترك مها بحدّ ٣ دقائق: إعادة الاتّصال لا تصفّر عدّاد الحدّ — المدفوع لا يتجاوز الحدّ', async () => {
  const MEDIA = { unlimited: false, points: 70, trial: false, prepaid: 'media', cost: 15, mahaMin: 5, capMin: 3 };
  const w = world({ mint: () => res(200, { clientSecret: 'ek', mahaBudget: Object.assign({}, MEDIA), turn: 'natural' }), consume: () => ({ ok: true, media: 'maha', mediaLeft: 55 * 3 }) });
  const t0 = w.clock.now;
  await liveCall(w);
  await w.advance(t0 + 90000 - w.clock.now);
  w.pc().setState('failed');
  await w.advance(t0 + 400000 - w.clock.now);
  const paid = w.mints().length + w.consumes().length;
  assert.ok(paid <= 3, 'دقائق مدفوعة ' + paid + ' فوق الحدّ ٣ — كان العدّاد يُصفَّر فتُدفع ٥');
  assert.equal(w.v('mahaCallActive'), false, 'انتهت عند الحدّ');
  assert.ok(w.toasts.includes('mahaCapEnd'));
});

test('cli-voice-1 و. انقطاع في آخر دقيقة من الحدّ ← تنتهي المكالمة بحدّها ولا تُدفع دقيقة افتتاح بعده', async () => {
  const MEDIA = { unlimited: false, points: 70, trial: false, prepaid: 'media', cost: 15, mahaMin: 5, capMin: 2 };
  const w = world({ mint: () => res(200, { clientSecret: 'ek', mahaBudget: Object.assign({}, MEDIA), turn: 'natural' }), consume: () => ({ ok: true, media: 'maha', mediaLeft: 55 * 3 }) });
  const t0 = w.clock.now;
  await liveCall(w);
  await w.advance(t0 + 90000 - w.clock.now); // الدقيقة الثانية (الأخيرة) جارية
  w.pc().setState('failed');
  await w.advance(5000);
  assert.equal(w.mints().length, 1, 'لا طلب جلسة يدفع دقيقة ثالثة');
  assert.equal(w.v('mahaCallActive'), false);
  assert.ok(w.toasts.includes('mahaCapEnd'));
});

test('cli-voice-1 ز. العدّاد مربوط بجلسة حيّة: قناة الجلسة أُغلقت والاتّصال باقٍ ← لا خصم، والمكالمة الميتة تنتهي', async () => {
  const w = world();
  await liveCall(w);
  await w.advance(30000);
  w.pc().dc.close(); // المزوّد أنهى الجلسة
  await w.advance(4 * 60000);
  assert.equal(w.consumes().length, 0, 'كان يخصم كلّ دقيقة بلا جلسة');
  assert.equal(w.v('mahaCallActive'), false);
});

test('cli-voice-1 ح. (حارس) المسار الأساسيّ بعد جلسة مدفوعة فشل اتّصالها يُحسب كما كان، والفائق السليم يُحسب كلّ دقيقة', async () => {
  const w = world({ sdp: () => res(500, 'down') });
  w.ctx.mahaRecordUntilSilence = () => new Promise(() => {}); // الحلقة الأساسيّة تنتظر الكلام
  const p = w.v('mahaStartCall()');
  await w.advance(3000);
  await p;
  assert.equal(w.v('mahaCallActive'), true);
  await w.advance(130000);
  assert.equal(w.consumes().length, 2, 'الحلقة الأساسيّة حيّة — العدّاد كما كان');
  const ok = world();
  await liveCall(ok);
  await ok.advance(185000);
  assert.equal(ok.consumes().length, 3, 'مكالمة سليمة: دقيقة كلّ ٦٠ث');
});

test('cli-voice-1 ط. (حارس) إنهاء المكالمة أثناء إعادة اتّصال معلّقة ثمّ مكالمة جديدة ← الجديدة تُحسب من أوّلها (لا تُعامَل إعادة اتّصال)', async () => {
  const hang = deferred();
  const w = world({ mint: (n) => (n === 2 ? hang.p : res(200, { clientSecret: 'ek' + n, mahaBudget: Object.assign({}, PAID), turn: 'natural' })) });
  await liveCall(w);
  await w.advance(20000);
  w.pc().setState('failed');
  await w.advance(2000);
  w.tap(); // المستخدم أنهاها
  assert.equal(w.v('mahaCallActive'), false);
  assert.equal(w.v('mahaRtReconnecting'), false);
  await liveCall(w);
  assert.equal(w.els.mahaPointsMeter.style.display, 'flex', 'عدّاد المكالمة الجديدة ظاهر');
  await w.advance(61000);
  assert.equal(w.consumes().length, 1, 'الجديدة تُخصم دقيقتها الثانية');
});

/* ═════════════ cli-voice-3: الإنهاء أثناء التجهيز (العميل) ═════════════ */
test('cli-voice-3 أ. لمسة عرضيّة أثناء «أجهّز الجلسة» لا تُنهي المكالمة (ولا تصل الصفحة)، وبعد الجاهزيّة اللمسة تُنهيها كما كانت', async () => {
  const gate = deferred();
  const w = world({ mint: (n) => gate.p.then(() => res(200, { clientSecret: 'ek' + n, mahaBudget: Object.assign({}, PAID), turn: 'natural' })) });
  const p = w.v('mahaStartCall()');
  await w.advance(500);
  assert.equal(w.mints().length, 1, 'طلب الجلسة في الطريق');
  const ev = w.tap();
  assert.equal(w.v('mahaCallActive'), true, 'كانت اللمسة تُنهيها والخادم خصم الدقيقة أو التجربة');
  assert.equal(ev.prevented, true, 'اللمسة لا تصل الصفحة تحت الشريط');
  gate.resolve();
  await w.advance(2000);
  await p;
  assert.equal(w.v('mahaRtReady'), true);
  const ev2 = w.tap();
  assert.equal(ev2.prevented, true);
  assert.equal(w.v('mahaCallActive'), false, 'بعد الجاهزيّة: لمسة في أيّ مكان تُنهيها (v-maha-band)');
});

test('cli-voice-3 ب. «م» أثناء التجهيز يُنهي ويرسل إلغاء الطلب المعلّق بمعرّفه — والمفتاح إن وصل بعدها لا يشغّل عدّادًا', async () => {
  for (const late of [res(409, { error: 'cancelled' }), res(200, { clientSecret: 'ek', mahaBudget: Object.assign({}, PAID), turn: 'natural' })]) {
    const gate = deferred();
    const w = world({ mint: () => gate.p });
    const p = w.v('mahaStartCall()');
    await w.advance(500);
    const ev = w.tap(w.byId('btnMahaDock'));
    assert.equal(ev.prevented, true);
    assert.equal(w.v('mahaCallActive'), false, '«م» يُنهي في أيّ وقت');
    const openId = w.mints()[0].body.openId;
    assert.match(String(openId), /^[a-z0-9]{8,64}$/i, 'طلب الجلسة يحمل معرّف فتح');
    assert.deepEqual(w.cancels().map((r) => r.body.openId), [openId], 'إلغاء واحد بالمعرّف نفسه');
    gate.resolve(late);
    await w.advance(1000);
    await p;
    assert.equal(w.v('mahaPointsTimer'), null, 'لا عدّاد لمكالمة انتهت — كان يبدأ بعد الإنهاء');
    assert.notEqual(w.els.mahaPointsMeter.style.display, 'flex', 'ولا يظهر');
    await w.advance(4 * 60000);
    assert.equal(w.consumes().length, 0);
    assert.equal(w.mints().length, 1, 'ولا طلب ثانٍ');
    assert.equal(w.cancels().length, 1, 'ولا إلغاء مكرّر');
  }
});

test('cli-voice-3 ج. سباق ١٢ث يسقط إلى الأساسيّ والطلب معلّق ← يُلغى الطلب، والمفتاح المتأخّر لا يشغّل عدّادًا في الأساسيّ', async () => {
  const gate = deferred();
  const w = world({ mint: () => gate.p });
  w.ctx.mahaRecordUntilSilence = () => new Promise(() => {});
  const p = w.v('mahaStartCall()');
  await w.advance(12500);
  await p;
  assert.equal(w.v('mahaCallActive'), true, 'المكالمة مستمرّة بالوضع الأساسيّ');
  const openId = w.mints()[0].body.openId;
  assert.deepEqual(w.cancels().map((r) => r.body.openId), [openId], 'الجلسة المتروكة تُلغى — لا دقيقة افتتاح لمكالمة أساسيّة');
  gate.resolve(res(200, { clientSecret: 'late', mahaBudget: Object.assign({}, PAID), turn: 'natural' }));
  await w.advance(3 * 60000);
  assert.equal(w.v('mahaPointsTimer'), null);
  assert.equal(w.consumes().length, 0, 'كان العدّاد يبدأ من الردّ المتأخّر ويخصم الأساسيّ كلّ دقيقة');
});

/* ═════════════ cli-voice-2: نيّة الصورة في المسار الأساسيّ ═════════════ */
const NOT_IMAGE = [
  'ما هو الموقع الرسمي للوزارة؟', 'متى الدوام الرسمي في رمضان', 'اشرح لي الموضوع بصورة مبسطة', 'قول لي بصورة عامة شو الفرق',
  'فوائد التفاح والموز وغيرها', 'what is the official exchange rate, can you change it to dirhams', 'how do I withdraw money from the bank',
  'كم رسوم التسجيل', 'the draw for the world cup', 'هل الرسم على الجدران ممنوع', 'وش تصميم البيت المناسب',
];
const IS_IMAGE = [
  'ارسم لي قطة', 'ارسمي وردة حمراء', 'أرسم جمل في الصحراء', 'سوي لي صورة قطة', 'سوّي صورة لبيت', 'اعطني صورة حصان', 'اعطيني صورة بحر', 'ولد صورة لجمل',
  'صمم لي شعار لمطعمي', 'ابي صورة قطة في الفضاء', 'أبغى رسمة لطفل', 'draw a cat', 'can you draw me a horse', 'please draw my house',
  'generate an image of a dragon', 'create an image of the sea', 'make an image of a car', 'make a picture of a sunset', 'make me a picture of a cat', 'design a logo for my shop', 'give me a picture of a cat',
];
test('cli-voice-2 أ. mahaNeedsImage: جزء كلمة أو اسم مفرد ليس طلب رسم («الرسمي»، «بصورة»، «وغيرها»، «withdraw»، «change it» بلا صورة)', () => {
  const w = world();
  for (const s of NOT_IMAGE) assert.equal(w.v('mahaNeedsImage(' + JSON.stringify(s) + ')'), false, s);
});

test('cli-voice-2 ب. mahaNeedsImage: أفعال الطلب الصريحة تبقى طلب صورة (عربيّ وإنجليزيّ)', () => {
  const w = world();
  for (const s of IS_IMAGE) assert.equal(w.v('mahaNeedsImage(' + JSON.stringify(s) + ')'), true, s);
});

test('cli-voice-2 ج. «غيّرها/عدّلها/change it/edit it» تعديلٌ فقط حين في المكالمة صورة — و«وغيرها» ليست تعديلًا أبدًا', () => {
  const w = world();
  const EDIT = ['غيرها للأحمر', 'غيّرها', 'عدلها شوي', 'عدّلها', 'change it to red', 'edit it please'];
  for (const s of EDIT) assert.equal(w.v('mahaNeedsImage(' + JSON.stringify(s) + ')'), false, 'بلا صورة: ' + s);
  w.v('mahaLastImageBase64 = "QUFB"');
  for (const s of EDIT) assert.equal(w.v('mahaNeedsImage(' + JSON.stringify(s) + ')'), true, 'مع صورة: ' + s);
  assert.equal(w.v('mahaNeedsImage("فوائد التفاح والموز وغيرها")'), false, '«وغيرها» = «and others»');
  assert.equal(w.v('mahaNeedsImage("ما هو الموقع الرسمي للوزارة؟")'), false);
});

test('cli-voice-2 د. الحلقة الأساسيّة: «الموقع الرسمي» لا يطلب /api/maha-image المدفوع، و«ارسم لي قطة» يطلبه مرّة', async () => {
  for (const [said, want] of [['ما هو الموقع الرسمي للوزارة؟', 0], ['اشرح لي الموضوع بصورة مبسطة', 0], ['فوائد التفاح والموز وغيرها', 0], ['ارسم لي قطة', 1]]) {
    const w = world({ mint: () => res(503, { error: 'unavailable' }), stt: () => ({ text: said, language: 'ar' }) });
    let turns = 0;
    w.ctx.mahaRecordUntilSilence = () => (turns++ === 0 ? Promise.resolve({ size: 5000, type: 'audio/webm' }) : new Promise(() => {}));
    w.ctx.mahaSpeak = async () => {};
    w.v('mahaLastPeakRms = 0.5');
    const p = w.v('mahaStartCall()');
    await w.advance(3000);
    await p;
    await w.advance(3000);
    assert.equal(w.reqs.filter((r) => r.url === '/api/maha-image').length, want, said);
  }
});

/* ═════════════ cli-voice-3: الخادم (realtime-session الحقيقيّ) ═════════════ */
process.env.AUTH_SECRET = 'lock-fix-maha-secret';
process.env.OPENAI_API_KEY = 'sk-test';
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kv = new Map();
let kvFailOn = null;
const tick = () => new Promise((r) => setImmediate(r));
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => { await tick(); return kv.has(k) ? String(kv.get(k)) : null; },
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await tick(); if (kvFailOn && kvFailOn.test(k)) throw new Error('Upstash error: down'); if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const x = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(x)); return x; },
  kvDecrBy: async (k, n) => { const x = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(x)); return x; },
  kvDel: async (k) => { await tick(); kv.delete(k); },
  kvGetJSON: async (k) => { await tick(); return kv.has(k) ? JSON.parse(kv.get(k)) : null; },
  kvPutJSON: async (k, obj) => { kv.set(k, JSON.stringify(obj)); },
  kvExpire: async () => {}, kvList: async () => [], kvIncr: async (k) => { const x = Number(kv.get(k) || 0) + 1; kv.set(k, String(x)); return x; },
  kvPipeline: async (cmds) => cmds.map(() => null),
});
const users = new Map();
mock('api/_lib/auth.js', {
  getUser: async (u) => { await tick(); return users.has(u) ? structuredClone(users.get(u)) : null; },
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false, verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/_usage.js', { checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 5, clientIp: (req) => (req && req.headers && req.headers['x-test-ip']) || '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {} });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: () => {} });
let opened = 0;
global.fetch = async (url) => { opened++; await tick(); return new Response(JSON.stringify({ value: 'ek_' + opened }), { status: 200 }); };
const points = require(rp('api/_lib/points.js'));
const media = require(rp('api/_lib/_mediaPlans.js'));
const handler = require(rp('api/_lib/realtime-session.js'));
const tokenOf = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url'); return p + '.' + nodeCrypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const bal = async (u) => (await points.readPoints(u)).points;
const COST = points.COSTS.maha_minute;
const newOpen = () => nodeCrypto.randomBytes(16).toString('hex');
async function call(body, ip) {
  const r = { code: 200, j: null, setHeader() { return r; }, status(c) { r.code = c; return r; }, json(j) { r.j = j; return r; }, send(b) { r.j = b; return r; }, end() { return r; } };
  await handler({ method: 'POST', headers: ip ? { 'x-test-ip': ip } : {}, socket: {}, body }, r);
  return r;
}
const mintAs = (u, openId, extra) => call(Object.assign({ token: u ? tokenOf(u) : undefined, mode: 'assistant', openId }, extra || {}), extra && extra.ip);
const cancelOpen = (openId) => call({ action: 'cancel', openId });

test('cli-voice-3 د. الخادم: إلغاء قبل تسليم المفتاح ← الدقيقة تُردّ، ولا مفتاح يُسلَّم (409)', async () => {
  users.set('payer', { username: 'payer', points: 100, mahaTrialUsed: true });
  const id = newOpen();
  const c = await cancelOpen(id);
  assert.equal(c.code, 200);
  assert.equal(c.j.cancelled, true);
  const r = await mintAs('payer', id);
  assert.equal(r.code, 409, 'كان 200 بالمفتاح والدقيقة مخصومة');
  assert.equal(r.j.error, 'cancelled');
  assert.equal(r.j.clientSecret, undefined, 'لا مفتاح بعد الردّ');
  assert.equal(await bal('payer'), 100, 'الدقيقة رجعت');
});

test('cli-voice-3 هـ. الخادم: إلغاء بعد تسليم المفتاح لا يردّ شيئًا (المفتاح قد يُستعمل) — ولا يُكرَّر الردّ ولا التسليم بالمعرّف نفسه', async () => {
  users.set('late', { username: 'late', points: 100, mahaTrialUsed: true });
  const id = newOpen();
  const r = await mintAs('late', id);
  assert.equal(r.code, 200);
  assert.ok(r.j.clientSecret);
  assert.equal(await bal('late'), 100 - COST);
  const c = await cancelOpen(id);
  assert.equal(c.j.cancelled, false, 'المفتاح سُلِّم — الخصم قائم');
  assert.equal(await bal('late'), 100 - COST);
  const again = await cancelOpen(id);
  assert.equal(again.j.cancelled, false);
  const replay = await mintAs('late', id); // إعادة الطلب نفسه بالمعرّف نفسه
  assert.equal(replay.code, 409, 'المعرّف يُسلَّم مرّة واحدة');
  assert.equal(await bal('late'), 100 - COST, 'وخصم الإعادة رجع — دقيقة واحدة فقط');
  // إلغاءان قبل التسليم: الردّ مرّة واحدة
  const id2 = newOpen();
  assert.equal((await cancelOpen(id2)).j.cancelled, true);
  assert.equal((await cancelOpen(id2)).j.cancelled, false, 'الإلغاء الثاني لا شيء');
  assert.equal((await mintAs('late', id2)).code, 409);
  assert.equal((await mintAs('late', id2)).code, 409);
  assert.equal(await bal('late'), 100 - COST, 'لا ردّ مزدوج ولا خصم');
});

test('cli-voice-3 و. الخادم: سباق الإلغاء والتسليم — أحدهما فقط: إمّا مفتاح وخصم، أو ردّ وبلا مفتاح (٤٠ تشغيلة)', async () => {
  let servedN = 0;
  for (let i = 0; i < 40; i++) {
    const u = 'racer' + i;
    users.set(u, { username: u, points: 100, mahaTrialUsed: true });
    const id = newOpen();
    const waitTicks = i * 4; // من إلغاء فوريّ حتّى إلغاء بعد التسليم
    const [m, c] = await Promise.all([mintAs(u, id), (async () => { for (let k = 0; k < waitTicks; k++) await tick(); return cancelOpen(id); })()]);
    const served = m.code === 200 && !!m.j.clientSecret;
    assert.equal(c.j.cancelled, !served, 'تشغيلة ' + i + ': الإلغاء يكسب أو التسليم، لا الاثنان');
    assert.equal(await bal(u), served ? 100 - COST : 100, 'تشغيلة ' + i + ': الرصيد يطابق ما سُلِّم');
    if (!served) assert.equal(m.code, 409);
    servedN += served ? 1 : 0;
  }
  assert.ok(servedN > 0 && servedN < 40, 'السباق جرّب الترتيبين: ' + servedN + ' سُلِّم من ٤٠');
});

test('cli-voice-3 ز. الخادم: التجربة الملغاة قبل التسليم تعود (مرّة بالعمر تبقى صحيحة)، ورصيد مشترك مها يعود لمحفظته', async () => {
  users.set('newbie', { username: 'newbie', points: 0 });
  const id = newOpen();
  await cancelOpen(id);
  const r = await mintAs('newbie', id);
  assert.equal(r.code, 409);
  assert.notEqual(users.get('newbie').mahaTrialUsed, true, 'كانت التجربة تُحرق للأبد بلمسة');
  const again = await mintAs('newbie', newOpen());
  assert.equal(again.code, 200);
  assert.equal(again.j.mahaBudget.prepaid, 'trial', 'التجربة ما زالت له');
  assert.equal(users.get('newbie').mahaTrialUsed, true);
  const third = await mintAs('newbie', newOpen());
  assert.equal(third.code, 402, 'ولا تجربة ثانية');
  users.set('reem', { username: 'reem', points: 70, mahaTrialUsed: true, media: { maha: { plan: 'maha_basic', at: Date.now() } } });
  kv.set('media:maha:reem', String(media.MEDIA_PLANS.maha_basic.budget));
  const id3 = newOpen();
  await cancelOpen(id3);
  assert.equal((await mintAs('reem', id3)).code, 409);
  assert.equal(kv.get('media:maha:reem'), String(media.MEDIA_PLANS.maha_basic.budget), 'دقيقة مها رجعت لرصيد مها نفسه');
  assert.equal(await bal('reem'), 70, 'والنقاط كما هي');
});

test('cli-voice-3 ح. الخادم: تجربة الضيف الملغاة قبل التسليم تعود لعنوانه (لا تُحرق بلا مكالمة)', async () => {
  const ip = '198.51.100.9';
  const id = newOpen();
  await cancelOpen(id);
  const r = await mintAs(null, id, { ip });
  assert.equal(r.code, 409);
  assert.equal(kv.has('db/points/guest-maha/ip-' + encodeURIComponent(ip)), false, 'عنوانه غير معلَّم');
  const ok = await mintAs(null, newOpen(), { ip });
  assert.equal(ok.code, 200);
  assert.equal(ok.j.mahaBudget.guest, true);
  assert.equal((await mintAs(null, newOpen(), { ip })).code, 402, 'ثمّ مستعملة كما كانت');
});

test('cli-voice-3 ي. الخادم: خطأ بعد حجز التسليم لا يردّ الخصم (المفتاح قد وصل) — ولا يكسب إلغاءٌ بعده', async () => {
  users.set('afterserve', { username: 'afterserve', points: 100, mahaTrialUsed: true });
  const id = newOpen();
  const r = { code: 200, j: null, setHeader() { return r; }, status(c) { r.code = c; return r; },
    json(j) { if (j && j.clientSecret) throw new Error('socket closed'); r.j = j; return r; }, end() { return r; } };
  await handler({ method: 'POST', headers: {}, socket: {}, body: { token: tokenOf('afterserve'), mode: 'assistant', openId: id } }, r);
  assert.equal(await bal('afterserve'), 100 - COST, 'لا ردّ بعد التسليم — وإلّا مفتاح مُسلَّم بخصم مردود');
  assert.equal((await cancelOpen(id)).j.cancelled, false);
  assert.equal(await bal('afterserve'), 100 - COST);
});

test('cli-voice-3 ط. الخادم: عطب التخزين عند حجز التسليم ← لا مفتاح والدقيقة تُردّ؛ وطلب بلا معرّف (حزمة قديمة) كما كان؛ ومعرّف تالف يُرفض', async () => {
  users.set('kvdown', { username: 'kvdown', points: 100, mahaTrialUsed: true });
  kvFailOn = /^maha:open:/;
  try {
    const r = await mintAs('kvdown', newOpen());
    assert.notEqual(r.code, 200);
    assert.equal(r.j && r.j.clientSecret, undefined);
    assert.equal(await bal('kvdown'), 100, 'لا خصم بلا تسليم مضمون');
  } finally { kvFailOn = null; }
  const old = await mintAs('kvdown', undefined);
  assert.equal(old.code, 200, 'الحزمة المخزَّنة قبل الإصلاح لا ترسل معرّفًا — تعمل كما كانت');
  assert.equal(await bal('kvdown'), 100 - COST);
  const bad = await cancelOpen('../../x*');
  assert.equal(bad.code, 400);
  assert.equal([...kv.keys()].some((k) => k.includes('*')), false, 'لا مفتاح من نصّ العميل الخامّ');
});
