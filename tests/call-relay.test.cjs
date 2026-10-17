// tests/call-relay.test.cjs — v-call-agent: مرحّل المكالمات الهاتفيّة (call-relay/) بلا شبكة ولا ws.
//
// المالك: «الوكيل يتّصل بالعيادة ويحجز عنّي». المرحّل على Railway يصل خطّ Twilio بجلسة الصوت الحيّ. هنا يُحاكى كلّ
// شيء بمقابس مزيّفة وساعة يدويّة وfetch محقون: مكالمة كاملة (إنشاء موقّع → رنين → بثّ → صوت في الاتّجاهين → مقاطعة
// تمسح صوت الوكيل → report_outcome يُحفظ → end_call يُغلق الخطّ بعد عودة علامة الوداع)، ورفض الطلبات المزوّرة
// والقديمة والمعادة، وأنّ لا سرّ ولا رقم كامل يظهر في /health ولا في السجلّ ولا على القرص.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'call-relay');
const load = (f) => import(pathToFileURL(path.join(dir, f)).href);

const SECRETS = {
  openaiKey: 'sk-test-' + 'Q'.repeat(40),
  twilioSid: 'AC' + '0123456789abcdef'.repeat(2),
  twilioToken: 'twilio-auth-token-' + 'z'.repeat(20),
  secret: 'relay-shared-secret-' + 'k'.repeat(30),
};
const PHONE = '+971501234567';
const CALL_SID = 'CA' + 'feedface'.repeat(4);
const PUBLIC = 'https://relay.example.test';
const T0 = Date.UTC(2026, 9, 17, 8, 0, 0);   // ١٢:٠٠ بتوقيت دبي

/* ───────── أدوات المحاكاة ───────── */
function fakeClock(start) {
  let t = start, seq = 0;
  const q = [];
  return {
    now: () => t,
    timers: {
      setTimeout: (fn, ms) => { const h = { at: t + Math.max(0, Number(ms) || 0), fn, id: ++seq }; q.push(h); return h; },
      clearTimeout: (h) => { const i = q.indexOf(h); if (i >= 0) q.splice(i, 1); },
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        const h = q[0];
        if (!h || h.at > end) break;
        q.shift();
        t = h.at;
        h.fn();
      }
      t = end;
    },
  };
}
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

class FakeSocket {
  constructor() { this.readyState = 0; this.sent = []; this.ls = {}; this.closeCode = 0; }
  addEventListener(type, fn) { (this.ls[type] = this.ls[type] || []).push(fn); }
  emit(type, ev) { for (const fn of this.ls[type] || []) fn(ev); }
  open() { this.readyState = 1; this.emit('open', { type: 'open' }); }
  send(s) { if (this.readyState !== 1) throw new Error('not open'); this.sent.push(JSON.parse(s)); }
  close(code) { if (this.readyState === 3) return; this.readyState = 3; this.closeCode = code || 1005; this.emit('close', { code: this.closeCode }); }
  drop(code) { this.readyState = 3; this.emit('close', { code }); }   // إغلاق من الطرف الآخر
  recv(obj) { this.emit('message', { data: JSON.stringify(obj) }); }
}
const media = (payload) => ({ event: 'media', streamSid: 'MZ1', media: { track: 'inbound', chunk: '1', timestamp: '20', payload } });
const startMsg = (t, sid) => ({ event: 'start', sequenceNumber: '1', streamSid: sid || 'MZ1', start: { streamSid: sid || 'MZ1', callSid: CALL_SID, tracks: ['inbound'], mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 }, customParameters: { t } } });
function fakeNetSocket() { return { written: '', destroyed: false, on() { return this; }, write(s) { this.written += s; }, destroy() { this.destroyed = true; } }; }

function fakeTwilioFetch() {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init, form: new URLSearchParams(String((init && init.body) || '')) });
    const created = /\/Calls\.json$/.test(String(url));
    const body = { sid: CALL_SID, status: created ? 'queued' : 'completed' };
    return { ok: true, status: created ? 201 : 200, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}

async function makeRelay(over) {
  const x = over || {};
  const { createRelay } = await load('server.mjs');
  const clock = fakeClock(x.start || T0);
  const logs = [], agents = [], lines = [];
  class Agent extends FakeSocket { constructor(url, opts) { super(); this.url = url; this.opts = opts; agents.push(this); } }
  class FakeWSS { constructor(o) { this.o = o; } handleUpgrade(req, socket, head, cb) { const s = new FakeSocket(); s.readyState = 1; lines.push(s); cb(s); } close() { return 0; } }
  const fetch = fakeTwilioFetch();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'call-relay-'));
  const config = Object.assign({ port: 0, twilioFrom: '+15005550006', publicUrl: PUBLIC, model: 'gpt-realtime-2.1', voice: 'cedar', stateDir }, SECRETS, x.config || {});
  const relay = createRelay({
    config, fetch, WebSocket: Agent, now: clock.now, timers: clock.timers, log: (l) => logs.push(l),
    loadWs: x.loadWs || (async () => ({ WebSocketServer: FakeWSS })),
  });
  const server = http.createServer((q, s) => relay.handle(q, s));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const ctx = {
    relay, server, port: server.address().port, clock, logs, agents, lines, fetch, stateDir,
    async stop() {
      relay.close();
      await relay.store.flush();
      await new Promise((r) => server.close(r));
      fs.rmSync(stateDir, { recursive: true, force: true });
    },
  };
  return ctx;
}

