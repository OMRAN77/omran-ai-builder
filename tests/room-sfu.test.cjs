'use strict';
// v-talk-room-sfu: صفحة «غرفة الربع» — في الغرفة المدفوعة كلّ كاميرا تصل الكلّ عبر Cloudflare SFU، والصوت كما هو على وصلات صاحب الغرفة.
// تُستخرج الدوالّ الحقيقيّة من room.html (طريقة fnSrc في tests/room-plan.test.cjs) وتُشغَّل في vm مع RTCPeerConnection مزيّف يسجّل
// الخطوط (transceivers) ونداءات الوصف وreplaceTrack، وخادم مزيّف (call) يردّ على عمليّات sfu-* بالأشكال الموثّقة في api/_lib/talk-sfu.js.
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
const tick = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };

const SFU_FNS = [...new Set(html.match(/function sfu\w+\(/g))];
const FNS = ['function camTrack(', 'function setCam(', 'function camWant(', 'function flipCam(', 'function afterCam(', 'function gathered(', 'function pickOthers(',
  'function revideo(', 'function capRate(', 'function tile(', 'function drawVids(', 'function host(', 'function poll(', 'function admit(', 'function drop(',
  'function closeRoom(', 'function fromHost(', 'function left(', 'function capOf(', 'function leftLine(', 'function paidRoom(',
  'var send = function', 'var toAll = function', 'var toHost = function', ...SFU_FNS];
const SRC = html.match(/var SFU_SID = [^\n]+/)[0] + '\n' + html.match(/var sfuGen = 0;[^\n]*/)[0] + '\n' + FNS.map((h) => fnSrc(html, h)).join('\n');

const KEY = 'k'.repeat(24), S = 'ab'.repeat(16), STAMP = 'r0123456789', GID = 'a1b2c3d4e5f6', G2 = 'f6e5d4c3b2a1';
const strip = (x) => JSON.parse(JSON.stringify(x));

/** A fake DOM element (enough for tile / drawVids). */
function el(tag) {
  const cls = new Set();
  const e = {
    tag, parentNode: null, kids: [], srcObject: null,
    get className() { return Array.from(cls).join(' '); }, set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    classList: { toggle(c, on) { if (on === undefined) on = !cls.has(c); if (on) cls.add(c); else cls.delete(c); return on; }, contains: (c) => cls.has(c) },
    appendChild(k) { if (k.parentNode) k.parentNode.kids = k.parentNode.kids.filter((x) => x !== k); k.parentNode = e; e.kids.push(k); return k; },
    remove() { if (e.parentNode) e.parentNode.kids = e.parentNode.kids.filter((x) => x !== e); e.parentNode = null; },
    play() { return Promise.resolve(); },
  };
  return e;
}
/** A fake data channel: what is sent, parsed. */
function dc() { return { readyState: 'open', got: [], send(x) { this.got.push(JSON.parse(x)); } }; }
let camN = 0;
function camStream(facing) {
  const tr = { kind: 'video', id: 'cam' + (++camN), facing, stops: 0, stop() { this.stops++; }, getSettings() { return { deviceId: facing === 'environment' ? 'back' : 'front' }; } };
  return { track: tr, getTracks: () => [tr], getVideoTracks: () => [tr], getAudioTracks: () => [] };
}
function line(kind, init, track) {
  return {
    kind, init, mid: null, direction: init.direction, stopped: false, receiver: { track: { kind } },
    sender: { track: track || null, replaced: [], replaceTrack(x) { this.track = x; this.replaced.push(x); return Promise.resolve(); } },
    stop() { this.stopped = true; },
  };
}

/** The page's room code in a sandbox. srv: replies by op (an object or a function of the body) over the defaults below. */
function page(init, srv) {
  const sent = [], pcs = [], vids = el('div');
  vids.hidden = true;
  let n = 0, mid = 10;
  srv = srv || {};
  const gatherNow = !(init && init.slowIce), connectNow = !(init && init.slowLink);
  if (init) { delete init.slowIce; delete init.slowLink; }
  const defaults = (b) => {
    switch (b.op) {
      case 'open': return { code: '1234', key: KEY, plan: 'sub', cap: 10, left: null };
      case 'sfu-on': return { on: true, ice: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'turn:t', username: 'u', credential: 'c' }] };
      case 'sfu-new': n++; return { sid: 'sess' + String(n).padStart(8, '0'), st: 'st' + n };
      case 'sfu-push': {      // as the site: g an integer 0..9999 (none = 0), the name stamp-member-g
        const g = b.g === undefined ? 0 : b.g;
        if (!Number.isInteger(g) || g < 0 || g > 9999) return { error: 'g' };
        return { answer: 'v=0\r\nsfu-answer', tn: STAMP + '-' + (b.key ? 'host' : b.id) + '-' + g };
      }
      case 'sfu-pull': { const tracks = b.tracks.map((t) => ({ mid: String(mid++), tn: t.tn, sid: t.sid })); return { renegotiate: true, offer: 'v=0\r\na=mids:' + tracks.map((t) => t.mid).join(','), tracks }; }
      case 'admit': return { ok: true, s: S };
      case 'pending': return { joins: [] };
      default: return { ok: true };
    }
  };
  class PC {
    constructor(cfg) { this.cfg = cfg; this.trs = []; this.calls = []; this.ls = {}; this.iceGatheringState = gatherNow ? 'complete' : 'gathering'; this.connectionState = 'new'; this.localDescription = null; this.closed = false; this.sfu = !!(cfg && cfg.bundlePolicy); pcs.push(this); }
    addTransceiver(what, init) { this.calls.push('addTransceiver'); const t = line(typeof what === 'string' ? what : what.kind, init || {}, typeof what === 'string' ? null : what); this.trs.push(t); return t; }
    createDataChannel() { return dc(); }
    createOffer() { this.calls.push('createOffer'); return Promise.resolve({ type: 'offer', sdp: 'v=0\r\noffer' + this.trs.length }); }
    createAnswer() { this.calls.push('createAnswer'); return Promise.resolve({ type: 'answer', sdp: 'v=0\r\nanswer' }); }
    setLocalDescription(d) { this.calls.push('setLocal:' + d.type); this.trs.forEach((t, i) => { if (t.mid == null) t.mid = String(i); }); this.localDescription = { type: d.type, sdp: d.sdp + '\r\ngathered' }; return Promise.resolve(); }
    setRemoteDescription(d) {
      this.calls.push('setRemote:' + d.type);
      if (d.type === 'answer' && this.sfu && connectNow) this.connectionState = 'connected';      // the SFU's answer: the link comes up (at once, unless a test holds it)
      if (d.type === 'offer' && !this.sfu) { this.trs.push(line('audio', { direction: 'recvonly' })); for (let i = 0; i < 3; i++) this.trs.push(line('video', { direction: 'recvonly' })); }      // a guest's star offer
      if (d.type === 'offer' && this.sfu) {      // the SFU's offer: a receiving line per mid, and its picture
        const m = /a=mids:([\w,]*)/.exec(d.sdp);
        (m ? m[1].split(',').filter(Boolean) : []).forEach((x) => {
          if (this.trs.some((t) => t.mid === x)) return;
          const t = line('video', { direction: 'recvonly' }); t.mid = x; this.trs.push(t);
          if (this.ontrack) this.ontrack({ track: { kind: 'video', id: 'remote' + x }, transceiver: t, streams: [] });
        });
      }
      return Promise.resolve();
    }
    getTransceivers() { return this.trs; }
    close() { this.closed = true; }
    addEventListener(type, fn) { (this.ls[type] = this.ls[type] || []).push(fn); }
    fire(type, state) { if (type === 'connectionstatechange') this.connectionState = state; else this.iceGatheringState = state; (this.ls[type] || []).forEach((fn) => fn()); if (type === 'connectionstatechange' && this.onconnectionstatechange) this.onconnectionstatechange(); }
  }
  const counts = { remix: 0, draws: 0 };
  const ctx = {
    T, MAX: 10, fmt: (s, x) => s.replace('{n}', x), q: '', token: 'tok', WHY: {}, RTC: {},
    role: null, code: '', key: '', myId: 'host', myName: 'Omran', hostName: '', error: '', busy: '', members: [],
    roomPlan: '', cap: 10, roomLeft: null, roomLeftAt: 0, timeUp: false, plan: null, quote: null, noPoints: false, pollT: null, quiet: 0,
    peers: new Map(), asks: [], lines: [], cam: null, camOn: false, facing: 'user', flipping: false, camCount: 0,
    gv: [], gstreams: [], slots: [], tiles: new Map(), heard: new Map(),
    sfu: null, sfuS: '', sfuMap: [], vmap: new Map(), iceFor: '', icePromise: null,
    call: (b) => { sent.push(strip(b)); const o = srv[b.op]; return Promise.resolve(typeof o === 'function' ? o(b) : o || defaults(b)); },
    ice: (c) => { ctx.iceFor = c; ctx.icePromise = Promise.resolve(); return ctx.icePromise; },
    draw: () => { counts.draws++; }, say: () => {}, tellRoster: () => {}, remix: () => { counts.remix++; }, hear: () => {}, gone: () => {}, fromAnyone: () => {},
    loadPlan: () => {}, endFree: () => {}, setMic: () => Promise.resolve(true), fullText: () => 'full', countCams: () => {},
    cleanName: (v, d) => String(v || '').slice(0, 24) || (d == null ? 'guest' : d),
    $: (id) => (id === 'vids' ? vids : null), document: { createElement: el },
    history: { replaceState: () => {} }, location: { pathname: '/room' }, setInterval: () => 1, clearInterval: () => {}, setTimeout, clearTimeout,
    RTCPeerConnection: PC, MediaStream: class { constructor(tracks) { this.tracks = tracks; } },
    navigator: { mediaDevices: { getUserMedia: (c) => Promise.resolve(camStream(c.video && c.video.facingMode && c.video.facingMode.exact === 'environment' ? 'environment' : 'user')) } },
  };
  Object.assign(ctx, init || {});
  vm.runInNewContext(SRC, ctx);
  return {
    ctx, sent, pcs, vids, counts,
    sfuOps: () => sent.filter((b) => /^sfu-/.test(b.op)).map((b) => b.op),
    body: (op) => sent.filter((b) => b.op === op),
    sfuPcs: () => pcs.filter((p) => p.sfu),
  };
}

