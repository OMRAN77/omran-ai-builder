'use strict';
// v-talk-room-flip: زرّ «الكاميرا الأمامية ↔ الخلفية» في صفحة «غرفة الربع».
// تُستخرج الدوالّ الحقيقيّة من room.html (طريقة fnSrc في tests/room-plan.test.cjs) وتُشغَّل في vm مع navigator.mediaDevices مزيّف
// يسجّل كلّ getUserMedia وقيوده، ويعطي بثوثًا مزيّفة تسجّل مساراتها stop().
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
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
const CAM_FNS = ['function camTrack(', 'function setCam(', 'function camWant(', 'function countCams(', 'function flipCam(', 'function afterCam(',
  'function tile(', 'function drawVids(', 'function talkBox(', 'var esc = function'];

let sid = 0;
/** A fake camera stream: one video track that remembers stop() and says which device it is. */
function stream(deviceId, facing) {
  const tr = { kind: 'video', stops: 0, deviceId, facing, stop() { this.stops++; }, getSettings() { return { deviceId, facingMode: facing }; } };
  const s = { id: 's' + (++sid), deviceId, facing, track: tr, getTracks: () => [tr], getVideoTracks: () => [tr], getAudioTracks: () => [] };
  return s;
}
const err = (name) => Object.assign(new Error(name), { name });
const dead = (s) => s.track.stops > 0;

/** A fake DOM element with a real class list (enough for tile / drawVids). */
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

/**
 * The page's camera code in a sandbox.
 * plan: what each getUserMedia call does, in order — 'front' / 'back' / 'cam:<id>' gives a stream, an Error rejects, 'wait' returns a
 * promise the test settles itself (p.pending). Past the plan every call opens the camera it is asked for.
 */
function page(plan, init) {
  const gums = [], pending = [], revideos = [], toHost = [], replaced = [];
  const opened = [];
  let devices = [{ kind: 'videoinput', deviceId: 'front' }, { kind: 'videoinput', deviceId: 'back' }, { kind: 'audioinput', deviceId: 'mic' }];
  const open = (c) => {
    const v = c.video || {};
    const fm = v.facingMode && typeof v.facingMode === 'object' ? v.facingMode.exact : v.facingMode;
    const id = v.deviceId ? v.deviceId.exact : fm === 'environment' ? 'back' : 'front';
    const s = stream(id, id === 'back' ? 'environment' : 'user'); opened.push(s); return s;
  };
  const vids = el('div'); vids.hidden = true;
  const ctx = {
    T, MAX_LINE: 300, FACES: ['😀'], role: 'host', myName: 'Omran', cam: null, camOn: false, facing: 'user', camCount: 0, flipping: false,
    micOn: false, deaf: false, gv: [], gstreams: [], slots: [], peers: new Map(), tiles: new Map(), draws: 0,
    draw() { ctx.draws++; }, $: (id) => (id === 'vids' ? vids : null), cleanName: (v) => String(v || 'guest'),
    revideo() { revideos.push(ctx.camTrack()); },
    toHost(m) { toHost.push(JSON.parse(JSON.stringify(m))); },
    document: { createElement: el },
    navigator: {
      mediaDevices: {
        getUserMedia(c) {
          const at = gums.length; gums.push(JSON.parse(JSON.stringify(c)));
          const step = at < plan.length ? plan[at] : 'auto';
          if (step instanceof Error) return Promise.reject(step);
          if (step === 'wait') return new Promise((res, rej) => { pending.push({ ok: () => { const s = open(c); res(s); return s; }, fail: (e) => rej(e || err('NotReadableError')) }); });
          return Promise.resolve(open(c));
        },
        enumerateDevices() { return Promise.resolve(devices.map((d) => ({ ...d }))); },
      },
    },
  };
  Object.assign(ctx, init || {});
  if (ctx.role === 'guest') ctx.gv = [{ sender: { replaceTrack(t) { replaced.push(t); return Promise.resolve(); } } }];
  vm.runInNewContext(CAM_FNS.map((h) => fnSrc(html, h)).join('\n'), ctx);
  return {
    ctx, gums, pending, revideos, toHost, replaced, opened, vids,
    setDevices: (d) => { devices = d; },
    sends: () => (ctx.role === 'guest' ? replaced : revideos),      // what afterCam put on the video lines, one entry per afterCam
    meTile: () => ctx.tiles.get('me'),
  };
}
/** Camera on with the front camera, as the camera button does. */
async function camOn(p) {
  const r = await p.ctx.setCam(true); await tick();
  assert.equal(r, true); assert.equal(p.ctx.camOn, true); assert.equal(p.ctx.facing, 'user');
  return p.ctx.cam;
}
const W = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 } };

