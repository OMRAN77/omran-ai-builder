// tests/director-publish.test.cjs — v-director-publish (المالك ٧ نوفمبر: «اي فيديو الي اسويه اقدر ارسله الي اي مكان… ضيفها عندي في المخرج»،
// واختار «انشر في حساباتي»): زرّ تحت فيديو «مخرج التطبيق» ينشره في حسابات المالك الموصولة بخدمة النشر التي يستعملها بوت التسويق.
// الخادم (api/_lib/social-publish.js) بشبكة وRedis محاكيين — لا نشر حقيقيّ ولا رفع: المالك وحده، المنصّات الموصولة، هدف رفع لا يكشف
// رابط الملفّ، نشر واحد لكلّ ملفّ ومنصّاته، الحالة لكلّ منصّة، ولا مفتاح ولا رابط في ردّ أو سجلّ. ثمّ الواجهة والنصوص بالـ١٤ لغة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
const kv = new Map(), ttl = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetRaw: async (k) => (kv.has(k) ? kv.get(k) : null),
  kvSetRaw: async (k, v, t) => { kv.set(k, String(v)); ttl.set(k, t); },
  kvSetIfAbsent: async (k, v, t) => { if (kv.has(k)) return false; kv.set(k, String(v)); ttl.set(k, t); return true; },
  kvDel: async (k) => { kv.delete(k); ttl.delete(k); },
} };

// ── الشبكة: كلّ نداء يُسجَّل، والردّ من جدول ──
const calls = [];
let routes = {};
global.fetch = async (url, opts) => {
  const o = opts || {};
  calls.push({ url: String(url), method: o.method || 'GET', headers: o.headers || {}, body: o.body });
  const hit = Object.keys(routes).find((p) => String(url).includes(p));
  if (!hit) throw new Error('unexpected fetch ' + url);
  const r = typeof routes[hit] === 'function' ? routes[hit](url, o) : routes[hit];
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
};

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

test('٤. النشر: الملفّ المرفوع وحده، نصّ كلّ منصّة بحدّها، صفحة فيسبوك om ai، ونشر واحد لكلّ ملفّ ومنصّاته', async () => {
  calls.length = 0; kv.clear();
  const id = 'a'.repeat(24);
  kv.set('socpub:file:' + id, 'https://v3.fal.media/files/om-2.mp4');
  let uploads = 0;
  routes = {
    '/uploadposts/facebook/pages': { status: 200, body: { pages: [{ id: '111', name: 'Other page' }, { id: '222', name: 'om ai' }] } },
    '/api/upload': () => { uploads++; return { status: 200, body: { success: true, request_id: 'srv-req-1', message: 'Upload initiated successfully in background.' } }; },
  };
  assert.equal((await call('publish', { token: owner(), id: 'b'.repeat(24), caption: 'x', platforms: ['instagram'] })).body.error, 'no_file');
  assert.equal((await call('publish', { token: owner(), id: '../x', caption: 'x', platforms: ['instagram'] })).body.error, 'bad_id');
  assert.equal((await call('publish', { token: owner(), id, caption: '  ', platforms: ['instagram'] })).body.error, 'no_caption');
  assert.equal((await call('publish', { token: owner(), id, caption: 'x', platforms: ['myspace'] })).body.error, 'no_platforms');
  assert.equal(uploads, 0);
  const longCap = 'عنوان الفيديو ' + 'ط'.repeat(120) + '\n' + 'تفاصيل '.repeat(80) + '#omai';
  const plats = ['instagram', 'facebook', 'youtube', 'x', 'threads', 'tiktok', 'instagram', 'linkedin'];
  const r = await call('publish', { token: owner(), id, caption: longCap, platforms: plats });
  assert.equal(r.status, 200);
  assert.equal(r.body.request, 'srv-req-1');
  leaks(r.body);
  const up = calls.find((c) => c.url.endsWith('/api/upload'));
  assert.equal(up.headers.Authorization, 'Apikey ' + UP_KEY);
  const fd = up.body;
  assert.equal(fd.get('user'), 'omranaibuilder');
  assert.deepEqual(fd.getAll('platform[]'), ['instagram', 'facebook', 'youtube', 'x', 'threads', 'tiktok']);
  assert.equal(fd.get('video'), 'https://v3.fal.media/files/om-2.mp4');
  assert.equal(fd.get('async_upload'), 'true');
  assert.match(fd.get('request_id'), new RegExp('^omdir-' + id + '-[0-9a-f]{6}$'));
  assert.equal(up.headers['Idempotency-Key'], fd.get('request_id'));
  assert.equal(fd.get('media_type'), 'REELS');
  assert.equal(fd.get('facebook_page_id'), '222');
  assert.equal(fd.get('facebook_media_type'), 'VIDEO');
  assert.ok(fd.get('youtube_title').length <= 100 && fd.get('youtube_title').startsWith('عنوان الفيديو') && !fd.get('youtube_title').includes('\n'));
  assert.ok(fd.get('x_title').length <= 280 && fd.get('x_title').endsWith('…'));
  assert.ok(fd.get('threads_title').length <= 500);
  assert.equal(fd.get('title'), longCap.trim());
  assert.equal(fd.get('privacy_level'), 'PUBLIC_TO_EVERYONE');
  // الضغطة الثانية بالمنصّات نفسها (بترتيب آخر) = الطلب نفسه بلا نشر ثانٍ
  const again = await call('publish', { token: owner(), id, caption: longCap, platforms: ['tiktok', 'threads', 'x', 'youtube', 'facebook', 'instagram'] });
  assert.equal(again.body.again, true);
  assert.equal(uploads, 1);
  // الفيديو نفسه لمنصّة أخرى = طلب جديد
  const other = await call('publish', { token: owner(), id, caption: 'ثاني', platforms: ['youtube'] });
  assert.equal(other.status, 200); assert.equal(uploads, 2); assert.notEqual(other.body.again, true);
});

