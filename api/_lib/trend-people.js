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
function frameTask(n, scene, start, o) {
  const opt = o || {}; // v-trend-frame-look: { ageShift } = بلا قفل الشكل (عمر آخر)، { art } = صيغته الفنّيّة
  return 'Create the OPENING FRAME of a video. Place ALL ' + n + ' people from the reference photos together in one shared scene, '
    + 'side by side and all ' + n + ' clearly visible with their faces unobstructed, in this scene: '
    + String(scene || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 700) + '\n'
    /* v-trend-omni-face: ترند يتحوّل أثناء الفيديو — الإطار لحظته الأولى قبل التحوّل */
    + (start ? 'Show the moment BEFORE the change this scene describes happens: everyone still wears their own clothing and look from their own photo.\n' : '')
    + 'Each person keeps their own exact face and identity from their own photo. Never merge two people into one face, '
    + 'never swap a face onto the wrong body, never replace anyone with an invented person, never drop anyone, '
    + 'and never add a person who is not in the reference photos.' + (opt.ageShift ? '' : ' ' + frameLookLock(true, { art: !!opt.art, desc: 'the scene' })) + ' A single photorealistic still frame, all ' + n + ' faces sharp.';
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
    /* v-trend-codes: حالة المزوّد ونصّه المنظَّف (بلا المفتاح) للتصنيف عند المتّصل — veo-create يحوّلهما رمزًا (_videoFail.startFail) */
    return { error: 'تعذّر تجهيز الأشخاص معًا الآن. أعد المحاولة بعد لحظات.', status: 502, retryable: true, upstream: upstream.status, tech: detail };
  }
  const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const img = respParts.find((p) => p && p.inlineData && p.inlineData.data);
  if (!img) {
    const why = String((((data.candidates || [])[0] || {}).finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || '').slice(0, 40);
    return { error: 'ما قدرت أجمع الأشخاص في مشهد واحد (قد تكون إحدى الصور محجوبة). جرّب صورًا أوضح.' + (why ? ' (' + why + ')' : ''), status: 502, why, rejected: true };
  }
  return { b64: img.inlineData.data, mime: img.inlineData.mimeType || 'image/png' };
}

/**
 * يبني أوّل إطار واحد فيه ٢–٣ أشخاص معًا في مشهد الترند.
 * photos: [{ data, mime }] بترتيب رفع المستخدم (شخصية ١…٣).
 * يرجع { b64, mime } أو { error, status }. صورة واحدة أو صفر = null (لا عمل، المسار القديم كما هو).
 */