test('camWant: the small picture every link carries, plus what is asked (facing or device)', () => {
  const p = page([]);
  assert.deepEqual(JSON.parse(JSON.stringify(p.ctx.camWant({ facingMode: 'user' }))), { ...W, facingMode: 'user' });
  assert.deepEqual(JSON.parse(JSON.stringify(p.ctx.camWant({ deviceId: { exact: 'x' } }))), { ...W, deviceId: { exact: 'x' } });
  assert.deepEqual(JSON.parse(JSON.stringify(p.ctx.camWant({}))), W);
});

test('countCams: only video inputs count; the switch shows with two or more and never on a failed list', async () => {
  const p = page([]);
  await camOn(p);
  assert.equal(p.ctx.camCount, 2, 'two cameras, the microphone does not count');
  const d = p.ctx.draws;
  p.ctx.countCams(); await tick();
  assert.equal(p.ctx.draws, d, 'same count: no redraw');
  p.setDevices([{ kind: 'videoinput' }, { kind: 'audioinput' }]);
  p.ctx.countCams(); await tick();
  assert.equal(p.ctx.camCount, 1);
  // a list that fails, or a browser without one: the count stays as it was (no throw)
  p.ctx.navigator.mediaDevices.enumerateDevices = () => Promise.reject(err('NotAllowedError'));
  p.ctx.countCams(); await tick();
  assert.equal(p.ctx.camCount, 1);
  delete p.ctx.navigator.mediaDevices.enumerateDevices;
  assert.doesNotThrow(() => p.ctx.countCams());
});

for (const role of ['host', 'guest']) {
  test(role + ': the switch goes to the back camera on the same lines (afterCam once), then stops the old camera; and back again', async () => {
    const p = page([], { role });
    const front = await camOn(p);
    const before = p.sends().length;
    let camAtStop = null;
    const st = front.track.stop; front.track.stop = function () { camAtStop = p.ctx.cam; return st.call(this); };
    const r = await p.ctx.flipCam(); await tick();
    assert.equal(r, true);
    assert.deepEqual(p.gums[p.gums.length - 1], { video: { ...W, facingMode: { exact: 'environment' } } }, 'asks for the back camera exactly');
    const back = p.ctx.cam;
    assert.notEqual(back, front); assert.equal(back.deviceId, 'back');
    assert.equal(p.ctx.facing, 'environment'); assert.equal(p.ctx.camOn, true); assert.equal(p.ctx.flipping, false);
    assert.ok(dead(front), 'the old camera is let go'); assert.ok(!dead(back), 'the new one runs');
    assert.equal(camAtStop, back, 'the old one stops only once the new one is in place');
    assert.equal(p.sends().length - before, 1, 'afterCam once');
    assert.equal(p.sends()[p.sends().length - 1], back.track, 'the new picture goes on the existing line (replaceTrack), no new link');
    if (role === 'guest') assert.deepEqual(p.toHost[p.toHost.length - 1], { t: 'cam', on: true }, 'the owner still sees the camera on');
    assert.equal(p.gums.length, 2, 'one try was enough');
    // own tile: not mirrored for the back camera
    assert.ok(p.meTile().el.classList.contains('back'));
    assert.equal(p.meTile().video.srcObject, back);
    assert.equal(p.vids.hidden, false);

    // and back to the front
    const r2 = await p.ctx.flipCam(); await tick();
    assert.equal(r2, true);
    assert.deepEqual(p.gums[p.gums.length - 1], { video: { ...W, facingMode: { exact: 'user' } } });
    assert.equal(p.ctx.facing, 'user'); assert.ok(dead(back)); assert.ok(!dead(p.ctx.cam));
    assert.ok(!p.meTile().el.classList.contains('back'), 'the front camera is mirrored again');
    assert.equal(p.sends().length - before, 2);
  });
}

