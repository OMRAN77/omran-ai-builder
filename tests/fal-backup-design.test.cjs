// tests/fal-backup-design.test.cjs — v-fal-backup (أمر المالك ٣ نوفمبر ٢٠٢٦: «تنبيه قبل ما يخلص الرصيد، أو مزوّد احتياطي — موجود خارجي
// وصله»): الديكور (إعادة تصميم الغرفة ولقطات «بلا صورة»)، والمقاولات (المخطّط/الواجهة، وزوايا المبنى والغرف)، وإنقاذ صورة الإعلان — عبر
// المعالجات الحقيقيّة. نفاد رصيد Gemini (٤٢٩ «prepayment credits are depleted» أو ٤٠٢) يحوّل الطلب نفسه إلى النموذج نفسه عند fal بالدقّة
// نفسها، وناتجه يُسلَّم ويُستهلك كناتج Gemini؛ الزحام العاديّ لا يحوّل؛ fal الموقوف يُبقي المسار القديم كما هو والحجز يُردّ؛ الموازي المدفوع
// (duo) يكفي فلا يُدفع لـfal مرّة ثانية؛ و٤٢٩ الرصيد في المقاولات لا يُعاد. لا اسم لـfal في ما يصل العميل. بلا شبكة: kv وfetch مزيّفان.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, 'api/_lib', f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = 'fal-backup-design-test-secret-' + 'x'.repeat(16);
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.FAL_KEY = 'test-fal-key';
for (const k of ['OPENAI_API_KEY', 'IMAGE_DUO', 'OWNER_USERNAMES', 'FAL_BACKUP', 'FAL_BACKUP_CAP_CENTS', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) delete process.env[k];

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvExpire: async () => {},
  kvDel: async (k) => { store.delete(k); },
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    if (op === 'GET') return store.has(k) ? store.get(k) : null;
    if (op === 'INCRBY') { const v = Number(store.get(k) || 0) + Number(a); store.set(k, String(v)); return v; }
    if (op === 'EXPIRE') return 1;
    if (op === 'DEL') { store.delete(k); return 1; }
    return null;
  }),
};
stub('kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
stub('log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
stub('_vip.js', { isVip: async () => false });
const cx = { consumed: 0 };
stub('_constructionUsage.js', {
  checkConstructionQuota: async () => ({ allowed: true, username: 'cxuser', remaining: 5, limit: 5 }),
  consumeConstruction: async () => { cx.consumed++; return 4; },
  CONSTRUCTION_DAILY_LIMIT: 5,
});
stub('_constructionLibrary.js', { saveDesign: async () => {} });

const fb = require(rp('fal-fallback.js'));
const auth = require(rp('auth.js'));
const design = require(rp('design-create.js'));
const cxCreate = require(rp('construction-create.js'));
const cxView = require(rp('construction-view.js'));
// الإعلان: الحصّة والهويّة مزيّفتان بعد تحميل الباقي (الديكور يقرأ _planCap الحقيقيّ عند تحميله)
const ad = { refunds: 0 };
stub('_planCap.js', Object.assign({}, require(rp('_planCap.js')), { checkAndConsumePlanCustom: async () => ({ allowed: true, limit: 8 }) }));
stub('points.js', Object.assign({}, require(rp('points.js')), { verifyPointsToken: (t) => (t === 'ad-token' ? 'sara' : null) }));
require(rp('_usage.js')).refundCustom = async () => { ad.refunds++; };
delete require.cache[rp('adimage.js')];
const adimage = require(rp('adimage.js'));

const FAL_PNG = Buffer.from('fal-backup-png').toString('base64');
const GEM_PNG = Buffer.from('gemini-png').toString('base64');
const OAI_B64 = Buffer.from('openai-webp').toString('base64');
const ROOM = Buffer.from('room-photo-bytes-'.repeat(12)).toString('base64');
const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';
const BUSY = 'Resource has been exhausted (e.g. check quota).';
/* ما لا يجوز أن يصل العميل من هذا الفرع: اسم fal أو نماذجه أو مفتاحه (الحقول القديمة detail/engine تحمل نصّ Google قبل هذا الفرع) */
const FAL_NAMES = /\bfal\b|fal\.run|fal-ai|fal\.media|FAL_KEY|test-fal-key|nano-banana/i;

/* الشبكة المزيّفة: نماذج صور Gemini بالحالة المطلوبة، ونصّ Gemini سليم دائمًا، وfal، وOpenAI */
const S = { gStatus: 200, gText: '', fal: 'ok', oa: 'fail' };
let calls = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('generativelanguage.googleapis.com')) {
    const model = (u.match(/models\/([^:]+):/) || [])[1] || '';
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    if (!/image/.test(model)) { calls.push({ kind: 'gtext', model }); return Response.json({ candidates: [{ content: { parts: [{ text: '### خطة مختصرة' }] } }] }); }
    calls.push({ kind: 'gimage', model, body });
    if (S.gStatus === 200) return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: GEM_PNG } }] } }] });
    return Response.json({ error: { code: S.gStatus, message: S.gText } }, { status: S.gStatus });
  }
  if (u.startsWith('https://fal.run/')) {
    calls.push({ kind: 'fal', model: u.slice('https://fal.run/'.length), body: JSON.parse(init.body), auth: init.headers.Authorization });
    if (S.fal === 'locked') return new Response('{"detail":"User is locked. Reason: Exhausted balance."}', { status: 403 });
    return Response.json({ images: [{ url: 'data:image/png;base64,' + FAL_PNG, content_type: 'image/png' }] });
  }
  if (u.includes('api.openai.com')) {
    calls.push({ kind: 'oa', url: u });
    if (S.oa === 'ok') return Response.json({ data: [{ b64_json: OAI_B64 }] });
    if (S.oa === 'quota') return Response.json({ error: { message: 'You exceeded your current quota, please check your plan and billing details.', code: 'insufficient_quota' } }, { status: 429 });
    return Response.json({ error: { message: 'server error' } }, { status: 500 });
  }
  throw new Error('نداء يفلت من المحاكاة: ' + u);
};
test.after(() => { global.fetch = realFetch; });

