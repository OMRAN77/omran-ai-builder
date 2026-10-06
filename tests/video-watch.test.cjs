// tests/video-watch.test.cjs — v-video-watch (قرار المالك ٥ أكتوبر: «يشوف الفيديو مع الصوت نفس الوقت»، «بدون أيّ أزرار»،
// «الدقّة العالية»): فيديو يُرفق في المحادثة يُرفع قطعًا عبر الخادم إلى جلسة رفع عند المزوّد، ويُحلَّل صورةً وصوتًا معًا بالدقّة
// العالية، ويُخصم تلقائيًّا نقطة + نقطتان لكلّ دقيقة بالمدّة الحقيقيّة، ويُردّ الخصم عند الفشل. قبله كان الفيديو يُقرأ نصًّا ثنائيًّا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'video-watch-test-secret';
process.env.GEMINI_API_KEY = 'g-test-key';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
const ttl = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v, t) => { kv.set(k, String(v)); if (t) ttl.set(k, t); },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  kvSetIfAbsent: async (k, v, t) => { await new Promise((r) => setImmediate(r)); if (kv.has(k)) return false; kv.set(k, String(v)); if (t) ttl.set(k, t); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...kv.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    if (op === 'INCRBY') { const v = Number(kv.get(k) || 0) + Number(a); kv.set(k, String(v)); return v; }
    if (op === 'GET') return kv.has(k) ? kv.get(k) : null;
    return 1;
  }),
});
const users = new Map();
mock('api/_lib/auth.js', {
  getUser: async (u) => (users.has(u) ? structuredClone(users.get(u)) : null),
  putUser: async (u, r) => { users.set(u, structuredClone(r)); },
  isBanned: async () => false,
  verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async (u) => u === 'vip1' });
const logged = []; // v-video-watch-diag: سجلّ أخطاء المالك
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async (scope, err, meta) => { logged.push({ scope, msg: String(err && err.message), meta }); } });

const points = require(rp('api/_lib/points.js'));
const watch = require(rp('api/_lib/video-watch.js'));
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const bal = async (u) => (await points.readPoints(u)).points;
const SESSION = 'https://upload.example/session/abc?upload_id=1&key=SECRET-IN-URL';

// مزوّد مزيّف ثابت للملفّ كلّه: جلسة الرفع، القطع، حالة الملفّ، التحليل، الحذف.
const G = { fileState: 'PROCESSING', duration: '125.5s', genFail: false, genDelay: 0, chunks: [], gens: [], deleted: [], starts: [], startFail: 0, chunkFail: 0, gran: '', genPlan: [] };
const upErr = (status, message) => new Response(JSON.stringify({ error: { code: status, message, status: 'X' } }), { status });
global.fetch = async (url, init) => {
  const u = String(url);
  const h = (init && init.headers) || {};
  if (u === 'https://generativelanguage.googleapis.com/upload/v1beta/files') {
    G.starts.push({ headers: h, body: JSON.parse(init.body) });
    if (G.startFail) return upErr(G.startFail, G.startMsg || 'API key not valid. Please pass a valid API key.');
    return new Response('{}', { status: 200, headers: Object.assign({ 'x-goog-upload-url': SESSION }, G.gran ? { 'x-goog-upload-chunk-granularity': G.gran } : {}) });
  }
  if (u === SESSION) {
    G.chunks.push({ cmd: h['X-Goog-Upload-Command'], off: Number(h['X-Goog-Upload-Offset']), len: init.body.length });
    if (G.chunkFail) return upErr(G.chunkFail, 'Invalid chunk size');
    if (/finalize/.test(h['X-Goog-Upload-Command'])) return new Response(JSON.stringify({ file: { name: 'files/vid1', uri: 'https://generativelanguage.googleapis.com/v1beta/files/vid1', mimeType: 'video/mp4', state: 'PROCESSING' } }), { status: 200 });
    return new Response('', { status: 200 });
  }
  if (u.endsWith('/v1beta/files/vid1') && (!init || !init.method || init.method === 'GET')) {
    return new Response(JSON.stringify({ name: 'files/vid1', state: G.fileState, videoMetadata: { videoDuration: G.duration } }), { status: 200 });
  }
  if (u.endsWith('/v1beta/files/vid1') && init.method === 'DELETE') { G.deleted.push(u); return new Response('{}', { status: 200 }); }
  if (/:generateContent$/.test(u)) {
    G.gens.push({ url: u, headers: h, body: JSON.parse(init.body), signal: !!init.signal });
    if (G.genDelay) await new Promise((r) => setTimeout(r, G.genDelay));
    if (G.genPlan.length) { const st = G.genPlan.shift(); if (st !== 200) return upErr(st, 'plan ' + st); }
    if (G.genFail) return new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '00:05 رجل يقول «مرحبا» وصوت سيارة في الخلفية' }] } }], usageMetadata: { promptTokenCount: 40000, candidatesTokenCount: 800, thoughtsTokenCount: 500 } }), { status: 200 });
  }
  throw new Error('unexpected fetch ' + u);
};
async function call(step, body, tk) {
  const res = { code: 200, j: null, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, setHeader() { return res; }, end() { return res; } };
  await watch({ method: 'POST', headers: {}, query: { step }, body: Object.assign({ token: tk === undefined ? token('reem') : tk }, body) }, res);
  return res;
}
const CH = watch.CHUNK;
const b64 = (n, fill) => Buffer.alloc(n, fill || 7).toString('base64');
async function uploadAll(size, user) {
  const s = await call('start', { size, mime: 'video/mp4', name: 'clip.mp4', durationSec: 125 }, token(user));
  assert.equal(s.code, 200, JSON.stringify(s.j));
  for (let off = 0; off < size; off += CH) {
    const r = await call('chunk', { id: s.j.id, offset: off, data: b64(Math.min(CH, size - off)) }, token(user));
    assert.equal(r.code, 200, JSON.stringify(r.j));
  }
  return s.j.id;
}

