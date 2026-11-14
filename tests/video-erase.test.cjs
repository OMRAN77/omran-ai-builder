// tests/video-erase.test.cjs — v-director-erase (طلب المالك ١١ نوفمبر: كتابة محروقة في فيديو مرفوع تُمسح قبل نشره): خيار «بالذكاء» في
// «امسح اسم أو كتابة» يرسل شريطًا حول المربّعات مقاطعَ مع أقنعتها إلى نموذج ترميم عند المزوّد (٥ سنتات للمقطع). الخادم
// (api/_lib/video-erase.js) بشبكة وRedis محاكيين — لا نداء حقيقيّ ولا صرف: المالك وحده، التحقّق قبل أيّ نداء، أهداف رفع لا تكشف رابط
// القراءة، سقف يوميّ يُقرأ عند البدء ويُحجز ذرّيًّا عند الإرسال، إرسال واحد مهما تكرّر النداء، نتيجة كلّ مقطع وفكّ حجز المرفوض وحده،
// الاستطلاع حتّى الروابط والإلغاء بعد ساعة، ولا مفتاح ولا رابط موقَّع في ردّ أو سجلّ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ENV = ['VIDEO_ERASE_CAP_CENTS'];
for (const k of ENV.concat(['OWNER_USERNAMES', 'OWNER_USERNAME'])) delete process.env[k];
process.env.AUTH_SECRET = 'video-erase-test-secret';
const KEY = 'fal-test-key-9e1d:c0ffee42';
process.env.FAL_KEY = KEY;
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// كلّ ما يُكتب في الطرفيّة يُجمع: الروابط والمفتاح لا تظهر في أيّ سجلّ (١٠). للتشخيص: VERASE_DEBUG=1 يطبعه أيضًا.
const con = [];
for (const m of ['log', 'warn', 'error']) console[m] = (...a) => { con.push(a.map((x) => (x && x.stack) || String(x)).join(' ')); if (process.env.VERASE_DEBUG) process.stderr.write(con[con.length - 1] + '\n'); };

// ── Redis في الذاكرة، بمدد المفاتيح وأعطال تُحقن ──
const kv = new Map();
const ttl = new Map();
// failPipe = النداء لم يصل المخزن · pipeNull = أمر أخطأ داخل نداء أجاب (kv.js يرجعه null) · onSet = لحظة كتابة مفتاح · beforeSetnx = ترتيب سباق
const K = { failGet: null, failSet: null, failPipe: null, pipeNull: null, onSet: null, beforeSetnx: null, pipes: [] };
const down = (what) => { throw new Error('kv down: ' + what); };
const put = (k, v, t) => {
  // كلّ كتابة لمفاتيح الميزة بمدّة صريحة — مفتاح بلا مدّة يبقى للأبد (قفل أبديّ أو مهمّة لا تنتهي).
  if (/^verase:/.test(k)) assert.ok(Number(t) > 0, 'مفتاح بلا مدّة: ' + k);
  kv.set(k, String(v));
  ttl.set(k, Number(t) || 0);
};
const arith = (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; };
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => { if (K.failGet && K.failGet(k)) down('GET'); return kv.has(k) ? kv.get(k) : null; },
  kvSetRaw: async (k, v, t) => { if (K.failSet && K.failSet(k, String(v))) down('SET'); put(k, v, t); if (K.onSet) K.onSet(k, String(v)); },
  kvSetIfAbsent: async (k, v, t) => {
    if (K.beforeSetnx) await K.beforeSetnx(k);
    await new Promise((r) => setImmediate(r)); // يفسح للنداء المتزامن — السباق حقيقيّ
    if (K.failSet && K.failSet(k, String(v))) down('SETNX');
    if (kv.has(k)) return false;
    put(k, v, t);
    return true;
  },
  kvDel: async (k) => { kv.delete(k); ttl.delete(k); },
  kvPipeline: async (cmds) => {
    await new Promise((r) => setImmediate(r));
    if (K.failPipe && K.failPipe(cmds)) down('PIPELINE');
    K.pipes.push(cmds);
    // عدّاد الميزة يتحرّك ومدّته في النداء نفسه — عدّاد بلا مدّة يبقى للأبد.
    for (const [op, k] of cmds) {
      if ((op === 'INCRBY' || op === 'DECRBY') && /^verase:/.test(k)) assert.ok(cmds.some((c) => c[0] === 'EXPIRE' && c[1] === k && Number(c[2]) > 0), 'عدّاد بلا مدّة: ' + k);
    }
    return cmds.map(([op, k, a]) => {
      if (K.pipeNull && K.pipeNull(op, k)) return null;
      if (op === 'INCRBY') return arith(k, a);
      if (op === 'DECRBY') return arith(k, -Number(a));
      if (op === 'EXPIRE') { ttl.set(k, Number(a)); return 1; }
      return null; // HGETALL (إصدارات الجلسة في الموجّه) وغيره
    });
  },
});
const logged = [];
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async (scope, err, meta) => { logged.push({ scope, msg: String(err && err.message), meta }); } });

// ── مزوّد مزيّف بمضيفيه الحقيقيّين: هدف الرفع، التخزين، الطابور ──
const CDN = 'https://v3b.fal.media';
const INITIATE = 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3';
const SUBMIT = 'https://queue.fal.run/fal-ai/void-video-inpainting';
const REQS = SUBMIT + '/requests/';
const OUT = (rid) => CDN + '/files/out/' + rid + '-erased-SIGNED.mp4';
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json' } });
const F = { calls: [], files: new Set(), targets: new Map(), reqs: new Map(), n: 0, r: 0 };
function resetF() {
  Object.assign(F, { initFail: 0, initMsg: '', initThrow: false, headFail: 0, submitPlan: null, onSubmit: null, onStatus: null, cancelStatus: 202 });
  F.calls.length = 0; F.files = new Set(); F.targets = new Map(); F.reqs = new Map();
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
    if (F.initThrow) throw new Error('getaddrinfo ENOTFOUND rest.fal.ai (' + INITIATE + ')');
    if (F.initFail) return json({ detail: F.initMsg || 'Bad request' }, F.initFail);
    const n = ++F.n;
    const up = CDN + '/files/upload/' + n + '?X-Signature=UPLOAD-SIG-' + n;
    F.targets.set(up, CDN + '/files/b/' + n + '/' + rec.json.file_name);
    return json({ upload_url: up, file_url: F.targets.get(up) });
  }
  if (F.targets.has(u) && method === 'PUT') { rec.kind = 'put'; F.files.add(F.targets.get(u)); return new Response('', { status: 200 }); }
  if (u.startsWith(CDN + '/files/b/') && method === 'GET') {
    rec.kind = 'head';
    if (F.headFail) return new Response('busy', { status: F.headFail });
    return F.files.has(u) ? new Response('x', { status: 206, headers: { 'content-range': 'bytes 0-0/1000' } }) : new Response('<Error>NoSuchKey</Error>', { status: 404 });
  }
  if (u === SUBMIT && method === 'POST') {
    rec.kind = 'submit'; rec.json = JSON.parse(o.body);
    if (F.onSubmit) F.onSubmit(rec);
    const plan = F.submitPlan && F.submitPlan(rec.json);
    if (plan) return plan();
    const rid = 'req-' + (++F.r) + '-5f0c9a1b';
    F.reqs.set(rid, { body: rec.json, state: 'IN_QUEUE' });
    return json({ request_id: rid, status_url: REQS + rid + '/status', response_url: REQS + rid, cancel_url: REQS + rid + '/cancel', queue_position: 0 });
  }
  if (u.startsWith(REQS)) {
    const rest = u.slice(REQS.length);
    const rid = rest.split('/')[0];
    const q = F.reqs.get(rid);
    if (method === 'PUT' && rest === rid + '/cancel') { rec.kind = 'cancel'; return json({ status: 'CANCELLATION_REQUESTED' }, F.cancelStatus); }
    if (method === 'GET' && rest === rid + '/status') {
      rec.kind = 'status';
      if (F.onStatus) await F.onStatus(rid);
      if (!q) return json({ status: 'NOT_FOUND' }, 404);
      if (q.statusFail) return new Response(q.statusText || 'bad gateway', { status: q.statusFail });
      return json(Object.assign({ status: q.state }, q.error ? { error: q.error } : {}), q.state === 'COMPLETED' ? 200 : 202);
    }
    if (method === 'GET' && rest === rid) {
      rec.kind = 'result';
      if (q && q.result) return q.result();
      return json({ video: { url: OUT(rid), content_type: 'video/mp4' }, seed: 7, timings: { inference: 41.2 } });
    }
  }
  throw new Error('unexpected fetch ' + method + ' ' + u);
};
const calls = (kind) => F.calls.filter((c) => c.kind === kind);
const authOf = (c) => c.headers.Authorization || c.headers.authorization || '';

