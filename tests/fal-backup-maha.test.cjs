// tests/fal-backup-maha.test.cjs — v-fal-backup (أمر المالك ٣ نوفمبر ٢٠٢٦: «تنبيه قبل ما يخلص الرصيد، أو مزوّد احتياطي — موجود خارجي
// وصله»): صورة المحادثة ومها (maha-image) عبر الموجِّه الحقيقيّ. نفاد رصيد Gemini (٤٢٩ «prepayment credits are depleted» أو ٤٠٢) يحوّل
// الطلب نفسه إلى النموذج نفسه عند fal بالدقّة نفسها، فيمرّ ناتجه بالقياس والحكم والتكبير والخصم كناتج Gemini؛ الزحام العاديّ لا يحوّل؛
// fal الموقوف يُبقي المسار القديم كما هو (٥٠٣ unavailable وردّ النقاط)؛ نانو ٢/٢٫٥ على المفتاح نفسه لا يُجرَّب بعد نفاد الرصيد؛ في «+» ناتج
// GPT الموازي يكفي فلا يُدفع للاحتياط مرّة ثانية؛ وبطاقات اللوحة تُنقذ كلّ واحدة بدقّتها 1K. لا اسم مزوّد في ما يصل العميل. بلا شبكة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, 'api/_lib', f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'fal-backup-maha-test-secret';
process.env.GEMINI_API_KEY = 'test-gemini'; process.env.OPENAI_API_KEY = 'test-openai'; process.env.FAL_KEY = 'test-fal-key';
for (const k of ['FAL_BACKUP', 'FAL_BACKUP_CAP_CENTS', 'IMAGE_FREE_FALLBACK', 'IMG_DIAG', 'IMAGE_VERIFY', 'IMAGE_CAPTION', 'IMAGE_EDIT_MODEL', 'IMAGE_CREATIVE_MODEL',
  'IMAGE_PIPELINE', 'IMAGE_RAW_DEFAULT', 'IMAGE_RAW_CREATIVE', 'IMAGE_UPSCALE', 'IMAGE_CARDS', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) delete process.env[k];

const store = new Map();
stub('kv.js', {
  kvGetRaw: async (k) => (store.has(k) ? store.get(k) : null),
  kvSetRaw: async (k, v) => { store.set(k, v); return true; },
  kvGetJSON: async (k) => { try { return store.has(k) ? JSON.parse(store.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); return true; },
  kvDel: async (k) => { store.delete(k); return true; },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, v); return true; },
  kvIncr: async (k) => { const n = Number(store.get(k) || 0) + 1; store.set(k, n); return n; },
  kvIncrBy: async (k, by) => { const n = Number(store.get(k) || 0) + Number(by); store.set(k, n); return n; },
  kvDecrBy: async (k, by) => { const n = Number(store.get(k) || 0) - Number(by); store.set(k, n); return n; },
  kvExpire: async () => true,
});
const log = { spends: [], refunds: [], upscaled: [] };
const PAY = { ok: true, owner: false };
stub('points.js', {
  COSTS: { image: 20, image_creative: 35, image_4k: 30 },
  verifyPointsToken: (t) => ({ sara: 'sara', omran: 'omran' })[t] || null,
  isOwnerUsername: (u) => u === 'omran',
  spendPoints: async (u, n, kind) => { log.spends.push([u, n, kind]); return PAY; },
  refundPoints: async (u, n, how) => { log.refunds.push([u, n, how]); },
});
stub('_usage.js', { DAILY_LIMIT: 20, clientIp: () => null, checkAndConsume: async () => ({ allowed: true }) });
stub('_mediaPlans.js', { imageQuality: async () => null });
stub('abuse-guard.js', { imageHourlyGuard: async () => ({ ok: true }), imageHourlyGiveBack: async () => {} });
stub('tier.js', { resolveTier: async () => ({ tier: 'free' }) });
stub('log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
stub('prov-self.js', { noteImage: async () => {} });
stub('upscale.js', { upscaleImage: async (b64) => { log.upscaled.push(b64); return { ok: false, reason: 'already_sharp' }; } });

const fb = require(rp('fal-fallback.js'));
const handler = require(rp('maha-image.js'));

const FAL_PNG = Buffer.from('fal-backup-png').toString('base64');
const GPT_PNG = Buffer.from('gpt-image-png').toString('base64');
const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';
const BUSY = 'Resource has been exhausted (e.g. check quota).';
/* ما لا يجوز أن يصل العميل (نمط video-names.test.cjs) — يُطبَّق كاملًا على ردّ النجاح؛ وعلى ردّ الفشل أسماء fal وحدها: __diag القديم
   (IMG_DIAG) يحمل رسالة Google واسم نموذجها من قبل هذا الفرع */
const BANNED = /Runway|runwayml|Veo|Gemini|Google|googleapis|Omni|MiniMax|Hailuo|Kling|Sora|GPT|OpenAI|Nano\s?Banana|Flux|Topaz|Magnific|Replicate|Azure|fal\.run|fal-ai|bytedance|gen4|veo-?3|seedance|_API_KEY|FAL_KEY|Proxy error/i;
const FAL_NAMES = /\bfal\b|fal\.run|fal-ai|fal\.media|FAL_KEY|test-fal-key|nano-banana/i;

/* الشبكة المزيّفة: نماذج صور Gemini بالحالة المطلوبة، ونصّ Gemini (الحكم/الكشف) بالحالة نفسها ما لم يُعطَ ردّ، وfal وOpenAI */
function net(o) {
  const calls = [];
  const fn = async (url, init) => {
    const u = String(url);
    if (u.includes('generativelanguage.googleapis.com')) {
      const model = (u.match(/models\/([^:]+):/) || [])[1] || '';
      const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      const kind = /image/.test(model) ? 'gimage' : 'gtext';
      calls.push({ kind, model, body });
      if (kind === 'gtext' && o.text) { const t = o.text(body); if (t) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(t) }] } }] }); }
      return Response.json({ error: { code: o.gStatus, message: o.gText, status: o.gStatus === 429 ? 'RESOURCE_EXHAUSTED' : 'FAILED_PRECONDITION' } }, { status: o.gStatus });
    }
    if (u.startsWith('https://fal.run/')) {
      const body = JSON.parse(init.body);
      calls.push({ kind: 'fal', url: u, body, auth: init.headers.Authorization });
      if (o.fal === 'locked') return new Response('{"detail":"User is locked. Reason: Exhausted balance."}', { status: 403 });
      const out = o.falOut ? o.falOut(body) : FAL_PNG;
      return Response.json({ images: [{ url: 'data:image/png;base64,' + out, content_type: 'image/png' }] });
    }
    if (u.includes('api.openai.com')) {
      calls.push({ kind: 'openai', url: u });
      if (o.gpt) return Response.json({ data: [{ b64_json: GPT_PNG }] });
      return Response.json({ error: { message: 'Rate limit reached for images' } }, { status: 429 });
    }
    calls.push({ kind: 'other', url: u });
    return new Response('', { status: 404 });
  };
  return { fn, calls };
}
async function call(body, o) {
  const n = net(o || {});
  const realFetch = global.fetch, realErr = console.error, realWarn = console.warn, realLog = console.log;
  global.fetch = n.fn;
  log.spends.length = 0; log.refunds.length = 0; log.upscaled.length = 0;
  console.error = () => {}; console.warn = () => {}; console.log = () => {};
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  try { await handler({ method: 'POST', headers: {}, body }, res); } finally { global.fetch = realFetch; console.error = realErr; console.warn = realWarn; console.log = realLog; }
  const of = (k) => n.calls.filter((c) => c.kind === k);
  return { code: res.code, body: res.body, calls: n.calls, of, spends: log.spends.slice(), refunds: log.refunds.slice(), upscaled: log.upscaled.slice() };
}
const clientText = (b) => JSON.stringify(Object.assign({}, b, { imageBase64: undefined }));
const spent = () => Number(store.get(fb.spentKey(new Date().toISOString().slice(0, 10))) || 0);
const APPLE = { prompt: 'A red apple on a wooden table, soft daylight', userText: 'ارسم تفاحة حمراء', token: 'sara' };

