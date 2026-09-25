// tests/media-plans.test.cjs — v-media-plans (٢٥ سبتمبر ٢٠٢٦): اشتراك للصور وحده واشتراك للفيديو وحده
// بنفس أسعار المحادثة بالدرهم (٣٧٫٥ · ٧٥ · ٣٧٥). رصيد كلّ اشتراك بالفلس من تكلفتنا، منفصل عن النقاط
// وعن باقة المحادثة، ويُخصم قبل النقاط ويُستردّ إليه، ولا يفتح محادثة المشتركين ولا النوع الآخر.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'media-plans-test-secret';

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
const users = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kv.has(k) ? String(kv.get(k)) : null,
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async (k) => { kv.delete(k); }, kvExpire: async () => {},
});
mock('api/_lib/auth.js', {
  getUser: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false,
  verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });

const media = require(rp('api/_lib/_mediaPlans.js'));
const points = require(rp('api/_lib/points.js'));
const checkout = require(rp('api/_lib/create-checkout-session.js'));
const tier = require(rp('api/_lib/tier.js'));

const reset = (u, rec) => { users.set(u, Object.assign({ username: u, points: 70 }, rec || {})); kv.set('points:' + u, '70'); };

test('١. الباقات الستّ: المبالغ بالدرهم، ومميّزة عن باقات المحادثة، والرصيد يعطي الأعداد المعلنة', () => {
  const P = media.MEDIA_PLANS;
  assert.deepEqual(Object.keys(P), ['img_basic', 'img_pro', 'img_max', 'vid_basic', 'vid_pro', 'vid_max']);
  for (const k of Object.keys(P)) {
    assert.equal(checkout.PLANS[k].points, 0, k + ': بلا نقاط');
    assert.equal(checkout.PLANS[k].media, P[k].media);
    assert.ok(![1000, 2000, 10000].includes(P[k].amount), k + ': مبلغ غير مبالغ المحادثة');
  }
  const aed = (c) => Math.round(c / 100 * 3.6725 * 10) / 10;
  assert.deepEqual([P.img_basic.amount, P.img_pro.amount, P.img_max.amount].map(aed), [37.5, 75, 375]);
  const n = (plan, r) => Math.floor(P[plan].budget / media.UNIT_COST[r]);
  assert.deepEqual(['img_basic', 'img_pro', 'img_max'].map((p) => n(p, 'image')), [15, 20, 331]);
  assert.deepEqual(['vid_basic', 'vid_pro', 'vid_max'].map((p) => [n(p, 'minimax_video'), n(p, 'omni_video'), n(p, 'veo_video')]),
    [[7, 2, 1], [9, 3, 2], [158, 55, 37]]);
  // الربح بعد رسوم Stripe (٢٫٩٪ + ٠٫٣٠$): ٢٥–٣٠ · ٦٠–٦٥ · ١٨٠–٢٢٠ درهم
  const profit = (k) => { const aedPrice = P[k].amount / 100 * 3.6725; return aedPrice - (aedPrice * 0.029 + 0.3 * 3.6725) - P[k].budget / 100; };
  for (const [k, lo, hi] of [['img_basic', 25, 30], ['img_pro', 60, 65], ['img_max', 180, 220], ['vid_basic', 25, 30], ['vid_pro', 60, 65], ['vid_max', 180, 220]]) {
    const p = profit(k);
    assert.ok(p >= lo && p <= hi, k + ': الربح ' + p.toFixed(1));
  }
});

test('٢. المنح: رصيد الاشتراك يُملأ، ولا نقاط ولا باقة محادثة — المحادثة تبقى مجّانيّة', async () => {
  reset('ali');
  const g = await checkout.grantPlanToUser('ali', 'img_basic', 'lastStripeSessionId', 'cs_1');
  assert.equal(g.ok, true);
  assert.equal(g.pointsAdded, 0);
  assert.equal(kv.get('points:ali'), '70', 'النقاط كما هي');
  assert.equal(kv.get('media:image:ali'), '780');
  const u = users.get('ali');
  assert.equal(u.plan, undefined, 'لا باقة محادثة');
  assert.equal(u.media.image.plan, 'img_basic');
  const t = await tier.resolveTier('ali', { noCache: true, getUser: async () => u, isVip: async () => false });
  assert.equal(t.tier, 'free');
  assert.equal(t.subscriber, false);
  const again = await checkout.grantPlanToUser('ali', 'img_basic', 'lastStripeSessionId', 'cs_1');
  assert.equal(again.alreadyGranted, true, 'نفس الجلسة لا تُمنح مرّتين');
});

test('٣. الخصم: الصورة من رصيد الصور لا النقاط، والفيديو لا يُصرف من رصيد الصور', async () => {
  reset('sara');
  await checkout.grantPlanToUser('sara', 'img_basic', 'lastStripeSessionId', 'cs_2');
  const pay = await points.spendPoints('sara', points.COSTS.image, 'image');
  assert.equal(pay.ok, true);
  assert.equal(pay.media, 'image');
  assert.equal(kv.get('media:image:sara'), String(780 - 49));
  assert.equal(kv.get('points:sara'), '70', 'النقاط لم تُمسّ');
  const vid = await points.spendPoints('sara', points.COSTS.minimax_video, 'minimax_video');
  assert.equal(vid.ok, true);
  assert.equal(vid.media, undefined, 'الفيديو على النقاط');
  assert.equal(kv.get('points:sara'), '30');
  const noVid = await points.spendPoints('sara', points.COSTS.omni_video, 'omni_video');
  assert.equal(noVid.ok, false, 'لا فيديو سينمائيّ من رصيد الصور');
});

