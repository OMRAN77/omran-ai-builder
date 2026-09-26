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
  assert.deepEqual(Object.keys(P), ['img_basic', 'img_pro', 'img_max', 'vid_basic', 'vid_pro', 'vid_max', 'maha_basic', 'maha_pro', 'maha_max']);
  for (const k of Object.keys(P)) {
    assert.equal(checkout.PLANS[k].points, 0, k + ': بلا نقاط');
    assert.equal(checkout.PLANS[k].media, P[k].media);
    assert.ok(![1000, 2000, 10000].includes(P[k].amount), k + ': مبلغ غير مبالغ المحادثة');
  }
  const aed = (c) => Math.round(c / 100 * 3.6725 * 10) / 10;
  assert.deepEqual([P.img_basic.amount, P.img_pro.amount, P.img_max.amount].map(aed), [37.5, 75, 375]);
  const n = (plan, r) => Math.floor(P[plan].budget / media.UNIT_COST[r]);
  assert.deepEqual(['img_basic', 'img_pro', 'img_max'].map((p) => [n(p, 'image_normal'), n(p, 'image')]), [[61, 30], [74, 37], [812, 406]], 'العالية = صورتان');
  assert.deepEqual(['vid_basic', 'vid_pro', 'vid_max'].map((p) => [n(p, 'minimax_video'), n(p, 'omni_video'), n(p, 'veo_video')]),
    [[7, 2, 1], [9, 3, 2], [158, 55, 37]]);
  // الربح بعد رسوم Stripe (٢٫٩٪ + ٠٫٣٠$): صور ٢٠ · ٥٣ · ١٦٠ درهم؛ فيديو ٢٥–٣٠ · ٦٠–٦٥ · ١٨٠–٢٢٠
  const profit = (k) => { const aedPrice = P[k].amount / 100 * 3.6725; return aedPrice - (aedPrice * 0.029 + 0.3 * 3.6725) - P[k].budget / 100; };
  for (const [k, lo, hi] of [['img_basic', 19.5, 20.5], ['img_pro', 52.5, 53.5], ['img_max', 159.5, 160.5], ['vid_basic', 25, 30], ['vid_pro', 60, 65], ['vid_max', 180, 220], ['maha_basic', 9.5, 10.5], ['maha_pro', 29.5, 31], ['maha_max', 99.5, 100.5]]) {
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
  assert.equal(kv.get('media:image:ali'), '1531');
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
  assert.equal(kv.get('media:image:sara'), String(1531 - 50));
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
  assert.equal(kv.get('media:image:noor'), String(1872 - 99));
  await points.refundPoints('noor', 35);
  assert.equal(kv.get('media:image:noor'), '1872');
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
  assert.match(co, /img_basic: 1021, img_pro: 2042, img_max: 10211, vid_basic: 1021, vid_pro: 2042, vid_max: 10211, maha_basic: 1021, maha_pro: 2042, maha_max: 10211/);
  const keys = ['mediaImgPlain', 'mediaHighEq', 'mediaQLabel', 'mediaQNormal', 'mediaQHigh', 'mediaQNormalDesc', 'mediaQHighDesc', 'mediaQHint', 'mediaPlansTitle', 'mediaPlansDesc', 'mediaImgName', 'mediaVidName', 'mediaImgUnit', 'mediaVidEco', 'mediaVidCine', 'mediaVidSound', 'mediaOr', 'mediaNoChatVideo', 'mediaNoChatImage', 'mediaLeftImg', 'mediaLeftVid'];
  const i18n = read('js/app-03-i18n-data.js');
  for (const l of ['ar', 'en']) assert.ok(keys.every((k) => new RegExp('I18N\\.' + l + ', \\{[^\\n]*"' + k + '"').test(i18n)), l);
  for (const l of ['fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml']) {
    const s = read('i18n/' + l + '.js');
    assert.ok(keys.every((k) => s.includes('"' + k + '"')), l);
  }
  assert.ok(read('index.html').includes('/js/partials-settings.js?v=675'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=697'"));
});

test('٧. الجودة: «عاديّة» افتراضيًّا بنصف الرصيد على المحرّك السريع، و«جودة عالية» في الطلب أو الإعداد = عالية', async () => {
  reset('lama');
  assert.equal(await media.imageQuality('lama', 'ارسم قطة'), null, 'غير مشترك');
  await checkout.grantPlanToUser('lama', 'img_basic', 'lastStripeSessionId', 'cs_7');
  assert.equal(await media.imageQuality('lama', 'ارسم قطة'), 'normal');
  assert.equal(await media.imageQuality('lama', 'ارسم قطة بجودة عالية'), 'high');
  assert.equal(await media.imageQuality('lama', 'a cat, high quality'), 'high');
  assert.equal(await media.imageQuality('lama', 'اكتب مبروك على الكيكة'), 'high', 'الكتابة داخل الصورة = عالية (مسار النصّ)');
  const n = await points.spendPoints('lama', 20, 'image_normal');
  assert.equal(n.media, 'image');
  assert.equal(kv.get('media:image:lama'), String(1531 - 25));
  assert.equal(await media.setImageQuality('lama', 'high'), true);
  assert.equal(await media.imageQuality('lama', 'ارسم قطة'), 'high');
  assert.equal(await media.setImageQuality('lama', 'ultra'), false);
  const st = await media.mediaStatus('lama');
  assert.equal(st.image.quality, 'high');
  assert.equal(st.image.counts.image_normal, Math.floor((1531 - 25) / 25));
  // الخادم: العاديّة على نانو ٢ بلا مسار GPT ولا فرق الإبداعيّ، والوسم مع الصورة
  const mi = read('api/_lib/maha-image.js');
  assert.match(mi, /__ask4K \? 'image_4k' : \(__mq === 'normal' \? 'image_normal' : 'image'\)/);
  assert.match(mi, /: \(__mediaQuality === 'normal'\) \? 'gemini-3\.1-flash-image'/);
  assert.match(mi, /if \(__extra > 0 && __mediaQuality !== 'normal'\) \{/);
  assert.match(mi, /mediaTag: __mediaQuality \? \{ q: __mediaQuality, left: Math\.floor\(__mediaLeft \/ 25\) \}/);
  const at = read('js/app-09-attach.js');
  assert.equal((at.match(/__imgEngineLine\((__d|__lsData|__data)\.engine, \1\)/g) || []).length, 4, 'كلّ مسارات الصورة تمرّر الوسم');
  const html = read('js/partials-settings.js');
  for (const n2 of [61, 74, 810]) assert.ok(html.includes('<li><b>' + n2 + '</b> <span data-i18n="mediaImgPlain">'), n2);
  assert.ok(html.includes("onclick=\"setMediaQuality('normal')\"") && html.includes("onclick=\"setMediaQuality('high')\""));
  assert.match(read('api/_lib/points.js'), /action === 'media-quality'/);
});

test('٨. أقسام الأسعار (v-price-tabs): المحادثة · الصور · الفيديو · النقاط، كلّ قسم وحده والمحادثة افتراضيًّا', () => {
  const html = read('js/partials-settings.js');
  const tabs = ['chat', 'img', 'vid', 'maha', 'pts'];
  for (const k of tabs) {
    assert.ok(html.includes('data-tab="' + k + '" onclick="showPriceTab(\'' + k + '\')"'), 'زرّ ' + k);
    assert.equal((html.match(new RegExp('class="priceTab" data-tab="' + k + '"', 'g')) || []).length, 1, 'قسم ' + k);
  }
  assert.ok(html.includes('class="priceTabBtn on" data-tab="chat"'));
  assert.ok(!html.includes('id="openFullPricing"'), 'رابط «عرض كل الباقات» فوق الأسعار حُذف');
  assert.ok(html.includes('<div class="priceTab" data-tab="chat"><div class="planGrid">'), 'المحادثة ظاهرة');
  const sec = (k) => { const i = html.indexOf('class="priceTab" data-tab="' + k + '"'); const n = tabs.indexOf(k) < tabs.length - 1 ? html.indexOf('class="priceTab" data-tab="' + tabs[tabs.indexOf(k) + 1] + '"') : html.indexOf('termsLink', i); return html.slice(i, n); };
  for (const k of ['img', 'vid', 'maha', 'pts']) assert.match(sec(k), /^class="priceTab" data-tab="\w+"[^>]*style="display:none;"/, k + ' مخفيّ حتّى يُختار');
  assert.ok(sec('chat').includes("openCheckout('max')") && !sec('chat').includes("openCheckout('img_basic')"));
  assert.ok(['img_basic', 'img_pro', 'img_max'].every((p) => sec('img').includes("openCheckout('" + p + "')")) && !sec('img').includes("openCheckout('vid_basic')"));
  assert.ok(['vid_basic', 'vid_pro', 'vid_max'].every((p) => sec('vid').includes("openCheckout('" + p + "')")) && sec('vid').includes('id="mediaVidStatus"'));
  assert.ok(sec('img').includes('id="mediaQualityBox"'));
  assert.ok(sec('pts').includes('buyPointsPack(100)'));
  assert.ok(!html.includes('id="acctPointsBuyBtn"'), 'v-account-tidy: تحذير النقاط وزرّ شحنها خرجا من «حسابي»؛ الشحن من قسم النقاط نفسه');
  assert.match(read('js/app-06-checkout.js'), /function showPriceTab\(tab\)\{/);
  const keys = ['priceTabChat', 'priceTabImg', 'priceTabVid', 'priceTabPts'];
  const i18n = read('js/app-03-i18n-data.js');
  for (const l of ['ar', 'en']) assert.ok(keys.every((k) => new RegExp('I18N\\.' + l + ', \\{[^\\n]*"' + k + '"').test(i18n)), l);
  for (const l of ['fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml']) assert.ok(keys.every((k) => read('i18n/' + l + '.js').includes('"' + k + '"')), l);
});

test('٩. اشتراك مها (v-maha-plans): ٤٦ · ٧٥ · ٤٧٨ دقيقة، تُخصم قبل النقاط عبر consume، وحدّ ١٠ دقائق للمكالمة', async () => {
  const P = media.MEDIA_PLANS;
  assert.equal(media.UNIT_COST.maha_minute, 55);
  assert.deepEqual(['maha_basic', 'maha_pro', 'maha_max'].map((p) => Math.floor(P[p].budget / 55)), [46, 75, 478]);
  assert.equal(media.MAHA_CALL_CAP_MIN, 10);
  assert.equal(media.mediaOf('maha_minute'), 'maha');

  reset('reem');
  await checkout.grantPlanToUser('reem', 'maha_basic', 'lastStripeSessionId', 'cs_9');
  assert.equal(kv.get('media:maha:reem'), '2530');
  assert.equal(users.get('reem').plan, undefined, 'لا باقة محادثة');
  assert.deepEqual((await media.mediaStatus('reem')).maha.counts, { maha_minute: 46 });

  // العميل يرسل consume بسعر الدقيقة الحقيقيّ — المسار الكامل عبر معالج /api/points
  const crypto = require('node:crypto');
  const payload = Buffer.from(JSON.stringify({ u: 'reem', exp: Date.now() + 60000 })).toString('base64url');
  const token = payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  const call = (body) => new Promise((resolve) => {
    const res = { setHeader() {}, status(c) { this.c = c; return this; }, json(d) { resolve(Object.assign({ code: this.c }, d)); }, end() { resolve({ code: this.c }); } };
    points({ method: 'POST', body }, res);
  });
  const d = await call({ action: 'consume', amount: points.COSTS.maha_minute, reason: 'maha_minute', token });
  assert.equal(d.ok, true);
  assert.equal(d.media, 'maha');
  assert.equal(Math.floor(d.mediaLeft / 55), 45);
  assert.equal(kv.get('points:reem'), '70', 'النقاط لم تُمسّ');
  assert.equal((await call({ action: 'consume', amount: 10, reason: 'maha_minute', token })).reason, 'bad_amount', 'المبلغ القديم مرفوض — لذا صار العميل يرسل سعر الخادم');
  assert.equal(kv.get('media:tix:reem'), undefined, 'دقيقة مها لا تذكرة استرجاع لها');
  await points.refundPoints('reem', 15);
  assert.equal(kv.get('media:maha:reem'), String(2530 - 55), 'استرجاع ١٥ نقطة من خدمة أخرى لا يعيد دقيقة');

  const img = await points.spendPoints('reem', points.COSTS.image, 'image');
  assert.equal(img.media, undefined, 'الصورة من النقاط لا من دقائق مها');
  kv.set('media:maha:reem', '30');
  const out = await points.spendPoints('reem', points.COSTS.maha_minute, 'maha_minute');
  assert.equal(out.media, undefined, 'نفاد الدقائق ← النقاط');
  assert.equal(kv.get('points:reem'), String(85 - 20 - 15));

  // الخادم يفتح المكالمة للمشترك بلا نقاط، والعميل يعدّ الدقائق ويقف عند الحدّ
  const rs = read('api/_lib/realtime-session.js');
  assert.match(rs, /if \(pts < pointsLib\.COSTS\.maha_minute && !trial && mahaMin < 1\) \{/);
  assert.match(rs, /cost: pointsLib\.COSTS\.maha_minute, mahaMin, capMin: mahaMin > 0 \? mediaLib\.MAHA_CALL_CAP_MIN : 0/);
  const mc = read('js/app-08-maha.js');
  assert.match(mc, /action:'consume', amount:cost, reason:'maha_minute'/);
  assert.doesNotMatch(mc, /amount:10,/);
  assert.match(mc, /mahaMin = Math\.floor\(\(Number\(d\.mediaLeft\) \|\| 0\) \/ 55\);/);
  assert.match(mc, /if\(capMin && callMin >= capMin\)\{ endGently\(true\); return; \}/);

  const html = read('js/partials-settings.js');
  const i = html.indexOf('class="priceTab" data-tab="maha"');
  const sec = html.slice(i, html.indexOf('class="priceTab" data-tab="pts"'));
  for (const [p, n] of [['maha_basic', 46], ['maha_pro', 75], ['maha_max', 478]]) {
    assert.ok(sec.includes("openCheckout('" + p + "')"), p);
    assert.ok(sec.includes('<li><b>' + n + '</b> <span data-i18n="mahaMinPlain">'), String(n));
  }
  assert.ok(sec.includes('id="mahaPlanStatus"'));
  assert.doesNotMatch(sec, /GPT|OpenAI|realtime|Gemini|Claude/i, 'بلا اسم مزوّد');
  assert.match(read('js/app-06-checkout.js'), /\['chat', 'img', 'vid', 'maha', 'pts'\]/);
  const keys = ['priceTabMaha', 'mahaPlanName', 'mahaPlansDesc', 'mahaMinPlain', 'mahaMinUnit', 'mahaCapNote', 'mahaNoChat', 'mahaLeft', 'mahaCapEnd', 'mahaToPoints'];
  const i18n = read('js/app-03-i18n-data.js');
  for (const l of ['ar', 'en']) assert.ok(keys.every((k) => new RegExp('I18N\\.' + l + ', \\{[^\\n]*"' + k + '"').test(i18n)), l);
  for (const l of ['fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml']) assert.ok(keys.every((k) => read('i18n/' + l + '.js').includes('"' + k + '"')), l);
});

test('١٠. v-acct-media: سطر لكلّ اشتراك ساري، ولا شيء لغير المشترك (خارج «حسابي» منذ v-account-tidy)', () => {
  const html = read('js/partials-settings.js');
  assert.doesNotMatch(html, /id="acctMediaBox"|id="acctPointsBox"/, 'v-account-tidy: النقاط والمتبقّي في «الباقات» لا في «حسابي»');
  const co = read('js/app-06-checkout.js');
  const src = co.slice(co.indexOf('function renderAcctMedia('), co.indexOf('async function refreshAcctPoints('));
  const box = { style: {}, innerHTML: '' };
  const tr = { priceTabImg: '🖼️ الصور', priceTabVid: '🎬 الفيديو', priceTabMaha: '🎙️ مها', mediaImgPlain: 'صورة', mediaVidEco: 'اقتصادي', mediaOr: 'أو', mediaVidCine: 'سينمائيّ', mahaMinUnit: 'دقيقة' };
  const render = new Function('document', 't', src + '; return renderAcctMedia;')({ getElementById: (id) => id === 'acctMediaBox' ? box : null }, (k) => tr[k] || k);
  render({ image: { counts: { image_normal: 42 } }, maha: { counts: { maha_minute: 32 } } });
  assert.equal(box.style.display, 'flex');
  assert.ok(box.innerHTML.includes('🖼️ الصور') && box.innerHTML.includes('42 صورة'));
  assert.ok(box.innerHTML.includes('🎙️ مها') && box.innerHTML.includes('32 دقيقة'));
  assert.ok(!box.innerHTML.includes('🎬'), 'لا سطر فيديو بلا اشتراك');
  render({});
  assert.equal(box.style.display, 'none');
  assert.equal(box.innerHTML, '');
  assert.match(co, /box\.style\.display = 'flex';\n {4}renderAcctMedia\(d\.media\);/);
});
