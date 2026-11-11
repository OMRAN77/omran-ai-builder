// tests/director-publish.test.cjs — v-director-publish (المالك ٧ نوفمبر: «اي فيديو الي اسويه اقدر ارسله الي اي مكان… ضيفها عندي في المخرج»،
// واختار «انشر في حساباتي»): زرّ تحت فيديو «مخرج التطبيق» ينشره في حسابات المالك الموصولة بخدمة النشر التي يستعملها بوت التسويق.
// الخادم (api/_lib/social-publish.js) بشبكة وRedis محاكيين — لا نشر حقيقيّ ولا رفع: المالك وحده، المنصّات الموصولة، هدف رفع لا يكشف
// رابط الملفّ، نشر واحد لكلّ فيديو ومنصّة، الحالة لكلّ منصّة، ولا مفتاح ولا رابط في ردّ أو سجلّ. ثمّ اللوحة نفسها في vm والنصوص بالـ١٤ لغة.
// v-director-publish-guard (مراجعة مستقلّة ٨ نوفمبر): المجموعة المتداخلة لا تنشر مرّتين، والمنصّة تتحرّر بإثبات أنّها لم تنشر وحده،
// و«في الطابور» ليس «نزل»، والطلب الضائع يُعلَن ويُعاد، والملفّ المنتهي يُرفع من جديد، وفيديو جديد يصفّر اللوحة.
// v-director-endcard (١٩–٢٣): «أضف باركود التطبيق في آخر الفيديو» — المحلّل والخطّة وأوامر الأداة على سجلّات النواة الحقيقيّة، والخيار في اللوحة.
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
  assert.equal((v.match(/DR\.out=URL\.createObjectURL\(/g) || []).length, 3); /* v-director-upload: الثالث فيديو مرفوع من الجهاز */
  assert.equal((v.match(/DR\.out=URL\.createObjectURL\([^)]*\); pbNewVideo\(\);/g) || []).length, 3, 'كلّ فيديو جديد يصفّر اللوحة');
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
    focus() {}, attrs: {}, setAttribute(k, v2) { el.attrs[k] = String(v2); }, getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
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
  const els = { vdPubCap: mkEl('textarea'), vdPubPlats: mkEl('div'), vdPubMsg: mkEl('p'), vdPubRes: mkEl('ul'), vdPub: mkEl('div'),
    vdRes: mkEl('div'), vdVideo: mkEl('video'), vdDl: mkEl('a'), vdUpMsg: mkEl('p') }; /* v-director-upload */
  const api = [], puts = [], timers = [], replies = {}, sent = [], blobFetches = [], urls = { made: [], revoked: [] };
  const ctx = {
    id: (k) => els[k] || null, L: (k) => k, drT: (k, o) => k + (o ? ' ' + JSON.stringify(o) : ''),
    drTok: () => 'tok', drOwner: () => true, DR: { out: 'blob:v1' }, syncDirector() {}, __swallow() {}, drMsg() {},
    URL: { createObjectURL: (f) => { const u = 'blob:up' + (urls.made.length + 1); urls.made.push({ u, f }); return u; }, revokeObjectURL: (u) => { urls.revoked.push(u); } },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    document: { createElement: mkEl, createTextNode: (s) => ({ textContent: String(s) }) },
    fetch: async (url, o) => {
      const u = String(url);
      if (u.startsWith('blob:')) { blobFetches.push(u); return { blob: async () => ({ size: 10, type: ctx.blobType || 'video/mp4' }) }; }
      const op = /[?&]op=(\w+)/.exec(u)[1], body = JSON.parse(o.body);
      api.push({ op, body });
      const r = replies[op], out = typeof r === 'function' ? r(body) : r;
      return { json: async () => J(await out) }; // ردّ قد يكون وعدًا معلَّقًا (خادم بطيء)
    },
    XMLHttpRequest: function () {
      const x = this; x.upload = {}; x.status = 0;
      x.open = (m, u) => { x.u = u; }; x.setRequestHeader = (k, v2) => { x.ct = v2; };
      x.send = (b) => { puts.push(x.u); sent.push({ body: b, ctype: x.ct }); if (ctx.holdPut) return; x.status = 200; setImmediate(() => x.onload()); }; // holdPut: الرفع معلَّق
      x.abort = () => { ctx.aborts = (ctx.aborts || 0) + 1; setImmediate(() => x.onabort && x.onabort()); };
    },
    confirms: [], answer: true,
    ls: { aiapp_vd_endcard: '0' }, /* v-director-endcard: الخيار مطفأ هنا — اختباراته (١٩–٢٣) تشغّله بنفسها */
    localStorage: { getItem: (k) => (k in ctx.ls ? ctx.ls[k] : null), setItem: (k, v2) => { ctx.ls[k] = String(v2); } },
  };
  ctx.window = ctx; ctx.confirm = (q) => { ctx.confirms.push(q); return ctx.answer; };
  clientSlice('js/video.js', '  var PB={busy:false', '  function syncDirector(){', ctx);
  const boxes = () => els.vdPubPlats.children.filter((l) => l.tagName === 'label')
    .map((l) => ({ p: l.children[0].value, on: l.children[0].checked, off: l.children[0].disabled, text: l.textContent, box: l.children[0] }));
  return { ctx, els, api, puts, timers, replies, boxes, sent, blobFetches, urls };
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

// ── v-director-upload (المالك ١٠ نوفمبر: «الي اريده في المخرج مثال مكان تحميل الفيديو واسوي نشر على التواصل الاجتماعي»، واختار «أرفع فيديو جاهز
//    وأنشره»): صندوق في المخرج يأخذ فيديو جاهزًا من الجهاز فتنشره اللوحة نفسها ──
const vfile = (name, type, size) => ({ name, type, size: size == null ? 1234 : size });
test('١٦. رفع فيديو جاهز: النوع والحجم قبل أيّ شيء، والمرفوع يأخذ مكان فيديو المخرج واللوحة تُفتح من الصفر، وفيديو المخرج المعروض لا يُستبدل بلا سؤال، والصندوق لا يعمل أثناء التوليد ورفع النشر', async () => {
  const { ctx, els, api, urls, replies, boxes } = panel();
  for (const [type, name, want] of [['video/mp4', 'a.mp4', 'video/mp4'], ['video/quicktime', 'IMG_1.MOV', 'video/quicktime'], ['video/webm', 'a.webm', 'video/webm'],
    ['video/mp4; codecs=avc1', 'a.mp4', 'video/mp4'], ['video/x-m4v', 'a.m4v', 'video/mp4'], ['', 'clip.MOV', 'video/quicktime'], ['', 'ep.mp4', 'video/mp4'], ['application/octet-stream', 'x.webm', 'video/webm'],
    ['video/x-matroska', 'a.mkv', ''], ['', 'a.mkv', ''], ['image/png', 'a.png', ''], ['', 'noext', ''], ['text/plain', 'a.mp4', ''], ['video/3gpp', 'a.3gp', '']])
    assert.equal(ctx.upType(vfile(name, type)), want, type + ' ' + name);
  ctx.DR.out = ''; // لا فيديو بعد
  ctx.upPick(vfile('a.mkv', 'video/x-matroska'));
  assert.deepEqual([els.vdUpMsg.textContent, els.vdUpMsg.className, urls.made.length, ctx.DR.out], ['vdUpBadType', 'vmk-dir-msg err', 0, ''], 'نوع مرفوض: رسالة ولا شيء');
  ctx.upPick(vfile('empty.mp4', 'video/mp4', 0));
  assert.deepEqual([els.vdUpMsg.textContent, urls.made.length], ['vdUpBadType', 0], 'ملفّ فارغ');
  ctx.upPick(vfile('big.mp4', 'video/mp4', 500 * 1048576 + 1));
  assert.deepEqual([els.vdUpMsg.textContent, urls.made.length], ['vdPubBig {"n":500}', 0], 'فوق حدّ الخادم: يُقال قبل أيّ رفع');
  assert.equal(api.length, 0, 'ولا نداء');
  // فيديو صالح ولا شيء معروض: بلا سؤال — مكان الفيديو، واللوحة مفتوحة من الصفر وتسأل عن الحسابات
  els.vdPub.hidden = true; els.vdPubCap.value = 'نصّ قديم'; replies.accounts = { ok: true, on: ['instagram', 'x'], reauth: [] };
  const f1 = vfile('الحلقة 2: يوسف.mp4', 'video/mp4', 500 * 1048576);
  ctx.upPick(f1); await flush();
  assert.equal(ctx.confirms.length, 0);
  assert.deepEqual([ctx.DR.out, ctx.DR.fileUrl, ctx.DR.file === f1, ctx.DR.fileType], ['blob:up1', 'blob:up1', true, 'video/mp4']);
  assert.deepEqual([els.vdVideo.src, els.vdDl.href, els.vdDl.attrs.download, els.vdRes.classList.contains('has')], ['blob:up1', 'blob:up1', 'الحلقة 2_ يوسف.mp4', true]);
  assert.deepEqual([els.vdUpMsg.textContent, els.vdPubCap.value, els.vdPub.hidden, api.map((a) => a.op)], ['', '', false, ['accounts']], 'اللوحة من الصفر ومفتوحة');
  assert.deepEqual(boxes().map((b) => [b.p, b.on]), [['instagram', true], ['x', true]]);
  assert.equal(ctx.upMine(), true);
  // مرفوع فوق مرفوع: بلا سؤال (الملفّ على جهازه)، والرابط القديم يُحرَّر
  const f2 = vfile('clip.mov', '', 99);
  ctx.upPick(f2);
  assert.deepEqual([ctx.confirms.length, ctx.DR.out, ctx.DR.fileType, urls.revoked], [0, 'blob:up2', 'video/quicktime', ['blob:up1']]);
  // فيديو صنعه المخرج ومعروض: سؤال — الإلغاء يبقيه، والموافقة تستبدله
  ctx.DR.out = 'blob:gen'; ctx.pbNewVideo();
  assert.equal(ctx.upMine(), false, 'فيديو المخرج ليس «ملفّي»');
  ctx.answer = false; ctx.upPick(vfile('b.mp4', 'video/mp4'));
  assert.deepEqual([ctx.confirms, ctx.DR.out, urls.made.length], [['vdUpReplace'], 'blob:gen', 2], 'الإلغاء يبقي فيديو المخرج');
  ctx.answer = true; ctx.upPick(vfile('b.mp4', 'video/mp4'));
  assert.deepEqual([ctx.confirms.length, ctx.DR.out, urls.revoked.slice(-1)[0]], [2, 'blob:up3', 'blob:gen']);
  // فيديو المخرج أخفاه توليد لاحق (لا «has»): لا سؤال عن شيء لا يُرى
  ctx.DR.out = 'blob:gen2'; ctx.pbNewVideo(); els.vdRes.classList.remove('has');
  ctx.upPick(vfile('c.mp4', 'video/mp4'));
  assert.deepEqual([ctx.confirms.length, ctx.DR.out], [2, 'blob:up4']);
  // أثناء التوليد، وأثناء رفع النشر، ولغير المالك: لا شيء
  const n = urls.made.length;
  ctx.DR.busy = true; ctx.upPick(vfile('d.mp4', 'video/mp4')); ctx.DR.busy = false;
  ctx.PB.busy = true; ctx.upPick(vfile('d.mp4', 'video/mp4')); ctx.PB.busy = false;
  ctx.drOwner = () => false; ctx.upPick(vfile('d.mp4', 'video/mp4'));
  assert.deepEqual([urls.made.length, ctx.DR.out], [n, 'blob:up4']);
});