function request(port, method, p, headers, body) {
  return new Promise((resolve, reject) => {
    const b = body || '';
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: Object.assign({ 'content-length': Buffer.byteLength(b) }, headers || {}) }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let j = null;
        try { j = d ? JSON.parse(d) : null; } catch (e) { j = null; }
        resolve({ status: res.statusCode, body: d, json: j });
      });
    });
    req.on('error', reject);
    req.end(b);
  });
}
async function signedReq(ctx, lib, method, p, obj, opt) {
  const o = opt || {};
  const body = obj == null ? '' : JSON.stringify(obj);
  const h = lib.signRelayHeaders(o.secret || SECRETS.secret, o.signMethod || method, o.signPath || p, o.signBody != null ? o.signBody : body, o.ts != null ? o.ts : ctx.clock.now());
  return request(ctx.port, method, p, Object.assign({ 'content-type': 'application/json' }, h, o.headers || {}), body);
}
async function twilioStatus(ctx, lib, id, params, opt) {
  const p = '/twilio/status/' + id;
  const form = new URLSearchParams(params);
  const sig = (opt && opt.sig) || lib.twilioSignature(SECRETS.twilioToken, PUBLIC + p, form);
  return request(ctx.port, 'POST', p, { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig }, form.toString());
}
const SESSION = {
  type: 'realtime', model: 'gpt-realtime-2.1',
  instructions: 'You are an automated assistant from the app calling on behalf of Mohammed to book an appointment.',
  tools: [{ type: 'function', name: 'report_outcome' }, { type: 'function', name: 'end_call' }],
  audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: { type: 'server_vad' } }, output: { voice: 'marin' } },
};
/** ينشئ مكالمة موقّعة ويعيد رمز البثّ المستخرَج من TwiML. */
async function createCall(ctx, lib, id, extra) {
  const r = await signedReq(ctx, lib, 'POST', '/call', Object.assign({ callId: id, to: PHONE, maxSec: 240, session: SESSION }, extra || {}));
  assert.equal(r.status, 202, r.body);
  const created = ctx.fetch.calls.filter((c) => /\/Calls\.json$/.test(c.url)).at(-1);
  const m = /<Parameter name="t" value="([A-Za-z0-9_-]{20,})"\/>/.exec(created.form.get('Twiml'));
  assert.ok(m, 'TwiML بلا رمز');
  return m[1];
}
async function openStream(ctx, id, token) {
  await ctx.relay.upgrade({ url: '/stream/' + id, headers: {} }, fakeNetSocket(), Buffer.alloc(0));
  const line = ctx.lines.at(-1);
  line.recv({ event: 'connected', protocol: 'Call', version: '1.0.0' });
  line.recv(startMsg(token));
  const agent = ctx.agents.at(-1);
  agent.open();
  return { line, agent };
}
const hangups = (ctx) => ctx.fetch.calls.filter((c) => /\/Calls\/CA[0-9a-f]+\.json$/.test(c.url));

/* ───────── ١. المنطق النقيّ ───────── */
test('١. توقيع Vercel → المرحّل: الصحيح يمرّ، والمعدّل والقديم والمستقبليّ والناقص يُرفض', async () => {
  const lib = await load('lib.mjs');
  const S = SECRETS.secret;
  const body = JSON.stringify({ callId: 'cp-1', to: PHONE });
  const h = lib.signRelayHeaders(S, 'post', '/call', body, T0);
  assert.equal(h['x-call-ts'], String(T0));
  const want = crypto.createHmac('sha256', S).update(T0 + '.POST /call.' + body).digest('hex');
  assert.equal(h['x-call-sig'], want, 'الصيغة: ts + "." + METHOD + " " + PATH + "." + rawBody');
  const base = { secret: S, ts: h['x-call-ts'], sig: h['x-call-sig'], method: 'POST', path: '/call', rawBody: body, now: T0 + 1000 };
  assert.deepEqual(lib.verifyRelay(base), { ok: true });
  assert.deepEqual(lib.verifyRelay(Object.assign({}, base, { rawBody: Buffer.from(body) })), { ok: true }, 'بايتات الجسم كما هي');
  assert.equal(lib.verifyRelay(Object.assign({}, base, { rawBody: body.replace('cp-1', 'cp-2') })).why, 'signature');
  assert.equal(lib.verifyRelay(Object.assign({}, base, { path: '/call/cp-1' })).why, 'signature');
  assert.equal(lib.verifyRelay(Object.assign({}, base, { method: 'GET' })).why, 'signature');
  assert.equal(lib.verifyRelay(Object.assign({}, base, { secret: S + 'x' })).why, 'signature');
  assert.equal(lib.verifyRelay(Object.assign({}, base, { now: T0 + 60001 })).why, 'expired');
  assert.equal(lib.verifyRelay(Object.assign({}, base, { now: T0 - 60001 })).why, 'expired');
  assert.equal(lib.verifyRelay(Object.assign({}, base, { sig: '' })).why, 'missing');
  assert.equal(lib.verifyRelay(Object.assign({}, base, { ts: 'abc' })).why, 'missing');
  assert.equal(lib.verifyRelay(Object.assign({}, base, { secret: 'short' })).why, 'not_configured');
});

test('٢. توقيع Twilio: المفاتيح مرتّبة حرفيًّا (المفتاح + القيمة)، والمنفذ ‎:443‎ مقبول، والتلاعب مرفوض', async () => {
  const lib = await load('lib.mjs');
  const url = PUBLIC + '/twilio/status/cp-1';
  const params = { CallStatus: 'ringing', CallSid: 'CA1', AccountSid: 'AC1' };
  const data = 'AccountSidAC1CallSidCA1CallStatusringing';
  const want = crypto.createHmac('sha1', 'tok').update(url + data).digest('base64');
  assert.equal(lib.twilioSignature('tok', url, params), want);
  assert.equal(lib.twilioSignature('tok', url, new URLSearchParams(params)), want);
  assert.ok(lib.verifyTwilio('tok', want, url, params));
  const w443 = crypto.createHmac('sha1', 'tok').update('https://relay.example.test:443/twilio/status/cp-1' + data).digest('base64');
  assert.ok(lib.verifyTwilio('tok', w443, url, params), 'Twilio قد يوقّع بالمنفذ الافتراضيّ');
  assert.ok(!lib.verifyTwilio('tok', want, url, Object.assign({}, params, { CallStatus: 'completed' })));
  assert.ok(!lib.verifyTwilio('tok', want, url + 'x', params));
  assert.ok(!lib.verifyTwilio('other', want, url, params));
  assert.ok(!lib.verifyTwilio('tok', '', url, params));
  assert.ok(!lib.verifyTwilio('', want, url, params));
});

test('٣. TwiML: <Connect><Stream> بلا استعلام في العنوان (Twilio 31920)، والرمز في <Parameter>، والقيم مهرَّبة', async () => {
  const lib = await load('lib.mjs');
  const ws = lib.streamUrl(PUBLIC, 'cp-abc_1');
  assert.equal(ws, 'wss://relay.example.test/stream/cp-abc_1');
  assert.equal(lib.statusUrl(PUBLIC + '/', 'cp-abc_1'), PUBLIC + '/twilio/status/cp-abc_1');
  assert.equal(lib.streamTwiml({ wsUrl: ws, token: 'tok_1' }),
    '<Response><Connect><Stream url="wss://relay.example.test/stream/cp-abc_1"><Parameter name="t" value="tok_1"/></Stream></Connect></Response>');
  assert.ok(!lib.streamTwiml({ wsUrl: ws, token: 'x' }).includes('?'));
  assert.match(lib.streamTwiml({ wsUrl: ws, token: 'a"<&' }), /value="a&quot;&lt;&amp;"/);
});

