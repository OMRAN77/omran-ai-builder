// tests/fal-backup-studios.test.cjs — v-fal-backup (أمر المالك ٣ نوفمبر ٢٠٢٦: «موجود خارجي وصله»): الاستوديوهات الثلاثة
// (أنماط الصور مع إطارات الأفاتار، مصمّم الأزياء، بطاقات معاينة الستايل) عند نفاد رصيد Gemini (429 «prepayment credits are
// depleted» أو 402) تأخذ الصورة من النموذج نفسه عند fal بالدقّة والنسبة نفسيهما، وتمرّ بالمسار نفسه (الحارس والاحتساب والتصغير
// والتخزين). الزحام العاديّ لا يحوّل، وfal الموقوف يرجع للمسار القديم حرفيًّا، والبديل الموازي المدفوع (duo) يكفي فلا يُدفع مرّتين،
// ولا اسم مزوّد احتياطيّ في أيّ ردّ. المعالجات الحقيقيّة؛ KV في الذاكرة وfetch مزيّف (لا شبكة ولا مفاتيح حقيقيّة).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = 'fal-backup-studios-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.FAL_KEY = 'fal-test-key';
for (const k of ['FAL_BACKUP', 'FAL_BACKUP_CAP_CENTS', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'IMAGE_DUO', 'PSTYLE_FACE_CROP', 'OWNER_USERNAMES', 'OWNER_USERNAME', 'IMAGE_GUARD_FREE', 'VERCEL_ENV', 'OPENAI_API_KEY']) delete process.env[k];

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
stub('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
stub('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
stub('api/_lib/_vip.js', { isVip: async () => false });

function png(w, h, shift) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = ((i / 4) % w + shift) % 256; p.data[i + 1] = (shift * 3) % 256; p.data[i + 2] = 120; p.data[i + 3] = 255; }
  return PNG.sync.write(p).toString('base64');
}
const SRC = png(96, 128, 0); // ٣:٤ — نسبة الدمج من الصورة الأساسيّة
const SRC2 = png(96, 128, 60);
const FALIMG = png(120, 180, 140);
const OAI = png(64, 64, 200);

const auth = require(rp('api/_lib/auth.js'));
const fb = require(rp('api/_lib/fal-fallback.js'));
const portrait = require(rp('api/_lib/portrait-style.js'));
const fashion = require(rp('api/_lib/fashion-create.js'));
const preview = require(rp('api/_lib/studio-preview.js'));
const BASE = require(rp('api/_lib/studio-styles.js'));
const CARD_FIX = require(rp('api/_lib/studio-card-fix.js'));

const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';
const BUSY = 'Resource has been exhausted (e.g. check quota).';
// gem: 'depleted' (429 الرصيد) | '402' | 'busy' (429 زحام عاديّ) — كلّ نداءات Gemini (التوليد والحارس والكشف) بالردّ نفسه كما في الواقع
let gem = 'depleted', falMode = 'ok', oaiMode = 'ok', clockSkew = 0;
const calls = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  const isForm = init && init.body && typeof init.body.get === 'function';
  const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ u, body, form: isForm ? init.body : null });
  if (/generativelanguage\.googleapis\.com/.test(u)) {
    if (gem === '402') return Response.json({ error: { code: 402, message: 'Payment required.', status: 'PAYMENT_REQUIRED' } }, { status: 402 });
    return Response.json({ error: { code: 429, message: gem === 'busy' ? BUSY : DEPLETED, status: 'RESOURCE_EXHAUSTED' } }, { status: 429 });
  }
  if (/^https:\/\/fal\.run\//.test(u)) {
    if (falMode === 'locked') return new Response('{"detail":"User is locked. Reason: Exhausted balance."}', { status: 403 });
    // 'slow': المحاولة تأكل ١٠٠ ث من الساعة (Date.now المزاحة) ثمّ تفشل عابرًا
    if (falMode === 'slow') { clockSkew += 100000; return new Response('{"detail":"Gateway timeout"}', { status: 504 }); }
    return Response.json({ images: [{ url: 'data:image/png;base64,' + FALIMG, content_type: 'image/png' }] });
  }
  if (/^https:\/\/api\.openai\.com\//.test(u)) {
    if (oaiMode === 'down') return Response.json({ error: { message: 'boom' } }, { status: 500 });
    return Response.json({ data: [{ b64_json: OAI }] });
  }
  throw new Error('نداء يفلت من المحاكاة: ' + u);
};
test.after(() => { global.fetch = realFetch; });