/** A guest in a room, linked to the owner (hostDc) with its three star video lines. */
function guest(srv, init) {
  const hostDc = dc();
  const p = page(Object.assign({ role: 'guest', code: '1234', myId: GID }, init || {}), srv);
  p.ctx.gv = [0, 1, 2].map((i) => line('video', { direction: i ? 'recvonly' : 'sendrecv' }));
  p.ctx.peers.set('host', { pc: { close() {} }, dc: hostDc, tx: line('audio', { direction: 'sendrecv' }) });
  p.hostDc = hostDc;
  p.toHost = () => hostDc.got;
  p.sfuMsgs = () => hostDc.got.filter((m) => m.t === 'sfu');
  return p;
}
async function guestLive(srv, init) {
  const p = guest(srv, init);
  p.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
  assert.equal(p.ctx.sfu && p.ctx.sfu.live, true, 'the guest is on the SFU');
  return p;
}
/** The owner of a paid room, after open; then admitted guests (each with its data channel open). */
async function owner(srv, init) {
  const p = page(init, srv);
  await p.ctx.host(); await tick();
  p.admitG = async (id, name) => {
    p.ctx.asks.push({ id, name: name || id, offer: 'v=0\r\nstar' });
    p.ctx.admit(id); await tick();
    const g = p.ctx.peers.get(id);
    const d = dc(); g.pc.ondatachannel({ channel: d }); d.onopen(); await tick();
    g.recv = (m) => { d.onmessage({ data: JSON.stringify(m) }); };
    return g;
  };
  return p;
}

test('free room: no sfu op ever — not after open, not after admit, not from sfuStart', async () => {
  const p = await owner({ open: { code: '1234', key: KEY, plan: 'free', cap: 4, left: 1800 }, admit: { ok: true } });
  assert.equal(p.ctx.role, 'host'); assert.equal(p.ctx.roomPlan, 'free');
  const g = await p.admitG(GID, 'Sara');
  p.ctx.sfuStart(); await p.ctx.setCam(true); await tick();
  assert.deepEqual(p.sfuOps(), []);
  assert.equal(p.ctx.sfu, null);
  assert.equal(g.dc.got.filter((m) => m.t === 'sfu' || m.t === 'vmap').length, 0, 'no SFU word to the guest');
  assert.equal(g.vtx[0].sender.track, p.ctx.cam.getVideoTracks()[0], 'the star line carries the owner\'s camera, as before');
  // a guest with no pass from the owner does nothing either
  const q = guest();
  q.ctx.sfuStart(); await tick();
  assert.deepEqual(q.sfuOps(), []);
});