test('١. السعر: نقطة + نقطتان لكلّ دقيقة بدأت (بالدقّة العالية ≥ ضعفَي تكلفتنا على سعر نقطة Pro)', () => {
  assert.deepEqual([points.COSTS.video_watch_base, points.COSTS.video_watch_min], [1, 2]);
  assert.deepEqual([0, 59, 60, 61, 300, 600].map(watch.costFor), [3, 3, 3, 5, 11, 21]);
  const proPoint = (20 - (20 * 0.029 + 0.30)) / 920; // دولار لكلّ نقطة بعد رسوم الدفع
  for (const min of [1, 5, 10]) { // ≈ ٣٠٠ توكن/ثانية بالدقّة العالية + ٦٠٠ توكن خرج/دقيقة + تفكير ≤ ١٠٢٤، بسعر ٠٫٧٥/٣٫٧٥$ للمليون
    const cost = (min * 60 * 300 * 0.75 + (min * 600 + 300 + 1024) * 3.75) / 1e6;
    const margin = watch.costFor(min * 60) * proPoint / cost;
    assert.ok(margin >= 2 && margin <= 4, min + ' دقيقة: ×' + margin.toFixed(2));
  }
});

test('٢. البدء: بلا دخول 401، والحجم والمدّة والصيغة والرصيد تُرفض قبل رفع أيّ بايت؛ ورابط الجلسة لا يغادر الخادم', async () => {
  users.set('reem', { username: 'reem', points: 200 });
  users.set('poor', { username: 'poor', points: 2 });
  assert.equal((await call('start', { size: 10 }, '')).code, 401);
  assert.equal((await call('start', { size: watch.MAX_BYTES + 1, mime: 'video/mp4' })).j.error, 'too_big');
  assert.equal((await call('start', { size: 10, mime: 'video/x-matroska', name: 'a.mkv' })).j.error, 'format');
  assert.equal((await call('start', { size: 10, mime: 'video/mp4', durationSec: 700 })).j.error, 'too_long');
  const p = await call('start', { size: 10, mime: 'video/mp4', durationSec: 61 }, token('poor'));
  assert.deepEqual([p.code, p.j.error, p.j.needed, p.j.points], [402, 'points_insufficient', 5, 2]);
  assert.equal(G.starts.length, 0, 'لا جلسة رفع لطلب مرفوض');
  const ok = await call('start', { size: 3 * CH + 5, mime: 'video/quicktime', name: 'a.mov', durationSec: 125 });
  assert.equal(ok.code, 200);
  assert.ok(/^[a-f0-9]{24}$/.test(ok.j.id));
  assert.equal(ok.j.chunk, CH);
  assert.ok(!JSON.stringify(ok.j).includes('SECRET') && !JSON.stringify(ok.j).includes('upload.example'), 'الرابط لا يصل المتصفّح');
  assert.equal(G.starts[0].headers['X-Goog-Upload-Header-Content-Type'], 'video/mov', 'MOV الآيفون باسم يفهمه المحرّك');
  assert.equal(G.starts[0].headers['x-goog-api-key'], 'g-test-key', 'المفتاح في الرأس لا في الرابط');
  assert.equal(ttl.get('vwatch:' + ok.j.id), 3600);
  assert.equal(CH % (256 * 1024), 0, 'القطعة مضاعف ٢٥٦ ك.ب');
  assert.ok(Math.ceil(CH / 3) * 4 < 4.4e6, 'base64 القطعة تحت حدّ الجسم');
});

