// tests/credit-out.test.cjs — v-credit-out (أمر المالك ٢١ أكتوبر: «تأكد: إذا رصيد مزوّد الصور أو الفيديو خلصان، المستخدم يشوف رسالة واضحة
// «الخدمة متوقفة مؤقتاً» وما تنخصم منه ولا نقطة. لا تضيف شي جديد، بس تأكد وصلّح إذا فيه خصم.»).
// العرض قبل الإصلاح: نفاد رصيد المزوّد يأتي ٤٢٩ «Your prepayment credits are depleted» فيُقرأ زحامًا («مشغولة الآن، أعد المحاولة») ويعيد
// العميل؛ ردّ صورة مها بلا نوع الخصم فيطابق points.js بالجشع تذكرة اشتراك؛ واستطلاع الفيديو الذي يرفضه المزوّد لا يسوّي التذكرة فتضيع
// النقاط بعد ساعتين. المعالجات الحقيقيّة بتبعيّات مزيّفة وfetch مزيّف — بلا شبكة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, 'api/_lib', f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

process.env.GEMINI_API_KEY = 'test-gemini'; process.env.OPENAI_API_KEY = 'test-openai';
process.env.MINIMAX_API_KEY = 'test-mm'; process.env.FAL_KEY = 'test-fal'; process.env.ACTOR_LIPSYNC_MODEL = 'fal-ai/test/lipsync';
process.env.IMAGE_UPSCALE = 'off'; process.env.IMAGE_CARDS = 'off';
delete process.env.IMAGE_FREE_FALLBACK; delete process.env.IMG_DIAG;

const log = { refunds: [], settles: [] };
const PAY = { ok: true, owner: false, media: 'image', pool: 'img' }; // صورة دُفعت من رصيد اشتراك الصور
let nextPay = PAY;
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const store = new Map();
stub('kv.js', {
  kvGetJSON: async () => null, kvPutJSON: async () => true, kvSetRaw: async () => true, kvGetRaw: async () => null, kvDel: async () => true,
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, Number(v)); return true; },
  kvIncr: async (k) => { const n = (store.get(k) || 0) + 1; store.set(k, n); return n; },
  kvDecrBy: async (k, by) => { const n = (store.get(k) || 0) - by; store.set(k, n); return n; },
});
stub('points.js', {
  COSTS: { image: 20, image_creative: 35, image_4k: 30, omni_video: 90 },
  verifyPointsToken: (t) => ({ sara: 'sara' })[t] || null,
  isOwnerUsername: () => false,
  requireConfirmation: (body) => (body && body.confirmed ? null : { status: 428, payload: { error: 'confirm_required' } }),
  spendPoints: async () => nextPay,
  refundPoints: async (u, n, how) => { log.refunds.push([u, n, how]); },
});
stub('_usage.js', { DAILY_LIMIT: 20, clientIp: () => null, checkAndConsume: async () => ({ allowed: true }) });
stub('_mediaPlans.js', { imageQuality: async () => null });
stub('abuse-guard.js', { imageHourlyGuard: async () => ({ ok: true }), videoLock: async () => ({ ok: true }), releaseVideoLock: async () => {} });
stub('tier.js', { resolveTier: async () => ({ tier: 'free' }) });
stub('log-error.js', { logErrorAndFlush: async () => {} });
stub('_videoUsage.js', { checkOwnerBypass: async () => ({ allowed: false, reason: 'not_owner' }), checkVideoQuota: async () => ({ allowed: true }), consumeVideo: async () => 1, isOwner: () => false });
stub('_qualityGate.js', { gateQuality: async (u, q) => q, allowHigh: async () => true });
stub('video-job.js', { rememberVideoJob: async () => true, settleVideoJob: async (id, ok) => { log.settles.push([id, ok]); return null; } });
stub('our-media.js', { rememberOurMedia: async () => {} });
stub('video-upscale-create.js', { rememberOutputs: async () => {} });
stub('runway-keys.js', { resolveTaskId: () => ({ key: 'k', rawId: 'raw' }), RUNWAY_API_BASE: 'https://runway.test' });

function resObj() {
  return { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end(s) { if (typeof s === 'string') { try { this.body = JSON.parse(s); } catch (e) { this.body = s; } } return this; } };
}
async function call(file, req, fetchImpl) {
  const h = require(rp(file));
  const realFetch = global.fetch, realErr = console.error, realWarn = console.warn, realLog = console.log;
  global.fetch = fetchImpl;
  log.refunds.length = 0; log.settles.length = 0;
  console.error = () => {}; console.warn = () => {}; console.log = () => {};
  const res = resObj();
  try { await h(req, res); } finally { global.fetch = realFetch; console.error = realErr; console.warn = realWarn; console.log = realLog; }
  return { code: res.code, body: res.body, refunds: log.refunds.slice(), settles: log.settles.slice() };
}
const reply = (status, body) => async () => Response.json(body, { status });
const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';

