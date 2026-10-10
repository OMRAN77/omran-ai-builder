// tests/video-two-people.test.cjs — v-two-people (١ أكتوبر ٢٠٢٦).
// المالك بعد #855: «إذا حطيت صورة شخصيّتين يغيّر الشخصيّة الثانية فقط — شخصيّة وحدة تمام والثانية يغيّر الشكل كامل».
// الجذر في المسارين: كلّ أقفال الهويّة القويّة بصيغة «الشخص» المفرد — ترند الصورتين (فقرة الأولويّة وقفل الذيل في أمر
// Veo، والمشهد إلى إطار المجموعة يبدأ بفقرة المفرد)، وصورة فيها شخصان (لا لقطة لأيّ وجه، والمهمّة والأقفال مفردة).
// هنا تُشغَّل معالجات Veo والاقتصاديّ وRunway الحقيقيّة وخطّ الكشف والقصّ والإطار الحقيقيّ بصورة JPEG فيها وجهان.
'use strict';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const jpeg = require('jpeg-js');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const TP = require(rp('api/_lib/trend-people.js'));
const { withIdentityLock, buildTrendPrompt } = require(rp('api/_lib/video-trends.js'));

function photo(w, h, faces, seed) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const inFace = faces.some((f) => x >= f[0] * w && x < f[2] * w && y >= f[1] * h && y < f[3] * h);
    data[o] = inFace ? 230 : (x * 7 + seed * 40) % 256; data[o + 1] = inFace ? 190 : (y * 5) % 256; data[o + 2] = inFace ? 160 : (seed * 90) % 256; data[o + 3] = 255;
  }
  return jpeg.encode({ width: w, height: h, data }, 90).data.toString('base64');
}
/* صورة زوجين: وجهان بالحجم نفسه يسارًا ويمينًا (box_2d [ymin, xmin, ymax, xmax] من ٠ إلى ١٠٠٠) */
const COUPLE = photo(800, 1000, [[0.15, 0.12, 0.30, 0.22], [0.65, 0.12, 0.80, 0.22]], 3);
const BOXES = [[120, 150, 220, 300], [120, 650, 220, 800]];
const FRAME = Buffer.from('two-people-frame-'.repeat(6)).toString('base64');
const DESC = 'رجل وزوجته يمشيان في سوق قديم مزيّن بالفوانيس';
const owner = { checkOwnerBypass: async () => ({ allowed: true }), checkVideoQuota: async () => ({ allowed: true, username: 'omran' }), consumeVideo: async () => 3 };
const noJob = { rememberVideoJob: async () => true, settleVideoJob: async () => null };
const runwayKeys = { pickKey: () => ({ key: 'rk', index: 0 }), encodeTaskId: (i, id) => i + ':' + id, clearStuckTask: async () => {}, saveLastTask: async () => {}, RUNWAY_API_BASE: 'https://runway.test' };

async function run(modRel, body, faces) {
  TP.FRAME_CACHE.clear();
  const keys = ['GEMINI_API_KEY', 'MINIMAX_API_KEY', 'VIDEO_FIRST_FRAME', 'MERGE_FACE_CROPS'];
  const saved = {}; for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, { GEMINI_API_KEY: 'gk', MINIMAX_API_KEY: 'mk' });
  const stubs = { 'api/_lib/_videoUsage.js': owner, 'api/_lib/video-job.js': noJob, 'api/_lib/runway-keys.js': runwayKeys, 'api/_lib/points.js': { isOwnerUsername: () => true, COSTS: { runway_video: 55 } } };
  const old = {};
  for (const [rel, exp] of Object.entries(stubs)) { const p = rp(rel); old[p] = require.cache[p]; require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; }
  const hp = rp(modRel); delete require.cache[hp];
  const vp = rp('api/_lib/veo-create.js'); const oldVeo = require.cache[vp]; if (modRel !== 'api/_lib/veo-create.js') delete require.cache[vp];
  const handler = require(hp);
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url); const b = init && init.body ? JSON.parse(init.body) : null;
    if (u.includes('gemini-flash-latest')) { calls.push({ kind: 'detect' }); return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: (faces || BOXES).map((box) => ({ box_2d: box })) }) }] } }] }); }
    if (u.includes('gemini-3-pro-image')) { calls.push({ kind: 'image', body: b }); return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: FRAME } }] } }] }); }
    if (u.startsWith('https://runway.test/')) { calls.push({ kind: 'runway', body: b }); return Response.json({ id: 't1' }); }
    if (u.includes('/v1/video_generation')) { calls.push({ kind: 'minimax', body: b }); return Response.json({ task_id: 'm1', base_resp: { status_code: 0 } }); }
    if (u.includes(':predictLongRunning')) { calls.push({ kind: 'veo', body: b }); return Response.json({ name: 'op/1' }); }
    throw new Error('unexpected fetch: ' + u);
  };
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  try { await handler({ method: 'POST', body }, res); }
  finally {
    global.fetch = realFetch; delete require.cache[hp];
    if (modRel !== 'api/_lib/veo-create.js') { if (oldVeo) require.cache[vp] = oldVeo; else delete require.cache[vp]; }
    for (const [p, v] of Object.entries(old)) { if (v) require.cache[p] = v; else delete require.cache[p]; }
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
  const of = (k) => calls.filter((c) => c.kind === k);
  return { res, calls, kinds: calls.map((c) => c.kind), of, image: (of('image')[0] || {}).body };
}
const textsOf = (img) => img.contents[0].parts.filter((p) => p.text).map((p) => p.text);

