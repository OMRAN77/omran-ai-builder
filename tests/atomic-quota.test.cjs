// tests/atomic-quota.test.cjs — v-atomic-quota: العدّادات اليوميّة كانت تنكسر بالطلبات المتزامنة.
// ‏check*Quota يقرأ JSON، وconsume* يقرأ ثمّ يعدّل ثمّ يكتب بعد نجاح التوليد بثوانٍ — فعشرة طلبات متوازية
// من حساب جديد مرّت كلّها والعدّاد بقي ١ والسقف ٣ (والواجهة نفسها تطلق studio-create بالتوازي).
// وفي _usage.js: فحص ثمّ INCR، وسحب رصيد المكافأة قراءة ثمّ كتابة. الآن حجز ذرّيّ قبل التوليد يُردّ إن فشل.
// يستعمل المعالجات والوحدات الحقيقيّة؛ Redis وحده محاكى في الذاكرة، وكلّ أمر فيه يتنازل عن الدور
// (setImmediate) كما يتنازل نداء الشبكة الحقيقيّ — فيتداخل المتزامن كما في الإنتاج.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'atomic-quota-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'test-gemini-key';
delete process.env.OPENAI_API_KEY;
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const ttl = new Map();
let kvDown = false;
const tick = () => new Promise((r) => setImmediate(r));
const net = async () => { await tick(); if (kvDown) throw new Error('Upstash error: down'); };
const kvImpl = {
  kvGetJSON: async (k) => { try { await net(); } catch (e) { return null; } return store.has(k) ? JSON.parse(store.get(k)) : null; },
  kvPutJSON: async (k, v) => { await net(); store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { await net(); return store.has(k) ? String(store.get(k)) : null; },
  kvSetRaw: async (k, v, t) => { await net(); store.set(k, String(v)); if (t) ttl.set(k, t); },
  kvSetIfAbsent: async (k, v, t) => { await net(); if (store.has(k)) return false; store.set(k, String(v)); if (t) ttl.set(k, t); return true; },
  kvIncr: async (k) => { await net(); const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { await net(); const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await net(); const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvExpire: async (k, s) => { try { await net(); } catch (e) { return; } ttl.set(k, Number(s)); },
  kvDel: async (k) => { try { await net(); } catch (e) { return; } store.delete(k); },
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: () => {} });
mock('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
mock('api/_lib/image-judge.js', { judgeBest: async () => 'a', duoEnabled: () => false });

const auth = require(rp('api/_lib/auth.js'));
const tok = (u) => auth.makeToken(u);
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// ردّ مزيّف يحلّ وعده عند أوّل إرسال (json/end)، والنداء ينتظر المعالج والردّ معًا.
function fakeRes() {
  let done;
  const sent = new Promise((r) => { done = r; });
  const res = {
    code: 200, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { done({ code: this.code, body: b }); return this; },
    end() { done({ code: this.code }); return this; },
  };
  return { res, sent };
}

// ── ١. المعالج الحقيقيّ: design-create ────────────────────────────────────────────────────
const designCreate = require(rp('api/_lib/design-create.js'));
let geminiMode = 'ok';
let geminiCalls = 0;
const realFetch = global.fetch;
global.fetch = async (url) => {
  geminiCalls++;
  for (let i = 0; i < 25; i++) await tick(); // التوليد يأخذ وقتًا والطلبات الأخرى تجري خلاله
  if (!String(url).includes('generativelanguage')) return { ok: false, status: 500, json: async () => ({}) };
  if (geminiMode === 'fail') return { ok: false, status: 503, json: async () => ({ error: { message: 'overloaded' } }) };
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'QUJD', mimeType: 'image/png' } }] } }] }) };
};
test.after(() => { global.fetch = realFetch; });

async function design(user) {
  const { res, sent } = fakeRes();
  const req = { method: 'POST', headers: {}, query: {}, body: { token: tok(user), imageBase64: 'QUJD', mimeType: 'image/jpeg', style: 'modern' } };
  const [out] = await Promise.all([sent, designCreate(req, res)]);
  return out;
}
const designTally = (u) => store.get('db/design-usage/tally/' + encodeURIComponent(u) + '/' + today());

