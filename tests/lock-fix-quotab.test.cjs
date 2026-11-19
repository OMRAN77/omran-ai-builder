// tests/lock-fix-quotab.test.cjs — v-lock-quotab (موافقة المالك ٢٧ أكتوبر على بنود الأبواب المقفلة: «صلح الخطير وابدا فيهم كلهم»).
// مجموعة «الحصص ب»: ستّة بنود مال — كلّ اختبار باسم بنده، بالمعالجات الحقيقيّة ومخزن ونداءات مزيّفة: بلا شبكة ولا مزوّد ولا إنفاق.
//  srv-providers-2  الردّ الاحترافيّ يُخصم ١٥ ولا يُردّ حين يرمي نداء المزوّد (مهلة، انقطاع).
//  srv-images-2     سقف الإساءة (٣ في اليوم) يمنع ردّ تذاكر الخادم لصورة مها التي قُتلت دالّتها.
//  srv-studios-2-13 محادثة استوديو الإعلانات تحتسب الرسالة قبل فحص المفتاح ولا تردّها عند الفشل.
//  srv-studios-2-3  إنقاذ الديكور بلا صورة يرجع ٤ صور 2K فوق حدّ ردّ الدالّة بعد احتساب الحصّة.
//  srv-studios-1-10 قفل بطاقة المعاينة أقصر من مهلة التوليد فتتكرّر الصورة المدفوعة.
//  cli-studios-12   كود إطار المعاينة يولّد صورًا مدفوعة برسائل postMessage بلا ضغطة من المستخدم.
// جولة المراجعة: (srv-images-2) تذكرة محسومة تعيدها كتابة متزامنة للقائمة تُردّ بعد انقضاء مفتاح تسويتها، وتذاكر الخادم بلا حدّ؛
//                (cli-studios-12) التأكيد يعرض سعر الصورة والخادم يخصم سعر 4K حين يحمل الوصف «4k» من الإطار.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, 'api/_lib', f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const fresh = (f) => { delete require.cache[rp(f)]; return require(rp(f)); };
const MIN = 60000;

process.env.GEMINI_API_KEY = 'test-gemini'; process.env.OPENAI_API_KEY = 'test-openai'; process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.IMAGE_UPSCALE = 'off'; process.env.IMAGE_CARDS = 'off';
delete process.env.IMAGE_FREE_FALLBACK; delete process.env.IMG_DIAG; delete process.env.FETCH_TIMEOUT_MS;

// ── مخزن واحد بعقد kv.js، بمدّة صلاحيّة على ساعة قابلة للتقديم (قفل المعاينة) ──
const clock = { skew: 0 };
const now = () => Date.now() + clock.skew;
const store = new Map();
const ttls = [];
const live = (k) => { const e = store.get(k); if (!e) return null; if (e.exp && e.exp <= now()) { store.delete(k); return null; } return e; };
const put = (k, v, ttl) => { store.set(k, { v: String(v), exp: ttl ? now() + Number(ttl) * 1000 : 0 }); };
const kv = {
  kvGetRaw: async (k) => { const e = live(k); return e ? e.v : null; },
  kvGetJSON: async (k) => { const e = live(k); if (!e) return null; try { return JSON.parse(e.v); } catch (x) { return null; } },
  kvSetRaw: async (k, v, ttl) => { put(k, v, ttl); },
  kvPutJSON: async (k, v) => { put(k, JSON.stringify(v)); },
  kvSetIfAbsent: async (k, v, ttl) => { ttls.push([k, ttl]); if (live(k)) return false; put(k, v, ttl); return true; },
  kvIncr: async (k) => { const n = Number((live(k) || {}).v || 0) + 1; put(k, n); return n; },
  kvIncrBy: async (k, by) => { const n = Number((live(k) || {}).v || 0) + Number(by); put(k, n); return n; },
  kvDecrBy: async (k, by) => { const n = Number((live(k) || {}).v || 0) - Number(by); put(k, n); return n; },
  kvExpire: async () => true,
  kvDel: async (k) => { store.delete(k); },
};
stub('kv.js', kv);

const log = { spend: [], refunds: [], custom: [], consume: [], design: [] };
let PAY = { ok: true, points: 85, spent: 15, reason: 'premium_openai' };
stub('points.js', {
  COSTS: { image: 20, image_creative: 35, image_4k: 30 },
  PREMIUM_MODELS: { openai: 'gpt-6-astra' }, PREMIUM_COST: { openai: 15 },
  verifyPointsToken: (t) => ({ sara: 'sara', nora: 'nora' })[t] || null,
  isOwnerUsername: () => false,
  spendPoints: async (u, n, reason) => { log.spend.push([u, n, reason]); return Object.assign({}, PAY); },
  refundPoints: async (u, n, how) => { log.refunds.push([u, n, how]); },
});
stub('_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => null, checkAndConsume: async () => ({ allowed: true }),
  refundCustom: async (token, g, ip, bucket) => { log.custom.push([token, bucket]); },
});
stub('_planCap.js', { checkAndConsumePlanCustom: async (token, g, ip, bucket, base) => { log.consume.push([token, bucket]); return { allowed: true, limit: base, remaining: base - 1 }; } });
stub('_mediaPlans.js', { imageQuality: async () => null });
stub('tier.js', { resolveTier: async () => ({ tier: 'free' }) });
stub('log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
stub('adtemplate.js', new Proxy({}, { get: () => () => '' }));
stub('_designUsage.js', {
  DESIGN_DAILY_LIMIT: 3,
  checkDesignQuota: async () => ({ allowed: true, username: 'sara', limit: 3 }),
  consumeDesign: async (u) => { log.design.push(u); return 2; },
});

function resObj() {
  return {
    code: 0, body: null, raw: null, headersSent: false, headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(c) { this.code = c; return this; },
    json(v) { this.raw = JSON.stringify(v); this.body = v; this.headersSent = true; return this; },
    send(s) { this.raw = String(s); try { this.body = JSON.parse(s); } catch (e) { this.body = s; } this.headersSent = true; return this; },
    end(s) {
      if (Buffer.isBuffer(s)) { this.raw = s; this.body = s; } else if (s != null) { this.raw = String(s); try { this.body = JSON.parse(s); } catch (e) { this.body = s; } }
      this.headersSent = true; return this;
    },
    write() { this.headersSent = true; return true; },
    flushHeaders() { this.headersSent = true; },
  };
}
const quiet = async (fn) => { const e = console.error, w = console.warn, l = console.log; console.error = () => {}; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; console.log = l; } };
async function withFetch(fetchImpl, fn) { const save = global.fetch; global.fetch = fetchImpl; try { return await fn(); } finally { global.fetch = save; } }
const reset = () => { for (const k of Object.keys(log)) log[k].length = 0; };

