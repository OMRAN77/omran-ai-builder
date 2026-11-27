// tests/social-direct-sure.test.cjs — v-social-direct-sure (مراجعة مستقلّة ٢٧ نوفمبر لـsocial-direct.js): ستّ ثغرات منطق في النشر المباشر.
// القاعدة الواحدة: الحجز لا يتحرّر إلّا بإثبات أنّ المنصّة لم تنشر، وما لم يُحسم يبقى محجوزًا ويُحسم بالسؤال — كما يفعل social-publish.js للوسيط.
//   ١. خطأ Graph غير 190 في السؤال، ونشر حاوية مرفوض: فشل بالرمز (لا «ينتظر» للأبد)، و190 في النشر يرجّع «يحتاج ربط».
//   ٢. سجلّ الطلب قبل الحجز: لا حجز أسبوعًا يشير إلى طلب لا وجود له.
//   ٣. فيسبوك غير المؤكَّد (مهلة، استثناء، 5xx) يبقى محجوزًا ويُلقى بالسؤال — لا نشر ثانٍ.
//   ٤. حاوية إنستغرام تُنشر عند فتح اللوحة التالي وإن أُغلق التبويب.
//   ٥. الطلب المدموج: «ضاع/فشل» عند الوسيط يُحسم، و«غير متأكّد» يصل اللوحة، والوسيط يُسأل بطريقه القديم حرفيًّا.
//   ٦. إنستغرام: MP4/MOV حتّى ٣٠٠ ميغا — غير ذلك يُرفض قبل أيّ حاوية، وفيسبوك يمضي.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

for (const k of ['OWNER_USERNAMES', 'OWNER_USERNAME', 'UPLOAD_POST_USER', 'SITE_URL', 'META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_VERSION', 'META_CONFIG_ID', 'UPLOAD_POST_API_KEY', 'FAL_KEY']) delete process.env[k];
process.env.AUTH_SECRET = 'social-direct-sure-secret';
process.env.META_APP_ID = '1234567890'; process.env.META_APP_SECRET = 'app-secret-x';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const J = (x) => JSON.parse(JSON.stringify(x));
const con = [];
for (const m of ['log', 'warn', 'error']) console[m] = (...a) => { con.push(a.map(String).join(' ')); };

const kv = new Map();
let kvFail = null; // (key) => true يرمي عند كتابة هذا المفتاح — KV متعطّل
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetRaw: async (k) => (kv.has(k) ? kv.get(k) : null),
  kvSetRaw: async (k, v) => { if (kvFail && kvFail(k)) throw new Error('kv down'); kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvDel: async (k) => { kv.delete(k); },
} };

const calls = [];
let routes = {};
global.fetch = async (url, opts) => {
  const o = opts || {};
  calls.push({ url: String(url), method: o.method || 'GET', body: o.body });
  const hit = Object.keys(routes).filter((p) => String(url).includes(p)).sort((a, b) => b.length - a.length)[0];
  if (!hit) throw new Error('unexpected fetch ' + url);
  const r = typeof routes[hit] === 'function' ? await routes[hit](String(url), o) : routes[hit];
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
};