const er = require(rp('api/_lib/video-erase.js'));
const token = (u, o) => {
  const p = Buffer.from(JSON.stringify(Object.assign({ u, exp: Date.now() + 600000 }, o || {}))).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
const owner = () => token('omran');
// كلّ ردّ يُجمع لفحص التسريب في آخر الملفّ.
const seen = [];
async function call(op, body, opt) {
  const o = opt || {};
  const res = { code: 200, j: null, headers: {}, status(c) { res.code = c; return res; }, json(j) { res.j = JSON.parse(JSON.stringify(j)); return res; }, setHeader(k, v) { res.headers[String(k).toLowerCase()] = v; return res; }, end() { return res; } };
  const tok = o.token === undefined ? owner() : o.token;
  const req = { method: o.method || 'POST', headers: o.headers || {}, query: Object.assign({ action: 'video-erase' }, op ? { op } : {}), body: o.raw !== undefined ? o.raw : Object.assign(tok ? { token: tok } : {}, body || {}) };
  await er(req, res);
  seen.push({ op: op || (body && body.op) || '', code: res.code, j: res.j, headers: res.headers });
  return res;
}

const today = () => new Date().toISOString().slice(0, 10);
const spent = () => Number(kv.get('verase:spent:' + today()) || 0);
const jobOf = (id) => JSON.parse(kv.get('verase:' + id));
const setJob = (id, fn) => { const j = jobOf(id); fn(j); kv.set('verase:' + id, JSON.stringify(j)); };
/** جسم البدء كما تبنيه الواجهة: مقطع لكلّ طول، وقناع واحد لكلّ طول مختلف بعد المقاطع. */
function plan(lens) {
  const files = lens.map((f, i) => ({ size: 1000 + i, type: 'video/mp4' }));
  const mi = {};
  const chunks = lens.map((f, i) => {
    if (mi[f] === undefined) { mi[f] = files.length; files.push({ size: 300, type: 'video/mp4' }); }
    return { v: i, m: mi[f], frames: f };
  });
  return { files, chunks };
}
/** المتصفّح يرفع إلى روابط الكتابة مباشرة (skip: فهارس لا تُرفع). */
async function upload(st, skip) {
  for (let i = 0; i < st.ups.length; i++) {
    if ((skip || []).includes(i)) continue;
    const r = await fetch(st.ups[i].put, { method: 'PUT', headers: { 'Content-Type': st.ups[i].ctype }, body: 'x' });
    assert.equal(r.status, 200);
  }
}
async function ready(lens, skip) {
  const s = await call('start', plan(lens));
  assert.equal(s.code, 200, JSON.stringify(s.j));
  await upload(s.j, skip);
  return s.j.id;
}
/** استطلاع بعد انقضاء قفل الثواني الثلاث (Redis المحاكى لا ينهي المدد وحده). */
async function poll(id) { kv.delete('verase:poll:' + id); return call('status', { id }); }
const ridOf = (id, i) => jobOf(id).chunks[i].req.id;
function reset() {
  for (const k of ENV.concat(['OWNER_USERNAMES', 'OWNER_USERNAME'])) delete process.env[k];
  process.env.FAL_KEY = KEY;
  kv.clear(); ttl.clear();
  Object.assign(K, { failGet: null, failSet: null, failPipe: null, pipeNull: null, onSet: null, beforeSetnx: null });
  K.pipes.length = 0;
  resetF();
}

test('١. المالك وحده: بلا جلسة ٤٠١، وحساب آخر ٤٠٣، وGET ٤٠٥، وإجراء مجهول ٤٠٠ — بلا نداء شبكة ولا كتابة، وno-store على كلّ ردّ', async () => {
  reset();
  const body = plan([197, 120]);
  const r1 = await call('start', body, { token: '' });
  const r2 = await call('start', body, { token: token('ali') });
  const r3 = await call('start', body, { method: 'GET' });
  const r4 = await call('nope', body);
  const r5 = await call('start', body, { token: token('omran', { exp: Date.now() - 1000 }) });
  const r6 = await call('start', body, { token: owner().slice(0, -3) + 'abc' });
  const r7 = await call('start', body, { method: 'OPTIONS' });
  assert.deepEqual([r1.code, r1.j], [401, { ok: false, error: 'auth' }]);
  assert.deepEqual([r2.code, r2.j], [403, { ok: false, error: 'owner_only' }]);
  assert.deepEqual([r3.code, r3.j], [405, { ok: false, error: 'method' }]);
  assert.deepEqual([r4.code, r4.j], [400, { ok: false, error: 'bad_op' }]);
  assert.deepEqual([r5.code, r6.code, r7.code], [401, 401, 204], 'رمز منتهٍ ورمز مزوّر = لا جلسة');
  for (const r of [r1, r2, r3, r4, r5, r6, r7]) assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(F.calls.length, 0, 'لا نداء شبكة قبل البوّابة');
  assert.equal(kv.size, 0, 'لا كتابة قبل البوّابة');
  // الرمز من ?token= أو Bearer كذلك، والإجراء من الجسم إن غاب من الرابط
  const viaQ = await call('', {}, { token: '', raw: { op: 'nope' }, headers: {} });
  assert.equal(viaQ.code, 401);
  const res = { code: 0, j: null, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, setHeader() { return res; }, end() { return res; } };
  await er({ method: 'POST', headers: { authorization: 'Bearer ' + owner() }, query: { action: 'video-erase' }, body: { op: 'nope' } }, res);
  assert.deepEqual([res.code, res.j.error], [400, 'bad_op'], 'Bearer يمرّ');
  await er({ method: 'POST', headers: {}, query: { action: 'video-erase', op: 'nope', token: owner() }, body: {} }, res);
  assert.deepEqual([res.code, res.j.error], [400, 'bad_op'], '?token= يمرّ');
  // مالك من البيئة يُضاف ولا يستبدل omran
  process.env.OWNER_USERNAMES = 'boss';
  assert.equal((await call('nope', {}, { token: token('boss') })).code, 400);
  assert.equal((await call('nope', {})).code, 400);
  delete process.env.OWNER_USERNAMES;
  // بلا مفتاح: «متوقّف» لكلّ إجراء — لا انهيار ولا نداء
  delete process.env.FAL_KEY;
  for (const op of ['start', 'submit', 'status']) assert.deepEqual([(await call(op, body)).code, seen[seen.length - 1].j.error], [503, 'unavailable'], op);
  process.env.FAL_KEY = '   ';
  assert.equal((await call('start', body)).j.error, 'unavailable', 'مفتاح فراغات = لا مفتاح');
  process.env.FAL_KEY = KEY;
  assert.equal(F.calls.length, 0);
});

test('٢. البدء: هدف رفع لكلّ ملفّ بعمر ٣ ساعات واسم عشوائيّ، رابط القراءة في KV لا في الردّ، و٥ سنتات للمقطع بلا حجز', async () => {
  reset();
  const body = plan([197, 197, 120]); // ٣ مقاطع + قناعا الطولين = ٥ ملفّات
  const s = await call('start', body);
  assert.equal(s.code, 200, JSON.stringify(s.j));
  assert.deepEqual(Object.keys(s.j).sort(), ['cents', 'id', 'ok', 'ups']);
  assert.ok(/^[a-f0-9]{24}$/.test(s.j.id));
  assert.equal(s.j.cents, 15);
  assert.equal(s.j.ups.length, 5);
  for (const u of s.j.ups) { assert.deepEqual(Object.keys(u).sort(), ['ctype', 'put']); assert.equal(u.ctype, 'video/mp4'); assert.ok(u.put.startsWith(CDN + '/files/upload/')); }
  const ini = calls('initiate');
  assert.equal(ini.length, 5);
  for (const c of ini) {
    assert.equal(authOf(c), 'Key ' + KEY);
    for (const h of ['X-Fal-Object-Lifecycle', 'X-Fal-Object-Lifecycle-Preference']) assert.deepEqual(JSON.parse(c.headers[h]), { expiration_duration_seconds: er.FILE_TTL });
    assert.equal(er.FILE_TTL, 10800);
    assert.equal(c.json.content_type, 'video/mp4');
    assert.ok(/^er-[0-9a-f]{16}\.mp4$/.test(c.json.file_name), 'اسم عشوائيّ بلا اسم المستخدم: ' + c.json.file_name);
    assert.ok(c.signal, 'مهلة صريحة');
  }
  assert.equal(new Set(ini.map((c) => c.json.file_name)).size, 5);
  const j = jobOf(s.j.id);
  assert.equal(ttl.get('verase:' + s.j.id), er.UPLOAD_TTL);
  assert.equal(er.UPLOAD_TTL, 7200);
  assert.deepEqual([j.u, j.st, j.files.length], ['omran', 'upload', 5]);
  assert.ok(j.files.every((f) => f.startsWith(CDN + '/files/b/')), 'روابط القراءة في السجلّ');
  assert.deepEqual(j.chunks, [{ v: 0, m: 3, f: 197 }, { v: 1, m: 3, f: 197 }, { v: 2, m: 4, f: 120 }]);
  assert.ok(!JSON.stringify(s.j).includes('/files/b/'), 'رابط القراءة لا يغادر الخادم');
  assert.equal(kv.has('verase:spent:' + today()), false, 'البدء يقرأ السقف ولا يحجز');
  assert.equal(calls('submit').length + calls('head').length, 0);
  // النوع بمعاملات يُقبل، والإجراء من الجسم، وحدّ الحجم نفسه مقبول، وجسم نصّيّ يُحلَّل
  const b2 = plan([69]); b2.files[0].type = 'Video/MP4; codecs="avc1.640028"'; b2.files[1].size = er.MAX_BYTES; b2.op = 'start';
  assert.equal((await call('', b2)).code, 200);
  assert.equal((await call('start', null, { raw: JSON.stringify(Object.assign({ token: owner() }, plan([5]))) })).code, 200, 'جسم نصّيّ');
  // أعطال هدف الرفع: لا مهمّة تُحفظ، والسبب للمالك في __diag بلا رابط ولا مفتاح
  const before = [...kv.keys()].filter((k) => /^verase:[a-f0-9]{24}$/.test(k)).length;
  const cases = [[() => { F.initFail = 500; }, 503, 'retry'], [() => { F.initFail = 429; }, 503, 'retry'], [() => { F.initThrow = true; }, 503, 'retry'],
    [() => { F.initFail = 400; F.initMsg = 'bad content type for key ' + KEY + ' see ' + INITIATE; }, 502, 'failed'],
    [() => { F.initFail = 403; F.initMsg = 'User is locked. Reason: Exhausted balance.'; }, 503, 'unavailable']];
  for (const [arm, code, error] of cases) {
    resetF(); arm();
    const r = await call('start', plan([197]));
    assert.deepEqual([r.code, r.j.error], [code, error], JSON.stringify(r.j));
    assert.ok(typeof r.j.__diag === 'string' && r.j.__diag.length > 0, 'تشخيص للمالك');
    assert.ok(!r.j.__diag.includes(KEY) && !r.j.__diag.includes('https://'), r.j.__diag);
  }
  assert.equal([...kv.keys()].filter((k) => /^verase:[a-f0-9]{24}$/.test(k)).length, before, 'لا مهمّة بلا أهداف رفعها');
  // تعذّر قراءة السقف = «أعد» قبل أيّ هدف
  resetF(); K.failGet = (k) => /^verase:spent:/.test(k);
  assert.deepEqual([(await call('start', plan([197]))).j.error, calls('initiate').length], ['retry', 0]);
  K.failGet = null;
  // تعذّر حفظ المهمّة بعد الأهداف = «أعد»
  K.failSet = (k) => /^verase:[a-f0-9]{24}$/.test(k);
  assert.equal((await call('start', plan([197]))).j.error, 'retry');
  K.failSet = null;
});

test('٣. التحقّق قبل أيّ نداء: الأعداد والأحجام والأنواع والفهارس، وكلّ ملفّ مستعمل بدور واحد', async () => {
  reset();
  const B = (fn) => { const b = plan([197, 197, 120]); fn(b); return b; };
  const lens30 = new Array(28).fill(197).concat([100, 120]); // ٣٠ مقطعًا بثلاثة أطوال = ٣٣ ملفًّا
  const bad = [
    [{}, 400, 'bad_request'],
    [{ files: 'x', chunks: [] }, 400, 'bad_request'],
    [B((b) => { b.chunks = []; }), 400, 'bad_request'],
    [B((b) => { b.files = []; }), 400, 'bad_request'],
    [plan(new Array(31).fill(197)), 413, 'too_long'],
    [plan(lens30), 400, 'bad_request'],
    [B((b) => { b.files[0].size = 0; }), 400, 'bad_request'],
    [B((b) => { b.files[0].size = 10.5; }), 400, 'bad_request'],
    [B((b) => { b.files[0].size = '1000'; }), 400, 'bad_request'],
    [B((b) => { b.files[1] = null; }), 400, 'bad_request'],
    [B((b) => { b.files[2].size = er.MAX_BYTES + 1; }), 413, 'too_big'],
    [B((b) => { b.files[3].type = 'video/webm'; }), 415, 'format'],
    [B((b) => { delete b.files[0].type; }), 415, 'format'],
    [B((b) => { b.chunks[0].v = 5; }), 400, 'bad_request'],
    [B((b) => { b.chunks[0].m = -1; }), 400, 'bad_request'],
    [B((b) => { b.chunks[0].m = 0; }), 400, 'bad_request'],
    [B((b) => { b.chunks[0].frames = 0; }), 400, 'bad_request'],
    [B((b) => { b.chunks[0].frames = 198; }), 400, 'bad_request'],
    [B((b) => { b.chunks[0].frames = 1.5; }), 400, 'bad_request'],
    [B((b) => { b.chunks[1] = null; }), 400, 'bad_request'],
    [B((b) => { b.files.push({ size: 10, type: 'video/mp4' }); }), 400, 'bad_request'], // ملفّ لا يستعمله مقطع
    [B((b) => { b.chunks[2].m = 0; }), 400, 'bad_request'], // فيديو المقطع الأوّل قناعًا للثالث
    [B((b) => { b.chunks[2].v = 3; b.chunks[2].m = 4; }), 400, 'bad_request'], // قناع الأوّلين فيديو للثالث
  ];
  for (const [body, code, error] of bad) {
    const r = await call('start', body);
    assert.deepEqual([r.code, r.j.error], [code, error], JSON.stringify(body).slice(0, 160));
  }
  assert.deepEqual((await call('start', plan(new Array(31).fill(197)))).j, { ok: false, error: 'too_long', maxChunks: 30 });
  assert.deepEqual((await call('start', B((b) => { b.files[0].size = er.MAX_BYTES + 1; }))).j, { ok: false, error: 'too_big', maxMB: 50 });
  assert.equal(F.calls.length, 0, 'لا هدف رفع لطلب مرفوض');
  assert.equal(kv.size, 0, 'لا كتابة لطلب مرفوض');
  // الحدود نفسها مقبولة: ٣٠ مقطعًا بطولين (٣٢ ملفًّا)، ومقطع من إطار واحد، و١٩٧
  assert.equal((await call('start', plan(new Array(29).fill(197).concat([1])))).code, 200);
  assert.equal(calls('initiate').length, 32);
  assert.deepEqual(er.planOf(plan([1, 197])).chunks, [{ v: 0, m: 2, f: 1 }, { v: 1, m: 3, f: 197 }]);
});

test('٤. السقف: قراءة عند البدء، وحجز ذرّيّ عند الإرسال — إرسالان متزامنان لا يتجاوزانه، والصفر يغلق الصرف لا المتابعة', async () => {
  reset();
  assert.equal(er.capCents(), 200);
  process.env.VIDEO_ERASE_CAP_CENTS = 'abc';
  assert.equal(er.capCents(), 200, 'قيمة غير صالحة = البديل');
  process.env.VIDEO_ERASE_CAP_CENTS = ' 40 ';
  assert.equal(er.capCents(), 40);
  kv.set('verase:spent:' + today(), '30');
  const over = await call('start', plan([197, 197, 120]));
  assert.deepEqual([over.code, over.j], [503, { ok: false, error: 'cap', left: 10 }]);
  assert.equal(calls('initiate').length, 0, 'لا هدف رفع فوق السقف');
  assert.equal((await call('start', plan([197, 120]))).code, 200, '٣٠ + ١٠ = السقف نفسه: مقبول');
  assert.equal(spent(), 30, 'البدء لا يحجز');

  // حجز ذرّيّ: سقف ٥٠، مهمّتان بستّة مقاطع (٣٠ سنتًا) تمرّان فحص البدء، وإرسالهما معًا لا يتجاوزه
  reset();
  process.env.VIDEO_ERASE_CAP_CENTS = '50';
  const a = await ready(new Array(6).fill(197));
  const b = await ready(new Array(6).fill(197));
  const [ra, rb] = await Promise.all([call('submit', { id: a }), call('submit', { id: b })]);
  const won = [ra, rb].filter((r) => r.code === 200);
  const lost = [ra, rb].filter((r) => r.code !== 200);
  assert.equal(won.length, 1, JSON.stringify([ra.j, rb.j]));
  assert.deepEqual([lost[0].code, lost[0].j], [503, { ok: false, error: 'cap', left: 20 }]);
  assert.equal(spent(), 30, 'العدّاد = المرسَل وحده');
  assert.equal(calls('submit').length, 6, 'مقاطع المهمّة الفائزة وحدها');
  assert.equal(ttl.get('verase:spent:' + today()), 172800, 'العدّاد بمدّته');
  const loser = ra.code === 200 ? b : a;
  assert.equal(jobOf(loser).st, 'upload', 'المرفوضة باقية للرفع: تُرسل بعد رفع السقف');
  process.env.VIDEO_ERASE_CAP_CENTS = '100';
  assert.equal((await call('submit', { id: loser })).j.state, 'running');
  assert.deepEqual([spent(), calls('submit').length], [60, 12]);

  // تعذّر العدّ = لا صرف على عمًى: النداء لم يصل، أو أمر الزيادة أخطأ داخله
  const c = await ready([197]);
  K.failPipe = (cmds) => cmds.some((x) => x[0] === 'INCRBY');
  assert.deepEqual([(await call('submit', { id: c })).j.error, calls('submit').length, jobOf(c).st], ['retry', 12, 'upload']);
  K.failPipe = null; K.pipeNull = (op) => op === 'INCRBY';
  assert.deepEqual([(await call('submit', { id: c })).j.error, calls('submit').length, jobOf(c).st], ['retry', 12, 'upload']);
  K.pipeNull = null;
  assert.ok(logged.some((x) => x.msg.includes('cap reservation failed')), 'تعذّر الحجز في سجلّ المالك');

  // الصفر يغلق البدء والإرسال للمالك أيضًا — والاستطلاع يبقى ليجلب ما دُفع ثمنه
  process.env.VIDEO_ERASE_CAP_CENTS = '0';
  assert.deepEqual([(await call('start', plan([197]))).code, seen[seen.length - 1].j.error], [503, 'unavailable']);
  assert.deepEqual([(await call('submit', { id: c })).code, seen[seen.length - 1].j.error], [503, 'unavailable']);
  const st = await poll(a);
  assert.deepEqual([st.code, st.j.ok, st.j.state], [200, true, 'running']);
  assert.equal(calls('submit').length, 12);
});

test('٥. الإرسال مرّة واحدة: «يُرسل» محفوظ قبل أوّل طلب، والطلب بحقوله الخمسة وحدها، والإعادة والنافذة الثانية لا ترسلان', async () => {
  reset();
  const id = await ready([197, 197, 120]);
  const job = jobOf(id);
  const states = [];
  F.onSubmit = () => states.push(jobOf(id).st);
  const s = await call('submit', { id });
  assert.equal(s.code, 200, JSON.stringify(s.j));
  assert.deepEqual(s.j, { ok: true, id, state: 'running', chunks: [0, 1, 2].map((i) => ({ i, state: 'running' })), cents: 15 });
  assert.deepEqual(states, ['sending', 'sending', 'sending'], '«يُرسل» قبل كلّ طلب');
  const subs = calls('submit');
  assert.equal(subs.length, 3);
  for (const c of subs) {
    assert.equal(c.url, SUBMIT);
    assert.deepEqual(Object.keys(c.json).sort(), ['enable_pass2_refinement', 'num_frames', 'prompt', 'quad_mask_video_url', 'video_url'], 'لا mask_prompt ولا غيره');
    assert.equal(c.json.enable_pass2_refinement, false);
    assert.equal(c.json.prompt, er.PROMPT);
    assert.equal(authOf(c), 'Key ' + KEY);
    assert.equal(c.headers['X-Fal-No-Retry'], '1');
    assert.equal(c.headers['X-Fal-Request-Start-Timeout'], String(er.START_SEC));
    assert.deepEqual(JSON.parse(c.headers['X-Fal-Object-Lifecycle-Preference']), { expiration_duration_seconds: 86400 });
    assert.ok(c.signal);
    const i = job.files.indexOf(c.json.video_url);
    assert.ok(i >= 0 && i < 3, 'فيديو المقطع من رابط القراءة المحفوظ');
    assert.equal(c.json.quad_mask_video_url, job.files[job.chunks[i].m]);
    assert.equal(c.json.num_frames, er.snap(job.chunks[i].f));
  }
  assert.deepEqual(subs.map((c) => c.json.num_frames).sort(), [125, 197, 197], '١٢٠ ← ١٢٥');
  assert.ok(/^[\x20-\x7e]+$/.test(er.PROMPT) && /no text/i.test(er.PROMPT), 'وصف إنجليزيّ للمشهد النظيف');
  const saved = jobOf(id);
  assert.deepEqual([saved.st, saved.cents, saved.day, ttl.get('verase:' + id)], ['sent', 15, today(), 86400]);
  for (const c of saved.chunks) {
    assert.equal(c.st, 'running');
    assert.ok(Number(c.at) > 0);
    assert.deepEqual(c.req, { id: c.req.id, s: REQS + c.req.id + '/status', r: REQS + c.req.id, c: REQS + c.req.id + '/cancel' });
  }
  assert.equal(kv.has('verase:run:' + id), false, 'القفل يُفكّ');
  assert.equal(spent(), 15);
  // الإعادة: الحالة بلا نداء واحد (لا وجود ولا حجز ولا إرسال)
  const n = F.calls.length;
  const again = await call('submit', { id });
  assert.deepEqual(again.j, s.j);
  assert.deepEqual([F.calls.length, spent()], [n, 15]);

  // نقرتان معًا على مهمّة واحدة: إرسال واحد والأخرى «مشغول»
  const id2 = await ready([197, 197]);
  const [x, y] = await Promise.all([call('submit', { id: id2 }), call('submit', { id: id2 })]);
  assert.deepEqual([x.code, y.code].sort(), [200, 409]);
  assert.equal([x, y].find((r) => r.code === 409).j.error, 'busy');
  assert.deepEqual([calls('submit').length, spent()], [5, 25]);
  // قفل قائم (إرسال جارٍ في نداء آخر) = 409 بلا نداء — أمّا مهمّة أُرسلت فحالتها (200) ولو كان القفل قائمًا: إعادة لا خطأ
  const id3 = await ready([197]);
  kv.set('verase:run:' + id3, '1');
  const m = F.calls.length;
  assert.deepEqual([(await call('submit', { id: id3 })).code, F.calls.length], [409, m]);
  kv.delete('verase:run:' + id3);
  kv.set('verase:run:' + id, '1');
  assert.deepEqual([(await call('submit', { id })).j, F.calls.length], [s.j, m]);
  kv.delete('verase:run:' + id);

  // تعذّر حفظ «يُرسل» = لا إرسال، والحجز يُردّ، والمهمّة باقية للرفع
  K.failSet = (k, v) => k === 'verase:' + id3 && JSON.parse(v).st === 'sending';
  assert.deepEqual([(await call('submit', { id: id3 })).j.error, calls('submit').length, spent(), jobOf(id3).st], ['retry', 5, 25, 'upload']);
  K.failSet = null;

  // قُبلت المقاطع ثمّ تعذّر حفظ النتيجة مرّتين: إلغاء ما قُبل، و«أعد»، والإعادة لا ترسل — والمقاطع «مجهولة» بعد مهلة الدالّة
  const id4 = await ready([197, 120]);
  K.failSet = (k, v) => k === 'verase:' + id4 && JSON.parse(v).st === 'sent';
  const lostSave = await call('submit', { id: id4 });
  K.failSet = null;
  assert.deepEqual([lostSave.code, lostSave.j.error], [503, 'retry']);
  assert.equal(calls('submit').length, 7);
  assert.deepEqual(calls('cancel').map((c) => [c.url.endsWith('/cancel'), authOf(c)]), [[true, 'Key ' + KEY], [true, 'Key ' + KEY]], 'إلغاء ما قُبل');
  assert.ok(logged.some((x) => x.msg.includes('job ' + id4 + ' sent 2 but not saved')));
  const retry = await call('submit', { id: id4 });
  assert.deepEqual([retry.j.state, retry.j.chunks.map((c) => c.state), calls('submit').length], ['running', ['running', 'running'], 7]);
  setJob(id4, (j) => { j.sentAt = Date.now() - er.ORPHAN_MS - 1000; });
  const gone = await call('status', { id: id4 });
  assert.deepEqual([gone.j.state, gone.j.chunks.map((c) => c.state), gone.j.cents], ['failed', ['unknown', 'unknown'], 10]);
  assert.deepEqual([calls('submit').length, spent()], [7, 35], 'المجهول يبقى محجوزًا');

  // نداءان قرآ «رفع» معًا، والثاني نال القفل بعد أن أرسل الأوّل وفكّه: يقرأ السجلّ تحت القفل فيجد «أُرسل» — لا إرسال ثانٍ
  const id6 = await ready([197, 120]);
  let open;
  const gate = new Promise((r) => { open = r; });
  let nth = 0;
  K.beforeSetnx = async (k) => { if (k === 'verase:run:' + id6 && ++nth === 2) await gate; };
  const pa = call('submit', { id: id6 });
  const pb = call('submit', { id: id6 });
  const ra = await pa;
  open();
  const rb = await pb;
  K.beforeSetnx = null;
  assert.deepEqual([ra.code, rb.code, rb.j], [200, 200, ra.j]);
  assert.deepEqual([calls('submit').length, spent()], [9, 45], 'إرسال واحد وحجز واحد');
});

test('٦. not_uploaded: ملفّ لم يُرفع = ٤٠٩ بفهرسه بلا حجز ولا إرسال، ثمّ يمرّ بعد رفعه؛ والفحص بلا مفتاح', async () => {
  reset();
  const s = await call('start', plan([197, 120]));
  await upload(s.j, [1]);
  const id = s.j.id;
  const r = await call('submit', { id });
  assert.deepEqual([r.code, r.j], [409, { ok: false, error: 'not_uploaded', missing: [1] }]);
  assert.deepEqual([spent(), calls('submit').length, jobOf(id).st, kv.has('verase:run:' + id)], [0, 0, 'upload', false]);
  const heads = calls('head');
  assert.equal(heads.length, 4, 'كلّ ملفّ يُفحص');
  for (const c of heads) { assert.equal(authOf(c), '', 'المفتاح لا يُرسل للتخزين'); assert.equal(c.headers.Range, 'bytes=0-0'); assert.ok(c.signal); }
  // عطل عابر في التخزين = «أعد» لا «لم يُرفع»
  F.headFail = 503;
  assert.deepEqual([(await call('submit', { id })).j.error, spent(), calls('submit').length], ['retry', 0, 0]);
  F.headFail = 0;
  await fetch(s.j.ups[1].put, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: 'x' });
  const ok = await call('submit', { id });
  assert.deepEqual([ok.code, ok.j.state, spent(), calls('submit').length], [200, 'running', 10, 2]);
  // مهمّة لغيره أو مجهولة أو مشوّهة = 404؛ وتعذّر القراءة «أعد» لا 404
  process.env.OWNER_USERNAMES = 'boss';
  assert.deepEqual([(await call('submit', { id }, { token: token('boss') })).code, (await call('status', { id }, { token: token('boss') })).code], [404, 404]);
  delete process.env.OWNER_USERNAMES;
  for (const bad of ['', 'x'.repeat(24), 'A'.repeat(24), id + '0', 'f'.repeat(24)]) assert.equal((await call('status', { id: bad })).j.error, 'not_found', bad);
  kv.set('verase:' + 'e'.repeat(24), '{broken');
  assert.equal((await call('submit', { id: 'e'.repeat(24) })).j.error, 'not_found');
  K.failGet = (k) => k === 'verase:' + id;
  assert.deepEqual([(await call('status', { id })).code, seen[seen.length - 1].j.error], [503, 'retry']);
  assert.deepEqual([(await call('submit', { id })).code, seen[seen.length - 1].j.error], [503, 'retry']);
  K.failGet = null;
});

