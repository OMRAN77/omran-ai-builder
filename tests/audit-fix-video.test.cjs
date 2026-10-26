// tests/audit-fix-video.test.cjs — v-audit-video: دفعة «الفيديو» من الفحص الشامل (موافقة المالك على كلّ عطب غير مقفل في طلب سحب واحد).
// كلّ اختبار يبدأ برقم العطب، ويثبت السلوك على الكود الحقيقيّ (الخادم بـrequire مع KV في الذاكرة وجلب مزيّف، والواجهة بـvm):
//   srv-video-3  بروكسي التنزيل وveo-download: قطع العميل لا يعلّق الدالّة ويُحسب ما بُثّ، والطلبات المتوازية تُحجز ذرّيًّا، وسقف لـveo.
//   srv-video-4  «شاهد الفيديو»: حدّ يوميّ لفتح الرفع، ومهمّة رفع واحدة مفتوحة للحساب (ملفّ السابقة غير المشغّلة يُحذف).
//   cli-video-2  تعليق صانع الفيديو يرسل رمز الحساب إلى /api/tts، والسرد الساقط من مشهد في الفيلم يُعلَن.
//   cli-video-3  محرّر «كتابة وصوت»: فيديو مجهول المدّة مع صوت مكرّر/بديل يُصدَّر بنهاية.
//   cli-video-4  «اصنع/أعد المحاولة» في الترندات لا يمحو الفيديو السابق قبل القبول، وصانع الفيديو يعيد ناتجه السابق.
//   cli-video-5 · x-runtime-ui-2  المحرّر بالـ١٤ لغة عبر I18N، والتبويب وبند القائمة يتبعان اللغة.
//   cli-video-6  رسائل حدّ اليوم والمهلة وإعادة المحاولة في صانع الفيديو بالـ١٤ لغة لا isEn().
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'audit-fix-video-secret-' + 'x'.repeat(32);
process.env.GEMINI_API_KEY = 'gm-test';
delete process.env.OWNER_USERNAMES; delete process.env.OWNER_USERNAME;
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const LANGS = ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => { if (!store.has(k)) return null; const v = store.get(k); try { return JSON.parse(v); } catch (e) { return v; } },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Math.trunc(Number(n)); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Math.trunc(Number(n)); store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => cmds.map(() => null),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });

const auth = require(rp('api/_lib/auth.js'));
async function user(name, extra) { await auth.putUser(name, Object.assign({ username: name, points: 1000, createdAt: Date.now() }, extra || {})); return auth.makeToken(name); }
const day = () => new Date().toISOString().slice(0, 10);

// ─────────────────────────────── srv-video-3 ───────────────────────────────
const videoDownload = require(rp('api/video-download.js'));
const veoDownload = require(rp('api/_lib/veo-download.js'));

/** مجرى مصدر بطول معلن يُولَّد عند الطلب (لا ذاكرة)، بقطع ٦٤ ك.ب. */
function bigBody(total) {
  let left = total;
  return new ReadableStream({
    pull(c) {
      if (left <= 0) { c.close(); return; }
      const n = Math.min(65536, left); left -= n; c.enqueue(new Uint8Array(n));
    },
  });
}
const mediaRes = (total, type) => new Response(bigBody(total), { status: 200, headers: { 'content-type': type || 'video/mp4', 'content-length': String(total) } });