test('١. عشرة طلبات ديكور متزامنة من حساب جديد: ثلاثة فقط تولّد، والسبعة 402 بلا نداء للمولّد', async () => {
  geminiMode = 'ok'; geminiCalls = 0;
  const out = await Promise.all(Array.from({ length: 10 }, () => design('sara')));
  const ok = out.filter((o) => o.code === 200);
  assert.equal(ok.length, 3, 'السقف ٣ — مرّ ' + ok.length);
  assert.equal(out.filter((o) => o.code === 402 && o.body.error === 'daily_limit_reached').length, 7);
  assert.equal(geminiCalls, 3, 'المرفوض لا يكلّف المالك نداءً');
  assert.ok(ok.every((o) => Number.isInteger(o.body.remaining) && o.body.remaining >= 0 && o.body.remaining < 3), 'المتبقّي بين ٠ و٢');
  assert.equal(designTally('sara'), '3', 'العدّاد يساوي ما ولّد فعلًا');
  assert.ok(ttl.get('db/design-usage/tally/sara/' + today()) > 0, 'مفتاح اليوم بانتهاء لا يتراكم');
  const again = await design('sara');
  assert.equal(again.code, 402);
});

test('٢. فشل التوليد يردّ الحجز: ثلاثة فاشلة متزامنة لا تحرق شيئًا، وبعدها ثلاثة ناجحة تمرّ والرابع 402', async () => {
  geminiMode = 'fail';
  const failed = await Promise.all(Array.from({ length: 3 }, () => design('lina')));
  assert.deepEqual(failed.map((o) => o.code), [503, 503, 503], 'خطأ المولّد نفسه لا daily_limit');
  assert.equal(designTally('lina'), '0', 'الحجز رُدّ قبل خروج الردّ');
  geminiMode = 'ok';
  const okRuns = await Promise.all(Array.from({ length: 3 }, () => design('lina')));
  assert.deepEqual(okRuns.map((o) => o.code), [200, 200, 200]);
  assert.equal((await design('lina')).code, 402);
  assert.equal(designTally('lina'), '3');
});

test('٣. الحجز يمسك المقعد أثناء التوليد: ثلاثة فاشلة + ثلاثة ناجحة متزامنة = ثلاثة تُقبل والباقي 402', async () => {
  // نصف المولّدات يفشل: ما يفشل يردّ مقعده، لكنّ الطلبات التي رُفضت أثناء طيرانه رُفضت فعلًا (لا عبور للسقف).
  let n = 0;
  geminiMode = 'ok';
  const save = global.fetch;
  global.fetch = async (url) => { const mine = n++; const r = await save(url); return mine % 2 ? r : { ok: false, status: 503, json: async () => ({ error: { message: 'x' } }) }; };
  try {
    const out = await Promise.all(Array.from({ length: 6 }, () => design('maya')));
    assert.equal(out.filter((o) => o.code === 402).length, 3, 'ثلاثة فقط تحجز في آنٍ واحد');
    const okCount = out.filter((o) => o.code === 200).length;
    assert.equal(Number(designTally('maya')), okCount, 'العدّاد = الناجح وحده، والفاشل رُدّ');
  } finally { global.fetch = save; }
});