test('٧. نتيجة كلّ مقطع: 2xx جارٍ، 4xx مرفوض يُفكّ حجزه، و5xx والمهلة والانقطاع و408 مجهول يبقى حجزه — بسبب قصير ثابت', async () => {
  reset();
  const lens = [197, 197, 197, 197, 197, 197, 197, 197, 197, 120];
  const id = await ready(lens);
  const files = jobOf(id).files;
  const T = {
    1: () => json({ detail: [{ loc: ['body', 'video_url'], msg: 'could not read ' + files[1], type: 'value_error' }] }, 422),
    2: () => new Response('upstream connect error', { status: 500 }),
    3: () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); },
    4: () => json({ status: 'IN_QUEUE' }), // 2xx بلا معرّف طلب
    5: () => json({ detail: 'Rate limit exceeded' }, 429),
    6: () => json({ detail: 'User is locked. Reason: Exhausted balance. Top up at https://fal.ai/dashboard/billing' }, 403),
    7: () => json({ detail: 'Request Timeout' }, 408),
    8: () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }); },
  };
  F.submitPlan = (b) => T[files.indexOf(b.video_url)] || null;
  const r = await call('submit', { id });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  const st = r.j.chunks.map((c) => c.state + (c.why ? ':' + c.why : ''));
  assert.deepEqual(st, ['running', 'rejected:input', 'unknown:server', 'unknown:timeout', 'unknown:server', 'rejected:limit', 'rejected:unavailable', 'unknown:timeout', 'unknown:network', 'running']);
  assert.equal(r.j.state, 'running');
  assert.equal(r.j.cents, 35, 'خمسون حُجزت وثلاثة مرفوضة رُدّت');
  assert.equal(spent(), 35);
  assert.ok(K.pipes.some((p) => p[0][0] === 'DECRBY' && p[0][2] === '15'), 'ردّ المرفوض في نداء واحد');
  assert.ok(typeof r.j.__diag === 'string' && /rejected/.test(r.j.__diag) && !r.j.__diag.includes('https://') && !r.j.__diag.includes(KEY), r.j.__diag);
  assert.ok(logged.some((x) => x.scope === 'video-erase' && x.msg.includes('job ' + id) && x.meta.action === 'video-erase'));
  const saved = jobOf(id);
  assert.deepEqual(saved.chunks.map((c) => !!c.req), [true, false, false, false, false, false, false, false, false, true], 'المعرّف للمقبول وحده');
  // المقبولان ينتهيان: الحالة «جزئيّ» — والمجهول والمرفوض لا يُستطلعان
  for (const i of [0, 9]) F.reqs.get(ridOf(id, i)).state = 'COMPLETED';
  const p = await poll(id);
  assert.deepEqual([p.j.state, p.j.chunks.filter((c) => c.state === 'done').map((c) => c.i)], ['partial', [0, 9]]);
  assert.equal(calls('status').length, 2);
  // كلّه مرفوض = «فشل» والحجز كلّه مردود
  reset();
  const id2 = await ready([197, 120]);
  F.submitPlan = () => () => json({ detail: 'Unprocessable' }, 422);
  const all = await call('submit', { id: id2 });
  assert.deepEqual([all.j.state, all.j.cents, spent(), all.j.chunks.map((c) => c.state)], ['failed', 0, 0, ['rejected', 'rejected']]);
  assert.deepEqual(await poll(id2).then((x) => x.j.state), 'failed');
  assert.equal(calls('status').length, 0, 'لا جارٍ = لا استطلاع');
  // روابط المزوّد على غير طابوره أو بمسار آخر لا تُستعمل: تُبنى من المعرّف (المفتاح لا يُرسل لمضيف آخر)
  reset();
  const id3 = await ready([197]);
  F.submitPlan = () => () => {
    F.reqs.set('req-evil-0001', { state: 'IN_PROGRESS' });
    return json({ request_id: 'req-evil-0001', status_url: 'https://evil.example/s', response_url: 'https://queue.fal.run/other/app/requests/req-evil-0001', cancel_url: 'http://queue.fal.run/x' });
  };
  await call('submit', { id: id3 });
  assert.deepEqual(jobOf(id3).chunks[0].req, { id: 'req-evil-0001', s: REQS + 'req-evil-0001/status', r: REQS + 'req-evil-0001', c: REQS + 'req-evil-0001/cancel' });
});

