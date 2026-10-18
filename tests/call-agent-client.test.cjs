'use strict';
/* v-call-agent (أمر المالك ١٧ أكتوبر: «الوكيل يتّصل بالعيادة أو الصالون أو المطعم ويحجز عنّي» — للمالك وحده الآن) — العميل:
   js/app-42-call-agent.js الحقيقيّ مع app-37 الحقيقيّ (سطر الربط) في vm بصفحة مصغّرة، وشبكة وWebRTC وساعة مزيّفة:
   البطاقة للمالك بزرّيها، زرّ الاتّصال الفعليّ يختفي بلا رقم جاهز، التجربة ترفض ومها جارية، أحداث الجلسة (report_outcome
   وend_call بعد انتهاء الوداع)، لا إعادة اتّصال، إلغاء أثناء التجهيز، متابعة الاتّصال الفعليّ كلّ ثانيتين حتّى ended مع رسالة
   نتيجة واحدة، ونصوص الـ١٤ لغة بلا اسم مزوّد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const PART = read('js/app-42-call-agent.js');
const CARDS = read('js/app-37-cards.js');
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
const BANNED = /OpenAI|Open AI|Twilio|GPT|Realtime|Gemini|ChatGPT|Claude|Anthropic|Google|جوجل|أوبن|تويليو|كلود|جيمناي/i;
const RT_URL = 'https://api.openai.com/v1/realtime/calls';

/* القاموس: مفاتيح callAgent* من app-03 — العربيّة أوّلًا (كتلة ar) ثمّ الإنجليزيّة */
function dicts() {
  const src = read('js/app-03-i18n-data.js');
  const ar = {}, en = {};
  const rx = /(callAgent\w+):\s*("(?:\\.|[^"\\])*")/g;
  let m;
  while ((m = rx.exec(src))) {
    const v = JSON.parse(m[2]);
    if (!(m[1] in ar)) ar[m[1]] = v;
    else if (!(m[1] in en)) en[m[1]] = v;
    else throw new Error('مفتاح مكرّر ثلاثًا: ' + m[1]);
  }
  return { ar, en };
}
const D = dicts();
const KEYS = Object.keys(D.ar);
function langFile(lg) {
  const x = { I18N: {}, window: {}, document: { documentElement: {} }, localStorage: { getItem: () => null } };
  x.I18N[lg] = {}; x.window.I18N = x.I18N;
  vm.runInNewContext(read('i18n/' + lg + '.js'), x);
  return x.I18N[lg];
}

/* صفحة مصغّرة: ما يلمسه الجزء فقط */
function makeDom() {
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.childNodes = []; this.parentNode = null; this.className = ''; this._text = ''; this.attrs = {}; this.listeners = {}; this.style = {}; this.disabled = false; this.id = ''; this.type = ''; }
    get firstChild() { return this.childNodes[0] || null; }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i < 0) throw new Error('removeChild: ليس ابنًا'); this.childNodes.splice(i, 1); c.parentNode = null; return c; }
    insertBefore(c, ref) {
      if (!ref) return this.appendChild(c);
      if (c.parentNode) c.parentNode.removeChild(c);
      const i = this.childNodes.indexOf(ref); if (i < 0) throw new Error('insertBefore: المرجع ليس ابنًا');
      c.parentNode = this; this.childNodes.splice(i, 0, c); return c;
    }
    replaceChild(nu, old) {
      const i = this.childNodes.indexOf(old); if (i < 0) throw new Error('replaceChild: ليس ابنًا');
      if (nu.parentNode) nu.parentNode.removeChild(nu);
      this.childNodes[i] = nu; nu.parentNode = this; old.parentNode = null; return old;
    }
    /* تمرير مصغّر: كلّ ابن ٢٠ بكسل، والمرئيّ ٦٠ — والعنصر غير الموصول لا يمرَّر (كالمتصفّح: لا تخطيط قبل الإلحاق) */
    get scrollHeight() { return this.childNodes.length * 20; }
    get clientHeight() { return 60; }
    get scrollTop() { return this._st || 0; }
    set scrollTop(v) { if (!this.isConnected) return; this._st = Math.max(0, Math.min(Number(v) || 0, Math.max(0, this.scrollHeight - this.clientHeight))); }
    get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join(''); }
    set textContent(v) { this.childNodes = []; this._text = String(v); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    click() { if (this.disabled) return; (this.listeners.click || []).forEach((f) => f({ stopPropagation() {} })); }
    get isConnected() { let n = this; while (n) { if (n.isRoot) return true; n = n.parentNode; } return false; }
    all() { const out = []; const w = (n) => n.childNodes.forEach((c) => { out.push(c); w(c); }); w(this); return out; }
    q(cls) { return this.all().filter((n) => (' ' + n.className + ' ').includes(' ' + cls + ' ')); }
  }
  const head = new El('head'); head.isRoot = true;
  const body = new El('body'); body.isRoot = true;
  const doc = {
    head, body, mobile: false,
    documentElement: { classList: { contains: (c) => c === 'mobile-ui' && doc.mobile } },
    createElement: (t) => new El(t),
    getElementById: (id) => [...head.all(), ...body.all()].find((n) => n.id === id) || null,
  };
  return doc;
}

class FakeDC {
  constructor(name) { this.name = name; this.readyState = 'open'; this.sent = []; this.l = {}; }
  addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }
  send(m) { this.sent.push(JSON.parse(m)); }
  close() { this.readyState = 'closed'; }
  emit(ev) { (this.l.message || []).forEach((f) => f({ data: JSON.stringify(ev) })); }
}

const plain = (x) => JSON.parse(JSON.stringify(x)); // كائنات vm من عالم آخر (نموذج Array مختلف)
const flush = async () => { for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r)); };

