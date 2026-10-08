// tests/plan-caps.test.cjs — v-plan-caps (قرار المالك: «نفس نسبة المحادثة»).
// حدود الأدوات الثابتة كانت رقمًا واحدًا للجميع: مشترك Max يدفع ٣٧٥ درهمًا ويأخذ ٣ تصاميم ديكور يوميًّا كالمجّانيّ،
// ورسالة «وصلت حدّ باقتك — رقِّ باقتك» تعده بما لا تفعله الترقية. الآن: المجّانيّ (والضيف بالـIP) على الأساس،
// والمشترك بباقة سارية floor(الأساس × سقف باقته للمحادثة ÷ سقف المجّانيّ) — ٣ ← Plus ٧ · Pro ١٥ · Max ٣٧.
// المعالجات الحقيقيّة وauth/tier/_usage/_dailyQuota الحقيقيّة؛ Redis والشبكة وحدهما محاكيان في الذاكرة
// (كلّ أمر Redis يتنازل عن الدور كنداء شبكة حقيقيّ، فيتداخل المتزامن كما في الإنتاج).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'plan-caps-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.TAVILY_API_KEY = 'test-tavily';
process.env.TWELVEDATA_API_KEY = 'test-twelvedata';
process.env.FREE_FIRST_DAY = '40'; // يوم التسجيل يرفع سقف المحادثة وحدها — لا أساس الأدوات
for (const k of ['FREE_DAILY', 'SUB_DAILY_BASIC', 'SUB_DAILY_PRO', 'SUB_DAILY_MAX', 'OWNER_USERNAMES', 'OWNER_USERNAME',
  'GROQ_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'FINNHUB_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const failRead = new Set(); // مفاتيح تفشل قراءتها (عطل قراءة سجلّ الحساب)
const incrLog = []; // [المفتاح، القيمة بعد INCR]
const tick = () => new Promise((r) => setImmediate(r));
let readHook = null; // المراجعة الثالثة: auth.js يفكّ kvGetJSON عند التحميل، فلفّ kvImpl لاحقًا لا يرى شيئًا — العدّ من الداخل
const kvImpl = {
  kvGetJSON: async (k) => { if (readHook) readHook(k); await tick(); if (failRead.has(k)) throw new Error('Upstash error: down'); return store.has(k) ? JSON.parse(store.get(k)) : null; },
  kvPutJSON: async (k, v) => { await tick(); store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { await tick(); return store.has(k) ? String(store.get(k)) : null; },
  kvSetRaw: async (k, v) => { await tick(); store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await tick(); if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { await tick(); const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); incrLog.push([k, v]); return v; },
  kvIncrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvExpire: async () => {},
  kvDel: async (k) => { store.delete(k); },
  kvPipeline: async (cmds) => cmds.map(() => null),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
mock('api/_lib/image-judge.js', { judgeBest: async () => 'a', duoEnabled: () => false });

/* الشبكة: كلّ نداء خارجيّ يُعدّ، والمولّد يأخذ وقتًا تجري خلاله الطلبات الأخرى. */
let fetchCalls = 0;
let onGenerate = null; // يُنادى مع كلّ نداء خارجيّ — «أثناء التوليد» (عطل قراءة أو باقة تنتهي بين الفحص والاستهلاك)
const realFetch = global.fetch;
const okJson = (obj) => ({ ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) });
global.fetch = async (url) => {
  fetchCalls++;
  const u = String(url);
  if (onGenerate) onGenerate(u);
  for (let i = 0; i < 15; i++) await tick();
  if (u.includes('generativelanguage')) return okJson({ candidates: [{ content: { parts: [{ inlineData: { data: 'QUJD', mimeType: 'image/png' } }] } }] });
  // صور OpenAI (data) ونصّه (choices) — خطّة المقاولات النصّيّة تُنقذ عبره فيمرّ construction-create بـ200
  if (u.includes('api.openai.com')) return okJson({ data: [{ b64_json: 'QUJD' }], choices: [{ message: { content: 'تمام' } }] });
  if (u.includes('api.anthropic.com')) return okJson({ content: [{ type: 'text', text: 'تمام' }] });
  if (u.includes('api.tavily.com')) return okJson({ results: [], images: [], answer: '' });
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
test.after(() => { global.fetch = realFetch; });

const auth = require(rp('api/_lib/auth.js'));
const tok = (u) => auth.makeToken(u);
const today = () => new Date().toISOString().slice(0, 10);
const quotaKey = (ns, u) => 'db/' + ns + '-usage/tally/' + encodeURIComponent(u) + '/' + today();
const customKey = (u, bucket) => 'db/usage/tally/' + encodeURIComponent(u + '_' + today() + '_' + bucket) + '/' + today();

// ردّ مزيّف يحلّ وعده عند أوّل إرسال (json/end — بعض المعالجات ترسل JSON نصًّا بـend).
function call(handlerFile, body) {
  const handler = require(rp('api/_lib/' + handlerFile));
  let done;
  const sent = new Promise((r) => { done = r; });
  const res = {
    code: 200, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { done({ code: this.code, body: b || {} }); return this; },
    end(b) { let j = {}; try { j = b ? JSON.parse(b) : {}; } catch (e) { j = { raw: b }; } done({ code: this.code, body: j }); return this; },
  };
  const req = { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' }, query: {}, body };
  return Promise.all([sent, handler(req, res)]).then(([out]) => out);
}

const IMG = 'QUJD'.repeat(40);
// أدوات العدّاد الذرّيّ (_dailyQuota.js): الحجز قبل التوليد، والرفض 402 daily_limit_reached بلا نداء مولّد.
const QUOTA_TOOLS = [
  { name: 'الديكور', ns: 'design', base: 3, file: 'design-create.js', body: (t) => ({ token: t, imageBase64: IMG, mimeType: 'image/jpeg', style: 'modern' }) },
  { name: 'الأزياء', ns: 'fashion', base: 3, file: 'fashion-create.js', body: (t) => ({ token: t, mode: 'text', description: 'عباية سوداء أنيقة', gender: 'female', style: 'modern' }) },
  { name: 'الاستوديو', ns: 'studio', base: 3, file: 'studio-create.js', body: (t) => ({ token: t, feature: 'hair', style: 'blonde', imageBase64: IMG, mimeType: 'image/jpeg' }) },
  { name: 'البورتريه', ns: 'portrait', base: 3, file: 'portrait-style.js', body: (t) => ({ token: t, imageBase64: IMG, mimeType: 'image/jpeg', style: 'anime' }) },
  { name: 'المقاولات (زاوية)', ns: 'construction', base: 6, file: 'construction-view.js', body: (t) => ({ token: t, mode: 'angle', buildingType: 'villa', area: 400, angle: 'front' }) },
  { name: 'المقاولات (توليد)', ns: 'construction', base: 6, file: 'construction-create.js', body: (t) => ({ token: t, buildingType: 'villa', area: 400, floors: 2, style: 'modern' }) },
];
// أدوات checkAndConsumeCustom (takeTally): العدّ قبل النداء، ولكلّ أداة شكل رفضها.
const limitMsg = (o) => String(o.body.message_ar || o.body.error || '');
const CUSTOM_TOOLS = [
  { name: 'قارئ وصف المقاولات', bucket: 'cx-brief', base: 120, file: 'construction-brief.js', body: (t) => ({ token: t, text: 'فيلا دورين ٤٠٠ متر مودرن' }),
    refused: (o) => o.code === 200 && o.body.reason === 'limit' },
  { name: 'محادثة الإعلانات', bucket: 'adchat', base: 30, file: 'adchat.js', body: (t) => ({ token: t, messages: [{ role: 'user', content: 'إعلان سيّارة للبيع' }] }),
    refused: (o) => o.code === 429 && o.body.error === 'limit', msg: limitMsg },
  { name: 'صورة الإعلان', bucket: 'adimage', base: 8, file: 'adimage.js', body: (t) => ({ token: t, title: 'لاندكروزر ٢٠٠٤', price: '49000', ratio: 'tall' }),
    refused: (o) => o.code === 429 && o.body.error === 'limit', msg: limitMsg, dailyLimit: true },
  { name: 'الطوابع', bucket: 'stamps', base: 8, file: 'stamps.js', body: (t) => ({ token: t, imageBase64: IMG, mimeType: 'image/jpeg', names: ['سارة'] }),
    refused: (o) => o.code === 429 && o.body.error === 'limit', msg: limitMsg, dailyLimit: true },
  { name: 'البحث الحيّ', bucket: 'search', base: 40, file: 'search.js', body: (t) => ({ token: t, query: 'سعر الذهب اليوم' }),
    refused: (o) => o.code === 402, msg: limitMsg },
  { name: 'البحث العميق', bucket: 'search', base: 40, file: 'search.js', body: (t) => ({ token: t, query: 'سعر الذهب اليوم', deep: true }),
    refused: (o) => o.code === 402, msg: limitMsg },
  { name: 'معلّم الأسهم', bucket: 'stocks-ai', base: 30, file: 'stocks.js', body: (t) => ({ token: t, mode: 'learn', topic: 'RSI' }),
    refused: (o) => o.code === 402 && o.body.error === 'daily_limit_reached' },
  { name: 'تحليل السهم', bucket: 'stocks-ai', base: 30, file: 'stocks.js', body: (t) => ({ token: t, mode: 'analyze', symbol: 'AAPL' }),
    refused: (o) => o.code === 402 && o.body.error === 'daily_limit_reached' },
  { name: 'صفقات المحفظة', bucket: 'stocks-pf', base: 40, file: 'stocks.js', body: (t) => ({ token: t, mode: 'pf-trade', tradeSymbol: '', qty: 0 }),
    refused: (o) => o.code === 402, msg: limitMsg },
];

const CHAT = { basic: 50, pro: 100, max: 250 }; // الافتراضيّ في tier.caps() — FREE_DAILY ٢٠
const scaled = (base, plan) => Math.floor((base * CHAT[plan]) / 20);
const DAY = 86400000;

test.before(async () => {
  const now = Date.now();
  await auth.putUser('free-old', { username: 'free-old', createdAt: now - 90 * DAY });
  await auth.putUser('free-new', { username: 'free-new', createdAt: now }); // يوم التسجيل
  for (const plan of ['basic', 'pro', 'max']) {
    await auth.putUser(plan + '-sub', { username: plan + '-sub', plan, planUpdatedAt: now - 3 * DAY, createdAt: now - 60 * DAY });
  }
  await auth.putUser('pro-expired', { username: 'pro-expired', plan: 'pro', planUpdatedAt: now - 36 * DAY, createdAt: now - 90 * DAY });
  await auth.putUser('pro-atomic', { username: 'pro-atomic', plan: 'pro', planUpdatedAt: now - DAY, createdAt: now - 60 * DAY });
  await auth.putUser('basic-env', { username: 'basic-env', plan: 'basic', planUpdatedAt: now - DAY, createdAt: now - 60 * DAY });
  await auth.putUser('basic-low', { username: 'basic-low', plan: 'basic', planUpdatedAt: now - DAY, createdAt: now - 60 * DAY });
  await auth.putUser('flaky-pro', { username: 'flaky-pro', plan: 'pro', planUpdatedAt: now - DAY, createdAt: now - 60 * DAY });
});

const isLimitRefusal = (o) => o.code === 402 && o.body.error === 'daily_limit_reached';

// الحدّ بالضبط: عند (المتوقَّع − ١) يمرّ الحجز (المقعد رقم المتوقَّع يُحجز)، وعند المتوقَّع يُرفض بلا نداء مولّد.
async function probeQuota(tool, user, expected) {
  const k = quotaKey(tool.ns, user);
  const tag = tool.name + ' · ' + user + ' (المتوقَّع ' + expected + ')';
  store.set(k, String(expected - 1));
  incrLog.length = 0;
  const a = await call(tool.file, tool.body(tok(user)));
  assert.ok(!isLimitRefusal(a) && a.code !== 401, tag + ': رُفض تحت الحدّ — ' + a.code + ' ' + JSON.stringify(a.body).slice(0, 120));
  assert.ok(incrLog.some(([key, v]) => key === k && v === expected), tag + ': لم يُحجز المقعد ' + expected);
  // v-plan-caps-r2: إلزاميّ — كلّ أدوات العدّاد الذرّيّ تولّد هنا بـ200، والواجهة تعرض remaining / dailyLimit
  assert.equal(a.code, 200, tag + ': لم يولّد — ' + JSON.stringify(a.body).slice(0, 120));
  assert.equal(a.body.dailyLimit, expected, tag + ': الردّ يحمل الحدّ المحسوب');
  assert.ok(Number.isInteger(a.body.remaining) && a.body.remaining >= 0, tag + ': المتبقّي ' + a.body.remaining);
  store.set(k, String(expected));
  const n = fetchCalls;
  const b = await call(tool.file, tool.body(tok(user)));
  assert.ok(isLimitRefusal(b), tag + ': مرّ فوق الحدّ — ' + b.code);
  assert.equal(fetchCalls, n, tag + ': المرفوض كلّف نداءً');
  assert.equal(store.get(k), String(expected), tag + ': الرفض يُرجع زيادته');
}

async function probeCustom(tool, user, expected) {
  const k = customKey(user, tool.bucket);
  const tag = tool.name + ' · ' + user + ' (المتوقَّع ' + expected + ')';
  store.set(k, String(expected - 1));
  const a = await call(tool.file, tool.body(tok(user)));
  assert.ok(!tool.refused(a), tag + ': رُفض تحت الحدّ — ' + a.code + ' ' + JSON.stringify(a.body).slice(0, 120));
  assert.equal(store.get(k), String(expected), tag + ': لم يُعدّ الطلب');
  if (tool.dailyLimit) { // v-plan-caps-r2: ردّ النجاح يحمل الحدّ المطبَّق لا الأساس الثابت
    assert.equal(a.code, 200, tag + ': لم يولّد — ' + JSON.stringify(a.body).slice(0, 120));
    assert.equal(a.body.dailyLimit, expected, tag + ': dailyLimit في الردّ');
  }
  const b = await call(tool.file, tool.body(tok(user)));
  assert.ok(tool.refused(b), tag + ': مرّ فوق الحدّ — ' + b.code + ' ' + JSON.stringify(b.body).slice(0, 120));
  assert.equal(store.get(k), String(expected), tag + ': الرفض يُرجع زيادته');
  if (tool.msg) assert.ok(tool.msg(b).includes('(' + expected), tag + ': رسالة الحدّ تذكر رقمًا غير المطبَّق — ' + tool.msg(b));
}

test('١. المجّانيّ على الأساس في كلّ أداة — ويوم التسجيل (FREE_FIRST_DAY) لا يرفعه', async () => {
  for (const tool of QUOTA_TOOLS) {
    await probeQuota(tool, 'free-old', tool.base);
    await probeQuota(tool, 'free-new', tool.base);
  }
  for (const tool of CUSTOM_TOOLS) {
    await probeCustom(tool, 'free-old', tool.base);
    await probeCustom(tool, 'free-new', tool.base);
  }
});

test('٢. المشترك بباقة سارية: floor(الأساس × سقف باقته ÷ سقف المجّانيّ) — الديكور ٣ ← ٧ · ١٥ · ٣٧', async () => {
  assert.deepEqual(['basic', 'pro', 'max'].map((p) => scaled(3, p)), [7, 15, 37]);
  assert.deepEqual(['basic', 'pro', 'max'].map((p) => scaled(6, p)), [15, 30, 75]);
  for (const plan of ['basic', 'pro', 'max']) {
    for (const tool of QUOTA_TOOLS) await probeQuota(tool, plan + '-sub', scaled(tool.base, plan));
    for (const tool of CUSTOM_TOOLS) await probeCustom(tool, plan + '-sub', scaled(tool.base, plan));
  }
});

test('٣. باقة منتهية (آخر دفعة قبل ٣٦ يومًا) = الأساس', async () => {
  for (const tool of QUOTA_TOOLS) await probeQuota(tool, 'pro-expired', tool.base);
  for (const tool of CUSTOM_TOOLS) await probeCustom(tool, 'pro-expired', tool.base);
});

test('٤. المالك وVIP بلا حدّ كما كانا', async () => {
  for (const user of ['omran', 'vipuser']) {
    for (const tool of QUOTA_TOOLS) {
      store.set(quotaKey(tool.ns, user), '100000');
      const n = fetchCalls;
      const o = await call(tool.file, tool.body(tok(user)));
      assert.ok(!isLimitRefusal(o) && o.code !== 401, tool.name + ' · ' + user + ': محدود — ' + o.code);
      assert.ok(fetchCalls > n, tool.name + ' · ' + user + ': لم يصل المولّد');
    }
    for (const tool of CUSTOM_TOOLS) {
      store.set(customKey(user, tool.bucket), '100000');
      const o = await call(tool.file, tool.body(tok(user)));
      assert.ok(!tool.refused(o), tool.name + ' · ' + user + ': محدود — ' + o.code);
      assert.equal(store.get(customKey(user, tool.bucket)), '100000', tool.name + ' · ' + user + ': عُدّ عليه');
    }
  }
});

test('٥. الذرّيّة محفوظة: عشرون طلب ديكور متزامنًا لمشترك Pro من الصفر — ١٥ تولّد بالضبط والباقي 402 بلا نداء', async () => {
  const before = fetchCalls;
  const out = await Promise.all(Array.from({ length: 20 }, () => call('design-create.js', QUOTA_TOOLS[0].body(tok('pro-atomic')))));
  const ok = out.filter((o) => o.code === 200);
  assert.equal(ok.length, 15, 'مرّ ' + ok.length);
  assert.equal(out.filter(isLimitRefusal).length, 5);
  assert.equal(fetchCalls - before, 15, 'المرفوض لا يكلّف المالك نداءً');
  assert.equal(store.get(quotaKey('design', 'pro-atomic')), '15', 'العدّاد = ما ولّد فعلًا');
  assert.ok(ok.every((o) => o.body.dailyLimit === 15), 'الواجهة ترى حدّ الباقة');
  assert.ok(ok.every((o) => Number.isInteger(o.body.remaining) && o.body.remaining >= 0 && o.body.remaining < 15), 'المتبقّي بين ٠ و١٤');
});

test('٦. السقوف تُقرأ من tier.caps() فتتبع البيئة، والمشترك لا ينزل تحت المجّانيّ', async () => {
  process.env.SUB_DAILY_BASIC = '80';
  try {
    await probeQuota(QUOTA_TOOLS[0], 'basic-env', 12); // floor(3 × 80 ÷ 20)
    await probeCustom(CUSTOM_TOOLS[4], 'basic-env', 160); // البحث floor(40 × 80 ÷ 20)
  } finally { delete process.env.SUB_DAILY_BASIC; }
  process.env.SUB_DAILY_BASIC = '10'; // ضبط خاطئ تحت سقف المجّانيّ
  try {
    await probeQuota(QUOTA_TOOLS[0], 'basic-low', 3);
  } finally { delete process.env.SUB_DAILY_BASIC; }
});

test('٧. عطل قراءة سجلّ الحساب = الحدّ الأساس (لا فتح)', async () => {
  failRead.add(auth.userPath('flaky-pro'));
  try {
    await probeQuota(QUOTA_TOOLS[0], 'flaky-pro', 3);
    await probeCustom(CUSTOM_TOOLS[4], 'flaky-pro', 40);
  } finally { failRead.delete(auth.userPath('flaky-pro')); }
  // العطل العابر على مسار الأداة لا يُكتب في ذاكرة الطبقة المشتركة: محادثته ترى باقته فور عودة القراءة.
  assert.equal((await require(rp('api/_lib/tier.js')).resolveTier('flaky-pro')).tier, 'sub', 'ذاكرة الطبقة تسمّمت بعطل الأداة');
  await probeQuota(QUOTA_TOOLS[0], 'flaky-pro', 15);
  // سجلّ غائب = ليس مشتركًا، بقراءة واحدة: getUser كانت ستنام ~١٫٨ث (أربع محاولات) على مسار كلّ توليد.
  const t0 = Date.now();
  await probeQuota(QUOTA_TOOLS[0], 'ghost-user', 3);
  assert.ok(Date.now() - t0 < 1000, 'قراءة الطبقة لسجلّ غائب أخذت ' + (Date.now() - t0) + 'ms');
});

test('٨. v-plan-consume-limit: الاستهلاك بالحدّ المحسوب في الفحص — عطل القراءة أو انتهاء الباقة أثناء التوليد لا يجعل المتبقّي سالبًا', async () => {
  const now = Date.now();
  for (const tool of QUOTA_TOOLS) {
    const user = 'mid-' + tool.ns + '-' + tool.file.replace(/\W/g, '');
    await auth.putUser(user, { username: user, plan: 'pro', planUpdatedAt: now - DAY, createdAt: now - 60 * DAY });
    const expected = scaled(tool.base, 'pro');
    for (const flip of ['read-fails', 'plan-ends']) {
      const k = quotaKey(tool.ns, user);
      store.set(k, String(expected - 1));
      const userKey = auth.userPath(user);
      const saved = store.get(userKey);
      let reads = 0;
      onGenerate = () => {
        if (flip === 'read-fails') failRead.add(userKey);
        else { const r = JSON.parse(saved); r.planUpdatedAt = now - 40 * DAY; store.set(userKey, JSON.stringify(r)); }
      };
      readHook = (key) => { if (key === userKey) reads++; };
      let a;
      try { a = await call(tool.file, tool.body(tok(user))); } finally {
        onGenerate = null; failRead.delete(userKey); store.set(userKey, saved); readHook = null;
      }
      const tag = tool.name + ' · ' + flip;
      assert.equal(a.code, 200, tag + ': ' + JSON.stringify(a.body).slice(0, 120));
      assert.equal(a.body.remaining, 0, tag + ': كان الأساس − المحجوز (سالبًا)');
      assert.equal(a.body.dailyLimit, expected, tag);
      assert.equal(store.get(k), String(expected), tag + ': العدّاد = ما ولّد');
      if (flip === 'plan-ends') assert.equal(reads, 1, tag + ': ' + reads + ' قراءات لسجلّ الحساب — قراءة الفحص وحدها؛ ٢ = الاستهلاك أعاد قراءة الطبقة، ٠ = العدّ أعمى');
    }
  }
});
