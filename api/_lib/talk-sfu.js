'use strict';
/* v-talk-room-sfu (قرار المالك: الغرفة المدفوعة يرى فيها الكلّ كاميرا الكلّ، حتّى عشرة): وسيط Cloudflare Realtime SFU لـ«غرفة الربع».
   الغرفة المجّانيّة تبقى على الترحيل عبر صاحب الغرفة كما كانت، والصوت لا يمرّ من هنا أبدًا (مزج صاحب الغرفة كما هو).
   يعمل فقط حين يُضبط المتغيّران CLOUDFLARE_REALTIME_APP_ID وCLOUDFLARE_REALTIME_APP_SECRET (يُقرآن داخل النداء، ولا يصلان المتصفّح
   ولا يُطبعان). بدونهما، أو عند أيّ عطل من Cloudflare، تعود الصفحة إلى الترحيل القديم بصمت.

   عبر act في talk-room.js (POST /api/system?action=room). الهويّة بلا تخزين جديد:
     صاحب الغرفة { code, key } (العضو 'host')، والضيف { code, id, s } حيث s = HMAC(room.k, 'sfu|code|id') يأخذه من admit.
     sfu-on    {auth}                          -> { on:false } | { on:true, ice }
     sfu-new   {auth}                          -> { sid, st }        st يربط الجلسة بصاحبها: كلّ نداء بعدها يقدّمه
     sfu-push  {auth, sid, st, offer, mid, g?} -> { answer, tn }     اسم المسار يفرضه الخادم (ختم الغرفة + العضو + الجيل g، ٠..٩٩٩٩)
     sfu-pull  {auth, sid, st, tracks:[{sid, tn}]} -> { renegotiate, offer?, tracks:[{mid, tn, sid} | {tn, sid, error}] }
     sfu-reneg {auth, sid, st, answer}         -> { ok }
     sfu-close {auth, sid, st, mids:[…]}       -> { ok }
     sfu-gone  {code, key, id}                 -> { ok }              صاحب الغرفة وحده: علامة طرد ربع ساعة تمنع الضيف
   كلّ نداء يعيد قراءة الغرفة ويرفض المجّانيّة (403 free). خطأ Cloudflare = 502 { error:'sfu' } بلا نصّه. */
const crypto = require('crypto');

const BASE = 'https://rtc.live.cloudflare.com/v1/apps/';
const CF_STUN = { urls: 'stun:stun.cloudflare.com:3478' };
const TIMEOUT_MS = 8000, GONE_TTL = 900, RATE = 600, MAX_TRACKS = 12, MAX_GEN = 9999;
const OPS = ['sfu-on', 'sfu-new', 'sfu-push', 'sfu-pull', 'sfu-reneg', 'sfu-close', 'sfu-gone'];

const roomKey = (code) => 'talk/room/' + code;
const goneKey = (code, id) => 'talk/room/' + code + '/x/' + id;
const isSid = (v) => typeof v === 'string' && /^[0-9a-zA-Z_-]{8,64}$/.test(v);
const isMid = (v) => typeof v === 'string' && /^[0-9a-zA-Z_-]{1,16}$/.test(v);
const isPaid = (room) => !!room && (room.p === 'sub' || room.p === 'own');
const hmac = (k, msg) => crypto.createHmac('sha256', String(k)).update(msg).digest('hex');

/** الضبط من البيئة (أو o.env في الاختبار)، داخل النداء دائمًا. null = الميزة مطفأة. */
function config(o) {
  const env = (o && o.env) || process.env;
  const appId = String((env && env.CLOUDFLARE_REALTIME_APP_ID) || '').trim();
  const secret = String((env && env.CLOUDFLARE_REALTIME_APP_SECRET) || '').trim();
  if (!appId || !secret || !/^[A-Za-z0-9_-]{8,80}$/.test(appId)) return null;
  return { appId, secret, fetch: (o && o.fetch) || globalThis.fetch };
}