function sandbox(opts = {}) {
  const clock = { now: 1_000_000, timers: [], seq: 0 };
  const ctx = { console: { warn() {}, error() {}, log() {} } };
  ctx.window = ctx;
  ctx.Date = { now: () => clock.now };
  ctx.setTimeout = (fn, ms) => { const t = { id: ++clock.seq, at: clock.now + (Number(ms) || 0), fn, live: true }; clock.timers.push(t); return t; };
  ctx.clearTimeout = (t) => { if (t) t.live = false; };
  ctx.document = makeDom();
  const dict = opts.lang === 'en' ? D.en : D.ar;
  ctx.t = (k) => (k in dict ? dict[k] : k).split('{voice}').join(opts.lang === 'en' ? 'Maha' : 'مها');
  ctx.swallowed = [];
  ctx.__swallow = (e, where) => { ctx.swallowed.push(where); };
  ctx.authGet = (k) => (k === 'aiapp_auth_token' ? 'tok-owner' : null);
  ctx.omranOwnerUi = () => opts.owner !== false;
  const call = Object.assign({ id: 'cp1', business: 'عيادة النور للأسنان', phoneMasked: '+971 50 *** 1234', kind: 'mobile',
    goal: 'حجز موعد تنظيف أسنان يوم الخميس بعد العصر', maxMin: 4, ptsPerMin: 45, phoneReady: true }, opts.call || {});
  ctx.state = { currentId: 'p1', projects: [{ id: 'p1', messages: [
    { role: 'user', content: 'اتّصل بعيادة النور واحجز لي' },
    { role: 'assistant', content: 'جهّزت بطاقة المكالمة.', cards: { kind: 'call', q: call.business, chips: [], items: [], call } },
  ] }] };
  ctx.msgs = () => ctx.state.projects[0].messages;
  ctx.call = () => ctx.msgs()[1].cards.call;
  ctx.getCurrent = () => ctx.state.projects.find((p) => p.id === ctx.state.currentId);
  if (opts.state) ctx.state = opts.state; // «التحميل التالي»: ما وصل التخزين قبل إغلاق الصفحة
  ctx.saves = 0; ctx.saveState = () => { ctx.saves++; };
  /* renderAll الحقيقيّ يعيد بناء الرسائل من الحالة المحفوظة — هنا يعيد رسم بطاقة الرسالة في مضيفها، ومعه حارسه
     (v-render-guard في renderMessages): بصمة المحادثة · عدد الرسائل · مجموع أطوال النصّ؛ إن طابقت آخر رسم والقائمة
     معروضة يُتخطّى كلّيًّا — فتغيّر m.cards.call وحده لا يعيد الرسم أبدًا */
  const host = ctx.document.createElement('div'); host.className = 'msg assistant'; ctx.document.body.appendChild(host);
  ctx.renders = 0; ctx.draws = 0;
  const draw = () => { ctx.draws++; while (host.firstChild) host.removeChild(host.firstChild); host.appendChild(ctx.omranRenderCards(ctx.msgs()[1].cards)); };
  let sig = null;
  const sigOf = () => { let n = 0; for (const m of ctx.msgs()) if (m && typeof m.content === 'string') n += m.content.length; return ctx.state.currentId + '|' + ctx.msgs().length + '|' + n; };
  ctx.renderAll = () => { ctx.renders++; const s = sigOf(); if (s === sig && host.firstChild) return; sig = s; draw(); };
  ctx.redraw = () => { sig = null; ctx.renderAll(); }; // رسم كامل حقيقيّ (فتح المحادثة من جديد، تغيير اللغة)
  ctx.card = () => host.firstChild;
  ctx.btn = (cls) => ctx.card().q(cls)[0];
  ctx.overlay = () => ctx.document.getElementById('omranCallOverlay');

  /* الشبكة: موجّه بالإجراء */
  ctx.fetchLog = [];
  ctx.routes = Object.assign({
    'call-session': () => [200, { clientSecret: 'ek_test', model: 'm', maxSec: 240, brief: { business: call.business, goal: call.goal, callerName: 'عمران' } }],
    [RT_URL]: () => [201, 'v=0 answer'],
  }, opts.routes || {});
  ctx.fetch = async (url, init) => {
    url = String(url);
    let body = init && init.body;
    if (typeof body === 'string' && body[0] === '{') body = JSON.parse(body);
    const action = (/[?&]action=([\w-]+)/.exec(url) || [])[1];
    ctx.fetchLog.push({ url, action, body, headers: (init && init.headers) || {}, keepalive: !!(init && init.keepalive) });
    const h = ctx.routes[action || url];
    if (!h) return new Response('{}', { status: 404 });
    const [status, payload] = await h(body);
    return typeof payload === 'string' ? new Response(payload, { status }) : new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  };
  ctx.calls = (action) => ctx.fetchLog.filter((f) => f.action === action);

  /* WebRTC والمايك */
  ctx.track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  ctx.stream = { getAudioTracks: () => [ctx.track], getTracks: () => [ctx.track] };
  ctx.pcs = [];
  ctx.RTCPeerConnection = class {
    constructor() { ctx.pcs.push(this); this.connectionState = 'new'; this.l = {}; this.tracks = []; this.closed = false; }
    addTrack(tr) { this.tracks.push(tr); }
    createDataChannel(name) { this.dc = new FakeDC(name); return this.dc; }
    async createOffer() { return { type: 'offer', sdp: 'v=0 offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription(d) { this.remote = d; this.connectionState = 'connected'; }
    addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }
    close() { this.closed = true; }
    set(stateName) { this.connectionState = stateName; (this.l.connectionstatechange || []).forEach((f) => f()); }
  };
  ctx.navigator = { mediaDevices: { getUserMedia: async () => ctx.stream } };
  ctx.Audio = class { constructor() { this.attrs = {}; } setAttribute(k, v) { this.attrs[k] = v; } play() { return Promise.resolve(); } };
  ctx.mahaCallActive = false; ctx.mahaCallStarting = false;
  ctx.unlocked = 0; ctx.mahaUnlockAudio = () => { ctx.unlocked++; };
  ctx.mahaMicPreflight = async () => null;
  ctx.gum = 0; ctx.mahaGetUserMediaRetry = async () => { ctx.gum++; return ctx.stream; };
  ctx.confirmed = []; ctx.confirm = (s) => { ctx.confirmed.push(s); return opts.confirm !== false; };
  ctx.listeners = {}; ctx.addEventListener = (ty, f) => { (ctx.listeners[ty] = ctx.listeners[ty] || []).push(f); };
  ctx.flushes = []; ctx.__saveFlush = (force) => { ctx.flushes.push(!!force); };
  ctx.mirrors = 0; ctx.__writeChatsMirror = () => { ctx.mirrors++; };
  ctx.localStorage = opts.storage || (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; })();

  vm.createContext(ctx);
  vm.runInContext(CARDS, ctx, { filename: 'app-37-cards.js' });
  vm.runInContext(PART, ctx, { filename: 'app-42-call-agent.js' });
  ctx.renderAll(); ctx.renders = 0;
  ctx.advance = async (ms) => {
    const end = clock.now + ms;
    for (;;) {
      await flush();
      const due = clock.timers.filter((t) => t.live && t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      due.live = false; clock.now = Math.max(clock.now, due.at); due.fn();
    }
    clock.now = end;
    await flush();
  };
  ctx.clock = clock;
  return ctx;
}

/* تجربة حتّى الجاهزيّة: ضغطة «جرّب عليّ» ← الجلسة ← SDP ← session.created */
async function liveTrial(c) {
  c.btn('omCallTry').click();
  await flush();
  const pc = c.pcs[0];
  assert.ok(pc && pc.dc, 'اتّصال وقناة');
  pc.dc.emit({ type: 'session.created' });
  await flush();
  return pc;
}

test('١. البطاقة للمالك: الجهة والرقم المقنّع والهدف والحدّ والسعر والزرّان والتعريف — DOM وألوان مثبّتة', () => {
  const c = sandbox();
  const card = c.card();
  assert.equal(card.className, 'omCallWrap');
  assert.equal(card.getAttribute('data-keep-emoji'), '1', 'منظّف الإيموجي لا يمسّ أيقونتي الزرّين');
  assert.equal(card.q('omCallBiz')[0].textContent, 'عيادة النور للأسنان');
  const ph = card.q('omCallPhone')[0];
  assert.equal(ph.textContent, '+971 50 *** 1234');
  assert.equal(ph.getAttribute('dir'), 'ltr', 'الرقم يُقرأ من اليسار في واجهة عربيّة');
  assert.match(card.q('omCallGoal')[0].textContent, /^الهدف: حجز موعد تنظيف أسنان/);
  const meta = card.q('omCallMeta')[0].textContent;
  assert.match(meta, /حدّ المكالمة 4 دقائق/);
  assert.match(meta, /مجانيّة للمالك/);
  assert.equal(card.q('omCallPrice')[0].textContent, 'للمستخدم: 50 نقطة/دقيقة أرضي · 45 موبايل');
  assert.equal(c.btn('omCallTry').textContent, '🎧 جرّب عليّ');
  assert.equal(c.btn('omCallDial').textContent, '📞 اتّصل فعليًّا');
  assert.equal(c.btn('omCallTry').type, 'button');
  assert.match(card.q('omCallLegal')[0].textContent, /آليّ.*ولا يُسجَّل الصوت/);
  assert.equal(card.q('omCallState').length, 0, 'لا حالة قبل أيّ مكالمة');
  const css = c.document.getElementById('omranCallCss');
  assert.ok(css && /!important/.test(css.textContent), 'ألوان مثبّتة كبطاقات app-37');
  assert.ok(css.textContent.includes('html[data-mode="light"] .msg .omCall{'), 'الوضع الفاتح');
  assert.ok(css.textContent.includes('html.mobile-ui #omranCallOverlay{'), 'نافذة التجربة شريط سفليّ في الجوّال');
  c.redraw(); c.redraw();
  assert.equal(c.document.head.childNodes.filter((n) => n.id === 'omranCallCss').length, 1, 'الأنماط مرّة واحدة');
  // غير المالك (v-call-agent-paid): سعر نوع الرقم بدل «مجانيّة» بلون الكرت، وسطر الحجز (السقف × السعر) مكان سطر سعر المستخدم
  const u = sandbox({ owner: false });
  assert.doesNotMatch(u.card().textContent, /مجانيّة للمالك|للمستخدم:/);
  assert.match(u.card().q('omCallMeta')[0].textContent, /45 نقطة لكلّ دقيقة/);
  assert.equal(u.card().q('omCallFree').length, 0); assert.equal(u.card().q('omCallCost').length, 1);
  assert.match(u.card().q('omCallPrice')[0].textContent, /^يُحجز 180 نقطة قبل المكالمة ويُرجع الباقي حسب المدّة/);
  // بالإنجليزيّة
  const e = sandbox({ lang: 'en' });
  assert.equal(e.btn('omCallTry').textContent, '🎧 Try it on me');
  assert.equal(e.btn('omCallDial').textContent, '📞 Call for real');
});

test('٢. لا رقم جاهز (phoneReady≠true) ← زرّ الاتّصال الفعليّ مخفيّ و«جرّب عليّ» باقٍ', () => {
  for (const phoneReady of [false, undefined]) {
    const c = sandbox({ call: { phoneReady, phoneMasked: '' } });
    assert.equal(c.card().q('omCallDial').length, 0);
    assert.ok(c.btn('omCallTry'));
    assert.equal(c.card().q('omCallPhone').length, 0);
  }
});

test('٣. التجربة ترفض ومها جارية أو تبدأ (ولا شبكة ولا مايك)، ومها تسأل callAgentBusy قبل أن تفتح', () => {
  for (const flag of ['mahaCallActive', 'mahaCallStarting']) {
    const c = sandbox();
    c[flag] = true;
    c.btn('omCallTry').click();
    assert.equal(c.fetchLog.length, 0);
    assert.equal(c.pcs.length, 0);
    assert.equal(c.gum, 0);
    assert.equal(c.overlay(), null);
    assert.equal(c.card().q('omCallNote')[0].textContent, 'أنهِ مكالمة مها أوّلًا.', flag);
    assert.equal(c.call().state, undefined, 'الحالة المحفوظة لم تُمسّ');
    assert.equal(c.callAgentBusy(), false);
  }
  const n = sandbox();
  n.RTCPeerConnection = undefined;
  n.btn('omCallTry').click();
  assert.equal(n.card().q('omCallNote')[0].textContent, 'هذا المتصفّح لا يدعم المكالمات الصوتيّة.');
  // الاتّجاه الآخر: سطر مستقلّ في mahaStartCall بعد الحارس الأصليّ (maha-subscribers يثبّت الحارس ولا «owner» فيه)
  for (const src of [read('js/app-08-maha.js'), read('js/app.bundle.js')]) {
    const s = src.slice(src.indexOf('async function mahaStartCall('), src.indexOf('if(btnMahaEl) btnMahaEl.onclick'));
    assert.match(s, /if\(mahaCallActive \|\| mahaCallStarting\) return;\n  if\(typeof window\.callAgentBusy === 'function' && window\.callAgentBusy\(\)\)\{ try\{ if\(typeof settingsToast === 'function'\) settingsToast\(t\('callAgentErrTrialBusy'\)\); \}catch\(e\)\{ __swallow\(e, 'maha:call-agent-busy'\); \} return; \}/);
    assert.doesNotMatch(s, /omran|owner|Paused/i);
  }
});

test('٤. التجربة كاملة: جلسة مستقلّة ← المالك يبدأ ← صمت ٣ث يبادر المساعد ← أسطر حيّة ← report_outcome ← end_call بعد الوداع ← نتيجة واحدة', async () => {
  const c = sandbox();
  c.btn('omCallTry').click();
  assert.equal(c.unlocked, 1, 'فتح الصوت داخل الضغطة');
  assert.ok(c.overlay(), 'نافذة خاصّة (لا #mahaCallScreen)');
  assert.equal(c.overlay().getAttribute('data-keep-emoji'), '1');
  assert.equal(c.callAgentBusy(), true);
  assert.equal(c.call().transport, 'trial');
  await flush();
  const sess = c.calls('call-session');
  assert.equal(sess.length, 1);
  assert.deepEqual(sess[0].body, { token: 'tok-owner', id: 'cp1' });
  assert.equal(sess[0].url, '/api/system?action=call-session');
  const pc = c.pcs[0];
  assert.equal(pc.dc.name, 'oai-events');
  const sdp = c.fetchLog.find((f) => f.url === RT_URL);
  assert.equal(sdp.headers.Authorization, 'Bearer ek_test');
  assert.equal(sdp.headers['Content-Type'], 'application/sdp');
  assert.equal(sdp.body, 'v=0 offer');
  assert.equal(c.call().state, 'connecting');
  assert.equal(c.track.enabled, false, 'المايك صامت قبل جاهزيّة الجلسة');
  assert.equal(c.overlay().q('omCallOvHint')[0].textContent, '', 'v-call-agent-cut: «قل ألو» لا يظهر والمايك مغلق — كلمته كانت تضيع ثمّ يكرّرها فوق مبادرة المساعد');
  assert.ok(PART.includes(".omCallOvHint:empty{display:none;}"), 'السطر الفارغ لا يأخذ مكانًا');
  assert.equal(c.btn('omCallStop').textContent, 'إنهاء المكالمة', 'البطاقة تعرض الإنهاء أثناء التجهيز');
  pc.dc.emit({ type: 'session.created' });
  await flush();
  assert.equal(c.call().state, 'live');
  assert.equal(c.track.enabled, true);
  assert.equal(c.overlay().q('omCallOvState')[0].textContent, 'المكالمة جارية');
  assert.match(c.overlay().q('omCallOvHint')[0].textContent, /أنت تمثّل «عيادة النور للأسنان» — قل «ألو»/);
  assert.deepEqual(pc.dc.sent, [], 'لا تحيّة عند الجاهزيّة — المالك يردّ أوّلًا كمن يرفع السمّاعة');
  await c.advance(2900);
  assert.deepEqual(pc.dc.sent, []);
  await c.advance(200);
  assert.deepEqual(pc.dc.sent, [{ type: 'response.create' }], 'صمت ٣ث ← المساعد يبادر بتعريف الجلسة');
  assert.equal(c.overlay().q('omCallOvTime')[0].textContent, '0:03 / 4:00');

  pc.dc.emit({ type: 'response.output_audio_transcript.done', transcript: 'السلام عليكم، أنا مساعد آليّ من التطبيق أتّصل نيابةً عن عمران.' });
  pc.dc.emit({ type: 'response.audio_transcript.done', transcript: 'أبغى أحجز موعد تنظيف يوم الخميس.' });
  await flush();
  assert.deepEqual(plain(c.call().transcript.map((l) => l.who)), ['agent', 'agent']);
  assert.match(c.overlay().q('omCallOvLines')[0].textContent, /المساعد: السلام عليكم، أنا مساعد آليّ/);
  assert.match(c.card().q('omCallLines')[0].textContent, /المساعد: أبغى أحجز موعد تنظيف/);

  pc.dc.sent.length = 0;
  const args = { status: 'booked', summary: 'تمّ حجز موعد تنظيف الخميس الساعة ٥ العصر.', confirmed_details: 'الخميس ٥:٠٠ م — د. سارة', follow_up: '' };
  pc.dc.emit({ type: 'response.function_call_arguments.done', name: 'report_outcome', call_id: 'fc1', arguments: JSON.stringify(args) });
  pc.dc.emit({ type: 'response.output_item.done', item: { type: 'function_call', name: 'report_outcome', call_id: 'fc1', arguments: JSON.stringify(args) } });
  await flush();
  assert.deepEqual(pc.dc.sent, [
    { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'fc1', output: '{"ok":true}' } },
    { type: 'response.create' },
  ], 'مخرج الأداة ثمّ ردّ — مرّة واحدة رغم الحدثين');
  assert.equal(c.call().outcome.status, 'booked');
  assert.match(c.card().q('omCallOutcome')[0].textContent, /^تمّ الحجز/);

  pc.dc.sent.length = 0;
  pc.dc.emit({ type: 'output_audio_buffer.started' });
  pc.dc.emit({ type: 'response.function_call_arguments.done', name: 'end_call', call_id: 'fc2', arguments: '{"reason":"done"}' });
  await flush();
  assert.deepEqual(pc.dc.sent, [{ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'fc2', output: '{"ok":true}' } }], 'end_call بلا ردّ جديد');
  await c.advance(2000);
  assert.equal(c.callAgentBusy(), true, 'الوداع ما زال يُسمع ← لا قطع');
  assert.equal(pc.closed, false);
  pc.dc.emit({ type: 'output_audio_buffer.stopped' });
  await c.advance(500);
  assert.equal(c.callAgentBusy(), false);
  assert.equal(pc.closed, true);
  assert.equal(pc.dc.readyState, 'closed');
  assert.equal(c.track.stopped, true, 'المايك أُغلق');
  assert.equal(c.overlay(), null);
  const call = c.call();
  assert.equal(call.state, 'completed');
  assert.ok(call.durationSec >= 5, 'المدّة من لحظة الجاهزيّة');
  assert.equal(call.resultPushed, true);
  const msgs = c.msgs();
  assert.equal(msgs.length, 3);
  assert.equal(msgs[2].role, 'assistant');
  assert.equal(msgs[2].content.split('\n')[0], '📞 نتيجة المكالمة مع «عيادة النور للأسنان»: تمّ الحجز');
  assert.match(msgs[2].content, /تمّ حجز موعد تنظيف الخميس/);
  assert.match(msgs[2].content, /المؤكَّد: الخميس ٥:٠٠ م — د\. سارة/);
  assert.match(msgs[2].content, /المدّة: 0:\d\d/);
  assert.ok(c.saves > 0 && c.renders > 0, 'saveState + renderAll(true)');
  assert.equal(c.btn('omCallTry').textContent, '🎧 جرّب عليّ', 'بعد الانتهاء يعود الزرّان');
  // ما بعد النهاية لا يغيّر شيئًا
  pc.dc.emit({ type: 'response.output_audio_transcript.done', transcript: 'متأخّر' });
  await c.advance(600000);
  assert.equal(c.msgs().length, 3, 'نتيجة واحدة');
  assert.equal(c.call().transcript.length, 2);
  assert.equal(c.calls('call-session').length, 1);
});