function reset(o) {
  store.clear(); calls = []; cx.consumed = 0; ad.refunds = 0;
  Object.assign(S, { gStatus: 200, gText: '', fal: 'ok', oa: 'fail' }, o);
  delete process.env.OPENAI_API_KEY;
}
const of = (k) => calls.filter((c) => c.kind === k);
const day = () => new Date().toISOString().slice(0, 10);
const spent = () => Number(store.get(fb.spentKey(day())) || 0);
const designTally = () => Number(store.get('db/design-usage/tally/decoruser/' + day()) || 0);

function call(handler, body) {
  return new Promise((resolve, reject) => {
    const res = {
      code: 200,
      setHeader() {},
      status(c) { this.code = c; return this; },
      json(j) { resolve({ code: this.code, body: j || {}, raw: JSON.stringify(j || {}) }); return this; },
      end(b) { let j = {}; try { j = JSON.parse(b); } catch (e) { j = { raw: String(b) }; } resolve({ code: this.code, body: j, raw: String(b || '') }); return this; },
    };
    Promise.resolve(handler({ method: 'POST', body, query: {}, headers: {} }, res)).catch(reject);
  });
}
const room = (extra) => call(design, Object.assign({ token: auth.makeToken('decoruser'), imageBase64: ROOM, mimeType: 'image/jpeg', style: 'luxury' }, extra));
const place = (extra) => call(design, Object.assign({ token: auth.makeToken('decoruser'), place: 'majlis', style: 'arabic', count: 2 }, extra));

/* ───── الديكور: إعادة تصميم الغرفة ───── */
test('١. الغرفة: ٤٢٩ الرصيد و٤٠٢ ← fal بالنموذج نفسه (برو تعديل 2K بصورة الغرفة)، المحرّك «gemini» والمقعد يُستهلك', async () => {
  for (const [status, text] of [[429, DEPLETED], [402, '']]) {
    reset({ gStatus: status, gText: text });
    const r = await room();
    assert.equal(r.code, 200, status + ': ' + r.raw.slice(0, 200));
    assert.equal(r.body.imageBase64, FAL_PNG);
    assert.equal(r.body.mimeType, 'image/png');
    assert.equal(r.body.engine, 'gemini', 'قيمة المحرّك القائمة لا اسم fal');
    assert.doesNotMatch(r.raw, FAL_NAMES);
    const f = of('fal');
    assert.equal(f.length, 1);
    assert.equal(f[0].model, 'fal-ai/nano-banana-pro/edit');
    assert.equal(f[0].auth, 'Key test-fal-key');
    assert.equal(f[0].body.resolution, '2K', 'الدقّة التي طُلبت من Gemini');
    assert.deepEqual(f[0].body.image_urls, ['data:image/jpeg;base64,' + ROOM]);
    assert.match(f[0].body.prompt, /^Redesign this room photo into a luxurious/);
    assert.equal(designTally(), 1, 'استهلاك كناتج Gemini');
    assert.ok(store.get(fb.OUT_KEY), 'علم «Gemini خارج الرصيد»');
    assert.equal(spent(), 15, 'برو 2K = ١٥ سنتًا');
  }
  // الطلب التالي خلال المهلة: مباشرة إلى fal بلا نداء Gemini فاشل
  calls = [];
  const r2 = await room();
  assert.equal(r2.code, 200);
  assert.equal(r2.body.imageBase64, FAL_PNG);
  assert.equal(of('gimage').length, 0, 'بلا نداء Gemini');
  assert.equal(of('fal').length, 1);
});