// ═════════════════ srv-providers-2 ═════════════════
async function premium(fetchImpl, res, body) {
  const r = res || resObj();
  await withFetch(fetchImpl, () => quiet(() => fresh('openai.js')({ method: 'POST', headers: {}, body: Object.assign({ premium: true, token: 'sara', messages: [{ role: 'user', content: 'اشرح لي' }] }, body) }, r)));
  return r;
}
const timeout = async () => { const e = new Error('Upstream request timed out after 30000ms.'); e.name = 'UpstreamTimeoutError'; throw e; };

test('srv-providers-2: نداء المزوّد يرمي بعد خصم الردّ الاحترافيّ (مهلة أوّل بايت، انقطاع) ← الـ١٥ نقطة تُردّ مرّة واحدة بنوع خصمها', async () => {
  reset(); PAY = { ok: true, points: 85, spent: 15, reason: 'premium_openai' };
  const res = await premium(timeout);
  assert.equal(res.code, 500);
  assert.deepEqual(log.spend, [['sara', 15, 'premium_openai']]);
  assert.equal(log.refunds.length, 1, 'كان: خصم ١٥ بلا ردّ حين يرمي fetch');
  assert.deepEqual(log.refunds[0].slice(0, 2), ['sara', 15]);
  assert.equal(log.refunds[0][2] && log.refunds[0][2].reason, 'premium_openai', 'الردّ بنتيجة الخصم نفسها (v-refund-kind) لا بالمطابقة بالمبلغ');
  // انقطاع أثناء قراءة الجسم بعد ترويسات ناجحة: لم يصل المستخدم شيء
  reset();
  await premium(async () => ({ ok: true, status: 200, body: null, text: async () => { throw new Error('terminated'); } }));
  assert.equal(log.refunds.length, 1, 'جسم لم يُقرأ = لا ردّ وصل المستخدم');
  // ECONNRESET وطلبان متزامنان: كلّ خصم يُردّ مرّة واحدة لا أكثر
  reset();
  await Promise.all([premium(async () => { throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }); }), premium(timeout)]);
  assert.equal(log.spend.length, 2);
  assert.equal(log.refunds.length, 2);
});

test('srv-providers-2: لا ردّ مزدوج — فشل المزوّد يُردّ ثمّ استثناء بعده لا يردّ ثانية؛ والناجح والمالك والبثّ الذي بدأ لا يُردّ', async () => {
  reset(); PAY = { ok: true, points: 85, spent: 15, reason: 'premium_openai' };
  const r1 = resObj();
  let first = true;
  const json0 = r1.json;
  r1.json = function (v) { if (first) { first = false; throw new Error('socket closed'); } return json0.call(this, v); };
  await premium(async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }), r1);
  assert.equal(log.refunds.length, 1, 'ردّ فشل المزوّد ثمّ ردّ الاستثناء = ردّان (لا يجوز)');
  reset();
  const ok = await premium(async () => Response.json({ choices: [{ message: { content: 'تمام' } }] }));
  assert.equal(ok.code, 200);
  assert.equal(log.refunds.length, 0, 'الناجح لا يُردّ');
  reset(); PAY = { ok: true, owner: true, points: Infinity };
  await premium(timeout);
  assert.equal(log.refunds.length, 0, 'المالك لم يُخصم منه شيء');
  // بثّ بدأ (وصلت الترويسات والبايتات) ثمّ رمى الإرسال: المستخدم أخذ الردّ فلا ردّ نقاط
  reset(); PAY = { ok: true, points: 85, spent: 15, reason: 'premium_openai' };
  const rs = resObj();
  rs.end = function () { throw new Error('write after end'); };
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {}\n\n')); c.close(); } });
  await premium(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }), rs, { stream: true });
  assert.equal(rs.headersSent, true);
  assert.equal(log.refunds.length, 0, 'البثّ وصل — الخصم يثبت');
});

// ═════════════════ srv-images-2 ═════════════════
function spy() { const refunds = []; return { refunds, refundPoints: async (u, c, how) => { refunds.push([u, c, how || null]); } }; }
const PAY_PTS = { ok: true, points: 50, spent: 20 };