const day = new Date().toISOString().slice(0, 10);
const tally = (ns, u) => Number(store.get('db/' + ns + '-usage/tally/' + encodeURIComponent(u) + '/' + day) || 0);
const spent = () => Number(store.get(fb.spentKey(day)) || 0);
const falCalls = () => calls.filter((c) => /^https:\/\/fal\.run\//.test(c.u));
const proCalls = () => calls.filter((c) => /gemini-3-pro-image:generateContent/.test(c.u));
const oaiCalls = () => calls.filter((c) => /api\.openai\.com/.test(c.u));
// لا اسم المزوّد الاحتياطيّ ولا نموذجه في ما يصل العميل
const LEAK = /\bfal\b|fal\.(?:run|media|ai)|nano-banana|Nano Banana/i;
function reset(o) {
  store.clear(); calls.length = 0;
  gem = (o && o.gem) || 'depleted'; falMode = (o && o.fal) || 'ok'; oaiMode = (o && o.oai) || 'ok';
  if (o && o.openai) process.env.OPENAI_API_KEY = 'oa-test'; else delete process.env.OPENAI_API_KEY;
}

function fakeRes() {
  let done; const sent = new Promise((r) => { done = r; });
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { done({ code: this.code, body: b, headers: this.headers }); return this; },
    end(b) { done({ code: this.code, raw: b, headers: this.headers }); return this; } };
  return { res, sent };
}
async function post(handler, user, body) {
  const { res, sent } = fakeRes();
  const [out] = await Promise.all([sent, handler({ method: 'POST', headers: {}, query: {}, body: Object.assign({ token: auth.makeToken(user) }, body) }, res)]);
  assert.ok(!LEAK.test(JSON.stringify(out.body || {})), 'اسم المزوّد الاحتياطيّ وصل العميل: ' + JSON.stringify(out.body).slice(0, 200));
  return out;
}
async function get(query) {
  const { res, sent } = fakeRes();
  const [out] = await Promise.all([sent, preview({ method: 'GET', headers: {}, query }, res)]);
  if (out.body) assert.ok(!LEAK.test(JSON.stringify(out.body)), 'اسم المزوّد الاحتياطيّ وصل العميل');
  return out;
}

/* ───── أنماط الصور ───── */
test('١. البورتريه: 429 الرصيد ← fal (برو /edit بدقّة 2K والحرارة نفسها) قبل OpenAI، يُحتسب، والطلب الثاني بلا نداء Gemini', async () => {
  reset({ openai: true });
  const r = await post(portrait, 'pstyle1', { imageBase64: SRC, mimeType: 'image/png', style: 'anime' });
  assert.equal(r.code, 200);
  assert.equal(r.body.imageBase64, FALIMG, 'الصورة من الاحتياط');
  assert.equal(r.body.engine, undefined, 'شكل ردّ Gemini نفسه (بلا engine)');
  assert.equal(oaiCalls().length, 0, 'لا إنقاذ OpenAI مدفوع بعد نجاح الاحتياط');
  assert.equal(falCalls().length, 1);
  const f = falCalls()[0];
  assert.equal(f.u, 'https://fal.run/fal-ai/nano-banana-pro/edit');
  assert.equal(f.body.resolution, '2K');
  assert.equal(f.body.temperature, 0.65);
  assert.deepEqual(f.body.image_urls, ['data:image/png;base64,' + SRC]);
  assert.equal(tally('portrait', 'pstyle1'), 1, 'الحصّة تُستهلك كناتج Gemini');
  assert.ok(store.get(fb.OUT_KEY), 'علم «Gemini خارج الرصيد»');
  calls.length = 0;
  const r2 = await post(portrait, 'pstyle1', { imageBase64: SRC, mimeType: 'image/png', style: 'beautify' });
  assert.equal(r2.code, 200);
  assert.equal(r2.body.imageBase64, FALIMG);
  assert.equal(proCalls().length, 0, 'بلا نداء توليد فاشل قبله');
  assert.equal(falCalls()[0].body.temperature, 0.15, 'التعديل الموضعيّ بحرارته المنخفضة');
  assert.equal(tally('portrait', 'pstyle1'), 2);
});