test('١٧. النشر يرفع ملفّ الجهاز نفسه بنوعه (لا نسخة تُقرأ من رابطه)، وفيديو المخرج كما كان يُقرأ من رابطه', async () => {
  const { ctx, els, api, puts, replies, sent, blobFetches } = panel();
  ctx.DR.out = ''; els.vdPub.hidden = true; /* كما تُبنى: اللوحة مطويّة حتّى يُرفع فيديو */ replies.accounts = { ok: true, on: ['tiktok', 'youtube'], reauth: [] };
  const f = vfile('clip.MOV', '', 4321);
  ctx.upPick(f); await flush();
  els.vdPubCap.value = 'قصص الأنبياء';
  replies.target = { ok: true, id: F24, up: 'https://up.example/put?sig=u', ctype: 'video/quicktime' };
  replies.publish = { ok: true, request: 'ru', already: [] };
  await ctx.pbGo();
  assert.deepEqual(api.map((a) => a.op), ['accounts', 'target', 'publish']);
  assert.deepEqual(J(api[1].body), { token: 'tok', size: 4321, type: 'video/quicktime' }, 'الحجم والنوع من الملفّ (النوع من امتداده حين يسكت المتصفّح)');
  assert.deepEqual([blobFetches.length, sent.length, sent[0].body === f, sent[0].ctype, puts], [0, 1, true, 'video/quicktime', ['https://up.example/put?sig=u']], 'الملفّ نفسه يُرسل');
  assert.deepEqual([api[2].body.caption, api[2].body.platforms, api[2].body.id], ['قصص الأنبياء', ['tiktok', 'youtube'], F24]);
  // فيديو المخرج بعده: الملفّ السابق لا يُرفع مكانه — يُقرأ من رابطه ونوعه من محتواه
  ctx.DR.out = 'blob:gen'; ctx.pbNewVideo(); ctx.blobType = 'video/webm';
  els.vdPubCap.value = 'فيديو المخرج'; api.length = 0;
  replies.target = { ok: true, id: 'a'.repeat(24), up: 'https://up.example/put?sig=g', ctype: 'video/webm' };
  await ctx.pbGo();
  assert.deepEqual([blobFetches, J(api[0].body), sent.length, sent[1].body === f, sent[1].ctype], [['blob:gen'], { token: 'tok', size: 10, type: 'video/webm' }, 2, false, 'video/webm']);
});