const sp = require(rp('api/_lib/social-publish.js'));
const enc = require(rp('api/_lib/_emailCrypto.js'));
const token = (u) => {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
async function call(op, body) {
  const out = { status: 0, body: null };
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(b) { out.body = J(b); return this; }, end() { return this; } };
  await sp({ method: 'POST', query: { action: 'social-publish', op }, headers: {}, body: Object.assign({ token: token('omran') }, body || {}) }, res);
  return out;
}
const G = 'graph.facebook.com/v23.0', GV = 'graph-video.facebook.com/v23.0';
const params = (c) => new URLSearchParams(c.method === 'GET' ? c.url.split('?')[1] : String(c.body));
const CAP = 'سطر أوّل\nوصف #omai';
let n = 0;
/** حالة نظيفة: Meta مربوط (صفحة P1 وإنستغرام IG1)، وملفّ مرفوع باسم جديد. */
function fresh(file) {
  kv.clear(); calls.length = 0; routes = {}; kvFail = null; delete process.env.UPLOAD_POST_API_KEY;
  kv.set('socdir:meta', enc.encrypt(JSON.stringify({ page: 'P1', token: 'EAAG-page', ig: 'IG1' })));
  const id = (++n).toString(16).padStart(24, '0');
  kv.set('socpub:file:' + id, file || 'https://v3.fal.media/files/om-' + n + '.mp4');
  return id;
}
const pub = (id, platforms) => call('publish', { id, caption: CAP, platforms });
const st = (request) => call('status', { request });
const rows = (s) => s.body.results.map((x) => [x.platform, x.state, x.error]);
const rec = (r) => JSON.parse(kv.get('socdir:req:' + r));
const age = (r, ms) => { const o = rec(r); o.at -= ms; kv.set('socdir:req:' + r, JSON.stringify(o)); };
const posts = (frag) => calls.filter((c) => c.method === 'POST' && c.url.includes(frag)).length;
const GRACE = 11 * 60 * 1000;

test('١. خطأ في سؤال فيسبوك غير 190: «ما نزل» برمزه والحجز باقٍ (الفيديو عند Meta)، ويُعاد سؤاله فيُحسم «نزل»', async () => {
  const id = fresh();
  let fb = { status: 500, body: { error: { code: 2, is_transient: true } } };
  routes = { [GV + '/P1/videos']: { status: 200, body: { id: 'FBV' } }, [G + '/FBV']: () => fb };
  const r = await pub(id, ['facebook']);
  let s = await st(r.body.request);
  assert.deepEqual(rows(s), [['facebook', 'wait', '']], 'خطأ عابر = ينتظر');
  fb = { status: 400, body: { error: { code: 10, message: 'perm' } } };
  s = await st(r.body.request);
  assert.deepEqual([s.body.state, rows(s)], ['done', [['facebook', 'fail', 'e10']]], 'الرمز يظهر ولا انتظار للأبد');
  assert.equal(kv.get('socdir:sent:' + id + ':facebook'), r.body.request, 'غير مؤكَّد: لا تحرير — المحاولة الثانية كانت ستنشر مرّتين');
  assert.equal((await pub(id, ['facebook'])).body.again, true);
  fb = { status: 200, body: { status: { video_status: 'ready' }, permalink_url: '/omai/videos/FBV/' } };
  s = await st(r.body.request);
  assert.deepEqual([s.body.state, rows(s)], ['done', [['facebook', 'ok', '']]]);
});

test('١ب. نشر الحاوية: الرفض الصريح أوّل مرّة «ما نزل» برمزه ويحرّر، و190 فيه يرجّع «يحتاج ربط»، والعابر ينتظر', async () => {
  for (const [err, code] of [[{ code: 9, error_subcode: 2207042 }, 'e9.2207042'], [{ code: 190 }, 'e190']]) {
    const id = fresh();
    routes = { [G + '/IG1/media_publish']: { status: 400, body: { error: err } }, [G + '/IG1/media']: { status: 200, body: { id: 'BOX' } }, [G + '/BOX']: { status: 200, body: { status_code: 'FINISHED' } } };
    const r = await pub(id, ['instagram']);
    const s = await st(r.body.request);
    assert.deepEqual([s.body.state, rows(s)], ['done', [['instagram', 'fail', code]]]);
    assert.equal(kv.has('socdir:sent:' + id + ':instagram'), false, 'رفض صريح: الحاوية لم تُنشر');
    assert.equal(kv.has('socdir:meta:reauth'), code === 'e190', '190 ← يحتاج ربط');
  }
  const id = fresh();
  routes = { [G + '/IG1/media_publish']: { status: 500, body: {} }, [G + '/IG1/media']: { status: 200, body: { id: 'BOX' } }, [G + '/BOX']: { status: 200, body: { status_code: 'FINISHED' } } };
  const r = await pub(id, ['instagram']);
  assert.deepEqual(rows(await st(r.body.request)), [['instagram', 'wait', '']], 'نتيجة نشر غير معروفة: ينتظر وحالة الحاوية تحسم');
  routes[G + '/BOX'] = { status: 400, body: { error: { code: 100 } } };
  kv.delete('socdir:igpub:BOX');
  const s = await st(r.body.request);
  assert.deepEqual(rows(s), [['instagram', 'fail', 'e100']], 'بعد محاولة نشر غير محسومة: الرمز يظهر…');
  assert.ok(kv.has('socdir:sent:' + id + ':instagram'), '…والحجز باقٍ (ربّما نُشرت)');
  const id2 = fresh();
  routes = { [G + '/IG1/media']: { status: 200, body: { id: 'BOX2' } }, [G + '/BOX2']: { status: 400, body: { error: { code: 100, error_subcode: 33 } } } };
  const r2 = await pub(id2, ['instagram']);
  assert.deepEqual(rows(await st(r2.body.request)), [['instagram', 'fail', 'e100.33']], 'حاوية لم نحاول نشرها: فشل يحرّر');
  assert.equal(kv.has('socdir:sent:' + id2 + ':instagram'), false);
});

