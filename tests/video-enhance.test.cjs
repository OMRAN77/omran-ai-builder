// tests/video-enhance.test.cjs — v-video-enhance-pro (طلب المالك ١٠ أكتوبر: «تحسين احترافي» للفيديو — ترميم عند مزوّد خارجيّ،
// بالنقاط). هذه الدالّة تخصم نقاط المستخدم وتصرف مال المالك، فالاختبار يثبت المال قبل أيّ شيء: الهامش لكلّ طبقة ومدّة وعدد
// إطارات، لا خصم قبل التأكيد، خصم واحد لتأكيدين، ردّ واحد لاستطلاعين، السقف والقاطع، النسخة المثبّتة وحدها تُقاس وتُرسل،
// المهمّة لصاحبها وحده، ولا اسم مزوّد ولا رابط ولا مفتاح في ردّ أو سجلّ. الشبكة وRedis محاكيان كاملًا — لا نداء حقيقيّ.
// ثمّ الواجهة (١٥–١٦): js/video.js الحقيقيّ على هذا المعالج نفسه وعلى ردود مكتوبة — لا خصم قبل التأكيد، وبعده الحالة عند الخادم
// هي الحقيقة، والإلغاء قبل الخصم فقط، والمسار المجّانيّ لا يلمس الشبكة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ENV = ['VIDEO_ENHANCE', 'VIDEO_ENHANCE_TIER', 'VIDEO_ENHANCE_CAP_CENTS', 'VIDEO_ENHANCE_TALL_OK', 'VIDEO_ENHANCE_UNTRIP'];
for (const k of ENV.concat(['OWNER_USERNAMES', 'OWNER_USERNAME'])) delete process.env[k];
process.env.AUTH_SECRET = 'video-enhance-test-secret';
const KEY = 'fal-test-key-7f3a:b1c2d3e4';
process.env.FAL_KEY = KEY;
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// كلّ ما يُكتب في الطرفيّة يُجمع: الروابط والمفتاح لا تظهر في أيّ سجلّ (١٣). للتشخيص: VENH_DEBUG=1 يطبع المجموع أيضًا.
const con = [];
for (const m of ['log', 'warn', 'error']) console[m] = (...a) => { con.push(a.map((x) => (x && x.stack) || String(x)).join(' ')); if (process.env.VENH_DEBUG) process.stderr.write(con[con.length - 1] + '\n'); };

// ── Redis في الذاكرة، بمدد المفاتيح وأعطال تُحقن ──
const kv = new Map();
const ttl = new Map();
// failPipe = النداء لم يصل المخزن · pipeLost = نُفّذ في المخزن وضاع جوابه · pipeNull = أمر أخطأ داخل نداء أجاب (kv.js يرجعه null) · onGet = لحظة قراءة مفتاح
const K = { failGet: null, failSet: null, failIncr: null, failPipe: null, pipeLost: null, pipeNull: null, onGet: null, pipes: [], events: [] };
const down = (what) => { throw new Error('kv down: ' + what); };
const put = (k, v, t) => {
  // كلّ كتابة لمفاتيح الميزة بمدّة صريحة — مفتاح بلا مدّة يبقى للأبد (قفل أبديّ أو مهمّة لا تنتهي).
  if (/^venh:/.test(k)) assert.ok(Number(t) > 0, 'مفتاح بلا مدّة: ' + k);
  kv.set(k, String(v));
  if (t) ttl.set(k, Number(t)); else ttl.delete(k);
};
const arith = (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; };
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => { if (K.onGet) await K.onGet(k); if (K.failGet && K.failGet(k)) down('GET'); return kv.has(k) ? String(kv.get(k)) : null; },
  kvSetRaw: async (k, v, t) => { if (K.failSet && K.failSet(k, String(v))) down('SET'); put(k, v, t); },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  kvSetIfAbsent: async (k, v, t) => {
    await new Promise((r) => setImmediate(r)); // يفسح للنداء المتزامن — السباق حقيقيّ
    if (K.failSet && K.failSet(k, String(v))) down('SETNX');
    if (kv.has(k)) return false;
    put(k, v, t);
    return true;
  },
  kvIncr: async (k) => arith(k, 1),
  kvIncrBy: async (k, n) => { if (K.failIncr && K.failIncr(k)) down('INCRBY'); return arith(k, n); },
  kvDecrBy: async (k, n) => { if (/^points:/.test(k)) K.events.push('points'); return arith(k, -Number(n)); },
  kvDel: async (k) => { kv.delete(k); ttl.delete(k); },
  kvExpire: async (k, s) => { ttl.set(k, Number(s)); },
  kvList: async (p) => [...kv.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => {
    if (K.failPipe && K.failPipe(cmds)) down('PIPELINE');
    K.pipes.push(cmds);
    const out = cmds.map(([op, k, a, flag, sec]) => {
      if (K.pipeNull && K.pipeNull(op, k)) return null;
      if (op === 'INCRBY') { if (/^venh:spent:/.test(k)) K.events.push('cap'); return arith(k, a); }
      if (op === 'DECRBY') return arith(k, -Number(a));
      if (op === 'EXPIRE') { ttl.set(k, Number(a)); return 1; }
      if (op === 'GET') return kv.has(k) ? kv.get(k) : null;
      if (op === 'SET') { assert.equal(flag, 'EX', 'SET في نداء مجمَّع بمدّته'); put(k, a, Number(sec)); return 'OK'; }
      return 1;
    });
    if (K.pipeLost && K.pipeLost(cmds)) down('PIPELINE answer lost');
    return out;
  },
});
const users = new Map();
const A = { banned: new Set(), putFail: false };
const getRec = async (u) => (users.has(u) ? structuredClone(users.get(u)) : null);
mock('api/_lib/auth.js', {
  getUser: getRec,
  getUserOnce: getRec,
  putUser: async (u, r) => { if (A.putFail) throw new Error('put down'); users.set(u, structuredClone(r)); },
  isBanned: async (u) => A.banned.has(u),
  verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async (u) => u === 'vip1' });
const logged = [];
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async (scope, err, meta) => { logged.push({ scope, msg: String(err && err.message), meta }); } });

