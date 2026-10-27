// call-relay/server.mjs — v-call-agent: مرحّل المكالمات الهاتفيّة (Railway). node:http بلا إطار، وws يُحمَّل كسولًا.
//
// المسار: Vercel (call-start، للمالك وحده) → POST /call موقّعًا → Twilio يطلب الرقم بـTwiML فيه <Connect><Stream> →
// حين يردّ الطرف الآخر يفتح Twilio المقبس /stream/<callId> هنا → نتحقّق من رمز المكالمة في start ونفتح جلسة الصوت
// الحيّ (wss) ونرسل session.update بالجلسة التي بناها Vercel → صوت الخطّ ⇄ صوت الوكيل (μ-law في الاتّجاهين بلا تحويل)،
// والمقاطعة: كلام الطرف الآخر يمسح صوت الوكيل عند Twilio (clear) ويلغي ردّه → report_outcome يُحفظ، وend_call يُغلق
// الخطّ بعد انتهاء صوت الوداع → Vercel يقرأ GET /call/<id> كلّ ثانيتين.
//
// لا تسجيل صوت، ولا سرّ في السجلّ ولا في /health، والرقم يُكتب مُخفًى فقط. كلّ مقبس له معالج خطأ، وكلّ معالج في
// try/catch: مكالمة معطوبة لا تُسقط العمليّة ولا مكالمة أخرى. الحقن (fetch، WebSocket، الساعة، المؤقّتات، ws نفسه)
// يجعل كلّ هذا يُختبر بلا شبكة (tests/call-relay.test.cjs). الإقلاع في main() فقط حين يُشغَّل الملفّ مباشرة.
'use strict';

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as L from './lib.mjs';

const AGENT_WS = 'wss://api.openai.com/v1/realtime?model=';
/* رسالة نظام للوكيل حين يصمت الخطّ ٤٠ ث (لا تُعرض لأحد) — الوداع بلغة المكالمة، ثمّ النتيجة إن لم تُسجَّل، ثمّ end_call */
const IDLE_BYE = 'No one has spoken on the line for a long time. Say one short, polite goodbye in the language of this call. '
  + 'If you have not called report_outcome yet, call it with status "no_answer". Then call end_call.';
const TWILIO_API = 'https://api.twilio.com/2010-04-01/Accounts/';

const OPEN = 1;
const isOpen = (s) => !!s && s.readyState === OPEN;
function textOf(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data)).toString('utf8');
  if (data && (Buffer.isBuffer(data) || data instanceof Uint8Array)) return Buffer.from(data).toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data.map((d) => Buffer.from(d))).toString('utf8');
  return '';
}