test('٣. القطع: بالترتيب وحجم ثابت، الأخيرة تُنهي الرفع، وصاحب المهمّة وحده', async () => {
  G.chunks.length = 0;
  const size = 2 * CH + 1000;
  const s = await call('start', { size, mime: 'video/mp4', durationSec: 125 });
  const id = s.j.id;
  assert.equal((await call('chunk', { id, offset: 0, data: b64(CH) }, token('poor'))).code, 404, 'مهمّة غيره');
  assert.deepEqual([(await call('chunk', { id, offset: CH, data: b64(CH) })).code], [409]);
  assert.equal((await call('chunk', { id, offset: 0, data: b64(1000) })).code, 400, 'قطعة غير أخيرة بحجم ناقص');
  for (const off of [0, CH]) assert.equal((await call('chunk', { id, offset: off, data: b64(CH) })).j.done, false);
  const last = await call('chunk', { id, offset: 2 * CH, data: b64(1000) });
  assert.deepEqual([last.j.done, last.j.offset], [true, size]);
  assert.deepEqual(G.chunks.map((c) => [c.cmd, c.off, c.len]), [['upload', 0, CH], ['upload', CH, CH], ['upload, finalize', 2 * CH, 1000]]);
});

test('٤. التشغيل: ينتظر الجاهزيّة، يخصم مرّة بالمدّة الحقيقيّة (٢:٠٦ ← ٧)، يحلّل صورةً وصوتًا بالدقّة العالية، ويحذف الملفّ', async () => {
  users.set('reem', { username: 'reem', points: 200 });
  kv.delete('points:reem');
  G.fileState = 'PROCESSING'; G.gens.length = 0; G.deleted.length = 0;
  const id = await uploadAll(CH + 10, 'reem');
  const before = await bal('reem');
  const p = await call('run', { id, prompt: 'وش يقول الرجّال؟', lang: 'ar' });
  assert.deepEqual([p.code, p.j.pending], [200, true]);
  assert.equal(await bal('reem'), before, 'لا خصم قبل الجاهزيّة');
  G.fileState = 'ACTIVE';
  const r = await call('run', { id, prompt: 'وش يقول الرجّال؟', lang: 'ar' });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  assert.deepEqual([r.j.cost, r.j.sec], [7, 126]);
  assert.match(r.j.result, /00:05/);
  assert.equal(await bal('reem'), before - 7);
  const g = G.gens[0];
  assert.equal(g.body.generationConfig.mediaResolution, 'MEDIA_RESOLUTION_HIGH');
  assert.equal(g.body.generationConfig.thinkingConfig.thinkingBudget, 1024);
  assert.equal(g.body.generationConfig.maxOutputTokens, 8192);
  assert.equal(g.body.contents[0].parts[0].file_data.file_uri, 'https://generativelanguage.googleapis.com/v1beta/files/vid1');
  const ins = g.body.contents[0].parts[1].text;
  assert.match(ins, /WITH its audio track/); assert.match(ins, /MM:SS/); assert.match(ins, /وش يقول الرجّال؟/); assert.match(ins, /Never name any AI model/);
  assert.ok(g.signal, 'مهلة خاصّة — العامّة (٣٠ث قبل أوّل بايت) تقطع التحليل الطويل');
  assert.equal(G.deleted.length, 1, 'الملفّ يُحذف عند المزوّد');
  const again = await call('run', { id });
  assert.deepEqual([again.j.cached, again.j.cost], [true, 7]);
  assert.equal(await bal('reem'), before - 7, 'الإعادة بعد انقطاع لا تخصم مرّتين');
  const month = new Date().toISOString().slice(0, 7);
  assert.ok(Number(kv.get('cost:' + month + ':reem:media')) > 0, 'تكلفتنا الحقيقيّة في تقرير المالك');
});