test('٤. النفاد يرجع للنقاط، والاسترجاع يعود للرصيد الذي خُصم منه (ومنه المركّب ٢٠+١٥)', async () => {
  reset('omar');
  await checkout.grantPlanToUser('omar', 'vid_basic', 'lastStripeSessionId', 'cs_3');
  const a = await points.spendPoints('omar', points.COSTS.veo_video, 'veo_video');
  assert.equal(a.media, 'video');
  assert.equal(kv.get('media:video:omar'), String(736 - 440));
  await points.refundPoints('omar', points.COSTS.veo_video);
  assert.equal(kv.get('media:video:omar'), '736', 'رجع للرصيد');
  assert.equal(kv.get('points:omar'), '70', 'لا نقاط من العدم');
  kv.set('media:video:omar', '50');
  const b = await points.spendPoints('omar', points.COSTS.minimax_video, 'minimax_video');
  assert.equal(b.media, undefined, 'الرصيد لا يكفي ← النقاط');
  assert.equal(kv.get('points:omar'), '30');

  reset('noor');
  await checkout.grantPlanToUser('noor', 'img_pro', 'lastStripeSessionId', 'cs_4');
  await points.spendPoints('noor', 20, 'image');
  await points.spendPoints('noor', 15, 'image_creative');
  assert.equal(kv.get('media:image:noor'), String(1000 - 98));
  await points.refundPoints('noor', 35);
  assert.equal(kv.get('media:image:noor'), '1000');
  assert.equal(kv.get('points:noor'), '70');
});

test('٥. الانتهاء بعد ٣٥ يومًا، والحالة للواجهة بالأعداد', async () => {
  const now = Date.now();
  const u = { media: { image: { plan: 'img_max', at: now - 36 * 86400000 }, video: { plan: 'vid_pro', at: now } } };
  assert.equal(media.mediaActive(u, 'image', now), false);
  assert.equal(media.mediaActive(u, 'video', now), true);
  assert.equal(media.mediaActive({ media: { image: { plan: 'vid_pro', at: now } } }, 'image', now), false, 'خطّة فيديو لا تفتح الصور');
  reset('huda');
  await checkout.grantPlanToUser('huda', 'vid_pro', 'lastStripeSessionId', 'cs_5');
  const st = await media.mediaStatus('huda');
  assert.deepEqual(Object.keys(st), ['video']);
  assert.deepEqual(st.video.counts, { minimax_video: 9, runway_video: 5, omni_video: 3, veo_video: 2 });
});

test('٦. PayPal والويب هوك والواجهة: الخطّة في custom_id، والبطاقات بلا اسم مزوّد وبالـ١٤ لغة', () => {
  const pp = read('api/_lib/paypal-order.js');
  assert.match(pp, /custom_id: String\(body\.plan\)/);
  assert.match(pp, /!PLANS\[p\]\.media\)/, 'مطابقة المبلغ وحدها لا تمنح اشتراك صور/فيديو');
  assert.match(pp, /grantMedia\(user, username, matchedPlan\)/);
  assert.match(read('api/webhook.js'), /PLANS\[md\.plan\]/);
  const html = read('js/partials-settings.js');
  const box = html.slice(html.indexOf('id="mediaPlansBox"'), html.indexOf('pricingPointsTitle'));
  for (const k of Object.keys(media.MEDIA_PLANS)) assert.ok(box.includes("openCheckout('" + k + "')"), k);
  assert.doesNotMatch(box, /Veo|Runway|Omni|MiniMax|Gemini|GPT|Nano|جوجل/i, 'بلا اسم مزوّد');
  const co = read('js/app-06-checkout.js');
  assert.match(co, /img_basic: 1021, img_pro: 2042, img_max: 10211, vid_basic: 1021, vid_pro: 2042, vid_max: 10211/);
  const keys = ['mediaPlansTitle', 'mediaPlansDesc', 'mediaImgName', 'mediaVidName', 'mediaImgUnit', 'mediaVidEco', 'mediaVidCine', 'mediaVidSound', 'mediaOr', 'mediaNoChatVideo', 'mediaNoChatImage', 'mediaLeftImg', 'mediaLeftVid'];
  const i18n = read('js/app-03-i18n-data.js');
  for (const l of ['ar', 'en']) assert.ok(keys.every((k) => new RegExp('I18N\\.' + l + ', \\{[^\\n]*"' + k + '"').test(i18n)), l);
  for (const l of ['fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml']) {
    const s = read('i18n/' + l + '.js');
    assert.ok(keys.every((k) => s.includes('"' + k + '"')), l);
  }
  assert.ok(read('index.html').includes('/js/partials-settings.js?v=664'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=688'"));
});