test('٢. دمج شخصين بـ402: الصورتان بالترتيب والنسبة ٣:٤ من الصورة الأساسيّة', async () => {
  reset({ gem: '402' });
  const r = await post(portrait, 'pstyle2', { imageBase64: SRC, mimeType: 'image/png', style: 'merge2', extraImages: [SRC2] });
  assert.equal(r.code, 200);
  assert.equal(r.body.imageBase64, FALIMG);
  const f = falCalls()[0];
  assert.equal(f.u, 'https://fal.run/fal-ai/nano-banana-pro/edit');
  assert.equal(f.body.image_urls.length, 2);
  assert.equal(f.body.aspect_ratio, '3:4');
  assert.equal(f.body.resolution, '2K');
  assert.match(f.body.prompt, /\[image 1\][\s\S]*\[image 2\]/);
});

test('٣. إطارات الأفاتار: الثلاثة من fal بدقّة 1K، ونداء Gemini واحد فقط (الأوّل)', async () => {
  reset();
  const r = await post(portrait, 'pstyle3', { imageBase64: SRC, mimeType: 'image/png', style: 'avatargif' });
  assert.equal(r.code, 200);
  assert.equal(r.body.frames.length, 3);
  assert.equal(proCalls().length, 1, 'الإطاران التاليان بلا نداء فاشل');
  assert.equal(falCalls().length, 3);
  for (const c of falCalls()) { assert.equal(c.u, 'https://fal.run/fal-ai/nano-banana-pro/edit'); assert.equal(c.body.resolution, '1K'); }
  assert.equal(tally('portrait', 'pstyle3'), 1);
});

test('٤. البورتريه: الزحام العاديّ لا يحوّل؛ وfal الموقوف ← المسار القديم حرفيًّا (OpenAI ثمّ ٥٠٢) والحجز يُردّ', async () => {
  reset({ gem: 'busy', openai: true, oai: 'down' });
  const busy = await post(portrait, 'pstyle4', { imageBase64: SRC, mimeType: 'image/png', style: 'anime' });
  assert.equal(busy.code, 502);
  assert.equal(busy.body.error, 'image_generation_failed');
  assert.equal(falCalls().length, 0, 'لا صرف احتياطيّ على زحام');
  assert.equal(oaiCalls().length, 1, 'الإنقاذ القديم كما هو');
  assert.ok(!store.get(fb.OUT_KEY));

  reset({ fal: 'locked', openai: true, oai: 'down' });
  const out = await post(portrait, 'pstyle4', { imageBase64: SRC, mimeType: 'image/png', style: 'anime' });
  assert.equal(out.code, 502);
  assert.equal(out.body.error, 'unavailable');
  assert.equal(falCalls().length, 1);
  assert.equal(oaiCalls().length, 1, 'OpenAI بعد فشل الاحتياط');
  assert.equal(spent(), 0, 'الحجز رُدّ');
  assert.equal(tally('portrait', 'pstyle4'), 0);

  reset({ fal: 'locked', openai: true });
  const oa = await post(portrait, 'pstyle4', { imageBase64: SRC, mimeType: 'image/png', style: 'anime' });
  assert.equal(oa.code, 200);
  assert.equal(oa.body.engine, 'openai');
  assert.equal(oa.body.imageBase64, OAI);

  reset({ fal: 'locked' });
  const fr = await post(portrait, 'pstyle4', { imageBase64: SRC, mimeType: 'image/png', style: 'avatargif' });
  assert.equal(fr.code, 502);
  assert.equal(fr.body.error, 'unavailable');
});

/* ───── مصمّم الأزياء ───── */
test('٥. الأزياء: البديل الموازي المدفوع يكفي — لا fal مع ناتجه، والعلم يُكتب، والطلب التالي بلا نداء Gemini', async () => {
  reset({ openai: true });
  const r = await post(fashion, 'fx1', { mode: 'image', imageBase64: SRC, mimeType: 'image/png', style: 'evening' });
  assert.equal(r.code, 200);
  assert.equal(r.body.engine, 'openai');
  assert.equal(r.body.imageBase64, OAI);
  assert.equal(falCalls().length, 0, 'لا دفع مرّتين');
  assert.equal(oaiCalls().length, 1);
  assert.ok(store.get(fb.OUT_KEY), 'العلم يُكتب ولو كفى الموازي');
  calls.length = 0;
  const r2 = await post(fashion, 'fx1', { mode: 'text', description: 'a long blue evening gown', style: 'evening' });
  assert.equal(r2.code, 200);
  assert.equal(r2.body.engine, 'openai');
  assert.equal(proCalls().length, 0, 'بلا نداء Gemini فاشل');
  assert.equal(falCalls().length, 0);
  assert.equal(tally('fashion', 'fx1'), 2);
});

