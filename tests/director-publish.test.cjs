// tests/director-publish.test.cjs — v-director-publish (المالك ٧ نوفمبر: «اي فيديو الي اسويه اقدر ارسله الي اي مكان… ضيفها عندي في المخرج»،
// واختار «انشر في حساباتي»): زرّ تحت فيديو «مخرج التطبيق» ينشره في حسابات المالك الموصولة بخدمة النشر التي يستعملها بوت التسويق.
// الخادم (api/_lib/social-publish.js) بشبكة وRedis محاكيين — لا نشر حقيقيّ ولا رفع: المالك وحده، المنصّات الموصولة، هدف رفع لا يكشف
// رابط الملفّ، نشر واحد لكلّ فيديو ومنصّة، الحالة لكلّ منصّة، ولا مفتاح ولا رابط في ردّ أو سجلّ. ثمّ اللوحة نفسها في vm والنصوص بالـ١٤ لغة.
// v-director-publish-guard (مراجعة مستقلّة ٨ نوفمبر): المجموعة المتداخلة لا تنشر مرّتين، والمنصّة تتحرّر بإثبات أنّها لم تنشر وحده،
// و«في الطابور» ليس «نزل»، والطلب الضائع يُعلَن ويُعاد، والملفّ المنتهي يُرفع من جديد، وفيديو جديد يصفّر اللوحة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { clientSlice, flush } = require('./_owner-vm.cjs');

for (const k of ['OWNER_USERNAMES', 'OWNER_USERNAME', 'UPLOAD_POST_USER']) delete process.env[k];
process.env.AUTH_SECRET = 'director-publish-test-secret';
const UP_KEY = 'up-test-key-91c2e7';
const FAL = 'fal-test-key-4d5e:aa11';
process.env.UPLOAD_POST_API_KEY = UP_KEY;
process.env.FAL_KEY = FAL;
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const J = (x) => JSON.parse(JSON.stringify(x));

const con = [];
for (const m of ['log', 'warn', 'error']) console[m] = (...a) => { con.push(a.map(String).join(' ')); };

// ── Redis في الذاكرة ──
const kv = new Map(), ttl = new Map(), hook = {}; // hook.setnx(k): يرمي أو يغيّر شيئًا قبل الحجز (عطل أو سباق)
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetRaw: async (k) => (kv.has(k) ? kv.get(k) : null),
  kvSetRaw: async (k, v, t) => { kv.set(k, String(v)); ttl.set(k, t); },
  kvSetIfAbsent: async (k, v, t) => { if (hook.setnx) hook.setnx(k); if (kv.has(k)) return false; kv.set(k, String(v)); ttl.set(k, t); return true; },
  kvDel: async (k) => { kv.delete(k); ttl.delete(k); },
} };

// ── الشبكة: كلّ نداء يُسجَّل، والردّ من جدول (أطول مسار مطابق يفوز: /api/uploadposts/… يحوي /api/upload) ──
const calls = [];
let routes = {};
global.fetch = async (url, opts) => {
  const o = opts || {};
  calls.push({ url: String(url), method: o.method || 'GET', headers: o.headers || {}, body: o.body });
  const hit = Object.keys(routes).filter((p) => String(url).includes(p)).sort((a, b) => b.length - a.length)[0];
  if (!hit) throw new Error('unexpected fetch ' + url);
  const r = typeof routes[hit] === 'function' ? routes[hit](String(url), o) : routes[hit];
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
};
const uploadsOf = () => calls.filter((c) => /\/api\/upload$/.test(c.url));

