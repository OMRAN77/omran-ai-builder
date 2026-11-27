// tests/social-direct.test.cjs — v-social-direct (المالك ٢٦ نوفمبر: «تبني من الصفر upload-post نفس… بدون أي اشتراكات» بعد رفض دفع
// اشتراك خدمة النشر): النشر المباشر إلى إنستغرام وفيسبوك بتطبيق Meta يملكه المالك، تحت لوحة «انشر في حساباتي» نفسها.
// الخادم بشبكة Meta وRedis محاكيين — لا ربط ولا نشر حقيقيّ: ساكت بلا مفاتيح، ربط بحالة في KV، توكن مشفَّر، نشر مرّة لكلّ منصّة،
// حاوية إنستغرام تُنشر مرّة واحدة وإن تزامن سؤالان، وما بقي للوسيط يُضمّ للطلب نفسه، ولا توكن ولا رابط مزوّد في أيّ ردّ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

for (const k of ['OWNER_USERNAMES', 'OWNER_USERNAME', 'UPLOAD_POST_USER', 'SITE_URL', 'META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_VERSION', 'META_CONFIG_ID', 'UPLOAD_POST_API_KEY']) delete process.env[k];
process.env.AUTH_SECRET = 'social-direct-test-secret';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));
const con = [];
for (const m of ['log', 'warn', 'error']) console[m] = (...a) => { con.push(a.map(String).join(' ')); };

const kv = new Map(), ttl = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetRaw: async (k) => (kv.has(k) ? kv.get(k) : null),
  kvSetRaw: async (k, v, t) => { kv.set(k, String(v)); ttl.set(k, t); },
  kvSetIfAbsent: async (k, v, t) => { if (kv.has(k)) return false; kv.set(k, String(v)); ttl.set(k, t); return true; },
  kvDel: async (k) => { kv.delete(k); ttl.delete(k); },
} };

const calls = [];
let routes = {};
global.fetch = async (url, opts) => {
  const o = opts || {};
  calls.push({ url: String(url), method: o.method || 'GET', body: o.body });
  const hit = Object.keys(routes).filter((p) => String(url).includes(p)).sort((a, b) => b.length - a.length)[0];
  if (!hit) throw new Error('unexpected fetch ' + url);
  const r = typeof routes[hit] === 'function' ? routes[hit](String(url), o) : routes[hit];
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
};