test('٥. فشل التحليل يردّ النقاط ويفكّ القفل، والإعادة تخصم من جديد وتنجح', async () => {
  users.set('sami', { username: 'sami', points: 50 });
  G.fileState = 'ACTIVE'; G.duration = '30s'; G.genFail = true;
  const id = await uploadAll(1000, 'sami');
  const before = await bal('sami');
  const f = await call('run', { id }, token('sami'));
  assert.deepEqual([f.code, f.j.error, f.j.refunded], [502, 'failed', 3]);
  assert.equal(await bal('sami'), before, 'رُدّت');
  assert.equal(kv.has('vwatch:run:' + id), false, 'القفل فُكّ');
  G.genFail = false;
  const ok = await call('run', { id }, token('sami'));
  assert.equal(ok.j.cost, 3);
  assert.equal(await bal('sami'), before - 3);
});

test('٦. تشغيلان متزامنان: خصم واحد والثاني «busy»؛ ومدفوع قبل انقطاع لا يُخصم ثانيةً', async () => {
  users.set('dual', { username: 'dual', points: 50 });
  G.fileState = 'ACTIVE'; G.duration = '30s'; G.genDelay = 20;
  const id = await uploadAll(1000, 'dual');
  const before = await bal('dual');
  const [a, b] = await Promise.all([call('run', { id }, token('dual')), call('run', { id }, token('dual'))]);
  G.genDelay = 0;
  assert.deepEqual([a.j.error || 'ok', b.j.error || 'ok'].sort(), ['busy', 'ok']);
  assert.equal(await bal('dual'), before - 3);
  // انقطاع بعد الخصم وقبل الردّ: المهمّة تحمل paid بلا نتيجة والقفل انتهى
  const id2 = await uploadAll(1000, 'dual');
  const j = JSON.parse(kv.get('vwatch:' + id2)); j.paid = 3; kv.set('vwatch:' + id2, JSON.stringify(j));
  const mid = await bal('dual');
  const r = await call('run', { id: id2 }, token('dual'));
  assert.deepEqual([r.j.ok, r.j.cost], [true, 3]);
  assert.equal(await bal('dual'), mid, 'لا خصم ثانٍ');
});

test('٧. المدّة الحقيقيّة فوق ١٠ دقائق تُرفض بلا خصم، والمالك وVIP بلا خصم', async () => {
  users.set('long', { username: 'long', points: 100 });
  G.fileState = 'ACTIVE'; G.duration = '700s'; G.deleted.length = 0;
  const id = await uploadAll(1000, 'long');
  const before = await bal('long');
  const r = await call('run', { id }, token('long'));
  assert.deepEqual([r.code, r.j.error], [413, 'too_long']);
  assert.equal(await bal('long'), before);
  assert.equal(G.deleted.length, 1);
  G.duration = '61s';
  for (const u of ['omran', 'vip1']) {
    users.set(u, { username: u, points: 0 });
    const idu = await uploadAll(1000, u);
    const ru = await call('run', { id: idu }, token(u));
    assert.deepEqual([ru.j.ok, ru.j.cost], [true, 0], u);
  }
});

test('٨. الأسلاك: الموجّه، والإدخال قبل حدّ ٢٥MB، والاعتراض قبل بوّابات الوسائط، والشرائح 🎬، والحزمة مبنيّة', () => {
  assert.match(read('api/video.js'), /case 'video-watch': return require\('\.\/_lib\/video-watch\.js'\);/);
  const a9 = read('js/app-09-attach.js');
  const ingest = a9.slice(a9.indexOf('async function omranIngestFiles('));
  assert.ok(ingest.indexOf('window.omranIsVideoFile(file)') < ingest.indexOf('file.size > MAX_ATTACH_FILE_BYTES'), 'قبل حدّ المرفقات');
  const core = a9.slice(a9.indexOf('async function __sendPromptCore('));
  assert.ok(core.indexOf('window.omranVideoWatchSend(text, __vwAtt)') > 0 && core.indexOf('window.omranVideoWatchSend(text, __vwAtt)') < core.indexOf('let __mediaLane = null;'), 'قبل بوّابة الوسائط');
  assert.match(a9, /a\.isVideoWatch \? '🎬 ' \+ \(a\.label \|\| a\.name\) : a\.name/);
  assert.match(read('js/app-04-i18n-state.js'), /chip\.textContent = a\.isVideoWatch \? '🎬 ' \+ \(a\.label \|\| a\.name\) : '📄 ' \+ a\.name;/);
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('window.omranVideoWatchSend = send;') && bundle.includes('window.omranIsVideoFile(file)'), 'الحزمة مبنيّة');
});