const sp = require(rp('api/_lib/social-publish.js'));
const token = (u) => {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
async function call(op, body, method) {
  const out = { status: 0, body: null, headers: {} };
  const res = {
    setHeader: (k, v) => { out.headers[k] = v; },
    status(c) { out.status = c; return this; },
    json(b) { out.body = J(b); return this; },
    end() { return this; },
  };
  await sp({ method: method || 'POST', query: { action: 'social-publish', op }, headers: {}, body: body || {} }, res);
  return out;
}
const owner = () => token('omran');
const USERS = { status: 200, body: { success: true, profiles: [
  { username: 'someone-else', social_accounts: { instagram: { username: 'x' } } },
  { username: 'omranaibuilder', social_accounts: {
    instagram: { username: 'om.ai', display_name: 'om ai' }, twitter: { username: 'omai' }, tiktok: { username: 'o', reauth_required: true },
    facebook: '', youtube: null, threads: { handle: '@omai' }, linkedin: { username: 'l' },
  } },
] } };
const leaks = (o) => { const s = JSON.stringify(o); assert.doesNotMatch(s, /up-test-key|fal-test-key|v3\.fal\.media|upload-post/i, 'تسريب: ' + s); };
// وزن X مرجعًا (xLen في scripts/social-bot.mjs حرفيًّا) — لا نقيس الوحدة بمقياسها هي
const refXLen = (s) => { let n = 0; for (const ch of String(s)) { const c = ch.codePointAt(0); n += (c <= 0x10FF || (c >= 0x2000 && c <= 0x200D) || (c >= 0x2010 && c <= 0x201F) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2; } return n; };
const loneSurrogate = (s) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
const HEART = '❤️', FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}', CLAP = '\u{1F3AC}', SPARK = '✨';

test('١. المالك وحده: بلا جلسة ٤٠١، وحساب آخر ٤٠٣، وGET ٤٠٥ — ولا نداء شبكة', async () => {
  calls.length = 0;
  assert.equal((await call('accounts', {})).status, 401);
  assert.equal((await call('accounts', { token: token('ali') })).status, 403);
  assert.equal((await call('accounts', { token: owner() }, 'GET')).status, 405);
  assert.equal((await call('nope', { token: owner() })).body.error, 'bad_op');
  assert.equal(calls.length, 0);
  delete process.env.UPLOAD_POST_API_KEY;
  const r = await call('accounts', { token: owner() });
  assert.deepEqual([r.status, r.body.error], [503, 'no_key']);
  process.env.UPLOAD_POST_API_KEY = UP_KEY;
});

test('٢. المنصّات الموصولة من ملفّ البوت: twitter = X، ومن يحتاج إعادة ربط منفصل، والفارغ والمنصّة خارج القائمة لا تُعدّ', async () => {
  calls.length = 0; routes = { '/uploadposts/users': USERS };
  const r = await call('accounts', { token: owner() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, on: ['instagram', 'x', 'threads'], reauth: ['tiktok'] });
  assert.equal(calls[0].url, 'https://api.upload-post.com/api/uploadposts/users');
  assert.equal(calls[0].headers.Authorization, 'Apikey ' + UP_KEY);
  leaks(r.body);
  routes = { '/uploadposts/users': { status: 200, body: { profiles: [{ username: 'other', social_accounts: {} }] } } };
  assert.equal((await call('accounts', { token: owner() })).body.error, 'no_profile');
});

test('٣. هدف الرفع: النوع والحجم أوّلًا، ثمّ هدف ستّ ساعات؛ الرابط العامّ في KV لا في الردّ', async () => {
  calls.length = 0; kv.clear();
  routes = { '/storage/upload/initiate': { status: 200, body: { upload_url: 'https://up.example/put?sig=1', file_url: 'https://v3.fal.media/files/om-1.mp4' } } };
  assert.equal((await call('target', { token: owner(), type: 'image/png', size: 10 })).body.error, 'bad_type');
  const big = await call('target', { token: owner(), type: 'video/mp4', size: sp.MAX_BYTES + 1 });
  assert.deepEqual([big.status, big.body.error, big.body.maxMB], [413, 'too_big', 500]);
  assert.equal(calls.length, 0);
  const r = await call('target', { token: owner(), type: 'video/mp4; codecs=avc1', size: 42 * 1048576 });
  assert.equal(r.status, 200);
  assert.match(r.body.id, /^[0-9a-f]{24}$/);
  assert.equal(r.body.up, 'https://up.example/put?sig=1');
  assert.equal(r.body.ctype, 'video/mp4');
  assert.ok(!JSON.stringify(r.body).includes('v3.fal.media'), 'الرابط العامّ لا يعود للعميل');
  assert.equal(calls[0].headers.Authorization, 'Key ' + FAL);
  assert.equal(JSON.parse(calls[0].headers['X-Fal-Object-Lifecycle']).expiration_duration_seconds, 21600);
  assert.match(JSON.parse(calls[0].body).file_name, /^om-[0-9a-f]{16}\.mp4$/);
  assert.equal(kv.get('socpub:file:' + r.body.id), 'https://v3.fal.media/files/om-1.mp4');
  assert.equal(ttl.get('socpub:file:' + r.body.id), 21600);
  delete process.env.FAL_KEY;
  assert.equal((await call('target', { token: owner(), type: 'video/mp4', size: 9 })).body.error, 'no_storage');
  process.env.FAL_KEY = FAL;
});

test('٤. النشر: الملفّ المرفوع وحده، نصّ كلّ منصّة بحدّها (X بوزنه وThreads ببايتات الإيموجي)، صفحة فيسبوك om ai، وحجز لكلّ منصّة', async () => {
  calls.length = 0; kv.clear();
  const id = 'a'.repeat(24);
  kv.set('socpub:file:' + id, 'https://v3.fal.media/files/om-2.mp4');
  routes = {
    '/uploadposts/facebook/pages': { status: 200, body: { pages: [{ id: '111', name: 'Other page' }, { id: '222', name: 'om ai' }] } },
    '/uploadposts/status': { status: 200, body: { status: 'in_progress', results: [] } },
    '/api/upload': { status: 200, body: { success: true, request_id: 'srv-req-1', message: 'Upload initiated successfully in background.' } },
  };
  assert.equal((await call('publish', { token: owner(), id: 'b'.repeat(24), caption: 'x', platforms: ['instagram'] })).body.error, 'no_file');
  assert.equal((await call('publish', { token: owner(), id: '../x', caption: 'x', platforms: ['instagram'] })).body.error, 'bad_id');
  assert.equal((await call('publish', { token: owner(), id, caption: '  ', platforms: ['instagram'] })).body.error, 'no_caption');
  assert.equal((await call('publish', { token: owner(), id, caption: 'x', platforms: ['myspace'] })).body.error, 'no_platforms');
  assert.equal(uploadsOf().length, 0);
  const longCap = 'عنوان الفيديو ' + 'ط'.repeat(120) + '\n' + 'تفاصيل '.repeat(80) + '#omai';
  const plats = ['instagram', 'facebook', 'youtube', 'x', 'threads', 'tiktok', 'instagram', 'linkedin'];
  const r = await call('publish', { token: owner(), id, caption: longCap, platforms: plats });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.request, r.body.already], ['srv-req-1', []]);
  leaks(r.body);
  const up = uploadsOf()[0];
  assert.equal(up.headers.Authorization, 'Apikey ' + UP_KEY);
  const fd = up.body;
  assert.equal(fd.get('user'), 'omranaibuilder');
  assert.deepEqual(fd.getAll('platform[]'), ['instagram', 'facebook', 'youtube', 'x', 'threads', 'tiktok']);
  assert.equal(fd.get('video'), 'https://v3.fal.media/files/om-2.mp4');
  assert.equal(fd.get('async_upload'), 'true');
  assert.match(fd.get('request_id'), new RegExp('^omdir-' + id + '-[0-9a-f]{8}$'));
  assert.equal(up.headers['Idempotency-Key'], fd.get('request_id'));
  assert.equal(fd.get('media_type'), 'REELS');
  assert.equal(fd.get('facebook_page_id'), '222');
  assert.equal(fd.get('facebook_media_type'), 'VIDEO');
  assert.ok(fd.get('youtube_title').length <= 100 && fd.get('youtube_title').startsWith('عنوان الفيديو') && !fd.get('youtube_title').includes('\n'));
  assert.ok(refXLen(fd.get('x_title')) <= 280 && fd.get('x_title').endsWith('…'), 'X بوزنه، و«…» وزنها ٢');
  assert.ok(sp.threadsLen(fd.get('threads_title')) <= 500);
  assert.equal(fd.get('title'), longCap.trim());
  assert.equal(fd.get('privacy_level'), 'PUBLIC_TO_EVERYONE');
  assert.equal(fd.get('disable_inbox_fallback'), 'true', 'حدّ تيك توك = فشل معلَن لا مسوّدة');
  // حجز لكلّ منصّة يشير إلى معرّف الخدمة، ولكلّ طلب وقته
  for (const p of ['instagram', 'facebook', 'youtube', 'x', 'threads', 'tiktok']) {
    assert.equal(kv.get('socpub:sent:' + id + ':' + p), 'srv-req-1', p);
    assert.equal(ttl.get('socpub:sent:' + id + ':' + p), 7 * 86400);
  }
  assert.ok(JSON.parse(kv.get('socpub:req:srv-req-1')).at > 0);
  // الضغطة الثانية بالمنصّات نفسها (بترتيب آخر) = لا نشر ثانٍ، وتُسمّى المنصّات التي أخذته
  const order = ['tiktok', 'threads', 'x', 'youtube', 'facebook', 'instagram'];
  const again = await call('publish', { token: owner(), id, caption: longCap, platforms: order });
  assert.deepEqual([again.body.again, again.body.already, again.body.request, uploadsOf().length], [true, order, 'srv-req-1', 1]);
  // الأطوال: نصّ قصير العدّ ثقيل الوزن يُقصّ بوزن X، وThreads ببايتات الإيموجي، ولا قصّ يشقّ زوجًا بديلًا
  for (const [k, w] of [['أهلًا ' + SPARK, 8], ['✅…', 4], ['abc', 3]]) {
    assert.equal(sp.xLen(k), refXLen(k), k);
    assert.equal(refXLen(k), w, k);
  }
  const heavy = SPARK.repeat(200);
  assert.ok(heavy.length <= 280 && refXLen(sp.captions(heavy).x) <= 280 && sp.captions(heavy).x.endsWith('…'));
  for (const cap of [CLAP.repeat(130), HEART.repeat(100), (FAMILY + ' ').repeat(40) + 'نصّ', 'ب'.repeat(480) + ' ' + CLAP.repeat(5)]) {
    const t = sp.captions(cap).threads;
    assert.ok(sp.threadsLen(t) <= 500 && !loneSurrogate(t) && t.endsWith('…'), cap.slice(0, 6));
  }
  assert.deepEqual([sp.threadsLen(CLAP), sp.threadsLen(HEART), sp.threadsLen(SPARK + 'a'), sp.threadsLen('مرحبا')], [4, 6, 4, 5]);
  const yt = sp.captions(CLAP.repeat(60)).yt;
  assert.ok(yt.length <= 100 && !loneSurrogate(yt) && yt.endsWith('…'));
});