/** سرّ الضيف لنداءات SFU — يُعطى في ردّ admit فقط لغرفة مدفوعة والميزة مفعّلة؛ وإلّا null. */
function admitSecret(room, code, id, o) {
  if (!isPaid(room) || !config(o)) return null;
  return hmac(room.k, 'sfu|' + code + '|' + id).slice(0, 32);
}
const sessTag = (room, code, member, sid) => hmac(room.k, 'sess|' + code + '|' + member + '|' + sid).slice(0, 32);
const stampOf = (room, code) => 'r' + hmac(room.k, 'tn|' + code).slice(0, 10);

class SfuError extends Error { constructor() { super('sfu'); this.name = 'SfuError'; } }

/** نداء واحد إلى Cloudflare بمهلة ٨ ثوانٍ تشمل قراءة الجسم. يرمي SfuError وحده (لا نصّ من Cloudflare ولا سرّ). */
async function cf(cfg, method, path, body) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let r, j;
  try {
    const init = { method, headers: { Authorization: 'Bearer ' + cfg.secret, 'Content-Type': 'application/json' }, signal: ac.signal };
    if (body !== undefined) init.body = JSON.stringify(body);
    r = await cfg.fetch(BASE + cfg.appId + '/' + path, init);
    j = await r.json();
  } catch (e) {
    require('./_swallow.js').swallow({ message: e && e.name === 'AbortError' ? 'timeout' : 'network' }, 'talk-sfu:fetch');      // رسالة ثابتة: الخطأ قد يقتبس الطلب
    throw new SfuError();
  } finally { clearTimeout(timer); }
  const code = j && typeof j === 'object' && j.errorCode ? String(j.errorCode) : '';
  if (!r || !r.ok || !j || typeof j !== 'object' || code) {
    require('./_swallow.js').swallow({ message: 'http ' + (r && r.status) + ' ' + code.replace(/[^a-z_]/gi, '').slice(0, 40) }, 'talk-sfu:reply');
    throw new SfuError();
  }
  return j;
}
const tracksOf = (j) => (Array.isArray(j && j.tracks) ? j.tracks : []);
const desc = (j, type, isSdp) => {
  const d = j && j.sessionDescription;
  return d && d.type === type && isSdp(d.sdp) ? d.sdp : null;
};

/* حدّ ٦٠٠ نداء في الدقيقة لكلّ غرفة (عدّاد INCR كـoverRate). عطل العدّاد لا يمنع الكاميرا — الحدّ حماية لا بوّابة. */
async function overRoomRate(K, code, now) {
  try {
    const key = 'rl:talk-sfu:' + code + ':' + Math.floor(now / 60000);
    const n = Number(await K.kvIncr(key));
    if (n === 1) await K.kvExpire(key, 120);
    return n > RATE;
  } catch (e) { require('./_swallow.js').swallow({ message: 'rate counter failed' }, 'talk-sfu:rate'); return false; }
}

const parseRoom = (raw) => {
  if (!raw) return null;
  try { const r = JSON.parse(raw); return r && typeof r === 'object' ? r : null; } catch (e) { return null; /* سجلّ تالف = لا غرفة */ }
};

/** الهويّة: { room, member } أو ردّ رفض. صاحب الغرفة بقراءة واحدة، والضيف بخطّ واحد (الغرفة + علامة الطرد). */
async function authOf(b, K, code, lib) {
  const bad = (error, status) => ({ fail: { status, json: { error } } });
  if (typeof b.key === 'string' && b.key) {
    const room = parseRoom(await K.kvGetRaw(roomKey(code)));
    if (!room) return bad('no-room', 404);
    if (!lib.sameKey(room.k, b.key)) return bad('key', 403);
    return { room, member: 'host' };
  }
  if (!lib.isId(b.id)) return bad('id', 400);
  const out = await K.kvPipeline([['GET', roomKey(code)], ['EXISTS', goneKey(code, b.id)]]);
  const room = parseRoom(out && out[0]);
  if (!room) return bad('no-room', 404);
  if (!lib.sameKey(hmac(room.k, 'sfu|' + code + '|' + b.id).slice(0, 32), b.s)) return bad('key', 403);
  if (Number(out[1]) > 0) return bad('gone', 403);
  return { room, member: b.id };
}