const points = require(rp('api/_lib/points.js'));
const enh = require(rp('api/_lib/video-enhance.js'));
const token = (u, noExp) => {
  const p = Buffer.from(JSON.stringify(noExp ? { u } : { u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
const bal = async (u) => (await points.readPoints(u)).points;
const today = () => new Date().toISOString().slice(0, 10);
const spent = () => Number(kv.get('venh:spent:' + today()) || 0);
const spentFree = () => Number(kv.get('venh:spentfree:' + today()) || 0);
const tallyKey = (u) => 'db/usage/tally/' + encodeURIComponent(u + '_' + today() + '_video-enhance') + '/' + today();
const jobOf = (id) => JSON.parse(kv.get('venh:' + id));
const setJob = (id, patch) => kv.set('venh:' + id, JSON.stringify(Object.assign(jobOf(id), patch)));

// ── ملفّات MP4 صغيرة: صناديق عليا بحجم ٣٢ بت ونوع ٤ أحرف ──
const box = (type, payload) => { const b = Buffer.alloc(8 + payload.length); b.writeUInt32BE(b.length, 0); b.write(type, 4, 'latin1'); payload.copy(b, 8); return b; };
const FTYP = box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2mp41', 'latin1'));
const MVHD = box('mvhd', Buffer.alloc(100));
const MDAT = box('mdat', crypto.randomBytes(600));
const MP4 = Buffer.concat([FTYP, box('moov', Buffer.concat([MVHD, box('trak', Buffer.alloc(40))])), MDAT]);
const MP4_FRAG = Buffer.concat([FTYP, box('moov', MVHD), box('moof', Buffer.alloc(24)), MDAT]);
const MP4_MVEX = Buffer.concat([FTYP, box('moov', Buffer.concat([MVHD, box('mvex', Buffer.alloc(16))])), MDAT]);
const NO_FTYP = Buffer.concat([box('moov', MVHD), MDAT]);
// جداول أحجام العيّنات: stsz = [نسخة ورايات ٤][حجم ثابت ٤][العدد ٤] · stz2 = [نسخة ورايات ٤][محجوز ٣ + حجم الحقل ١][العدد ٤]
const u32 = (...n) => { const b = Buffer.alloc(4 * n.length); n.forEach((v, i) => b.writeUInt32BE(v, 4 * i)); return b; };
const box64 = (type, payload) => { const b = Buffer.alloc(16 + payload.length); b.writeUInt32BE(1, 0); b.write(type, 4, 'latin1'); b.writeUInt32BE(b.length, 12); payload.copy(b, 16); return b; };
const stsz = (count) => box('stsz', u32(0, 0, count));
const stz2 = (count) => box('stz2', u32(0, 4, count));
const trak = (...tables) => box('trak', box('mdia', box('minf', box('stbl', Buffer.concat(tables)))));
const movie = (...kids) => Buffer.concat([FTYP, box('moov', Buffer.concat([MVHD].concat(kids))), MDAT]);

// ── مزوّد مزيّف بمضيفيه الحقيقيّين: هدف الرفع، التخزين، القياس، الطابور ──
const CDN = 'https://v3.fal.media';
const INITIATE = 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3';
const OUT_URL = CDN + '/files/out/result-SIGNED-7.mp4';
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json' } });
const F = { calls: [], files: new Map(), targets: new Map(), n: 0, r: 0 };
function resetF() {
  Object.assign(F, {
    initFail: 0, initMsg: '', initThrow: false, putFail: 0, rawDelay: 0, onRaw: null,
    media: { duration: 10, frame_count: 300, resolution: { width: 1280, height: 720 } },
    outMedia: { duration: 10, frame_count: 300, resolution: { width: 1920, height: 1080 } },
    metaFail: 0, metaHold: null, submitFail: 0, submitMsg: '', submitThrow: false, submitBody: null, submitDelay: 0,
    state: 'IN_QUEUE', statusFail: 0, statusErr: null, statusDelay: 0, resultPlan: [], result: null, resultThrow: false, resultDelay: 0,
    cancel: () => json({ status: 'CANCELLATION_REQUESTED' }, 202),
  });
}
resetF();
global.fetch = async (url, init) => {
  const u = String(url);
  const o = init || {};
  const method = String(o.method || 'GET').toUpperCase();
  const rec = { method, url: u, headers: o.headers || {}, body: o.body, signal: !!o.signal, kind: '?' };
  F.calls.push(rec);
  if (u === INITIATE && method === 'POST') {
    rec.kind = 'initiate'; rec.json = JSON.parse(o.body);
    if (F.initThrow) throw new Error('getaddrinfo ENOTFOUND while calling https://rest.fal.ai/storage/upload/initiate');
    if (F.initFail) return json({ detail: F.initMsg || 'Bad request' }, F.initFail);
    const n = ++F.n;
    const up = CDN + '/files/upload/' + n + '?X-Signature=UPLOAD-SIG-' + n;
    F.targets.set(up, CDN + '/files/b/' + n + '/' + rec.json.file_name);
    return json({ upload_url: up, file_url: F.targets.get(up) });
  }
  if (F.targets.has(u) && method === 'PUT') {
    rec.kind = 'put';
    if (F.putFail) return new Response('upstream', { status: F.putFail });
    F.files.set(F.targets.get(u), Buffer.from(o.body));
    return new Response('', { status: 200 });
  }
  if (u.startsWith(CDN + '/files/b/') && method === 'GET') {
    rec.kind = 'raw';
    if (F.rawDelay) await sleep(F.rawDelay);
    if (F.onRaw) return F.onRaw(rec);
    if (!F.files.has(u)) return new Response('NoSuchKey', { status: 404 });
    return new Response(F.files.get(u), { status: 200, headers: { 'content-length': String(F.files.get(u).length) } });
  }
  if (u === 'https://fal.run/fal-ai/ffmpeg-api/metadata' && method === 'POST') {
    rec.kind = 'meta'; rec.json = JSON.parse(o.body);
    if (F.metaHold) await F.metaHold; // القياس معلَّق حتّى يُفتح (سباق استطلاعين على نتيجة واحدة)
    if (F.metaFail) return json({ detail: 'metadata unavailable' }, F.metaFail);
    return json({ media: rec.json.media_url === OUT_URL ? F.outMedia : F.media });
  }
  if (u.startsWith('https://queue.fal.run/')) {
    if (method === 'POST') {
      rec.kind = 'submit'; rec.json = JSON.parse(o.body);
      K.events.push('submit');
      if (F.submitDelay) await sleep(F.submitDelay);
      if (F.submitThrow) throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      if (F.submitFail) return json({ detail: F.submitMsg || 'Unprocessable' }, F.submitFail);
      if (F.submitBody) return json(F.submitBody);
      const base = 'https://queue.fal.run/topaz/upscale/requests/req-' + (++F.r) + '-0a1b2c3d';
      return json({ request_id: 'req-' + F.r + '-0a1b2c3d', status_url: base + '/status', response_url: base, cancel_url: base + '/cancel', queue_position: 2 });
    }
    if (method === 'PUT' && u.endsWith('/cancel')) { rec.kind = 'cancel'; return F.cancel(rec); }
    if (method === 'GET' && u.endsWith('/status')) {
      rec.kind = 'status';
      if (F.statusDelay) await sleep(F.statusDelay);
      if (F.statusFail) return new Response('bad gateway', { status: F.statusFail });
      return json(Object.assign({ status: F.state }, F.state === 'IN_QUEUE' ? { queue_position: 2 } : {}, F.statusErr ? { error: F.statusErr } : {}));
    }
    if (method === 'GET') {
      rec.kind = 'result';
      if (F.resultDelay) await sleep(F.resultDelay);
      if (F.resultThrow) throw new Error('socket hang up');
      if (F.resultPlan.length) return F.resultPlan.shift()();
      return F.result ? F.result() : json({ video: { url: OUT_URL, content_type: 'video/mp4' } });
    }
  }
  throw new Error('unexpected fetch ' + method + ' ' + u);
};
const calls = (kind) => F.calls.filter((c) => c.kind === kind);
const authOf = (c) => c.headers.Authorization || c.headers.authorization || '';

// كلّ ردّ يُجمع لفحص التسريب في آخر الملفّ.
const seen = [];
async function call(step, body, tk, o) {
  const opt = o || {};
  const res = { code: 200, j: null, headers: {}, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, setHeader(k, v) { res.headers[String(k).toLowerCase()] = v; return res; }, end() { return res; } };
  const method = opt.method || 'POST';
  const tok = tk === undefined ? token('reem') : tk;
  const req = { method, headers: opt.headers || {}, query: { step }, body: method === 'POST' ? Object.assign({ token: tok }, body) : undefined };
  await enh(req, res);
  let who = '';
  try { who = JSON.parse(Buffer.from(String(opt.who || tok || '').split('.')[0], 'base64url').toString()).u || ''; } catch (e) { who = ''; }
  seen.push({ step, who, code: res.code, j: res.j, headers: res.headers });
  return res;
}
const infoAs = (u) => call('info', null, null, { method: 'GET', headers: u ? { authorization: 'Bearer ' + token(u) } : {}, who: u ? token(u) : '' });

function reset(mode) {
  for (const k of ENV) delete process.env[k];
  if (mode !== null) process.env.VIDEO_ENHANCE = mode || 'on';
  process.env.FAL_KEY = KEY;
  resetF();
  F.calls.length = 0;
  Object.assign(K, { failGet: null, failSet: null, failIncr: null, failPipe: null, pipeLost: null, pipeNull: null, onGet: null });
  K.pipes.length = 0; K.events.length = 0;
  A.putFail = false; A.banned.clear();
  for (const k of [...kv.keys()]) if (/^venh:(trip|spent|spentfree)/.test(k)) kv.delete(k);
}
/** حساب جديد برصيد، بلا عدّ يوميّ ولا مهمّة جارية. */
function fresh(u, pts, extra) {
  users.set(u, Object.assign({ username: u, points: pts === undefined ? 500 : pts }, extra || {}));
  for (const k of ['points:' + u, tallyKey(u), 'venh:open:' + u, 'venh:last:' + u]) kv.delete(k);
}
/** سقف واسع لاختبارات ليس السقف موضوعها (خُمس الألف يكفي ثلاث مهامّ لغير المشتركين). */
const roomy = () => { process.env.VIDEO_ENHANCE_CAP_CENTS = '100000'; };
const sub = (u, pts) => fresh(u, pts, { plan: 'pro', planUpdatedAt: Date.now() - 86400000 });
async function upload(u, o) {
  const opt = o || {};
  const s = await call('start', Object.assign({ size: (opt.bytes || MP4).length, mime: 'video/mp4', name: 'My Holiday Clip.mp4', durationSec: 10 }, opt.start), token(u));
  assert.equal(s.code, 200, 'start: ' + JSON.stringify(s.j));
  if (opt.bytes !== null) F.files.set(F.targets.get(s.j.upload), opt.bytes || MP4); // المتصفّح يرفع إلى الهدف الخام
  return s.j.id;
}
async function quote(u, o) {
  const id = await upload(u, o);
  return { id, q: await call('run', { id }, token(u)) };
}
async function go(u, o) {
  const { id, q } = await quote(u, o);
  assert.equal(q.code, 200, 'quote: ' + JSON.stringify(q.j));
  return { id, q, r: await call('run', { id, confirmed: true, cost: q.j.cost }, token(u)) };
}
/** استطلاع بعد انقضاء مهلة التهدئة (٣ث). */
async function poll(id, u) { kv.delete('venh:poll:' + id); return call('status', { id }, token(u)); }

const proNet = (20 - (20 * 0.029 + 0.30)) / 920; // دولار لكلّ نقطة Pro بعد رسوم الدفع (fair-video)

test('١. السعر والهامش: ٩ نقاط/ث (حدّ ٣ث) افتراضيًّا، وكلّ طبقة ≥ ضعفَي تكلفتنا لكلّ مدّة وكلّ عدد إطارات، و≤ ٤ أضعاف عند ٣٠ إطارًا', () => {
  reset();
  assert.equal(enh.tierKey(), 'fast');
  const fast = enh.TIERS.fast;
  assert.deepEqual([fast.pps, fast.minSec], [9, 3]);
  assert.deepEqual([3, 10, 20, 30].map((s) => fast.pps * enh.billedSec(fast, s, 30 * s)), [27, 90, 180, 270]);
  process.env.VIDEO_ENHANCE_TIER = ' MAX ';
  assert.deepEqual([enh.tierKey(), enh.TIERS.max.pps, enh.TIERS.max.model], ['max', 17, 'Starlight Precise 2.6']);
  for (const bad of ['turbo', '', 'constructor', '__proto__']) { process.env.VIDEO_ENHANCE_TIER = bad; assert.equal(enh.tierKey(), 'fast', bad); }
  delete process.env.VIDEO_ENHANCE_TIER;

  // أمثلة المزوّد المنشورة: ١٠ث بالنموذج السريع ٦ أرصدة، بنماذج الجودة ١٢، وجدول الدقيق ٢ و٨، و4K ‏١٣.
  assert.equal(enh.providerCents('fast', 300, 1920, 1080), 60);
  assert.equal(enh.providerCents('max', 300, 1920, 1080), 120);
  assert.deepEqual([enh.providerCents('precise', 300, 1920, 1080), enh.providerCents('precise', 1800, 1920, 1080)], [20, 80]);
  assert.equal(enh.providerCents('fast', 300, 3840, 2160), 130);
  assert.equal(enh.providerCents('fast', 600, 1920, 1080), 120, 'ضعف الإطارات = ضعف التكلفة');

  const want = { fast: ['2.49', 36, 30], precise: ['2.08', 20, 20], max: ['2.36', 34, 30] }; // أسوأ هامش، نقاطه، سنتاته
  for (const [k, t] of Object.entries(enh.TIERS)) {
    let worst = { m: Infinity };
    let top = 0;
    for (let i = 10; i <= 3010; i++) { // ٠٫١٠ث … ٣٠٫١٠ث بخطوة ٠٫٠١
      const d = i / 100;
      for (let f = 1; f <= Math.floor(30.5 * d + 2); f++) { // كلّ عدد إطارات يقبله فحص fps
        const pts = t.pps * enh.billedSec(t, d, f);
        const c = enh.providerCents(k, f, 1920, 1080);
        const m = pts * proNet / (c / 100);
        if (m < worst.m) worst = { m, d, f, pts, c };
      }
      if (d >= t.minSec) top = Math.max(top, t.pps * enh.billedSec(t, d, Math.round(30 * d)) * proNet / (enh.providerCents(k, Math.round(30 * d), 1920, 1080) / 100));
    }
    assert.ok(worst.m >= 2, k + ' أسوأ هامش ×' + worst.m.toFixed(2) + ' عند ' + JSON.stringify(worst));
    assert.deepEqual([worst.m.toFixed(2), worst.pts, worst.c], want[k], k);
    assert.ok(top <= 4, k + ' أعلى هامش عند ٣٠ إطارًا ×' + top.toFixed(2));
  }
  // الحدّ الأدنى للخصم لكلّ طبقة، وأكبر خصم ممكن (٣٠٫١ث عند حدّ سماح الإطارات).
  assert.deepEqual(Object.values(enh.TIERS).map((t) => t.pps * enh.billedSec(t, 0.5, 15)), [27, 20, 34]);
  assert.equal(fast.pps * enh.billedSec(fast, 30.1, 920), 279);
  assert.equal(fast.pps * enh.billedSec(fast, 10, 600), 180, 'إطارات أكثر من ٣٠/ث تُحاسَب بالإطار لا بالمدّة');
  assert.deepEqual([enh.MAX_SEC, enh.MAX_BYTES, enh.DAILY, enh.FREE_SHARE, enh.QUOTE_TTL, enh.ORPHAN_MS], [30, 80 * 1024 * 1024, 10, 0.2, 900, 330000]);
  // سقف اليوم: الصفر مقبول ويغلق، والقيمة المشوّهة ترجع للافتراضيّ.
  for (const [raw, v] of [[undefined, 1000], ['', 1000], [' ', 1000], ['0', 0], ['250', 250], ['-5', 1000], ['abc', 1000]]) {
    if (raw === undefined) delete process.env.VIDEO_ENHANCE_CAP_CENTS; else process.env.VIDEO_ENHANCE_CAP_CENTS = raw;
    assert.equal(enh.capCents(), v, JSON.stringify(raw));
  }
});

test('٢. بالنقاط وحدها: السبب خارج جدول الوسائط، مشترك الوسائط يُخصم نقاطًا ورصيد اشتراكه لا يُمسّ، وrefundPointsOnly لا يمرّ بالتذاكر', async () => {
  reset();
  const mp = require(rp('api/_lib/_mediaPlans.js'));
  assert.equal(mp.UNIT_COST.video_enhance, undefined);
  assert.equal(mp.mediaOf('video_enhance'), null);
  assert.equal(points.COSTS.video_enhance, undefined, 'لا رقم في COSTS يقبله خصم العميل');
  fresh('mia', 500, { media: { mix: { plan: 'media_basic', at: Date.now() - 86400000 } } });
  kv.set('media:mix:mia', '1250');
  const { id, r } = await go('mia');
  assert.deepEqual([r.code, r.j.state, r.j.cost, r.j.points], [200, 'running', 90, 410]);
  assert.equal(await bal('mia'), 410);
  assert.equal(kv.get('media:mix:mia'), '1250', 'رصيد الاشتراك لم يُصرف منه');
  assert.equal(kv.has('media:tix:mia'), false, 'لا تذكرة وسائط');
  assert.equal(jobOf(id).paid, 90);

  // تذكرة وسائط معلّقة بـ٩٠ نقطة (فيديو اقتصاديّ من الاشتراك): الردّ القديم يلتهمها، والجديد يعيد نقاطًا ولا يمسّها.
  const tix = JSON.stringify([{ p: 90, f: 103, k: 'mix' }]);
  kv.set('media:tix:mia', tix);
  assert.equal(await points.refundPointsOnly('mia', 90), true);
  assert.equal(await bal('mia'), 500);
  assert.deepEqual([kv.get('media:mix:mia'), kv.get('media:tix:mia')], ['1250', tix]);
  await points.refundPoints('mia', 90); // للمقارنة: هذا هو الفخّ — نقاط خُصمت تعود رصيد اشتراك
  assert.deepEqual([await bal('mia'), kv.get('media:mix:mia'), kv.get('media:tix:mia')], [500, '1353', '[]']);

  K.failIncr = (k) => k === 'points:mia';
  assert.equal(await points.refundPointsOnly('mia', 90), false, 'فشل القيد = false ليعيد المتّصل');
  K.failIncr = null;
  assert.equal(await bal('mia'), 500);
  A.putFail = true; // المرآة على سجلّ الحساب وحدها تفشل
  assert.equal(await points.refundPointsOnly('mia', 10), true);
  A.putFail = false;
  assert.equal(await bal('mia'), 510);
  for (const u of ['omran', 'vip1']) {
    fresh(u, 0);
    assert.equal(await points.refundPointsOnly(u, 90), true, u);
    assert.equal(kv.has('points:' + u), false, u + ': لا رصيد يُنشأ من العدم');
  }
  assert.deepEqual([await points.refundPointsOnly('', 5), await points.refundPointsOnly('mia', 0), await points.refundPointsOnly('mia', -3)], [true, true, true]);
  assert.equal(await bal('mia'), 510);

  // مع ختم: القيد والختم في نداء Redis واحد — ردّ وقع لا يبقى بلا ختمه (كان يُعاد ثانيةً بعد دقيقتين).
  const MARK = 'venh:settled:' + 'e'.repeat(24);
  const marked = (u, n) => points.refundPointsOnly(u, n, [MARK, '0d', 691200]);
  fresh('mark1', 100);
  K.pipes.length = 0;
  assert.equal(await marked('mark1', 7), true);
  assert.deepEqual([await bal('mark1'), kv.get(MARK), ttl.get(MARK)], [107, '0d', 691200]);
  assert.deepEqual(K.pipes, [[['INCRBY', 'points:mark1', '7'], ['SET', MARK, '0d', 'EX', '691200']]], 'نداء واحد: القيد ثمّ الختم، والمبالغ نصوص');
  kv.delete(MARK);
  K.failPipe = () => true; // النداء لم يصل: لا قيد ولا ختم
  assert.deepEqual([await marked('mark1', 7), await bal('mark1'), kv.has(MARK)], [false, 107, false]);
  K.failPipe = null;
  K.pipeLost = () => true; // نُفّذ وضاع الجواب: false، والختم المكتوب هو ما يقول للمتّصل إنّ القيد وقع
  assert.deepEqual([await marked('mark1', 7), await bal('mark1'), kv.get(MARK)], [false, 114, '0d']);
  K.pipeLost = null;
  kv.delete(MARK);
  K.pipeNull = (op) => op === 'INCRBY'; // النداء أجاب وأمر القيد أخطأ: لا «رُدّت» بلا قيد — الختم يُحذف
  assert.deepEqual([await marked('mark1', 7), await bal('mark1'), kv.has(MARK)], [false, 114, false]);
  K.pipeNull = null;
  kv.set('points:mark1', '114.5'); // رصيد ليس عددًا صحيحًا: يُرفض قبل النداء (INCRBY كان سيخطئ والختم ينجح)
  K.pipes.length = 0;
  assert.deepEqual([await marked('mark1', 7), K.pipes.length, kv.has(MARK), kv.get('points:mark1')], [false, 0, false, '114.5']);
  for (const u of ['omran', 'vip1']) assert.deepEqual([await marked(u, 90), kv.has(MARK), kv.has('points:' + u)], [true, false, false], u + ': لا نداء ولا ختم هنا');
  assert.deepEqual([await marked('mark1', 0), kv.has(MARK)], [true, false]);
});

test('٣. info: GET بلا دخول وبلا نداء مزوّد؛ off/on/المالك وحده؛ المهمّة لصاحب الرمز فقط؛ وno-store على كلّ ردّ', async () => {
  reset(null);
  fresh('reem'); fresh('omran', 0);
  const anon = await infoAs('');
  assert.equal(anon.code, 200);
  assert.deepEqual(anon.j, { ok: true, on: false, rate: 9, minSec: 3, maxSec: 30, maxMB: 80, tall: false, job: null });
  // tall: هل يُقبل لهذا الحساب مقطع أعلى من 1080 — قاعدة التسعير نفسها (المالك، أو طبقة أدرجها المالك)، فالواجهة ترفض غيره قبل الرفع.
  const tall = async (u) => (await infoAs(u)).j.tall;
  assert.deepEqual([await tall(''), await tall('reem'), await tall('omran')], [false, false, true]);
  process.env.VIDEO_ENHANCE_TALL_OK = 'max'; // طبقة أخرى غير الحاليّة
  assert.deepEqual([await tall('reem'), await tall('omran')], [false, true]);
  process.env.VIDEO_ENHANCE_TALL_OK = ' precise , FAST ';
  assert.deepEqual([await tall(''), await tall('reem'), await tall('omran')], [true, true, true]);
  delete process.env.VIDEO_ENHANCE_TALL_OK;
  const on = async (u) => (await infoAs(u)).j.on;
  assert.deepEqual([await on('reem'), await on('omran')], [false, true], 'بلا ضبط = المالك وحده');
  for (const [v, user, owner] of [['off', false, false], ['on', true, true], [' ON ', true, true], ['yes', false, true], ['OFF', false, false], ['1', false, true]]) {
    process.env.VIDEO_ENHANCE = v;
    assert.deepEqual([await on('reem'), await on(''), await on('omran')], [user, user, owner], JSON.stringify(v));
  }
  process.env.VIDEO_ENHANCE = 'on';
  delete process.env.FAL_KEY;
  assert.deepEqual([await on('reem'), await on('omran')], [false, false], 'بلا مفتاح');
  process.env.FAL_KEY = KEY;
  kv.set('venh:trip', '2026-10-10T01:02:03.000Z');
  assert.deepEqual([await on('reem'), await on('omran')], [false, true], 'القاطع يغلق غير المالك');
  kv.delete('venh:trip');
  K.failGet = (k) => k === 'venh:trip';
  assert.deepEqual([await on('reem'), await on('omran')], [false, true], 'تعذّر قراءة القاطع = مقطوع');
  K.failGet = null;
  process.env.VIDEO_ENHANCE_CAP_CENTS = '0';
  assert.deepEqual([await on('reem'), await on('omran')], [false, false], 'سقف صفر = مفتاح إيقاف');
  delete process.env.VIDEO_ENHANCE_CAP_CENTS;
  process.env.VIDEO_ENHANCE_TIER = 'precise';
  assert.deepEqual([(await infoAs('')).j.rate, (await infoAs('')).j.minSec], [2, 10], 'سعر الطبقة الحاليّة');
  delete process.env.VIDEO_ENHANCE_TIER;

  // مهمّة الحساب (الجارية أوّلًا ثمّ الأخيرة) لصاحب الرمز وحده — وتُرجَع ولو كانت الميزة مغلقة.
  kv.set('venh:last:reem', 'b'.repeat(24));
  assert.equal((await infoAs('reem')).j.job, 'b'.repeat(24));
  kv.set('venh:open:reem', 'a'.repeat(24));
  assert.equal((await infoAs('reem')).j.job, 'a'.repeat(24));
  assert.deepEqual([(await infoAs('')).j.job, (await infoAs('omran')).j.job], [null, null]);
  process.env.VIDEO_ENHANCE = 'off';
  const off = await infoAs('reem');
  assert.deepEqual([off.j.on, off.j.job], [false, 'a'.repeat(24)]);
  const noExp = await call('info', null, null, { method: 'GET', headers: { authorization: 'Bearer ' + token('reem', true) } });
  assert.equal(noExp.j.job, null, 'حمولة موقّعة بلا exp ليست جلسة');
  kv.delete('venh:open:reem'); kv.delete('venh:last:reem');
  assert.equal(F.calls.length, 0, 'لا نداء مزوّد من info');

  process.env.VIDEO_ENHANCE = 'on';
  const all = [anon, await call('start', { size: 10 }, ''), await call('start', {}, undefined, { method: 'GET' }), await call('status', { id: 'x' }), await call('nope', {}),
    await call('start', {}, undefined, { method: 'OPTIONS' }), await call('run', { id: 'zz' })];
  assert.deepEqual(all.map((r) => r.code), [200, 401, 405, 404, 400, 204, 404]);
  for (const r of all) assert.equal(r.headers['cache-control'], 'no-store');
});

test('٤. البدء: 401 بلا جلسة، والرفض قبل أيّ نداء مزوّد، وهدف رفع بعمر ٣٠ دقيقة واسم عشوائيّ، ورابط القراءة لا يغادر الخادم', async () => {
  reset();
  fresh('reem'); fresh('poor', 26);
  assert.equal((await call('start', { size: 10, mime: 'video/mp4' }, '')).code, 401);
  assert.equal((await call('start', { size: 10, mime: 'video/mp4' }, token('reem', true))).code, 401, 'حمولة موقّعة بلا exp');
  assert.equal((await call('start', { size: 10, mime: 'video/mp4' }, token('reem') + 'x')).code, 401);
  const rej = async (body, tk) => { const r = await call('start', body, tk); return [r.code, r.j.error]; };
  assert.deepEqual(await rej({ mime: 'video/mp4' }), [400, 'bad_request']);
  assert.deepEqual(await rej({ size: 10.5, mime: 'video/mp4' }), [400, 'bad_request']);
  assert.deepEqual(await rej({ size: enh.MAX_BYTES + 1, mime: 'video/mp4' }), [413, 'too_big']);
  assert.deepEqual(await rej({ size: 10, mime: 'video/webm', name: 'a.webm' }), [415, 'format']);
  assert.deepEqual(await rej({ size: 10, mime: '', name: 'a.mkv' }), [415, 'format']);
  // نوع أو امتداد من العميل لا يُبحث عنه في خصائص Object.prototype: «constructor» و«__proto__» كانتا تمرّان فيصدر هدف رفع لاسم مرفوض.
  for (const [mime, name] of [['constructor', 'payload.exe'], ['__proto__', 'a.html'], ['', 'evil.constructor'], ['toString', ''], ['', 'x.hasOwnProperty'], ['valueOf', 'a.__proto__']]) {
    assert.equal(enh.containerOf(mime, name), null, mime + ' ' + name);
    assert.deepEqual(await rej({ size: 10, mime, name }), [415, 'format'], mime + ' ' + name);
  }
  assert.deepEqual([enh.containerOf('video/mp4', 'a.constructor'), enh.containerOf('constructor', 'clip.MOV')], [{ ext: 'mp4', ctype: 'video/mp4' }, { ext: 'mov', ctype: 'video/quicktime' }], 'المقبول كما كان');
  assert.deepEqual(await rej({ size: 10, mime: 'video/mp4', durationSec: 30.2 }), [413, 'too_long']);
  const p = await call('start', { size: 10, mime: 'video/mp4', durationSec: 2 }, token('poor'));
  assert.deepEqual([p.code, p.j.error, p.j.needed, p.j.points], [402, 'points_insufficient', 27, 26], 'الحدّ الأدنى ٢٧ نقطة');
  const p2 = await call('start', { size: 10, mime: 'video/mp4', durationSec: 10 }, token('poor'));
  assert.deepEqual([p2.j.error, p2.j.needed], ['points_insufficient', 90]);
  assert.equal(F.calls.length, 0, 'لا نداء مزوّد لطلب مرفوض');
  assert.equal(kv.has(tallyKey('reem')) || kv.has(tallyKey('poor')), false, 'ولا رفعة من حدّ اليوم');

  const ok = await call('start', { size: 5000, mime: 'video/mp4', name: 'My Holiday Clip.mp4', durationSec: 10, video_url: 'https://evil.example/a.mp4', file_url: 'https://evil.example/b.mp4' });
  assert.equal(ok.code, 200, JSON.stringify(ok.j));
  assert.ok(/^[a-f0-9]{24}$/.test(ok.j.id));
  assert.deepEqual(Object.keys(ok.j).sort(), ['id', 'mime', 'ok', 'upload']);
  assert.equal(ok.j.mime, 'video/mp4');
  const ini = calls('initiate');
  assert.equal(ini.length, 1);
  assert.deepEqual([ini[0].method, ini[0].url], ['POST', INITIATE]);
  assert.equal(authOf(ini[0]), 'Key ' + KEY, 'المفتاح في الترويسة');
  const life = '{"expiration_duration_seconds":1800}';
  assert.deepEqual([ini[0].headers['X-Fal-Object-Lifecycle'], ini[0].headers['X-Fal-Object-Lifecycle-Preference']], [life, life]);
  assert.deepEqual(Object.keys(ini[0].json).sort(), ['content_type', 'file_name']);
  assert.match(ini[0].json.file_name, /^v-[a-f0-9]{16}\.mp4$/);
  assert.ok(!/holiday|reem/i.test(ini[0].json.file_name) && !ini[0].json.file_name.includes(ok.j.id), 'لا اسم المستخدم ولا اسم ملفّه ولا رقم المهمّة');
  assert.equal(ini[0].json.content_type, 'video/mp4');
  const j = jobOf(ok.j.id);
  assert.deepEqual([j.u, j.st, j.ctype, j.ext, j.size], ['reem', 'upload', 'video/mp4', 'mp4', 5000]);
  assert.equal(ttl.get('venh:' + ok.j.id), 1800);
  assert.equal(ok.j.upload, [...F.targets.keys()][F.targets.size - 1]);
  assert.ok(!JSON.stringify(ok.j).includes(j.raw), 'رابط القراءة يبقى في الخادم');
  assert.ok(!JSON.stringify(F.calls).includes('evil.example'), 'رابط من العميل لا يصل المزوّد');

  // النوع القانونيّ من النوع ثمّ الامتداد: صفحة باسم mp4 تُرفع فيديو، وMOV الآيفون quicktime.
  F.calls.length = 0;
  assert.equal((await call('start', { size: 10, mime: 'text/html', name: 'x.mp4' })).j.mime, 'video/mp4');
  assert.equal((await call('start', { size: 10, mime: 'video/quicktime', name: 'IMG_1.MOV' })).j.mime, 'video/quicktime');
  assert.equal((await call('start', { size: 10, mime: 'video/x-m4v; codecs=avc1', name: 'x' })).j.mime, 'video/mp4');
  assert.deepEqual(calls('initiate').map((c) => [c.json.content_type, c.json.file_name.split('.')[1]]), [['video/mp4', 'mp4'], ['video/quicktime', 'mov'], ['video/mp4', 'm4v']]);

  // فشل إصدار الهدف يعيد الرفعة لحدّ اليوم؛ ورصيد المزوّد عندنا = «متوقّف مؤقّتًا».
  const before = Number(kv.get(tallyKey('reem')));
  assert.equal(before, 4);
  F.initFail = 500;
  const f = await call('start', { size: 10, mime: 'video/mp4' });
  assert.deepEqual([f.code, f.j.error, '__diag' in f.j], [502, 'failed', false]);
  F.initFail = 403; F.initMsg = 'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.';
  const lock = await call('start', { size: 10, mime: 'video/mp4' });
  assert.deepEqual([lock.code, lock.j.error, '__diag' in lock.j], [503, 'unavailable', false]);
  F.initFail = 0; F.initThrow = true;
  const net = await call('start', { size: 10, mime: 'video/mp4' }, token('omran'));
  assert.deepEqual([net.code, net.j.error], [502, 'failed']);
  assert.ok(net.j.__diag.includes('[url]') && !net.j.__diag.includes('rest.fal.ai'), 'التشخيص للمالك بلا رابط: ' + net.j.__diag);
  F.initThrow = false;
  F.initFail = 0; K.failSet = (k) => /^venh:[a-f0-9]{24}$/.test(k);
  assert.equal((await call('start', { size: 10, mime: 'video/mp4' })).code, 502, 'تعذّر حفظ المهمّة');
  K.failSet = null;
  assert.equal(Number(kv.get(tallyKey('reem'))), before, 'الرفعات الفاشلة عادت');
  assert.equal(logged.filter((x) => x.scope === 'video-enhance').length >= 3, true);

  // مفتاح غائب بعد الجلسة = متوقّف؛ والمحظور 403.
  delete process.env.FAL_KEY;
  assert.deepEqual(await rej({ size: 10, mime: 'video/mp4' }), [503, 'unavailable']);
  process.env.FAL_KEY = KEY;
  A.banned.add('reem');
  assert.deepEqual(await rej({ size: 10, mime: 'video/mp4' }), [403, 'banned']);
  A.banned.clear();
});

test('٤ب. حدّ اليوم: عشر رفعات ثمّ 429 limit — لا daily_limit_reached ولا 402 — والمالك بلا عدّ', async () => {
  reset();
  fresh('tenner', 5000); fresh('omran', 0);
  for (let i = 0; i < 10; i++) assert.equal((await call('start', { size: 10, mime: 'video/mp4' }, token('tenner'))).code, 200, '#' + (i + 1));
  const over = await call('start', { size: 10, mime: 'video/mp4' }, token('tenner'));
  assert.deepEqual([over.code, over.j], [429, { ok: false, error: 'limit' }]);
  assert.equal(calls('initiate').length, 10, 'الحادية عشرة لم تصل المزوّد');
  for (let i = 0; i < 12; i++) assert.equal((await call('start', { size: 10, mime: 'video/mp4' }, token('omran'))).code, 200);
  assert.equal(kv.has(tallyKey('omran')), false);
});

test('٥. التثبيت والقياس: الخادم ينسخ البايتات مرّة إلى هدف لا يغادره، ويقيس النسخة وحدها، ثمّ يعرض التكلفة بلا خصم', async () => {
  reset();
  fresh('reem'); fresh('sara');
  const id = await upload('reem', { bytes: null }); // لم يُرفع شيء بعد
  assert.deepEqual([(await call('run', { id }, token('sara'))).code, (await call('status', { id }, token('sara'))).code], [404, 404], 'مهمّة غيره');
  const miss = await call('run', { id });
  assert.deepEqual([miss.code, miss.j.error], [409, 'not_uploaded']);
  assert.equal(jobOf(id).tries, 1);
  assert.equal((await call('status', { id })).j.state, 'upload');

  const raw = jobOf(id).raw;
  F.files.set(raw, MP4);
  F.calls.length = 0;
  const before = await bal('reem');
  // نداءان متزامنان: تثبيت واحد، والثاني «أعد بعد قليل».
  F.rawDelay = 25;
  const [a, b] = await Promise.all([
    call('run', { id, video_url: 'https://evil.example/long.mp4', file: 'https://evil.example/f', media_url: 'https://evil.example/m', url: 'https://evil.example/u' }),
    call('run', { id }),
  ]);
  F.rawDelay = 0;
  assert.deepEqual([a.code, b.code].sort(), [200, 503]);
  assert.equal((a.code === 503 ? a : b).j.error, 'retry');
  const q = a.code === 200 ? a : b;
  assert.deepEqual(q.j, { ok: true, quote: true, id, sec: 10, cost: 90, points: before });
  assert.equal(await bal('reem'), before, 'لا خصم عند العرض');
  assert.deepEqual([calls('raw').length, calls('initiate').length, calls('put').length, calls('meta').length], [1, 1, 1, 1]);
  assert.equal(calls('raw')[0].url, raw);
  assert.equal(authOf(calls('raw')[0]), '', 'المفتاح لا يُرسل لمضيف التخزين');
  const ini = calls('initiate')[0];
  const life = '{"expiration_duration_seconds":3600}';
  assert.deepEqual([ini.headers['X-Fal-Object-Lifecycle'], ini.headers['X-Fal-Object-Lifecycle-Preference']], [life, life], 'النسخة المثبّتة بعمر ساعة');
  assert.match(ini.json.file_name, /^v-[a-f0-9]{16}\.mp4$/);
  const putc = calls('put')[0];
  assert.ok(Buffer.from(putc.body).equals(MP4), 'البايتات نفسها');
  assert.deepEqual([putc.headers['Content-Type'], authOf(putc)], ['video/mp4', '']);
  const j = jobOf(id);
  const pin = F.targets.get(putc.url);
  assert.deepEqual([j.st, j.pin, j.raw], ['quoted', pin, null]);
  assert.notEqual(pin, raw);
  assert.deepEqual(j.m, { dur: 10, frames: 300, w: 1280, h: 720 });
  assert.equal(ttl.get('venh:' + id), 900, 'العرض صالح ربع ساعة');
  assert.deepEqual(calls('meta')[0].json, { media_url: pin, extract_frames: false }, 'القياس على النسخة المثبّتة');
  assert.equal(authOf(calls('meta')[0]), 'Key ' + KEY);
  assert.ok(calls('raw')[0].signal && putc.signal && calls('meta')[0].signal, 'مهلة خاصّة لكلّ نداء طويل');
  assert.ok(!kv.get('venh:' + id).includes('UPLOAD-SIG') && !JSON.stringify(q.j).includes('fal.media'), 'رابط الكتابة لا يُحفظ ولا يُرجَع');
  assert.ok(!JSON.stringify(F.calls.map((c) => [c.url, typeof c.body === 'string' ? c.body : ''])).includes('evil.example'), 'حقول الروابط في الطلب مُهمَلة');
  assert.equal(kv.has('venh:meas:' + id), false, 'القفل فُكّ');

  // العرض يُعاد حسابه بلا حفظ ولا نداء مزوّد؛ والاستطلاع يحمله بحالة quoted.
  F.calls.length = 0;
  const snap = kv.get('venh:' + id);
  assert.deepEqual((await call('run', { id })).j, q.j);
  const st = await call('status', { id });
  assert.deepEqual([st.j.state, st.j.cost, st.j.sec], ['quoted', 90, 10]);
  assert.deepEqual([F.calls.length, kv.get('venh:' + id)], [0, snap]);
  // بعد الكتابة فوق الهدف الخام (المتصفّح ما زال يملك رابطه) لا شيء يتغيّر: الخام لم يعد يُقرأ.
  F.files.set(raw, Buffer.concat([MP4, crypto.randomBytes(5000)]));
  assert.deepEqual((await call('run', { id })).j, q.j);
  assert.equal(calls('raw').length, 0);
});

test('٥ب. الرفض بلا خصم: ملفّ مجزّأ أو بلا ftyp، حجم زائد، قياس ناقص، مدّة أو إطارات أو أبعاد خارج الحدّ — والمهمّة تُحذف', async () => {
  reset();
  fresh('reem', 500);
  assert.deepEqual([MP4, MP4_FRAG, MP4_MVEX, NO_FTYP].map(enh.sniff), [true, false, false, false]);
  const wide = Buffer.alloc(16 + 20); wide.writeUInt32BE(1, 0); wide.write('mdat', 4, 'latin1'); wide.writeUInt32BE(0, 8); wide.writeUInt32BE(36, 12); // حجم ٦٤ بت
  const tail = Buffer.alloc(8 + 30); tail.writeUInt32BE(0, 0); tail.write('free', 4, 'latin1'); // حجم ٠ = إلى آخر الملفّ
  assert.equal(enh.sniff(Buffer.concat([FTYP, wide, box('moov', MVHD), tail])), true);
  assert.equal(enh.sniff(Buffer.concat([FTYP, wide, box('moof', Buffer.alloc(8)), box('moov', MVHD)])), false, 'moof بعد صندوق ٦٤ بت');
  assert.equal(enh.sniff(Buffer.concat([FTYP, box('moov', MVHD)]).subarray(0, FTYP.length + 20)), false, 'صندوق يتجاوز آخر الملفّ');
  assert.equal(enh.sniff(Buffer.concat([FTYP, MDAT])), false, 'بلا moov');
  for (const bad of [Buffer.alloc(0), Buffer.from('<html><body>hi</body></html>'), Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), 'text', null]) assert.equal(enh.sniff(bad), false);

  // سقف الصناديق: ملفّ من صناديق بثمانية بايتات (عشرة ملايين في ٨٠ م.ب) كان يُقبل ويحجز نحو غيغابايت قبل أيّ فحص آخر — يُرفض عند الصندوق ٢٥٧.
  const frees = (n) => { const b = Buffer.alloc(8 * n); for (let i = 0; i < n; i++) { b.writeUInt32BE(8, 8 * i); b.write('free', 8 * i + 4, 'latin1'); } return b; };
  assert.deepEqual([enh.sniff(Buffer.concat([FTYP, frees(254), box('moov', MVHD)])), enh.sniff(Buffer.concat([FTYP, frees(255), box('moov', MVHD)]))], [true, false], '٢٥٦ صندوقًا عليا مقبولة و٢٥٧ لا');
  const MANY = Buffer.concat([FTYP, frees(131072), box('moov', MVHD)]); // ١ م.ب من الصناديق الصغيرة
  assert.equal(enh.sniff(MANY), false);
  assert.equal(enh.sniff(Buffer.concat([FTYP, box('moov', Buffer.concat([MVHD, frees(300)]))])), false, 'وأبناء moov كذلك');

  // حدّ من بايتات الملفّ نفسه لما قد يعالجه المزوّد: كلّ جدول أحجام عيّنات خارج mdat ≤ ١٦٠٠ عيّنة، ولا رأس مضغوط ولا moof مدفون.
  // السعر والحجز من أداة قياس المزوّد وحدها — وملفّ بمسارَي فيديو (٩٠ و٢١٦٠٠٠ عيّنة) كان يُقبل: يُسعَّر بثلاث ثوانٍ ويعالَج ساعتين.
  assert.equal(enh.MAX_SAMPLES, 1600);
  const BIG = 216000;
  const TWO_TRACKS = movie(trak(stsz(90)), trak(stsz(BIG)));
  for (const [why, bytes] of [
    ['فيديو ٩٠٠ + صوت ١٤٠٦ + مسار بيانات', movie(trak(stsz(900)), trak(stsz(1406)), trak(stsz(30)))],
    ['على الحدّ', movie(trak(stsz(1600)))],
    ['stz2 على الحدّ', movie(trak(stz2(1600)))],
    ['رأس ٦٤ بت بجدول صغير', movie(trak(box64('stsz', u32(0, 0, 900))))],
    ['٦٤ جدولًا', movie(...Array.from({ length: 64 }, () => trak(stsz(10))))],
    ['ما في mdat لا يُقرأ', Buffer.concat([FTYP, box('moov', Buffer.concat([MVHD, trak(stsz(900))])), box('mdat', Buffer.concat([stsz(BIG), Buffer.from('moofcmov', 'latin1')]))])],
  ]) assert.equal(enh.sniff(bytes), true, why);
  for (const [why, bytes] of [
    ['مسار واحد طويل', movie(trak(stsz(1601)))],
    ['مسارا فيديو: القصير أوّلًا', TWO_TRACKS],
    ['مسارا فيديو: الطويل أوّلًا', movie(trak(stsz(BIG)), trak(stsz(90)))],
    ['جدولان في مسار واحد (الأخير يغلب عند القارئ)', movie(trak(stsz(72), stsz(BIG)))],
    ['stz2', movie(trak(stz2(5000)))],
    ['رأس ٦٤ بت', movie(trak(box64('stsz', u32(0, 0, BIG))))],
    ['trak في المستوى الأعلى خارج moov', Buffer.concat([movie(trak(stsz(90))), trak(stsz(BIG))])],
    ['moov ثانٍ', Buffer.concat([movie(trak(stsz(90))), box('moov', Buffer.concat([MVHD, trak(stsz(BIG))]))])],
    ['داخل صندوق free', Buffer.concat([movie(trak(stsz(90))), box('free', trak(stsz(BIG)))])],
    ['رأس مضغوط', Buffer.concat([FTYP, box('moov', box('cmov', Buffer.alloc(40))), MDAT])],
    ['moof مدفون', movie(trak(stsz(90)), box('udta', box('moof', Buffer.alloc(16))))],
    ['جدول مبتور بلا عدد', Buffer.concat([FTYP, box('moov', Buffer.concat([MVHD, box('stsz', u32(0, 0))]))])],
    ['أكثر من ٦٤ جدولًا', movie(...Array.from({ length: 65 }, () => trak(stsz(10))))],
  ]) assert.equal(enh.sniff(bytes), false, why);

  const before = await bal('reem');
  const gone = async (o, code, err, why) => {
    kv.delete(tallyKey('reem')); // حدّ اليوم ليس موضوع هذا الاختبار
    const { id, q } = await quote('reem', o);
    assert.deepEqual([q.code, q.j.error], [code, err], why || err);
    assert.equal(kv.has('venh:' + id), false, (why || err) + ': المهمّة حُذفت');
    assert.equal(kv.has('venh:meas:' + id), false);
    return id;
  };
  for (const [bytes, why] of [[MP4_FRAG, 'moof'], [MP4_MVEX, 'mvex'], [NO_FTYP, 'بلا ftyp'], [Buffer.from('GIF89a' + 'x'.repeat(40)), 'ليس فيديو'], [MANY, 'صناديق بلا عدّ'], [TWO_TRACKS, 'مسارا فيديو']]) {
    F.calls.length = 0;
    await gone({ bytes }, 415, 'format', why);
    assert.deepEqual([calls('initiate').length, calls('put').length, calls('meta').length], [1, 0, 0], why + ': لا نسخ ولا قياس');
  }
  // أكبر من ٨٠ م.ب: بترويسة الطول، ثمّ بالعدّ أثناء القراءة (ترويسة كاذبة أو غائبة).
  F.onRaw = () => new Response('tiny', { status: 200, headers: { 'content-length': String(enh.MAX_BYTES + 1) } });
  await gone({}, 413, 'too_big', 'ترويسة الطول');
  let sent = 0;
  const mb = new Uint8Array(1024 * 1024);
  F.onRaw = () => { sent = 0; return new Response(new ReadableStream({ pull(c) { if (sent++ >= 81) c.close(); else c.enqueue(mb); } }), { status: 200 }); };
  F.calls.length = 0;
  await gone({}, 413, 'too_big', 'العدّ أثناء القراءة');
  assert.equal(calls('put').length, 0);
  F.onRaw = null;

  for (const [media, code, err] of [
    [{ duration: 10, resolution: { width: 1280, height: 720 } }, 415, 'format'], // بلا عدد إطارات — لا تقدير بديل
    [{ duration: 10, frame_count: '300', resolution: { width: 1280, height: 720 } }, 415, 'format'],
    [{ duration: 0, frame_count: 300, resolution: { width: 1280, height: 720 } }, 415, 'format'],
    [{ duration: 10, frame_count: 300 }, 415, 'format'],
    [{ duration: 30.2, frame_count: 906, resolution: { width: 1280, height: 720 } }, 413, 'too_long'],
    [{ duration: 10, frame_count: 600, resolution: { width: 1280, height: 720 } }, 422, 'fps'],
    [{ duration: 10, frame_count: 308, resolution: { width: 1280, height: 720 } }, 422, 'fps'],
    [{ duration: 10, frame_count: 300, resolution: { width: 3840, height: 2160 } }, 422, 'resolution'],
    [{ duration: 10, frame_count: 300, resolution: { width: 1921, height: 1080 } }, 422, 'resolution'],
  ]) { F.media = media; await gone({}, code, err, err + ' ' + JSON.stringify(media)); }
  assert.equal(await bal('reem'), before, 'لا خصم لأيّ رفض');
  assert.equal(calls('submit').length, 0);

  // المقبول على الحافّة: ٤٥ إطارًا في ١٫٤٦٦٧ث (٣٠ إطارًا تقريبًا) بالحدّ الأدنى، و٣٠٫١ث.
  fresh('reem', 500);
  F.media = { duration: 1.4667, frame_count: 45, resolution: { width: 1280, height: 720 } };
  assert.deepEqual((({ sec, cost }) => [sec, cost])((await quote('reem')).q.j), [3, 27]);
  F.media = { duration: 10, frame_count: 307, resolution: { width: 1280, height: 720 } };
  assert.deepEqual((({ sec, cost }) => [sec, cost])((await quote('reem')).q.j), [11, 99], '٣٠٧ إطارات = ١٠٫٢٣ث ← ١١');
  F.media = { duration: 30.1, frame_count: 903, resolution: { width: 1920, height: 1080 } };
  assert.deepEqual((({ sec, cost }) => [sec, cost])((await quote('reem')).q.j), [30, 270]);
  // ملفّ بجداول عيّنات حقيقيّة الحجم (٣٠ث: ٩٠٣ إطارات و١٤١١ حزمة صوت) يمرّ كما كان.
  assert.deepEqual((({ sec, cost }) => [sec, cost])((await quote('reem', { bytes: movie(trak(stsz(903)), trak(stsz(1411))) })).q.j), [30, 270]);
});

test('٥ج. أعطال عابرة في التثبيت = «أعد» بلا حذف؛ رفض صريح = فشل بلا خصم؛ والمحاولة الثالثة عشرة تحذف المهمّة', async () => {
  reset();
  fresh('reem', 500);
  const id = await upload('reem');
  const run = async () => { const r = await call('run', { id }); return [r.code, r.j.error || 'quote']; };
  F.onRaw = () => new Response('slow down', { status: 503 });
  assert.deepEqual(await run(), [503, 'retry']);
  F.onRaw = () => { throw new Error('ECONNRESET'); };
  assert.deepEqual(await run(), [503, 'retry']);
  F.onRaw = null;
  F.initFail = 502;
  assert.deepEqual(await run(), [503, 'retry'], '5xx على هدف النسخة');
  F.initFail = 0; F.putFail = 500;
  assert.deepEqual(await run(), [503, 'retry'], '5xx على نسخ البايتات');
  F.putFail = 0; F.metaFail = 500;
  assert.deepEqual(await run(), [503, 'retry'], 'القياس تعذّر');
  const j = jobOf(id);
  assert.deepEqual([j.st, j.tries, !!j.pin, j.raw], ['upload', 5, true, null], 'النسخة ثُبّتت — النداء التالي يقيس فقط');
  F.calls.length = 0;
  F.metaFail = 0;
  assert.deepEqual(await run(), [200, 'quote']);
  assert.deepEqual([calls('raw').length, calls('put').length, calls('meta').length], [0, 0, 1]);

  // رفض صريح (4xx) على هدف النسخة أو النسخ: فشل مسجَّل بلا خصم.
  const id2 = await upload('reem');
  F.initFail = 422;
  const f = await call('run', { id: id2 });
  assert.deepEqual([f.code, f.j.error], [502, 'failed']);
  F.initFail = 0; F.putFail = 403;
  assert.deepEqual([(await call('run', { id: id2 })).code], [502]);
  F.putFail = 0;
  assert.equal(jobOf(id2).st, 'upload');

  // لم يُرفع أبدًا: اثنتا عشرة محاولة ثمّ الحذف.
  const id3 = await upload('reem', { bytes: null });
  for (let i = 1; i <= 12; i++) assert.deepEqual([(await call('run', { id: id3 })).j.error, jobOf(id3).tries], ['not_uploaded', i]);
  assert.ok(ttl.get('venh:' + id3) > 1700 && ttl.get('venh:' + id3) <= 1800, 'المدّة الباقية من نصف الساعة لا مدّة جديدة');
  const last = await call('run', { id: id3 });
  assert.deepEqual([last.code, last.j.error, kv.has('venh:' + id3)], [409, 'not_uploaded', false]);
  assert.equal((await call('run', { id: id3 })).code, 404);
  assert.equal(await bal('reem'), 500);
});

test('٥د. نسخة واحدة للحساب في المرّة: رفعتان للحساب نفسه لا تُنسخان في الخادم معًا، والانتظار لا يأكل محاولات المهمّة، وحساب آخر لا ينتظر', async () => {
  reset();
  fresh('reem', 500); fresh('sara', 500);
  const a = await upload('reem');
  const b = await upload('reem');
  const s = await upload('sara');
  F.calls.length = 0;
  F.rawDelay = 25;
  const [ra, rb, rs] = await Promise.all([call('run', { id: a }), call('run', { id: b }), call('run', { id: s }, token('sara'))]);
  F.rawDelay = 0;
  assert.deepEqual([ra.code, rb.code].sort(), [200, 503], 'قبل الإصلاح: الاثنتان 200 — عشر نسخ بـ٨٠ م.ب معًا لحساب واحد بلا نقطة');
  const lost = ra.code === 503 ? ra : rb;
  const waiting = ra.code === 503 ? a : b;
  assert.deepEqual([lost.j, rs.code, rs.j.cost], [{ ok: false, error: 'retry' }, 200, 90], 'الثانية «أعد»، وحساب آخر ينسخ بالتوازي');
  assert.deepEqual([calls('raw').length, calls('put').length], [2, 2], 'نسخة واحدة لكلّ حساب');
  assert.deepEqual([jobOf(waiting).st, jobOf(waiting).tries || 0], ['upload', 0], 'الانتظار ليس محاولة');
  assert.deepEqual(['venh:pin:reem', 'venh:pin:sara', 'venh:meas:' + a, 'venh:meas:' + b].map((k) => kv.has(k)), [false, false, false, false], 'الأقفال فُكّت');
  const again = await call('run', { id: waiting });
  assert.deepEqual([again.code, again.j.cost, calls('put').length], [200, 90, 3], 'الإعادة تنسخ وتُسعَّر');

  // القفل بمعرّف المهمّة ومدّة قفل القياس، ويُفكّ عند العطل أيضًا.
  const c = await upload('reem');
  let lock = null;
  F.onRaw = () => { lock = [kv.get('venh:pin:reem'), ttl.get('venh:pin:reem')]; return new Response('slow down', { status: 503 }); };
  assert.deepEqual([(await call('run', { id: c })).j.error, lock, kv.has('venh:pin:reem')], ['retry', [c, 280], false]);
  F.onRaw = null;
  // نداء القياس وحده (النسخة ثُبّتت) لا يأخذ قفل الحساب: يمضي ولو كانت نسخة أخرى للحساب جارية…
  F.metaFail = 500;
  assert.deepEqual([(await call('run', { id: c })).j.error, !!jobOf(c).pin], ['retry', true]);
  F.metaFail = 0;
  kv.set('venh:pin:reem', 'f'.repeat(24));
  const m = await call('run', { id: c });
  assert.deepEqual([m.code, m.j.cost, kv.get('venh:pin:reem')], [200, 90, 'f'.repeat(24)], 'ولا يفكّ قفلًا ليس له');
  // …ومهمّة لم تُنسخ بعد تنتظر، بلا عدّ محاولة.
  const d = await upload('reem');
  F.calls.length = 0;
  const w = await call('run', { id: d });
  assert.deepEqual([w.code, w.j.error, jobOf(d).tries || 0, F.calls.length, kv.get('venh:pin:reem')], [503, 'retry', 0, 0, 'f'.repeat(24)]);
  kv.delete('venh:pin:reem');
  assert.equal(await bal('reem'), 500);
});

test('٦. المخرج الطوليّ مغلق لغير المالك حتّى يتحقّق المالك من سعر الطبقة؛ ومعامل التكبير بمنزلتين للأسفل', async () => {
  reset();
  const f = enh.factorFor;
  assert.deepEqual([f(1280, 720, false), f(1920, 1080, false), f(854, 480, false), f(540, 960, false), f(320, 240, false)], [1.5, 1, 2.24, 1.12, 4]);
  assert.ok(f(1080, 1920, false) < 1 && f(3840, 2160, false) < 1 && f(3840, 2160, true) < 1);
  assert.deepEqual([f(1080, 1920, true), f(720, 1280, true), f(1280, 720, true)], [1, 1.5, 1.5]);
  // جدول السعر للمخرج: 1080p للعرضيّ؛ للطوليّ جدول 4K (الأغلى) حتّى تُدرج الطبقة.
  assert.deepEqual([enh.fpcFor('fast', 1920, 1080), enh.fpcFor('fast', 1080, 1920), enh.fpcFor('fast', 2160, 3840)], [52.0833, 23.8357, 23.8357]);
  process.env.VIDEO_ENHANCE_TALL_OK = ' precise , FAST ';
  assert.deepEqual([enh.tallOk('fast'), enh.tallOk('max'), enh.fpcFor('fast', 1080, 1920), enh.fpcFor('max', 1080, 1920), enh.fpcFor('fast', 2160, 3840)], [true, false, 52.0833, 11.9179, 23.8357]);
  delete process.env.VIDEO_ENHANCE_TALL_OK;

  roomy();
  const tall = { duration: 10, frame_count: 300, resolution: { width: 1080, height: 1920 } };
  const factorOf = async (u, media) => { F.media = media; F.calls.length = 0; const r = await go(u); assert.equal(r.r.code, 200, JSON.stringify(r.r.j)); return calls('submit')[0].json.upscale_factor; };
  fresh('t1', 900);
  F.media = tall;
  const no = await quote('t1');
  assert.deepEqual([no.q.code, no.q.j.error, kv.has('venh:' + no.id), await bal('t1')], [422, 'resolution', false, 900]);
  assert.equal(await factorOf('t1', { duration: 10, frame_count: 300, resolution: { width: 540, height: 960 } }), 1.12);
  for (const [u, w, h, x] of [['t2', 1280, 720, 1.5], ['t3', 1920, 1080, 1], ['t4', 854, 480, 2.24]]) {
    fresh(u, 900);
    assert.equal(await factorOf(u, { duration: 10, frame_count: 300, resolution: { width: w, height: h } }), x, w + 'x' + h);
  }
  process.env.VIDEO_ENHANCE_TALL_OK = 'fast';
  fresh('t5', 900); fresh('t6', 900);
  assert.equal(await factorOf('t5', tall), 1);
  assert.equal(await factorOf('t6', { duration: 10, frame_count: 300, resolution: { width: 720, height: 1280 } }), 1.5);
  // الإذن سُحب بعد العرض: التأكيد يرفض بلا خصم.
  fresh('t7', 900);
  F.media = tall;
  const held = await quote('t7');
  assert.equal(held.q.j.cost, 90);
  delete process.env.VIDEO_ENHANCE_TALL_OK;
  const late = await call('run', { id: held.id, confirmed: true, cost: 90 }, token('t7'));
  assert.deepEqual([late.code, late.j.error, await bal('t7'), kv.has('venh:' + held.id)], [422, 'resolution', 900, false]);

  // المالك على طبقة غير مدرجة: يعمل، وتقديره بجدول 4K (١٣ رصيدًا لا ٦).
  fresh('omran', 0);
  F.media = tall; F.calls.length = 0;
  const own = await go('omran');
  assert.deepEqual([own.q.j.cost, own.q.j.points, own.q.j.__diag], [0, null, 'est 130c fast 1080x1920 f300 x1']);
  assert.deepEqual([own.r.code, own.r.j.state, calls('submit')[0].json.upscale_factor, jobOf(own.id).cap], [200, 'running', 1, 130]);
});

test('٧. التأكيد: تكلفة لا تطابق = عرض جديد بلا خصم؛ الترتيب سقف ثمّ نقاط ثمّ إرسال؛ والطلب بنموذجه ومعامله وترميزه صريحة', async () => {
  reset();
  fresh('reem', 500);
  const id = await upload('reem');
  const raw = jobOf(id).raw;
  const q = await call('run', { id });
  F.calls.length = 0; K.events.length = 0; K.pipes.length = 0;
  for (const cost of [89, undefined, '90x', 0]) {
    const w = await call('run', { id, confirmed: true, cost });
    assert.deepEqual([w.code, w.j.quote, w.j.changed, w.j.cost], [200, true, true, 90], 'cost=' + cost);
  }
  assert.deepEqual([await bal('reem'), F.calls.length, spent(), jobOf(id).st, kv.has('venh:open:reem')], [500, 0, 0, 'quoted', false]);
  // confirmed غير true الحرفيّة ليست تأكيدًا.
  assert.equal((await call('run', { id, confirmed: 'true', cost: 90 })).j.quote, true);
  assert.equal(await bal('reem'), 500);
  // تبديل الطبقة بعد العرض: عرض جديد بسعرها.
  process.env.VIDEO_ENHANCE_TIER = 'max';
  const sw = await call('run', { id, confirmed: true, cost: q.j.cost });
  assert.deepEqual([sw.j.changed, sw.j.cost, sw.j.sec, await bal('reem')], [true, 170, 10, 500]);
  delete process.env.VIDEO_ENHANCE_TIER;

  const r = await call('run', { id, confirmed: true, cost: 90 });
  assert.deepEqual([r.code, r.j], [200, { ok: true, state: 'running', id, cost: 90, points: 410 }]);
  assert.deepEqual(K.events.filter((e, i, a) => a.indexOf(e) === i), ['cap', 'points', 'submit'], 'حجز السقف ← خصم النقاط ← الإرسال');
  assert.deepEqual(K.pipes[0], [['INCRBY', 'venh:spent:' + today(), '60'], ['EXPIRE', 'venh:spent:' + today(), '172800'], ['INCRBY', 'venh:spentfree:' + today(), '60'], ['EXPIRE', 'venh:spentfree:' + today(), '172800']], 'مفاتيح مؤرَّخة بمدّة، والمبالغ نصوص');
  assert.deepEqual([spent(), spentFree(), await bal('reem')], [60, 60, 410]);
  const s = calls('submit');
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].method, s[0].url], ['POST', 'https://queue.fal.run/topaz/upscale/video/generative']);
  assert.deepEqual(s[0].json, { video_url: jobOf(id).pin, model: 'Starlight Fast 2', upscale_factor: 1.5, H264_output: true });
  assert.ok(raw && jobOf(id).pin !== raw && !s[0].body.includes(raw), 'النسخة المثبّتة تُرسل — لا الهدف الذي يكتب فيه المتصفّح');
  assert.ok(!('target_fps' in s[0].json));
  assert.deepEqual([authOf(s[0]), s[0].headers['X-Fal-Object-Lifecycle-Preference'], s[0].headers['X-Fal-Request-Start-Timeout'], s[0].headers['X-Fal-No-Retry'], s[0].headers['x-app-fal-disable-fallback']],
    ['Key ' + KEY, '{"expiration_duration_seconds":172800}', '600', '1', 'true']);
  assert.ok(s[0].signal, 'مهلة خاصّة للإرسال');
  const j = jobOf(id);
  assert.deepEqual([j.st, j.paid, j.tier, j.sec, j.cost, j.factor, j.cap, j.capDay, j.nosub], ['running', 90, 'fast', 10, 90, 1.5, 60, today(), true]);
  assert.match(j.req.id, /^req-\d+-0a1b2c3d$/);
  assert.ok(j.req.s.endsWith('/requests/' + j.req.id + '/status') && j.req.r.endsWith('/requests/' + j.req.id), 'روابط المزوّد على طابوره تُستعمل كما هي');
  assert.deepEqual([ttl.get('venh:' + id), kv.get('venh:open:reem'), ttl.get('venh:open:reem'), kv.has('venh:run:' + id)], [604800, id, 604800, false]);

  // تأكيد مكرَّر بعد النجاح: لا خصم ثانٍ ولا إرسال ثانٍ — الجواب حالة المهمّة.
  kv.delete('venh:poll:' + id);
  const again = await call('run', { id, confirmed: true, cost: 90 });
  assert.deepEqual([again.code, again.j.state, calls('submit').length, await bal('reem')], [200, 'running', 1, 410]);
  // مهمّة ثانية للحساب نفسه: مشغول بمعرّف مهمّته هو — عند البدء وعند التأكيد.
  const busy = await call('start', { size: 10, mime: 'video/mp4' });
  assert.deepEqual([busy.code, busy.j], [409, { ok: false, error: 'busy', job: id }]);
  assert.equal(calls('initiate').length, 0);

  // الطبقة الدقيقة: عنوانها ونموذجها وحدّها الأدنى.
  process.env.VIDEO_ENHANCE_TIER = 'precise';
  fresh('pia', 500);
  F.calls.length = 0;
  const p = await go('pia');
  assert.deepEqual([p.q.j.sec, p.q.j.cost, p.r.j.cost], [10, 20, 20]);
  assert.deepEqual([calls('submit')[0].url, calls('submit')[0].json.model, jobOf(p.id).cap], ['https://queue.fal.run/topaz/upscale/video/precision', 'Proteus', 20]);
});

