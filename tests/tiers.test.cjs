// tests/tiers.test.cjs — v-tiers (قرار المالك ١٢ سبتمبر): طبقات المحادثة الثلاث،
// السلسلة المجانية، الأسعار والباقات المتطابقة بين الخادم والواجهة.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-tiers';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const tier = require('../api/_lib/tier.js');
const fc = require('../api/_lib/free-chain.js');

const DAY = 86400000;

test('caps: safe defaults and env overrides', () => {
  assert.deepEqual(tier.caps({}), { guest: 3, free: 10, basic: 50, pro: 150, max: 400 });
  assert.equal(tier.caps({ FREE_DAILY: '25' }).free, 25);
  assert.equal(tier.caps({ FREE_DAILY: '5' }).free, 5, 'المالك يقدر ينزل إلى ٥ من البيئة');
  assert.equal(tier.caps({ FREE_DAILY: 'abc' }).free, 10, 'قيمة تالفة = البديل');
  assert.equal(tier.caps({ GUEST_DAILY: '-1' }).guest, 3);
  assert.equal(tier.caps({ SUB_DAILY_PRO: '999' }).pro, 999);
});

test('planActive: paid plan within 35 days only', () => {
  const now = 1_800_000_000_000;
  assert.equal(tier.planActive({ plan: 'pro', planUpdatedAt: now - 34 * DAY }, now), true);
  assert.equal(tier.planActive({ plan: 'basic', planUpdatedAt: now - 35 * DAY }, now), true);
  assert.equal(tier.planActive({ plan: 'max', planUpdatedAt: now - 36 * DAY }, now), false, 'انقطع الدفع → مجاني');
  assert.equal(tier.planActive({ plan: 'gold', planUpdatedAt: now }, now), false, 'خطة مجهولة');
  assert.equal(tier.planActive({ plan: 'pro' }, now), false, 'بلا تاريخ');
  assert.equal(tier.planActive({ plan: 'pro', planUpdatedAt: now - DAY, deleted: true }, now), false);
  assert.equal(tier.planActive(null, now), false);
});

test('resolveTier: guest / owner / vip / subscriber by plan / free', async () => {
  const now = 1_800_000_000_000;
  const users = {
    subpro: { plan: 'pro', planUpdatedAt: now - 3 * DAY, points: 900 },
    lapsed: { plan: 'max', planUpdatedAt: now - 90 * DAY, points: 5000 },
    rich: { points: 100000 },
  };
  const getUser = async (u) => users[u] || null;
  const isVip = async (u) => u === 'vipguy';
  const o = { getUser, isVip, now, noCache: true, env: {} };
  assert.deepEqual(await tier.resolveTier(null, o), { tier: 'guest', plan: null, cap: 3, subscriber: false });
  assert.deepEqual(await tier.resolveTier('Omran', o), { tier: 'owner', plan: null, cap: Infinity, subscriber: true });
  assert.deepEqual(await tier.resolveTier('vipguy', o), { tier: 'vip', plan: null, cap: Infinity, subscriber: true });
  assert.deepEqual(await tier.resolveTier('subpro', o), { tier: 'sub', plan: 'pro', cap: 150, subscriber: true });
  assert.deepEqual(await tier.resolveTier('lapsed', o), { tier: 'free', plan: null, cap: 10, subscriber: false }, 'اشتراك منتهٍ = مجاني');
  assert.deepEqual(await tier.resolveTier('rich', o), { tier: 'free', plan: null, cap: 10, subscriber: false }, 'النقاط وحدها لا تصنع مشتركًا');
  assert.deepEqual(await tier.resolveTier('nobody', o), { tier: 'free', plan: null, cap: 10, subscriber: false });
  const boom = await tier.resolveTier('subpro', Object.assign({}, o, { getUser: async () => { throw new Error('redis down'); } }));
  assert.equal(boom.tier, 'free', 'عطب القراءة لا يرفع أحدًا إلى مشترك');
});

test('paid providers are subscriber-only; the free chain and small tools are not', () => {
  for (const p of ['claude', 'openai', 'deepseek', 'cohere', 'perplexity', 'agent', 'CLAUDE']) assert.equal(tier.isPaidProvider(p), true, p);
  for (const p of ['gemini', 'groq', 'mistral', 'openrouter', 'chat', 'stt', 'general', '']) assert.equal(tier.isPaidProvider(p), false, p);
});