test('٢. الغرفة: الزحام العاديّ لا يحوّل (٤٢٩ ورسالة عامّة كما كانت)، وfal الموقوف ← «الخدمة متوقّفة» والحجز يُردّ', async () => {
  reset({ gStatus: 429, gText: BUSY });
  const busy = await room();
  assert.equal(busy.code, 429);
  assert.equal(busy.body.error, 'تعذّر تصميم الصورة الآن — حاول مرّة أخرى.');
  assert.equal(of('fal').length, 0, 'لا صرف عند fal على زحام');
  assert.ok(!store.get(fb.OUT_KEY));
  assert.equal(designTally(), 0);

  reset({ gStatus: 429, gText: DEPLETED, fal: 'locked' });
  const out = await room();
  assert.equal(out.code, 503);
  assert.deepEqual(out.body, { error: 'unavailable' });
  assert.equal(of('fal').length, 1, 'محاولة واحدة');
  assert.equal(spent(), 0, 'الحجز رُدّ');
  assert.equal(designTally(), 0, 'المقعد لم يُستهلك');
  assert.doesNotMatch(out.raw, FAL_NAMES);
});

test('٣. الغرفة: الموازي المدفوع (duo) أنتج ← هو الإنقاذ كما كان، ولا نداء fal، والعلم يُكتب للطلبات التالية', async () => {
  reset({ gStatus: 429, gText: DEPLETED, oa: 'ok' });
  process.env.OPENAI_API_KEY = 'test-openai';
  const r = await room();
  assert.equal(r.code, 200);
  assert.equal(r.body.imageBase64, OAI_B64);
  assert.equal(r.body.engine, 'openai');
  assert.equal(of('fal').length, 0, 'لا ندفع مرّتين');
  assert.ok(store.get(fb.OUT_KEY), 'العلم يُكتب');
  // الطلب التالي والعلم قائم: لا Gemini، والموازي يكفي، ولا fal
  calls = [];
  const r2 = await room();
  assert.equal(r2.body.imageBase64, OAI_B64);
  assert.equal(of('gimage').length, 0);
  assert.equal(of('fal').length, 0);
  // الموازي فشل والعلم قائم ← fal
  calls = []; S.oa = 'fail';
  const r3 = await room();
  assert.equal(r3.code, 200);
  assert.equal(r3.body.imageBase64, FAL_PNG);
  assert.equal(r3.body.engine, 'gemini');
  assert.equal(of('gimage').length, 0);
  assert.equal(of('fal').length, 1);
});

/* ───── الديكور: لقطات «بلا صورة» (بعد سقوط OpenAI كلّه) ───── */
test('٤. «بلا صورة»: برو ٤٢٩ الرصيد ← fal نصّ ← صورة 16:9 2K لكلّ لقطة، بلا تجربة نانو ٢', async () => {
  reset({ gStatus: 429, gText: DEPLETED, oa: 'quota' });
  process.env.OPENAI_API_KEY = 'test-openai';
  const r = await place();
  assert.equal(r.code, 200, r.raw.slice(0, 200));
  assert.equal(r.body.images.length, 2);
  assert.ok(r.body.images.every((im) => im.imageBase64 === FAL_PNG && im.mimeType === 'image/png'));
  assert.doesNotMatch(r.raw, FAL_NAMES);
  const f = of('fal');
  assert.equal(f.length, 2);
  assert.ok(f.every((c) => c.model === 'fal-ai/nano-banana-pro' && c.body.aspect_ratio === '16:9' && c.body.resolution === '2K' && !c.body.image_urls));
  assert.ok(!of('gimage').some((c) => c.model === 'gemini-3.1-flash-image'), 'لا نانو ٢ بعد نجاح الاحتياط');
  assert.equal(designTally(), 1);
});