test('٨. الاستطلاع: قفل ٣ ث، الجارية تكتمل بروابطها، الفشل بسببه، العطل العابر ينتظر، وما تجاوز ساعة يُلغى — والمنتهي لا يُستطلع', async () => {
  reset();
  const id = await ready([197, 197, 197, 120]);
  await call('submit', { id });
  const rid = [0, 1, 2, 3].map((i) => ridOf(id, i));
  // قفل الثواني الثلاث: استطلاعان معًا = نداء مزوّد واحد لكلّ مقطع
  const [a, b] = await Promise.all([call('status', { id }), call('status', { id })]);
  assert.deepEqual([a.j.state, b.j.state, calls('status').length], ['running', 'running', 4]);
  assert.equal(ttl.get('verase:poll:' + id), 3);
  for (const c of calls('status')) { assert.equal(authOf(c), 'Key ' + KEY); assert.ok(c.url.startsWith(REQS) && c.url.endsWith('/status')); }
  // اكتمل اثنان، وفشل واحد بالرقابة، والرابع عطل عابر (503) يبقى جاريًا
  F.reqs.get(rid[0]).state = 'COMPLETED';
  F.reqs.get(rid[1]).state = 'COMPLETED';
  Object.assign(F.reqs.get(rid[2]), { state: 'COMPLETED', error: 'content_policy_violation: flagged by a content checker' });
  F.reqs.get(rid[3]).statusFail = 503;
  const p = await poll(id);
  assert.deepEqual(p.j.chunks, [{ i: 0, state: 'done', url: OUT(rid[0]) }, { i: 1, state: 'done', url: OUT(rid[1]) }, { i: 2, state: 'failed', why: 'safety' }, { i: 3, state: 'running' }]);
  assert.equal(p.j.state, 'running');
  assert.ok(p.j.__diag && !p.j.__diag.includes('https://'), 'سبب الفشل للمالك');
  const saved = jobOf(id);
  assert.deepEqual([saved.chunks[0].st, saved.chunks[0].url, saved.chunks[2].st, saved.chunks[2].why, ttl.get('verase:' + id)], ['done', OUT(rid[0]), 'failed', 'safety', 86400]);
  // المنتهي لا يُستطلع ثانيةً
  const before = calls('status').length;
  F.reqs.get(rid[3]).statusFail = 0;
  F.reqs.get(rid[3]).state = 'COMPLETED';
  F.reqs.get(rid[3]).result = () => json({ detail: [{ loc: ['body'], msg: 'bad mask', type: 'value_error' }] }, 422);
  const q = await poll(id);
  assert.equal(calls('status').length - before, 1, 'الجاري وحده');
  assert.deepEqual([q.j.state, q.j.chunks[3]], ['partial', { i: 3, state: 'failed', why: 'failed' }]);
  // كلّه منتهٍ: لا نداء مزوّد ولا قفل
  const n = F.calls.length;
  assert.deepEqual([(await poll(id)).j.state, F.calls.length], ['partial', n]);

  // كلّه ناجح = «تمّ»؛ ونتيجة 5xx أو 429 أو انقطاع عابرة لا فشل
  reset();
  const id2 = await ready([197, 120]);
  await call('submit', { id: id2 });
  const r2 = [ridOf(id2, 0), ridOf(id2, 1)];
  for (const r of r2) F.reqs.get(r).state = 'COMPLETED';
  F.reqs.get(r2[1]).result = () => new Response('bad gateway', { status: 502 });
  assert.deepEqual((await poll(id2)).j.chunks.map((c) => c.state), ['done', 'running']);
  F.reqs.get(r2[1]).result = () => json({ detail: 'Too many requests' }, 429);
  assert.deepEqual((await poll(id2)).j.chunks.map((c) => c.state), ['done', 'running']);
  F.reqs.get(r2[1]).result = () => { throw new Error('socket hang up'); };
  assert.deepEqual((await poll(id2)).j.chunks.map((c) => c.state), ['done', 'running']);
  delete F.reqs.get(r2[1]).result;
  const done = await poll(id2);
  assert.deepEqual([done.j.state, done.j.chunks.map((c) => c.url)], ['done', [OUT(r2[0]), OUT(r2[1])]]);
  assert.equal(done.j.__diag, undefined, 'لا تشخيص بلا فشل');

  // أسباب الفشل: مهلة البدء عند المزوّد، ومفتاح أو رصيد (402) = «متوقّف»، والكلّ فاشل = «فشل»
  reset();
  const id3 = await ready([197, 197]);
  await call('submit', { id: id3 });
  Object.assign(F.reqs.get(ridOf(id3, 0)), { state: 'COMPLETED', error: 'startup_timeout: request did not start in time' });
  Object.assign(F.reqs.get(ridOf(id3, 1)), { statusFail: 402, statusText: '{"detail":"Payment required"}' });
  const f3 = await poll(id3);
  assert.deepEqual([f3.j.state, f3.j.chunks.map((c) => c.why)], ['failed', ['timeout', 'unavailable']]);

  // الساعة: المقطع الجاري بعد ٦١ دقيقة يُلغى (رابط الإلغاء على المالك/التطبيق) ويُعدّ فاشلًا؛ بعد ٥٩ لا؛ والمكتمل بعد الساعة يُسلَّم
  reset();
  const id4 = await ready([197, 197, 120]);
  await call('submit', { id: id4 });
  setJob(id4, (j) => { j.chunks[0].at = Date.now() - 61 * 60000; j.chunks[1].at = Date.now() - 59 * 60000; j.chunks[2].at = Date.now() - 90 * 60000; });
  F.reqs.get(ridOf(id4, 0)).state = 'IN_PROGRESS';
  F.reqs.get(ridOf(id4, 2)).state = 'COMPLETED';
  const h = await poll(id4);
  assert.deepEqual(h.j.chunks.map((c) => c.state + (c.why ? ':' + c.why : '')), ['failed:timeout', 'running', 'done']);
  const cx = calls('cancel');
  assert.deepEqual(cx.map((c) => [c.method, c.url, authOf(c)]), [['PUT', REQS + ridOf(id4, 0) + '/cancel', 'Key ' + KEY]]);
  assert.ok(logged.some((x) => /timeout after 61 min \(cancel 202\)/.test(x.msg)), 'الإلغاء في سجلّ المالك');
  // تعذّر الإلغاء لا يغيّر الحكم
  setJob(id4, (j) => { j.chunks[1].at = Date.now() - 2 * 3600000; });
  F.cancelStatus = 500;
  assert.deepEqual((await poll(id4)).j.chunks.map((c) => c.state), ['failed', 'failed', 'done']);

  // «يُرسل» (نداء الإرسال جارٍ): جارٍ بلا نداء مزوّد؛ و«رفع»: الحالة وحدها
  reset();
  const id5 = await ready([197]);
  assert.deepEqual((await call('status', { id: id5 })).j, { ok: true, id: id5, state: 'upload', chunks: [], cents: 0 });
  setJob(id5, (j) => { Object.assign(j, { st: 'sending', sentAt: Date.now(), cents: 5 }); });
  const m = F.calls.length;
  assert.deepEqual((await call('status', { id: id5 })).j, { ok: true, id: id5, state: 'running', chunks: [{ i: 0, state: 'running' }], cents: 5 });
  assert.equal(F.calls.length, m);
});