test('١. التصنيف: نصّ نفاد الرصيد يسبق «زحام ٤٢٩»، و٤٠١/٤٠٢/٤٠٣ والمفتاح والنموذج unavailable بلا إعادة، والزحام الحقيقيّ ورفض الطلب كما كانا', () => {
  const { startFail, isOutage, TEMP, BAD } = require(rp('_videoFail.js'));
  const U = { code: 503, error: 'unavailable', retry: false };
  const cases = [
    [429, DEPLETED, U],
    [429, 'You exceeded your current quota, please check your plan and billing details.', U],
    [402, 'Payment Required', U],
    [403, 'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.', U],
    [200, 'insufficient balance', U], // رفض منطقيّ بحالة ٢٠٠ (base_resp)
    [401, 'Unauthorized', U],
    [400, 'API key not valid. Please pass a valid API key.', U],
    [404, 'models/x is not found for API version v1beta', U],
    [429, 'Resource has been exhausted (e.g. check quota).', { code: 429, error: TEMP, retry: true }],
    [503, 'Service Unavailable', { code: 503, error: TEMP, retry: true }],
    [400, 'Your prompt was flagged by our content moderation system.', { code: 400, error: BAD, retry: false }],
  ];
  for (const [st, tech, want] of cases) {
    const f = startFail(st, tech);
    assert.equal(f.code, want.code, st + ' ' + tech);
    assert.equal(f.body.error, want.error, st + ' ' + tech);
    assert.equal(f.body.retryable, want.retry, st + ' ' + tech);
  }
  assert.equal(isOutage(429, DEPLETED), true);
  assert.equal(isOutage(429, 'Resource has been exhausted (e.g. check quota).'), false, 'quota وحدها زحام لا نفاد');
  assert.equal(isOutage(500, 'Internal error'), false);
});

test('٢. صورة مها: نفاد رصيد المزوّد = 503 unavailable بلا إعادة، والنقاط تعود إلى المحفظة نفسها (لا ردّ بلا نوع)', async () => {
  nextPay = PAY;
  const r = await call('maha-image.js', { method: 'POST', headers: {}, body: { prompt: 'A red apple on a wooden table, soft daylight', userText: 'ارسم تفاحة حمراء', token: 'sara' } },
    async (url) => (String(url).includes('openai')
      ? Response.json({ error: { message: 'You exceeded your current quota, please check your plan and billing details.', code: 'insufficient_quota' } }, { status: 429 })
      : Response.json({ error: { code: 429, message: DEPLETED, status: 'RESOURCE_EXHAUSTED' } }, { status: 429 })));
  assert.equal(r.code, 503, JSON.stringify(r.body));
  assert.equal(r.body.error, 'unavailable');
  assert.equal(r.body.retryable, false, 'لا إعادة تخصم من جديد');
  assert.equal(r.refunds.length, 1, 'ردّ واحد');
  assert.deepEqual(r.refunds[0].slice(0, 2), ['sara', 20]);
  assert.equal(r.refunds[0][2], PAY, 'الردّ يحمل نتيجة الخصم نفسها (رصيد اشتراك الصور) — كان بلا نوع');
});

test('٢ب. الزحام الحقيقيّ عند الكلّ يبقى busy قابلًا للإعادة كما كان (لا يُقرأ نفادًا)', async () => {
  nextPay = PAY;
  const r = await call('maha-image.js', { method: 'POST', headers: {}, body: { prompt: 'A red apple on a wooden table, soft daylight', userText: 'ارسم تفاحة حمراء', token: 'sara' } },
    async () => Response.json({ error: { message: 'Resource exhausted' } }, { status: 429 }));
  assert.equal(r.body.error, 'image_generation_busy');
  assert.equal(r.body.retryable, true);
  assert.equal(r.refunds[0][2], PAY);
});

test('٣. فرق الصورة الإبداعيّة خصمٌ ثانٍ يعود بنوعه، والأساس بنوعه (لا مبلغ واحد بلا محفظة)', () => {
  const src = read('api/_lib/maha-image.js');
  assert.match(src, /await pointsLib\.refundPoints\(user, amount - extra, mahaImgPay \|\| undefined\);/);
  assert.match(src, /if \(extra\) await pointsLib\.refundPoints\(user, extra, mahaImgExtraPay \|\| undefined\);/);
  assert.match(src, /if \(!__xp\.owner\) \{ mahaImgChargedAmount \+= __extra; mahaImgExtra = __extra; mahaImgExtraPay = __xp; \}/);
  assert.doesNotMatch(src, /refundPoints\(user, amount\);/, 'لا ردّ بلا نوع');
  for (const [f, rx] of [['api/_lib/upscale.js', /refundPoints\(charged, pointsLib\.COSTS\.image_upscale, chargedPay\)/g], ['api/_lib/video-watch.js', /refundPoints\(user, charged, payHere \? pay : undefined\)/g]]) {
    const s = read(f);
    assert.ok((s.match(rx) || []).length >= 1, f);
    assert.doesNotMatch(s, /refundPoints\((?:charged, pointsLib\.COSTS\.image_upscale|user, charged)\)/, f + ': ردّ بلا نوع');
  }
});