test('a phone that cannot open two cameras (NotReadable): the old one is closed first, then the other one opens', async () => {
  const p = page(['front', err('NotReadableError')]);
  const front = await camOn(p);
  let oldDeadAtRetry = null;
  const gum = p.ctx.navigator.mediaDevices.getUserMedia;
  p.ctx.navigator.mediaDevices.getUserMedia = function (c) { if (p.gums.length === 2) oldDeadAtRetry = dead(front); return gum.call(this, c); };
  const before = p.revideos.length;
  const r = await p.ctx.flipCam(); await tick();
  assert.equal(r, true);
  assert.equal(p.gums.length, 3);
  assert.equal(oldDeadAtRetry, true, 'the front camera is closed before the second try');
  assert.deepEqual(p.gums[2], { video: { ...W, facingMode: { exact: 'environment' } } });
  assert.equal(p.ctx.cam.deviceId, 'back'); assert.equal(p.ctx.facing, 'environment'); assert.equal(p.ctx.camOn, true);
  assert.equal(p.revideos.length - before, 1, 'afterCam once');
  assert.equal(p.revideos[p.revideos.length - 1], p.ctx.cam.track);
  assert.equal(p.ctx.flipping, false);
});

test('both tries fail: the camera that was on comes back by its device id, and the facing stays as it was', async () => {
  const p = page(['front', err('NotReadableError'), err('OverconstrainedError')]);
  const front = await camOn(p);
  const before = p.revideos.length;
  const r = await p.ctx.flipCam(); await tick();
  assert.equal(r, true, 'no error line: the picture is still going');
  assert.equal(p.gums.length, 4);
  assert.deepEqual(p.gums[3], { video: { ...W, deviceId: { exact: 'front' } } }, 'by device id exact, no facing');
  assert.ok(dead(front));
  assert.notEqual(p.ctx.cam, front); assert.equal(p.ctx.cam.deviceId, 'front'); assert.ok(!dead(p.ctx.cam));
  assert.equal(p.ctx.facing, 'user'); assert.equal(p.ctx.camOn, true);
  assert.equal(p.revideos.length - before, 1); assert.equal(p.revideos[p.revideos.length - 1], p.ctx.cam.track);
  assert.ok(!p.meTile().el.classList.contains('back'));

  // the same from the back camera: back it comes, still the back one
  const q = page(['front', 'back', err('NotReadableError'), err('NotReadableError')]);
  await camOn(q); await q.ctx.flipCam(); await tick();
  assert.equal(q.ctx.facing, 'environment');
  const back = q.ctx.cam;
  await q.ctx.flipCam(); await tick();
  assert.deepEqual(q.gums[4], { video: { ...W, deviceId: { exact: 'back' } } });
  assert.equal(q.ctx.facing, 'environment'); assert.equal(q.ctx.cam.deviceId, 'back'); assert.ok(dead(back));
  assert.ok(q.meTile().el.classList.contains('back'));

  // no settings to read the device id from: the old camera is asked for by its facing
  const n = page(['front', err('NotReadableError'), err('NotReadableError')]);
  const f = await camOn(n);
  f.track.getSettings = () => { throw new Error('no getSettings'); };
  assert.equal(await n.ctx.flipCam(), true); await tick();
  assert.deepEqual(n.gums[3], { video: { ...W, facingMode: 'user' } });
  assert.equal(n.ctx.camOn, true); assert.equal(n.ctx.facing, 'user');
});

