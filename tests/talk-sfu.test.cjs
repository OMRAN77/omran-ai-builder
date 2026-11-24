'use strict';
// v-talk-room-sfu: كاميرات «غرفة الربع» المدفوعة عبر Cloudflare Realtime SFU — وسيط الخادم (api/_lib/talk-sfu.js عبر act في talk-room.js).
// مخزن في الذاكرة وfetch مزيّف يسجّل كلّ نداء إلى Cloudflare بأشكال الطلب والردّ الموثّقة (لا مفاتيح حقيقيّة ولا شبكة).
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { act } = require('../api/_lib/talk-room.js');
const sfu = require('../api/_lib/talk-sfu.js');

const SECRET = 'cfsecret-' + 'Q7'.repeat(24);
const APP = 'app0123456789abcdef0123456789abcd';
const ENV = { CLOUDFLARE_REALTIME_APP_ID: APP, CLOUDFLARE_REALTIME_APP_SECRET: SECRET };
const BASE = 'https://rtc.live.cloudflare.com/v1/apps/' + APP + '/';
const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n';
const CF_TEXT = 'cloudflare-internal-description-xyz';
const TURN = { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u1', credential: 'c1' };
const fakeIce = async () => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, TURN], relay: true });

function memoryKV() {
  const data = new Map(), ttl = new Map(), log = [];
  const set = (k, v, t) => { data.set(k, String(v)); if (t) ttl.set(k, Number(t)); else ttl.delete(k); };
  const run = ([cmd, key, ...a]) => {
    log.push(cmd);
    if (cmd === 'GET') { const v = data.get(key); return typeof v === 'string' ? v : null; }
    if (cmd === 'EXISTS') return data.has(key) ? 1 : 0;
    if (cmd === 'RPUSH') { const l = data.get(key) || []; l.push(a[0]); data.set(key, l); return l.length; }
    if (cmd === 'RPOP') { const l = data.get(key) || []; return l.pop() ?? null; }
    if (cmd === 'LPOP') { const l = data.get(key) || []; const out = l.splice(0, Number(a[0])); return out.length ? out : null; }
    if (cmd === 'EXPIRE') { if (data.has(key)) ttl.set(key, Number(a[0])); return 1; }
    if (cmd === 'DEL') { ttl.delete(key); return data.delete(key) ? 1 : 0; }
    if (cmd === 'INCRBY') { const n = Number(data.get(key) || 0) + Number(a[0]); data.set(key, String(n)); return n; }
    if (cmd === 'SET') {
      if (a.includes('XX') && !data.has(key)) return null;
      if (a.includes('NX') && data.has(key)) return null;
      const ex = a.indexOf('EX'); set(key, a[0], ex > 0 ? a[ex + 1] : 0); return 'OK';
    }
    throw new Error('unexpected command ' + cmd);
  };
  return {
    data, ttl, log,
    kvGetRaw: async (k) => run(['GET', k]),
    kvSetRaw: async (k, v, t) => { log.push('SET'); set(k, v, t); },
    kvSetIfAbsent: async (k, v, t) => { log.push('SETNX'); if (data.has(k)) return false; set(k, v, t); return true; },
    kvIncr: async (k) => run(['INCRBY', k, '1']),
    kvIncrBy: async (k, n) => run(['INCRBY', k, String(n)]),
    kvExpire: async (k, t) => { log.push('EXPIRE'); if (data.has(k)) ttl.set(k, t); },
    kvDel: async (k) => { run(['DEL', k]); },
    kvList: async (p) => [...data.keys()].filter((k) => k.startsWith(p)),
    kvPipeline: async (cmds) => cmds.map(run),
  };
}

/* Cloudflare مزيّف بالأشكال الموثّقة (sfu-docs.md §2). next(req) يستبدل ردًّا واحدًا. */
function fakeCF() {
  const calls = [];
  let n = 0;
  const fx = { calls, next: null };
  fx.fetch = async (url, init) => {
    const req = { url, method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body), signal: init.signal };
    calls.push(req);
    const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (fx.next) { const f = fx.next; fx.next = null; return f(req, reply); }
    const p = url.slice(BASE.length);
    if (p === 'sessions/new') return reply(201, { sessionId: (++n).toString(16).padStart(32, 'a') });
    if (/^sessions\/[^/]+\/tracks\/new$/.test(p)) {
      if (req.body.sessionDescription) return reply(200, { requiresImmediateRenegotiation: false, sessionDescription: { type: 'answer', sdp: SDP }, tracks: req.body.tracks.map((t) => ({ location: 'local', mid: t.mid, trackName: t.trackName })) });
      return reply(200, { requiresImmediateRenegotiation: true, sessionDescription: { type: 'offer', sdp: SDP }, tracks: req.body.tracks.map((t, i) => ({ location: 'remote', mid: String(i + 1), sessionId: t.sessionId, trackName: t.trackName, kind: 'video' })) });
    }
    if (/^sessions\/[^/]+\/renegotiate$/.test(p)) return reply(200, {});
    if (/^sessions\/[^/]+\/tracks\/close$/.test(p)) return reply(200, { requiresImmediateRenegotiation: false, tracks: req.body.tracks.map((t) => ({ mid: t.mid })) });
    return reply(404, { errorCode: 'not_found', errorDescription: CF_TEXT });
  };
  return fx;
}