test('٨ب. استطلاعان بعد انقضاء القفل يحفظان معًا: المنتهي في أيّ نسخة يبقى منتهيًا (دمج لا كتابة فوق)', async () => {
  reset();
  const id = await ready([197, 197, 120]);
  await call('submit', { id });
  const rid = [0, 1, 2].map((i) => ridOf(id, i));
  F.reqs.get(rid[0]).state = 'COMPLETED';
  // استطلاع آخر (بدأ قبلنا وانقضى قفله) يحفظ المقطع الثاني منتهيًا أثناء استطلاعنا، ونحن نراه جاريًا
  let once = false;
  F.onStatus = async (r) => {
    if (r !== rid[0] || once) return;
    once = true;
    setJob(id, (j) => { Object.assign(j.chunks[1], { st: 'done', url: OUT(rid[1]) }); });
  };
  const p = await poll(id);
  assert.deepEqual(p.j.chunks.map((c) => c.state), ['done', 'done', 'running']);
  assert.deepEqual(jobOf(id).chunks.map((c) => c.st), ['done', 'done', 'running'], 'المحفوظ لا يرجع بالثاني إلى «جارٍ»');
  // تعذّر الحفظ بعد الاستطلاع: الردّ يحمل النتيجة، والاستطلاع التالي يعيدها
  F.onStatus = null;
  F.reqs.get(rid[2]).state = 'COMPLETED';
  K.failSet = (k) => k === 'verase:' + id;
  const q = await poll(id);
  assert.deepEqual([q.code, q.j.state], [200, 'done']);
  K.failSet = null;
  assert.equal(jobOf(id).chunks[2].st, 'running');
  assert.equal((await poll(id)).j.state, 'done');
  assert.equal(jobOf(id).chunks[2].st, 'done');
  assert.ok(con.some((l) => l.includes('not saved (next poll redoes it)')));
});