test('٥. رفض صريح قبل البدء (حدّ الشهر) يُعلَن ويسمح بمحاولة ثانية؛ والانقطاع بعد الإرسال لا يعيد النشر', async () => {
  calls.length = 0; kv.clear();
  const id = 'c'.repeat(24);
  kv.set('socpub:file:' + id, 'https://v3.fal.media/files/om-3.mp4');
  routes = { '/api/upload': { status: 429, body: { error: 'Monthly limit exceeded' } } };
  const r = await call('publish', { token: owner(), id, caption: 'x', platforms: ['instagram'] });
  assert.deepEqual([r.status, r.body.error], [502, 'limit']);
  routes = { '/api/upload': { status: 200, body: { request_id: 'srv-2' } } };
  assert.equal((await call('publish', { token: owner(), id, caption: 'x', platforms: ['instagram'] })).body.request, 'srv-2');
  kv.clear(); kv.set('socpub:file:' + id, 'https://v3.fal.media/files/om-3.mp4');
  routes = { '/api/upload': () => { throw new Error('socket hang up https://api.upload-post.com/api/upload'); } };
  const lost = await call('publish', { token: owner(), id, caption: 'x', platforms: ['x'] });
  assert.equal(lost.status, 200); assert.equal(lost.body.unsure, true); assert.match(lost.body.request, /^omdir-/);
  const n = calls.length;
  assert.equal((await call('publish', { token: owner(), id, caption: 'x', platforms: ['x'] })).body.again, true);
  assert.equal(calls.length, n, 'لا إرسال ثانٍ بعد انقطاع');
});

test('٦. الحالة لكلّ منصّة: نزل / ما نزل بسببه / ينتظر، ورابط المنشور، و٤٠٤ = لم يُسجَّل بعد', async () => {
  routes = { '/uploadposts/status': { status: 200, body: { status: 'in_progress', results: [
    { platform: 'instagram', success: true, post_url: 'https://www.instagram.com/reel/abc/' },
    { platform: 'x', success: false, error: 'Video longer than 140 seconds' },
    { platform: 'youtube', status: 'processing' },
  ] } } };
  const r = await call('status', { token: owner(), request: 'srv-req-1' });
  assert.deepEqual(r.body, { ok: true, state: 'wait', results: [
    { platform: 'instagram', state: 'ok', url: 'https://www.instagram.com/reel/abc/', error: '' },
    { platform: 'x', state: 'fail', url: '', error: 'Video longer than 140 seconds' },
    { platform: 'youtube', state: 'wait', url: '', error: '' },
  ] });
  assert.equal(sp.statusOf({ status: 'completed', results: { tiktok: { success: true, url: 'javascript:alert(1)' } } }).results[0].url, '', 'رابط غير https لا يُعرض');
  assert.equal(sp.statusOf({ status: 'completed' }).state, 'done');
  assert.equal(sp.statusOf({ status: 'failed' }).state, 'fail');
  routes = { '/uploadposts/status': { status: 404, body: { status: 'not_found' } } };
  assert.deepEqual((await call('status', { token: owner(), request: 'srv-req-9' })).body, { ok: true, state: 'wait', results: [] });
  assert.equal((await call('status', { token: owner(), request: 'a b' })).body.error, 'bad_request');
  assert.ok(!con.join('\n').includes(UP_KEY) && !con.join('\n').includes(FAL), 'لا مفتاح في السجلّ');
});