test('٥. «بلا صورة»: الزحام العاديّ ← نانو ٢ كما كان بلا fal؛ fal الموقوف ← محاولة واحدة لكلّ لقطة ثمّ ٥٠٢ القديم', async () => {
  reset({ gStatus: 429, gText: BUSY, oa: 'quota' });
  process.env.OPENAI_API_KEY = 'test-openai';
  const busy = await place();
  assert.equal(busy.code, 502);
  assert.equal(of('fal').length, 0);
  assert.equal(of('gimage').filter((c) => c.model === 'gemini-3.1-flash-image').length, 2, 'نانو ٢ يُجرَّب كما كان');

  reset({ gStatus: 429, gText: DEPLETED, oa: 'quota', fal: 'locked' });
  process.env.OPENAI_API_KEY = 'test-openai';
  const out = await place();
  assert.equal(out.code, 502);
  assert.equal(out.body.error, 'لم يرجع النموذج أي شكل. جرّب نمطًا أو نوع مكان آخر.');
  assert.equal(of('fal').length, 2, 'محاولة fal واحدة لكلّ لقطة (لا ثانية بعد نانو ٢)');
  assert.doesNotMatch(out.raw, FAL_NAMES);
  assert.equal(spent(), 0);
  assert.equal(designTally(), 0);
});

/* ───── المقاولات: المخطّط/الواجهة ───── */
const cxBody = (extra) => Object.assign({ buildingType: 'villa', area: 300, token: 't', includePlan: true }, extra);
test('٦. المقاولات: ٤٢٩ الرصيد لا يُعاد، والمخطّط من fal (برو نصّ ← صورة بالدقّة نفسها 2K ثمّ 1K في المراحل)، والحصّة تُستهلك', async () => {
  reset({ gStatus: 429, gText: DEPLETED });
  const r = await call(cxCreate, cxBody());
  assert.equal(r.code, 200, r.raw.slice(0, 200));
  assert.equal(r.body.imageBase64, FAL_PNG);
  assert.equal(r.body.mimeType, 'image/png');
  assert.doesNotMatch(r.raw, FAL_NAMES);
  assert.equal(of('gimage').length, 1, 'لا إعادة على ٤٢٩ الرصيد');
  const f = of('fal');
  assert.equal(f.length, 1);
  assert.equal(f[0].model, 'fal-ai/nano-banana-pro');
  assert.equal(f[0].body.resolution, '2K');
  assert.match(f[0].body.prompt, /^A clean 2D architectural floor plan/);
  assert.equal(cx.consumed, 1);
  // مرحلة واحدة (1K) والعلم قائم: مباشرة إلى fal بلا Gemini
  calls = [];
  const s = await call(cxCreate, cxBody({ part: 'plan', parts: ['plan'] }));
  assert.equal(s.code, 200);
  assert.equal(of('gimage').length, 0);
  assert.equal(of('fal')[0].body.resolution, '1K');
  // ٤٠٢ أيضًا
  reset({ gStatus: 402, gText: '' });
  const r402 = await call(cxCreate, cxBody());
  assert.equal(r402.code, 200);
  assert.equal(r402.body.imageBase64, FAL_PNG);
});

test('٧. المقاولات: الزحام العاديّ يُعاد كما كان بلا fal، وfal الموقوف يُبقي الرمز القديم والحجز يُردّ', async () => {
  reset({ gStatus: 429, gText: BUSY });
  const busy = await call(cxCreate, cxBody());
  assert.equal(busy.code, 429);
  assert.deepEqual(busy.body, { error: 'construction_generation_failed' });
  assert.equal(of('gimage').length, 3, 'الزحام يُعاد ثلاثًا كما كان');
  assert.equal(of('fal').length, 0);

  reset({ gStatus: 429, gText: DEPLETED, fal: 'locked' });
  const out = await call(cxCreate, cxBody());
  assert.equal(out.code, 429);
  assert.deepEqual(out.body, { error: 'construction_generation_failed' });
  assert.equal(of('gimage').length, 1);
  assert.equal(of('fal').length, 1);
  assert.equal(spent(), 0);
  assert.equal(cx.consumed, 0);
});

