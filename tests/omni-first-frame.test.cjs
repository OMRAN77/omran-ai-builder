// tests/omni-first-frame.test.cjs — v-omni-first-frame (١ أكتوبر ٢٠٢٦).
// المالك بعد قفلَي النصّ (v-video-identity ثمّ <IMAGE_REF_0>): «مافي شي تغيّر نفس الشي — شوف الفرق الشخصيّة» —
// صورة امرأة واقفة كاملة، والمحرّك السينمائيّ أخرج امرأة «من نفس النوع» لا هي. اختار المالك صراحةً «أوّل لقطة بوجهها»:
// أوّل إطار من وصفه بوجهه هو (برو + لقطة وجه)، ثمّ يحرّكه المحرّك. هنا يُشغَّل معالج omni-create الحقيقيّ وخطّ
// الكشف والقصّ والإطار الحقيقيّ (merge-identity + trend-people) بصورة JPEG حقيقيّة، والشبكة وحدها مزيّفة.
'use strict';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jpeg = require('jpeg-js');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const { withIdentityLock, buildTrendPrompt } = require(rp('api/_lib/video-trends.js'));
const TP = require(rp('api/_lib/trend-people.js'));

/* صورة «واقف كامل» اصطناعيّة: خلفيّة متدرّجة ووجه صغير فاتح (١٠٪ من الارتفاع) */
function photo(w, h, face, seed) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const inFace = face && x >= face[0] * w && x < face[2] * w && y >= face[1] * h && y < face[3] * h;
    data[o] = inFace ? 230 : (x * 7 + seed * 40) % 256; data[o + 1] = inFace ? 190 : (y * 5) % 256; data[o + 2] = inFace ? 160 : (seed * 90) % 256; data[o + 3] = 255;
  }
  return jpeg.encode({ width: w, height: h, data }, 90).data.toString('base64');
}
const PHOTO = photo(600, 1000, [0.42, 0.12, 0.58, 0.22], 1);
const FACE_BOX = [120, 420, 220, 580]; /* box_2d [ymin, xmin, ymax, xmax] من ٠ إلى ١٠٠٠ */
const FRAME = Buffer.from('opening-frame-png-'.repeat(6)).toString('base64');
const DESC = 'امرأة تغني أغنية تراثية أمام بيت طين قديم بثوب مطرّز وشيلة حمراء، والكاميرا تقترب ببطء';