test('srv-images-2: تذاكر الخادم (دالّة قُتلت قبل الردّ) تُردّ كلّها ولو تجاوزت ثلاثًا في اليوم، مرّة واحدة، وتحت الكنس المتزامن', async () => {
  const hold = fresh('image-hold.js');
  store.clear();
  const P = spy();
  const t0 = Date.now();
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv, now: t0 }));
  assert.ok(ids.every(Boolean) && new Set(ids).size === 5);
  assert.deepEqual(await hold.settleStale('sara', { kv, points: P, now: t0 + 2 * MIN }), { refunded: 0, points: 0 }, 'لا ردّ قبل عمر الدالّة كلّه');
  const runs = await Promise.all([hold.settleStale('sara', { kv, points: P, now: t0 + 7 * MIN }), hold.settleStale('sara', { kv, points: P, now: t0 + 7 * MIN })]);
  assert.equal(runs[0].refunded + runs[1].refunded, 5, 'كان ٣: الرابعة والخامسة تثبتان ٢٠ نقطة بلا صورة');
  assert.equal(P.refunds.length, 5, 'كنسان متزامنان لا يردّان مرّتين');
  assert.deepEqual(await hold.settleStale('sara', { kv, points: P, now: t0 + 9 * MIN }), { refunded: 0, points: 0 }, 'مرّة واحدة');
  assert.equal(P.refunds.length, 5);
  // التذكرة المغلقة (سُلّمت الصورة) لا تُردّ
  store.clear();
  const P2 = spy();
  const tid = await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv, now: t0 });
  assert.equal(await hold.closeTicket('sara', tid, { kv }), true);
  assert.deepEqual(await hold.settleStale('sara', { kv, points: P2, now: t0 + 9 * MIN }), { refunded: 0, points: 0 });
});

test('srv-images-2: السقف اليوميّ باقٍ لحجوز العميل وحدها — ولا يُزوَّر بمعرّف يشبه تذكرة الخادم، وتذاكر الخادم لا تأكل منه', async () => {
  const hold = fresh('image-hold.js');
  store.clear();
  const P = spy();
  const t0 = Date.now();
  for (let i = 0; i < 4; i++) assert.ok(await hold.holdFromRequest('h_client00' + i, 'sara', 20, PAY_PTS, { kv, now: t0 }));
  assert.ok(await hold.holdFromRequest('srv0123456789abcdef01', 'sara', 20, PAY_PTS, { kv, now: t0 }), 'العميل يرسل معرّفًا يشبه تذاكر الخادم');
  for (let i = 0; i < 2; i++) await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv, now: t0 - 2 * MIN });
  const r = await hold.settleStale('sara', { kv, points: P, now: t0 + 7 * MIN });
  assert.equal(r.refunded, 3 + 2, 'ثلاثة من حجوز العميل الخمسة (السقف كما كان) + تذكرتا الخادم كلتاهما');
  assert.equal(Number(read('api/_lib/image-hold.js').match(/REFUND_DAY_MAX = (\d+)/)[1]), 3, 'رقم السقف لم يتغيّر');
});

test('srv-images-2: صورة «لم تتغيّر» بعد سقف ردّها اليوميّ (v-unchanged-cap) تُغلق تذكرتها — الكنس لا يردّ خصمًا أبقاه القرار', async () => {
  const saved = { verify: require.cache[rp('image-verify.js')], giveback: require.cache[rp('image-giveback.js')] };
  stub('image-verify.js', { settleCandidates: async () => ({ ok: false, tried: ['nano'] }) });
  stub('image-giveback.js', { unchangedGiveback: async () => false, userMeterId: (u) => 'u:' + u });
  delete require.cache[rp('maha-image.js')];
  try {
    store.clear(); reset();
    PAY = { ok: true, points: 50, spent: 20, reason: 'image' };
    const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000080000000808020000004b6d29dc0000001549444154789c63f8ffff3f0305a3f81f0e0058be0ffe8a2a39a10000000049454e44ae426082', 'hex').toString('base64');
    const res = resObj();
    await withFetch(async (url) => (String(url).includes('openai')
      ? Response.json({ data: [{ b64_json: PNG }] })
      : Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG } }] }, finishReason: 'STOP' }] })),
    () => quiet(() => require(rp('maha-image.js'))({ method: 'POST', headers: {}, body: { prompt: 'A red apple on a wooden table, soft daylight', userText: 'ارسم تفاحة حمراء', token: 'sara' } }, res)));
    assert.equal(res.code, 422, JSON.stringify(res.body).slice(0, 200));
    assert.equal(log.refunds.length, 0, 'فوق سقف «لم تتغيّر» الخصم يبقى (قرار قائم)');
    const hold = require(rp('image-hold.js'));
    const P = spy();
    const r = await hold.settleStale('sara', { kv, points: P, now: Date.now() + 7 * MIN });
    assert.deepEqual(r, { refunded: 0, points: 0 }, 'كانت التذكرة تبقى مفتوحة فيردّها الكنس — ومع رفع السقف عن تذاكر الخادم بلا حدّ');
  } finally {
    for (const [k, f] of [['verify', 'image-verify.js'], ['giveback', 'image-giveback.js']]) { if (saved[k]) require.cache[rp(f)] = saved[k]; else delete require.cache[rp(f)]; }
    delete require.cache[rp('maha-image.js')];
  }
});