test('freeChain: order from env, providers without keys skipped, model overrides', () => {
  assert.deepEqual(tier.freeChain({}).map((s) => s.id), []);
  const env = { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', OPENROUTER_API_KEY: 'o' };
  assert.deepEqual(tier.freeChain(env).map((s) => s.id), ['gemini', 'groq', 'openrouter']);
  assert.deepEqual(tier.freeChain(Object.assign({ FREE_CHAIN: 'groq, gemini ,bogus' }, env)).map((s) => s.id), ['groq', 'gemini']);
  const g = tier.freeChain(Object.assign({ FREE_GEMINI_MODEL: 'gemini-9-flash' }, env))[0];
  assert.equal(g.model, 'gemini-9-flash', 'نموذج البيئة يُجرَّب أولًا');
  assert.equal(g.models[0], 'gemini-9-flash'); assert.equal(g.models[1], 'gemini-flash-latest');
  assert.equal(g.vision, true);
  assert.match(g.url, /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions/);
  assert.match(g.modelsUrl, /\/v1beta\/openai\/models$/);
  assert.equal(tier.freeChain(env)[0].model, 'gemini-flash-latest', 'الاسم المستعار الذي يعمل في بقية الخادم');
  assert.equal(tier.freeChain(env)[1].model, 'openai/gpt-oss-120b');
  for (const s of tier.freeChain(env)) { assert.equal(typeof s.key, 'string'); assert.ok(s.models.length >= 4, s.id + ' candidates'); assert.ok(s.pick instanceof RegExp); }
  /* مرشّح الانتقاء يلتقط نماذج flash النصّية فقط عند Gemini، والمجانية فقط عند OpenRouter */
  const specs = tier.FREE_PROVIDER_SPECS;
  assert.ok(specs.gemini.pick.test('models/gemini-3.1-flash-preview')); assert.ok(specs.gemini.pick.test('gemini-2.5-flash-lite'));
  assert.ok(!specs.gemini.pick.test('gemini-3-pro-image')); assert.ok(!specs.gemini.pick.test('gemini-2.5-flash-image')); assert.ok(!specs.gemini.pick.test('gemini-embedding-001'));
  assert.ok(specs.openrouter.pick.test('meta-llama/llama-4-scout:free')); assert.ok(!specs.openrouter.pick.test('meta-llama/llama-4-scout'));
  assert.ok(specs.groq.pick.test('meta-llama/llama-4-maverick-17b-128e-instruct')); assert.ok(specs.mistral.pick.test('mistral-small-2506'));
});

test('no provider name reaches the user in free-tier texts', () => {
  const texts = [tier.FREE_TEXT.freeLimit, tier.FREE_TEXT.guestLimit, tier.FREE_TEXT.subLimit(50), tier.FREE_TEXT.busy, tier.FREE_TEXT.subscribeOnly, fc.FREE_NOTE];
  for (const t of texts) assert.doesNotMatch(t, /كلاود|claude|gemini|جيميني|groq|mistral|llama|openrouter|anthropic|google/i, t);
  assert.match(tier.FREE_TEXT.guestLimit, /10 رسائل/);
  const app04 = read('js/app-04-i18n-state.js');
  const badge = app04.slice(app04.indexOf('v-tiers'), app04.indexOf('v-tiers') + 3000);
  assert.doesNotMatch(badge, /كلاود|claude/i);
});

test('toOpenAIMessages: text, images only for vision providers, no trailing assistant', () => {
  const convo = [
    { role: 'user', content: 'هلا' },
    { role: 'assistant', content: [{ type: 'text', text: 'هلا فيك' }] },
    { role: 'user', content: [{ type: 'text', text: 'شو في الصورة؟' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] },
    { role: 'assistant', content: 'ردّ ناقص' },
  ];
  const v = fc.toOpenAIMessages('SYS', convo, true);
  assert.equal(v[0].role, 'system'); assert.equal(v[0].content, 'SYS');
  assert.equal(v[v.length - 1].role, 'user', 'آخر رسالة للمستخدم');
  const last = v[v.length - 1];
  assert.equal(Array.isArray(last.content), true);
  assert.equal(last.content[1].type, 'image_url');
  assert.match(last.content[1].image_url.url, /^data:image\/png;base64,AAAA$/);
  const nv = fc.toOpenAIMessages('SYS', convo, false);
  const nlast = nv[nv.length - 1];
  assert.equal(typeof nlast.content, 'string');
  assert.match(nlast.content, /صورة مرفقة/);
  assert.doesNotMatch(nlast.content, /AAAA/);
});

function sse(deltas) {
  return deltas.map((d) => 'data: ' + JSON.stringify({ choices: [{ delta: { content: d } }] }) + '\n').join('') + 'data: [DONE]\n';
}

test('streamFreeChain: 429 on the first provider falls through, deltas are forwarded', async () => {
  const env = { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (/googleapis/.test(url)) return new Response('quota', { status: 429 });
    return new Response(sse(['مرحبًا ', 'بك']), { status: 200 });
  };
  const sent = [];
  const r = await fc.streamFreeChain({ system: 'SYS', convo: [{ role: 'user', content: 'هلا' }], send: (e) => sent.push(e), env, fetchImpl, log: () => {} });
  assert.equal(r.ok, true); assert.equal(r.provider, 'groq'); assert.equal(r.text, 'مرحبًا بك'); assert.equal(r.attempts, 2);
  assert.equal(r.model, 'openai/gpt-oss-120b');
  assert.deepEqual(sent, [{ delta: 'مرحبًا ' }, { delta: 'بك' }]);
  assert.equal(calls.length, 2, '429 عند Gemini ليس خطأ نموذج → لا تجربة مرشّحين آخرين عنده');
  assert.equal(calls[1].body.model, 'openai/gpt-oss-120b');
  assert.equal(calls[1].body.stream, true);
  assert.match(calls[1].body.messages[0].content, /الوضع المجاني/, 'ملاحظة الوضع المجاني في النظام');
  assert.equal(calls[1].body.messages[0].content.indexOf('SYS'), 0);
  fc.__workingModel.clear();
});

test('streamFreeChain: a retired model name (404) tries the next candidate, then /models discovery, and remembers the winner', async () => {
  const env = { GEMINI_API_KEY: 'g' };
  const calls = [];
  const fetchImpl = async (url, init) => {
    if (/\/openai\/models$/.test(url)) return new Response(JSON.stringify({ data: [{ id: 'models/gemini-3-pro-image' }, { id: 'models/gemini-3.1-flash-preview' }, { id: 'models/gemini-embedding-001' }] }), { status: 200 });
    const body = JSON.parse(init.body);
    calls.push(body.model);
    if (body.model === 'gemini-3.1-flash-preview') return new Response(sse(['ok']), { status: 200 });
    return new Response(JSON.stringify({ error: { code: 404, message: 'This model models/' + body.model + ' is no longer available to new users.' } }), { status: 404 });
  };
  const sent = [];
  fc.__workingModel.clear();
  const r = await fc.streamFreeChain({ system: 'SYS', convo: [{ role: 'user', content: 'هلا' }], send: (e) => sent.push(e), env, fetchImpl, log: () => {}, now: 1000 });
  assert.equal(r.ok, true); assert.equal(r.provider, 'gemini'); assert.equal(r.model, 'gemini-3.1-flash-preview');
  assert.deepEqual(sent, [{ delta: 'ok' }]);
  assert.equal(calls.length, 7, 'ستة مرشّحين ثم المكتشَف');
  assert.ok(r.errors.every((e) => /^gemini\/[\w.-]+: free-chain gemini http 404/.test(e)), r.errors.join(' | '));
  /* الرسالة التالية تبدأ بالنموذج الذي نجح مباشرة */
  calls.length = 0;
  const r2 = await fc.streamFreeChain({ system: 'SYS', convo: [{ role: 'user', content: 'هلا' }], send: () => {}, env, fetchImpl, log: () => {}, now: 2000 });
  assert.equal(r2.ok, true); assert.deepEqual(calls, ['gemini-3.1-flash-preview']);
  fc.__workingModel.clear();
});

test('isModelError: 404 and tier/model 400/403 only', () => {
  const mk = (status, body) => Object.assign(new Error('x'), { status, body });
  assert.equal(fc.isModelError(mk(404, '')), true);
  assert.equal(fc.isModelError(mk(403, '{"type":"tier_not_allowed"}')), true);
  assert.equal(fc.isModelError(mk(400, 'The model `x` does not exist')), true);
  assert.equal(fc.isModelError(mk(429, 'rate')), false);
  assert.equal(fc.isModelError(mk(401, 'bad key')), false);
  assert.equal(fc.isModelError(mk(503, 'down')), false);
});

test('streamFreeChain: all providers down → ok:false and nothing sent', async () => {
  const env = { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', MISTRAL_API_KEY: 'm' };
  const fetchImpl = async () => new Response('down', { status: 503 });
  const sent = [];
  const r = await fc.streamFreeChain({ system: 'SYS', convo: [{ role: 'user', content: 'هلا' }], send: (e) => sent.push(e), env, fetchImpl, log: () => {} });
  assert.equal(r.ok, false); assert.equal(r.attempts, 3); assert.deepEqual(sent, []);
  assert.deepEqual(r.errors, ['gemini: free-chain gemini http 503 down', 'groq: free-chain groq http 503 down', 'mistral: free-chain mistral http 503 down']);
  const none = await fc.streamFreeChain({ system: 'SYS', convo: [{ role: 'user', content: 'هلا' }], send: () => {}, env: {}, fetchImpl, log: () => {} });
  assert.deepEqual(none, { ok: false, provider: null, model: null, text: '', attempts: 0, errors: ['no-provider-keys'] });
});

test('chat.js wiring: tier first, free lane before the tool loop, limit as a reply with a tier event', () => {
  const chat = read('api/_lib/chat.js');
  assert.match(chat, /__tier = await tierLib\.resolveTier\(token \? __vt\(token\) : null\);/);
  assert.match(chat, /checkAndConsume\(token, guestId, \(__tier && !__tier\.subscriber\) \? 'chat' : prov, clientIp\(req\), \{ tier: __tier \|\| undefined \}\)/);
  assert.match(chat, /send\(\{ tier: usage\.tier === 'guest' \? 'guest-limit' : 'free-limit' \}\);\n\s+send\(\{ delta: usage\.message \|\| tierLib\.FREE_TEXT\.freeLimit \}\);\n\s+send\(\{ done: true \}\);/);
  assert.match(chat, /const __freeLane = !!\(usage\.tier && !usage\.subscriber\);/);
  assert.match(chat, /if \(__freeLane\) \{\n\s+send\(\{ tier: usage\.tier \}\);\n\s+const __fr = await streamFreeChain\(\{ system: PERSONA_NOTE \+ '\\n' \+ baseSystem \+ nowNote\(body && body\.tz\), convo, send \}\);\n\s+if \(!__fr\.ok\) \{[\s\S]*?send\(\{ tierDiag: \(__fr\.errors \|\| \[\]\)\.slice\(0, 6\) \}\);\n\s+send\(\{ delta: tierLib\.FREE_TEXT\.busy \}\);\n\s+\}\n\s+send\(\{ done: true \}\);\n\s+res\.end\(\);\n\s+return;\n\s+\}\n\s+while \(steps < MAX_STEPS\) \{/);
});

test('_usage.js wiring: tier caps, paid providers closed to non-subscribers, guest cap from env', () => {
  const u = read('api/_lib/_usage.js');
  assert.match(u, /const tier = \(o\.tier && typeof o\.tier === 'object'\) \? o\.tier : await tierLib\.resolveTier\(username\);/);
  assert.match(u, /if \(!tier\.subscriber && tierLib\.isPaidProvider\(providerKey\)\) \{\n\s+return \{ allowed: false, reason: 'limit', subscribeOnly: true/);
  assert.match(u, /const limit = Number\.isFinite\(tier\.cap\) \? tier\.cap : DAILY_LIMIT;/);
  assert.match(u, /const guestLimit = tierLib\.caps\(\)\.guest;/);
  assert.match(u, /if \(!tier\.subscriber && tierLib\.isPaidProvider\(p\)\) \{ remaining\[p\] = 0; return; \}/);
  for (const f of ['openai', 'claude', 'gemini', 'groq', 'mistral', 'deepseek', 'cohere', 'openrouter', 'perplexity', 'agent']) {
    assert.match(read('api/_lib/' + f + '.js'), /usage\.message \|\| \('وصلت للحد اليومي المجاني/, f + ': رسالة الحصة تأتي من الطبقة');
  }
});

test('client wiring: tier flows from the stream to the stored message to the badge', () => {
  assert.match(read('js/app-18-chat-tools.js'), /if \(typeof ev\.tier === 'string' && ev\.tier\) __tier = ev\.tier;/);
  assert.match(read('js/app-18-chat-tools.js'), /tier: __tier \|\| undefined \};/);
  const a9 = read('js/app-09-attach.js');
  assert.match(a9, /if\(__ct\.tier\) __ctTier = __ct\.tier;/);
  assert.match(a9, /tier: __ctTier \|\| undefined, \/\* v-tiers \*\//);
  const a4 = read('js/app-04-i18n-state.js');
  assert.match(a4, /m\.tier === 'free' \|\| m\.tier === 'free-limit' \|\| m\.tier === 'guest' \|\| m\.tier === 'guest-limit'/);
  assert.match(a4, /openCheckout\('pro'\)/);
  assert.match(a4, /btnAuthToggle/);
});

test('points: image 20 (4K 30), maha minute 15; refunds return the charged amount', () => {
  const { COSTS } = require('../api/_lib/points.js');
  assert.equal(COSTS.image, 20); assert.equal(COSTS.image_4k, 30); assert.equal(COSTS.maha_minute, 15);
  assert.equal(COSTS.runway_video, 60); assert.equal(COSTS.veo_video, 400); assert.equal(COSTS.premium_claude, 20);
  const mi = read('api/_lib/maha-image.js');
  assert.match(mi, /const __imgCost = __ask4K \? pointsLib\.COSTS\.image_4k : pointsLib\.COSTS\.image;/);
  assert.match(mi, /mahaImgChargedAmount = __imgCost;/);
  assert.match(mi, /const amount = mahaImgChargedAmount \|\| pointsLib\.COSTS\.image;\n\s+mahaImgCharged = null;\n\s+try \{ await pointsLib\.refundPoints\(user, amount\); \}/);
});

function parsePlans(src) {
  const out = {};
  const re = /(basic|pro|max): \{ amount: '?([\d.]+)'?, points: (\d+)/g;
  let m;
  while ((m = re.exec(src))) out[m[1]] = { amount: Number(m[2]), points: Number(m[3]) };
  return out;
}

test('plans: 500 / 1,200 / 7,000 — identical in Stripe and PayPal, advertised the same in the UI', () => {
  const stripe = parsePlans(read('api/_lib/create-checkout-session.js'));
  const paypal = parsePlans(read('api/_lib/paypal-order.js'));
  assert.deepEqual(stripe, { basic: { amount: 1000, points: 500 }, pro: { amount: 2000, points: 1200 }, max: { amount: 10000, points: 7000 } });
  assert.deepEqual(paypal, { basic: { amount: 10, points: 500 }, pro: { amount: 20, points: 1200 }, max: { amount: 100, points: 7000 } });
  const ps = read('js/partials-settings.js');
  for (const s of ['<b>500</b>', '<b>1,200</b>', '<b>7,000</b>', '10 رسائل يوميًا', '50 رسالة احترافية يوميًا', '150 رسالة احترافية يوميًا', '400 رسالة احترافية يوميًا', 'مها: 15 نقطة/دقيقة', 'صورة: 20']) assert.ok(ps.includes(s), 'partials-settings: ' + s);
  for (const s of ['<b>300</b>', '<b>800</b>', '<b>5,000</b>', '20 رسالة يوميًا', 'رسائل بلا حدود', 'صورة: 10']) assert.ok(!ps.includes(s), 'partials-settings stale: ' + s);
  const ph = read('pricing.html');
  for (const s of ['<b>500</b>', '<b>1,200</b>', '<b>7,000</b>', '10 رسائل يوميًا', '<div class="val">15</div>', '<div class="val">20</div>']) assert.ok(ph.includes(s), 'pricing.html: ' + s);
  for (const s of ['<b>300</b>', '<b>800</b>', '<b>5,000</b>', 'رسائل بلا حدود', '<div class="val">10</div>']) assert.ok(!ph.includes(s), 'pricing.html stale: ' + s);
  const i18n = read('js/app-03-i18n-data.js');
  assert.ok(i18n.includes("plFreeMsgs: '10 رسائل يوميًا'") && i18n.includes("plFreeMsgs: '10 messages a day'"));
  assert.ok(i18n.includes("plStMsgs: '50 رسالة احترافية يوميًا'") && i18n.includes("plProMsgs: '150 pro messages a day'"));
});

test('paypal capture is idempotent per order id', () => {
  const pp = read('api/_lib/paypal-order.js');
  assert.match(pp, /if \(user && !user\.deleted && user\.lastPaypalOrderId === data\.id\) \{[\s\S]*?pointsAdded = 0;[\s\S]*?\} else if \(user && !user\.deleted\) \{\n\s+user\.plan = matchedPlan;/);
});

test('env docs list every tier knob', () => {
  const env = read('api/_lib/env.js');
  const ex = read('.env.example');
  for (const k of ['FREE_DAILY', 'GUEST_DAILY', 'SUB_DAILY_BASIC', 'SUB_DAILY_PRO', 'SUB_DAILY_MAX', 'FREE_CHAIN', 'FREE_GEMINI_MODEL', 'FREE_OPENROUTER_MODEL']) {
    assert.ok(env.includes(k + ':'), 'env.js: ' + k);
    assert.ok(ex.includes('# ' + k + '='), '.env.example: ' + k);
  }
});