test('٤. الرقم: الإمارات وحدها، الطوارئ و600/800/900 محجوبة، والإخفاء ‎+971 50 *** 1234‎', async () => {
  const lib = await load('lib.mjs');
  assert.deepEqual(lib.checkUaePhone('+971501234567'), { ok: true, e164: '+971501234567', national: '501234567', kind: 'mobile' });
  assert.equal(lib.checkUaePhone('+971581234567').kind, 'mobile');
  assert.equal(lib.checkUaePhone('+97142345678').kind, 'landline');
  assert.equal(lib.checkUaePhone('+971531234567').kind, 'landline', 'موبايل = 50/52/54/55/56/58 فقط');
  for (const bad of ['+971800123456', '+97180012345', '+971600123456', '+97190012345']) assert.equal(lib.checkUaePhone(bad).why, 'blocked', bad);
  for (const bad of ['+966501234567', '0501234567', '999', '+971999', '+9715012', '+9710501234567', '+97150123456789', '', null]) assert.equal(lib.checkUaePhone(bad).ok, false, String(bad));
  assert.equal(lib.maskPhone('+971501234567'), '+971 50 *** 4567');
  assert.equal(lib.maskPhone('+97142345678'), '+971 4 *** 5678');
  assert.ok(!lib.maskPhone('+447700900123').includes('7700900'));
});

test('٥. ترجمة الأحداث: أسماء GA والتجريبيّة، المسار الصادر يُتجاهل، والوسائط تُبنى بالشكل الذي ينتظره Twilio', async () => {
  const lib = await load('lib.mjs');
  const j = JSON.stringify;
  assert.deepEqual(lib.twilioEvent(j(startMsg('tk'))), { kind: 'start', streamSid: 'MZ1', callSid: CALL_SID, token: 'tk' });
  assert.deepEqual(lib.twilioEvent(j(media('QUJD'))), { kind: 'media', payload: 'QUJD' });
  assert.equal(lib.twilioEvent(j({ event: 'media', media: { track: 'outbound', payload: 'QUJD' } })).kind, 'other');
  assert.deepEqual(lib.twilioEvent(j({ event: 'mark', mark: { name: 'r1' } })), { kind: 'mark', name: 'r1' });
  assert.equal(lib.twilioEvent(j({ event: 'stop' })).kind, 'stop');
  assert.equal(lib.twilioEvent('not json').kind, 'invalid');
  for (const t of ['response.output_audio.delta', 'response.audio.delta']) assert.deepEqual(lib.agentEvent(j({ type: t, item_id: 'i1', delta: 'QQ==' })), { kind: 'audio', delta: 'QQ==', itemId: 'i1' });
  for (const t of ['response.output_audio_transcript.done', 'response.audio_transcript.done']) assert.deepEqual(lib.agentEvent(j({ type: t, transcript: 'مرحبا' })), { kind: 'agent_text', text: 'مرحبا' });
  assert.deepEqual(lib.agentEvent(j({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'نعم' })), { kind: 'callee_text', text: 'نعم' });
  assert.equal(lib.agentEvent(j({ type: 'input_audio_buffer.speech_started' })).kind, 'speech_started');
  assert.deepEqual(lib.agentEvent(j({ type: 'response.function_call_arguments.done', name: 'end_call', call_id: 'c1', arguments: '{"reason":"done"}' })), { kind: 'tool', name: 'end_call', callId: 'c1', args: { reason: 'done' } });
  assert.deepEqual(lib.agentEvent(j({ type: 'response.function_call_arguments.done', call_id: 'c2', arguments: '{broken' })).args, {});
  assert.deepEqual(lib.agentEvent(j({ type: 'response.output_item.added', item: { type: 'function_call', name: 'report_outcome', call_id: 'c3' } })), { kind: 'tool_item', name: 'report_outcome', callId: 'c3' });
  assert.deepEqual(lib.twilioMedia('MZ1', 'QQ=='), { event: 'media', streamSid: 'MZ1', media: { payload: 'QQ==' } });
  assert.deepEqual(lib.twilioClear('MZ1'), { event: 'clear', streamSid: 'MZ1' });
  assert.deepEqual(lib.appendAudio('QQ=='), { type: 'input_audio_buffer.append', audio: 'QQ==' });
  assert.equal(lib.pcmuMs('f'.repeat(1600)), 150, '١٢٠٠ بايت μ-law = ١٥٠ م.ث');
  assert.equal(lib.pcmuMs('QQ=='), 0.125);
});

test('٦. الجلسة والنتيجة والحال: pcmu مفروض، النتيجة منقّاة، والحال لا ترجع للخلف', async () => {
  const lib = await load('lib.mjs');
  const p = lib.prepareSession(SESSION, { model: 'm-default', voice: 'cedar' });
  assert.equal(p.model, 'gpt-realtime-2.1');
  assert.equal(p.session.model, undefined, 'النموذج في عنوان المقبس لا في session.update');
  assert.deepEqual(p.session.audio.input.format, { type: 'audio/pcmu' });
  assert.deepEqual(p.session.audio.output.format, { type: 'audio/pcmu' });
  assert.equal(p.session.audio.output.voice, 'marin', 'صوت Vercel يبقى');
  assert.deepEqual(p.session.audio.input.turn_detection, { type: 'server_vad' });
  assert.equal(SESSION.audio.input.format.type, 'audio/pcm', 'الأصل لم يُمسّ');
  const q = lib.prepareSession({ instructions: 'x' }, { model: 'm-default', voice: 'cedar' });
  assert.equal(q.model, 'm-default'); assert.equal(q.session.audio.output.voice, 'cedar'); assert.equal(q.session.type, 'realtime');

  assert.deepEqual(lib.cleanOutcome({ status: 'booked', summary: '  تمّ   الحجز ', confirmed_details: 'الخميس', follow_up: '' }), { status: 'booked', summary: 'تمّ الحجز', confirmed_details: 'الخميس', follow_up: '' });
  assert.equal(lib.cleanOutcome({ status: 'hacked' }).status, 'needs_user');
  assert.equal(lib.cleanOutcome({ summary: 'x'.repeat(5000) }).summary.length, 600);
  assert.equal(lib.clampSec(240), 240); assert.equal(lib.clampSec(5), 30); assert.equal(lib.clampSec(99999), 900); assert.equal(lib.clampSec('x'), 240);
  assert.equal(lib.withinDubaiHours(Date.UTC(2026, 9, 17, 4, 0)), true, '٠٨:٠٠ دبي');
  assert.equal(lib.withinDubaiHours(Date.UTC(2026, 9, 17, 3, 59)), false, '٠٧:٥٩ دبي');
  assert.equal(lib.withinDubaiHours(Date.UTC(2026, 9, 17, 17, 59)), true, '٢١:٥٩ دبي');
  assert.equal(lib.withinDubaiHours(Date.UTC(2026, 9, 17, 18, 0)), false, '٢٢:٠٠ دبي');

  const c = lib.newCall({ callId: 'cp-1', now: 1 });
  assert.equal(lib.applyState(c, 'initiated', 2), false, 'initiated = queued');
  assert.equal(lib.applyState(c, 'in-progress', 3), true); assert.equal(c.answeredAt, 3);
  assert.equal(lib.applyState(c, 'ringing', 4), false, 'ردّ متأخّر لا يرجع الحال');
  assert.equal(lib.applyState(c, 'completed', 5), true); assert.equal(c.endedAt, 5);
  assert.equal(lib.applyState(c, 'failed', 6), false, 'النهائيّة نهائيّة');
  assert.equal(lib.publicView(c, 9).durationSec, 0);
  assert.deepEqual(Object.keys(lib.publicView(c, 9)), ['state', 'durationSec', 'transcript', 'outcome', 'ended', 'endReason']);
});

