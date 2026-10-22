// tests/farm-gate.test.cjs — v-farm-gate (مزرعة الحسابات، موافقة المالك): حساب فوق سقف هديّة شبكته (points:0) كان يأخذ أدوات
// الصور المجّانيّة اليوميّة (~٦٣ صورة ≈ ٧٫٨ دولار يوميًّا بجدول UNIT_COST) وتجربة مها — بلا نقطة واحدة، والحسابات بلا حدّ.
// ومعها: حدّ 0 يفتحه عطل KV، تغيير الاسم يصفّر الحصّة، امتلاء القاعدة يوقف العدّ، وتدوير IPv6 داخل /64 يجدّد صور الضيف.
// على المعالجات الحقيقيّة (auth، design، fashion، studio، portrait، construction(+view)، adimage، stamps، realtime-session،
// maha-image)؛ Redis في الذاكرة وfetch مزيّف يعدّ كلّ نداء خارجيّ (مدفوع). لا مؤقّت يُقصَّر: حجز الحصّة (HOLD_MAX_MS) حقيقيّ،
// والتسجيلات المتوازية تتداخل في نوم getUser (٣٠٠/٦٠٠/٩٠٠م.ث حين يغيب السجلّ) بدل تقصيره.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.OMRAN_TEST_FAST_SLEEP = '1'; // v-time-seam: getUser لسجلّ غائب بلا ١٫٨ ثانية نوم حقيقيّ (المنطق والمحاولات كما هي)
process.env.AUTH_SECRET = 'farm-gate-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.IMAGE_UPSCALE = 'off';
process.env.IMAGE_CARDS = 'off';
delete process.env.IMAGE_VERIFY;
delete process.env.OWNER_USERNAMES;
delete process.env.OWNER_USERNAME;
const ENV = ['WELCOME_GIFT_PER_IP_DAILY', 'WELCOME_GIFT_DAILY', 'OTP_SIGNUP_GIFT', 'FREE_MEDIA_DAILY', 'MAHA_TRIAL_DAILY', 'FREE_TOOLS_GIFT_GATE', 'IMAGE_DUO', 'GUEST_DAILY'];
for (const k of ENV) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// _dailyQuota يفكّ دوالّ kv عند التحميل: الأعطال تُحقن بأعلام داخل المحاكي لا باستبدال الدالّة.
const store = new Map();
let failFree = null; // عطب على عدّادات db/free-* وحدها
let failTally = null; // عطب على عدّادات الحصّة اليوميّة (db/<ns>-usage/tally/)
let failGift = null; // عطب على عدّادات هديّة الترحيب
const tick = () => new Promise((r) => setImmediate(r));
const chk = (k) => {
  const s = String(k);
  if (failFree && s.startsWith('db/free-')) throw failFree;
  if (failGift && s.startsWith('db/welcome-gift/')) throw failGift;
  if (failTally && s.includes('-usage/tally/')) throw failTally;
};
const incrBy = (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; };
const kvImpl = {
  kvGetJSON: async (k) => { await tick(); if (!store.has(k)) return null; try { return JSON.parse(store.get(k)); } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { await tick(); store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { await tick(); return store.has(k) ? String(store.get(k)) : null; },
  kvSetRaw: async (k, v) => { await tick(); store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await tick(); chk(k); if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { await tick(); chk(k); return incrBy(k, 1); },
  kvIncrBy: async (k, n) => { await tick(); chk(k); return incrBy(k, n); },
  kvDecrBy: async (k, n) => { await tick(); return incrBy(k, -Number(n)); },
  kvExpire: async () => {},
  kvDel: async (k) => { store.delete(k); },
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    if (op === 'GET') return store.has(k) ? store.get(k) : null;
    if (op === 'INCRBY') return incrBy(k, a);
    if (op === 'EXPIRE') return 1;
    if (op === 'DEL') { store.delete(k); return 1; }
    return null;
  }),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SRC = fs.readFileSync(path.join(root, 'tests/fixtures/styles-grid-source.jpg')).toString('base64');
let calls = 0; // كلّ نداء خارجيّ — كلّها على مفاتيح المالك
let failImg = false;
let failRt = false;
global.fetch = async (url, init) => {
  calls++;
  const u = String(url);
  if (/images\/(generations|edits)/.test(u)) return failImg ? Response.json({ error: { message: 'x' } }, { status: 500 }) : Response.json({ data: [{ b64_json: PNG }] });
  if (/realtime\/client_secrets/.test(u)) return failRt ? Response.json({ error: { message: 'x' } }, { status: 500 }) : Response.json({ value: 'ek_test' });
  if (/gemini-3-pro-image|flash-image/.test(u) && failImg) /* v-decor-fallback: «فشل المولّد» يشمل نانو ٢ البديل */ return Response.json({ error: { message: 'x' } }, { status: 503 });
  if (u.includes('gemini-flash-latest') && !String((init && init.body) || '').includes('<<<BOQ>>>')) return Response.json({ error: 'offline judge' }, { status: 503 }); // v-dead-models-2: نصّ دراسة الإنشاء صار على Flash نفسه — الحَكَم وحده غائب
  return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: SRC } }, { text: 'A' }] } }] });
};