/* ───── المقاولات: زوايا المبنى والغرف ───── */
const REF = Buffer.from('reference-building-'.repeat(10)).toString('base64');
const viewBody = (extra) => Object.assign({ buildingType: 'villa', area: 300, token: 't', style: 'modern' }, extra);
test('٨. الزوايا والغرف: ٤٠٢/٤٢٩ الرصيد ← fal (تعديل بصورة المرجع للزاوية، نصّ ← صورة للغرفة) 2K', async () => {
  reset({ gStatus: 402, gText: '' });
  const a = await call(cxView, viewBody({ mode: 'angle', angle: 'side', refImageBase64: REF }));
  assert.equal(a.code, 200, a.raw.slice(0, 200));
  assert.equal(a.body.imageBase64, FAL_PNG);
  assert.doesNotMatch(a.raw, FAL_NAMES);
  const fa = of('fal');
  assert.equal(fa.length, 1);
  assert.equal(fa[0].model, 'fal-ai/nano-banana-pro/edit');
  assert.deepEqual(fa[0].body.image_urls, ['data:image/jpeg;base64,' + REF]);
  assert.equal(fa[0].body.resolution, '2K');
  assert.equal(cx.consumed, 1);

  reset({ gStatus: 429, gText: DEPLETED });
  const rm = await call(cxView, viewBody({ mode: 'room', room: 'majlis' }));
  assert.equal(rm.code, 200);
  assert.equal(of('fal')[0].model, 'fal-ai/nano-banana-pro');
  assert.equal(of('fal')[0].body.resolution, '2K');
  // التالي والعلم قائم: بلا Gemini
  calls = [];
  const rm2 = await call(cxView, viewBody({ mode: 'room', room: 'kitchen' }));
  assert.equal(rm2.code, 200);
  assert.equal(of('gimage').length, 0);
});

test('٩. الزوايا والغرف: الزحام لا يحوّل، وfal الموقوف ← «الخدمة متوقّفة» كما كانت', async () => {
  reset({ gStatus: 429, gText: BUSY });
  const busy = await call(cxView, viewBody({ mode: 'room', room: 'living' }));
  assert.equal(busy.code, 503);
  assert.deepEqual(busy.body, { error: 'unavailable' });
  assert.equal(of('fal').length, 0);

  reset({ gStatus: 429, gText: DEPLETED, fal: 'locked' });
  const out = await call(cxView, viewBody({ mode: 'room', room: 'living' }));
  assert.equal(out.code, 503);
  assert.deepEqual(out.body, { error: 'unavailable' });
  assert.equal(of('fal').length, 1);
  assert.equal(spent(), 0);
  assert.equal(cx.consumed, 0);
});

/* ───── إنقاذ صورة الإعلان (بعد سقوط OpenAI) ───── */
const adBody = (extra) => Object.assign({ token: 'ad-token', lang: 'ar', ratio: 'tall', cat: 'car', title: 'لاندكروزر ٢٠٠٤', price: '49000', imageBase64: ROOM, mimeType: 'image/jpeg' }, extra);
test('١٠. الإعلان: OpenAI سقط وGemini ٤٢٩ الرصيد ← fal (برو تعديل 2K بالقالب ثمّ صورة المستخدم)، المحرّك «gemini»', async () => {
  reset({ gStatus: 429, gText: DEPLETED });
  process.env.OPENAI_API_KEY = 'test-openai';
  const r = await call(adimage, adBody());
  assert.equal(r.code, 200, r.raw.slice(0, 200));
  assert.equal(r.body.imageBase64, FAL_PNG);
  assert.equal(r.body.engine, 'gemini');
  assert.doesNotMatch(r.raw, FAL_NAMES);
  const f = of('fal');
  assert.equal(f.length, 1);
  assert.equal(f[0].model, 'fal-ai/nano-banana-pro/edit');
  assert.equal(f[0].body.resolution, '2K');
  assert.equal(f[0].body.image_urls.length, 2, 'القالب + صورة المستخدم');
  assert.equal(f[0].body.image_urls[1], 'data:image/jpeg;base64,' + ROOM);
  assert.equal(ad.refunds, 0, 'لا ردّ للحصّة عند النجاح');
});

