// tests/video-first-frame.test.cjs — v-video-first-frame + v-trends-top (١ أكتوبر ٢٠٢٦).
// المالك بعد #853: لقطتا خطأ (الاقتصاديّ «insufficient balance»، وفلتر جوجل للأشخاص الحقيقيّين)، و«الترندات ما تطلع
// الشخصيّة»، و«لو تخلي الفيديو تحت والترندات فوق أفضل»، وفيديو أنمي ٣٫٩ث (مقدّمة + إطار واحد + خاتمة): «الأنمي والكرتون
// ما يتحوّل». ثمّ اختار «كل الفيديوات» لأوّل لقطة بوجهها. هنا تُشغَّل معالجات Runway والاقتصاديّ وVeo والسينمائيّ الحقيقيّة
// وخطّ الكشف والقصّ والإطار الحقيقيّ بصورة JPEG حقيقيّة، والشبكة وحدها مزيّفة؛ وتُفحص الواجهة من مصدرها.
'use strict';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jpeg = require('jpeg-js');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const TP = require(rp('api/_lib/trend-people.js'));
const { withIdentityLock, buildTrendPrompt, TRENDS } = require(rp('api/_lib/video-trends.js'));

function photo(w, h, face, seed) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const inFace = face && x >= face[0] * w && x < face[2] * w && y >= face[1] * h && y < face[3] * h;
    data[o] = inFace ? 230 : (x * 7 + seed * 40) % 256; data[o + 1] = inFace ? 190 : (y * 5) % 256; data[o + 2] = inFace ? 160 : (seed * 90) % 256; data[o + 3] = 255;
  }
  return jpeg.encode({ width: w, height: h, data }, 90).data.toString('base64');
}
const PHOTO = photo(600, 1000, [0.42, 0.12, 0.58, 0.22], 2);
const FACE_BOX = [120, 420, 220, 580];
const FRAME = Buffer.from('drawn-opening-frame-'.repeat(6)).toString('base64');
const DESC = 'امرأة تغني أمام بيت طين قديم بثوب مطرّز وشيلة حمراء';

const owner = { checkOwnerBypass: async () => ({ allowed: true }), checkVideoQuota: async () => ({ allowed: true, username: 'omran' }), consumeVideo: async () => 3 };
const noJob = { rememberVideoJob: async () => true, settleVideoJob: async () => null };
const runwayKeys = { pickKey: () => ({ key: 'rk', index: 0 }), encodeTaskId: (i, id) => i + ':' + id, clearStuckTask: async () => {}, saveLastTask: async () => {}, RUNWAY_API_BASE: 'https://runway.test' };
const ownerPoints = { isOwnerUsername: () => true, COSTS: { runway_video: 55 } };