const auth = require(rp('api/_lib/auth.js'));
const H = {
  design: require(rp('api/_lib/design-create.js')),
  fashion: require(rp('api/_lib/fashion-create.js')),
  studio: require(rp('api/_lib/studio-create.js')),
  portrait: require(rp('api/_lib/portrait-style.js')),
  construction: require(rp('api/_lib/construction-create.js')),
  cview: require(rp('api/_lib/construction-view.js')),
  adimage: require(rp('api/_lib/adimage.js')),
  stamps: require(rp('api/_lib/stamps.js')),
  maha: require(rp('api/_lib/realtime-session.js')),
  draw: require(rp('api/_lib/maha-image.js')),
  translate: require(rp('api/_lib/translate.js')), // أداة نصّ على checkAndConsumeCustom (الرمز الميّت بعد تغيير الاسم)
};
const BODY = {
  design: (t) => ({ token: t, place: 'living', style: 'modern', count: 1 }),
  fashion: (t) => ({ token: t, mode: 'text', description: 'abaya', gender: 'women' }),
  studio: (t) => ({ token: t, feature: 'hair', style: 'blonde', imageBase64: PNG, mimeType: 'image/png' }),
  portrait: (t) => ({ token: t, style: 'cartoon', imageBase64: PNG, mimeType: 'image/png' }),
  construction: (t) => ({ token: t, buildingType: 'villa', area: 300, includePlan: true }),
  cview: (t) => ({ token: t, buildingType: 'villa', area: 300, mode: 'angle', angle: 'front' }),
  adimage: (t) => ({ token: t, title: 'Car', cat: 'car' }),
  stamps: (t) => ({ token: t, name: 'Ali', imageBase64: PNG.repeat(3), mimeType: 'image/png' }),
  maha: (t) => (t ? { token: t } : { guestId: 'guestmaha01' }),
  translate: (t) => ({ token: t, texts: ['hello'], targetLang: 'ar' }),
};
const QUOTA_TOOLS = ['design', 'fashion', 'studio', 'portrait', 'construction', 'cview']; // _dailyQuota
const TALLY_TOOLS = ['adimage', 'stamps']; // takeTally (checkAndConsumePlanCustom)