test('٩. snap: أصغر قيمة صالحة لا تقلّ عن طول المقطع — ١←٦٩، ٦٩←٦٩، ٧٠←٧٧، ١٩٧←١٩٧', () => {
  assert.deepEqual([1, 69, 70, 77, 78, 120, 196, 197].map(er.snap), [69, 69, 77, 77, 85, 125, 197, 197]);
  const valid = new Set(Array.from({ length: 17 }, (_, k) => 69 + 8 * k));
  assert.equal(Math.max(...valid), 197);
  for (let f = 1; f <= 197; f++) {
    const s = er.snap(f);
    assert.ok(valid.has(s) && s >= f && (s === 69 || s - 8 < f), f + ' ← ' + s);
  }
  assert.deepEqual([0, -5, NaN, 'x', 198, 1000, 68.2].map(er.snap), [69, 69, 69, 69, 197, 197, 69]);
  assert.deepEqual([er.MODEL, er.CENTS, er.MAX_CHUNKS, er.MAX_FILES, er.MAX_BYTES, er.CAP_DEFAULT], ['fal-ai/void-video-inpainting', 5, 30, 32, 50 * 1024 * 1024, 200]);
  assert.ok(er.START_SEC * 1000 * 2 <= er.HOUR_MS, 'مهلة البدء + أقصى تشغيل (ربع ساعة) دون حدّ الساعة');
});

