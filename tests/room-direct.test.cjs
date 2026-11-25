'use strict';
// v-talk-room-direct: في الغرفة المدفوعة (sub / own) كلّ ضيف يتّصل بكلّ ضيف آخر مباشرة للصور (بلا خادم وبلا خدمة مدفوعة)،
// وصاحب الغرفة يمرّر المصافحة فقط (dvs، بوسم المحاولة n). كلّ ضيف يخبر صاحب الغرفة بمن يراه مباشرة (dvok) فيمرّر له صاحب الغرفة
// ما لا يراه فقط (ومن لم يُخبر — صفحة قديمة أو لم يصل بعد — يبقى له التمرير القديم كاملًا).
// تُستخرج الدوالّ الحقيقيّة من room.html (طريقة fnSrc في tests/room-flip.test.cjs) وتُشغَّل في vm مع RTCPeerConnection مزيّف
// يسجّل كلّ شيء، وقنوات بيانات مزيّفة، ومؤقّتات وساعة يحرّكها الاختبار.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
function fnSrc(src, head) {
  const a = src.indexOf(head);
  assert.ok(a >= 0, head);
  let d = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
  return src.slice(a, i + 1);
}
const I18N = new Function(html.slice(html.indexOf('var I18N = {'), html.indexOf('var T = Object.assign')) + '; return I18N;')();
const T = I18N.en;
const tick = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };
const FNS = ['function camTrack(', 'function afterCam(', 'function pickOthers(', 'function revideo(', 'function directOn(', 'function isSdp(',
  'function dvRate(', 'function passDv(', 'function dvOk(', 'function capRate(', 'function tile(', 'function drawVids(', 'function fromHost(',
  'function left(', 'function dvFrom(', 'function dvRtc(', 'function dvSync(', 'function dvReport(', 'function dvSees(', 'function dvLink(',
  'function dvCall(', 'function dvLost(', 'function dvClose(', 'function dvStop(', 'function dvSig(',
  'function gathered(', 'function poll(', 'function admit(', 'function drop(', 'function capOf(', 'var send = function', 'var toHost = function'];
const SRC = FNS.map((h) => fnSrc(html, h)).join('\n');
const J = (v) => JSON.parse(JSON.stringify(v));      // vm objects -> plain (deepStrictEqual checks prototypes)
const NRE = /^[a-z0-9]{4,16}$/;

/** عنصر DOM مزيّف (يكفي tile / drawVids). */
function el(tag) {
  const cls = new Set();
  const e = {
    tag, parentNode: null, kids: [], srcObject: null, textContent: '',
    get className() { return Array.from(cls).join(' '); }, set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    classList: { toggle(c, on) { if (on === undefined) on = !cls.has(c); if (on) cls.add(c); else cls.delete(c); return on; }, contains: (c) => cls.has(c) },
    appendChild(k) { if (k.parentNode) k.parentNode.kids = k.parentNode.kids.filter((x) => x !== k); k.parentNode = e; e.kids.push(k); return k; },
    remove() { if (e.parentNode) e.parentNode.kids = e.parentNode.kids.filter((x) => x !== e); e.parentNode = null; },
    play() { return Promise.resolve(); },
  };
  return e;
}
/** خطّ فيديو مزيّف: المرسل يسجّل كلّ replaceTrack. */
function trx(kind, direction) {
  const sender = { replaced: [], params: null, replaceTrack(t) { this.replaced.push(t); return Promise.resolve(); }, getParameters() { return { encodings: [{}] }; }, setParameters(p) { this.params = p; return Promise.resolve(); } };
  return { kind, direction, sender, receiver: { track: { kind } } };
}
/** قناة بيانات مزيّفة: ما يُرسل يُحفظ مفكوكًا. */
function chan(state) { return { readyState: state || 'open', bufferedAmount: 0, out: [], send(s) { this.out.push(JSON.parse(s)); } }; }
const camStream = (name) => { const tr = { kind: 'video', name, stop() {} }; return { track: tr, getVideoTracks: () => [tr], getTracks: () => [tr] }; };
/** خطّ الفيديو الوحيد الذي تقبله isSdp (قسم وسائط واحد، فيديو). */
const MV = '\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';
const SDP = (s) => 'v=0\r\n' + s + MV;
/** SDP صالحة طولها len حرفًا بالضبط (لحدّ 16000). */
const SDPN = (len) => 'v=0\r\n' + 'x'.repeat(len - 5 - MV.length) + MV;
const AUDIO = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const APP = '\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';