test('paid room, SFU off on the site (sfu-on {on:false}): the star relay as before', async () => {
  const p = await owner({ 'sfu-on': { on: false } });
  assert.equal(p.ctx.roomPlan, 'sub');
  assert.deepEqual(p.sfuOps(), ['sfu-on'], 'asked once, nothing else');
  assert.deepEqual(p.body('sfu-on')[0], { op: 'sfu-on', code: '1234', key: KEY }, 'the owner by its room key');
  assert.equal(p.ctx.sfu, null); assert.equal(p.sfuPcs().length, 0);
  const g = await p.admitG(GID);
  await p.ctx.setCam(true); await tick();
  assert.equal(g.dc.got.filter((m) => m.t === 'sfu').length, 0, 'no pass handed out');
  assert.equal(g.vtx[0].sender.track, p.ctx.cam.getVideoTracks()[0]);
  assert.ok(g.dc.got.some((m) => m.t === 'vslots'), 'vslots as before');
  // the guest side: off on the site → its camera stays on the star line, the owner hears nothing new
  const q = guest({ 'sfu-on': { on: false } });
  await q.ctx.setCam(true);
  q.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
  assert.equal(q.ctx.sfu, null);
  assert.deepEqual(q.sfuOps(), ['sfu-on']);
  assert.deepEqual(q.body('sfu-on')[0], { op: 'sfu-on', code: '1234', id: GID, s: S }, 'the guest by its id and pass');
  assert.equal(q.ctx.gv[0].sender.track, q.ctx.cam.getVideoTracks()[0]);
  assert.equal(q.sfuMsgs().length, 0);
});

test('guest in SFU mode: two max-bundle links, own camera pushed sendonly at 300 kbps, the owner told {t:sfu, tn, sid, on:true}', async () => {
  const p = guest();
  await p.ctx.setCam(true);
  const camTr = p.ctx.cam.getVideoTracks()[0];
  assert.equal(p.ctx.gv[0].sender.track, camTr, 'before: the star line');
  p.ctx.fromHost({ t: 'sfu', s: 'not-a-pass', on: true }); await tick();
  assert.deepEqual(p.sfuOps(), [], 'a malformed pass is ignored');
  p.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
  assert.deepEqual(p.sfuOps(), ['sfu-on', 'sfu-new', 'sfu-new', 'sfu-push']);
  const [out, inn] = p.sfuPcs();
  for (const l of [out, inn]) {
    assert.equal(l.cfg.bundlePolicy, 'max-bundle');
    assert.deepEqual(strip(l.cfg.iceServers), [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'turn:t', username: 'u', credential: 'c' }], 'the servers sfu-on gave');
  }
  assert.equal(out.trs.length, 1);
  const tx = out.trs[0];
  assert.equal(tx.sender.track, camTr, 'the camera itself');
  assert.deepEqual(strip(tx.init), { direction: 'sendonly', sendEncodings: [{ maxBitrate: 300000 }] });
  assert.deepEqual(out.calls, ['addTransceiver', 'createOffer', 'setLocal:offer', 'setRemote:answer']);
  const push = p.body('sfu-push')[0], news = p.body('sfu-new');
  assert.deepEqual(push, { op: 'sfu-push', code: '1234', id: GID, s: S, sid: 'sess00000001', st: 'st1', offer: 'v=0\r\noffer1\r\ngathered', mid: '0', g: 0 }, 'the gathered description of the out link, its mid, the first generation');
  assert.equal(news.length, 2); assert.ok(news.every((b) => b.s === S && b.id === GID && !b.key));
  assert.deepEqual(p.sfuMsgs()[p.sfuMsgs().length - 1], { t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: 'sess00000001', on: true });
  assert.deepEqual(p.sfuMsgs()[0], { t: 'sfu', on: false }, 'first: on the SFU, no camera yet');
  assert.equal(p.ctx.gv[0].sender.track, null, 'the star line goes empty (kept negotiated)');
  assert.equal(p.ctx.gv[0].sender.replaced.filter((x) => x === camTr).length, 1, 'the star line got the camera only before SFU mode');
  assert.equal(inn.trs.length, 0, 'nothing pulled before a map');
});