test('٥. لا إعادة اتّصال: انقطاع الاتّصال ينهيها «انقطعت» بما قيل، وسقف العميل maxMin دقائق مع تنبيه ختام قبله', async () => {
  const c = sandbox();
  const pc = await liveTrial(c);
  pc.dc.emit({ type: 'response.output_audio_transcript.done', transcript: 'مرحبًا' });
  await c.advance(1000);
  pc.set('disconnected');
  await c.advance(2000);
  assert.equal(c.callAgentBusy(), true, 'انقطاع قصير يُمهَل');
  pc.set('connected');
  await c.advance(5000);
  assert.equal(c.callAgentBusy(), true, 'عاد وحده');
  pc.set('failed');
  await flush();
  assert.equal(c.callAgentBusy(), false);
  assert.equal(c.pcs.length, 1, 'لا اتّصال ثانٍ');
  assert.equal(c.calls('call-session').length, 1, 'لا جلسة جديدة');
  assert.equal(c.call().state, 'dropped');
  assert.deepEqual(plain(c.call().transcript), [{ who: 'agent', text: 'مرحبًا' }]);
  assert.match(c.msgs()[2].content, /انقطعت المكالمة\nانتهت المكالمة بلا نتيجة مسجّلة\./);

  const k = sandbox({ call: { maxMin: 2 } });
  const pc2 = await liveTrial(k);
  pc2.dc.emit({ type: 'input_audio_buffer.speech_started' });
  await k.advance(99000);
  const isNote = (m) => m.type === 'conversation.item.create' && m.item && m.item.type === 'message';
  assert.ok(!pc2.dc.sent.some(isNote), 'لا تنبيه قبل وقته');
  await k.advance(2000);
  const at = pc2.dc.sent.findIndex(isNote);
  assert.ok(at >= 0, 'قبل السقف بعشرين ثانية: اختم');
  const note = pc2.dc.sent[at].item;
  assert.equal(note.role, 'system');
  assert.equal(note.content.length, 1);
  assert.equal(note.content[0].type, 'input_text');
  assert.ok(/report_outcome/.test(note.content[0].text) && /end_call/.test(note.content[0].text));
  assert.deepEqual(plain(pc2.dc.sent[at + 1]), { type: 'response.create' }, 'ثمّ ردّ عاريًا — تعليمات الجلسة (الهويّة الآليّة والحقائق ولغة الملخّص) تبقى سارية');
  assert.ok(!pc2.dc.sent.some((m) => m.response), 'لا response.create بتعليمات خاصّة تحلّ محلّ تعليمات الجلسة');
  await k.advance(19500);
  assert.equal(k.callAgentBusy(), false, 'السقف ١٢٠ث');
  assert.equal(k.call().state, 'completed');
  assert.equal(k.call().durationSec, 120);
});

test('٦. الإنهاء أثناء التجهيز (فحص الإلغاء بعد كلّ await): الجلسة تصل بعده فلا مايك ولا اتّصال ولا رسالة نتيجة', async () => {
  let release;
  const c = sandbox({ routes: { 'call-session': () => new Promise((r) => { release = () => r([200, { clientSecret: 'ek_late', maxSec: 240 }]); }) } });
  c.btn('omCallTry').click();
  await flush();
  assert.equal(c.calls('call-session').length, 1);
  c.overlay().q('omCallOvEnd')[0].click();
  assert.equal(c.overlay(), null);
  assert.equal(c.callAgentBusy(), false);
  release();
  await c.advance(30000);
  assert.equal(c.gum, 0, 'لا مايك بعد الإلغاء');
  assert.equal(c.pcs.length, 0, 'لا اتّصال');
  assert.equal(c.call().state, 'canceled');
  assert.equal(c.msgs().length, 2, 'مكالمة لم تبدأ = لا رسالة نتيجة');
  // ورفض الخادم (البطاقة انتهت صلاحيّتها) ملاحظة على البطاقة لا رسالة
  const x = sandbox({ routes: { 'call-session': () => [404, { error: 'proposal_not_found' }] } });
  x.btn('omCallTry').click();
  await flush();
  assert.equal(x.call().state, 'failed');
  assert.equal(x.card().q('omCallNote')[0].textContent, 'انتهت صلاحيّة هذه البطاقة — اطلب المكالمة من جديد.');
  assert.equal(x.msgs().length, 2);
  assert.equal(x.pcs.length, 0);
});

test('٧. الاتّصال الفعليّ: تأكيد ← call-start ← call-status كلّ ثانيتين ← أسطر الطرفين ← ended يوقف المتابعة ورسالة نتيجة واحدة', async () => {
  const seq = [
    { state: 'ringing', durationSec: 0, transcript: [], outcome: null, ended: false },
    { state: 'in-progress', durationSec: 12, transcript: [{ who: 'agent', text: 'مرحبًا، أنا مساعد آليّ أتّصل نيابةً عن عمران.' }, { who: 'callee', text: 'تفضّل' }], outcome: null, ended: false },
    { state: 'completed', durationSec: 95, transcript: [{ who: 'agent', text: 'شكرًا، مع السلامة.' }], outcome: { status: 'booked', summary: 'موعد الخميس ٥ العصر', confirmed_details: 'د. سارة', follow_up: 'إحضار البطاقة الصحّيّة' }, ended: true },
  ];
  let i = 0;
  const c = sandbox({ routes: { 'call-start': () => [200, { callId: 'call_1', state: 'queued' }], 'call-status': () => [200, seq[Math.min(i++, seq.length - 1)]] } });
  c.btn('omCallDial').click();
  await flush();
  assert.equal(c.confirmed.length, 1);
  assert.match(c.confirmed[0], /سيتّصل المساعد الآن فعليًّا بـ«عيادة النور للأسنان»/);
  assert.deepEqual(c.calls('call-start')[0].body, { token: 'tok-owner', id: 'cp1' });
  assert.equal(c.call().transport, 'phone');
  assert.equal(c.call().callId, 'call_1');
  assert.equal(c.call().state, 'queued');
  assert.equal(c.btn('omCallStop').textContent, 'إلغاء المكالمة');
  assert.equal(c.card().q('omCallTry').length, 0, 'لا تجربة فوق مكالمة فعليّة جارية');
  assert.equal(c.callAgentBusy(), false, 'الاتّصال الفعليّ لا يمسّ المايك — مها غير ممنوعة');
  await c.advance(1999);
  assert.equal(c.calls('call-status').length, 0, 'لا أسرع من ثانيتين');
  await c.advance(1);
  assert.deepEqual(c.calls('call-status')[0].body, { token: 'tok-owner', callId: 'call_1' });
  assert.equal(c.call().state, 'ringing');
  assert.match(c.card().q('omCallState')[0].textContent, /يرنّ…/);
  await c.advance(2000);
  assert.equal(c.call().state, 'in-progress');
  const lines = c.card().q('omCallLines')[0].textContent;
  assert.match(lines, /المساعد: مرحبًا، أنا مساعد آليّ/);
  assert.match(lines, /الطرف الآخر: تفضّل/);
  await c.advance(2000);
  const call = c.call();
  assert.equal(call.state, 'completed');
  assert.equal(call.outcome.status, 'booked');
  assert.equal(call.durationSec, 95);
  assert.equal(c.msgs().length, 3);
  assert.match(c.msgs()[2].content, /^📞 نتيجة المكالمة مع «عيادة النور للأسنان»: تمّ الحجز\nموعد الخميس ٥ العصر\nالمؤكَّد: د\. سارة\nالخطوة التالية: إحضار البطاقة الصحّيّة\nالمدّة: 1:35$/);
  await c.advance(60000);
  assert.equal(c.calls('call-status').length, 3, 'ended أوقف المتابعة');
  assert.equal(c.msgs().length, 3, 'رسالة نتيجة واحدة');
  c.redraw();
  await c.advance(10000);
  assert.equal(c.calls('call-status').length, 3, 'إعادة الرسم لا تستأنف مكالمة منتهية');
});

test('٨. إلغاء الاتّصال الفعليّ، وأخطاء البدء ملاحظات على البطاقة، ورفض التأكيد لا يتّصل', async () => {
  let canceled = false;
  const c = sandbox({ routes: {
    'call-start': () => [200, { callId: 'call_2', state: 'queued' }],
    'call-cancel': () => { canceled = true; return [200, { ok: true }]; },
    'call-status': () => [200, canceled ? { state: 'canceled', durationSec: 4, transcript: [], outcome: null, ended: true } : { state: 'ringing', transcript: [], ended: false }],
  } });
  c.btn('omCallDial').click();
  await c.advance(2000);
  c.btn('omCallStop').click();
  await flush();
  assert.deepEqual(c.calls('call-cancel')[0].body, { token: 'tok-owner', callId: 'call_2' });
  await c.advance(2000);
  assert.equal(c.call().state, 'canceled');
  assert.match(c.msgs()[2].content, /أُلغيت المكالمة/);

  const cases = [
    [503, 'relay_not_configured', 'الاتّصال الفعليّ غير مفعّل بعد — استعمل «جرّب عليّ».'],
    [403, 'outside_hours', 'الاتّصال الفعليّ متاح من ٨ صباحًا إلى ١٠ مساءً بتوقيت الإمارات.'],
    [409, 'busy', 'عندك مكالمة جارية — انتظر حتّى تنتهي.'],
    [400, 'bad_phone', 'الرقم غير مسموح: أرقام الإمارات فقط، بلا طوارئ ولا أرقام خدمات.'],
    [403, 'owner_only', 'متاحة للمالك فقط حاليًّا.'],
    [403, 'plan_required', 'المكالمة الآليّة للمشتركين بباقة سارية.'], // v-call-agent-paid
    [402, 'points_insufficient', 'رصيدك لا يكفي — المكالمة تحجز 180 نقطة.'],
    [502, 'relay_error', 'تعذّر بدء المكالمة — حاول مرّة ثانية.'],
  ];
  for (const [status, error, text] of cases) {
    const e = sandbox({ routes: { 'call-start': () => [status, Object.assign({ error }, error === 'points_insufficient' ? { needed: 180 } : {})] } });
    e.btn('omCallDial').click();
    await e.advance(5000);
    assert.equal(e.card().q('omCallNote')[0].textContent, text, error);
    assert.equal(e.call().callId, undefined);
    assert.equal(e.calls('call-status').length, 0, 'لا متابعة لمكالمة لم تبدأ');
    assert.equal(e.msgs().length, 2);
  }
  const n = sandbox({ confirm: false });
  n.btn('omCallDial').click();
  await flush();
  assert.equal(n.fetchLog.length, 0, 'رفض التأكيد = لا اتّصال');
});

test('٩. المتابعة تتوقّف بعد ١٠ دقائق، وبعد إعادة التحميل: الفعليّ يُستأنف والتجربة المعلّقة تُعرض «انقطعت»', async () => {
  const c = sandbox({ routes: { 'call-start': () => [200, { callId: 'call_3', state: 'queued' }], 'call-status': () => [200, { state: 'in-progress', transcript: [], ended: false }] } });
  c.btn('omCallDial').click();
  await c.advance(10 * 60 * 1000 + 2000);
  const n = c.calls('call-status').length;
  assert.ok(n >= 299 && n <= 301, 'استطلاع كلّ ثانيتين حتّى الحدّ: ' + n);
  assert.equal(c.call().state, 'timeout');
  assert.match(c.card().q('omCallState')[0].textContent, /توقّفت المتابعة/);
  await c.advance(60000);
  assert.equal(c.calls('call-status').length, n, 'توقّفت');
  assert.equal(c.msgs().length, 2, 'لا نتيجة مخترعة');

  const r = sandbox({ call: { transport: 'phone', callId: 'call_9', state: 'ringing', startedAt: 1_000_000 }, routes: { 'call-status': () => [200, { state: 'completed', durationSec: 30, transcript: [], outcome: null, ended: true }] } });
  await r.advance(2000);
  assert.equal(r.calls('call-status').length, 1, 'البطاقة المرسومة بعد إعادة التحميل تستأنف المتابعة');
  assert.equal(r.call().state, 'completed');
  assert.match(r.msgs()[2].content, /انتهت المكالمة\nانتهت المكالمة بلا نتيجة مسجّلة\.\nالمدّة: 0:30/);

  const s = sandbox({ call: { transport: 'trial', state: 'live' } });
  assert.match(s.card().q('omCallState')[0].textContent, /انقطعت المكالمة/);
  assert.ok(s.btn('omCallTry'), 'لا زرّ إنهاء لجلسة غير موجودة');
  assert.equal(s.call().state, 'live', 'العرض وحده — لا كتابة أثناء الرسم');
  await s.advance(0);
  assert.equal(s.call().state, 'dropped', 'بعد الرسم تُحسم: قديمة بلا مالك حيّ ← انقطعت');
  assert.match(s.msgs()[2].content, /انقطعت المكالمة/);
});