test('٦. الأزياء بلا OpenAI: 429 الرصيد ← fal (نصّ = برو بلا /edit، صورة = /edit) بدقّة 2K، ومحرّك «gemini» كما كان', async () => {
  reset();
  const t = await post(fashion, 'fx2', { mode: 'text', description: 'a long blue evening gown', style: 'evening' });
  assert.equal(t.code, 200);
  assert.equal(t.body.imageBase64, FALIMG);
  assert.equal(t.body.engine, 'gemini', 'قيمة الموقع القائمة');
  assert.equal(falCalls()[0].u, 'https://fal.run/fal-ai/nano-banana-pro');
  assert.equal(falCalls()[0].body.resolution, '2K');
  assert.match(falCalls()[0].body.prompt, /long blue evening gown/);
  reset({ gem: '402' });
  const i = await post(fashion, 'fx2', { mode: 'image', imageBase64: SRC, mimeType: 'image/png', style: 'abaya' });
  assert.equal(i.code, 200);
  assert.equal(i.body.imageBase64, FALIMG);
  assert.equal(i.body.engine, 'gemini');
  assert.equal(falCalls()[0].u, 'https://fal.run/fal-ai/nano-banana-pro/edit');
  assert.deepEqual(falCalls()[0].body.image_urls, ['data:image/png;base64,' + SRC]);
  assert.equal(tally('fashion', 'fx2'), 1, 'وضع الصورة يمرّ بالحارس (معطّل = يمرّ) ويُحتسب');
});

test('٧. الأزياء: الموازي فشل ← fal مرّة واحدة بلا إنقاذ OpenAI متسلسل ثانٍ (وبالعلم كذلك، بلا نداء Gemini)', async () => {
  reset({ openai: true, oai: 'down', gem: '402' });
  const r = await post(fashion, 'fx3', { mode: 'image', imageBase64: SRC, mimeType: 'image/png', style: 'casual' });
  assert.equal(r.code, 200);
  assert.equal(r.body.imageBase64, FALIMG);
  assert.equal(r.body.engine, 'gemini');
  assert.equal(oaiCalls().length, 1, 'الموازي وحده');
  assert.equal(falCalls().length, 1);
  // العلم قائم والموازي فشل: fal مباشرة — لا Gemini ولا OpenAI ثانٍ
  calls.length = 0;
  const r2 = await post(fashion, 'fx3', { mode: 'refine', imageBase64: SRC, mimeType: 'image/png', editRequest: 'make the sleeves longer' });
  assert.equal(r2.code, 200);
  assert.equal(r2.body.imageBase64, FALIMG);
  assert.equal(r2.body.engine, 'gemini');
  assert.equal(proCalls().length, 0, 'بلا نداء توليد فاشل');
  assert.equal(oaiCalls().length, 1, 'الموازي وحده');
  assert.equal(falCalls().length, 1);
  assert.equal(falCalls()[0].u, 'https://fal.run/fal-ai/nano-banana-pro/edit');
  assert.equal(tally('fashion', 'fx3'), 2);
});

test('٧ب. الأزياء بلا OpenAI والعلم قائم: fal مباشرة بلا نداء Gemini، ويُحتسب', async () => {
  reset();
  store.set(fb.OUT_KEY, String(Date.now()));
  const r = await post(fashion, 'fx6', { mode: 'text', description: 'a green kaftan', style: 'kaftan' });
  assert.equal(r.code, 200);
  assert.equal(r.body.imageBase64, FALIMG);
  assert.equal(r.body.engine, 'gemini');
  assert.equal(proCalls().length, 0);
  assert.equal(falCalls().length, 1);
  assert.equal(falCalls()[0].u, 'https://fal.run/fal-ai/nano-banana-pro');
  assert.equal(tally('fashion', 'fx6'), 1);
});