// ── ٢. الوحدات السبع: check(token, res) ← توليد ← consume، بنمط المعالجات نفسها ─────────────────
const MODS = [
  ['design', '_designUsage.js', 'checkDesignQuota', 'consumeDesign', 'DESIGN_DAILY_LIMIT'],
  ['fashion', '_fashionUsage.js', 'checkFashionQuota', 'consumeFashion', 'FASHION_DAILY_LIMIT'],
  ['studio', '_studioUsage.js', 'checkStudioQuota', 'consumeStudio', 'STUDIO_DAILY_LIMIT'],
  ['portrait', '_portraitUsage.js', 'checkPortraitQuota', 'consumePortrait', 'PORTRAIT_DAILY_LIMIT'],
  ['construction', '_constructionUsage.js', 'checkConstructionQuota', 'consumeConstruction', 'CONSTRUCTION_DAILY_LIMIT'],
  ['car', '_carUsage.js', 'checkCarQuota', 'consumeCar', 'CAR_DAILY_LIMIT'],
  ['video', '_videoUsage.js', 'checkVideoQuota', 'consumeVideo', 'VIDEO_DAILY_LIMIT'],
];
const LIMITS = { design: 3, fashion: 3, studio: 3, portrait: 3, construction: 6, car: 8, video: 3 };

async function runOne(mod, check, consume, user, succeed) {
  const { res, sent } = fakeRes();
  const handler = (async () => {
    const q = await mod[check](tok(user), res);
    if (!q.allowed) { res.status(q.reason === 'auth' ? 401 : 402).json({ error: q.reason }); return; }
    for (let i = 0; i < 20; i++) await tick();
    if (!succeed) { res.status(502).json({ error: 'upstream' }); return; }
    const remaining = await mod[consume](q.username);
    res.status(200).json({ remaining });
  })();
  const [out] = await Promise.all([sent, handler]);
  return out;
}

for (const [ns, file, check, consume, limitName] of MODS) {
  test('٤. ' + ns + ': عشرة متزامنة (وفوق السقف لمن سقفه أكبر) لا يمرّ منها إلّا السقف، والفشل لا يُحسب', async () => {
    const mod = require(rp('api/_lib/' + file));
    const limit = mod[limitName];
    assert.equal(limit, LIMITS[ns], 'لا تغيير في رقم السقف');
    const N = Math.max(10, limit + 4);
    const out = await Promise.all(Array.from({ length: N }, () => runOne(mod, check, consume, ns + '-user', true)));
    assert.equal(out.filter((o) => o.code === 200).length, limit, ns + ': مرّ أكثر من السقف');
    assert.equal(store.get('db/' + ns + '-usage/tally/' + ns + '-user/' + today()), String(limit));
    // الفشل يردّ حجزه: حساب ثانٍ يفشل N مرّة متزامنة ثمّ ينجح حتّى السقف.
    const fails = await Promise.all(Array.from({ length: limit }, () => runOne(mod, check, consume, ns + '-f', false)));
    assert.ok(fails.every((o) => o.code === 502));
    assert.equal(store.get('db/' + ns + '-usage/tally/' + ns + '-f/' + today()), '0');
    const oks = await Promise.all(Array.from({ length: limit + 2 }, () => runOne(mod, check, consume, ns + '-f', true)));
    assert.equal(oks.filter((o) => o.code === 200).length, limit);
  });
}

test('٥. المالك (وVIP حيث كان معفيًّا) بلا حدّ كما كان', async () => {
  for (const [ns, file, check, consume] of MODS) {
    const mod = require(rp('api/_lib/' + file));
    const out = await Promise.all(Array.from({ length: 12 }, () => runOne(mod, check, consume, 'omran', true)));
    assert.equal(out.filter((o) => o.code === 200).length, 12, ns + ': المالك محدود');
  }
  for (const [ns, file, check, consume] of MODS.filter((m) => ['design', 'fashion', 'studio', 'portrait', 'construction'].includes(m[0]))) {
    const mod = require(rp('api/_lib/' + file));
    const out = await Promise.all(Array.from({ length: 12 }, () => runOne(mod, check, consume, 'vipuser', true)));
    assert.equal(out.filter((o) => o.code === 200).length, 12, ns + ': VIP محدود');
  }
});