test('٥. رفض صريح يحرّر حجزه؛ خطأ اتّصال قبل الإرسال يحرّر ويقول «أعد»؛ والانقطاع بعد الإرسال لا يعيد إلّا إن قالت الخدمة بعد المهلة إنّه ما وصل', async () => {
  calls.length = 0; kv.clear();
  const id = 'c'.repeat(24);
  kv.set('socpub:file:' + id, 'https://v3.fal.media/files/om-3.mp4');
  routes = { '/api/upload': { status: 429, body: { error: 'Monthly limit exceeded' } } };
  const r = await call('publish', { token: owner(), id, caption: 'x', platforms: ['instagram'] });
  assert.deepEqual([r.status, r.body.error], [502, 'limit']);
  assert.ok(!kv.has('socpub:sent:' + id + ':instagram'), 'الرفض يحرّر الحجز');
  routes = { '/api/upload': { status: 200, body: { request_id: 'srv-req-2' } } };
  assert.equal((await call('publish', { token: owner(), id, caption: 'x', platforms: ['instagram'] })).body.request, 'srv-req-2');
  // اسم الخادم ما انحلّ: الطلب ما خرج أصلًا — يتحرّر ويقال «أعد»
  routes = { '/api/upload': () => { const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; } };
  const dns = await call('publish', { token: owner(), id, caption: 'x', platforms: ['youtube'] });
  assert.deepEqual([dns.status, dns.body.error, dns.body.detail], [503, 'retry', 'ENOTFOUND']);
  assert.ok(!kv.has('socpub:sent:' + id + ':youtube'));
  // انقطاع بعد الإرسال: «غير متأكّد»، والضغطة الثانية في المهلة لا ترسل
  let sends = 0;
  routes = {
    '/uploadposts/status': { status: 404, body: { request_id: 'x', status: 'not_found', message: 'No upload request found with this ID' } },
    '/api/upload': () => { sends++; throw new Error('socket hang up https://api.upload-post.com/api/upload'); },
  };
  const lost = await call('publish', { token: owner(), id, caption: 'x', platforms: ['x'] });
  assert.deepEqual([lost.status, lost.body.unsure, sends], [200, true, 1]);
  assert.match(lost.body.request, new RegExp('^omdir-' + id + '-[0-9a-f]{8}$'));
  const again = await call('publish', { token: owner(), id, caption: 'x', platforms: ['x'] });
  assert.deepEqual([again.body.again, again.body.already, again.body.request, sends], [true, ['x'], lost.body.request, 1], 'لا إرسال ثانٍ في المهلة');
  assert.deepEqual(again.body.held, { x: lost.body.request }, 'الطلب الذي يحجز كلّ منصّة يعود لتتابعه اللوحة');
  assert.deepEqual((await call('status', { token: owner(), request: lost.body.request })).body, { ok: true, state: 'wait', results: [] });
  // مضت المهلة والخدمة ما زالت لا تعرفه = ما وصل: الحالة تقولها، والضغطة التالية ترسل بطلب جديد
  const rk = 'socpub:req:' + lost.body.request, rec = JSON.parse(kv.get(rk));
  rec.at -= sp.GRACE_MS + 1000; kv.set(rk, JSON.stringify(rec));
  assert.deepEqual((await call('status', { token: owner(), request: lost.body.request })).body, { ok: true, state: 'fail', lost: true, results: [] });
  routes['/api/upload'] = () => { sends++; return { status: 200, body: { request_id: '' } }; };
  const re = await call('publish', { token: owner(), id, caption: 'x', platforms: ['x'] });
  assert.deepEqual([sends, re.body.already], [2, []]);
  assert.notEqual(re.body.request, lost.body.request);
  const last = uploadsOf().pop();
  assert.deepEqual([last.body.get('request_id'), last.headers['Idempotency-Key'], kv.get('socpub:sent:' + id + ':x')], [re.body.request, re.body.request, re.body.request]);
  assert.ok(kv.has('socpub:rel:' + lost.body.request + ':x'), 'التحرير مرّة واحدة للطلب والمنصّة');
  // ٥xx بعد الإرسال (مهلة البوّابة) و٤٠٨/٤٠٩ قد تكون أنشأت المهمّة — وثائق الخدمة: لا تُعِد بعد مهلة — فلا تحرير: «غير متأكّد»؛
  // و٤xx غيرها رفض صريح قبل البدء يحرّر
  for (const [code, kept] of [[504, true], [500, true], [502, true], [408, true], [409, true], [400, false], [413, false], [401, false]]) {
    kv.delete('socpub:sent:' + id + ':threads');
    routes['/api/upload'] = () => { sends++; return { status: code, body: { message: 'm' } }; };
    const g = await call('publish', { token: owner(), id, caption: 'x', platforms: ['threads'] });
    assert.equal(kv.has('socpub:sent:' + id + ':threads'), kept, code + ' الحجز');
    assert.deepEqual(kept ? [g.status, g.body.unsure] : [g.status, g.body.error], kept ? [200, true] : [502, 'publish'], String(code));
  }
  // وبعد ٥٠٤ الضغطة الثانية في المهلة لا ترسل (الطلب ربّما أُنشئ)
  routes['/api/upload'] = () => { sends++; return { status: 504, body: {} }; };
  kv.delete('socpub:sent:' + id + ':threads');
  await call('publish', { token: owner(), id, caption: 'x', platforms: ['threads'] });
  const n0 = sends;
  assert.equal((await call('publish', { token: owner(), id, caption: 'x', platforms: ['threads'] })).body.again, true);
  assert.equal(sends, n0, 'لا إعادة بعد مهلة البوّابة');
});

test('٦. الحالة لكلّ منصّة: «في الطابور» ينتظر لا «نزل»، والإعادة التلقائيّة تنتظر، ومسوّدة صندوق تيك توك «ما نزل»، و«لا طلب» ينتظر في المهلة ثمّ «ما وصل»', async () => {
  routes = { '/uploadposts/status': { status: 200, body: { status: 'in_progress', results: [
    { platform: 'instagram', success: true, post_url: 'https://www.instagram.com/reel/abc/' },
    { platform: 'x', success: false, error: 'Video longer than 140 seconds' },
    { platform: 'youtube', status: 'processing' },
    { platform: 'threads', success: true, message: 'Queued' },
    { platform: 'facebook', success: false, status: 'retryable' },
    { platform: 'tiktok', success: true, fallback_to_inbox: true, post_url: 'Video sent to Inbox (No Public URL)' },
  ] } } };
  const r = await call('status', { token: owner(), request: 'srv-req-1' });
  assert.deepEqual(r.body, { ok: true, state: 'wait', results: [
    { platform: 'instagram', state: 'ok', url: 'https://www.instagram.com/reel/abc/', error: '' },
    { platform: 'x', state: 'fail', url: '', error: 'Video longer than 140 seconds' },
    { platform: 'youtube', state: 'wait', url: '', error: '' },
    { platform: 'threads', state: 'wait', url: '', error: '' },
    { platform: 'facebook', state: 'wait', url: '', error: '' },
    { platform: 'tiktok', state: 'fail', url: '', error: 'inbox: Video sent to Inbox (No Public URL)' },
  ] });
  const done = sp.statusOf({ status: 'completed', results: { tiktok: { success: true, url: 'javascript:alert(1)' }, twitter: { success: true }, youtube: { success: true, skipped: true, skip_reason: 'profile_platform_not_configured' } } });
  assert.deepEqual(done, { state: 'done', results: [
    { platform: 'tiktok', state: 'ok', url: '', error: '' },
    { platform: 'x', state: 'ok', url: '', error: '' },
    { platform: 'youtube', state: 'fail', url: '', error: 'profile_platform_not_configured' },
  ] }, 'رابط غير https لا يُعرض، وtwitter = X، والمتخطّى ما نزل');
  assert.equal(sp.statusOf({ status: 'failed' }).state, 'fail');
  // طابور في مهمّة أعلنت فشلها: «ما نزل» (كما يحرّره deadRow) لا «ينتظر» للأبد؛ والمعالَج فيها يبقى ينتظر (قد يكون نشر)
  assert.deepEqual(sp.statusOf({ status: 'failed', results: [{ platform: 'x', success: true, message: 'Queued' }, { platform: 'threads', status: 'queued' }, { platform: 'youtube', status: 'processing' }] })
    .results.map((x) => x.platform + ':' + x.state), ['x:fail', 'threads:fail', 'youtube:wait']);
  // التحرير بإثبات أنّها لم تنشر وحده
  const D = (x, top) => sp.deadRow(x, top || 'in_progress');
  assert.deepEqual([D({ status: 'failed' }), D({ success: false, error: 'quota' }), D({ success: true, skipped: true }), D(undefined, 'failed')], [true, true, true, true]);
  assert.deepEqual([D({ success: true, message: 'Queued' }, 'failed'), D({ status: 'queued' }, 'failed')], [true, true], 'طابور في مهمّة أعلنت فشلها');
  assert.deepEqual([
    D({ success: false, status: 'retryable' }), D({ status: 'processing' }), D({ status: 'processing' }, 'failed'), D({ success: true, message: 'Queued' }),
    D({ success: true, fallback_to_inbox: true, post_url: 'Video sent to Inbox (No Public URL)' }), D({ status: 'failed', post_url: 'https://x.com/i/1' }),
    D({ success: true, message: 'Published' }), D(undefined, 'completed'), D(undefined, 'in_progress'),
  ], [false, false, false, false, false, false, false, false, false]);
  // ٤٠٤: بلا سجلّ أو في المهلة ينتظر، وبعدها «ما وصل»
  routes = { '/uploadposts/status': { status: 404, body: { status: 'not_found', message: 'No upload request found with this ID' } } };
  kv.delete('socpub:req:srv-req-9');
  const st9 = async () => (await call('status', { token: owner(), request: 'srv-req-9' })).body;
  assert.deepEqual(await st9(), { ok: true, state: 'wait', results: [] });
  kv.set('socpub:req:srv-req-9', JSON.stringify({ at: Date.now() }));
  assert.deepEqual(await st9(), { ok: true, state: 'wait', results: [] });
  kv.set('socpub:req:srv-req-9', JSON.stringify({ at: Date.now() - sp.GRACE_MS - 1000 }));
  assert.deepEqual(await st9(), { ok: true, state: 'fail', lost: true, results: [] });
  assert.ok(sp.GRACE_MS > 300000, 'المهلة أطول من عمر الدالّة');
  assert.equal((await call('status', { token: owner(), request: 'a b' })).body.error, 'bad_request');
  assert.ok(!con.join('\n').includes(UP_KEY) && !con.join('\n').includes(FAL), 'لا مفتاح في السجلّ');
});