test('everything fails: the camera is off (not a dead picture), the lines are told, and the error says why', async () => {
  const p = page(['front', err('NotReadableError'), err('NotReadableError'), err('NotReadableError')], { role: 'guest' });
  const front = await camOn(p);
  const before = p.replaced.length;
  const r = await p.ctx.flipCam(); await tick();
  assert.equal(r, T.camDenied);
  assert.equal(p.ctx.camOn, false); assert.equal(p.ctx.cam, null); assert.equal(p.ctx.flipping, false);
  assert.ok(dead(front));
  assert.equal(p.replaced.length - before, 1, 'afterCam once');
  assert.equal(p.replaced[p.replaced.length - 1], null, 'the line carries nothing');
  assert.deepEqual(p.toHost[p.toHost.length - 1], { t: 'cam', on: false }, 'the owner hears the camera is off');
  assert.equal(p.meTile(), undefined, 'no own tile left'); assert.equal(p.vids.hidden, true);
  assert.equal(p.ctx.talkBox().includes('data-flip'), false);
  // the click shows the reason
  assert.match(html, /else if \(d\.flip\) flipCam\(\)\.then\(function \(r\) \{ error = r === true \? '' : r; draw\(\); \}\);/);
});

test('a second tap while switching does nothing; the switch button is disabled meanwhile', async () => {
  const p = page(['front', 'wait']);
  const front = await camOn(p);
  const a = p.ctx.flipCam();
  assert.equal(p.ctx.flipping, true);
  assert.match(p.ctx.talkBox(), /data-flip="1" disabled/);
  const b = await p.ctx.flipCam();
  assert.equal(b, true); assert.equal(p.gums.length, 2, 'no second request');
  p.pending[0].ok();
  assert.equal(await a, true); await tick();
  assert.equal(p.ctx.facing, 'environment'); assert.equal(p.gums.length, 2); assert.ok(dead(front));
  assert.equal(p.ctx.flipping, false);
  assert.doesNotMatch(p.ctx.talkBox(), /disabled/);
});

test('the camera turned off mid-switch: the new camera is stopped and not used', async () => {
  const p = page(['front', 'wait']);
  const front = await camOn(p);
  const a = p.ctx.flipCam();
  await p.ctx.setCam(false);
  assert.ok(dead(front)); const before = p.revideos.length;
  const s = p.pending[0].ok();
  assert.equal(await a, true); await tick();
  assert.ok(dead(s), 'the camera the switch opened is closed at once');
  assert.equal(p.ctx.cam, null); assert.equal(p.ctx.camOn, false); assert.equal(p.ctx.flipping, false);
  assert.equal(p.revideos.length, before, 'nothing goes on the lines');
  assert.equal(p.meTile(), undefined);

  // turned off while the second try (after NotReadable) is out: the same
  const q = page(['front', err('NotReadableError'), 'wait']);
  await camOn(q);
  const b = q.ctx.flipCam(); await tick();
  assert.equal(q.pending.length, 1);
  await q.ctx.setCam(false);
  const s2 = q.pending[0].ok();
  assert.equal(await b, true); await tick();
  assert.ok(dead(s2)); assert.equal(q.ctx.cam, null); assert.equal(q.ctx.camOn, false);
});