test('٢. السجلّ قبل الحجز: تعطّل كتابته لا يترك حجزًا، وموت الدالّة وسط النداء يُحسم بالسؤال لا «ضاع»', async () => {
  let id = fresh();
  kvFail = (k) => k.startsWith('socdir:req:');
  const r = await pub(id, ['instagram', 'facebook']);
  assert.equal(r.status, 503);
  assert.deepEqual([...kv.keys()].filter((k) => k.startsWith('socdir:sent:')), [], 'لا حجز بلا سجلّ');
  assert.equal(calls.length, 0, 'ولا نداء لـMeta');
  // الدالّة تموت أثناء نداء فيسبوك (مهلة Vercel): السجلّ موجود من قبل
  id = fresh();
  routes = { [GV + '/P1/videos']: () => new Promise(() => {}), [G + '/IG1/media']: { status: 200, body: { id: 'BOXd' } } };
  pub(id, ['facebook', 'instagram']); // فيسبوك أوّلًا: إنستغرام لم يبدأ حين ماتت
  for (let i = 0; i < 20 && !posts('/P1/videos'); i++) await new Promise((ok) => setImmediate(ok));
  const reqId = kv.get('socdir:sent:' + id + ':facebook');
  assert.match(reqId, /^sd-/);
  assert.ok(kv.has('socdir:req:' + reqId), 'الحجز يشير إلى سجلّ موجود');
  let s = await st(reqId);
  assert.equal(s.body.state, 'wait', 'في المهلة: ربّما ما زالت تعمل');
  assert.equal(s.body.lost, undefined);
  age(reqId, GRACE);
  routes[G + '/P1/videos'] = { status: 200, body: { data: [] } };
  s = await st(reqId);
  assert.deepEqual(rows(s).find((x) => x[0] === 'instagram'), ['instagram', 'fail', 'lost'], 'حاوية لم تُنشر قطّ: تتحرّر');
  assert.equal(kv.has('socdir:sent:' + id + ':instagram'), false);
  assert.deepEqual(rows(s).find((x) => x[0] === 'facebook'), ['facebook', 'fail', 'e-unsure'], 'فيسبوك لا يُعرف: يظهر ويبقى محجوزًا');
  assert.equal(kv.get('socdir:sent:' + id + ':facebook'), reqId);
});