// ── المتصفّح: الجزء app-32 في vm مع خادم مزيّف ──
function client(serverReplies, opts) {
  const calls = [];
  const conv = { messages: [] };
  const state = { projects: [], currentId: null };
  const els = { '#prompt': { value: 'وش يقول؟' }, '#btnSend': { disabled: false } };
  const ctx = {
    window: {}, console, Promise, Uint8Array, String, Math, JSON, Number, Object, isFinite, btoa,
    setTimeout: (fn) => { fn(); return 0; }, // انتظار pending فوريّ في الاختبار
    document: { createElement: () => ({ className: '', textContent: '', remove() {}, scrollIntoView() {} }), body: { classList: { remove() {} } } },
    t: (k) => ({ vwUploading: 'UP', vwWatching: 'WATCH', vwCharged: 'CHARGED {n} {d}', vwDefaultQ: 'DEFAULT', vwFailed: 'FAILED', vwNoPoints: 'NOPOINTS {p} {n}', vwLogin: 'LOGIN' })[k] || k,
    authGet: (k) => (k === 'aiapp_username' ? (opts && opts.user) || '' : 'tok'), lang: 'ar', state, getCurrent: () => (opts && opts.noCur ? (state.projects[0] || null) : conv), renderAll() {}, saveState() {}, renderAttachStrip() {}, __swallow() {},
    messagesEl: { appendChild() {} }, $: (s) => els[s] || null,
    fetch: async (url, init) => {
      const step = /step=(\w+)/.exec(url)[1];
      const body = JSON.parse(init.body);
      calls.push({ step, body });
      const reply = serverReplies(step, body, calls);
      return { status: reply.status || 200, json: async () => reply.d };
    },
  };
  vm.createContext(ctx);
  vm.runInContext('var pendingAttachments = [];\n' + read('js/app-32-video-watch.js'), ctx);
  return { ctx, conv, calls, els, state };
}

test('٩. المتصفّح: رسالة بشريحة 🎬 بلا بايتات، قطع بالترتيب تطابق الملفّ، انتظار الجاهزيّة، والردّ بسطر الخصم', async () => {
  const bytes = Buffer.alloc(CH + 700); for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  let runs = 0;
  const c = client((step, body) => {
    if (step === 'start') return { d: { ok: true, id: 'a'.repeat(24), chunk: CH } };
    if (step === 'chunk') { const n = Buffer.from(body.data, 'base64').length; return { d: { ok: true, offset: body.offset + n, done: body.offset + n === bytes.length } }; }
    runs++;
    return { d: runs === 1 ? { ok: true, pending: true } : { ok: true, result: 'RESULT', cost: 7, sec: 126 } };
  });
  const att = { name: 'clip.mp4', isImage: false, isVideoWatch: true, blob: new Blob([bytes]), mime: 'video/mp4', size: bytes.length, durationSec: 125.6, label: 'clip.mp4 · 2:06' };
  c.ctx.pendingAttachments.push(att);
  await c.ctx.window.omranVideoWatchSend('وش يقول؟', att);
  const user = c.conv.messages[0];
  assert.equal(user.content, 'وش يقول؟');
  assert.deepEqual(Object.keys(user.attachments[0]).sort(), ['durationSec', 'isImage', 'isVideoWatch', 'label', 'name']);
  assert.equal(c.ctx.pendingAttachments.length, 0);
  const chunks = c.calls.filter((x) => x.step === 'chunk');
  assert.deepEqual(chunks.map((x) => x.body.offset), [0, CH]);
  assert.ok(Buffer.concat(chunks.map((x) => Buffer.from(x.body.data, 'base64'))).equals(bytes), 'البايتات كما هي');
  assert.equal(c.calls.find((x) => x.step === 'start').body.durationSec, 125.6);
  assert.deepEqual(c.calls.filter((x) => x.step === 'run').map((x) => [x.body.prompt, x.body.lang]), [['وش يقول؟', 'ar'], ['وش يقول؟', 'ar']]);
  assert.equal(c.conv.messages[1].content, 'RESULT\n\nCHARGED 7 2:06');
  assert.equal(c.els['#btnSend'].disabled, false);
});