test('١٠. النصوص: كلّ مفاتيح callAgent* بالـ١٤ لغة بنفس المواضع، بلا اسم مزوّد في القاموس ولا في البطاقة والنافذة والنتيجة', async () => {
  assert.ok(KEYS.length >= 50, 'المفاتيح: ' + KEYS.length);
  for (const k of KEYS) {
    assert.ok(D.en[k], 'en:' + k);
    const ph = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join();
    for (const lg of ['ar', 'en']) assert.doesNotMatch(D[lg][k], BANNED, lg + ':' + k);
    assert.equal(ph(D.en[k]), ph(D.ar[k]), 'en:' + k);
    for (const lg of LANGS) {
      const v = langFile(lg)[k];
      assert.ok(typeof v === 'string' && v.trim(), lg + ':' + k);
      assert.doesNotMatch(v, BANNED, lg + ':' + k);
      assert.equal(ph(v), ph(D.ar[k]), lg + ':' + k + ' المواضع');
    }
  }
  // كلّ مفتاح يستعمله الجزء موجود في القاموس
  const used = new Set([...PART.matchAll(/'(callAgent[A-Z]\w*)'/g)].map((m) => m[1]));
  assert.ok(used.size >= 40);
  for (const k of used) assert.ok(k in D.ar, 'مفتاح مستعمل بلا ترجمة: ' + k);
  // المعروض فعلًا
  const c = sandbox();
  const pc = await liveTrial(c);
  const shown = [c.card().textContent, c.overlay().textContent];
  pc.dc.emit({ type: 'response.function_call_arguments.done', name: 'report_outcome', call_id: 'f', arguments: '{"status":"needs_user","summary":"x"}' });
  c.overlay().q('omCallOvEnd')[0].click();
  await flush();
  shown.push(c.card().textContent, c.msgs()[2].content);
  for (const s of shown) assert.doesNotMatch(s, BANNED, s);
  assert.doesNotMatch(c.document.getElementById('omranCallCss').textContent, BANNED);
});

test('١١. الربط: سطر app-37 أوّل omranRenderCards، والجزء في الحزمة بعد app-41 وقبل app-99، بلا innerHTML ولا اسم علويّ ولا مستقبل تفريغ، ووسم اللغات رُفع', () => {
  assert.ok(CARDS.includes("window.omranRenderCards = function(cards){\n    if(cards && cards.kind === 'call' && typeof window.omranCallCard === 'function') return window.omranCallCard(cards.call, cards);"));
  const c = sandbox();
  const grid = c.omranRenderCards({ kind: 'product', q: 'x', chips: [], items: [] });
  assert.equal(grid.className, 'omCardsWrap', 'باقي الأنواع كما كانت');
  const bundle = read('js/app.bundle.js');
  const at = bundle.indexOf('window.omranCallCard = function(call, cardsObj){');
  assert.ok(at > bundle.indexOf('v-three-colors') && at < bundle.indexOf('window.__omranBundleOk = true;'), 'ترتيب الحزمة');
  assert.ok(bundle.includes("if(cards && cards.kind === 'call' && typeof window.omranCallCard === 'function')"));
  assert.doesNotMatch(PART, /innerHTML|insertAdjacentHTML|outerHTML/, 'DOM فقط — نصّ الخادم لا يصير HTML');
  assert.doesNotMatch(PART, /^(?:async\s+)?(?:function|const|let|var|class)\s/m, 'كلّه داخل IIFE — لا تصادم أسماء علويّة في الحزمة');
  assert.doesNotMatch(PART, /input_audio_transcription/, 'maha-firstreply #5: لا مستقبل لأحداث التفريغ في الأجزاء');
  assert.doesNotMatch(PART, /mahaRt[A-Z]|mahaCallScreen|mahaStartRealtimeCall|mahaEndCall\(/, 'لا متغيّرات مها ولا شاشتها');
  assert.doesNotMatch(PART, /catch\s*\([^)]*\)\s*\{\s*\}/, 'لا كتمة صامتة');
  const v = /i18n\/' \+ lg \+ '\.js\?v=(\d+)'/.exec(read('js/app-04-i18n-state.js'));
  assert.ok(v && Number(v[1]) > 749, 'وسم ملفّات اللغات رُفع فوق ٧٤٩ (نصوص v-call-agent)');
});

/* ── جولة المراجعة (v-call-agent-r2) ── */

test('١٢. حارس الرسم: تغيّر حالة البطاقة وحده يتخطّاه renderAll — فالبطاقة تُحدَّث في مكانها: خطأ التجهيز يظهر بلا زرّ إنهاء عالق، والإلغاء يظهر فور البدء، و«تعذّرت» من المتابعة', async () => {
  const cases = [
    [() => [404, { error: 'proposal_not_found' }], 'انتهت صلاحيّة هذه البطاقة — اطلب المكالمة من جديد.'],
    [() => [500, { error: 'no_key' }], 'الخدمة غير مهيّأة بعد.'],
    [() => [502, { error: 'upstream', status: 500 }], 'تعذّر بدء المكالمة — حاول مرّة ثانية.'],
  ];
  for (const [route, text] of cases) {
    const x = sandbox({ routes: { 'call-session': route } });
    const wrap = x.card();
    x.btn('omCallTry').click();
    assert.equal(x.btn('omCallStop').textContent, 'إنهاء المكالمة', 'الإنهاء أثناء التجهيز');
    await flush();
    assert.equal(x.call().state, 'failed');
    assert.equal(x.draws, 1, 'لا رسم كامل — الحارس تخطّى renderAll');
    assert.equal(x.card(), wrap, 'الغلاف المرسوم نفسه حُدِّث');
    assert.equal(x.card().q('omCallStop').length, 0, 'لا زرّ إنهاء لجلسة انتهت');
    assert.ok(x.btn('omCallTry') && x.btn('omCallDial'), 'عاد الزرّان');
    assert.equal(x.card().q('omCallNote')[0].textContent, text);
    assert.match(x.card().q('omCallState')[0].textContent, /تعذّرت المكالمة/);
  }
  // الإنهاء من البطاقة نفسها أثناء التجهيز يختفي فورًا
  let release;
  const e = sandbox({ routes: { 'call-session': () => new Promise((r) => { release = () => r([200, { clientSecret: 'ek', maxSec: 240 }]); }) } });
  e.btn('omCallTry').click();
  await flush();
  e.btn('omCallStop').click();
  assert.equal(e.card().q('omCallStop').length, 0);
  assert.match(e.card().q('omCallState')[0].textContent, /أُلغيت المكالمة/);
  release(); await e.advance(1000);
  // الفعليّ: الإلغاء فور قبول البدء (لا انتظار أوّل استطلاع)، ثمّ 404 من المتابعة
  const p = sandbox({ routes: { 'call-start': () => [200, { callId: 'call_g', state: 'queued' }], 'call-status': () => [404, { error: 'call_not_found' }] } });
  p.btn('omCallDial').click();
  await flush();
  assert.equal(p.btn('omCallStop').textContent, 'إلغاء المكالمة');
  assert.match(p.card().q('omCallState')[0].textContent, /يبدأ الاتّصال/);
  await p.advance(2000);
  assert.equal(p.call().state, 'failed');
  assert.match(p.card().q('omCallState')[0].textContent, /تعذّرت المكالمة/);
  assert.equal(p.card().q('omCallStop').length, 0, 'لا إلغاء لمكالمة انتهت');
  assert.ok(p.btn('omCallNote') && p.btn('omCallDial'));
  assert.equal(p.draws, 1);
});

test('١٣. تدفّق واحد لكلّ بطاقة: «جرّب عليّ» معطّل وممنوع أثناء بدء الاتّصال الفعليّ، و«اتّصل فعليًّا» ممنوع أثناء التجربة', async () => {
  let release;
  const c = sandbox({ routes: {
    'call-start': () => new Promise((r) => { release = () => r([200, { callId: 'call_x', state: 'queued' }]); }),
    'call-status': () => [200, { state: 'ringing', transcript: [], ended: false }],
  } });
  const oldTry = c.btn('omCallTry');
  c.btn('omCallDial').click();
  await flush();
  assert.equal(c.calls('call-start').length, 1);
  assert.equal(c.btn('omCallTry').disabled, true, 'التجربة معطّلة أثناء البدء');
  assert.equal(c.btn('omCallDial').disabled, true);
  oldTry.click(); // ضغطة وصلت قبل التعطيل أو لزرّ رُسم قبله
  c.btn('omCallTry').click();
  await flush();
  assert.equal(c.calls('call-session').length, 0, 'لا تجربة فوق اتّصال يبدأ');
  assert.equal(c.overlay(), null);
  assert.equal(c.callAgentBusy(), false);
  release();
  await flush();
  assert.equal(c.call().transport, 'phone');
  assert.equal(c.call().callId, 'call_x');
  assert.equal(c.btn('omCallStop').textContent, 'إلغاء المكالمة');
  assert.equal(c.card().q('omCallTry').length, 0);
  oldTry.click();
  await c.advance(2000);
  assert.equal(c.calls('call-session').length, 0, 'ولا فوق مكالمة فعليّة جارية');
  assert.equal(c.call().transport, 'phone');
  // الاتّجاه الآخر: زرّ «اتّصل فعليًّا» القديم أثناء التجربة لا يسأل ولا يتّصل
  const t = sandbox();
  const oldDial = t.btn('omCallDial');
  await liveTrial(t);
  assert.equal(t.card().q('omCallDial').length, 0, 'لا اتّصال فعليّ أثناء التجربة');
  oldDial.click();
  await flush();
  assert.equal(t.confirmed.length, 0);
  assert.equal(t.calls('call-start').length, 0);
  assert.equal(t.call().transport, 'trial');
});

const BOOKED = { status: 'booked', summary: 'تمّ حجز موعد الخميس ٥ العصر.', confirmed_details: 'الخميس ٥:٠٠ م', follow_up: '' };