test('owner: the pass to each guest, guest messages checked (tn ends with -id-g, sid shape), the map broadcast', async () => {
  const p = await owner();
  assert.deepEqual(p.sfuOps(), ['sfu-on', 'sfu-new', 'sfu-new']);
  assert.equal(p.ctx.sfu.live, true);
  const g = await p.admitG(GID, 'Sara'), h = await p.admitG(G2, 'Mona');
  assert.equal(g.sfuS, S, 'admit\'s s is kept');
  assert.ok(g.dc.got.some((m) => m.t === 'sfu' && m.s === S && m.on === true), 'the pass goes over the room link');
  const maps = (d) => d.got.filter((m) => m.t === 'vmap');
  const before = maps(h.dc).length;
  // someone else's track name, a bad session id, a junk message: ignored
  g.recv({ t: 'sfu', tn: STAMP + '-' + G2 + '-0', sid: 'sess00000099', on: true });
  g.recv({ t: 'sfu', tn: STAMP + '-host-0', sid: 'sess00000099', on: true });
  g.recv({ t: 'sfu', tn: STAMP + '-x' + GID + '-0', sid: 'sess00000099', on: true });
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID, sid: 'sess00000099', on: true });                 // without the generation
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-', sid: 'sess00000099', on: true });
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-x', sid: 'sess00000099', on: true });
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-12345', sid: 'sess00000099', on: true });
  g.recv({ t: 'sfu', tn: STAMP + '-' + G2 + '-' + GID + '-0', sid: 'sess00000099', on: true });  // another's name with this id stuck on
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-0-1', sid: 'sess00000099', on: true });
  g.recv({ t: 'sfu', tn: GID + '-0', sid: 'sess00000099', on: true });
  g.recv({ t: 'sfu', tn: 7, sid: 'sess00000099', on: true });
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: 'bad sid!', on: true });
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: { x: 1 }, on: true });
  assert.equal(p.ctx.vmap.has(GID), false);
  assert.equal(maps(h.dc).length, before, 'nothing broadcast');
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: 'sess00000099', on: true }); await tick();
  assert.deepEqual(strip(p.ctx.vmap.get(GID)), { sid: 'sess00000099', tn: STAMP + '-' + GID + '-0', on: true });
  const last = maps(h.dc)[maps(h.dc).length - 1];
  assert.deepEqual(last.list.find((e) => e.id === GID), { id: GID, name: 'Sara', sid: 'sess00000099', tn: STAMP + '-' + GID + '-0', on: true });
  assert.ok(last.list.some((e) => e.id === 'host' && e.name === 'Omran'), 'the owner\'s own entry');
  assert.deepEqual(maps(g.dc)[maps(g.dc).length - 1], last, 'to every guest');
  // the owner pulls it too
  assert.deepEqual(p.body('sfu-pull')[0].tracks, [{ sid: 'sess00000099', tn: STAMP + '-' + GID + '-0' }]);
  assert.deepEqual(p.body('sfu-pull')[0].sid, 'sess00000002', 'on the owner\'s in link');
  assert.ok(p.ctx.tiles.has('f' + GID), 'tile keyed f + id');
  const oldMid = p.ctx.sfu.got[GID].mid, oldVideo = p.ctx.tiles.get('f' + GID).video.srcObject;
  // the same guest under a new generation (pushed again without an off between, e.g. after a failure): its entry replaced, the new name
  // pulled, the old line closed, still one tile keyed f + id
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-1', sid: 'sess00000099', on: true }); await tick();
  assert.deepEqual(strip(p.ctx.vmap.get(GID)), { sid: 'sess00000099', tn: STAMP + '-' + GID + '-1', on: true });
  assert.deepEqual(maps(h.dc).pop().list.filter((e) => e.id === GID).map((e) => e.tn), [STAMP + '-' + GID + '-1'], 'one entry, the new name');
  assert.deepEqual(p.body('sfu-close').pop(), { op: 'sfu-close', code: '1234', key: KEY, sid: 'sess00000002', st: 'st2', mids: [oldMid] }, 'the old line closed');
  assert.deepEqual(p.body('sfu-pull').pop().tracks, [{ sid: 'sess00000099', tn: STAMP + '-' + GID + '-1' }]);
  assert.deepEqual([...p.ctx.tiles.keys()].filter((k) => k.indexOf(GID) >= 0), ['f' + GID], 'no second tile');
  assert.notEqual(p.ctx.tiles.get('f' + GID).video.srcObject, oldVideo, 'the tile shows the new picture');
  assert.equal(p.vids.kids.length, 1);
  // the owner's own camera: pushed as 'host', in the map
  await p.ctx.setCam(true); await tick();
  assert.equal(p.body('sfu-push')[0].key, KEY);
  assert.equal(p.body('sfu-push')[0].g, 0);
  assert.deepEqual(strip(p.ctx.vmap.get('host')), { sid: 'sess00000001', tn: STAMP + '-host-0', on: true });
  // off and on again: the next generation, the map entry with the new name
  await p.ctx.setCam(false); await tick(); await p.ctx.setCam(true); await tick();
  assert.deepEqual(p.body('sfu-push').map((b) => b.g), [0, 1]);
  assert.deepEqual(strip(p.ctx.vmap.get('host')), { sid: 'sess00000001', tn: STAMP + '-host-1', on: true });
  assert.ok(maps(g.dc).pop().list.some((e) => e.id === 'host' && e.tn === STAMP + '-host-1' && e.on));
});

