'use strict';
/* v-photo-as-is (المالك ٢٧ أكتوبر: «شف الصور الي احطها بعد تكون مطابقه لي الصوره مش تغير الملامح»):
   صورة البطل مع وصف حرّ تصل كلّ محرّك كما رفعها المستخدم أوّلَ إطار — بلا إطار يُعاد رسمه (كان يحوّل الأفاتار الكرتونيّ
   إنسانًا آخر: «Photorealistic… the real person»)، وبقفل محايد بلا «شخص حقيقيّ» ولا «ultra-realistic». الأنمي المختار
   صراحةً يبقى يرسم، وVIDEO_FREE_FRAME=on يعيد الرسم كما كان. الترندات خارج هذا. */
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const jpeg = require('jpeg-js');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const TP = require(rp('api/_lib/trend-people.js'));
const { withPhotoLock } = require(rp('api/_lib/video-trends.js'));

function photo(w, h) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = (i * 7) % 256; data[i * 4 + 1] = (i * 3) % 256; data[i * 4 + 2] = 120; data[i * 4 + 3] = 255; }
  return jpeg.encode({ width: w, height: h, data }, 90).data.toString('base64');
}
const AVATAR = photo(400, 400); // أفاتار كرتونيّ (البايتات لا تهمّ — المهمّ أنّها تصل كما هي)
const FRAME = Buffer.from('drawn-opening-frame-'.repeat(6)).toString('base64');
const DESC = 'مقدّم إماراتي واقعي بالكندورة يشرح في استوديو حديث';
const REALISM = /real person|ultra-realistic|photorealistic|photographic quality|absolutely no cartoon|real photo of a real/i;

const owner = { checkOwnerBypass: async () => ({ allowed: true }), checkVideoQuota: async () => ({ allowed: true, username: 'omran' }), consumeVideo: async () => 3 };
const noJob = { rememberVideoJob: async () => true, settleVideoJob: async () => null };
const runwayKeys = { pickKey: () => ({ key: 'rk', index: 0 }), encodeTaskId: (i, id) => i + ':' + id, clearStuckTask: async () => {}, saveLastTask: async () => {}, RUNWAY_API_BASE: 'https://runway.test' };
const ownerPoints = { isOwnerUsername: () => true, COSTS: { runway_video: 55, veo_video: 175, minimax_video: 55 } };
const kvMem = new Map();
const kv = { kvSetRaw: async (k, v) => { kvMem.set(k, v); }, kvGetRaw: async (k) => kvMem.get(k) || null, kvDel: async (k) => { kvMem.delete(k); } };

async function run(modRel, body, env) {
  TP.FRAME_CACHE.clear();
  const envKeys = ['GEMINI_API_KEY', 'MINIMAX_API_KEY', 'VIDEO_FIRST_FRAME', 'VIDEO_FREE_FRAME', 'TREND_ENGINE', 'CINEMA_ENGINE', 'RUNWAY_MODEL'];
  const savedEnv = {};
  for (const k of envKeys) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, { GEMINI_API_KEY: 'gk', MINIMAX_API_KEY: 'mk' }, env || {});
  const stubs = { 'api/_lib/_videoUsage.js': owner, 'api/_lib/video-job.js': noJob, 'api/_lib/runway-keys.js': runwayKeys, 'api/_lib/points.js': ownerPoints, 'api/_lib/kv.js': kv };
  const saved = {};
  for (const [rel, exp] of Object.entries(stubs)) { const p = rp(rel); saved[p] = require.cache[p]; require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; }
  const hp = rp(modRel); delete require.cache[hp];
  const handler = require(hp);
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    const b = init && init.body ? JSON.parse(init.body) : null;
    if (u.includes('gemini-flash-latest')) { calls.push({ kind: 'detect' }); return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: [{ box_2d: [100, 400, 300, 600] }] }) }] } }] }); }
    if (u.includes('gemini-3-pro-image')) { calls.push({ kind: 'image', body: b }); return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: FRAME } }] } }] }); }
    if (u.startsWith('https://runway.test/')) { calls.push({ kind: 'runway', url: u, body: b }); return Response.json({ id: 'task1' }); }
    if (u.includes('/v2/video_generation')) { calls.push({ kind: 'minimax', body: b }); return Response.json({ task_id: 'm1' }); }
    if (u.includes(':predictLongRunning')) { calls.push({ kind: 'veo', body: b }); return Response.json({ name: 'op/1' }); }
    if (u.endsWith('/interactions')) { calls.push({ kind: 'omni', body: b }); return Response.json({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://x/v' }] }] }); }
    throw new Error('unexpected fetch: ' + u);
  };
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  try { await handler({ method: 'POST', body }, res); }
  finally {
    global.fetch = realFetch;
    delete require.cache[hp];
    for (const [p, v] of Object.entries(saved)) { if (v) require.cache[p] = v; else delete require.cache[p]; }
    for (const k of envKeys) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  }
  const of = (k) => calls.filter((c) => c.kind === k);
  return { res, kinds: calls.map((c) => c.kind), of };
}
const BODY = (extra) => Object.assign({ promptText: DESC, ratio: '720:1280', style: 'realistic', token: 't', imageBase64: AVATAR, imageMime: 'image/jpeg', durationSeconds: 8 }, extra || {});

test('١. «جودة عالية» (Runway): الأفاتار نفسه أوّل إطار، بلا رسم ولا كشف، ومرساة محايدة بلا «شخص حقيقيّ» ولا لاحقة الواقعيّة', async () => {
  const r = await run('api/_lib/video-create.js', BODY({ duration: 8 })); // Runway يقرأ duration (حقل العميل createScene)
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  assert.deepEqual(r.kinds, ['runway'], 'لا رسم إطار ولا كشف وجوه');
  const rw = r.of('runway')[0].body;
  assert.equal(rw.promptImage, 'data:image/jpeg;base64,' + AVATAR, 'الصورة كما رفعها');
  assert.ok(rw.promptText.startsWith("The opening frame is the user's own image."), rw.promptText.slice(0, 80));
  assert.ok(rw.promptText.includes(DESC));
  assert.doesNotMatch(rw.promptText, REALISM);
  assert.doesNotMatch(rw.promptText, /same face|IDENTITY/, 'صورة منتج لا يُخترع لها شخص (v-ai-video-speed) — القفل محايد');
  assert.ok(rw.promptText.length <= 1000, 'حدّ Runway');
  assert.equal(rw.duration, 8, 'v-video-durations: ٨ تبقى ٨');
});

test('٢. «سريع» (H3): الأفاتار نفسه first_frame، والقفل المحايد، والمدّة المختارة', async () => {
  const r = await run('api/_lib/minimax-create.js', BODY());
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  assert.deepEqual(r.kinds, ['minimax']);
  const mm = r.of('minimax')[0].body;
  assert.deepEqual(mm.content[1], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + AVATAR }, role: 'first_frame' });
  assert.equal(mm.content[0].text, withPhotoLock(DESC, 1500));
  assert.doesNotMatch(mm.content[0].text, REALISM);
  assert.doesNotMatch(mm.content[0].text, /same face|IDENTITY/);
  /* القفل بطول قفل الهويّة أو أقصر — حدود VEO_FREE_IMAGE_MAX قيست عليه فلا يُقصّ كلام الممثّل و«بلا ترجمة» */
  const VT = require(rp('api/_lib/video-trends.js'));
  assert.ok(VT.withPhotoLock('', 5000).length <= VT.withIdentityLock('', 5000).length);
  assert.equal(mm.duration, 8);
});