/* يشغّل معالجًا حقيقيًّا بتبعيّات مستبدَلة؛ الشبكة تُوجَّه بالعنوان. */
async function run(modRel, body, opt) {
  const o = Object.assign({ faces: [FACE_BOX], image: 'ok', env: {}, stubs: {} }, opt || {});
  TP.FRAME_CACHE.clear();
  const envKeys = ['GEMINI_API_KEY', 'MINIMAX_API_KEY', 'VIDEO_FIRST_FRAME', 'OMNI_FIRST_FRAME', 'MERGE_FACE_CROPS', 'RUNWAY_MODEL'];
  const savedEnv = {};
  for (const k of envKeys) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, { GEMINI_API_KEY: 'gk', MINIMAX_API_KEY: 'mk' }, o.env);
  for (const [k, v] of Object.entries(o.env)) if (v === undefined) delete process.env[k];
  const stubs = Object.assign({ 'api/_lib/_videoUsage.js': owner, 'api/_lib/video-job.js': noJob, 'api/_lib/runway-keys.js': runwayKeys, 'api/_lib/points.js': ownerPoints }, o.stubs);
  const saved = {};
  for (const [rel, exp] of Object.entries(stubs)) { const p = rp(rel); saved[p] = require.cache[p]; require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; }
  const hp = rp(modRel); delete require.cache[hp];
  const vp = rp('api/_lib/veo-create.js'); const savedVeo = require.cache[vp]; if (modRel !== 'api/_lib/veo-create.js') delete require.cache[vp];
  const handler = require(hp);
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    const b = init && init.body ? JSON.parse(init.body) : null;
    if (u.includes('gemini-flash-latest')) { calls.push({ kind: 'detect' }); return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: o.faces.map((box) => ({ box_2d: box })) }) }] } }] }); }
    if (u.includes('gemini-3-pro-image')) {
      calls.push({ kind: 'image', body: b });
      if (o.image === 'fail') return Response.json({ error: { message: 'overloaded' } }, { status: 503 });
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: FRAME } }] } }] });
    }
    if (u.startsWith('https://runway.test/')) { calls.push({ kind: 'runway', url: u, body: b }); return Response.json({ id: 'task1' }); }
    if (u.includes('/v1/video_generation')) { calls.push({ kind: 'minimax', body: b }); return Response.json({ task_id: 'm1', base_resp: { status_code: 0 } }); }
    if (u.includes(':predictLongRunning')) { calls.push({ kind: 'veo', body: b }); return Response.json({ name: 'op/1' }); }
    if (u.endsWith('/interactions')) { calls.push({ kind: 'omni', body: b }); return Response.json({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://x/v' }] }] }); }
    throw new Error('unexpected fetch: ' + u);
  };
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  try { await handler({ method: 'POST', body }, res); }
  finally {
    global.fetch = realFetch;
    delete require.cache[hp];
    if (modRel !== 'api/_lib/veo-create.js') { if (savedVeo) require.cache[vp] = savedVeo; else delete require.cache[vp]; }
    for (const [p, v] of Object.entries(saved)) { if (v) require.cache[p] = v; else delete require.cache[p]; }
    for (const k of envKeys) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  }
  const of = (k) => calls.filter((c) => c.kind === k);
  return { res, calls, kinds: calls.map((c) => c.kind), of, image: (of('image')[0] || {}).body };
}
const taskOf = (img) => img.contents[0].parts.slice(-1)[0].text;

test('١. «فيديو AI» (Runway) مع صورة: أوّل إطار بوجهها في المشهد يصير الصورة الأولى، والمرساة «الإطار جاهز — حرّكه»', async () => {
  const V = require(rp('api/_lib/video-create.js'));
  const r = await run('api/_lib/video-create.js', { promptText: DESC, ratio: '720:1280', style: 'realistic', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' });
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  assert.deepEqual(r.kinds, ['detect', 'image', 'runway']);
  assert.deepEqual(r.image.generationConfig, { temperature: 0.15, imageConfig: { imageSize: '1K', aspectRatio: '9:16' } }, 'بنسبة الفيديو نفسها فلا قصّ');
  assert.ok(taskOf(r.image).includes(DESC));
  const rw = r.of('runway')[0];
  assert.match(rw.url, /\/v1\/image_to_video$/);
  assert.equal(rw.body.promptImage, 'data:image/png;base64,' + FRAME, 'الإطار المرسوم هو الصورة الأولى');
  assert.equal(rw.body.ratio, '720:1280');
  assert.equal(rw.body.promptText, V.buildRunwayPrompt(DESC, 'realistic', true, true));
  assert.match(rw.body.promptText, /^The opening frame already shows the real person from the user's photo in this scene\./);
  assert.ok(rw.body.promptText.length <= 1000);
  assert.ok(!JSON.stringify(r.res.body).includes(FRAME), 'الإطار لا يخرج للعميل');
});

test('٢. الأنمي/الكرتون مع صورة: الإطار نفسه يُرسم أنمي (حرارة الأسلوب) والمرساة بالأسلوب — كانت صورة حقيقيّة لا تتحوّل', async () => {
  const V = require(rp('api/_lib/video-create.js'));
  const r = await run('api/_lib/video-create.js', { promptText: DESC, ratio: '1280:720', style: 'anime', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' });
  assert.equal(r.image.generationConfig.temperature, 0.6);
  assert.equal(r.image.generationConfig.imageConfig.aspectRatio, '16:9');
  assert.ok(taskOf(r.image).includes(TP.ANIME_FRAME_STYLE));
  assert.doesNotMatch(taskOf(r.image), /Photorealistic/);
  const rw = r.of('runway')[0];
  assert.equal(rw.body.promptText, V.buildRunwayPrompt(DESC, 'anime', true, true));
  assert.match(rw.body.promptText, /^The opening frame already shows the real person from the user's photo, drawn in the style below\./);
  assert.match(rw.body.promptText, /2D anime cartoon animation/);
});

test('٣. Runway: «حرّكها» وحدها (keepPhoto)، والإطفاء، وبلا مفتاح الصور، وعطب الإطار = الصورة نفسها والأمر السابق حرفيًّا', async () => {
  const V = require(rp('api/_lib/video-create.js'));
  const body = { promptText: DESC, ratio: '720:1280', style: 'realistic', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' };
  const old = V.buildRunwayPrompt(DESC, 'realistic', true);
  for (const [name, b, o] of [
    ['keepPhoto', Object.assign({}, body, { keepPhoto: true }), {}],
    ['off', body, { env: { VIDEO_FIRST_FRAME: 'off' } }],
    ['no key', body, { env: { GEMINI_API_KEY: undefined } }],
  ]) {
    const r = await run('api/_lib/video-create.js', b, o);
    assert.deepEqual(r.kinds, ['runway'], name + ': لا كشف ولا توليد');
    assert.equal(r.of('runway')[0].body.promptImage, 'data:image/jpeg;base64,' + PHOTO, name);
    assert.equal(r.of('runway')[0].body.promptText, old, name);
  }
  const fail = await run('api/_lib/video-create.js', body, { image: 'fail' });
  assert.deepEqual(fail.kinds, ['detect', 'image', 'runway']);
  assert.equal(fail.of('runway')[0].body.promptImage, 'data:image/jpeg;base64,' + PHOTO, 'عطب الإطار: الصورة نفسها');
  assert.equal(fail.of('runway')[0].body.promptText, old);
  assert.equal(fail.res.code, 200, 'لا يفشل الفيديو بسبب الإطار');
});

test('٤. إعادة المحاولة لا تدفع الإطار مرّتين: النسخة الدافئة تعيد الإطار نفسه، ووصف آخر = إطار جديد', async () => {
  TP.FRAME_CACHE.clear();
  let n = 0;
  const fake = async () => { n++; return { b64: 'F' + n, mime: 'image/png' }; };
  const o = { budgetMs: 90000, faceCrops: async () => [], callImage: fake };
  const a = await TP.soloFirstFrame('K', { data: PHOTO }, DESC, '720:1280', o);
  const b = await TP.soloFirstFrame('K', { data: PHOTO }, DESC, '720:1280', o);
  assert.equal(n, 1); assert.equal(b.b64, a.b64); assert.ok(b.cached);
  const c = await TP.soloFirstFrame('K', { data: PHOTO }, DESC + ' ليلًا', '720:1280', o);
  assert.equal(n, 2); assert.notEqual(c.b64, a.b64);
  const d = await TP.soloFirstFrame('K', { data: PHOTO }, DESC, '720:1280', Object.assign({ style: 'anime' }, o));
  assert.equal(n, 3, 'الأسلوب جزء من المفتاح');
  for (let i = 0; i < 6; i++) await TP.soloFirstFrame('K', { data: PHOTO }, 'w' + i, '720:1280', o);
  assert.ok(TP.FRAME_CACHE.size <= 4, 'أربعة مداخل على الأكثر');
  TP.FRAME_CACHE.clear();
});

test('٥. الاقتصاديّ مع صورة: أوّل الإطار صورته الأولى، والأمر بقفل الهويّة ثمّ «الإطار جاهز» ≤ ١٥٠٠ — والأسلوب يصل', async () => {
  const long = (DESC + ' ').repeat(40);
  const r = await run('api/_lib/minimax-create.js', { promptText: long, ratio: '720:1280', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' });
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  assert.deepEqual(r.kinds, ['detect', 'image', 'minimax']);
  const mm = r.of('minimax')[0].body;
  assert.equal(mm.first_frame_image, 'data:image/png;base64,' + FRAME);
  assert.ok(mm.prompt.length <= 1500, String(mm.prompt.length));
  assert.match(mm.prompt, /^MAIN CHARACTER: the real person in the attached reference photo/);
  assert.ok(mm.prompt.endsWith(TP.FRAME_LOCK.trim()), 'قفل «حرّك الإطار كما هو» آخرًا ولا يُقصّ');
  // الأنمي: الإطار أنمي، وسطر الأسلوب داخل الأمر
  const a = await run('api/_lib/minimax-create.js', { promptText: DESC, ratio: '720:1280', token: 't', style: 'anime', imageBase64: PHOTO, imageMime: 'image/jpeg' });
  assert.ok(taskOf(a.image).includes(TP.ANIME_FRAME_STYLE));
  assert.ok(a.of('minimax')[0].body.prompt.includes(TP.STYLE_ANIME_VIDEO.trim()));
  // بلا صورة: الأنمي بادئة للوصف (كان لا يصل أصلًا)، والواقعيّ كما كان حرفيًّا
  const t = await run('api/_lib/minimax-create.js', { promptText: 'قطّة تلعب في حديقة', token: 't', style: 'anime' });
  assert.deepEqual(t.kinds, ['minimax']);
  assert.equal(t.of('minimax')[0].body.prompt, TP.STYLE_ANIME_VIDEO + 'قطّة تلعب في حديقة');
  const real = await run('api/_lib/minimax-create.js', { promptText: 'قطّة تلعب في حديقة', token: 't', style: 'realistic' });
  assert.equal(real.of('minimax')[0].body.prompt, 'قطّة تلعب في حديقة');
  // العطب: الصورة نفسها والأمر السابق حرفيًّا
  const f = await run('api/_lib/minimax-create.js', { promptText: DESC, token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' }, { image: 'fail' });
  assert.equal(f.of('minimax')[0].body.first_frame_image, 'data:image/jpeg;base64,' + PHOTO);
  assert.equal(f.of('minimax')[0].body.prompt, withIdentityLock(DESC, 1500));
});

test('٦. Veo (الوصف الحرّ والممثّل) مع صورة: أوّل الإطار صورته الأولى والقفل آخرًا؛ والشخصيّة الكرتونيّة الجاهزة (keepPhoto) كما هي', async () => {
  const { VEO_FREE_IMAGE_MAX, FRAME_LOCK } = require(rp('api/_lib/veo-create.js'));
  assert.equal(FRAME_LOCK, TP.FRAME_LOCK, 'نصّ القفل واحد لكلّ المحرّكات');
  const long = 'رجل يتكلم في مجلس عربي قديم ويشرح القهوة '.repeat(60);
  const r = await run('api/_lib/veo-create.js', { promptText: long, ratio: '720:1280', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' });
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  assert.deepEqual(r.kinds, ['detect', 'image', 'veo']);
  const inst = r.of('veo')[0].body.instances[0];
  assert.equal(inst.image.bytesBase64Encoded, FRAME);
  assert.ok(inst.prompt.endsWith(FRAME_LOCK.trim()), 'القفل لا يُقصّ');
  assert.ok(inst.prompt.length <= VEO_FREE_IMAGE_MAX + FRAME_LOCK.length);
  assert.ok(inst.prompt.startsWith(withIdentityLock(long, VEO_FREE_IMAGE_MAX).slice(0, 300)), 'الأمر الأساسيّ كما كان قبل القفل');
  const k = await run('api/_lib/veo-create.js', { promptText: 'A cute chibi 3D cartoon character talking. Keep the character exactly as in the provided image.', ratio: '720:1280', token: 't', imageBase64: PHOTO, imageMime: 'image/png', keepPhoto: true });
  assert.deepEqual(k.kinds, ['veo'], 'لا إطار فوق الشخصيّة الجاهزة');
  assert.equal(k.of('veo')[0].body.instances[0].image.bytesBase64Encoded, PHOTO);
});

test('٧. ترندات الشخص الواحد: أوّل إطار من مشهد القالب وحده (لا فقرة WHO THEY ARE)، والقفل آخرًا داخل ٢٦٠٠ — والمنتجات والأماكن و«حرّك الصورة» كما كانت', async () => {
  const { VEO_PROMPT_MAX, FRAME_LOCK } = require(rp('api/_lib/veo-create.js'));
  const r = await run('api/_lib/veo-create.js', { trend: 'dance', params: { extra: 'ا'.repeat(400) }, token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' });
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  assert.deepEqual(r.kinds, ['detect', 'image', 'veo']);
  const task = taskOf(r.image);
  assert.match(task, /performs an energetic trendy dance routine/, 'مشهد القالب');
  assert.doesNotMatch(task, /WHO THEY ARE/, 'فقرة الهويّة ليست مشهدًا');
  const inst = r.of('veo')[0].body.instances[0];
  assert.equal(inst.image.bytesBase64Encoded, FRAME);
  assert.ok(inst.prompt.length <= VEO_PROMPT_MAX && inst.prompt.endsWith(FRAME_LOCK.trim()), 'القفل داخل الحدّ: ' + inst.prompt.length);
  // قالب بأسلوب فنّيّ: الإطار بأسلوب القالب وحرارته
  const lego = await run('api/_lib/veo-create.js', { trend: 'legofy', params: {}, token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' });
  assert.equal(lego.image.generationConfig.temperature, 0.6);
  assert.match(taskOf(lego.image), /LEGO minifigure/);
  assert.match(taskOf(lego.image), /Use the art style the description asks for/);
  // خارج القائمة: لا نداء صورة، والصورة نفسها أوّل إطار
  for (const k of ['productad', 'oldphoto', 'familywave', 'babyversion', 'outfitswap', 'superhero', 'talkingpet', 'pixarstory']) {
    const x = await run('api/_lib/veo-create.js', { trend: k, params: { text: 'س', name: 'س' }, token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' });
    assert.deepEqual(x.kinds, ['veo'], k + ': لا إطار');
    assert.equal(x.of('veo')[0].body.instances[0].image.bytesBase64Encoded, PHOTO, k);
  }
});

test('٨. قائمة ترندات الإطار: كلّها ترندات موجودة لشخص بعمره ومظهره — لا منتج ولا مكان ولا تحوّل عمر أو لبس', () => {
  for (const k of TP.SOLO_FRAME_TRENDS) {
    assert.ok(TRENDS[k], 'ترند غير موجود: ' + k);
    const scene = TP.trendScene(buildTrendPrompt(k, { hasImage: true, text: 'س', name: 'س' }).prompt);
    assert.match(scene, /person|couple|people/i, k + ': ليس ترند شخص');
    assert.doesNotMatch(scene, /exact product|product from the reference|exact vehicle|exact property|\btoddler\b|\baging\b|\byounger\b|future self|outfit changes|clothing transforms/i, k);
  }
  for (const k of TP.SOLO_FRAME_ART_TRENDS) assert.ok(TP.SOLO_FRAME_TRENDS.has(k));
  assert.ok(TP.trendScene(buildTrendPrompt('heritagesing', { hasImage: true, text: 'يا هلا' }).prompt).startsWith('Photorealistic cinematic video'));
});

test('٩. السينمائيّ: الأنمي يصل — الإطار أنمي والأمر يحمل سطر الأسلوب؛ وبلا صورة بادئة للوصف', async () => {
  const M = require(rp('api/_lib/omni-create.js'));
  const r = await run('api/_lib/omni-create.js', { promptText: DESC, ratio: '720:1280', token: 't', style: 'anime', imageBase64: PHOTO, imageMime: 'image/jpeg' });
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  assert.ok(taskOf(r.image).includes(TP.ANIME_FRAME_STYLE));
  const txt = r.of('omni')[0].body.input.slice(-1)[0].text;
  assert.equal(txt, M.framedPrompt(TP.STYLE_ANIME_VIDEO + DESC));
  const t = await run('api/_lib/omni-create.js', { promptText: 'قطّة تلعب', token: 't', style: 'anime' });
  assert.deepEqual(t.of('omni')[0].body.input, [{ type: 'text', text: TP.STYLE_ANIME_VIDEO + 'قطّة تلعب' }]);
  const k = await run('api/_lib/omni-create.js', { promptText: DESC, token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg', keepPhoto: true });
  assert.deepEqual(k.kinds, ['omni'], 'keepPhoto: لا إطار');
  const off = await run('api/_lib/omni-create.js', { promptText: DESC, token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' }, { env: { VIDEO_FIRST_FRAME: 'off' } });
  assert.deepEqual(off.kinds, ['omni'], 'VIDEO_FIRST_FRAME=off يوقفه هنا أيضًا');
});

test('١٠. الواجهة: التوقيع لا يقصّ الفيديو، والأسلوب يصل كلّ محرّك، و«حرّكها» وحدها والكرتونيّة الجاهزة تبقى صورتها', () => {
  const V = read('js/app-11-video.js');
  assert.match(V, /'-filter_complex', 'overlay=0:H-h', '-c:a', 'copy', 'main_wm\.mp4'/, 'أمر التوقيع بلا shortest');
  assert.doesNotMatch(V, /'overlay=[^']*shortest=1/, 'shortest=1 مع صورة ثابتة يقصّ الفيديو إلى إطار واحد (قيس: ١٢٠ ← ١)');
  assert.match(V, /quality: wantQuality \? 'high' : 'fast', style \}; \/\* v-video-first-frame: الأسلوب كان لا يصل \*\/\n\s+if\(filmHeroBase64\)[^\n]*\n\s+const cr = await \(window\.postWithConfirm\n\s+\? window\.postWithConfirm\('\/api\/video\?action=omni-create'/);
  assert.match(V, /quality: wantQuality \? 'high' : 'fast', style \}; \/\* v-video-first-frame: الأسلوب كان لا يصل \*\/\n\s+if\(filmHeroBase64\)[^\n]*\n\s+const cr = await \(window\.postWithConfirm\n\s+\? window\.postWithConfirm\('\/api\/video\?action=minimax-create'/);
  assert.match(V, /const veoPayload = \{ promptText: veoPrompt, ratio, token, quality: wantQuality \? 'high' : 'fast', style \};/);
  assert.match(V, /async function createVeoScene\([^)]*\)\{\n\s+const payload = \{[^}]*style: styleEl\.value \};/);
  const A = read('js/app-09-attach.js');
  assert.match(A, /imageBase64: __cartoonB64, imageMime: __cartoonMime, keepPhoto: true \};/);
  const m = /const __ANIM_ONLY_RE = (\/[^\n]+\/i);/.exec(A);
  assert.ok(m, 'مِرشِّح «حرّكها وحدها»');
  const re = vm.runInNewContext(m[1]);
  const keep = (t) => String(t || '').split(/[\s،,.!؟?()"'«»:؛\-]+/).filter(Boolean).every((w) => re.test(w));
  for (const t of ['حرّكها', 'حركها', 'سوي فيديو من الصورة', 'حركها لو سمحت', 'animate this photo']) assert.ok(keep(t), t + ' = الصورة كما هي');
  for (const t of ['حرّكها وهي ترقص في السوق', 'سوي فيديو وهي تمشي في السوق', 'حركه بالبحر']) assert.ok(!keep(t), t + ' = مشهد ⇒ إطار');
  assert.match(A, /__vp\.keepPhoto = String\(text \|\| ''\)\.split\(/);
});

test('١١. الترندات فوق والصانع تحتها: الوصف بوسمه لا بموضعه، وصندوق الترندات تحت الرأس في كلّ فتح، والنافذة تُمرَّر', () => {
  const J = read('js/video.js');
  assert.match(J, /desc=card\.querySelector\('\[data-i18n="videoMakerDesc"\]'\)/, 'الوصف بوسمه');
  assert.doesNotMatch(J, /desc=kids\[1\]/, 'الابن الثاني كان صندوق الترندات حين يُبنى أوّلًا');
  assert.match(J, /kids\.slice\(1\)\.forEach\(function\(k\)\{ if\(k!==vt\) main\.appendChild\(k\); \}\);/);
  assert.match(J, /function trendsTop\(\)\{[^]*card\.classList\.add\('vmk-trends-top'\);[^]*card\.insertBefore\(vt,side\);/);
  assert.match(J, /function enhance\(\)\{ if\(!on\(\)\) return; build\(\); trendsTop\(\);/);
  const C = read('css/modules.css');
  assert.match(C, /#videoMakerModal \.vmk-studio>#vtRoot\{grid-column:1\/-1;/);
  assert.match(C, /#videoMakerModal \.vmk-studio\.vmk-trends-top\{overflow-y:auto;/);
  assert.match(C, /#videoMakerModal \.vmk-studio\.vmk-trends-top \.vmk-main\{max-height:none;overflow:visible\}/);
  const H = read('index.html');
  assert.ok(H.includes('src="/js/video.js?v=435"'), 'وسم video.js رُفع');
  assert.ok(Number((H.match(/css\/modules\.css\?v=(\d+)/) || [])[1]) >= 663, 'وسم modules رُفع');
  // تشغيل build الحقيقيّ على بطاقة مصغّرة: الترندات بُنيت قبل الاستوديو (الترتيب الذي أنزلها للأسفل)
  const el = (id, cls) => ({ id: id || '', className: cls || '', classList: { _s: new Set((cls || '').split(' ').filter(Boolean)), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } }, children: [], parentElement: null, dataset: {}, style: { setProperty() {} }, attrs: {}, getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; } });
  const card = el('', ''); const header = el('hdr'); const vt = el('vtRoot'); const desc = el('desc'); desc.attrs['data-i18n'] = 'videoMakerDesc'; const prompt = el('videoMakerPrompt');
  const all = { vtRoot: vt, videoMakerPrompt: prompt };
  const kidsOf = (p) => p.children;
  const append = (p, c) => { if (c.parentElement) { const a = c.parentElement.children; a.splice(a.indexOf(c), 1); } p.children.push(c); c.parentElement = p; };
  const insertBefore = (p, c, ref) => { if (c.parentElement) { const a = c.parentElement.children; a.splice(a.indexOf(c), 1); } const i = p.children.indexOf(ref); p.children.splice(i < 0 ? p.children.length : i, 0, c); c.parentElement = p; };
  [header, vt, desc, prompt].forEach((k) => append(card, k));
  const wire = (n) => {
    n.appendChild = (c) => append(n, c); n.insertBefore = (c, ref) => insertBefore(n, c, ref);
    n.querySelector = (sel) => { const walk = (x) => { for (const c of x.children) { if ((sel === '[data-i18n="videoMakerDesc"]' && c.attrs['data-i18n'] === 'videoMakerDesc') || (sel === '.vmk-side' && c.className === 'vmk-side') || (sel === '.vmk-stage' && c.className === 'vmk-stage') || (sel === '.vmk-chips' && c.className === 'vmk-chips')) return c; const r = walk(c); if (r) return r; } return null; }; return walk(n); };
    Object.defineProperty(n, 'firstElementChild', { get() { return n.children[0] || null; } });
    Object.defineProperty(n, 'nextElementSibling', { get() { const p = n.parentElement; if (!p) return null; return p.children[p.children.indexOf(n) + 1] || null; } });
    Object.defineProperty(n, 'innerHTML', { set(v) { if (/vmk-stage/.test(v)) { const st = el('', 'vmk-stage'); wire(st); st.querySelector = () => null; append(n, st); const ch = el('', 'vmk-chips'); wire(ch); append(n, ch); } }, get() { return ''; } });
    n.closest = () => null;
  };
  [card, header, vt, desc, prompt].forEach(wire);
  const modal = el('videoMakerModal'); wire(modal); append(modal, card);
  const doc = {
    getElementById: (id) => (id === 'videoMakerModal' ? modal : (all[id] || null)),
    createElement: () => { const n = el(); wire(n); return n; },
    documentElement: { lang: 'ar', dir: 'rtl' },
  };
  const ctx = { document: doc, window: {}, MutationObserver: function () { this.observe = () => {}; }, Event: function () {} };
  ctx.window = ctx;
  modal.style.display = 'flex';
  vm.runInNewContext(J.replace(/new MutationObserver\(function\(\)\{ if\(M\.style\.display&&M\.style\.display!=='none'\) enhance\(\); \}\)/, 'window.__enhance=enhance; new MutationObserver(function(){})'), ctx);
  ctx.__enhance();
  const order = card.children.map((c) => c.id || c.className);
  assert.deepEqual(order.slice(0, 4), ['hdr', 'vtRoot', 'vmk-side', 'vmk-main'], 'الترتيب: الرأس ثمّ الترندات ثمّ الاستوديو — كان: ' + order.join(' > '));
  assert.ok(card.classList.contains('vmk-trends-top'));
  const side = card.children[2];
  assert.ok(side.children.includes(desc), 'الوصف في عمود المعاينة كما صُمّم');
  assert.ok(!side.children.includes(vt), 'الترندات لم تعد تحت المعاينة');
});
