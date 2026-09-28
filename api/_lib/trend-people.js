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

async function callImage(apiKey, parts, aspect, fetchImpl) {
  const f = fetchImpl || fetch;
  const upstream = await f(IMAGE_URL + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.15, imageConfig: { imageSize: '2K', aspectRatio: aspect } } }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    // المفتاح لا يُطبع أبدًا في السجلّ ولا في ردّ المستخدم.
    const detail = String((data && data.error && data.error.message) || 'unknown').replace(/key=[^&\s"']+/g, 'key=***').slice(0, 200);
    console.error('[trend-people] group frame failed status=' + upstream.status + ' detail=' + detail);
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

module.exports = { MAX_PEOPLE, aspectOf, frameTask, groupFirstFrame };