test('٣. فيسبوك غير المؤكَّد (5xx، استثناء بعد الإرسال) يبقى محجوزًا ويُلقى في الصفحة بنصّه، والرفض الصريح وما لم يخرج يحرّران', async () => {
  for (const bad of [() => ({ status: 504, body: {} }), () => { throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }); }]) {
    const id = fresh();
    routes = { [GV + '/P1/videos']: bad };
    const r = await pub(id, ['facebook']);
    assert.deepEqual([r.status, r.body.unsure], [200, true], 'اللوحة تقول «ما تأكّدنا» لا «انرسل» ولا «ما نزل»');
    assert.equal(kv.get('socdir:sent:' + id + ':facebook'), r.body.request, 'محجوز');
    const again = await pub(id, ['facebook']);
    assert.deepEqual([again.body.again, posts('/P1/videos')], [true, 1], 'لا نشر ثانٍ');
    routes = {
      [G + '/P1/videos']: { status: 200, body: { data: [{ id: 'OTHER', description: 'غيره' }, { id: 'FBX', description: CAP }] } },
      [G + '/FBX']: { status: 200, body: { status: { video_status: 'ready' }, permalink_url: 'https://www.facebook.com/omai/videos/FBX/' } },
    };
    const s = await st(r.body.request);
    assert.deepEqual([s.body.state, rows(s)], ['done', [['facebook', 'ok', '']]], 'وُجد في الصفحة بنصّه ← نزل');
    assert.equal(rec(r.body.request).jobs.facebook.id, 'FBX');
    const since = Number(params(calls.find((c) => c.url.includes(G + '/P1/videos'))).get('since'));
    assert.ok(Math.abs(since * 1000 - rec(r.body.request).at) < 200000, 'السؤال من وقت الطلب');
  }
  for (const [bad, why] of [[{ status: 400, body: { error: { code: 100, message: 'bad url' } } }, 'رفض صريح'], [() => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); }, 'ما خرج الطلب']]) {
    const id = fresh();
    routes = { [GV + '/P1/videos']: bad };
    const r = await pub(id, ['facebook']);
    assert.equal(kv.has('socdir:sent:' + id + ':facebook'), false, why + ': يتحرّر');
    assert.equal(r.body.unsure, undefined, why);
  }
});

test('٤. حاوية إنستغرام تُنشر عند فتح اللوحة التالي (accounts) وإن أُغلق التبويب، مرّة واحدة، ثمّ تخرج من القائمة', async () => {
  const id = fresh();
  let pubs = 0;
  routes = {
    [G + '/IG1/media']: { status: 200, body: { id: 'BOXa' } },
    [G + '/BOXa']: { status: 200, body: { status_code: 'FINISHED' } },
    [G + '/IG1/media_publish']: () => { pubs++; return { status: 200, body: { id: 'MEDa' } }; },
    [G + '/MEDa']: { status: 200, body: { permalink: 'https://www.instagram.com/reel/a/' } },
  };
  const r = await pub(id, ['instagram']); // ولا سؤال حالة بعده: التبويب أُغلق
  assert.equal(pubs, 0);
  const a = await call('accounts');
  assert.deepEqual([a.status, a.body.on], [200, ['instagram', 'facebook']]);
  assert.equal(pubs, 1, 'نُشرت عند فتح اللوحة');
  assert.equal(rec(r.body.request).jobs.instagram.state, 'ok');
  await call('accounts');
  assert.equal(pubs, 1, 'مرّة واحدة');
  assert.deepEqual(JSON.parse(kv.get('socdir:open') || '[]'), [], 'خرجت من قائمة المعلَّق');
});