const seen = [];      // كلّ ردّ وكلّ خطأ مرميّ وكلّ سطر سجلّ: لا سرّ فيها (يُفحص في الاختبار الأخير)
const realWarn = console.warn;
console.warn = (...a) => { seen.push(a.map(String).join(' ')); };
process.on('exit', () => { console.warn = realWarn; });

function world(opts) {
  const K = memoryKV(), cf = fakeCF();
  const clock = { t: Date.UTC(2026, 10, 24, 10, 0, 0) };
  const o = { env: (opts && 'env' in opts) ? opts.env : ENV, fetch: cf.fetch, now: () => clock.t, isOwner: (u) => u === 'omran', isVip: async () => false, points: {} };
  const call = async (body) => {
    try { const r = await act(body, 'ip-' + Math.random(), K, (body && body.__who) || null, fakeIce, o); seen.push(JSON.stringify(r)); return r; } catch (e) { seen.push(String(e && e.stack)); throw e; }
  };
  const openRoom = async (who) => (await act({ op: 'open' }, 'h', K, who, null, o)).json;
  // ضيف مقبول: join ثمّ admit (ردّه يحمل s في الغرفة المدفوعة)
  const guest = async (room) => {
    const id = (await act({ op: 'join', code: room.code, name: 'g', offer: SDP }, 'g' + Math.random(), K, null, null, o)).json.id;
    const ad = await call({ op: 'admit', code: room.code, key: room.key, id, answer: SDP });
    return { id, s: ad.json.s, admit: ad.json };
  };
  return { K, cf, clock, o, call, openRoom, guest };
}
const stampOf = (k, code) => 'r' + crypto.createHmac('sha256', k).update('tn|' + code).digest('hex').slice(0, 10);
const roomRec = (K, code) => JSON.parse(K.data.get('talk/room/' + code));

test('بلا المتغيّرين: sfu-on يقول {on:false} وما في أيّ نداء إلى Cloudflare، وadmit كما كان', async () => {
  for (const env of [{}, { CLOUDFLARE_REALTIME_APP_ID: APP }, { CLOUDFLARE_REALTIME_APP_SECRET: SECRET }, { CLOUDFLARE_REALTIME_APP_ID: 'bad id!', CLOUDFLARE_REALTIME_APP_SECRET: SECRET }]) {
    const w = world({ env });
    const room = await w.openRoom('omran');
    assert.equal(room.plan, 'own');
    const g = await w.guest(room);
    assert.deepEqual(g.admit, { ok: true }, 'بلا SFU ما في s');
    const on = await w.call({ op: 'sfu-on', code: room.code, key: room.key });
    assert.equal(on.status, 200);
    assert.deepEqual(on.json, { on: false });
    for (const op of ['sfu-new', 'sfu-push', 'sfu-pull', 'sfu-reneg', 'sfu-close', 'sfu-gone']) assert.equal((await w.call({ op, code: room.code, key: room.key, id: g.id })).status, 503, op);
    assert.equal(w.cf.calls.length, 0, 'ولا نداء واحد');
  }
});

test('الغرفة المجّانيّة: كلّ عمليّة SFU ترفض 403 free، وadmit بلا s', async () => {
  const w = world();
  const room = await w.openRoom('fatima');
  assert.equal(room.plan, 'free');
  const g = await w.guest(room);
  assert.deepEqual(g.admit, { ok: true });
  for (const op of sfu.OPS) {
    const r = await w.call({ op, code: room.code, key: room.key, id: g.id, sid: 'a'.repeat(32), st: 'x', offer: SDP, mid: '0' });
    assert.equal(r.status, 403, op);
    assert.deepEqual(r.json, { error: 'free' }, op);
  }
  // اشتراك انتهى وصارت الغرفة مجّانيّة في منتصفها: الرفض من القراءة الجديدة لا من العميل
  const paid = await w.openRoom('omran');
  const rec = roomRec(w.K, paid.code); rec.p = 'free'; w.K.data.set('talk/room/' + paid.code, JSON.stringify(rec));
  assert.deepEqual((await w.call({ op: 'sfu-new', code: paid.code, key: paid.key })).json, { error: 'free' });
  assert.equal(w.cf.calls.length, 0);
});

test('صاحب الغرفة بسرّه: sfu-on يعطي STUN من Cloudflare مع الترحيل، والسرّ الخطأ 403، والغرفة المغلقة 404', async () => {
  const w = world();
  const room = await w.openRoom('omran');
  assert.equal((await w.call({ op: 'sfu-on', code: room.code, key: 'x'.repeat(24) })).status, 403);
  assert.equal((await w.call({ op: 'sfu-on', code: '12', key: room.key })).json.error, 'code');
  const on = await w.call({ op: 'sfu-on', code: room.code, key: room.key });
  assert.equal(on.status, 200);
  assert.deepEqual(on.json, { on: true, ice: [{ urls: 'stun:stun.cloudflare.com:3478' }, TURN] }, 'STUN جوجل يُترك، والترحيل يبقى');
  w.K.log.length = 0;
  await w.call({ op: 'sfu-on', code: room.code, key: room.key });
  assert.deepEqual(w.K.log, ['GET', 'INCRBY', 'INCRBY', 'EXPIRE'], 'صاحب الغرفة: قراءة واحدة + عدّاد الغرفة + حدّ ice للعنوان (عنوان جديد: مع عمره)');
  w.K.log.length = 0;
  await w.call({ op: 'sfu-new', code: room.code, key: room.key });
  assert.deepEqual(w.K.log, ['GET', 'INCRBY'], 'غير sfu-on: قراءة واحدة + عدّاد الغرفة');
  w.cf.calls.length = 0;
  await w.call({ op: 'close', code: room.code, key: room.key });
  assert.deepEqual((await w.call({ op: 'sfu-on', code: room.code, key: room.key })).json, { error: 'no-room' });
  assert.equal(w.cf.calls.length, 0, 'sfu-on لا يلمس Cloudflare');
});