/** خادم Node حقيقيّ حول المعالج (ردّ بشكل Vercel)، والعميل يقرأ readBytes ثمّ يقطع. يرجع: هل انتهى المعالج خلال المهلة. */
async function abortMidway(handler, query, readBytes) {
  let done = null;
  const server = http.createServer((req, res) => {
    res.status = function (c) { this.statusCode = c; return this; };
    res.json = function (v) { if (!this.headersSent) this.setHeader('content-type', 'application/json'); this.end(JSON.stringify(v)); return this; };
    req.query = query;
    done = Promise.resolve(handler(req, res)).then(() => 'finished', (e) => 'threw:' + (e && e.message));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((resolve) => {
    const creq = http.get({ host: '127.0.0.1', port, path: '/', headers: { 'x-forwarded-for': '198.51.100.7' } }, (cres) => {
      let got = 0;
      cres.on('data', (b) => { got += b.length; if (got >= readBytes) { creq.destroy(); resolve(); } });
      cres.on('end', resolve);
    });
    creq.on('error', () => resolve());
  });
  let timer;
  const outcome = await Promise.race([done, new Promise((r) => { timer = setTimeout(() => r('hung'), 4000); })]);
  clearTimeout(timer);
  server.closeAllConnections && server.closeAllConnections();
  server.close();
  return outcome;
}

function fakeRes() {
  return {
    code: 200, body: null, headers: {}, chunks: [], headersSent: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, status(c) { this.code = c; return this; },
    json(v) { this.body = v; return this; }, write(b) { this.headersSent = true; this.chunks.push(b.length); return true; },
    once() {}, end() { return this; },
  };
}

test('srv-video-3 (أ): قطع العميل في منتصف تنزيل ٤٨ م.ب لا يعلّق البروكسي، وما بُثّ يُحسب في ميزانيّة اليوم', async () => {
  const tk = await user('dlabort1');
  videoDownload.__deps.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  videoDownload.__deps.fetchFn = async () => mediaRes(48 * 1024 * 1024);
  let outcome;
  try { outcome = await abortMidway(videoDownload, { url: 'https://cdn.example/big.mp4', token: tk }, 1024 * 1024); }
  finally { videoDownload.__deps.lookup = undefined; videoDownload.__deps.fetchFn = undefined; }
  assert.equal(outcome, 'finished', 'المعالج ينتهي بعد رحيل العميل (كان معلّقًا ينتظر drain)');
  const counted = Number(store.get('dl:bytes:dlabort1:' + day()) || 0);
  assert.ok(counted > 0, 'المبثوث قبل القطع محسوب (كان صفرًا)');
  assert.ok(counted < 48 * 1024 * 1024, 'المحسوب هو المبثوث فعلًا لا الحجز كلّه: ' + counted);
});

test('srv-video-3 (ب): خمسة تنزيلات متوازية بحجم ٥٠ ك.ب تحت سقف ٧٥ ك.ب — يُحجز ذرّيًّا فلا يمرّ إلّا ما يمرّ تتابعًا', async () => {
  const tk = await user('dlpar1');
  const prev = process.env.DOWNLOAD_BYTES_DAILY;
  process.env.DOWNLOAD_BYTES_DAILY = String(75 * 1024);
  videoDownload.__deps.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  videoDownload.__deps.fetchFn = async () => mediaRes(50 * 1024);
  let codes;
  try {
    codes = await Promise.all([0, 1, 2, 3, 4].map(async () => {
      const r = fakeRes();
      await videoDownload({ method: 'GET', headers: { 'x-forwarded-for': '198.51.100.8' }, query: { url: 'https://cdn.example/same50.mp4', token: tk } }, r);
      return r.code;
    }));
  } finally {
    videoDownload.__deps.lookup = undefined; videoDownload.__deps.fetchFn = undefined;
    if (prev === undefined) delete process.env.DOWNLOAD_BYTES_DAILY; else process.env.DOWNLOAD_BYTES_DAILY = prev;
  }
  assert.equal(codes.filter((c) => c === 200).length, 2, 'كما لو كانت متتابعة: ٠ ثمّ ٥٠ تحت السقف، والثالث فوقه — ' + codes.join(','));
  assert.equal(codes.filter((c) => c === 429).length, 3);
  assert.equal(Number(store.get('dl:bytes:dlpar1:' + day())), 100 * 1024, 'العدّاد = المبثوث فعلًا (المرفوض رُدّ حجزه)');
});

const VEO_FILE = 'https://generativelanguage.googleapis.com/v1beta/files/aud1t9:download?alt=media';
function veoQuery() {
  const link = new URL(veoDownload.downloadUrl(VEO_FILE), 'https://app.example');
  return { uri: link.searchParams.get('uri'), sig: link.searchParams.get('sig') };
}

test('srv-video-3 (ج): veo-download — قطع العميل لا يعلّق الدالّة', async () => {
  veoDownload.__deps.lookup = async () => [{ address: '142.250.1.1', family: 4 }];
  veoDownload.__deps.fetchFn = async () => mediaRes(48 * 1024 * 1024);
  let outcome;
  try { outcome = await abortMidway(veoDownload, veoQuery(), 1024 * 1024); }
  finally { veoDownload.__deps.lookup = undefined; veoDownload.__deps.fetchFn = undefined; }
  assert.equal(outcome, 'finished');
});

test('srv-video-3 (د): veo-download له سقف بايت يوميّ للملفّ — الرابط الموقّع لا يعيد البثّ بلا حدّ (والتوازي محجوز)', async () => {
  const prev = process.env.VEO_DL_BYTES_DAILY;
  process.env.VEO_DL_BYTES_DAILY = String(100 * 1024);
  for (const k of [...store.keys()]) if (k.startsWith('veo:dl:bytes:')) store.delete(k);
  veoDownload.__deps.lookup = async () => [{ address: '142.250.1.1', family: 4 }];
  let fetched = 0;
  veoDownload.__deps.fetchFn = async () => { fetched++; return mediaRes(60 * 1024); };
  const one = async () => { const r = fakeRes(); await veoDownload({ method: 'GET', query: veoQuery(), headers: {} }, r); return r; };
  let par, after;
  try {
    par = await Promise.all([one(), one(), one()]);
    after = await one();
  } finally {
    veoDownload.__deps.lookup = undefined; veoDownload.__deps.fetchFn = undefined;
    if (prev === undefined) delete process.env.VEO_DL_BYTES_DAILY; else process.env.VEO_DL_BYTES_DAILY = prev;
  }
  assert.deepEqual(par.map((r) => r.code).sort(), [200, 200, 429], 'اثنان تحت السقف والثالث فوقه');
  assert.equal(after.code, 429); assert.equal(after.body.error, 'daily_limit_reached');
  assert.equal(fetched, 3, 'بعد امتلاء السقف لا جلب بمفتاحنا أصلًا');
  const ok = par.find((r) => r.code === 200);
  assert.equal(ok.chunks.reduce((a, b) => a + b, 0), 60 * 1024, 'المسموح يُبثّ كاملًا');
});

// ─────────────────────────────── srv-video-4 ───────────────────────────────
const watch = require(rp('api/_lib/video-watch.js'));
const W = { starts: 0, deleted: [], startFail: 0 };
const VW_SESSION = 'https://upload.example/vw-session/';
function watchNet() {
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.endsWith('/upload/v1beta/files')) {
      W.starts++;
      if (W.startFail) return new Response(JSON.stringify({ error: { message: 'boom' } }), { status: W.startFail });
      return new Response('{}', { status: 200, headers: { 'x-goog-upload-url': VW_SESSION + W.starts } });
    }
    if (u.startsWith(VW_SESSION)) {
      const n = u.slice(VW_SESSION.length);
      if (/finalize/.test(init.headers['X-Goog-Upload-Command'])) return new Response(JSON.stringify({ file: { name: 'files/vw' + n, uri: 'https://generativelanguage.googleapis.com/v1beta/files/vw' + n, mimeType: 'video/mp4' } }), { status: 200 });
      return new Response('', { status: 200 });
    }
    if (init && init.method === 'DELETE') { W.deleted.push(u); return new Response('{}', { status: 200 }); }
    throw new Error('unexpected fetch ' + u);
  };
}
async function vw(step, body, tk) {
  const res = { code: 200, j: null, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, setHeader() { return res; }, end() { return res; } };
  await watch({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.20' }, query: { step }, body: Object.assign({ token: tk }, body) }, res);
  return res;
}
const vwStart = (tk) => vw('start', { size: 1000, mime: 'video/mp4', name: 'v.mp4', durationSec: 8 }, tk);

test('srv-video-4 (أ): فتح الرفع له حدّ يوميّ للحساب — الحادي والعشرون يُرفض «limit» قبل أيّ جلسة عند المزوّد، والمالك معفى', async () => {
  watchNet(); W.starts = 0;
  const tk = await user('vwcap1'); store.set('points:vwcap1', '70');
  const N = watch.DAILY || 20;
  for (let i = 0; i < N; i++) assert.equal((await vwStart(tk)).code, 200, 'فتح ' + (i + 1));
  const over = await vwStart(tk);
  assert.deepEqual([over.code, over.j && over.j.error], [429, 'limit']);
  assert.equal(W.starts, N, 'لا جلسة رفع عند المزوّد بعد الحدّ');
  const own = await user('omran');
  for (let i = 0; i <= N; i++) assert.equal((await vwStart(own)).code, 200, 'المالك ' + (i + 1));
});

test('srv-video-4 (ب): فشل فتح الجلسة عند المزوّد يردّ الفتحة إلى حدّ اليوم', async () => {
  watchNet(); W.starts = 0;
  const tk = await user('vwcap2'); store.set('points:vwcap2', '70');
  const N = watch.DAILY || 20;
  W.startFail = 500;
  for (let i = 0; i < 3; i++) assert.equal((await vwStart(tk)).code, 502);
  W.startFail = 0;
  for (let i = 0; i < N; i++) assert.equal((await vwStart(tk)).code, 200, 'الفاشلة لم تأكل الحدّ — ' + (i + 1));
  assert.equal((await vwStart(tk)).code, 429, 'والحدّ نفسه قائم');
});

test('srv-video-4 (ج): مهمّة رفع واحدة مفتوحة للحساب — بدء أخرى يحذف ملفّ السابقة غير المشغّلة عند المزوّد ويُغلقها', async () => {
  watchNet(); W.deleted.length = 0;
  const tk = await user('vwone1'); store.set('points:vwone1', '70');
  const a = await vwStart(tk);
  const up = await vw('chunk', { id: a.j.id, offset: 0, data: Buffer.alloc(1000, 7).toString('base64') }, tk);
  assert.deepEqual([up.code, up.j.done], [200, true], 'الملفّ رُفع ولم يُشغَّل');
  const b = await vwStart(tk);
  assert.equal(b.code, 200);
  assert.equal(W.deleted.length, 1, 'ملفّ المهمّة المتروكة حُذف عند المزوّد (كان يبقى ٤٨ ساعة)');
  assert.equal((await vw('run', { id: a.j.id }, tk)).code, 404, 'السابقة أُغلقت');
  // مهمّة دُفعت (paid) لا تُمسّ: تُعاد بلا خصم ثانٍ
  const pj = JSON.parse(store.get('vwatch:' + b.j.id)); pj.paid = 3; pj.file = { name: 'files/vwpaid', uri: 'x', mime: 'video/mp4' };
  store.set('vwatch:' + b.j.id, JSON.stringify(pj));
  await vwStart(tk);
  assert.equal(W.deleted.length, 1, 'المدفوعة تبقى');
  assert.ok(store.has('vwatch:' + b.j.id));
});

// ─────────────────────────────── cli-video-2 ───────────────────────────────
const VIDEO = read('js/app-11-video.js');
/** كتلة متوازنة الأقواس بالعدّ (نمط tests/video-seq-cooldown). */
function extractBlock(source, startNeedle) {
  const a = source.indexOf(startNeedle);
  assert.ok(a >= 0, 'بداية الكتلة: ' + startNeedle);
  let depth = 0, i = source.indexOf('{', a);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  return source.slice(a, i + 1);
}
const APP02 = read('js/app-02-tts.js');
const TTS_HELPERS = APP02.slice(APP02.indexOf('function ttsAuthToken('), APP02.indexOf('async function fetchCloudSpeech('));

test('cli-video-2 (أ): فيديو القوالب بتعليق صوتيّ يرسل رمز الحساب ومعرّف الضيف إلى /api/tts (كان يُعدّ على عنوان IP)', async () => {
  const bodies = [];
  const ctx = {
    setStatus() {}, bT: (a) => a, recordCanvasClip: async () => ({ type: 'video/webm', size: 9 }),
    fetch: async (url, init) => { if (url === '/api/tts') bodies.push(JSON.parse(init.body)); return { ok: false, status: 402 }; },
    muxNarrationAny: async (b) => b, cleanNarrationText: (x) => x, getNarrationGender: () => 'female', getNarrationSpeed: () => 'fast',
    URL: { createObjectURL: () => 'blob:x' }, resultEl: { style: {} }, downloadEl: { style: {} }, autoSaveVideo() {}, dlName: () => 'v.webm', JSON,
    authGet: (k) => (k === 'aiapp_auth_token' ? 'tok-sub-1' : null), window: { getGuestId: () => 'g_guest_9' },
  };
  vm.createContext(ctx);
  vm.runInContext(TTS_HELPERS + '\n' + extractBlock(VIDEO, 'async function runCanvasOnly('), ctx);
  await ctx.runCanvasOnly('عرض', '9:16', 5, '', true, 'سرد');
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].token, 'tok-sub-1', 'الحساب يصل الخادم فيُطبَّق حدّه هو لا حدّ العنوان المشترك');
  assert.equal(bodies[0].guestId, 'g_guest_9');
  assert.equal(bodies[0].speed, 'fast', 'السرعة كما كانت');
});