test('the map diff: new pictures in one sfu-pull, the SFU offer answered by sfu-reneg, ontrack by mid to tiles f+id, removed mids closed', async () => {
  const p = await guestLive();
  const [, inn] = p.sfuPcs();
  const list = [
    { id: 'host', name: 'Omran', sid: 'sess000000aa', tn: STAMP + '-host-0', on: true },
    { id: GID, name: 'me', sid: 'sess00000001', tn: STAMP + '-' + GID + '-0', on: true },
    { id: G2, name: 'Mona', sid: 'sess000000bb', tn: STAMP + '-' + G2 + '-0', on: true },
    { id: 'zz', name: 'off', sid: 'sess000000cc', tn: STAMP + '-zz-0', on: false },
    { id: 'bad', name: 'liar', sid: 'sess000000dd', tn: STAMP + '-host-0', on: true },
  ];
  p.ctx.fromHost({ t: 'vmap', list }); await tick();
  const pulls = p.body('sfu-pull');
  assert.equal(pulls.length, 1, 'one pull');
  assert.deepEqual(pulls[0], { op: 'sfu-pull', code: '1234', id: GID, s: S, sid: 'sess00000002', st: 'st2', tracks: [{ sid: 'sess000000aa', tn: STAMP + '-host-0' }, { sid: 'sess000000bb', tn: STAMP + '-' + G2 + '-0' }] }, 'not itself, not off, not a name that is not its own');
  assert.deepEqual(inn.calls, ['setRemote:offer', 'createAnswer', 'setLocal:answer']);
  assert.deepEqual(p.body('sfu-reneg'), [{ op: 'sfu-reneg', code: '1234', id: GID, s: S, sid: 'sess00000002', st: 'st2', answer: 'v=0\r\nanswer\r\ngathered' }]);
  assert.ok(p.ctx.tiles.has('fhost') && p.ctx.tiles.has('f' + G2));
  assert.equal(p.ctx.tiles.get('fhost').name.textContent, 'Omran');
  assert.equal(p.ctx.tiles.get('f' + G2).name.textContent, 'Mona', 'the name from the map');
  assert.equal(p.ctx.tiles.get('fhost').video.srcObject.tracks[0].id, 'remote10', 'mid 10 is the owner\'s');
  assert.equal(p.ctx.tiles.get('f' + G2).video.srcObject.tracks[0].id, 'remote11');
  assert.equal(p.vids.hidden, false);
  // the same map again: nothing new
  p.ctx.fromHost({ t: 'vmap', list }); await tick();
  assert.equal(p.body('sfu-pull').length, 1);
  // Mona off, the owner gone: both closed, tiles removed
  p.ctx.fromHost({ t: 'vmap', list: [{ ...list[2], on: false }] }); await tick();
  assert.deepEqual(p.body('sfu-close'), [{ op: 'sfu-close', code: '1234', id: GID, s: S, sid: 'sess00000002', st: 'st2', mids: ['10', '11'] }]);
  assert.ok(!p.ctx.tiles.has('fhost') && !p.ctx.tiles.has('f' + G2));
  assert.equal(p.vids.hidden, true);
  // on again (a new push, the next generation's name): pulled again, the same tile key
  const mona1 = { ...list[2], tn: STAMP + '-' + G2 + '-1' };
  p.ctx.fromHost({ t: 'vmap', list: [mona1] }); await tick();
  assert.equal(p.body('sfu-pull').length, 2);
  assert.deepEqual(p.body('sfu-pull')[1].tracks, [{ sid: 'sess000000bb', tn: mona1.tn }]);
  assert.ok(p.ctx.tiles.has('f' + G2));
  // a newer generation while still on: the new name pulled, the old line closed (before the pull), one tile only
  const midWas = p.ctx.sfu.got[G2].mid;
  p.ctx.fromHost({ t: 'vmap', list: [{ ...list[2], tn: STAMP + '-' + G2 + '-2' }] }); await tick();
  assert.deepEqual(p.body('sfu-close').pop().mids, [midWas]);
  assert.deepEqual(p.body('sfu-pull').pop().tracks, [{ sid: 'sess000000bb', tn: STAMP + '-' + G2 + '-2' }]);
  assert.deepEqual(p.sfuOps().slice(-3), ['sfu-close', 'sfu-pull', 'sfu-reneg'], 'closed first, then pulled');
  assert.deepEqual([...p.ctx.tiles.keys()], ['f' + G2], 'no duplicate tile');
  assert.equal(p.ctx.sfu.got[G2].tn, STAMP + '-' + G2 + '-2');
  assert.notEqual(p.ctx.sfu.got[G2].mid, midWas);
  // a pull with no renegotiation needed: no reneg; a failed track: no tile, the room goes on, and the picture is asked again —
  // on the next map and after 3 s (three times in a row at most, so a picture that never comes does not pull forever)
  const timers = [];
  const fakeTimer = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  let fails = 99;
  const q = await guestLive({ 'sfu-pull': (b) => (fails-- > 0 ? { renegotiate: false, tracks: b.tracks.map((t) => ({ tn: t.tn, sid: t.sid, error: 'sfu' })) } : { renegotiate: true, offer: 'v=0\r\na=mids:20', tracks: b.tracks.map((t) => ({ mid: '20', tn: t.tn, sid: t.sid })) }) }, { setTimeout: fakeTimer });
  q.ctx.fromHost({ t: 'vmap', list: [list[2]] }); await tick();
  assert.equal(q.body('sfu-pull').length, 1); assert.equal(q.body('sfu-reneg').length, 0);
  assert.ok(!q.ctx.tiles.has('f' + G2)); assert.equal(q.ctx.sfu.live, true, 'one picture failing is not a failure of the room');
  q.ctx.fromHost({ t: 'vmap', list: [list[2]] }); await tick();
  assert.equal(q.body('sfu-pull').length, 2, 'the next map asks again');
  const retries = () => timers.filter((t) => t.ms === 3000);
  assert.equal(retries().length, 1, 'one retry timer, not one per failure');
  for (let i = 0; i < 6; i++) { const t = retries()[i]; if (!t) break; t.fn(); await tick(); }
  assert.equal(retries().length, 3, 'three retries in a row at most');
  assert.equal(q.body('sfu-pull').length, 5);
  fails = 0;
  q.ctx.fromHost({ t: 'vmap', list: [list[2]] }); await tick();
  assert.ok(q.ctx.tiles.has('f' + G2), 'it comes once the SFU has it');
  assert.equal(q.ctx.sfu.tries, 0, 'a pull that works resets the count');
});

test('a line the SFU used before carries a new picture without a new ontrack: the tile still comes (bound from the line)', async () => {
  const p = await guestLive({ 'sfu-pull': (b) => ({ renegotiate: true, offer: 'v=0\r\na=mids:10', tracks: b.tracks.map((t) => ({ mid: '10', tn: t.tn, sid: t.sid })) }) });
  const host = { id: 'host', name: 'Omran', sid: 'sess000000aa', tn: STAMP + '-host-0', on: true };
  p.ctx.fromHost({ t: 'vmap', list: [host] }); await tick();
  assert.ok(p.ctx.tiles.has('fhost'));
  p.ctx.fromHost({ t: 'vmap', list: [{ ...host, on: false }] }); await tick();
  assert.ok(!p.ctx.tiles.has('fhost'));
  p.ctx.fromHost({ t: 'vmap', list: [host] }); await tick();      // mid 10 again: the fake fires no ontrack for a line it has
  assert.ok(p.ctx.tiles.has('fhost'), 'the picture is on its tile again');
  assert.equal(p.ctx.tiles.get('fhost').video.srcObject.tracks[0].kind, 'video');
  // a pull answered with no renegotiation at all: bound from the line too
  const q = await guestLive({ 'sfu-pull': (b) => ({ renegotiate: false, tracks: b.tracks.map((t) => ({ mid: '0', tn: t.tn, sid: t.sid })) }) });
  const [, inn] = q.sfuPcs();
  const l = line('video', { direction: 'recvonly' }); l.mid = '0'; inn.trs.push(l);
  q.ctx.fromHost({ t: 'vmap', list: [host] }); await tick();
  assert.ok(q.ctx.tiles.has('fhost'));
});

test('no trickle: the push waits for gathering; the owner is told only once the out link is connected', async () => {
  const p = guest(null, { slowIce: true, slowLink: true });
  await p.ctx.setCam(true);
  p.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
  assert.deepEqual(p.sfuOps(), ['sfu-on', 'sfu-new', 'sfu-new'], 'no push while candidates are still gathering');
  const [out] = p.sfuPcs();
  out.fire('icegatheringstatechange', 'complete'); await tick();
  assert.deepEqual(p.sfuOps(), ['sfu-on', 'sfu-new', 'sfu-new', 'sfu-push']);
  assert.ok(!p.sfuMsgs().some((m) => m.on), 'pushed, but not told before the link is up');
  out.fire('connectionstatechange', 'connected'); await tick();
  assert.deepEqual(p.sfuMsgs().pop(), { t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: 'sess00000001', on: true });
  // a guest repeating the same news: the owner sends no new map
  const o = await owner();
  const g = await o.admitG(GID), h = await o.admitG(G2);
  const news = { t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: 'sess00000099', on: true };
  g.recv(news); await tick();
  const maps = h.dc.got.filter((m) => m.t === 'vmap').length, pulls = o.body('sfu-pull').length;
  g.recv(news); g.recv(news); await tick();
  assert.equal(h.dc.got.filter((m) => m.t === 'vmap').length, maps);
  assert.equal(o.body('sfu-pull').length, pulls);
});