test('٧. الموجّه والواجهة: media يوزّع الإجراء، والزرّ للمالك تحت الفيديو، والموافقة قبل أيّ رفع أو نشر', () => {
  assert.match(read('api/media.js'), /case 'social-publish': return require\('\.\/_lib\/social-publish\.js'\);/);
  const src = read('api/_lib/social-publish.js');
  assert.doesNotMatch(src.split('module.exports = async')[0].replace(/const (upKey|upUser|falKey) = \(\) => [^\n]+/g, ''), /process\.env/, 'المفاتيح تُقرأ داخل المعالج');
  const v = read('js/video.js');
  assert.match(v, /id="vdPubBtn"/); assert.match(v, /id="vdPub" hidden/);
  assert.match(v, /'\/api\/media\?action=social-publish&op='\+op/);
  const go = v.slice(v.indexOf('async function pbGo(){'), v.indexOf('function pbPoll('));
  assert.ok(go.includes('!drOwner()'), 'المالك وحده');
  const conf = go.indexOf('window.confirm('), tgt = go.indexOf("pbApi('target'"), pub = go.indexOf("pbApi('publish'");
  assert.ok(conf > 0 && conf < tgt && tgt < pub, 'الموافقة ثمّ الرفع ثمّ النشر');
  assert.ok(go.indexOf("L('vdPubNeedCap')") < conf && go.indexOf("L('vdPubPick')") < conf, 'النصّ والمنصّة قبل السؤال');
  assert.match(v, /PB\.src!==DR\.out\|\|!PB\.id/, 'الفيديو نفسه لا يُرفع مرّتين');
  const css = read('css/modules.css');
  for (const c of ['.vmk-dir-acts', '.vmk-pub{', '.vmk-pub-plats label', '.vmk-pub-go', '.vmk-pub-res li.is-ok']) assert.ok(css.includes(c), c);
});

test('٨. النصوص الاثنان والعشرون بالـ١٤ لغة بلا اسم مزوّد، والوسوم مرفوعة', () => {
  const KEYS = ['vdPubBtn', 'vdPubCap', 'vdPubPh', 'vdPubGo', 'vdPubLoading', 'vdPubNoAcc', 'vdPubReauth', 'vdPubNoKey', 'vdPubNeedCap', 'vdPubPick', 'vdPubConfirm',
    'vdPubUp', 'vdPubSent', 'vdPubOk', 'vdPubNo', 'vdPubWait', 'vdPubOpen', 'vdPubDone', 'vdPubSlow', 'vdPubFail', 'vdPubLimit', 'vdPubBig'];
  const BANNED = /claude|anthropic|gemini|google|\bgpt|openai|runway|\bveo\b|kling|minimax|\bluma\b|\bsora\b/i;
  const base = { $: () => null, document: { getElementById: () => null, querySelector: () => null }, window: {}, localStorage: { getItem: () => null } }; base.window = base;
  vm.runInNewContext(read('js/app-03-i18n-data.js'), base);
  for (const lg of ['ar', 'en']) for (const k of KEYS) { const v = base.I18N[lg][k]; assert.ok(v && v.length > 1, lg + ' ' + k); assert.doesNotMatch(v, BANNED, lg + ' ' + k); }
  const seen = new Set();
  for (const lg of ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) {
    const m = read('i18n/' + lg + '.js').match(/v-director-publish[^\n]*Object\.assign\(I18N\["(\w+)"\], (\{.*\})\);/);
    assert.ok(m && m[1] === lg, lg + ' كتلة الترجمة');
    const o = JSON.parse(m[2]);
    for (const k of KEYS) {
      assert.ok(o[k] && o[k].trim().length > 1, lg + ' ' + k); assert.doesNotMatch(o[k], BANNED, lg + ' ' + k);
      assert.equal((o[k].match(/\{\w+\}/g) || []).sort().join(), (base.I18N.en[k].match(/\{\w+\}/g) || []).sort().join(), lg + ' ' + k + ' المتغيّرات');
    }
    seen.add(o.vdPubBtn);
  }
  assert.equal(seen.size, 12, 'ترجمات لا نسخ');
  const v = read('js/video.js');
  /* المفاتيح = كلّ نصّ 'vdPub…' في الكود ما عدا معرّفات العناصر (id('…') و'#…') — L(r.state==='ok'?'vdPubOk':…) يُعدّ */
  const used = new Set([...v.matchAll(/(?<!id\()'(vdPub\w+)'/g)].map((m) => m[1]));
  for (const k of used) assert.ok(KEYS.includes(k), 'غير معرَّف: ' + k);
  for (const k of KEYS) assert.ok(used.has(k), 'غير مستعمل: ' + k);
  const tag = read('js/app-04-i18n-state.js').match(/\.js\?v=(\d+)';[^\n]* v-director-publish \((\d+)\): [^\n]*\*\//);
  assert.ok(tag && Number(tag[1]) >= Number(tag[2]) && Number(tag[2]) === 786, 'وسم اللغات مرفوع وسببه آخر التعليق');
  const h = read('index.html');
  assert.ok(Number((/\/js\/video\.js\?v=(\d+)"/.exec(h) || [])[1]) >= 465 && Number((/css\/modules\.css\?v=(\d+)"/.exec(h) || [])[1]) >= 695);
});