test('١. ٤٢٩ «الرصيد خلص» في التوليد ← صورة fal بالنموذج نفسه (Pro) ودقّته 2K ونسبته، بلا إعادة ولا نانو ٢/٢٫٥ ولا GPT، والخصم والتكبير كما هما', async () => {
  store.clear();
  const r = await call(APPLE, { gStatus: 429, gText: DEPLETED });
  assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.imageBase64, FAL_PNG, 'الصورة من الاحتياط');
  assert.equal(r.body.engine, 'nano-pro', 'اسم المحرّك نفسه — لا اسم مزوّد');
  assert.equal(r.of('gimage').length, 1, 'نداء صورة واحد: لا إعادة ٤٢٩ الرصيد ولا نانو ٢/٢٫٥ على المفتاح نفسه');
  const gem = r.of('gimage')[0];
  assert.equal(gem.model, 'gemini-3-pro-image');
  const f = r.of('fal');
  assert.equal(f.length, 1);
  assert.equal(f[0].url, 'https://fal.run/fal-ai/nano-banana-pro');
  assert.equal(f[0].auth, 'Key test-fal-key');
  assert.equal(f[0].body.resolution, gem.body.generationConfig.imageConfig.imageSize, 'الدقّة نفسها التي طُلبت من Gemini');
  assert.equal(f[0].body.resolution, '2K');
  assert.equal(f[0].body.aspect_ratio, '3:4', 'نسبة الجوّال الافتراضيّة نفسها');
  assert.equal(f[0].body.prompt, gem.body.contents[0].parts[0].text, 'الأمر المهندس نفسه');
  assert.equal(r.of('openai').length, 0, 'لا GPT بعد صورة الاحتياط');
  assert.deepEqual(r.upscaled, [FAL_PNG], 'الناتج يمرّ بمرحلة التكبير كناتج Gemini');
  assert.deepEqual(r.spends, [['sara', 20, 'image']], 'الخصم مرّة واحدة كالعادة');
  assert.equal(r.refunds.length, 0);
  assert.ok(store.get(fb.OUT_KEY), 'علم «Gemini خارج الرصيد»');
  assert.equal(spent(), 15, 'Pro 2K = ١٥ سنتًا في عدّاد السقف');
  assert.doesNotMatch(clientText(r.body), BANNED);
});

