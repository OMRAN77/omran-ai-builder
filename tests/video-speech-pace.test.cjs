'use strict';
/* v-video-speech-pace (المالك ١٧ نوفمبر ٢٠٢٦: «اصلح مسار الفيديوهات السينمائي وفيديو سريع — الاصوات تتراكب على بعضها، وثاني شي
   الكلام غير متناسق»). مقطعاه («سينمائي» ١٠ث و٨ث، حوار أمّ وبنت) فُرّغا محلّيًّا: ستّة أدوار بلا وقفة والصوتان معًا، وآخر جملة
   مقطوعة عند نهاية المقطع. الجذر: الوصف الحرّ يصل المحرّكين بلا قاعدة لتوقيت الكلام. يثبت هنا: الوصف الذي يطلب كلامًا يصل
   «سينمائي» (Omni والاحتياط وVeo القديم) و«سريع» (H3) ومعه قاعدة التوقيت بمدّة المقطع نفسها — داخل حدّ الوصف القديم، ومع صورة داخل
   القفل قبل سطره الأخير (القفل آخرًا كما كان) — والوصف بلا كلام والترند كما كانا حرفيًّا. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');
process.env.AUTH_SECRET = 'speech-pace-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.MINIMAX_API_KEY = 'mm-test';
delete process.env.TREND_ENGINE; delete process.env.CINEMA_ENGINE; delete process.env.VIDEO_FREE_FRAME;

const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kv = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kv.has(k) ? String(kv.get(k)) : null,
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); }, kvDel: async (k) => { kv.delete(k); }, kvExpire: async () => {},
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; }, kvList: async () => [],
});
mock('api/_lib/_videoUsage.js', { checkOwnerBypass: async () => ({ allowed: true }) }); // المالك: لا نقاط ولا قفل
mock('api/_lib/video-job.js', { rememberVideoJob: async () => true, settleVideoJob: async () => ({ settled: true }) });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
/* الاحتياط: نفاد Gemini ← startVideo يسجّل الطلب كما وصله */
let falOut = false;
const falSpecs = [];
mock('api/_lib/fal-fallback.js', {
  VIDEO_OP_PREFIX: 'bk/', enabled: () => true, geminiOutRecently: async () => falOut, markGeminiOut: async () => {},
  geminiCreditOut: (status) => status === 402,
  startVideo: async (spec) => { falSpecs.push(spec); return { op: 'bk/req-1', rec: { p: 'fal' } }; },
});

const SP = require(rp('api/_lib/video-trends.js')); // قاعدة الكلام في video-trends.js بجانب الأقفال
const VT = require(rp('api/_lib/video-trends.js'));
const TP = require(rp('api/_lib/trend-people.js'));
const OMNI = require(rp('api/_lib/omni-create.js'));
const veo = require(rp('api/_lib/veo-create.js'));
const mm = require(rp('api/_lib/minimax-create.js'));

let calls = [];
let omniStatus = 200;
global.fetch = async (url, init) => {
  const u = String(url);
  const body = init && init.body ? JSON.parse(init.body) : null;
  calls.push({ url: u, body });
  if (/\/interactions$/.test(u)) {
    if (omniStatus !== 200) return new Response(JSON.stringify({ error: { code: 402, message: 'Your prepayment credits are depleted.' } }), { status: omniStatus });
    return new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/a:download?alt=media' }] }] }), { status: 200 });
  }
  if (/predictLongRunning/.test(u)) return new Response(JSON.stringify({ name: 'operations/veo-1' }), { status: 200 });
  if (/minimax\.io\/v2\/video_generation$/.test(u)) return new Response(JSON.stringify({ task_id: 'mm-1' }), { status: 200 });
  return new Response('{}', { status: 404 });
};
function res() { return { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } }; }
async function run(handler, body) { calls = []; const r = res(); await handler({ method: 'POST', query: {}, body: Object.assign({ token: 'owner', quality: 'fast', confirmed: true }, body) }, r); return r; }
const omniText = () => { const c = calls.find((x) => /\/interactions$/.test(x.url)); assert.ok(c, 'نداء Omni'); return c.body.input.filter((x) => x.type === 'text').map((x) => x.text).join(''); };
const mmBody = () => { const c = calls.find((x) => /minimax\.io/.test(x.url)); assert.ok(c, 'نداء H3'); return c.body; };