// ── srv-images-2 (المراجعة): كتابة متزامنة للقائمة تعيد تذكرة محسومة، ومفتاح تسويتها ينقضي بعد يومين والقائمة حيّة ──
const DAY = 86400000;
const flushNow = () => new Promise((r) => setImmediate(r)); // الطلب الثاني يبلغ قراءته ويقف عند البوّابة
// مخزن ببوّابة: أوّل قراءة لقائمة الحجوز بعد pause() تنتظر حتّى يُفتح الباب — قراءة قبل حسم تذكرة وكتابة بعده (كطلبين متزامنين)
function gatedKv() {
  let gate = null;
  const g = Object.assign({}, kv, { kvGetJSON: async (k) => { const v = await kv.kvGetJSON(k); if (gate) { const w = gate; gate = null; await w; } return v; } });
  return { kv: g, pause() { let open; gate = new Promise((r) => { open = r; }); return open; } };
}
const at = () => Date.now() + clock.skew; // ساعة المنطق نفسها ساعة انقضاء المخزن

test('srv-images-2 (المراجعة): صورة سُلّمت وأعادها طلب متزامن إلى القائمة لا تُردّ بعد انقضاء مفتاح تسويتها — ولو أبقى المستخدم القائمة حيّة يومين بلا قراءة رصيد', async () => {
  const hold = fresh('image-hold.js');
  store.clear(); clock.skew = 0;
  const g = gatedKv();
  const P = spy();
  try {
    for (let i = 0; i < 6; i++) { // ست صور سُلّمت، لكلّ واحدة طلب ثانٍ متزامن قرأ القائمة قبل إغلاقها وكتبها بعده
      const a = await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv: g.kv, now: at() });
      const open = g.pause();
      const pb = hold.openTicket('sara', 20, PAY_PTS, undefined, { kv: g.kv, now: at() });
      await flushNow();
      assert.equal(await hold.closeTicket('sara', a, { kv: g.kv }), true, 'الصورة الأولى سُلّمت');
      open();
      assert.equal(await hold.closeTicket('sara', await pb, { kv: g.kv }), true, 'والثانية سُلّمت');
    }
    assert.equal((await kv.kvGetJSON('imghold:sara')).length, 6, 'التذاكر المحسومة عادت إلى القائمة (السباق قائم في القاعدة)');
    clock.skew = 1.5 * DAY; // يواصل التوليد بلا قراءة رصيد — كلّ كتابة تجدّد عمر القائمة
    await hold.closeTicket('sara', await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv, now: at() }), { kv });
    clock.skew = 2 * DAY; // ودالّة قُتلت فعلًا قبل الردّ: تذكرتها تُردّ كما يجب
    await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv, now: at() });
    clock.skew = 2 * DAY + 10 * MIN; // انقضت مفاتيح تسوية الستّ، والقائمة حيّة
    const r = await hold.settleStale('sara', { kv, points: P, now: at() });
    assert.deepEqual(r, { refunded: 1, points: 20 }, 'كان: الستّ تُردّ (٦ في الفرع بلا سقف، ٣ في القاعدة) بعد أن وصلت صورها');
    assert.equal(await kv.kvGetJSON('imghold:sara'), null, 'القديمة تُسقط بلا ردّ، فلا تبقى لكنس لاحق');
    assert.deepEqual(await hold.settleStale('sara', { kv, points: P, now: at() + MIN }), { refunded: 0, points: 0 });
  } finally { clock.skew = 0; }
});

test('srv-images-2 (المراجعة): تذكرة دالّة قُتلت تُردّ مرّة واحدة — طلب متزامن مع الكنس يعيدها إلى القائمة، ولا تُردّ ثانية بعد يومين', async () => {
  const hold = fresh('image-hold.js');
  store.clear(); clock.skew = 0;
  const g = gatedKv();
  const P = spy();
  try {
    const k = await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv: g.kv, now: at() }); // قُتلت الدالّة: لا إغلاق
    clock.skew = 7 * MIN;
    const open = g.pause();
    const pb = hold.openTicket('sara', 20, PAY_PTS, undefined, { kv: g.kv, now: at() }); // طلب جديد قرأ القائمة [k]
    await flushNow();
    assert.deepEqual(await hold.settleStale('sara', { kv: g.kv, points: P, now: at() }), { refunded: 1, points: 20 }, 'الردّ الأوّل المستحقّ');
    open();
    assert.equal(await hold.closeTicket('sara', await pb, { kv: g.kv }), true);
    assert.deepEqual((await kv.kvGetJSON('imghold:sara')).map((h) => h.id), [k], 'التذكرة المردودة عادت إلى القائمة');
    clock.skew = 1.5 * DAY;
    await hold.closeTicket('sara', await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv, now: at() }), { kv });
    clock.skew = 2 * DAY + 15 * MIN;
    await hold.settleStale('sara', { kv, points: P, now: at() });
    assert.equal(P.refunds.length, 1, 'كان: تُردّ ثانية بعد انقضاء مفتاح تسويتها');
  } finally { clock.skew = 0; }
});