test('changes on a link wait for each other: a map while a pull is out goes after it', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const p = await guestLive({ 'sfu-reneg': () => gate.then(() => ({ ok: true })) });
  const e = (id, on) => ({ id, name: id, sid: 'sess0000' + id.slice(0, 4), tn: STAMP + '-' + id + '-0', on });
  p.ctx.fromHost({ t: 'vmap', list: [e('host', true)] }); await tick();
  p.ctx.fromHost({ t: 'vmap', list: [e('host', false), e(G2, true)] }); await tick();
  assert.deepEqual(p.sfuOps(), ['sfu-on', 'sfu-new', 'sfu-new', 'sfu-pull', 'sfu-reneg'], 'the close and the second pull wait for the renegotiation');
  release(); await tick();
  assert.deepEqual(p.sfuOps().slice(3), ['sfu-pull', 'sfu-reneg', 'sfu-close', 'sfu-pull', 'sfu-reneg']);
});

test('camera off closes the own track and tells the owner; on again pushes again under the next generation (g+1, a new name)', async () => {
  const p = guest();
  await p.ctx.setCam(true);
  p.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
  const [out] = p.sfuPcs(), first = out.trs[0];
  assert.equal(p.body('sfu-push')[0].g, 0);
  assert.deepEqual(p.sfuMsgs().pop(), { t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: 'sess00000001', on: true });
  await p.ctx.setCam(false); await tick();
  assert.deepEqual(p.body('sfu-close'), [{ op: 'sfu-close', code: '1234', id: GID, s: S, sid: 'sess00000001', st: 'st1', mids: ['0'] }]);
  assert.equal(first.stopped, true); assert.equal(first.sender.track, null);
  assert.deepEqual(p.sfuMsgs()[p.sfuMsgs().length - 1], { t: 'sfu', on: false });
  assert.equal(p.ctx.gv[0].sender.track, null, 'the star line stays empty');
  await p.ctx.setCam(true); await tick();
  assert.equal(p.body('sfu-push').length, 2);
  assert.equal(out.trs.length, 2); assert.equal(p.body('sfu-push')[1].mid, '1', 'a new line');
  assert.equal(p.body('sfu-push')[1].g, 1, 'the next generation: never the old name again on the same session');
  assert.equal(p.body('sfu-push')[1].sid, p.body('sfu-push')[0].sid, 'the same SFU session');
  assert.equal(out.trs[1].sender.track, p.ctx.cam.getVideoTracks()[0]);
  assert.deepEqual(p.sfuMsgs()[p.sfuMsgs().length - 1], { t: 'sfu', tn: STAMP + '-' + GID + '-1', sid: 'sess00000001', on: true });
  assert.equal(p.ctx.sfu.tn, STAMP + '-' + GID + '-1');
  assert.equal(p.ctx.gv[0].sender.track, null);
  await p.ctx.setCam(false); await tick(); await p.ctx.setCam(true); await tick();
  assert.deepEqual(p.body('sfu-push').map((b) => b.g), [0, 1, 2]);
  // the site answering a name that is not this push's (another generation, another member): back to the relay
  for (const [tn, ok] of [[STAMP + '-' + GID + '-0', true], [STAMP + '-' + GID + '-1', false], [STAMP + '-' + G2 + '-0', false], [STAMP + '-' + GID, false]]) {
    const w = guest({ 'sfu-push': { answer: 'v=0\r\nsfu-answer', tn } });
    await w.ctx.setCam(true);
    w.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
    if (ok) assert.equal(w.ctx.sfu.live, true, 'g 0: the first push\'s own name');
    else { assert.equal(w.ctx.sfu, null, tn); assert.deepEqual(w.sfuMsgs().pop(), { t: 'sfu', on: false, relay: true }, tn); }
  }
  // a push that failed: the relay; the owner's next word brings the SFU back, and the push there is the next generation
  let first0 = true;
  const r = guest({ 'sfu-push': (b) => (first0 ? (first0 = false, { error: 'sfu' }) : { answer: 'v=0\r\nsfu-answer', tn: STAMP + '-' + GID + '-' + b.g }) });
  await r.ctx.setCam(true);
  r.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
  assert.equal(r.ctx.sfu, null);
  r.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
  assert.equal(r.ctx.sfu.live, true);
  assert.deepEqual(r.body('sfu-push').map((b) => b.g), [0, 1], 'the push after the failure has a new generation');
  assert.deepEqual(r.sfuMsgs().pop(), { t: 'sfu', tn: STAMP + '-' + GID + '-1', sid: 'sess00000003', on: true });
  // the owner: camera off → own map entry off; on again → the next generation in the map
  const o = await owner();
  await o.ctx.setCam(true); await tick(); await o.ctx.setCam(false); await tick();
  assert.deepEqual(strip(o.ctx.vmap.get('host')), { sid: '', tn: '', on: false });
  assert.equal(o.body('sfu-close').length, 1);
  await o.ctx.setCam(true); await tick();
  assert.deepEqual(strip(o.ctx.vmap.get('host')), { sid: 'sess00000001', tn: STAMP + '-host-1', on: true });
  // the receiving side: the owner's map goes on (g 0) → off → on (g 1): one tile fhost throughout, the new name pulled, the old line closed
  const v = await guestLive();
  const hostE = (g, on) => ({ id: 'host', name: 'Omran', sid: 'sess000000aa', tn: STAMP + '-host-' + g, on });
  v.ctx.fromHost({ t: 'vmap', list: [hostE(0, true)] }); await tick();
  const m0 = v.ctx.sfu.got.host.mid;
  v.ctx.fromHost({ t: 'vmap', list: [hostE(0, false)] }); await tick();
  assert.ok(!v.ctx.tiles.has('fhost'));
  v.ctx.fromHost({ t: 'vmap', list: [hostE(1, true)] }); await tick();
  assert.deepEqual(v.body('sfu-close').map((b) => b.mids), [[m0]]);
  assert.deepEqual(v.body('sfu-pull').map((b) => b.tracks[0].tn), [STAMP + '-host-0', STAMP + '-host-1']);
  assert.deepEqual([...v.ctx.tiles.keys()], ['fhost']);
  assert.equal(v.vids.kids.length, 1, 'no duplicate tile');
});

