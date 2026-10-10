// api/_lib/trend-people.js — v-trend-people (طلب المالك: «مش شخصيه وحده في الفيديو ٢ او ٣»).
//
// الجذر التقنيّ: محرّك الفيديو يقبل **صورة أولى واحدة** (`instance.image` تصير أوّل إطار)،
// فلا ينفع إرسال ثلاث صور كما هي. وميزة «مراجع الشخصيّات» عنده (حتى ٣) عرضيّة 16:9 ومدّة
// ٨ ثوانٍ فقط، بينما ٤١ من الترندات الـ٤٥ طوليّة — أي أنّها تقلب الترندات الطوليّة كلّها.
//
// فالمسار الوحيد الذي يخدم كلّ النسب: نبني من صور الأشخاص **أوّل إطار واحدًا** فيهم كلّهم
// معًا داخل مشهد الترند، بخطّ الدمج القائم نفسه (`merge-identity`: كلّ صورة بعنوانها، ولقطة
// مقرّبة لكلّ وجه، وقفل هويّة صريح)، ثمّ نعطيه للمحرّك فيحرّكه. لا سعر يتغيّر على المستخدم:
// نداء الدمج على مفتاح المالك (باب السعر لا يُمسّ بلا موافقته على البند نفسه).
//
// لا يرمي أبدًا: العطب يرجع { error, status } فيردّ المتّصل الخصم ويفكّ القفل.
'use strict';
const mergeIdentity = require('./merge-identity.js');

const MAX_PEOPLE = 3;
// نفس نقطة الدمج وإعداداتها في studio-create (حرارة ٠٫١٥ = أمانة للوجوه، لا إعادة تخيّل).
const IMAGE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=';
const IMAGE_TIMEOUT = 240000;

/** نسبة الترند إلى نسبة الصورة — الطوليّ 9:16 وما عداه 16:9، كي يطابق أوّل إطارٍ إطارَ الفيديو. */
function aspectOf(ratio) {
  return String(ratio || '') === '720:1280' ? '9:16' : '16:9';
}

/** مهمّة الدمج: أوّل إطار من مشهد الترند وفيه كلّ الأشخاص، وكلّ واحد بوجهه هو. */
function frameTask(n, scene) {
  return 'Create the OPENING FRAME of a video. Place ALL ' + n + ' people from the reference photos together in one shared scene, '
    + 'side by side and all ' + n + ' clearly visible with their faces unobstructed, in this scene: '
    + String(scene || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 700) + '\n'
    + 'Each person keeps their own exact face and identity from their own photo. Never merge two people into one face, '
    + 'never swap a face onto the wrong body, never replace anyone with an invented person, never drop anyone, '
    + 'and never add a person who is not in the reference photos. A single photorealistic still frame, all ' + n + ' faces sharp.';
}

/* cfg اختياريّ (v-omni-first-frame): { timeoutMs, temperature, imageSize, tag } — بلا cfg تبقى إعدادات إطار
   المجموعة حرفيًّا كما كانت (٠٫١٥، 2K، ٢٤٠ث). */