test('٧ب. تأكيدان متزامنان = خصم واحد وإرسال واحد والآخر «مشغول»؛ ومهمّة مسعَّرة ثانية تنتظر الأولى؛ والعرض المنتهي لا يُخصم', async () => {
  reset();
  fresh('dual', 500);
  const { id } = await quote('dual');
  const second = await quote('dual'); // عرضان قبل أيّ تأكيد
  F.calls.length = 0; F.submitDelay = 20;
  const [a, b] = await Promise.all([call('run', { id, confirmed: true, cost: 90 }, token('dual')), call('run', { id, confirmed: true, cost: 90 }, token('dual'))]);
  F.submitDelay = 0;
  assert.deepEqual([a.code, b.code].sort(), [200, 409]);
  const lost = a.code === 409 ? a : b;
  assert.deepEqual(lost.j, { ok: false, error: 'busy', job: id }, 'الخاسر يتابع المهمّة نفسها');
  assert.deepEqual([await bal('dual'), calls('submit').length, spent()], [410, 1, 60]);
  const other = await call('run', { id: second.id, confirmed: true, cost: 90 }, token('dual'));
  assert.deepEqual([other.code, other.j], [409, { ok: false, error: 'busy', job: id }]);
  assert.deepEqual([await bal('dual'), calls('submit').length, jobOf(second.id).st], [410, 1, 'quoted']);

  // خانة تشير إلى مهمّة يُؤكَّد عليها الآن (القفل مأخوذ ولم يُحفظ «مدفوع» بعد) لا تُفكّ من تحت صاحبها…
  fresh('slot', 500);
  const s = await quote('slot');
  kv.set('venh:open:slot', s.id); kv.set('venh:run:' + s.id, '1');
  const held = await call('run', { id: s.id, confirmed: true, cost: 90 }, token('slot'));
  assert.deepEqual([held.code, held.j.job, kv.get('venh:open:slot'), await bal('slot')], [409, s.id, s.id, 500]);
  assert.equal((await call('start', { size: 10, mime: 'video/mp4' }, token('slot'))).j.job, s.id);
  // …وخانة ميّتة (انقطع صاحبها وانتهى قفله) تُفكّ والتأكيد يمضي.
  kv.delete('venh:run:' + s.id);
  const live = await call('run', { id: s.id, confirmed: true, cost: 90 }, token('slot'));
  assert.deepEqual([live.code, live.j.state, await bal('slot')], [200, 'running', 410]);

  // العرض انتهى (السجلّ زال بمدّته): لا مهمّة ولا خصم.
  fresh('late', 500);
  const l = await quote('late');
  assert.equal(ttl.get('venh:' + l.id), 900);
  kv.delete('venh:' + l.id);
  const exp = await call('run', { id: l.id, confirmed: true, cost: 90 }, token('late'));
  assert.deepEqual([exp.code, exp.j.error, await bal('late')], [404, 'not_found', 500]);

  // رصيد لا يكفي عند التأكيد، ومحظور: لا خصم، والحجز والخانة يعودان، والمهمّة تبقى مسعَّرة.
  fresh('thin', 500);
  const t = await quote('thin');
  kv.set('points:thin', '40');
  const before = [spent(), spentFree()];
  F.calls.length = 0; K.pipes.length = 0; K.events.length = 0;
  const np = await call('run', { id: t.id, confirmed: true, cost: 90 }, token('thin'));
  assert.deepEqual([np.code, np.j], [402, { ok: false, error: 'points_insufficient', needed: 90, points: 40 }]);
  assert.deepEqual([K.pipes.length, K.events.join()], [0, ''], 'الرصيد يُقرأ قبل أيّ حجز: لا حجز من السقف ولو للحظة');
  kv.set('points:thin', '500'); // المحظور يُكشف عند الخصم (spendPoints) — برصيد يكفي؛ ومحظور بلا رصيد يُجاب 402، وبلا خصم في الحالين
  A.banned.add('thin');
  const ban = await call('run', { id: t.id, confirmed: true, cost: 90 }, token('thin'));
  assert.deepEqual([ban.code, ban.j.error], [403, 'banned']);
  A.banned.clear();
  assert.deepEqual([kv.get('points:thin'), spent(), spentFree(), kv.has('venh:open:thin'), jobOf(t.id).st, calls('submit').length, kv.has('venh:run:' + t.id)], ['500', before[0], before[1], false, 'quoted', 0, false]);

  // حساب لا يملك الثمن لا يغلق الميزة على غيره: عرض بـ٢٧٠ نقطة (١٨٠ سنتًا من خُمس السقف ٢٠٠) لحساب فيه ٧٠ — بدأ بمدّة معلنة صفر.
  // قبل الإصلاح كان تأكيده يحجز ١٨٠ ثمّ يُرفض، وتأكيد غيره في الأثناء يُجاب «متوقّف مؤقّتًا».
  reset();
  fresh('mallory', 70); fresh('honest', 500);
  F.media = { duration: 30, frame_count: 900, resolution: { width: 1280, height: 720 } };
  const m = await quote('mallory', { start: { durationSec: 0 } });
  assert.deepEqual([m.q.j.cost, m.q.j.points], [270, 70]);
  F.media = { duration: 10, frame_count: 300, resolution: { width: 1280, height: 720 } };
  const h = await quote('honest');
  let reads = 0;
  let mid = null;
  K.onGet = async (k) => { // عند قراءة الرصيد الثانية داخل تأكيد mallory (الأولى لعرض الرصيد): حساب آخر يؤكّد الآن
    if (k !== 'points:mallory' || ++reads !== 2) return;
    mid = { held: [spent(), spentFree()], honest: await call('run', { id: h.id, confirmed: true, cost: 90 }, token('honest')) };
  };
  const mr = await call('run', { id: m.id, confirmed: true, cost: 270 }, token('mallory'));
  K.onGet = null;
  assert.deepEqual([mr.code, mr.j], [402, { ok: false, error: 'points_insufficient', needed: 270, points: 70 }]);
  assert.deepEqual(mid.held, [0, 0], 'لا حجز أثناء تأكيد لا يملك ثمنه');
  assert.deepEqual([mid.honest.code, mid.honest.j.state], [200, 'running'], 'تأكيد غيره يمرّ في الأثناء');
  assert.deepEqual([spent(), spentFree(), await bal('mallory'), await bal('honest'), kv.has('venh:open:mallory'), kv.has('venh:run:' + m.id), jobOf(m.id).st], [60, 60, 70, 410, false, false, 'quoted']);
});

test('٨. السقف والحصّة والمفاتيح: السقف الممتلئ وتعذّر العدّ لا يخصمان، خُمس السقف لغير المشتركين، ومهمّة المالك تُحجز بلا خصم ولا عدّ', async () => {
  reset();
  fresh('reem', 500);
  const { id } = await quote('reem');
  kv.set('venh:spent:' + today(), '950'); // السقف ١٠٠٠ والتقدير ٦٠
  F.calls.length = 0;
  const full = await call('run', { id, confirmed: true, cost: 90 });
  assert.deepEqual([full.code, full.j], [503, { ok: false, error: 'unavailable' }]);
  assert.deepEqual([await bal('reem'), calls('submit').length, spent(), spentFree(), kv.has('venh:open:reem'), jobOf(id).st], [500, 0, 950, 0, false, 'quoted'], 'العدّادان عادا');
  // تعذّر العدّ = لا صرف على عمًى.
  kv.set('venh:spent:' + today(), '0');
  K.failPipe = (cmds) => cmds.some((c) => /^venh:spent/.test(c[1]));
  const blind = await call('run', { id, confirmed: true, cost: 90 });
  K.failPipe = null;
  assert.deepEqual([blind.code, blind.j.error, await bal('reem'), calls('submit').length, kv.has('venh:open:reem')], [503, 'unavailable', 500, 0, false]);
  // السقف على الحافّة يمرّ: ٩٤٠ + ٦٠ = ١٠٠٠.
  kv.set('venh:spent:' + today(), '940');
  process.env.VIDEO_ENHANCE_CAP_CENTS = '1000';
  assert.equal((await call('run', { id, confirmed: true, cost: 90 })).j.state, 'running');
  assert.equal(spent(), 1000);

  // سقف صفر ومفتاح off: مغلق من البدء، للمالك أيضًا.
  fresh('zed', 500); fresh('omran', 0);
  for (const [k, v] of [['VIDEO_ENHANCE_CAP_CENTS', '0'], ['VIDEO_ENHANCE', 'off']]) {
    reset(); process.env[k] = v; F.calls.length = 0;
    for (const u of ['zed', 'omran']) {
      const r = await call('start', { size: 10, mime: 'video/mp4' }, token(u));
      assert.deepEqual([r.code, r.j.error], [503, 'unavailable'], k + ' ' + u);
    }
    assert.equal(F.calls.length, 0, k);
  }
  // الميزة أُغلقت بعد العرض: التأكيد مرفوض بلا خصم.
  reset();
  const z = await quote('zed');
  process.env.VIDEO_ENHANCE = 'yes'; // المالك وحده
  const shut = await call('run', { id: z.id, confirmed: true, cost: 90 }, token('zed'));
  assert.deepEqual([shut.code, shut.j.error, await bal('zed'), (await call('run', { id: z.id }, token('zed'))).code], [503, 'unavailable', 500, 503]);

  // خُمس السقف (٢٠٠ من ١٠٠٠) لغير المشتركين: ثلاث مهامّ بـ٦٠ ثمّ الرابعة مرفوضة — والمشترك ما زال يعمل.
  reset();
  for (const u of ['f1', 'f2', 'f3', 'f4']) fresh(u, 200);
  sub('sub1', 200);
  for (const u of ['f1', 'f2', 'f3']) assert.equal((await go(u)).r.j.state, 'running', u);
  assert.deepEqual([spent(), spentFree()], [180, 180]);
  F.calls.length = 0;
  const f4 = await go('f4');
  assert.deepEqual([f4.r.code, f4.r.j.error, await bal('f4'), calls('submit').length], [503, 'unavailable', 200, 0]);
  assert.deepEqual([spent(), spentFree()], [180, 180], 'ما حُجز للمرفوض عاد من العدّادين');
  const s1 = await go('sub1');
  assert.deepEqual([s1.r.j.state, await bal('sub1'), jobOf(s1.id).nosub], ['running', 110, false]);
  assert.deepEqual([spent(), spentFree()], [240, 180], 'المشترك يُحسب على السقف العامّ وحده');

  // المالك وVIP: حجز من السقف، بلا خصم، بلا عدّ يوميّ.
  fresh('vip1', 0);
  for (const u of ['omran', 'vip1']) {
    const o = await go(u);
    assert.deepEqual([o.q.j.cost, o.q.j.points, o.r.j.state, o.r.j.cost, o.r.j.points, jobOf(o.id).paid, jobOf(o.id).cap], [0, null, 'running', 0, null, 0, 60], u);
    assert.equal(kv.has(tallyKey(u)), false, u);
    assert.equal(kv.has('points:' + u), false, u);
  }
  assert.deepEqual([spent(), spentFree()], [360, 180]);
  // السقف يحكم المالك أيضًا.
  kv.set('venh:spent:' + today(), '990');
  kv.delete('venh:open:omran');
  const capped = await go('omran');
  assert.deepEqual([capped.r.code, capped.r.j.error], [503, 'unavailable']);
});

test('٩. بعد الخصم لا رجوع للتسعير: فشل الإرسال يردّ النقاط مرّة ولا يُرسَل ثانيةً؛ السقف يُفكّ فقط عند رفض صريح', async () => {
  reset();
  fresh('reem', 500);
  F.submitFail = 422; F.submitMsg = 'video_url: unsupported codec';
  const a = await go('reem');
  assert.deepEqual([a.r.code, a.r.j], [502, { ok: false, error: 'failed', refunded: 90 }]);
  assert.deepEqual([await bal('reem'), spent(), spentFree()], [500, 0, 0], 'النقاط عادت والحجز فُكّ (رفض صريح)');
  const ja = jobOf(a.id);
  assert.deepEqual([ja.st, ja.refunded, ja.why, ttl.get('venh:' + a.id)], ['failed', 90, 'submit', 86400]);
  assert.deepEqual([kv.has('venh:open:reem'), kv.get('venh:last:reem'), ttl.get('venh:last:reem'), kv.get('venh:settled:' + a.id), ttl.get('venh:settled:' + a.id)], [false, a.id, 172800, '0d', 691200]);
  // لا ردّ ثانٍ ولا إرسال ثانٍ مهما أُعيد.
  F.submitFail = 0; F.calls.length = 0;
  const re = await call('run', { id: a.id, confirmed: true, cost: 90 });
  assert.deepEqual([re.code, re.j], [200, { ok: true, state: 'failed', id: a.id, refunded: 90 }]);
  assert.deepEqual((await poll(a.id, 'reem')).j, { ok: true, state: 'failed', id: a.id, refunded: 90 });
  assert.deepEqual([await bal('reem'), F.calls.length], [500, 0]);

  // 429 أو رصيد المزوّد = «متوقّف مؤقّتًا» بعد الردّ.
  for (const [st, msg] of [[429, 'Too many requests'], [403, 'User is locked. Reason: Exhausted balance.']]) {
    F.submitFail = st; F.submitMsg = msg;
    const b = await go('reem');
    assert.deepEqual([b.r.code, b.r.j], [503, { ok: false, error: 'unavailable', refunded: 90 }], String(st));
    assert.deepEqual([await bal('reem'), spent()], [500, 0]);
  }
  // مهلة أو 5xx: النقاط تعود، والحجز يبقى (المزوّد ربّما قبلها)، ولا إرسال ثانٍ.
  F.submitFail = 0; F.submitThrow = true; F.calls.length = 0;
  const c = await go('reem');
  assert.deepEqual([c.r.code, c.r.j, await bal('reem'), spent(), spentFree()], [502, { ok: false, error: 'failed', refunded: 90 }, 500, 60, 60]);
  F.submitThrow = false;
  assert.equal((await call('run', { id: c.id, confirmed: true, cost: 90 })).j.state, 'failed');
  assert.equal(calls('submit').length, 1);
  F.submitFail = 503; F.submitMsg = 'upstream exploded';
  const d = await go('reem');
  assert.deepEqual([d.r.code, d.r.j.refunded, await bal('reem'), spent()], [502, 90, 500, 120]);
  // قبول بلا معرّف طلب صالح: لا متابعة ممكنة — ردّ، والحجز يبقى.
  F.submitFail = 0; F.submitBody = { request_id: '../x', status_url: 'https://queue.fal.run/a' };
  const e = await go('reem');
  assert.deepEqual([e.r.code, e.r.j.refunded, await bal('reem'), spent(), jobOf(e.id).st], [502, 90, 500, 180, 'failed']);
  F.submitBody = null;
  // المالك: التشخيص له وحده وبلا رابط ولا مفتاح.
  fresh('omran', 0);
  F.submitFail = 422; F.submitMsg = 'cannot fetch https://v3.fal.media/files/b/9/v-x.mp4 with ' + KEY;
  const o = await go('omran');
  assert.deepEqual([o.r.code, o.r.j.error, o.r.j.refunded], [502, 'failed', 0]);
  assert.equal(o.r.j.__diag, 'submit 422: cannot fetch [url] with [key]');
});