test('flipCam: the new picture replaces the track on the SFU sender — no new push, no sfu op', async () => {
  const p = guest();
  await p.ctx.setCam(true); p.ctx.camCount = 2;
  p.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
  const [out] = p.sfuPcs(), n = p.sent.length, front = p.ctx.cam.getVideoTracks()[0];
  assert.equal(out.trs[0].sender.track, front);
  assert.equal(await p.ctx.flipCam(), true); await tick();
  const back = p.ctx.cam.getVideoTracks()[0];
  assert.notEqual(back, front); assert.equal(back.facing, 'environment');
  assert.equal(out.trs[0].sender.track, back, 'the SFU sender carries the back camera');
  assert.equal(out.trs.length, 1);
  assert.equal(p.sent.length, n, 'no call to the site');
  assert.equal(p.ctx.gv[0].sender.track, null, 'the star line still empty');
});

test('SFU mode: the owner stops feeding star VIDEO lines of guests on the SFU (kept for the way back); voices untouched', async () => {
  const p = await owner();
  const g = await p.admitG(GID, 'Sara'), r = await p.admitG(G2, 'Relay');
  const remixes = p.counts.remix;
  await p.ctx.setCam(true); await tick();
  const camTr = p.ctx.cam.getVideoTracks()[0];
  assert.equal(g.vtx[0].sender.track, camTr, 'before the guest is on the SFU: the star line');
  g.recv({ t: 'sfu', on: false }); await tick();      // on the SFU, no camera
  assert.ok(g.vtx.every((t) => t.sender.track === null), 'all three star video lines empty');
  const vslots = g.dc.got.filter((m) => m.t === 'vslots').length;
  await p.ctx.setCam(false); await p.ctx.setCam(true); await tick();
  assert.ok(g.vtx.every((t) => t.sender.track === null), 'and they stay empty');
  assert.equal(g.dc.got.filter((m) => m.t === 'vslots').length, vslots, 'no vslots for it');
  assert.equal(r.vtx[0].sender.track, p.ctx.cam.getVideoTracks()[0], 'a guest still on the relay keeps the star picture');
  assert.equal(g.vtx.length, 3, 'the lines stay (no renegotiation)');
  // voices: the SFU never touches the audio line nor the mix
  assert.equal(p.counts.remix, remixes, 'no remix from the SFU');
  assert.equal(g.tx.sender.replaced.length, 0, 'the audio sender is not touched');
  for (const h of SFU_FNS) assert.doesNotMatch(fnSrc(html, h), /remix|unmix|hear\(|heard|\bouts\b|micNode|\bp\.tx\b/, h);
  for (const l of p.sfuPcs()) assert.ok(l.trs.every((t) => t.kind === 'video'), 'SFU links carry video only');
  // the guest side: the star picture comes back only off the SFU
  const q = await guestLive();
  await q.ctx.setCam(true); await tick();
  assert.equal(q.ctx.gv[0].sender.track, null);
  assert.equal(q.ctx.peers.get('host').tx.sender.replaced.length, 0);
  // the guest ignores the star slots in SFU mode
  q.ctx.gstreams = [{}, {}, {}]; q.ctx.slots = [{ id: 'x', name: 'X', on: true }];
  q.ctx.drawVids();
  assert.ok(!q.ctx.tiles.has('s0'));
  // the owner shows no star tile for a guest on the SFU, but does for one on the relay
  g.vstream = {}; g.cam = true; r.vstream = {}; r.cam = true; p.ctx.drawVids();
  assert.ok(!p.ctx.tiles.has(GID) && p.ctx.tiles.has(G2));
});

test('the room lapses to free: {t:sfu, on:false} to everyone, all back on the star relay', async () => {
  const p = await owner({ pending: { joins: [], plan: 'free', cap: 4 } });
  const g = await p.admitG(GID, 'Sara');
  await p.ctx.setCam(true); await tick();
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: 'sess00000099', on: true }); await tick();
  assert.ok(p.ctx.tiles.has('f' + GID));
  const links = p.sfuPcs(), seen = g.dc.got.length;
  p.ctx.poll(); await tick();
  assert.equal(p.ctx.roomPlan, 'free');
  assert.deepEqual(g.dc.got.slice(seen).filter((m) => m.t === 'sfu' || m.t === 'vmap'), [{ t: 'sfu', on: false }], 'one word: back to the relay');
  assert.ok(g.dc.got.slice(seen).some((m) => m.t === 'vslots'), 'and the star slots again');
  assert.equal(p.ctx.sfu, null);
  assert.ok(links.every((l) => l.closed), 'the owner\'s SFU links closed');
  assert.equal(g.vtx[0].sender.track, p.ctx.cam.getVideoTracks()[0], 'the star line has the owner\'s camera again');
  assert.equal(p.ctx.vmap.size, 0); assert.ok(!p.ctx.tiles.has('f' + GID));
  const ops = p.sent.length;
  p.ctx.sfuStart(); await p.ctx.setCam(false); await p.ctx.setCam(true); await tick();
  assert.equal(p.sent.length, ops, 'a free room asks nothing more');
  // the guest hears it
  const q = await guestLive();
  await q.ctx.setCam(true); await tick();
  q.ctx.fromHost({ t: 'vmap', list: [{ id: 'host', name: 'Omran', sid: 'sess000000aa', tn: STAMP + '-host-0', on: true }] }); await tick();
  const ql = q.sfuPcs();
  q.ctx.fromHost({ t: 'sfu', on: false }); await tick();
  assert.equal(q.ctx.sfu, null); assert.equal(q.ctx.sfuS, '');
  assert.ok(ql.every((l) => l.closed));
  assert.equal(q.ctx.gv[0].sender.track, q.ctx.cam.getVideoTracks()[0], 'its camera on the star line again');
  assert.ok(!q.ctx.tiles.has('fhost'));
  q.ctx.gstreams = [{}]; q.ctx.slots = [{ id: 'host', name: 'Omran', on: true }]; q.ctx.drawVids();
  assert.ok(q.ctx.tiles.has('s0'), 'the star tiles are back');
});

