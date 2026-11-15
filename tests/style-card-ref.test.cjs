// v-style-card-ref (١٥ نوفمبر ٢٠٢٦، لقطتا المالك في «ستايل الذكاء الاصطناعي»):
//   ١) «فستان منفوش — عاجي» ← «مايختار الي نفس الي في الصوره»: الخيار كان يُرسَل وصفًا قصيرًا وحده («ball-gown bride — ivory»)،
//      فيخرج فستان يشبهه لا هو. الآن ميزات الإطلالة الكاملة (الأعراس والتراث) ترسل بطاقة الخيار المخزّنة نفسها «صورة ٢».
//   ٢) «الجسم — مشدود» رجعت صورته نفسها ورصيد Gemini نافد (السجلّ: guard unavailable — passing result through): الحارس يحتاج
//      Gemini وتعطّله كان يمرّر أيّ ناتج. الآن ميزات التغيير الواسع تُقاس بالبكسل حينها: الصورة نفسها = محاولة ثانية ثمّ ٤٢٢ «ما تغيّر».
// المعالج الحقيقيّ + الحصّة والتوقيع الحقيقيّان؛ KV في الذاكرة وfetch محاكى. لا صورة لشخص حقيقيّ: مربّعات ملوّنة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const { PNG } = require('pngjs');

process.env.AUTH_SECRET = 'style-card-ref-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
for (const k of ['IMAGE_DUO', 'IMAGE_GUARD_FREE', 'IMAGE_UNCHANGED_FREE', 'OWNER_USERNAMES', 'FAL_KEY', 'BODY_REFRAME']) delete process.env[k];

const store = new Map();
const tick = () => new Promise((r) => setImmediate(r));
const kvImpl = {
  kvGetJSON: async (k) => { await tick(); return store.has(k) ? JSON.parse(store.get(k)) : null; },
  kvPutJSON: async (k, v) => { await tick(); store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { await tick(); return store.has(k) ? String(store.get(k)) : null; },
  kvSetRaw: async (k, v) => { await tick(); store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await tick(); if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { await tick(); const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvExpire: async () => {},
  kvDel: async (k) => { store.delete(k); },
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    if (op === 'GET') return store.has(k) ? store.get(k) : null;
    if (op === 'INCRBY') { const v = Number(store.get(k) || 0) + Number(a); store.set(k, String(v)); return v; }
    if (op === 'DEL') { store.delete(k); return 1; }
    return op === 'EXPIRE' ? 1 : null;
  }),
};
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
stub('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
stub('api/_lib/_vip.js', { isVip: async () => false });

function png(shift) {
  const p = new PNG({ width: 96, height: 128 });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = ((i / 4) % 96 * 2 + shift) % 256; p.data[i + 1] = (shift * 3) % 256; p.data[i + 2] = 150; p.data[i + 3] = 255; }
  return PNG.sync.write(p).toString('base64');
}
const MINE = png(0), CHANGED = png(140);
const CARD = 'Q0FSRC1XRURESU5HLUJBTEwtR09XTi1JVk9SWQ'; // بطاقة مخزّنة (webp في الإنتاج؛ لا تُقاس هنا، تُرسَل فقط)

const auth = require(rp('api/_lib/auth.js'));
const studio = require(rp('api/_lib/studio-create.js'));
const faceLock = require(rp('api/_lib/face-lock.js'));
let levels = [];
const realPrepare = faceLock.prepare;
faceLock.prepare = async (opts) => { levels.push(opts.level); return realPrepare(opts); };

const PASS = { sourceIsPhotograph: true, resultIsPhotograph: true, sameVisualMedium: true, identityPreserved: true, onlyRequestedChange: true, requestedChangeApplied: true };
// guard: 'pass' | 'down' (Gemini بلا رصيد: ٤٠٢) | 'nochange' (الحارس يرى «ما تغيّر»). out(): ناتج الرسم لكلّ نداء.
let guard = 'pass', out = () => CHANGED, gen = [], oai = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  await tick();
  const body = init && typeof init.body === 'string' ? init.body : '';
  if (u.includes('gemini-flash-latest')) {
    if (guard === 'down') return Response.json({ error: { message: 'Your prepayment credits are depleted.' } }, { status: 402 });
    if (/box_2d|Locate the main person/.test(body)) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ face: [300, 300, 600, 600], head: [200, 250, 650, 700], faces: [] }) }] } }] });
    if (/Answer with exactly one letter/.test(body)) return Response.json({ candidates: [{ content: { parts: [{ text: 'A' }] } }] });
    const v = guard === 'nochange' ? Object.assign({}, PASS, { requestedChangeApplied: false }) : PASS;
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(v) }] } }] });
  }
  if (u.includes('api.openai.com')) { oai.push(u); return Response.json({ data: [{ b64_json: CHANGED }] }); }
  assert.match(u, /gemini-3-pro-image/, 'لا نداء يفلت من المحاكاة: ' + u);
  gen.push(JSON.parse(body));
  return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: out(gen.length) } }] } }] });
};
test.after(() => { global.fetch = realFetch; });