test('٨. الأزياء: الزحام لا يحوّل، وfal الموقوف ← ٥٠٢ القديم والحجز يُردّ', async () => {
  reset({ gem: 'busy' });
  const b = await post(fashion, 'fx4', { mode: 'text', description: 'a red dress', style: 'evening' });
  assert.equal(b.code, 502);
  assert.equal(b.body.error, 'image_generation_failed');
  assert.equal(falCalls().length, 0);
  reset({ fal: 'locked' });
  const o = await post(fashion, 'fx4', { mode: 'text', description: 'a red dress', style: 'evening' });
  assert.equal(o.code, 502);
  assert.equal(o.body.error, 'unavailable');
  assert.equal(o.body.upstream, 429);
  assert.equal(falCalls().length, 1);
  assert.equal(spent(), 0);
  assert.equal(tally('fashion', 'fx4'), 0);
});

/* ───── بطاقات معاينة الستايل ───── */
const pickCard = () => {
  const v = Object.keys(BASE.STYLE_TEXT.hair).find((k) => !CARD_FIX.REV['hair:' + k]);
  return { feature: 'hair', value: v, key: 'studio:preview:v2:hair:' + v };
};
test('٩. البطاقة: 429 الرصيد ← fal (برو نصّ←صورة 2K ٢:٣) ثمّ WebP ويُخزَّن دائمًا', async () => {
  reset();
  const c = pickCard();
  const r = await get({ feature: c.feature, value: c.value });
  assert.equal(r.code, 200);
  assert.equal(Buffer.from(r.raw).slice(8, 12).toString('latin1'), 'WEBP', 'التصغير نفسه');
  assert.equal(r.headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.ok(store.get(c.key), 'محفوظة في الكاش');
  const f = falCalls()[0];
  assert.equal(f.u, 'https://fal.run/fal-ai/nano-banana-pro');
  assert.equal(f.body.resolution, '2K');
  assert.equal(f.body.aspect_ratio, '2:3');
  // العلم قائم: البطاقة التالية بلا نداء Gemini
  const all = Object.keys(BASE.STYLE_TEXT.hair).filter((k) => !CARD_FIX.REV['hair:' + k]);
  calls.length = 0;
  const r2 = await get({ feature: 'hair', value: all[1] });
  assert.equal(r2.code, 200);
  assert.equal(proCalls().length, 0);
  assert.equal(falCalls().length, 1);
});

test('١٠. البطاقة: الزحام لا يحوّل، وfal الموقوف ← ٥٠٢ القديم بلا تخزين', async () => {
  const c = pickCard();
  reset({ gem: 'busy' });
  const b = await get({ feature: c.feature, value: c.value });
  assert.equal(b.code, 502);
  assert.equal(falCalls().length, 0);
  reset({ fal: 'locked' });
  const o = await get({ feature: c.feature, value: c.value });
  assert.equal(o.code, 502);
  assert.deepEqual(o.body, { error: 'preview failed' });
  assert.equal(falCalls().length, 1);
  assert.ok(!store.get(c.key));
  assert.equal(spent(), 0);
});

test('١٠ب. البطاقة: محاولتا fal (المباشرة والإنقاذ) تحت موعد واحد ١١٠ ث — قفل التوليد ١٢٠ ث لا ينتهي فيدفع طلب موازٍ', async () => {
  const c = pickCard();
  reset({ fal: 'slow' });
  store.set(fb.OUT_KEY, String(Date.now()));
  const realNow = Date.now;
  Date.now = () => realNow() + clockSkew;
  try {
    const o = await get({ feature: c.feature, value: c.value });
    assert.equal(o.code, 502);
    assert.equal(proCalls().length, 1, 'Gemini بعد فشل المحاولة المباشرة كما كان');
    assert.equal(falCalls().length, 1, 'لا محاولة fal ثانية بعد أن أكلت الأولى الموعد');
  } finally { Date.now = realNow; clockSkew = 0; }
});

test('١١. FAL_BACKUP=off: لا احتياط في أيّ استوديو (المسار القديم)', async () => {
  process.env.FAL_BACKUP = 'off';
  try {
    reset();
    const p = await post(portrait, 'pstyle5', { imageBase64: SRC, mimeType: 'image/png', style: 'anime' });
    assert.equal(p.code, 502);
    const x = await post(fashion, 'fx5', { mode: 'text', description: 'a dress', style: 'evening' });
    assert.equal(x.code, 502);
    store.clear();
    const c = await get({ feature: pickCard().feature, value: pickCard().value });
    assert.equal(c.code, 502);
    assert.equal(falCalls().length, 0);
  } finally { delete process.env.FAL_BACKUP; }
});