test('٢. العلم قائم ← الطلب التالي إلى fal مباشرة بلا نداء Gemini، و4K تُطلب 4K', async () => {
  const r = await call({ prompt: 'A red apple, print quality 4k', userText: 'ارسم تفاحة حمراء 4k للطباعة', token: 'sara' }, { gStatus: 429, gText: DEPLETED });
  assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.of('gimage').length, 0, 'بلا نداء صورة فاشل قبله');
  const f = r.of('fal');
  assert.equal(f.length, 1);
  assert.equal(f[0].url, 'https://fal.run/fal-ai/nano-banana-pro');
  assert.equal(f[0].body.resolution, '4K');
  assert.equal(r.body.engine, 'nano-pro');
  assert.deepEqual(r.spends, [['sara', 30, 'image_4k']]);
  assert.equal(spent(), 45, '١٥ + ٣٠');
  assert.doesNotMatch(clientText(r.body), BANNED);
});

test('٣. ٤٠٢ في التعديل مع ذاكرة المحادثة ← fal edit بالصور بترتيبها (المصدر الأوّل، ناتجه، ثمّ مصدر هذا الدور) والحرارة والدقّة نفسها', async () => {
  store.clear();
  const S0 = Buffer.from('history-source-'.repeat(12)).toString('base64');
  const R0 = Buffer.from('history-result-'.repeat(12)).toString('base64');
  const SRC = Buffer.from('current-source-'.repeat(12)).toString('base64');
  const r = await call({ prompt: 'غيّر لون الخلفية إلى أزرق', userText: 'غيّر لون الخلفية إلى أزرق', editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'sara',
    history: [{ text: 'خل الخلفية أفتح', sourceBase64: S0, sourceMime: 'image/jpeg', resultBase64: R0, resultMime: 'image/png' }] }, { gStatus: 402, gText: 'Payment Required' });
  assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.imageBase64, FAL_PNG);
  assert.equal(r.body.engine, 'nano-pro');
  const gem = r.of('gimage')[0];
  assert.equal(gem.body.contents.length, 3, 'Gemini استلم الدورين السابقين والدور الحالي');
  const f = r.of('fal');
  assert.equal(f.length, 1);
  assert.equal(f[0].url, 'https://fal.run/fal-ai/nano-banana-pro/edit');
  assert.deepEqual(f[0].body.image_urls, ['data:image/jpeg;base64,' + S0, 'data:image/png;base64,' + R0, 'data:image/jpeg;base64,' + SRC]);
  assert.match(f[0].body.prompt, /^خل الخلفية أفتح\n\[image 1\]\nYour previous result: \[image 2\]\nConversation context:/);
  assert.match(f[0].body.prompt, /\n\[image 3\]$/, 'مصدر هذا الدور آخرًا كما عند Gemini');
  assert.equal(f[0].body.resolution, gem.body.generationConfig.imageConfig.imageSize);
  assert.equal(f[0].body.temperature, gem.body.generationConfig.temperature, 'حرارة المسار نفسها (أو غيابها)');
  assert.equal(f[0].body.aspect_ratio, 'auto', 'التعديل يتبع أبعاد المصدر');
  assert.equal(r.of('gimage').length, 1, 'لا نانو ٢/٢٫٥ بعد ٤٠٢');
  assert.equal(r.of('openai').length, 0);
  assert.doesNotMatch(clientText(r.body), BANNED);
});