/** عمليّات SFU. يرجع { status, json } أو null إن لم تكن منها.
    o: { env, fetch, now, ice } للاختبار، وlib: { sameKey, isSdp, isId, overRate } من talk-room.js. */
async function sfuAct(b, ip, K, who, o) {
  const op = String((b && b.op) || '');
  if (!OPS.includes(op)) return null;
  const bad = (error, status = 400) => ({ status, json: { error } });
  const ok = (json) => ({ status: 200, json });
  const lib = o.lib;
  if (typeof b.code !== 'string' || !/^\d{4}$/.test(b.code)) return bad('code');
  const code = b.code;
  const cfg = config(o);
  if (!cfg) return op === 'sfu-on' ? ok({ on: false }) : bad('off', 503);

  const auth = await authOf(b, K, code, lib);
  if (auth.fail) return auth.fail;
  const { room, member } = auth;
  if (!isPaid(room)) return bad('free', 403);
  const now = require('./talk-plan.js').nowOf(o);
  if (await overRoomRate(K, code, now)) return bad('slow-down', 429);

  if (op === 'sfu-on') {
    const ice = [CF_STUN];
    // بيانات الترحيل تُعدّ في سقف TURN اليوميّ المشترك بين كلّ الغرف: حدّ op 'ice' نفسه لكلّ عنوان (١٢ في الدقيقة)، وبعده STUN وحده —
    // وإلّا فضيف واحد بستّمئة نداء في الدقيقة يستنفد السقف فتفقد كلّ الغرف الترحيل يومها
    if (lib.overRate && await lib.overRate('ice')) return ok({ on: true, ice });
    try {
      const got = await (o.ice || require('./turn-ice.js').iceServers)(K);
      for (const s of (got && Array.isArray(got.iceServers) ? got.iceServers : [])) if (s && s.username) ice.push(s);      // الترحيل وحده؛ STUN من Cloudflare
    } catch (e) { require('./_swallow.js').swallow({ message: 'ice helper failed' }, 'talk-sfu:ice'); /* STUN وحده يكفي أغلب الشبكات */ }
    return ok({ on: true, ice });
  }
  if (op === 'sfu-gone') {
    if (member !== 'host') return bad('host', 403);
    if (!lib.isId(b.id)) return bad('id');
    await K.kvSetRaw(goneKey(code, b.id), '1', GONE_TTL);
    return ok({ ok: true });
  }
  if (op === 'sfu-new') {
    try {
      const j = await cf(cfg, 'POST', 'sessions/new');
      if (!isSid(j.sessionId)) throw new SfuError();
      return ok({ sid: j.sessionId, st: sessTag(room, code, member, j.sessionId) });
    } catch (e) { return sfuFail(e); }
  }

  // كلّ ما بعده على جلسة قائمة: st يثبت أنّها جلسة هذا العضو
  if (!isSid(b.sid)) return bad('sid');
  if (!lib.sameKey(sessTag(room, code, member, b.sid), b.st)) return bad('session', 403);
  const sess = 'sessions/' + b.sid + '/';
  const stamp = stampOf(room, code);

  try {
    if (op === 'sfu-push') {
      if (!lib.isSdp(b.offer)) return bad('offer');
      if (!isMid(b.mid)) return bad('mid');
      // الجيل g: كلّ دفعة جديدة من العضو (كاميرا أُطفئت ثمّ عادت) باسم جديد في الجلسة نفسها، كمثال Cloudflare الرسميّ (participant-generation-kind)
      const g = b.g === undefined ? 0 : b.g;
      if (!Number.isInteger(g) || g < 0 || g > MAX_GEN) return bad('g');
      const tn = stamp + '-' + member + '-' + g;
      const j = await cf(cfg, 'POST', sess + 'tracks/new', { sessionDescription: { type: 'offer', sdp: b.offer }, tracks: [{ location: 'local', mid: b.mid, trackName: tn }] });
      const answer = desc(j, 'answer', lib.isSdp);
      if (j.requiresImmediateRenegotiation || !answer || tracksOf(j).some((t) => !t || t.errorCode)) throw new SfuError();
      return ok({ answer, tn });
    }
    if (op === 'sfu-pull') {
      const want = Array.isArray(b.tracks) ? b.tracks : null;
      if (!want || want.length < 1 || want.length > MAX_TRACKS) return bad('tracks');
      const shape = new RegExp('^' + stamp + '-(host|[0-9a-f]{12})-\\d{1,4}$');
      for (const t of want) if (!t || !isSid(t.sid) || typeof t.tn !== 'string' || !shape.test(t.tn)) return bad('tracks');      // لا سحب من غرفة أخرى
      if (new Set(want.map((t) => t.sid + '|' + t.tn)).size !== want.length) return bad('tracks');      // المسار نفسه مرّتين: ضعف النقل، والمطابقة تعطي الاثنين mid واحدًا
      const j = await cf(cfg, 'POST', sess + 'tracks/new', { tracks: want.map((t) => ({ location: 'remote', sessionId: t.sid, trackName: t.tn })) });
      const renegotiate = !!j.requiresImmediateRenegotiation;
      const offer = renegotiate ? desc(j, 'offer', lib.isSdp) : null;
      if (renegotiate && !offer) throw new SfuError();
      const got = tracksOf(j);
      const tracks = want.map((t, i) => {
        // بالاسم والجلسة؛ والموضع بديلٌ فقط لعنصر بلا اسم (عنصر باسم مسار آخر لا يُنسب لهذا العضو)
        const g = got.find((x) => x && x.trackName === t.tn && (!x.sessionId || x.sessionId === t.sid)) || (got[i] && !got[i].trackName ? got[i] : null);
        return g && !g.errorCode && isMid(g.mid) ? { mid: g.mid, tn: t.tn, sid: t.sid } : { tn: t.tn, sid: t.sid, error: 'sfu' };
      });
      return ok(renegotiate ? { renegotiate, offer, tracks } : { renegotiate, tracks });
    }
    if (op === 'sfu-reneg') {
      if (!lib.isSdp(b.answer)) return bad('answer');
      await cf(cfg, 'PUT', sess + 'renegotiate', { sessionDescription: { type: 'answer', sdp: b.answer } });
      return ok({ ok: true });
    }
    // sfu-close
    const mids = Array.isArray(b.mids) ? b.mids : null;
    if (!mids || mids.length < 1 || mids.length > MAX_TRACKS || !mids.every(isMid)) return bad('mids');
    const j = await cf(cfg, 'PUT', sess + 'tracks/close', { tracks: mids.map((mid) => ({ mid })), force: true });
    if (tracksOf(j).some((t) => t && t.errorCode && t.errorCode !== 'close_track_error')) throw new SfuError();      // مسار مغلق أصلًا ليس فشلًا
    return ok({ ok: true });
  } catch (e) { return sfuFail(e); }
}

/** عطل Cloudflare = 502 sfu بلا نصّه؛ وما سواه (عطل برمجيّ) يُرمى كما هو للمعالج. */
function sfuFail(e) {
  if (e instanceof SfuError) return { status: 502, json: { error: 'sfu' } };
  throw e;
}

module.exports = { sfuAct, admitSecret, OPS, TIMEOUT_MS, RATE, MAX_TRACKS, MAX_GEN };