test('الضيف بـs من admit: يمرّ، وs الخطأ أو لضيف آخر أو لغرفة أخرى 403', async () => {
  const w = world();
  const room = await w.openRoom('omran'), other = await w.openRoom('omran');
  const g = await w.guest(room), g2 = await w.guest(room);
  const expect = crypto.createHmac('sha256', roomRec(w.K, room.code).k).update('sfu|' + room.code + '|' + g.id).digest('hex').slice(0, 32);
  assert.equal(g.s, expect);
  w.K.log.length = 0;
  const ok = await w.call({ op: 'sfu-new', code: room.code, id: g.id, s: g.s });
  assert.equal(ok.status, 200);
  assert.deepEqual(w.K.log, ['GET', 'EXISTS', 'INCRBY', 'EXPIRE'], 'الضيف: خطّ واحد (الغرفة + علامة الطرد) + العدّاد (وعمره في أوّل نداء من الدقيقة)');
  w.K.log.length = 0;
  await w.call({ op: 'sfu-new', code: room.code, id: g.id, s: g.s });
  assert.deepEqual(w.K.log, ['GET', 'EXISTS', 'INCRBY']);
  for (const bad of [{ id: g.id, s: 'f'.repeat(32) }, { id: g.id, s: g2.s }, { id: g2.id, s: g.s }, { id: g.id }, { id: g.id, s: '' }]) {
    const r = await w.call(Object.assign({ op: 'sfu-new', code: room.code }, bad));
    assert.equal(r.status, 403, JSON.stringify(bad));
  }
  assert.equal((await w.call({ op: 'sfu-new', code: other.code, id: g.id, s: g.s })).status, 403, 'سرّ غرفة لا يفتح غرفة أخرى');
  assert.equal((await w.call({ op: 'sfu-new', code: room.code, id: 'zz', s: g.s })).status, 400);
  assert.equal(w.cf.calls.length, 2, 'المرفوض لا يصل Cloudflare');
  // المرفوض لا يستهلك حدّ الغرفة: العدّاد يأتي بعد الهويّة
  w.K.log.length = 0;
  for (let i = 0; i < 5; i++) await w.call({ op: 'sfu-new', code: room.code, key: 'y'.repeat(24) });
  await w.call({ op: 'sfu-new', code: room.code, id: g.id, s: 'f'.repeat(32) });
  assert.ok(!w.K.log.includes('INCRBY'), 'لا عدّاد قبل الهويّة');
});

test('sfu-on: الترحيل (سقف TURN اليوميّ المشترك) خلف حدّ ice للعنوان نفسه — بعد ١٢ في الدقيقة STUN وحده', async () => {
  const w = world();
  const room = await w.openRoom('omran');
  const g = await w.guest(room);
  let minted = 0;
  const countingIce = async () => { minted++; return fakeIce(); };
  for (let i = 0; i < 12; i++) {
    const r = await act({ op: 'sfu-on', code: room.code, id: g.id, s: g.s }, '9.9.9.9', w.K, null, countingIce, w.o);
    assert.deepEqual(r.json, { on: true, ice: [{ urls: 'stun:stun.cloudflare.com:3478' }, TURN] }, 'call ' + i);
  }
  const r = await act({ op: 'sfu-on', code: room.code, id: g.id, s: g.s }, '9.9.9.9', w.K, null, countingIce, w.o);
  assert.deepEqual(r.json, { on: true, ice: [{ urls: 'stun:stun.cloudflare.com:3478' }] }, 'فوق الحدّ: STUN وحده، والغرفة تعمل');
  assert.equal(minted, 12, 'لا بيانات ترحيل جديدة فوق الحدّ');
  // ويشترك مع op 'ice' للعنوان نفسه
  assert.equal((await act({ op: 'ice', code: room.code }, '9.9.9.9', w.K, null, countingIce, w.o)).status, 429);
  assert.equal(minted, 12);
});