test('٦. يوم الترحيل: عدّ اليوم في ملفّ JSON القديم يُحسب (لا يوم مجّانيّ)، وعدّ الأمس لا يُحسب', async () => {
  const mod = require(rp('api/_lib/_designUsage.js'));
  store.set('db/design-usage/old1.json', JSON.stringify({ date: today(), count: 2 }));
  const out = await Promise.all(Array.from({ length: 5 }, () => runOne(mod, 'checkDesignQuota', 'consumeDesign', 'old1', true)));
  assert.equal(out.filter((o) => o.code === 200).length, 1, 'بقي واحد من ثلاثة');
  store.set('db/design-usage/old2.json', JSON.stringify({ date: yesterday(), count: 3 }));
  const out2 = await Promise.all(Array.from({ length: 5 }, () => runOne(mod, 'checkDesignQuota', 'consumeDesign', 'old2', true)));
  assert.equal(out2.filter((o) => o.code === 200).length, 3);
  // الفحص المجرّد (مسارات الاقتراح بلا res) يقرأ ولا يستهلك
  store.set('db/design-usage/old3.json', JSON.stringify({ date: today(), count: 3 }));
  assert.equal((await mod.checkDesignQuota(tok('old3'))).allowed, false);
  for (let i = 0; i < 5; i++) assert.equal((await mod.checkDesignQuota(tok('fresh'))).remaining, 3);
  assert.equal(store.has('db/design-usage/tally/fresh/' + today()), false, 'الاقتراح لا يمسّ العدّاد');
});

test('٧. الفيديو: إعادة الحصّة بعد فشل لاحق تنقص عدّاد اليوم ولا تنزل تحت الصفر', async () => {
  const v = require(rp('api/_lib/_videoUsage.js'));
  const k = 'db/video-usage/tally/vid/' + today();
  await runOne(v, 'checkVideoQuota', 'consumeVideo', 'vid', true);
  await runOne(v, 'checkVideoQuota', 'consumeVideo', 'vid', true);
  assert.equal(store.get(k), '2');
  await Promise.all([v.releaseVideo('vid'), v.releaseVideo('vid'), v.releaseVideo('vid')]);
  assert.equal(store.get(k), '0');
});

test('٨. عطل KV: يبقى مفتوحًا كما كان (لا يُقفل الأداة على الجميع)', async () => {
  const mod = require(rp('api/_lib/_studioUsage.js'));
  kvDown = true;
  try {
    const out = await runOne(mod, 'checkStudioQuota', 'consumeStudio', 'downuser', true);
    assert.equal(out.code, 200);
  } finally { kvDown = false; }
});

// ── ٣. _usage.js: المحادثة والعدّاد المخصّص ورصيد المكافأة ─────────────────────────────────
const usage = require(rp('api/_lib/_usage.js'));
const FREE = { tier: 'free', cap: 3, subscriber: false, plan: null };

test('٩. checkAndConsume: عشرة متزامنة على سقف ٣ تمرّ منها ثلاثة والعدّاد ٣', async () => {
  const out = await Promise.all(Array.from({ length: 10 }, () => usage.checkAndConsume(tok('chatter'), null, 'groq', null, { tier: FREE, chatBucket: true })));
  assert.equal(out.filter((o) => o.allowed).length, 3);
  assert.deepEqual(out.filter((o) => o.allowed).map((o) => o.remaining).sort(), [0, 1, 2]);
  assert.equal(await usage.todayCount('chatter', 'chat'), 3, 'المرفوض لا يبقى في العدّاد');
});

test('١٠. checkAndConsumeCustom: عشرة متزامنة على سقف ٣ (حساب وIP) تمرّ منها ثلاثة', async () => {
  const a = await Promise.all(Array.from({ length: 10 }, () => usage.checkAndConsumeCustom(tok('tooluser'), null, '1.2.3.4', 'sometool', 3)));
  assert.equal(a.filter((o) => o.allowed).length, 3);
  const b = await Promise.all(Array.from({ length: 10 }, () => usage.checkAndConsumeCustom(null, null, '5.6.7.8', 'sometool', 3)));
  assert.equal(b.filter((o) => o.allowed).length, 3);
  const owner = await Promise.all(Array.from({ length: 10 }, () => usage.checkAndConsumeCustom(tok('omran'), null, '1.1.1.1', 'sometool', 3)));
  assert.equal(owner.filter((o) => o.allowed).length, 10, 'المالك معفى');
});