test('١٨. الصندوق في المخرج قبل مكان الفيديو، مربوط بالاختيار والإفلات، ومعطّل أثناء التوليد والنشر؛ والنصوص الأربعة بالـ١٤ لغة بلا اسم مزوّد، والوسوم مرفوعة', () => {
  const v = read('js/video.js');
  const html = v.slice(v.indexOf("box.innerHTML='<div class=\"vmk-dir-head\">"), v.indexOf('var tabs=id(\'vmkTabs\'); if(tabs&&tabs.parentNode===card)'));
  const iMsg = html.indexOf('id="vdMsg"'), iUp = html.indexOf('<label class="vmk-cl-drop vmk-dir-up" id="vdUp"><input type="file" accept="video/*" id="vdUpFile">'), iRes = html.indexOf('id="vdRes"');
  assert.ok(iMsg > 0 && iUp > iMsg && iRes > iUp, 'الصندوق بين رسالة المخرج ومكان الفيديو');
  assert.ok(html.includes('<p class="vmk-dir-msg" id="vdUpMsg"></p>'));
  assert.ok(v.includes("upBind(box.querySelector('#vdUp'),box.querySelector('#vdUpFile'));"), 'مربوط عند بناء المخرج');
  const bind = v.slice(v.indexOf('function upBind('), v.indexOf('function syncDirector(){'));
  assert.ok(bind.includes("e.target.value=''; if(f) upPick(f);"), 'الحقل يُصفَّر: الملفّ نفسه يُختار ثانية');
  assert.match(bind, /zone\.addEventListener\('drop',function\(e\)\{ e\.preventDefault\(\);/, 'الإفلات للصندوق لا لمرفقات الدردشة');
  const sync = v.slice(v.indexOf('function syncDirector(){'), v.indexOf('var ST={t0:0'));
  assert.ok(sync.includes("uf.disabled=DR.busy||PB.busy; uz.classList.toggle('off',uf.disabled);"), 'معطّل أثناء التوليد ورفع النشر');
  assert.ok(sync.includes("uz.querySelector('.vmk-cl-pick').textContent=um?String(DR.file.name||''):L('vdUpBtn');") && sync.includes("drT('vdUpHint',{n:UP_MAX_MB})"));
  assert.match(v, /var UP_MAX_MB=500, UP_TYPES=\{'video\/mp4':1,'video\/webm':1,'video\/quicktime':1\};/);
  const srv = read('api/_lib/social-publish.js');
  assert.match(srv, /const TYPES = \{ 'video\/mp4': 'mp4', 'video\/webm': 'webm', 'video\/quicktime': 'mov' \};/, 'أنواع العميل = أنواع الخادم');
  assert.match(srv, /const MAX_BYTES = 500 \* 1024 \* 1024;/, 'حدّ العميل = حدّ الخادم');
  const css = read('css/modules.css');
  assert.ok(css.includes('#videoMakerModal .vmk-dir-up{min-height:108px;padding:16px;flex-shrink:0}') && css.includes('#videoMakerModal .vmk-dir-up.off{opacity:.5'));
  // النصوص
  const KEYS = ['vdUpBtn', 'vdUpHint', 'vdUpBadType', 'vdUpReplace'];
  const BANNED = /claude|anthropic|gemini|google|\bgpt|openai|runway|\bveo\b|kling|minimax|\bluma\b|\bsora\b|upload-?post|\bfal\b/i;
  const base = { $: () => null, document: { getElementById: () => null, querySelector: () => null }, window: {}, localStorage: { getItem: () => null } }; base.window = base;
  vm.runInNewContext(read('js/app-03-i18n-data.js'), base);
  for (const lg of ['ar', 'en']) for (const k of KEYS) { const t = base.I18N[lg][k]; assert.ok(t && t.length > 3, lg + ' ' + k); assert.doesNotMatch(t, BANNED, lg + ' ' + k); }
  assert.match(base.I18N.ar.vdUpBtn, /ارفع فيديو جاهز/);
  const seen = new Set(), seenQ = new Set();
  for (const lg of ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) {
    const m = read('i18n/' + lg + '.js').match(/v-director-upload \(795\)[^\n]*Object\.assign\(I18N\["(\w+)"\], (\{.*\})\);/);
    assert.ok(m && m[1] === lg, lg + ' كتلة الترجمة');
    const o = JSON.parse(m[2]);
    assert.deepEqual(Object.keys(o), KEYS, lg + ' المفاتيح');
    for (const k of KEYS) {
      assert.ok(o[k] && o[k].trim().length > 3, lg + ' ' + k); assert.doesNotMatch(o[k], BANNED, lg + ' ' + k);
      assert.equal((o[k].match(/\{\w+\}/g) || []).sort().join(), (base.I18N.en[k].match(/\{\w+\}/g) || []).sort().join(), lg + ' ' + k + ' المتغيّرات');
      assert.notEqual(o[k], base.I18N.en[k], lg + ' ' + k + ' مترجم لا منسوخ');
    }
    assert.match(o.vdUpHint, /mp4.*mov.*webm/, lg + ' الصيغ الثلاث');
    seen.add(o.vdUpBtn); seenQ.add(o.vdUpReplace);
  }
  assert.deepEqual([seen.size, seenQ.size], [12, 12], 'ترجمات لا نسخ');
  const used = new Set([...v.matchAll(/(?:L|drT)\('(vdUp\w+)'/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), [...KEYS].sort(), 'كلّ نصّ مستعمل معرَّف، وكلّ معرَّف مستعمل');
  const tag = read('js/app-04-i18n-state.js').match(/\.js\?v=(\d+)';[^\n]* v-director-upload \((\d+)\): [^\n]*\*\//);
  assert.ok(tag && Number(tag[1]) >= Number(tag[2]) && Number(tag[2]) === 795, 'وسم اللغات مرفوع وسببه في التعليق');
  const h = read('index.html');
  assert.ok(Number((/\/js\/video\.js\?v=(\d+)"/.exec(h) || [])[1]) >= 467 && Number((/css\/modules\.css\?v=(\d+)"/.exec(h) || [])[1]) >= 698, 'وسما video.js وmodules.css مرفوعان');
});


// ═══ v-director-endcard: «أضف باركود التطبيق في آخر الفيديو» — السجلّات أدناه من نواة الأداة المنشورة نفسها (ffmpeg.wasm 5.1) على ملفّات
// حقيقيّة: فيديو المالك من جوّاله (الصوت أوّلًا، مدى كامل، معدّل متغيّر)، وفيديو من مولّد آخر، ودوران الجوّال بالاتّجاهين، وHEVC وWebM… ═══
const EC_LOGS = {
 "phone": "  Duration: 00:02:14.41, start: 0.000000, bitrate: 2191 kb/s\n  Stream #0:0[0x1](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 112 kb/s (default)\n  Stream #0:1[0x2](und): Video: h264 (High) (avc1 / 0x31637661), yuvj420p(pc, bt709/bt709/iec61966-2-1, progressive), 720x1280, 2075 kb/s, SAR 1:1 DAR 9:16, 30.02 fps, 30k tbr, 30k tbn (default)",
 "google": "  Duration: 00:00:08.00, start: 0.000000, bitrate: 2427 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720, 2155 kb/s, 24 fps, 24 tbr, 12288 tbn (default)\n  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 256 kb/s (default)",
 "rot90": "  Duration: 00:00:08.00, start: 0.000000, bitrate: 3174 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 3036 kb/s, 30 fps, 30 tbr, 15360 tbn (default)\n    Side data:\n      displaymatrix: rotation of 90.00 degrees\n  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)",
 "rotm90": "  Duration: 00:00:08.00, start: 0.000000, bitrate: 3174 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 3036 kb/s, 30 fps, 30 tbr, 15360 tbn (default)\n    Side data:\n      displaymatrix: rotation of -90.00 degrees\n  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)",
 "hevc": "  Duration: 00:00:06.00, start: 0.000000, bitrate: 4050 kb/s\n  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, progressive), 1080x1920 [SAR 1:1 DAR 9:16], 3907 kb/s, 30 fps, 30 tbr, 15360 tbn (default)\n  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 127 kb/s (default)",
 "vp9": "  Duration: 00:00:06.01, start: -0.007000, bitrate: 1078 kb/s\n  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv, progressive), 720x1280, SAR 1:1 DAR 9:16, 30 fps, 30 tbr, 1k tbn\n  Stream #0:1: Audio: opus, 48000 Hz, mono, fltp",
 "noaudio": "  Duration: 00:00:07.00, start: 0.000000, bitrate: 6715 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1080x1920 [SAR 1:1 DAR 9:16], 6712 kb/s, 30 fps, 30 tbr, 15360 tbn (default)",
 "baseline": "  Duration: 00:00:07.00, start: 0.000000, bitrate: 1011 kb/s\n  Stream #0:0[0x1]: Video: h264 (Constrained Baseline) (avc1 / 0x31637661), yuv420p(progressive), 640x480 [SAR 1:1 DAR 4:3], 934 kb/s, 25 fps, 25 tbr, 600 tbn (default)\n  Stream #0:1[0x2]: Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)",
 "film4min": "  Duration: 00:03:58.80, start: 0.000000, bitrate: 2652 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuvj420p(pc, bt470bg/unknown/unknown, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 2444 kb/s, 30 fps, 30 tbr, 15360 tbn (default)\n    Side data:\n  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 199 kb/s (default)"
};
function ecCtx() {
  const p = panel();
  delete p.ctx.ls.aiapp_vd_endcard; /* بلا تفضيل محفوظ = مشغَّل (طلب المالك) */
  p.ctx.DR.out = ''; /* لا فيديو قبل الرفع */
  const calls = [];
  p.ctx.ecMake = (file, my, pct) => new Promise((res, rej) => { calls.push({ file, my, pct, res, rej }); });
  p.els.vdPub.hidden = true; p.replies.accounts = { ok: true, on: ['instagram', 'tiktok'], reauth: [] };
  return Object.assign(p, { calls });
}
const vfileE = (name, type, size) => ({ name, type, size: size == null ? 4321 : size });
/* مدخل الخطّة كما يبنيه ecMake: سجلّ «-i» ومقياس زمن الصوت من framecrc (= معدّل العيّنة ما لم يُذكر) */
const ecInfo = (ctx, log, atb) => { const p = ctx.ecParse(log), a = p.streams.filter((x) => x.kind === 'a')[0]; if (a) p.atb = atb == null ? a.sr : atb; return p; };
const outFile = (name) => ({ name, type: 'video/mp4', size: 5555 });

test('١٩. المحلّل والخطّة على سجلّات النواة الحقيقيّة: السريع لـH.264+AAC بترتيب الدفقات ودورانها ومداها، والبطيء لغيرها بحدود الجهاز', () => {
  const { ctx } = panel();
  const P = (k, size, mob, atb) => ctx.ecPlan(ecInfo(ctx, EC_LOGS[k], atb), size == null ? 30 * 1048576 : size, !!mob);
  const ph = ctx.ecParse(EC_LOGS.phone);
  assert.equal(ph.dur, 134.41);
  assert.deepEqual(J(ph.streams.map((x) => [x.i, x.kind, x.codec, x.profile, x.pix || null, x.w || null, x.h || null, x.fps || null, x.tbr || null, x.tbn || null, x.sr || null, x.layout || null])),
    [[0, 'a', 'aac', 'LC', null, null, null, null, null, null, 48000, 'stereo'], [1, 'v', 'h264', 'High', 'yuvj420p', 720, 1280, 30.02, 30000, 30000, null, null]], 'جوّال المالك: الصوت أوّلًا و«30k»');
  const want = {
    phone: [true, '', 'av', '30', 0, 720, 1280, 720, 1280],
    google: [true, '', 'va', '24', 0, 1280, 720, 1280, 720],
    rot90: [true, '', 'va', '30', 270, 1280, 720, 720, 1280], /* «rotation of 90» = ٢٧٠ باتّجاه الساعة: العرض طوليّ */
    rotm90: [true, '', 'va', '30', 90, 1280, 720, 720, 1280],
    hevc: [false, 'vcodec', 'va', '30', 0, 1080, 1920, 1080, 1920],
    vp9: [false, 'vcodec', 'va', '30', 0, 720, 1280, 720, 1280],
    noaudio: [true, '', 'va', '30', 0, 1080, 1920, 1080, 1920],
    baseline: [true, '', 'va', '25', 0, 640, 480, 640, 480],
    film4min: [true, '', 'va', '30', 0, 1920, 1080, 1920, 1080],
  };
  for (const [k, w] of Object.entries(want)) {
    const pl = P(k);
    assert.deepEqual([pl.ok, pl.fast, pl.why, pl.order, pl.fps, pl.rot, pl.w, pl.h, pl.dw, pl.dh], [true, ...w], k);
  }
  assert.deepEqual([P('hevc').ow, P('hevc').oh, P('vp9').ow, P('vp9').oh], [1080, 1920, 720, 1280], 'البطيء بمقاس العرض (سقف ١٠٨٠ على الضلع الأقصر)');
  assert.deepEqual([P('noaudio').a, P('baseline').a.sr, P('baseline').a.layout, P('baseline').v.tbn, P('film4min').v.pix], [null, 44100, 'mono', 600, 'yuvj420p']);
  // ما يمنع اللصق: كلّ سبب وحده
  const mut = (k, from, to) => ctx.ecPlan(ecInfo(ctx, EC_LOGS[k].replace(from, to)), 1e6, false);
  assert.equal(mut('google', 'aac (LC)', 'aac (HE-AAC)').why, 'acodec', 'HE-AAC لا يطابق صمت البطاقة');
  assert.equal(mut('google', 'stereo', '5.1(side)').why, 'acodec');
  assert.equal(mut('google', 'yuv420p(progressive)', 'yuv420p10le(tv, progressive)').why, 'pix');
  assert.equal(mut('google', '1280x720,', '1280x720 [SAR 4:3 DAR 16:9],').why, 'sar');
  assert.equal(mut('google', '1280x720,', '1279x720,').why, 'odd');
  assert.equal(mut('google', 'Stream #0:1[0x2](und): Audio', 'Stream #0:2[0x3](und): Audio').why, 'order', 'دفق بين الصورة والصوت: لا مطابقة بالترتيب');
  const pic = ctx.ecPlan(ecInfo(ctx, EC_LOGS.google.replace('  Stream #0:0[0x1]', '  Stream #0:2[0x3](und): Video: mjpeg (Baseline), yuvj420p(pc), 600x600, 90k tbr, 90k tbn (attached pic)\n  Stream #0:0[0x1]')), 1e6, false);
  assert.deepEqual([pic.fast, pic.v.i, pic.w], [true, 0, 1280], 'صورة الغلاف ليست الفيديو');
  assert.equal(ctx.ecParse('Duration: 00:00:05.00\n  Stream #0:0: Video: h264 (High), yuv420p, 1920x1080, 30 fps, 30 tbr, 600 tbn\n    Metadata:\n      rotate          : 90').rot, 90, 'وسم rotate القديم');
  assert.deepEqual([ctx.ecFps({ fps: 29.97 }), ctx.ecFps({ fps: 30 }), ctx.ecFps({ fps: 23.98 }), ctx.ecFps({ fps: 59.94 }), ctx.ecFps({ fps: 0, tbr: 25 }), ctx.ecFps({ fps: 12.5 }), ctx.ecFps({})],
    ['30000/1001', '30', '24000/1001', '60000/1001', '25', '13', '30'], '٢٩٫٩٧ ليست ٣٠');
  assert.deepEqual([ctx.ecFps({ fps: 29.94 }), ctx.ecFps({ fps: 30.02 })], ['30', '30'], 'المعيار ضمن ٠٫٠٢ فقط، وإلّا التقريب');
  // حدود الجهاز: السريع ٢٥٠/٥٠٠ ميغا، والبطيء ١٠٠/٣٠٠ ميغا و٦٠/١٨٠ ثانية ومدّة معروفة
  const MB = 1048576;
  assert.deepEqual([P('phone', 251 * MB, true).why, P('phone', 249 * MB, true).fast, P('phone', 499 * MB, false).fast, P('phone', 501 * MB, false).why], ['heavy', true, true, 'heavy']);
  assert.deepEqual([P('hevc', 101 * MB, true).why, P('hevc', 99 * MB, true).ok, P('hevc', 301 * MB, false).why], ['heavy', true, 'heavy']);
  const long = (sec) => ctx.ecPlan(ecInfo(ctx, EC_LOGS.hevc.replace('00:00:06.00', '00:0' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + '.00')), MB, false);
  assert.deepEqual([long(179).ok, long(181).why], [true, 'heavy']);
  assert.equal(ctx.ecPlan(ecInfo(ctx, EC_LOGS.vp9.replace('00:00:06.01', '00:01:01.00')), MB, true).why, 'heavy', 'الجوّال ٦٠ ث للبطيء');
  assert.equal(ctx.ecPlan(ecInfo(ctx, EC_LOGS.vp9.replace(/ {2}Duration[^\n]*\n/, '')), MB, false).why, 'nodur', 'مدّة غير معروفة: لا إعادة ترميز بلا نهاية — وليست «ثقيلة»');
  assert.equal(ctx.ecPlan(ctx.ecParse('  Stream #0:0: Audio: aac (LC), 48000 Hz, stereo'), MB, false).why, 'novideo');
  // مراجعة مستقلّة: مقياس زمن الصوت غير معدّل العيّنة = إعادة ترميز (لصق النسخ كان يمدّ ذيل الصوت أضعافًا: ٨ ث صارت ٢٤)، وما لم يُقرأ كذلك
  assert.deepEqual([P('google', null, false, 24000).why, P('google', null, false, 24000).fast, P('google', null, false, 24000).ok, P('google', null, false, 0).why, P('noaudio', null, false, 0).fast],
    ['atb', false, true, 'atb', true], 'بلا صوت لا مقياس يُقرأ');
  // الألوان من قوسي الصيغة: المصفوفة/الأوّليّات/النقل، والاسم الواحد = الثلاثة
  assert.deepEqual(J(ctx.ecParse(EC_LOGS.phone).streams[1].color), { sp: 'bt709', pri: 'bt709', trc: 'iec61966-2-1' });
  assert.deepEqual(J(ctx.ecParse(EC_LOGS.film4min).streams[0].color), { sp: 'bt470bg', pri: 'unknown', trc: 'unknown' });
  assert.deepEqual(J(ctx.ecParse(EC_LOGS.google).streams[0].color), { sp: '', pri: '', trc: '' });
  assert.deepEqual([J(ctx.ecColor('tv, bt709')), J(ctx.ecColor('tv, smpte170m, progressive'))],
    [{ sp: 'bt709', pri: 'bt709', trc: 'bt709' }, { sp: 'smpte170m', pri: 'smpte170m', trc: 'smpte170m' }]);
  // مصفوفة البطاقة = مصفوفة فكّ آخر لقطة: وسم الأصل، وبلا وسم تخمين Chromium المقيس (الارتفاع المرمَّز ٧٢٠ فأكثر = 709)
  assert.deepEqual(['phone', 'film4min', 'google', 'rot90', 'baseline', 'noaudio', 'hevc', 'vp9'].map((k) => ctx.ecMatrix(P(k))),
    ['bt709', 'bt601', 'bt709', 'bt709', 'bt601', 'bt709', 'bt709', 'bt709']);
  const un = (wh) => ctx.ecMatrix(ctx.ecPlan(ecInfo(ctx, EC_LOGS.google.replace('1280x720', wh)), 1e6, false));
  assert.deepEqual([un('854x480'), un('480x854'), un('1280x718'), un('960x540')], ['bt601', 'bt709', 'bt601', 'bt601'], 'Chromium: ارتفاع ٤٨٠ = 601 و٨٥٤ = 709 و٧١٨ = 601');
  const tg = (pix, wh) => ctx.ecMatrix(ctx.ecPlan(ecInfo(ctx, EC_LOGS.google.replace('1280x720', wh).replace('yuv420p(progressive)', pix)), 1e6, false));
  assert.deepEqual([tg('yuv420p(tv, bt709, progressive)', '640x480'), tg('yuv420p(tv, smpte170m, progressive)', '1920x1080'), tg('yuv420p(tv, bt2020nc/bt2020/bt709)', '640x480')],
    ['bt709', 'bt601', 'bt2020'], 'الوسم يغلب تخمين الارتفاع');
  assert.deepEqual([[...ctx.ecTags(P('phone'))], [...ctx.ecTags(P('film4min'))], [...ctx.ecTags(P('google'))]],
    [['-colorspace', '1', '-color_primaries', '1', '-color_trc', '13'], ['-colorspace', '5'], []], 'الوسوم أرقامًا كما في الأصل، والمجهول لا يُوسم');
  // لماذا لا يُضاف: «ثقيل — جرّبه من الكمبيوتر» حين ينجح على الكمبيوتر فقط
  const W = (k, size, mob, tweak) => { const q = ecInfo(ctx, tweak ? tweak(EC_LOGS[k]) : EC_LOGS[k]); return ctx.ecWhy(ctx.ecPlan(q, size, mob), q, size, mob); };
  const at = (sec) => (l) => l.replace('00:00:06.00', '00:0' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + '.00');
  assert.deepEqual([W('phone', 300 * MB, true), W('phone', 600 * MB, true), W('phone', 600 * MB, false), W('hevc', MB, true, at(90)), W('hevc', MB, true, at(240)),
    W('hevc', MB, false, at(240)), W('hevc', 200 * MB, true), W('vp9', MB, true, (l) => l.replace(/ {2}Duration[^\n]*\n/, ''))],
  ['heavy', 'big', 'big', 'heavy', 'big', 'big', 'heavy', 'probe'], 'على الكمبيوتر لا «جرّبه من الكمبيوتر»، والمدّة المجهولة ليست ثقلًا');
});

test('٢٠. أوامر الأداة: البطاقة بمقاس الملفّ وإطاراته ومقياس زمنه وترتيب دفقاته ودورانه ومداه، والدمج نسخ بلا ترميز؛ والبطيء ترميز واحد', () => {
  const { ctx } = panel();
  const P = (k, log) => ctx.ecPlan(ecInfo(ctx, log || EC_LOGS[k]), 30 * 1048576, false);
  const ph = ctx.ecCardArgs(P('phone')), j = ph.join(' ');
  assert.deepEqual([...ph.slice(0, 14)], ['-hide_banner', '-y', '-framerate', '30', '-i', 'ec_last.png', '-framerate', '30', '-i', 'ec_over.png', '-framerate', '30', '-i', 'ec_end.png']);
  assert.ok(j.includes('-f lavfi -t 4 -i anullsrc=r=48000:cl=stereo'), 'صمت بخصائص صوت الأصل');
  const fc = ph[ph.indexOf('-filter_complex') + 1];
  assert.equal(fc, '[0:v]scale=720:1280:out_color_matrix=bt709,setsar=1,format=yuv420p,loop=loop=-1:size=1:start=0,trim=duration=0.6[b];'
    + '[1:v]scale=720:1280:out_color_matrix=bt709,setsar=1,format=yuva420p,loop=loop=-1:size=1:start=0,trim=duration=0.6,fade=t=in:st=0:d=0.6:alpha=1[o];'
    + '[b][o]overlay=format=yuv420,format=yuvj420p[f];[2:v]scale=720:1280:out_color_matrix=bt709,setsar=1,format=yuvj420p,loop=loop=-1:size=1:start=0,trim=duration=3.40[h];[f][h]concat=n=2:v=1:a=0[v]',
    'كلّ صورة تُحوَّل مرّة ثمّ تتكرّر، والتركيب في التلاشي وحده (xfade ودمج RGBA على كلّ إطار كانا ٣٫٥–٨ ث)');
  assert.deepEqual([...ph.slice(ph.indexOf('-map'), ph.indexOf('-map') + 4)], ['-map', '3:a', '-map', '[v]'], 'الصوت أوّلًا كما في ملفّ الجوّال');
  assert.ok(j.includes('-c:v libx264 -preset ultrafast -crf 20 -pix_fmt yuvj420p -r 30 -colorspace 1 -color_primaries 1 -color_trc 13 -video_track_timescale 30000 -c:a aac -b:a 128k -ar 48000 -ac 2 -t 4 ec_card.mp4'),
    'البطاقة بمصفوفة الأصل ووسومه (كانت BT.601 بلا وسم في مسار BT.709 فيقفز اللون عند الوصل)');
  const fm = ctx.ecCardArgs(P('film4min')).join(' '), bl = ctx.ecCardArgs(P('baseline')).join(' ');
  assert.ok(fm.includes('scale=1920:1080:out_color_matrix=bt601,') && fm.includes('-r 30 -colorspace 5 -video_track_timescale 15360'), 'وسم المصفوفة وحده حين الباقي مجهول');
  assert.ok(bl.includes('scale=640:480:out_color_matrix=bt601,') && !bl.includes('-colorspace'), 'بلا وسم: تخمين المتصفّح ولا وسم');
  assert.ok(!/mjpeg|\.jpg|xfade/.test(j), 'لا JPEG (يُسقط النواة) ولا xfade');
  const g = ctx.ecCardArgs(P('google'));
  assert.deepEqual([...g.slice(g.indexOf('-map'), g.indexOf('-map') + 4)], ['-map', '[v]', '-map', '3:a']);
  assert.ok(g.join(' ').includes('-pix_fmt yuv420p -r 24 -video_track_timescale 12288'));
  assert.ok(ctx.ecCardArgs(P('rotm90'))[ctx.ecCardArgs(P('rotm90')).indexOf('-filter_complex') + 1].startsWith('[0:v]transpose=cclock,scale=1280:720:out_color_matrix=bt709,'), 'الجوّال الطوليّ (-90): البطاقة تُدار إلى وضع التخزين');
  assert.ok(ctx.ecCardArgs(P('rot90'))[ctx.ecCardArgs(P('rot90')).indexOf('-filter_complex') + 1].startsWith('[0:v]transpose=clock,scale=1280:720:out_color_matrix=bt709,'));
  const na = ctx.ecCardArgs(P('noaudio')).join(' ');
  assert.ok(!/anullsrc|-c:a|3:a/.test(na) && na.includes('-map [v] -c:v libx264'), 'بلا صوت في الأصل = بلا صوت في البطاقة');
  assert.ok(ctx.ecCardArgs(P('baseline')).join(' ').includes('anullsrc=r=44100:cl=mono') && ctx.ecCardArgs(P('baseline')).join(' ').includes('-video_track_timescale 600 -c:a aac -b:a 128k -ar 44100 -ac 1'));
  assert.deepEqual([...ctx.ecJoinArgs(P('phone'), '/ecin/input')], ['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', '/ec_list.txt', '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', 'ec_out.mp4']);
  // البطيء: البطاقة بمقاس المخرج بلا دوران وصوتها 48k ستيريو، والدمج مرشّح concat وترميز واحد
  const hv = P('hevc'), hc = ctx.ecCardArgs(hv).join(' '), hj = ctx.ecJoinArgs(hv, '/ecin/input');
  assert.ok(hc.includes('anullsrc=r=48000:cl=stereo') && hc.includes('[0:v]scale=1080:1920:out_color_matrix=bt709,') && !/transpose|video_track_timescale/.test(hc));
  assert.deepEqual([...hj.slice(0, 7)], ['-hide_banner', '-y', '-i', '/ecin/input', '-i', 'ec_card.mp4', '-filter_complex']);
  assert.equal(hj[7], '[0:0]scale=1080:1920:in_color_matrix=bt709:out_color_matrix=bt709,setsar=1,fps=30,format=yuv420p[m];[1:v]scale=1080:1920,setsar=1,fps=30,format=yuv420p[c];[0:1]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[ma];[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[ca];[m][ma][c][ca]concat=n=2:v=1:a=1[v][a]');
  // مراجعة ثانية: مصدر RGB (Animation/PNG في mov، x264rgb) كان يُحوَّل بـ601 والبطاقة 709 فيقفز اللون — الطرفان بمصفوفة البطاقة (والمخرج وحده لا يكفي:
  // YUV بلا وسم يصير 601←709 عبر RGB). السجلّات من نواة الأداة نفسها
  const RGB = (wh, pix, codec) => '  Duration: 00:00:03.00, start: 0.000000, bitrate: 1001 kb/s\n  Stream #0:0[0x1]: Video: ' + codec + ', ' + pix + ', ' + wh + ', 861 kb/s, SAR 1:1 DAR 16:9, 30 fps, 30 tbr, 15360 tbn (default)\n  Stream #0:1[0x2]: Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)';
  const mainScale = (log) => { const pl = P('', log); return [pl.why, ctx.ecJoinArgs(pl, 'x')[7].split(',')[0]]; };
  assert.deepEqual([mainScale(RGB('1280x720', 'rgb24(progressive)', 'qtrle (rle  / 0x20656C72)')), mainScale(RGB('640x480', 'rgb24(progressive)', 'qtrle (rle  / 0x20656C72)')),
    mainScale(RGB('1280x720 [SAR 1:1 DAR 16:9]', 'gbrp(pc, gbr/unknown/unknown, progressive)', 'h264 (High 4:4:4 Predictive) (avc1 / 0x31637661)'))],
  [['vcodec', '[0:0]scale=1280:720:in_color_matrix=bt709:out_color_matrix=bt709'], ['vcodec', '[0:0]scale=640:480:in_color_matrix=bt601:out_color_matrix=bt601'],
    ['pix', '[0:0]scale=1280:720:in_color_matrix=bt709:out_color_matrix=bt709']], 'RGB بمصفوفة البطاقة نفسها');
  assert.ok(hj.join(' ').endsWith('-map [v] -map [a] -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart ec_out.mp4'));
  assert.ok(!ctx.ecJoinArgs(Object.assign({}, hv, { a: null }), 'x').join(' ').includes('[a]'), 'بطيء بلا صوت');
  const h709 = ctx.ecJoinArgs(P('', EC_LOGS.hevc.replace('yuv420p(tv, progressive)', 'yuv420p(tv, bt709, progressive)')), 'x').join(' ');
  assert.ok(h709.includes('-pix_fmt yuv420p -colorspace 1 -color_primaries 1 -color_trc 1 -c:a aac'), 'البطيء: قيم الأصل تمرّ كما هي ووسومه معها');
  assert.deepEqual([ctx.ecName('الحلقة 2: يوسف.MOV'), ctx.ecName('clip.mp4'), ctx.ecName(''), ctx.ecName('a.b.webm')], ['الحلقة 2_ يوسف-om-ai.mp4', 'clip-om-ai.mp4', 'video-om-ai.mp4', 'a.b-om-ai.mp4']);
  const v = read('js/video.js');
  assert.ok(v.includes("\"ffconcat version 1.0\\nfile '\"+input+\"'\\nfile '/ec_card.mp4'\\n\"") && v.includes("'-update','1','ec_last.png'"), 'قائمة الدمج، واحتياط آخر لقطة PNG');
  const mk = v.slice(v.indexOf('async function ecMake('), v.indexOf('function ecMine('));
  assert.ok(mk.includes("'-map','0:'+au.i,'-c','copy','-frames:a','1','-f','framecrc','ec_tb.txt'") && mk.includes("info.atb=tb?+tb[1]:0;") && mk.includes('/^#tb 0: 1\\/(\\d+)\\s*$/m'),
    'مقياس زمن الصوت من حزمة واحدة إلى framecrc في ملفّ');
  assert.ok(mk.includes('if(pl.fast){ frame=await bgrab(); ecStale(my); }\n    if(!frame) frame=await ecLast(ff,input,pl,my);\n    if(!frame&&!pl.fast){ frame=await bgrab(); ecStale(my); }'),
    'البطيء: الأداة تفكّ آخر لقطة بمصفوفة البطاقة (فكّ المتصفّح لـVP9 بلا وسم 601) والمتصفّح آخر حلّ — والترتيب يُشغَّل في ٢٤');
  const lst = v.slice(v.indexOf('async function ecLast('), v.indexOf('async function ecMake('));
  assert.ok(lst.includes("var vf='scale=in_color_matrix='+ecMatrix(pl)+':flags=accurate_rnd+full_chroma_int,format=rgb24,setparams=color_primaries=unknown:color_trc=unknown,sidedata=mode=delete';")
    && lst.includes("{colorSpaceConversion:'none'}") && lst.includes("'-vf',vf,'-update','1','ec_last.png'"),
    'PNG آخر لقطة بلا وسوم ألوان (gAMA/cHRM كانت تفتّح البطاقة) ولا ICC من بيانات الإطار (iCCP — سفاري يتجاهل colorSpaceConversion)، ويُفكّ بلا إدارة ألوان');
  assert.ok(mk.includes('if(!pl.ok) throw {code:ecWhy(pl,info,file.size,mob)};') && mk.includes("throw {code:'big'};"), 'السبب من ecWhy، وفوق حدّ النشر «big»');
});

test('٢١. الخيار مشغَّل: الرفع يضيف الباركود فورًا والنشر ينتظره، ثمّ المعروض والمنشور هو الناتج والنصّ وما شاله المالك من المنصّات يبقيان؛ والإطفاء يعيد الأصل بلا إعادة عمل، وبعد رفعه للنشر لا تبديل', async () => {
  const { ctx, els, api, calls, urls, replies, boxes } = ecCtx();
  const f = vfileE('حلقة.mp4', 'video/mp4');
  ctx.upPick(f); await flush();
  assert.equal(calls.length, 1, 'الإضافة بدأت مع الرفع');
  assert.equal(calls[0].file, f);
  assert.deepEqual([ctx.EC.busy, ctx.DR.out, ctx.DR.file === f, els.vdVideo.src], [true, 'blob:up1', true, 'blob:up1'], 'الأصل معروض أثناء العمل');
  assert.equal(els.vdUpMsg.textContent, 'vdEcWork {"p":0}');
  calls[0].pct(41.6); assert.equal(els.vdUpMsg.textContent, 'vdEcWork {"p":42}');
  // أثناء الانتظار: المالك يكتب النصّ ويشيل تيك توك، والنشر مرفوض (كان سيُرفع الأصل)
  els.vdPubCap.value = 'نصّ كتبه المالك أثناء الإضافة';
  assert.deepEqual(boxes().map((x) => [x.p, x.on]), [['instagram', true], ['tiktok', true]]);
  boxes().find((x) => x.p === 'tiktok').box.checked = false;
  await ctx.pbGo();
  assert.deepEqual(api.map((x) => x.op), ['accounts'], 'لا نشر أثناء الإضافة');
  const out = outFile('حلقة-om-ai.mp4');
  calls[0].res(out); await flush();
  assert.deepEqual([ctx.EC.busy, ctx.DR.file === out, ctx.DR.fileType, ctx.DR.out, ctx.DR.fileUrl, els.vdVideo.src, els.vdDl.href, els.vdDl.attrs.download],
    [false, true, 'video/mp4', 'blob:up2', 'blob:up2', 'blob:up2', 'blob:up2', 'حلقة-om-ai.mp4']);
  assert.deepEqual([els.vdUpMsg.textContent, els.vdUpMsg.className, els.vdPubCap.value, ctx.upMine()], ['vdEcDone', 'vmk-dir-msg', 'نصّ كتبه المالك أثناء الإضافة', true], 'النصّ نفسه للفيديو نفسه');
  assert.deepEqual(boxes().map((x) => [x.p, x.on]), [['instagram', true], ['tiktok', false]], 'ما شاله أثناء الانتظار يبقى مشالًا (كانت المنصّات كلّها تُؤشَّر من جديد — مراجعة مستقلّة)');
  // الإطفاء: الأصل يعود (بلا إعادة رفع للجهاز ولا تحرير لرابطه) بالنصّ والمنصّات نفسها، والتشغيل ثانية يعيد الناتج المحفوظ بلا عمل جديد
  ctx.ecToggle(false);
  assert.deepEqual([ctx.ls.aiapp_vd_endcard, ctx.DR.out, ctx.DR.file === f, ctx.DR.fileType, els.vdVideo.src, els.vdUpMsg.textContent, els.vdPubCap.value, boxes().map((x) => x.on)],
    ['0', 'blob:up1', true, 'video/mp4', 'blob:up1', '', 'نصّ كتبه المالك أثناء الإضافة', [true, false]]);
  ctx.ecToggle(true); await flush();
  assert.deepEqual([calls.length, ctx.ls.aiapp_vd_endcard, ctx.DR.out, ctx.DR.file === out, els.vdUpMsg.textContent, boxes().map((x) => x.on)], [1, '1', 'blob:up2', true, 'vdEcDone', [true, false]], 'محفوظ: بلا إعادة');
  assert.deepEqual([urls.revoked, api.length, ctx.ecLocked()], [[], 1, false], 'لا رابط حُرِّر والمعروض حيّ، ولا نداء، ولا قفل قبل النشر');
  // النشر يرفع الناتج نفسه بنوعه، إلى ما بقي مؤشَّرًا وحده
  replies.target = { ok: true, id: F24, up: 'https://up.example/put?sig=e', ctype: 'video/mp4' };
  replies.publish = { ok: true, request: 're', already: [] };
  await ctx.pbGo();
  assert.deepEqual(J(api.find((x) => x.op === 'target').body), { token: 'tok', size: 5555, type: 'video/mp4' }, 'يُرفع الفيديو بالباركود');
  assert.deepEqual(J(api.find((x) => x.op === 'publish').body.platforms), ['instagram'], 'تيك توك المشال لا يُنشر فيه');
  // بعد رفعه للنشر لا تبديل: التبديل كان يصفّر منصّاته وحجزه فيُرفع الملفّ نفسه باسم جديد لا يمنعه الخادم (نشر مكرّر)
  assert.equal(ctx.ecLocked(), true);
  const n = api.length;
  ctx.ecToggle(false); ctx.ecToggle(true); await flush();
  assert.deepEqual([ctx.ls.aiapp_vd_endcard, ctx.DR.out, ctx.PB.vid, boxes().find((x) => x.p === 'instagram').off, api.length, calls.length], ['1', 'blob:up2', F24, true, n, 1], 'المقفل لا يتبدّل ولا يغيّر التفضيل');
  // ملفّ جديد يفكّ القفل
  ctx.upPick(vfileE('ثانية.mp4', 'video/mp4')); await flush();
  assert.deepEqual([ctx.ecLocked(), ctx.PB.vid, calls.length], [false, '', 2]);
});

test('٢٢. الفشل والثقل يبقيان الأصل والخيار مطفأً لهذا الملفّ، وملفّ جديد يلغي السابق ويحرّر روابطه، وفيديو المخرج المعروض لا يمسّه الخيار، والمطفأ لا يعمل شيئًا', async () => {
  const { ctx, els, calls, urls } = ecCtx();
  const f1 = vfileE('a.mp4', 'video/mp4');
  ctx.upPick(f1); await flush();
  calls[0].rej({ code: 'card', log: 'x' }); await flush();
  assert.deepEqual([ctx.EC.busy, ctx.DR.out, ctx.DR.file === f1, els.vdUpMsg.textContent, els.vdUpMsg.className, ctx.EC.skip === f1], [false, 'blob:up1', true, 'vdEcFail', 'vmk-dir-msg err', true]);
  assert.equal(ctx.ls.aiapp_vd_endcard, undefined, 'التفضيل المحفوظ لا يتغيّر بالفشل');
  // ثقيل على الجهاز
  ctx.ecToggle(true); await flush();
  assert.equal(calls.length, 2, 'إعادة المحاولة بالضغط');
  calls[1].rej({ code: 'heavy' }); await flush();
  assert.deepEqual([els.vdUpMsg.textContent, ctx.DR.out], ['vdEcHeavy', 'blob:up1']);
  // ملفّ جديد أثناء العمل: السابق يُلغى (نتيجته المتأخّرة لا تُعرض) وروابطه تُحرَّر مرّة واحدة
  ctx.ecToggle(true); await flush();
  const late = calls[2];
  const f2 = vfileE('b.mov', '');
  ctx.upPick(f2); await flush();
  assert.deepEqual([urls.revoked, ctx.DR.out, calls.length, calls[3].file === f2], [['blob:up1'], 'blob:up2', 4, true]);
  late.res(outFile('a-om-ai.mp4')); await flush();
  assert.deepEqual([ctx.DR.out, ctx.DR.file === f2, urls.made.length], ['blob:up2', true, 2], 'نتيجة الملفّ القديم تُرمى');
  calls[3].res(outFile('b-om-ai.mp4')); await flush();
  assert.deepEqual([ctx.DR.out, ctx.DR.fileType, ctx.DR.file.name], ['blob:up3', 'video/mp4', 'b-om-ai.mp4']);
  // ملفّ ثالث بعد اكتمال الثاني: أصله وناتجه يُحرَّران (الناتج المعروض يحرّره الرفع نفسه — مرّة واحدة)
  ctx.upPick(vfileE('c.mp4', 'video/mp4')); await flush();
  assert.deepEqual(urls.revoked, ['blob:up1', 'blob:up2', 'blob:up3']);
  // فيديو صنعه المخرج معروض: الخيار يحفظ التفضيل ولا يمسّ الفيديو
  calls[4].res(outFile('c-om-ai.mp4')); await flush();
  ctx.DR.out = 'blob:gen'; ctx.pbNewVideo();
  const n = calls.length;
  ctx.ecToggle(false); ctx.ecToggle(true); await flush();
  assert.deepEqual([ctx.DR.out, calls.length, ctx.ls.aiapp_vd_endcard], ['blob:gen', n, '1'], 'لا عمل على فيديو ليس مرفوعًا');
  // مطفأ: الرفع لا يبدأ شيئًا
  ctx.ls.aiapp_vd_endcard = '0';
  ctx.answer = true; ctx.upPick(vfileE('d.mp4', 'video/mp4')); await flush();
  assert.deepEqual([calls.length, ctx.EC.busy, els.vdUpMsg.textContent], [n, false, '']);
  // أثناء رفع النشر: لا تبديل للمعروض
  ctx.ls.aiapp_vd_endcard = '1'; ctx.PB.busy = true; ctx.ecToggle(true); ctx.PB.busy = false; await flush();
  assert.equal(calls.length, n, 'لا تبديل تحت رفع جارٍ');
  // فوق حدود الكمبيوتر («big»): «ما قدرت أضيفه» بلا «جرّبه من الكمبيوتر» ولا تسجيل خطأ؛ وغيره يُسجَّل
  const sw = []; ctx.__swallow = (e, w) => sw.push(w);
  ctx.upPick(vfileE('h.mp4', 'video/mp4')); await flush();
  calls[calls.length - 1].rej({ code: 'big' }); await flush();
  assert.deepEqual([els.vdUpMsg.textContent, sw.length], ['vdEcFail', 0]);
  ctx.ecToggle(true); await flush();
  calls[calls.length - 1].rej({ code: 'probe' }); await flush();
  assert.deepEqual([els.vdUpMsg.textContent, sw.length, /director:endcard probe/.test(sw[0])], ['vdEcFail', 1, true]);
  // توليد في المخرج يترك المرفوع (upEnd أوّل التوليد): الإضافة الجارية تُلغى ونتيجتها المتأخّرة تُرمى، والرسالة تُمسح، والملفّ يُترك
  ctx.upPick(vfileE('e.mp4', 'video/mp4')); await flush();
  const run5 = calls[calls.length - 1], shown = ctx.DR.out, made = urls.made.length;
  assert.equal(ctx.EC.busy, true);
  ctx.upEnd();
  assert.deepEqual([ctx.EC.busy, ctx.EC.src, ctx.EC.out, ctx.DR.file, ctx.DR.fileUrl, els.vdUpMsg.textContent, ctx.DR.out, urls.revoked.includes(shown)],
    [false, null, null, null, '', '', shown, false], 'المعروض (المخفيّ تحت التوليد) يحرّره التوليد حين ينتهي');
  run5.res(outFile('e-om-ai.mp4')); await flush();
  assert.deepEqual([ctx.DR.out, urls.made.length, els.vdUpMsg.textContent], [shown, made, ''], 'لا عرض ولا رسالة من عمل أُلغي');
  // ناتج محفوظ غير معروض (أُطفئ الخيار): التوليد يحرّر رابطه ويترك الملفّ المبنيّ في الذاكرة
  ctx.upPick(vfileE('g.mp4', 'video/mp4')); await flush();
  calls[calls.length - 1].res(outFile('g-om-ai.mp4')); await flush();
  const cardUrl = ctx.DR.out; ctx.ecToggle(false);
  const orig = ctx.DR.out;
  assert.notEqual(orig, cardUrl);
  ctx.upEnd();
  assert.deepEqual([urls.revoked.includes(cardUrl), urls.revoked.includes(orig), ctx.EC.out, ctx.DR.file], [true, false, null, null]);
  const v = read('js/video.js');
  assert.ok(v.includes("DR.busy=true; DR.lang=lang; upEnd(); syncDirector(); drReset();") && v.includes("DR.busy=true; upEnd(); syncDirector(); drMsg('');"), 'التوليد (العاديّ والموقَّت) يترك المرفوع أوّلًا');
});

test('٢٣. الخيار تحت صندوق الرفع ومربوط، والنشر معطّل أثناء الإضافة، والرابط من canonical لا مكتوبًا، والنصوص الستّة بالـ١٤ لغة والوسوم مرفوعة', () => {
  const v = read('js/video.js');
  const html = v.slice(v.indexOf("box.innerHTML='<div class=\"vmk-dir-head\">"), v.indexOf('var tabs=id(\'vmkTabs\'); if(tabs&&tabs.parentNode===card)'));
  const iUp = html.indexOf('id="vdUp"'), iEc = html.indexOf('<label class="vmk-dir-ec" id="vdEcBox"><input type="checkbox" id="vdEc"><span></span></label>'), iMsg = html.indexOf('id="vdUpMsg"');
  assert.ok(iUp > 0 && iEc > iUp && iMsg > iEc, 'الخيار بين الصندوق ورسالته');
  assert.ok(v.includes("box.querySelector('#vdEc').addEventListener('change',function(e){ ecToggle(!!e.target.checked); });"));
  const sync = v.slice(v.indexOf('function syncDirector(){'), v.indexOf('var ST={t0:0'));
  assert.ok(sync.includes("pg.disabled=PB.busy||PB.loading||!(PB.plats&&PB.plats.length)||EC.busy;"), 'زرّ النشر معطّل أثناء الإضافة');
  assert.ok(sync.includes("ec.checked=ecPref()&&!(EC.src&&EC.skip===EC.src.file);") && sync.includes("ec.disabled=DR.busy||PB.busy||ecLocked(); eb.classList.toggle('off',ec.disabled);") && sync.includes("eb.querySelector('span').textContent=L('vdEcLabel');"));
  const pick = v.slice(v.indexOf('function upPick(f){'), v.indexOf('function upBind('));
  assert.ok(pick.indexOf("ecDrop(DR.out);") > pick.indexOf("window.confirm(L('vdUpReplace'))") && pick.indexOf('ecDrop(DR.out);') < pick.indexOf('URL.revokeObjectURL(DR.out)'), 'الإلغاء بعد السؤال وقبل التحرير');
  assert.ok(pick.includes('if(ecPref()) ecStart();'));
  assert.ok(v.includes("document.querySelector('link[rel=\"canonical\"]')") && !/vercel\.app/.test(v), 'الرابط من الصفحة');
  assert.ok(read('index.html').includes('<link rel="canonical" href="https://omran-ai-builder.vercel.app/">'), 'canonical هو الرابط العامّ');
  const qtag = (/'\/js\/qr\.js(\?v=\w+)'/.exec(read('js/partials-settings.js')) || [])[1]; /* الوسم من الإعدادات لا مثبَّتًا (سقّاطة البنية) */
  assert.ok(qtag && v.includes("s.src='/js/qr.js" + qtag + "'") && v.includes('window.OmranQR.draw(qc,Q,{px:S})'), 'باركود التطبيق نفسه (qr.js بوسم الإعدادات)');
  // الباركود يحمل /app (رابط التحميل الواحد: كلّ جهاز إلى متجره) والمكتوب تحته النطاق — ecOverlay نفسه في vm بلوحة محاكاة
  const texts = [], qr = [];
  const c2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'fillText' ? (s2) => texts.push(s2) : () => {}),
    set: (t, k, val) => { t[k] = val; return true; } });
  const oc = { document: { querySelector: (q) => (q === 'link[rel="canonical"]' ? { href: 'https://omran-ai-builder.vercel.app/' } : null), createElement: () => ({ getContext: () => c2d }) },
    location: { origin: 'http://x' }, OmranQR: { matrix: (s2) => { qr.push(s2); return { size: 37 }; }, draw: (c, s2) => qr.push(s2) }, __swallow() {} };
  oc.window = oc;
  clientSlice('js/video.js', '  var EC_SEC=4', '  function ecGrab(', oc);
  oc.ecOverlay(720, 1280, 'حمّل تطبيق om ai');
  assert.deepEqual([qr, texts], [['https://omran-ai-builder.vercel.app/app', 'https://omran-ai-builder.vercel.app/app'], ['حمّل تطبيق om ai', 'omran-ai-builder.vercel.app']],
    'كان يحمل الصفحة الرئيسيّة (مراجعة مستقلّة: آيفون وهواوي وويندوز لا يصلون متاجرهم)');
  assert.ok(v.includes("await ff.mount('WORKERFS',{blobs:[{name:'input',data:file}]},'/ecin');"), 'الملفّ لا يُنسخ في الذاكرة');
  const css = read('css/modules.css');
  for (const c of ['#videoMakerModal .vmk-dir-ec{', '#videoMakerModal .vmk-dir-ec.off{', 'html:not(.mobile-ui) #videoMakerModal .vmk-dir-ec input[type=checkbox]:not(:checked){box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5)}']) assert.ok(css.includes(c), c);
  // النصوص
  const KEYS = ['vdEcLabel', 'vdEcWork', 'vdEcDone', 'vdEcFail', 'vdEcHeavy', 'vdEcLine'];
  const BANNED = /claude|anthropic|gemini|google|\bgpt|openai|runway|\bveo\b|kling|minimax|\bluma\b|\bsora\b|upload-?post|\bfal\b/i;
  const base = { $: () => null, document: { getElementById: () => null, querySelector: () => null }, window: {}, localStorage: { getItem: () => null } }; base.window = base;
  vm.runInNewContext(read('js/app-03-i18n-data.js'), base);
  for (const lg of ['ar', 'en']) for (const k of KEYS) { const t = base.I18N[lg][k]; assert.ok(t && t.length > 3, lg + ' ' + k); assert.doesNotMatch(t, BANNED, lg + ' ' + k); }
  assert.deepEqual([base.I18N.ar.vdEcLabel, base.I18N.ar.vdEcLine], ['أضف باركود التطبيق في آخر الفيديو (٤ ثواني)', 'حمّل تطبيق om ai'], 'كلمة المالك «الباركود» وسطر النموذج الذي وافق عليه');
  const seen = new Set();
  for (const lg of ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) {
    const m = read('i18n/' + lg + '.js').match(/v-director-endcard \(796\)[^\n]*Object\.assign\(I18N\["(\w+)"\], (\{.*\})\);/);
    assert.ok(m && m[1] === lg, lg + ' كتلة الترجمة');
    const o = JSON.parse(m[2]);
    assert.deepEqual(Object.keys(o), KEYS, lg + ' المفاتيح');
    for (const k of KEYS) {
      assert.ok(o[k] && o[k].trim().length > 3, lg + ' ' + k); assert.doesNotMatch(o[k], BANNED, lg + ' ' + k);
      assert.equal((o[k].match(/\{\w+\}/g) || []).sort().join(), (base.I18N.en[k].match(/\{\w+\}/g) || []).sort().join(), lg + ' ' + k + ' المتغيّرات');
      assert.notEqual(o[k], base.I18N.en[k], lg + ' ' + k + ' مترجم لا منسوخ');
    }
    assert.ok(o.vdEcLine.includes('om ai'), lg + ' اسم التطبيق في سطر الفيديو');
    seen.add(o.vdEcLabel);
  }
  assert.equal(seen.size, 12, 'ترجمات لا نسخ');
  const used = new Set([...v.matchAll(/(?:L|drT)\('(vdEc\w+)'/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), [...KEYS].sort(), 'كلّ نصّ مستعمل معرَّف، وكلّ معرَّف مستعمل');
  const tag = read('js/app-04-i18n-state.js').match(/\.js\?v=(\d+)';[^\n]* v-director-endcard \((\d+)\): [^\n]*\*\//);
  assert.ok(tag && Number(tag[1]) >= Number(tag[2]) && Number(tag[2]) === 796, 'وسم اللغات مرفوع وسببه في التعليق');
  const h = read('index.html');
  assert.ok(Number((/\/js\/video\.js\?v=(\d+)"/.exec(h) || [])[1]) >= 468 && Number((/css\/modules\.css\?v=(\d+)"/.exec(h) || [])[1]) >= 699, 'وسما video.js وmodules.css مرفوعان');
});

// ═══ ecMake نفسه (لا المحاكى) بأداة مزيّفة تتصرّف كالمكتبة: terminate يرفض كلّ وعد معلّق (ffmpeg/lib/classes.js) — مراجعة ثانية ═══
const PNG1 = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const BIG_T = 9223372036854775807; /* «لا حزمة بعد» من الأداة (|INT64_MIN+1| µs) */
function ecLive(o) {
  const p = panel();
  delete p.ctx.ls.aiapp_vd_endcard; p.ctx.DR.out = '';
  p.els.vdPub.hidden = true; p.replies.accounts = { ok: true, on: ['instagram'], reauth: [] };
  const F = { execs: [], holds: [], bitmaps: [], bgrabs: 0, holdRead: '', browser: false };
  const enc = (s) => new TextEncoder().encode(s);
  class FakeFF {
    constructor() { this.cbs = { log: [], progress: [] }; this.pend = new Set(); this.alive = true; this.fs = {}; }
    _p(get, hold) {
      if (!this.alive) return Promise.reject(new Error('ffmpeg is not loaded'));
      return new Promise((res, rej) => {
        const e = { res, rej }; this.pend.add(e);
        const go = () => { if (!this.pend.delete(e)) return; try { res(get()); } catch (x) { rej(x); } };
        if (hold) F.holds.push(go); else setImmediate(go);
      });
    }
    load() { return this._p(() => true); }
    on(k, f) { this.cbs[k].push(f); }
    emit(k, ev) { for (const f of this.cbs[k]) f(ev); }
    createDir() { return this._p(() => true); }
    mount() { return this._p(() => true); }
    exec(args) {
      const a = args.join(' ').replace(/^-hide_banner (-y )?/, ''); F.execs.push(a);
      return this._p(() => {
        if (a === '-i /ecin/input') { for (const l of EC_LOGS[o.log].split('\n')) this.emit('log', { message: l }); return 1; }
        if (a.endsWith('-frames:a 1 -f framecrc ec_tb.txt')) { this.fs['ec_tb.txt'] = enc('#tb 0: 1/48000\n0,          0,          0,     1024,        6, 0x02a4013e\n'); return 0; }
        if (a.endsWith('ec_last.png')) { this.emit('progress', { time: BIG_T }); this.emit('progress', { time: 300000 }); if (o.grab(a)) this.fs['ec_last.png'] = PNG1; return 0; }
        if (a.endsWith('-c copy -f framecrc ec_vts.txt')) { if (o.vts != null) this.fs['ec_vts.txt'] = enc(o.vts); return 0; }
        if (a.endsWith('ec_card.mp4')) { for (const t of [BIG_T, 1e6, 4e6]) this.emit('progress', { time: t }); return 0; }
        if (a.endsWith('ec_out.mp4')) { for (const t of [BIG_T, 3e6]) this.emit('progress', { time: t }); this.fs['ec_out.mp4'] = new Uint8Array(4096); return 0; }
        throw new Error('أمر غير متوقّع: ' + a);
      });
    }
    readFile(n) { return this._p(() => { if (!(n in this.fs)) throw new Error('FS error'); return this.fs[n]; }, F.holdRead === n); }
    writeFile(n, d) { this.fs[n] = d; return this._p(() => true); }
    terminate() { this.alive = false; const ps = [...this.pend]; this.pend.clear(); for (const e of ps) e.rej(new Error('called FFmpeg.terminate()')); }
  }
  const c = p.ctx, c2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
    set: (t, k, val) => { t[k] = val; return true; } });
  const el0 = c.document.createElement;
  c.document.createElement = (tag) => (tag === 'canvas' ? { getContext: () => c2d, toBlob: (cb) => cb(new Blob([PNG1], { type: 'image/png' })) } : el0(tag));
  c.document.querySelector = (q) => (q === 'link[rel="canonical"]' ? { href: 'https://omran-ai-builder.vercel.app/' } : null);
  Object.assign(c, { __imp: async () => ({ FFmpeg: FakeFF }), TextDecoder, TextEncoder, Blob, File, location: { origin: 'http://x' },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, OmranQR: { matrix: () => ({ size: 29 }), draw() {} },
    createImageBitmap: async (b, opt) => { F.bitmaps.push(J(opt || null)); return { bitmap: 1 }; },
    ecGrab: async () => { F.bgrabs++; return F.browser ? { canvas: 1 } : null; } });
  const v = read('js/video.js'), IMP = "await import('/ffmpeg/lib/index.js')", body = v.slice(v.indexOf('  async function ecLast('), v.indexOf('  function ecMine('));
  assert.equal(body.split(IMP).length, 2, 'استيراد الأداة مرّة');
  vm.runInContext(body.replace(IMP, 'await __imp()'), c); /* vm لا يستورد: الأداة المزيّفة مكانها */
  return Object.assign(p, { F });
}
const VTS = '#tb 0: 1/1000\n0,          0,          0,       33,     4821, 0x1\n0,         33,       1967,       33,      812, 0x2\n0,         66,       1934,       33,      790, 0x3\n';
/* MP4 قُصّ آخره بقائمة التحرير (مراجعة ثالثة): الحزم بعد القصّ تبقى حتّى المفتاح التالي بعلامة DISCARD ‏(F=0x4) — تُفكّ ولا تُعرض.
   آخر عرض ١٩٫٩٦٧ ث لا ٤٠ ث؛ والمفتاح بلا F= (framecrc لا يكتبها لمفتاح عاديّ)، وS= بعد F= */
const VTS_EDIT = '#tb 0: 1/1000\n0,          0,          0,       33,     4821, 0x1\n0,         33,      19934,       33,      812, 0x2, F=0x0\n'
  + '0,         66,      19967,       33,      790, 0x3, F=0x0, S=1,        8\n0,        100,      20000,       33,     9585, 0x4, F=0x5\n'
  + '0,        133,      30000,       33,     1340, 0x5, F=0x14\n0,        166,      40000,       33,     1340, 0x6, F=0x4, S=1,        8\n';
const steps = (F) => F.execs.map((a) => (a === '-i /ecin/input' ? 'probe' : /ec_tb\.txt$/.test(a) ? 'atb' : /ec_vts\.txt$/.test(a) ? 'scan'
  : /ec_last\.png$/.test(a) ? (a.startsWith('-i ') ? 'start' : a.split(' -i ')[0]) : /ec_card\.mp4$/.test(a) ? 'card' : /ec_out\.mp4$/.test(a) ? 'join' : a));

test('٢٤. ecMake نفسه بأداة مزيّفة: آخر لقطة من آخر الفيديو لا الحاوية وبلا وسوم ألوان، والمتصفّح آخر حلّ للبطيء، والرقم لا يرجع ولا يكتبه عمل أُلغي', async () => {
  // البطيء (VP9) وصوته أطول: نافذة الحاوية فارغة ← حزم الفيديو بلا فكّ ← آخر عرض ١٫٩٦٧ ث (B-frames: ليس آخر سطر) ← نافذة منه
  let L = ecLive({ log: 'vp9', vts: VTS, grab: (a) => a.startsWith('-ss ') });
  const ps = [], file = vfileE('v.webm', 'video/webm');
  const out = await L.ctx.ecMake(file, L.ctx.EC.run, (x) => ps.push(Math.round(x)));
  assert.deepEqual(steps(L.F), ['probe', 'atb', '-sseof -0.3', 'scan', '-ss 1.667', 'card', 'join'], 'كانت نوافذ الحاوية وحدها: صوت أطول = لا لقطة');
  const g = L.F.execs.find((a) => a.startsWith('-ss '));
  assert.ok(g.endsWith('-map 0:0 -an -sn -dn -vf scale=in_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=rgb24,setparams=color_primaries=unknown:color_trc=unknown,sidedata=mode=delete -update 1 ec_last.png'), g);
  assert.ok(L.F.execs.includes('-i /ecin/input -map 0:0 -c copy -f framecrc ec_vts.txt'), 'الفيديو وحده ونسخ بلا فكّ');
  assert.deepEqual([L.F.bitmaps, L.F.bgrabs], [[{ colorSpaceConversion: 'none' }], 0], 'PNG يُفكّ بلا إدارة ألوان، والمتصفّح لا يُسأل حين تنجح الأداة');
  assert.deepEqual(ps, [6, 8, 12, 14, 20, 44], 'لا ٠٪ أثناء أخذ اللقطة، ولا قفزة «لا حزمة بعد» إلى آخر المرحلة ثمّ رجوع');
  assert.deepEqual([out.name, out.type, out.size], ['v-om-ai.mp4', 'video/mp4', 4096]);
  // كلّ نوافذ الأداة فارغة: الفيديو الأقصر من النافذة من أوّله بلا قفز (القفز إلى ٠ لا يُخرج شيئًا من WebM بتوقيت سالب)، ثمّ نوافذ
  // الحاوية كما كانت قبل المراجعتين، ثمّ المتصفّح آخر حلّ؛ والمكرّر لا يُعاد — ولا لقطة منه ولا منها = «frame»
  L = ecLive({ log: 'vp9', vts: VTS, grab: () => false }); L.F.browser = true;
  await L.ctx.ecMake(file, L.ctx.EC.run, () => {});
  assert.deepEqual([steps(L.F).slice(2), L.F.bgrabs], [['-sseof -0.3', 'scan', '-ss 1.667', 'start', '-sseof -3', '-sseof -15', 'card', 'join'], 1]);
  // قائمة التحرير: حزم DISCARD لا تُحسب — كانت آخر توقيت ٤٠ ث فكلّ النوافذ بعد آخر لقطة معروضة (فارغة) و«ما قدرت أضيفه» حيث نجح 2d06e7a1
  L = ecLive({ log: 'vp9', vts: VTS_EDIT, grab: (a) => a.startsWith('-ss 19.667 ') });
  await L.ctx.ecMake(file, L.ctx.EC.run, () => {});
  assert.deepEqual([steps(L.F).slice(2), L.F.bgrabs], [['-sseof -0.3', 'scan', '-ss 19.667', 'card', 'join'], 0], 'آخر عرض ١٩٫٩٦٧ لا ٤٠');
  // وما وجده 2d06e7a1 (نوافذ الحاوية) يُجرَّب بعد نوافذ الحزم ولا يضيع
  L = ecLive({ log: 'vp9', vts: VTS_EDIT, grab: (a) => a.startsWith('-sseof -15 ') });
  await L.ctx.ecMake(file, L.ctx.EC.run, () => {});
  assert.deepEqual([steps(L.F).slice(2), L.F.bgrabs], [['-sseof -0.3', 'scan', '-ss 19.667', '-ss 16.967', '-ss 4.967', '-sseof -3', '-sseof -15', 'card', 'join'], 0]);
  L = ecLive({ log: 'vp9', vts: VTS, grab: () => false });
  await assert.rejects(L.ctx.ecMake(file, L.ctx.EC.run, () => {}), (e) => e.code === 'frame');
  // حزم لا تُقرأ: نوافذ الحاوية الأوسع كما كانت
  L = ecLive({ log: 'vp9', vts: null, grab: (a) => a.startsWith('-sseof -15') });
  await L.ctx.ecMake(file, L.ctx.EC.run, () => {});
  assert.deepEqual([steps(L.F).slice(2), L.F.bgrabs], [['-sseof -0.3', 'scan', '-sseof -3', '-sseof -15', 'card', 'join'], 0]);
  // السريع (H.264+AAC): المتصفّح أوّلًا ولا أمر لقطة؛ وإن فشل فالأداة ولا عودة للمتصفّح
  L = ecLive({ log: 'google', vts: VTS, grab: () => true }); L.F.browser = true;
  await L.ctx.ecMake(vfileE('g.mp4', 'video/mp4'), L.ctx.EC.run, () => {});
  assert.deepEqual([steps(L.F), L.F.bgrabs], [['probe', 'atb', 'card', 'join'], 1]);
  L = ecLive({ log: 'google', vts: VTS, grab: () => true });
  await L.ctx.ecMake(vfileE('g.mp4', 'video/mp4'), L.ctx.EC.run, () => {});
  assert.deepEqual([steps(L.F), L.F.bgrabs], [['probe', 'atb', '-sseof -0.3', 'card', 'join'], 1]);
  // إطفاء الخيار أثناء قراءة مقياس الصوت: terminate يرفض القراءة فيبتلعها catch — كان يكمل ويكتب «٨٪» تحت الصندوق والعمل متوقّف
  L = ecLive({ log: 'google', vts: VTS, grab: () => true }); L.F.holdRead = 'ec_tb.txt';
  L.ctx.upPick(vfileE('h.mp4', 'video/mp4'));
  for (let i = 0; i < 40 && !L.F.holds.length; i++) await flush();
  assert.deepEqual([L.F.holds.length, L.els.vdUpMsg.textContent], [1, 'vdEcWork {"p":6}'], 'القراءة معلّقة');
  L.ctx.ecToggle(false); await flush(); await flush();
  assert.deepEqual([L.els.vdUpMsg.textContent, L.ctx.EC.busy, steps(L.F)], ['', false, ['probe', 'atb']], 'لا رسالة ولا أمر بعد الإلغاء');
  L.F.holds[0](); await flush();
  assert.equal(L.els.vdUpMsg.textContent, '');
});