test('٧. لا نشر مرّتين في منصّة: المجموعة المتداخلة ترسل الجديد وحده، والمنصّة تتحرّر بفشلها النهائيّ وحده، وإعادة الرفع تبقي حجوزات الفيديو', async () => {
  calls.length = 0; kv.clear();
  const F = 'd'.repeat(24), G = 'e'.repeat(24);
  kv.set('socpub:file:' + F, 'https://v3.fal.media/files/om-4.mp4');
  kv.set('socpub:file:' + G, 'https://v3.fal.media/files/om-5.mp4');
  const st = {}, sent = [];
  const statusRoute = (url) => { const q = new URL(url).searchParams.get('request_id'); return st[q] ? { status: 200, body: st[q] } : { status: 404, body: { status: 'not_found' } }; };
  routes = {
    '/uploadposts/status': statusRoute,
    '/api/upload': (url, o) => { sent.push(o.body.getAll('platform[]')); return { status: 200, body: { request_id: 'srv-req-' + sent.length } }; },
  };
  const pub = (platforms, extra) => call('publish', Object.assign({ token: owner(), id: F, caption: 'نصّ', platforms }, extra || {}));
  const a = await pub(['instagram']);
  assert.deepEqual([a.body.request, sent], ['srv-req-1', [['instagram']]]);
  st['srv-req-1'] = { status: 'completed', results: [{ platform: 'instagram', success: true, post_url: 'https://www.instagram.com/reel/1/' }] };
  // إنستغرام نزل + يوتيوب جديد: يوتيوب وحده يُرسل
  const b = await pub(['instagram', 'youtube']);
  assert.deepEqual([b.body.request, b.body.already, b.body.held, sent[1], sent.length], ['srv-req-2', ['instagram'], { instagram: 'srv-req-1' }, ['youtube'], 2]);
  assert.equal(uploadsOf().pop().body.get('youtube_title'), 'نصّ');
  // يوتيوب قيد المعالجة: لا إرسال ثانٍ
  st['srv-req-2'] = { status: 'in_progress', results: [{ platform: 'youtube', status: 'processing' }] };
  const c = await pub(['youtube']);
  assert.deepEqual([c.body.again, c.body.already, c.body.request, sent.length], [true, ['youtube'], 'srv-req-2', 2]);
  // فشل نهائيّ ليوتيوب: يُرسل من جديد بطلب جديد
  st['srv-req-2'] = { status: 'failed', results: [{ platform: 'youtube', success: false, status: 'failed', error: 'quota' }] };
  const d = await pub(['youtube']);
  assert.deepEqual([d.body.request, d.body.already, sent[2], sent.length], ['srv-req-3', [], ['youtube'], 3]);
  assert.ok(kv.has('socpub:rel:srv-req-2:youtube'));
  // مسوّدة صندوق تيك توك: موجودة وإن لم تكن علنيّة — لا تتحرّر
  assert.equal((await pub(['tiktok'])).body.request, 'srv-req-4');
  st['srv-req-4'] = { status: 'completed', results: [{ platform: 'tiktok', success: true, fallback_to_inbox: true, post_url: 'Video sent to Inbox (No Public URL)' }] };
  const e = await pub(['tiktok']);
  assert.deepEqual([e.body.again, e.body.already, sent.length], [true, ['tiktok'], 4]);
  // سؤال الحالة فشل (شبكة): يبقى محجوزًا
  routes['/uploadposts/status'] = () => { throw new Error('down'); };
  assert.deepEqual([(await pub(['youtube'])).body.again, sent.length], [true, 4]);
  routes['/uploadposts/status'] = statusRoute;
  // إعادة رفع الفيديو نفسه (ملفّ G باسم F): حجوزاته باقية، والجديد وحده يُرسل بالملفّ الجديد
  const g = await call('publish', { token: owner(), id: G, vid: F, caption: 'نصّ', platforms: ['instagram', 'x'] });
  assert.deepEqual([g.body.already, sent[4], sent.length], [['instagram'], ['x'], 5]);
  assert.equal(uploadsOf().pop().body.get('video'), 'https://v3.fal.media/files/om-5.mp4');
  assert.equal(kv.get('socpub:sent:' + F + ':x'), 'srv-req-5');
  // اسم غير صالح يُتجاهل: الملفّ نفسه هو الاسم
  const h = await call('publish', { token: owner(), id: G, vid: '../F', caption: 'نصّ', platforms: ['instagram'] });
  assert.deepEqual([h.body.already, sent.length], [[], 6]);
});

test('٨. الموجّه والواجهة: media يوزّع الإجراء، والزرّ للمالك تحت الفيديو، واللوحة تُصفَّر حيث يتغيّر الفيديو', () => {
  assert.match(read('api/media.js'), /case 'social-publish': return require\('\.\/_lib\/social-publish\.js'\);/);
  const src = read('api/_lib/social-publish.js');
  assert.doesNotMatch(src.split('module.exports = async')[0].replace(/const (upKey|upUser|falKey) = \(\) => [^\n]+/g, ''), /process\.env/, 'المفاتيح تُقرأ داخل المعالج');
  const v = read('js/video.js');
  assert.match(v, /id="vdPubBtn"/); assert.match(v, /id="vdPub" hidden/);
  assert.match(v, /'\/api\/media\?action=social-publish&op='\+op/);
  const go = v.slice(v.indexOf('async function pbGo(){'), v.indexOf('function pbPoll('));
  assert.ok(go.includes('!drOwner()'), 'المالك وحده');
  assert.equal((v.match(/DR\.out=URL\.createObjectURL\(/g) || []).length, 2);
  assert.equal((v.match(/DR\.out=URL\.createObjectURL\([^)]*\); pbNewVideo\(\);/g) || []).length, 2, 'كلّ فيديو جديد يصفّر اللوحة');
  assert.match(v, /pg\.disabled=PB\.busy\|\|PB\.loading\|\|!\(PB\.plats&&PB\.plats\.length\)/);
  const css = read('css/modules.css');
  for (const c of ['.vmk-dir-acts', '.vmk-pub{', '.vmk-pub-plats label', '.vmk-pub-plats label.is-sent', '.vmk-pub-go', '.vmk-pub-res li.is-ok']) assert.ok(css.includes(c), c);
});

