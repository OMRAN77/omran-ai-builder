'use strict';
/* v-omni-role-words — توثيق المحرّك (قُرئ ١٧ نوفمبر ٢٠٢٦): وسوم التحكّم داخل النصّ (<FIRST_FRAME> <LAST_FRAME> <IMAGE_REF_0> <VIDEO_REF_0>)
   مهجورة في الإصدار الجديد وغير مدعومة فيما بعده، والبديل وصف دور كلّ صورة بلغة طبيعيّة (وgeneration_config.video_config.task احتياطًا).
   والإصدار الحاليّ يُحوَّل كلّه إلى الجديد في ٣ ديسمبر ٢٠٢٦، و«سينمائي» الطويل عليه من اليوم (v-video-one-shot).
   ١) الاسم المرسَل هو الحكم: الإصدار الحاليّ بوسومه حرفيًّا، وكلّ اسم غيره بالكلمات؛ OMNI_ROLE_STYLE يفرض، ولا تبديل بالتاريخ.
   ٢) صيغة الكلمات = أمر الوسوم نفسه بلا أيّ وسم (Image1 ← the first image) + سطر أوّل يعرّف دور كلّ صورة بترتيبها — الصور وترتيبها والقوالب وأقفال الوجه كما هي.
   ٣) كلّ مسار: ترند بإطار ولقطة وجه، مجموعة، صورة تُحرَّك، مرجع وحده، كشف بإطار أخير، «سينمائي» بصورة (والطويل)، الشخصيّة الناطقة، وomni-create.
   ٤) task مطفأ افتراضيًّا، وبمفتاحه لدور واحد وحده؛ والاحتياط بوسمه كما توثّقه نقطته. المعالجان الحقيقيّان، بلا شبكة ولا صرف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
process.env.AUTH_SECRET = 'omni-role-words-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.FAL_KEY = 'fal-test-key';
process.env.MERGE_FACE_CROPS = 'off';
const ENV_KEYS = ['TREND_ENGINE', 'CINEMA_ENGINE', 'OMNI_VIDEO_MODEL', 'OMNI_LONG_MODEL', 'OMNI_ROLE_STYLE', 'OMNI_ROLE_TASK', 'OMNI_FIRST_FRAME',
  'VIDEO_FREE_FRAME', 'VIDEO_FIRST_FRAME', 'TREND_FACE_SWAP', 'GEMINI_API_BASE', 'FAL_BACKUP', 'FAL_BACKUP_CAP_CENTS', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
for (const k of ENV_KEYS) delete process.env[k];

const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kv = new Map();
const users = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kv.has(k) ? String(kv.get(k)) : null,
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); }, kvDel: async (k) => { kv.delete(k); }, kvExpire: async () => {},
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; }, kvList: async () => [],
  kvPipeline: async (cmds) => cmds.map(([op, k, v]) => { if (op === 'INCRBY') { const x = Number(kv.get(k) || 0) + Number(v); kv.set(k, String(x)); return x; } kv.set(k, String(v)); return 'OK'; }),
});
mock('api/_lib/auth.js', {
  getUser: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  getUserOnce: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false, verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/abuse-guard.js', { videoLock: async () => ({ ok: true }), releaseVideoLock: async () => {}, videoCooldownLeft: async () => 0, imageHourlyGuard: async () => ({ ok: true }) });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

/* الإطار الأوّل بقيم ثابتة — بناؤه نفسه مختبَر في video-first-frame وtrend-people-server */
const TP = require(rp('api/_lib/trend-people.js'));
let soloPeople = 1;
TP.soloFirstFrame = async () => ({ b64: 'SOLOFRAME', mime: 'image/png', ref: { data: 'FACEREF', mime: 'image/jpeg' }, people: soloPeople });
TP.groupFirstFrame = async () => ({ b64: 'GROUPFRAME', mime: 'image/png' });

const veo = require(rp('api/_lib/veo-create.js'));
const OMNI = require(rp('api/_lib/omni-create.js'));
const VT = require(rp('api/_lib/video-trends.js'));
const NOW = Date.now();
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: NOW + 86400000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const ownerTok = token('omran');