test('١١. رصيد المكافأة: عشرة متزامنة بعد السقف برصيد ٢ تسحب اثنتين بالضبط', async () => {
  await auth.putUser('bonus', { username: 'bonus', bonusMessages: 2, createdAt: Date.now() });
  for (let i = 0; i < 3; i++) await usage.checkAndConsume(tok('bonus'), null, 'groq', null, { tier: FREE, chatBucket: true });
  const out = await Promise.all(Array.from({ length: 10 }, () => usage.checkAndConsume(tok('bonus'), null, 'groq', null, { tier: FREE, chatBucket: true })));
  assert.equal(out.filter((o) => o.allowed && o.usedBonus).length, 2, 'كانت كلّها تقرأ ٢ وتكتب ١ وتمرّ');
  assert.equal((await auth.getUser('bonus')).bonusMessages, 0);
  assert.equal(await usage.todayCount('bonus', 'chat'), 3);
});

test('١١-ب. v-meter-atomic: takeMeter — عشرة متزامنة على حدّ Haiku ٥ تحجز خمسة بالضبط، وgiveMeter يردّ ولا ينزل تحت الصفر', async () => {
  assert.equal(typeof usage.takeMeter, 'function', 'حجز ذرّيّ لحدّ الموديل داخل الباقة (كان todayCount ثمّ bumpCount)');
  const out = await Promise.all(Array.from({ length: 10 }, () => usage.takeMeter('meterman', 'plan-haiku', 5)));
  assert.equal(out.filter(Boolean).length, 5);
  assert.equal(await usage.todayCount('meterman', 'plan-haiku'), 5, 'المرفوض لا يبقى في المقياس');
  await usage.giveMeter('meterman', 'plan-haiku');
  assert.equal(await usage.todayCount('meterman', 'plan-haiku'), 4);
  assert.equal(await usage.takeMeter('meterman', 'plan-haiku', 5), true, 'المردود يُحجز من جديد');
  assert.equal(await usage.takeMeter('meterman', 'plan-haiku', 5), false);
  assert.equal(await usage.takeMeter('meterman', 'plan-sonnet', 0), false, 'حدّ صفر (باقة بلا Sonnet) يُرفض بلا عدّ');
  for (let i = 0; i < 3; i++) await usage.giveMeter('fresh-meter', 'plan-haiku');
  assert.equal(await usage.todayCount('fresh-meter', 'plan-haiku'), 0, 'لا رصيد سالب يفتح الحدّ');
});

test('١١-ج. v-refund-custom: refundCustom يردّ ما عدّه checkAndConsumeCustom في المفتاح نفسه (حساب · IP · guest)، ولا يرمي', async () => {
  assert.equal(typeof usage.refundCustom, 'function');
  const t = tok('refunder');
  for (let i = 0; i < 3; i++) assert.equal((await usage.checkAndConsumeCustom(t, null, '9.9.9.9', 'tool-r', 3)).allowed, true);
  assert.equal((await usage.checkAndConsumeCustom(t, null, '9.9.9.9', 'tool-r', 3)).allowed, false);
  await usage.refundCustom(t, null, '9.9.9.9', 'tool-r');
  assert.equal(await usage.todayCount('refunder', 'tool-r'), 2);
  assert.equal((await usage.checkAndConsumeCustom(t, null, '9.9.9.9', 'tool-r', 3)).allowed, true, 'المردود متاح من جديد');
  // IP (بلا جلسة)
  for (let i = 0; i < 2; i++) await usage.checkAndConsumeCustom(null, null, '7.7.7.7', 'tool-r', 2);
  assert.equal((await usage.checkAndConsumeCustom(null, null, '7.7.7.7', 'tool-r', 2)).allowed, false);
  await usage.refundCustom(null, null, '7.7.7.7', 'tool-r');
  assert.equal((await usage.checkAndConsumeCustom(null, null, '7.7.7.7', 'tool-r', 2)).allowed, true);
  // guest بلا IP
  await usage.checkAndConsumeCustom(null, 'guest-refund-1', null, 'tool-r', 1);
  assert.equal((await usage.checkAndConsumeCustom(null, 'guest-refund-1', null, 'tool-r', 1)).allowed, false);
  await usage.refundCustom(null, 'guest-refund-1', null, 'tool-r');
  assert.equal((await usage.checkAndConsumeCustom(null, 'guest-refund-1', null, 'tool-r', 1)).allowed, true);
  // ردّ بلا عدّ لا ينزل تحت الصفر، والمالك لا يُمسّ، وعطل KV لا يرمي
  await usage.refundCustom(tok('never-counted'), null, null, 'tool-r');
  assert.equal(await usage.todayCount('never-counted', 'tool-r'), 0);
  await usage.refundCustom(tok('omran'), null, null, 'tool-r');
  assert.equal(await usage.todayCount('omran', 'tool-r'), 0);
  kvDown = true;
  try { await usage.refundCustom(t, null, null, 'tool-r'); } finally { kvDown = false; }
});