/** الصفحة في sandbox. hooks: createOffer(pc) / setRemote(pc, d) / gathering (iceGatheringState عند الإنشاء). */
function page(init) {
  let now = 1_000_000, tid = 0, pcN = 0;
  const timers = [], pcs = [], hooks = {}, calls = [];
  let reply = () => ({});
  class PC {
    constructor(cfg) {
      this.n = ++pcN; this.cfg = cfg; this.trs = []; this.log = []; this.remotes = [];
      this.connectionState = 'new'; this.iceConnectionState = 'new'; this.signalingState = 'stable';
      this.iceGatheringState = hooks.gathering || 'complete'; this.localDescription = null; this.closed = 0;
      pcs.push(this);
    }
    addTransceiver(kind, o) { this.log.push('addTransceiver:' + kind + ':' + (o && o.direction)); const t = trx(kind, o && o.direction); this.trs.push(t); return t; }
    getTransceivers() { return this.trs.slice(); }
    createOffer() { this.log.push('createOffer'); return hooks.createOffer ? hooks.createOffer(this) : Promise.resolve({ type: 'offer', sdp: SDP('offer ' + this.n) }); }
    createAnswer() { this.log.push('createAnswer'); return Promise.resolve({ type: 'answer', sdp: SDP('answer ' + this.n) }); }
    setLocalDescription(d) { this.log.push('setLocal:' + d.type); this.localDescription = { type: d.type, sdp: d.sdp }; this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable'; return Promise.resolve(); }
    setRemoteDescription(d) {
      this.log.push('setRemote:' + d.type); this.remotes.push({ type: d.type, sdp: d.sdp });
      if (hooks.setRemote) { const r = hooks.setRemote(this, d); if (r) return r; }
      if (d.type === 'offer') { this.signalingState = 'have-remote-offer'; if (!this.trs.some((t) => t.receiver.track.kind === 'video')) this.trs.push(trx('video', 'recvonly')); }
      else this.signalingState = 'stable';
      return Promise.resolve();
    }
    close() { this.closed++; this.connectionState = 'closed'; this.signalingState = 'closed'; }
    addEventListener() {}
    fire(state) { this.connectionState = state; if (this.onconnectionstatechange) this.onconnectionstatechange(); }
    track(kind, stream) { this.ontrack({ track: { kind }, streams: stream ? [stream] : [], transceiver: this.trs[0] }); }
  }
  const vids = el('div'); vids.hidden = true;
  const ctx = {
    T, MAX: 10, RTC: { iceServers: [{ urls: 'stun:x' }] }, role: 'guest', myId: 'g2', myName: 'Omran', roomPlan: 'sub', code: '1234', key: 'k',
    quiet: 0, asks: [], cap: 10, iceFor: '1234', icePromise: Promise.resolve(), token: '', error: '', busy: '', pollT: null,
    peers: new Map(), members: [], dv: null, dvStamps: new Map(), cam: null, camOn: false, facing: 'user', gv: [], gstreams: [], slots: [],
    tiles: new Map(), heard: new Map(), draws: 0, plans: 0,
    draw() { ctx.draws++; }, say() {}, fmt: (s, n) => String(s).replace('{n}', n), cleanName: (v) => String(v || 'guest'),
    $: (id) => (id === 'vids' ? vids : null), setMic: () => Promise.resolve(true), setCam: () => Promise.resolve(true), gone() {}, hear() {}, remix() {},
    tellRoster() {}, loadPlan() { ctx.plans++; }, leftLine: () => '', endFree() {}, clearInterval() {},
    call(b) { calls.push(J(b)); return Promise.resolve(reply(b)); },
    setTimeout(fn, ms) { const id = ++tid; timers.push({ id, fn, at: now + (ms || 0) }); return id; },
    clearTimeout(id) { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    Date: { now: () => now }, MediaStream: class { constructor(tr) { this.tracks = tr; } }, RTCPeerConnection: PC, document: { createElement: el },
  };
  Object.assign(ctx, init || {});
  vm.runInNewContext(SRC, ctx);
  return {
    ctx, pcs, hooks, calls, vids, timers,
    setReply(f) { reply = f; },
    async advance(ms) {
      const end = now + ms;
      for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.fn(); await tick(); }
      now = end; await tick();
    },
  };
}

// ---- صاحب الغرفة
/** ضيف عند صاحب الغرفة. cap: أخبر بـ dvok (صفحة جديدة) ومن يرى مباشرة. */
function hostGuest(id, cam, see) {
  const vtrack = { kind: 'video', id: 'v-' + id };
  const g = { dc: chan(), name: 'N-' + id, vtx: [trx('video'), trx('video'), trx('video')], cam: !!cam, vtrack, vstream: { id: 's-' + id }, pc: { close() {} } };
  if (see) { g.dvCap = true; g.dvSee = see; }
  return g;
}
function hostPage(plan, guests) {
  const p = page({ role: 'host', myId: 'host', roomPlan: plan });
  for (const [id, cam, see] of guests) p.ctx.peers.set(id, hostGuest(id, cam, see));
  return p;
}
const out = (p, id, t) => p.ctx.peers.get(id).dc.out.filter((m) => !t || m.t === t);
const last = (a) => a[a.length - 1];
const OFFER = { type: 'offer', sdp: SDP('o') };
const N = 'abcd1234';
/** ما على خطّي التمرير (1 و 2) لضيف عند صاحب الغرفة: المعرّفات في آخر vslots، والمسارات على vtx. */
const relay = (p, id) => last(out(p, id, 'vslots')).list.slice(1).map((x) => x && x.id);
const relayTracks = (p, id) => p.ctx.peers.get(id).vtx.slice(1).map((t) => last(t.sender.replaced));

test('isSdp: نصّ يبدأ بـ v=0 وسطر جديد، حروف ASCII قابلة للطباعة و\\r\\n فقط، 16000 حرف على الأكثر، وقسم وسائط واحد بالضبط وهو فيديو', () => {
  const p = page();
  assert.equal(SDPN(16000).length, 16000); assert.equal(SDPN(16001).length, 16001);
  const ok = [SDP(''), 'v=0\nm=video 9 UDP/TLS/RTP/SAVPF 96\n', 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96', SDP('o=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n'),
    'v=0\n~!@#$%^&*()_+{}|:"<>? ' + MV, SDPN(16000),
    SDP('a=x m=audio 9 y'), SDP('a=group:BUNDLE 0'), SDP('am=audio 9')];      // m= ليست في أوّل السطر: ليست قسمًا
  for (const s of ok) assert.equal(p.ctx.isSdp(s), true, JSON.stringify(s.slice(0, 40)));
  const bad = ['v=0', 'v=0' + 'm=video 9 X 96', 'v=0 ' + MV, ' v=0' + MV, 'v=1' + MV, 'x=0\r\nnope' + MV, '', SDPN(16001),
    SDP('é'), SDP('مرحبا'), SDP('a\tb'), SDP('a\u0000b'), SDP('a\u007fb'), SDP('a\u0085b'), SDP('a b'), SDP('\u001b[31m'),
    42, null, undefined, {}, [SDP('')]];
  // بلا قسم وسائط، أو قسم غير الفيديو، أو أكثر من قسم
  bad.push('v=0\r\n', 'v=0\n', 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n', 'v=0\r\nm=VIDEO 9 X 96\r\n', 'v=0\r\nm=video9 X 96\r\n', 'v=0\r\nm= video 9\r\n',
    AUDIO, 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n', 'v=0\r\nm=text 9 X 96\r\n',
    SDP('m=video 9 UDP/TLS/RTP/SAVPF 97'), 'v=0' + MV + 'm=video 9 UDP/TLS/RTP/SAVPF 97\r\n', 'v=0' + MV.slice(0, -2) + APP, 'v=0' + APP + MV.slice(2),
    AUDIO + MV.slice(2), 'v=0' + MV + 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n');
  for (const s of bad) assert.equal(p.ctx.isSdp(s), false, JSON.stringify(typeof s === 'string' ? s.slice(0, 40) : s));
});

test('المضيف في غرفة مدفوعة يمرّر dvs صحيحة بين ضيفين مفتوحين مع وسمها n، و from هو المرسِل الحقيقيّ دائمًا', () => {
  for (const plan of ['sub', 'own']) {
    const p = hostPage(plan, [['g1'], ['g2']]);
    p.ctx.passDv('g1', { t: 'dvs', to: 'g2', from: 'g9', n: N, d: { type: 'offer', sdp: SDP('a'), extra: 'x' }, junk: 1 });
    assert.deepEqual(out(p, 'g2'), [{ t: 'dvs', from: 'g1', n: N, d: { type: 'offer', sdp: SDP('a') } }], plan + ': from = المرسل لا ما كتبه، والحقول الزائدة تُحذف');
    assert.deepEqual(out(p, 'g1'), [], 'لا شيء يرجع للمرسل');
    p.ctx.passDv('g2', { t: 'dvs', to: 'g1', n: 'zz99', d: { type: 'answer', sdp: SDP('b') } });
    assert.deepEqual(out(p, 'g1'), [{ t: 'dvs', from: 'g2', n: 'zz99', d: { type: 'answer', sdp: SDP('b') } }], 'الجواب يحمل الوسم نفسه');
  }
  // 16000 حرف بالضبط مقبول، والوسم من 4 إلى 16
  const p = hostPage('sub', [['g1'], ['g2']]);
  p.ctx.passDv('g1', { to: 'g2', n: 'a'.repeat(16), d: { type: 'offer', sdp: SDPN(16000) } });
  p.ctx.passDv('g1', { to: 'g2', n: '0000', d: OFFER });
  assert.equal(out(p, 'g2').length, 2);
});

test('المضيف يرفض: غرفة مجّانيّة، to=host، to=نفسه، هدف مجهول أو مغلق، نوع خاطئ، ليس SDP، أطول من 16000، غير ASCII، ليس قسم فيديو واحدًا، بلا وسم أو وسم غير صالح', () => {
  const p = hostPage('sub', [['g1'], ['g2'], ['g3']]);
  p.ctx.peers.get('g3').dc.readyState = 'closing';
  p.ctx.peers.set('g4', { ...hostGuest('g4'), dc: null });
  const bad = [
    { to: 'host', d: OFFER }, { to: 'g1', d: OFFER }, { to: 'g9', d: OFFER }, { to: 'g3', d: OFFER }, { to: 'g4', d: OFFER },
    { to: 'g2', d: { type: 'pranswer', sdp: SDP('x') } }, { to: 'g2', d: { type: 'rollback', sdp: SDP('x') } }, { to: 'g2', d: { sdp: SDP('x') } },
    { to: 'g2', d: { type: 'offer', sdp: 'x=0 nope' } }, { to: 'g2', d: { type: 'offer', sdp: 'v=0' } }, { to: 'g2', d: { type: 'offer', sdp: 42 } }, { to: 'g2', d: { type: 'offer' } },
    { to: 'g2', d: { type: 'offer', sdp: SDPN(16001) } }, { to: 'g2', d: { type: 'offer', sdp: SDP('سلام') } },
    { to: 'g2', d: { type: 'offer', sdp: 'v=0\r\n' } }, { to: 'g2', d: { type: 'offer', sdp: AUDIO } }, { to: 'g2', d: { type: 'answer', sdp: AUDIO } },
    { to: 'g2', d: { type: 'offer', sdp: SDP('m=video 9 UDP/TLS/RTP/SAVPF 97') } }, { to: 'g2', d: { type: 'offer', sdp: 'v=0' + MV.slice(0, -2) + APP } },
    { to: 'g2', d: { type: 'offer', sdp: SDP('a\u0000b') } }, { to: 'g2', d: { type: 'offer', sdp: SDP('<script> ') } },
    { to: 'g2', d: null }, { to: 'g2', d: 'v=0\r\n' }, { to: 'g2' },
    { to: 7, d: OFFER }, { to: ['g2'], d: OFFER }, { d: OFFER },
  ].map((m) => Object.assign({ n: N }, m));
  // الوسم: مفقود، ليس نصًّا، قصير، طويل، حروف كبيرة أو رموز
  for (const n of [undefined, null, 1234, ['abcd'], '', 'abc', 'a'.repeat(17), 'ABCD', 'ab-cd', 'ab cd', 'abcd\n', 'عربي12']) bad.push({ to: 'g2', n, d: OFFER });
  for (const m of bad) p.ctx.passDv('g1', m);
  for (const id of ['g1', 'g2', 'g3']) assert.deepEqual(out(p, id), [], id);
  assert.equal(p.ctx.peers.get('g4').dc, null);
  // غرفة مجّانيّة (أو بلا خطّة معروفة): لا تمرير أبدًا
  for (const plan of ['free', '', 'weird']) {
    const f = hostPage(plan, [['g1'], ['g2']]);
    f.ctx.passDv('g1', { to: 'g2', n: N, d: OFFER });
    assert.deepEqual(out(f, 'g2'), [], plan);
  }
  // ليس مضيفًا
  const g = hostPage('sub', [['g1'], ['g2']]); g.ctx.role = 'guest';
  g.ctx.passDv('g1', { to: 'g2', n: N, d: OFFER });
  assert.deepEqual(out(g, 'g2'), []);
});

test('المضيف: قناة الهدف مزدحمة (bufferedAmount فوق 262144) = رفض لا يُحسب من الحصّة', () => {
  const p = hostPage('sub', [['g1'], ['g2']]);
  const dc = p.ctx.peers.get('g2').dc;
  dc.bufferedAmount = 262145;
  for (let i = 0; i < 20; i++) p.ctx.passDv('g1', { to: 'g2', n: N, d: OFFER });
  assert.deepEqual(out(p, 'g2'), [], 'مزدحمة: لا شيء');
  dc.bufferedAmount = 262144;
  p.ctx.passDv('g1', { to: 'g2', n: N, d: OFFER });
  assert.equal(out(p, 'g2').length, 1, '262144 بالضبط مقبول');
  dc.bufferedAmount = undefined;
  for (let i = 0; i < 10; i++) p.ctx.passDv('g1', { to: 'g2', n: N, d: OFFER });
  assert.equal(out(p, 'g2').length, 6, 'الحصّة كاملة (6) لم يأكل منها الرفض');
});

test('المضيف: 6 مصافحات في 10 ثوانٍ لكلّ زوج (من>إلى)، والسابعة تُرفض؛ الاتّجاه المعاكس وزوج آخر لهما عدّادهما، وبعد 10 ثوانٍ تعود', async () => {
  const p = hostPage('sub', [['g1'], ['g2'], ['g3']]);
  for (let i = 0; i < 7; i++) p.ctx.passDv('g1', { to: 'g2', n: N, d: { type: 'offer', sdp: SDP('n' + i) } });
  assert.equal(out(p, 'g2').length, 6);
  assert.equal(last(out(p, 'g2')).d.sdp, SDP('n5'), 'السابعة لم تمرّ');
  p.ctx.passDv('g2', { to: 'g1', n: N, d: OFFER });
  p.ctx.passDv('g1', { to: 'g3', n: N, d: OFFER });
  p.ctx.passDv('g3', { to: 'g2', n: N, d: OFFER });
  assert.equal(out(p, 'g1').length, 1, 'g2>g1 عدّاد آخر'); assert.equal(out(p, 'g3').length, 1, 'g1>g3 عدّاد آخر');
  assert.equal(out(p, 'g2').length, 7, 'g3>g2 عدّاد آخر');
  await p.advance(9999);
  p.ctx.passDv('g1', { to: 'g2', n: N, d: OFFER });
  assert.equal(out(p, 'g2').length, 7, 'ما زالت داخل العشر ثوانٍ');
  await p.advance(1);
  p.ctx.passDv('g1', { to: 'g2', n: N, d: OFFER });
  assert.equal(out(p, 'g2').length, 8, 'بعد 10 ثوانٍ تعود');
  // المرفوض لا يُحسب: هدف مجهول، أو وسم غير صالح
  const q = hostPage('sub', [['g1'], ['g2']]);
  for (let i = 0; i < 50; i++) { q.ctx.passDv('g1', { to: 'g9', n: N, d: OFFER }); q.ctx.passDv('g1', { to: 'g2', n: 'X', d: OFFER }); }
  for (let i = 0; i < 6; i++) q.ctx.passDv('g1', { to: 'g2', n: N, d: OFFER });
  assert.equal(out(q, 'g2').length, 6, 'المرفوض لا يُحسب');
});

test('المضيف: 40 مصافحة في 10 ثوانٍ لكلّ ضيف مرسِل مهما تعدّد الأهداف؛ مرسِل آخر لا يتأثّر، وبعد 10 ثوانٍ تعود', async () => {
  const ids = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9'];
  const p = hostPage('sub', ids.map((id) => [id]));
  for (const to of ids.slice(1, 8)) for (let i = 0; i < 6; i++) p.ctx.passDv('g1', { to, n: N, d: OFFER });      // 42 محاولة، 6 لكلّ زوج
  assert.deepEqual(ids.slice(1, 8).map((id) => out(p, id).length), [6, 6, 6, 6, 6, 6, 4], 'الـ41 والـ42 رُفضتا');
  p.ctx.passDv('g1', { to: 'g9', n: N, d: OFFER });
  assert.equal(out(p, 'g9').length, 0, 'g1 استنفد الأربعين حتّى لهدف جديد');
  p.ctx.passDv('g3', { to: 'g9', n: N, d: OFFER });
  assert.equal(out(p, 'g9').length, 1, 'g3 لها عدّادها');
  await p.advance(10000);
  p.ctx.passDv('g1', { to: 'g9', n: N, d: OFFER });
  assert.equal(out(p, 'g9').length, 2, 'بعد 10 ثوانٍ تعود');
});

test('المضيف: رسائل dvs و dvok على قناة الضيف (dc.onmessage في admit) تذهب إلى passDv و dvOk باسم صاحب القناة', async () => {
  const p = hostPage('sub', [['g1']]);
  p.ctx.asks.push({ id: 'g5', name: 'New', offer: SDP('join') });
  p.ctx.admit('g5'); await tick();
  const pc = last(p.pcs);
  assert.ok(p.ctx.peers.has('g5'));
  assert.equal(pc.cfg, p.ctx.RTC, 'رابط صاحب الغرفة يبقى بخوادم RTC كاملة');
  const dc = chan();
  pc.ondatachannel({ channel: dc }); dc.onopen();
  dc.onmessage({ data: JSON.stringify({ t: 'dvs', from: 'g1', to: 'g1', n: N, d: { type: 'offer', sdp: SDP('via-dc') } }) });
  assert.deepEqual(out(p, 'g1', 'dvs'), [{ t: 'dvs', from: 'g5', n: N, d: { type: 'offer', sdp: SDP('via-dc') } }]);
  dc.onmessage({ data: '{not json' });
  dc.onmessage({ data: JSON.stringify({ t: 'dvs', to: 'g5', n: N, d: OFFER }) });
  assert.equal(out(p, 'g1', 'dvs').length, 1);
  assert.equal(dc.out.filter((m) => m.t === 'dvs').length, 0, 'لنفسه: لا');
  assert.deepEqual(last(dc.out.filter((m) => m.t === 'dv')), { t: 'dv', on: true, cams: [], ids: [] }, 'الضيف الجديد يسمع dv on عند فتح القناة (لا أحد أخبر بعد)');
  // dvok: g5 يصير ممّن يتّصلون مباشرة، والكلّ يسمع ids الجديدة
  const g5 = p.ctx.peers.get('g5');
  dc.onmessage({ data: JSON.stringify({ t: 'dvok', ids: ['g1', 'g5', 'g7'] }) });
  assert.equal(g5.dvCap, true); assert.deepEqual(J(g5.dvSee), ['g1']);
  assert.deepEqual(last(out(p, 'g1', 'dv')).ids, ['g5']);
  assert.ok(!p.ctx.peers.get('g1').dvCap, 'dvok من قناة g5 لا يمسّ g1');
});

test('revideo في غرفة مدفوعة بلا ضيف أخبر (dvCap): التمرير القديم كاملًا كما في المجّانيّة، و dv on مع الكاميرات و ids فارغة', () => {
  for (const plan of ['sub', 'own']) {
    const p = hostPage(plan, [['g1', true], ['g2', false], ['g3', true]]);
    p.ctx.cam = camStream('host'); p.ctx.camOn = true;
    p.ctx.revideo();
    assert.deepEqual(out(p, 'g1'), [
      { t: 'vslots', list: [{ id: 'host', name: 'Omran', on: true }, { id: 'g3', name: 'N-g3', on: true }, { id: 'g2', name: 'N-g2', on: false }] },
      { t: 'dv', on: true, cams: ['g1', 'g3'], ids: [] },
    ], plan);
    const g1 = p.ctx.peers.get('g1');
    assert.equal(last(g1.vtx[0].sender.replaced), p.ctx.cam.track, 'صورة صاحب الغرفة على الخطّ الأوّل');
    assert.deepEqual(relayTracks(p, 'g1'), [p.ctx.peers.get('g3').vtrack, null], 'g3 تمرّ عبر صاحب الغرفة، g2 مطفأة');
    assert.deepEqual(relay(p, 'g2'), ['g3', 'g1']);
    assert.deepEqual(relayTracks(p, 'g2'), [p.ctx.peers.get('g3').vtrack, p.ctx.peers.get('g1').vtrack]);
    for (const id of ['g1', 'g2', 'g3']) { assert.deepEqual(last(out(p, id, 'dv')), { t: 'dv', on: true, cams: ['g1', 'g3'], ids: [] }, id); assert.equal(p.ctx.peers.get(id).dv, true); }
    // كاميرا g2 تشتغل: القائمة تتحدّث
    p.ctx.peers.get('g2').cam = true; p.ctx.revideo();
    assert.deepEqual(last(out(p, 'g1')), { t: 'dv', on: true, cams: ['g1', 'g2', 'g3'], ids: [] });
  }
  // كاميرا مُعلنة بلا مسار وصل بعد لا تُحسب
  const q = hostPage('sub', [['g1', true], ['g2', true]]);
  q.ctx.peers.get('g2').vtrack = null; q.ctx.revideo();
  assert.deepEqual(last(out(q, 'g1')), { t: 'dv', on: true, cams: ['g1'], ids: [] });
});

test('revideo: الضيف الذي أخبر (dvCap) يُمرَّر له فقط من كاميرته شغّالة ولا يراه مباشرة؛ ومن لم يُخبر يبقى له التمرير كاملًا', () => {
  const p = hostPage('sub', [['g1', true, ['g2']], ['g2', true], ['g3', true], ['g4', true], ['g5', false]]);
  p.ctx.revideo();
  assert.deepEqual(last(out(p, 'g1', 'dv')), { t: 'dv', on: true, cams: ['g1', 'g2', 'g3', 'g4'], ids: ['g1'] }, 'ids = من أخبر فقط');
  assert.deepEqual(last(out(p, 'g1', 'vslots')).list, [{ id: 'host', name: 'Omran', on: false }, { id: 'g3', name: 'N-g3', on: true }, { id: 'g4', name: 'N-g4', on: true }], 'g2 يراه مباشرة، g5 مطفأة');
  assert.deepEqual(relayTracks(p, 'g1'), [p.ctx.peers.get('g3').vtrack, p.ctx.peers.get('g4').vtrack]);
  assert.deepEqual(relay(p, 'g5'), ['g1', 'g2'], 'g5 بلا dvCap: pickOthers على الكلّ كما كان');
  assert.deepEqual(relay(p, 'g2'), ['g3', 'g4'], 'g2 بلا dvCap (رغم أنّ g1 يراه)');
  // يرى g2 و g3: يبقى g4 وحده
  p.ctx.peers.get('g1').dvSee = ['g2', 'g3']; p.ctx.revideo();
  assert.deepEqual(relay(p, 'g1'), ['g4', null]);
  assert.deepEqual(relayTracks(p, 'g1'), [p.ctx.peers.get('g4').vtrack, null]);
  // يرى الجميع: لا تمرير، و g5 (مطفأة) لا تُمرَّر حتّى لو لم يرها
  p.ctx.peers.get('g1').dvSee = ['g2', 'g3', 'g4']; p.ctx.revideo();
  assert.deepEqual(relay(p, 'g1'), [null, null]); assert.deepEqual(relayTracks(p, 'g1'), [null, null]);
  // g4 تطفئ كاميرتها ثمّ g3 تخرج من رؤية g1 (رابطها سقط): يعود التمرير لـ g3 فقط
  p.ctx.peers.get('g4').cam = false; p.ctx.peers.get('g1').dvSee = ['g2', 'g4']; p.ctx.revideo();
  assert.deepEqual(relay(p, 'g1'), ['g3', null]);
  // أخبر ولا يرى أحدًا: الكاميرات الشغّالة بعده بالدور (g2، g3)
  p.ctx.peers.get('g4').cam = true; p.ctx.peers.get('g1').dvSee = []; p.ctx.revideo();
  assert.deepEqual(relay(p, 'g1'), ['g2', 'g3']);
});

test('dvOk: يتحقّق (مصفوفة، نصوص، لا نفسه، أعضاء فقط، مرتّبة)، يعيد revideo عند التغيير فقط، 12 في 10 ثوانٍ، وفي غرفة مدفوعة فقط', async () => {
  const p = hostPage('sub', [['g1', true], ['g2', true], ['g3', true]]);
  const g1 = p.ctx.peers.get('g1');
  const vs = () => out(p, 'g2', 'vslots').length;
  for (const ids of [undefined, null, 'g2', { 0: 'g2' }, 7]) p.ctx.dvOk('g1', g1, { t: 'dvok', ids });
  assert.ok(!g1.dvCap, 'ids ليست مصفوفة: لا شيء'); assert.equal(vs(), 0);
  p.ctx.dvOk('g1', g1, { t: 'dvok', ids: ['g3', 'g1', 7, null, { id: 'g2' }, 'g9', 'host', 'g2', ['g2']] });
  assert.equal(g1.dvCap, true); assert.deepEqual(J(g1.dvSee), ['g2', 'g3'], 'نفسه والمجهول وغير النصوص تُحذف، والباقي مرتّب');
  assert.equal(vs(), 1, 'تغيّر: revideo');
  assert.deepEqual(last(out(p, 'g2', 'dv')).ids, ['g1']);
  p.ctx.dvOk('g1', g1, { t: 'dvok', ids: ['g2', 'g3'] });
  p.ctx.dvOk('g1', g1, { t: 'dvok', ids: ['g3', 'g2', 'g9'] });
  assert.equal(vs(), 1, 'لا تغيير: لا revideo');
  // dvok أوّل فارغ: يكفي ليصير dvCap
  const g2 = p.ctx.peers.get('g2');
  p.ctx.dvOk('g2', g2, { t: 'dvok', ids: [] });
  assert.equal(g2.dvCap, true); assert.deepEqual(J(g2.dvSee), []); assert.equal(vs(), 2);
  assert.deepEqual(last(out(p, 'g3', 'dv')).ids, ['g1', 'g2']);
  // أكثر من MAX: العشرة الأولى فقط تُقرأ
  const many = Array(10).fill('g9').concat(['g3']);
  p.ctx.dvOk('g2', g2, { t: 'dvok', ids: many });
  assert.deepEqual(J(g2.dvSee), []);
  // الحدّ: 12 تغييرًا في 10 ثوانٍ لكلّ ضيف (ما لم يتغيّر لا يُحسب)؛ ما زاد يُؤجَّل لا يُرمى
  const q = hostPage('sub', [['g1', true], ['g2', true], ['g3', true]]);
  const h1 = q.ctx.peers.get('g1');
  for (let i = 0; i < 12; i++) q.ctx.dvOk('g1', h1, { t: 'dvok', ids: i % 2 ? ['g2'] : [] });
  assert.equal(out(q, 'g2', 'vslots').length, 12);
  q.ctx.dvOk('g1', h1, { t: 'dvok', ids: ['g3'] });
  assert.deepEqual(J(h1.dvSee), ['g2'], 'الـ13 لا تُطبَّق الآن'); assert.equal(out(q, 'g2', 'vslots').length, 12);
  assert.deepEqual(J(h1.dvPend), ['g3'], 'بل تُحفظ');
  q.ctx.dvOk('g2', q.ctx.peers.get('g2'), { t: 'dvok', ids: [] });
  assert.equal(q.ctx.peers.get('g2').dvCap, true, 'ضيف آخر لا يتأثّر');
  await q.advance(10000);
  assert.deepEqual(J(h1.dvSee), ['g3'], 'بعد 10 ثوانٍ تُطبَّق المحفوظة'); assert.equal(out(q, 'g2', 'vslots').length, 14, '12 + dvok الأولى من g2 + المؤجّلة');
  q.ctx.dvOk('g1', h1, { t: 'dvok', ids: ['g2'] });
  assert.deepEqual(J(h1.dvSee), ['g2'], 'والحدّ عاد');
  // غرفة مجّانيّة أو ليس مضيفًا: لا شيء
  for (const [plan, role] of [['free', 'host'], ['', 'host'], ['sub', 'guest']]) {
    const f = hostPage(plan, [['g1', true], ['g2', true]]); f.ctx.role = role;
    const f1 = f.ctx.peers.get('g1');
    f.ctx.dvOk('g1', f1, { t: 'dvok', ids: ['g2'] });
    assert.ok(!f1.dvCap, plan + '/' + role); assert.equal(out(f, 'g2').length, 0);
  }
});

test('dvOk: التقرير الذي لم يتغيّر لا يُحسب من حدّ الـ12 ولا يحرّك revideo', () => {
  const p = hostPage('sub', [['g1', true], ['g2', true], ['g3', true]]);
  const g1 = p.ctx.peers.get('g1');
  const vs = () => out(p, 'g2', 'vslots').length;
  p.ctx.dvOk('g1', g1, { t: 'dvok', ids: [] });
  for (let i = 0; i < 50; i++) p.ctx.dvOk('g1', g1, { t: 'dvok', ids: ['g9'] });      // g9 ليس عضوًا: [] نفسها
  assert.equal(vs(), 1);
  assert.equal(p.ctx.dvStamps.get('ok>g1').length, 1, 'تغيير واحد فقط في العدّاد');
  for (let i = 1; i < 12; i++) for (let k = 0; k < 3; k++) p.ctx.dvOk('g1', g1, { t: 'dvok', ids: i % 2 ? ['g2'] : [] });
  assert.equal(vs(), 12, '12 تغييرًا طُبّقت كلّها رغم التكرار بينها');
  assert.equal(p.ctx.dvStamps.get('ok>g1').length, 12);
  assert.ok(!g1.dvPend); assert.ok(!g1.dvT, 'لا تأجيل');
  p.ctx.dvOk('g1', g1, { t: 'dvok', ids: ['g3'] });
  assert.equal(vs(), 12, 'الـ13 تتأجّل'); assert.ok(g1.dvT); assert.deepEqual(J(g1.dvPend), ['g3']);
  assert.equal(p.ctx.dvStamps.get('ok>g1').length, 12, 'المؤجّل لا يُحسب الآن');
});

test('dvOk: التغيير الـ13 في 10 ثوانٍ يُطبَّق بعد انقضاء النافذة — الأحدث فقط، بمؤقّت واحد؛ والرجوع إلى المطبَّق يلغيه', async () => {
  const p = hostPage('sub', [['g1', true], ['g2', true], ['g3', true], ['g4', true]]);
  const g1 = p.ctx.peers.get('g1');
  const vs = () => out(p, 'g2', 'vslots').length;
  for (let i = 0; i < 12; i++) p.ctx.dvOk('g1', g1, { t: 'dvok', ids: i % 2 ? ['g2'] : [] });
  assert.equal(vs(), 12); assert.deepEqual(J(g1.dvSee), ['g2']);
  await p.advance(3000);
  const n0 = p.timers.length;
  p.ctx.dvOk('g1', g1, { t: 'dvok', ids: ['g3'] });
  const t = g1.dvT;
  assert.ok(t); assert.equal(p.timers.length, n0 + 1);
  assert.deepEqual(J(g1.dvSee), ['g2'], 'لم تُطبَّق بعد'); assert.equal(vs(), 12);
  await p.advance(1000);
  p.ctx.dvOk('g1', g1, { t: 'dvok', ids: ['g4', 'g3'] });
  p.ctx.dvOk('g1', g1, { t: 'dvok', ids: ['g9', 'g4'] });
  assert.equal(g1.dvT, t, 'المؤقّت نفسه'); assert.equal(p.timers.length, n0 + 1, 'مؤقّت واحد');
  assert.deepEqual(J(g1.dvPend), ['g4'], 'الأحدث فقط');
  await p.advance(8999);      // 10 ثوانٍ من الـ13 إلّا 1 ms
  assert.deepEqual(J(g1.dvSee), ['g2']); assert.equal(vs(), 12);
  await p.advance(1);
  assert.deepEqual(J(g1.dvSee), ['g4'], 'الأحدث طُبّق'); assert.equal(vs(), 13, 'revideo مرّة واحدة');
  assert.equal(g1.dvPend, null); assert.ok(!g1.dvT);
  await p.advance(60000);
  assert.equal(vs(), 13, 'لا شيء بعدها');
  p.ctx.dvOk('g1', g1, { t: 'dvok', ids: ['g3'] });
  assert.deepEqual(J(g1.dvSee), ['g3'], 'الحدّ عاد: فورًا'); assert.equal(vs(), 14);
  // تأجيل ثمّ تقرير بما هو مطبَّق أصلًا: المحفوظ يُلغى، والمؤقّت لا يفعل شيئًا
  const q = hostPage('sub', [['g1', true], ['g2', true], ['g3', true]]);
  const h1 = q.ctx.peers.get('g1');
  for (let i = 0; i < 12; i++) q.ctx.dvOk('g1', h1, { t: 'dvok', ids: i % 2 ? ['g2'] : [] });
  q.ctx.dvOk('g1', h1, { t: 'dvok', ids: ['g3'] });
  assert.deepEqual(J(h1.dvPend), ['g3']);
  q.ctx.dvOk('g1', h1, { t: 'dvok', ids: ['g2'] });
  assert.equal(h1.dvPend, null, 'رجع إلى المطبَّق');
  await q.advance(10000);
  assert.deepEqual(J(h1.dvSee), ['g2']); assert.equal(out(q, 'g2', 'vslots').length, 12); assert.ok(!h1.dvT);
});

test('dvOk: لا شيء من المؤقّت بعد خروج الضيف (drop يلغيه)، ولا على ضيف جديد بالمعرّف نفسه', async () => {
  const fill = (p) => {
    const h = p.ctx.peers.get('g1');
    for (let i = 0; i < 12; i++) p.ctx.dvOk('g1', h, { t: 'dvok', ids: i % 2 ? ['g2'] : [] });
    p.ctx.dvOk('g1', h, { t: 'dvok', ids: ['g3'] });
    assert.ok(h.dvT); assert.deepEqual(J(h.dvPend), ['g3']);
    return h;
  };
  const vs = (p) => out(p, 'g2', 'vslots').length;
  // drop الحقيقيّ
  const p = hostPage('sub', [['g1', true], ['g2', true], ['g3', true]]);
  const g1 = fill(p), t = g1.dvT;
  p.ctx.drop('g1', false);
  assert.ok(!p.ctx.peers.has('g1'));
  assert.ok(!p.timers.some((x) => x.id === t), 'drop ألغى المؤقّت');
  const n = vs(p);
  await p.advance(20000);
  assert.equal(vs(p), n); assert.deepEqual(J(g1.dvSee), ['g2']);
  // خرج من peers بلا drop: المؤقّت يجري ولا يطبّق شيئًا
  const q = hostPage('sub', [['g1', true], ['g2', true], ['g3', true]]);
  const h1 = fill(q);
  q.ctx.peers.delete('g1');
  const m = vs(q);
  await q.advance(10000);
  assert.equal(vs(q), m); assert.deepEqual(J(h1.dvSee), ['g2']); assert.equal(h1.dvPend, null);
  // عاد ضيف بالمعرّف نفسه (كائن جديد): لا يأخذ تقرير القديم
  const r = hostPage('sub', [['g1', true], ['g2', true], ['g3', true]]);
  const r1 = fill(r), fresh = hostGuest('g1', true);
  r.ctx.peers.set('g1', fresh);
  const k = vs(r);
  await r.advance(10000);
  assert.ok(!fresh.dvCap); assert.equal(fresh.dvSee, undefined); assert.deepEqual(J(r1.dvSee), ['g2']); assert.equal(vs(r), k);
});

test('المضيف: رسالة cam من الضيف — الحالة نفسها لا تستدعي revideo ولا تُحسب، و10 تغييرات في 10 ثوانٍ فقط (الـ11 تُهمل)', async () => {
  const p = hostPage('sub', [['g1', true]]);
  p.ctx.asks.push({ id: 'g5', name: 'New', offer: SDP('join') });
  p.ctx.admit('g5'); await tick();
  const pc = last(p.pcs), dc = chan();
  pc.ondatachannel({ channel: dc }); dc.onopen();
  const g5 = p.ctx.peers.get('g5');
  const vs = () => out(p, 'g1', 'vslots').length;
  const cam = (on) => dc.onmessage({ data: JSON.stringify({ t: 'cam', on }) });
  const n = vs();
  cam(true);
  assert.equal(g5.cam, true); assert.equal(vs(), n + 1, 'تغيّرت: revideo');
  for (let i = 0; i < 20; i++) cam(true);
  cam(1); cam('yes');
  assert.equal(vs(), n + 1, 'الحالة نفسها: لا revideo');
  assert.equal(p.ctx.dvStamps.get('cam>g5').length, 1, 'ولا تُحسب');
  for (let i = 0; i < 9; i++) { const on = i % 2 === 1; cam(on); cam(on ? 1 : 0); cam(on ? 'x' : null); }
  assert.equal(vs(), n + 10, '10 تغييرات'); assert.equal(g5.cam, false);
  cam(true);
  assert.equal(g5.cam, false, 'الـ11 تُهمل'); assert.equal(vs(), n + 10);
  assert.equal(p.ctx.dvStamps.get('cam>g5').length, 10);
  await p.advance(9999);
  cam(true); assert.equal(g5.cam, false, 'ما زالت داخل العشر ثوانٍ');
  await p.advance(1);
  cam(true);
  assert.equal(g5.cam, true, 'بعد 10 ثوانٍ تعود'); assert.equal(vs(), n + 11);
  // عدّاد cam لكلّ ضيف وحده، ولا يمسّ عدّاد المصافحات
  assert.equal(p.ctx.dvStamps.has('g5'), false); assert.equal(p.ctx.dvStamps.has('cam>g1'), false);
});

test('drop: يلغي مؤقّت dvok المؤجّل ويمسح كلّ مفاتيح dvStamps لهذا الضيف (id، ok>id، cam>id، id>x، x>id) ويُبقي مفاتيح غيره', () => {
  const p = hostPage('sub', [['g1', true], ['g2', true], ['g3', true], ['g10', true]]);
  const pass = (from, to) => p.ctx.passDv(from, { to, n: N, d: OFFER });
  pass('g1', 'g2'); pass('g2', 'g1'); pass('g2', 'g3'); pass('g3', 'g10'); pass('g10', 'g2'); pass('g10', 'g1');
  const g1 = p.ctx.peers.get('g1');
  for (let i = 0; i < 12; i++) p.ctx.dvOk('g1', g1, { t: 'dvok', ids: i % 2 ? ['g2'] : [] });
  p.ctx.dvOk('g1', g1, { t: 'dvok', ids: ['g3'] });
  p.ctx.dvOk('g10', p.ctx.peers.get('g10'), { t: 'dvok', ids: [] });
  p.ctx.dvRate('cam>g1', 10); p.ctx.dvRate('cam>g10', 10);
  const keys = () => Array.from(p.ctx.dvStamps.keys()).sort();
  assert.deepEqual(keys(), ['cam>g1', 'cam>g10', 'g1', 'g10', 'g10>g1', 'g10>g2', 'g1>g2', 'g2', 'g2>g1', 'g2>g3', 'g3', 'g3>g10', 'ok>g1', 'ok>g10']);
  const t = g1.dvT;
  assert.ok(p.timers.some((x) => x.id === t));
  p.ctx.drop('g1', false);
  assert.deepEqual(keys(), ['cam>g10', 'g10', 'g10>g2', 'g2', 'g2>g3', 'g3', 'g3>g10', 'ok>g10'], 'g10 ليس g1 (لا خلط بالبادئة)');
  assert.ok(!p.timers.some((x) => x.id === t), 'المؤقّت أُلغي');
  assert.ok(!p.ctx.peers.has('g1'));
  // ضيف بلا مؤقّت: لا يرمي، ومفاتيحه تذهب أيضًا؛ ومعرّف مجهول لا يفعل شيئًا
  assert.equal(p.ctx.peers.get('g3').dvT, undefined);
  assert.doesNotThrow(() => p.ctx.drop('g3', false));
  assert.deepEqual(keys(), ['cam>g10', 'g10', 'g10>g2', 'g2', 'ok>g10']);
  p.ctx.drop('g9', false);
  assert.deepEqual(keys(), ['cam>g10', 'g10', 'g10>g2', 'g2', 'ok>g10']);
});

test('revideo في غرفة مجّانيّة: التمرير كما كان (pickOthers) ولا dv أبدًا، حتّى لمن أخبر سابقًا', () => {
  for (const plan of ['free', '']) {
    const p = hostPage(plan, [['g1', true, ['g3']], ['g2', false], ['g3', true]]);
    p.ctx.revideo();
    const g1 = p.ctx.peers.get('g1');
    assert.deepEqual(out(p, 'g1'), [{ t: 'vslots', list: [{ id: 'host', name: 'Omran', on: false }, { id: 'g3', name: 'N-g3', on: true }, { id: 'g2', name: 'N-g2', on: false }] }], plan);
    assert.equal(last(g1.vtx[1].sender.replaced), p.ctx.peers.get('g3').vtrack, 'g3 تمرّ عبر صاحب الغرفة رغم dvSee');
    assert.equal(last(g1.vtx[2].sender.replaced), null, 'g2 كاميرتها مطفأة');
    assert.deepEqual(relay(p, 'g2'), ['g3', 'g1']);
    for (const id of ['g1', 'g2', 'g3']) { assert.deepEqual(out(p, id, 'dv'), [], id); assert.ok(!p.ctx.peers.get(id).dv); }
  }
});

test('انتهاء الاشتراك وسط الغرفة (poll): dv off مرّة واحدة لكلّ ضيف، والتمرير الكامل يعود حتّى لمن أخبر، والمصافحات و dvok تُرفض بعدها', async () => {
  const p = hostPage('sub', [['g1', true, ['g2']], ['g2', true, ['g1']], ['g3', false]]);
  p.ctx.revideo();
  assert.ok(['g1', 'g2', 'g3'].every((id) => p.ctx.peers.get(id).dv === true));
  assert.deepEqual(relay(p, 'g1'), [null, null], 'قبل: g1 ترى g2 مباشرة');
  for (const id of ['g1', 'g2', 'g3']) p.ctx.peers.get(id).dc.out.length = 0;
  p.setReply((b) => (b.op === 'pending' ? { joins: [], plan: 'free', cap: 4, left: 600 } : {}));
  p.ctx.poll(); await tick();
  assert.equal(p.ctx.roomPlan, 'free'); assert.equal(p.ctx.cap, 4);
  for (const id of ['g1', 'g2', 'g3']) {
    assert.deepEqual(out(p, id, 'dv'), [{ t: 'dv', on: false }], id);
    assert.equal(p.ctx.peers.get(id).dv, false);
  }
  assert.deepEqual(relay(p, 'g1'), ['g2', 'g3'], 'g1 ترى g2 و g3 عبر صاحب الغرفة من جديد');
  assert.equal(last(p.ctx.peers.get('g1').vtx[1].sender.replaced), p.ctx.peers.get('g2').vtrack);
  // تغيير كاميرا بعدها: لا dv off ثانية
  p.ctx.peers.get('g3').cam = true; p.ctx.revideo();
  p.ctx.poll(); await tick();
  for (const id of ['g1', 'g2', 'g3']) assert.equal(out(p, id, 'dv').length, 1, id + ': off مرّة واحدة فقط');
  assert.equal(last(p.ctx.peers.get('g3').vtx[1].sender.replaced), p.ctx.peers.get('g1').vtrack);
  p.ctx.passDv('g1', { to: 'g2', n: N, d: OFFER });
  assert.deepEqual(out(p, 'g2', 'dvs'), [], 'لا تمرير بعد انتهاء الاشتراك');
  const g3 = p.ctx.peers.get('g3'), n = out(p, 'g1', 'vslots').length;
  p.ctx.dvOk('g3', g3, { t: 'dvok', ids: ['g1'] });
  assert.ok(!g3.dvCap); assert.equal(out(p, 'g1', 'vslots').length, n, 'dvok لا يحرّك شيئًا');
});

// ---- الضيف
const PS = [{ id: 'host', name: 'Omran' }, { id: 'g1', name: 'Ali' }, { id: 'g2', name: 'Me' }, { id: 'g3', name: 'Sara' }, { id: 'g4', name: 'Huda' }];
const ALL = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5'];
function guestPage(init, list) {
  const p = page(Object.assign({ role: 'guest', myId: 'g2' }, init || {}));
  const hdc = chan(), hpc = { closed: 0, close() { this.closed++; } };
  p.ctx.peers.set('host', { pc: hpc, dc: hdc, tx: null });
  p.ctx.gv = [trx('video', 'sendrecv'), trx('video', 'recvonly'), trx('video', 'recvonly')];
  p.ctx.fromHost({ t: 'ps', list: list || PS });
  p.hdc = hdc; p.hpc = hpc;
  p.dvs = () => hdc.out.filter((m) => m.t === 'dvs');
  p.oks = () => hdc.out.filter((m) => m.t === 'dvok');
  p.link = (id) => p.ctx.dv && p.ctx.dv.links.get(id);
  p.ids = () => (p.ctx.dv ? Array.from(p.ctx.dv.links.keys()).sort() : null);
  p.fails = (id) => p.ctx.dv && p.ctx.dv.fails.get(id);
  p.dTiles = () => Array.from(p.ctx.tiles.keys()).filter((k) => k[0] === 'd').sort();
  return p;
}
/** dv on من صاحب الغرفة. cams / ids بديلهما: كلّ الضيوف (كاميراتهم شغّالة، وكلّهم يتّصلون مباشرة). */
async function on(p, cams, ids) { p.ctx.fromHost({ t: 'dv', on: true, cams: cams || ALL, ids: ids || ALL }); await tick(); }
let nk = 0;
/** عرض من guest id (الأصغر) لهذا الضيف بوسم n، والرجوع بالـ pc الذي فُتح له. */
async function offerFrom(p, id, sdp, n) {
  const c = p.pcs.length;
  p.ctx.fromHost({ t: 'dvs', from: id, n: n === undefined ? 'of' + String(++nk).padStart(4, '0') : n, d: { type: 'offer', sdp: sdp || SDP('from ' + id) } });
  await tick();
  return p.pcs.length > c ? last(p.pcs) : null;
}
/** جواب g<id> على عرض هذا الضيف (بوسم الرابط الحاليّ ما لم يُعطَ غيره). */
async function answerFrom(p, id, sdp, n) { p.ctx.fromHost({ t: 'dvs', from: id, n: n === undefined ? p.link(id).n : n, d: { type: 'answer', sdp: sdp || SDP('ans ' + id) } }); await tick(); }

test('الضيف: dv on يفتح روابط للأكبر رقمًا ممّن في ids فقط (عرض بوسم وبلا trickle عبر صاحب الغرفة)، ولا شيء قبل dv', async () => {
  const p = guestPage({ cam: camStream('me'), camOn: true });
  assert.equal(p.ctx.dv, null); assert.equal(p.pcs.length, 0, 'ps وحدها لا تفتح شيئًا');
  await on(p, ['g1', 'g3', 7], ['g1', 'g2', 'g3', 'g4', 9]);
  assert.deepEqual([...p.ctx.dv.cams], ['g1', 'g3'], 'cams: النصوص فقط');
  assert.deepEqual([...p.ctx.dv.ids], ['g1', 'g2', 'g3', 'g4'], 'ids: النصوص فقط');
  assert.deepEqual(p.ids(), ['g3', 'g4'], 'g1 أصغر (هو يتّصل)، لا host ولا نفسه');
  assert.equal(p.pcs.length, 2);
  for (const id of ['g3', 'g4']) {
    const l = p.link(id);
    assert.equal(l.mine, true); assert.equal(l.up, false);
    assert.match(l.n, NRE, 'وسم المحاولة');
    assert.deepEqual(l.pc.log, ['addTransceiver:video:sendrecv', 'createOffer', 'setLocal:offer']);
    assert.deepEqual(l.tx.sender.replaced, [p.ctx.cam.track], 'كاميرته على الخطّ');
  }
  assert.notEqual(p.link('g3').n, p.link('g4').n, 'لكلّ اتّصال وسمه');
  assert.deepEqual(p.dvs(), [
    { t: 'dvs', to: 'g3', n: p.link('g3').n, d: { type: 'offer', sdp: p.link('g3').pc.localDescription.sdp } },
    { t: 'dvs', to: 'g4', n: p.link('g4').n, d: { type: 'offer', sdp: p.link('g4').pc.localDescription.sdp } },
  ]);
  // dv on مرّة ثانية: لا روابط مكرّرة
  await on(p, ['g3'], ['g1', 'g2', 'g3', 'g4']);
  assert.equal(p.pcs.length, 2); assert.equal(p.dvs().length, 2);
  assert.deepEqual([...p.ctx.dv.cams], ['g3']);
});

test('الضيف: يتّصل فقط بمن في dv.ids — من ليس فيها لا رابط له، ومن خرج منها يُغلق رابطه، ومن دخلها يُفتح له', async () => {
  const p = guestPage({ cam: camStream('me'), camOn: true });
  await on(p, ALL, ['g1', 'g2', 'g3']);      // g4 صفحة قديمة (لم تُخبر)
  assert.deepEqual(p.ids(), ['g3']);
  assert.deepEqual(p.dvs().map((m) => m.to), ['g3']);
  // ids بلا هذا الضيف نفسه (لم يصل dvok بعد): يتّصل بمن فيها مع ذلك
  await on(p, ALL, ['g3', 'g4']);
  assert.deepEqual(p.ids(), ['g3', 'g4'], 'g4 دخلت ids: رابط جديد');
  const g3 = p.link('g3').pc;
  await on(p, ALL, ['g4']);
  assert.equal(g3.closed, 1, 'g3 خرجت من ids: رابطها يُغلق'); assert.deepEqual(p.ids(), ['g4']);
  await on(p, ALL, []);
  assert.deepEqual(p.ids(), []);
  // ids ليست مصفوفة = لا أحد
  await on(p, ALL, ['g3']);
  p.ctx.fromHost({ t: 'dv', on: true, cams: ALL, ids: 'g3,g4' }); await tick();
  assert.deepEqual(p.ids(), []);
  p.ctx.fromHost({ t: 'dv', on: true, cams: ALL }); await tick();
  assert.deepEqual(p.ids(), [], 'بلا ids (صاحب غرفة قديم): لا روابط');
});

test('الضيف: أوّل dv يرسل dvok فارغة، ثمّ dvok عند تغيّر من يُرى مباشرة فقط (متّصل وله صورة)', async () => {
  const p = guestPage({ cam: camStream('me'), camOn: true });
  await on(p);
  assert.deepEqual(p.oks(), [{ t: 'dvok', ids: [] }], 'أوّل dv: dvok فورًا (قبل أيّ رابط)');
  await on(p); await on(p, ['g3']);
  assert.equal(p.oks().length, 1, 'dv بلا تغيير: لا dvok');
  const g3 = p.link('g3'), g4 = p.link('g4');
  g3.pc.track('video', { id: 'S3' });
  assert.equal(p.oks().length, 1, 'صورة بلا اتّصال: لا تُعدّ');
  g3.pc.fire('connected');
  assert.deepEqual(last(p.oks()), { t: 'dvok', ids: ['g3'] });
  g4.pc.fire('connected');
  assert.equal(p.oks().length, 2, 'اتّصال بلا صورة: لا يُعدّ');
  g4.pc.track('audio', { id: 'A4' });
  assert.equal(p.oks().length, 2, 'صوت: لا');
  g4.pc.track('video', { id: 'S4' });
  assert.deepEqual(last(p.oks()), { t: 'dvok', ids: ['g3', 'g4'] });
  const a = await offerFrom(p, 'g1');
  a.fire('connected'); a.track('video', { id: 'S1' });
  assert.deepEqual(last(p.oks()), { t: 'dvok', ids: ['g1', 'g3', 'g4'] }, 'المُجاب يُعدّ أيضًا، مرتّبة');
  assert.equal(p.oks().length, 4);
  g3.pc.fire('connected');
  assert.equal(p.oks().length, 4, 'connected ثانية: لا تغيير');
  g3.pc.fire('failed');
  assert.deepEqual(last(p.oks()), { t: 'dvok', ids: ['g1', 'g4'] }, 'سقط: يُخبر');
  // dv off ثمّ on: dvok من جديد
  p.ctx.fromHost({ t: 'dv', on: false });
  const k = p.oks().length;
  await on(p);
  assert.equal(p.oks().length, k + 1); assert.deepEqual(last(p.oks()), { t: 'dvok', ids: [] });
});

test('الضيف: الروابط المباشرة بخوادم STUN فقط (بلا TURN المدفوع)، ولا تمسّ RTC', async () => {
  const RTC = { iceServers: [{ urls: 'stun:a' }, { urls: ['turn:t:3478', 'turns:t:5349'], username: 'u', credential: 'c' }, { urls: 'turn:x', credential: 'c' }, { urls: 'turn:y', username: 'u' }, null, { urls: ['stun:b'] }] };
  const p = guestPage({ RTC, cam: camStream('me'), camOn: true });
  await on(p);
  const a = await offerFrom(p, 'g1');
  for (const pc of [p.link('g3').pc, a]) assert.deepEqual(J(pc.cfg), { iceServers: [{ urls: 'stun:a' }, { urls: ['stun:b'] }] });
  assert.notEqual(p.link('g3').pc.cfg, RTC);
  assert.equal(RTC.iceServers.length, 6, 'RTC كما هو');
  assert.deepEqual(J(p.ctx.dvRtc()), { iceServers: [{ urls: 'stun:a' }, { urls: ['stun:b'] }] });
  p.ctx.RTC = { iceServers: [{ urls: 'turn:z', username: 'u', credential: 'c' }] };
  assert.deepEqual(J(p.ctx.dvRtc()), { iceServers: [] }, 'TURN وحده: لا خوادم (مضيف فقط)');
  p.ctx.RTC = {};
  assert.deepEqual(J(p.ctx.dvRtc()), { iceServers: [] });
});

test('الضيف: بلا trickle — العرض يُرسل بعد اكتمال جمع المرشّحين أو بعد 2.5 ثانية', async () => {
  const p = guestPage({}, PS.slice(0, 4));
  p.hooks.gathering = 'gathering';
  await on(p);
  assert.deepEqual(p.ids(), ['g3']);
  assert.equal(p.dvs().length, 0, 'ما زال يجمع');
  await p.advance(2499); assert.equal(p.dvs().length, 0);
  await p.advance(1); assert.equal(p.dvs().length, 1);
});

test('الضيف: ps تغلق روابط من خرج وتفتح لمن دخل (الأكبر فقط)', async () => {
  const p = guestPage();
  await on(p);
  const g3 = p.link('g3').pc;
  p.ctx.fromHost({ t: 'ps', list: [PS[0], PS[1], PS[2], PS[4], { id: 'g5', name: 'Z' }, { id: 'g0', name: 'Y' }] });
  await tick();
  assert.equal(g3.closed, 1, 'g3 خرج: رابطه أُغلق');
  assert.deepEqual(p.ids(), ['g4', 'g5'], 'g5 أكبر: يُفتح؛ g0 أصغر: هو يتّصل');
  assert.deepEqual(last(p.dvs()), { t: 'dvs', to: 'g5', n: p.link('g5').n, d: { type: 'offer', sdp: p.link('g5').pc.localDescription.sdp } });
  // رابط أجاب عليه هذا الضيف (من g1) يُغلق أيضًا إذا خرج g1
  const a = await offerFrom(p, 'g1');
  assert.ok(a);
  p.ctx.fromHost({ t: 'ps', list: [PS[0], PS[2], PS[4]] });
  assert.equal(a.closed, 1); assert.deepEqual(p.ids(), ['g4']);
});

test('الضيف: dv off يغلق كلّ الروابط ويمسح صورها، و dv = null', async () => {
  const p = guestPage();
  await on(p, ['g3', 'g4']);
  const pcs = [p.link('g3').pc, p.link('g4').pc];
  p.link('g3').pc.fire('connected'); p.link('g3').pc.track('video', { id: 'S3' });
  assert.deepEqual(p.dTiles(), ['dg3']);
  p.ctx.fromHost({ t: 'dv', on: false });
  assert.equal(p.ctx.dv, null);
  assert.ok(pcs.every((x) => x.closed === 1));
  assert.deepEqual(p.dTiles(), []); assert.equal(p.vids.hidden, true);
  p.ctx.fromHost({ t: 'dv', on: 'true' });
  assert.equal(p.ctx.dv, null, 'on يجب أن تكون true بالضبط');
});

test('شرط الكاميرا: المتّصل لا يتّصل إلّا إذا كانت كاميرته أو كاميرا الآخر شغّالة', async () => {
  const p = guestPage();      // كاميرته مطفأة
  await on(p, [], ALL);
  assert.deepEqual(p.ids(), [], 'لا كاميرا في الطرفين: لا رابط (عنوانه يبقى عند صاحب الغرفة)');
  assert.equal(p.dvs().length, 0);
  await on(p, ['g1', 'g4'], ALL);
  assert.deepEqual(p.ids(), ['g4'], 'كاميرا g4 شغّالة');
  // كاميرته تشتغل: يتّصل بالجميع عند dv التالية
  p.ctx.cam = camStream('me'); p.ctx.camOn = true;
  await on(p, ['g1', 'g2', 'g4'], ALL);
  assert.deepEqual(p.ids(), ['g3', 'g4']);
  // إطفاء الكاميرا لاحقًا لا يقطع رابطًا قائمًا
  p.ctx.camOn = false; p.ctx.cam = null;
  await on(p, [], ALL);
  assert.deepEqual(p.ids(), ['g3', 'g4']);
});

test('شرط الكاميرا: المُجيب يتجاهل عرضًا إذا كانت الكاميرتان مطفأتين', async () => {
  const p = guestPage();
  await on(p, [], ALL);
  assert.equal(await offerFrom(p, 'g1'), null, 'لا كاميرا: لا جواب');
  assert.equal(p.dvs().length, 0); assert.equal(p.link('g1'), undefined);
  await on(p, ['g1'], ALL);
  const a = await offerFrom(p, 'g1');
  assert.ok(a, 'كاميرا المتّصل شغّالة: يجيب');
  assert.equal(last(p.dvs()).d.type, 'answer');
  const q = guestPage({ cam: camStream('me'), camOn: true });
  await on(q, [], ALL);
  assert.ok(await offerFrom(q, 'g1'), 'كاميرته هو شغّالة: يجيب');
});

test('dvSig: يجيب عرضًا من الأصغر رقمًا فقط، بكاميرته، والجواب عبر صاحب الغرفة بالوسم نفسه', async () => {
  const p = guestPage({ cam: camStream('me'), camOn: true });
  await on(p);
  const before = p.pcs.length;
  const a = await offerFrom(p, 'g1', SDP('hello'), 'tag0001');
  assert.equal(p.pcs.length, before + 1);
  assert.deepEqual(a.remotes, [{ type: 'offer', sdp: SDP('hello') }]);
  assert.deepEqual(a.log, ['setRemote:offer', 'createAnswer', 'setLocal:answer'], 'لا خطّ جديد: يستعمل خطّ العرض');
  const l = p.link('g1');
  assert.equal(l.mine, false); assert.equal(l.pc, a); assert.equal(l.n, 'tag0001');
  assert.equal(l.tx, a.trs[0]); assert.equal(l.tx.direction, 'sendrecv');
  assert.deepEqual(l.tx.sender.replaced, [p.ctx.cam.track]);
  assert.deepEqual(last(p.dvs()), { t: 'dvs', to: 'g1', n: 'tag0001', d: { type: 'answer', sdp: a.localDescription.sdp } });
  // عرض جديد من g1 بوسم جديد (رابطه سقط فاتّصل ثانية): يحلّ محلّ القديم فورًا
  const b = await offerFrom(p, 'g1', SDP('again'), 'tag0002');
  assert.equal(a.closed, 1); assert.equal(p.link('g1').pc, b);
  assert.deepEqual(last(p.dvs()), { t: 'dvs', to: 'g1', n: 'tag0002', d: { type: 'answer', sdp: b.localDescription.sdp } });
});

test('dvSig: العرض نفسه (الوسم نفسه للرابط المُجاب الحاليّ) يُتجاهل مهما تأخّر؛ عرض بوسم جديد يحلّ محلّ الرابط فورًا', async () => {
  const p = guestPage({ cam: camStream('me'), camOn: true });
  await on(p);
  const a = await offerFrom(p, 'g1', SDP('one'), 'tag0001');
  const to1 = () => p.dvs().filter((m) => m.to === 'g1');      // (روابطه هو إلى g3 / g4 تعيد المحاولة أثناء الدقيقة)
  const sent = to1().length;
  assert.equal(await offerFrom(p, 'g1', SDP('one'), 'tag0001'), null, 'تكرار فوريّ: يُتجاهل');
  // رابط هذا الضيف (المتّصل) لا يمسّه عرض من الأكبر رقمًا ولو بوسم رابطه
  const l3 = p.link('g3');
  assert.equal(await offerFrom(p, 'g3', SDP('x'), l3.n), null); assert.equal(p.link('g3'), l3); assert.equal(l3.pc.closed, 0);
  await p.advance(60000);
  assert.equal(await offerFrom(p, 'g1', SDP('other sdp'), 'tag0001'), null, 'الوسم نفسه بعد دقيقة: يُتجاهل');
  assert.equal(a.closed, 0); assert.equal(p.link('g1').pc, a); assert.equal(to1().length, sent, 'لا جواب');
  // وسم جديد: فورًا، بلا انتظار
  const b = await offerFrom(p, 'g1', SDP('two'), 'tag0002');
  assert.ok(b); assert.equal(a.closed, 1); assert.equal(p.link('g1').pc, b); assert.equal(p.link('g1').n, 'tag0002');
  assert.equal(to1().length, sent + 1); assert.deepEqual(last(p.dvs()), { t: 'dvs', to: 'g1', n: 'tag0002', d: { type: 'answer', sdp: b.localDescription.sdp } });
  // الوسم القديم بعد الجديد: رابط آخر بوسم آخر — يحلّ محلّه أيضًا (الحدّ عند صاحب الغرفة: 6 في 10 ثوانٍ للزوج)
  const c = await offerFrom(p, 'g1', SDP('one'), 'tag0001');
  assert.ok(c); assert.equal(b.closed, 1); assert.equal(p.link('g1').pc, c);
  // سقط الرابط: حتّى الوسم نفسه يُقبل (لا رابط قائم)
  c.fire('failed');
  assert.equal(p.link('g1'), undefined);
  const d = await offerFrom(p, 'g1', SDP('one'), 'tag0001');
  assert.ok(d, 'لا رابط قائم: يُقبل'); assert.equal(p.link('g1').pc, d);
});

test('dvSig يتجاهل: عرضًا من الأكبر، عضوًا مجهولًا، host، نفسه، ليس SDP أو غير ASCII أو أطول من 16000 أو ليس قسم فيديو واحدًا، بلا وسم أو وسم غير صالح، بلا d، أو قبل dv on', async () => {
  const p = guestPage({ cam: camStream('me'), camOn: true });
  const pre = await offerFrom(p, 'g1');
  assert.equal(pre, null, 'قبل dv on: لا شيء');
  await on(p);
  const n = p.pcs.length, sent = p.dvs().length;
  const g3 = p.link('g3');
  const O = (s) => ({ type: 'offer', sdp: s === undefined ? SDP('x') : s });
  const bad = [
    { from: 'g3', d: O() }, { from: 'g9', d: O() }, { from: 'g0', d: O() }, { from: 'host', d: O() }, { from: 'g2', d: O() },
    { from: 'g1', d: O('nope') }, { from: 'g1', d: O(SDPN(16001)) }, { from: 'g1', d: O(SDP('مرحبا')) }, { from: 'g1', d: O(SDP('a\u0000')) },
    { from: 'g1', d: O('v=0\r\n') }, { from: 'g1', d: O(AUDIO) }, { from: 'g1', d: O(SDP('m=video 9 UDP/TLS/RTP/SAVPF 97')) }, { from: 'g1', d: O('v=0' + MV.slice(0, -2) + APP) },
    { from: 'g1', d: { type: 'offer' } }, { from: 'g1', d: { type: 'pranswer', sdp: SDP('x') } }, { from: 'g1' }, { from: 'g1', d: 'v=0\r\n' },
    { from: 1, d: O() }, { d: O() },
  ].map((m) => Object.assign({ n: 'okay1234' }, m));
  for (const tag of [undefined, null, 1234, '', 'abc', 'a'.repeat(17), 'ABCD', 'ab_cd', 'ab cd']) bad.push({ from: 'g1', n: tag, d: O() });
  for (const m of bad) p.ctx.fromHost(Object.assign({ t: 'dvs' }, m));
  await tick();
  assert.equal(p.pcs.length, n, 'لا رابط جديد'); assert.equal(p.dvs().length, sent, 'لا جواب');
  assert.equal(p.link('g3'), g3, 'عرض g3 (الأكبر) لا يمسّ رابط هذا الضيف إليه'); assert.equal(g3.pc.closed, 0);
  assert.equal(p.link('g1'), undefined);
  // 16000 بالضبط مقبول
  assert.ok(await offerFrom(p, 'g1', SDPN(16000)));
  // دور غير ضيف
  p.ctx.role = 'host';
  assert.equal(await offerFrom(p, 'g0'), null);
});

test('dvSig: الجواب يُطبَّق فقط على رابط هذا الضيف، بوسم اتّصاله الحاليّ، وهو في have-local-offer', async () => {
  const p = guestPage();
  await on(p);
  const l3 = p.link('g3'), g3 = l3.pc;
  assert.equal(g3.signalingState, 'have-local-offer');
  // وسم آخر (جواب لاتّصال سابق)، بلا وسم، وسم ليس نصًّا: يُتجاهل
  for (const n of ['zzzz9999', null, 12345678]) await answerFrom(p, 'g3', SDP('stale'), n);
  p.ctx.fromHost({ t: 'dvs', from: 'g3', d: { type: 'answer', sdp: SDP('no n') } }); await tick();
  assert.equal(g3.remotes.length, 0, 'وسم غير مطابق: لا شيء');
  await answerFrom(p, 'g3', SDP('ans3'));
  assert.deepEqual(g3.remotes, [{ type: 'answer', sdp: SDP('ans3') }]);
  await answerFrom(p, 'g3', SDP('again'));
  assert.equal(g3.remotes.length, 1, 'جواب ثانٍ (stable): يُتجاهل');
  // رابط أجاب عليه هذا الضيف (ليس له): جواب منه يُتجاهل حتّى لو الحالة have-local-offer والوسم نفسه
  const a = await offerFrom(p, 'g1');
  a.signalingState = 'have-local-offer';
  await answerFrom(p, 'g1', SDP('x'));
  assert.equal(a.remotes.length, 1, 'العرض فقط');
  // جواب لا رابط له، وجواب ليس SDP
  const g4 = p.link('g4').pc;
  await answerFrom(p, 'g4', 'bad');
  await answerFrom(p, 'g4', SDP('ñ'));
  await answerFrom(p, 'g4', AUDIO); await answerFrom(p, 'g4', 'v=0\r\n'); await answerFrom(p, 'g4', 'v=0' + MV.slice(0, -2) + APP);
  p.ctx.fromHost({ t: 'dvs', from: 'g9', n: 'abcd', d: { type: 'answer', sdp: SDP('x') } }); await tick();
  assert.equal(g4.remotes.length, 0);
  // العرض لم يُكتب بعد (stable): الجواب يُتجاهل
  const q = guestPage({}, PS.slice(0, 4));
  q.hooks.createOffer = () => new Promise(() => {});
  await on(q);
  await answerFrom(q, 'g3', SDP('early'));
  assert.equal(q.link('g3').pc.remotes.length, 0);
});

test('dvSig: جواب متأخّر لاتّصال سابق (وسم قديم) لا يمسّ الاتّصال الجديد', async () => {
  const p = guestPage({}, PS.slice(0, 4));
  await on(p);
  const old = p.link('g3');
  old.pc.fire('failed');
  await p.advance(2000);
  const cur = p.link('g3');
  assert.notEqual(cur, old); assert.notEqual(cur.n, old.n, 'وسم جديد لكلّ اتّصال');
  assert.equal(last(p.dvs()).n, cur.n);
  await answerFrom(p, 'g3', SDP('late'), old.n);
  assert.equal(cur.pc.remotes.length, 0, 'جواب العرض القديم يُسقط'); assert.equal(old.pc.remotes.length, 0);
  await answerFrom(p, 'g3', SDP('fresh'), cur.n);
  assert.deepEqual(cur.pc.remotes, [{ type: 'answer', sdp: SDP('fresh') }]);
});

test('dvSig: جواب يُرفض (setRemoteDescription) = اتّصال فاشل: يُغلق ويُحسب، ويُعاد الاتّصال بوسم جديد', async () => {
  const p = guestPage({}, PS.slice(0, 4));
  await on(p);
  const l = p.link('g3'), g3 = l.pc;
  p.hooks.setRemote = (pc, d) => (d.type === 'answer' ? Promise.reject(new Error('bad answer')) : null);
  await answerFrom(p, 'g3', SDP('x'));
  assert.equal(g3.closed, 1); assert.equal(p.link('g3'), undefined);
  assert.equal(p.fails('g3'), 1);
  await p.advance(2000);
  assert.notEqual(p.link('g3').pc, g3); assert.notEqual(p.link('g3').n, l.n);
});

test('afterCam: الكاميرا الجديدة على gv[0] وعلى كلّ رابط مباشر (المتّصل والمُجاب)', async () => {
  const p = guestPage();
  await on(p);
  const a = await offerFrom(p, 'g1');
  assert.ok(a);
  p.ctx.cam = camStream('new'); p.ctx.camOn = true;
  const n0 = p.ctx.gv[0].sender.replaced.length;
  p.ctx.afterCam();
  assert.equal(p.ctx.gv[0].sender.replaced.length, n0 + 1);
  assert.equal(last(p.ctx.gv[0].sender.replaced), p.ctx.cam.track);
  for (const id of ['g1', 'g3', 'g4']) assert.equal(last(p.link(id).tx.sender.replaced), p.ctx.cam.track, id);
  assert.deepEqual(last(p.hdc.out), { t: 'cam', on: true });
  // إطفاء: null على كلّ الخطوط
  p.ctx.camOn = false; p.ctx.cam = null; p.ctx.afterCam();
  for (const id of ['g1', 'g3', 'g4']) assert.equal(last(p.link(id).tx.sender.replaced), null, id);
  assert.equal(last(p.ctx.gv[0].sender.replaced), null);
  // رابط بلا خطّ بعد (عرض وصل ولم يُقرأ): لا يرمي
  p.hooks.setRemote = () => new Promise(() => {});
  await offerFrom(p, 'g1', SDP('pending'));
  assert.equal(p.link('g1').tx, null);
  assert.doesNotThrow(() => p.ctx.afterCam());
});

test('drawVids: مربّعات d<id> فقط لرابط متّصل وله صورة ومن في cams، بالاسم من القائمة', async () => {
  const p = guestPage();
  await on(p, ['g1', 'g3', 'g4']);
  const a = await offerFrom(p, 'g1');
  const S1 = { id: 'S1' }, S3 = { id: 'S3' };
  a.track('video', S1);
  p.link('g3').pc.track('video', S3);
  assert.deepEqual(p.dTiles(), [], 'صورة وصلت والرابط لم يتّصل بعد: لا مربّع');
  a.fire('connected'); p.link('g3').pc.fire('connected'); p.link('g4').pc.fire('connected');
  p.link('g4').pc.track('audio', { id: 'A4' });      // صوت: لا مربّع
  assert.deepEqual(p.dTiles(), ['dg1', 'dg3'], 'g4 بلا صورة');
  assert.equal(p.ctx.tiles.get('dg3').video.srcObject, S3);
  assert.equal(p.ctx.tiles.get('dg3').name.textContent, 'Sara');
  assert.equal(p.ctx.tiles.get('dg1').name.textContent, 'Ali');
  assert.equal(p.vids.hidden, false);
  p.ctx.fromHost({ t: 'dv', on: true, cams: ['g3', 'g4'], ids: ALL });
  assert.deepEqual(p.dTiles(), ['dg3'], 'g1 أطفأ كاميرته');
  // صورة بلا stream: MediaStream من المسار
  p.link('g4').pc.ontrack({ track: { kind: 'video' }, streams: [] });
  assert.deepEqual(p.dTiles(), ['dg3', 'dg4']);
  // رابط مغلق (قديم) لا يضيف شيئًا
  const old = p.link('g3').pc;
  p.ctx.fromHost({ t: 'ps', list: [PS[0], PS[1], PS[2], PS[4]] });
  assert.deepEqual(p.dTiles(), ['dg4']);
  old.track('video', { id: 'late' }); old.fire('connected');
  assert.deepEqual(p.dTiles(), ['dg4']);
  // في غرفة بلا dv (مجّانيّة): مربّعات الخطوط s فقط
  p.ctx.fromHost({ t: 'dv', on: false });
  p.ctx.gstreams[1] = { id: 'G1' };
  p.ctx.fromHost({ t: 'vslots', list: [{ id: 'host', name: 'Omran', on: true }, { id: 'g3', name: 'Sara', on: true }, null] });
  assert.deepEqual(Array.from(p.ctx.tiles.keys()), ['s1']);
});

test('drawVids: خطّ التمرير لضيف يُرى مباشرة (dvSees) يُخفى، ويعود إذا سقط الرابط المباشر', async () => {
  const p = guestPage();
  await on(p, ['g1', 'g3', 'g4']);
  p.ctx.gstreams[1] = { id: 'R3' }; p.ctx.gstreams[2] = { id: 'R4' };
  p.ctx.fromHost({ t: 'vslots', list: [{ id: 'host', name: 'Omran', on: false }, { id: 'g3', name: 'Sara', on: true }, { id: 'g4', name: 'Huda', on: true }] });
  const keys = () => Array.from(p.ctx.tiles.keys()).sort();
  assert.deepEqual(keys(), ['s1', 's2'], 'لا رابط متّصل بعد: التمرير يظهر');
  const l3 = p.link('g3');
  l3.pc.fire('connected');
  assert.equal(p.ctx.dvSees('g3'), false, 'متّصل بلا صورة: لا يُرى بعد');
  assert.deepEqual(keys(), ['s1', 's2']);
  l3.pc.track('video', { id: 'S3' });
  assert.equal(p.ctx.dvSees('g3'), true);
  assert.deepEqual(keys(), ['dg3', 's2'], 'g3 مباشرة: خطّ التمرير s1 يُخفى، لا صورتان لشخص واحد');
  assert.equal(p.ctx.tiles.get('s2').video.srcObject, p.ctx.gstreams[2]);
  l3.pc.fire('failed');
  assert.equal(p.ctx.dvSees('g3'), false);
  assert.deepEqual(keys(), ['s1', 's2'], 'سقط المباشر: يعود التمرير');
  assert.equal(p.ctx.dvSees('g9'), false); assert.equal(p.ctx.dvSees('host'), false);
  p.ctx.fromHost({ t: 'dv', on: false });
  assert.equal(p.ctx.dvSees('g3'), false, 'dv = null');
});

test('dvLost: المتّصل يحاول 3 مرّات فقط (فشل، رفض العرض، أو 15 ثانية بلا جواب)', async () => {
  const p = guestPage({}, PS.slice(0, 4));
  await on(p);
  const first = p.link('g3').pc;
  first.fire('failed');
  assert.equal(first.closed, 1); assert.equal(p.link('g3'), undefined); assert.equal(p.fails('g3'), 1);
  await p.advance(1999); assert.equal(p.link('g3'), undefined, 'بعد ثانيتين');
  p.hooks.createOffer = () => Promise.reject(new Error('no offer'));      // المحاولة الثانية تسقط من createOffer
  const n1 = p.pcs.length;
  await p.advance(1);
  assert.equal(p.pcs.length, n1 + 1, 'المحاولة الثانية');
  assert.equal(last(p.pcs).closed, 1); assert.equal(p.link('g3'), undefined, 'createOffer رُفض: سقطت');
  assert.equal(p.fails('g3'), 2);
  p.hooks.createOffer = null;
  await p.advance(2000);
  const third = p.link('g3').pc;
  await p.advance(14999);
  assert.equal(third.closed, 0, 'قبل 15 ثانية');
  await p.advance(1);      // لا جواب
  assert.equal(third.closed, 1); assert.equal(p.fails('g3'), 3);
  const n = p.pcs.length;
  await p.advance(60000);
  assert.equal(p.pcs.length, n, 'لا محاولة رابعة');
  assert.equal(n, 3);
  assert.equal(p.link('g3'), undefined);
  assert.deepEqual(p.dvs().map((m) => m.to), ['g3', 'g3'], 'عرضان (الثاني سقط قبل الإرسال)');
});

test('العدّ دائم: بعد 3 اتّصالات فاشلة لا اتّصال حتّى مع dv أو ps جديدة؛ connected يصفّره؛ ويُمسح إذا خرج العضو ثمّ عاد', async () => {
  const p = guestPage({}, PS.slice(0, 4));
  await on(p);
  for (let i = 1; i <= 3; i++) {
    p.link('g3').pc.fire('failed');
    assert.equal(p.fails('g3'), i);
    await p.advance(2000);
  }
  assert.equal(p.link('g3'), undefined);
  const n = p.pcs.length;
  assert.equal(n, 3);
  await on(p, ['g3']); await on(p);
  p.ctx.fromHost({ t: 'ps', list: PS.slice(0, 4) }); await tick();
  p.ctx.fromHost({ t: 'ps', list: PS }); await tick();      // g4 دخل: يُتّصل به، و g3 لا
  assert.equal(p.pcs.length, n + 1); assert.deepEqual(p.ids(), ['g4']);
  await p.advance(60000);
  assert.equal(p.link('g3'), undefined, 'لا محاولة رابعة لـ g3');
  // خرج g3 ثمّ عاد: يبدأ العدّ من جديد
  p.ctx.fromHost({ t: 'ps', list: [PS[0], PS[1], PS[2], PS[4]] }); await tick();
  assert.equal(p.ctx.dv.fails.has('g3'), false, 'خرج: يُمسح');
  p.ctx.fromHost({ t: 'ps', list: PS }); await tick();
  assert.ok(p.link('g3'), 'عاد: يُتّصل به');
  // connected يصفّر العدّ
  const q = guestPage({}, PS.slice(0, 4));
  await on(q);
  q.link('g3').pc.fire('failed'); await q.advance(2000);
  q.link('g3').pc.fire('failed'); await q.advance(2000);
  assert.equal(q.fails('g3'), 2);
  q.link('g3').pc.fire('connected');
  assert.equal(q.ctx.dv.fails.has('g3'), false, 'اتّصل: صفر');
  q.link('g3').pc.fire('failed');
  assert.equal(q.fails('g3'), 1, 'سقوط بعده = أوّل فشل');
  await q.advance(2000);
  assert.ok(q.link('g3'), 'ويُعاد الاتّصال');
  // المُجيب لا يعدّ شيئًا
  const a = await offerFrom(q, 'g1');
  a.fire('failed');
  assert.equal(q.ctx.dv.fails.has('g1'), false);
});

test('dvLost: رابط متّصل لا يسقط بالمهلة؛ ومن أجاب لا يعيد المحاولة؛ وحدث من رابط قديم يُتجاهل', async () => {
  const p = guestPage({}, PS.slice(0, 4));
  await on(p);
  const l = p.link('g3');
  l.pc.fire('connected');
  assert.ok(l.tx.sender.params, 'الحدّ على الخطّ بعد الاتّصال');
  assert.equal(l.up, true);
  await p.advance(20000);
  assert.equal(l.pc.closed, 0); assert.equal(p.link('g3'), l);
  // iceConnectionState completed يكفي أيضًا
  const q = guestPage({}, PS.slice(0, 4));
  await on(q);
  q.link('g3').pc.iceConnectionState = 'completed';
  await q.advance(20000);
  assert.equal(q.link('g3').pc.closed, 0);
  // المُجيب: سقوطه يغلق رابطه ولا يتّصل هو
  const a = await offerFrom(p, 'g1');
  a.fire('failed');
  assert.equal(a.closed, 1); assert.equal(p.link('g1'), undefined);
  const n = p.pcs.length;
  await p.advance(10000);
  assert.equal(p.pcs.length, n);
  // رابط مغلق ثمّ حدث failed منه: لا شيء
  const b = await offerFrom(p, 'g1');
  const c = await offerFrom(p, 'g1');
  b.fire('failed');
  assert.equal(p.link('g1').pc, c); assert.equal(c.closed, 0);
});

test('dvLost: لا إعادة محاولة إذا خرج الضيف الآخر أو انطفأ dv أثناء الانتظار', async () => {
  const p = guestPage({}, PS.slice(0, 4));
  await on(p);
  p.link('g3').pc.fire('failed');
  p.ctx.fromHost({ t: 'ps', list: PS.slice(0, 3) });      // g3 خرج
  const n = p.pcs.length;
  await p.advance(5000);
  assert.equal(p.pcs.length, n); assert.equal(p.link('g3'), undefined);
  // أعضاء تتغيّر مباشرة (بلا ps) — فحص المؤقّت نفسه
  const q = guestPage({}, PS.slice(0, 4));
  await on(q);
  q.link('g3').pc.fire('failed');
  q.ctx.members = q.ctx.members.filter((x) => x.id !== 'g3');
  const m = q.pcs.length;
  await q.advance(5000);
  assert.equal(q.pcs.length, m);
  // dv off أثناء الانتظار
  const r = guestPage({}, PS.slice(0, 4));
  await on(r);
  r.link('g3').pc.fire('failed');
  r.ctx.fromHost({ t: 'dv', on: false });
  const k = r.pcs.length;
  await r.advance(5000);
  assert.equal(r.pcs.length, k); assert.equal(r.ctx.dv, null);
});

test('left / dvStop: كلّ الروابط تُغلق، والمؤقّتات والعروض المعلّقة لا تفعل شيئًا بعدها', async () => {
  const p = guestPage();
  p.hooks.gathering = 'gathering';
  await on(p, ['g1', 'g3', 'g4']);
  const a = await offerFrom(p, 'g1');
  const all = [p.link('g1').pc, p.link('g3').pc, p.link('g4').pc];
  assert.equal(a, all[0]);
  p.ctx.fromHost({ t: 'kick' });      // left(T.kicked)
  assert.equal(p.ctx.dv, null); assert.equal(p.ctx.role, null);
  assert.ok(all.every((x) => x.closed === 1));
  assert.equal(p.hpc.closed, 1);
  assert.deepEqual(p.dTiles(), []);
  const n = p.pcs.length, sent = p.hdc.out.length;
  await p.advance(60000);
  assert.equal(p.pcs.length, n); assert.equal(p.hdc.out.length, sent, 'لا عرض ولا جواب بعد الخروج');
  // dvStop وحده، و dvStop مرّتين
  const q = guestPage();
  await on(q);
  const qs = [q.link('g3').pc, q.link('g4').pc];
  q.ctx.dvStop(); q.ctx.dvStop();
  assert.equal(q.ctx.dv, null); assert.ok(qs.every((x) => x.closed === 1));
  assert.doesNotThrow(() => q.ctx.left(''));
});

test('dvSig: عرض جديد يحلّ محلّ رابط كان يُرى مباشرة — يُخبر صاحب الغرفة أنّه لم يعد يراه (حتّى يمرّره له) ويزيل مربّعه', async () => {
  const p = guestPage({ cam: camStream('me'), camOn: true });
  await on(p);
  p.ctx.gstreams[1] = { id: 'R1' };
  p.ctx.fromHost({ t: 'vslots', list: [{ id: 'host', name: 'Omran', on: false }, { id: 'g1', name: 'Ali', on: true }, null] });
  const a = await offerFrom(p, 'g1');
  a.fire('connected'); a.track('video', { id: 'S1' });
  assert.deepEqual(last(p.oks()), { t: 'dvok', ids: ['g1'] });
  const keys = () => Array.from(p.ctx.tiles.keys()).filter((k) => k !== 'me').sort();
  assert.deepEqual(keys(), ['dg1'], 'يُرى مباشرة: خطّ التمرير مخفيّ');
  const k = p.oks().length;
  const b = await offerFrom(p, 'g1');
  assert.ok(b); assert.equal(p.ctx.dvSees('g1'), false);
  assert.equal(p.oks().length, k + 1, 'dvok واحدة');
  assert.deepEqual(last(p.oks()), { t: 'dvok', ids: [] }, 'يُخبر أنّه لم يعد يرى g1');
  assert.deepEqual(keys(), ['s1'], 'drawVids: مربّع المباشر يزول وخطّ التمرير يعود');
  // رابط لم يكن يُرى (لم يتّصل بعد) ثمّ عرض جديد: لا dvok زائدة
  const c = await offerFrom(p, 'g1');
  assert.ok(c); assert.equal(b.closed, 1); assert.equal(p.oks().length, k + 1, 'لم يكن يُرى: لا dvok');
});