test('٩ب. انقطاع بعد الخصم: حفظ «مدفوع» أو «جارٍ» يفشل، مهمّة مدفوعة يتيمة، وردّ يتعثّر — خصم واحد وردّ واحد دائمًا', async () => {
  reset(); roomy();
  // حفظ «مدفوع» تعذّر: لا إرسال، والنقاط تعود الآن.
  fresh('ann', 500);
  const a = await quote('ann');
  K.failSet = (k, v) => k === 'venh:' + a.id && v.includes('"st":"paid"');
  F.calls.length = 0;
  const ar = await call('run', { id: a.id, confirmed: true, cost: 90 }, token('ann'));
  K.failSet = null;
  assert.deepEqual([ar.code, ar.j, await bal('ann'), calls('submit').length, jobOf(a.id).st], [502, { ok: false, error: 'failed', refunded: 90 }, 500, 0, 'failed']);
  assert.equal(spent(), 60, 'الحجز يبقى — لم يرفض المزوّد شيئًا');

  // حفظ «جارٍ» تعذّر مرّتين بعد قبول المزوّد: لا خصم ثانٍ ولا إرسال ثانٍ؛ السجلّ «مدفوع» بلا طلب.
  fresh('bob', 500);
  const b = await quote('bob');
  K.failSet = (k, v) => k === 'venh:' + b.id && v.includes('"st":"running"');
  F.calls.length = 0;
  const br = await call('run', { id: b.id, confirmed: true, cost: 90 }, token('bob'));
  K.failSet = null;
  assert.deepEqual([br.code, br.j.state, await bal('bob'), jobOf(b.id).st, 'req' in jobOf(b.id)], [200, 'running', 410, 'paid', false]);
  assert.ok(logged.some((x) => /accepted as request req-\d+-0a1b2c3d but not saved as running \(cancel 202\)/.test(x.msg)), 'رقم الطلب ونتيجة الإلغاء في سجلّ المالك');
  // المزوّد قبل الطلب ولا سجلّ له عندنا (اليتيم سيردّ النقاط والنتيجة لن تُجلب): محاولة إلغاء واحدة وهو ما زال في الطابور.
  const rid = /accepted as request (req-\d+-0a1b2c3d) /.exec(logged.filter((x) => x.msg.includes(b.id)).map((x) => x.msg).join('\n'))[1];
  assert.deepEqual(calls('cancel').map((c) => [c.method, c.url, authOf(c), c.signal]), [['PUT', 'https://queue.fal.run/topaz/upscale/requests/' + rid + '/cancel', 'Key ' + KEY, true]]);
  const twice = await call('run', { id: b.id, confirmed: true, cost: 90 }, token('bob'));
  assert.deepEqual([twice.j.state, await bal('bob'), calls('submit').length], ['running', 410, 1]);
  // يتيم: قبل ٣٣٠ث «جارٍ»، وبعدها ردّ واحد وفشل.
  setJob(b.id, { paidAt: Date.now() - 329000 });
  assert.deepEqual([(await poll(b.id, 'bob')).j.state, await bal('bob')], ['running', 410]);
  setJob(b.id, { paidAt: Date.now() - 331000 });
  // الردّ يتعثّر (نداء القيد والختم لم يصل المخزن): المهمّة تبقى «مدفوعة» والمطالبة حرّة ليعيد الاستطلاع التالي.
  const refundCall = (cmds) => cmds.some((c) => c[1] === 'points:bob');
  K.failPipe = refundCall;
  const stuck = await poll(b.id, 'bob');
  assert.deepEqual([stuck.j.state, jobOf(b.id).st, kv.has('venh:settled:' + b.id), kv.get('points:bob')], ['running', 'paid', false, '410']);
  assert.ok(logged.some((x) => x.msg.includes('refund-failed') && x.msg.includes(b.id)));
  K.failPipe = null;
  // …وأمر القيد أخطأ داخل نداء أجاب: لا «رُدّت» بلا قيد — المطالبة حرّة والمهمّة «مدفوعة».
  K.pipeNull = (op, k) => op === 'INCRBY' && k === 'points:bob';
  const stuck2 = await poll(b.id, 'bob');
  K.pipeNull = null;
  assert.deepEqual([stuck2.j.state, jobOf(b.id).st, kv.has('venh:settled:' + b.id), kv.get('points:bob')], ['running', 'paid', false, '410']);
  const [p1, p2] = await Promise.all([poll(b.id, 'bob'), poll(b.id, 'bob')]);
  for (const p of [p1, p2]) assert.ok(p.j.state === 'failed' || p.j.state === 'running', p.j.state);
  assert.equal(kv.get('points:bob'), '500', 'استطلاعان متزامنان: مطالبة واحدة = ردّ واحد');
  const fin = await poll(b.id, 'bob');
  assert.deepEqual([fin.j, await bal('bob'), jobOf(b.id).why, kv.get('venh:settled:' + b.id), kv.has('venh:open:bob')], [{ ok: true, state: 'failed', id: b.id, refunded: 90 }, 500, 'orphan', '0d', false]);
  assert.deepEqual([calls('status').length + calls('result').length, calls('cancel').length], [0, 1], 'اليتيم بلا طلب: لا نداء مزوّد من الاستطلاع (الإلغاء الوحيد من التأكيد)');
  assert.equal(spent(), 120, 'حجز اليتيم يبقى');

  // مطالبة ردّ انقطع صاحبها: حديثة = انتظار، قديمة = تُفكّ ثمّ يُعاد، و«0d» = لا ردّ ثانٍ.
  fresh('cat', 500);
  const c = await go('cat');
  setJob(c.id, { st: 'paid', req: undefined, paidAt: Date.now() - 400000 });
  kv.set('venh:settled:' + c.id, '0:' + (Date.now() - 5000));
  assert.deepEqual([(await poll(c.id, 'cat')).j.state, kv.has('venh:settled:' + c.id), await bal('cat')], ['running', true, 410]);
  kv.set('venh:settled:' + c.id, '0:' + (Date.now() - 121000));
  assert.deepEqual([(await poll(c.id, 'cat')).j.state, kv.has('venh:settled:' + c.id), await bal('cat')], ['running', false, 410]);
  assert.deepEqual([(await poll(c.id, 'cat')).j.state, await bal('cat')], ['failed', 500]);
  fresh('dan', 500);
  const d = await go('dan');
  setJob(d.id, { st: 'paid', req: undefined, paidAt: Date.now() - 400000 });
  kv.set('venh:settled:' + d.id, '0d'); // رُدّت ثمّ انقطع حفظ السجلّ
  const lostClaim = await poll(d.id, 'dan');
  assert.deepEqual([lostClaim.j, await bal('dan'), jobOf(d.id).st], [{ ok: true, state: 'failed', id: d.id, refunded: 90 }, 410, 'failed'], 'السجلّ يكتمل بلا ردّ ثانٍ');
});

test('٩ج. ردّ وقع ولم يُكتب ما بعده لا يُعاد: القيد وختم «رُدّت» في نداء واحد، وجواب ضاع يُحسم بقراءة المطالبة لا بفكّها', async () => {
  reset(); roomy();
  const claimOf = (id) => 'venh:settled:' + id;
  /** كلّ كتابة بعد القيد متعذّرة: ختم المطالبة المنفرد وسجلّ «فاشل». */
  const unsaved = (id) => (k, v) => (k === claimOf(id) && v === '0d') || (k === 'venh:' + id && v.includes('"st":"failed"'));
  /** مهمّة مدفوعة يتيمة (بلا طلب عند المزوّد، مضت مهلتها): الاستطلاع التالي يردّها. */
  const orphan = async (u) => { fresh(u, 500); const g = await go(u); setJob(g.id, { st: 'paid', req: undefined, paidAt: Date.now() - 400000 }); assert.equal(await bal(u), 410); return g.id; };
  /** يشيخ مطالبة ردّ «جارٍ» (إن بقيت) فوق الدقيقتين — كأنّ ١٣٠ ثانية مضت — ثمّ يستطلع مرّتين. */
  const later = async (id, u) => {
    const v = kv.get(claimOf(id));
    if (/^0:/.test(v || '')) kv.set(claimOf(id), '0:' + (Date.now() - 130000));
    await poll(id, u);
    return poll(id, u);
  };

  // (١) القيد وقع ثمّ تعذّرت كلّ كتابة بعده (ختم المطالبة وسجلّ «فاشل»، كلٌّ بمحاولتيه): كانت المطالبة تبقى «0:وقت» فتُفكّ بعد
  //     دقيقتين ويُردّ ثانيةً (رصيد ٥٩٠ من ٥٠٠ بخصم واحد). الختم الآن مع القيد نفسه.
  const a = await orphan('eve');
  K.failSet = unsaved(a);
  const a1 = await poll(a, 'eve');
  K.failSet = null;
  assert.deepEqual([a1.j, await bal('eve'), kv.get(claimOf(a)), ttl.get(claimOf(a)), jobOf(a).st], [{ ok: true, state: 'failed', id: a, refunded: 90 }, 500, '0d', 691200, 'paid']);
  assert.deepEqual([(await later(a, 'eve')).j, await bal('eve'), jobOf(a).st], [{ ok: true, state: 'failed', id: a, refunded: 90 }, 500, 'failed'], 'السجلّ يكتمل بلا ردّ ثانٍ');
  assert.equal(logged.filter((x) => x.msg.includes(a) && /refunded 90/.test(x.msg)).length, 1, 'سطر ردّ واحد في سجلّ المالك');

  // (٢) النداء نُفّذ في المخزن وضاع جوابه: المطالبة تُقرأ قبل أيّ فكّ — «0d» = وقع القيد.
  const b = await orphan('fay');
  K.pipeLost = (cmds) => cmds.some((c) => c[1] === 'points:fay');
  const b1 = await poll(b, 'fay');
  K.pipeLost = null;
  assert.deepEqual([b1.j, await bal('fay'), kv.get(claimOf(b)), jobOf(b).st], [{ ok: true, state: 'failed', id: b, refunded: 90 }, 500, '0d', 'failed']);
  assert.deepEqual([(await later(b, 'fay')).j.state, await bal('fay')], ['failed', 500]);

  // (٣) …وضاع الجواب والمطالبة لا تُقرأ الآن: لا فكّ على عمًى — تبقى كما هي ويحسمها استطلاع تالٍ.
  const c = await orphan('gil');
  K.pipeLost = (cmds) => cmds.some((x) => x[1] === 'points:gil');
  K.failGet = (k) => k === claimOf(c);
  const c1 = await poll(c, 'gil');
  K.pipeLost = null; K.failGet = null;
  assert.deepEqual([c1.code, c1.j, await bal('gil'), kv.get(claimOf(c)), jobOf(c).st], [200, { ok: true, state: 'running', id: c }, 500, '0d', 'paid']);
  assert.deepEqual([(await later(c, 'gil')).j, await bal('gil')], [{ ok: true, state: 'failed', id: c, refunded: 90 }, 500]);

  // (٤) النداء لم يصل المخزن والمطالبة لا تُقرأ: تبقى «0:وقت» بلا قيد، وقاعدة الدقيقتين تفكّها فيُردّ مرّة واحدة.
  const d = await orphan('hal');
  K.failPipe = (cmds) => cmds.some((x) => x[1] === 'points:hal');
  K.failGet = (k) => k === claimOf(d);
  const d1 = await poll(d, 'hal');
  K.failPipe = null; K.failGet = null;
  assert.deepEqual([d1.j.state, await bal('hal'), /^0:\d+$/.test(kv.get(claimOf(d)))], ['running', 410, true]);
  assert.deepEqual([(await poll(d, 'hal')).j.state, await bal('hal')], ['running', 410], 'مطالبة حديثة = ردّ ربّما جارٍ');
  assert.deepEqual([(await later(d, 'hal')).j, await bal('hal'), kv.get(claimOf(d))], [{ ok: true, state: 'failed', id: d, refunded: 90 }, 500, '0d']);

  // (٥) فشل الإرسال بعد الخصم والكتابات اللاحقة للردّ متعذّرة، ثمّ قاعدة اليتيم بعد ستّ دقائق: ردّ واحد.
  fresh('ian', 500);
  const e = await quote('ian');
  F.submitFail = 503; F.submitMsg = 'upstream exploded';
  K.failSet = unsaved(e.id);
  const e1 = await call('run', { id: e.id, confirmed: true, cost: 90 }, token('ian'));
  K.failSet = null; F.submitFail = 0;
  assert.deepEqual([e1.code, e1.j, await bal('ian'), kv.get(claimOf(e.id)), jobOf(e.id).st], [502, { ok: false, error: 'failed', refunded: 90 }, 500, '0d', 'paid']);
  setJob(e.id, { paidAt: Date.now() - 400000 });
  assert.deepEqual([(await later(e.id, 'ian')).j, await bal('ian'), jobOf(e.id).st], [{ ok: true, state: 'failed', id: e.id, refunded: 90 }, 500, 'failed']);

  // (٦) رُدّت عند المهلة ولم يُكتب ما بعد القيد، ثمّ اكتملت عند المزوّد: لا تسليم فوق ردّ.
  fresh('joy', 500);
  F.state = 'IN_PROGRESS';
  const f = await go('joy');
  setJob(f.id, { runAt: Date.now() - (6 * 3600 + 60) * 1000 });
  K.failSet = unsaved(f.id);
  const f1 = await poll(f.id, 'joy');
  K.failSet = null;
  assert.deepEqual([f1.j.state, await bal('joy'), kv.get(claimOf(f.id)), jobOf(f.id).st], ['failed', 500, '0d', 'running']);
  F.state = 'COMPLETED';
  const f2 = await later(f.id, 'joy');
  assert.deepEqual([f2.j, await bal('joy'), 'url' in f2.j], [{ ok: true, state: 'failed', id: f.id, refunded: 90 }, 500, false]);
});

test('١٠. الاستطلاع والتسوية: لصاحبها وحده؛ خطأ القراءة «أعد» لا «غير موجود»؛ تعثّر جلب النتيجة ليس فشلًا؛ قياس وتسليم مرّة واحدة', async () => {
  reset(); roomy();
  fresh('reem', 500); fresh('sara', 500);
  const { id } = await go('reem');
  assert.deepEqual([(await poll(id, 'sara')).code, (await call('status', { id: 'short' })).code, (await call('status', { id: id.toUpperCase() })).code], [404, 404, 404]);
  K.failGet = (k) => k === 'venh:' + id;
  const kvDown = await poll(id, 'reem');
  assert.deepEqual([kvDown.code, kvDown.j], [503, { ok: false, error: 'retry' }], 'خطأ عابر لا يُضيع مهمّة مدفوعة');
  K.failGet = (k) => k === 'venh:settled:' + id || /^venh:poll:/.test(k);
  K.failSet = (k) => /^venh:poll:/.test(k);
  assert.deepEqual([(await poll(id, 'reem')).code, (await poll(id, 'reem')).j.error], [503, 'retry']);
  kv.delete('venh:poll:' + id);
  const viaRun = await call('run', { id, confirmed: true, cost: 90 }); // تأكيد مكرَّر على مهمّة مدفوعة وRedis يتعثّر: «أعد» لا «فشلت بلا خصم»
  assert.deepEqual([viaRun.code, viaRun.j], [503, { ok: false, error: 'retry' }]);
  K.failGet = null; K.failSet = null;

  F.calls.length = 0;
  const q1 = await poll(id, 'reem');
  assert.deepEqual(q1.j, { ok: true, state: 'running', id, queue: 2 });
  assert.equal(ttl.get('venh:poll:' + id), 3);
  const q2 = await call('status', { id }); // خلال ٣ ثوانٍ
  assert.deepEqual([q2.j, F.calls.length], [{ ok: true, state: 'running', id }, 1], 'استطلاعان متقاربان = نداء مزوّد واحد');
  assert.deepEqual([calls('status')[0].url, authOf(calls('status')[0])], [jobOf(id).req.s, 'Key ' + KEY]);
  F.state = 'IN_PROGRESS';
  assert.deepEqual((await poll(id, 'reem')).j, { ok: true, state: 'running', id, queue: null });
  F.statusFail = 502;
  assert.equal((await poll(id, 'reem')).j.state, 'running', 'تعثّر الاستطلاع ليس فشلًا');
  F.statusFail = 0; F.state = 'COMPLETED';
  // جلب النتيجة يتعثّر (503 عارٍ، 429 بجسم، انقطاع) ثمّ ينجح: تسليم بلا أيّ ردّ.
  F.resultPlan = [() => new Response('Service Unavailable', { status: 503 }), () => json({ detail: 'Too many requests' }, 429)];
  assert.equal((await poll(id, 'reem')).j.state, 'running');
  assert.equal((await poll(id, 'reem')).j.state, 'running');
  F.resultThrow = true;
  assert.equal((await poll(id, 'reem')).j.state, 'running');
  F.resultThrow = false;
  assert.deepEqual([await bal('reem'), kv.has('venh:settled:' + id), jobOf(id).st], [410, false, 'running']);
  F.calls.length = 0;
  const done = await poll(id, 'reem');
  assert.deepEqual(done.j, { ok: true, state: 'done', id, url: OUT_URL, sec: 10, cost: 90 });
  assert.deepEqual([calls('result')[0].url, authOf(calls('result')[0])], [jobOf(id).req.r, 'Key ' + KEY]);
  assert.deepEqual(calls('meta').map((c) => c.json.media_url), [OUT_URL], 'قياس المخرج مرّة');
  assert.equal(await require(rp('api/_lib/our-media.js')).isOurMedia(OUT_URL), true, 'ناتج مدفوع — لا يُعدّ على سقف التنزيل');
  const costKey = 'cost:' + today().slice(0, 7) + ':reem:media';
  assert.equal(kv.get(costKey), '600000', 'تكلفتنا (٠٫٦٠$) في تقرير المالك');
  const j = jobOf(id);
  assert.deepEqual([j.st, j.out, kv.get('venh:settled:' + id), kv.has('venh:open:reem'), kv.get('venh:last:reem')], ['done', OUT_URL, '1', false, id]);
  assert.ok(ttl.get('venh:' + id) > 172700 && ttl.get('venh:' + id) <= 172800, 'يومان من بدء التشغيل');
  F.calls.length = 0;
  assert.deepEqual((await poll(id, 'reem')).j, done.j);
  assert.deepEqual((await call('run', { id, confirmed: true, cost: 90 })).j, done.j);
  assert.deepEqual([F.calls.length, kv.get(costKey), await bal('reem'), spent()], [0, '600000', 410, 60], 'لا قياس ولا خصم ثانٍ');
  assert.equal((await poll(id, 'sara')).code, 404);
  // بعد ٤٨ ساعة من البدء: انتهت — لا وعد بملفّ حذفه المزوّد.
  setJob(id, { runAt: Date.now() - 172801000 });
  assert.deepEqual((await poll(id, 'reem')).j, { ok: true, state: 'gone', id });

  // تسوية متزامنة: استطلاعان يصلان النتيجة معًا — قياس واحد وتسليم للاثنين.
  fresh('twin', 500);
  const t = await go('twin');
  F.resultDelay = 120; F.calls.length = 0; // واسعة عمدًا: الثاني يجب أن يبدأ والأوّل ما زال ينتظر النتيجة
  const first = poll(t.id, 'twin');
  await sleep(5);
  const [d1, d2] = await Promise.all([first, poll(t.id, 'twin')]);
  F.resultDelay = 0;
  assert.deepEqual([d1.j.state, d2.j.state, calls('result').length, calls('meta').length], ['done', 'done', 2, 1]);
  assert.equal(kv.get('cost:' + today().slice(0, 7) + ':twin:media'), '600000', 'التكلفة سُجّلت مرّة');

  // استطلاع ثانٍ (نافذة أخرى) يصل وصاحب المطالبة ما زال يقيس المخرج: الرابط لا يُسلَّم إلّا وقد عُلِّم «من نواتجنا» — وإلّا عدّ وسيط
  // التنزيل جلبه على سقف الوسائط الخارجيّة (أو ردّه 429 فتُركن نتيجة مدفوعة).
  fresh('tabs', 500);
  const tb = await go('tabs');
  const OUT2 = CDN + '/files/out/second-SIGNED-8.mp4';
  const ours = (u) => require(rp('api/_lib/our-media.js')).isOurMedia(u);
  F.result = () => json({ video: { url: OUT2, content_type: 'video/mp4' } });
  assert.equal(await ours(OUT2), false);
  let openMeta;
  F.metaHold = new Promise((r) => { openMeta = r; });
  F.calls.length = 0;
  let firstDone = false;
  const claimer = poll(tb.id, 'tabs').then((r) => { firstDone = true; return r; });
  for (let i = 0; i < 400 && !calls('meta').length; i++) await sleep(5);
  assert.deepEqual([calls('meta').length, firstDone], [1, false], 'الأوّل معلَّق في قياس المخرج');
  const other2 = await poll(tb.id, 'tabs');
  assert.deepEqual([other2.j.state, other2.j.url, firstDone], ['done', OUT2, false]);
  assert.equal(await ours(OUT2), true, 'عُلِّم قبل أن يحمله أيّ جواب');
  openMeta();
  F.metaHold = null;
  assert.deepEqual([(await claimer).j.url, calls('meta').length, await bal('tabs')], [OUT2, 1, 410]);
  F.result = null;

  // طبقة حُذفت من الجدول بعد الخصم (نشرة لاحقة): المهمّة المدفوعة تُسوّى مع ذلك ولا تعلق على «أعد».
  fresh('gone', 500);
  const g = await go('gone');
  setJob(g.id, { tier: 'retired' });
  assert.deepEqual([(await poll(g.id, 'gone')).j.state, await bal('gone')], ['done', 410]);

  // الاستطلاع يعمل والميزة موقوفة: مهمّة جارية تُسوّى بعد إطفاء المفتاح.
  fresh('offy', 500);
  const o = await go('offy');
  process.env.VIDEO_ENHANCE = 'off';
  kv.set('venh:open:offy', 'f'.repeat(24)); // الخانة صارت لمهمّة أخرى: تسوية هذه لا تفكّها
  assert.equal((await poll(o.id, 'offy')).j.state, 'done');
  assert.deepEqual([kv.get('venh:open:offy'), kv.get('venh:last:offy')], ['f'.repeat(24), o.id]);
  assert.equal((await call('run', { id: o.id }, token('offy'))).j.state, 'done');
});

test('١٠ب. الفشل عند المزوّد: «اكتملت» مع خطأ أو نتيجة بلا رابط = ردّ واحد بالنقاط لاستطلاعين؛ وبعد ٦ ساعات إلغاء ثمّ ردّ', async () => {
  reset(); roomy();
  fresh('reem', 500, { media: { mix: { plan: 'media_basic', at: Date.now() - 86400000 } } });
  kv.set('media:mix:reem', '1250');
  kv.set('media:tix:reem', JSON.stringify([{ p: 90, f: 103, k: 'mix' }])); // تذكرة وسائط بالمبلغ نفسه — الردّ لا يمسّها
  const { id } = await go('reem');
  F.state = 'COMPLETED'; F.statusErr = 'Runtime error: out of memory'; F.calls.length = 0;
  F.statusDelay = 120; // واسعة عمدًا: مؤقّتات ويندوز خشنة (~١٦م.ث)
  const first = poll(id, 'reem');
  await sleep(5);
  kv.delete('venh:poll:' + id); // كأنّ مهلة التهدئة انقضت بين الاستطلاعين
  const [a, b] = await Promise.all([first, call('status', { id })]);
  F.statusDelay = 0;
  for (const p of [a, b]) assert.ok(p.j.state === 'failed' || p.j.state === 'running', p.j.state);
  assert.equal(calls('status').length, 2, 'الاستطلاعان وصلا المزوّد معًا');
  assert.deepEqual((await poll(id, 'reem')).j, { ok: true, state: 'failed', id, refunded: 90 });
  assert.deepEqual([await bal('reem'), kv.get('media:mix:reem'), JSON.parse(kv.get('media:tix:reem')).length], [500, '1250', 1], 'ردّ واحد وبالنقاط وحدها');
  assert.equal(calls('result').length, 0, 'خطأ معلن في الحالة — لا جلب');
  assert.deepEqual([jobOf(id).why, spent(), kv.get('venh:last:reem')], ['provider', 60, id], 'الحجز يبقى');
  F.statusErr = null;

  for (const [why, result] of [['بلا رابط', () => json({ video: null })], ['خطأ معلن 422', () => json({ detail: [{ msg: 'bad input' }] }, 422)], ['error_type', () => json({ error_type: 'runtime_error' }, 500)], ['رابط غير https', () => json({ video: { url: 'http://insecure.example/v.mp4' } })]]) {
    fresh('reem', 500);
    const g = await go('reem');
    F.result = result;
    assert.deepEqual([(await poll(g.id, 'reem')).j, await bal('reem')], [{ ok: true, state: 'failed', id: g.id, refunded: 90 }, 500], why);
    F.result = null;
  }

  // بعد ٦ ساعات والمهمّة ما زالت تعمل: محاولة إلغاء ثمّ ردّ يُسجَّل خسارةً محتملة.
  fresh('slow', 500);
  F.state = 'IN_PROGRESS';
  const s = await go('slow');
  setJob(s.id, { runAt: Date.now() - (6 * 3600 + 60) * 1000 });
  F.calls.length = 0;
  const late = await poll(s.id, 'slow');
  assert.deepEqual([late.j, await bal('slow'), jobOf(s.id).why], [{ ok: true, state: 'failed', id: s.id, refunded: 90 }, 500, 'deadline']);
  assert.deepEqual(calls('cancel').map((c) => [c.method, c.url, authOf(c)]), [['PUT', jobOf(s.id).req.c, 'Key ' + KEY]]);
  assert.ok(logged.some((x) => x.msg.includes(s.id) && x.msg.includes('possible loss')));
  // قبل ٦ ساعات لا إلغاء.
  fresh('wait', 500);
  const w = await go('wait');
  setJob(w.id, { runAt: Date.now() - (6 * 3600 - 60) * 1000 });
  F.calls.length = 0;
  assert.deepEqual([(await poll(w.id, 'wait')).j.state, calls('cancel').length], ['running', 0]);
  // بعد ٦ ساعات والإلغاء يجيب «اكتملت أصلًا»: لا ردّ — الاستطلاع التالي يسلّم.
  setJob(w.id, { runAt: Date.now() - (6 * 3600 + 600) * 1000 });
  F.statusFail = 500;
  F.cancel = () => json({ status: 'ALREADY_COMPLETED' }, 400);
  assert.deepEqual([(await poll(w.id, 'wait')).j.state, await bal('wait'), calls('cancel').length], ['running', 410, 1]);
  F.statusFail = 0; F.state = 'COMPLETED';
  const delivered = await poll(w.id, 'wait');
  assert.deepEqual([delivered.j.state, delivered.j.url, await bal('wait')], ['done', OUT_URL, 410]);
  F.cancel = () => json({ status: 'CANCELLATION_REQUESTED' }, 202);

  // التسوية كسولة والواجهة تدعو المستخدم للعودة لاحقًا: أوّل استطلاع بعد ٧ ساعات مسار عاديّ. خطأ عابر واحد فيه لا يردّ نقاط مهمّة
  // اكتملت ودُفع ثمنها (كان: «فشلت» ورصيد ٥٠٠ والنتيجة لا تُجلب أبدًا) — الردّ فقط حين يقول المزوّد إنّ الطلب ما زال مفتوحًا.
  const aged = async (u, hours, state) => { fresh(u, 500); F.state = state || 'COMPLETED'; const g = await go(u); setJob(g.id, { runAt: Date.now() - hours * 3600 * 1000 }); F.calls.length = 0; return g.id; };
  const DONE_ALREADY = () => json({ status: 'ALREADY_COMPLETED' }, 400);
  const blip = async (u, hours, fault, cancel) => {
    const id = await aged(u, hours);
    F.cancel = cancel;
    Object.assign(F, fault);
    const first = await poll(id, u);
    assert.deepEqual([first.j.state, await bal(u), kv.has('venh:settled:' + id), calls('cancel').length], ['running', 410, false, 1], u + ': الخطأ العابر ليس فشلًا');
    Object.assign(F, { statusFail: 0, resultPlan: [], resultThrow: false });
    const next = await poll(id, u);
    assert.deepEqual([next.j.state, next.j.url, await bal(u)], ['done', OUT_URL, 410], u + ': الاستطلاع التالي يسلّم بلا ردّ');
  };
  await blip('h8', 8, { statusFail: 502 }, DONE_ALREADY); // بعد ٨ ساعات: الحالة 502 مرّة، والإلغاء «اكتملت أصلًا»
  await blip('h8b', 8, { resultPlan: [() => new Response('Service Unavailable', { status: 503 })] }, DONE_ALREADY); // اكتملت والنتيجة 503 عارٍ مرّة
  await blip('h30', 30, { resultPlan: [() => json({ detail: 'Too many requests' }, 429)] }, DONE_ALREADY);
  await blip('h6', 6.2, { statusFail: 502 }, () => new Response('bad gateway', { status: 502 })); // الحالة والإلغاء 502 معًا
  await blip('h20', 20, { statusFail: 401 }, () => json({ detail: 'Invalid key' }, 401)); // مفتاح بُدّل: 401 على النداءين
  await blip('h9', 9, { statusFail: 429 }, () => json({ detail: 'Too many requests' }, 429));
  await blip('h9b', 9, { statusFail: 500 }, () => { throw new Error('socket hang up'); }); // الإلغاء نفسه انقطع
  await blip('h8c', 8, { resultThrow: true }, DONE_ALREADY); // جلب النتيجة انقطع
  // الردّ حين يقول المزوّد إنّ الطلب ما زال مفتوحًا (202 أُلغي) أو لا يعرفه (404)…
  for (const [u, cancel] of [['open202', () => json({ status: 'CANCELLATION_REQUESTED' }, 202)], ['open404', () => json({ status: 'NOT_FOUND' }, 404)]]) {
    const id = await aged(u, 7, 'IN_PROGRESS');
    F.cancel = cancel; F.statusFail = 500;
    assert.deepEqual([(await poll(id, u)).j, await bal(u), jobOf(id).why, calls('cancel').length], [{ ok: true, state: 'failed', id, refunded: 90 }, 500, 'deadline', 1], u);
    F.statusFail = 0;
  }
  // …أو حين تمضي نافذة الناتج (٤٨ ساعة من البدء) بلا نتيجة، مهما أجاب الإلغاء: قبلها جارية، وبعدها ردّ واحد.
  for (const [u, fault] of [['late1', { statusFail: 502 }], ['late2', { resultThrow: true }], ['late3', { resultPlan: Array.from({ length: 4 }, () => () => new Response('Service Unavailable', { status: 503 })) }]]) {
    const id = await aged(u, 47.9);
    F.cancel = () => new Response('bad gateway', { status: 502 });
    Object.assign(F, fault);
    assert.deepEqual([(await poll(id, u)).j.state, await bal(u)], ['running', 410], u + ': داخل النافذة');
    setJob(id, { runAt: Date.now() - 49 * 3600 * 1000 });
    assert.deepEqual([(await poll(id, u)).j, await bal(u), jobOf(id).why], [{ ok: true, state: 'failed', id, refunded: 90 }, 500, 'deadline'], u + ': بعد النافذة');
    assert.deepEqual([(await poll(id, u)).j.state, await bal(u), kv.has('venh:open:' + u)], ['failed', 500, false], u + ': ردّ واحد والخانة فُكّت');
    Object.assign(F, { statusFail: 0, resultPlan: [], resultThrow: false });
  }
  F.cancel = () => json({ status: 'CANCELLATION_REQUESTED' }, 202);
  // قبل ٦ ساعات لا إلغاء ولو انقطع جلب النتيجة.
  const young = await aged('young', 5);
  F.resultThrow = true;
  assert.deepEqual([(await poll(young, 'young')).j.state, calls('cancel').length, await bal('young')], ['running', 0, 410]);
  F.resultThrow = false;

  // رُدّت ثمّ وصلت النتيجة: لا تسليم فوق ردّ ولا ردّ ثانٍ.
  fresh('race', 500);
  F.state = 'COMPLETED';
  const r = await go('race');
  kv.set('venh:settled:' + r.id, '0d');
  await points.refundPointsOnly('race', 90);
  assert.deepEqual([(await poll(r.id, 'race')).j, await bal('race')], [{ ok: true, state: 'failed', id: r.id, refunded: 90 }, 500]);

  // روابط حالة خارج طابور المزوّد لا تُنادى أبدًا — تُبنى من المعرّف، والمفتاح لا يُرسل لمضيف آخر.
  fresh('evil', 500);
  F.submitBody = { request_id: 'req-evil-12345678', status_url: 'https://evil.example/status', response_url: 'https://queue.fal.run.evil.example/r', cancel_url: 'http://queue.fal.run/x/cancel' };
  const e = await go('evil');
  F.submitBody = null;
  const base = 'https://queue.fal.run/topaz/upscale/video/generative/requests/req-evil-12345678';
  assert.deepEqual(jobOf(e.id).req, { id: 'req-evil-12345678', s: base + '/status', r: base, c: base + '/cancel' });
  setJob(e.id, { req: { id: 'req-evil-12345678', s: 'https://evil.example/status', r: 'https://evil.example/r', c: 'https://evil.example/cancel' }, runAt: Date.now() - 7 * 3600 * 1000 });
  F.state = 'IN_PROGRESS'; F.calls.length = 0;
  await poll(e.id, 'evil');
  assert.deepEqual(F.calls.map((c) => c.url), [base + '/status', base + '/cancel'], 'سجلّ عُبث به لا يوجّه المفتاح لمضيف آخر');
  assert.ok(F.calls.every((c) => c.url.startsWith('https://queue.fal.run/')));
});