test('٣. «سينمائي» (Omni): الأفاتار نفسه <FIRST_FRAME> بلقطة واحدة متّصلة، بلا رسم، والقفل المحايد، والمدّة', async () => {
  const r = await run('api/_lib/veo-create.js', BODY({ durationSeconds: 10 }));
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  assert.deepEqual(r.kinds, ['omni'], 'لا رسم ولا Veo الموقوف');
  const o = r.of('omni')[0].body;
  const imgs = o.input.filter((x) => x.type === 'image');
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].data, AVATAR, 'الصورة كما رفعها');
  const text = o.input.find((x) => x.type === 'text').text;
  assert.ok(text.startsWith('[# Sources <FIRST_FRAME>@Image1] MAIN SUBJECT:'), text.slice(0, 80));
  assert.ok(text.includes('In a single continuous shot, no scene cuts.') && text.endsWith('Use Image1 as the starting frame.'));
  assert.doesNotMatch(text, REALISM);
  assert.equal(o.response_format.duration, '10s');
  assert.match(String(r.res.body.op), /^omni\//);
});

test('٤. الأنمي المختار صراحةً يبقى يرسم (تحويل أسلوب مقصود)، وVIDEO_FREE_FRAME=on يعيد الرسم كما كان', async () => {
  const a = await run('api/_lib/minimax-create.js', BODY({ style: 'anime' }));
  assert.ok(a.kinds.includes('image'), 'الأنمي يرسم إطاره');
  assert.equal(a.of('minimax')[0].body.content[1].image_url.url, 'data:image/png;base64,' + FRAME);
  const on = await run('api/_lib/video-create.js', BODY(), { VIDEO_FREE_FRAME: 'on' });
  assert.deepEqual(on.kinds, ['detect', 'image', 'runway'], 'المفتاح يعيد الرسم');
  assert.equal(on.of('runway')[0].body.promptImage, 'data:image/png;base64,' + FRAME);
});

test('٥. الترندات لم تُمسّ: freeFrameOn للوصف الحرّ وحده، وfirstFrameOn للترندات', () => {
  assert.equal(TP.freeFrameOn({ style: 'realistic' }), false);
  assert.equal(TP.freeFrameOn({ style: 'anime' }), true);
  process.env.VIDEO_FIRST_FRAME = 'off';
  try { assert.equal(TP.freeFrameOn({ style: 'anime' }), false, 'الإطفاء العامّ يغلب'); } finally { delete process.env.VIDEO_FIRST_FRAME; }
  assert.equal(TP.firstFrameOn(), true);
  const veo = require('fs').readFileSync(path.join(root, 'api/_lib/veo-create.js'), 'utf8');
  assert.match(veo, /\? \(trendPeople\.length <= 1 && \(tp\.SOLO_FRAME_TRENDS\.has\(trendId\)/, 'فرع الترند كما كان');
  assert.match(veo, /: !!\(rawDesc && String\(rawDesc\)\.trim\(\)\) && tp\.freeFrameOn\(body\)\);/);
});

console.log('✓ video-photo-as-is: الصورة نفسها أوّل إطار في «جودة عالية» و«سريع» و«سينمائي» بقفل محايد، والأنمي والمفتاح يرسمان');