test('srv-images-2 (المراجعة): لتذاكر الخادم حدّ احتياطيّ يوميّ منفصل — عطب KV عند التسليم لا يردّ بلا حدّ، ولا يمسّ سقف حجوز العميل', async () => {
  const hold = fresh('image-hold.js');
  store.clear();
  const P = spy();
  const t0 = Date.UTC(2026, 9, 27, 10);
  for (let i = 0; i < 20; i++) await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv, now: t0 });
  assert.equal((await hold.settleStale('sara', { kv, points: P, now: t0 + 7 * MIN })).refunded, 20, 'كان ٣: تذاكر الخادم تحت سقف حجوز العميل');
  for (let i = 0; i < 3; i++) await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv, now: t0 + 10 * MIN });
  for (let i = 0; i < 3; i++) assert.ok(await hold.holdFromRequest('h_client0' + i, 'sara', 20, PAY_PTS, { kv, now: t0 + 11 * MIN }));
  assert.equal((await hold.settleStale('sara', { kv, points: P, now: t0 + 20 * MIN })).refunded, 3, 'كان ٦: فوق العشرين يثبت خصم تذاكر الخادم، وحجوز العميل الثلاثة تُردّ بسقفها');
  await hold.openTicket('sara', 20, PAY_PTS, undefined, { kv, now: t0 + DAY });
  assert.equal((await hold.settleStale('sara', { kv, points: P, now: t0 + DAY + 7 * MIN })).refunded, 1, 'اليوم التالي بحدّ جديد');
  assert.equal(P.refunds.length, 24);
  assert.equal(hold.SRV_REFUND_DAY_MAX, 20, 'حدّ واسع: عشرون دالّة قُتلت في يوم واحد');
});

// ═════════════════ srv-studios-2-13 ═════════════════
async function adchat(fetchImpl, body) {
  reset();
  const res = resObj();
  await withFetch(fetchImpl, () => quiet(() => fresh('adchat.js')({ method: 'POST', headers: {}, body: Object.assign({ token: 'sara', lang: 'ar', messages: [{ role: 'user', content: 'أبيع سيّارة' }] }, body) }, res)));
  return { code: res.code, body: res.body, net: log.consume.length - log.custom.length, consumed: log.consume.length, given: log.custom.slice() };
}
const textReply = async () => Response.json({ content: [{ type: 'text', text: 'فائدة… ١. ما الموديل؟ ٢. كم السعر؟' }] });

test('srv-studios-2-13: محادثة الإعلانات — كلّ مسار فشل لا يأكل رسالة من حصّة اليوم، والناجحة تُحسب مرّة', async () => {
  const saveKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const nk = await adchat(textReply);
    assert.equal(nk.code, 500);
    assert.equal(nk.net, 0, 'بلا مفتاح: كانت تُحجز رسالة قبل الفحص ولا تُردّ');
  } finally { process.env.ANTHROPIC_API_KEY = saveKey; }
  for (const [what, f] of [
    ['رفض المزوّد', async () => Response.json({ error: { type: 'overloaded_error', message: 'Overloaded' } }, { status: 529 })],
    ['انقطاع', async () => { throw new Error('fetch failed'); }],
    ['جسم ليس JSON', async () => new Response('<html>bad gateway</html>', { status: 502 })],
    ['نصّ فارغ', async () => Response.json({ content: [] })],
  ]) {
    const r = await adchat(f);
    assert.equal(r.net, 0, what + ': الحصّة رُدّت');
    assert.ok(r.given.length <= 1, what + ': مرّة واحدة');
  }
  const empty = await adchat(textReply, { messages: [{ role: 'assistant', content: 'أهلًا' }] });
  assert.equal(empty.code, 400);
  assert.equal(empty.net, 0, 'طلب بلا رسالة مستخدم لا يُحسب');
  const ok = await adchat(textReply);
  assert.equal(ok.code, 200);
  assert.ok(ok.body.text);
  assert.deepEqual([ok.consumed, ok.given.length], [1, 0], 'الناجحة تُحسب ولا تُردّ');
});

test('srv-studios-2-13: الخادم يقطع نداء المزوّد قبل أن يقطعه العميل (٢٨ث) ويردّ الحصّة — لا رسالة محسوبة لم يرها المستخدم', async () => {
  const client = read('ad-studio.html').match(/setTimeout\(\(\)=>ctl\.abort\(\),(\d+)\)/);
  assert.ok(client, 'مهلة العميل في ad-studio.html');
  const clientMs = Number(client[1]);
  const orig = AbortSignal.timeout;
  const asked = []; const ctrls = [];
  AbortSignal.timeout = (ms) => { asked.push(ms); const c = new AbortController(); ctrls.push(c); return c.signal; };
  let seen = null;
  try {
    const p = adchat((url, init) => { seen = init && init.signal; return new Promise((resolve, reject) => { if (seen) seen.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))); }); });
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(seen, 'نداء المزوّد بلا مهلة خاصّة به (مهلة أوّل بايت العامّة ٣٠ث بعد مهلة العميل)');
    assert.equal(asked.length, 1);
    assert.ok(asked[0] > 0 && asked[0] < clientMs - 1000, 'مهلة الخادم ' + asked[0] + ' أقصر من مهلة العميل ' + clientMs + ' بهامش');
    ctrls[0].abort();
    const r = await p;
    assert.equal(r.code, 500);
    assert.equal(r.net, 0, 'المهلة ردّت الحصّة');
    assert.equal(r.given.length, 1);
  } finally { AbortSignal.timeout = orig; }
});