function fakeRes() {
  let done; const sent = new Promise((r) => { done = r; });
  const res = { code: 200, setHeader() { return this; }, status(c) { this.code = c; return this; },
    json(b) { done({ code: this.code, body: b }); return this; }, send(b) { let x = b; try { x = JSON.parse(b); } catch (e) { /* نصّ */ } done({ code: this.code, body: x }); return this; },
    end(b) { let x = b; try { x = JSON.parse(b); } catch (e) { /* نصّ */ } done({ code: this.code, body: x }); return this; } };
  return { res, sent };
}
async function call(tool, token, ip) {
  const { res, sent } = fakeRes();
  const before = calls;
  const [out] = await Promise.all([sent, H[tool]({ method: 'POST', headers: { 'x-forwarded-for': ip || '203.0.113.7' }, query: {}, body: BODY[tool](token) }, res)]);
  return Object.assign(out, { paid: calls - before });
}
const guestDraw = async (guestId, ip) => {
  const { res, sent } = fakeRes();
  const before = calls;
  const [out] = await Promise.all([sent, H.draw({ method: 'POST', headers: { 'x-forwarded-for': ip }, query: {}, body: { prompt: 'ارسم قطة على كرسي', guestId } }, res)]);
  return Object.assign(out, { paid: calls - before });
};
async function signup(name, ip) {
  const r = { setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await auth({ method: 'POST', headers: { 'x-forwarded-for': ip }, body: { action: 'signup', username: name, password: 'pass12345' } }, r);
  assert.equal(r.code || 200, 200, 'signup ' + name);
  return r.body.token;
}
async function rename(token, newUsername) {
  const r = { setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await auth({ method: 'POST', headers: {}, body: { action: 'changeUsername', token, newUsername } }, r);
  return { code: r.code || 200, body: r.body };
}
const day = () => new Date().toISOString().slice(0, 10);
const freeKey = (n) => 'db/free-' + n + '/all/' + day();
function reset(env) {
  store.clear(); failFree = null; failTally = null; failGift = null; failImg = false; failRt = false;
  for (const k of ENV) delete process.env[k];
  Object.assign(process.env, env || {});
}
const put = (name, extra) => auth.putUser(name, Object.assign({ username: name, salt: 's', hash: 'h', createdAt: Date.now() - 86400000 }, extra || {}));
const tok = (name) => auth.makeToken(name);
const CAPPED = { points: 0, welcomeGift: false, giftCapped: true };

test('١. المزرعة: حساب فوق سقف شبكته — كلّ أداة صور ٤٠٢/٤٢٩ بصفر نداء، ومها ٤٠٢ لا تُعلَّم تجربتها (الرموز القائمة)', async () => {
  reset({ WELCOME_GIFT_PER_IP_DAILY: '1' });
  await signup('giftedone', '203.0.113.7');
  const t = await signup('farmtwo', '203.0.113.7');
  for (const tool of QUOTA_TOOLS) {
    const o = await call(tool, t);
    assert.equal(o.paid, 0, tool + ': لا نداء مدفوع');
    assert.equal(o.code, 402, tool); assert.equal(o.body.error, 'daily_limit_reached', tool);
  }
  for (const tool of TALLY_TOOLS) {
    const o = await call(tool, t);
    assert.equal(o.paid, 0, tool + ': لا نداء مدفوع');
    assert.equal(o.code, 429, tool); assert.equal(o.body.error, 'limit', tool);
  }
  const m = await call('maha', t);
  assert.equal(m.paid, 0, 'مها: لا جلسة');
  assert.equal(m.code, 402); assert.equal(m.body.error, 'points_insufficient');
  const u = await auth.getUser('farmtwo');
  assert.notEqual(u.mahaTrialUsed, true, 'التجربة لم تُعلَّم مستعملة');
  assert.equal(u.points, 0); assert.equal(u.welcomeGift, false);
  assert.equal(u.giftCapped, true, 'سقف الشبكة = giftCapped:true صريحًا');
  assert.equal((await auth.getUser('giftedone')).giftCapped, false);
});

test('٢. المكتب: عشرون تسجيلًا من IPv4 واحد بالافتراضيّ — هديّة كلّها، لا سقف، ٣ ديكور ثمّ ٤٠٢، وتجربة مها لكلّ واحد', async () => {
  reset();
  const names = Array.from({ length: 20 }, (_, i) => 'office' + i);
  const tokens = await Promise.all(names.map((n) => signup(n, '198.51.100.20')));
  for (let i = 0; i < names.length; i++) {
    const u = await auth.getUser(names[i]);
    assert.equal(u.welcomeGift, true, names[i]); assert.equal(u.points, 70, names[i]); assert.equal(u.giftCapped, false, names[i]);
    const codes = [];
    for (let k = 0; k < 4; k++) codes.push((await call('design', tokens[i], '198.51.100.20')).code);
    assert.deepEqual(codes, [200, 200, 200, 402], names[i]);
    const m = await call('maha', tokens[i], '198.51.100.20');
    assert.equal(m.code, 200, names[i]); assert.equal(m.body.mahaBudget.prepaid, 'trial', names[i]);
  }
  for (const tool of QUOTA_TOOLS.concat(TALLY_TOOLS).filter((x) => x !== 'design')) assert.equal((await call(tool, tokens[0], '198.51.100.20')).code, 200, tool);
});

test('٣. استنزاف السقف العامّ من شبكة لا يحرم أمينًا على شبكة أخرى: بلا هديّة لكن بلا سقف — الأدوات والتجربة كما كانت', async () => {
  reset({ WELCOME_GIFT_DAILY: '1' });
  await signup('farmfirst', '203.0.113.50');
  const t = await signup('honest', '198.51.100.21');
  const u = await auth.getUser('honest');
  assert.equal(u.welcomeGift, false); assert.equal(u.points, 0);
  assert.equal(u.giftCapped, false, 'السقف العامّ ليس سقف الشبكة');
  assert.equal((await call('design', t, '198.51.100.21')).code, 200);
  assert.equal((await call('adimage', t, '198.51.100.21')).code, 200);
  const m = await call('maha', t, '198.51.100.21');
  assert.equal(m.code, 200); assert.equal(m.body.mahaBudget.prepaid, 'trial');
});

test('٤. القديم حرّ: سجلّ بلا الحقلين، وwelcomeGift:false بلا giftCapped ولو بعد السقف (لا حكم بأثر رجعيّ)', async () => {
  reset();
  await put('legacy', { createdAt: Date.parse('2026-01-01') });
  await put('nofield', { points: 0, welcomeGift: false, createdAt: Date.now() });
  for (const n of ['legacy', 'nofield']) {
    for (const tool of QUOTA_TOOLS.concat(TALLY_TOOLS)) assert.equal((await call(tool, tok(n))).code, 200, n + ' ' + tool);
    const m = await call('maha', tok(n));
    assert.equal(m.code, 200, n); assert.equal(m.body.mahaBudget.prepaid, 'trial', n);
  }
});

test('٥. عطب KV عند التسجيل، أو هديّة أطفأتها البيئة: رصيد 0 وgiftCapped:false — الأدوات كما كانت', async () => {
  reset();
  failGift = new Error('Upstash error: down');
  const t1 = await signup('kvglitch', '192.0.2.88');
  failGift = null;
  const u1 = await auth.getUser('kvglitch');
  assert.equal(u1.welcomeGift, false); assert.equal(u1.giftCapped, false);
  assert.equal((await call('design', t1, '192.0.2.88')).code, 200);
  process.env.WELCOME_GIFT_DAILY = '0';
  const t2 = await signup('giftoff', '192.0.2.89');
  const u2 = await auth.getUser('giftoff');
  assert.equal(u2.welcomeGift, false); assert.equal(u2.giftCapped, false);
  assert.equal((await call('design', t2, '192.0.2.89')).code, 200);
});

test('٦. الدافع حرّ ولو سُقف: باقة وسائط سارية، أو أثر شراء نقاط، أو باقة محادثة؛ ومفتاح الطوارئ FREE_TOOLS_GIFT_GATE=off', async () => {
  reset();
  await put('capped', CAPPED);
  assert.equal((await call('design', tok('capped'))).code, 402, 'المسقوف بلا دفع');
  await put('mediaplan', Object.assign({ media: { mix: { plan: 'media_pro', at: Date.now() } } }, CAPPED));
  await put('packbuyer', Object.assign({}, CAPPED, { points: 100, lastStripeSessionId: 'cs_test_pack' }));
  await put('chatplan', Object.assign({ plan: 'pro', planUpdatedAt: Date.now() }, CAPPED));
  for (const n of ['mediaplan', 'packbuyer', 'chatplan']) {
    assert.equal((await call('design', tok(n))).code, 200, n);
    assert.equal((await call('adimage', tok(n))).code, 200, n);
  }
  const m = await call('maha', tok('packbuyer'));
  assert.equal(m.code, 200); assert.equal(m.body.mahaBudget.prepaid, 'trial', 'مشتري النقاط له التجربة');
  process.env.FREE_TOOLS_GIFT_GATE = 'off';
  assert.equal((await call('design', tok('capped'))).code, 200, 'مفتاح الطوارئ يعيد السلوك السابق');
  assert.equal((await call('stamps', tok('capped'))).code, 200);
});

test('٧. حدّ 0 لا يفتحه عطل KV عامّ (لا امتلاء): المسقوف ٤٠٢/٤٢٩ بصفر نداء؛ والمجّانيّ العاديّ مفتوح كما كان (atomic-quota ٨)', async () => {
  reset();
  await put('capped', CAPPED);
  await put('plainfree', { points: 70, welcomeGift: true, giftCapped: false });
  failTally = new Error('Upstash error: ERR max requests limit exceeded');
  try {
    for (const tool of QUOTA_TOOLS) {
      const o = await call(tool, tok('capped'));
      assert.equal(o.paid, 0, tool); assert.equal(o.code, 402, tool);
    }
    for (const tool of TALLY_TOOLS) {
      const o = await call(tool, tok('capped'));
      assert.equal(o.paid, 0, tool); assert.equal(o.code, 429, tool);
    }
    assert.equal((await call('design', tok('plainfree'))).code, 200, 'العطب العابر لا يغلق على الجميع');
  } finally { failTally = null; }
});

test('٨. تغيير الاسم لا يصفّر حصص أدوات الصور: ٣ ديكور ثمّ تغيير ثمّ ٤٠٢ بلا نداء — ذهابًا وإيابًا', async () => {
  reset();
  await put('renamer', { points: 70, welcomeGift: true, giftCapped: false });
  let t = tok('renamer');
  const codes = [];
  for (let k = 0; k < 3; k++) codes.push((await call('design', t)).code);
  codes.push((await call('portrait', t)).code);
  assert.deepEqual(codes, [200, 200, 200, 200]);
  let r = await rename(t, 'renamer2');
  assert.equal(r.code, 200);
  t = r.body.token;
  const after = await call('design', t);
  assert.equal(after.paid, 0); assert.equal(after.code, 402, 'الحصّة تبعت الحساب');
  assert.equal(store.get('db/design-usage/tally/renamer2/' + day()), '3');
  assert.equal(store.has('db/design-usage/tally/renamer/' + day()), false, 'لا عدّاد تحت الاسم القديم');
  assert.equal(store.get('db/portrait-usage/tally/renamer2/' + day()), '1');
  r = await rename(t, 'renamer');
  assert.equal(r.code, 200);
  assert.equal((await call('design', r.body.token)).code, 402, 'والرجوع للاسم القديم لا يعيدها');
});

test('٨ب. كلّ أداة تعدّ في _dailyQuota تنتقل بتغيير الاسم (NAMESPACES مستخرجة من الكود)', () => {
  const q = require(rp('api/_lib/_dailyQuota.js'));
  const walk = (d, out) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p, out); else if (/\.js$/.test(f)) out.push(p); } return out; };
  const found = new Set();
  for (const f of walk(path.join(root, 'api'), [])) {
    if (/_dailyQuota\.js$/.test(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    if (!/_dailyQuota/.test(s)) continue;
    for (const m of s.matchAll(/\b(?:check|consume|giveBack)\('([a-z0-9-]+)'/g)) found.add(m[1]);
  }
  assert.ok(found.size >= 7, [...found].join(','));
  assert.deepEqual([...found].sort(), [...q.NAMESPACES].sort());
  const src = fs.readFileSync(path.join(root, 'api/_lib/auth.js'), 'utf8');
  assert.match(src, /await step\('daily-quota', \(\) => require\('\.\/_dailyQuota\.js'\)\.moveToday\(oldKey, newKey\)\);/, 'moveLiveCounters ينقل حصص _dailyQuota (خطوة مستقلّة)');
});

test('٩. FREE_MEDIA_DAILY غير مضبوط = بلا سقف كلّيّ ولا عدّ (الافتراضيّ)', async () => {
  reset();
  for (const n of ['fa', 'fb', 'fc', 'fd']) {
    await put(n, { points: 70, welcomeGift: true, giftCapped: false });
    assert.equal((await call('design', tok(n))).code, 200, n);
  }
  assert.equal([...store.keys()].some((k) => k.startsWith('db/free-media/')), false);
});

test('١٠. FREE_MEDIA_DAILY=2: الثالث ٤٠٢ بلا نداء، فشل التوليد يردّ المقعد، المشترك وباقة الوسائط خارجه، والعطب مغلق للمجّانيّ وحده', async () => {
  reset({ FREE_MEDIA_DAILY: '2' });
  for (const n of ['gaa', 'gbb', 'gcc']) await put(n, { points: 70, welcomeGift: true, giftCapped: false });
  const out = [];
  for (const n of ['gaa', 'gbb', 'gcc']) out.push(await call('design', tok(n)));
  assert.equal(out[2].paid, 0, 'الثالث بلا نداء');
  assert.deepEqual(out.map((o) => o.code), [200, 200, 402]);
  assert.equal(out[2].body.error, 'daily_limit_reached');
  assert.equal(store.get(freeKey('media')), '2');
  assert.equal(store.get('db/design-usage/tally/gcc/' + day()), '0', 'المرفوض لا يأكل حصّة حسابه');

  store.set(freeKey('media'), '1');
  failImg = true;
  const f = await call('design', tok('gaa'));
  failImg = false;
  assert.notEqual(f.code, 200);
  assert.equal(store.get(freeKey('media')), '1', 'فشل المولّد يردّ المقعد الكلّيّ');
  assert.equal(store.get('db/design-usage/tally/gaa/' + day()), '1', 'وحصّة الحساب');

  await put('subr', { points: 0, plan: 'pro', planUpdatedAt: Date.now() });
  await put('mediapayer', { points: 0, media: { mix: { plan: 'media_pro', at: Date.now() } } });
  store.set(freeKey('media'), '2');
  for (const n of ['subr', 'mediapayer']) {
    assert.equal((await call('design', tok(n))).code, 200, n + ' لا يُحجب');
    assert.equal(store.get(freeKey('media')), '2', n + ' لا يُعدّ');
  }

  store.set(freeKey('media'), '0');
  failFree = new Error('Upstash error: down');
  try {
    const o = await call('design', tok('gbb'));
    assert.equal(o.paid, 0); assert.equal(o.code, 402, 'عطب السقف المضبوط = مغلق للمجّانيّ');
    assert.equal((await call('design', tok('subr'))).code, 200, 'والمشترك كما كان');
  } finally { failFree = null; }
  failTally = new Error('Upstash error: ERR max requests limit exceeded');
  try {
    const o = await call('fashion', tok('gbb'));
    assert.equal(o.paid, 0); assert.equal(o.code, 402, 'السقف مضبوط والحصّة لا تُعدّ = مغلق للمجّانيّ');
    assert.equal((await call('fashion', tok('mediapayer'))).code, 200, 'وباقة الوسائط مفتوحة كما كانت');
  } finally { failTally = null; }
});

test('١١. MAHA_TRIAL_DAILY=1: التجربة الثانية ٤٠٢ لصاحب الصفر ولا تُعلَّم؛ رفض المزوّد يردّ المقعد؛ وتجربة الضيف من السقف نفسه', async () => {
  reset({ MAHA_TRIAL_DAILY: '1' });
  for (const n of ['maa', 'mbb', 'mcc']) await put(n, { points: 0 });
  const a = await call('maha', tok('maa'));
  assert.equal(a.code, 200); assert.equal(a.body.mahaBudget.prepaid, 'trial');
  const b = await call('maha', tok('mbb'));
  assert.equal(b.paid, 0, 'لا جلسة');
  assert.equal(b.code, 402); assert.equal(b.body.error, 'points_insufficient');
  assert.notEqual((await auth.getUser('mbb')).mahaTrialUsed, true, 'المرفوض لا يُعلَّم');
  assert.equal(store.get(freeKey('maha-trial')), '1');

  store.set(freeKey('maha-trial'), '0');
  failRt = true;
  const c = await call('maha', tok('mcc'));
  failRt = false;
  assert.notEqual(c.code, 200);
  assert.equal(store.get(freeKey('maha-trial')), '0', 'رفض المزوّد يردّ مقعد اليوم');
  assert.notEqual((await auth.getUser('mcc')).mahaTrialUsed, true, 'والتجربة باقية');
  assert.equal((await call('maha', tok('mcc'))).body.mahaBudget.prepaid, 'trial');

  process.env.GUEST_DAILY = '5'; // يفتح فرع الضيف (مغلق افتراضيًّا بـGUEST_DAILY=0)
  store.set(freeKey('maha-trial'), '0');
  failRt = true;
  const gf = await call('maha', null, '192.0.2.150');
  failRt = false;
  assert.notEqual(gf.code, 200);
  assert.equal(store.get(freeKey('maha-trial')), '0', 'ضيف رُفضت جلسته يردّ المقعد');
  const g1 = await call('maha', null, '192.0.2.151');
  assert.equal(g1.code, 200); assert.equal(g1.body.mahaBudget.guest, true);
  const g2 = await call('maha', null, '192.0.2.152');
  assert.equal(g2.paid, 0, 'لا جلسة');
  assert.equal(g2.code, 402); assert.equal(g2.body.error, 'guest_trial_used', 'عنوان جديد لا يتجاوز السقف الكلّيّ');
  assert.equal(store.has('db/points/guest-maha/ip-192.0.2.152'), false, 'المرفوض لا يُعلَّم');
});

test('١٢. امتلاء القاعدة (OOM) على حجز الحصّة: المجّانيّ ٤٠٢ بلا نداء، والمشترك وباقة الوسائط ٢٠٠', async () => {
  reset();
  await put('oomfree', { points: 70, welcomeGift: true, giftCapped: false });
  await put('oomsub', { points: 0, plan: 'basic', planUpdatedAt: Date.now() });
  await put('oommedia', { points: 0, media: { image: { plan: 'img_basic', at: Date.now() } } });
  failTally = new Error('ERR DB capacity quota exceeded. Threshold: 268435456 bytes');
  try {
    const o = await call('design', tok('oomfree'));
    assert.equal(o.paid, 0); assert.equal(o.code, 402);
    assert.equal((await call('design', tok('oomsub'))).code, 200, 'المشترك لا يُحجب في الامتلاء');
    assert.equal((await call('studio', tok('oommedia'))).code, 200, 'ولا صاحب باقة الوسائط');
  } finally { failTally = null; }
  assert.equal((await call('design', tok('oomfree'))).code, 200, 'بعد زوال الامتلاء يعود');
});

test('١٣. صور الضيف في المحادثة: تدوير IPv6 داخل /64 لا يجدّد الحصّة؛ /64 أخرى لها حصّتها، وIPv4 كما كان', async () => {
  reset();
  for (let i = 1; i <= 3; i++) assert.equal((await guestDraw('guestv6n' + i + 'x', '2001:db8:aa:1::' + i)).code, 200, 'صورة ' + i);
  const fourth = await guestDraw('guestv6fresh', '2001:db8:aa:1:ffff:1:2:3');
  assert.equal(fourth.paid, 0, 'لا نداء');
  assert.equal(fourth.code, 402); assert.equal(fourth.body.error, 'guest_image_used', 'عنوان آخر في الـ/64 نفسها ومعرّف جديد');
  assert.equal(store.get('db/points/guest-image-ip/' + encodeURIComponent('2001:db8:aa:1::/64') + '/' + day()), '3');
  assert.equal((await guestDraw('guestv6other', '2001:db8:aa:2::1')).code, 200, '/64 أخرى');
  assert.equal((await guestDraw('guestv4one1', '198.51.100.77')).code, 200);
  assert.equal(store.get('db/points/guest-image-ip/198.51.100.77/' + day()), '1', 'مفتاح IPv4 كما كان');
});

test('١٤. تغيير الاسم لا يُحيي الرمز القديم: الشاهد جلسة ميّتة — أدوات الصور الثماني وأداة نصّ والنقاط ترفضه بصفر نداء، مسقوفًا وغير مسقوف (farm-1، img422-2)', async () => {
  reset({ WELCOME_GIFT_PER_IP_DAILY: '1' });
  store.set('db/welcome-gift/ip/203.0.113.61/' + day(), '1'); // سقف الشبكة مأخوذ: التسجيل التالي مسقوف
  const tA = await signup('deadcap', '203.0.113.61');
  assert.equal((await auth.getUser('deadcap')).giftCapped, true);
  assert.equal((await call('design', tA)).code, 402, 'قبل التغيير: المسقوف ٤٠٢');
  const r = await rename(tA, 'deadcap2');
  assert.equal(r.code, 200);
  assert.equal((await call('design', r.body.token)).code, 402, 'الاسم الجديد مسقوف كما كان');
  for (const tool of QUOTA_TOOLS) {
    const o = await call(tool, tA);
    assert.equal(o.paid, 0, tool + ': لا نداء مدفوع بالرمز القديم');
    assert.equal(o.code, 401, tool); assert.equal(o.body.error, 'auth_required', tool + ': رمز «سجّل الدخول» القائم');
  }
  for (const tool of TALLY_TOOLS) {
    const o = await call(tool, tA);
    assert.equal(o.paid, 0, tool); assert.equal(o.code, 429, tool);
  }
  process.env.MISTRAL_API_KEY = 'test-mistral';
  try {
    const tr = await call('translate', tA);
    assert.equal(tr.paid, 0); assert.equal(tr.code, 401, 'أداة نصّ (checkAndConsumeCustom): الشاهد مرفوض');
    assert.notEqual((await call('translate', r.body.token)).code, 401, 'والاسم الحيّ يعبر البوّابة');
  } finally { delete process.env.MISTRAL_API_KEY; }
  const points = require(rp('api/_lib/points.js'));
  const sp = await points.spendPoints('deadcap', 10, 'test');
  assert.equal(sp.ok, false); assert.equal(sp.reason, 'auth');
  const m = await call('maha', tA);
  assert.equal(m.paid, 0); assert.equal(m.code, 401);

  // غير المسقوف: ٣/٣ ثمّ تغيير — الرمز القديم لا يأخذ ثلاثًا أخرى (كانت ٢٠٠×٣ بنداءات مدفوعة)
  await put('deadfree', { points: 70, welcomeGift: true, giftCapped: false });
  const tF = tok('deadfree');
  const codes = [];
  for (let k = 0; k < 4; k++) codes.push((await call('design', tF)).code);
  assert.deepEqual(codes, [200, 200, 200, 402]);
  const r2 = await rename(tF, 'deadfree2');
  assert.equal(r2.code, 200);
  for (let k = 0; k < 3; k++) {
    const o = await call('design', tF);
    assert.equal(o.paid, 0); assert.equal(o.code, 401);
  }
  assert.equal((await call('design', r2.body.token)).code, 402, 'الحصّة على الاسم الجديد');
  assert.equal((await points.spendPoints('deadfree2', 10, 'test')).ok, true, 'الاسم الحيّ ليس شاهدًا');
});

test('١٤ب. نافذة ذاكرة isBanned بين دوالّ Vercel: الشاهد يُرى «غير محظور» لحظات في دالّة الأدوات — planLimitInfo يقرأ السجلّ طازجًا فحدّه 0 بصفر نداء', async () => {
  reset();
  await put('memowin', { points: 70, welcomeGift: true, giftCapped: false });
  const t = tok('memowin');
  assert.equal(await auth.isBanned('memowin'), false, 'ذاكرة دالّة الأدوات دافئة: حيّ');
  await put('memowin', { deleted: true, movedTo: 'memowin2' }); // تغيير الاسم في دالّة أخرى — ذاكرة هذه لم تُمسح
  assert.equal(await auth.isBanned('memowin'), false, 'النافذة قائمة: الذاكرة ما زالت تقول حيّ');
  for (const tool of QUOTA_TOOLS) {
    const o = await call(tool, t);
    assert.equal(o.paid, 0, tool + ': لا نداء مدفوع في النافذة'); assert.equal(o.code, 402, tool);
  }
  for (const tool of TALLY_TOOLS) {
    const o = await call(tool, t);
    assert.equal(o.paid, 0, tool); assert.equal(o.code, 429, tool);
  }
  const { planLimitInfo } = require(rp('api/_lib/_planCap.js'));
  assert.deepEqual(await planLimitInfo('memowin', 3), { limit: 0, free: true });
});

test('١٥. تغيير الاسم: اثنان في ٢٤ ساعة متحرّكة لكلّ حساب — الثالث ٤٢٩ برسالة المحاولات القائمة والسجلّ لا يُمسّ؛ المتباعدان يُقبلان؛ المالك معفى؛ المتوازيان لا ينسخان الحساب', async () => {
  reset();
  await put('limiter', { points: 70, welcomeGift: true, giftCapped: false });
  let r = await rename(tok('limiter'), 'limiter2');
  assert.equal(r.code, 200);
  r = await rename(r.body.token, 'limiter3');
  assert.equal(r.code, 200);
  const before = store.get(auth.userPath('limiter3'));
  const third = await rename(r.body.token, 'limiter4');
  assert.equal(third.code, 429);
  assert.match(third.body.error, /^محاولات كثيرة، حاول بعد (\d+) دقيقة$/);
  assert.ok(Number(third.body.error.match(/\d+/)[0]) >= 1439, 'حتّى يخرج أقدم التغييرين من النافذة: ' + third.body.error);
  assert.equal(store.get(auth.userPath('limiter3')), before, 'السجلّ كما هو');
  assert.equal(store.has(auth.userPath('limiter4')), false, 'ولا اسم جديد');
  assert.equal((await auth.getUser('limiter3')).renameLog.length, 2, 'renameLog انتقل مع الحساب');

  const H24 = 86400000;
  await put('spaced', { points: 70, renameLog: [Date.now() - H24 - 3600000, Date.now() - H24 - 60000] });
  r = await rename(tok('spaced'), 'spaced2');
  assert.equal(r.code, 200, 'تغييران قبل أكثر من ٢٤ ساعة لا يمنعان');
  assert.equal((await auth.getUser('spaced2')).renameLog.length, 1, 'القديم يسقط من السجلّ');
  await put('edge', { points: 70, renameLog: [Date.now() - H24 + 3600000, Date.now() - 600000] });
  const e = await rename(tok('edge'), 'edge2');
  assert.equal(e.code, 429);
  const mins = Number(e.body.error.match(/\d+/)[0]);
  assert.ok(mins >= 59 && mins <= 61, 'الدقائق حتّى يخرج أقدمهما: ' + mins);

  await put('omran', { points: 0, renameLog: [Date.now() - 7200000, Date.now() - 3600000] });
  assert.equal((await rename(tok('omran'), 'omranx')).code, 200, 'المالك معفى');

  await put('forker', { points: 500 });
  store.set('points:forker', '500');
  const rs = await Promise.all(['fk1', 'fk2', 'fk3', 'fk4', 'fk5'].map((n) => rename(tok('forker'), n)));
  assert.deepEqual(rs.map((x) => x.code).sort(), [200, 429, 429, 429, 429], 'قفل الحساب: تغيير واحد');
  const live = [];
  for (const n of ['fk1', 'fk2', 'fk3', 'fk4', 'fk5']) { const u = await auth.getUserOnce(n); if (u && !u.deleted) live.push(n); }
  assert.equal(live.length, 1, 'لا نسخ حيّة متعدّدة للحساب (كانت ٥ بـ٥٠٠ نقطة لكلّ واحدة)');
  assert.equal(store.has('db/rename-lock/forker'), false, 'القفل يُفكّ بعد التغيير');
});

test('١٦. سقف الشبكة على تسجيلاتها لا هداياها: بعد استنزاف السقف العامّ من شبكتين، التسجيل (perIp+1) على شبكة ثالثة مسقوف، وأوّل تسجيل على شبكة جديدة لا (farm-2)', async () => {
  reset({ WELCOME_GIFT_PER_IP_DAILY: '2', WELCOME_GIFT_DAILY: '4' });
  await Promise.all([signup('drna0', '203.0.113.81'), signup('drna1', '203.0.113.81'), signup('drnb0', '203.0.113.82'), signup('drnb1', '203.0.113.82')]);
  assert.equal(store.get('db/welcome-gift/all/' + day()), '4', 'السقف العامّ مستنزف');
  await Promise.all([signup('drnc0', '203.0.113.83'), signup('drnd0', '203.0.113.84')]);
  for (let i = 1; i < 3; i++) await signup('drnc' + i, '203.0.113.83');
  const net3 = [];
  for (let i = 0; i < 3; i++) { const u = await auth.getUser('drnc' + i); net3.push(u.welcomeGift + ':' + u.giftCapped); }
  assert.deepEqual(net3, ['false:false', 'false:false', 'false:true'], 'الثالث (perIp+1) مسقوف — كان بلا سقف بقيّة اليوم');
  assert.equal(store.get('db/welcome-gift/ip/203.0.113.83/' + day()), '2', 'عدّاد الشبكة يعدّ التسجيلات');
  const fresh = await auth.getUser('drnd0');
  assert.equal(fresh.welcomeGift, false);
  assert.equal(fresh.giftCapped, false, 'أوّل تسجيل على شبكة جديدة ليس مسقوفًا');
  assert.equal((await call('design', tok('drnd0'), '203.0.113.84')).code, 200);
  assert.equal(store.get('db/welcome-gift/all/' + day()), '4', 'رفض السقف العامّ يردّ زيادته وحدها');
});