test('١١. التصحيح والقاطع: مخرج أغلى من التقدير يرفع عدّاد اليوم ويُسجَّل؛ ثلاثة أضعاف وثلاثة دولارات تقطع غير المالك حتّى يفتح المالك', async () => {
  reset(); roomy();
  fresh('reem', 500); fresh('omran', 0); fresh('next', 500);
  let mark = logged.length;
  const a = await go('reem');
  F.state = 'COMPLETED';
  F.outMedia = { duration: 13, frame_count: 390, resolution: { width: 1920, height: 1080 } }; // +٣٠٪ إطارات: ٨ أرصدة لا ٦
  const da = await poll(a.id, 'reem');
  assert.deepEqual([da.j.state, spent(), kv.has('venh:trip')], ['done', 80, false]);
  assert.ok(logged.slice(mark).some((x) => x.msg.includes(a.id) && x.msg.includes('80c') && x.msg.includes('60c')), 'فرق التكلفة في سجلّ المالك');
  assert.equal(kv.get('cost:' + today().slice(0, 7) + ':reem:media'), String(600000 + 800000), 'التكلفة الحقيقيّة لا التقدير');
  // تعذّر قياس المخرج: التسليم يمضي بالتقدير.
  fresh('reem', 500);
  const b = await go('reem');
  F.metaFail = 500;
  assert.deepEqual([(await poll(b.id, 'reem')).j.state, spent()], ['done', 140]);
  F.metaFail = 0;
  // …وبلا قياس لا تصحيح ولا قاطع — فيُكتب للمالك سطر (كان صمتًا تامًّا حيث سقطت الحماية الوحيدة بعد الصرف)؛ ولا سطر لمخرج قيس.
  const unrec = (id) => logged.filter((x) => x.msg.includes(id) && x.msg.includes('delivered unreconciled'));
  assert.deepEqual([unrec(b.id).length, unrec(a.id).length], [1, 0]);
  assert.match(unrec(b.id)[0].msg, new RegExp('^job ' + b.id + ' delivered unreconciled \\(output not measured\\), estimate 60c, request req-\\d+-0a1b2c3d$'));
  // مخرج أرخص من التقدير لا يُنقص العدّاد.
  fresh('reem', 500);
  const c = await go('reem');
  F.outMedia = { duration: 5, frame_count: 100, resolution: { width: 1920, height: 1080 } };
  assert.deepEqual([(await poll(c.id, 'reem')).j.state, spent()], ['done', 200]);

  // المخرج بدقّة 4K (جدول أغلى): ١٣ رصيدًا مقابل ٦ — فوق ١٫٢٥ ودون القاطع.
  fresh('reem', 500);
  const d = await go('reem');
  F.outMedia = { duration: 10, frame_count: 300, resolution: { width: 3840, height: 2160 } };
  assert.deepEqual([(await poll(d.id, 'reem')).j.state, spent(), kv.has('venh:trip')], ['done', 200 + 60 + 70, false]);

  // ١٩٠٠ إطار = ٣٧ رصيدًا (٣٧٠ سنتًا) مقابل ٦٠: ≥ ٣ أضعاف وفرق ≥ ٣ دولارات ← القاطع. والنتيجة تُسلَّم مع ذلك.
  fresh('reem', 500);
  const e = await go('reem');
  F.outMedia = { duration: 63, frame_count: 1900, resolution: { width: 1920, height: 1080 } };
  mark = logged.length;
  const de = await poll(e.id, 'reem');
  assert.deepEqual([de.j.state, de.j.url], ['done', OUT_URL]);
  const code = kv.get('venh:trip');
  assert.match(code, /^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
  assert.equal(ttl.get('venh:trip'), 2592000);
  assert.ok(logged.slice(mark).some((x) => x.msg.includes('VIDEO_ENHANCE_UNTRIP=' + code)), 'الرمز في سجلّ المالك');
  assert.equal(spent(), 330 + 370);
  F.outMedia = { duration: 10, frame_count: 300, resolution: { width: 1920, height: 1080 } };
  F.state = 'IN_QUEUE';
  // غير المالك مقطوع من البدء (والعرض والتأكيد)، والمالك لا.
  F.calls.length = 0;
  const cut = await call('start', { size: 10, mime: 'video/mp4' }, token('next'));
  assert.deepEqual([cut.code, cut.j.error, F.calls.length, (await infoAs('next')).j.on], [503, 'unavailable', 0, false]);
  assert.deepEqual([(await call('start', { size: 10, mime: 'video/mp4' }, token('omran'))).code, (await infoAs('omran')).j.on], [200, true]);
  process.env.VIDEO_ENHANCE_UNTRIP = 'wrong-code';
  assert.equal((await call('start', { size: 10, mime: 'video/mp4' }, token('next'))).code, 503);
  process.env.VIDEO_ENHANCE_UNTRIP = ' ' + code + ' ';
  assert.deepEqual([(await call('start', { size: 10, mime: 'video/mp4' }, token('next'))).code, (await infoAs('next')).j.on], [200, true], 'يُفتح برمز السجلّ');

  // قياس أجاب ناقصًا (بلا عدد إطارات) أو انقطع: كتعذّره — تسليم بالتقدير وسطر للمالك، لا تصحيح ولا قاطع.
  for (const [u, fault] of [['nof', () => { F.outMedia = { duration: 63, resolution: { width: 1920, height: 1080 } }; }], ['cut', () => { F.metaHold = Promise.reject(new Error('socket hang up')); F.metaHold.catch(() => {}); }]]) {
    fresh(u, 500);
    F.state = 'IN_QUEUE'; F.metaHold = null;
    const g = await go(u);
    const before = spent();
    F.state = 'COMPLETED';
    fault();
    assert.deepEqual([(await poll(g.id, u)).j.state, spent(), unrec(g.id).length], ['done', before, 1], u);
  }
  F.metaHold = null;
});

test('١٢. تغيير الاسم أثناء المهمّة: الحساب نفسه يقرؤها باسمه الجديد، وغيره لا، والردّ يتبع الشاهد إلى الاسم الجديد', async () => {
  reset();
  fresh('oldname', 500); fresh('stranger', 500);
  const { id } = await go('oldname');
  assert.equal(await bal('oldname'), 410);
  // ما يفعله changeUsername: السجلّ والعدّاد ينتقلان، والقديم شاهد.
  users.set('newname', { username: 'newname', points: 410, prevUsernames: ['oldname'] });
  kv.set('points:newname', kv.get('points:oldname')); kv.delete('points:oldname');
  users.set('oldname', { deleted: true, movedTo: 'newname' });
  assert.equal((await poll(id, 'stranger')).code, 404);
  users.set('stranger', { username: 'stranger', points: 500, prevUsernames: ['someone-else'] });
  assert.equal((await poll(id, 'stranger')).code, 404);
  assert.deepEqual((await poll(id, 'newname')).j, { ok: true, state: 'running', id, queue: 2 });
  F.state = 'COMPLETED'; F.statusErr = 'failed';
  assert.deepEqual((await poll(id, 'newname')).j, { ok: true, state: 'failed', id, refunded: 90 });
  assert.deepEqual([kv.get('points:newname'), kv.has('points:oldname')], ['500', false], 'النقاط عادت للحساب باسمه الحيّ لا لشاهد');
});

test('١٣. لا تسريب: لا اسم مزوّد أو نموذج في أيّ ردّ لغير المالك، ولا رابط ولا مفتاح في سجلّ أو تشخيص، و__diag للمالك وحده', () => {
  const LEAK = /\bfal\b|fal\.(ai|run|media)|topaz|starlight|proteus/i;
  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (!v || typeof v !== 'object') return v;
    const o = {};
    for (const [k, x] of Object.entries(v)) if (k !== 'upload' && k !== 'url') o[k] = strip(x);
    return o;
  };
  assert.ok(LEAK.test(OUT_URL) && LEAK.test(KEY) && !LEAK.test('false') && !LEAK.test('default'), 'النمط يلتقط ما يجب ولا يلتقط «false»');
  const others = seen.filter((r) => r.who !== 'omran');
  const owner = seen.filter((r) => r.who === 'omran');
  assert.ok(others.length > 150 && owner.length > 15, 'ردود كافية: ' + others.length + ' / ' + owner.length);
  const states = new Set(others.map((r) => (r.j && (r.j.error || r.j.state || (r.j.quote && 'quote') || (r.j.upload && 'start'))) || 'info'));
  for (const s of ['start', 'quote', 'running', 'done', 'failed', 'gone', 'upload', 'quoted', 'busy', 'retry', 'limit', 'unavailable', 'failed', 'points_insufficient', 'format', 'fps', 'resolution', 'too_long', 'too_big', 'not_uploaded', 'not_found', 'auth', 'banned', 'method', 'bad_request']) assert.ok(states.has(s), 'حالة لم تُفحص: ' + s);
  for (const r of others) {
    const text = JSON.stringify(strip(r.j));
    assert.doesNotMatch(text, LEAK, r.step + ' ' + r.code + ': ' + text);
    assert.ok(!text.includes('__diag'), '__diag لغير المالك: ' + text);
    assert.ok(!text.includes('https://') && !text.includes(KEY), 'رابط خارج حقليه أو مفتاح: ' + text);
  }
  // الروابط تظهر في حقلين فقط: هدف رفع المتصفّح، وناتج مهمّة صاحبها.
  assert.ok(others.some((r) => r.j && typeof r.j.upload === 'string' && r.j.upload.startsWith(CDN + '/files/upload/')));
  assert.ok(others.some((r) => r.j && r.j.url === OUT_URL));
  const diags = owner.filter((r) => r.j && r.j.__diag).map((r) => r.j.__diag);
  assert.ok(diags.length >= 3, 'المالك يرى التشخيص');
  const logs = JSON.stringify([logged, con, diags]);
  assert.ok(logged.length > 5 && con.length > 5);
  for (const bad of [KEY, 'fal.media', 'UPLOAD-SIG', 'result-SIGNED', 'https://', 'X-Signature']) assert.ok(!logs.includes(bad), 'في السجلّ أو التشخيص: ' + bad);
  assert.ok(logged.every((x) => x.scope === 'video-enhance' && x.meta && x.meta.action === 'video-enhance'));
});