/* الوصف كما كتبه المالك تقريبًا — حوار أمّ وبنت بسطر لكلّ متكلّم (فرّغه Whisper من مقطعيه) */
const DIALOGUE = 'البنت: أمي لماذا نحتفل باليوم الوطني؟\nالأم: نحتفل باتحاد الإمارات يا بنتي\nالبنت: ومن أسّس الاتحاد؟\nالأم: الشيخ زايد وإخوانه حكّام الإمارات\nالبنت: أنا فخورة بوطني\nالاثنتان: كل عام والإمارات بخير';
const SILENT = 'صقر يحلّق فوق الكثبان عند الغروب';

test('١. كشف الكلام: الحوار بأسماء المتكلّمين، والتنصيص، وأفعال الكلام (بتشكيل وبلاه، عربيّ وإنجليزيّ) — والمشهد الصامت لا', () => {
  for (const d of [DIALOGUE, 'أم وبنتها تتحاوران عن اليوم الوطني', 'رجل يقول «هلا والله» للكاميرا', 'طفل يتكلّم مع أبوه في المجلس',
    'Mom: why do we celebrate?', 'A girl asks her mother about National Day', 'two friends chatting in a cafe']) assert.equal(SP.hasSpeech(d), true, d);
  for (const d of [SILENT, 'قطّة تلعب في حديقة', 'A drone shot over Dubai Marina at night', 'امرأة تغني أمام بيت طين قديم', '', null]) assert.equal(SP.hasSpeech(d), false, String(d));
  /* «ممثل يتكلم» (احتياطه عبر veo-create): كلامه بالحرف — قالب app-11-video.js نفسه لا يمرّ بالقاعدة */
  const src = require('node:fs').readFileSync(path.join(root, 'js/app-11-video.js'), 'utf8');
  assert.ok(src.includes('saying exactly these Arabic words: "'), 'قالب الممثّل في العميل');
  const actor = 'رجل. The person looks directly at the camera and speaks in Emirati Gulf Arabic dialect, saying exactly these Arabic words: "هلا والله". No subtitles.';
  assert.equal(SP.hasSpeech(actor), true);
  assert.equal(SP.speechPace(actor, 8), '', 'الممثّل بلا القاعدة');
});

test('٢. القاعدة: صوت واحد ووقفة بين الأدوار، والجملة كاملة متزامنة، وتنتهي قبل آخر ثانية بقدر المدّة — وبلا كلام لا شيء', () => {
  const p10 = SP.speechPace(DIALOGUE, 10);
  assert.match(p10, /^ If anyone speaks in this 10-second clip: one voice at a time/);
  assert.match(p10, /pause \(and any camera cut\) between turns/);
  assert.match(p10, /no narrator or background voices over them/);
  assert.match(p10, /complete, clear and unhurried, as written, lip-synced to the speaker on screen/);
  assert.match(p10, /ends before the last second \(about 15 words at most\): if the lines do not fit, say fewer lines — never rush, overlap or cut one off\.$/);
  assert.match(SP.speechPace(DIALOGUE, 8), /8-second clip.*about 11 words/);
  assert.match(SP.speechPace(DIALOGUE, 5), /5-second clip.*about 6 words/);
  assert.match(SP.speechPace(DIALOGUE, undefined), /8-second clip/, 'بلا مدّة = ٨ كافتراضيّ المحرّك');
  assert.equal(SP.speechPace(SILENT, 10), '');
  for (const s of [3, 5, 8, 10, 15]) assert.ok(SP.speechPace(DIALOGUE, s).length < 480, 'قصيرة: تدخل حدّ الوصف نفسه فيُقصّ لها من وصف طويل');
  /* المقطع ٨ث اليوم: ثلاث جمل (١٣ كلمة) لم تتّسع — الحدّ تحتها */
  assert.ok(SP.wordBudget(8) < 13 && SP.wordBudget(10) < 24);
});