test('٤. الزحام العاديّ (٤٢٩ quota) لا يحوّل: الإعادة ونانو ٢/٢٫٥ وGPT كما كانت، ثمّ busy قابل للإعادة', async () => {
  store.clear();
  const r = await call(APPLE, { gStatus: 429, gText: BUSY });
  assert.equal(r.of('fal').length, 0, 'لا صرف عند fal على زحام');
  assert.equal(r.of('gimage').filter((c) => c.model === 'gemini-3-pro-image').length, 3, 'الزحام يُعاد كما كان');
  assert.deepEqual(r.of('gimage').filter((c) => c.model !== 'gemini-3-pro-image').map((c) => c.model), ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']);
  assert.ok(r.of('openai').length >= 1);
  assert.equal(r.code, 502);
  assert.equal(r.body.error, 'image_generation_busy');
  assert.equal(r.body.retryable, true);
  assert.equal(store.get(fb.OUT_KEY), undefined, 'لا علم');
  assert.doesNotMatch(clientText(r.body), FAL_NAMES);
});

test('٥. fal موقوف (٤٠٣ «User is locked») ← المسار القديم كما هو: ٥٠٣ unavailable بلا إعادة، والنقاط تعود، والحجز يُردّ، وإشعار المالك', async () => {
  store.clear();
  const r = await call(APPLE, { gStatus: 429, gText: DEPLETED, fal: 'locked' });
  assert.equal(r.of('fal').length, 1);
  assert.equal(r.of('gimage').length, 1, 'نانو ٢/٢٫٥ لا يُجرَّب على رصيد خالص');
  assert.equal(r.code, 503, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.error, 'unavailable');
  assert.equal(r.body.retryable, false);
  assert.deepEqual(r.refunds, [['sara', 20, PAY]]);
  assert.equal(r.body.__diag.nano, 'credit-out');
  assert.equal(spent(), 0, 'fal لم يُنتج شيئًا = الحجز رُدّ');
  assert.ok(store.get('db/alerts/media-fal-out') && store.get('db/alerts/media-gemini-out'), 'إشعارا «Gemini خلص» و«الاحتياط رفض»');
  assert.doesNotMatch(clientText(r.body), FAL_NAMES);
  // المفتاح العامّ مطفأ = بلا احتياط إطلاقًا، والردّ نفسه
  store.clear(); process.env.FAL_BACKUP = 'off';
  try {
    const off = await call(APPLE, { gStatus: 429, gText: DEPLETED });
    assert.equal(off.of('fal').length, 0);
    assert.equal(off.code, 503);
    assert.equal(off.body.error, 'unavailable');
    assert.doesNotMatch(clientText(off.body), FAL_NAMES);
  } finally { delete process.env.FAL_BACKUP; }
});

test('٦. «+» للمالك: ناتج GPT الموازي يكفي فلا يُدفع للاحتياط؛ وإن فشل GPT فالاحتياط يكمل المرشّح', async () => {
  store.clear();
  const OWNER_MIX = { prompt: APPLE.prompt, userText: APPLE.userText, token: 'omran', engineMix: true };
  const withGpt = await call(OWNER_MIX, { gStatus: 429, gText: DEPLETED, gpt: true });
  assert.equal(withGpt.code, 200, JSON.stringify(withGpt.body).slice(0, 300));
  assert.equal(withGpt.of('fal').length, 0, 'لا دفع مرّتين');
  assert.equal(withGpt.body.engine, 'mix:openai');
  assert.equal(withGpt.body.imageBase64, GPT_PNG);
  store.clear();
  const noGpt = await call(OWNER_MIX, { gStatus: 429, gText: DEPLETED });
  assert.equal(noGpt.code, 200, JSON.stringify(noGpt.body).slice(0, 300));
  assert.equal(noGpt.of('fal').length, 1);
  assert.equal(noGpt.body.engine, 'mix:nano-pro');
  assert.equal(noGpt.body.imageBase64, FAL_PNG);
  assert.doesNotMatch(clientText(noGpt.body), FAL_NAMES);
});

test('٧. لوحة البطاقات (المالك): الرصيد خلص وسط اللوحة ← كلّ بطاقة عند fal edit بدقّة 1K نفسها، وGPT لا يُستدعى', async () => {
  store.clear();
  const SRC = fs.readFileSync(path.join(root, 'tests/fixtures/styles-grid-source.jpg')).toString('base64');
  const diff = require(rp('image-diff.js'));
  const TRUTH = [[0, 0, 114, 152], [123, 0, 235, 152], [245, 0, 359, 152], [368, 0, 480, 152], [0, 212, 114, 357], [123, 212, 235, 357], [245, 212, 359, 357], [368, 212, 480, 357]];
  const META = [['الحج والعمرة', 'boy'], ['وقت العائلة', 'woman'], ['إضافة أو إزالة نظارة', 'man'], ['تصحيح عين مغمضة', 'girl'], ['أول يوم دراسة', 'woman'], ['ليلة حناء', 'woman'], ['تهنئة مولود جديد', 'baby'], ['إطار عيد ميلاد', 'man']];
  const norm = (t) => [Math.round(t[1] * 1000 / 407), Math.round(t[0] * 1000 / 480), Math.round(t[3] * 1000 / 407), Math.round(t[2] * 1000 / 480)];
  const CARDS = { cards: TRUTH.map((t, i) => ({ box: norm(t), title: META[i][0], subject: META[i][1], scene: META[i][0] })) };
  const edited = (cropB64) => { /* «نموذج» يغيّر القصاصة فعلًا (ألوان مقلوبة ومقاس آخر) */
    const s = diff.decodeImage(cropB64); const W = 300, H = 450, p = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (Math.min(s.h - 1, Math.floor(y * s.h / H)) * s.w + Math.min(s.w - 1, Math.floor(x * s.w / W))) * 4, o = (y * W + x) * 4;
      p.data[o] = 255 - s.data[i]; p.data[o + 1] = 40; p.data[o + 2] = 255 - s.data[i + 2]; p.data[o + 3] = 255;
    }
    return PNG.sync.write(p).toString('base64');
  };
  const text = (b) => {
    const parts = b.contents[b.contents.length - 1].parts;
    const t = parts.filter((p) => p.text).map((p) => p.text).join('\n');
    if (/made of several CARDS/.test(t)) return CARDS;
    if (/^Card: "/.test(t)) return { c: parts.filter((p) => p.text && /^CANDIDATE/.test(p.text)).map(() => ({ new_person: true, theme: true, quality: 8 })), pick: 'A' };
    return { verdicts: ['done'], pick: 0, scope: 'big', text: 'ok', report: 'بدّلت الأشخاص في البطاقات الثماني.' };
  };
  const REQ = 'عطني نفس الاسامي وغير الصور بدون تكرار الشخصيات';
  const r = await call({ prompt: REQ, userText: REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'omran' },
    { gStatus: 429, gText: DEPLETED, text, falOut: (b) => edited(/^data:[^;]+;base64,(.+)$/.exec(b.image_urls[0])[1]) });
  assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 300));
  assert.match(r.body.engine, /^cards\[8\/8 pro:8,gpt:0\]/, r.body.engine);
  const f = r.of('fal');
  assert.equal(f.length, 8, 'بطاقة = نداء احتياط واحد');
  assert.ok(f.every((c) => c.url === 'https://fal.run/fal-ai/nano-banana-pro/edit' && c.body.resolution === '1K' && c.body.image_urls.length === 1), 'Pro edit بدقّة البطاقة 1K وقصاصتها وحدها');
  assert.ok(r.of('gimage').every((c) => c.body.generationConfig.imageConfig.imageSize === '1K'));
  assert.equal(r.of('openai').length, 0, 'لا GPT: البطاقة أُنقذت بالنموذج نفسه');
  assert.doesNotMatch(clientText(r.body), FAL_NAMES); /* «gpt:0» في وسم البطاقات للمالك قديم (v-img-cards) */
});