test('٧. المخزن: يعود بعد إعادة التشغيل (غير المنتهي = failed)، ويحذف ما فوق ٢٤ ساعة والتالف، ويعمل في الذاكرة إن تعذّر القرص', async () => {
  const lib = await load('lib.mjs');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'call-store-'));
  try {
    const s1 = lib.createStore({ dir: d, now: () => T0 });
    const a = lib.newCall({ callId: 'cp-live-1', phoneMasked: '+971 50 *** 4567', kind: 'mobile', maxSec: 240, now: T0 });
    lib.applyState(a, 'in-progress', T0);
    s1.put(a);
    const old = lib.newCall({ callId: 'cp-old-1', now: T0 - 25 * 3600 * 1000 });
    lib.applyState(old, 'completed', T0);
    s1.put(old);
    const done = lib.newCall({ callId: 'cp-done-1', now: T0 });
    lib.applyState(done, 'completed', T0);
    s1.put(done);
    assert.equal(s1.active(), 1);
    await s1.flush();
    fs.writeFileSync(path.join(d, 'cp-bad-1.json'), '{not json');
    let t2 = T0 + 1000;
    const s2 = lib.createStore({ dir: d, now: () => t2 });
    assert.equal(await s2.load(), 2);
    assert.equal(s2.get('cp-live-1').state, 'failed');
    assert.equal(s2.get('cp-live-1').endReason, 'relay_restart');
    assert.equal(s2.get('cp-done-1').state, 'completed');
    assert.equal(s2.get('cp-old-1'), null);
    assert.ok(!fs.existsSync(path.join(d, 'cp-old-1.json')) && !fs.existsSync(path.join(d, 'cp-bad-1.json')));
    assert.equal(s2.active(), 0);
    t2 = T0 + 25 * 3600 * 1000;
    assert.equal(await s2.sweep(), 2);
    await s2.flush();
    assert.deepEqual(fs.readdirSync(d).filter((n) => n.endsWith('.json')), []);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }

  const f = path.join(os.tmpdir(), 'call-store-file-' + process.pid);
  fs.writeFileSync(f, 'x');
  try {
    const logs = [];
    const s3 = lib.createStore({ dir: path.join(f, 'sub'), now: () => T0, log: (l) => logs.push(l) });
    s3.put(lib.newCall({ callId: 'cp-mem-1', now: T0 }));
    await s3.flush();
    assert.equal(s3.get('cp-mem-1').state, 'queued');
    assert.match(logs.join('\n'), /memory only/);
  } finally { fs.rmSync(f, { force: true }); }
});

/* ───────── ٢. الخادم ───────── */
test('٨. /health: أعلام فقط بلا سرّ؛ والمرحّل الناقص يقول ما ينقصه (503) ولا يتّصل', async () => {
  const lib = await load('lib.mjs');
  const ctx = await makeRelay();
  try {
    const h = await request(ctx.port, 'GET', '/health');
    assert.equal(h.status, 200);
    assert.deepEqual(h.json, { ok: true, calls: 0, twilio: true, openai: true, publicUrl: true, signing: true });
    for (const v of Object.values(SECRETS)) assert.ok(!h.body.includes(v));
    assert.equal((await request(ctx.port, 'GET', '/nope')).status, 404);
  } finally { await ctx.stop(); }

  const bare = await makeRelay({ config: { openaiKey: '', twilioFrom: 'abc' } });
  try {
    const h = await request(bare.port, 'GET', '/health');
    assert.deepEqual(h.json, { ok: true, calls: 0, twilio: false, openai: false, publicUrl: true, signing: true });
    const r = await signedReq(bare, lib, 'POST', '/call', { callId: 'cp-bare-1', to: PHONE, session: SESSION });
    assert.equal(r.status, 503);
    assert.deepEqual(r.json, { error: 'not_configured', missing: ['OPENAI_API_KEY', 'TWILIO_FROM'] });
    assert.equal(bare.fetch.calls.length, 0);
  } finally { await bare.stop(); }

  const nosecret = await makeRelay({ config: { secret: '' } });
  try {
    const r = await signedReq(nosecret, lib, 'POST', '/call', { callId: 'cp-ns-1', to: PHONE, session: SESSION }, { secret: 'anything-long-enough-for-hmac-123' });
    assert.equal(r.status, 503);
    assert.equal(r.json.error, 'not_configured');
    assert.equal((await request(nosecret.port, 'GET', '/health')).json.signing, false);
  } finally { await nosecret.stop(); }

  const { configFromEnv, readiness } = lib;
  const cfg = configFromEnv({ RAILWAY_PUBLIC_DOMAIN: 'x.up.railway.app', CALL_RELAY_SECRET: 'short' });
  assert.equal(cfg.publicUrl, 'https://x.up.railway.app');
  assert.equal(cfg.port, 8080); assert.equal(cfg.model, 'gpt-realtime-2.1'); assert.equal(cfg.voice, 'cedar'); assert.equal(cfg.stateDir, '/tmp/calls');
  assert.equal(configFromEnv({ PUBLIC_URL: 'http://evil.example' }).publicUrl, '', 'http عامّ مرفوض');
  assert.equal(readiness(cfg).signing, false);
});