// ═════════════════ srv-studios-2-3 ═════════════════
// صورة «فوتوغرافيّة» مقاس 2K ‏16:9 كما يرجعها برو: تدرّج وملمس بضوضاء خفيفة ثابتة البذرة — PNG بالميغابايتات
function bigPng(w, h, seed) {
  const { PNG } = require('pngjs');
  const p = new PNG({ width: w, height: h });
  let s = seed >>> 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const n = (s >>> 24) % 9 - 4;
      const i = (y * w + x) * 4;
      p.data[i] = Math.max(0, Math.min(255, 120 + Math.round(80 * Math.sin(x / 97)) + n));
      p.data[i + 1] = Math.max(0, Math.min(255, 110 + Math.round(60 * Math.cos(y / 71)) + n));
      p.data[i + 2] = Math.max(0, Math.min(255, 90 + ((x + y) >> 5) % 60 + n));
      p.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(p).toString('base64');
}
let SHOT = null;
async function decorRescue(geminiData, mime) {
  reset();
  let gem = 0;
  const res = resObj();
  await withFetch(async (url) => {
    if (String(url).includes('api.openai.com')) return Response.json({ error: { message: 'Billing hard limit has been reached', code: 'billing_hard_limit_reached' } }, { status: 400 });
    gem++;
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: mime || 'image/png', data: geminiData } }] }, finishReason: 'STOP' }] });
  }, () => quiet(() => fresh('design-create.js')({ method: 'POST', headers: {}, body: { place: 'majlis', style: 'modern', token: 'sara', count: 4 } }, res)));
  return { res, gem, size: res.raw ? Buffer.byteLength(typeof res.raw === 'string' ? res.raw : JSON.stringify(res.body)) : 0 };
}
const LIMIT = 4.5 * 1024 * 1024;
function webpSize(buf) {
  const c = buf.slice(12, 16).toString('latin1');
  if (c === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (c === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >>> 14) & 0x3fff) + 1 }; }
  if (c === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  return null;
}

test('srv-studios-2-3: إنقاذ الديكور بلا صورة — أربع لقطات 2K تصل في ردّ تحت حدّ الدالّة، والحصّة تُحسب لما وصل فقط', async () => {
  SHOT = SHOT || bigPng(2752, 1536, 7);
  assert.ok(SHOT.length * 4 > LIMIT, 'الشرط: أربع لقطات PNG كما هي فوق الحدّ (' + Math.round(SHOT.length * 4 / 1e6) + 'M)');
  const { res, gem, size } = await decorRescue(SHOT);
  assert.equal(gem, 4, 'لقطة لكلّ زاوية');
  assert.equal(res.code, 200);
  assert.ok(size < LIMIT, 'حجم الردّ ' + Math.round(size / 1e5) / 10 + 'M — كان فوق ٤٫٥ م.ب فترفضه المنصّة والحصّة محسوبة');
  assert.equal(res.body.images.length, 4, 'الأربع وصلت');
  for (const im of res.body.images) {
    const buf = Buffer.from(im.imageBase64, 'base64');
    assert.equal(buf.slice(8, 12).toString('latin1'), 'WEBP', 'ترميز واحد من الأصل بلا فقد');
    assert.equal(im.mimeType, 'image/webp');
    const sz = webpSize(buf);
    assert.ok(sz && sz.w >= 1024 && sz.w <= 2752 && Math.abs(sz.w / sz.h - 2752 / 1536) < 0.01, 'مقاس اللقطة ' + JSON.stringify(sz) + ' — بنسبتها ولا تصغير مفرط');
  }
  assert.deepEqual(log.design, ['sara'], 'وحدة واحدة من الحصّة لردّ وصل');
});

test('srv-studios-2-3: ما لا يتّسع للردّ لا يُرسل ولا يُحسب — بلا شيء يتّسع ٥٠٢ والحصّة كما هي', async () => {
  const junk = Buffer.alloc(3800000, 7).toString('base64'); // ليست صورة تُفكّ: تبقى كما هي (٥ م.ب base64)
  const { res, size } = await decorRescue(junk, 'image/png');
  assert.equal(res.code, 502, 'كان ٢٠٠ بردّ ٢٠ م.ب لا يصل');
  assert.ok(size < LIMIT);
  assert.deepEqual(log.design, [], 'لا وحدة محسوبة لردّ لم يحمل شيئًا');
  const small = Buffer.alloc(900000, 9).toString('base64'); // لقطات JPEG لا يُعاد ترميزها — تُرسل ما اتّسع منها
  const r2 = await decorRescue(small, 'image/jpeg');
  assert.equal(r2.res.code, 200);
  assert.ok(r2.size < LIMIT, 'حجم ' + r2.size);
  assert.ok(r2.res.body.images.length >= 1 && r2.res.body.images.length < 4, 'ما زاد عن السقف أُسقط: ' + r2.res.body.images.length);
  assert.ok(r2.res.body.images.every((im) => im.mimeType === 'image/jpeg' && im.imageBase64 === small), 'لا ضغط فوق ضغط');
  assert.deepEqual(log.design, ['sara']);
});