test('٨. الربط في المصدر: الخطّاف داخل proCandidate وproCard ونانو الإنقاذ، والسطر في سقف image-lanes', () => {
  const mi = fs.readFileSync(path.join(root, 'api/_lib/maha-image.js'), 'utf8');
  assert.match(mi, /const falBackup = require\('\.\/fal-fallback\.js'\);/);
  assert.match(mi, /async function geminiNanoBananaImage\(\) \{ if \(__creditOut\) \{ lastNanoErr = 'credit-out'; return null; \}/);
  assert.match(mi, /shouldRetryResponse: function \(r, d\) \{ return \(r\.status === 429 \|\| r\.status >= 500\) && !falBackup\.geminiCreditOut\(r\.status, __gErr\(d\)\); \}/);
  assert.ok(mi.split('\n').length < 905, 'سقف image-lanes.test.cjs');
});

/* مراجعة: العلم قائم وfal رفض ← Gemini يُسأل مرّة (قد يكون عاد) ويقول «خلص» ثانيةً — لا نداء fal ثانٍ في الطلب نفسه (__fbTried)، والمسار القديم
   (GPT) يكمل بخصم واحد بلا ردّ، والحجز عند fal رُدّ */
test('٩. العلم قائم وfal موقوف ← نداء fal واحد فقط، ثمّ GPT كالمسار القديم، والحجز يُردّ', async () => {
  store.clear(); store.set(fb.OUT_KEY, String(Date.now()));
  const r = await call(APPLE, { gStatus: 429, gText: DEPLETED, fal: 'locked', gpt: true });
  assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.of('fal').length, 1, 'لا يُدفع لـfal مرّتين');
  assert.equal(r.of('gimage').length, 1, 'Gemini مرّة بلا إعادة ولا نانو ٢/٢٫٥');
  assert.equal(r.of('openai').length, 1);
  assert.equal(r.body.engine, 'openai');
  assert.equal(r.body.imageBase64, GPT_PNG);
  assert.deepEqual(r.spends, [['sara', 20, 'image']]);
  assert.equal(r.refunds.length, 0);
  assert.equal(spent(), 0, 'fal لم يُنتج = الحجز رُدّ');
  assert.doesNotMatch(clientText(r.body), FAL_NAMES); /* «openai» وسم المسار القديم نفسه (قبل هذا الفرع) */
});