test('١. أمر الترند لشخصين وثلاثة: فقرة الأولويّة وقفل الهويّة بصيغة الجمع — والشخص الواحد كما كان حرفيًّا', () => {
  const one = buildTrendPrompt('dance', { hasImage: true }).prompt;
  assert.match(one, /^WHO THEY ARE \(read first\): the reference image shows a real, specific person — not a character to invent\./);
  assert.match(one, / IDENTITY \(mandatory\): the person in the video is the same real person as in the reference image —/);
  for (const n of [2, 3]) {
    const p = buildTrendPrompt('dance', { hasImage: true, people: n }).prompt;
    assert.match(p, new RegExp('^WHO THEY ARE \\(read first\\): the reference image shows ' + n + ' real, specific people'));
    assert.match(p, /never swap faces between them/);
    assert.match(p, new RegExp('IDENTITY \\(mandatory\\): every one of the ' + n + ' people in the video is the same real person'));
    assert.match(p, /must recognize every one of them instantly/);
    assert.doesNotMatch(p, /the person in the video is the same real person/, 'لا قفل مفرد مع أكثر من شخص');
    assert.ok(p.indexOf('IDENTITY (mandatory)') < p.indexOf('IMPORTANT — the reference image contains ' + n), 'الشرط بعد القفل كما كان');
    assert.equal(TP.trendScene(p), TP.trendScene(one), 'مشهد القالب نفسه لم يُمسّ');
  }
  // قفل صانع الفيديو: المفرد كما كان حرفيًّا، والجمع بعدد الأشخاص وداخل الحدّ
  assert.equal(withIdentityLock('x', 1500), 'MAIN CHARACTER: the real person in the attached reference photo — keep their exact face (face shape, eyes, eyebrows, nose, lips, jawline, beard, skin tone, hair) in every shot. x IDENTITY (mandatory): whenever a person appears, it is this same real person from the photo — never a different, prettier or generic face; someone who knows them must recognize them instantly.');
  const two = withIdentityLock('و'.repeat(3000), 1500, undefined, 2);
  assert.ok(two.length <= 1500);
  assert.match(two, /^MAIN CHARACTERS: the 2 real people in the attached reference photo — keep each person's own exact face/);
  assert.match(two, /every person who appears is one of these same 2 real people from the photo, each with their own face/);
});

test('٢. ترند بصورتين (Veo): إطار المجموعة يأخذ مشهد القالب وحده، وأمر Veo بصيغة الجمع ثمّ قفل الإطار', async () => {
  const { FRAME_LOCK, VEO_PROMPT_MAX } = require(rp('api/_lib/veo-create.js'));
  const r = await run('api/_lib/veo-create.js', { trend: 'dance', params: { people: 2 }, token: 't', imageBase64: COUPLE, imageMime: 'image/jpeg', imagesBase64: [COUPLE, COUPLE], imagesMime: ['image/jpeg', 'image/jpeg'] });
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  const task = textsOf(r.image).slice(-1)[0];
  assert.match(task, /Place ALL 2 people from the reference photos together/, 'مهمّة المجموعة');
  assert.match(task, /performs an energetic trendy dance routine/, 'مشهد القالب');
  assert.doesNotMatch(task, /WHO THEY ARE/, 'فقرة المفرد لم تعد «مشهدًا»');
  const inst = r.of('veo')[0].body.instances[0];
  assert.equal(inst.image.bytesBase64Encoded, FRAME);
  assert.match(inst.prompt, /^WHO THEY ARE \(read first\): the reference image shows 2 real, specific people/);
  assert.match(inst.prompt, /IDENTITY \(mandatory\): every one of the 2 people/);
  assert.ok(inst.prompt.endsWith(FRAME_LOCK.trim()) && inst.prompt.length <= VEO_PROMPT_MAX);
});

test('٣. صورة واحدة فيها شخصان (صانع الفيديو): لقطتان بعنوان موضعهما، والمهمّة والأقفال للاثنين في كلّ محرّك', async () => {
  const { FRAME_LOCK } = require(rp('api/_lib/veo-create.js'));
  const body = { promptText: DESC, ratio: '1280:720', token: 't', imageBase64: COUPLE, imageMime: 'image/jpeg' };
  // الاقتصاديّ
  const mm = await run('api/_lib/minimax-create.js', body);
  assert.deepEqual(mm.kinds, ['detect', 'image', 'minimax']);
  const tx = textsOf(mm.image);
  assert.match(tx[0], /^Photo 1 — the user's own photo of the real people to feature:$/);
  assert.equal(tx.filter((t) => /^Close-up [12] — the face of the person on the (left|right) in Photo 1/.test(t)).length, 2, 'لقطة لكلّ وجه بعنوان موضعه');
  assert.match(tx.slice(-1)[0], /Photo 1 shows 2 different real people and ALL of them appear/);
  assert.match(tx.slice(-1)[0], /and from the close-up of their own face/);
  const mp = mm.of('minimax')[0].body.prompt;
  assert.match(mp, /^MAIN CHARACTERS: the 2 real people in the attached reference photo/);
  assert.ok(mp.endsWith(FRAME_LOCK.trim()) && mp.length <= 1500);
  // Runway
  const rw = await run('api/_lib/video-create.js', Object.assign({ style: 'realistic' }, body));
  const rp0 = rw.of('runway')[0].body.promptText;
  assert.match(rp0, /^The opening frame already shows the real people from the user's photo in this scene\. Keep each of them exactly/);
  assert.match(rp0, /IDENTITY \(mandatory\): they are these same people from the photo throughout, each with their own face/);
  assert.ok(rp0.length <= 1000);
  // Veo — الوصف الحرّ
  const vf = await run('api/_lib/veo-create.js', body);
  const vp = vf.of('veo')[0].body.instances[0].prompt;
  assert.match(vp, /^MAIN CHARACTERS: the 2 real people/);
  assert.ok(vp.endsWith(FRAME_LOCK.trim()));
  // ترند الشخص الواحد بصورة زوجين (الزفاف): أمر الترند يُعاد بصيغة الجمع
  const wd = await run('api/_lib/veo-create.js', { trend: 'wedding', params: {}, token: 't', imageBase64: COUPLE, imageMime: 'image/jpeg' });
  const wp = wd.of('veo')[0].body.instances[0].prompt;
  assert.match(wp, /^WHO THEY ARE \(read first\): the reference image shows 2 real, specific people/);
  assert.match(wp, /all 2 of them must appear together/);
  assert.ok(wp.endsWith(FRAME_LOCK.trim()));
});

test('٤. شخص واحد كما كان، ولقطة لأحد الوجهين وحده تبقى ممنوعة (تسحب ملامحه إلى الآخر)', async () => {
  // وجه واحد: لقطته بعنوانه المفرد، والأمر مفرد
  const one = await run('api/_lib/minimax-create.js', { promptText: DESC, token: 't', imageBase64: COUPLE, imageMime: 'image/jpeg' }, [BOXES[0]]);
  const t1 = textsOf(one.image);
  assert.equal(t1[1], TP.SOLO_CLOSEUP_LABEL);
  assert.match(one.of('minimax')[0].body.prompt, /^MAIN CHARACTER: the real person/);
  // وجهان بارزان أحدهما أصغر من أن يُقصّ (< ٣٢ بكسل): لا لقطة لأيٍّ منهما
  const small = await run('api/_lib/minimax-create.js', { promptText: DESC, token: 't', imageBase64: COUPLE, imageMime: 'image/jpeg' }, [[120, 150, 180, 300], [500, 650, 531, 800]]);
  const ts = textsOf(small.image);
  assert.ok(!ts.some((t) => /^Close-up/.test(t)), 'لا لقطة لوجه واحد من اثنين');
  assert.match(small.of('minimax')[0].body.prompt, /^MAIN CHARACTER: the real person/, 'العدد غير مؤكَّد = المفرد كما كان');
});