test('٩. المسارات الموقّعة ترفض: بلا توقيع، المعدّل، القديم (> ٦٠ ث)، المعاد، المسار الآخر — وخارج ٠٨–٢٢ دبي والرقم المحجوب', async () => {
  const lib = await load('lib.mjs');
  const ctx = await makeRelay();
  try {
    const payload = { callId: 'cp-sig-1', to: PHONE, maxSec: 240, session: SESSION };
    let r = await request(ctx.port, 'POST', '/call', { 'content-type': 'application/json' }, JSON.stringify(payload));
    assert.equal(r.status, 401); assert.equal(r.json.why, 'missing');
    r = await signedReq(ctx, lib, 'POST', '/call', payload, { signBody: JSON.stringify(Object.assign({}, payload, { to: '+971509999999' })) });
    assert.equal(r.status, 401); assert.equal(r.json.why, 'signature');
    r = await signedReq(ctx, lib, 'POST', '/call', payload, { ts: ctx.clock.now() - 61000 });
    assert.equal(r.status, 401); assert.equal(r.json.why, 'expired');
    r = await signedReq(ctx, lib, 'POST', '/call', payload, { secret: 'another-secret-of-enough-length-000' });
    assert.equal(r.status, 401);
    r = await signedReq(ctx, lib, 'GET', '/call/cp-sig-1', null, { signPath: '/call/cp-other' });
    assert.equal(r.status, 401);
    assert.equal(ctx.fetch.calls.length, 0, 'لا شيء وصل Twilio');

    const body = JSON.stringify(payload);
    const h = lib.signRelayHeaders(SECRETS.secret, 'POST', '/call', body, ctx.clock.now());
    r = await request(ctx.port, 'POST', '/call', Object.assign({ 'content-type': 'application/json' }, h), body);
    assert.equal(r.status, 202);
    r = await request(ctx.port, 'POST', '/call', Object.assign({ 'content-type': 'application/json' }, h), body);
    assert.equal(r.status, 401); assert.equal(r.json.why, 'replay');
    assert.equal(ctx.fetch.calls.length, 1);

    ctx.clock.advance(1);   // نفس الجسم بطابع جديد = توقيع جديد (المعاد بنفس التوقيع رُفض أعلاه)
    r = await signedReq(ctx, lib, 'POST', '/call', Object.assign({}, payload, { callId: 'cp-sig-1' }));
    assert.equal(r.status, 409); assert.equal(r.json.error, 'exists');
    r = await signedReq(ctx, lib, 'POST', '/call', Object.assign({}, payload, { callId: 'cp-sig-2', to: '+971800123456' }));
    assert.equal(r.status, 400); assert.equal(r.json.error, 'bad_phone');
    r = await signedReq(ctx, lib, 'POST', '/call', Object.assign({}, payload, { callId: 'cp-sig-3', to: '+966501234567' }));
    assert.equal(r.status, 400);
    r = await signedReq(ctx, lib, 'POST', '/call', { callId: 'cp-sig-4', to: PHONE });
    assert.equal(r.status, 400); assert.equal(r.json.field, 'session');
    r = await signedReq(ctx, lib, 'GET', '/call/cp-nobody', null);
    assert.equal(r.status, 404);
    assert.equal(ctx.fetch.calls.length, 1);
  } finally { await ctx.stop(); }

  const night = await makeRelay({ start: Date.UTC(2026, 9, 17, 3, 0) });   // ٠٧:٠٠ دبي
  try {
    const r = await signedReq(night, lib, 'POST', '/call', { callId: 'cp-night-1', to: PHONE, session: SESSION });
    assert.equal(r.status, 403); assert.equal(r.json.error, 'outside_hours');
    assert.equal(night.fetch.calls.length, 0);
  } finally { await night.stop(); }
});