test('١١. الإعلان: الزحام لا يحوّل، وfal الموقوف ← الخطأ القديم وردّ الحصّة', async () => {
  for (const [gText, falMode, falCalls] of [[BUSY, 'ok', 0], [DEPLETED, 'locked', 1]]) {
    reset({ gStatus: 429, gText, fal: falMode });
    process.env.OPENAI_API_KEY = 'test-openai';
    const r = await call(adimage, adBody());
    assert.equal(r.code, 500, gText);
    assert.equal(r.body.error, 'upstream');
    assert.equal(of('fal').length, falCalls);
    assert.equal(ad.refunds, 1, 'الحصّة رُدّت');
    assert.equal(spent(), 0);
    assert.doesNotMatch(r.raw, FAL_NAMES);
  }
});

/* مراجعة نقض: العلم قائم وfal فشل ← نداء Gemini واحد بلا إعادة ولا fal ثانٍ لنفس الصورة، ثمّ الإنقاذ القديم كما كان */
test('١٢. العلم قائم وfal موقوف: محاولة fal واحدة لكلّ صورة، Gemini مرّة بلا إعادة، والإنقاذ القديم بعدهما', async () => {
  const flagged = (o) => { reset(o); process.env.OPENAI_API_KEY = 'test-openai'; store.set(fb.OUT_KEY, String(Date.now())); };

  flagged({ gStatus: 429, gText: DEPLETED, fal: 'locked', oa: 'fail' });
  const rm = await room();
  assert.equal(rm.code, 503);
  assert.deepEqual(rm.body, { error: 'unavailable' });
  assert.equal(of('fal').length, 1, 'الغرفة: fal مرّة');
  assert.equal(of('gimage').length, 1, 'الغرفة: Gemini مرّة');
  assert.equal(designTally(), 0);

  flagged({ gStatus: 429, gText: DEPLETED, fal: 'locked', oa: 'quota' });
  const pl = await place();
  assert.equal(pl.code, 502);
  assert.equal(of('fal').length, 2, '«بلا صورة»: fal مرّة لكلّ لقطة');
  assert.equal(of('gimage').length, 4, 'برو ونانو ٢ كما كانا بلا fal بعدهما');

  flagged({ gStatus: 429, gText: DEPLETED, fal: 'locked', oa: 'ok' });
  const vw = await call(cxView, viewBody({ mode: 'room', room: 'living' }));
  assert.equal(vw.code, 200);
  assert.equal(vw.body.imageBase64, OAI_B64, 'إنقاذ OpenAI القديم');
  assert.equal(of('fal').length, 1);
  assert.equal(of('gimage').length, 1);
  assert.equal(cx.consumed, 1);

  flagged({ gStatus: 429, gText: DEPLETED, fal: 'locked', oa: 'ok' });
  const cc = await call(cxCreate, cxBody({ includePhoto: true, includeInterior: true }));
  assert.equal(cc.code, 200, cc.raw.slice(0, 200));
  assert.equal(cc.body.imageBase64, OAI_B64);
  assert.equal(of('fal').length, 3, 'المقاولات: fal مرّة لكلّ صورة (1K للثلاث)');
  assert.ok(of('fal').every((c) => c.body.resolution === '1K'));
  assert.equal(of('gimage').length, 3, 'لا إعادة على ٤٢٩ الرصيد');
  assert.equal(of('oa').length, 3);
  assert.equal(cx.consumed, 1);
  assert.equal(spent(), 0);

  flagged({ gStatus: 429, gText: DEPLETED, fal: 'locked' });
  const ad1 = await call(adimage, adBody());
  assert.equal(ad1.code, 500);
  assert.equal(of('fal').length, 1);
  assert.equal(of('gimage').length, 1);
  assert.equal(ad1.body.error, 'upstream');
  assert.equal(ad.refunds, 1);

  // والعلم قائم وfal سليم: الإعلان بلا نداء Gemini
  flagged({ gStatus: 429, gText: DEPLETED });
  const ad2 = await call(adimage, adBody());
  assert.equal(ad2.code, 200);
  assert.equal(ad2.body.imageBase64, FAL_PNG);
  assert.equal(of('gimage').length, 0);
  assert.equal(ad.refunds, 0);
  assert.doesNotMatch(ad2.raw, FAL_NAMES);
});