// FINDING (not fixed here — room.html is not changed by this test): the camera button stays live while the switch runs, and use() only
// checks camOn, not that the camera is still the one the switch started from. Off → on mid-switch leaves one camera stream open for good.
test('the camera turned off and on again mid-switch: no camera is left open', async () => {
  const p = page(['front', 'wait', 'front']);
  await camOn(p);
  const a = p.ctx.flipCam();
  await p.ctx.setCam(false);
  await p.ctx.setCam(true);           // the user taps the camera on again — the button is not disabled while flipping
  const again = p.ctx.cam;
  const s = p.pending[0].ok();
  await a; await tick();
  const open = p.opened.filter((x) => !dead(x));
  assert.equal(open.length, 1, 'only the camera on screen is open; open now: ' + open.map((x) => x.deviceId).join(','));
  assert.ok(open[0] === p.ctx.cam);
  void again; void s;
});
test('the camera turned off and on again mid-switch, then the switch fails: the camera now on stays on', async () => {
  const p = page(['front', 'wait', 'front', err('NotReadableError'), err('NotReadableError')]);
  await camOn(p);
  const a = p.ctx.flipCam();
  await p.ctx.setCam(false);
  await p.ctx.setCam(true);
  const again = p.ctx.cam;
  p.pending[0].fail(err('NotReadableError'));
  const r = await a; await tick();
  assert.equal(r, true, 'no «no permission» line: the camera the user turned on works');
  assert.equal(p.ctx.camOn, true); assert.equal(p.ctx.cam, again); assert.ok(!dead(again));
});

test('the switch shows only with the camera on and two cameras or more', () => {
  const p = page([]);
  const has = (init) => { Object.assign(p.ctx, init); return p.ctx.talkBox().includes('data-flip="1"'); };
  assert.equal(has({ camOn: false, camCount: 2, flipping: false }), false, 'camera off');
  assert.equal(has({ camOn: true, camCount: 0 }), false, 'count unknown');
  assert.equal(has({ camOn: true, camCount: 1 }), false, 'one camera');
  assert.equal(has({ camOn: true, camCount: 2 }), true);
  assert.equal(has({ camOn: true, camCount: 3 }), true);
  const box = p.ctx.talkBox();
  assert.ok(box.includes('🔄 ' + T.camFlip), box);
  assert.ok(!/data-flip="1" disabled/.test(box));
  // flipCam with the camera off does not open anything
  p.ctx.camOn = false; p.ctx.cam = null;
  return p.ctx.flipCam().then((r) => { assert.equal(r, true); assert.equal(p.gums.length, 0); });
});

test('own tile: mirrored for the front camera only (.tile.me.back has no mirror)', async () => {
  const p = page(['front']);
  await camOn(p);
  const t = p.meTile();
  assert.ok(t.el.classList.contains('me') && t.el.classList.contains('tile'));
  assert.ok(!t.el.classList.contains('back'));
  p.ctx.facing = 'environment'; p.ctx.drawVids();
  assert.ok(t.el.classList.contains('back'));
  p.ctx.facing = 'user'; p.ctx.drawVids();
  assert.ok(!t.el.classList.contains('back'));
  // guests' tiles never get it
  p.ctx.peers.set('g1', { name: 'g1', cam: true, vstream: stream('x', 'user') });
  p.ctx.facing = 'environment'; p.ctx.drawVids();
  assert.ok(!p.ctx.tiles.get('g1').el.classList.contains('back'));
  assert.ok(!p.ctx.tiles.get('g1').el.classList.contains('me'));
  // the CSS
  assert.match(html, /\.tile\.me video \{ transform: scaleX\(-1\); \}/);
  assert.match(html, /\.tile\.me\.back video \{ transform: none; \}/);
  // camera on again starts on the front camera, mirrored
  await p.ctx.setCam(false); await camOn(p);
  assert.ok(!p.meTile().el.classList.contains('back'));
});

test('camFlip in all 14 languages', () => {
  assert.equal(Object.keys(I18N).length, 14);
  for (const l of Object.keys(I18N)) {
    const s = I18N[l].camFlip;
    assert.ok(typeof s === 'string' && s.trim() && !/[<>{}]/.test(s), l + ': ' + s);
  }
  assert.equal(T.camFlip.length > 0, true);
});