test('١٠. مكالمة كاملة بمقابس مزيّفة: صوت في الاتّجاهين، clear عند المقاطعة، النتيجة تُحفظ، والإغلاق بعد عودة علامة الوداع', async () => {
  const lib = await load('lib.mjs');
  const ctx = await makeRelay();
  const ID = 'cp-call-001';
  try {
    const r = await signedReq(ctx, lib, 'POST', '/call', { callId: ID, to: PHONE, maxSec: 240, session: SESSION });
    assert.equal(r.status, 202);
    assert.deepEqual(r.json, { callId: ID, state: 'queued' });

    // Twilio REST: الحقول كما في العقد
    assert.equal(ctx.fetch.calls.length, 1);
    const c0 = ctx.fetch.calls[0];
    assert.equal(c0.url, 'https://api.twilio.com/2010-04-01/Accounts/' + SECRETS.twilioSid + '/Calls.json');
    assert.equal(c0.init.method, 'POST');
    assert.equal(c0.init.headers.Authorization, 'Basic ' + Buffer.from(SECRETS.twilioSid + ':' + SECRETS.twilioToken).toString('base64'));
    const f = c0.form;
    assert.equal(f.get('To'), PHONE);
    assert.equal(f.get('From'), '+15005550006');
    assert.equal(f.get('TimeLimit'), '240');
    assert.equal(f.get('Record'), 'false', 'لا تسجيل');
    assert.equal(f.get('StatusCallback'), PUBLIC + '/twilio/status/' + ID);
    assert.deepEqual(f.getAll('StatusCallbackEvent'), ['initiated', 'ringing', 'answered', 'completed']);
    const m = /^<Response><Connect><Stream url="wss:\/\/relay\.example\.test\/stream\/cp-call-001"><Parameter name="t" value="([A-Za-z0-9_-]{20,})"\/><\/Stream><\/Connect><\/Response>$/.exec(f.get('Twiml'));
    assert.ok(m, f.get('Twiml'));
    const token = m[1];

    // ردود الحال: الموقّع يمرّ، والمزوّر 403 ولا يغيّر شيئًا
    assert.equal((await twilioStatus(ctx, lib, ID, { CallSid: CALL_SID, CallStatus: 'ringing', AccountSid: SECRETS.twilioSid })).status, 204);
    assert.equal((await twilioStatus(ctx, lib, ID, { CallSid: CALL_SID, CallStatus: 'completed' }, { sig: 'Zm9yZ2Vk' })).status, 403);
    let g = await signedReq(ctx, lib, 'GET', '/call/' + ID, null);
    assert.equal(g.json.state, 'ringing');
    assert.equal(g.json.ended, false);
    assert.equal((await request(ctx.port, 'GET', '/health')).json.calls, 1);

    // ترقية المقبس: المسار الغريب 404، ومسار المكالمة يُسلَّم لـws
    const stray = fakeNetSocket();
    await ctx.relay.upgrade({ url: '/elsewhere', headers: {} }, stray, Buffer.alloc(0));
    assert.match(stray.written, /^HTTP\/1\.1 404/); assert.ok(stray.destroyed);
    const ghost = fakeNetSocket();
    await ctx.relay.upgrade({ url: '/stream/cp-unknown', headers: {} }, ghost, Buffer.alloc(0));
    assert.match(ghost.written, /^HTTP\/1\.1 404/);
    await ctx.relay.upgrade({ url: '/stream/' + ID, headers: { 'x-twilio-signature': 'abc' } }, fakeNetSocket(), Buffer.alloc(0));
    assert.equal(ctx.lines.length, 1);
    const line = ctx.lines[0];
    const twice = fakeNetSocket();
    await ctx.relay.upgrade({ url: '/stream/' + ID, headers: {} }, twice, Buffer.alloc(0));
    assert.match(twice.written, /^HTTP\/1\.1 404/, 'بثّ ثانٍ لنفس المكالمة مرفوض');

    line.recv({ event: 'connected', protocol: 'Call', version: '1.0.0' });
    line.recv(startMsg(token));
    assert.equal(ctx.agents.length, 1);
    const agent = ctx.agents[0];
    assert.equal(agent.url, 'wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1');
    assert.equal(agent.opts.headers.Authorization, 'Bearer ' + SECRETS.openaiKey);
    g = await signedReq(ctx, lib, 'GET', '/call/' + ID, null);
    assert.equal(g.json.state, 'in-progress');

    // صوت الخطّ قبل جاهزيّة الجلسة يُحفظ ثمّ يُرسل بعد session.update
    line.recv(media('AAAA'));
    assert.equal(agent.sent.length, 0);
    agent.open();
    assert.equal(agent.sent[0].type, 'session.update');
    const ss = agent.sent[0].session;
    assert.equal(ss.type, 'realtime');
    assert.equal(ss.model, undefined);
    assert.equal(ss.instructions, SESSION.instructions);
    assert.deepEqual(ss.tools, SESSION.tools);
    assert.deepEqual(ss.audio.input.format, { type: 'audio/pcmu' });
    assert.deepEqual(ss.audio.output.format, { type: 'audio/pcmu' });
    assert.deepEqual(agent.sent[1], { type: 'input_audio_buffer.append', audio: 'AAAA' });

    // صمت ٢٫٥ ث ⇒ الوكيل يفتتح بالإفصاح
    ctx.clock.advance(2400);
    assert.equal(agent.sent.filter((e) => e.type === 'response.create').length, 0);
    ctx.clock.advance(200);
    assert.equal(agent.sent.filter((e) => e.type === 'response.create').length, 1);

    // الوكيل ⇒ الخطّ
    agent.recv({ type: 'session.created', session: {} });
    agent.recv({ type: 'response.created', response: { id: 'resp_1' } });
    const delta = 'f'.repeat(1600);   // ١٥٠ م.ث
    agent.recv({ type: 'response.output_audio.delta', item_id: 'item_a', delta });
    assert.deepEqual(line.sent.at(-1), { event: 'media', streamSid: 'MZ1', media: { payload: delta } });
    agent.recv({ type: 'response.audio.delta', item_id: 'item_a', delta });
    assert.equal(line.sent.filter((e) => e.event === 'media').length, 2);
    agent.recv({ type: 'response.output_audio_transcript.done', transcript: 'مرحبًا، أنا مساعد آليّ أتّصل نيابةً عن محمد لحجز موعد. المكالمة آليّة ولا تُسجَّل، هل تسمح لي بالمتابعة؟' });

    // الخطّ ⇒ الوكيل
    line.recv(media('BBBB'));
    assert.deepEqual(agent.sent.at(-1), { type: 'input_audio_buffer.append', audio: 'BBBB' });

    // المقاطعة بعد ١٠٠ م.ث من صوت ٣٠٠ م.ث
    ctx.clock.advance(100);
    agent.recv({ type: 'input_audio_buffer.speech_started', audio_start_ms: 2700 });
    assert.deepEqual(line.sent.at(-1), { event: 'clear', streamSid: 'MZ1' });
    assert.equal(agent.sent.filter((e) => e.type === 'response.cancel').length, 1);
    const tr = agent.sent.find((e) => e.type === 'conversation.item.truncate');
    assert.deepEqual(tr, { type: 'conversation.item.truncate', item_id: 'item_a', content_index: 0, audio_end_ms: 100 });
    agent.recv({ type: 'response.done', response: { status: 'cancelled' } });
    agent.recv({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'نعم تفضّل، عندنا موعد الخميس الساعة ٥' });

    // report_outcome أثناء ردّ جارٍ: المخرَج فورًا، وresponse.create بعد response.done
    agent.recv({ type: 'response.created' });
    const creates = () => agent.sent.filter((e) => e.type === 'response.create').length;
    const before = creates();
    agent.recv({ type: 'response.function_call_arguments.done', name: 'report_outcome', call_id: 'call_r1', arguments: JSON.stringify({ status: 'booked', summary: 'تمّ حجز موعد الخميس ٥ مساءً', confirmed_details: 'الخميس ٥:٠٠ م باسم محمد', follow_up: '' }) });
    const out = agent.sent.at(-1);
    assert.equal(out.type, 'conversation.item.create');
    assert.deepEqual(out.item, { type: 'function_call_output', call_id: 'call_r1', output: JSON.stringify({ ok: true }) });
    assert.equal(creates(), before, 'لا response.create وردّ جارٍ');
    agent.recv({ type: 'response.done' });
    assert.equal(creates(), before + 1);
    agent.recv({ type: 'response.function_call_arguments.done', name: 'report_outcome', call_id: 'call_r1', arguments: '{"status":"failed"}' });
    assert.equal(ctx.relay.store.get(ID).outcome.status, 'booked', 'الحدث المكرّر لا يُعاد');

    // الوداع ثمّ end_call (الاسم من output_item إن غاب)، والخطّ لا يُغلق قبل عودة العلامة
    agent.recv({ type: 'response.created' });
    agent.recv({ type: 'response.output_audio.delta', item_id: 'item_b', delta });
    agent.recv({ type: 'response.output_audio.done', item_id: 'item_b' });
    const mark = line.sent.at(-1);
    assert.equal(mark.event, 'mark'); assert.equal(mark.streamSid, 'MZ1'); assert.ok(mark.mark.name);
    agent.recv({ type: 'response.output_audio_transcript.done', transcript: 'شكرًا لك، مع السلامة.' });
    agent.recv({ type: 'response.output_item.added', item: { type: 'function_call', name: 'end_call', call_id: 'call_e1' } });
    agent.recv({ type: 'response.function_call_arguments.done', call_id: 'call_e1', arguments: JSON.stringify({ reason: 'booked, goodbye said' }) });
    assert.deepEqual(agent.sent.at(-1).item, { type: 'function_call_output', call_id: 'call_e1', output: JSON.stringify({ ok: true }) });
    agent.recv({ type: 'response.done' });
    await settle();
    assert.equal(hangups(ctx).length, 0, 'لا إغلاق قبل أن يُسمع الوداع');
    ctx.clock.advance(1000); await settle();
    assert.equal(hangups(ctx).length, 0, 'ما زال ينتظر العلامة');
    line.recv({ event: 'mark', sequenceNumber: '9', streamSid: 'MZ1', mark: { name: mark.mark.name } });
    ctx.clock.advance(300); await settle();
    const hs = hangups(ctx);
    assert.equal(hs.length, 1);
    assert.equal(hs[0].url, 'https://api.twilio.com/2010-04-01/Accounts/' + SECRETS.twilioSid + '/Calls/' + CALL_SID + '.json');
    assert.equal(hs[0].form.get('Status'), 'completed');
    assert.equal(line.readyState, 3, 'مقبس الخطّ أُغلق');
    assert.equal(agent.readyState, 3, 'مقبس الوكيل أُغلق');

    // ردّ «completed» بالمدّة ⇒ ended
    assert.equal((await twilioStatus(ctx, lib, ID, { CallSid: CALL_SID, CallStatus: 'completed', CallDuration: '42' })).status, 204);
    g = await signedReq(ctx, lib, 'GET', '/call/' + ID, null);
    assert.equal(g.status, 200);
    assert.equal(g.json.state, 'completed');
    assert.equal(g.json.ended, true);
    assert.equal(g.json.durationSec, 42);
    assert.equal(g.json.endReason, 'end_call');
    assert.deepEqual(g.json.outcome, { status: 'booked', summary: 'تمّ حجز موعد الخميس ٥ مساءً', confirmed_details: 'الخميس ٥:٠٠ م باسم محمد', follow_up: '' });
    assert.deepEqual(g.json.transcript.map((l) => l.who), ['agent', 'callee', 'agent']);
    assert.equal(ctx.relay.live.size, 0, 'الرمز والجلسة حُذفا من الذاكرة');

    // لا سرّ ولا رقم كامل في /health ولا السجلّ ولا القرص
    const h = await request(ctx.port, 'GET', '/health');
    assert.equal(h.json.calls, 0);
    const logs = ctx.logs.join('\n');
    await ctx.relay.store.flush();
    const disk = fs.readFileSync(path.join(ctx.stateDir, ID + '.json'), 'utf8');
    for (const v of [...Object.values(SECRETS), token, PHONE, 'Basic ' + Buffer.from(SECRETS.twilioSid + ':' + SECRETS.twilioToken).toString('base64')]) {
      assert.ok(!logs.includes(v), 'السجلّ فيه سرّ/رقم: ' + v.slice(0, 8));
      assert.ok(!h.body.includes(v));
      assert.ok(!disk.includes(v), 'ملفّ الحال فيه سرّ/رقم: ' + v.slice(0, 8));
    }
    assert.ok(!disk.includes(SESSION.instructions), 'تعليمات الجلسة لا تُكتب على القرص');
    assert.ok(!/payload|AAAA|ffff/.test(disk), 'لا صوت على القرص');
    assert.match(logs, /\+971 50 \*\*\* 4567/);
    assert.match(logs, /handshake signature: mismatch/);
  } finally { await ctx.stop(); }
});