test('الطرد: sfu-gone لصاحب الغرفة وحده، يكتب علامة ربع ساعة، وبعدها الضيف 403', async () => {
  const w = world();
  const room = await w.openRoom('omran');
  const g = await w.guest(room), g2 = await w.guest(room);
  assert.equal((await w.call({ op: 'sfu-gone', code: room.code, id: g2.id, s: g2.s })).status, 403, 'الضيف لا يطرد أحدًا');
  assert.equal((await w.call({ op: 'sfu-gone', code: room.code, key: room.key, id: 'nope' })).status, 400);
  assert.deepEqual((await w.call({ op: 'sfu-gone', code: room.code, key: room.key, id: g.id })).json, { ok: true });
  const mark = 'talk/room/' + room.code + '/x/' + g.id;
  assert.equal(w.K.data.get(mark), '1');
  assert.equal(w.K.ttl.get(mark), 900);
  for (const op of ['sfu-on', 'sfu-new', 'sfu-push', 'sfu-pull']) assert.deepEqual((await w.call({ op, code: room.code, id: g.id, s: g.s })).json, { error: 'gone' }, op);
  assert.equal((await w.call({ op: 'sfu-on', code: room.code, id: g2.id, s: g2.s })).status, 200, 'غيره يبقى');
  assert.equal(w.cf.calls.length, 0);
});

test('ربط الجلسة: st من sfu-new، ولا يقود عضو جلسة غيره', async () => {
  const w = world();
  const room = await w.openRoom('omran');
  const g = await w.guest(room);
  const h = (await w.call({ op: 'sfu-new', code: room.code, key: room.key })).json;
  const gs = (await w.call({ op: 'sfu-new', code: room.code, id: g.id, s: g.s })).json;
  assert.match(h.sid, /^[0-9a-f]{32}$/);
  assert.match(h.st, /^[0-9a-f]{32}$/);
  assert.notEqual(h.st, gs.st);
  const before = w.cf.calls.length;
  const tries = [
    { key: room.key, sid: h.sid },                       // بلا st
    { key: room.key, sid: h.sid, st: gs.st },            // st غيره
    { key: room.key, sid: gs.sid, st: h.st },            // جلسة الضيف بختم صاحب الغرفة
    { id: g.id, s: g.s, sid: h.sid, st: h.st },          // الضيف بجلسة صاحب الغرفة وختمه
    { id: g.id, s: g.s, sid: h.sid, st: gs.st },
  ];
  for (const t of tries) for (const op of ['sfu-push', 'sfu-pull', 'sfu-reneg', 'sfu-close']) {
    const r = await w.call(Object.assign({ op, code: room.code, offer: SDP, mid: '0', answer: SDP, mids: ['0'], tracks: [{ sid: h.sid, tn: stampOf(roomRec(w.K, room.code).k, room.code) + '-host-0' }] }, t));
    assert.equal(r.status, 403, op + ' ' + JSON.stringify(t));
    assert.deepEqual(r.json, { error: 'session' });
  }
  assert.equal((await w.call({ op: 'sfu-reneg', code: room.code, key: room.key, sid: 'bad sid', st: h.st, answer: SDP })).json.error, 'sid');
  assert.equal(w.cf.calls.length, before, 'لا نداء من المرفوض');
});