test('١٠. لا تسريب: لا مفتاح ولا رابط قراءة في أيّ ردّ أو سجلّ، روابط الكتابة في ups وحدها والناتج في chunks.url وحدها، ولا رموز بوّابة الباقات', () => {
  assert.ok(seen.length > 120, 'ردود كافية: ' + seen.length);
  const codes = new Set(seen.map((r) => r.j && r.j.error).filter(Boolean));
  for (const c of ['auth', 'owner_only', 'method', 'bad_op', 'unavailable', 'bad_request', 'too_long', 'too_big', 'format', 'cap', 'retry', 'failed', 'busy', 'not_uploaded', 'not_found']) assert.ok(codes.has(c), 'رمز لم يُفحص: ' + c);
  for (const c of ['points_insufficient', 'daily_limit_reached', 'video_subscribers']) assert.ok(!codes.has(c), c);
  const strip = (v, k) => {
    if (Array.isArray(v)) return v.map((x) => strip(x, k));
    if (!v || typeof v !== 'object') return v;
    const o = {};
    for (const [key, x] of Object.entries(v)) if (!(k === 'ups' && key === 'put') && !(k === 'chunks' && key === 'url')) o[key] = strip(x, key);
    return o;
  };
  let puts = 0, urls = 0;
  for (const r of seen) {
    if (!r.j) continue; // 204
    const text = JSON.stringify(strip(r.j, ''));
    assert.ok(!text.includes('https://') && !text.includes(KEY) && !text.includes('X-Signature') && !text.includes('SIGNED'), r.op + ' ' + r.code + ': ' + text);
    const raw = JSON.stringify(r.j);
    assert.ok(!raw.includes('/files/b/') && !raw.includes(KEY), 'رابط قراءة أو مفتاح: ' + raw.slice(0, 200));
    if (r.j.ups) { assert.equal(r.op, 'start'); puts += r.j.ups.length; for (const u of r.j.ups) assert.ok(u.put.startsWith(CDN + '/files/upload/')); }
    for (const c of r.j.chunks || []) if (c.url) { urls++; assert.equal(c.state, 'done'); assert.ok(c.url.startsWith(CDN + '/files/out/')); }
    if (r.code === 401 || r.code === 403 || r.code === 405) assert.ok(!('__diag' in r.j), 'تشخيص قبل البوّابة');
  }
  assert.ok(puts > 50 && urls > 10, puts + ' / ' + urls);
  const logs = JSON.stringify([logged, con]);
  assert.ok(logged.length > 5 && con.length > 5);
  for (const bad of [KEY, 'https://', 'X-Signature', 'UPLOAD-SIG', 'SIGNED', '/files/b/']) assert.ok(!logs.includes(bad), 'في السجلّ: ' + bad);
  assert.ok(logged.every((x) => x.scope === 'video-erase' && x.meta && x.meta.action === 'video-erase'));
  // المفتاح يذهب لمضيفَي المزوّد وحدهما: لا للتخزين ولا لرابط آخر
  for (const c of F.calls) if (authOf(c)) assert.ok(c.url === INITIATE || c.url.startsWith('https://queue.fal.run/fal-ai/void-video-inpainting'), c.url);
});