/* يشغّل معالج omni-create الحقيقيّ؛ الشبكة تُوجَّه بالعنوان: كشف الوجوه، توليد الإطار، المحرّك. */
async function runOmni(body, opt) {
  const o = Object.assign({ faces: [FACE_BOX], image: 'ok', env: {} }, opt || {});
  TP.FRAME_CACHE.clear(); /* v-video-first-frame: ذاكرة إعادة المحاولة لا تعبر بين حالات الاختبار */
  const calls = [];
  const envKeys = ['GEMINI_API_KEY', 'OMNI_FIRST_FRAME', 'MERGE_FACE_CROPS', 'OMNI_TIMEOUT_MS', 'OMNI_VIDEO_MODEL'];
  const savedEnv = {};
  for (const k of envKeys) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  process.env.GEMINI_API_KEY = 'test-key';
  Object.assign(process.env, o.env);
  const usageP = rp('api/_lib/_videoUsage.js');
  const savedUsage = require.cache[usageP];
  require.cache[usageP] = { id: usageP, filename: usageP, loaded: true, exports: { checkOwnerBypass: async () => ({ allowed: true }) } };
  const hp = rp('api/_lib/omni-create.js');
  delete require.cache[hp];
  const handler = require(hp);
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    const b = JSON.parse(init.body);
    if (u.includes('gemini-flash-latest')) {
      calls.push({ kind: 'detect' });
      if (o.faces === 'throw') throw new Error('detect down');
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: o.faces.map((box) => ({ box_2d: box })) }) }] } }] });
    }
    if (u.includes('gemini-3-pro-image')) {
      calls.push({ kind: 'image', body: b, signal: init.signal });
      if (o.image === 'throw') throw new Error('network down');
      if (o.image === 'fail') return Response.json({ error: { message: 'overloaded' } }, { status: 503 });
      if (o.image === 'blocked') return Response.json({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] });
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: FRAME } }] } }] });
    }
    if (u.endsWith('/interactions')) {
      calls.push({ kind: 'omni', body: b, signal: init.signal });
      return Response.json({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/v1', mime_type: 'video/mp4' }] }] });
    }
    throw new Error('unexpected fetch: ' + u);
  };
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  try { await handler({ method: 'POST', body }, res); }
  finally {
    global.fetch = realFetch;
    delete require.cache[hp];
    if (savedUsage) require.cache[usageP] = savedUsage; else delete require.cache[usageP];
    for (const k of envKeys) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  }
  return { res, calls, kinds: calls.map((c) => c.kind), omni: (calls.find((c) => c.kind === 'omni') || {}).body, image: (calls.find((c) => c.kind === 'image') || {}).body };
}
const FREE = (extra) => Object.assign({ promptText: DESC, ratio: '720:1280', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' }, extra || {});
/* الطلب كما كان قبل هذا الإصلاح حرفيًّا — المسار الاحتياطيّ يجب أن يساويه */
const OLD_BODY = (desc, extra) => Object.assign({
  model: 'gemini-omni-1.1-flash',
  input: [{ type: 'image', data: PHOTO, mime_type: 'image/jpeg' }, { type: 'text', text: withIdentityLock(desc, 1500, 'the reference image <IMAGE_REF_0>') }],
  response_format: { type: 'video', resolution: '720p', aspect_ratio: '9:16', delivery: 'uri' },
  background: false, store: true, stream: false,
}, extra || {});

test('١. صورة + وصف: أوّل إطار بوجهها يُبنى أوّلًا (صورتها + لقطة وجهها)، ثمّ يحرّكه المحرّك ولقطة الوجه مرجع الملامح', async () => {
  const r = await runOmni(FREE());
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  assert.deepEqual(r.kinds, ['detect', 'image', 'omni'], 'الترتيب: كشف الوجه، أوّل الإطار، ثمّ المحرّك');
  // توليد الإطار: برو بحرارة الأمانة، 1K بنسبة الفيديو
  assert.deepEqual(r.image.generationConfig, { temperature: 0.15, imageConfig: { imageSize: '1K', aspectRatio: '9:16' } });
  const parts = r.image.contents[0].parts;
  assert.equal(parts.length, 5, 'عنوان الصورة، الصورة، عنوان اللقطة، اللقطة، المهمّة');
  assert.match(parts[0].text, /^Photo 1 — the user's own photo of the real person to feature:$/);
  assert.equal(parts[1].inlineData.data, PHOTO, 'الصورة الأصليّة كما رفعها');
  assert.equal(parts[2].text, TP.SOLO_CLOSEUP_LABEL);
  const crop = parts[3].inlineData;
  assert.notEqual(crop.data, PHOTO, 'اللقطة ليست الصورة نفسها');
  const cd = jpeg.decode(Buffer.from(crop.data, 'base64'));
  assert.equal(cd.width, cd.height, 'لقطة الوجه مربّعة');
  assert.ok(cd.width >= 100 && cd.width <= 200, 'اللقطة ١٫٥× الوجه من الأصل: ' + cd.width);
  const task = parts[4].text;
  assert.ok(task.includes(DESC), 'وصف المستخدم هو مشهد الإطار');
  assert.match(task, /IDENTITY \(mandatory\): it is this exact same real person/);
  assert.match(task, /the same body shape and size/, 'الجسم أيضًا — المخرَج السابق كان أنحف');
  assert.match(task, /and the close-up of their face/);
  assert.match(task, /Never remove a hijab or headscarf that Photo 1 shows/);
  assert.match(task, /Photorealistic, like a real film still\./);
  // المحرّك: الإطار أوّلًا (Image1)، ولقطة الوجه ثانيًا (Image2)، والأدوار مصرَّح بها أوّل الأمر
  const M = require(rp('api/_lib/omni-create.js'));
  const inp = r.omni.input;
  assert.equal(inp.length, 3);
  assert.deepEqual(inp[0], { type: 'image', data: FRAME, mime_type: 'image/png' });
  assert.deepEqual(inp[1], { type: 'image', data: crop.data, mime_type: 'image/jpeg' });
  assert.equal(inp[2].type, 'text');
  assert.equal(inp[2].text, M.framedPrompt(DESC));
  assert.ok(inp[2].text.startsWith('[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2] MAIN CHARACTER: the real person in the reference image <IMAGE_REF_0>'));
  assert.ok(inp[2].text.includes(DESC));
  assert.ok(inp[2].text.endsWith(M.FRAME_GUIDE));
  assert.match(M.FRAME_GUIDE, /^ Use Image1 as the starting frame\. Use Image2 as a reference for the video generation/, 'إرشاد التوثيق الرسميّ حرفيًّا');
  assert.deepEqual(r.omni.response_format, { type: 'video', resolution: '720p', aspect_ratio: '9:16', delivery: 'uri' });
  // الإطار لا يخرج للعميل أبدًا (لا مولّد صور مجّانيّ) — الردّ رابط الفيديو وحده
  assert.deepEqual(Object.keys(r.res.body), ['url']);
  assert.match(r.res.body.url, /^\/api\/video\?action=veo-download&uri=/);
  assert.ok(!JSON.stringify(r.res.body).includes(FRAME));
});

test('٢. وصف طويل جدًّا: الأمر ≤ ١٥٠٠ دائمًا — التصريح أوّلًا وقفل الهويّة ثمّ إرشاد الأدوار آخرًا، ويُقصّ الوصف وحده', () => {
  const M = require(rp('api/_lib/omni-create.js'));
  const long = 'تمشي في سوق قديم بين الدكاكين والناس '.repeat(120);
  const p = M.framedPrompt(long);
  assert.ok(p.length <= 1500, 'تجاوز حدّ المحرّك: ' + p.length);
  assert.ok(p.startsWith(M.FRAME_DECL));
  assert.match(p, /IDENTITY \(mandatory\)[^]*recognize them instantly\. Use Image1 as the starting frame\./);
  assert.ok(p.endsWith(M.FRAME_GUIDE));
  assert.ok(p.includes(long.trim().slice(0, 400)), 'الوصف يبقى ما اتّسع الحدّ');
  // وفي الإطار نفسه: الوصف حتّى ٩٠٠ حرف، والمهمّة كاملة بعده
  const t = TP.soloFrameTask(long, { closeup: true });
  assert.ok(t.includes(long.trim().slice(0, 900)) && !t.includes(long.trim().slice(0, 901)));
  assert.match(t, /No text, captions, logos or watermarks\.$/);
});

test('٣. أيّ عطب في أوّل الإطار (فشل، حجب، انقطاع، إطفاء) = الطلب السابق حرفيًّا — الفيديو لا يفشل بسببه', async () => {
  for (const image of ['fail', 'blocked', 'throw']) {
    const r = await runOmni(FREE(), { image });
    assert.equal(r.res.code, 200, image + ': ' + JSON.stringify(r.res.body));
    assert.deepEqual(r.kinds, ['detect', 'image', 'omni'], image);
    assert.deepEqual(r.omni, OLD_BODY(DESC), image + ': المسار الاحتياطيّ ليس الطلب السابق');
  }
  const off = await runOmni(FREE(), { env: { OMNI_FIRST_FRAME: 'off' } });
  assert.deepEqual(off.kinds, ['omni'], 'OMNI_FIRST_FRAME=off: لا كشف ولا توليد');
  assert.deepEqual(off.omni, OLD_BODY(DESC));
  // عطب الكشف وحده لا يوقف الإطار: يُبنى بالصورة وحدها
  const nod = await runOmni(FREE(), { faces: 'throw' });
  assert.deepEqual(nod.kinds, ['detect', 'image', 'omni']);
  assert.equal(nod.omni.input[0].data, FRAME);
});

test('٤. بلا وجه مكشوف أو بوجهين: إطار بلا لقطة، ومرجع الملامح الصورةُ نفسها', async () => {
  for (const faces of [[], [FACE_BOX, [120, 100, 220, 260]]]) {
    const r = await runOmni(FREE(), { faces });
    const parts = r.image.contents[0].parts;
    assert.equal(parts.length, 3, 'عنوان الصورة، الصورة، المهمّة — لقطة أحد وجهين تسحب ملامحه إلى الآخر');
    assert.doesNotMatch(parts[2].text, /close-up/);
    assert.deepEqual(r.omni.input[0], { type: 'image', data: FRAME, mime_type: 'image/png' });
    assert.deepEqual(r.omni.input[1], { type: 'image', data: PHOTO, mime_type: 'image/jpeg' });
  }
});

test('٥. بلا صورة، أو ترند: لا كشف ولا توليد صورة — الطلب كما كان', async () => {
  const plain = await runOmni({ promptText: 'غروب فوق البحر وطيور تطير', ratio: '1280:720', token: 't' });
  assert.deepEqual(plain.kinds, ['omni']);
  assert.deepEqual(plain.omni.input, [{ type: 'text', text: 'غروب فوق البحر وطيور تطير' }]);
  assert.equal(plain.omni.response_format.aspect_ratio, '16:9');
  const tr = await runOmni({ trend: 'dance', params: {}, ratio: '720:1280', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' });
  assert.deepEqual(tr.kinds, ['omni'], 'الترندات على مسارها (لا تصل هذا المحرّك من الواجهة أصلًا)');
  assert.equal(tr.omni.input[0].data, PHOTO);
  assert.equal(tr.omni.input[1].text, buildTrendPrompt('dance', { hasImage: true }).prompt.trim().slice(0, 1500));
});

test('٦. أسلوب فنّيّ صريح في الوصف: الإطار بذلك الأسلوب وحرارته — و«كرتونة» و«واقعي» ليسا أسلوبًا', async () => {
  const r = await runOmni(FREE({ promptText: 'حوّلني أنمي وأنا أرقص في حديقة' }));
  assert.equal(r.image.generationConfig.temperature, 0.6);
  const task = r.image.contents[0].parts.slice(-1)[0].text;
  assert.match(task, /Use the art style the description asks for, drawing their own real features in that style\./);
  assert.doesNotMatch(task, /Photorealistic/);
  for (const s of ['بأسلوب كرتوني', 'بالكرتون', 'anime style', 'مثل بيكسار']) assert.ok(TP.ART_STYLE_RE.test(s), s);
  for (const s of ['يفتح كرتونة هدايا', 'واقعي في السوق', 'يمشي في ديزني لاند', DESC]) assert.ok(!TP.ART_STYLE_RE.test(s), s);
});

test('٧. الوقت: أوّل الإطار ≤ ٩٠ث، والمحرّك ما بقي داخل حدّ الدالّة (٣٠٠ث) — لا قتل قبل الاسترجاع', async () => {
  const M = require(rp('api/_lib/omni-create.js'));
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(M.FN_MAX_MS, vercel.functions['api/*.js'].maxDuration * 1000, 'FN_MAX_MS يطابق maxDuration');
  assert.equal(M.omniTimeoutFor(500, 270000), 270000, 'بلا إطار: المهلة كما كانت');
  const worst = M.FRAME_BUDGET_MS + 3000;
  assert.ok(worst + M.omniTimeoutFor(worst, 270000) <= M.FN_MAX_MS - M.OMNI_MARGIN_MS, 'أسوأ حالة تتجاوز حدّ الدالّة');
  assert.ok(M.omniTimeoutFor(worst, 270000) >= 180000, 'المحرّك يبقى له ٣ دقائق على الأقلّ');
  // الإطار يأخذ مهلته من الميزانيّة المتبقّية، وميزانيّة لا تتّسع لتوليد = لا نداء أصلًا
  const seen = [];
  TP.FRAME_CACHE.clear();
  const fake = async (k, parts, aspect, f, cfg) => { seen.push(cfg); return { b64: 'F', mime: 'image/png' }; };
  const ok = await TP.soloFirstFrame('K', { data: PHOTO, mime: 'image/jpeg' }, 'x', '720:1280', { budgetMs: 90000, faceCrops: async () => [], callImage: fake });
  assert.equal(ok.b64, 'F');
  assert.ok(seen[0].timeoutMs <= 90000 && seen[0].timeoutMs > 80000, String(seen[0].timeoutMs));
  assert.equal(seen[0].imageSize, '1K');
  assert.equal(seen[0].tag, 'solo');
  TP.FRAME_CACHE.clear();
  const tight = await TP.soloFirstFrame('K', { data: PHOTO }, 'x', '720:1280', { budgetMs: 15000, faceCrops: async () => [], callImage: fake });
  assert.deepEqual(tight, { error: 'budget' });
  assert.equal(seen.length, 1, 'لا توليد بميزانيّة لا تتّسع له');
  // نداء المحرّك يحمل مهلته الخاصّة (حارس الـ٣٠ث العامّ يقطع كلّ نداء بلا signal)
  const r = await runOmni(FREE());
  assert.ok(r.calls.find((c) => c.kind === 'omni').signal instanceof AbortSignal);
  assert.ok(r.calls.find((c) => c.kind === 'image').signal instanceof AbortSignal);
});

test('٨. إطار ترند الأشخاص (Veo) على إعداداته حرفيًّا: ٠٫١٥ و2K', async () => {
  let cfg = null;
  const fetchImpl = async (u, init) => { cfg = JSON.parse(init.body).generationConfig; return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'G' } }] } }] }); };
  const out = await TP.groupFirstFrame('K', [{ data: PHOTO, mime: 'image/jpeg' }, { data: PHOTO, mime: 'image/jpeg' }], 'مشهد', '1280:720', { faceCrops: async () => [], fetchImpl });
  assert.equal(out.b64, 'G');
  assert.deepEqual(cfg, { temperature: 0.15, imageConfig: { imageSize: '2K', aspectRatio: '16:9' } });
});