test('١٠. المتصفّح: رصيد غير كافٍ برسالة واضحة قبل الرفع، وفيديو بلا نصّ = «حلّل هذا الفيديو»', async () => {
  const c = client((step) => (step === 'start' ? { status: 402, d: { ok: false, error: 'points_insufficient', needed: 5, points: 2 } } : { d: {} }));
  const att = { name: 'a.mp4', isVideoWatch: true, blob: new Blob([Buffer.alloc(10)]), mime: 'video/mp4', size: 10, durationSec: 61, label: 'a.mp4 · 1:01' };
  await c.ctx.window.omranVideoWatchSend('', att);
  assert.equal(c.conv.messages[0].content, 'DEFAULT');
  assert.equal(c.conv.messages[1].content, '⚠️ NOPOINTS 2 5');
  assert.equal(c.calls.filter((x) => x.step === 'chunk').length, 0, 'لا رفع');
  const ctx = client(() => ({ d: {} })).ctx;
  assert.equal(ctx.window.omranIsVideoFile({ type: 'video/quicktime', name: 'x' }), true);
  assert.equal(ctx.window.omranIsVideoFile({ type: '', name: 'clip.MP4' }), true);
  assert.equal(ctx.window.omranIsVideoFile({ type: 'image/png', name: 'a.png' }), false);
});

test('١١. النصوص العشرة بالـ١٤ لغة، بمواضعها {n} {d} {p}، بلا اسم مزوّد ولا أحرف خفيّة، ووسم اللغات ٧٢٣', () => {
  const KEYS = ['vwUploading', 'vwWatching', 'vwCharged', 'vwNoPoints', 'vwTooBig', 'vwTooLong', 'vwFormat', 'vwFailed', 'vwLogin', 'vwDefaultQ'];
  const BAD = /gemini|google|openai|gpt|claude|anthropic|جيمناي|جيميني|[​-‏‪-‮⁦-⁩﻿]/i;
  const a3 = read('js/app-03-i18n-data.js');
  const dicts = {};
  for (const k of KEYS) {
    const m = [...a3.matchAll(new RegExp('\\b' + k + ":\\s*'([^']*)'", 'g'))];
    assert.equal(m.length, 2, k + ' في العربيّة والإنجليزيّة');
    m.forEach((x, i) => { (dicts[i ? 'en' : 'ar'] = dicts[i ? 'en' : 'ar'] || {})[k] = x[1]; });
  }
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const ctx = { I18N: { [l]: {} }, window: {} };
    vm.createContext(ctx);
    vm.runInContext(read('i18n/' + l + '.js'), ctx);
    dicts[l] = ctx.I18N[l];
  }
  assert.equal(Object.keys(dicts).length, 14);
  for (const [l, d] of Object.entries(dicts)) {
    for (const k of KEYS) { assert.ok(d[k], l + ' ' + k); assert.doesNotMatch(d[k], BAD, l + ' ' + k); }
    assert.ok(d.vwCharged.includes('{n}') && d.vwCharged.includes('{d}'), l);
    assert.ok(d.vwNoPoints.includes('{n}') && d.vwNoPoints.includes('{p}'), l);
  }
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=723'"));
});

test('١٢. أوّل رسالة فيديو في تطبيق بلا محادثة تُنشئ المحادثة (كانت تعود بلا شيء — كشفتها اللقطة)', async () => {
  const c = client((step, body) => (step === 'start' ? { d: { ok: true, id: 'b'.repeat(24), chunk: CH } }
    : step === 'chunk' ? { d: { ok: true, offset: body.offset + Buffer.from(body.data, 'base64').length, done: true } }
    : { d: { ok: true, result: 'R', cost: 3, sec: 20 } }), { noCur: true });
  const att = { name: 'رحلة.mp4', isVideoWatch: true, blob: new Blob([Buffer.alloc(50)]), mime: 'video/mp4', size: 50, durationSec: 20, label: 'رحلة.mp4 · 0:20' };
  await c.ctx.window.omranVideoWatchSend('وش فيه؟', att);
  assert.equal(c.state.projects.length, 1);
  const p = c.state.projects[0];
  assert.equal(c.state.currentId, p.id);
  assert.equal(p.title, 'وش فيه؟');
  assert.deepEqual(Array.from(p.messages, (m) => m.role), ['user', 'assistant']); // مصفوفة من هذا العالم لا من vm
  assert.equal(p.messages[1].content, 'R\n\nCHARGED 3 0:20');
});