test('٤. الفيديو عند البدء: نفاد رصيد المحرّك السينمائيّ = unavailable بلا إعادة، والنقاط تعود بنوعها', async () => {
  nextPay = { ok: true, owner: false };
  const r = await call('omni-create.js', { method: 'POST', body: { promptText: 'قطة تلعب في الحديقة', token: 'sara', confirmed: true } },
    reply(429, { error: { code: 429, message: DEPLETED, status: 'RESOURCE_EXHAUSTED' } }));
  assert.equal(r.code, 503, JSON.stringify(r.body));
  assert.deepEqual(r.body, { error: 'unavailable', retryable: false }, 'كان «أعد المحاولة» retryable:true');
  assert.equal(r.refunds.length, 1);
  assert.equal(r.refunds[0][2], nextPay);
});

test('٥. الاستطلاع: المزوّد يرفضه لنفاد الرصيد = تسوية التذكرة فشلًا (ردّ النقاط) و503 unavailable؛ عطل ٥xx لا يسوّي', async () => {
  const GET = (query) => ({ method: 'GET', query });
  const outage = [
    ['video-status.js', GET({ id: 'task-1' }), reply(402, { error: 'You do not have enough credits to run this task.' }), 'task-1'],
    ['veo-status.js', GET({ op: 'models/veo/operations/9' }), reply(429, { error: { code: 429, message: DEPLETED } }), 'models/veo/operations/9'],
    ['minimax-status.js', GET({ task_id: 'mm-1' }), reply(403, { base_resp: { status_code: 1004, status_msg: 'authorization failed' } }), 'mm-1'],
    ['actor-status.js', GET({ id: 'actor-req-1' }), reply(403, { detail: 'User is locked. Reason: Exhausted balance.' }), 'actor:actor-req-1'],
  ];
  for (const [f, req, net, id] of outage) {
    const r = await call(f, req, net);
    assert.equal(r.code, 503, f + ' ' + JSON.stringify(r.body));
    assert.equal(r.body.error, 'unavailable', f);
    assert.deepEqual(r.settles, [[id, false]], f + ': التذكرة تُسوّى فشلًا فتُردّ النقاط');
  }
  for (const [f, req, , id] of outage) {
    const r = await call(f, req, reply(500, { error: { message: 'Internal error' } }));
    assert.notEqual(r.body && r.body.error, 'unavailable', f);
    assert.deepEqual(r.settles, [], f + ': العطل العابر لا يسوّي (' + id + ')');
  }
});

test('٦. الواجهة: unavailable = نصّ svcPaused القائم (١٤ لغة) في الصور والفيديو، ولا إعادة تخصم', () => {
  const tts = read('js/app-02-tts.js');
  assert.match(tts, /if\(err === 'unavailable'\) return t\('svcPaused'\);/, 'imgErrFriendly');
  const at = read('js/app-09-attach.js');
  assert.match(at, /code === 'unavailable' \? 'svcPaused'/, 'سطر فشل الصورة المشترك');
  assert.match(at, /if\(code === 'unavailable'\) return t\('svcPaused'\);/, 'رموز الفيديو في المحادثة');
  assert.match(at, /if\(d && d\.error === 'unavailable'\) return t\('svcPaused'\);/, 'الطوابع');
  assert.equal((at.match(/__gData\.error === 'unavailable'\)\) break;|__d\.error === 'unavailable'\)\) break;/g) || []).length, 2, 'حلقتا الإعادة تتوقّفان');
  assert.equal((at.match(/else if\(__sd\.error === 'unavailable'\) throw new Error\(t\('svcPaused'\)\);/g) || []).length, 2, 'استطلاعا الفيديو في المحادثة');
  const vid = read('js/app-11-video.js');
  assert.match(vid, /if\(code === 'unavailable' && typeof window\.t === 'function'\) return '⚠️ ' \+ window\.t\('svcPaused'\);/);
  assert.match(vid, /if\(data\.error === 'unavailable'\)\{ clearInterval\(iv\); reject\(Object\.assign\(new Error\('unavailable'\), \{ code: 'unavailable', retryable: false \}\)\); return; \}/);
  assert.match(read('js/app-11-video-trends.js'), /e\.code === 'unavailable' && W\('svcPaused'\)/);
  assert.match(read('js/app-08-maha.js'), /imgResult\.error === 'unavailable' \? t\('svcPaused'\)/);
  assert.match(read('js/app-07-voice.js'), /data\.error === 'unavailable' \? 'svcPaused'/);
  // النصّ نفسه موجود بالعربيّة والإنجليزيّة (والبقيّة في i18n/*.js كما كان)
  const i18n = read('js/app-03-i18n-data.js');
  assert.ok((i18n.match(/svcPaused: '/g) || []).length >= 2);
  const langs = fs.readdirSync(path.join(root, 'i18n')).filter((x) => /^[a-z]{2,3}\.js$/.test(x)); // ملفّات اللغات (ad-studio قاموس صفحة مستقلّة)
  assert.equal(langs.length, 12, 'اثنتا عشرة لغة مع العربيّة والإنجليزيّة = ١٤');
  for (const f of langs) assert.match(read('i18n/' + f), /svcPaused/, f);
});