// ── ٤. المهلة والأسلاك ────────────────────────────────────────────────────────────────────
test('١٢. طلب لا يخرج ردّه (تقتله المهلة) يُردّ حجزه بمؤقّت قبل maxDuration، ونجاحه المتأخّر يُحسب مرّة', async (t) => {
  const { HOLD_MAX_MS } = require(rp('api/_lib/_dailyQuota.js'));
  const vercel = JSON.parse(require('node:fs').readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.ok(HOLD_MAX_MS < vercel.functions['api/*.js'].maxDuration * 1000, 'المؤقّت قبل قتل الدالّة');
  const mod = require(rp('api/_lib/_portraitUsage.js'));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { res } = fakeRes();
  assert.equal((await mod.checkPortraitQuota(tok('stuck'), res)).allowed, true);
  const k = 'db/portrait-usage/tally/stuck/' + today();
  assert.equal(store.get(k), '1');
  t.mock.timers.tick(HOLD_MAX_MS);
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(store.get(k), '0', 'الحجز المعلّق رُدّ');
  assert.equal(await mod.consumePortrait('stuck'), 2, 'نجاح متأخّر بعد المهلة: زيادة ذرّيّة كما كان');
  assert.equal(store.get(k), '1');
});

test('١٣. الأسلاك: كلّ معالج يولّد يمرّر res للحجز، ومسارات الاقتراح تبقى قراءة مجرّدة', () => {
  const read = (f) => require('node:fs').readFileSync(path.join(root, 'api/_lib', f), 'utf8');
  const gen = [['design-create.js', 'checkDesignQuota'], ['fashion-create.js', 'checkFashionQuota'], ['studio-create.js', 'checkStudioQuota'],
    ['portrait-style.js', 'checkPortraitQuota'], ['construction-view.js', 'checkConstructionQuota'], ['car-tools.js', 'checkCarQuota'], ['video-create.js', 'checkVideoQuota']];
  for (const [f, fn] of gen) assert.match(read(f), new RegExp('await ' + fn + '\\(token, res\\)'), f + ': بلا حجز');
  // مراحل تذكرة المقاولات التالية لا تستهلك فلا تحجز
  assert.match(read('construction-create.js'), /await checkConstructionQuota\(token, \(stagePart && body\.jobTicket\) \? null : res\)/);
  const ro = [['design-suggest.js', 'checkDesignQuota'], ['fashion-suggest.js', 'checkFashionQuota'], ['studio-suggest.js', 'checkStudioQuota'], ['video-script.js', 'checkVideoQuota']];
  for (const [f, fn] of ro) assert.match(read(f), new RegExp('await ' + fn + '\\(token\\)'), f + ': الاقتراح لا يحجز');
});