// ── v-video-watch-diag (لقطة المالك ٩:٢٤: «تعذّر تحليل الفيديو» لفيديو ٨ ثوانٍ بلا أيّ سبب) ──
test('١٣. التشخيص: السبب الحقيقيّ في سجلّ الأخطاء دائمًا، وفي __diag للمالك وحده، وبلا مفتاح', async () => {
  logged.length = 0;
  users.set('reem', { username: 'reem', points: 200 });
  G.startFail = 403;
  const a = await call('start', { size: 1000, mime: 'video/mp4', durationSec: 8 }, token('omran'));
  assert.deepEqual([a.code, a.j.error], [502, 'failed']);
  assert.equal(a.j.__diag, 'start 403: API key not valid. Please pass a valid API key.');
  const b = await call('start', { size: 1000, mime: 'video/mp4', durationSec: 8 });
  assert.deepEqual([b.code, b.j.error, '__diag' in b.j], [502, 'failed', false], 'غير المالك لا يرى التفاصيل');
  G.startFail = 0;
  assert.deepEqual(logged.map((x) => [x.scope, x.meta.user, x.msg.slice(0, 9)]), [['video-watch', 'omran', 'start 403'], ['video-watch', 'reem', 'start 403']]);
  // قطعة مرفوضة: الإزاحة والحجم وحبيبيّة الجلسة (x-goog-upload-chunk-granularity) في التشخيص
  G.chunkFail = 400; G.gran = '8388608';
  const s = await call('start', { size: 3 * CH, mime: 'video/mp4', durationSec: 8 }, token('omran'));
  const c = await call('chunk', { id: s.j.id, offset: 0, data: b64(CH) }, token('omran'));
  assert.deepEqual([c.code, c.j.__diag], [502, 'chunk@0/' + 3 * CH + ' 400: Invalid chunk size gran=8388608']);
  G.chunkFail = 0; G.gran = '';
  // الملفّ لم يصر جاهزًا عند المزوّد: الحالة للمالك، والمهمّة والملفّ يُحذفان
  G.fileState = 'FAILED'; G.deleted.length = 0;
  const id = await uploadAll(1000, 'omran');
  const f = await call('run', { id }, token('omran'));
  assert.deepEqual([f.code, f.j.__diag, G.deleted.length, kv.has('vwatch:' + id)], [502, 'file state FAILED', 1, false]);
  const all = JSON.stringify([logged, a.j, b.j, c.j, f.j]);
  assert.ok(!all.includes('g-test-key') && !all.includes('SECRET-IN-URL'), 'لا مفتاح ولا رابط جلسة في التشخيص');
});

test('١٤. الدقّة العالية مرفوضة (400) أو ضغط عابر (503): محاولة واحدة بالإعداد الافتراضيّ بخصم واحد، والسبب الأوّل للمالك', async () => {
  users.set('fb', { username: 'fb', points: 50 });
  G.fileState = 'ACTIVE'; G.duration = '8s';
  for (const [u, st] of [['fb', 400], ['omran', 400], ['fb', 503]]) {
    G.gens.length = 0; G.genPlan = [st];
    const id = await uploadAll(1000, u);
    const before = await bal(u);
    const r = await call('run', { id, prompt: 'حلّل' }, token(u));
    assert.equal(r.code, 200, JSON.stringify(r.j));
    assert.match(r.j.result, /00:05/);
    assert.equal(G.gens.length, 2, u + ' ' + st);
    assert.equal(G.gens[0].body.generationConfig.mediaResolution, 'MEDIA_RESOLUTION_HIGH');
    assert.deepEqual(G.gens[1].body.generationConfig, { maxOutputTokens: 8192 }, 'الإعداد الافتراضيّ');
    if (u === 'omran') assert.equal(r.j.__diag, 'fallback: gen-high 400: plan 400');
    else { assert.equal('__diag' in r.j, false); assert.equal(await bal(u), before - 3, 'خصم واحد'); }
  }
  // فشل المحاولتين: النقاط تُردّ، والسببان معًا للمالك، ولا محاولة ثالثة
  G.gens.length = 0; G.genPlan = [503, 500];
  const id = await uploadAll(1000, 'fb');
  const before = await bal('fb');
  const f = await call('run', { id }, token('fb'));
  assert.deepEqual([f.code, f.j.error, f.j.refunded, '__diag' in f.j], [502, 'failed', 3, false]);
  assert.equal(await bal('fb'), before);
  assert.equal(G.gens.length, 2);
  assert.equal(logged[logged.length - 1].msg, 'gen-high 503: plan 503 | gen 500: plan 500');
});