test('١٤. الأسلاك: الموجّه القائم (لا ملفّ جديد تحت api/)، سلّة تغيير الاسم، توثيق البيئة، والمفتاح يُقرأ داخل المعالج عند كلّ نداء', async () => {
  reset();
  const router = read('api/video.js');
  assert.ok(router.includes("    case 'video-enhance': return require('./_lib/video-enhance.js'); // v-video-enhance-pro\n"));
  assert.equal(fs.existsSync(path.join(root, 'api/video-enhance.js')), false, 'حدّ دوالّ Vercel: لا نقطة دخول جديدة');
  assert.ok(require(rp('api/_lib/_usage.js')).MOVE_BUCKETS.includes('video-enhance'));
  const src = read('api/_lib/video-enhance.js');
  assert.ok(src.includes("usage.checkAndConsumeCustom(body.token, null, ip, 'video-enhance', DAILY)"), 'السلّة حرفيّة ليراها مستخرج rename-move');
  assert.ok(src.includes("spendPoints(user, q.cost, 'video_enhance')") && !/planVideoOnly/.test(src) && !/refundPoints\(/.test(src), 'خصم وردّ بالنقاط وحدها');
  assert.ok(!/kvPutJSON/.test(src), 'لا كتابة بلا مدّة');
  const env = read('api/_lib/env.js');
  const example = read('.env.example');
  for (const k of ENV) { assert.ok(env.includes(k + ':'), 'env.js: ' + k); assert.ok(example.includes('# ' + k + '='), '.env.example: ' + k); }
  assert.equal(require(rp('api/_lib/env.js')).SPEC.VIDEO_ENHANCE[0], 'tunable');
  assert.ok(!ENV.some((k) => /KEY|SECRET|TOKEN/.test(k)), 'لا اسم جديد يبدو سرًّا');

  // المفتاح: لا قراءة في نطاق الوحدة — يتبع البيئة عند كلّ نداء، وغيابه «متوقّف» لا انهيار.
  for (const line of src.split('\n').filter((l) => l.includes('process.env'))) assert.ok(/^\s+\S|^const \w+ = \(\) =>/.test(line), 'قراءة بيئة في نطاق الوحدة: ' + line);
  fresh('reem', 500);
  process.env.FAL_KEY = '  rotated-key-xyz  ';
  F.calls.length = 0;
  assert.equal((await call('start', { size: 10, mime: 'video/mp4' })).code, 200);
  assert.equal(authOf(calls('initiate')[0]), 'Key rotated-key-xyz');
  delete process.env.FAL_KEY;
  assert.deepEqual([(await call('status', { id: 'a'.repeat(24) })).code, (await call('run', { id: 'a'.repeat(24) })).j.error], [503, 'unavailable']);
  process.env.FAL_KEY = KEY;

  // نقطة الدخول تُحمَّل في بيئة عارية (لا مفتاح ولا سرّ جلسة): المعالج يُحمَّل عند الطلب لا عند الإقلاع.
  const bare = spawnSync(process.execPath, ['-e', 'require(' + JSON.stringify(rp('api/video.js')) + ')'], { env: { PATH: process.env.PATH, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 20000 });
  assert.equal(bare.status, 0, bare.stderr);

  // عبر الموجّه الحقيقيّ: الإجراء موصول، وno-store، والاستعلام GET.
  const handler = require(rp('api/video.js'));
  const res = { code: 200, j: null, headers: {}, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, setHeader(k, v) { res.headers[String(k).toLowerCase()] = v; return res; }, end() { return res; } };
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + token('reem') }, query: { action: 'video-enhance', step: 'info' } }, res);
  assert.deepEqual([res.code, res.j.ok, res.j.on, res.j.rate, res.headers['cache-control']], [200, true, true, 9, 'no-store']);
  const res2 = { code: 200, j: null, status(c) { res2.code = c; return res2; }, json(j) { res2.j = j; return res2; }, setHeader() { return res2; }, end() { return res2; } };
  await handler({ method: 'POST', headers: {}, query: { action: 'video-enhance', step: 'start' }, body: JSON.stringify({ token: token('reem'), size: enh.MAX_BYTES + 1, mime: 'video/mp4' }) }, res2);
  assert.deepEqual([res2.code, res2.j], [413, { ok: false, error: 'too_big' }], 'جسم نصّيّ يُحلَّل');
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// الواجهة: js/video.js الحقيقيّ في سياق معزول — DOM مصغَّر يكفي قسم «تحسين فيديو»، ساعة ومؤقّتات افتراضيّة، والخادم إمّا المعالج
// الحقيقيّ أعلاه (فوق المزوّد المزيّف نفسه) أو ردود مكتوبة لما لا ينتجه المعالج بسهولة (انقطاع، جواب مشوَّه، خمسون دقيقة).
// ما يُثبَت: لا خصم قبل التأكيد، تأكيد واحد لنقرتين، «لم يُخصم شيء» لا تُكتب إلّا حين يُعرف، بعد التأكيد الحالة عند الخادم هي
// الحقيقة وخطأ الاستطلاع ليس فشل المهمّة، الإلغاء قبل الخصم فقط، والمسار المجّانيّ لا يلمس الشبكة.
const vm = require('node:vm');
const VJS = read('js/video.js');
const PRO_KEYS = ['vclPro', 'vclProNotice', 'vclProUploading', 'vclProQuote', 'vclProConfirm', 'vclProWorking', 'vclProDone', 'vclProLater',
  'vclProNoPoints', 'vclProTooLong', 'vclProSpec', 'vclProLimit', 'vclProUnavailable', 'vclProUploadFail', 'vclProFail', 'vclProRefunded'];
const PRO_HOLES = { vclProNotice: ['n', 'm', 's'], vclProQuote: ['s', 'n', 'p'], vclProConfirm: ['n'], vclProDone: ['n', 's'], vclProNoPoints: ['p', 'n'], vclProTooLong: ['s'], vclProRefunded: ['n'] };
const LEAK_RE = /\bfal\b|fal\.(ai|run|media)|topaz|starlight|proteus/i;
// القاموس الأساسيّ: أوّل ورود للمفتاح عربيّ والثاني إنجليزيّ.
const DICT = { ar: {}, en: {} };
for (const m of read('js/app-03-i18n-data.js').matchAll(/\b(vcl\w+): "([^"]*)"/g)) (m[1] in DICT.ar ? DICT.en : DICT.ar)[m[1]] = m[2];
const EN = (k, v) => Object.entries(v || {}).reduce((s, [x, y]) => s.split('{' + x + '}').join(String(y)), DICT.en[k]);
const NO_CHARGE_RE = /no points were charged|nothing was charged|nothing charged/i;
const vfile = (o) => Object.assign({ name: 'My Holiday Clip.mp4', type: 'video/mp4', size: MP4.length, bytes: MP4 }, o);
const INFO = { ok: true, on: true, rate: 9, minSec: 3, maxSec: 30, maxMB: 80, job: null };
const JID = 'ab'.repeat(12);
const JID2 = 'cd'.repeat(12);
const R = (status, body) => ({ status, body });

/** DOM مصغَّر: innerHTML لقالب القسم، وquerySelector بالمعرّف والصنف والخاصّيّة والوسم والسليل — ما يستعمله clRender لا أكثر. */
function miniDom() {
  const all = (el, out) => { const list = out || []; list.push(el); for (const c of el.children) all(c, list); return list; };
  const simple = (el, part) => (part.match(/^[a-z]+|#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]/g) || []).every((t) => {
    if (t[0] === '#') return el.id === t.slice(1);
    if (t[0] === '.') return el.cls.has(t.slice(1));
    if (t[0] === '[') { const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(t); return m[1] in el.attrs && (m[2] === undefined || el.attrs[m[1]] === m[2]); }
    return el.tagName === t.toUpperCase();
  });
  const matches = (el, sel) => {
    const parts = sel.trim().split(/\s+/);
    if (!simple(el, parts.pop())) return false;
    let p = el.parentElement;
    while (parts.length) { const want = parts.pop(); while (p && !simple(p, want)) p = p.parentElement; if (!p) return false; p = p.parentElement; }
    return true;
  };
  const mk = (tag, attrs) => {
    const el = { tagName: String(tag).toUpperCase(), attrs: Object.assign({}, attrs), children: [], parentElement: null, style: {}, dataset: {}, textContent: '', cls: new Set() };
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach((x) => el.cls.add(x));
      if (k.startsWith('data-')) el.dataset[k.slice(5)] = v;
    }
    el.id = el.attrs.id || '';
    el.classList = { add: (x) => { el.cls.add(x); }, remove: (x) => { el.cls.delete(x); }, contains: (x) => el.cls.has(x), toggle: (x, on) => { const want = on === undefined ? !el.cls.has(x) : !!on; if (want) el.cls.add(x); else el.cls.delete(x); return want; } };
    el.setAttribute = (k, v) => { el.attrs[k] = String(v); if (k.startsWith('data-')) el.dataset[k.slice(5)] = String(v); };
    el.getAttribute = (k) => (k in el.attrs ? el.attrs[k] : null);
    el.removeAttribute = (k) => { delete el.attrs[k]; };
    el.appendChild = (c) => { c.parentElement = el; el.children.push(c); return c; };
    el.querySelectorAll = (sel) => all(el).filter((x) => x !== el && matches(x, sel));
    el.querySelector = (sel) => el.querySelectorAll(sel)[0] || null;
    el.addEventListener = () => {};
    Object.defineProperty(el, 'innerHTML', { get: () => '', set: (html) => { el.children = []; parse(String(html), el); } });
    Object.defineProperty(el, 'firstElementChild', { get: () => el.children[0] || null });
    Object.defineProperty(el, 'className', { get: () => [...el.cls].join(' '), set: (v) => { el.cls = new Set(String(v).split(/\s+/).filter(Boolean)); } });
    return el;
  };
  const parse = (html, parent) => {
    const re = /<(\/)?([a-z]+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>|([^<]+)/g;
    let cur = parent;
    let m;
    while ((m = re.exec(html))) {
      if (m[4] !== undefined) { cur.textContent += m[4]; continue; }
      if (m[1]) { cur = cur.parentElement; continue; }
      const attrs = {};
      for (const a of m[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? '' : a[2];
      const el = mk(m[2], attrs);
      cur.appendChild(el);
      if (m[2] !== 'input') cur = el;
    }
    assert.equal(cur, parent, 'قالب القسم متوازن الوسوم');
  };
  return { mk, all };
}

/** خادم مكتوب: لكلّ خطوة ردود بالترتيب وآخرها يتكرّر ('confirm' = run مع confirmed). 'net' = انقطاع الشبكة؛ دالّة = تُنادى بالطلب. */
function scripted(plan) {
  const count = {};
  return async (rec) => {
    const key = rec.step === 'run' && rec.body && rec.body.confirmed ? 'confirm' : rec.step;
    const list = plan[key];
    if (!list) throw new Error('طلب لم يُتوقَّع: ' + key);
    count[key] = (count[key] || 0) + 1;
    let r = list[Math.min(count[key], list.length) - 1];
    if (typeof r === 'function') r = await r(rec, count[key]);
    if (r === 'net') throw new TypeError('Failed to fetch');
    return r;
  };
}
/** المعالج الحقيقيّ كما يناديه Vercel: الاستعلام من الرابط، الجسم JSON، والترويسات بأحرف صغيرة. */
async function liveServer(rec) {
  // الواجهة تستطلع كلّ ٥ث فأكثر: مهلة تهدئة الاستطلاع (٣ث) انقضت بين نداءين (Redis المزيّف لا يُنهي المدد).
  if (rec.step === 'status') for (const k of [...kv.keys()]) if (k.startsWith('venh:poll:')) kv.delete(k);
  const res = { code: 200, j: undefined, status(x) { res.code = x; return res; }, json(j) { res.j = j; return res; }, setHeader() { return res; }, end() { return res; } };
  await enh({ method: rec.method, headers: rec.headers, query: rec.query, body: rec.body }, res);
  return { status: res.code, body: res.j };
}

/** نسخة من الواجهة: js/video.js كما هو، مع كشف حالته الداخليّة عند نقطة الحقن التي يستعملها video-first-frame. */
function client(o) {
  const opt = o || {};
  const c = {
    clock: 5e6, timers: [], fetches: [], xhrs: [], store: opt.store || new Map(), logins: [], wallets: [], swallowed: [], revoked: [], notified: 0, blobs: 0, inflight: 0,
    tok: opt.tok || '', user: opt.user || '', server: opt.server, holdPut: false, putStatus: opt.putStatus === undefined ? 200 : opt.putStatus, download: null,
    meta: { duration: 10, videoWidth: 1280, videoHeight: 720 },
  };
  const { mk, all } = miniDom();
  const M = mk('div', { id: 'videoMakerModal' });
  M.style.display = 'flex';
  const card = M.appendChild(mk('div', { class: 'vmk-studio vmk-tab-clean' }));
  c.view = card.appendChild(mk('video', { id: 'vmkClView' }));
  card.appendChild(mk('div', { id: 'vmkClean', class: 'vmk-clean' }));
  c.$ = (id) => all(M).find((x) => x.id === id) || null;
  c.q = (sel) => M.querySelector(sel);

  function XHR() { this.upload = {}; this.headers = {}; this.status = 0; c.xhrs.push(this); }
  XHR.prototype.open = function (method, url) { this.method = method; this.url = url; };
  XHR.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
  XHR.prototype.send = function (body) { this.body = body; if (!c.holdPut) setImmediate(() => this.finish(c.putStatus)); };
  XHR.prototype.finish = function (status) {
    if (this.over) return;
    this.over = true;
    if (!status) { if (this.onerror) this.onerror(); return; }
    this.status = status;
    if (status === 200 && F.targets.has(this.url)) F.files.set(F.targets.get(this.url), this.body.bytes); // هدف الرفع عند المزوّد المزيّف
    if (this.onload) this.onload();
  };
  XHR.prototype.abort = function () { if (this.over) return; this.over = true; this.aborted = true; if (this.onabort) this.onabort(); };

  const ctx = {
    document: {
      getElementById: c.$, documentElement: { lang: 'en', dir: 'ltr' },
      createElement: (tag) => {
        if (tag !== 'video') return mk(tag, {});
        const v = { style: {} }; // معاينة الملفّ المختار: تُقرأ بياناته في دورة تالية، أو تفشل (ترميز لا يفكّه المتصفّح)
        Object.defineProperty(v, 'src', { set: () => { const meta = c.meta; setImmediate(() => { if (!meta) { if (v.onerror) v.onerror(); return; } Object.assign(v, meta); if (v.onloadedmetadata) v.onloadedmetadata(); }); } });
        return v;
      },
    },
    MutationObserver: function () { this.observe = () => {}; },
    Event: function () {},
    setTimeout: (fn, ms) => { c.timers.push({ at: c.clock + (Number(ms) || 0), fn }); return c.timers.length; },
    Date: { now: () => c.clock },
    localStorage: { getItem: (k) => (c.store.has(k) ? c.store.get(k) : null), setItem: (k, v) => { c.store.set(k, String(v)); } },
    authGet: (k) => (k === 'aiapp_auth_token' ? c.tok : (k === 'aiapp_username' ? c.user : '')),
    URL: { createObjectURL: () => 'blob:omran/' + (++c.blobs), revokeObjectURL: (u) => { c.revoked.push(u); } },
    Blob, XMLHttpRequest: XHR, console,
    __swallow: (e, where) => { c.swallowed.push(where + ': ' + (e && e.message)); },
    t: (k) => (k === 'pricingPointsUnit' ? 'pts' : (k in DICT.en ? DICT.en[k] : k)),
    requireLogin: (why) => { c.logins.push(why); },
    refreshPointsWallet: () => { c.wallets.push('points'); },
    refreshPremiumPoints: () => { c.wallets.push('premium'); },
    mediaReadyNotify: () => { c.notified++; },
    // الدالّة نفسها في js/app-11-video.js (يثبتها الاختبار ١٥ على المصدر)
    __omranProxyVideoUrl: (url) => ((!url || /^blob:/.test(url) || /^\//.test(url)) ? url : '/api/video-download?url=' + encodeURIComponent(url)),
    fetch: async (url, init) => {
      const u = new URL(String(url), 'https://omran.test');
      const i = init || {};
      const rec = {
        url: String(url), path: u.pathname, method: String(i.method || 'GET').toUpperCase(), query: Object.fromEntries(u.searchParams), step: u.searchParams.get('step') || '',
        headers: Object.fromEntries(Object.entries(i.headers || {}).map(([k, v]) => [k.toLowerCase(), v])), body: i.body ? JSON.parse(i.body) : undefined, at: c.clock,
      };
      c.fetches.push(rec);
      if (rec.path === '/api/video-download') {
        const d = c.download ? c.download(rec) : { status: 200 };
        return { ok: d.status === 200, status: d.status, blob: async () => new Blob(['enhanced-video'], { type: 'video/mp4' }) };
      }
      assert.ok(rec.path === '/api/video' && rec.query.action === 'video-enhance', 'طلب خارج الميزة: ' + rec.url);
      c.inflight++;
      let r;
      try { r = await c.server(rec); } finally { c.inflight--; }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => { if (r.body === undefined) throw new SyntaxError('Unexpected token < in JSON'); return JSON.parse(JSON.stringify(r.body)); } };
    },
  };
  ctx.window = ctx;
  assert.equal(VJS.split('var wasOpen=false;').length, 2);
  vm.runInNewContext(VJS.replace('var wasOpen=false;', 'var wasOpen=false; window.__T={CL:CL,PRO:PRO,clPick:clPick,clCancel:clCancel,syncClean:syncClean,setTab:function(v){ tab=v; }};'), ctx);
  c.T = ctx.__T; c.CL = c.T.CL; c.PRO = c.T.PRO;

  const real = () => new Promise((r) => setImmediate(r));
  /** يترك الطلبات الجارية تنتهي (الخادم الحقيقيّ يعمل بمهامّ حقيقيّة) بلا تحريك الساعة الافتراضيّة. */
  c.settle = async () => { for (let i = 0; i < 400; i++) { await real(); if (i >= 4 && !c.inflight) break; } await real(); };
  /** ينفّذ أقرب مؤقّت ويقدّم الساعة إليه. */
  c.step = async () => {
    await c.settle();
    if (!c.timers.length) return false;
    c.timers.sort((a, b) => a.at - b.at);
    const t = c.timers.shift();
    if (t.at > c.clock) c.clock = t.at;
    t.fn();
    await c.settle();
    return true;
  };
  /** يمضي الوقت: كلّ مؤقّت يحين خلال المدّة يُنفَّذ بترتيبه. */
  c.advance = async (ms) => {
    const end = c.clock + ms;
    for (;;) {
      await c.settle();
      c.timers.sort((a, b) => a.at - b.at);
      if (!c.timers.length || c.timers[0].at > end) break;
      const t = c.timers.shift();
      if (t.at > c.clock) c.clock = t.at;
      t.fn();
    }
    c.clock = end;
    await c.settle();
  };
  c.until = async (cond, what, max) => {
    for (let i = 0; i < (max || 600); i++) { await c.settle(); if (cond()) return; await c.step(); }
    assert.fail('لم يتحقّق: ' + what + ' — ' + c.state());
  };
  c.open = async () => { c.T.setTab('clean'); c.T.syncClean(); await c.settle(); };
  c.pick = async (file, meta) => { c.meta = meta === undefined ? { duration: 10, videoWidth: 1280, videoHeight: 720 } : meta; c.T.clPick(file || vfile()); await c.settle(); };
  c.btn = () => c.$('vmkClPro');
  c.shown = (id) => { const e = c.$(id); return !!e && e.style.display !== 'none'; };
  c.click = () => { const b = c.btn(); assert.ok(b && b.style.display !== 'none' && !b.disabled, 'زرّ «تحسين احترافي» ظاهر ومفعَّل — ' + c.state()); return b.onclick(); };
  c.msg = () => (c.CL.msg ? c.CL.msg.text : '');
  c.err = () => !!(c.CL.msg && c.CL.msg.err);
  c.wk = () => c.q('#vmkClean .vmk-cl-wk').textContent;
  c.posts = (step) => c.fetches.filter((f) => f.method === 'POST' && (!step || f.step === step));
  c.confirms = () => c.posts('run').filter((f) => f.body.confirmed === true);
  c.state = () => JSON.stringify({ busy: c.CL.busy, stage: c.PRO.stage, id: c.PRO.id, up: c.PRO.up, quote: !!c.PRO.quote, parked: c.PRO.parked, msg: c.msg(), calls: c.fetches.map((f) => (f.step || f.path) + (f.body && f.body.confirmed ? '!' : '')).join(',') });
  return c;
}

test('١٥. الواجهة — الدوالّ الصرفة والمصدر: التقدير بصيغة الخادم، الفحص المحلّيّ بترتيبه، رمز الخطأ ← نصّه، والأسلاك (GET للإعداد، الرمز في الجسم، النتيجة عبر وسيطنا)', () => {
  const bare = { document: { getElementById: () => null }, window: {} };
  bare.window = bare;
  vm.runInNewContext(VJS, bare); // بلا نافذة الصانع: ما قبل البناء وحده يُنفَّذ — لا شبكة ولا مؤقّت عند التحميل
  const P = bare.__vmkPro;
  assert.deepEqual(Object.keys(P).sort(), ['check', 'errKey', 'estimate']);

  // التقدير = ما يحسبه الخادم للبدء بالمدّة نفسها، لكلّ طبقة ولكلّ مدّة
  for (const k of Object.keys(enh.TIERS)) {
    const t = enh.TIERS[k];
    for (let i = 1; i <= 3010; i++) assert.equal(P.estimate({ rate: t.pps, minSec: t.minSec }, i / 100), t.pps * enh.billedSec(t, i / 100, 0), k + ' ' + (i / 100));
  }
  const info = { rate: 9, minSec: 3, maxSec: 30, maxMB: 80 };
  assert.deepEqual([3, 10, 20, 30].map((s) => P.estimate(info, s)), [27, 90, 180, 270]);
  assert.deepEqual([P.estimate(info, 0), P.estimate(info, undefined), P.estimate(null, 10), P.estimate({}, 10)], [0, 0, 0, 0], 'بلا مدّة أو بلا إعداد: لا تقدير');

  // الفحص المحلّيّ: الصيغة ← الحجم ← المدّة ← الأبعاد
  const ok = { name: 'a.mp4', type: 'video/mp4', size: 1000 };
  const m = (sec, w, h) => ({ sec, w, h });
  for (const [f, meta, want] of [
    [ok, m(10, 1280, 720), ''], [ok, null, ''], [ok, m(0, 0, 0), ''],
    [{ name: 'CLIP.MOV', type: '', size: 1 }, null, ''], [{ name: 'clip', type: 'video/quicktime', size: 1 }, null, ''], [{ name: 'x.m4v', type: 'video/x-m4v', size: 1 }, null, ''],
    [{ name: 'x.mp4', type: 'text/html', size: 1 }, null, ''], [{ name: 'clip', type: 'Video/MP4; codecs=avc1', size: 1 }, null, ''],
    [{ name: 'a.webm', type: 'video/webm', size: 1 }, m(10, 1280, 720), 'vclProSpec'], [{ name: 'a.mkv', type: '', size: 1 }, null, 'vclProSpec'], [{ name: 'a', type: '', size: 1 }, null, 'vclProSpec'],
    [{ name: 'a.mp4', type: 'video/mp4', size: 80 * 1048576 }, null, ''], [{ name: 'a.mp4', type: 'video/mp4', size: 80 * 1048576 + 1 }, null, 'vclTooBig'],
    [ok, m(30.05, 1280, 720), ''], [ok, m(30.2, 1280, 720), 'vclProTooLong'], [ok, m(45, 0, 0), 'vclProTooLong'],
    [ok, m(10, 1920, 1080), ''], [ok, m(10, 1080, 1920), ''], [ok, m(10, 1922, 1080), 'vclProSpec'], [ok, m(10, 1082, 1920), 'vclProSpec'], [ok, m(10, 3840, 2160), 'vclProSpec'],
    [{ name: 'a.webm', type: 'video/webm', size: 90 * 1048576 }, m(45, 3840, 2160), 'vclProSpec'], [{ name: 'a.mp4', type: '', size: 90 * 1048576 }, m(45, 3840, 2160), 'vclTooBig'],
  ]) assert.equal(P.check(info, f, meta), want, JSON.stringify([f.name, f.type, f.size, meta]));
  assert.deepEqual([P.check(null, ok, null), P.check(info, null, null)], ['', '']);
  // المخرج الأعلى من 1080 مغلق لهذا الحساب (info.tall === false): قاعدة الخادم نفسها قبل الرفع — المقطع الطوليّ كان يُرفع كاملًا ثمّ يُرفض.
  const flat = Object.assign({ tall: false }, info);
  for (const [w, h, want] of [[720, 1280, 'vclProSpec'], [1080, 1920, 'vclProSpec'], [608, 1082, 'vclProSpec'], [1922, 1080, 'vclProSpec'], [1280, 720, ''], [1920, 1080, ''], [540, 960, ''], [1080, 1080, ''], [0, 0, '']])
    assert.equal(P.check(flat, ok, m(10, w, h)), want, 'tall:false ' + w + 'x' + h);
  assert.equal(P.check(flat, ok, null), '', 'بلا أبعاد مقروءة الحكم لقياس الخادم');
  // …وما يقبله الفحص المحلّيّ من الأبعاد هو ما يقبله تسعير الخادم، في الحالين (جواب بلا الحقل = القاعدة العامّة كما كانت)
  for (const w of [320, 540, 720, 1080, 1280, 1920, 1921, 2160]) for (const h of [240, 540, 720, 960, 1080, 1081, 1280, 1920, 1921]) {
    assert.equal(P.check(flat, ok, m(10, w, h)) === '', enh.factorFor(w, h, false) >= 1, 'tall:false ' + w + 'x' + h);
    for (const open of [Object.assign({ tall: true }, info), info]) assert.equal(P.check(open, ok, m(10, w, h)) === '', enh.factorFor(w, h, true) >= 1, 'tall مفتوح ' + w + 'x' + h);
  }
  // ما يقبله الفحص المحلّيّ من الصيغ هو ما يقبله الخادم
  for (const [mime, name] of [['video/mp4', 'a'], ['video/x-m4v', 'a'], ['video/quicktime', 'a'], ['', 'a.mp4'], ['', 'a.m4v'], ['', 'a.MOV'], ['video/webm', 'a.webm'], ['video/webm', 'a.mp4'], ['', 'a.mkv'], ['application/octet-stream', 'a.bin']])
    assert.equal(P.check(info, { name, type: mime, size: 1 }, null) === '', !!enh.containerOf(mime, name), mime + ' ' + name);

  const KEYS = { points_insufficient: 'vclProNoPoints', too_big: 'vclTooBig', too_long: 'vclProTooLong', fps: 'vclProSpec', resolution: 'vclProSpec', format: 'vclProSpec', limit: 'vclProLimit', unavailable: 'vclProUnavailable', upload: 'vclProUploadFail', not_uploaded: 'vclProUploadFail' };
  for (const [code, key] of Object.entries(KEYS)) assert.equal(P.errKey(code), key, code);
  for (const code of ['failed', 'not_found', 'banned', 'auth', 'retry', 'busy', 'method', 'bad_request', '', undefined, null, 'constructor', '__proto__', 'toString']) assert.equal(P.errKey(code), 'vclProFail', String(code));

  // المصدر
  assert.ok(VJS.includes("fetch('/api/video?action=video-enhance&step=info',tk?{headers:{Authorization:'Bearer '+tk}}:undefined)"), 'الإعداد GET والرمز في الترويسة');
  const api = VJS.slice(VJS.indexOf('async function proApi('), VJS.indexOf('function proInfo('));
  assert.ok(api.includes("fetch('/api/video?action=video-enhance&step='+step,{method:'POST'") && api.includes('Object.assign({token:proTok()},payload||{})'), 'بقيّة الخطوات POST والرمز في الجسم');
  assert.doesNotMatch(VJS, /[?&]token=/, 'لا رمز جلسة في رابط');
  const show = VJS.slice(VJS.indexOf('async function proShow('), VJS.indexOf('function proPark('));
  assert.ok(show.includes('window.__omranProxyVideoUrl(String(d.url') && (show.match(/fetch\(/g) || []).length === 1 && show.includes('fetch(px,'), 'النتيجة عبر وسيط التنزيل وحده');
  const v11 = read('js/app-11-video.js');
  assert.ok(v11.includes("return '/api/video-download?url=' + encodeURIComponent(url);") && v11.includes('window.__omranProxyVideoUrl = proxyVideoUrl;'));
  const cancel = VJS.slice(VJS.indexOf('function proCancel(){'), VJS.indexOf('function proResume(){'));
  assert.match(cancel, /^function proCancel\(\)\{\s*if\(PRO\.stage==='run'\) return;/, 'بعد التأكيد لا إلغاء');
  assert.ok(!cancel.includes('terminate'), 'إلغاء الرفع لا يُنهي أداة التحسين');
  const run = VJS.slice(VJS.indexOf('async function clRun(){'), VJS.indexOf('function clCancel(){'));
  for (const bad of ['fetch(', 'XMLHttpRequest', 'proApi', 'proPut']) assert.ok(!run.includes(bad), 'المسار المجّانيّ: ' + bad);
  const after = VJS.indexOf('function syncClean(){');
  for (const fn of ['proTok', 'proApi', 'proInfo', 'proPut', 'proFail', 'clPro', 'proConfirm', 'proWatch', 'proShow', 'proPark', 'proCancel', 'proResume']) {
    const at = VJS.indexOf('function ' + fn + '(');
    assert.ok(at > after && at < VJS.indexOf('function L(k){'), fn + ' بعد syncClean وقبل L');
  }
  assert.ok(VJS.indexOf('window.__vmkPro=') < VJS.indexOf("var M=document.getElementById('videoMakerModal')"), 'الدوالّ الصرفة قبل الاعتماد على الصفحة');
  assert.doesNotMatch(VJS, LEAK_RE, 'لا اسم مزوّد أو نموذج في ملفّ الواجهة');
  // بوّابة الباقات: نقص النقاط هنا يفتح قسم النقاط (ليست في جدول الوسائط)
  const gateLine = "if(/video-watch|video-enhance/.test(url)) return 'pts';";
  assert.ok(read('js/app-33-plans-gate.js').includes(gateLine) && read('js/app.bundle.js').includes(gateLine));
  // الأنماط: ثماني قواعد، بلا استعلام وسائط ولا fill ولا حركة
  const css = read('css/modules.css');
  const rules = css.split('\n').filter((l) => /\.vmk-cl-(pro|pnote)(?![\w-])/.test(l) && !l.startsWith('/*')); // لا .vmk-cl-prog ولا .vmk-cl-prow
  assert.equal(rules.length, 8);
  for (const l of rules) assert.ok(/^(html\[data-mode="light"\] )?#videoMakerModal \.vmk-cl-(pro|pnote)(?![\w-])/.test(l) && !/fill\s*:|@media|@keyframes|animation/.test(l), l);
  assert.ok(css.includes('#videoMakerModal .vmk-cl-pro{background:none;border:1.5px solid #e8c27a;color:#f0dcb0;box-shadow:none;height:auto;min-height:52px;padding:8px 12px}'), 'ارتفاع تلقائيّ: النصّ الطويل يلتفّ على الجوّال');
  assert.ok(css.includes('#videoMakerModal .vmk-cl-pro[data-cost]:after{content:" · " attr(data-cost)'));
});

test('١٥ب. الواجهة على المعالج الحقيقيّ: قراءة واحدة عند الفتح، رفع بتقدّمه، عرض بلا خصم، تأكيد واحد لنقرتين، خصم مرّة، والنتيجة في العارض عبر وسيطنا', async () => {
  reset(); roomy(); fresh('lina', 500);
  const tok = token('lina');
  const c = client({ tok, server: liveServer });
  await c.open();
  assert.deepEqual(c.fetches.map((f) => [f.method, f.step, f.headers.authorization, f.body, f.url.includes(tok)]), [['GET', 'info', 'Bearer ' + tok, undefined, false]], 'S0: GET واحدة والرمز في الترويسة');
  assert.equal(c.shown('vmkClPro'), false, 'بلا ملفّ لا زرّ');
  await c.pick();
  assert.deepEqual([c.btn().textContent, c.btn().getAttribute('data-cost'), c.btn().disabled, c.btn().classList.contains('ask')], ['Pro enhance', '90 pts', false, false], 'S1');
  assert.equal(c.$('vmkClProNote').textContent, EN('vclProNotice', { n: 9, m: 27, s: 30 }));
  assert.ok(c.shown('vmkClPro') && c.shown('vmkClProNote') && c.shown('vmkClGo'), 'الزرّ المجّانيّ في مكانه');
  assert.equal(c.posts().length, 0, 'اختيار الملفّ لا يرفع شيئًا');

  // S3: نقرتان = بدء واحد؛ الرفع إلى هدف أصدره الخادم، بنوعه، وتقدّمه الحقيقيّ
  c.holdPut = true;
  const b0 = c.btn();
  b0.onclick(); b0.onclick();
  await c.until(() => c.xhrs.length === 1, 'الرفع بدأ');
  assert.equal(c.posts('start').length, 1);
  assert.deepEqual(c.posts('start')[0].body, { token: tok, size: MP4.length, mime: 'video/mp4', name: 'My Holiday Clip.mp4', durationSec: 10 });
  assert.ok(c.posts().every((f) => !f.url.includes(tok) && !f.headers.authorization), 'الرمز في الجسم لا في الرابط');
  const x = c.xhrs[0];
  assert.deepEqual([x.method, x.headers['Content-Type'], x.body.bytes === MP4, x.timeout, F.targets.has(x.url)], ['PUT', 'video/mp4', true, 900000, true]);
  assert.equal(c.wk(), DICT.en.vclProUploading);
  assert.deepEqual([c.shown('vmkClProg'), c.shown('vmkClCancel'), c.shown('vmkClPro'), c.shown('vmkClGo'), c.PRO.stage], [true, true, false, false, 'up']);
  x.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
  assert.deepEqual([c.$('vmkClPct').textContent, c.$('vmkClBar').style.width], ['45%', '45%'], 'الرفع ٩٠٪ من الشريط');
  x.finish(200);
  await c.until(() => !c.CL.busy, 'عرض التكلفة');

  // S4: عرض بلا خصم
  const id = c.PRO.id;
  assert.deepEqual([jobOf(id).st, await bal('lina'), calls('submit').length, c.confirms().length], ['quoted', 500, 0, 0], 'لا خصم ولا إرسال قبل التأكيد');
  assert.deepEqual([c.msg(), c.err()], [EN('vclProQuote', { s: 10, n: 90, p: 500 }), false]);
  assert.deepEqual([c.btn().textContent, c.btn().classList.contains('ask'), c.btn().getAttribute('data-cost')], [EN('vclProConfirm', { n: 90 }), true, null]);
  assert.ok(c.shown('vmkClGo'), 'الزرّ المجّانيّ يبقى متاحًا مع العرض');
  assert.deepEqual(c.wallets, []);

  // S5: نقرتان على التأكيد = طلب واحد وخصم واحد
  const b1 = c.btn();
  b1.onclick(); b1.onclick();
  await c.until(() => c.posts('status').length >= 2, 'استطلاعان');
  assert.equal(c.confirms().length, 1);
  assert.deepEqual(c.confirms()[0].body, { token: tok, id, confirmed: true, cost: 90 });
  assert.deepEqual([await bal('lina'), calls('submit').length, jobOf(id).st], [410, 1, 'running']);
  assert.deepEqual(c.wallets, ['points', 'premium'], 'الرصيد المعروض يُحدَّث بعد الخصم');
  assert.equal(c.wk(), DICT.en.vclProWorking);
  assert.deepEqual([c.shown('vmkClCancel'), c.$('vmkClBar').style.width, c.PRO.stage, c.msg()], [false, '100%', 'run', '']);
  assert.match(c.$('vmkClPct').textContent, /^\d+:\d\d$/, 'الوقت المنقضي مكان النسبة');
  const run0 = c.CL.run;
  c.T.clCancel();
  assert.deepEqual([c.CL.busy, c.CL.run, c.PRO.stage], [true, run0, 'run'], 'الإلغاء بعد التأكيد لا يفعل شيئًا');
  assert.ok(c.posts('status').every((f) => f.body.token === tok && f.body.id === id), 'الاستطلاع POST بالرمز في الجسم');

  // S6
  F.state = 'COMPLETED';
  await c.until(() => !!c.CL.out, 'النتيجة');
  const dl = c.fetches.filter((f) => f.path === '/api/video-download');
  assert.deepEqual(dl.map((f) => [f.method, f.query.url, f.headers.authorization]), [['GET', OUT_URL, 'Bearer ' + tok]]);
  assert.ok(c.fetches.every((f) => f.url.startsWith('/api/')), 'لا جلب مباشر من رابط المزوّد');
  assert.deepEqual([c.CL.busy, c.CL.showing, c.view.src, c.$('vmkClDl').href, c.view.style.display], [false, 'after', c.CL.out, c.CL.out, 'block']);
  assert.deepEqual([c.msg(), c.err()], [EN('vclProDone', { n: 90, s: 10 }), false]);
  assert.ok(c.shown('vmkClDone') && c.q('#vmkClean .vmk-cl-ab').style.display !== 'none', '«قبل/بعد» مع الأصل');
  assert.deepEqual([c.store.get('vmk_pro_seen'), await bal('lina'), c.notified], [id, 410, 1], 'خصم واحد بلا ردّ');
  assert.deepEqual([c.PRO.id, c.PRO.up, c.PRO.quote, c.PRO.stage, c.btn().textContent], ['', false, null, '', 'Pro enhance'], 'الزرّ يعود لبدء جديد');
  assert.deepEqual(c.swallowed, []);
  // فتح القسم ثانية على الجهاز نفسه: نتيجة عُرضت لا تُستأنف ولا تُجلب مرّة أخرى، والإعداد لا يُقرأ ثانية
  const n = c.fetches.length;
  await c.advance(120000);
  await c.open();
  await c.advance(30000);
  assert.equal(c.fetches.length, n);
});

test('١٥ج. قبل الخصم: الإلغاء وتبديل الملفّ لا يخصمان، والإلغاء لا يُنهي أداة التحسين، ونقص الرصيد يُقال برقمه ويُبقي العرض', async () => {
  reset(); roomy(); fresh('sami', 500);
  const tok = token('sami');
  const c = client({ tok, server: liveServer });
  await c.open(); await c.pick();
  const ff = { ended: 0, terminate() { ff.ended++; } };
  c.CL.ff = ff; // أداة التحسين المجّانيّ محمَّلة من قبل

  // إلغاء أثناء الرفع
  c.holdPut = true;
  c.click();
  await c.until(() => c.xhrs.length === 1, 'الرفع بدأ');
  c.$('vmkClCancel').onclick();
  assert.deepEqual([c.xhrs[0].aborted, c.CL.busy, c.PRO.stage, c.msg(), ff.ended, c.CL.ff === ff], [true, false, '', '', 0, true]);
  await c.advance(10000);
  assert.deepEqual([c.posts('run').length, await bal('sami'), c.btn().textContent, c.shown('vmkClPro')], [0, 500, 'Pro enhance', true]);

  // نقرة جديدة = رفع كامل؛ ثمّ إلغاء أثناء الفحص: المرفوع يبقى والنقرة التالية تكمل منه
  c.holdPut = false;
  let gate = null;
  const hold = () => { let open; const p = new Promise((r) => { open = r; }); gate = { p, open }; return gate; };
  c.server = async (rec) => { if (rec.step === 'run' && gate) { const g = gate; gate = null; await g.p; } return liveServer(rec); };
  const g1 = hold();
  c.click();
  await c.until(() => c.posts('run').length === 1, 'الفحص بدأ', 40);
  assert.deepEqual([c.posts('start').length, c.xhrs.length, c.$('vmkClPct').textContent], [2, 2, '95%']);
  c.T.clCancel();
  assert.deepEqual([c.CL.busy, c.PRO.up, c.PRO.id.length, ff.ended], [false, true, 24, 0]);
  g1.open();
  await c.settle();
  assert.deepEqual([c.PRO.quote, c.CL.busy, c.msg()], [null, false, ''], 'جواب تشغيل أُلغي يُهمل');
  c.click();
  await c.until(() => !!c.PRO.quote, 'العرض بعد إعادة النقر');
  assert.deepEqual([c.posts('start').length, c.xhrs.length, await bal('sami')], [2, 2, 500], 'لا رفع ثانٍ');

  // ملفّ آخر بعد العرض: العرض يُنسى (لا يُؤكَّد عرض ملفّ على ملفّ آخر)
  const old = c.PRO.id;
  await c.pick(vfile({ name: 'second.mov', type: 'video/quicktime' }));
  assert.deepEqual([c.PRO.id, c.PRO.up, c.PRO.quote, c.btn().textContent, jobOf(old).st, await bal('sami')], ['', false, null, 'Pro enhance', 'quoted', 500]);
  // ملفّ يُختار ثمّ يُنقر «تحسين احترافي» قبل أن تُقرأ بياناته: لا يُبدَّل الملفّ تحت رفع جارٍ
  const second = c.CL.file;
  c.T.clPick(vfile({ name: 'third.mp4' }));
  c.click();
  await c.until(() => !!c.PRO.quote, 'عرض الملفّ الثاني');
  assert.deepEqual([c.CL.file === second, c.xhrs[2].body === second, c.xhrs[2].headers['Content-Type'], c.posts('start')[2].body.name], [true, true, 'video/quicktime', 'second.mov']);

  // نقص الرصيد عند التأكيد: برقمه، بلا خصم ولا إرسال ولا استطلاع، والعرض باقٍ
  kv.set('points:sami', '5');
  c.click();
  await c.until(() => !c.CL.busy, 'رفض الرصيد');
  assert.deepEqual([c.msg(), c.err()], [EN('vclProNoPoints', { p: 5, n: 90 }), true]);
  assert.deepEqual([!!c.PRO.quote, c.btn().textContent, await bal('sami'), calls('submit').length, c.posts('status').length], [true, EN('vclProConfirm', { n: 90 }), 5, 0, 0]);
  kv.set('points:sami', '200');
  c.click();
  await c.until(() => c.posts('status').length >= 1, 'جارٍ بعد الشحن');
  assert.deepEqual([await bal('sami'), calls('submit').length, c.confirms().length], [110, 1, 2]);
});

test('١٥د. بعد الخصم على المعالج الحقيقيّ: فشل الإرسال وفشل المزوّد يُعلنان النقاط المردودة، والمهمّة الجارية تُستأنف من جهاز آخر، وبدء ثانٍ يتحوّل إليها', async () => {
  reset(); roomy(); fresh('noor', 500);
  const tok = token('noor');
  const a = client({ tok, server: liveServer });
  await a.open(); await a.pick();

  // (١) المزوّد يرفض الإرسال: الخادم يردّ النقاط في الجواب نفسه
  a.click(); await a.until(() => !!a.PRO.quote, 'عرض');
  F.submitFail = 422;
  a.click(); await a.until(() => !a.CL.busy, 'فشل الإرسال');
  assert.deepEqual([a.msg(), a.err()], [EN('vclProRefunded', { n: 90 }), true]);
  assert.doesNotMatch(a.msg(), NO_CHARGE_RE);
  assert.deepEqual([await bal('noor'), a.posts('status').length, a.PRO.id, a.PRO.quote, a.btn().textContent], [500, 0, '', null, 'Pro enhance']);
  assert.deepEqual(a.wallets, ['points', 'premium']);
  F.submitFail = 0;

  // (٢) قُبلت ثمّ فشلت عند المزوّد: الاستطلاع يحمل الردّ
  a.click(); await a.until(() => !!a.PRO.quote, 'عرض ثانٍ');
  const id2 = a.PRO.id;
  a.click(); await a.until(() => a.posts('status').length >= 1, 'جارٍ');
  assert.equal(await bal('noor'), 410);
  F.state = 'COMPLETED'; F.statusErr = 'model failed';
  await a.until(() => !a.CL.busy, 'فشل المهمّة');
  assert.deepEqual([a.msg(), a.err(), await bal('noor'), a.store.get('vmk_pro_seen')], [EN('vclProRefunded', { n: 90 }), true, 500, id2]);
  F.state = 'IN_QUEUE'; F.statusErr = null;

  // (٣) مهمّة جارية، وجهاز آخر فتح القسم قبلها (d) وجهاز يفتحه بعدها (b)
  const d = client({ tok, server: liveServer });
  await d.open(); // آخر مهمّة للحساب فشلت ورُدّت — يُعلَن ردّها مرّة على جهاز لم يرها
  await d.until(() => !d.CL.busy && d.msg() !== '', 'إعلان الردّ على الجهاز الآخر');
  assert.deepEqual([d.msg(), d.store.get('vmk_pro_seen'), d.posts('status')[0].body.id], [EN('vclProRefunded', { n: 90 }), id2, id2]);
  await d.pick();
  a.click(); await a.until(() => !!a.PRO.quote, 'عرض ثالث');
  const id3 = a.PRO.id;
  a.click(); await a.until(() => jobOf(id3).st === 'running', 'جارٍ');
  assert.equal(await bal('noor'), 410);

  const b = client({ tok, server: liveServer }); // تخزين محلّيّ فارغ: جهاز لم يرَ شيئًا
  await b.open();
  await b.until(() => b.posts('status').length >= 1, 'استئناف');
  assert.deepEqual([b.PRO.info.job, b.CL.busy, b.PRO.stage, b.posts('start').length, b.xhrs.length, b.posts('status')[0].body.id], [id3, true, 'run', 0, 0, id3]);
  assert.deepEqual([b.wk(), b.shown('vmkClCancel'), b.shown('vmkClProg')], [DICT.en.vclProWorking, false, true]);

  // (٤) بدء ثانٍ والمهمّة جارية: يتحوّل إلى متابعتها بلا رفع
  d.click();
  await d.until(() => d.posts('status').some((f) => f.body.id === id3), 'تحويل إلى الجارية');
  assert.deepEqual([d.posts('start').length, d.xhrs.length, d.PRO.stage, d.shown('vmkClCancel'), d.wk()], [1, 0, 'run', false, DICT.en.vclProWorking]);

  F.state = 'COMPLETED';
  await b.until(() => !!b.CL.out, 'النتيجة على الجهاز الآخر');
  assert.deepEqual([b.CL.file, b.CL.orig, b.q('#vmkClean .vmk-cl-ab').style.display, b.shown('vmkClDone'), b.$('vmkClDl').href, b.shown('vmkClPro')], [null, '', 'none', true, b.CL.out, false], 'بلا الأصل: لا «قبل/بعد»');
  assert.equal(b.msg(), EN('vclProDone', { n: 90, s: 10 }));
  await d.until(() => !!d.CL.out, 'النتيجة عند من حاول البدء');
  assert.deepEqual([d.CL.file, d.q('#vmkClean .vmk-cl-ab').style.display], [null, 'none'], 'ملفّ آخر مختار لا يُقارَن بنتيجة غير نتيجته');
  await a.until(() => !!a.CL.out, 'النتيجة عند صاحب الرفع');
  assert.ok(a.CL.file && a.q('#vmkClean .vmk-cl-ab').style.display !== 'none', 'صاحب الملفّ يقارن قبل/بعد');
  assert.equal(await bal('noor'), 410, 'ثلاثة أجهزة تستطلع: خصم واحد');
});

test('١٥هـ. من يرى الزرّ: مغلق لغير المالك قبل الفتح للجميع، المالك يرى تكلفة صفر وتشخيصًا، والضيف يُحوَّل للتسجيل ثمّ تُعاد القراءة بجلسته', async () => {
  reset(null); roomy(); fresh('huda', 500); fresh('omran', 0);
  const u = client({ tok: token('huda'), server: liveServer });
  await u.open(); await u.pick();
  assert.deepEqual([u.PRO.info.on, u.shown('vmkClPro'), u.shown('vmkClProNote'), u.shown('vmkClGo')], [false, false, false, true]);
  u.btn().onclick(); // حتّى لو نودي الزرّ المخفيّ
  await u.settle();
  assert.equal(u.posts().length, 0);

  const o = client({ tok: token('omran'), user: 'omran', server: liveServer });
  await o.open(); await o.pick();
  assert.deepEqual([o.PRO.info.on, o.shown('vmkClPro')], [true, true]);
  o.click(); await o.until(() => !!o.PRO.quote, 'عرض المالك');
  assert.equal(o.btn().textContent, EN('vclProConfirm', { n: 0 }));
  assert.equal(o.msg(), EN('vclProQuote', { s: 10, n: 0, p: '∞' }) + ' [est 60c fast 1280x720 f300 x1.5]');

  reset();
  const g = client({ server: liveServer });
  await g.open(); await g.pick();
  assert.deepEqual([g.fetches[0].headers.authorization, g.PRO.info.on, g.PRO.info.job, g.shown('vmkClPro')], [undefined, true, null, true]);
  g.click();
  await g.settle();
  assert.deepEqual([g.logins.join(), g.posts().length, g.CL.busy], ['guestLimit', 0, false]);
  // دخل في الصفحة نفسها (الدخول لا يعيد تحميلها): الإعداد يُقرأ من جديد بجلسته — مرّة لكلّ جلسة
  g.tok = token('huda');
  await g.open(); await g.open();
  assert.deepEqual(g.fetches.map((f) => f.step + ':' + (f.headers.authorization ? 'auth' : 'anon')), ['info:anon', 'info:auth']);

  // قراءة فشلت: لا زرّ، والمسار المجّانيّ كما هو، وتُعاد بعد نصف دقيقة عند فتح القسم
  const f = client({ tok: 'tok-x', server: scripted({ info: ['net', R(503, { error: 'offline' }), R(200, INFO)] }) });
  await f.open(); await f.pick();
  assert.deepEqual([f.PRO.info, f.shown('vmkClPro'), f.shown('vmkClGo')], [null, false, true]);
  await f.open();
  assert.equal(f.fetches.length, 1, 'لا إعادة فوريّة');
  await f.advance(31000); await f.open();
  assert.deepEqual([f.fetches.length, f.PRO.info], [2, null]);
  await f.advance(31000); await f.open();
  assert.deepEqual([f.fetches.length, f.PRO.info.on, f.shown('vmkClPro')], [3, true, true]);

  // حسابان على صفحة واحدة (الخروج والدخول لا يعيدان تحميلها): عرض تكلفة الأوّل ورصيده لا يُعرضان للثاني، ونقرته بدء جديد برمزه هو.
  const q = await quoted({});
  assert.deepEqual([q.btn().textContent, q.msg()], [EN('vclProConfirm', { n: 90 }), EN('vclProQuote', { s: 10, n: 90, p: 500 })]);
  q.tok = 'tok-B';
  await q.open();
  assert.deepEqual([q.PRO.id, q.PRO.up, q.PRO.quote, q.msg(), q.btn().textContent], ['', false, null, '', 'Pro enhance'], 'كان: «تأكيد وخصم ٩٠» ورصيد الحساب الأوّل أمام الثاني');
  q.click();
  await q.until(() => q.posts('start').length === 2, 'بدء جديد للحساب الثاني');
  assert.deepEqual([q.posts('start')[1].body.token, q.confirms().length], ['tok-B', 0]);

  // مهمّة الأوّل مركونة ثمّ دخل الثاني: لا تُستطلع برمزه، وعلامة «شوهدت» على الجهاز لا تُكتب — فيجد الأوّل نتيجته حين يعود.
  const NOT_FOUND = R(404, { ok: false, error: 'not_found' });
  const st = { job: null, done: false };
  const mine = (rec) => (rec.body ? rec.body.token : String(rec.headers.authorization || '').slice(7)) === 'tok-x';
  const two = (status) => ({
    info: [(rec) => R(200, Object.assign({}, INFO, { job: mine(rec) ? st.job : null }))],
    confirm: [R(200, { ok: true, state: 'running', id: JID, cost: 90, points: 410 })],
    status: [status],
  });
  const w = await quoted(two((rec) => (!mine(rec) ? NOT_FOUND : (st.done ? DONE : 'net'))));
  w.click();
  await w.until(() => !w.CL.busy, 'ركن بعد ستّة أخطاء');
  assert.deepEqual([w.PRO.parked, w.msg()], [JID, DICT.en.vclProLater]);
  w.tok = 'tok-B';
  await w.open(); await w.advance(61000); await w.open(); await w.advance(15000);
  assert.deepEqual([w.posts('status').filter((x) => x.body.token === 'tok-B').length, w.store.has('vmk_pro_seen'), w.PRO.parked, w.msg(), w.CL.busy], [0, false, '', '', false]);
  st.job = JID; st.done = true;
  w.tok = 'tok-x';
  await w.open();
  w.click(); // ملفّه ما زال مختارًا: الزرّ يسأل الخادم عن مهمّته — لا بدء ثانٍ
  await w.until(() => !!w.CL.out, 'نتيجة الأوّل بعد عودته');
  assert.deepEqual([w.posts('start').length, w.confirms().length, w.msg(), w.store.get('vmk_pro_seen')], [1, 1, EN('vclProDone', { n: 90, s: 10 }), JID]);

  // متابعة حيّة لمهمّة الأوّل تستمرّ والثاني دخل: «غير موجودة» برمزه ثلاثًا تنهيها بلا علامة «شوهدت» (ليست مهمّته، ولم يرها صاحبها).
  st.job = null; st.done = false;
  const v = await quoted(two((rec) => (mine(rec) ? RUNNING : NOT_FOUND)));
  v.click();
  await v.until(() => v.posts('status').length >= 2, 'جارٍ');
  v.tok = 'tok-B';
  await v.until(() => !v.CL.busy, 'انتهت المتابعة برمز الجلسة الأخرى');
  assert.deepEqual([v.store.has('vmk_pro_seen'), v.msg(), v.PRO.parked, v.PRO.id, v.posts('status').filter((x) => x.body.token === 'tok-B').length], [false, '', '', '', 3]);

  // رمز جديد للحساب نفسه (تغيير الاسم يعيد إصداره) أثناء متابعة حيّة: المرحلة الجارية لا تُمسّ — النتيجة تُعرض بأصلها («قبل/بعد»).
  const ph = { done: false };
  const rn = await quoted({ confirm: [R(200, { ok: true, state: 'running', id: JID, cost: 90, points: 410 })], status: [() => (ph.done ? DONE : RUNNING)] });
  rn.click();
  await rn.until(() => rn.posts('status').length >= 1, 'جارٍ');
  rn.tok = 'tok-renamed';
  await rn.open();
  assert.deepEqual([rn.PRO.id, rn.CL.busy, rn.PRO.stage, rn.fetches.filter((x) => x.step === 'info').length], [JID, true, 'run', 2]);
  ph.done = true;
  await rn.until(() => !!rn.CL.out, 'النتيجة بعد تغيير الاسم');
  assert.deepEqual([!!rn.CL.file, rn.q('#vmkClean .vmk-cl-ab').style.display !== 'none', rn.msg()], [true, true, EN('vclProDone', { n: 90, s: 10 })]);
});

test('١٥و. الفحص المحلّيّ في القسم: ملفّ سيُرفض لا يُرفع — الزرّ معطَّل والسطر يقول السبب، والمسار المجّانيّ يقبله', async () => {
  const c = client({ tok: 'tok-x', server: scripted({ info: [R(200, INFO)] }) });
  await c.open();
  for (const [file, meta, key, vars] of [
    [vfile({ name: 'clip.webm', type: 'video/webm' }), undefined, 'vclProSpec', {}],
    [vfile({ size: 80 * 1048576 + 1 }), undefined, 'vclTooBig', { n: 80 }],
    [vfile(), { duration: 45, videoWidth: 1280, videoHeight: 720 }, 'vclProTooLong', { s: 30 }],
    [vfile(), { duration: 10, videoWidth: 3840, videoHeight: 2160 }, 'vclProSpec', {}],
  ]) {
    await c.pick(file, meta);
    assert.equal(c.CL.file, file, 'المسار المجّانيّ قبل الملفّ');
    assert.deepEqual([c.shown('vmkClPro'), c.btn().disabled, c.btn().getAttribute('data-cost'), c.$('vmkClProNote').textContent, c.shown('vmkClGo')], [true, true, null, EN(key, vars), true], key);
    c.btn().onclick();
    await c.settle();
    assert.deepEqual([c.posts().length, c.CL.busy], [0, false]);
  }
  // بيانات لم تُقرأ (ترميز لا يفكّه المتصفّح): الزرّ مفعَّل بلا تقدير — الحكم لقياس الخادم
  await c.pick(vfile(), null);
  assert.deepEqual([c.CL.meta, c.btn().disabled, c.btn().getAttribute('data-cost'), c.$('vmkClProNote').textContent], [null, false, null, EN('vclProNotice', { n: 9, m: 27, s: 30 })]);
  // دون الحدّ الأدنى يُعرض الحدّ الأدنى
  await c.pick(vfile(), { duration: 1.5, videoWidth: 640, videoHeight: 360 });
  assert.equal(c.btn().getAttribute('data-cost'), '27 pts');

  // على المعالج الحقيقيّ — مقطع طوليّ لحساب مخرجه الأعلى من 1080 مغلق (الإعداد الافتراضيّ لغير المالك، وأشيع مقاطع الهاتف): الزرّ معطَّل
  // والسبب مكتوب قبل الرفع. كان يظهر بسعره، يُرفع الملفّ كاملًا، تُؤكل رفعة من العشر، ثمّ يُرفض.
  reset(); roomy(); fresh('mona', 500); fresh('omran', 0);
  const p = client({ tok: token('mona'), server: liveServer });
  await p.open();
  assert.equal(p.PRO.info.tall, false);
  for (const [w, h] of [[720, 1280], [1080, 1920]]) {
    await p.pick(vfile(), { duration: 10, videoWidth: w, videoHeight: h });
    assert.deepEqual([p.shown('vmkClPro'), p.btn().disabled, p.btn().getAttribute('data-cost'), p.$('vmkClProNote').textContent, p.shown('vmkClGo')], [true, true, null, DICT.en.vclProSpec, true], w + 'x' + h);
    p.btn().onclick();
    await p.settle();
  }
  assert.deepEqual([p.posts().length, p.xhrs.length, kv.has(tallyKey('mona'))], [0, 0, false], 'لا بدء ولا رفع ولا رفعة من حدّ اليوم');
  await p.pick(vfile(), { duration: 10, videoWidth: 1280, videoHeight: 720 });
  assert.deepEqual([p.btn().disabled, p.btn().getAttribute('data-cost')], [false, '90 pts'], 'العرضيّ كما كان');
  // المالك، وطبقة أدرجها المالك بعد أن تحقّق من سعرها: الطوليّ مفتوح والزرّ بسعره.
  const tallOpen = async (u, user) => {
    const x = client({ tok: token(u), user, server: liveServer });
    await x.open(); await x.pick(vfile(), { duration: 10, videoWidth: 1080, videoHeight: 1920 });
    return [x.PRO.info.tall, x.btn().disabled, x.btn().getAttribute('data-cost')];
  };
  assert.deepEqual(await tallOpen('omran', 'omran'), [true, false, '90 pts']);
  process.env.VIDEO_ENHANCE_TALL_OK = 'fast';
  assert.deepEqual(await tallOpen('mona', ''), [true, false, '90 pts']);
  delete process.env.VIDEO_ENHANCE_TALL_OK;
});

const START = R(200, { ok: true, id: JID, upload: 'https://uploads.example/put/1?sig=abc', mime: 'video/mp4' });
const QUOTE = { ok: true, quote: true, id: JID, sec: 10, cost: 90, points: 500 };
const RUNNING = R(200, { ok: true, state: 'running', id: JID });
const DONE = R(200, { ok: true, state: 'done', id: JID, url: OUT_URL, sec: 10, cost: 90 });
/** واجهة وصلت إلى عرض التكلفة على خادم مكتوب. */
async function quoted(plan, o) {
  const c = client(Object.assign({ tok: 'tok-x', server: scripted(Object.assign({ info: [R(200, INFO)], start: [START], run: [R(200, QUOTE)] }, plan)) }, o));
  await c.open(); await c.pick(o && o.file);
  c.click();
  await c.until(() => !!c.PRO.quote, 'عرض');
  return c;
}

test('١٥ز. قبل العرض على خادم مكتوب: أخطاء البدء والرفع والفحص بنصوصها، الفحص يُعاد ١٢ مرّة بفاصل ثانيتين، والتشخيص للمالك وحده', async () => {
  const go = async (plan, o) => {
    const c = client(Object.assign({ tok: 'tok-x', server: scripted(Object.assign({ info: [R(200, INFO)] }, plan)) }, o));
    await c.open(); await c.pick();
    c.click();
    await c.until(() => !c.CL.busy || c.PRO.stage === 'run', 'نهاية البدء');
    return c;
  };
  for (const [status, body, key, vars] of [
    [429, { ok: false, error: 'limit' }, 'vclProLimit', {}],
    [402, { ok: false, error: 'points_insufficient', needed: 90, points: 12 }, 'vclProNoPoints', { p: 12, n: 90 }],
    [413, { ok: false, error: 'too_long' }, 'vclProTooLong', { s: 30 }],
    [413, { ok: false, error: 'too_big' }, 'vclTooBig', { n: 80 }],
    [415, { ok: false, error: 'format' }, 'vclProSpec', {}],
    [503, { ok: false, error: 'unavailable' }, 'vclProUnavailable', {}],
    [502, { ok: false, error: 'failed' }, 'vclProFail', {}],
    [403, { ok: false, error: 'banned' }, 'vclProFail', {}],
    [401, { ok: false, error: 'auth' }, 'vclProFail', {}],
    [500, undefined, 'vclProFail', {}],
    [200, { ok: true, id: JID }, 'vclProFail', {}], // جواب ناقص: لا هدف رفع
  ]) {
    const c = await go({ start: [R(status, body)] });
    assert.deepEqual([c.msg(), c.err(), c.xhrs.length, c.CL.busy, c.PRO.stage, c.PRO.id, c.shown('vmkClPro')], [EN(key, vars), true, 0, false, '', '', true], status + ' ' + JSON.stringify(body));
  }
  // انقطاع عند البدء، وفشل الرفع نفسه: «تعذّر الرفع» — ولا فحص بعده
  let c = await go({ start: ['net'] });
  assert.deepEqual([c.msg(), c.err()], [DICT.en.vclProUploadFail, true]);
  for (const st of [403, 500, 0]) {
    c = await go({ start: [START] }, { putStatus: st });
    assert.deepEqual([c.msg(), c.posts('run').length, c.PRO.up, c.PRO.id], [DICT.en.vclProUploadFail, 0, false, ''], 'PUT ' + st);
  }
  // نوع الرفع ما أصدر الخادم الهدف به حرفيًّا، لا ما يقوله المتصفّح عن الملفّ
  c = await quoted({}, { file: vfile({ name: 'clip.m4v', type: 'video/x-m4v' }) });
  assert.deepEqual([c.posts('start')[0].body.mime, c.xhrs[0].headers['Content-Type'], c.xhrs[0].url], ['video/x-m4v', 'video/mp4', START.body.upload]);
  // السبب الحقيقيّ للمالك وحده، ونصّ الخادم لا يُعرض لغيره
  c = await go({ start: [START] }, { putStatus: 403, user: 'Omran' });
  assert.equal(c.msg(), DICT.en.vclProUploadFail + ' [put: http 403]');
  c = await go({ start: [R(502, { ok: false, error: 'failed', __diag: 'initiate 500: upstream' })] });
  assert.equal(c.msg(), DICT.en.vclProFail + ' [initiate 500: upstream]', '__diag يرسله الخادم للمالك فقط');
  c = await go({ start: [R(502, { ok: false, error: 'failed', detail: 'secret upstream text', message: 'x' })] });
  assert.equal(c.msg(), DICT.en.vclProFail);

  // الفحص: «لم يصل بعد» و«أعد» وعطل الشبكة والبوّابة تُعاد بفاصل ثانيتين حتّى العرض
  c = await go({ start: [START], run: [R(409, { ok: false, error: 'not_uploaded' }), R(503, { ok: false, error: 'retry' }), 'net', R(504, undefined), R(200, QUOTE)] });
  const at = c.posts('run').map((f) => f.at);
  assert.deepEqual([at.length, at.slice(1).map((v, i) => v - at[i]).join(), c.msg(), c.$('vmkClPro').textContent], [5, '2000,2000,2000,2000', EN('vclProQuote', { s: 10, n: 90, p: 500 }), EN('vclProConfirm', { n: 90 })]);
  assert.ok(c.posts('run').every((f) => f.body.id === JID && f.body.confirmed === undefined), 'الفحص بلا تأكيد');
  // اثنتا عشرة محاولة ثمّ يتوقّف
  for (const [reply, key] of [[R(409, { ok: false, error: 'not_uploaded' }), 'vclProUploadFail'], [R(503, { ok: false, error: 'retry' }), 'vclProFail'], ['net', 'vclProUploadFail'], [R(502, undefined), 'vclProFail']]) {
    c = await go({ start: [START], run: [reply] });
    assert.deepEqual([c.posts('run').length, c.msg(), c.err(), c.PRO.id], [12, DICT.en[key], true, ''], JSON.stringify(reply));
  }
  // رفض القياس: بنصّه، بلا إعادة
  for (const [status, error, key, vars] of [[422, 'fps', 'vclProSpec', {}], [422, 'resolution', 'vclProSpec', {}], [415, 'format', 'vclProSpec', {}], [413, 'too_long', 'vclProTooLong', { s: 30 }], [413, 'too_big', 'vclTooBig', { n: 80 }], [503, 'unavailable', 'vclProUnavailable', {}], [404, 'not_found', 'vclProFail', {}]]) {
    c = await go({ start: [START], run: [R(status, { ok: false, error })] });
    assert.deepEqual([c.posts('run').length, c.msg(), c.err()], [1, EN(key, vars), true], error);
  }
  // مهمّة الحساب جارية (بدء أو فحص): القسم يتابعها بلا إلغاء
  c = await go({ start: [R(409, { ok: false, error: 'busy', job: JID2 })], status: [R(200, { ok: true, state: 'running', id: JID2 })] });
  await c.until(() => c.posts('status').length >= 1, 'متابعة الجارية');
  assert.deepEqual([c.posts('status')[0].body.id, c.xhrs.length, c.PRO.stage, c.shown('vmkClCancel'), c.wk()], [JID2, 0, 'run', false, DICT.en.vclProWorking]);
  c = await go({ start: [START], run: [RUNNING], status: [RUNNING] });
  await c.until(() => c.posts('status').length >= 1, 'أُكّدت من نافذة أخرى');
  assert.deepEqual([c.posts('status')[0].body.id, c.PRO.stage], [JID, 'run']);
});

test('١٥ح. بعد إرسال التأكيد الحالة عند الخادم هي الحقيقة: جواب غير واضح لا يُفسَّر، و«لم يُخصم شيء» للرفض الصريح وحده', async () => {
  // انقطاع بعد الإرسال: لا رسالة ولا إعادة إرسال — تُسأل الحالة، ثمّ يُعلن ما تقوله
  let c = await quoted({ confirm: ['net'], status: [RUNNING, RUNNING, R(200, { ok: true, state: 'failed', id: JID, refunded: 90 })] });
  c.click();
  await c.until(() => c.posts('status').length >= 1, 'سؤال الحالة');
  assert.deepEqual([c.CL.busy, c.PRO.stage, c.msg(), c.shown('vmkClCancel')], [true, 'run', '', false]);
  await c.until(() => !c.CL.busy, 'نهاية');
  assert.deepEqual([c.msg(), c.err(), c.confirms().length, c.store.get('vmk_pro_seen')], [EN('vclProRefunded', { n: 90 }), true, 1, JID]);
  assert.doesNotMatch(c.msg(), NO_CHARGE_RE);
  assert.deepEqual(c.wallets, ['points', 'premium']);

  // «فشل» بلا ردّ مُعلن، وجواب مشوَّه، ورمز مجهول: ليست «لم يُخصم شيء» — الحالة تحكم
  c = await quoted({ confirm: [R(502, { ok: false, error: 'failed' })], status: [R(200, Object.assign({ state: 'quoted' }, QUOTE))] });
  c.click();
  await c.until(() => !c.CL.busy, 'عودة العرض');
  assert.deepEqual([c.posts('status').length, c.msg(), c.err(), c.btn().textContent, c.PRO.id], [1, EN('vclProQuote', { s: 10, n: 90, p: 500 }), false, EN('vclProConfirm', { n: 90 }), JID], 'ما زالت مسعَّرة: العرض من جديد بلا خصم');
  for (const reply of [R(504, undefined), R(500, { error: 'weird_new_code' }), R(503, { ok: false, error: 'retry' }), R(200, {})]) {
    c = await quoted({ confirm: [reply], status: [RUNNING, DONE] });
    c.click();
    await c.until(() => !!c.CL.out, 'نتيجة بعد جواب غير واضح');
    assert.deepEqual([c.msg(), c.confirms().length], [EN('vclProDone', { n: 90, s: 10 }), 1], JSON.stringify(reply));
  }

  // التكلفة تغيّرت: عرض جديد بلا خصم ولا استطلاع، والتأكيد التالي بالرقم الجديد
  c = await quoted({ confirm: [R(200, Object.assign({}, QUOTE, { cost: 170, changed: true })), R(200, { ok: true, state: 'running', id: JID, cost: 170, points: 330 })], status: [RUNNING] });
  c.click();
  await c.until(() => !c.CL.busy, 'عرض جديد');
  assert.deepEqual([c.btn().textContent, c.msg(), c.posts('status').length, c.wallets.length], [EN('vclProConfirm', { n: 170 }), EN('vclProQuote', { s: 10, n: 170, p: 500 }), 0, 0]);
  c.click();
  await c.until(() => c.posts('status').length >= 1, 'جارٍ');
  assert.deepEqual(c.confirms().map((f) => f.body.cost), [90, 170]);

  // رفض صريح قبل الخصم: بنصّه، بلا استطلاع؛ نقص الرصيد وتوقّف الخدمة يُبقيان العرض
  for (const [status, body, key, vars, keep] of [
    [503, { ok: false, error: 'unavailable' }, 'vclProUnavailable', {}, true],
    [402, { ok: false, error: 'points_insufficient', needed: 90, points: 5 }, 'vclProNoPoints', { p: 5, n: 90 }, true],
    [404, { ok: false, error: 'not_found' }, 'vclProFail', {}, false],
    [403, { ok: false, error: 'banned' }, 'vclProFail', {}, false],
    [401, { ok: false, error: 'auth' }, 'vclProFail', {}, false],
    [422, { ok: false, error: 'resolution' }, 'vclProSpec', {}, false],
  ]) {
    c = await quoted({ confirm: [R(status, body)] });
    c.click();
    await c.until(() => !c.CL.busy, body.error);
    assert.deepEqual([c.msg(), c.err(), c.posts('status').length, !!c.PRO.quote, c.PRO.id, c.btn().textContent], [EN(key, vars), true, 0, keep, keep ? JID : '', keep ? EN('vclProConfirm', { n: 90 }) : 'Pro enhance'], body.error);
  }

  // خُصم ثمّ تعذّر الإرسال: الردّ في الجواب نفسه؛ ومن لم يُخصم منه شيء (المالك) لا يُقال له «أُعيدت 0»
  c = await quoted({ confirm: [R(502, { ok: false, error: 'failed', refunded: 90 })] });
  c.click();
  await c.until(() => !c.CL.busy, 'ردّ في الجواب');
  assert.deepEqual([c.msg(), c.err(), c.posts('status').length, c.PRO.id, c.wallets.join()], [EN('vclProRefunded', { n: 90 }), true, 0, '', 'points,premium']);
  c = await quoted({ confirm: [R(503, { ok: false, error: 'unavailable', refunded: 0 })] });
  c.click();
  await c.until(() => !c.CL.busy, 'بلا خصم أصلًا');
  assert.deepEqual([c.msg(), c.posts('status').length, c.PRO.id], [DICT.en.vclProUnavailable, 0, '']);

  // «مشغول»: تأكيد من نافذة أخرى للمهمّة نفسها، أو مهمّة أخرى للحساب — تُتابَع ولا يُعاد الإرسال
  c = await quoted({ confirm: [R(409, { ok: false, error: 'busy', job: JID2 })], status: [R(200, { ok: true, state: 'running', id: JID2 })] });
  c.click();
  await c.until(() => c.posts('status').length >= 2, 'متابعة الأخرى');
  assert.deepEqual([[...new Set(c.posts('status').map((f) => f.body.id))].join(), c.confirms().length, c.CL.busy], [JID2, 1, true]);
});

test('١٥ط. الاستطلاع: كلّ ٥ث ثمّ ١٠ث، أخطاؤه ليست فشل المهمّة، ستّة متتالية أو خمسون دقيقة = تُترك تكمل، والنتيجة التي تعذّر جلبها تنتظر', async () => {
  const CONF = R(200, { ok: true, state: 'running', id: JID, cost: 90, points: 410 });
  const watching = async (status, o) => { const c = await quoted({ confirm: [CONF], status }, o); c.click(); await c.settle(); return c; };
  const ERR = [R(503, { ok: false, error: 'retry' }), 'net', R(502, undefined), R(503, { ok: false, error: 'unavailable' }), R(401, { ok: false, error: 'auth' })];

  // خمسة أخطاء متتالية ثمّ جواب سليم، مرّتين: المهمّة ما زالت جارية بلا رسالة
  let c = await watching(ERR.concat([RUNNING], ERR, [RUNNING]));
  await c.until(() => c.posts('status').length >= 12, '١٢ استطلاعًا');
  assert.deepEqual([c.CL.busy, c.PRO.parked, c.msg(), c.PRO.stage], [true, '', '', 'run']);
  // ستّة متتالية: تُترك تكمل على الخادم — لا «فشل» ولا «لم يُخصم»
  c = await watching([RUNNING].concat(ERR, ['net', RUNNING]));
  await c.until(() => !c.CL.busy, 'ركن');
  assert.deepEqual([c.posts('status').length, c.PRO.parked, c.msg(), c.err(), c.PRO.stage, c.store.has('vmk_pro_seen')], [7, JID, DICT.en.vclProLater, false, '', false]);
  assert.doesNotMatch(c.msg(), NO_CHARGE_RE);

  // تأكيد لم يُعرف مصيره ثمّ رُكن: زرّ الملفّ نفسه يسأل الخادم عن المهمّة — لا رفع ثانٍ ولا عرض ثانٍ لفيديو ربّما خُصم ثمنه
  const LOST = ['net', 'net', 'net', 'net', 'net', 'net'];
  c = await quoted({ confirm: ['net'], status: LOST.concat([RUNNING, DONE]) });
  c.click();
  await c.until(() => !c.CL.busy, 'ركن بعد تأكيد مجهول المصير');
  assert.deepEqual([c.PRO.parked, c.msg(), c.btn().textContent, c.shown('vmkClPro')], [JID, DICT.en.vclProLater, 'Pro enhance', true]);
  c.click();
  await c.until(() => !!c.CL.out, 'النتيجة بعد النقر');
  assert.deepEqual([c.posts('start').length, c.xhrs.length, c.posts('run').length, c.confirms().length, c.msg()], [1, 1, 2, 1, EN('vclProDone', { n: 90, s: 10 })]);
  // …وإن تبيّن أنّ التأكيد لم يصل (ما زالت مسعَّرة): العرض من جديد، والنقرة التالية تأكيد لا دوران
  c = await quoted({ confirm: ['net', CONF], status: LOST.concat([R(200, Object.assign({ state: 'quoted' }, QUOTE)), RUNNING]) });
  c.click();
  await c.until(() => !c.CL.busy, 'ركن');
  c.click();
  await c.until(() => !c.CL.busy, 'العرض من جديد');
  assert.deepEqual([c.PRO.parked, c.msg(), c.btn().textContent], ['', EN('vclProQuote', { s: 10, n: 90, p: 500 }), EN('vclProConfirm', { n: 90 })]);
  c.click();
  await c.until(() => c.posts('status').length >= 8, 'جارٍ بعد التأكيد الثاني');
  assert.deepEqual([c.confirms().length, c.posts('start').length, c.PRO.stage], [2, 1, 'run']);
  // وملفّ آخر بعد الركن: الزرّ يسأل الخادم عن المهمّة المركونة أوّلًا — لا بدء ثانٍ ولا رفع، ولا مهمّة جديدة فوق نتيجة مدفوعة لم تُعرض
  c = await quoted({ confirm: ['net'], start: [START, R(409, { ok: false, error: 'busy', job: JID })], status: LOST.concat([RUNNING]) });
  c.click();
  await c.until(() => !c.CL.busy, 'ركن');
  await c.pick(vfile({ name: 'other.mp4' }));
  c.click();
  await c.until(() => c.posts('status').length >= 7, 'متابعة الجارية');
  assert.deepEqual([c.posts('start').length, c.xhrs.length, c.PRO.stage, c.posts('status')[6].body.id], [1, 1, 'run', JID]);

  // الإيقاع والحدّ: ٥ث في أوّل دقيقتين ثمّ ١٠ث، وعند خمسين دقيقة يتوقّف الاستطلاع
  c = await watching([RUNNING]);
  await c.until(() => !c.CL.busy, 'خمسون دقيقة', 4000);
  const at = c.posts('status').map((f) => f.at);
  const gaps = at.slice(1).map((v, i) => v - at[i]);
  assert.deepEqual([at.length, gaps.slice(0, 24).every((g) => g === 5000), gaps.slice(24).every((g) => g === 10000), at[at.length - 1] - at[0]], [313, true, true, 3000000]);
  assert.deepEqual([c.PRO.parked, c.msg(), c.clock - at[0]], [JID, DICT.en.vclProLater, 3000000]);
  // الصفحة نامت (هاتف مقفل، تبويب في الخلفيّة — والنصّ نفسه يدعو المستخدم للمغادرة) وعادت بعد ساعة: تسأل الخادم مرّة قبل أن تقول شيئًا.
  // المهمّة انتهت فتُعرض نتيجتها (كان: تُركن بلا سؤال وتقول «ما زال التحسين جاريًا» لمهمّة اكتملت)…
  c = await watching([RUNNING, RUNNING, DONE]);
  await c.until(() => c.posts('status').length >= 2, 'استطلاعان');
  c.clock += 3600000;
  await c.until(() => !c.CL.busy, 'بعد الاستيقاظ');
  assert.deepEqual([c.posts('status').length, !!c.CL.out, c.msg(), c.PRO.parked], [3, true, EN('vclProDone', { n: 90, s: 10 }), '']);
  // …وإن كانت ما زالت جارية: سؤال واحد ثمّ تُترك تكمل.
  c = await watching([RUNNING]);
  await c.until(() => c.posts('status').length >= 2, 'استطلاعان');
  c.clock += 3600000;
  await c.until(() => !c.CL.busy, 'ركن بعد سؤال واحد');
  assert.deepEqual([c.posts('status').length, c.PRO.parked, c.msg(), !!c.CL.out], [3, JID, DICT.en.vclProLater, false]);

  // «غير موجودة» ثلاثًا متتالية = رجوع صامت؛ مرّتان يقطعهما جواب سليم لا تكفيان
  const NF = R(404, { ok: false, error: 'not_found' });
  c = await watching([NF, NF, RUNNING, NF, NF, NF]);
  await c.until(() => !c.CL.busy, 'ثلاث متتالية');
  assert.deepEqual([c.posts('status').length, c.msg(), c.store.get('vmk_pro_seen'), c.PRO.parked, c.PRO.id], [6, '', JID, '', '']);
  // «انتهت مدّتها»: رجوع صامت
  c = await watching([R(200, { ok: true, state: 'gone', id: JID })]);
  await c.until(() => !c.CL.busy, 'انتهت');
  assert.deepEqual([c.msg(), c.store.get('vmk_pro_seen'), c.shown('vmkClDone')], ['', JID, false]);
  // فشل بلا خصم (حساب معفى): «لم تُخصم» صادقة هنا
  c = await watching([R(200, { ok: true, state: 'failed', id: JID, refunded: 0 })]);
  await c.until(() => !c.CL.busy, 'فشل بلا خصم');
  assert.deepEqual([c.msg(), c.err()], [DICT.en.vclProFail, true]);

  // اكتملت وتعذّر جلبها: ليست فشلًا — تنتظر، والعودة إلى القسم بعد دقيقة تجلبها بأصلها
  c = await quoted({ confirm: [CONF], status: [DONE] });
  c.download = () => ({ status: 502 });
  c.click();
  await c.until(() => !c.CL.busy, 'تعذّر الجلب');
  assert.deepEqual([c.PRO.parked, c.msg(), c.err(), c.CL.out, c.store.has('vmk_pro_seen')], [JID, DICT.en.vclProLater, false, '', false]);
  let n = c.posts('status').length;
  await c.open();
  assert.equal(c.posts('status').length, n, 'لا استئناف قبل دقيقة');
  await c.advance(61000);
  c.download = null;
  await c.open();
  await c.until(() => !!c.CL.out, 'النتيجة بعد العودة');
  assert.deepEqual([!!c.CL.file, c.q('#vmkClean .vmk-cl-ab').style.display !== 'none', c.msg(), c.PRO.parked, c.posts('start').length], [true, true, EN('vclProDone', { n: 90, s: 10 }), '', 1]);

  // الاستئناف من info: معروضة من قبل لا تُسأل؛ وعمل جارٍ لا يُقاطَع؛ ومهمّة لم تُدفع (سباق تأكيد) رجوع صامت يُنسى مؤشّره
  const withJob = (o, status) => client(Object.assign({ tok: 'tok-x', server: scripted({ info: [R(200, Object.assign({}, INFO, { job: JID }))], status: status || [RUNNING] }) }, o));
  c = withJob({ store: new Map([['vmk_pro_seen', JID]]) });
  await c.open(); await c.advance(5000);
  assert.deepEqual([c.posts().length, c.CL.busy], [0, false]);
  c = withJob();
  c.CL.busy = true; // المسار المجّانيّ يعمل
  await c.open(); await c.advance(5000);
  assert.equal(c.posts().length, 0);
  c.CL.busy = false;
  await c.open();
  await c.until(() => c.posts('status').length >= 1, 'استئناف بعد الفراغ');
  assert.deepEqual([c.PRO.stage, c.shown('vmkClCancel')], ['run', false]);
  // عُرضت في نافذة أخرى للمتصفّح نفسه بعد قراءة الإعداد هنا: لا تُستأنف
  c = withJob();
  c.CL.busy = true;
  await c.open();
  c.store.set('vmk_pro_seen', JID);
  c.CL.busy = false;
  await c.open(); await c.advance(5000);
  assert.deepEqual([c.posts().length, c.CL.busy], [0, false]);
  c = withJob({}, [R(200, Object.assign({ state: 'quoted' }, QUOTE))]);
  await c.open();
  await c.until(() => c.posts('status').length >= 1 && !c.CL.busy, 'مهمّة لم تُدفع');
  n = c.posts('status').length;
  await c.advance(61000); await c.open(); await c.advance(5000);
  assert.deepEqual([c.msg(), c.PRO.quote, c.posts('status').length, c.store.has('vmk_pro_seen')], ['', null, n, false]);
  // بلا جلسة لا استئناف
  c = withJob({ tok: '' });
  await c.open(); await c.advance(5000);
  assert.equal(c.posts().length, 0);
});

test('١٥ك. متابعة مهمّة مدفوعة لا تقفل القسم: اختيار ملفّ يخرج منها والمسار المجّانيّ يعمل كما كان، الاستئناف التلقائيّ لا يأخذ ما على الشاشة، وزرّ «تحسين احترافي» يعيد النتيجة المدفوعة', async () => {
  const CONF = R(200, { ok: true, state: 'running', id: JID, cost: 90, points: 410 });
  const ffOk = () => ({ on() {}, off() {}, createDir: async () => {}, mount: async () => {}, unmount: async () => {}, exec: async () => 0, readFile: async () => ({ buffer: new ArrayBuffer(8) }), deleteFile: async () => {}, terminate() {} });
  const free = async (c) => { c.CL.ff = ffOk(); c.$('vmkClGo').onclick(); await c.until(() => !!c.CL.out, 'تحسين مجّانيّ'); return c.CL.out; };
  const locked = (c) => [c.CL.busy, c.PRO.stage, c.shown('vmkClGo'), c.shown('vmkClCancel')];
  const back = async (c) => { await c.advance(61000); await c.open(); await c.advance(15000); }; // العودة إلى القسم بعد أكثر من دقيقة

  // (١) مهمّة أُكّدت في هذه الجلسة: «جارٍ» بلا زرّ مجّانيّ ولا إلغاء — كان يبقى كذلك حتّى تنتهي أو خمسين دقيقة، ثمّ يعود القفل عند كلّ فتح.
  const phase = { done: false };
  let c = await quoted({ confirm: [CONF], status: [() => (phase.done ? DONE : RUNNING)] });
  c.click();
  await c.until(() => c.posts('status').length >= 2, 'جارٍ');
  assert.deepEqual(locked(c), [true, 'run', false, false]);
  c.T.clCancel();
  assert.deepEqual(locked(c), [true, 'run', false, false], 'لا إلغاء بعد الخصم — كما كان');
  // ملفّ مرفوض (أطول من حدّ القسم) لا يُخرج من المتابعة…
  await c.pick(vfile({ name: 'long.mp4' }), { duration: 75, videoWidth: 1280, videoHeight: 720 });
  assert.deepEqual([locked(c), c.CL.file.name], [[true, 'run', false, false], 'My Holiday Clip.mp4']);
  // …وملفّ مقبول يُخرج: المهمّة تكمل على الخادم بلا استطلاع، والقسم كما كان قبل الزرّ المدفوع.
  const other = vfile({ name: 'other-free.mp4' });
  await c.pick(other);
  assert.deepEqual([c.CL.file === other, c.CL.busy, c.PRO.stage, c.PRO.parked, c.PRO.id, c.msg(), c.shown('vmkClGo'), c.shown('vmkClPro'), c.btn().textContent], [true, false, '', JID, '', '', true, true, 'Pro enhance']);
  const polls = c.posts('status').length;
  await c.advance(30000);
  assert.equal(c.posts('status').length, polls, 'المتابعة توقّفت');
  const freeOut = await free(c);
  // العودة بعد دقيقة والمهمّة انتهت: النتيجة المجّانيّة على الشاشة لا تُمحى والملفّ لا يُفرَّغ ولا يعود القفل.
  phase.done = true;
  await back(c);
  assert.deepEqual([c.CL.out, c.revoked.includes(freeOut), c.CL.file === other, c.CL.busy, c.posts('status').length, c.shown('vmkClGo')], [freeOut, false, true, false, polls, true]);
  // زرّ «تحسين احترافي» يسأل الخادم عن المهمّة المدفوعة أوّلًا — لا بدء ثانٍ ولا رفع ثانٍ — ويعرض نتيجتها.
  c.click();
  await c.until(() => !!c.CL.out && c.CL.out !== freeOut, 'النتيجة المدفوعة بالنقر');
  assert.deepEqual([c.posts('start').length, c.xhrs.length, c.confirms().length, c.msg(), c.store.get('vmk_pro_seen'), c.CL.file, c.PRO.parked], [1, 1, 1, EN('vclProDone', { n: 90, s: 10 }), JID, null, '']);

  // (٢) جهاز آخر: المهمّة استؤنفت تلقائيًّا عند فتح القسم فارغًا — اختيار ملفّ يخرج منها، وفتح القسم لاحقًا لا يعيد القفل.
  c = client({ tok: 'tok-x', server: scripted({ info: [R(200, Object.assign({}, INFO, { job: JID }))], status: [RUNNING] }) });
  await c.open();
  await c.until(() => c.posts('status').length >= 1, 'استئناف تلقائيّ');
  assert.deepEqual([c.CL.busy, c.PRO.stage, c.shown('vmkClCancel')], [true, 'run', false]);
  await c.pick();
  assert.deepEqual([!!c.CL.file, c.CL.busy, c.PRO.parked, c.shown('vmkClGo')], [true, false, JID, true]);
  let n = c.posts('status').length;
  await back(c);
  assert.deepEqual([c.CL.busy, c.posts('status').length, !!c.CL.file], [false, n, true], 'كان: يعود القفل بعد دقيقة ويُهمل الملفّ');
  c.click();
  await c.until(() => c.posts('status').length > n, 'الزرّ يعيد المتابعة');
  assert.deepEqual([c.posts('start').length, c.xhrs.length, c.PRO.stage], [0, 0, 'run']);

  // (٣) تأكيد في الطريق واختير ملفّ: يُركن بمعرّفه، جوابه المتروك يُهمل، والزرّ يسأل الحالة (الحقيقة) — لا بدء جديد لفيديو ربّما خُصم ثمنه.
  //     قبله تابعت الواجهة مهمّة أخرى للحساب (انتهت مدّتها): المركون معرّف المهمّة التي يُؤكَّد عليها الآن، لا آخر ما تُوبع.
  let release;
  const gate = new Promise((r) => { release = r; });
  let asked = 0;
  c = client({ tok: 'tok-x', server: scripted({
    info: [R(200, INFO)], start: [R(409, { ok: false, error: 'busy', job: JID2 }), START], run: [R(200, QUOTE)],
    confirm: [async () => { await gate; return CONF; }],
    status: [(rec) => (rec.body.id === JID2 ? R(200, { ok: true, state: 'gone', id: JID2 }) : (asked++ ? DONE : RUNNING))],
  }) });
  await c.open(); await c.pick();
  c.click();
  await c.until(() => !c.CL.busy && c.posts('status').length === 1, 'المهمّة السابقة انتهت مدّتها');
  c.click();
  await c.until(() => !!c.PRO.quote, 'عرض الملفّ');
  c.click();
  await c.pick(vfile({ name: 'mid.mp4' }));
  assert.deepEqual([c.confirms().length, c.CL.busy, c.PRO.parked, c.CL.file.name], [1, false, JID, 'mid.mp4']);
  release();
  await c.settle();
  assert.deepEqual([c.CL.busy, c.posts('status').length, c.wallets.length], [false, 1, 0], 'جواب التأكيد المتروك لا يعيد القفل ولا يُستطلع بعده');
  const starts = c.posts('start').length;
  c.click();
  await c.until(() => !!c.CL.out, 'الحالة تقول الحقيقة');
  assert.deepEqual([c.posts('start').length - starts, c.xhrs.length, c.confirms().length, c.msg()], [0, 1, 1, EN('vclProDone', { n: 90, s: 10 })]);
  assert.ok(c.posts('status').slice(1).every((x) => x.body.id === JID), 'المتابَعة مهمّة هذا الملفّ لا المهمّة السابقة');

  // (٤) مهمّة رُكنت بأخطاء الاستطلاع ثمّ تحسين مجّانيّ لملفّ آخر: العودة كانت تمحو نتيجته وتفرّغ الملفّ المختار.
  c = await quoted({ confirm: [CONF], status: ['net', 'net', 'net', 'net', 'net', 'net', DONE] });
  c.click();
  await c.until(() => !c.CL.busy, 'ركن');
  const second = vfile({ name: 'second-free.mp4' });
  await c.pick(second);
  const out2 = await free(c);
  n = c.posts('status').length;
  await back(c);
  assert.deepEqual([c.CL.out, c.revoked.includes(out2), c.CL.file === second, c.posts('status').length, c.msg()], [out2, false, true, n, '']);
  // …ونتيجة مجّانيّة لملفّ المهمّة نفسه كذلك: لا تُمحى تلقائيًّا — الزرّ يعيد المدفوعة، ومعها «قبل/بعد» لأنّ الأصل أصلها.
  c = await quoted({ confirm: [CONF], status: ['net', 'net', 'net', 'net', 'net', 'net', DONE] });
  c.click();
  await c.until(() => !c.CL.busy, 'ركن');
  const out3 = await free(c);
  n = c.posts('status').length;
  await back(c);
  assert.deepEqual([c.CL.out, c.revoked.includes(out3), c.posts('status').length, c.PRO.parked], [out3, false, n, JID]);
  c.click();
  await c.until(() => c.CL.out !== out3 && !c.CL.busy, 'النتيجة المدفوعة بالنقر');
  assert.deepEqual([!!c.CL.file, c.q('#vmkClean .vmk-cl-ab').style.display !== 'none', c.msg(), c.posts('start').length, c.confirms().length], [true, true, EN('vclProDone', { n: 90, s: 10 }), 1, 1]);

  // (٥) ملفّ اختير قبل وصول جواب الإعداد على جهاز لم يرَ آخر مهمّة للحساب: لا يُفرَّغ ولا تُجلب نتيجتها فوقه — بالنقر فقط.
  let openInfo;
  const infoGate = new Promise((r) => { openInfo = r; });
  c = client({ tok: 'tok-x', server: scripted({ info: [async () => { await infoGate; return R(200, Object.assign({}, INFO, { job: JID })); }], status: [DONE] }) });
  await c.open();
  const mine = vfile({ name: 'my-new-clip.mp4' });
  await c.pick(mine);
  openInfo();
  await c.settle(); await c.advance(5000);
  assert.deepEqual([c.CL.file === mine, c.posts('status').length, c.CL.busy, c.shown('vmkClPro'), c.fetches.filter((x) => x.path === '/api/video-download').length], [true, 0, false, true, 0]);
  c.click();
  await c.until(() => !!c.CL.out, 'نتيجة المهمّة السابقة بالنقر');
  assert.deepEqual([c.posts('start').length, c.CL.file, c.msg()], [0, null, EN('vclProDone', { n: 90, s: 10 })]);
});

test('١٥ي. المسار المجّانيّ كما كان: لا شبكة ولا رفع، وإلغاؤه يُنهي الأداة — ولو كان عرض تكلفة قائمًا', async () => {
  const c = await quoted({});
  const n = c.fetches.length;
  const ops = [];
  const ff = {
    on() {}, off() {}, createDir: async () => {}, mount: async () => { ops.push('mount'); }, unmount: async () => { ops.push('unmount'); },
    exec: async (args) => { ops.push('exec:' + args[args.indexOf('-vf') + 1].split(',').filter((p) => /^(hqdn3d|cas)/.test(p)).join('+')); return 0; },
    readFile: async () => ({ buffer: new ArrayBuffer(8) }), deleteFile: async () => {}, terminate() { ops.push('terminate'); },
  };
  c.CL.ff = ff;
  c.$('vmkClGo').onclick();
  await c.until(() => !!c.CL.out, 'تحسين مجّانيّ');
  assert.deepEqual(ops, ['mount', 'exec:hqdn3d=1.5:1.5:4:4+cas=0.3', 'unmount']);
  assert.deepEqual([c.fetches.length, c.xhrs.length, c.CL.busy, c.CL.showing, c.view.src], [n, 1, false, 'after', c.CL.out], 'المجّانيّ لا يلمس الشبكة');
  assert.deepEqual([!!c.PRO.quote, c.btn().textContent, c.PRO.stage], [true, EN('vclProConfirm', { n: 90 }), ''], 'العرض باقٍ بعد التحسين المجّانيّ');
  ff.exec = () => new Promise(() => {});
  c.$('vmkClGo').onclick();
  await c.settle();
  assert.deepEqual([c.CL.busy, c.wk(), c.shown('vmkClCancel')], [true, DICT.en.vclWorking, true]);
  // اختيار ملفّ أثناء التحسين المجّانيّ يُهمل كما كان (الخروج بالاختيار لمتابعة المهمّة المدفوعة وحدها)
  const kept = c.CL.file;
  await c.pick(vfile({ name: 'ignored.mp4' }));
  assert.deepEqual([c.CL.file === kept, c.CL.busy, c.PRO.parked], [true, true, '']);
  c.$('vmkClCancel').onclick();
  assert.deepEqual([ops.includes('terminate'), c.CL.ff, c.CL.busy, c.fetches.length], [true, null, false, n]);
});

test('١٦. النصوص والوسوم: ١٦ مفتاحًا بالـ١٤ لغة (العربيّة والإنجليزيّة في القاموس الأساسيّ وسطر لكلّ مفتاح في ملفّات اللغات) بخاناتها وبلا اسم مزوّد، والواجهة تستعملها كلّها، والوسوم الثلاثة مرفوعة', () => {
  const base = read('js/app-03-i18n-data.js');
  assert.equal(new Set(PRO_KEYS).size, 16);
  for (const k of PRO_KEYS) {
    assert.equal((base.match(new RegExp('\\b' + k + ': "', 'g')) || []).length, 2, k);
    for (const lg of ['ar', 'en']) {
      const v = DICT[lg][k];
      assert.ok(v && v.trim() === v, lg + ' ' + k);
      assert.deepEqual((v.match(/\{\w+\}/g) || []).sort(), (PRO_HOLES[k] || []).map((h) => '{' + h + '}').sort(), lg + ' ' + k + ': الخانات');
      assert.doesNotMatch(v, LEAK_RE, lg + ' ' + k);
      assert.doesNotMatch(v, /\p{Extended_Pictographic}/u, lg + ' ' + k + ': بلا إيموجي');
    }
    assert.match(DICT.ar[k], /[؀-ۿ]/, k + ' عربيّ');
    assert.doesNotMatch(DICT.en[k], /[؀-ۿ]/, k + ' إنجليزيّ');
  }
  assert.equal(DICT.ar.vclPro, 'تحسين احترافي');
  // الخصوصيّة والمال في سطر التنبيه: يغادر الجهاز، مدّتا الحذف المطلوبتان، حدّ ما نضمنه، ولا خصم قبل التأكيد
  assert.match(DICT.en.vclProNotice, /does not run on your device.*external processing service.*two hours.*two days.*do not control.*nothing is charged before you confirm/);
  assert.match(DICT.ar.vclProNotice, /لا يتم على جهازك.*خدمة معالجة خارجية.*ساعتين.*يومين.*ولا نتحكم.*ولا خصم قبل تأكيدك/);
  assert.match(DICT.en.vclProQuote, /cannot be cancelled after you confirm/);
  assert.match(DICT.ar.vclProQuote, /بعد التأكيد لا يمكن الإلغاء/);
  // اللغات الاثنتا عشرة المحمّلة منفصلة: سطر واحد لكلّ مفتاح بعلامتَي اقتباس مستقيمتين، بخانات الأصل العربيّ نفسها، بلا اسم مزوّد
  // ولا إيموجي، ولا نصّ منسوخ من الإنجليزيّة أو العربيّة (المترجَم مترجَم فعلًا)، والأسطر الستّة عشر متتالية بعد vclLoading.
  const LAZY = /const I18N_LAZY = \[([^\]]+)\]/.exec(read('js/app-04-i18n-state.js'))[1].split(',').map((x) => x.trim().slice(1, -1)).sort();
  assert.deepEqual(LAZY, ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'], 'اللغات المحمّلة منفصلة كما يعرّفها التطبيق: ١٢ + العربيّة والإنجليزيّة = ١٤');
  for (const lg of LAZY) {
    const s = read('i18n/' + lg + '.js');
    assert.ok(!s.includes('\r'), lg + ': نهايات الأسطر LF');
    const lines = s.split('\n');
    const at = lines.findIndex((l) => l.startsWith('  vclLoading: "'));
    assert.ok(at > 0, lg + ': سطر vclLoading');
    PRO_KEYS.forEach((k, i) => {
      // تعريف واحد في الملفّ كلّه: سطر Object.assign لاحق بالاسم نفسه يغلب السطر الأوّل عند التشغيل ويُسقط خانته
      assert.equal((s.match(new RegExp('\\b' + k + '["\']?\\s*:', 'g')) || []).length, 1, lg + ' ' + k + ': تعريف واحد');
      const m = /^ {2}(\w+): "([^"]+)",$/.exec(lines[at + 1 + i]);
      assert.ok(m && m[1] === k, lg + ' ' + k + ': في مكانه بعد vclLoading وبصيغة الملفّ');
      const v = m[2];
      assert.ok(v.trim() === v && !/[\\\t]/.test(v), lg + ' ' + k);
      assert.deepEqual((v.match(/\{\w+\}/g) || []).sort(), (DICT.ar[k].match(/\{\w+\}/g) || []).sort(), lg + ' ' + k + ': الخانات كالأصل العربيّ');
      assert.doesNotMatch(v, LEAK_RE, lg + ' ' + k);
      assert.doesNotMatch(v, /\p{Extended_Pictographic}/u, lg + ' ' + k + ': بلا إيموجي');
      assert.ok(v !== DICT.en[k] && v !== DICT.ar[k], lg + ' ' + k + ': مترجَم');
    });
    // حدود القبول أرقام تُكتب كما هي في كلّ لغة (ما يقوله النصّ = ما يفرضه الخادم)
    const spec = new RegExp('^ {2}vclProSpec: "([^"]+)",$', 'm').exec(s)[1];
    assert.ok(/\bMP4\b/.test(spec) && /\bMOV\b/.test(spec) && spec.includes('1920×1080') && /(^|[^\d])30([^\d]|$)/.test(spec), lg + ' vclProSpec: الحدود');
  }
  // ما تستعمله الواجهة = المفاتيح الستّة عشر بالضبط
  assert.deepEqual([...new Set(VJS.match(/'vclPro\w*'/g).map((s) => s.slice(1, -1)))].sort(), PRO_KEYS.slice().sort());
  const h = read('index.html');
  assert.ok(h.includes('src="/js/video.js?v=451"') && h.includes('css/modules.css?v=687')); // v-app-director: ٤٤١←٤٤٢
  // v-img-format رفع الوسم بعده إلى ٧٣٧ (سببه في الرأس)، وسبب ٧٣٦ باقٍ في التعليق نفسه
  const __tagLine = read('js/app-04-i18n-state.js').split('\n').find((l) => l.includes("sc.src = 'i18n/' + lg + '.js?v=")) || '';
  assert.ok(__tagLine.includes("sc.src = 'i18n/' + lg + '.js?v=760'; /* v-ai-video-speed (749): خمس حالات جديدة لـ«فيديو AI فقط» في القاموس الثنائيّ · v-rich-reply (744): زرّ بطاقة الأسئلة «اعرض التفاصيل» (١٤ لغة) · v-work-log (743): ستّة نصوص لصندوق العمل — «عمل لمدّة» و«الطلب/النتيجة» والوقت (١٤ لغة) · v-read-panel (742): «الكود المقروء» ونصّ رقم الموضع (١٤ لغة) · v-cards (741): بطاقات الخيارات — أربعة مفاتيح (١٤ لغة) · v-app-director-bridge-check (740): ") && __tagLine.includes('v-app-director-voice (739): ') && __tagLine.includes('v-app-director (738): ') && __tagLine.includes('v-img-format (737)') && __tagLine.includes('v-video-enhance-pro (736): '), 'وسم ملفّات اللغات مرفوع، وسببه في رأس التعليق');
});