test('١١. مقبس برمز خاطئ يُغلق (1008) ولا يمسّ المكالمة، ومقبس بلا start يُغلق بعد ٥ ث، وws الغائب = 503', async () => {
  const lib = await load('lib.mjs');
  const ctx = await makeRelay();
  try {
    const token = await createCall(ctx, lib, 'cp-tok-1');
    await ctx.relay.upgrade({ url: '/stream/cp-tok-1', headers: {} }, fakeNetSocket(), Buffer.alloc(0));
    const bad = ctx.lines.at(-1);
    bad.recv(startMsg('not-the-token-at-all-xx', 'MZbad'));
    assert.equal(bad.readyState, 3); assert.equal(bad.closeCode, 1008);
    assert.equal(ctx.agents.length, 0, 'لا جلسة صوت لمقبس مزيّف');
    assert.equal(hangups(ctx).length, 0, 'المكالمة الحقيقيّة لم تُغلق');
    const { line, agent } = await openStream(ctx, 'cp-tok-1', token);
    assert.equal(line.readyState, 1);
    assert.equal(agent.sent[0].type, 'session.update');

    await createCall(ctx, lib, 'cp-tok-2');
    await ctx.relay.upgrade({ url: '/stream/cp-tok-2', headers: {} }, fakeNetSocket(), Buffer.alloc(0));
    const mute = ctx.lines.at(-1);
    ctx.clock.advance(4900);
    assert.equal(mute.readyState, 1);
    ctx.clock.advance(200);
    assert.equal(mute.readyState, 3); assert.equal(mute.closeCode, 1008);
  } finally { await ctx.stop(); }

  const nows = await makeRelay({ loadWs: async () => { throw new Error("Cannot find package 'ws'"); } });
  try {
    await createCall(nows, lib, 'cp-nows-1');
    const s = fakeNetSocket();
    await nows.relay.upgrade({ url: '/stream/cp-nows-1', headers: {} }, s, Buffer.alloc(0));
    assert.match(s.written, /^HTTP\/1\.1 503/); assert.ok(s.destroyed);
  } finally { await nows.stop(); }
});