test('٣. «سينمائي» (Omni): الحوار يصل بقاعدة التوقيت بمدّة المقطع المختارة، والمشهد الصامت حرفيًّا كما كان', async () => {
  let r = await run(veo, { promptText: DIALOGUE, ratio: '1280:720', durationSeconds: 10 });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(omniText(), DIALOGUE + SP.speechPace(DIALOGUE, 10));
  assert.equal(calls.find((x) => /\/interactions$/.test(x.url)).body.response_format.duration, '10s');
  r = await run(veo, { promptText: DIALOGUE, ratio: '720:1280', durationSeconds: 8 });
  assert.ok(omniText().endsWith(SP.speechPace(DIALOGUE, 8)));
  r = await run(veo, { promptText: SILENT, ratio: '1280:720', durationSeconds: 10 });
  assert.equal(r.code, 200);
  assert.equal(omniText(), SILENT, 'بلا كلام = الأمر كما كان');
  /* الترند بقالبه («عيد مبارك» يقول تهنئته) — بلا القاعدة */
  r = await run(veo, { trend: 'eidgreeting', params: { name: 'سلامة' }, promptText: 'يقول «عيد مبارك»' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.match(omniText(), /عيد مبارك/);
  assert.ok(!/If anyone speaks in this/.test(omniText()), 'الترند لا يمرّ بالقاعدة');
});

test('٤. «سينمائي» بصورة: القاعدة داخل القفل بعد الوصف وقبل سطره الأخير (القفل آخرًا)، ثمّ «لقطة واحدة» والإرشاد؛ والوصف الطويل يُقصّ هو لا القاعدة ولا يتجاوز حدّه', async () => {
  const d = 'الشخص في الصورة يقول «حيّاكم في اليوم الوطني»';
  await run(veo, { promptText: d, ratio: '720:1280', durationSeconds: 8, imageBase64: 'PHOTO', imageMime: 'image/jpeg' });
  const pace = SP.speechPace(d, 8);
  assert.equal(omniText(), OMNI.FRAME_DECL + veo.bindTrendRef(VT.withPhotoLock(d, veo.VEO_FREE_IMAGE_MAX, undefined, pace)) + veo.TREND_NO_CUTS + veo.PHOTO_REF_GUIDE);
  assert.ok(omniText().includes(pace + ' SUBJECT (mandatory)'), 'سطر القفل بعد القاعدة');
  const long = 'رجل يقول: ' + 'كلام طويل جدًّا '.repeat(200);
  await run(veo, { promptText: long, ratio: '1280:720', durationSeconds: 10 });
  assert.ok(omniText().endsWith(SP.speechPace(long, 10)), 'بلا صورة: القاعدة كاملة في آخر الأمر');
  assert.equal(omniText().length, veo.VEO_FREE_MAX, 'داخل حدّ الوصف نفسه');
  await run(veo, { promptText: long, ratio: '720:1280', durationSeconds: 10, imageBase64: 'PHOTO', imageMime: 'image/jpeg' });
  const lk = VT.withPhotoLock(long, veo.VEO_FREE_IMAGE_MAX, undefined, SP.speechPace(long, 10));
  assert.equal(lk.length, veo.VEO_FREE_IMAGE_MAX);
  assert.ok(omniText().includes(SP.speechPace(long, 10) + ' SUBJECT (mandatory)'));
  const lid = VT.withIdentityLock(long, veo.VEO_FREE_IMAGE_MAX, undefined, 2, SP.speechPace(long, 10));
  assert.equal(lid.length, veo.VEO_FREE_IMAGE_MAX, 'قفل الهويّة بالقاعدة داخل حدّه');
  assert.ok(lid.includes(SP.speechPace(long, 10) + ' IDENTITY (mandatory)'));
  assert.equal(VT.withPhotoLock(long, 2000, undefined, ''), VT.withPhotoLock(long, 2000), 'بلا قاعدة = القفل كما كان حرفيًّا');
  assert.equal(VT.withIdentityLock(long, 2000, 'x', 2, ''), VT.withIdentityLock(long, 2000, 'x', 2));
});

test('٤ب. أوّل إطار مرسوم (Omni وH3): القاعدة داخل قفل الهويّة قبل سطره، و«الإطار جاهز» آخرًا كما كان، والطول في حدّه', async () => {
  const realSolo = TP.soloFirstFrame;
  TP.soloFirstFrame = async () => ({ b64: 'SOLOFRAME', mime: 'image/png', ref: { data: 'FACEREF', mime: 'image/jpeg' }, people: 1 });
  process.env.VIDEO_FREE_FRAME = 'on';
  try {
    const d = 'رجل إماراتي يقول للكاميرا «حيّاكم في اليوم الوطني» ويبتسم';
    await run(veo, { promptText: d, ratio: '720:1280', durationSeconds: 10, imageBase64: 'PHOTO', imageMime: 'image/jpeg' });
    const pace = SP.speechPace(d, 10);
    assert.equal(omniText(), OMNI.FRAME_DECL + VT.withIdentityLock(d, veo.VEO_FREE_IMAGE_MAX, 'the reference image <IMAGE_REF_0>', undefined, pace) + TP.FRAME_LOCK + veo.TREND_NO_CUTS + OMNI.FRAME_GUIDE);
    assert.ok(omniText().includes(pace + ' IDENTITY (mandatory)'));
    await run(mm, { promptText: d, ratio: '720:1280', durationSeconds: 8, imageBase64: 'PHOTO', imageMime: 'image/jpeg' });
    const t = mmBody().content[0].text;
    assert.equal(t, VT.withIdentityLock(d, 1500 - TP.FRAME_LOCK.length, undefined, 1, SP.speechPace(d, 8)) + TP.FRAME_LOCK);
    assert.ok(t.endsWith(TP.FRAME_LOCK.trim()) && t.length <= 1500, 'القفل آخرًا وداخل ١٥٠٠');
    /* تعذّر الإطار: صورته نفسها أوّل إطار بقفل الهويّة — والقاعدة فيه قبل سطره */
    TP.soloFirstFrame = async () => ({ error: 'frame failed' });
    await run(veo, { promptText: d, ratio: '720:1280', durationSeconds: 10, imageBase64: 'PHOTO', imageMime: 'image/jpeg' });
    assert.ok(omniText().includes(VT.withIdentityLock(d, veo.VEO_FREE_IMAGE_MAX, undefined, undefined, pace)), 'قفل الهويّة بالقاعدة');
  } finally { TP.soloFirstFrame = realSolo; delete process.env.VIDEO_FREE_FRAME; }
});

test('٥. «سينمائي» على الاحتياط (نفاد Gemini) وعلى Veo القديم: القاعدة نفسها', async () => {
  omniStatus = 402; falSpecs.length = 0;
  try {
    const r = await run(veo, { promptText: DIALOGUE, ratio: '1280:720', durationSeconds: 10 });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.op, 'bk/req-1');
    assert.equal(falSpecs.length, 1);
    assert.equal(falSpecs[0].prompt, DIALOGUE + SP.speechPace(DIALOGUE, 10));
    assert.equal(falSpecs[0].durationSec, 10);
  } finally { omniStatus = 200; }
  process.env.CINEMA_ENGINE = 'veo';
  try {
    await run(veo, { promptText: DIALOGUE, ratio: '1280:720', durationSeconds: 8 });
    const c = calls.find((x) => /predictLongRunning/.test(x.url));
    assert.equal(c.body.instances[0].prompt, DIALOGUE + SP.speechPace(DIALOGUE, 8));
  } finally { delete process.env.CINEMA_ENGINE; }
});

test('٦. «فيديو سريع» (H3): الحوار بقاعدة التوقيت بمدّته (٨، وبلا مدّة ٦)، والمشهد الصامت والترند كما كانا', async () => {
  let r = await run(mm, { promptText: DIALOGUE, ratio: '1280:720', durationSeconds: 8 });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(mmBody().content[0].text, DIALOGUE + SP.speechPace(DIALOGUE, 8));
  assert.equal(mmBody().duration, 8);
  await run(mm, { promptText: DIALOGUE });
  assert.ok(mmBody().content[0].text.endsWith(SP.speechPace(DIALOGUE, 6)));
  assert.match(mmBody().content[0].text, /6-second clip/);
  await run(mm, { promptText: SILENT, durationSeconds: 10 });
  assert.equal(mmBody().content[0].text, SILENT);
  const long = 'رجل يقول: ' + 'كلام طويل جدًّا '.repeat(200);
  await run(mm, { promptText: long, durationSeconds: 10 });
  assert.equal(mmBody().content[0].text.length, 1500, 'داخل حدّ الوصف نفسه');
  assert.ok(mmBody().content[0].text.endsWith(SP.speechPace(long, 10)), 'يُقصّ الوصف لا القاعدة');
  /* صورة بلا إطار مرسوم: القفل المحايد، والقاعدة قبل سطره */
  await run(mm, { promptText: DIALOGUE, durationSeconds: 8, imageBase64: 'PHOTO', imageMime: 'image/jpeg' });
  assert.equal(mmBody().content[0].text, VT.withPhotoLock(DIALOGUE, 1500, undefined, SP.speechPace(DIALOGUE, 8)));
  /* الترند بقالبه: «الحيوان يتكلّم» يقول كلامه — بلا القاعدة */
  await run(mm, { trend: 'talkingpet', params: { text: 'هلا والله' }, promptText: 'القطّة تقول «هلا والله»', imageBase64: 'PHOTO', imageMime: 'image/jpeg' });
  assert.ok(!/If anyone speaks in this/.test(mmBody().content[0].text), 'الترند لا يمرّ بالقاعدة');
});