/* مراجعة: حدّ الطلبات الذي يذكر «billing» (owner-loop: «check your plan and billing details») و٥xx الزحام ليسا نفاد رصيد — يُعادان ثلاثًا كما
   كانا (shouldRetryResponse يحفظ الافتراضيّ) ولا fal ولا علم */
test('١٠. ٤٢٩ «check your plan and billing details» و٥٠٣ الزحام ← لا fal ولا علم، والإعادة كما كانت', async () => {
  for (const [st, txt] of [[429, 'You exceeded your current quota, please check your plan and billing details.'], [503, 'The model is overloaded. Please try again later.']]) {
    store.clear();
    const r = await call(APPLE, { gStatus: st, gText: txt });
    assert.equal(r.of('fal').length, 0, st + ': لا صرف عند fal');
    assert.equal(r.of('gimage').filter((c) => c.model === 'gemini-3-pro-image').length, 3, st + ': ثلاث محاولات كما كانت');
    assert.equal(r.of('gimage').filter((c) => c.model !== 'gemini-3-pro-image').length, 3, st + ': نانو ٢/٢٫٥ يُجرَّب كما كان');
    assert.equal(store.get(fb.OUT_KEY), undefined, st + ': لا علم');
    assert.deepEqual(r.refunds, [['sara', 20, PAY]]);
    assert.doesNotMatch(clientText(r.body), FAL_NAMES);
  }
});