test('١٢. انقطاع جلسة الوكيل يُغلق الخطّ ويُختم الحال، والإيقاف الصارم عند maxSec + ١٠ ث، والإلغاء = Status=completed', async () => {
  const lib = await load('lib.mjs');
  const ctx = await makeRelay();
  try {
    const t1 = await createCall(ctx, lib, 'cp-drop-1');
    const a = await openStream(ctx, 'cp-drop-1', t1);
    a.agent.drop(1006);
    await settle();
    assert.equal(hangups(ctx).length, 1);
    assert.equal(hangups(ctx)[0].form.get('Status'), 'completed');
    assert.equal(a.line.readyState, 3);
    let g = await signedReq(ctx, lib, 'GET', '/call/cp-drop-1', null);
    assert.equal(g.json.endReason, 'agent_disconnected');
    assert.equal(g.json.ended, false, 'ينتظر ردّ Twilio النهائيّ');
    ctx.clock.advance(20000);
    g = await signedReq(ctx, lib, 'GET', '/call/cp-drop-1', null);
    assert.equal(g.json.state, 'completed', 'لم يصل الردّ ⇒ يُختم بنفسه');
    assert.equal(g.json.ended, true);

    const t2 = await createCall(ctx, lib, 'cp-long-1', { maxSec: 30 });
    assert.equal(ctx.fetch.calls.at(-1).form.get('TimeLimit'), '30');
    const b = await openStream(ctx, 'cp-long-1', t2);
    ctx.clock.advance(39900); await settle();
    assert.equal(hangups(ctx).length, 1);
    ctx.clock.advance(200); await settle();
    assert.equal(hangups(ctx).length, 2);
    assert.equal(b.agent.readyState, 3);
    assert.equal((await signedReq(ctx, lib, 'GET', '/call/cp-long-1', null)).json.endReason, 'max_duration');

    await createCall(ctx, lib, 'cp-cancel-1');
    const r = await signedReq(ctx, lib, 'POST', '/call/cp-cancel-1/cancel', null);
    assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true });
    await settle();
    assert.equal(hangups(ctx).length, 3);
    assert.equal(hangups(ctx).at(-1).form.get('Status'), 'completed');
    g = await signedReq(ctx, lib, 'GET', '/call/cp-cancel-1', null);
    assert.equal(g.json.state, 'canceled'); assert.equal(g.json.ended, true);
    assert.equal((await twilioStatus(ctx, lib, 'cp-cancel-1', { CallSid: CALL_SID, CallStatus: 'completed', CallDuration: '3' })).status, 204);
    assert.equal((await signedReq(ctx, lib, 'GET', '/call/cp-cancel-1', null)).json.state, 'canceled', 'الإلغاء نهائيّ');
    const late = fakeNetSocket();
    await ctx.relay.upgrade({ url: '/stream/cp-cancel-1', headers: {} }, late, Buffer.alloc(0));
    assert.match(late.written, /^HTTP\/1\.1 404/, 'لا بثّ لمكالمة ملغاة');
    ctx.clock.advance(1);
    assert.equal((await signedReq(ctx, lib, 'POST', '/call/cp-cancel-1/cancel', null)).status, 200, 'الإلغاء المكرّر آمن');
  } finally { await ctx.stop(); }
});

/* ───────── ٣. الحاوية والمصدر ───────── */
test('١٣. الحاوية: أوّل سطر check=skip=all، ASCII، بلا VOLUME، npm ci، كلّ ‎.mjs‎ منسوخ؛ ws مثبّت بإصدار دقيق ومطابق للقفل', () => {
  const docker = fs.readFileSync(path.join(dir, 'Dockerfile'), 'utf8');
  assert.equal(docker.split('\n')[0], '# check=skip=all');
  assert.ok(/^[\x00-\x7F]*$/.test(docker), 'Railway يرفض Dockerfile بحروف غير ASCII بلا سجلّ');
  assert.doesNotMatch(docker, /^\s*VOLUME\b/m);
  assert.match(docker, /^FROM node:22-bookworm-slim$/m);
  assert.match(docker, /^COPY package\.json package-lock\.json \.\/$/m);
  assert.match(docker, /^RUN npm ci --omit=dev\b/m);
  assert.match(docker, /^EXPOSE 8080$/m);
  const copied = (docker.match(/^COPY ([^\n]+) \.\/$/gm) || []).join(' ');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs'))) assert.ok(copied.includes(f), 'الملفّ لن يكون في الصورة: ' + f);

  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'call-relay');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.scripts.start, 'node server.mjs');
  assert.match(pkg.dependencies.ws, /^\d+\.\d+\.\d+$/, 'إصدار دقيق لا نطاق');
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies, 'npm ci يفشل إن خالف القفل package.json');
  assert.equal(lock.packages['node_modules/ws'].version, pkg.dependencies.ws);
});

test('١٤. المصدر: ws كسول (لا استيراد عُلويّ)، لا كتمة فارغة، لا سرّ مكتوب، ولا إقلاع عند الاستيراد', async () => {
  const srv = fs.readFileSync(path.join(dir, 'server.mjs'), 'utf8');
  const lib = fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8');
  const tops = [...(srv + '\n' + lib).matchAll(/^import\s.*?from\s+'([^']+)';?$/gm)].map((m) => m[1]);
  for (const t of tops) assert.ok(t.startsWith('node:') || t === './lib.mjs', 'استيراد عُلويّ: ' + t);
  assert.match(srv, /import\('ws'\)/);
  assert.match(srv, /noServer: true/);
  assert.match(srv, /handleUpgrade\(/);
  for (const [name, src] of [['server.mjs', srv], ['lib.mjs', lib]]) {
    assert.doesNotMatch(src, /catch\s*(\([^)]*\))?\s*\{\s*\}/, 'كتمة فارغة في ' + name);
    assert.doesNotMatch(src, /\bsk-[A-Za-z0-9_-]{20,}|\bAC[0-9a-f]{32}\b|github_pat_|\bghp_[A-Za-z0-9]{20,}/, 'سرّ مكتوب في ' + name);
    assert.doesNotMatch(src, /process\.env\.[A-Z_]*(?:SECRET|KEY|TOKEN)[A-Z_]*\s*\|\|\s*['"`]/, 'بديل سرّيّ منشور في ' + name);
    assert.doesNotMatch(src, /console\.log\([^)]*(?:openaiKey|twilioToken|secret|token)\b/, 'طباعة سرّ في ' + name);
  }
  const mod = await load('server.mjs');
  assert.equal(typeof mod.createRelay, 'function');
  assert.equal(typeof mod.main, 'function');
});