test('١١. الأسلاك: سطر الموجّه في media (لا ملفّ جديد تحت api/)، توثيق البيئة، المفتاح عند كلّ نداء، والإقلاع البارد', async () => {
  reset();
  const router = read('api/media.js');
  assert.ok(router.includes("    case 'video-erase': return require('./_lib/video-erase.js');"), 'سطر الموجّه');
  assert.equal(fs.existsSync(path.join(root, 'api/video-erase.js')), false, 'حدّ دوالّ Vercel: لا نقطة دخول جديدة');
  const env = read('api/_lib/env.js');
  const example = read('.env.example');
  for (const k of ENV) { assert.ok(env.includes(k + ':'), 'env.js: ' + k); assert.ok(example.includes('# ' + k + '='), '.env.example: ' + k); }
  assert.equal(require(rp('api/_lib/env.js')).SPEC.VIDEO_ERASE_CAP_CENTS[0], 'tunable');
  assert.ok(!ENV.some((k) => /KEY|SECRET|TOKEN/.test(k)), 'لا اسم جديد يبدو سرًّا');
  const src = read('api/_lib/video-erase.js');
  for (const line of src.split('\n').filter((l) => l.includes('process.env'))) assert.ok(/^\s+\S|^const \w+ = \(\) =>/.test(line), 'قراءة بيئة في نطاق الوحدة: ' + line);
  assert.ok(!/kvPutJSON|kvGetJSON/.test(src), 'لا كتابة بلا مدّة ولا قراءة تبتلع العطل');
  assert.ok(!/points|spendPoints|checkAndConsumeCustom/.test(src), 'لا نقاط ولا حصّة: المالك وحده');
  assert.ok(!src.includes('mask_prompt:') && src.includes('enable_pass2_refinement: false'), 'لا تكلفة إضافيّة');
  // المفتاح يتبع البيئة عند كلّ نداء
  process.env.FAL_KEY = '  rotated-key-xyz  ';
  assert.equal((await call('start', plan([197]))).code, 200);
  assert.equal(authOf(calls('initiate')[0]), 'Key rotated-key-xyz');
  process.env.FAL_KEY = KEY;
  // بيئة عارية: الوحدة والموجّه يُحمَّلان بلا مفتاح ولا سرّ جلسة
  for (const f of ['api/_lib/video-erase.js', 'api/media.js']) {
    const bare = spawnSync(process.execPath, ['-e', 'require(' + JSON.stringify(rp(f)) + ')'], { env: { PATH: process.env.PATH, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 20000 });
    assert.equal(bare.status, 0, f + ': ' + bare.stderr);
  }
  // عبر الموجّه الحقيقيّ: الإجراء موصول، وno-store، وجسم نصّيّ
  const handler = require(rp('api/media.js'));
  const mk = () => { const r = { code: 0, j: null, headers: {}, status(c) { r.code = c; return r; }, json(j) { r.j = j; return r; }, setHeader(k, v) { r.headers[String(k).toLowerCase()] = v; return r; }, end() { return r; } }; return r; };
  const r1 = mk();
  await handler({ method: 'POST', headers: {}, query: { action: 'video-erase', op: 'start' }, body: JSON.stringify(Object.assign({ token: owner() }, plan([197, 64]))) }, r1);
  assert.deepEqual([r1.code, r1.j.ok, r1.j.ups.length, r1.j.cents, r1.headers['cache-control']], [200, true, 4, 10, 'no-store']);
  const r2 = mk();
  await handler({ method: 'POST', headers: { authorization: 'Bearer ' + token('ali') }, query: { action: 'video-erase', op: 'status' }, body: { id: r1.j.id } }, r2);
  assert.deepEqual([r2.code, r2.j], [403, { ok: false, error: 'owner_only' }]);
});