const NEW = 'gemini-omni-1.2-flash';
const OLD = 'gemini-omni-1.1-flash';
const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';
let calls = [];
let omniReply = null;
let iid = 0;
global.fetch = async (url, init) => {
  const u = String(url);
  let body = null;
  try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
  calls.push({ url: u, method: (init && init.method) || 'GET', body });
  if (/\/interactions$/.test(u)) {
    if (omniReply) { const r = omniReply(); return new Response(JSON.stringify(r.body), { status: r.status }); }
    return new Response(JSON.stringify({ id: 'v1_' + (++iid), steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media' }] }] }), { status: 200 });
  }
  if (/^https:\/\/queue\.fal\.run\//.test(u) && init && init.method === 'POST') {
    return new Response(JSON.stringify({ request_id: 'f1-5a1e-4c2b-9d3e-0011223344aa', status_url: u + '/requests/f1/status', response_url: u + '/requests/f1' }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
};
function res() { return { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } }; }
async function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}
/* نداء المعالج الحقيقيّ ← طلب المحرّك المرسَل */
async function sent(body, env) {
  return withEnv(env || {}, async () => {
    calls = [];
    const r = res();
    await veo({ method: 'POST', query: { action: 'veo-create' }, body: Object.assign({ token: ownerTok, quality: 'fast', durationSeconds: 8, confirmed: true }, body) }, r);
    assert.equal(r.code, 200, JSON.stringify(r.body));
    const c = calls.find((x) => /\/interactions$/.test(x.url));
    assert.ok(c, 'نداء المحرّك');
    return Object.assign({ op: r.body.op }, c.body);
  });
}
async function sentOmni(body, env) {
  return withEnv(env || {}, async () => {
    calls = [];
    const r = res();
    await OMNI({ method: 'POST', body: Object.assign({ token: ownerTok, quality: 'fast' }, body) }, r);
    assert.equal(r.code, 200, JSON.stringify(r.body));
    return calls.find((x) => /\/interactions$/.test(x.url)).body;
  });
}
const text = (q) => q.input.filter((x) => x.type === 'text').map((x) => x.text).join('');
const images = (q) => q.input.filter((x) => x.type === 'image').map((x) => x.data);
/* أيّ وسم تحكّم، أو سطر تصريح الأدوار، أو اسم Image1/Image2 الذي لا يعرّفه إلّا ذلك السطر */
const CONTROL_RE = /<[A-Z][A-Z_]*\d*>|\[# |\bImage\d/;
const DOC_TAGS = ['<FIRST_FRAME>', '<LAST_FRAME>', '<IMAGE_REF_0>', '<VIDEO_REF_0>'];
const ATTACH = /^(One image is|(Two|Three|Four) images are) attached[:,] /;
const COUNT = { One: 1, Two: 2, Three: 3, Four: 4 };
const photo = (trend, extra) => Object.assign({ trend, params: { text: 'يا هلا', name: 'سعيد', sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' }, extra || {});
const group = (n) => photo('heritagesing', { params: { text: 'يا هلا', people: n, sceneIndex: 0 }, imageBase64: 'P1', imageMime: 'image/png',
  imagesBase64: ['P1', 'P2', 'P3'].slice(0, n), imagesMime: ['image/png', 'image/png', 'image/png'].slice(0, n) });
/* الطلب نفسه مرّتين: بالإصدار الحاليّ (وسوم) وبالجديد (كلمات) */
async function pair(body) {
  const tags = await sent(body);
  const words = await sent(body, { OMNI_VIDEO_MODEL: NEW });
  assert.equal(tags.model, OLD); assert.equal(words.model, NEW);
  return { tags, words };
}
/* القاعدة: صيغة الكلمات = سطر التعريف + صيغة الوسوم بعد حذف كلّ وسم وتسمية الصور بترتيبها — لا شيء آخر تغيّر */
const fromTags = (decl, tagsText) => decl + OMNI.imageWords(OMNI.stripRoleTags(tagsText));

test('١. الحكم هو الاسم المرسَل: الإصدار الحاليّ بوسومه، وكلّ اسم غيره بالكلمات؛ OMNI_ROLE_STYLE يفرض؛ ولا تبديل بالتاريخ', async () => {
  assert.equal(OMNI.roleWords(OLD), false);
  assert.equal(OMNI.roleWords('gemini-omni-flash-preview'), false);
  assert.equal(OMNI.roleWords(NEW), true);
  assert.equal(OMNI.roleWords('gemini-omni-1.3-flash'), true, 'ما بعده: «غير مدعومة في النماذج القادمة»');
  assert.equal(OMNI.roleWords('gemini-omni-2-flash'), true);
  await withEnv({ OMNI_ROLE_STYLE: 'words' }, async () => assert.equal(OMNI.roleWords(OLD), true, 'مفتاح يوم التحويل بلا نشر'));
  await withEnv({ OMNI_ROLE_STYLE: 'TAGS' }, async () => assert.equal(OMNI.roleWords(NEW), false, 'رجوع بلا نشر'));
  await withEnv({ OMNI_ROLE_STYLE: 'maybe' }, async () => { assert.equal(OMNI.roleWords(OLD), false); assert.equal(OMNI.roleWords(NEW), true); });
  /* بعد ٣ ديسمبر الاسم الحاليّ يبقى بوسومه حتّى يُحسم بتشغيلة حيّة — لا تغيّر صامت في الترندات، ولا اختبار ينقلب بمرور الوقت */
  const realNow = Date.now;
  Date.now = () => Date.UTC(2027, 0, 15);
  try { assert.equal(OMNI.roleWords(OLD), false); assert.equal(OMNI.roleWords(NEW), true); } finally { Date.now = realNow; }
});

test('٢. الترجمة: Image1/Image2 ← «the first/second image» وبقيّة الإرشاد (أقفال الوجه والشعر) حرفيًّا؛ والحارس يحذف كلّ وسم وسطر تصريح', () => {
  assert.equal(OMNI.imageWords(OMNI.FRAME_GUIDE),
    ' Use the first image as the starting frame. Use the second image as a reference for the video generation: it shows the same real person as the first image'
    + ' — use it only to keep their face and identity; the clothing and setting come from the first image and the description, not from the second image.');
  assert.match(OMNI.imageWords(veo.PHOTO_REF_GUIDE), /^ Use the first image as the starting frame\. The second image is the same subject as the first image: use it only to keep its exact look/, 'أوّل الجملة بحرف كبير');
  assert.match(OMNI.imageWords(veo.groupRefGuide(3)), /Use the second image, the third image and the fourth image as references for the video generation: each one shows one of the real people already in the first image/);
  const guides = [OMNI.FRAME_GUIDE, veo.TREND_FRAME_GUIDE_MANY, veo.PHOTO_REF_GUIDE, veo.TREND_REVEAL_GUIDE, veo.groupRefGuide(2), veo.groupRefGuide(3)];
  for (const g of guides) {
    const w = OMNI.imageWords(g);
    assert.doesNotMatch(w, CONTROL_RE, w);
    /* لا كلمة تغيّرت غير اسم الصورة: الرجوع العكسيّ يعيد النصّ الأصليّ */
    const back = w.replace(/[Tt]he (first|second|third|fourth) image/g, (m, o) => 'Image' + (['first', 'second', 'third', 'fourth'].indexOf(o) + 1));
    assert.equal(back, g);
  }
  assert.equal(OMNI.imageWords('Image12 and myImage1 stay'), 'Image12 and myImage1 stay', 'الاسم المعرَّف وحده');
  /* الحارس: الأربعة التي يسمّيها التوثيق، بأرقامها، وقائمتها، وسطر التصريح بأشكاله */
  for (const t of DOC_TAGS) assert.equal(OMNI.stripRoleTags('a woman ' + t + ' is walking'), 'a woman is walking', t);
  assert.equal(OMNI.stripRoleTags('the reference photos <IMAGE_REF_0>, <IMAGE_REF_1> and <IMAGE_REF_2> show 3 people'), 'the reference photos show 3 people');
  assert.equal(OMNI.stripRoleTags('the reference photos <IMAGE_REF_0> and <IMAGE_REF_1> show'), 'the reference photos show');
  assert.equal(OMNI.stripRoleTags(OMNI.FRAME_DECL + 'x'), 'x');
  assert.equal(OMNI.stripRoleTags(veo.TREND_REVEAL_DECL + veo.groupRefDecl(3) + '[# References <IMAGE_REF_0>@Image1] x'), 'x');
  assert.equal(OMNI.stripRoleTags('نصّ عربيّ <b>bold</b> [1] يبقى'), 'نصّ عربيّ <b>bold</b> [1] يبقى', 'غير الوسوم لا يُمسّ');
  for (const d of [OMNI.FRAME_DECL_WORDS, veo.FIRST_DECL_WORDS, veo.REF_DECL_WORDS, veo.REVEAL_DECL_WORDS, veo.groupRefDeclWords(2), veo.groupRefDeclWords(3)]) {
    assert.doesNotMatch(d, CONTROL_RE, d); assert.match(d, ATTACH, d); assert.ok(d.endsWith('. '), d);
  }
});

test('٣. ترند الشخص بإطار ولقطة وجه: الصور وترتيبها والأمر والأقفال كما هي — الوسوم وحدها صارت كلمات', async () => {
  const { tags, words } = await pair(photo('heritagesing'));
  assert.deepEqual(images(tags), ['SOLOFRAME', 'FACEREF']);
  assert.deepEqual(images(words), images(tags), 'الصور نفسها بترتيبها — الترتيب صار هو الرابط');
  assert.ok(text(tags).startsWith(OMNI.FRAME_DECL), 'الإصدار الحاليّ بوسومه كما كان');
  assert.match(text(tags), /the reference image <IMAGE_REF_0>/);
  const w = text(words);
  assert.doesNotMatch(w, CONTROL_RE);
  assert.equal(w, fromTags(OMNI.FRAME_DECL_WORDS, text(tags)));
  assert.ok(w.startsWith('Two images are attached: the first image is the exact opening frame of the video and the second image is the reference image. '));
  assert.match(w, /the person from the reference image stands/, 'القالب بعبارته — السطر الأوّل يعرّف «the reference image»');
  assert.ok(w.includes(TP.FRAME_LOCK) && w.includes(veo.TREND_NO_CUTS) && w.endsWith(veo.TREND_TURN_GUIDE), 'قفل الإطار ولقطة واحدة وسطر الالتفات');
  assert.ok(w.includes(OMNI.imageWords(OMNI.FRAME_GUIDE)));
  assert.ok(!('generation_config' in tags) && !('generation_config' in words), 'بلا task افتراضيًّا (التوثيق: اللغة الطبيعيّة أوّلًا)');
  /* شخصان كشفهما الإطار في صورة واحدة: الإرشاد بالجمع */
  soloPeople = 2;
  try {
    const two = await pair(photo('heritagesing'));
    assert.equal(text(two.words), fromTags(OMNI.FRAME_DECL_WORDS, text(two.tags)));
    assert.ok(text(two.words).includes(OMNI.imageWords(veo.TREND_FRAME_GUIDE_MANY)));
    assert.doesNotMatch(text(two.words), CONTROL_RE);
  } finally { soloPeople = 1; }
});

test('٤. إطار المجموعة وصورة كلّ شخص: «the reference photos» بلا وسوم، والسطر يعدّ الصور ويسمّي أدوارها', async () => {
  for (const n of [2, 3]) {
    const { tags, words } = await pair(group(n));
    assert.deepEqual(images(words), ['GROUPFRAME', 'P1', 'P2', 'P3'].slice(0, n + 1));
    assert.deepEqual(images(words), images(tags));
    assert.ok(text(tags).startsWith(veo.groupRefDecl(n)));
    const w = text(words);
    assert.doesNotMatch(w, CONTROL_RE, n + ' أشخاص');
    assert.equal(w, fromTags(veo.groupRefDeclWords(n), text(tags)));
    assert.match(w, new RegExp('the reference photos show ' + n + ' '), 'القالب: صور المراجع بلا وسم');
    assert.ok(w.includes(OMNI.imageWords(veo.groupRefGuide(n))));
    assert.ok(!('generation_config' in words));
  }
  assert.equal(veo.groupRefDeclWords(2), 'Three images are attached: the first image is the exact opening frame of the video; the second and third images are the reference photos, one person in each. ');
  assert.equal(veo.groupRefDeclWords(3), 'Four images are attached: the first image is the exact opening frame of the video; the second, third and fourth images are the reference photos, one person in each. ');
});

test('٥. صورة تُحرَّك (منتج، مكان، إطار بعمر آخر) = أوّل إطار؛ وصورة مرجع وحده (بيكسار) = مرجع لا لقطة؛ و«حرّك الصورة» بأشخاصها = إطار ومرجع', async () => {
  /* أوّل إطار وحده */
  for (const trend of ['productad', 'drone', 'talkingpet', 'babyversion']) {
    const { tags, words } = await pair(photo(trend));
    assert.equal(images(words).length, 1, trend); assert.deepEqual(images(words), images(tags), trend);
    assert.ok(text(tags).startsWith('[# Sources <FIRST_FRAME>@Image1] '), trend);
    const w = text(words);
    assert.doesNotMatch(w, CONTROL_RE, trend);
    assert.equal(w, fromTags(veo.FIRST_DECL_WORDS, text(tags)), trend);
    /* السطر يسمّيها «the reference image» كما يقولها القالب («the exact product from the reference image») ويعطيها دورها */
    assert.ok(w.startsWith('One image is attached, the reference image: it is the exact opening frame of the video. '), trend);
    assert.ok(w.includes(' Use the first image as the starting frame.'), trend);
  }
  /* مرجع وحده: لا يظهر خامًا في أوّل الفيديو */
  const ref = await pair(photo('pixarstory'));
  assert.deepEqual(images(ref.words), ['USERPHOTO']);
  assert.ok(text(ref.tags).startsWith('[# References <IMAGE_REF_0>@Image1] '));
  assert.doesNotMatch(text(ref.words), CONTROL_RE);
  assert.equal(text(ref.words), fromTags(veo.REF_DECL_WORDS, text(ref.tags)));
  assert.ok(text(ref.words).startsWith('One image is attached: it is the reference image — a reference only, never a frame of the video. '));
  assert.ok(text(ref.words).endsWith(veo.TREND_REF_GUIDE), 'إرشاد المرجع لغة طبيعيّة أصلًا');
  /* الصورة نفسها أوّل إطار ومرجعًا */
  const self = await pair(photo('oldphoto'));
  assert.deepEqual(images(self.words), ['USERPHOTO', 'USERPHOTO']);
  assert.doesNotMatch(text(self.words), CONTROL_RE);
  assert.equal(text(self.words), fromTags(OMNI.FRAME_DECL_WORDS, text(self.tags)));
  assert.ok(text(self.words).endsWith(OMNI.imageWords(veo.PHOTO_REF_GUIDE)));
});

test('٦. الكشف («سامحوني»): الإطار أوّلًا وصورته نفسها آخر إطار — بالكلمات، وهي «the reference photo» التي يقطع إليها القالب', async () => {
  const { tags, words } = await pair(photo('sorryreveal'));
  assert.deepEqual(images(words), ['SOLOFRAME', 'USERPHOTO']); assert.deepEqual(images(words), images(tags));
  assert.ok(text(tags).startsWith(veo.TREND_REVEAL_DECL));
  const w = text(words);
  assert.doesNotMatch(w, CONTROL_RE);
  assert.equal(w, fromTags(veo.REVEAL_DECL_WORDS, text(tags)));
  assert.ok(w.startsWith('Two images are attached: the first image is the exact opening frame of the video and the second image, the reference photo, is its exact final frame. '));
  assert.match(w, /it cuts to the reference photo itself/);
  assert.match(w, /the clip ends exactly on the second image, the plain real photo\./);
  assert.match(w, /the person keeps the exact face, hair \(length and cut\), facial hair and build shown in the first image/);
});

test('٧. كلّ ترند بصورة على الإصدار الجديد: لا وسم ولا سطر تصريح، وسطر التعريف يعدّ الصور المرسلة فعلًا؛ وبلا صورة الأمر كما هو', async () => {
  const ids = Object.keys(VT.TRENDS);
  assert.ok(ids.length >= 55, 'القوالب: ' + ids.length);
  let withPhoto = 0;
  for (const trend of ids) {
    const q = await sent(photo(trend), { OMNI_VIDEO_MODEL: NEW });
    const w = text(q);
    assert.doesNotMatch(w, CONTROL_RE, trend);
    const m = ATTACH.exec(w);
    assert.ok(m, trend + ': ' + w.slice(0, 90));
    assert.equal(images(q).length, COUNT[m[2] || 'One'], trend + ': العدد في السطر = الصور المرسلة');
    withPhoto++;
  }
  assert.equal(withPhoto, ids.length);
  /* بلا صورة لا دور يُعرَّف: الطلبان متطابقان إلّا الاسم */
  const { tags, words } = await pair({ trend: 'pixarsketch', params: { text: 'أبو سعيد يبيع القهوة', sceneIndex: 0 }, ratio: '1280:720' });
  assert.deepEqual(words.input, tags.input);
  assert.doesNotMatch(text(words), ATTACH);
});

const DESC = 'رجل بكندورة بيضاء يمشي على شاطئ عند الغروب والكاميرا تتبعه ببطء';
const cinema = (extra) => Object.assign({ promptText: DESC, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg', style: 'realistic' }, extra || {});

test('٨. «سينمائي» بصورة: الطويل (فوق ١٠ث، أو ما سيُمدّ) على الإصدار الجديد من اليوم فبالكلمات؛ والقصير على الحاليّ بوسومه كما كان', async () => {
  /* ١٢ ثانية ← الإصدار الجديد بلا أيّ ضبط */
  const long = await sent(cinema({ durationSeconds: 12 }));
  assert.equal(long.model, NEW);
  assert.deepEqual(images(long), ['USERPHOTO', 'USERPHOTO'], 'الصورة نفسها أوّل إطار ومرجعًا');
  const w = text(long);
  assert.doesNotMatch(w, CONTROL_RE);
  const forced = await sent(cinema({ durationSeconds: 12 }), { OMNI_ROLE_STYLE: 'tags' });
  assert.equal(forced.model, NEW); assert.ok(text(forced).startsWith(OMNI.FRAME_DECL), 'OMNI_ROLE_STYLE=tags يعيد الوسوم بلا نشر');
  assert.equal(w, fromTags(OMNI.FRAME_DECL_WORDS, text(forced)));
  assert.equal(w, OMNI.FRAME_DECL_WORDS + VT.withPhotoLock(DESC, veo.VEO_FREE_IMAGE_MAX) + veo.TREND_NO_CUTS + OMNI.imageWords(veo.PHOTO_REF_GUIDE));
  assert.ok(!('generation_config' in long));
  /* ما سيُمدّ ولو قصر */
  const ext = await sent(cinema({ durationSeconds: 9, extendable: true }));
  assert.equal(ext.model, NEW); assert.doesNotMatch(text(ext), CONTROL_RE); assert.ok(text(ext).startsWith(OMNI.FRAME_DECL_WORDS));
  /* ٨ ثوانٍ ← الإصدار الحاليّ بوسومه حرفيًّا */
  const short = await sent(cinema({ durationSeconds: 8 }));
  assert.equal(short.model, OLD);
  assert.equal(text(short), OMNI.FRAME_DECL + VT.withPhotoLock(DESC, veo.VEO_FREE_IMAGE_MAX) + veo.TREND_NO_CUTS + veo.PHOTO_REF_GUIDE);
  /* المالك أعاد الطويل إلى الإصدار الحاليّ ← وسومه */
  const back = await sent(cinema({ durationSeconds: 12 }), { OMNI_LONG_MODEL: OLD });
  assert.equal(back.model, OLD); assert.ok(text(back).startsWith(OMNI.FRAME_DECL));
  /* يوم التحويل: الكلّ بالكلمات بمفتاح واحد أو باسم الإصدار */
  for (const env of [{ OMNI_ROLE_STYLE: 'words' }, { OMNI_VIDEO_MODEL: NEW }]) {
    const q = await sent(cinema({ durationSeconds: 8 }), env);
    assert.equal(text(q), w, JSON.stringify(env));
  }
  /* وسم أو سطر تصريح كتبه المستخدم نفسه: لا يصل الإصدار الجديد، والحاليّ كما كتبه */
  const typedDesc = 'a falcon <IMAGE_REF_0> flies over [# Sources <FIRST_FRAME>@Image1] the dunes';
  const typedNew = await sent({ promptText: typedDesc, ratio: '1280:720', durationSeconds: 12 });
  assert.equal(typedNew.model, NEW); assert.equal(text(typedNew), 'a falcon flies over the dunes');
  const typedOld = await sent({ promptText: typedDesc, ratio: '1280:720', durationSeconds: 8 });
  assert.equal(typedOld.model, OLD); assert.equal(text(typedOld), typedDesc);
  /* بلا صورة: لا دور — الأمر نفسه على الإصدارين */
  const a = await sent({ promptText: DESC, ratio: '1280:720', durationSeconds: 12 });
  const b = await sent({ promptText: DESC, ratio: '1280:720', durationSeconds: 8 });
  assert.equal(a.model, NEW); assert.equal(b.model, OLD); assert.equal(text(a), text(b)); assert.doesNotMatch(text(a), ATTACH);
});

test('٩. «سينمائي» بإطار مرسوم (أنمي) والشخصيّة الناطقة: قفل الهويّة يسمّي «the reference image» بلا وسم، والصورة الجاهزة أوّل إطار ومرجعًا', async () => {
  const anime = await sent(cinema({ style: 'anime', durationSeconds: 12 }));
  assert.equal(anime.model, NEW);
  assert.deepEqual(images(anime), ['SOLOFRAME', 'FACEREF']);
  assert.equal(text(anime), OMNI.FRAME_DECL_WORDS + VT.withIdentityLock(TP.STYLE_ANIME_VIDEO + DESC, veo.VEO_FREE_IMAGE_MAX, 'the reference image') + TP.FRAME_LOCK
    + veo.TREND_NO_CUTS + OMNI.imageWords(OMNI.FRAME_GUIDE));
  assert.match(text(anime), /^Two images are attached: .*MAIN CHARACTER: the real person in the reference image — keep their exact face/);
  assert.doesNotMatch(text(anime), CONTROL_RE);
  const animeOld = await sent(cinema({ style: 'anime', durationSeconds: 8 }));
  assert.equal(animeOld.model, OLD);
  assert.match(text(animeOld), /MAIN CHARACTER: the real person in the reference image <IMAGE_REF_0> — keep their exact face/, 'الحاليّ كما كان');
  assert.equal(text(anime), fromTags(OMNI.FRAME_DECL_WORDS, text(animeOld)));
  /* الشخصيّة الناطقة (keepPhoto): الكرتون الجاهز نفسه أوّل إطار ومرجعًا */
  const talk = { promptText: 'الشخصيّة تلوّح وتبتسم للكاميرا', ratio: '720:1280', imageBase64: 'CARTOON', imageMime: 'image/png', keepPhoto: true };
  const { tags, words } = await pair(talk);
  assert.deepEqual(images(words), ['CARTOON', 'CARTOON']); assert.deepEqual(images(tags), images(words));
  assert.equal(text(words), fromTags(OMNI.FRAME_DECL_WORDS, text(tags)));
  assert.doesNotMatch(text(words), CONTROL_RE);
});

test('١٠. omni-create: مع إطار = سطر التعريف وقفل «the reference image» والإرشاد بالكلمات داخل حدّ ١٥٠٠؛ وبلا إطار القفل نفسه بلا وسمه؛ والحاليّ كما كان', async () => {
  const body = { promptText: DESC, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' };
  const framedNew = await sentOmni(body, { OMNI_VIDEO_MODEL: NEW });
  assert.equal(framedNew.model, NEW);
  assert.deepEqual(images(framedNew), ['SOLOFRAME', 'FACEREF']);
  assert.equal(text(framedNew), OMNI.framedPrompt(DESC, 1, true));
  assert.equal(text(framedNew), OMNI.FRAME_DECL_WORDS + VT.withIdentityLock(DESC, 1500 - OMNI.FRAME_DECL_WORDS.length - OMNI.imageWords(OMNI.FRAME_GUIDE).length, 'the reference image')
    + OMNI.imageWords(OMNI.FRAME_GUIDE));
  assert.doesNotMatch(text(framedNew), CONTROL_RE);
  assert.ok(OMNI.framedPrompt('وصف '.repeat(900), 2, true).length <= 1500, 'الوصف يُقصّ لا الأدوار');
  assert.ok(OMNI.framedPrompt('وصف '.repeat(900), 2, true).endsWith(OMNI.imageWords(OMNI.FRAME_GUIDE)));
  const framedOld = await sentOmni(body);
  assert.equal(framedOld.model, OLD);
  assert.equal(text(framedOld), OMNI.framedPrompt(DESC, 1), 'الحاليّ حرفيًّا');
  assert.equal(text(framedOld), OMNI.FRAME_DECL + VT.withIdentityLock(DESC, 1500 - OMNI.FRAME_DECL.length - OMNI.FRAME_GUIDE.length, 'the reference image <IMAGE_REF_0>') + OMNI.FRAME_GUIDE);
  /* بلا إطار (OMNI_FIRST_FRAME=off): صورة واحدة مرجع ملامح */
  const plainNew = await sentOmni(body, { OMNI_VIDEO_MODEL: NEW, OMNI_FIRST_FRAME: 'off' });
  assert.deepEqual(images(plainNew), ['USERPHOTO']);
  assert.equal(text(plainNew), OMNI.stripRoleTags(VT.withIdentityLock(DESC, 1500, 'the reference image <IMAGE_REF_0>')));
  assert.match(text(plainNew), /^MAIN CHARACTER: the real person in the reference image — keep their exact face/);
  assert.doesNotMatch(text(plainNew), CONTROL_RE);
  assert.ok(!('generation_config' in plainNew));
  const plainOld = await sentOmni(body, { OMNI_FIRST_FRAME: 'off' });
  assert.equal(text(plainOld), VT.withIdentityLock(DESC, 1500, 'the reference image <IMAGE_REF_0>'));
  /* وسم كتبه المستخدم نفسه لا يصل الإصدار الجديد */
  const typed = await sentOmni({ promptText: 'a falcon <IMAGE_REF_0> over the dunes', ratio: '1280:720' }, { OMNI_VIDEO_MODEL: NEW });
  assert.equal(text(typed), 'a falcon over the dunes');
});

test('١١. task الاحتياطيّ: مطفأ افتراضيًّا؛ OMNI_ROLE_TASK=on يرسله لصيغة الكلمات حين للصور دور واحد وحده — والتمديد بمهمّته كما كان', async () => {
  const on = { OMNI_VIDEO_MODEL: NEW, OMNI_ROLE_TASK: 'on' };
  const task = (q) => (q.generation_config ? q.generation_config.video_config.task : null);
  assert.equal(task(await sent(photo('productad'), on)), 'image_to_video', 'أوّل إطار');
  assert.equal(task(await sent(photo('babyversion'), on)), 'image_to_video', 'إطار مبنيّ بلا مرجع');
  assert.equal(task(await sent(photo('pixarstory'), on)), 'reference_to_video', 'مرجع وحده');
  assert.equal(task(await sent(photo('sorryreveal'), on)), 'image_to_video', 'أوّل وآخر إطار');
  /* إطار مع مرجع: لا قيمة تجمع الدورين (التوثيق: task يقفل طريقة جمع الصور) */
  for (const b of [photo('heritagesing'), group(2), photo('oldphoto'), cinema({ durationSeconds: 12 })]) assert.equal(task(await sent(b, on)), null);
  assert.equal(task(await sent({ trend: 'pixarsketch', params: { text: 'قهوة', sceneIndex: 0 }, ratio: '1280:720' }, on)), null, 'بلا صورة');
  /* صيغة الوسوم لا تأخذه أبدًا */
  assert.equal(task(await sent(photo('productad'), { OMNI_ROLE_TASK: 'on' })), null);
  assert.equal(task(await sent(photo('productad'), { OMNI_VIDEO_MODEL: NEW, OMNI_ROLE_TASK: 'on', OMNI_ROLE_STYLE: 'tags' })), null);
  assert.equal(task(await sent(photo('productad'), { OMNI_VIDEO_MODEL: NEW })), null, 'مطفأ افتراضيًّا');
  assert.deepEqual(OMNI.roleTask('frame', true), {}); assert.deepEqual(OMNI.roleTask('mixed', true), {});
  /* التمديد: مهمّته extend ومعرّف التفاعل كما كانا */
  const first = await sent({ promptText: DESC, ratio: '1280:720', durationSeconds: 12 }, on);
  const more = await sent({ promptText: 'يكمل المشي نحو البحر', ratio: '1280:720', durationSeconds: 6, extendOp: first.op }, on);
  assert.equal(task(more), 'extend'); assert.ok(more.previous_interaction_id);
  /* omni-create */
  const body = { promptText: DESC, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' };
  assert.equal(task(await sentOmni(body, Object.assign({ OMNI_FIRST_FRAME: 'off' }, on))), 'reference_to_video');
  assert.equal(task(await sentOmni(body, on)), null, 'إطار مع لقطة الوجه');
  assert.equal(task(await sentOmni(body, { OMNI_FIRST_FRAME: 'off', OMNI_ROLE_TASK: 'on' })), null, 'الحاليّ بلا task');
  /* ترند عبر هذا المعالج: صورته بدور قالبه (منتج يُحرَّك لا مرجع ملامح) — لا task يفرض عليها دور المرجع */
  assert.equal(task(await sentOmni({ trend: 'productad', params: { text: 'عطر', sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' }, on)), null);
});

test('١٢. الاحتياط بوسمه: نقطته توثّق ربط المرجع بـ<IMAGE_REF_0> داخل النصّ — فلا تتبع صيغة الإصدار الجديد', async () => {
  for (const k of [...kv.keys()]) if (k.indexOf('db/') === 0) kv.delete(k);
  omniReply = () => ({ status: 429, body: { error: { code: 429, message: DEPLETED } } });
  try {
    await withEnv({ OMNI_VIDEO_MODEL: NEW }, async () => {
      calls = [];
      const r = res();
      await veo({ method: 'POST', query: { action: 'veo-create' }, body: Object.assign({ token: ownerTok, quality: 'fast', durationSeconds: 8, confirmed: true }, photo('pixarstory')) }, r);
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.match(String(r.body.op), /^bk\//);
      const omni = calls.find((c) => /\/interactions$/.test(c.url)).body;
      assert.doesNotMatch(text(omni), CONTROL_RE, 'المحرّك بالكلمات');
      const fal = calls.find((c) => /^https:\/\/queue\.fal\.run\//.test(c.url) && c.method === 'POST');
      assert.ok(/reference-to-video$/.test(fal.url));
      assert.match(fal.body.prompt, /the reference image <IMAGE_REF_0>/, 'الاحتياط بوسمه');
      assert.doesNotMatch(fal.body.prompt, /\[# |\bImage\d|attached: /, 'بلا سطر تصريح ولا سطر تعريف');
      assert.ok(fal.body.prompt.endsWith(veo.TREND_REF_GUIDE));
    });
  } finally { omniReply = null; for (const k of [...kv.keys()]) if (k.indexOf('db/') === 0) kv.delete(k); }
});