export function createRelay(opts) {
  const o = opts || {};
  const cfg = Object.assign(L.configFromEnv({}), o.config || {});
  const fetchImpl = o.fetch || ((...a) => globalThis.fetch(...a));
  const now = o.now || Date.now;
  const T = o.timers || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h) };
  const redact = L.createRedactor([cfg.openaiKey, cfg.twilioToken, cfg.secret, cfg.twilioSid]);
  const sink = o.log || ((line) => console.log(line));
  const log = (msg) => {
    try { sink('[call-relay] ' + redact(msg)); } catch (e) { /* سجلّ معطوب لا يوقف مكالمة */ }
  };
  const loadWs = o.loadWs || (() => import('ws'));
  const store = o.store || L.createStore({ dir: cfg.stateDir, now, log });
  const live = new Map();        // callId → { token, session, model, bridge, safety }  (ذاكرة فقط، لا قرص)
  const finalizers = new Map();  // callId → مؤقّت الختم إن لم يصل «completed»
  const seenSigs = new Map();    // توقيع POST → انتهاؤه (منع إعادة الإرسال داخل نافذة الدقيقة)
  const limbo = new Set();       // مقابس فُتحت ولم ترسل start صالحًا بعد — لا تحجز مكالمتها
  let wsMod = null, wss = null;

  function json(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  }
  /** ردّ قبل قراءة الجسم: الاتّصال يُغلق بعده فلا يُنتظر جسم لن نقرأه. */
  function early(res, code, obj) {
    res.setHeader('Connection', 'close');
    return json(res, code, obj);
  }
  const declared = (req) => Number((req.headers || {})['content-length']) || 0;
  async function readRaw(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const ch of req) {
      size += ch.length;
      if (size > limit) throw Object.assign(new Error('body too large'), { code: 413 });
      chunks.push(ch);
    }
    return Buffer.concat(chunks);
  }

  function health() {
    const r = L.readiness(cfg);
    return { ok: true, calls: store.active(), twilio: r.twilio, openai: r.openai, publicUrl: r.publicUrl, signing: r.signing };
  }

  /* ───────── Twilio REST ───────── */
  async function twilioApi(path, form) {
    const url = TWILIO_API + encodeURIComponent(cfg.twilioSid) + '/' + path;
    /* ٨ ث لا ١٥: Vercel ينتظر ردّنا ١٥ ث؛ لو تساوت المهلتان لاستسلم Vercel أوّلًا وخرجت مكالمة لا يراها التطبيق ولا يلغيها */
    const ac = new AbortController();
    const timer = T.setTimeout(() => ac.abort(), L.LIMITS.twilioMs);
    try {
      const r = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(cfg.twilioSid + ':' + cfg.twilioToken).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: ac.signal,
      });
      const data = L.parseJson(await r.text()) || {};
      if (!r.ok) log('twilio ' + path.split('/')[0] + ' -> ' + r.status + ' ' + (data.code || '') + ' ' + L.clip(data.message, 160));
      return { ok: !!r.ok, status: r.status, code: Number(data.code) || 0, data };
    } catch (e) {
      log('twilio request failed: ' + L.clip(e && e.message, 160));
      return { ok: false, status: 0, code: 0, data: {} };
    } finally {
      T.clearTimeout(timer);
    }
  }

  /* ───────── دورة حياة المكالمة ───────── */
  function dropLive(id) {
    const lv = live.get(id);
    if (lv) {
      if (lv.safety) T.clearTimeout(lv.safety);
      redact.remove(lv.token);
      live.delete(id);
    }
    const f = finalizers.get(id);
    if (f) { T.clearTimeout(f); finalizers.delete(id); }
  }
  function scheduleFinalize(id) {
    if (finalizers.has(id)) return;
    finalizers.set(id, T.setTimeout(() => {
      finalizers.delete(id);
      const c = store.get(id);
      if (c && !L.TERMINAL.has(c.state)) {
        L.applyState(c, c.answeredAt ? 'completed' : 'failed', now());
        store.put(c);
        log('call ' + id + ' sealed as ' + c.state + ' (no final callback)');
      }
      dropLive(id);
    }, L.LIMITS.finalizeMs));
  }
  function onBridgeClosed(id, reason) {
    const c = store.get(id);
    if (c) { if (!c.endReason) c.endReason = reason; c.updatedAt = now(); store.put(c); }
    const lv = live.get(id);
    if (lv) lv.session = null;           // تعليمات المكالمة لا تبقى في الذاكرة بعدها
    if (c && L.TERMINAL.has(c.state)) dropLive(id);
    else scheduleFinalize(id);
  }
  /** يُنهي الخطّ عبر Twilio REST ثمّ يغلق المقبسين. مرّة واحدة لكلّ مكالمة. */
  async function hangup(id, reason) {
    const c = store.get(id);
    if (!c) return;
    const lv = live.get(id);
    if (c.hangupRequested) { if (lv && lv.bridge && !lv.bridge.closed) lv.bridge.close(reason); return; }
    c.hangupRequested = true;
    if (!c.endReason) c.endReason = L.clip(reason, 60);
    c.updatedAt = now();
    store.put(c);
    if (c.callSid) {
      const r = await twilioApi('Calls/' + encodeURIComponent(c.callSid) + '.json', new URLSearchParams({ Status: 'completed' }));
      log('hangup ' + id + ' (' + reason + ') -> ' + (r.status || 'network error'));
    }
    if (lv && lv.bridge && !lv.bridge.closed) lv.bridge.close(reason);
    else if (L.TERMINAL.has(c.state)) dropLive(id);   // أُلغيت قبل البثّ: لا شيء ينتظر
    else scheduleFinalize(id);
  }
  function safetyStop(id) {
    const c = store.get(id);
    if (!c || L.TERMINAL.has(c.state)) return;
    log('call ' + id + ' safety timer');
    hangup(id, 'safety_timeout').catch((e) => log('safety hangup failed: ' + L.clip(e && e.message, 120)));
  }

  /* ───────── المسارات ───────── */
  async function onCreate(body) {
    const r = L.readiness(cfg);
    const need = r.missing.filter((n) => n !== 'CALL_RELAY_SECRET');
    if (need.length) return [503, { error: 'not_configured', missing: need }];
    const callId = String(body.callId || '');
    if (!L.CALL_ID_RE.test(callId)) return [400, { error: 'bad_request', field: 'callId' }];
    const ph = L.checkUaePhone(body.to);
    if (!ph.ok) return [400, { error: 'bad_phone', why: ph.why }];
    if (!body.session || typeof body.session !== 'object' || Array.isArray(body.session)) return [400, { error: 'bad_request', field: 'session' }];
    if (!L.withinDubaiHours(now())) return [403, { error: 'outside_hours' }];
    if (store.get(callId)) return [409, { error: 'exists' }];
    if (store.active() >= L.LIMITS.maxActive) return [409, { error: 'busy' }];

    const maxSec = L.clampSec(body.maxSec);
    const prepared = L.prepareSession(body.session, { model: cfg.model, voice: cfg.voice });
    const token = randomBytes(24).toString('base64url');
    redact.add(token);
    const call = store.put(L.newCall({ callId, phoneMasked: L.maskPhone(ph.e164), kind: ph.kind, maxSec, now: now() }));
    live.set(callId, {
      token, session: prepared.session, model: prepared.model, bridge: null,
      safety: T.setTimeout(() => safetyStop(callId), maxSec * 1000 + L.LIMITS.callSafetyExtraMs),
    });
    log('call ' + callId + ' -> ' + call.phoneMasked + ' (' + ph.kind + ', ' + maxSec + 's)');

    const form = new URLSearchParams();
    form.set('To', ph.e164);
    form.set('From', cfg.twilioFrom);
    form.set('Twiml', L.streamTwiml({ wsUrl: L.streamUrl(cfg.publicUrl, callId), token }));
    form.set('TimeLimit', String(maxSec));
    form.set('Timeout', String(L.LIMITS.ringSec));
    form.set('Record', 'false');
    form.set('StatusCallback', L.statusUrl(cfg.publicUrl, callId));
    form.set('StatusCallbackMethod', 'POST');
    for (const ev of ['initiated', 'ringing', 'answered', 'completed']) form.append('StatusCallbackEvent', ev);
    const tw = await twilioApi('Calls.json', form);
    if (!tw.ok) {
      L.applyState(call, 'failed', now());
      call.endReason = 'twilio_' + (tw.code || tw.status || 'network');
      store.put(call);
      dropLive(callId);
      return [502, { error: 'twilio', status: tw.status, code: tw.code }];
    }
    if (tw.data && tw.data.sid && !call.callSid) call.callSid = String(tw.data.sid);
    store.put(call);
    if (call.cancelRequested) await hangup(callId, 'canceled');
    return [202, { callId, state: 'queued' }];
  }
  function onGet(id) {
    const c = store.get(id);
    return c ? [200, L.publicView(c, now())] : [404, { error: 'not_found' }];
  }
  async function onCancel(id) {
    const c = store.get(id);
    if (!c) return [404, { error: 'not_found' }];
    if (L.TERMINAL.has(c.state)) return [200, { ok: true }];
    c.cancelRequested = true;
    if (!c.endReason) c.endReason = 'canceled';
    const sid = c.callSid;
    L.applyState(c, 'canceled', now());
    store.put(c);
    if (sid) await hangup(id, 'canceled');   // بلا CallSid بعد: onCreate يُنهيها حين يعود Twilio
    log('cancel ' + id);
    return [200, { ok: true }];
  }
  async function onStatus(req, res, url, id) {
    if (!cfg.twilioToken || !cfg.publicUrl) return early(res, 503, { error: 'not_configured' });
    if (!req.headers['x-twilio-signature']) { log('status ' + id + ': no signature'); return early(res, 403, { error: 'forbidden' }); }
    if (declared(req) > L.LIMITS.formBytes) return early(res, 413, { error: 'too_large' });
    const raw = await readRaw(req, L.LIMITS.formBytes);
    const params = new URLSearchParams(raw.toString('utf8'));
    const full = cfg.publicUrl + url.pathname + url.search;
    if (!L.verifyTwilio(cfg.twilioToken, req.headers['x-twilio-signature'], full, params)) {
      log('status ' + id + ': bad signature');
      return json(res, 403, { error: 'forbidden' });
    }
    const c = store.get(id);
    const sid = params.get('CallSid') || '';
    if (c && !(c.callSid && sid && sid !== c.callSid)) {
      if (!c.callSid && sid) c.callSid = sid;
      const changed = L.applyState(c, params.get('CallStatus'), now());
      if (params.has('CallDuration')) {
        const d = Number(params.get('CallDuration'));
        if (Number.isFinite(d) && d >= 0) c.durationSec = Math.round(d);
      }
      store.put(c);
      if (changed) log('status ' + id + ' -> ' + c.state);
      if (L.TERMINAL.has(c.state)) {
        const lv = live.get(id);
        if (lv && lv.bridge && !lv.bridge.closed) lv.bridge.close('call_' + c.state);
        else dropLive(id);
      }
    }
    res.writeHead(204);
    res.end();
  }
  async function signed(req, res, url, fn) {
    const refused = (send, why) => {
      log('refused ' + req.method + ' ' + url.pathname + ': ' + why);
      return why === 'not_configured'
        ? send(res, 503, { error: 'not_configured', missing: ['CALL_RELAY_SECRET'] })
        : send(res, 401, { error: 'unauthorized', why });
    };
    /* الرؤوس أوّلًا (الطابع والتوقيع والنافذة والحجم المعلن): العنوان عامّ، فطلب بلا توقيع لا يُحجز له جسم في الذاكرة */
    const pre = L.precheckRelay({ secret: cfg.secret, ts: req.headers['x-call-ts'], sig: req.headers['x-call-sig'], now: now() });
    if (!pre.ok) return refused(early, pre.why);
    if (declared(req) > L.LIMITS.bodyBytes) return early(res, 413, { error: 'too_large' });
    const raw = await readRaw(req, L.LIMITS.bodyBytes);
    const v = L.verifyRelay({
      secret: cfg.secret, ts: req.headers['x-call-ts'], sig: req.headers['x-call-sig'],
      method: req.method, path: url.pathname, rawBody: raw, now: now(),
    });
    if (!v.ok) return refused(json, v.why);
    if (req.method === 'POST') {
      const t = now();
      for (const [k, exp] of seenSigs) if (exp < t) seenSigs.delete(k);
      const sig = String(req.headers['x-call-sig']).toLowerCase();
      if (seenSigs.has(sig)) { log('refused replay ' + url.pathname); return json(res, 401, { error: 'unauthorized', why: 'replay' }); }
      seenSigs.set(sig, t + 2 * L.LIMITS.skewMs);
    }
    let body = {};
    if (raw.length) {
      body = L.parseJson(raw.toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'bad_json' });
    }
    const [code, obj] = await fn(body);
    return json(res, code, obj);
  }

  async function handle(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://relay.local');
      const p = url.pathname;
      let m;
      if ((req.method === 'GET' || req.method === 'HEAD') && p === '/health') return json(res, 200, health());
      if (req.method === 'POST' && p === '/call') return await signed(req, res, url, onCreate);
      if (req.method === 'GET' && (m = /^\/call\/([A-Za-z0-9_-]{6,64})$/.exec(p))) return await signed(req, res, url, () => onGet(m[1]));
      if (req.method === 'POST' && (m = /^\/call\/([A-Za-z0-9_-]{6,64})\/cancel$/.exec(p))) return await signed(req, res, url, () => onCancel(m[1]));
      if (req.method === 'POST' && (m = /^\/twilio\/status\/([A-Za-z0-9_-]{6,64})$/.exec(p))) return await onStatus(req, res, url, m[1]);
      return json(res, 404, { error: 'not_found' });
    } catch (e) {
      const big = e && e.code === 413;
      if (!big) log('http error: ' + L.clip(e && e.message, 160));
      if (!res.headersSent) {
        if (big) res.setHeader('Connection', 'close');
        json(res, big ? 413 : 500, { error: big ? 'too_large' : 'internal' });
      }
    }
  }

  /* ───────── ترقية المقبس (/stream/<callId> وحده؛ كلّ ما عداه 404) ───────── */
  function refuse(socket, code) {
    const text = { 404: 'Not Found', 500: 'Internal Server Error', 503: 'Service Unavailable' }[code] || 'Error';
    try { socket.write('HTTP/1.1 ' + code + ' ' + text + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); } catch (e) { /* المقبس أُغلق أصلًا */ }
    try { socket.destroy(); } catch (e) { /* المقبس أُغلق أصلًا */ }
  }
  async function upgrade(req, socket, head) {
    if (socket && typeof socket.on === 'function') socket.on('error', (e) => log('upgrade socket error: ' + L.clip(e && e.message, 120)));
    try {
      const url = new URL(req.url || '/', 'http://relay.local');
      const m = /^\/stream\/([A-Za-z0-9_-]{6,64})$/.exec(url.pathname);
      const id = m ? m[1] : '';
      const c = id ? store.get(id) : null;
      const lv = id ? live.get(id) : null;
      if (!c || !lv || lv.bridge || L.TERMINAL.has(c.state)) return refuse(socket, 404);
      /* توقيع المصافحة إرشاديّ: صيغته لمقابس Media Streams غير موثّقة كاملًا، فيُسجَّل ولا يرفض. الحارس الفعليّ رمز
         المكالمة في start (عشوائيّ ٢٤ بايتًا، لا يعرفه إلّا Twilio عبر TwiML). */
      if (cfg.twilioToken && cfg.publicUrl) {
        const sig = req.headers && req.headers['x-twilio-signature'];
        const ok = !!sig && (L.verifyTwilio(cfg.twilioToken, sig, L.streamUrl(cfg.publicUrl, id), {})
          || L.verifyTwilio(cfg.twilioToken, sig, cfg.publicUrl + url.pathname, {}));
        log('stream ' + id + ' handshake signature: ' + (sig ? (ok ? 'ok' : 'mismatch') : 'absent'));
      }
      if (!wsMod) {
        try { wsMod = await loadWs(); } catch (e) { log('ws module unavailable: ' + L.clip(e && e.message, 120)); return refuse(socket, 503); }
      }
      if (!wss) {
        const WSS = wsMod.WebSocketServer || (wsMod.default && wsMod.default.WebSocketServer);
        wss = new WSS({ noServer: true, maxPayload: 1 << 20 });
      }
      wss.handleUpgrade(req, socket, head, (ws) => attachStream(ws, id));
    } catch (e) {
      log('upgrade failed: ' + L.clip(e && e.message, 160));
      refuse(socket, 500);
    }
  }

  function agentSocketCtor() {
    return o.WebSocket || (wsMod && (wsMod.WebSocket || wsMod.default)) || globalThis.WebSocket;
  }

  /** يستقبل مقبس Twilio لمكالمته. يعيد الجسر أو null (ويغلق المقبس) إن لم تكن المكالمة تنتظر بثًّا. الجسر لا يُربط
      بالمكالمة (lv.bridge) إلّا بعد start برمزها: مقبس سبق Twilio ولم يرسل رمزًا لا يحجز مكانها ولا يُنهيها. */
  function attachStream(ws, id) {
    const c = store.get(id);
    const lv = live.get(id);
    if (!c || !lv || lv.bridge || L.TERMINAL.has(c.state)) {
      try { ws.close(1008); } catch (e) { /* مغلق أصلًا */ }
      return null;
    }
    return createBridge(id, ws, lv);
  }

  /* ───────── الجسر: خطّ واحد ⇄ جلسة صوت حيّ واحدة ───────── */
  function createBridge(id, tw, lv) {
    const call = store.get(id);
    const timers = new Set();
    const pending = [];             // صوت الخطّ قبل جاهزيّة الجلسة
    const marks = new Set();
    const toolNames = new Map();    // call_id → اسم الأداة (احتياط إن غاب الاسم عن حدث الوسائط)
    const handledTools = new Set();
    let streamSid = '', started = false, closed = false;
    let agent = null, agentOpen = false;
    let calleeSpoke = false, opened = false, openerDue = false;
    let responseActive = false, needResponse = false;
    let itemId = '', itemMs = 0, itemStartAt = 0, playhead = 0, audioSinceMark = false, markSeq = 0;
    let hangupPending = false, hangupScheduled = false, stopping = false, graceTimer = null;

    const guard = (fn, where) => (...a) => {
      try { return fn(...a); } catch (e) { log('bridge ' + id + ' ' + where + ': ' + L.clip(e && e.message, 160)); return undefined; }
    };
    const later = (fn, ms) => {
      const h = T.setTimeout(() => { timers.delete(h); guard(fn, 'timer')(); }, ms);
      timers.add(h);
      return h;
    };
    const cancel = (h) => { if (h) { T.clearTimeout(h); timers.delete(h); } };
    const on = (sock, type, fn) => {
      const g = guard(fn, type);
      if (typeof sock.addEventListener === 'function') sock.addEventListener(type, (ev) => g(type === 'message' ? ev && ev.data : ev));
      else if (typeof sock.on === 'function') sock.on(type, g);
    };
    const sendLine = (obj) => {
      if (closed || !isOpen(tw)) return;
      try { tw.send(JSON.stringify(obj)); } catch (e) { log('line send failed: ' + L.clip(e && e.message, 120)); }
    };
    const sendAgent = (obj) => {
      if (!agentOpen || !isOpen(agent)) return;
      try { agent.send(JSON.stringify(obj)); } catch (e) { log('agent send failed: ' + L.clip(e && e.message, 120)); }
    };
    const closeSock = (s, code) => {
      if (!s) return;
      try { if (s.readyState === 0 || s.readyState === OPEN) s.close(code || 1000); } catch (e) { /* مغلق أصلًا */ }
    };

    const startTimer = later(() => { if (!started) { log('stream ' + id + ': no valid start in time'); close('no_start', 1008); } }, L.LIMITS.startTimeoutMs);
    let idleTimer = null, idleEnding = false;
    const cutItems = new Set(), cutResps = new Set();   // عناصر وردود قطعتها المقاطعة: بقاياها المتأخّرة لا تصل الخطّ
    const lineOfItem = new Map();                       // v-call-agent-cut: عنصر ← { line, cut } — سطره يُعلَّم « …» إن قُطع صوته
    const itemEnd = new Map(), cutShown = new Set();    // نهاية صوت كلّ عنصر على الخطّ، وما قُطع صوته وهو يُسمع فعلًا (المسموع كلّه لا يُعلَّم)
    let respId = '';

    on(tw, 'message', (data) => onLine(textOf(data)));
    on(tw, 'close', () => { if (!closed) { log('stream ' + id + ' closed by the line'); close('line_closed'); } });
    on(tw, 'error', (e) => log('stream ' + id + ' error: ' + L.clip(e && (e.message || (e.error && e.error.message)), 120)));

    function onLine(text) {
      const m = L.twilioEvent(text);
      if (m.kind === 'start') return onStart(m);
      if (!started) return;
      if (m.kind === 'media') {
        if (agentOpen) sendAgent(L.appendAudio(m.payload));
        else if (pending.length < L.LIMITS.preOpenFrames) pending.push(m.payload);
        return;
      }
      if (m.kind === 'mark') { marks.delete(m.name); maybeHangup(); return; }
      if (m.kind === 'stop') { log('stream ' + id + ' stop'); close('line_stop'); }
    }
    function onStart(m) {
      if (started) return;
      if (!m.streamSid || !L.safeEqual(m.token, lv.token)) {
        log('stream ' + id + ': bad token');
        close('bad_token', 1008);
        return;
      }
      if (live.get(id) !== lv || lv.bridge || L.TERMINAL.has(call.state)) {
        log('stream ' + id + ': call is not waiting for a stream');
        close('not_waiting', 1008);
        return;
      }
      lv.bridge = api;
      limbo.delete(api);
      started = true;
      cancel(startTimer);
      streamSid = m.streamSid;
      if (!call.callSid && m.callSid) call.callSid = m.callSid;
      L.applyState(call, 'in-progress', now());
      store.put(call);
      log('stream ' + id + ' started');
      later(() => stop('max_duration'), call.maxSec * 1000 + L.LIMITS.hardStopExtraMs);
      later(openerFire, L.LIMITS.openerMs);
      armIdle();
      connectAgent();
    }
    function connectAgent() {
      const Ctor = agentSocketCtor();
      if (!Ctor) { log('no websocket client'); return fail('agent_unavailable'); }
      try {
        agent = new Ctor(AGENT_WS + encodeURIComponent(lv.model), { headers: { Authorization: 'Bearer ' + cfg.openaiKey } });
      } catch (e) {
        log('agent connect failed: ' + L.clip(e && e.message, 120));
        return fail('agent_unavailable');
      }
      const ct = later(() => { if (!agentOpen) { log('agent connect timeout'); fail('agent_unavailable'); } }, L.LIMITS.agentConnectMs);
      on(agent, 'open', () => {
        cancel(ct);
        if (closed) { closeSock(agent); return; }
        agentOpen = true;
        sendAgent({ type: 'session.update', session: lv.session });
        for (const p of pending.splice(0)) sendAgent(L.appendAudio(p));
        if (openerDue) sendOpener();
      });
      on(agent, 'message', (data) => onAgent(textOf(data)));
      on(agent, 'close', (ev) => {
        agentOpen = false;
        if (!closed) { log('agent socket closed (' + ((ev && ev.code) || '?') + ')'); fail('agent_disconnected'); }
      });
      on(agent, 'error', (e) => log('agent socket error: ' + L.clip(e && (e.message || (e.error && e.error.message)), 120)));
    }
    function openerFire() { if (calleeSpoke || opened) return; if (agentOpen) sendOpener(); else openerDue = true; }
    function sendOpener() {
      openerDue = false;
      if (opened || calleeSpoke) return;
      opened = true;
      sendAgent({ type: 'response.create' });
    }
    /** صمت الخطّ: يُعاد العدّ مع كلّ كلام من الطرف الآخر وكلّ صوت من الوكيل (من نهاية تشغيله المقدّرة). */
    function armIdle() {
      if (idleEnding || closed) return;
      cancel(idleTimer);
      idleTimer = later(onIdle, Math.max(0, playhead - now()) + L.LIMITS.idleMs);
    }
    /** ٤٠ ث بلا كلام ولا صوت بعد الردّ ⇒ النتيجة no_answer، ويُطلب من الوكيل وداع قصير ثمّ end_call، وإلّا يُغلق بعد المهلة القصوى. */
    function onIdle() {
      idleTimer = null;
      if (closed || stopping || hangupPending || idleEnding) return;
      idleEnding = true;
      log('stream ' + id + ': no speech for ' + Math.round(L.LIMITS.idleMs / 1000) + 's, ending');
      if (!call.endReason) call.endReason = 'no_speech';
      if (!call.outcome) call.outcome = L.fallbackOutcome({ state: 'completed', answeredAt: call.answeredAt, endReason: 'no_speech' });
      call.updatedAt = now();
      store.put(call);
      if (!agentOpen) { stop('no_speech'); return; }
      sendAgent({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: IDLE_BYE }] } });
      if (responseActive) needResponse = true; else sendAgent({ type: 'response.create' });
      later(() => stop('no_speech'), L.LIMITS.endCapMs);
    }
    function sendMark() {
      if (!audioSinceMark || !streamSid) return;
      audioSinceMark = false;
      const name = 'r' + (++markSeq);
      marks.add(name);
      sendLine(L.twilioMark(streamSid, name));
    }
    function addLine(who, text, cut) {
      const t = cut ? cutText(text) : L.clip(text, L.LIMITS.lineChars);
      if (!t || call.transcript.length >= L.LIMITS.transcriptLines) return null;
      const line = { who, text: t };
      call.transcript.push(line);
      call.updatedAt = now();
      store.put(call);
      return line;
    }
    /* v-call-agent-cut: نصّ الردّ يصل كاملًا قبل صوته — ما قطعته المقاطعة يُعلَّم فلا توهم البطاقة أنّه قيل كلّه */
    function cutText(text) { const t = L.clip(text, L.LIMITS.lineChars - 2); return t ? t + ' …' : ''; }
    function markCut(id) {
      const e = id && lineOfItem.get(id);
      if (!e || e.cut) return;
      e.cut = true;
      const i = call.transcript.indexOf(e.line);
      if (i < 0) return;
      call.transcript[i] = e.line = { who: e.line.who, text: cutText(e.line.text) };
      call.updatedAt = now();
      store.put(call);
    }
    function onAgentText(ev) {
      const cut = !!((ev.itemId && cutShown.has(ev.itemId)) || (ev.responseId && cutResps.has(ev.responseId)));
      const line = addLine('agent', ev.text, cut);
      if (line && ev.itemId) lineOfItem.set(ev.itemId, { line, cut });
    }
    function onAgent(text) {
      const ev = L.agentEvent(text);
      switch (ev.kind) {
        case 'session': if (ev.type === 'session.created') log('agent session ' + id + ' ready'); return;
        case 'response_created': responseActive = true; opened = true; respId = ev.id; return;
        case 'audio': {
          if (!streamSid) return;
          if ((ev.itemId && cutItems.has(ev.itemId)) || (ev.responseId && cutResps.has(ev.responseId))) return;   // بقايا ردّ مقطوع بعد clear
          const t = now();
          if (ev.itemId !== itemId) { itemId = ev.itemId; itemMs = 0; itemStartAt = Math.max(t, playhead); }
          const ms = L.pcmuMs(ev.delta);
          itemMs += ms;
          playhead = Math.max(playhead, t) + ms;
          for (const [k, end] of itemEnd) if (end <= t) itemEnd.delete(k);
          itemEnd.set(ev.itemId, playhead);
          audioSinceMark = true;
          sendLine(L.twilioMedia(streamSid, ev.delta));
          armIdle();
          if (hangupPending) armGrace();
          return;
        }
        case 'audio_done': sendMark(); return;
        case 'speech_started': onBargeIn(); armIdle(); return;
        case 'agent_text': return onAgentText(ev);
        case 'callee_text': return addLine('callee', ev.text);
        case 'tool_item': if (ev.callId && ev.name) toolNames.set(ev.callId, ev.name); return;
        case 'tool': return onTool(ev);
        case 'response_done':
          responseActive = false;
          sendMark();
          if (needResponse && !hangupPending) { needResponse = false; sendAgent({ type: 'response.create' }); }
          if (hangupPending) armGrace();
          maybeHangup();
          return;
        case 'error': log('agent error ' + L.clip(ev.code, 60) + ': ' + L.clip(ev.message, 160)); return;
        default: return;
      }
    }
    /** الطرف الآخر بدأ يتكلّم: امسح ما في طابور Twilio من صوت الوكيل، وألغِ ردّه، وقصّ عنصره على ما سُمع فعلًا. */
    function onBargeIn() {
      calleeSpoke = true;
      if (hangupPending) return;             // الوداع يُكمَل ثمّ يُغلق الخطّ
      const t = now();
      if (!responseActive && !(playhead > t)) return;
      if (itemId) cutItems.add(itemId);
      for (const [k, end] of itemEnd) if (end > t) { cutShown.add(k); markCut(k); }   // كلّ عنصر ما زال صوته في الطابور (قد يكون اثنين)
      itemEnd.clear();
      if (responseActive && respId) cutResps.add(respId);
      sendLine(L.twilioClear(streamSid));
      if (responseActive) sendAgent({ type: 'response.cancel' });
      if (itemId && itemMs > 0) {
        sendAgent({ type: 'conversation.item.truncate', item_id: itemId, content_index: 0, audio_end_ms: Math.round(Math.max(0, Math.min(itemMs, t - itemStartAt))) });
      }
      playhead = t; itemId = ''; itemMs = 0; audioSinceMark = false;
    }
    function onTool(ev) {
      const name = ev.name || toolNames.get(ev.callId) || '';
      if (!ev.callId || handledTools.has(ev.callId)) return;
      handledTools.add(ev.callId);
      if (name === 'report_outcome') {
        call.outcome = L.cleanOutcome(ev.args);
        call.updatedAt = now();
        store.put(call);
        log('outcome ' + id + ': ' + call.outcome.status);
        sendAgent(L.toolOutput(ev.callId, { ok: true }));
        if (responseActive) needResponse = true; else sendAgent({ type: 'response.create' });
        return;
      }
      if (name === 'end_call') {
        call.agentReason = L.clip(ev.args && ev.args.reason, L.LIMITS.reasonChars);
        if (!call.endReason) call.endReason = 'end_call';
        store.put(call);
        sendAgent(L.toolOutput(ev.callId, { ok: true }));
        hangupPending = true;
        needResponse = false;
        later(() => stop('end_call'), L.LIMITS.endCapMs);
        armGrace();
        maybeHangup();
        return;
      }
      sendAgent(L.toolOutput(ev.callId, { ok: false, error: 'unknown_tool' }));
      if (responseActive) needResponse = true; else sendAgent({ type: 'response.create' });
    }
    /** احتياط إن لم تعد علامة التشغيل: نهاية الصوت المقدّرة + ≤ ٣ ث. */
    function armGrace() {
      cancel(graceTimer);
      graceTimer = later(() => stop('end_call'), Math.max(0, playhead - now()) + L.LIMITS.endGraceMs);
    }
    /** المسار الدقيق: لا ردّ جارٍ، ولا صوت أُرسل بلا علامة، وكلّ العلامات عادت = Twilio شغّل الوداع كاملًا. */
    function maybeHangup() {
      if (!hangupPending || hangupScheduled || responseActive || audioSinceMark || marks.size) return;
      hangupScheduled = true;
      later(() => stop('end_call'), L.LIMITS.markHangupMs);
    }
    function stop(reason) {
      if (stopping || closed) return;
      stopping = true;
      hangup(id, reason)
        .catch((e) => log('hangup failed: ' + L.clip(e && e.message, 120)))
        .finally(() => close(reason));   // hangup يغلق الجسر عادةً؛ هذا إن لم يجده في live
    }
    function fail(reason) {
      if (closed) return;
      log('bridge ' + id + ' failing: ' + reason);
      if (!call.endReason) { call.endReason = reason; store.put(call); }
      stop(reason);
    }
    /** يغلق المقبسين ويوقف كلّ المؤقّتات. قبل start صالح (رمز خاطئ، صمت، انقطاع) = فكّ فقط: المكالمة لم تُربط بهذا
        المقبس أصلًا، فتبقى تنتظر بثّها الحقيقيّ. */
    function close(reason, code) {
      if (closed) return;
      closed = true;
      limbo.delete(api);
      for (const h of timers) T.clearTimeout(h);
      timers.clear();
      agentOpen = false;
      pending.length = 0;
      closeSock(tw, code || 1000);
      closeSock(agent, 1000);
      if (!started) return;
      onBridgeClosed(id, reason);
    }
    const api = {
      close: (reason) => close(reason || 'closed'),
      get closed() { return closed; },
      get streamSid() { return streamSid; },
    };
    limbo.add(api);
    return api;
  }

  function closeAll() {
    for (const b of [...limbo]) b.close('shutdown');
    for (const [, lv] of live) if (lv.bridge) lv.bridge.close('shutdown');
    for (const [id] of live) dropLive(id);
    for (const [, h] of finalizers) T.clearTimeout(h);
    finalizers.clear();
    if (wss) { try { wss.close(); } catch (e) { /* مغلق أصلًا */ } }
  }

  return { handle, upgrade, attachStream, health, hangup, store, live, log, close: closeAll, config: cfg };
}