const sp = require(rp('api/_lib/social-publish.js'));
const token = (u) => {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
async function call(op, body, method, query) {
  const out = { status: 0, body: null, headers: {} };
  const res = { setHeader: (k, v) => { out.headers[k] = v; }, status(c) { out.status = c; return this; }, json(b) { out.body = J(b); return this; }, end() { return this; } };
  await sp({ method: method || 'POST', query: Object.assign({ action: 'social-publish', op }, query || {}), headers: {}, body: body || {} }, res);
  return out;
}
const owner = () => ({ token: token('omran') });
const G = 'graph.facebook.com/v23.0', GV = 'graph-video.facebook.com/v23.0';
const PAGE_TOKEN = 'EAAG-page-token-secret-77';
const leaks = (o) => assert.doesNotMatch(JSON.stringify(o), /page-token-secret|app-secret-x|graph\.facebook|graph-video|upload-post|fal\.media|EAAG/i, 'تسريب: ' + JSON.stringify(o));
const metaOn = () => { process.env.META_APP_ID = '1234567890'; process.env.META_APP_SECRET = 'app-secret-x'; };
const params = (c) => new URLSearchParams(c.method === 'GET' ? c.url.split('?')[1] : String(c.body));

test('١. ساكت بلا مفاتيح Meta: الطريق القديم حرفيًّا (لا مفتاح وسيط = ٥٠٣)، ورجوع Meta بـGET مرفوض، ولا نداء شبكة', async () => {
  calls.length = 0;
  assert.deepEqual([(await call('accounts', owner())).status, (await call('accounts', owner())).body.error], [503, 'no_key']);
  assert.equal((await call('meta-cb', {}, 'GET', { state: 'a'.repeat(32), code: 'c' })).status, 405);
  assert.equal((await call('meta-connect', owner())).status, 503, 'بلا مفاتيح لا ربط');
  assert.equal(calls.length, 0);
});

test('٢. «اربط»: المالك وحده، ورابط Meta بحالة عشوائيّة في KV عشر دقائق ونطاقات النشر، بلا سرّ في الردّ', async () => {
  metaOn();
  assert.equal((await call('meta-connect', {})).status, 401);
  assert.equal((await call('meta-connect', { token: token('ali') })).status, 403);
  const r = await call('meta-connect', owner());
  assert.equal(r.status, 200); leaks(r.body);
  const u = new URL(r.body.url);
  assert.equal(u.origin + u.pathname, 'https://www.facebook.com/v23.0/dialog/oauth');
  assert.equal(u.searchParams.get('client_id'), '1234567890');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://omran-ai-builder.vercel.app/api/media?action=social-publish&op=meta-cb');
  for (const s of ['instagram_content_publish', 'instagram_basic', 'pages_manage_posts', 'pages_show_list']) assert.ok(u.searchParams.get('scope').split(',').includes(s), s);
  const st = u.searchParams.get('state');
  assert.match(st, /^[0-9a-f]{32}$/);
  assert.deepEqual([kv.get('socdir:state:' + st), ttl.get('socdir:state:' + st)], ['omran', 600]);
  process.env.META_CONFIG_ID = '987654321';
  const c = new URL((await call('meta-connect', owner())).body.url);
  assert.deepEqual([c.searchParams.get('config_id'), c.searchParams.get('scope')], ['987654321', null], 'تهيئة «للأعمال» بدل النطاقات');
  delete process.env.META_CONFIG_ID;
});

test('٣. رجوع Meta: الحالة تُستهلك مرّة، الرفض والحالة المجهولة لا يربطان، والصفحة المربوطة بإنستغرام تُختار وتوكنها مشفَّر', async () => {
  metaOn();
  const st = new URL((await call('meta-connect', owner())).body.url).searchParams.get('state');
  let r = await call('meta-cb', {}, 'GET', { state: 'b'.repeat(32), code: 'x' });
  assert.deepEqual([r.status, r.headers.Location], [302, 'https://omran-ai-builder.vercel.app/?socpub=fail']);
  routes = {
    [G + '/oauth/access_token']: (u) => ({ status: 200, body: { access_token: /fb_exchange_token/.test(u) ? 'LONG-user' : 'SHORT-user' } }),
    [G + '/me/accounts']: { status: 200, body: { data: [
      { id: 'P0', name: 'Other page', access_token: 'other-token' },
      { id: 'P1', name: 'om ai', access_token: PAGE_TOKEN, instagram_business_account: { id: 'IG1', username: 'om.ai' } },
    ] } },
  };
  calls.length = 0;
  r = await call('meta-cb', {}, 'GET', { state: st, code: 'CODE1' });
  assert.deepEqual([r.status, r.headers.Location], [302, 'https://omran-ai-builder.vercel.app/?socpub=ok']);
  assert.equal(params(calls[0]).get('code'), 'CODE1');
  assert.equal(params(calls[0]).get('redirect_uri'), 'https://omran-ai-builder.vercel.app/api/media?action=social-publish&op=meta-cb');
  assert.equal(params(calls[1]).get('fb_exchange_token'), 'SHORT-user');
  assert.equal(params(calls[2]).get('access_token'), 'LONG-user', 'الصفحات بالتوكن الطويل');
  const raw = kv.get('socdir:meta');
  assert.ok(raw && !raw.includes(PAGE_TOKEN) && !raw.includes('IG1'), 'التوكن مشفَّر في KV');
  assert.equal(kv.has('socdir:state:' + st), false, 'الحالة تُستهلك');
  r = await call('meta-cb', {}, 'GET', { state: st, code: 'CODE1' });
  assert.equal(r.headers.Location, 'https://omran-ai-builder.vercel.app/?socpub=fail', 'لا إعادة استعمال');
  const st2 = new URL((await call('meta-connect', owner())).body.url).searchParams.get('state');
  r = await call('meta-cb', {}, 'GET', { state: st2, error: 'access_denied' });
  assert.equal(r.headers.Location, 'https://omran-ai-builder.vercel.app/?socpub=denied');
  assert.ok(!con.join('\n').includes(PAGE_TOKEN));
});

test('٣-ب. رجوع Meta بقائمة صفحات فارغة (تطبيق «للأعمال» أو صفحة في حافظة أعمال): الصفحة من debug_token ثمّ من حافظات الأعمال، وخطأ Graph رمزه لا «لا صفحة»', async () => {
  metaOn();
  const saved = kv.get('socdir:meta'); kv.delete('socdir:meta');
  const cb = async () => call('meta-cb', {}, 'GET', { state: new URL((await call('meta-connect', owner())).body.url).searchParams.get('state'), code: 'C2' });
  const base = { [G + '/oauth/access_token']: (u) => ({ status: 200, body: { access_token: /fb_exchange_token/.test(u) ? 'LONG-user' : 'SHORT-user' } }) };
  // ١) /me/accounts فارغ، والصفحة ممنوحة في granular_scopes
  routes = Object.assign({}, base, {
    [G + '/me/accounts']: { status: 200, body: { data: [] } },
    [G + '/debug_token']: { status: 200, body: { data: { scopes: ['pages_show_list', 'instagram_basic'], granular_scopes: [{ scope: 'pages_show_list', target_ids: ['P1'] }, { scope: 'instagram_basic', target_ids: ['IG1'] }] } } },
    [G + '/P1']: { status: 200, body: { id: 'P1', name: 'OM Ai', access_token: PAGE_TOKEN, instagram_business_account: { id: 'IG1', username: 'om.ai' } } },
  });
  calls.length = 0;
  let r = await cb();
  assert.equal(r.headers.Location, 'https://omran-ai-builder.vercel.app/?socpub=ok', 'الصفحة من الصلاحيّات الممنوحة');
  const dbg = calls.find((c) => c.url.includes('/debug_token'));
  assert.deepEqual([params(dbg).get('input_token'), params(dbg).get('access_token')], ['LONG-user', '1234567890|app-secret-x']);
  assert.equal((await call('accounts', owner())).body.on.join(','), 'instagram,facebook');
  // ٢) لا target_ids: صفحات حافظة الأعمال
  kv.delete('socdir:meta');
  routes = Object.assign({}, base, {
    [G + '/me/accounts']: { status: 200, body: { data: [] } },
    [G + '/debug_token']: { status: 200, body: { data: { scopes: ['pages_show_list'] } } },
    [G + '/me/businesses']: { status: 200, body: { data: [{ id: 'B1', owned_pages: { data: [{ id: 'P1', name: 'OM Ai', access_token: PAGE_TOKEN, instagram_business_account: { id: 'IG1' } }] } }] } },
  });
  r = await cb();
  assert.equal(r.headers.Location, 'https://omran-ai-builder.vercel.app/?socpub=ok', 'الصفحة من حافظة الأعمال');
  // ٣) لا شيء في أيّ مصدر: no_page مع سبب في السجلّ (الصلاحيّات الممنوحة، بلا توكن)
  kv.delete('socdir:meta'); con.length = 0;
  routes[G + '/me/businesses'] = { status: 200, body: { data: [] } };
  r = await cb();
  assert.equal(r.headers.Location, 'https://omran-ai-builder.vercel.app/?socpub=no_page');
  assert.match(con.join('\n'), /no pages; granted=pages_show_list/);
  // ٤) خطأ Graph على الصفحات: رمزه في الرجوع لا «لا صفحة»
  routes[G + '/me/accounts'] = { status: 400, body: { error: { code: 200, message: 'Permissions error' } } };
  r = await cb();
  assert.equal(r.headers.Location, 'https://omran-ai-builder.vercel.app/?socpub=fail-pages-e200', 'الخطوة في الرمز');
  // v-social-direct-step: الحقل المتداخل يُسقط القائمة (code 1) ← قائمة خفيفة ثمّ إنستغرام لكلّ صفحة وحدها
  kv.delete('socdir:meta');
  routes[G + '/me/accounts'] = (u) => (/instagram_business_account/.test(decodeURIComponent(u))
    ? { status: 500, body: { error: { code: 1, message: 'An unknown error has occurred.' } } }
    : { status: 200, body: { data: [{ id: 'P1', name: 'OM Ai', access_token: PAGE_TOKEN }] } });
  routes[G + '/P1'] = { status: 200, body: { id: 'P1', instagram_business_account: { id: 'IG1', username: 'om.ai' } } };
  calls.length = 0;
  r = await cb();
  assert.equal(r.headers.Location, 'https://omran-ai-builder.vercel.app/?socpub=ok', 'القائمة الخفيفة تكفي');
  assert.equal(params(calls.find((c) => c.url.includes('/P1?'))).get('access_token'), PAGE_TOKEN, 'إنستغرام بتوكن الصفحة');
  assert.equal((await call('accounts', owner())).body.on.join(','), 'instagram,facebook');
  // سرّ التطبيق الخاطئ: الخطوة «token» برمزها
  kv.delete('socdir:meta');
  routes[G + '/oauth/access_token'] = { status: 400, body: { error: { code: 1, message: 'Error validating client secret.' } } };
  r = await cb();
  assert.equal(r.headers.Location, 'https://omran-ai-builder.vercel.app/?socpub=fail-token-e1');
  assert.ok(!con.join('\n').includes(PAGE_TOKEN) && !con.join('\n').includes('app-secret-x'), 'لا توكن ولا سرّ في السجلّ');
  kv.set('socdir:meta', saved);
});

test('٤. الحسابات: المباشر لا يأخذ منصّة من الوسيط قبل أن ينربط — الموصول عند الوسيط يبقى موصولًا، و«يحتاج ربط» لما ليس موصولًا في أيّهما', async () => {
  metaOn();
  process.env.UPLOAD_POST_API_KEY = 'up-k';
  // حال المالك: إنستغرام موصول عند الوسيط، فيسبوك يحتاج إعادة ربط عنده، وX موصول
  routes = { '/uploadposts/users': { status: 200, body: { profiles: [{ username: 'omranaibuilder', social_accounts: { instagram: { u: 1 }, facebook: { u: 1, reauth_required: true }, twitter: { u: 1 }, tiktok: { reauth_required: true } } }] } } };
  let r = await call('accounts', owner());
  assert.deepEqual([r.body.on, r.body.reauth, r.body.connect], [['instagram', 'facebook', 'x'], ['tiktok'], []], 'Meta مربوط: المنصّتان مباشرتان');
  leaks(r.body);
  const saved = kv.get('socdir:meta'); kv.delete('socdir:meta');
  r = await call('accounts', owner());
  assert.deepEqual([r.body.on, r.body.reauth, r.body.connect], [['instagram', 'x'], ['facebook', 'tiktok'], ['facebook']],
    'Meta غير مربوط: إنستغرام الموصول عند الوسيط يبقى ✓ (كان ينقلب «يحتاج إعادة ربط»)، وفيسبوك مدخل الربط المباشر');
  // والنشر لإنستغرام يذهب بالطريق القديم حرفيًّا ما دام Meta غير مربوط
  kv.set('socpub:file:' + 'e'.repeat(24), 'https://v3.fal.media/files/om-9.mp4');
  routes['/api/upload'] = { status: 200, body: { success: true, request_id: 'upreq-legacy-1' } }; // أقصر من مسار الحسابات فلا يغلبه
  calls.length = 0;
  const pub = await call('publish', Object.assign(owner(), { id: 'e'.repeat(24), caption: 'نصّ', platforms: ['instagram', 'x'] }));
  assert.deepEqual([pub.status, pub.body.request], [200, 'upreq-legacy-1'], 'طلب الوسيط نفسه لا sd-');
  assert.deepEqual(calls.find((c) => c.url.endsWith('/api/upload')).body.getAll('platform[]'), ['instagram', 'x']);
  assert.equal(calls.some((c) => /graph(-video)?\.facebook\.com/.test(c.url)), false, 'لا نداء Meta');
  // الوسيط لا يعرف فيسبوك أصلًا: يبقى مدخلًا للربط المباشر
  routes['/uploadposts/users'] = { status: 200, body: { profiles: [{ username: 'omranaibuilder', social_accounts: { instagram: { u: 1 }, facebook: '', twitter: { u: 1 } } }] } };
  r = await call('accounts', owner());
  assert.deepEqual([r.body.on, r.body.reauth, r.body.connect], [['instagram', 'x'], ['facebook'], ['facebook']]);
  // سؤال الوسيط فشل: المباشر وحده، ولا ٥٠٢
  routes['/uploadposts/users'] = { status: 500, body: {} };
  r = await call('accounts', owner());
  assert.deepEqual([r.status, r.body.on, r.body.connect], [200, [], ['instagram', 'facebook']]);
  kv.set('socdir:meta', saved);
  delete process.env.UPLOAD_POST_API_KEY;
  r = await call('accounts', owner());
  assert.deepEqual([r.status, r.body.on, r.body.reauth], [200, ['instagram', 'facebook'], []], 'بلا وسيط يكفي المباشر');
});

const VID = 'a'.repeat(24);
test('٥. النشر: فيسبوك فيديو الصفحة وإنستغرام حاوية ريلز من الرابط العامّ، وX للوسيط في الطلب نفسه، ومرّة لكلّ منصّة', async () => {
  metaOn();
  process.env.UPLOAD_POST_API_KEY = 'up-k';
  kv.set('socpub:file:' + VID, 'https://v3.fal.media/files/om-1.mp4');
  routes = {
    [GV + '/P1/videos']: { status: 200, body: { id: 'FBV1' } },
    [G + '/IG1/media']: { status: 200, body: { id: 'BOX1' } },
    'api.upload-post.com/api/upload': { status: 200, body: { success: true, request_id: 'upreq-123456' } },
  };
  calls.length = 0;
  const r = await call('publish', Object.assign(owner(), { id: VID, caption: 'سطر أوّل\nوصف #omai', platforms: ['instagram', 'facebook', 'x'] }));
  assert.equal(r.status, 200); leaks(r.body);
  assert.match(r.body.request, /^sd-a{24}-[0-9a-f]{8}$/);
  assert.deepEqual([r.body.already, r.body.held], [[], {}]);
  const fb = calls.find((c) => c.url.includes('/P1/videos')), ig = calls.find((c) => c.url.includes('/IG1/media'));
  assert.deepEqual([params(fb).get('file_url'), params(fb).get('title'), params(fb).get('access_token')], ['https://v3.fal.media/files/om-1.mp4', 'سطر أوّل', PAGE_TOKEN]);
  assert.deepEqual([params(ig).get('media_type'), params(ig).get('video_url'), params(ig).get('caption'), params(ig).get('share_to_feed')], ['REELS', 'https://v3.fal.media/files/om-1.mp4', 'سطر أوّل\nوصف #omai', 'true']);
  const up = calls.find((c) => c.url.endsWith('/api/upload'));
  assert.deepEqual(up.body.getAll('platform[]'), ['x'], 'الوسيط يأخذ ما بقي وحده');
  const rec = JSON.parse(kv.get('socdir:req:' + r.body.request));
  assert.deepEqual([rec.up, rec.upPlats, rec.jobs.facebook.id, rec.jobs.instagram.box], ['upreq-123456', ['x'], 'FBV1', 'BOX1']);
  calls.length = 0;
  const again = await call('publish', Object.assign(owner(), { id: VID, caption: 'x', platforms: ['instagram', 'facebook'] }));
  assert.deepEqual([again.body.again, again.body.already, again.body.held], [true, ['instagram', 'facebook'], { instagram: r.body.request, facebook: r.body.request }]);
  assert.equal(calls.length, 0, 'لا نشر ثانٍ');
  globalThis.__REQ = r.body.request;
});

test('٦. الحالة: ينتظر حتّى يجهز، وحاوية إنستغرام تُنشر مرّة واحدة وإن تزامن سؤالان، والروابط العلنيّة، وX من الوسيط', async () => {
  metaOn();
  process.env.UPLOAD_POST_API_KEY = 'up-k';
  const req = globalThis.__REQ;
  let fbS = 'processing', boxS = 'IN_PROGRESS', pubs = 0;
  routes = {
    [G + '/FBV1']: () => ({ status: 200, body: { status: { video_status: fbS }, permalink_url: '/omai/videos/FBV1/' } }),
    [G + '/BOX1']: () => ({ status: 200, body: { status_code: boxS } }),
    [G + '/IG1/media_publish']: () => { pubs++; return { status: 200, body: { id: 'MEDIA1' } }; },
    [G + '/MEDIA1']: { status: 200, body: { permalink: 'https://www.instagram.com/reel/abc/' } },
    '/uploadposts/status': { status: 200, body: { status: 'completed', results: [{ platform: 'x', status: 'completed', post_url: 'https://x.com/omai/status/1' }] } },
  };
  let r = await call('status', Object.assign(owner(), { request: req }));
  assert.equal(r.body.state, 'wait');
  assert.deepEqual(r.body.results.map((x) => [x.platform, x.state]), [['instagram', 'wait'], ['facebook', 'wait'], ['x', 'ok']]);
  fbS = 'ready'; boxS = 'FINISHED';
  const [a, b] = await Promise.all([call('status', Object.assign(owner(), { request: req })), call('status', Object.assign(owner(), { request: req }))]);
  assert.equal(pubs, 1, 'نشر واحد للحاوية');
  r = await call('status', Object.assign(owner(), { request: req }));
  assert.equal(pubs, 1);
  assert.equal(r.body.state, 'done'); leaks(r.body.results.filter((x) => x.platform !== 'x'));
  assert.deepEqual(r.body.results.map((x) => [x.platform, x.state, x.url]), [
    ['instagram', 'ok', 'https://www.instagram.com/reel/abc/'], ['facebook', 'ok', 'https://www.facebook.com/omai/videos/FBV1/'], ['x', 'ok', 'https://x.com/omai/status/1']]);
  assert.ok(a.body.ok && b.body.ok);
  assert.deepEqual(J(await call('status', Object.assign(owner(), { request: 'sd-' + 'b'.repeat(24) + '-00000000' }))).body, { ok: true, state: 'fail', lost: true, results: [] });
});

test('٧. الفشل: حاوية فاشلة تحرّر المنصّة فتُعاد، وتوكن منتهٍ (190) يرجّع «يحتاج ربط»، والوسيط الرافض «ما نزل» لمنصّاته وحدها', async () => {
  metaOn();
  process.env.UPLOAD_POST_API_KEY = 'up-k';
  const V2 = 'c'.repeat(24);
  kv.set('socpub:file:' + V2, 'https://v3.fal.media/files/om-2.mp4');
  routes = {
    [G + '/IG1/media']: { status: 200, body: { id: 'BOX2' } },
    [G + '/BOX2']: { status: 200, body: { status_code: 'ERROR' } },
    'api.upload-post.com/api/upload': { status: 402, body: { message: 'Payment required' } },
  };
  const r = await call('publish', Object.assign(owner(), { id: V2, caption: 'نصّ', platforms: ['instagram', 'tiktok'] }));
  assert.equal(r.status, 200);
  let s = await call('status', Object.assign(owner(), { request: r.body.request }));
  assert.deepEqual([s.body.state, s.body.results.map((x) => [x.platform, x.state])], ['done', [['instagram', 'fail'], ['tiktok', 'fail']]]);
  leaks(s.body);
  assert.equal(kv.has('socdir:sent:' + V2 + ':instagram'), false, 'المنصّة تحرّرت');
  routes[G + '/IG1/media'] = { status: 400, body: { error: { code: 190, message: 'Error validating access token' } } };
  const r2 = await call('publish', Object.assign(owner(), { id: V2, caption: 'نصّ', platforms: ['instagram'] }));
  s = await call('status', Object.assign(owner(), { request: r2.body.request }));
  assert.deepEqual(s.body.results.map((x) => [x.platform, x.state, x.error]), [['instagram', 'fail', 'e190']]);
  delete process.env.UPLOAD_POST_API_KEY;
  const acc = await call('accounts', owner());
  assert.deepEqual([acc.body.on, acc.body.connect], [[], ['instagram', 'facebook']], 'توكن منتهٍ = ربط من جديد');
});

test('٧-ب. v-social-direct-why: سبب عدم الربط جنب المنصّة — سرّ التطبيق يُفحص ويُخزَّن عشر دقائق، ثمّ آخر نتيجة رجوع للمالك وحده', async () => {
  metaOn();
  delete process.env.UPLOAD_POST_API_KEY;
  kv.delete('socdir:meta'); kv.delete('socdir:meta:reauth'); kv.delete('socdir:meta:check'); kv.delete('socdir:meta:last');
  // ١) السرّ مرفوض: الرمز مباشرة، بلا ضغط ولا لقطة
  routes = { [G + '/1234567890']: { status: 400, body: { error: { code: 1, message: 'Error validating client secret.' } } } };
  calls.length = 0;
  let r = await call('accounts', owner());
  assert.deepEqual([r.body.connect, r.body.why], [['instagram', 'facebook'], 'secret-e1']);
  assert.equal(params(calls[0]).get('access_token'), '1234567890|app-secret-x', 'رمز التطبيق');
  assert.deepEqual([kv.get('socdir:meta:check'), ttl.get('socdir:meta:check')], ['secret-e1', 600]);
  leaks(r.body);
  calls.length = 0;
  await call('accounts', owner());
  assert.equal(calls.length, 0, 'الفحص مخزَّن — لا نداء في كلّ فتح');
  // ٢) السرّ سليم: آخر نتيجة رجوع (فشل الصفحات مثلًا)
  kv.delete('socdir:meta:check');
  routes = { [G + '/1234567890']: { status: 200, body: { id: '1234567890' } } };
  kv.set('socdir:meta:last', JSON.stringify({ why: 'fail-pages-e10', at: 1 }));
  assert.equal((await call('accounts', owner())).body.why, 'fail-pages-e10');
  // ٣) رجوع بلا حالة المالك لا يكتب «آخر نتيجة»
  await call('meta-cb', {}, 'GET', { state: 'c'.repeat(32), code: 'x' });
  assert.equal(JSON.parse(kv.get('socdir:meta:last')).why, 'fail-pages-e10');
  // ٤) رجوع المالك يكتبها، والربط الناجح يمسح الفحص المخزَّن ويُخفي السبب
  routes = Object.assign({}, routes, {
    [G + '/oauth/access_token']: (u) => ({ status: 200, body: { access_token: /fb_exchange_token/.test(u) ? 'LONG-user' : 'SHORT-user' } }),
    [G + '/me/accounts']: { status: 200, body: { data: [{ id: 'P1', name: 'OM Ai', access_token: PAGE_TOKEN, instagram_business_account: { id: 'IG1' } }] } },
  });
  kv.set('socdir:meta:check', 'ok');
  const st = new URL((await call('meta-connect', owner())).body.url).searchParams.get('state');
  const cb = await call('meta-cb', {}, 'GET', { state: st, code: 'C9' });
  assert.equal(cb.headers.Location, 'https://omran-ai-builder.vercel.app/?socpub=ok');
  assert.deepEqual([JSON.parse(kv.get('socdir:meta:last')).why, kv.has('socdir:meta:check')], ['ok', false]);
  r = await call('accounts', owner());
  assert.deepEqual([r.body.on, r.body.connect, r.body.why], [['instagram', 'facebook'], [], '']);
});

test('٨. اللوحة: «يحتاج إعادة ربط» لمنصّات الربط المباشر قابل للضغط ويفتح رابط Meta وحده، بلا نصّ جديد، والوسم مرفوع', () => {
  const v = read('js/video.js');
  assert.match(v, /PB\.connect=d\.connect\|\|\[\];/);
  assert.match(v, /if\(\(PB\.connect\|\|\[\]\)\.indexOf\(p\)>=0\)\{[^}]*s\.onclick=pbConnect;/);
  assert.match(v, /pbApi\('meta-connect'\)\.then\(function\(d\)\{ if\(d&&d\.ok&&\/\^https:\\\/\\\/www\\\.facebook\\\.com\\\/\/\.test\(String\(d\.url\|\|''\)\)\) location\.href=d\.url;/);
  assert.match(read('index.html'), /\/js\/video\.js\?v=(\d+)/, 'video.js بوسم في index.html');
  // v-social-direct-why: السبب رمزًا جنب المنصّة القابلة للربط
  assert.match(v, /PB\.why=String\(d\.why\|\|''\);/);
  assert.match(v, /s\.textContent=drT\('vdPubReauth',\{p:PB_NAMES\[p\]\|\|p\}\)\+\(\(PB\.why&&\(PB\.connect\|\|\[\]\)\.indexOf\(p\)>=0\)\?' \('\+PB\.why\+'\)':''\);/);
  // v-social-direct-keep: نتيجة رجوع الربط تُلتقط من العنوان وتُمحى، وتقال في اللوحة مرّة إن لم تكن ok — بنصّ «يحتاج إعادة ربط» نفسه
  assert.match(v, /var pbBk=\(typeof location==='undefined'\)\?null:\/\[\?&\]socpub=\(\[a-z0-9_\.\\-\]\{1,40\}\)\/i\.exec\(location\.search\|\|''\); if\(pbBk\)\{ PB_BACK=pbBk\[1\]; history\.replaceState\(null,'',location\.pathname\+location\.hash\); \}/);
  assert.match(v, /if\(d&&d\.ok&&PB_BACK\)\{ var bk=PB_BACK; PB_BACK=''; if\(bk!=='ok'&&!keep\) pbMsg\(drT\('vdPubReauth',\{p:'Instagram \/ Facebook'\}\),true,bk\); \}/);
});