// ═════════════════ srv-studios-1-10 ═════════════════
test('srv-studios-1-10: توليد بطاقة يتجاوز ١٢٠ث — القفل باقٍ حتّى نهاية عمر الدالّة فلا يولّد طلب ثانٍ نسخة مدفوعة أخرى', async () => {
  const TR = require(rp('video-trends.js')).TRENDS;
  const value = Object.keys(TR)[0];
  const sp = fresh('studio-preview.js');
  store.clear(); ttls.length = 0; clock.skew = 0;
  let calls = 0; let release = null;
  const WEBP = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
  const fetchImpl = async () => { calls++; if (calls === 1) await new Promise((r) => { release = r; }); return Response.json({ data: [{ b64_json: WEBP }] }); };
  const r1 = resObj(); const r2 = resObj();
  await withFetch(fetchImpl, async () => {
    const p1 = sp({ method: 'GET', query: { feature: 'trend', value }, headers: {} }, r1);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 1, 'التوليد الأوّل بدأ');
    clock.skew = 121 * 1000; // المولّد مزدحم: ١٢١ ثانية والتوليد الأوّل ما زال جاريًا
    const p2 = sp({ method: 'GET', query: { feature: 'trend', value }, headers: {} }, r2);
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls, 1, 'كان: انتهى القفل (١٢٠ث) فأخذه الطلب الثاني وولّد نسخة مدفوعة ثانية');
    release();
    await p1; await p2;
  });
  clock.skew = 0;
  assert.equal(calls, 1);
  assert.equal(r1.code, 200); assert.equal(r2.code, 200, 'الطلب الثاني يأخذ الصورة المخزّنة');
  const lockTtl = ttls.find(([k]) => /:lock$/.test(k))[1];
  const maxDuration = JSON.parse(read('vercel.json')).functions['api/*.js'].maxDuration;
  assert.ok(lockTtl >= maxDuration, 'مدّة القفل ' + lockTtl + 'ث ≥ عمر الدالّة ' + maxDuration + 'ث (مهلة التوليد ٢٤٠ث + الترميز)');
  assert.ok(/AbortSignal\.timeout\(240000\)/.test(read('api/_lib/studio-preview.js')), 'مهلة التوليد كما هي');
});

// ═════════════════ cli-studios-12 ═════════════════
const FP_SRC = read('js/app-15-floorplan.js');
const BRIDGE = FP_SRC.slice(FP_SRC.indexOf('/* ───────── التكامل: زر المقاولات + جسر توليد الصور'));
const FACADE = FP_SRC.slice(FP_SRC.indexOf('/* ───────── الواجهة من نفس المواصفات'), FP_SRC.indexOf('/* ───────── التكامل: زر المقاولات'));
function bridge(answer, realPrompt) {
  let handler = null;
  const fetches = []; const asks = []; const replies = []; const pending = [];
  const frame = { postMessage: (m) => replies.push(m) };
  const ctx = {
    window: {
      omranFloorplan: { facadePrompt: () => 'facade prompt' },
      addEventListener: (t, f) => { if (t === 'message') handler = f; },
      getGuestId: () => 'g',
      omranLoadCosts: () => Promise.resolve({ image: 20, image_4k: 30 }),
    },
    document: { getElementById: (id) => (id === 'previewFrame' ? { contentWindow: frame } : null), querySelectorAll: () => [] },
    fetch: (url) => { fetches.push(url); return new Promise((r) => pending.push(() => r({ ok: true, json: () => Promise.resolve({ imageBase64: 'AAAA', mimeType: 'image/png' }) }))); },
    confirm: (m) => { asks.push(m); return typeof answer === 'function' ? answer() : answer; },
    t: (k) => (k === 'spendConfirm' ? 'This will use {n} points. Continue?' : k),
    authGet: () => 'tok', __swallow: () => {}, console,
  };
  ctx.window.window = ctx.window;
  if (realPrompt) { ctx.window.omranFloorplan = {}; vm.runInNewContext('var window = this.window;\n' + FACADE, ctx); } // وصف الواجهة الحقيقيّ
  vm.runInNewContext('var window = this.window; var document = this.document;\n' + BRIDGE, ctx);
  assert.equal(typeof handler, 'function');
  const msg = (id) => handler({ data: { __omranView: 1, id, view: 'exterior', spec: { floors: [{ rooms: [] }] } }, source: frame, origin: 'null' });
  const send = (id, view, spec) => handler({ data: { __omranView: 1, id, view, spec }, source: frame, origin: 'null' });
  return { msg, send, fetches, asks, replies, pending, FP: ctx.window.omranFloorplan };
}
const flush = () => new Promise((r) => setImmediate(r));

test('cli-studios-12: حلقة postMessage من كود المعاينة لا تولّد صورًا مدفوعة — تأكيد بالسعر من نافذة التطبيق وطلب واحد جارٍ', async () => {
  const b = bridge(false);
  for (let i = 1; i <= 6; i++) b.msg(i);
  await flush(); await flush();
  assert.equal(b.fetches.length, 0, 'كان: ٦ رسائل = ٦ نداءات /api/maha-image برمز المستخدم بلا ضغطة');
  assert.ok(b.asks.length >= 1, 'نافذة التطبيق تسأل قبل الخصم');
  assert.ok(b.asks[0].includes('20'), 'السعر من مصدر الخصم: ' + b.asks[0]);
  assert.ok(b.replies.length >= 1 && b.replies.every((r) => r.ok === false), 'المحرّر يُبلَّغ فيعيد زرّه');
  assert.ok(b.replies.some((r) => r.cancelled === true));
});

test('cli-studios-12: ضغطة المستخدم المؤكَّدة تولّد مرّة — ورسائل أثناءها تُرفض بلا سؤال ولا نداء، والتالية تسأل من جديد', async () => {
  const b = bridge(true);
  b.msg(1);
  await flush(); await flush();
  assert.equal(b.asks.length, 1);
  assert.deepEqual(b.fetches, ['/api/maha-image']);
  for (let i = 2; i <= 8; i++) b.msg(i);
  await flush(); await flush();
  assert.equal(b.fetches.length, 1, 'طلب مدفوع واحد جارٍ في كلّ مرّة');
  assert.equal(b.asks.length, 1, 'المرفوض أثناء الجاري لا يفتح سؤالًا');
  assert.equal(b.replies.filter((r) => r.cancelled).length, 7);
  b.pending.shift()();
  await flush(); await flush();
  assert.ok(b.replies.some((r) => r.ok === true && r.id === 1 && /^data:image\/png;base64,/.test(r.dataUrl)), 'الصورة تصل المحرّر كما كانت');
  b.msg(9);
  await flush(); await flush();
  assert.equal(b.asks.length, 2, 'كلّ توليد مدفوع يُسأل عنه');
  assert.equal(b.fetches.length, 2);
});