test('push: اسم المسار يفرضه الخادم (ختم الغرفة + العضو + الجيل)، والجسم والرابط والإذن كما وُثّقت', async () => {
  const w = world();
  const room = await w.openRoom('omran');
  const g = await w.guest(room);
  const stamp = stampOf(roomRec(w.K, room.code).k, room.code);
  const h = (await w.call({ op: 'sfu-new', code: room.code, key: room.key })).json;
  const nw = w.cf.calls[0];
  assert.equal(nw.url, BASE + 'sessions/new');
  assert.equal(nw.method, 'POST');
  assert.equal(nw.body, undefined, 'sessions/new بلا جسم');
  assert.deepEqual(nw.headers, { Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json' });
  assert.ok(nw.signal, 'كلّ نداء بمهلة');

  const r = await w.call({ op: 'sfu-push', code: room.code, key: room.key, sid: h.sid, st: h.st, offer: SDP, mid: '2', trackName: 'evil', tn: 'evil' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { answer: SDP, tn: stamp + '-host-0' }, 'بلا g: الجيل ٠');
  const c = w.cf.calls.at(-1);
  assert.equal(c.url, BASE + 'sessions/' + h.sid + '/tracks/new');
  assert.equal(c.method, 'POST');
  assert.deepEqual(c.headers, { Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json' });
  assert.deepEqual(c.body, { sessionDescription: { type: 'offer', sdp: SDP }, tracks: [{ location: 'local', mid: '2', trackName: stamp + '-host-0' }] });

  // الجيل: الكاميرا تُطفأ ثمّ تعود = دفعة جديدة باسم جديد في الجلسة نفسها
  for (const g of [0, 1, 7, 9999]) {
    const rg = await w.call({ op: 'sfu-push', code: room.code, key: room.key, sid: h.sid, st: h.st, offer: SDP, mid: '3', g, tn: 'evil-host-5' });
    assert.equal(rg.status, 200, String(g));
    assert.equal(rg.json.tn, stamp + '-host-' + g);
    assert.equal(w.cf.calls.at(-1).body.tracks[0].trackName, stamp + '-host-' + g);
  }

  const gs = (await w.call({ op: 'sfu-new', code: room.code, id: g.id, s: g.s })).json;
  const gp = await w.call({ op: 'sfu-push', code: room.code, id: g.id, s: g.s, sid: gs.sid, st: gs.st, offer: SDP, mid: '0', g: 4, trackName: stamp + '-host-4' });
  assert.equal(gp.json.tn, stamp + '-' + g.id + '-4', 'الضيف لا ينتحل اسم صاحب الغرفة');
  assert.equal(w.cf.calls.at(-1).body.tracks[0].trackName, stamp + '-' + g.id + '-4');

  const n = w.cf.calls.length;
  for (const bad of [-1, 10000, 1.5, '1', '', null, true, NaN, [1], { g: 1 }]) {
    const rb = await w.call({ op: 'sfu-push', code: room.code, key: room.key, sid: h.sid, st: h.st, offer: SDP, mid: '0', g: bad });
    assert.equal(rb.status, 400, JSON.stringify(bad));
    assert.deepEqual(rb.json, { error: 'g' }, JSON.stringify(bad));
  }
  assert.equal(sfu.MAX_GEN, 9999);
  assert.equal((await w.call({ op: 'sfu-push', code: room.code, key: room.key, sid: h.sid, st: h.st, offer: 'hello', mid: '0' })).json.error, 'offer');
  assert.equal((await w.call({ op: 'sfu-push', code: room.code, key: room.key, sid: h.sid, st: h.st, offer: 'v=0' + 'x'.repeat(48000), mid: '0' })).json.error, 'offer');
  for (const mid of ['', 'x'.repeat(17), '#host', 7]) assert.equal((await w.call({ op: 'sfu-push', code: room.code, key: room.key, sid: h.sid, st: h.st, offer: SDP, mid })).json.error, 'mid', String(mid));
  assert.equal(w.cf.calls.length, n);
});

test('pull: مسارات هذه الغرفة فقط (١..١٢)، والجسم الموثّق، والعرض للتفاوض، وخطأ مسار واحد لا يُسقط الباقي', async () => {
  const w = world();
  const room = await w.openRoom('omran'), other = await w.openRoom('omran');
  const g = await w.guest(room);
  const stamp = stampOf(roomRec(w.K, room.code).k, room.code), otherStamp = stampOf(roomRec(w.K, other.code).k, other.code);
  const gs = (await w.call({ op: 'sfu-new', code: room.code, id: g.id, s: g.s })).json;
  const base = { op: 'sfu-pull', code: room.code, id: g.id, s: g.s, sid: gs.sid, st: gs.st };
  const pub = 'b'.repeat(32), pub2 = 'c'.repeat(32);
  const n = w.cf.calls.length;
  for (const tracks of [
    [{ sid: pub, tn: otherStamp + '-host-0' }],                  // غرفة أخرى
    [{ sid: pub, tn: stamp + 'x-host-0' }],
    [{ sid: pub, tn: stamp + '-host-x' }],
    [{ sid: pub, tn: stamp + '-host' }],                         // بلا الجيل
    [{ sid: pub, tn: stamp + '-host-' }],
    [{ sid: pub, tn: stamp + '-host-12345' }],                   // الجيل ٤ أرقام على الأكثر
    [{ sid: pub, tn: stamp + '-host-1-2' }],
    [{ sid: pub, tn: stamp + '-' + 'd'.repeat(12) }],
    [{ sid: pub, tn: stamp + '-' + 'D'.repeat(12) + '-1' }],
    [{ sid: pub, tn: 'host-0' }],
    [{ sid: 'no', tn: stamp + '-host-0' }],
    [],
    Array.from({ length: 13 }, (_, i) => ({ sid: pub.slice(0, 30) + String(i).padStart(2, '0'), tn: stamp + '-host-0' })),
    [{ sid: pub, tn: stamp + '-host-3' }, { sid: pub, tn: stamp + '-host-3' }],      // المسار نفسه مرّتين
    'x',
  ]) assert.deepEqual((await w.call(Object.assign({ tracks }, base))).json, { error: 'tracks' }, JSON.stringify(tracks).slice(0, 80));
  assert.equal(w.cf.calls.length, n, 'المرفوض لا يصل Cloudflare');

  const twelve = Array.from({ length: 12 }, (_, i) => ({ sid: pub.slice(0, 30) + String(i).padStart(2, '0'), tn: stamp + '-host-0' }));
  const r12 = await w.call(Object.assign({}, base, { tracks: twelve }));
  assert.equal(r12.status, 200, 'اثنا عشر مسموح');
  assert.deepEqual(r12.json.tracks.map((t) => t.mid), twelve.map((_, i) => String(i + 1)), 'كلّ مسار بـmid خاصّ به');

  // جيلان لعضو واحد في جلسة واحدة: اسمان مختلفان، كلاهما مقبول
  const gens = [{ sid: pub, tn: stamp + '-host-0' }, { sid: pub, tn: stamp + '-host-9999' }];
  assert.equal((await w.call(Object.assign({}, base, { tracks: gens }))).status, 200);
  assert.deepEqual(w.cf.calls.at(-1).body.tracks.map((t) => t.trackName), gens.map((t) => t.tn));

  const want = [{ sid: pub, tn: stamp + '-host-2' }, { sid: pub2, tn: stamp + '-' + 'd'.repeat(12) + '-0' }];
  const r = await w.call(Object.assign({}, base, { tracks: want }));
  const c = w.cf.calls.at(-1);
  assert.equal(c.url, BASE + 'sessions/' + gs.sid + '/tracks/new');
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.Authorization, 'Bearer ' + SECRET);
  assert.deepEqual(c.body, { tracks: [{ location: 'remote', sessionId: pub, trackName: stamp + '-host-2' }, { location: 'remote', sessionId: pub2, trackName: stamp + '-' + 'd'.repeat(12) + '-0' }] });
  assert.deepEqual(r.json, { renegotiate: true, offer: SDP, tracks: [{ mid: '1', tn: want[0].tn, sid: pub }, { mid: '2', tn: want[1].tn, sid: pub2 }] });

  w.cf.next = (req, reply) => reply(200, { requiresImmediateRenegotiation: true, sessionDescription: { type: 'offer', sdp: SDP }, tracks: [{ mid: '5', sessionId: pub, trackName: want[0].tn }, { sessionId: pub2, trackName: want[1].tn, errorCode: 'track_not_found', errorDescription: CF_TEXT }] });
  const part = await w.call(Object.assign({}, base, { tracks: want }));
  assert.equal(part.status, 200);
  assert.deepEqual(part.json.tracks, [{ mid: '5', tn: want[0].tn, sid: pub }, { tn: want[1].tn, sid: pub2, error: 'sfu' }]);
  assert.ok(!JSON.stringify(part.json).includes(CF_TEXT));

  w.cf.next = (req, reply) => reply(200, { requiresImmediateRenegotiation: false, tracks: [{ mid: '3', sessionId: pub, trackName: want[0].tn }] });
  assert.deepEqual((await w.call(Object.assign({}, base, { tracks: [want[0]] }))).json, { renegotiate: false, tracks: [{ mid: '3', tn: want[0].tn, sid: pub }] });
  w.cf.next = (req, reply) => reply(200, { requiresImmediateRenegotiation: true, tracks: [] });
  assert.deepEqual((await w.call(Object.assign({}, base, { tracks: [want[0]] }))).json, { error: 'sfu' }, 'تفاوض بلا عرض = عطل');
  w.cf.next = (req, reply) => reply(200, { requiresImmediateRenegotiation: true, sessionDescription: { type: 'answer', sdp: SDP }, tracks: [] });
  assert.deepEqual((await w.call(Object.assign({}, base, { tracks: [want[0]] }))).json, { error: 'sfu' }, 'وصف من نوع answer ليس عرضًا');

  // ردّ بترتيب آخر: المطابقة بالاسم والجلسة لا بالموضع، وعنصر باسم مسار آخر لا يُنسب
  w.cf.next = (req, reply) => reply(200, { requiresImmediateRenegotiation: true, sessionDescription: { type: 'offer', sdp: SDP }, tracks: [{ mid: '8', sessionId: pub2, trackName: want[1].tn }, { mid: '7', sessionId: pub, trackName: want[0].tn }] });
  assert.deepEqual((await w.call(Object.assign({}, base, { tracks: want }))).json.tracks, [{ mid: '7', tn: want[0].tn, sid: pub }, { mid: '8', tn: want[1].tn, sid: pub2 }]);
  w.cf.next = (req, reply) => reply(200, { requiresImmediateRenegotiation: true, sessionDescription: { type: 'offer', sdp: SDP }, tracks: [{ mid: '9', sessionId: pub2, trackName: want[1].tn }] });
  assert.deepEqual((await w.call(Object.assign({}, base, { tracks: [want[0]] }))).json.tracks, [{ tn: want[0].tn, sid: pub, error: 'sfu' }], 'mid مسار آخر لا يصير لهذا العضو');
});

test('reneg وclose: الجسم والرابط والطريقة الموثّقة، وclose_track_error ليس فشلًا', async () => {
  const w = world();
  const room = await w.openRoom('omran');
  const h = (await w.call({ op: 'sfu-new', code: room.code, key: room.key })).json;
  const base = { code: room.code, key: room.key, sid: h.sid, st: h.st };
  assert.deepEqual((await w.call(Object.assign({ op: 'sfu-reneg', answer: SDP }, base))).json, { ok: true });
  let c = w.cf.calls.at(-1);
  assert.equal(c.url, BASE + 'sessions/' + h.sid + '/renegotiate');
  assert.equal(c.method, 'PUT');
  assert.deepEqual(c.headers, { Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json' });
  assert.deepEqual(c.body, { sessionDescription: { type: 'answer', sdp: SDP } });
  assert.equal((await w.call(Object.assign({ op: 'sfu-reneg', answer: 'nope' }, base))).json.error, 'answer');

  assert.deepEqual((await w.call(Object.assign({ op: 'sfu-close', mids: ['1', '2'] }, base))).json, { ok: true });
  c = w.cf.calls.at(-1);
  assert.equal(c.url, BASE + 'sessions/' + h.sid + '/tracks/close');
  assert.equal(c.method, 'PUT');
  assert.equal(c.headers.Authorization, 'Bearer ' + SECRET);
  assert.deepEqual(c.body, { tracks: [{ mid: '1' }, { mid: '2' }], force: true });
  const n = w.cf.calls.length;
  for (const mids of [[], Array.from({ length: 13 }, (_, i) => String(i)), ['#x'], 'x']) assert.equal((await w.call(Object.assign({ op: 'sfu-close', mids }, base))).json.error, 'mids');
  assert.equal(w.cf.calls.length, n);

  w.cf.next = (req, reply) => reply(200, { tracks: [{ mid: '1', errorCode: 'close_track_error', errorDescription: CF_TEXT }] });
  assert.deepEqual((await w.call(Object.assign({ op: 'sfu-close', mids: ['1'] }, base))).json, { ok: true }, 'مغلق أصلًا');
  w.cf.next = (req, reply) => reply(200, { tracks: [{ mid: '1', errorCode: 'other_error', errorDescription: CF_TEXT }] });
  assert.deepEqual((await w.call(Object.assign({ op: 'sfu-close', mids: ['1'] }, base))).json, { error: 'sfu' });
});

test('أعطال Cloudflare: 502 sfu بلا نصّ منها ولا سرّ — حالة HTTP، errorCode أعلى، errorCode مسار في push، تفاوض في push، رمي، جسم تالف', async () => {
  const w = world();
  const room = await w.openRoom('omran');
  const h = (await w.call({ op: 'sfu-new', code: room.code, key: room.key })).json;
  const push = { op: 'sfu-push', code: room.code, key: room.key, sid: h.sid, st: h.st, offer: SDP, mid: '0' };
  const cases = [
    ['sfu-new', (req, reply) => reply(500, { errorCode: 'internal', errorDescription: CF_TEXT })],
    ['sfu-new', (req, reply) => reply(401, { errorDescription: CF_TEXT + ' ' + SECRET })],
    ['sfu-new', (req, reply) => reply(201, { errorCode: 'bad', errorDescription: CF_TEXT })],
    ['sfu-new', (req, reply) => reply(201, { sessionId: '../evil' })],
    ['sfu-new', () => { throw new Error('connect failed ' + SECRET + ' ' + CF_TEXT); }],
    ['sfu-new', () => ({ ok: true, status: 201, json: async () => { throw new SyntaxError('Unexpected token ' + CF_TEXT); } })],
    ['push', (req, reply) => reply(200, { errorCode: 'invalid_sdp', errorDescription: CF_TEXT, tracks: [] })],
    ['push', (req, reply) => reply(200, { requiresImmediateRenegotiation: false, sessionDescription: { type: 'answer', sdp: SDP }, tracks: [{ mid: '0', errorCode: 'track_error', errorDescription: CF_TEXT }] })],
    ['push', (req, reply) => reply(200, { requiresImmediateRenegotiation: true, sessionDescription: { type: 'offer', sdp: SDP }, tracks: [{ mid: '0' }] })],
    ['push', (req, reply) => reply(200, { requiresImmediateRenegotiation: false, sessionDescription: { type: 'answer', sdp: CF_TEXT }, tracks: [{ mid: '0' }] })],
    ['push', (req, reply) => reply(503, null)],
    ['push', (req, reply) => reply(200, { requiresImmediateRenegotiation: true, sessionDescription: { type: 'answer', sdp: SDP }, tracks: [{ mid: '0' }] })],
    ['reneg', (req, reply) => reply(500, {})],      // حالة HTTP وحدها بلا errorCode
    ['push', (req, reply) => reply(502, { requiresImmediateRenegotiation: false, sessionDescription: { type: 'answer', sdp: SDP }, tracks: [{ mid: '0' }] })],
    ['push', (req, reply) => reply(200, { requiresImmediateRenegotiation: false, sessionDescription: { type: 'offer', sdp: SDP }, tracks: [{ mid: '0' }] })],
    ['reneg', (req, reply) => reply(400, { errorCode: 'bad_answer', errorDescription: CF_TEXT })],
    ['pull', (req, reply) => reply(200, { errorCode: 'x', errorDescription: CF_TEXT })],
  ];
  const stamp = stampOf(roomRec(w.K, room.code).k, room.code);
  for (const [op, f] of cases) {
    w.cf.next = f;
    const body = op === 'sfu-new' ? { op, code: room.code, key: room.key }
      : op === 'push' ? push
        : op === 'reneg' ? { op: 'sfu-reneg', code: room.code, key: room.key, sid: h.sid, st: h.st, answer: SDP }
          : { op: 'sfu-pull', code: room.code, key: room.key, sid: h.sid, st: h.st, tracks: [{ sid: 'b'.repeat(32), tn: stamp + '-host-0' }] };
    const r = await w.call(body);
    assert.equal(r.status, 502, op);
    assert.deepEqual(r.json, { error: 'sfu' }, op);
    assert.equal(w.cf.next, null, 'وصل النداء فعلًا');
  }
});

test('المهلة ٨ ثوانٍ: Cloudflare لا يردّ = 502 sfu (والنداء أُلغي)', async () => {
  const w = world();
  const room = await w.openRoom('omran');
  let fired;
  const called = new Promise((r) => { fired = r; });
  w.cf.next = (req) => new Promise((resolve, reject) => {
    fired(req);
    req.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted ' + SECRET), { name: 'AbortError' })));
  });
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let done = null;
    const p = w.call({ op: 'sfu-new', code: room.code, key: room.key }).then((r) => { done = r; return r; });
    const req = await called;
    mock.timers.tick(7999);
    await new Promise((r) => setImmediate(r));
    assert.equal(done, null, 'قبل ٨ ثوانٍ ما زال ينتظر');
    assert.equal(req.signal.aborted, false);
    mock.timers.tick(1);
    const r = await p;
    assert.equal(req.signal.aborted, true);
    assert.equal(r.status, 502);
    assert.deepEqual(r.json, { error: 'sfu' });
  } finally { mock.timers.reset(); }
  assert.equal(sfu.TIMEOUT_MS, 8000);
});

test('المهلة تشمل قراءة الجسم: رؤوس وصلت والجسم معلّق = 502 بعد ٨ ثوانٍ', async () => {
  const w = world();
  const room = await w.openRoom('omran');
  let fired;
  const called = new Promise((r) => { fired = r; });
  w.cf.next = (req) => {
    fired(req);
    return { ok: true, status: 201, json: () => new Promise((resolve, reject) => { req.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }) };
  };
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let done = null;
    w.call({ op: 'sfu-new', code: room.code, key: room.key }).then((r) => { done = r; });
    const req = await called;
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(8000);
    for (let i = 0; i < 5 && !done; i++) await new Promise((r) => setImmediate(r));
    assert.equal(req.signal.aborted, true, 'المؤقّت ما زال يعمل أثناء قراءة الجسم');
    assert.deepEqual(done && done.json, { error: 'sfu' });
  } finally { mock.timers.reset(); }
});

test('الحدّ: ٦٠٠ عمليّة في الدقيقة لكلّ غرفة، ثمّ 429، والغرفة الأخرى والدقيقة التالية حرّتان', async () => {
  const w = world();
  const room = await w.openRoom('omran'), other = await w.openRoom('omran');
  for (let i = 0; i < 600; i++) assert.equal((await w.call({ op: 'sfu-on', code: room.code, key: room.key })).status, 200, 'call ' + i);
  assert.deepEqual((await w.call({ op: 'sfu-on', code: room.code, key: room.key })).json, { error: 'slow-down' });
  const before = w.cf.calls.length;
  assert.equal((await w.call({ op: 'sfu-new', code: room.code, key: room.key })).status, 429);
  assert.equal(w.cf.calls.length, before, 'المحدود لا يصل Cloudflare');
  assert.equal((await w.call({ op: 'sfu-on', code: other.code, key: other.key })).status, 200, 'الحدّ لكلّ غرفة');
  const key = [...w.K.data.keys()].find((k) => k.startsWith('rl:talk-sfu:' + room.code + ':'));
  assert.equal(w.K.ttl.get(key), 120);
  w.clock.t += 60000;
  assert.equal((await w.call({ op: 'sfu-on', code: room.code, key: room.key })).status, 200, 'الدقيقة التالية');
});

test('admit: s للغرفة المدفوعة (own/sub) مع الميزة فقط، وanswer لا يتغيّر', async () => {
  const w = world();
  const own = await w.openRoom('omran');
  const g = await w.guest(own);
  assert.deepEqual(Object.keys(g.admit).sort(), ['ok', 's']);
  assert.match(g.s, /^[0-9a-f]{32}$/);
  assert.deepEqual((await act({ op: 'answer', code: own.code, id: g.id }, 'g', w.K, null, null, w.o)).json, { answer: SDP }, 'السرّ لا يمرّ في answer');
  const rec = roomRec(w.K, own.code); rec.p = 'sub'; w.K.data.set('talk/room/' + own.code, JSON.stringify(rec));
  assert.match((await w.guest(own)).s, /^[0-9a-f]{32}$/, 'sub كذلك');
  rec.p = 'free'; w.K.data.set('talk/room/' + own.code, JSON.stringify(rec));
  assert.deepEqual((await w.guest(own)).admit, { ok: true }, 'free بلا s');
  const off = world({ env: {} });
  const r2 = await off.openRoom('omran');
  assert.deepEqual((await off.guest(r2)).admit, { ok: true }, 'بلا الميزة بلا s');
});

test('لا سرّ في أيّ ردّ أو خطأ أو سطر سجلّ، والملفّ يقرأ البيئة داخل النداء فقط', () => {
  assert.ok(seen.length > 100);
  for (const s of seen) {
    assert.ok(!s.includes(SECRET), 'سرّ في: ' + s.slice(0, 120));
    assert.ok(!s.includes(CF_TEXT), 'نصّ Cloudflare في: ' + s.slice(0, 120));
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'api/_lib/talk-sfu.js'), 'utf8');
  assert.equal((src.match(/process\.env/g) || []).length, 1);
  assert.match(src, /function config\(o\) \{\n  const env = \(o && o\.env\) \|\| process\.env;/, 'داخل الدالّة لا في نطاق الوحدة');
  assert.ok(!/console\.(log|error|warn|info)/.test(src));
  const room = fs.readFileSync(path.join(__dirname, '..', 'api/_lib/talk-room.js'), 'utf8');
  assert.ok(!/process\.env/.test(room) && !/console\./.test(room));
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  assert.match(env, /^CLOUDFLARE_REALTIME_APP_ID=$/m);
  assert.match(env, /^CLOUDFLARE_REALTIME_APP_SECRET=$/m);
});