test('cli-video-2 (ب): المواضع الخمسة لـ/api/tts في صانع الفيديو كلّها ترسل الحساب، والسرد الساقط من مشهد في الفيلم يُعلَن', () => {
  const calls = [...VIDEO.matchAll(/fetch\('\/api\/tts', \{[\s\S]*?body: JSON\.stringify\(\{([^\n]*)\}\),/g)];
  assert.equal(calls.length, 5);
  for (const c of calls) assert.ok(c[1].includes('token: ttsAuthToken(), guestId: ttsGuestId()'), c[1].slice(0, 90));
  // نصّ «السرد ناقص في {k} من {n}» — بالمفتاح، وبلا شيء حين لا نقص
  const ctx = { window: { t: (k) => (k === 'axVideoNarrMissing' ? 'NM {k}/{n}' : k) }, bT: (a, e) => e };
  vm.runInNewContext(extractBlock(VIDEO, 'function narrMissNote(') + '\nthis.f = narrMissNote;', ctx);
  assert.equal(ctx.f(0, 3), '');
  assert.equal(ctx.f(2, 3), ' NM 2/3');
  const noKey = { window: { t: (k) => k }, bT: (a, e) => e };
  vm.runInNewContext(extractBlock(VIDEO, 'function narrMissNote(') + '\nthis.f = narrMissNote;', noKey);
  assert.equal(noKey.f(1, 5), ' ⚠️ Narration is missing from 1 of 5 scenes.', 'الاحتياط الإنجليزيّ قبل وصول المفتاح');
  // الفيلم والطويل: عدّ المشاهد بلا صوت في سطر النهاية
  assert.equal((VIDEO.match(/narrMissNote\(builtScenes\.filter\(\(s\) => !\(s\.audioBlob && s\.audioBlob\.size\)\)\.length, builtScenes\.length\)/g) || []).length, 2);
});

test('srv-video-4 (د): الواجهة تعرض حدّ اليوم بنصّ الـ١٤ لغة القائم (portraitLimitReached) لا «تعذّر التحليل»', () => {
  const s = read('js/app-32-video-watch.js');
  const fn = s.slice(s.indexOf('function errText(d){'), s.indexOf('var lastWatch'));
  const box = { t: (k) => 'T:' + k };
  vm.runInNewContext(fn + '\nthis.errText = errText;', box);
  assert.equal(box.errText({ error: 'limit' }), 'T:portraitLimitReached');
  assert.equal(box.errText({ error: 'failed' }), 'T:vwFailed');
});