test('٥. الطلب المدموج: «ضاع» و«فشل» عند الوسيط يُحسمان، و«غير متأكّد» يصل اللوحة، و«رآه حيًّا» يُسجَّل كالطريق القديم', async () => {
  const id = fresh();
  process.env.UPLOAD_POST_API_KEY = 'up-k';
  routes = {
    [GV + '/P1/videos']: { status: 200, body: { id: 'FBm' } },
    [G + '/FBm']: { status: 200, body: { status: { video_status: 'ready' }, permalink_url: '/omai/videos/FBm/' } },
    'api.upload-post.com/api/upload': { status: 504, body: {} }, // الوسيط: ربّما وصل
    'api.upload-post.com/api/uploadposts/status': { status: 404, body: { status: 'not_found' } },
  };
  const r = await pub(id, ['facebook', 'tiktok']);
  assert.equal(r.body.unsure, true, '«غير متأكّد» من الوسيط لا يُسقط');
  let s = await st(r.body.request);
  assert.deepEqual([s.body.state, rows(s)], ['wait', [['facebook', 'ok', ''], ['tiktok', 'wait', '']]], 'في المهلة ينتظر كالطريق القديم');
  const up = rec(r.body.request).up;
  const o = JSON.parse(kv.get('socpub:req:' + up)); o.at -= GRACE; kv.set('socpub:req:' + up, JSON.stringify(o));
  s = await st(r.body.request);
  assert.deepEqual([s.body.state, rows(s)], ['done', [['facebook', 'ok', ''], ['tiktok', 'fail', 'lost']]], 'ما وصل الوسيط بعد المهلة: «ما نزل» لا انتظار للأبد');
  // مهمّة فشلت عند الوسيط قبل أن تبلغ المنصّة
  const id2 = fresh();
  process.env.UPLOAD_POST_API_KEY = 'up-k';
  routes = {
    [GV + '/P1/videos']: { status: 200, body: { id: 'FBn' } },
    [G + '/FBn']: { status: 200, body: { status: { video_status: 'processing' } } },
    'api.upload-post.com/api/upload': { status: 200, body: { success: true, request_id: 'upreq-777777' } },
    'api.upload-post.com/api/uploadposts/status': { status: 200, body: { status: 'failed', results: [] } },
  };
  const r2 = await pub(id2, ['facebook', 'youtube']);
  s = await st(r2.body.request);
  assert.deepEqual(rows(s), [['facebook', 'wait', ''], ['youtube', 'fail', '']]);
  routes[G + '/FBn'] = { status: 200, body: { status: { video_status: 'ready' } } };
  s = await st(r2.body.request);
  assert.equal(s.body.state, 'done', 'لا انتظار للأبد على منصّة الوسيط');
  routes['api.upload-post.com/api/uploadposts/status'] = { status: 200, body: { status: 'processing', results: [{ platform: 'youtube', status: 'processing' }] } };
  await st(r2.body.request);
  assert.equal(kv.get('socpub:seen:upreq-777777'), '1', 'رآه حيًّا: كالطريق القديم');
});

test('٦. إنستغرام MP4/MOV حتّى ٣٠٠ ميغا: WebM أو أكبر يُرفض قبل أيّ حاوية برمز واضح، وفيسبوك يمضي، والطريق القديم كما هو', async () => {
  process.env.FAL_KEY = 'fal-k';
  for (const [type, size, code] of [['video/webm', 10e6, 'e-type:mp4/mov'], ['video/mp4', 301 * 1048576, 'e-size:300MB']]) {
    fresh();
    routes = {
      'rest.fal.ai/storage/upload/initiate': { status: 200, body: { upload_url: 'https://up.example/x', file_url: 'https://v3.fal.media/files/om-z.' + (type === 'video/webm' ? 'webm' : 'mp4') } },
      [GV + '/P1/videos']: { status: 200, body: { id: 'FBw' } },
      [G + '/FBw']: { status: 200, body: { status: { video_status: 'processing' } } },
    };
    const t = await call('target', { type, size });
    assert.equal(t.status, 200);
    const r = await pub(t.body.id, ['instagram', 'facebook']);
    assert.equal(posts('/IG1/media'), 0, 'لا حاوية');
    assert.equal(posts('/P1/videos'), 1, 'فيسبوك يمضي');
    assert.equal(kv.has('socdir:sent:' + t.body.id + ':instagram'), false, 'إنستغرام غير محجوز');
    const s = await st(r.body.request);
    assert.deepEqual(rows(s), [['instagram', 'fail', code], ['facebook', 'wait', '']]);
  }
  // ملفّ رُفع قبل حفظ نوعه: الامتداد يكفي
  const id = fresh('https://v3.fal.media/files/old.webm');
  const r = await pub(id, ['instagram']);
  assert.deepEqual(rows(await st(r.body.request)), [['instagram', 'fail', 'e-type:mp4/mov']]);
  assert.equal(posts('/IG1/media'), 0);
  delete process.env.FAL_KEY;
  assert.ok(!con.join('\n').includes('EAAG-page'), 'لا توكن في السجلّ');
});