test('١٤. الإغلاق أو إعادة التحميل أثناء التجربة: pagehide يحفظ فورًا، والتحميل التالي يكتب النتيجة الناقصة مرّة واحدة — ولا يمسّ تجربة قد تكون حيّة في جهاز آخر', async () => {
  const c = sandbox();
  const pc = await liveTrial(c);
  assert.equal(c.localStorage.getItem('omranCallTrialLive'), 'cp1', 'علامة «تجربة جارية في هذا المتصفّح»');
  pc.dc.emit({ type: 'response.output_audio_transcript.done', transcript: 'أبغى أحجز موعد.' });
  pc.dc.emit({ type: 'response.function_call_arguments.done', name: 'report_outcome', call_id: 'f1', arguments: JSON.stringify(BOOKED) });
  await flush();
  const before = plain(c.state); // آخر ما وصل التخزين: «جارية» بنتيجتها، ولا رسالة
  assert.equal(before.projects[0].messages[1].cards.call.state, 'live');
  assert.ok(c.listeners.pagehide && c.listeners.pagehide.length === 1);
  c.listeners.pagehide[0]();
  assert.equal(c.call().state, 'completed');
  assert.equal(c.msgs().length, 3);
  assert.deepEqual(c.flushes, [true], 'حفظ فوريّ — مؤقّت saveState لا ينطلق أثناء الإغلاق');
  assert.equal(c.mirrors, 1, 'والمرآة المتزامنة');
  assert.equal(c.localStorage.getItem('omranCallTrialLive'), 'cp1', 'العلامة تبقى للتحميل التالي');

  // التحميل التالي: الحفظ غير المتزامن لم يكتمل ← «جارية» بنتيجة ولا رسالة
  const n = sandbox({ state: before, storage: c.localStorage });
  assert.match(n.card().q('omCallState')[0].textContent, /انقطعت المكالمة/);
  assert.equal(n.call().state, 'live', 'لا كتابة أثناء الرسم');
  await n.advance(0);
  assert.equal(n.call().state, 'completed', 'بنتيجة = اكتملت');
  assert.equal(n.call().resultPushed, true);
  assert.equal(n.msgs().length, 3);
  assert.match(n.msgs()[2].content, /^📞 نتيجة المكالمة مع «عيادة النور للأسنان»: تمّ الحجز\nتمّ حجز موعد الخميس/);
  assert.ok(n.saves > 0, 'حُفظت');
  assert.equal(n.localStorage.getItem('omranCallTrialLive'), null, 'العلامة أُزيلت');
  assert.match(n.card().q('omCallOutcome')[0].textContent, /^تمّ الحجز/);
  n.redraw(); await n.advance(1000);
  assert.equal(n.msgs().length, 3, 'مرّة واحدة');

  // جهاز آخر (بلا العلامة) وتجربة حديثة: عرض «انقطعت» فقط، لا كتابة — قد تكون حيّة هناك
  const o = sandbox({ call: { transport: 'trial', state: 'live', startedAt: 1_000_000 - 30_000, maxMin: 4, transcript: [{ who: 'agent', text: 'مرحبًا' }] } });
  await o.advance(0);
  assert.equal(o.call().state, 'live');
  assert.equal(o.msgs().length, 2);
  o.clock.now += 5 * 60 * 1000; // تجاوزت سقفها في كلّ مكان
  o.redraw(); await o.advance(0);
  assert.equal(o.call().state, 'dropped');
  assert.match(o.msgs()[2].content, /انقطعت المكالمة\nانتهت المكالمة بلا نتيجة مسجّلة\./);
  // تجربة لم تتجاوز التجهيز: «انقطعت» بلا رسالة (كفشل التجهيز)
  const m = sandbox({ call: { transport: 'trial', state: 'connecting', startedAt: 0 } });
  await m.advance(0);
  assert.equal(m.call().state, 'dropped');
  assert.equal(m.msgs().length, 2);
  // انتهت طبيعيًّا ← العلامة تُزال
  const f = sandbox();
  await liveTrial(f);
  f.overlay().q('omCallOvEnd')[0].click();
  assert.equal(f.localStorage.getItem('omranCallTrialLive'), null);
});

test('١٥. صندوق النصّ الحيّ يُلحق إلحاقًا: لا يُعاد بناؤه، يتبع آخر سطر، ولا يسرق تمرير القارئ ولا زرّ الإلغاء من تحت إصبعه', async () => {
  const c = sandbox();
  const pc = await liveTrial(c);
  const say = (s) => pc.dc.emit({ type: 'response.output_audio_transcript.done', transcript: s });
  for (let i = 1; i <= 5; i++) say('سطر ' + i);
  await flush();
  const box = c.card().q('omCallLines')[0];
  const first = box.childNodes[0];
  assert.equal(box.childNodes.length, 5);
  assert.equal(box.scrollTop, 5 * 20 - 60, 'يتبع آخر سطر');
  const stop = c.btn('omCallStop');
  say('سطر 6'); await flush();
  assert.equal(c.card().q('omCallLines')[0], box, 'الصندوق نفسه');
  assert.equal(box.childNodes[0], first, 'الأسطر المرسومة لم تُبنَ من جديد');
  assert.equal(box.childNodes.length, 6);
  assert.equal(box.childNodes[5].textContent, 'المساعد: سطر 6');
  assert.equal(box.scrollTop, 6 * 20 - 60);
  assert.equal(c.btn('omCallStop'), stop, 'زرّ الإنهاء نفسه');
  box.scrollTop = 0; // القارئ رفع ليقرأ أوّلها
  say('سطر 7'); await flush();
  assert.equal(box.scrollTop, 0, 'لا قفز تحت القارئ');
  assert.equal(box.childNodes.length, 7);
  box.scrollTop = 1e9; // عاد للأسفل ← يتبع من جديد
  say('سطر 8'); await flush();
  assert.equal(box.scrollTop, 8 * 20 - 60);
  const ov = c.overlay().q('omCallOvLines')[0];
  assert.equal(ov.childNodes.length, 6, 'آخر ستّة في النافذة');
  assert.equal(ov.childNodes[5].textContent, 'المساعد: سطر 8');
  assert.equal(ov.scrollTop, ov.scrollHeight - ov.clientHeight, 'والنافذة تتبع آخر سطر');
  for (let i = 9; i <= 45; i++) say('سطر ' + i);
  await flush();
  assert.equal(box.childNodes.length, 40, 'سقف الأربعين');
  assert.equal(box.childNodes[0].textContent, 'المساعد: سطر 6');
  assert.equal(box.childNodes[39].textContent, 'المساعد: سطر 45');
  // الفعليّ: كلّ استطلاع يُلحق الجديد، وزرّ الإلغاء نفسه طوال المكالمة
  const seq = [
    { state: 'ringing', transcript: [], ended: false },
    { state: 'in-progress', durationSec: 5, transcript: [{ who: 'agent', text: 'السلام عليكم' }], ended: false },
    { state: 'in-progress', durationSec: 7, transcript: [{ who: 'agent', text: 'السلام عليكم' }, { who: 'callee', text: 'هلا' }], ended: false },
    { state: 'in-progress', durationSec: 9, transcript: [{ who: 'agent', text: 'السلام عليكم' }, { who: 'callee', text: 'هلا' }, { who: 'agent', text: 'أبغى موعد' }], ended: false },
  ];
  let i = 0;
  const p = sandbox({ routes: { 'call-start': () => [200, { callId: 'call_t', state: 'queued' }], 'call-status': () => [200, seq[Math.min(i++, seq.length - 1)]] } });
  p.btn('omCallDial').click();
  await flush();
  const cancel = p.btn('omCallStop');
  await p.advance(2000 * 2);
  const pl = p.card().q('omCallLines')[0];
  const r0 = pl.childNodes[0];
  await p.advance(2000 * 2);
  assert.equal(p.btn('omCallStop'), cancel, 'زرّ الإلغاء لم يُستبدل بين الاستطلاعات');
  assert.equal(p.card().q('omCallLines')[0], pl);
  assert.equal(pl.childNodes[0], r0);
  assert.equal(pl.childNodes.length, 3);
  assert.equal(pl.childNodes[1].textContent, 'الطرف الآخر: هلا');
  assert.equal(pl.scrollTop, 3 * 20 - 60);
  assert.match(p.card().q('omCallState')[0].textContent, /0:09/);
  assert.equal(p.draws, 1);
});

test('١٦. المتابعة تحفظ فقط حين يتغيّر شيء: استطلاعات متطابقة لا تستدعي saveState، والمدّة وحدها تُعرض بلا حفظ', async () => {
  const seq = [
    { state: 'ringing', transcript: [], outcome: null, ended: false },
    { state: 'ringing', transcript: [], outcome: null, ended: false },
    { state: 'ringing', transcript: [], outcome: null, ended: false },
    { state: 'ringing', transcript: [], outcome: null, ended: false },
    { state: 'in-progress', durationSec: 3, transcript: [], outcome: null, ended: false },
    { state: 'in-progress', durationSec: 5, transcript: [], outcome: null, ended: false },
    { state: 'in-progress', durationSec: 7, transcript: [{ who: 'agent', text: 'مرحبًا' }], outcome: null, ended: false },
    { state: 'in-progress', durationSec: 9, transcript: [{ who: 'agent', text: 'مرحبًا' }], outcome: null, ended: false },
    { state: 'completed', durationSec: 11, transcript: [{ who: 'agent', text: 'مرحبًا' }], outcome: { status: 'no_answer', summary: 'لم يردّ أحد.' }, ended: true },
  ];
  let i = 0;
  const c = sandbox({ routes: { 'call-start': () => [200, { callId: 'call_s', state: 'queued' }], 'call-status': () => [200, seq[Math.min(i++, seq.length - 1)]] } });
  c.btn('omCallDial').click();
  await flush();
  const s0 = c.saves;
  await c.advance(2000);
  assert.equal(c.saves, s0 + 1, 'queued ← ringing: حفظ');
  await c.advance(2000 * 3);
  assert.equal(c.saves, s0 + 1, 'ثلاثة استطلاعات متطابقة: لا حفظ');
  await c.advance(2000);
  assert.equal(c.saves, s0 + 2, 'ringing ← in-progress: حفظ');
  await c.advance(2000);
  assert.equal(c.saves, s0 + 2, 'المدّة وحدها: لا حفظ');
  assert.match(c.card().q('omCallState')[0].textContent, /0:05/, '…لكنّها تُعرض');
  await c.advance(2000);
  assert.equal(c.saves, s0 + 3, 'سطر جديد: حفظ');
  await c.advance(2000);
  assert.equal(c.saves, s0 + 3);
  await c.advance(2000);
  assert.ok(c.saves > s0 + 3, 'النهاية تُحفظ');
  assert.equal(c.call().durationSec, 11);
  assert.equal(c.msgs().length, 3);
});

test('١٧. مها ترفض أثناء التجربة برسالة ظاهرة (مفتاح بالـ١٤ لغة)، وبلاها تفتح كالمعتاد', async () => {
  for (const src of [read('js/app-08-maha.js'), read('js/app.bundle.js')]) {
    const body = src.slice(src.indexOf('async function mahaStartCall('), src.indexOf('if(btnMahaEl) btnMahaEl.onclick'));
    for (const busy of [true, false]) {
      const toasts = [], inner = [];
      const run = new Function('window', 'settingsToast', 't', '__swallow', 'mahaStartCallInner',
        'let mahaCallActive = false, mahaCallStarting = false;\n' + body + '\nreturn mahaStartCall;')(
        { callAgentBusy: () => busy }, (m) => toasts.push(m), (k) => D.ar[k] || k, () => {}, async (mode) => { inner.push(mode); });
      await run('x');
      assert.deepEqual(toasts, busy ? ['أنهِ المكالمة التجريبيّة أوّلًا.'] : [], 'busy=' + busy);
      assert.deepEqual(inner, busy ? [] : ['x']);
    }
  }
  assert.equal(D.en.callAgentErrTrialBusy, 'End the trial call first.');
});

test('١٨. العقد v2: البطاقة ونصّ التأكيد يعرضان اسم المحلّ من الخرائط والاسم الذي يتّصل به والتفاصيل التي قد يذكرها', async () => {
  const extra = { placeName: 'Smile Dental Clinic Al Barsha', callerName: 'عمران', details: 'الحجز باسم عمران، شخص واحد' };
  const c = sandbox({ call: extra });
  const card = c.card();
  const pl = card.q('omCallPlace')[0];
  assert.equal(pl.textContent, 'الرقم من الخرائط: Smile Dental Clinic Al Barsha');
  assert.equal(pl.childNodes[1].getAttribute('dir'), 'auto', 'اسم لاتينيّ معزول الاتّجاه');
  assert.equal(card.q('omCallWho')[0].textContent, 'يتّصل نيابةً عن: عمران');
  assert.equal(card.q('omCallShare')[0].textContent, 'قد يذكر للجهة: الحجز باسم عمران، شخص واحد');
  const order = card.all().map((n) => n.className).filter((k) => /^omCall(Biz|Phone|Place|Goal|Who|Share|Meta)$/.test(k));
  assert.deepEqual(order, ['omCallBiz', 'omCallPhone', 'omCallPlace', 'omCallGoal', 'omCallWho', 'omCallShare', 'omCallMeta']);
  c.btn('omCallDial').click();
  await flush();
  assert.equal(c.confirmed[0], 'سيتّصل المساعد الآن فعليًّا بـ«عيادة النور للأسنان». متابعة؟\n\n'
    + 'الرقم من الخرائط: Smile Dental Clinic Al Barsha\nيتّصل نيابةً عن: عمران\nالهدف: حجز موعد تنظيف أسنان يوم الخميس بعد العصر\nقد يذكر للجهة: الحجز باسم عمران، شخص واحد');
  // بالإنجليزيّة
  const e = sandbox({ lang: 'en', call: extra });
  assert.equal(e.card().q('omCallPlace')[0].textContent, 'Number from the map: Smile Dental Clinic Al Barsha');
  assert.equal(e.card().q('omCallWho')[0].textContent, 'On behalf of: عمران');
  e.btn('omCallDial').click();
  await flush();
  assert.match(e.confirmed[0], /\n\nNumber from the map: Smile Dental Clinic Al Barsha\nOn behalf of: عمران\nGoal: /);
  // بلاها: لا أسطر فارغة
  const n = sandbox();
  for (const k of ['omCallPlace', 'omCallWho', 'omCallShare']) assert.equal(n.card().q(k).length, 0, k);
  n.btn('omCallDial').click();
  await flush();
  assert.doesNotMatch(n.confirmed[0], /الخرائط|نيابةً عن|قد يذكر/);
  assert.match(n.confirmed[0], /متابعة؟\n\nالهدف: حجز موعد/);
});