test('١٥. المتصفّح: التشخيص بين قوسين للمالك وحده — من الخادم، أو محلّيًّا (ردّ غير JSON، استثناء)', async () => {
  const att = () => ({ name: 'v.mp4', isVideoWatch: true, blob: new Blob([Buffer.alloc(10)]), mime: 'video/mp4', size: 10, durationSec: 8, label: 'v.mp4 · 0:08' });
  let c = client((step) => (step === 'start' ? { status: 502, d: { ok: false, error: 'failed', __diag: 'start 403: API key not valid' } } : { d: {} }), { user: 'omran' });
  await c.ctx.window.omranVideoWatchSend('حلّل', att());
  assert.equal(c.conv.messages[1].content, '⚠️ FAILED [start 403: API key not valid]');
  for (const [user, want] of [['Omran', '⚠️ FAILED [start 504]'], ['reem', '⚠️ FAILED']]) { // صفحة خطأ المنصّة بلا JSON
    c = client(() => ({ status: 504, d: {} }), { user });
    await c.ctx.window.omranVideoWatchSend('حلّل', att());
    assert.equal(c.conv.messages[1].content, want, user);
  }
  c = client(() => ({ d: { ok: true, id: 'c'.repeat(24), chunk: CH } }), { user: 'omran' });
  const broken = att(); broken.blob = null;
  await c.ctx.window.omranVideoWatchSend('حلّل', broken);
  assert.match(c.conv.messages[1].content, /^⚠️ FAILED \[client: .+\]$/);
  c = client((step) => (step === 'start' ? { d: { ok: true, id: 'd'.repeat(24), chunk: CH } } : step === 'chunk' ? { d: { ok: true, offset: 10, done: true } }
    : { d: { ok: true, result: 'R', cost: 0, sec: 8, __diag: 'fallback: gen-high 400: x' } }), { user: 'omran' });
  await c.ctx.window.omranVideoWatchSend('حلّل', att());
  assert.equal(c.conv.messages[1].content, 'R [fallback: gen-high 400: x]');
});

test('١٦. رصيد المزوّد عندنا خلص (لقطة المالك ١٠:١٣ «start 402: prepayment credits are depleted»): «متوقّف مؤقّتًا» لا «أعد المحاولة» ولا جدار', async () => {
  G.startFail = 402; G.startMsg = 'Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.';
  const o = await call('start', { size: 1000, mime: 'video/mp4', durationSec: 8 }, token('omran'));
  assert.deepEqual([o.code, o.j.error], [503, 'unavailable']);
  assert.match(o.j.__diag, /^start 402: Your prepayment credits are depleted/);
  const u = await call('start', { size: 1000, mime: 'video/mp4', durationSec: 8 });
  assert.deepEqual([u.code, u.j.error, '__diag' in u.j], [503, 'unavailable', false]);
  G.startFail = 0; G.startMsg = '';
  // التحليل نفسه يرفض بالفوترة: النقاط تُردّ والرمز نفسه
  users.set('bill', { username: 'bill', points: 50 });
  G.fileState = 'ACTIVE'; G.duration = '8s'; G.genPlan = [402, 402];
  const id = await uploadAll(1000, 'bill');
  const before = await bal('bill');
  const r = await call('run', { id }, token('bill'));
  assert.deepEqual([r.code, r.j.error, r.j.refunded], [503, 'unavailable', 3]);
  assert.equal(await bal('bill'), before);
  G.genPlan = [];
  // الواجهة: نصّ التوقّف المؤقّت — لا «أعد المحاولة»
  const c = client((step) => (step === 'start' ? { status: 503, d: { ok: false, error: 'unavailable' } } : { d: {} }));
  await c.ctx.window.omranVideoWatchSend('حلّل', { name: 'v.mp4', isVideoWatch: true, blob: new Blob([Buffer.alloc(10)]), mime: 'video/mp4', size: 10, durationSec: 8, label: 'v.mp4 · 0:08' });
  assert.equal(c.conv.messages[1].content, '⚠️ vwUnavailable');
});