/* ───────── الإقلاع ───────── */
export async function main(env) {
  const cfg = L.configFromEnv(env || process.env);
  const relay = createRelay({ config: cfg });
  const loaded = await relay.store.load();
  const server = createServer((req, res) => { relay.handle(req, res); });
  server.on('upgrade', (req, socket, head) => { relay.upgrade(req, socket, head); });
  server.on('clientError', (e, socket) => { try { socket.destroy(); } catch (err) { /* مغلق أصلًا */ } });
  const sweep = setInterval(() => { relay.store.sweep().catch((e) => relay.log('sweep failed: ' + L.clip(e && e.message, 120))); }, 3600 * 1000);
  sweep.unref();
  /* مكالمة معطوبة لا تُسقط الأخريات: نسجّل ونبقى. المعالجات كلّها محميّة، وهذا آخر شبكة. */
  process.on('unhandledRejection', (e) => relay.log('unhandled rejection: ' + L.clip(e && (e.stack || e.message || e), 300)));
  process.on('uncaughtException', (e) => relay.log('uncaught exception: ' + L.clip(e && (e.stack || e.message || e), 300)));
  for (const s of ['SIGTERM', 'SIGINT']) {
    process.on(s, () => {
      relay.log('shutting down (' + s + '), active calls: ' + relay.store.active());
      relay.close();
      server.close();
      setTimeout(() => process.exit(0), 1500).unref();
    });
  }
  server.listen(cfg.port, () => {
    const r = L.readiness(cfg);
    relay.log('listening on :' + cfg.port + ' · twilio=' + r.twilio + ' openai=' + r.openai + ' publicUrl=' + r.publicUrl
      + ' signing=' + r.signing + ' · restored ' + loaded + (r.missing.length ? ' · missing: ' + r.missing.join(', ') : ''));
  });
  return { relay, server };
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entry && import.meta.url === entry) main();