test('١٩. سطر حالة propose_call (k: stCall) مترجم بالـ١٤ لغة بلا اسم مزوّد', () => {
  const src = read('js/app-03-i18n-data.js');
  const vals = [...src.matchAll(/\bstCall:\s*("(?:\\.|[^"\\])*")/g)].map((m) => JSON.parse(m[1]));
  assert.equal(vals.length, 2, 'ar ثمّ en');
  assert.equal(vals[0], '📞 يجهّز كرت الاتّصال…', 'نصّ الخادم نفسه');
  assert.equal(vals[1], '📞 Preparing the call card…');
  for (const lg of LANGS) {
    const v = langFile(lg).stCall;
    assert.ok(typeof v === 'string' && /^📞 \S/.test(v), lg);
    assert.doesNotMatch(v, BANNED, lg);
  }
  // الترجمة تمرّ بمسار tStatus القائم (k ← t(k)) كـstCards
  assert.match(read('js/app-04-i18n-state.js'), /function tStatus\(ev\)\{[\s\S]{0,80}if\(ev && ev\.k\)\{\s*var v = t\(ev\.k\);/);
});

/* v-call-agent-cut (المالك: «الصوت يقطع لكن المحادثة الي هي الكتابة موجوده»): نصّ الردّ يصل كاملًا قبل صوته، والمقاطعة في الخادم
   تمسح ما لم يُسمع (output_audio_buffer.cleared) أو تلغي الردّ (response.done cancelled/turn_detected) */
const OPEN = 'السلام عليكم، معك مساعد آلي من تطبيق عمران AI، أتّصل نيابةً عن عمران بخصوص حجز موعد. تسمح لي أكمل؟';
async function cutFlow(c, pc) {
  const e = (ev) => pc.dc.emit(ev);
  // r1: النصّ كاملًا ثمّ «وعليكم السلام» من المالك ← مسح
  e({ type: 'response.created', response: { id: 'resp_r1' } });
  e({ type: 'output_audio_buffer.started', response_id: 'resp_r1' });
  e({ type: 'response.output_audio_transcript.done', response_id: 'resp_r1', item_id: 'i1', transcript: OPEN });
  e({ type: 'response.done', response: { id: 'resp_r1', status: 'completed', output: [] } });
  await flush();
  assert.equal(c.call().transcript[0].text, OPEN, 'قبل القطع كما وصل');
  e({ type: 'input_audio_buffer.speech_started' });
  e({ type: 'output_audio_buffer.cleared', response_id: 'resp_r1' });
  e({ type: 'input_audio_buffer.speech_stopped' });
  await flush();
  // r2: سُمع كاملًا (stopped) ثمّ مسح بلا معرّف ← لا علامة
  e({ type: 'response.created', response: { id: 'resp_r2' } });
  e({ type: 'output_audio_buffer.started', response_id: 'resp_r2' });
  e({ type: 'response.output_audio_transcript.done', response_id: 'resp_r2', transcript: 'معك مساعد آلي، أتّصل نيابةً عن عمران.' });
  e({ type: 'response.done', response: { id: 'resp_r2', status: 'completed', output: [] } });
  e({ type: 'output_audio_buffer.stopped', response_id: 'resp_r2' });
  e({ type: 'output_audio_buffer.cleared' });
  // r3: المسح قبل وصول النصّ
  e({ type: 'response.created', response: { id: 'resp_r3' } });
  e({ type: 'output_audio_buffer.started', response_id: 'resp_r3' });
  e({ type: 'output_audio_buffer.cleared', response_id: 'resp_r3' });
  e({ type: 'response.output_audio_transcript.done', response_id: 'resp_r3', transcript: 'أبغى موعد تنظيف يوم الخميس' });
  await flush();
}

test('٢٠. v-call-agent-cut: سطر قطعت المقاطعة صوته يُعلَّم « …» (النصّ قبل القطع أو بعده، أو إلغاء بلا مسح) والمسموع كاملًا لا يُعلَّم — في مكانه', async () => {
  const c = sandbox();
  const pc = await liveTrial(c);
  await c.advance(3000);
  assert.deepEqual(pc.dc.sent, [{ type: 'response.create' }], 'المبادرة بعد ٣ث كما هي');
  await cutFlow(c, pc);
  assert.equal(c.call().transcript[0].text, OPEN + ' …');
  assert.equal(c.call().transcript[1].text, 'معك مساعد آلي، أتّصل نيابةً عن عمران.', 'سُمع كلّه');
  assert.equal(c.call().transcript[2].text, 'أبغى موعد تنظيف يوم الخميس …', 'عُلِّم عند وصوله');
  assert.match(c.card().q('omCallLines')[0].textContent, /تسمح لي أكمل؟ …/);
  // ردّان سُمعا كاملين (الصندوق يفيض فيُختبر التمرير) ثمّ r4: أُلغي (turn_detected) بلا مسح — والسطر يُستبدل وحده في الصندوقين
  for (const [rid, t] of [['resp_h1', 'تمام.'], ['resp_h2', 'الخميس يناسب؟']]) {
    pc.dc.emit({ type: 'response.created', response: { id: rid } });
    pc.dc.emit({ type: 'output_audio_buffer.started', response_id: rid });
    pc.dc.emit({ type: 'response.output_audio_transcript.done', response_id: rid, transcript: t });
    pc.dc.emit({ type: 'output_audio_buffer.stopped', response_id: rid });
  }
  pc.dc.emit({ type: 'response.created', response: { id: 'resp_r4' } });
  pc.dc.emit({ type: 'response.output_audio_transcript.done', response_id: 'resp_r4', transcript: 'بعد العصر لو سمحت' });
  await flush();
  const ovBox = c.overlay().q('omCallOvLines')[0], cardBox = c.card().q('omCallLines')[0];
  const ov0 = ovBox.childNodes[0], card0 = cardBox.childNodes[0], ov5 = ovBox.childNodes[5];
  ovBox.scrollTop = 0; // القارئ رفع صندوق النافذة ليقرأ — التعليم لا يسرق تمريره
  pc.dc.emit({ type: 'response.done', response: { id: 'resp_r4', status: 'cancelled', status_details: { type: 'cancelled', reason: 'turn_detected' }, output: [] } });
  await flush();
  assert.equal(c.call().transcript[5].text, 'بعد العصر لو سمحت …', 'الإلغاء وحده (بلا مسح) يعلّم');
  assert.equal(ovBox.scrollTop, 0);
  pc.dc.emit({ type: 'output_audio_buffer.cleared', response_id: 'resp_r4' });
  pc.dc.emit({ type: 'output_audio_buffer.cleared', response_id: 'resp_r1' });
  await flush();
  assert.deepEqual(plain(c.call().transcript).map((l) => l.text), [OPEN + ' …', 'معك مساعد آلي، أتّصل نيابةً عن عمران.', 'أبغى موعد تنظيف يوم الخميس …', 'تمام.', 'الخميس يناسب؟', 'بعد العصر لو سمحت …'], 'علامة واحدة لكلّ ردّ مهما تكرّر القطع');
  assert.equal(ovBox.childNodes[0], ov0, 'النافذة: الأسطر الأخرى لم يُعَد بناؤها');
  assert.notEqual(ovBox.childNodes[5], ov5);
  assert.match(ovBox.childNodes[5].textContent, /بعد العصر لو سمحت …$/);
  assert.equal(c.card().q('omCallLines')[0].childNodes[0], card0, 'البطاقة: كذلك');
  assert.deepEqual(pc.dc.sent, [{ type: 'response.create' }], 'التعليم لا يرسل شيئًا للجلسة');
});

test('٢١. v-call-agent-cut: كلّ تجربة بدأت ترسل عند نهايتها أثرًا واحدًا بلا نصّ (diag:call-trial)، وفشل التجهيز لا يرسل، والأثر محدود', async () => {
  const c = sandbox();
  const pc = await liveTrial(c);
  await c.advance(3000);
  await cutFlow(c, pc);
  assert.equal(c.calls('client-errors').length, 0, 'لا شيء أثناء المكالمة');
  c.overlay().q('omCallOvEnd')[0].click();
  await flush();
  const d = c.calls('client-errors');
  assert.equal(d.length, 1);
  assert.equal(d[0].body.source, 'diag:call-trial', 'diag: لا يُعدّ خطأً (app-errors isDiag)');
  assert.equal(d[0].keepalive, true, 'يصل ولو أُغلقت الصفحة');
  assert.match(d[0].body.message, /^call-trial cp1 end=canceled dur=\d+s lines=3 cut=2 clr=3$/);
  const st = d[0].body.stack;
  assert.ok(st.length <= 1500);
  assert.doesNotMatch(st, /[؀-ۿ]/, 'لا كلمة من المكالمة');
  const order = ['cr:open', 'rc:p_r1', 'os:p_r1', 'tx:p_r1/' + OPEN.length, 'ss', 'oc:p_r1', 'sp', 'ot:p_r2', 'oc:', 'oc:p_r3'];
  let at = -1;
  for (const k of order) { const i = st.split(' ').findIndex((x, j) => j > at && x.replace(/^\d+\.\d/, '') === k); assert.ok(i > at, 'بالترتيب: ' + k + ' في ' + st); at = i; }
  assert.equal(st.split(' ')[0], '3.0cr:open', 'الزمن بالثواني من الجاهزيّة، وسبب كلّ طلب ردّ');

  // فشل التجهيز (البطاقة انتهت) = لا أثر
  const n = sandbox({ routes: { 'call-session': () => [404, { error: 'proposal_not_found' }] } });
  n.btn('omCallTry').click();
  await n.advance(1000);
  assert.equal(n.call().state, 'failed');
  assert.equal(n.calls('client-errors').length, 0);

  // إغلاق الصفحة أثناء المكالمة: أثر واحد end=dropped، ومئتا حدث = أوّل ٣٠ رمزًا (الافتتاح) + «~» + آخر ٥٠
  const p = sandbox();
  const pc2 = await liveTrial(p);
  await p.advance(3000);
  pc2.dc.emit({ type: 'output_audio_buffer.cleared', response_id: 'resp_open' });
  for (let i = 0; i < 200; i++) pc2.dc.emit({ type: 'input_audio_buffer.speech_started' });
  pc2.dc.emit({ type: 'input_audio_buffer.speech_stopped' });
  p.listeners.pagehide.forEach((f) => f());
  await flush();
  const d2 = p.calls('client-errors');
  assert.equal(d2.length, 1);
  assert.match(d2[0].body.message, /^call-trial cp1 end=dropped /);
  const t2 = d2[0].body.stack.split(' ');
  assert.equal(t2.length, 81);
  assert.deepEqual([t2[0], t2[1], t2[30], t2[80]], ['3.0cr:open', '3.0oc:open', '~', '3.0sp'], 'الافتتاح محفوظ رغم الطول، والذيل آخر ما جرى');
});

test('٢٢. غير المالك (v-call-agent-paid): تأكيد بالسعر قبل التجربة والاتّصال، confirmed في الطلب، ومعرّف التجربة في الكرت قبل الطلب ونهايتها تُعاد حتّى تُقبل', async () => {
  // التجربة: تأكيد واحد بلغته فيه السعر والحجز — قبل المايك وأيّ طلب
  const n = sandbox({ owner: false, confirm: false });
  n.btn('omCallTry').click();
  await n.advance(1000);
  assert.equal(n.confirmed.length, 1);
  assert.match(n.confirmed[0], /^المكالمة التجريبيّة بنفس سعر المكالمة الحقيقيّة\. متابعة؟\n\n45 نقطة لكلّ دقيقة\nيُحجز 180 نقطة/);
  assert.equal(n.fetchLog.length, 0, 'رفض = لا طلب'); assert.equal(n.call().state, undefined); assert.equal(n.overlay(), null);
  assert.equal(n.call().trialEnds, undefined, 'لا معرّف تجربة بلا موافقة');

  const ends = [];
  let endOk = false;
  const c = sandbox({ owner: false, routes: {
    'call-session': (b) => { assert.ok(c.call().trialEnds && c.call().trialEnds[b.trialId] === -1, 'المعرّف محفوظ في الكرت قبل وصول الطلب'); return [200, { clientSecret: 'ek_test', model: 'm', maxSec: 240, trialId: b.trialId, brief: { business: 'عيادة النور للأسنان' } }]; },
    'call-trial-end': (b) => { ends.push(b); return endOk ? [200, { ok: true, billing: { charged: 45, refunded: 135 } }] : [503, { error: 'settle_pending' }]; },
  } });
  await liveTrial(c);
  const sb = plain(c.calls('call-session')[0].body);
  assert.match(sb.trialId, /^ct[a-f0-9]{18}$/, 'العميل يولّد المعرّف');
  assert.deepEqual(sb, { confirmed: true, token: 'tok-owner', id: 'cp1', trialId: sb.trialId });
  assert.ok(c.saves > 0, 'حُفظ قبل الطلب');
  await c.advance(50000);
  c.btn('omCallStop').click();
  await c.advance(100);
  assert.equal(ends.length, 1);
  assert.deepEqual(plain(ends[0]), { token: 'tok-owner', trialId: sb.trialId, durationSec: 50 });
  assert.equal(c.calls('call-trial-end')[0].keepalive, true, 'يعبر إغلاق الصفحة');
  assert.deepEqual(plain(c.call().trialEnds), { [sb.trialId]: 50 }, 'الخادم لم يقبلها بعد — تبقى للإعادة');
  c.redraw(); await c.advance(100);
  assert.equal(ends.length, 1, 'إعادة الرسم لا تعيد الإرسال فورًا');
  await c.advance(10000);
  assert.equal(ends.length, 2, 'محاولة ثانية واحدة بعد مهلة في الصفحة نفسها');
  await c.advance(60000);
  assert.equal(ends.length, 2, 'لا ثالثة في الصفحة نفسها — التحميل التالي يكمل');

  // تجربة ثانية على الكرت نفسه والأولى لم تُقبل بعد: لكلّ تجربة نهايتها (المراجعة — كانت الثانية تمحو الأولى)
  c.btn('omCallTry').click();
  await flush();
  // المراجعة الثانية: «جرّب» تعيد النهاية المعلّقة قبل التجربة الجديدة (كان قفل «تجربة حيّة واحدة» يبقى حتّى التحميل التالي)
  assert.deepEqual(plain(ends[2]), { token: 'tok-owner', trialId: sb.trialId, durationSec: 50 });
  const pc2 = c.pcs[c.pcs.length - 1]; // التجربة الثانية على اتّصالها هي (liveTrial يأخذ الأوّل)
  pc2.dc.emit({ type: 'session.created' });
  await flush();
  const t2 = c.calls('call-session')[1].body.trialId;
  assert.notEqual(t2, sb.trialId);
  await c.advance(20000);
  c.btn('omCallStop').click();
  await c.advance(100);
  assert.deepEqual(plain(ends[3]), { token: 'tok-owner', trialId: t2, durationSec: 20 });
  assert.equal(ends.length, 4, 'الأولى لا تُعاد مع نهاية الثانية (محاولتاها في هذه الصفحة انتهتا)');
  assert.deepEqual(Object.keys(plain(c.call().trialEnds)).sort(), [sb.trialId, t2].sort(), 'النهايتان معلّقتان معًا');

  // «التحميل التالي»: الكرت المحفوظ يعيد إرسال الاثنتين حتّى تُقبلا، ولا يُرسل بعدها
  endOk = true;
  const r = sandbox({ owner: false, state: c.state, routes: { 'call-trial-end': (b) => { ends.push(b); return [200, { ok: true }]; } } });
  await r.advance(10);
  assert.deepEqual(ends.slice(4).map((b) => b.trialId).sort(), [sb.trialId, t2].sort());
  assert.deepEqual(plain(r.call().trialEnds), {});
  await r.advance(10); r.redraw(); await r.advance(40000);
  assert.equal(ends.length, 6, 'قُبلتا = لا إرسال بعدها (ولا من المرور على الكروت)');

  // إنهاء أثناء التجهيز وردّ الجلسة بطيء: النهاية تُرسل بمعرّفها وبصفر ثانية — لا حجز بلا نهاية
  let release; const slow = new Promise((res) => { release = res; });
  const e2 = []; const x = sandbox({ owner: false, routes: {
    'call-session': async (b) => { await slow; return [200, { clientSecret: 'ek_test', model: 'm', maxSec: 240, trialId: b.trialId }]; },
    'call-trial-end': (b) => { e2.push(b); return [200, { ok: true }]; },
  } });
  x.btn('omCallTry').click();
  await x.advance(100);
  x.btn('omCallStop').click();
  await x.advance(100);
  const xt = x.calls('call-session')[0].body.trialId;
  assert.deepEqual(plain(e2), [{ token: 'tok-owner', trialId: xt, durationSec: 0 }]);
  release(); await x.advance(100);
  assert.equal(x.pcs.length, 0, 'لا اتّصال بعد الإلغاء');

  // الاتّصال الفعليّ: السعر والحجز في التأكيد نفسه، وconfirmed في الطلب
  const ph = sandbox({ owner: false, routes: { 'call-start': () => [200, { callId: 'cl1', state: 'queued' }], 'call-status': () => [200, { state: 'ringing' }] } });
  ph.btn('omCallDial').click();
  await ph.advance(100);
  assert.match(ph.confirmed[0], /\n45 نقطة لكلّ دقيقة\nيُحجز 180 نقطة/);
  assert.deepEqual(plain(ph.calls('call-start')[0].body), { confirmed: true, token: 'tok-owner', id: 'cp1' });
  // المالك: لا confirmed ولا معرّف تجربة ولا سطر سعر (الأجسام كما كانت)
  const o = sandbox({ routes: { 'call-start': () => [200, { callId: 'cl2', state: 'queued' }] } });
  o.btn('omCallDial').click();
  await o.advance(100);
  assert.doesNotMatch(o.confirmed[0], /نقطة لكلّ دقيقة/);
  assert.deepEqual(plain(o.calls('call-start')[0].body), { token: 'tok-owner', id: 'cp1' });
});

test('٢٣. التسوية لم تُحسم (billing: null): النتيجة تظهر والمتابعة تكمل أبطأ حتّى تُحسم؛ والمرور على الكروت يسوّي المعلّق في محادثة أخرى', async () => {
  let billing = null;
  const c = sandbox({ owner: false, routes: {
    'call-start': () => [200, { callId: 'cl9', state: 'queued' }],
    'call-status': () => [200, { state: 'completed', durationSec: 70, ended: true, outcome: { status: 'booked', summary: 'تمّ' }, billing }],
  } });
  c.btn('omCallDial').click();
  await c.advance(2100);
  assert.equal(c.call().state, 'completed');
  assert.equal(c.msgs().length, 3, 'النتيجة ظهرت مرّة');
  const n1 = c.calls('call-status').length;
  await c.advance(10100);
  assert.equal(c.calls('call-status').length, n1 + 1, 'استطلاع بعد ١٠ ث ما دامت التسوية معلّقة');
  assert.notEqual(c.call().billed, true);
  billing = { charged: 90, refunded: 90 };
  await c.advance(10100);
  assert.equal(c.call().billed, true);
  const n2 = c.calls('call-status').length;
  await c.advance(60000);
  assert.equal(c.calls('call-status').length, n2, 'حُسمت = توقّفت');
  assert.equal(c.msgs().length, 3, 'لا نتيجة ثانية');

  // محادثة أخرى غير مفتوحة فيها مكالمة انتهت بلا تسوية ونهاية تجربة معلّقة: المرور بعد التحميل يسوّيهما
  const other = { id: 'p2', messages: [{ role: 'assistant', content: 'x', cards: { kind: 'call', q: 'ب', chips: [], items: [], call: {
    id: 'cp2', business: 'ب', kind: 'mobile', maxMin: 4, ptsPerMin: 45, transport: 'phone', callId: 'cl7', state: 'completed', trialEnds: { ct0123456789abcdef01: 30 } } } }] };
  const sent = { status: [], ends: [] };
  const w = sandbox({ owner: false, routes: {
    'call-status': (b) => { sent.status.push(b.callId); return [200, { state: 'completed', ended: true, billing: { charged: 45, refunded: 135 } }]; },
    'call-trial-end': (b) => { sent.ends.push(b.trialId); return [200, { ok: true }]; },
  } });
  w.state.projects.push(other);
  await w.advance(4100);
  assert.deepEqual(sent.status, ['cl7']); assert.deepEqual(sent.ends, ['ct0123456789abcdef01']);
  assert.equal(other.messages[0].cards.call.billed, true);
  assert.deepEqual(plain(other.messages[0].cards.call.trialEnds), {});
  await w.advance(30000);
  assert.deepEqual(sent.status, ['cl7'], 'المرور الثاني لا يعيد ما حُسم');
});

test('٢٤. المراجعتان الثانية والثالثة: «-1» من تبويب أو جهاز آخر لا يُرسل أبدًا (ويُمحى بعد عمر السجلّ)؛ 404 يُبقي النهاية؛ مكالمة قديمة لا تكتب فوق الأحدث؛ billed يُصفَّر؛ رفضٌ بلا تسوية يُسوّى', async () => {
  const TID = 'ct0123456789abcdef01';
  // تجربة «حيّة» في تبويب آخر (-1 وبدأت للتوّ): لا تُرسل هنا أبدًا — كان يُرسل صفرًا فيُرجَع الحجز كلّه والتجربة جارية
  const sentA = [];
  const a = sandbox({ owner: false, call: { transport: 'trial', startedAt: 1_000_000 - 30_000, trialEnds: { [TID]: -1 } },
    routes: { 'call-trial-end': (b) => { sentA.push(b); return [200, { ok: true }]; } } });
  await a.advance(31000);
  assert.equal(sentA.length, 0, 'داخل نافذة حياتها = لا إرسال');
  // ولا بعد مدّتها (المراجعة الثالثة: ساعة جهاز متقدّمة كانت تُنهي تجربة حيّة مبكرًا، و«بالسقف» كان يسبق نهايتها الحقيقيّة الأقصر من
  // صفحتها) — الحجز يبقى حتّى تصل نهايتها من صفحتها
  const b = sandbox({ owner: false, call: { transport: 'trial', startedAt: 1_000_000 - 400_000, trialEnds: { [TID]: -1 } },
    routes: { 'call-trial-end': (x) => { sentA.push(x); return [200, { ok: true }]; } } });
  await b.advance(31000);
  assert.equal(sentA.length, 0);
  assert.deepEqual(plain(b.call().trialEnds), { [TID]: -1 }, 'تبقى لصفحتها');
  // بعد عمر سجلّ الخادم (٧ أيّام) لا فائدة منها: تُمحى محلّيًّا بلا إرسال
  const b9 = sandbox({ owner: false, call: { transport: 'trial', startedAt: 1_000_000 - 9 * 86400000, trialEnds: { [TID]: -1, ct11111111111111111a: 40 } },
    routes: { 'call-trial-end': (x) => { sentA.push(x); return [200, { ok: true }]; } } });
  await b9.advance(100);
  assert.deepEqual(sentA.map((x) => x.trialId), ['ct11111111111111111a'], 'المنتهية تُرسل، و«-1» لا');
  assert.deepEqual(plain(b9.call().trialEnds), {});

  // 404 (تجربة حساب آخر على متصفّح مشترك): تبقى النهاية لصاحبها ولا تُعاد في هذه الصفحة
  const sentB = [];
  const g = sandbox({ owner: false, call: { trialEnds: { [TID]: 30 } }, routes: { 'call-trial-end': (x) => { sentB.push(x); return [404, { error: 'not_found' }]; } } });
  await g.advance(60000);
  assert.equal(sentB.length, 1);
  assert.deepEqual(plain(g.call().trialEnds), { [TID]: 30 }, 'لا تُمحى');

  // مكالمة قديمة لم تُحسم تسويتها والكرت انتقل لأحدث: تُسوّى بصمت ولا تكتب فوقه؛ وbilled يُصفَّر مع كلّ مكالمة جديدة
  const st = {
    cl1: [200, { state: 'completed', durationSec: 40, ended: true, outcome: { status: 'booked', summary: 'الأولى' }, billing: { charged: 45, refunded: 135 } }],
    cl2: [200, { state: 'completed', durationSec: 40, ended: true, outcome: { status: 'booked', summary: 'الثانية' }, billing: null }],
    cl3: [200, { state: 'ringing' }],
  };
  let seq = 0;
  const c = sandbox({ owner: false, routes: {
    'call-start': () => [200, { callId: 'cl' + (++seq), state: 'queued' }],
    'call-status': (x) => st[x.callId],
  } });
  c.btn('omCallDial').click();
  await c.advance(2100);
  assert.equal(c.call().billed, true, 'الأولى حُسمت');
  c.btn('omCallDial').click();
  await c.advance(100);
  assert.equal(c.call().callId, 'cl2');
  assert.equal(c.call().billed, false, 'مكالمة جديدة = لم تُحسم بعد');
  await c.advance(2100);
  assert.equal(c.call().state, 'completed');
  const m4 = c.msgs().length;
  c.btn('omCallDial').click();
  await c.advance(100);
  assert.equal(c.call().callId, 'cl3');
  const n2 = c.calls('call-status').filter((f) => f.body.callId === 'cl2').length;
  await c.advance(10100);
  assert.equal(c.calls('call-status').filter((f) => f.body.callId === 'cl2').length, n2 + 1, 'الثانية تُستطلع بصمت حتّى تُحسم');
  st.cl2 = [200, { state: 'failed', durationSec: 40, ended: true, outcome: { status: 'failed', summary: 'قديمة' }, billing: { charged: 45, refunded: 135 } }];
  await c.advance(10100);
  assert.equal(c.call().callId, 'cl3'); assert.equal(c.call().state, 'ringing', 'لم تكتب فوق الأحدث');
  assert.equal(c.call().outcome, null); assert.equal(c.msgs().length, m4, 'لا نتيجة من القديمة');
  const n3 = c.calls('call-status').filter((f) => f.body.callId === 'cl2').length;
  assert.equal(n3, n2 + 2, 'القديمة أُعيد استطلاعها بعد billing:null فحُسمت (المراجعة الثالثة: لم يكن هذا مفحوصًا)');
  await c.advance(60000);
  assert.equal(c.calls('call-status').filter((f) => f.body.callId === 'cl2').length, n3, 'حُسمت = توقّفت');

  // رفض الخدمة ولم يُحسم ردّ الحجز (callId + unsettled): الكرت يحمل الرقم فيسوّيه سؤال الحالة؛ وإن تعثّر يكمله المرور
  let ok = false;
  const r = sandbox({ owner: false, routes: {
    'call-start': () => [502, { error: 'relay_error', status: 500, callId: 'cl8', unsettled: true }],
    'call-status': () => (ok ? [200, { state: 'failed', ended: true, billing: { charged: 0, refunded: 180 } }] : [503, { error: 'unavailable' }]),
  } });
  r.btn('omCallDial').click();
  await r.advance(100);
  assert.equal(r.call().callId, 'cl8'); assert.equal(r.call().state, 'failed'); assert.equal(r.call().billed, false);
  assert.equal(r.msgs().length, 2, 'لا نتيجة لمكالمة لم تبدأ');
  ok = true;
  await r.advance(4100);
  assert.equal(r.call().billed, true, 'المرور سوّاها');

  // جواب التسوية يصل والكرت انتقل لمكالمة أحدث أثناء السؤال: لا تُعلَّم الأحدث مسوّاة
  let go; const late = new Promise((res) => { go = res; });
  const w = sandbox({ owner: false, call: { transport: 'phone', callId: 'cl7', state: 'completed' },
    routes: { 'call-status': async () => { await late; return [200, { state: 'completed', ended: true, billing: { charged: 45, refunded: 135 } }]; } } });
  await w.advance(4100);
  Object.assign(w.call(), { callId: 'cl9', state: 'ringing', billed: false });
  go(); await w.advance(100);
  assert.equal(w.call().billed, false);
});

test('٢٥. المراجعة الثالثة: «جرّب» تعيد نهاية معلّقة على كرت في محادثة أخرى وتنتظرها قبل طلب الجلسة — قفل التجربة للمستخدم كلّه', async () => {
  const T1 = 'ct0123456789abcdef01';
  const other = { id: 'p2', messages: [{ role: 'assistant', content: 'x', cards: { kind: 'call', q: 'ب', chips: [], items: [], call: {
    id: 'cp2', business: 'ب', kind: 'mobile', maxMin: 4, ptsPerMin: 45, transport: 'trial', state: 'completed', trialEnds: { [T1]: 60 } } } }] };
  let down = true, locked = T1; // قفل «تجربة حيّة» عند الخادم لـT1 حتّى تُقبل نهايتها
  const order = [];
  const c = sandbox({ owner: false, routes: {
    'call-trial-end': async (b) => {
      if (down) throw new Error('offline');
      await new Promise((r) => c.setTimeout(r, 1000)); // ردّ بطيء: الجلسة لا تسبقه إلى القفل
      if (locked === b.trialId) locked = null;
      order.push('end:' + b.trialId); return [200, { ok: true }];
    },
    'call-session': (b) => { order.push('session'); return locked ? [409, { error: 'busy' }] : [200, { clientSecret: 'ek_test', model: 'm', maxSec: 240, trialId: b.trialId }]; },
  } });
  c.state.projects.push(other);
  await c.advance(31000); // المرور بعد التحميل + إعادة واحدة — كلاهما فشل والشبكة مقطوعة
  assert.equal(c.calls('call-trial-end').length, 2);
  down = false;
  c.btn('omCallTry').click();
  await c.advance(1500);
  assert.deepEqual(order, ['end:' + T1, 'session'], 'النهاية القديمة قُبلت أوّلًا ثمّ طُلبت الجلسة');
  assert.notEqual(c.call().state, 'failed', 'لا «عندك مكالمة جارية»');
  assert.equal(c.pcs.length, 1, 'الجلسة فُتحت');
  assert.deepEqual(plain(other.messages[0].cards.call.trialEnds), {});
});

test('٢٦. المراجعة الرابعة: «جرّب» بعد «إنهاء» مباشرة تنتظر النهاية الجارية قبل طلب الجلسة، وبحدّ ٣ ث إن علقت؛ وأوّل billing: null يمدّ المتابعة فتُحسم في الصفحة', async () => {
  // النهاية ما زالت في الطريق عند الضغط: الطلب ينتظرها (كان يسبقها إلى قفل التجربة فيُرفض «مكالمة جارية»)
  let locked = null; const order = [];
  const c = sandbox({ owner: false, routes: {
    'call-trial-end': async (b) => { await new Promise((r) => c.setTimeout(r, 1000)); if (locked === b.trialId) locked = null; order.push('end:' + b.durationSec); return [200, { ok: true }]; },
    'call-session': (b) => { order.push('session'); if (locked) return [409, { error: 'busy' }]; locked = b.trialId; return [200, { clientSecret: 'ek_test', model: 'm', maxSec: 240, trialId: b.trialId }]; },
  } });
  await liveTrial(c);
  await c.advance(30000);
  c.btn('omCallStop').click();
  await flush();
  assert.equal(c.calls('call-trial-end').length, 1, 'النهاية أُرسلت وما زالت جارية');
  c.btn('omCallTry').click();
  await c.advance(1500);
  assert.deepEqual(order, ['session', 'end:30', 'session']);
  assert.notEqual(c.call().state, 'failed');
  assert.equal(c.pcs.length, 2, 'الجلسة الثانية فُتحت');

  // نهاية معلّقة لا يأتي ردّها أبدًا: الطلب يمضي بعد ٣ ث لا يعلق في «المايك»
  const h = sandbox({ owner: false, call: { trialEnds: { ct0123456789abcdef01: 60 } }, routes: {
    'call-trial-end': () => new Promise(() => {}),
    'call-session': (b) => [200, { clientSecret: 'ek_test', model: 'm', maxSec: 240, trialId: b.trialId }],
  } });
  h.btn('omCallTry').click();
  await h.advance(2900);
  assert.equal(h.calls('call-session').length, 0, 'ينتظر');
  await h.advance(200);
  assert.equal(h.calls('call-session').length, 1, 'وبعد ٣ ث يمضي');

  // مطالبة تسوية عالقة عند الخادم تُعاد بعد ٦ دقائق: انتهت قرب السقف وbilling: null حتّى الدقيقة ١١ ← المتابعة تمتدّ وتُحسم في الصفحة
  const t0 = 1_000_000;
  const k = sandbox({ owner: false, routes: {
    'call-start': () => [200, { callId: 'cl5', state: 'queued' }],
    'call-status': () => [200, { state: 'completed', durationSec: 170, ended: true, outcome: { status: 'booked', summary: 'تمّ' },
      billing: k.clock.now < t0 + 11 * 60000 ? null : { charged: 135, refunded: 45 } }],
  } });
  k.btn('omCallDial').click();
  await k.advance(11 * 60000 + 30000);
  assert.equal(k.call().billed, true, 'حُسمت بعد حدّ العشر دقائق القديم');
  assert.equal(k.call().state, 'completed');
  // وتسوية لا تأتي أبدًا وعطل في آخرها: المتابعة تقف بحدّها، والمكالمة المنتهية لا تصير «انتهت المهلة»
  let n = 0;
  const z = sandbox({ owner: false, routes: {
    'call-start': () => [200, { callId: 'cl6', state: 'queued' }],
    'call-status': () => (++n < 3 ? [200, { state: 'completed', durationSec: 60, ended: true, outcome: { status: 'booked', summary: 'تمّ' }, billing: null }] : [503, { error: 'storage' }]),
  } });
  z.btn('omCallDial').click();
  await z.advance(40 * 60000);
  assert.equal(z.call().state, 'completed');
  assert.ok(z.calls('call-status').length < 100, 'عطل بعد انتهائها يُستطلع كلّ ١٠ ث لا ثانيتين: ' + z.calls('call-status').length);
  const m = z.calls('call-status').length;
  await z.advance(10 * 60000);
  assert.equal(z.calls('call-status').length, m, 'وقفت بحدّها');
});

test('٢٧. المراجعة الخامسة: عودة بعد حدّ المتابعة وأوّل ردّ عطل عابر لا يحكم «انتهت المهلة» فتضيع النتيجة؛ وbilling: null دائم يمتدّ مرّة ويقف بلا حفظ مكرّر', async () => {
  // أُغلق التبويب أثناء المكالمة وعاد بعد ١٢ دقيقة من بدئها: الحدّ فات، وأوّل سؤال 503 ثمّ تصل النتيجة
  let first = true;
  const v = sandbox({ owner: false, call: { transport: 'phone', callId: 'cl8', state: 'in-progress', startedAt: 1_000_000 - 12 * 60000, endedAt: 0 },
    routes: { 'call-status': () => {
      if (first) { first = false; return [503, { error: 'storage' }]; }
      return [200, { state: 'completed', durationSec: 95, ended: true, outcome: { status: 'booked', summary: 'تمّ الحجز' }, billing: { charged: 90, refunded: 90 } }];
    } } });
  await v.advance(30000);
  assert.equal(v.call().state, 'completed', 'لا «انتهت المهلة» من عطل واحد');
  assert.equal(v.call().outcome && v.call().outcome.status, 'booked');
  assert.equal(v.msgs().length, 3, 'النتيجة وصلت المحادثة');
  assert.equal(v.call().billed, true);
  // والعطل الدائم بعد الحدّ: مهلة السماح وحدها ثمّ «انتهت المهلة» ويقف
  const w = sandbox({ owner: false, call: { transport: 'phone', callId: 'cl9', state: 'in-progress', startedAt: 1_000_000 - 12 * 60000, endedAt: 0 },
    routes: { 'call-status': () => [502, { error: 'relay_error' }] } });
  await w.advance(5 * 60000);
  assert.equal(w.call().state, 'timeout');
  const nw = w.calls('call-status').length;
  assert.ok(nw > 1 && nw < 20, 'سماح واحد بحدّه: ' + nw);
  await w.advance(10 * 60000);
  assert.equal(w.calls('call-status').length, nw);

  // billing: null في كلّ ردّ: المتابعة تمتدّ مرّة واحدة ١٥ دقيقة من أوّل null وتقف، والردّ المطابق لا يحفظ المحادثات
  let firstNull = 0, lastPoll = 0;
  const y = sandbox({ owner: false, routes: {
    'call-start': () => [200, { callId: 'cl7', state: 'queued' }],
    'call-status': () => { if (!firstNull) firstNull = y.clock.now; lastPoll = y.clock.now;
      return [200, { state: 'completed', durationSec: 60, ended: true, outcome: { status: 'booked', summary: 'تمّ' }, billing: null }]; },
  } });
  y.btn('omCallDial').click();
  await y.advance(60000);
  const s1 = y.saves;
  await y.advance(39 * 60000);
  assert.equal(y.saves, s1, 'ردود مطابقة لا تحفظ');
  const ny = y.calls('call-status').length;
  assert.ok(lastPoll - firstNull >= 14 * 60000 && lastPoll - firstNull <= 15 * 60000, 'تمتدّ مرّة واحدة ١٥ دقيقة: ' + (lastPoll - firstNull));
  await y.advance(10 * 60000);
  assert.equal(y.calls('call-status').length, ny, 'لا استطلاع بعد حدّها');
  assert.equal(y.call().state, 'completed');
});