test('any SFU failure: back to the star relay, silently (no error line), the owner told', async () => {
  for (const [op, reply] of [['sfu-on', { error: 'free' }], ['sfu-new', { error: 'sfu' }], ['sfu-push', { error: 'sfu' }], ['sfu-push', { answer: 'not sdp', tn: 'x' }], ['sfu-pull', { error: 'sfu' }], ['sfu-reneg', { error: 'sfu' }]]) {
    const p = guest({ [op]: reply });
    await p.ctx.setCam(true);
    p.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
    p.ctx.fromHost({ t: 'vmap', list: [{ id: 'host', name: 'Omran', sid: 'sess000000aa', tn: STAMP + '-host-0', on: true }] }); await tick();
    assert.equal(p.ctx.sfu, null, op);
    assert.equal(p.ctx.error, '', op + ': no error text');
    assert.equal(p.ctx.gv[0].sender.track, p.ctx.cam.getVideoTracks()[0], op + ': camera on the star line');
    assert.ok(p.sfuPcs().every((l) => l.closed), op + ': links closed');
    if (op !== 'sfu-on') assert.deepEqual(p.sfuMsgs().pop(), { t: 'sfu', on: false, relay: true }, op);
  }
  // a link that fails later (connectionState failed)
  const q = await guestLive();
  const [out] = q.sfuPcs();
  out.connectionState = 'failed'; out.onconnectionstatechange();
  assert.equal(q.ctx.sfu, null);
  assert.deepEqual(q.sfuMsgs().pop(), { t: 'sfu', on: false, relay: true });
  // the owner's failure sends everyone back
  const o = await owner({ 'sfu-pull': { error: 'sfu' } });
  const g = await o.admitG(GID);
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: 'sess00000099', on: true }); await tick();
  assert.equal(o.ctx.sfu, null); assert.equal(o.ctx.error, '');
  assert.ok(g.dc.got.some((m) => m.t === 'sfu' && m.on === false));
  await o.ctx.setCam(true); await tick();
  assert.equal(g.vtx[0].sender.track, o.ctx.cam.getVideoTracks()[0], 'the guest gets the star picture again');
  // a guest that fell back: the owner feeds its star lines again and drops it from the map
  const o2 = await owner();
  const g2 = await o2.admitG(GID), g3 = await o2.admitG(G2);
  await o2.ctx.setCam(true);
  g2.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: 'sess00000099', on: true }); await tick();
  assert.equal(g2.vtx[0].sender.track, null);
  g2.recv({ t: 'sfu', on: false, relay: true }); await tick();
  assert.equal(g2.vtx[0].sender.track, o2.ctx.cam.getVideoTracks()[0]);
  assert.ok(!o2.ctx.vmap.has(GID));
  assert.ok(!g3.dc.got.filter((m) => m.t === 'vmap').pop().list.some((e) => e.id === GID));
});

test('kick: sfu-gone for that guest, and the map goes out without it; leaving closes own links (best-effort sfu-close)', async () => {
  const p = await owner();
  const g = await p.admitG(GID, 'Sara'), h = await p.admitG(G2, 'Mona');
  g.recv({ t: 'sfu', tn: STAMP + '-' + GID + '-0', sid: 'sess00000099', on: true }); await tick();
  p.ctx.drop(GID, true); await tick();
  assert.deepEqual(p.body('sfu-gone'), [{ op: 'sfu-gone', code: '1234', key: KEY, id: GID }]);
  assert.ok(g.dc.got.some((m) => m.t === 'kick'));
  const last = h.dc.got.filter((m) => m.t === 'vmap').pop();
  assert.ok(!last.list.some((e) => e.id === GID), 'the map without it');
  assert.ok(!p.ctx.tiles.has('f' + GID));
  assert.ok(p.body('sfu-close').some((b) => b.sid === 'sess00000002'), 'its picture closed on the owner\'s in link');
  // dropped without kick (left by itself): no sfu-gone
  p.ctx.drop(G2, false); await tick();
  assert.equal(p.body('sfu-gone').length, 1);
  // a free room's guest has no pass: kick asks nothing
  const f = await owner({ open: { code: '1234', key: KEY, plan: 'free', cap: 4 }, admit: { ok: true } });
  await f.admitG(GID); f.ctx.drop(GID, true); await tick();
  assert.deepEqual(f.sfuOps(), []);
  // the guest leaves: own camera and pulls closed at the SFU, links closed
  const q = guest();
  await q.ctx.setCam(true);
  q.ctx.fromHost({ t: 'sfu', s: S, on: true }); await tick();
  q.ctx.fromHost({ t: 'vmap', list: [{ id: 'host', name: 'Omran', sid: 'sess000000aa', tn: STAMP + '-host-0', on: true }] }); await tick();
  const links = q.sfuPcs();
  q.ctx.left(''); await tick();
  assert.ok(links.every((l) => l.closed));
  assert.deepEqual(q.body('sfu-close').map((b) => [b.sid, b.mids]), [['sess00000001', ['0']], ['sess00000002', ['10']]]);
  assert.equal(q.ctx.sfu, null); assert.equal(q.ctx.sfuS, '');
  // the owner closes the room: its links closed
  const o = await owner();
  const ol = o.sfuPcs();
  o.ctx.closeRoom(); await tick();
  assert.ok(ol.every((l) => l.closed)); assert.equal(o.ctx.sfu, null);
});

test('guest-side code says nothing of the owner\'s plan; the hooks stay safe where the code runs alone', () => {
  const ban = /plan|sub-buy|sub-auto|loadPlan|planCard|leftLine|timeUp/i;
  for (const h of ['function join(', 'function fromHost(', 'function left(', 'function peek(', 'function answer(', ...SFU_FNS]) assert.doesNotMatch(fnSrc(html, h), ban, h);
  // host/poll/closeRoom run alone in tests/room-plan, afterCam/drawVids in tests/room-flip: the SFU is reached only through typeof there
  for (const h of ['function host(', 'function poll(', 'function closeRoom(']) assert.match(fnSrc(html, h), /typeof sfu(Start|Stop) === 'function'/, h);
  for (const h of ['function afterCam(', 'function drawVids(']) assert.match(fnSrc(html, h), /typeof sfu === 'object' && !!sfu && sfu\.live/, h);
  // no secret on the page: the site holds the Cloudflare app id and secret
  assert.doesNotMatch(html, /CLOUDFLARE_REALTIME|rtc\.live\.cloudflare\.com|Bearer/);
  // the pinned star strings are still there
  assert.match(html, /var others = pickOthers\(g\.id, ids, camIsOn\)/);
  assert.match(html, /tile\('s' \+ i, cleanName\(sl\.name\), gstreams\[i\]\)/);
  assert.match(html, /t\.sender\.replaceTrack\(o && o\.p\.cam && o\.p\.vtrack \? o\.p\.vtrack : null\)/);
});