test('cli-studios-12: محرّر المخطّط الجديد يعيد زرّه بلا «تعذّر التوليد» حين يلغي المستخدم أو يُرفض طلب مكرّر — والخطأ الحقيقيّ يظهر كما كان', () => {
  const line = FP_SRC.split('\n').find((l) => /^\s*var EDITOR_CLIENT = '/.test(l));
  assert.ok(line, 'عميل المحرّر المضمَّن في صفحة المخطّط');
  const code = vm.runInNewContext(line.replace(/^\s*var EDITOR_CLIENT = /, ''), {});
  const el = (id) => ({ id, style: {}, dataset: {}, innerHTML: '', textContent: '', children: [], disabled: false, appendChild(c) { this.children.push(c); }, addEventListener() {}, setPointerCapture() {} });
  const els = {};
  const btn = el('btn'); btn.dataset.view = 'exterior'; btn.textContent = 'نهارًا';
  const listeners = []; const posted = [];
  const ctx = {
    window: { __omranSpec: { plotWidth: 15, floors: [{ name: 'طابق 1', rooms: [{ name: 'مجلس', w: 4, h: 4 }] }] }, addEventListener: (t, f) => { if (t === 'message') listeners.push(f); }, removeEventListener: (t, f) => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); } },
    document: { readyState: 'complete', body: { clientWidth: 900 }, getElementById: (id) => els[id] || (els[id] = el(id)), createElement: (tag) => el(tag), querySelectorAll: (q) => (q === '.ov-btn' ? [btn] : []), addEventListener() {} },
    parent: { postMessage: (m) => posted.push(m) },
  };
  vm.runInNewContext(code, ctx);
  assert.equal(typeof btn.onclick, 'function');
  const answer = (d) => listeners.slice().forEach((f) => f({ data: Object.assign({ __omranViewOut: 1, id: posted[posted.length - 1].id }, d) }));
  btn.onclick();
  assert.equal(btn.disabled, true);
  assert.equal(posted.length, 1);
  answer({ ok: false, cancelled: true, error: '' });
  assert.equal(btn.disabled, false, 'الزرّ عاد');
  assert.equal(btn.textContent, 'نهارًا');
  assert.equal((els.views || el('v')).children.length, 0, 'كان: «⚠️ تعذّر التوليد» بعد أن ألغى المستخدم بنفسه');
  btn.onclick();
  answer({ ok: false, error: '' });
  assert.equal(els.views.children.length, 1, 'فشل حقيقيّ يُعرض كما كان');
  assert.match(els.views.children[0].textContent, /⚠️/);
});

// v-lock-quotab (cli-studios-12، المراجعة): الإطار يرسل الطراز ومقاسات الغرفة نصًّا حرًّا يدخل الوصف، والخادم يسعّر 4K بقاعدته على نصّ الوصف.
const reOf = (src, re) => { const m = src.match(re); assert.ok(m, 'القاعدة موجودة: ' + re); return new RegExp(m[1], 'i'); };
const SERVER_4K = reOf(read('api/_lib/maha-image.js'), /const __ask4K = \/(.*)\/i\n/);

test('cli-studios-12 (المراجعة): سعر التأكيد هو ما يخصمه الخادم — طراز أو مقاس «4k» من الإطار يُسعَّر 4K في الخادم فيُعرض سعر 4K', async () => {
  const b = bridge(false, true);
  const cases = [
    ['exterior', { style: '4k', floors: [{ rooms: [] }] }, '30'],
    ['majlis', { style: 'عصري', floors: [{ rooms: [{ name: 'مجلس', w: '4k', h: 5 }] }] }, '30'],
    ['living', { style: 'print-ready', floors: [{ rooms: [{ name: 'صالة', w: 5, h: 4 }] }] }, '30'],
    ['exterior', { style: 'عصري', plotWidth: 15, floors: [{ rooms: [{ name: 'مجلس', w: 6, h: 5 }, { name: 'كراج', w: 6, h: 5 }] }] }, '20'],
    ['majlis', { style: 'Classic', floors: [{ rooms: [{ name: 'مجلس', w: 6, h: 5 }] }] }, '20'],
  ];
  for (let i = 0; i < cases.length; i++) {
    const [view, spec, want] = cases[i];
    const server = SERVER_4K.test(' ' + b.FP.facadePrompt(spec, view)) ? '30' : '20'; // ما يخصمه maha-image لهذا الوصف (userText فارغ)
    assert.equal(server, want, 'سعر الخادم للحالة ' + i);
    b.send(i + 1, view, spec);
    await flush(); await flush();
    assert.equal(b.asks.length, i + 1, 'كلّ توليد يُسأل عنه');
    assert.ok(b.asks[i].includes(' ' + want + ' '), 'كان: «20» والخادم يخصم ' + want + ' — ' + b.asks[i]);
  }
  assert.equal(b.fetches.length, 0, 'ألغى المستخدم كلّها');
  const client = reOf(FP_SRC, /var VIEW_ASK_4K = \/(.*)\/i;/);
  assert.equal(client.source, SERVER_4K.source, 'قاعدة الجسر هي قاعدة الخادم حرفيًّا — أيّ تغيير في أحدهما يُكسر هنا');
});