async function call(user, body) {
  let done; const sent = new Promise((r) => { done = r; });
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { done({ code: this.code, body: b }); return this; }, end() { done({ code: this.code }); return this; } };
  const [r] = await Promise.all([sent, studio({ method: 'POST', headers: {}, query: {}, body: Object.assign({ token: auth.makeToken(user) }, body) }, res)]);
  return { code: r.code, body: r.body || {} };
}
const reset = () => { store.clear(); guard = 'pass'; out = () => CHANGED; gen = []; oai = []; levels = []; };
const genText = (g) => g.contents[0].parts.map((p) => p.text || '').join('\n');
const genImages = (g) => g.contents[0].parts.filter((p) => p.inlineData).map((p) => p.inlineData.data);
const day = new Date().toISOString().slice(0, 10);
const tally = (u) => Number(store.get('db/studio-usage/tally/' + encodeURIComponent(u) + '/' + day) || 0);
const WEDDING = { feature: 'wedding', style: 'wdballgownivr', imageBase64: MINE, mimeType: 'image/png' };

test('١. فستان منفوش — عاجي: بطاقة الخيار المخزّنة «صورة ٢» بعد صورة المستخدم، وأمر «الثوب نفسه» ووجهه وجسمه وخلفيّته من صورته', async () => {
  reset();
  store.set('studio:preview:v2:wedding:wdballgownivr', CARD);
  const r = await call('bride1', WEDDING);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(gen.length, 1);
  const imgs = genImages(gen[0]);
  assert.deepEqual(imgs, [MINE, CARD], 'صورة المستخدم أوّلًا ثمّ البطاقة');
  const t = genText(gen[0]);
  assert.match(t, /Photo 1 of 2 — the user/); assert.match(t, /Photo 2 of 2 — the chosen look/);
  assert.match(t, /exactly the outfit shown in Photo 2/); assert.match(t, /same hair styling and makeup/);
  assert.match(t, /Never copy the model's face, skin tone, body or background from Photo 2/);
  assert.match(t, /hair stays fully covered/);
  assert.equal(oai.filter((x) => /edits/.test(x)).length, 0, 'تعديل القناع لا يرى البطاقة فلا يُستعمل معها');
  assert.equal(gen[0].generationConfig.imageConfig.aspectRatio, '3:4', 'نسبة صورة المستخدم (٩٦×١٢٨) لا نسبة البطاقة ٢:٣');
});

test('٢. بلا بطاقة مخزّنة: الوصف وحده كما كان؛ والتراث يقرأ آخر مراجعة للبطاقة (studio-card-fix)، والكولاج بلا بطاقة', async () => {
  reset();
  const r = await call('bride2', WEDDING);
  assert.equal(r.code, 200);
  assert.deepEqual(genImages(gen[0]), [MINE]); assert.doesNotMatch(genText(gen[0]), /Photo 2/);
  reset();
  store.set('studio:preview:v2:heritage:emirati:r1', CARD); // REV["heritage:emirati"] = 1
  const h = await call('her1', { feature: 'heritage', style: 'emirati', imageBase64: MINE, mimeType: 'image/png' });
  assert.equal(h.code, 200, JSON.stringify(h.body));
  assert.deepEqual(genImages(gen[0]), [MINE, CARD]); assert.doesNotMatch(genText(gen[0]), /same hair styling and makeup/, 'التراث ثوبٌ لا تسريحة');
  reset();
  store.set('studio:preview:v2:heritage:emirati:r1', CARD);
  await call('her2', { feature: 'heritage', style: 'emirati', imageBase64: MINE, mimeType: 'image/png', multiAngle: true });
  assert.deepEqual(genImages(gen[0]), [MINE], 'الكولاج (ثلاث لقطات) بلا بطاقة');
});

test('٣. المحاولة الثانية بعد «ما تغيّر» تحمل البطاقة أيضًا', async () => {
  reset();
  store.set('studio:preview:v2:wedding:wdballgownivr', CARD);
  guard = 'nochange';
  const r = await call('bride3', WEDDING);
  assert.equal(r.code, 422);
  assert.equal(gen.length, 2);
  assert.deepEqual(genImages(gen[1]), [MINE, CARD]); assert.match(genText(gen[1]), /SECOND ATTEMPT/);
});

test('٤. Gemini بلا رصيد (الحارس معطّل): ناتجٌ هو الصورة نفسها = محاولة ثانية ثمّ ٤٢٢ «ما تغيّر» بلا خصم؛ والمتغيّر يمرّ', async () => {
  reset(); guard = 'down'; out = () => MINE;
  const r = await call('body1', { feature: 'body', style: Object.keys(studio.STYLE_TEXT.body || { athletic: 1 })[0], imageBase64: MINE, mimeType: 'image/png' });
  assert.equal(r.code, 422, JSON.stringify(r.body)); assert.equal(r.body.error, 'image_edit_no_change');
  assert.equal(gen.length, 2, 'رسمتان مدفوعتان ثمّ الرفض'); assert.match(genText(gen[1]), /SECOND ATTEMPT/);
  assert.equal(tally('body1'), 0, 'ضمن الردّ اليوميّ: لا تُحتسب');
  reset(); guard = 'down'; out = (n) => (n === 1 ? MINE : CHANGED);
  const w = await call('bride4', WEDDING);
  assert.equal(w.code, 200, 'الثانية تغيّرت فعلًا'); assert.equal(w.body.imageBase64, CHANGED); assert.equal(tally('bride4'), 1);
  reset(); guard = 'down'; out = () => CHANGED;
  const c = await call('bride5', WEDDING);
  assert.equal(c.code, 200); assert.equal(gen.length, 1, 'المتغيّر يمرّ من أوّل مرّة كما كان');
});

test('٥. القياس بالبكسل لميزات التغيير الواسع وحدها: تغيير صغير (عيون) لا يُحكم عليه بالبكسل — الحارس المعطّل يمرّره كما كان', async () => {
  reset(); guard = 'down'; out = () => MINE;
  const style = Object.keys(studio.STYLE_TEXT.eyes || {})[0] || 'green';
  const r = await call('eyes1', { feature: 'eyes', style, imageBase64: MINE, mimeType: 'image/png' });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(gen.length, 1);
});

test('٦. المراجعة المستقلّة: بلا قفل وجه (Gemini بلا رصيد) لا بطاقة — الوصف وحده؛ والتراث مع البطاقة يُقفل الوجه وحده (غطاء رأسها جزء منها)', async () => {
  reset(); guard = 'down';
  store.set('studio:preview:v2:wedding:wdballgownivr', CARD);
  const r = await call('bride6', WEDDING);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual(genImages(gen[0]), [MINE], 'بلا قفل الوجه لا تُرسَل عارضة البطاقة');
  reset();
  store.set('studio:preview:v2:heritage:bisht', CARD);
  assert.equal(faceLock.protectLevel('heritage', null, studio.styleTextOf('heritage', 'bisht')), 'body', 'خيارٌ لا يسمّي غطاء رأس');
  const h = await call('her6', { feature: 'heritage', style: 'bisht', imageBase64: MINE, mimeType: 'image/png' });
  assert.equal(h.code, 200, JSON.stringify(h.body));
  assert.deepEqual(levels, ['face'], 'مع البطاقة: الوجه وحده');
  assert.deepEqual(genImages(gen[0]), [MINE, CARD]);
  reset();
  await call('her7', { feature: 'heritage', style: 'bisht', imageBase64: MINE, mimeType: 'image/png' });
  assert.deepEqual(levels, ['body'], 'بلا بطاقة: كما كان');
});