// ── اللوحة نفسها في vm: عناصر محاكاة، والشبكة والرفع والموافقة مسجّلة ──
function mkEl(tag) {
  let text = '';
  const cls = new Set();
  const el = {
    tagName: tag, children: [], value: '', checked: false, disabled: false, type: '', hidden: false, className: '',
    classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    appendChild(c) { el.children.push(c); return c; },
    focus() {},
    querySelectorAll(sel) {
      const all = [];
      (function walk(n) { for (const c of n.children || []) { all.push(c); walk(c); } })(el);
      const inputs = all.filter((c) => c.tagName === 'input');
      if (sel === 'input:checked') return inputs.filter((c) => c.checked);
      if (sel === 'input[type=checkbox]') return inputs.filter((c) => c.type === 'checkbox');
      throw new Error('selector ' + sel);
    },
  };
  Object.defineProperty(el, 'textContent', { get: () => text + el.children.map((c) => c.textContent || '').join(''), set: (s) => { text = String(s); el.children = []; } });
  return el;
}
function panel() {
  const els = { vdPubCap: mkEl('textarea'), vdPubPlats: mkEl('div'), vdPubMsg: mkEl('p'), vdPubRes: mkEl('ul'), vdPub: mkEl('div') };
  const api = [], puts = [], timers = [], replies = {};
  const ctx = {
    id: (k) => els[k] || null, L: (k) => k, drT: (k, o) => k + (o ? ' ' + JSON.stringify(o) : ''),
    drTok: () => 'tok', drOwner: () => true, DR: { out: 'blob:v1' }, syncDirector() {}, __swallow() {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    document: { createElement: mkEl, createTextNode: (s) => ({ textContent: String(s) }) },
    fetch: async (url, o) => {
      const u = String(url);
      if (u.startsWith('blob:')) return { blob: async () => ({ size: 10, type: 'video/mp4' }) };
      const op = /[?&]op=(\w+)/.exec(u)[1], body = JSON.parse(o.body);
      api.push({ op, body });
      const r = replies[op], out = typeof r === 'function' ? r(body) : r;
      return { json: async () => J(await out) }; // ردّ قد يكون وعدًا معلَّقًا (خادم بطيء)
    },
    XMLHttpRequest: function () {
      const x = this; x.upload = {}; x.status = 0;
      x.open = (m, u) => { x.u = u; }; x.setRequestHeader = () => {};
      x.send = () => { puts.push(x.u); if (ctx.holdPut) return; x.status = 200; setImmediate(() => x.onload()); }; // holdPut: الرفع معلَّق
      x.abort = () => { ctx.aborts = (ctx.aborts || 0) + 1; setImmediate(() => x.onabort && x.onabort()); };
    },
    confirms: [], answer: true,
  };
  ctx.window = ctx; ctx.confirm = (q) => { ctx.confirms.push(q); return ctx.answer; };
  clientSlice('js/video.js', '  var PB={busy:false', '  function syncDirector(){', ctx);
  const boxes = () => els.vdPubPlats.children.filter((l) => l.tagName === 'label')
    .map((l) => ({ p: l.children[0].value, on: l.children[0].checked, off: l.children[0].disabled, text: l.textContent, box: l.children[0] }));
  return { ctx, els, api, puts, timers, replies, boxes };
}
const F24 = 'f'.repeat(24);

test('٩. اللوحة تعمل: إلغاء الموافقة لا يرفع ولا ينشر، والموافقة = هدف ثمّ رفع ثمّ نشر، والفيديو نفسه لا يُرفع مرّتين ولا يُرسل لمنصّة أخذته، و«no_file» يرفع مرّة في الضغطة نفسها', async () => {
  const { ctx, els, api, puts, timers, replies, boxes } = panel();
  ctx.PB.plats = ['instagram', 'x']; ctx.pbPlats();
  els.vdPubCap.value = 'نصّ المنشور';
  ctx.answer = false; await ctx.pbGo();
  assert.deepEqual([api.length, puts.length, ctx.confirms.length], [0, 0, 1], 'إلغاء = لا شيء');
  ctx.answer = true;
  replies.target = { ok: true, id: F24, up: 'https://up.example/put?sig=1', ctype: 'video/mp4' };
  replies.publish = { ok: true, request: 'r1', already: [] };
  await ctx.pbGo();
  assert.deepEqual([api.map((a) => a.op), puts], [['target', 'publish'], ['https://up.example/put?sig=1']]);
  assert.deepEqual(J(api[1].body), { token: 'tok', id: F24, vid: F24, caption: 'نصّ المنشور', platforms: ['instagram', 'x'] });
  assert.equal(els.vdPubMsg.textContent, 'vdPubSent');
  assert.deepEqual(boxes().map((b) => [b.p, b.on, b.off]), [['instagram', false, true], ['x', false, true]], 'أخذتا الفيديو: لا تُختاران');
  // ضغطة ثانية بلا منصّة متاحة = لا نداء
  api.length = 0; await ctx.pbGo();
  assert.deepEqual([api.length, els.vdPubMsg.textContent], [0, 'vdPubPick']);
  // الاستطلاع: إنستغرام نزل وX ما نزل ← X يُختار من جديد (غير مؤشَّر: الإعادة بقصد)
  replies.status = { ok: true, state: 'done', results: [{ platform: 'instagram', state: 'ok', url: '', error: '' }, { platform: 'x', state: 'fail', url: '', error: 'too long' }] };
  timers.pop()(); await flush();
  assert.deepEqual(boxes().map((b) => [b.p, b.on, b.off]), [['instagram', false, true], ['x', false, false]]);
  assert.ok(boxes()[0].text.includes('vdPubOk'));
  boxes()[1].box.checked = true;
  api.length = 0; replies.publish = { ok: true, request: 'r2', already: [] };
  await ctx.pbGo();
  assert.deepEqual([api.map((a) => a.op), api[0].body.id, api[0].body.platforms, puts.length], [['publish'], F24, ['x'], 1], 'الفيديو نفسه لا يُرفع مرّتين');
  // انتهى عمر الملفّ عند الخادم: رفع واحد في الضغطة نفسها، والاسم باقٍ
  ctx.PB.plats = ['instagram', 'x', 'threads']; ctx.pbPlats();
  assert.deepEqual(boxes().map((b) => [b.p, b.on, b.off]), [['instagram', false, true], ['x', false, true], ['threads', true, false]]);
  let k = 0;
  api.length = 0; replies.publish = () => (k++ ? { ok: true, request: 'r3', already: [] } : { ok: false, error: 'no_file' });
  replies.target = { ok: true, id: '9'.repeat(24), up: 'https://up.example/put?sig=2', ctype: 'video/mp4' };
  await ctx.pbGo();
  assert.deepEqual(api.map((a) => a.op), ['publish', 'target', 'publish']);
  assert.deepEqual([api[2].body.id, api[2].body.vid, api[2].body.platforms, puts.length], ['9'.repeat(24), F24, ['threads'], 2]);
  assert.equal(els.vdPubMsg.textContent, 'vdPubSent');
  // ملفّ قارب عمره (أكثر من ٥ ساعات): يُرفع قبل النشر بلا ذهاب وإياب
  ctx.PB.at = Date.now() - 6 * 3600 * 1000;
  ctx.PB.plats = ['instagram', 'x', 'threads', 'facebook']; ctx.pbPlats();
  api.length = 0; replies.publish = { ok: true, request: 'r4', already: [] };
  replies.target = { ok: true, id: '8'.repeat(24), up: 'https://up.example/put?sig=3', ctype: 'video/mp4' };
  await ctx.pbGo();
  assert.deepEqual([api.map((a) => a.op), api[1].body.vid, api[1].body.platforms], [['target', 'publish'], F24, ['facebook']]);
});

test('١٠. اللوحة تقول الصدق وتبدأ من الصفر: «انرسل قبل» و«ما تأكّدنا» و«ما وصل» بدل «انرسل»، وفيديو جديد يصفّرها، والقديم لا يُنشر تحته', async () => {
  const { ctx, els, api, puts, timers, replies, boxes } = panel();
  ctx.PB.plats = ['tiktok', 'youtube']; ctx.pbPlats();
  els.vdPubCap.value = 'نصّ';
  replies.target = { ok: true, id: F24, up: 'https://up.example/put?sig=1', ctype: 'video/mp4' };
  replies.publish = { ok: true, again: true, already: ['tiktok', 'youtube'], request: 'r0' };
  await ctx.pbGo();
  assert.equal(els.vdPubMsg.textContent, 'vdPubAgain {"p":"TikTok، YouTube"}', 'ما انرسل شي جديد');
  assert.deepEqual([Object.keys(ctx.PB.reqs), boxes().map((b) => b.off)], [['r0'], [true, true]]);
  // ما وصل الخدمة ← يُقال، وتعود المنصّتان للاختيار
  replies.status = { ok: true, state: 'fail', lost: true, results: [] };
  timers.pop()(); await flush();
  assert.equal(els.vdPubMsg.textContent, 'vdPubLost');
  assert.deepEqual(boxes().map((b) => b.off), [false, false]);
  boxes().forEach((b) => { b.box.checked = true; });
  replies.publish = { ok: true, unsure: true, request: 'r1', already: [] };
  await ctx.pbGo();
  assert.equal(els.vdPubMsg.textContent, 'vdPubUnsure');
  // جزء أخذه قبل وجزء جديد: «انرسل» ومعه من أخذه قبل
  ctx.PB.sent = {}; ctx.PB.plats = ['tiktok', 'youtube', 'x']; els.vdPubPlats.textContent = ''; ctx.pbPlats();
  replies.publish = { ok: true, request: 'r2', already: ['tiktok'] };
  await ctx.pbGo();
  assert.equal(els.vdPubMsg.textContent, 'vdPubSent · vdPubAgain {"p":"TikTok"}');
  // فيديو جديد: لوحة من الصفر (نصّ ونتيجة ومنصّات) واسم جديد
  ctx.DR.out = 'blob:v2'; ctx.pbNewVideo();
  assert.deepEqual([els.vdPubCap.value, els.vdPubMsg.textContent, els.vdPubRes.children.length, Object.keys(ctx.PB.reqs).length, J(ctx.PB.sent), J(ctx.PB.rows)], ['', '', 0, 0, {}, {}]);
  assert.deepEqual(boxes().map((b) => [b.on, b.off]), [[true, false], [true, false], [true, false]]);
  els.vdPubCap.value = 'نصّ ثانٍ'; api.length = 0;
  replies.target = { ok: true, id: 'b'.repeat(24), up: 'https://up.example/put?sig=9', ctype: 'video/mp4' };
  replies.publish = { ok: true, request: 'r3', already: [] };
  await ctx.pbGo();
  assert.deepEqual([api.map((a) => a.op), api[1].body.vid], [['target', 'publish'], 'b'.repeat(24)]);
  // فيديو آخر وصل أثناء الرفع: القديم لا يُنشر ولا تُرسم نتيجته
  ctx.DR.out = 'blob:v3'; ctx.pbNewVideo(); els.vdPubCap.value = 'نصّ ثالث'; api.length = 0;
  const n = puts.length;
  replies.target = () => { ctx.DR.out = 'blob:v4'; return { ok: true, id: 'c'.repeat(24), up: 'https://up.example/put?sig=c', ctype: 'video/mp4' }; };
  await ctx.pbGo();
  assert.deepEqual([api.map((a) => a.op), puts.length, ctx.PB.busy], [['target'], n, false]);
  assert.ok(!/vdPubFail/.test(els.vdPubMsg.textContent));
});

test('١١. الحسابات تُسأل عند كلّ فتح: الموصول حديثًا يظهر بلا إعادة تحميل، وما شاله المالك يبقى مشالًا، والقائمة تبقى إن فشل التحديث', async () => {
  const { ctx, els, api, replies, boxes } = panel();
  replies.accounts = { ok: true, on: ['instagram', 'x'], reauth: ['tiktok'] };
  ctx.pbLoad(); await flush();
  assert.deepEqual(boxes().map((b) => [b.p, b.on]), [['instagram', true], ['x', true]]);
  assert.ok(els.vdPubPlats.textContent.includes('vdPubReauth'));
  boxes()[1].box.checked = false;
  replies.accounts = { ok: true, on: ['instagram', 'x', 'tiktok'], reauth: [] };
  ctx.pbLoad(); ctx.pbLoad(); await flush();
  assert.equal(api.filter((a) => a.op === 'accounts').length, 2, 'كلّ فتح يسأل، وسؤال واحد في الطريق');
  assert.deepEqual(boxes().map((b) => [b.p, b.on]), [['instagram', true], ['x', false], ['tiktok', true]]);
  replies.accounts = { ok: false, error: 'accounts', status: 502 };
  ctx.pbLoad(); await flush();
  assert.deepEqual(boxes().map((b) => b.p), ['instagram', 'x', 'tiktok'], 'التحديث الفاشل لا يمسح القائمة');
  assert.match(els.vdPubMsg.textContent, /^vdPubFail/);
});

test('١٢. النصوص الخمسة والعشرون بالـ١٤ لغة بلا اسم مزوّد، والوسوم مرفوعة', () => {
  const KEYS = ['vdPubBtn', 'vdPubCap', 'vdPubPh', 'vdPubGo', 'vdPubLoading', 'vdPubNoAcc', 'vdPubReauth', 'vdPubNoKey', 'vdPubNeedCap', 'vdPubPick', 'vdPubConfirm',
    'vdPubUp', 'vdPubSent', 'vdPubOk', 'vdPubNo', 'vdPubWait', 'vdPubOpen', 'vdPubDone', 'vdPubSlow', 'vdPubFail', 'vdPubLimit', 'vdPubBig',
    'vdPubAgain', 'vdPubUnsure', 'vdPubLost'];
  const BANNED = /claude|anthropic|gemini|google|\bgpt|openai|runway|\bveo\b|kling|minimax|\bluma\b|\bsora\b/i;
  const base = { $: () => null, document: { getElementById: () => null, querySelector: () => null }, window: {}, localStorage: { getItem: () => null } }; base.window = base;
  vm.runInNewContext(read('js/app-03-i18n-data.js'), base);
  for (const lg of ['ar', 'en']) for (const k of KEYS) { const v = base.I18N[lg][k]; assert.ok(v && v.length > 1, lg + ' ' + k); assert.doesNotMatch(v, BANNED, lg + ' ' + k); }
  const seen = new Set(), seenNew = new Set();
  for (const lg of ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) {
    const m = read('i18n/' + lg + '.js').match(/v-director-publish[^\n]*Object\.assign\(I18N\["(\w+)"\], (\{.*\})\);/);
    assert.ok(m && m[1] === lg, lg + ' كتلة الترجمة');
    const o = JSON.parse(m[2]);
    for (const k of KEYS) {
      assert.ok(o[k] && o[k].trim().length > 1, lg + ' ' + k); assert.doesNotMatch(o[k], BANNED, lg + ' ' + k);
      assert.equal((o[k].match(/\{\w+\}/g) || []).sort().join(), (base.I18N.en[k].match(/\{\w+\}/g) || []).sort().join(), lg + ' ' + k + ' المتغيّرات');
    }
    seen.add(o.vdPubBtn); seenNew.add(o.vdPubAgain + o.vdPubUnsure + o.vdPubLost);
  }
  assert.equal(seen.size, 12, 'ترجمات لا نسخ');
  assert.equal(seenNew.size, 12, 'النصوص الثلاثة الجديدة مترجمة لا منسوخة');
  const v = read('js/video.js');
  /* المفاتيح = كلّ نصّ 'vdPub…' في الكود ما عدا معرّفات العناصر (id('…') و'#…') — L(r.state==='ok'?'vdPubOk':…) يُعدّ */
  const used = new Set([...v.matchAll(/(?<!id\()'(vdPub\w+)'/g)].map((m) => m[1]));
  for (const k of used) assert.ok(KEYS.includes(k), 'غير معرَّف: ' + k);
  for (const k of KEYS) assert.ok(used.has(k), 'غير مستعمل: ' + k);
  const tag = read('js/app-04-i18n-state.js').match(/\.js\?v=(\d+)';[^\n]* v-director-publish \((\d+)\): [^\n]*\*\//);
  assert.ok(tag && Number(tag[1]) >= Number(tag[2]) && Number(tag[2]) === 789, 'وسم اللغات مرفوع وسببه آخر التعليق');
  const h = read('index.html');
  assert.ok(Number((/\/js\/video\.js\?v=(\d+)"/.exec(h) || [])[1]) >= 465 && Number((/css\/modules\.css\?v=(\d+)"/.exec(h) || [])[1]) >= 695);
});

test('١٣. نشر ثانٍ لا يقطع متابعة الأوّل: كلّ منصّة تُحسم بآخر طلب أُرسلت فيه، وطلب أقدم لا يغلب الأحدث، ومن أخذه قبل يُتابَع طلبه', async () => {
  const { ctx, els, api, timers, replies, boxes } = panel();
  const rowsTxt = () => els.vdPubRes.children.map((li) => li.children[0].textContent + ':' + li.className.replace('is-', ''));
  ctx.PB.plats = ['instagram', 'youtube', 'x']; ctx.pbPlats();
  els.vdPubCap.value = 'نصّ';
  replies.target = { ok: true, id: F24, up: 'https://up.example/put?sig=1', ctype: 'video/mp4' };
  replies.publish = { ok: true, request: 'r1', already: [], held: {} };
  await ctx.pbGo();
  assert.deepEqual(rowsTxt(), ['Instagram:wait', 'YouTube:wait', 'X:wait']);
  const st = { r1: { ok: true, state: 'wait', results: [
    { platform: 'instagram', state: 'wait', url: '', error: '' }, { platform: 'youtube', state: 'wait', url: '', error: '' }, { platform: 'x', state: 'fail', url: '', error: 'too long' },
  ] } };
  replies.status = (b) => st[b.request];
  timers.pop()(); await flush();
  assert.deepEqual(boxes().map((b) => [b.p, b.off]), [['instagram', true], ['youtube', true], ['x', false]]);
  // إعادة X وحده ← r2، ومتابعة r1 مستمرّة
  boxes()[2].box.checked = true;
  replies.publish = { ok: true, request: 'r2', already: [], held: {} };
  await ctx.pbGo();
  assert.deepEqual(Object.keys(ctx.PB.reqs).sort(), ['r1', 'r2']);
  assert.deepEqual(rowsTxt(), ['Instagram:wait', 'YouTube:wait', 'X:wait'], 'X المعاد ينتظر، لا «ما نزل» محاولته الأولى');
  // r1 ما زال ينتظر ويقول عن X «ما نزل»، وr2 يقول X نزل: الأحدث يغلب، والطلبان يُسألان
  st.r2 = { ok: true, state: 'done', results: [{ platform: 'x', state: 'ok', url: 'https://x.com/i/1', error: '' }] };
  api.length = 0; timers.pop()(); await flush();
  assert.deepEqual(api.map((a) => a.body.request).sort(), ['r1', 'r2']);
  assert.deepEqual(rowsTxt(), ['Instagram:wait', 'YouTube:wait', 'X:ok']);
  // r1 يكتمل: إنستغرام نزل ويوتيوب فشل ← يعود للاختيار، وX باقٍ «نزل» معطّلًا؛ ولا متابعة بعدها
  st.r1 = { ok: true, state: 'done', results: [
    { platform: 'instagram', state: 'ok', url: 'https://i/1', error: '' }, { platform: 'youtube', state: 'fail', url: '', error: 'quota' }, { platform: 'x', state: 'fail', url: '', error: 'too long' },
  ] };
  const t0 = timers.length;
  timers.pop()(); await flush();
  assert.deepEqual(rowsTxt(), ['Instagram:ok', 'YouTube:fail', 'X:ok']);
  assert.deepEqual(boxes().map((b) => [b.p, b.off]), [['instagram', true], ['youtube', false], ['x', true]]);
  assert.deepEqual([Object.keys(ctx.PB.reqs).length, els.vdPubMsg.textContent, timers.length], [0, 'vdPubDone {"ok":2,"n":3}', t0 - 1]);
  // «انرسل قبل» ومعه الطلب الذي يحجز المنصّة: يُتابَع فيُعرف أنّه نزل
  boxes()[1].box.checked = true;
  replies.publish = { ok: true, again: true, already: ['youtube'], held: { youtube: 'r9' }, request: 'r9' };
  await ctx.pbGo();
  assert.deepEqual(Object.keys(ctx.PB.reqs), ['r9']);
  st.r9 = { ok: true, state: 'done', results: [{ platform: 'youtube', state: 'ok', url: 'https://y/1', error: '' }] };
  timers.pop()(); await flush();
  assert.deepEqual(rowsTxt(), ['Instagram:ok', 'YouTube:ok', 'X:ok']);
  // فيديو جديد أثناء سؤال الحالة: نتيجة القديم لا تُرسم تحته
  ctx.pbTrack('r11', ['instagram']);
  st.r11 = { ok: true, state: 'done', results: [{ platform: 'instagram', state: 'fail', url: '', error: 'late' }] };
  timers.pop()(); ctx.DR.out = 'blob:v2'; ctx.pbNewVideo(); await flush();
  assert.deepEqual([rowsTxt(), J(ctx.PB.sent), els.vdPubMsg.textContent], [[], {}, ''], 'لا «خلص النشر» تحت الفيديو الجديد');
});

test('١٤. لا تحرير بلا إثبات: ما قبلته الخدمة أو أرته حيًّا أو مضى عليه يوم لا يُعدّ «ما وصل»، ورمز التحرير قصير ولا يمسح حجزًا تغيّر، وخطأ قبل الإرسال يحرّر ما حُجز', async () => {
  calls.length = 0; kv.clear();
  const id = '7'.repeat(24);
  kv.set('socpub:file:' + id, 'https://v3.fal.media/files/om-7.mp4');
  let sends = 0;
  routes = {
    '/uploadposts/status': { status: 404, body: { status: 'not_found' } },
    '/api/upload': () => { sends++; return { status: 200, body: { request_id: '' } }; },
  };
  const age = (req, ms) => { const k = 'socpub:req:' + req, rec = JSON.parse(kv.get(k)); rec.at -= ms; kv.set(k, JSON.stringify(rec)); };
  const pub = (platforms) => call('publish', { token: owner(), id, caption: 'x', platforms });
  // ١) قبلته الخدمة (2xx) ثمّ نسيته: لا «ما وصل» ولا إعادة
  const a = await pub(['instagram']);
  assert.equal(JSON.parse(kv.get('socpub:req:' + a.body.request)).ok, 1);
  age(a.body.request, sp.GRACE_MS + 1000);
  assert.deepEqual((await call('status', { token: owner(), request: a.body.request })).body, { ok: true, state: 'wait', results: [] });
  assert.deepEqual([(await pub(['instagram'])).body.again, sends], [true, 1]);
  // ٢) غير متأكّد (٥٠٤) ثمّ أرته الخدمة حيًّا ثمّ نسيته: لا إعادة
  routes['/api/upload'] = () => { sends++; return { status: 504, body: {} }; };
  const b = await pub(['youtube']);
  assert.equal(b.body.unsure, true);
  routes['/uploadposts/status'] = { status: 200, body: { status: 'in_progress', results: [{ platform: 'youtube', status: 'processing' }] } };
  await call('status', { token: owner(), request: b.body.request });
  assert.equal(kv.get('socpub:seen:' + b.body.request), '1');
  routes['/uploadposts/status'] = { status: 404, body: { status: 'not_found' } };
  age(b.body.request, sp.GRACE_MS + 1000);
  let n = sends;
  assert.deepEqual([(await pub(['youtube'])).body.again, sends], [true, n]);
  // ٣) غير متأكّد وما أرته، لكن مضى يوم: غيابه لم يعد دليلًا
  const c = await pub(['x']);
  age(c.body.request, sp.LOST_MAX_MS + 1000);
  assert.equal((await call('status', { token: owner(), request: c.body.request })).body.state, 'wait');
  n = sends;
  assert.deepEqual([(await pub(['x'])).body.again, sends], [true, n]);
  // ٤) غير متأكّد وما وصل (بعد المهلة): رمز تحرير قائم لمحرِّر آخر في الدقيقة = لا حذف؛ بعد انتهائه يتحرّر ويُرسل
  const d = await pub(['threads']);
  age(d.body.request, sp.GRACE_MS + 1000);
  kv.set('socpub:rel:' + d.body.request + ':threads', 'other');
  n = sends;
  assert.deepEqual([(await pub(['threads'])).body.again, kv.get('socpub:sent:' + id + ':threads'), sends], [true, d.body.request, n], 'المحرِّر الآخر يحذف لا نحن');
  kv.delete('socpub:rel:' + d.body.request + ':threads');
  routes['/api/upload'] = () => { sends++; return { status: 200, body: { request_id: '' } }; };
  const e = await pub(['threads']);
  assert.deepEqual([e.body.again, sends], [undefined, n + 1]);
  assert.equal(ttl.get('socpub:rel:' + d.body.request + ':threads'), 60, 'الرمز دقيقة لا أسبوع');
  // ٥) الحجز تغيّر بين قراءته والتحرير (سباق): لا يُمسح حجز غيره
  routes['/api/upload'] = () => { sends++; return { status: 504, body: {} }; };
  const f = await pub(['facebook']);
  age(f.body.request, sp.GRACE_MS + 1000);
  hook.setnx = (k) => { if (k === 'socpub:rel:' + f.body.request + ':facebook') kv.set('socpub:sent:' + id + ':facebook', 'omdir-newer-claim'); };
  n = sends;
  const g = await pub(['facebook']);
  hook.setnx = null;
  assert.deepEqual([g.body.again, kv.get('socpub:sent:' + id + ':facebook'), sends], [true, 'omdir-newer-claim', n]);
  // ٦) خطأ في الحجز قبل الإرسال: ما حُجز يتحرّر، والمعالج «أعد»، ولا إرسال
  const E = 'e'.repeat(24);
  kv.set('socpub:file:' + E, 'https://v3.fal.media/files/om-8.mp4');
  hook.setnx = (k) => { if (k.endsWith(':tiktok')) throw new Error('kv down'); };
  n = sends;
  const h = await call('publish', { token: owner(), id: E, caption: 'x', platforms: ['instagram', 'tiktok'] });
  hook.setnx = null;
  assert.deepEqual([h.status, h.body.error, kv.has('socpub:sent:' + E + ':instagram'), sends], [503, 'retry', false, n]);
});

test('١٥. اللوحة: انقطاع نداء النشر يُعاد مرّة (آمن بالحجز)، والمتابعة إذا توقّفت لا تقفل المنصّة، ولا سؤالان متداخلان، وفيديو جديد يلغي رفع القديم', async () => {
  const { ctx, els, api, timers, replies, boxes } = panel();
  ctx.PB.plats = ['instagram', 'x']; ctx.pbPlats();
  els.vdPubCap.value = 'نصّ';
  replies.target = { ok: true, id: F24, up: 'https://up.example/put?sig=1', ctype: 'video/mp4' };
  // ٠) انقطع النداءان (ما نعرف هل وصل): «طوّل — شوف حساباتك» لا «ما قدر ينشر»، والمنصّتان تبقيان للاختيار (الحجز يحسم الضغطة التالية)
  replies.publish = { ok: false, error: 'retry' };
  await ctx.pbGo();
  assert.deepEqual([api.filter((a) => a.op === 'publish').length, els.vdPubMsg.textContent, boxes().map((b) => b.off)], [2, 'vdPubSlow (retry)', [false, false]]);
  assert.ok(els.vdPubMsg.classList.contains('err'));
  api.length = 0;
  // ١) أوّل نداء نشر انقطع (ردّ ليس JSON)، والإعادة تقول «انرسل قبل» ومعها الطلب: لا «ما قدر ينشر»
  let k = 0;
  replies.publish = () => (k++ ? { ok: true, again: true, already: ['instagram', 'x'], held: { instagram: 'r1', x: 'r1' }, request: 'r1' } : { ok: false, error: 'http', status: 504 });
  await ctx.pbGo();
  assert.deepEqual([api.filter((a) => a.op === 'publish').length, els.vdPubMsg.textContent, Object.keys(ctx.PB.reqs)], [2, 'vdPubAgain {"p":"Instagram، X"}', ['r1']]);
  // ٢) المتابعة تبلغ حدّها وما زال ينتظر: المنصّتان تعودان للاختيار، والرسالة «طوّل»
  replies.status = { ok: true, state: 'wait', results: [{ platform: 'instagram', state: 'wait', url: '', error: '' }, { platform: 'x', state: 'wait', url: '', error: '' }] };
  ctx.PB.reqs.r1.n = 119;
  timers.pop()(); await flush();
  assert.deepEqual([boxes().map((b) => b.off), els.vdPubMsg.textContent, Object.keys(ctx.PB.reqs).length], [[false, false], 'vdPubSlow', 0]);
  // ٣) سؤال حالة بطيء وما خلص: الدور التالي لا يسأل فوقه
  ctx.pbTrack('r2', ['x']);
  let release = null;
  replies.status = () => new Promise((r) => { release = () => r({ ok: true, state: 'done', results: [{ platform: 'x', state: 'ok', url: '', error: '' }] }); });
  timers.pop()(); await flush();
  const asked = api.filter((a) => a.op === 'status').length;
  timers.pop()(); await flush();
  assert.equal(api.filter((a) => a.op === 'status').length, asked, 'لا سؤال فوق سؤال');
  release(); await flush();
  assert.equal(ctx.PB.ticking, false);
  // ٣ب) طلب حُسم (فشلت المهمّة) وصفّ منصّته ما زال «ينتظر» (قيد المعالجة): تعود للاختيار بدل قفل أبديّ
  ctx.pbTrack('r3', ['instagram']);
  replies.status = { ok: true, state: 'fail', results: [{ platform: 'instagram', state: 'wait', url: '', error: '' }] };
  ctx.PB.sent.instagram = 'wait'; ctx.pbPlats();
  timers.pop()(); await flush();
  assert.deepEqual([boxes()[0].off, Object.keys(ctx.PB.reqs).length], [false, 0]);
  // ٤) فيديو جديد أثناء رفع القديم: الرفع يُلغى، و«انشر الآن» يعود، ولا نشر ولا رسالة فشل
  ctx.PB.sent = {}; els.vdPubPlats.textContent = ''; ctx.pbPlats();
  ctx.holdPut = true; ctx.DR.out = 'blob:v7'; api.length = 0;
  replies.target = { ok: true, id: '6'.repeat(24), up: 'https://up.example/put?sig=7', ctype: 'video/mp4' };
  const go = ctx.pbGo(); await flush();
  assert.equal(ctx.PB.busy, true);
  ctx.DR.out = 'blob:v8'; ctx.pbNewVideo();
  await Promise.race([go, new Promise((r, j) => setTimeout(() => j(new Error('رفع القديم ما انلغى: «انشر الآن» مقفل')), 3000))]);
  assert.deepEqual([ctx.PB.busy, ctx.aborts, api.map((a) => a.op)], [false, 1, ['target']]);
  assert.ok(!/vdPubFail/.test(els.vdPubMsg.textContent));
});