async function groupFirstFrame(apiKey, photos, scene, ratio, o) { // o: { timeoutMs, start, ageShift, art } (v-trend-frame-look)، swap (v-trend-face-swap)
  const opt = o || {};
  const list = (photos || []).filter((p) => p && p.data).slice(0, MAX_PEOPLE);
  if (list.length < 2) return null;
  if (!apiKey) return { error: 'Server is missing GEMINI_API_KEY', status: 500 };
  const shaped = list.map((p) => ({ data: String(p.data), mime: p.mime || mergeIdentity.sniffMime(p.data) }));
  let crops = [];
  // لقطات الوجوه ترفع الأمانة ولا تُوقف المسار: عطب الكشف = الدمج بالصور وعناوينها كما في الاستوديو.
  try { crops = await (opt.faceCrops || mergeIdentity.faceCrops)(apiKey, shaped); } catch (e) { console.warn('[trend-people] face crops skipped: ' + (e && e.message)); crops = []; }
  const art = !!opt.art || ART_STYLE_RE.test(String(scene || ''));
  const parts = mergeIdentity.mergeParts(shaped, crops, frameTask(shaped.length, scene, !!opt.start, { ageShift: !!opt.ageShift, art }));
  /* v-trend-omni: مهلة الإطار تُمرَّر حين يتبعه محرّك متزامن (Omni) في الدالّة نفسها — بلاها الإعداد السابق حرفيًّا (٢٤٠ث) */
  const out = await (opt.callImage || callImage)(apiKey, parts, aspectOf(ratio), opt.fetchImpl, opt.timeoutMs ? { timeoutMs: opt.timeoutMs } : undefined);
  /* v-trend-face-swap: وجه كلّ شخص من مرجعه (لقطة وجهه من صورته، وإلّا صورته يكشف face-swap وجهها) — عطبه = الإطار نفسه بلا مسار خطأ جديد */
  if (!opt.swap || !out || !out.b64 || opt.ageShift || art) return out;
  const refs = shaped.map((p, k) => { const c = crops.find((x) => x && x.of === k); return c ? { data: c.data, mime: c.mime, face: true } : { data: p.data, mime: p.mime, face: false }; });
  const sw = await require('./face-swap.js').lockFaces({ b64: out.b64, mime: out.mime }, refs, Object.assign({ apiKey, fetchImpl: opt.fetchImpl }, opt.swap));
  return Object.assign({}, out, sw.swapped ? { b64: sw.b64, mime: sw.mime } : {}, { swapped: sw.swapped, swapWhy: sw.reason || '' });
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

/* v-trend-frame-face (المالك بلقطة «عرض الأزياء»: «شوف الملامح كيف مختلفة» — وثانيتها الأولى أثبتت أنّ الوجه تغيّر في الإطار المبنيّ
   لا في المحرّك: وجه وسط الفيديو هو وجه الثانية الأولى نفسه). الإطار 1K وشخص كامل على المنصّة = وجه نحو ١/١٢ من ارتفاعه، فيرسم النموذج
   وجهًا عامًّا (فخّ الوجه الصغير، PITFALLS). مع detail: الإطار 2K (السعر نفسه) ولقطة تُبقي الوجه كبيرًا، ولون الشعر من الصورة. */
const FRAME_B64_MAX = 6000000; // ~٤٫٥ ميغا ثنائيّة: فوقها يُرمَّز إطار PNG بصيغة JPEG
const FRAME_FACE_DETAIL = 'Compose the frame so their face is large and finely detailed — at least about a sixth of the image height (a medium or medium-wide shot, never a small distant figure); the video can move the camera from there. Keep their natural hair colour from Photo 1 unless the description changes it.';

/* v-trend-frame-look (المالك بلقطتين — صورته في السيّارة ووجهه في «فري ستايل الشارع»: «شوف الفرق في الملامح… وشوف الإضافات خلها
   دقيقة في الأشكال»): الإطار أدار رأسه وأعطاه ابتسامة جانبيّة وعيونًا نصف مغمضة، وغمر وجهه بالنيون الأحمر، ورسم العقال حلقة سميكة
   بشكل آخر. قائمة الهويّة كانت ملامح الوجه وحدها: زاوية جديدة أو تعبير جديد يُرسم له وجه من جديد، والإضاءة الملوّنة تخفي الملامح،
   وما يُلبس على الرأس والوجه لم يُذكر أصلًا. السطر بعد الهويّة في كلّ إطار شخص بعمره (فرديّ وجماعيّ)؛ العمر الآخر بلا (يُرسم بعمر القالب). */
function frameLookLock(many, o) {
  const opt = o || {};
  const src = opt.src || (many ? 'their own photo' : 'Photo 1'); // شخصان في صورة واحدة: Photo 1 لكليهما
  const desc = opt.desc || 'the description'; // إطار المجموعة يسمّي وصفه «the scene»
  /* الأسلوب الفنّيّ (أنمي، لعبة، دمية): ملامحه تُرسم بالأسلوب — لا «كما صُوّر» ولا «لون البشرة الحقيقيّ» */
  const copy = opt.art ? '' : (many ? 'Copy each person\'s face from ' + src + ' as photographed, never reinterpreted: ' : 'Copy their face from ' + src + ' as photographed, never reinterpreted: ');
  return copy + (copy ? 'keep ' : 'Keep ') + (many ? 'each one\'s' : 'their')
    + ' head angle and facial expression close to ' + src + ' wherever the scene allows (no new smile, smirk or squint ' + desc + ' does not ask for) — a new angle or expression is what makes a face drift.'
    + ' Everything ' + (many ? 'each person wears' : 'worn') + ' on the head and face — ghutra or shemagh, agal, hijab or scarf, cap, glasses, jewellery — keeps the exact shape, size, thickness, pattern, colour and way of wearing shown in ' + src + ', unless ' + desc + ' changes it.'
    + (opt.art ? '' : ' Coloured scene light (neon, sunset, stage) may tint the background and the edges, but ' + (many ? 'every face stays' : 'their face stays') + ' clearly lit in its true skin tone so every feature reads exactly as in ' + src + '.'
      /* «قصّة حبّ الزومبي» (الشخص الثاني هو المتحوّل) والوصف الحرّ «خلّني زومبي/بصبغة وجه»: تغيير البشرة الذي يطلبه الوصف نفسه يُطبَّق
         على ملامحه هو — الضوء وحده لا يلوّن الوجه */
      + ' Light alone never recolours a face; only a change ' + desc + ' itself makes to ' + (many ? 'someone\'s' : 'their') + ' skin or face (make-up, face paint, a pale or tinted creature look) is applied, drawn on their own features.');
}

/** مهمّة أوّل إطار لشخص الصورة داخل مشهد الوصف — الوجه والجسم منه، والمكان واللبس من الوصف.
 *  o: { closeup، art، styleText (سطر أسلوب صريح يغلب سطر art — أنمي الواجهة)،
 *       start (v-trend-omni-face: تحوّل داخل الفيديو — اللحظة قبله)، ageShift (عمر آخر في القالب — ملامحه بذلك العمر)،
 *       detail (v-trend-frame-face: وجه كبير مفصَّل ولون الشعر من الصورة) } */
function soloFrameTask(scene, o) {
  const opt = o || {};
  /* v-trend-omni-face: تحوّل أثناء الفيديو (start) — اللحظة قبله: لبسه وشكله من الصورة، والمكان من الوصف (لا «اللبس من الوصف» معها).
     ورحلة العمر (start + ageShift): لحظتها الأولى طفل — العمر واللبس من الوصف، لا «كما في الصورة». */
  const look = opt.start && !opt.ageShift
    ? ' — BEFORE the change the description makes during the video begins. The setting, pose and lighting follow the description; their clothing, hairstyle and look stay exactly as in Photo 1, because that change has not happened yet. '
    : (opt.start ? ' — its very first moment, before the change the description makes during the video begins' : '')
      + '. The setting, clothing, hairstyle, pose and lighting follow the description; anything it does not mention stays as in Photo 1. ';
  /* قالب يُظهرهم بعمر آخر (طفلًا، أو مع نفسه الأصغر أو الأكبر) — سطر «نفس العمر، لا أصغر» يكسره */
  if (opt.ageShift) {
    const many = opt.people > 1;
    return 'TASK: create the OPENING FRAME of a video — one single still image — for this video description: "'
      + String(scene || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 900) + '".\n'
      + 'Show the real ' + (many ? 'people from Photo 1 (all ' + opt.people + ' of them)' : 'person from Photo 1') + ' inside the scene the description asks for, as it looks at the very start of the video'
      + look + 'Never remove a hijab or headscarf that Photo 1 shows.\n'
      + (many
        ? 'IDENTITY (mandatory): Photo 1 shows ' + opt.people + ' different real people. Every figure the description makes of each one (as a toddler, as their younger or older self) is that same person — their own face shape, eyes, eyebrows, nose, lips, skin tone and marks — copied from Photo 1'
          + (opt.closeup ? ' and from the close-up of their own face' : '') + ', drawn at the age the description asks for. Never swap faces between them, never merge them, never a stranger or a generic face; someone who knows them must recognize every one of them instantly at every age.\n'
        : 'IDENTITY (mandatory): every figure the description makes of them (as a toddler, as their younger or older self) is this exact same real person — the same face shape, eyes, eyebrows, nose, lips, skin tone and marks — copied from Photo 1'
          + (opt.closeup ? ' and the close-up of their face' : '') + ', drawn at the age the description asks for. Never a stranger or a generic face; someone who knows them must recognize them instantly at every age.\n')
      + (opt.styleText || (opt.art ? 'Use the art style the description asks for, drawing their own real features in that style.' : 'Photorealistic, like a real film still.'))
      + ' Their face is clearly visible, unobstructed and sharp.' + (opt.detail ? ' ' + FRAME_FACE_DETAIL : '') + ' No text, captions, logos or watermarks.';
  }
  /* v-two-people: صورة فيها شخصان — كلّ واحد بوجهه ولقطته، ولا تبادل؛ المفرد كما كان حرفيًّا */
  const identity = opt.people > 1
    ? 'IDENTITY (mandatory): Photo 1 shows ' + opt.people + ' different real people and ALL of them appear, each one exactly themselves — their own face shape, eyes, eyebrows, nose, lips, jawline, facial hair, skin tone and marks, apparent age, and their own body shape and size — copied from Photo 1'
      + (opt.closeup ? ' and from the close-up of their own face' : '') + '. Never swap faces between them, never merge them into one face, never replace either with a different, younger, slimmer, prettier or more generic person; someone who knows them must recognize every one of them instantly.\n'
    : 'IDENTITY (mandatory): it is this exact same real person — the same face shape, eyes, eyebrows, nose, lips, jawline, facial hair, skin tone and marks, apparent age, and the same body shape and size — copied from Photo 1'
      + (opt.closeup ? ' and the close-up of their face' : '') + '. Never a different, younger, slimmer, prettier or more generic person; someone who knows them must recognize them instantly.\n';
  return 'TASK: create the OPENING FRAME of a video — one single still image — for this video description: "'
    + String(scene || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 900) + '".\n'
    + 'Show the real person from Photo 1 (if Photo 1 shows several people, all of them) inside the scene the description asks for, as it looks at the very start of the video'
    + look + 'Never remove a hijab or headscarf that Photo 1 shows.\n'
    + identity
    + frameLookLock(opt.people > 1, { src: 'Photo 1', art: !!(opt.art || opt.styleText) }) + '\n'
    + (opt.styleText || (opt.art ? 'Use the art style the description asks for, drawing their own real features in that style.' : 'Photorealistic, like a real film still.'))
    + ' Their face is clearly visible, unobstructed and sharp.' + (opt.detail ? ' ' + FRAME_FACE_DETAIL : '') + ' No text, captions, logos or watermarks.';
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
const SOLO_FRAME_TRENDS = new Set(['heritagesing', 'tencountries', 'dance', 'celebselfie', 'eidgreeting', 'movieposter', 'agentpitch', 'testimonial', 'graduation', 'wedding', 'nationalday', 'actionhero', 'neonnight', 'actionfigure', 'catwalk', 'legofy', 'podcastclip', 'dayinlife', 'birthdaybash',
  /* v-trends-oct-12 (المالك ٢٥ أكتوبر «ضيف كلهم»): شخص في مشهد جديد بعمره ومظهره */
  'saveyourself', 'jetflyover', 'lostfilm80s', 'zombielove', 'standstill', 'spanishrap', 'orangebooth', 'gamechar',
  'bbywow', 'invisiblebike', 'slowmoentry']); // v-trends-oct-4
/* منها بأسلوب فنّيّ صريح في قالبها (لعبة، ليغو) */
const SOLO_FRAME_ART_TRENDS = new Set(['actionfigure', 'legofy', 'gamechar']);
/* منها لعبة صغيرة في عبوتها (دمية، ليغو): إطار 2K بلا سطر «الوجه سدس الارتفاع» (يخرج العبوة من الإطار) — اللعبة المرسومة وجهها كبير */
const SOLO_FRAME_TOY_TRENDS = new Set(['actionfigure', 'legofy']);
/* v-trends-oct-12: ترند شخص واحد بطبيعته («سامحوني» ينتهي بصورته، و«من ينقذك؟» نسختان منه) — صورة واحدة، والصور الزائدة تُهمل */
const SINGLE_SUBJECT_TRENDS = new Set(['sorryreveal', 'saveyourself', 'spanishrap', 'bbywow', 'invisiblebike', 'ceilingfan', 'slowmoentry']); // v-trends-faithful: المؤدّي واحد ومغنّي الشارع من المشهد

/* ── v-trend-omni-face (المالك ٢٤ أكتوبر بعد أوّل ترند على Omni: «يغيّر شكل الشخصيّة الملامح، والصورة اللي أحطها موجودة في أوّل الفيديو»).
   Omni يجعل <FIRST_FRAME> أوّل إطار حرفيًّا، ويصنع افتراضيًّا عدّة لقطات بقطع بينها (توثيقه: «a few different shots… you must prompt
   In a single continuous shot / No scene cuts») — فصورة المستخدم الخام تظهر أوّلًا ثمّ يقطع إلى المشهد ويرسم الوجه من جديد. على Omni وحده
   (Veo كما كان حرفيًّا) تُقسَّم ترندات الصورة خارج SOLO_FRAME_TRENDS بدور الصورة فيها (تصنيفان مستقلّان اتّفقا):
   - OMNI_FRAME_TRENDS: شخص ينتقل إلى مشهد أو أسلوب أو عمر آخر ويبقى عليه — أوّل إطار مبنيّ وقفله كترندات الشخص الواحد.
   - OMNI_MORPH_TRENDS: الشخص يتحوّل أثناء الفيديو — أوّل إطار للحظة قبل التحوّل، بلا قفل الإطار (القفل يمنع التحوّل).
   - OMNI_REF_TRENDS: الصورة مرجع شكل لا لقطة أولى (شخصيّة بيكسار عبر المشاهد، تهنئة رمضان بلا شخص في القالب).
   - AGE_SHIFT_TRENDS: منها بعمر آخر — مهمّة الإطار بلا «نفس العمر»، ولا لقطة وجه البالغ مرجعًا للمحرّك (تشدّ الطفل إلى عمره).
   الباقي (منتجات، أماكن، حيوانات، «حرّك الصورة كما هي») الصورة نفسها أوّل إطار كما هي — هذا المقصود منها. */
const OMNI_FRAME_TRENDS = new Set(['underwater', 'vhsflashback', 'ghibli', 'claymation', 'animeaction', 'babyversion', 'hugyounger', 'timecapsule']);
const OMNI_MORPH_TRENDS = new Set(['superhero', 'outfitswap', 'agejourney', 'ceilingfan']); // v-trends-oct-4: اللبس يتبدّل خلف شفرة المروحة أثناء الفيديو
const OMNI_REF_TRENDS = new Set(['pixarstory', 'ramadan']);
/* v-trends-oct-12: «سامحوني.. هذي الحقيقة» — يبدأ بإطار مبنيّ لنسخة أسطوريّة منه وينتهي بصورته نفسها: <FIRST_FRAME> الإطار
   و<LAST_FRAME> صورته (توثيق Omni: «the first image as the starting frame and the second image as the final frame») */
const OMNI_REVEAL_TRENDS = new Set(['sorryreveal']);
const AGE_SHIFT_TRENDS = new Set(['babyversion', 'hugyounger', 'timecapsule', 'agejourney']);
/* قوالب مونتاج أو عدّة لقطات بنصّها (عشر دول، يوم في الحياة، إعلان المنتج، الاسكتش) — لا يُطلب لها «بلا قطع» */
const MULTI_SHOT_TRENDS = new Set(['tencountries', 'dayinlife', 'productad', 'pixarsketch', 'sorryreveal']);
/** ترند فيه شخص يُنقل إلى مشهد (لا «حرّك الصورة») — صورته الخام لا تكون أوّل إطار على Omni. وترند بلا خانة صورة
 *  وصلته صورة (أداة المحادثة ترفق صورة المستخدم بأيّ ترند) = مرجع كذلك: قالبه لا يحرّك صورة. */
function omniPersonTrend(id) {
  const k = String(id || '');
  if (SOLO_FRAME_TRENDS.has(k) || OMNI_FRAME_TRENDS.has(k) || OMNI_MORPH_TRENDS.has(k) || OMNI_REF_TRENDS.has(k) || OMNI_REVEAL_TRENDS.has(k)) return true;
  const t = require('./video-trends.js').TRENDS[k];
  return !!(t && t.photo === 'none');
}

/** مشهد قالب الترند وحده (بعد «SCENE:» وقبل منع الكتابة وقفل الهويّة) — فقرة «WHO THEY ARE» ليست مشهدًا. */
function trendScene(prompt) {
  const m = /SCENE:\s*([\s\S]*?)(?=\s*No on-screen text|\s*IDENTITY \(mandatory\)|$)/.exec(String(prompt || ''));
  return (m ? m[1] : String(prompt || '')).trim();
}

/** VIDEO_FIRST_FRAME=off يوقف أوّل الإطار في كلّ المحرّكات بلا نشر (يُقرأ عند النداء لا عند التحميل). */
function firstFrameOn() { return String(process.env.VIDEO_FIRST_FRAME || 'on').toLowerCase() !== 'off'; }
/* v-photo-as-is (المالك ٢٧ أكتوبر: «الصور الي احطها… مطابقه لي الصوره مش تغير الملامح»): مع صورة ووصف حرّ لا تُعاد رسم الصورة
   إطارًا أوّل — الإطار المرسوم يغيّر الوجه (v-trend-frame-face) ومهمّته «Photorealistic» تحوّل الكرتون إنسانًا آخر. الصورة نفسها
   أوّل إطار في كلّ محرّك، إلّا «أنمي» المختار صراحةً (تحويل أسلوب مقصود). VIDEO_FREE_FRAME=on يعيد الرسم كما كان بلا نشر.
   الترندات خارج هذا (firstFrameOn وحده). */
function freeFrameOn(body) {
  if (!firstFrameOn()) return false;
  if (String(process.env.VIDEO_FREE_FRAME || 'off').toLowerCase() === 'on') return true;
  return !!body && body.style === 'anime';
}

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
 *   start وageShift (v-trend-omni-face، انظر soloFrameTask)، detail (v-trend-frame-face: 2K ووجه كبير)، hiRes (2K وحده — ترند الدمية
 *   والليغو: الوجه رأس لعبة صغير في عبوتها، وسطر «سدس الارتفاع» يكسرها)، faceCrops، callImage، fetchImpl،
 *   swap (v-trend-face-swap: { until, owner, only, multi } — تبديل وجه الإطار بوجه الصورة، انظر face-swap.js) }.
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
    const swap = !!opt.swap && !art && !opt.ageShift; // v-trend-face-swap: لا للأسلوب الفنّيّ (لعبة، أنمي) ولا للعمر الآخر
    const key = frameKey(shaped, text, aspectOf(ratio), (anime ? 'anime' : '') + (opt.start ? '|start' : '') + (opt.ageShift ? '|age' : '') + (opt.detail ? '|detail' : '') + (opt.hiRes ? '|2k' : '') + (swap ? '|swap' : ''), art);
    const hit = FRAME_CACHE.get(key);
    if (hit && Date.now() - hit.t < FRAME_CACHE_TTL) return Object.assign({ b64: hit.b64, mime: hit.mime, ref: hit.ref, people: hit.people, cached: true }, swap ? { swapped: hit.swapped, swapWhy: hit.swapWhy } : {});
    let crops = [];
    const stats = {}; // v-ai-video-speed: stats.faces = عدد الوجوه حين نجح الكشف (لا قيمة عند العطب)
    try { crops = await (opt.faceCrops || mergeIdentity.faceCrops)(apiKey, [shaped], { timeoutMs: Math.min(15000, budget), fetchImpl: opt.fetchImpl, stats }); } catch (e) { console.warn('[trend-people] solo face crop skipped: ' + (e && e.message)); crops = []; }
    /* وجه واحد بارز: لقطته (v-pstyle-closeup). v-two-people: وجهان بارزان ولكلٍّ لقطته = كلّ لقطة بعنوان موضعها
       («the person on the left/right» كخطّ الدمج v-merge-faces) — كان الوجهان بلا لقطة فيُرسم الثاني من جديد.
       لقطة لأحد الوجهين وحده تبقى ممنوعة: تسحب ملامحه إلى الآخر. */
    const two = crops.length === 2 && crops.every((c) => c.who && c.who !== 'the person');
    const crop = (crops.length === 1 && crops[0].who === 'the person') ? crops[0] : null;
    const people = two ? 2 : (crop ? 1 : 0);
    /* v-ai-video-speed (المالك ١٦ أكتوبر بلقطة «١٥٦ث» على صورة عطر في «فيديو AI فقط»): صورة كشفنا فيها صفر وجوه (منتج، مكان)
       في الوصف الحرّ لا تحتاج إطارًا مرسومًا — المحرّك يبدأ من الصورة نفسها. كان يُرسم إطار «شخص حقيقي» لزجاجة عطر
       (١٥–٤٠ ث، حتّى ٩٠) قبل أن يبدأ الفيديو أصلًا. needPerson يطلبه المتّصل؛ الأسلوب الفنّيّ يبقى (تحويله يحتاج الإطار)،
       وعطب الكشف (لا stats.faces) يبقى كما كان. */
    if (opt.needPerson && stats.faces === 0 && !art) return { error: 'no-person', noPerson: true };
    const parts = [{ text: 'Photo 1 — the user\'s own photo of the real ' + (two ? 'people' : 'person') + ' to feature:' }, { inlineData: { mimeType: shaped.mime, data: shaped.data } }];
    if (crop) parts.push({ text: SOLO_CLOSEUP_LABEL }, { inlineData: { mimeType: crop.mime, data: crop.data } });
    if (two) crops.forEach((c, k) => parts.push({ text: 'Close-up ' + (k + 1) + ' — the face of ' + c.who + ' in Photo 1, cropped and zoomed in from that same photo (identity reference for that one person only: NOT an extra person, never drawn as an extra face, an inset or a frame):' }, { inlineData: { mimeType: c.mime, data: c.data } }));
    parts.push({ text: soloFrameTask(text, { closeup: !!crop || two, art, people, styleText: anime ? ANIME_FRAME_STYLE : '', start: !!opt.start, ageShift: !!opt.ageShift, detail: !!opt.detail }) });
    const left = budget - (Date.now() - started);
    if (left < 20000) return { error: 'budget' };
    /* 1K: الفيديو 720p/1080p، والسعر نفسه لـ1K و2K — وحمولة أصغر للمحرّك. الأسلوب الفنّيّ بحرارة الأسلوب (mergeTemperature).
       v-trend-frame-face: detail (ترندات Omni) = 2K — ضعف البكسلات للوجه في لقطة واسعة، بالسعر نفسه. */
    const out = await (opt.callImage || callImage)(apiKey, parts, aspectOf(ratio), opt.fetchImpl, { timeoutMs: left, temperature: mergeIdentity.mergeTemperature(art, text), imageSize: (opt.detail || opt.hiRes) ? '2K' : '1K', tag: 'solo' });
    if (!out || !out.b64) return { error: (out && (out.why || out.status)) || 'no image' };
    /* v-trend-face-swap: قبل ترميز JPEG — التبديل يرمّز JPEG ٩٢ مرّة واحدة بنفسه، فلا ترميز ثانٍ فوقه. المراجع: لقطة الوجه، أو لقطتا
       الشخصين، وإلّا الصورة نفسها (يصغّرها face-swap ≤١٠٢٤) */
    let sw = null;
    /* only مع شخصين من صورة واحدة: ترتيب اللقطتين بحجم الوجه لا بالدور (من يصير زومبي يقرّره برو) = لا تبديل */
    if (swap && two && Array.isArray(opt.swap.only) && opt.swap.only.length) sw = { swapped: 0, reason: 'roles' };
    else if (swap) {
      const refs = two ? crops.map((c) => ({ data: c.data, mime: c.mime, face: true })) : (crop ? [{ data: crop.data, mime: crop.mime, face: true }] : [{ data: shaped.data, mime: shaped.mime, face: false }]);
      sw = await require('./face-swap.js').lockFaces({ b64: out.b64, mime: out.mime }, refs, Object.assign({ apiKey, fetchImpl: opt.fetchImpl }, opt.swap));
      if (sw.swapped) { out.b64 = sw.b64; out.mime = sw.mime; }
    }
    /* v-trend-frame-face: إطار 2K بصيغة PNG قد يبلغ ~١٠ ميغا بعد base64 في طلب المحرّك — يُرمَّز JPEG ٩٢ مرّة واحدة (من أصل بلا فقد)
       فوق FRAME_B64_MAX؛ أيّ عطب = PNG كما هو */
    if (!(sw && sw.swapped) && (opt.detail || opt.hiRes) && /png/i.test(out.mime || 'image/png') && out.b64.length > FRAME_B64_MAX) {
      try {
        const img = require('./image-diff.js').decodeImage(Buffer.from(out.b64, 'base64'));
        if (img) { out.b64 = Buffer.from(require('./face-composite.js').encodeJpeg(img, 92)).toString('base64'); out.mime = 'image/jpeg'; }
      } catch (e) { console.warn('[trend-people] frame jpeg skipped: ' + (e && e.message)); }
    }
    /* ref: لقطة الوجه الواحد مرجعًا للمحرّك؛ مع شخصين الصورة نفسها (فيها الاثنان). people: عدد من كشفناهم (٠ = لا نعرف) */
    const res = Object.assign({ b64: out.b64, mime: out.mime || 'image/png', ref: crop ? { data: crop.data, mime: crop.mime } : null, people }, sw ? { swapped: sw.swapped, swapWhy: sw.reason || '' } : {});
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
  ANIME_FRAME_STYLE, STYLE_ANIME_VIDEO, FRAME_LOCK, frameLookLock, SOLO_FRAME_TRENDS, SOLO_FRAME_ART_TRENDS, SOLO_FRAME_TOY_TRENDS, SINGLE_SUBJECT_TRENDS, trendScene, firstFrameOn, freeFrameOn, FRAME_CACHE,
  OMNI_FRAME_TRENDS, OMNI_MORPH_TRENDS, OMNI_REF_TRENDS, OMNI_REVEAL_TRENDS, AGE_SHIFT_TRENDS, MULTI_SHOT_TRENDS, omniPersonTrend, FRAME_FACE_DETAIL,
};