async function callImage(apiKey, parts, aspect, fetchImpl, cfg) {
  const c = cfg || {};
  const f = fetchImpl || fetch;
  const upstream = await f(IMAGE_URL + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: c.temperature != null ? c.temperature : 0.15, imageConfig: { imageSize: c.imageSize || '2K', aspectRatio: aspect } } }),
    signal: AbortSignal.timeout(c.timeoutMs || IMAGE_TIMEOUT),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    // المفتاح لا يُطبع أبدًا في السجلّ ولا في ردّ المستخدم.
    const detail = String((data && data.error && data.error.message) || 'unknown').replace(/key=[^&\s"']+/g, 'key=***').slice(0, 200);
    console.error('[trend-people] ' + (c.tag || 'group') + ' frame failed status=' + upstream.status + ' detail=' + detail);
    return { error: 'تعذّر تجهيز الأشخاص معًا الآن. أعد المحاولة بعد لحظات.', status: 502, retryable: true };
  }
  const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const img = respParts.find((p) => p && p.inlineData && p.inlineData.data);
  if (!img) {
    const why = String((((data.candidates || [])[0] || {}).finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || '').slice(0, 40);
    return { error: 'ما قدرت أجمع الأشخاص في مشهد واحد (قد تكون إحدى الصور محجوبة). جرّب صورًا أوضح.' + (why ? ' (' + why + ')' : ''), status: 502, why };
  }
  return { b64: img.inlineData.data, mime: img.inlineData.mimeType || 'image/png' };
}

/**
 * يبني أوّل إطار واحد فيه ٢–٣ أشخاص معًا في مشهد الترند.
 * photos: [{ data, mime }] بترتيب رفع المستخدم (شخصية ١…٣).
 * يرجع { b64, mime } أو { error, status }. صورة واحدة أو صفر = null (لا عمل، المسار القديم كما هو).
 */
async function groupFirstFrame(apiKey, photos, scene, ratio, o) {
  const opt = o || {};
  const list = (photos || []).filter((p) => p && p.data).slice(0, MAX_PEOPLE);
  if (list.length < 2) return null;
  if (!apiKey) return { error: 'Server is missing GEMINI_API_KEY', status: 500 };
  const shaped = list.map((p) => ({ data: String(p.data), mime: p.mime || mergeIdentity.sniffMime(p.data) }));
  let crops = [];
  // لقطات الوجوه ترفع الأمانة ولا تُوقف المسار: عطب الكشف = الدمج بالصور وعناوينها كما في الاستوديو.
  try { crops = await (opt.faceCrops || mergeIdentity.faceCrops)(apiKey, shaped); } catch (e) { console.warn('[trend-people] face crops skipped: ' + (e && e.message)); crops = []; }
  const parts = mergeIdentity.mergeParts(shaped, crops, frameTask(shaped.length, scene));
  return (opt.callImage || callImage)(apiKey, parts, aspectOf(ratio), opt.fetchImpl);
}

/* ── v-omni-first-frame (١ أكتوبر ٢٠٢٦، المالك بعد فشل قفل النصّ مرّتين بالدليل: «مافي شي تغيّر… شوف الفرق الشخصيّة»؛
   واختار صراحةً «أوّل لقطة بوجهها» بكلفتها ≈ ٠٫١٣٤$ لكلّ فيديو سينمائيّ بصورة، على مفتاحه، ونقاط المستخدم كما هي).
   المحرّك السينمائيّ لا يجعل الصورة أوّل إطار — يأخذها مرجعًا ويرسم الشخص من جديد، ووجه صورة «واقف كامل» صغير يُرى
   خشنًا فيُعاد رسمه تقريبًا (PITFALLS: ميزانيّة الرموز الثابتة). فنبني أوّل إطار من وصف المستخدم بوجهه هو — بخطّ إطار
   المجموعة نفسه (برو، حرارة ٠٫١٥، لقطة وجه مقرّبة) — ثمّ يحرّكه المحرّك. لا يرمي أبدًا: أيّ عطب = { error } فيعود
   المتّصل لمساره السابق حرفيًّا. */

/* أسلوب فنّيّ صريح في الوصف — بحدود عربيّة (\b لاتينيّ فقط، انظر image-intent.js): «كرتونة» صندوق لا أسلوب،
   و«ديزني/ليغو» تُذكر مكانًا ولعبة أكثر منها أسلوبًا، و«واقعي» ليس أسلوبًا هنا (الأصل صورة فوتوغرافيّة). */
const ART_STYLE_RE = /(?:^|[\s،,])(?:ب|ك|ال|بال|كال|لل)?(?:أنمي|انمي|أنيمي|انيمي|مانجا|كرتون|كارتون|بيكسار|جيبلي)(?:ي|ية|يه)?(?=$|[\s،,.!؟?])|\b(?:anime|manga|cartoon(?:ish)?|pixar|ghibli|claymation|pixel\s*art)\b/i;

/* عنوان اللقطة مكيَّف من v-pstyle-closeup: مرجع هويّة لا شخص إضافيّ */
const SOLO_CLOSEUP_LABEL = 'Close-up — the face of the same person in Photo 1, cropped and zoomed in from that same photo (identity reference only: NOT a second person, never drawn as an extra face, an inset or a frame):';

/** مهمّة أوّل إطار لشخص الصورة داخل مشهد الوصف — الوجه والجسم منه، والمكان واللبس من الوصف.
 *  o: { closeup، art، styleText (سطر أسلوب صريح يغلب سطر art — أنمي الواجهة) } */
function soloFrameTask(scene, o) {
  const opt = o || {};
  /* v-two-people: صورة فيها شخصان — كلّ واحد بوجهه ولقطته، ولا تبادل؛ المفرد كما كان حرفيًّا */
  const identity = opt.people > 1
    ? 'IDENTITY (mandatory): Photo 1 shows ' + opt.people + ' different real people and ALL of them appear, each one exactly themselves — their own face shape, eyes, eyebrows, nose, lips, jawline, facial hair, skin tone and marks, apparent age, and their own body shape and size — copied from Photo 1'
      + (opt.closeup ? ' and from the close-up of their own face' : '') + '. Never swap faces between them, never merge them into one face, never replace either with a different, younger, slimmer, prettier or more generic person; someone who knows them must recognize every one of them instantly.\n'
    : 'IDENTITY (mandatory): it is this exact same real person — the same face shape, eyes, eyebrows, nose, lips, jawline, facial hair, skin tone and marks, apparent age, and the same body shape and size — copied from Photo 1'
      + (opt.closeup ? ' and the close-up of their face' : '') + '. Never a different, younger, slimmer, prettier or more generic person; someone who knows them must recognize them instantly.\n';
  return 'TASK: create the OPENING FRAME of a video — one single still image — for this video description: "'
    + String(scene || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 900) + '".\n'
    + 'Show the real person from Photo 1 (if Photo 1 shows several people, all of them) inside the scene the description asks for, as it looks at the very start of the video. '
    + 'The setting, clothing, hairstyle, pose and lighting follow the description; anything it does not mention stays as in Photo 1. Never remove a hijab or headscarf that Photo 1 shows.\n'
    + identity
    + (opt.styleText || (opt.art ? 'Use the art style the description asks for, drawing their own real features in that style.' : 'Photorealistic, like a real film still.'))
    + ' Their face is clearly visible, unobstructed and sharp. No text, captions, logos or watermarks.';
}

/* ── v-video-first-frame (١ أكتوبر ٢٠٢٦، المالك بعد #853 وفيديو أنمي خرج نصًّا وتوقيعًا: «كل الفيديوات») — الخطوة
   نفسها لكلّ محرّك فيه صورة ولترندات الشخص الواحد، بكلفة الإطار نفسها على مفتاحه، ونقاط المستخدم كما هي. */

/* الأنمي/الكرتون المختار في الواجهة: صورة حقيقيّة كإطار أوّل لا تصير أنمي أبدًا — فالإطار نفسه يُرسم بالأسلوب. */
const ANIME_FRAME_STYLE = 'Draw the whole frame as a 2D anime / cartoon illustration — cel-shaded, bold clean outlines — drawing their own real features in that style.';
/* سطر الأسلوب في أمر الفيديو نفسه (بادئة للوصف) — للأنمي وحده؛ الواقعيّ كما كان بلا سطر. */
const STYLE_ANIME_VIDEO = 'STYLE: 2D anime / cartoon animation — illustrated characters, bold outlines, cel-shading; not realistic, not photographic. ';

/* «الإطار جاهز — حرّكه كما هو» (v-trend-identity): كان في veo-create لإطار المجموعة، وصار هنا ليشترك فيه كلّ محرّك. */
const FRAME_LOCK = ' The attached first frame ALREADY shows every person exactly as they must look in this'
  + ' video: animate that frame. Keep each face, hairstyle, skin tone and outfit exactly as they appear'
  + ' in it — do not re-age, restyle, redraw or replace anyone, and do not apply the transformation again.';

/* ترندات الشخص الواحد التي يُبنى لها أوّل إطار: شخص بعمره ومظهره ينتقل إلى مشهد أو أسلوب. خارجها عمدًا: المنتجات
   والأماكن والسيّارات والحيوانات والطعام؛ و«حرّك الصورة كما هي» (صورة قديمة، عائلة، بارالاكس، دوران، درون، مصغّر)؛
   وتغيّر العمر أو المظهر داخل الفيديو (طفولة، شيخوخة، نسخة أصغر أو مستقبليّة، تبديل اللبس، البطل الخارق) — قفل الإطار
   يمنع التحوّل فيكسرها؛ وبيكسار (شخصيّة طفل «مستوحاة» وتصميم واحد عبر ٣ مشاهد). */
const SOLO_FRAME_TRENDS = new Set(['heritagesing', 'tencountries', 'dance', 'celebselfie', 'eidgreeting', 'movieposter', 'agentpitch', 'testimonial', 'graduation', 'wedding', 'nationalday', 'actionhero', 'neonnight', 'actionfigure', 'catwalk', 'legofy', 'podcastclip', 'dayinlife', 'birthdaybash']);
/* منها بأسلوب فنّيّ صريح في قالبها (لعبة، ليغو) */
const SOLO_FRAME_ART_TRENDS = new Set(['actionfigure', 'legofy']);

/** مشهد قالب الترند وحده (بعد «SCENE:» وقبل منع الكتابة وقفل الهويّة) — فقرة «WHO THEY ARE» ليست مشهدًا. */
function trendScene(prompt) {
  const m = /SCENE:\s*([\s\S]*?)(?=\s*No on-screen text|\s*IDENTITY \(mandatory\)|$)/.exec(String(prompt || ''));
  return (m ? m[1] : String(prompt || '')).trim();
}

/** VIDEO_FIRST_FRAME=off يوقف أوّل الإطار في كلّ المحرّكات بلا نشر (يُقرأ عند النداء لا عند التحميل). */
function firstFrameOn() { return String(process.env.VIDEO_FIRST_FRAME || 'on').toLowerCase() !== 'off'; }

/* إعادة المحاولة (Runway المزدحم يُعاد ٣ مرّات، والمحادثة مرّتين) لا تدفع الإطار نفسه مرّة ثانية ما دامت النسخة دافئة:
   ذاكرة صغيرة بعمر ١٠ دقائق وأربعة مداخل، مفتاحها بصمة الصورة والوصف والأسلوب والنسبة. لا يُخزَّن شيء خارج الذاكرة. */
const FRAME_CACHE = new Map();
const FRAME_CACHE_TTL = 10 * 60 * 1000;
function frameKey(photo, scene, ratio, style, art) {
  return require('crypto').createHash('sha1').update(String(photo.data)).update('\u0000' + scene + '\u0000' + ratio + '\u0000' + (style || '') + '\u0000' + (art ? 1 : 0)).digest('hex');
}

/**
 * أوّل إطار لشخص صورة واحدة داخل مشهد وصف المستخدم.
 * photo: { data, mime? }؛ o: { budgetMs (الكشف + التوليد معًا)، style ('anime' من الواجهة)، artHint (قالب ترند فنّيّ)،
 *   faceCrops، callImage، fetchImpl }.
 * يرجع { b64, mime, ref } — ref لقطة الوجه (مرجع الملامح للمحرّك) أو null — أو { error } أو null بلا مدخلات.
 */
async function soloFirstFrame(apiKey, photo, scene, ratio, o) {
  const opt = o || {};
  if (!apiKey || !photo || !photo.data) return null;
  const started = Date.now();
  const budget = opt.budgetMs || 90000;
  try {
    const shaped = { data: String(photo.data), mime: photo.mime || mergeIdentity.sniffMime(photo.data) };
    const text = String(scene || '');
    const anime = opt.style === 'anime';
    const art = anime || !!opt.artHint || ART_STYLE_RE.test(text);
    const key = frameKey(shaped, text, aspectOf(ratio), anime ? 'anime' : '', art);
    const hit = FRAME_CACHE.get(key);
    if (hit && Date.now() - hit.t < FRAME_CACHE_TTL) return { b64: hit.b64, mime: hit.mime, ref: hit.ref, people: hit.people, cached: true };
    let crops = [];
    try { crops = await (opt.faceCrops || mergeIdentity.faceCrops)(apiKey, [shaped], { timeoutMs: Math.min(15000, budget), fetchImpl: opt.fetchImpl }); } catch (e) { console.warn('[trend-people] solo face crop skipped: ' + (e && e.message)); crops = []; }
    /* وجه واحد بارز: لقطته (v-pstyle-closeup). v-two-people: وجهان بارزان ولكلٍّ لقطته = كلّ لقطة بعنوان موضعها
       («the person on the left/right» كخطّ الدمج v-merge-faces) — كان الوجهان بلا لقطة فيُرسم الثاني من جديد.
       لقطة لأحد الوجهين وحده تبقى ممنوعة: تسحب ملامحه إلى الآخر. */
    const two = crops.length === 2 && crops.every((c) => c.who && c.who !== 'the person');
    const crop = (crops.length === 1 && crops[0].who === 'the person') ? crops[0] : null;
    const people = two ? 2 : (crop ? 1 : 0);
    const parts = [{ text: 'Photo 1 — the user\'s own photo of the real ' + (two ? 'people' : 'person') + ' to feature:' }, { inlineData: { mimeType: shaped.mime, data: shaped.data } }];
    if (crop) parts.push({ text: SOLO_CLOSEUP_LABEL }, { inlineData: { mimeType: crop.mime, data: crop.data } });
    if (two) crops.forEach((c, k) => parts.push({ text: 'Close-up ' + (k + 1) + ' — the face of ' + c.who + ' in Photo 1, cropped and zoomed in from that same photo (identity reference for that one person only: NOT an extra person, never drawn as an extra face, an inset or a frame):' }, { inlineData: { mimeType: c.mime, data: c.data } }));
    parts.push({ text: soloFrameTask(text, { closeup: !!crop || two, art, people, styleText: anime ? ANIME_FRAME_STYLE : '' }) });
    const left = budget - (Date.now() - started);
    if (left < 20000) return { error: 'budget' };
    /* 1K: الفيديو 720p/1080p، والسعر نفسه لـ1K و2K — وحمولة أصغر للمحرّك. الأسلوب الفنّيّ بحرارة الأسلوب (mergeTemperature). */
    const out = await (opt.callImage || callImage)(apiKey, parts, aspectOf(ratio), opt.fetchImpl, { timeoutMs: left, temperature: mergeIdentity.mergeTemperature(art, text), imageSize: '1K', tag: 'solo' });
    if (!out || !out.b64) return { error: (out && (out.why || out.status)) || 'no image' };
    /* ref: لقطة الوجه الواحد مرجعًا للمحرّك؛ مع شخصين الصورة نفسها (فيها الاثنان). people: عدد من كشفناهم (٠ = لا نعرف) */
    const res = { b64: out.b64, mime: out.mime || 'image/png', ref: crop ? { data: crop.data, mime: crop.mime } : null, people };
    FRAME_CACHE.set(key, Object.assign({ t: Date.now() }, res));
    while (FRAME_CACHE.size > 4) FRAME_CACHE.delete(FRAME_CACHE.keys().next().value);
    return res;
  } catch (e) {
    // يصل السجلّ — والمفتاح لا يُطبع أبدًا (كما في callImage).
    return { error: e && e.name === 'TimeoutError' ? 'timeout' : String((e && e.message) || e).replace(/key=[^&\s"']+/g, 'key=***').slice(0, 120) };
  }
}

module.exports = {
  MAX_PEOPLE, aspectOf, callImage /* v-actor-lipsync: بورتريه الممثّل */, frameTask, groupFirstFrame, ART_STYLE_RE, SOLO_CLOSEUP_LABEL, soloFrameTask, soloFirstFrame,
  ANIME_FRAME_STYLE, STYLE_ANIME_VIDEO, FRAME_LOCK, SOLO_FRAME_TRENDS, SOLO_FRAME_ART_TRENDS, trendScene, firstFrameOn, FRAME_CACHE,
};
