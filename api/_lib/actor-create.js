'use strict';
/* api/_lib/actor-create.js — v-actor-lipsync (المالك ٢ أكتوبر، لقطة وضع «ممثل يتكلم — لهجة إماراتية»: «الصوت المتحدث ليس
   دقيق في اللهجة الإماراتية والكلام عربي ضعيف جدًّا»؛ ووافق على المحرّك الجديد وأضاف مفتاحه FAL_KEY بنفسه).

   الجذر: الوضع كان Veo وحده — يكتب الفيديو و**يخترع** الصوت من وصف إنجليزيّ، وعربيّته ضعيفة ولا يعرف اللهجة، ولا يقبل
   صوتًا جاهزًا. هنا الصوت أوّلًا ثمّ الصورة تتكلّم به:
     ١) الكلام بالحرف بصوت إماراتيّ أصيل — حمدان (رجل) أو فاطمة (امرأة)، أصوات Azure نفسها في قراءة الردود (tts.js)؛
     ٢) الوجه: صورة المستخدم كما هي (هويّته بلا إعادة رسم)، وبلا صورة بورتريه يُولَّد من الوصف؛
     ٣) OmniHuman (fal) يحرّك الوجه والشفاه على الصوت نفسه.
   الكلفة والخصم كما في Veo حرفيًّا (المالك بلا حدّ؛ غيره نقاط veo_video، تُردّ عند الفشل، وقفل الثلاث دقائق).
   أيّ عطب قبل الإرسال (لا مفتاح، تعذّر الصوت أو الوجه) = { fallback: true } بلا خصم (أو بخصم مردود كاملًا)، والعميل يكمل
   على Veo كما كان. v-video-open-lock: الهويّة والخصم صارا قبل الصوت المدفوع، لا بعده.
   المفاتيح تُقرأ داخل المعالج لا في نطاق الوحدة (بيئة عارية عند التحميل). */

const LIPSYNC_MODEL_DEFAULT = 'fal-ai/bytedance/omnihuman/v1.5';
const QUEUE = 'https://queue.fal.run/';
const VOICES = { male: 'ar-AE-HamdanNeural', female: 'ar-AE-FatimaNeural' };
const MP3_BYTES_PER_SEC = 6000; // audio-24khz-48kbitrate-mono-mp3 = ٤٨ ألف بت في الثانية
const ACTOR_MAX_SEC_DEFAULT = 15; // سقف الكلفة: المحرّك يُحاسَب بالثانية
const SPEECH_MAX = 300; // حدّ خانة الكلام في الواجهة نفسه
// v-video-open-lock: سقف متسامح لسرعة النطق بالحروف (بلا تشكيل ولا مسافات ولا علامات) — النطق العاديّ يُقدَّر بنحو
// ١١ حرفًا في الثانية (تقدير لا قياس)، فما يزيد على ١٦×السقف لا يتّسع له السقف ويُرفض قبل أن يُدفع ثمن توليد صوته.
// التقدير حدّ أدنى للمدّة فلا يرفض كلامًا يمكن أن يتّسع، والمدّة الفعليّة بعد التوليد تبقى الحكم الأخير.
const FAST_LETTERS_PER_SEC = 16;
const minSecondsOf = (text) => (String(text || '').match(/[\p{L}\p{N}]/gu) || []).length / FAST_LETTERS_PER_SEC;

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function ssmlFor(text, gender) {
  return '<speak version="1.0" xml:lang="ar-AE"><voice name="' + (VOICES[gender] || VOICES.male) + '">'
    + '<prosody rate="0%" pitch="0%">' + xml(String(text || '').slice(0, SPEECH_MAX)) + '</prosody></voice></speak>';
}
const durationOf = (bytes) => Math.round((Number(bytes) || 0) / MP3_BYTES_PER_SEC * 10) / 10;

/** الكلام بصوت إماراتيّ أصيل. المفتاح المجّانيّ أوّلًا ثمّ المدفوع (كما في tts.js). { b64, sec } أو { error } — لا يرمي. */
async function emiratiVoice(text, gender, fetchImpl) {
  const f = fetchImpl || fetch;
  const region = process.env.AZURE_SPEECH_REGION || 'uaenorth';
  const accts = [];
  const free = String(process.env.AZURE_SPEECH_KEY_FREE || '').trim();
  const paid = String(process.env.AZURE_SPEECH_KEY || '').trim();
  if (free) accts.push({ key: free, region: String(process.env.AZURE_SPEECH_REGION_FREE || '').trim() || region });
  if (paid) accts.push({ key: paid, region });
  if (!accts.length) return { error: 'no_voice_key' };
  for (const a of accts) {
    try {
      const r = await f('https://' + a.region + '.tts.speech.microsoft.com/cognitiveservices/v1', {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': a.key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'omran-ai-builder-actor' },
        body: ssmlFor(text, gender),
      });
      if (r && r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 1000) return { b64: buf.toString('base64'), sec: durationOf(buf.length) };
      } else console.warn('[actor] voice HTTP ' + (r && r.status));
    } catch (e) { console.warn('[actor] voice ' + (e && e.message)); } // تعثّر هذا الحساب — نجرّب التالي
  }
  return { error: 'voice_failed' };
}

/** بورتريه الممثّل حين لا صورة: وجه واضح للكاميرا وفم مغلق (المحرّك يحرّكه)، بنسبة الفيديو. */
function portraitTask(desc, gender) {
  const who = String(desc || '').trim()
    || (gender === 'female' ? 'An Emirati woman in an elegant black abaya and sheila, warm friendly face'
      : 'An Emirati man in a traditional white kandura and ghutra, warm friendly face');
  return 'A photorealistic portrait photo of ONE person for a talking video: ' + who.replace(/[\r\n]+/g, ' ').slice(0, 600)
    + '. Head and upper body, facing the camera directly, face fully visible and sharp, mouth closed, natural relaxed expression, '
    + 'soft even lighting, a simple background that fits the description. No text, no captions, no logos.';
}

/** يرسل للمحرّك عبر الطابور. { id, statusUrl, responseUrl } أو { error, status } — لا يرمي. */
async function submitLipsync(key, input, fetchImpl) {
  const f = fetchImpl || fetch;
  const model = String(process.env.ACTOR_LIPSYNC_MODEL || '').trim() || LIPSYNC_MODEL_DEFAULT;
  try {
    const r = await f(QUEUE + model, { method: 'POST', headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.request_id) {
      console.error('[actor] lipsync submit status=' + r.status + ' ' + JSON.stringify(d).slice(0, 240));
      return { error: 'submit_failed', status: r.status };
    }
    // روابط الحالة والنتيجة كما أعادها المزوّد (المعرّف ذو المسار الفرعيّ يغيّر شكلها) — وإلّا تُبنى من المعرّف
    const base = QUEUE + model.split('/').slice(0, 2).join('/') + '/requests/' + d.request_id;
    return { id: String(d.request_id), statusUrl: d.status_url || base + '/status', responseUrl: d.response_url || base };
  } catch (e) {
    console.error('[actor] lipsync submit ' + (e && e.message));
    return { error: 'submit_failed', status: 502 };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  let pointsLib = null, COST = 0, chargedUser = null, videoLocked = null;
  const undo = async () => {
    if (chargedUser) { await pointsLib.refundPoints(chargedUser, COST); chargedUser = null; }
    if (videoLocked) { await require('./abuse-guard.js').releaseVideoLock(videoLocked); videoLocked = null; }
  };
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const speech = String(body.speech || '').trim();
    const gender = body.voiceGender === 'female' ? 'female' : 'male';
    const desc = String(body.promptText || '').trim();
    const photo = String(body.imageBase64 || '').trim();
    if (!speech) { res.status(400).json({ error: 'اكتب أوّلًا شو يقول الممثل.' }); return; }
    // v-video-open-lock: الطويل يُرفض قبل أيّ نداء مدفوع — كان يُقصّ بصمت إلى ٣٠٠ حرف ثمّ يُولَّد صوته ويُرفض بعد الدفع
    const maxSec = Number(process.env.ACTOR_MAX_SEC) || ACTOR_MAX_SEC_DEFAULT;
    if (speech.length > SPEECH_MAX) { res.status(400).json({ error: 'كلام الممثل طويل — خلّه أقصر من ' + SPEECH_MAX + ' حرف.' }); return; }
    if (minSecondsOf(speech) > maxSec) { res.status(400).json({ error: 'كلام الممثل طويل — خلّه أقصر من ' + maxSec + ' ثانية.' }); return; }

    const falKey = String(process.env.FAL_KEY || '').trim();
    if (!falKey) { console.warn('[actor] FAL_KEY missing — fallback'); res.status(503).json({ fallback: true, error: 'lipsync_unavailable' }); return; }

    // ١) الهويّة والحظر والتأكيد والرصيد والقفل قبل أيّ نداء مدفوع (v-video-open-lock: كان الصوت المدفوع يُولَّد لأيّ
    //    طلب بلا رمز قبل هذا كلّه). الخصم كما في Veo حرفيًّا، وكلّ عطب بعده (الصوت، الطول الفعليّ، الوجه، المحرّك) يردّه كاملًا.
    pointsLib = require('./points.js');
    COST = pointsLib.COSTS.veo_video;
    const gate = await require('./_videoUsage').checkOwnerBypass(body.token);
    if (!gate.allowed) {
      if (gate.reason === 'auth') { res.status(401).json({ error: 'auth_required' }); return; }
      const username = pointsLib.verifyPointsToken(body.token);
      if (!username) { res.status(401).json({ error: 'auth_required' }); return; }
      const g = pointsLib.requireConfirmation(body, COST, 'فيديو ممثل يتكلم');
      if (g) { res.status(g.status).json(g.payload); return; }
      const pay = await pointsLib.spendPoints(username, COST, 'veo_video');
      if (!pay.ok && pay.banned) { res.status(403).json({ error: 'banned' }); return; }
      if (!pay.ok) { res.status(402).json({ error: 'points_insufficient', needed: COST, points: pay.points || 0 }); return; }
      chargedUser = username;
      if (!pay.owner) {
        const vl = await require('./abuse-guard.js').videoLock(username);
        if (!vl.ok) { await undo(); res.status(429).json({ error: 'video_cooldown', retryAfter: vl.retryAfter }); return; }
        videoLocked = username;
      }
    }

    // ٢) الصوت: عطبه = ردّ الخصم والقفل ثمّ المسار القديم (Veo)، وطوله الفعليّ يُعرف قبل أن يُحاسَب المحرّك بالثانية
    const voice = await emiratiVoice(speech, gender);
    if (voice.error) { await undo(); res.status(503).json({ fallback: true, error: voice.error }); return; }
    if (voice.sec > maxSec) {
      await undo();
      res.status(400).json({ error: 'كلام الممثل طويل (' + Math.round(voice.sec) + ' ثانية) — خلّه أقصر من ' + maxSec + ' ثانية.' });
      return;
    }

    // ٣) الوجه: صورة المستخدم كما هي، وإلّا بورتريه من الوصف بنسبة الفيديو
    let img = photo ? { b64: photo, mime: String(body.imageMime || 'image/jpeg') } : null;
    if (!img) {
      const gk = String(process.env.GEMINI_API_KEY || '').trim();
      const tp = require('./trend-people.js');
      const made = gk ? await tp.callImage(gk, [{ text: portraitTask(desc, gender) }], tp.aspectOf(body.ratio), null, { temperature: 0.6, imageSize: '1K', timeoutMs: 90000, tag: 'actor' }) : { error: 'no_image_key' };
      if (!made || !made.b64) { await undo(); res.status(503).json({ fallback: true, error: 'portrait_failed' }); return; }
      img = made;
    }

    // ٤) المحرّك: الصورة والصوت معًا (روابط data — لا رفع وسيط)، و٧٢٠p يكفي ويقبل حتّى ٦٠ ثانية
    const input = {
      image_url: 'data:' + img.mime + ';base64,' + img.b64,
      audio_url: 'data:audio/mpeg;base64,' + voice.b64,
      resolution: '720p',
    };
    if (desc) input.prompt = desc.slice(0, 500);
    const sub = await submitLipsync(falKey, input);
    if (sub.error) { await undo(); res.status(503).json({ fallback: true, error: sub.error }); return; }

    await require('./kv.js').kvPutJSON('actor/req/' + sub.id, { s: sub.statusUrl, r: sub.responseUrl, at: Date.now() });
    // v-video-refund: تذكرة المهمّة — فشلها عند الاستطلاع يردّ الخصم ويفكّ القفل
    await require('./video-job.js').rememberVideoJob('actor:' + sub.id, { username: chargedUser, cost: COST, locked: !!videoLocked });
    chargedUser = null; videoLocked = null; // التذكرة صارت مسؤولة عن الردّ — لا ردّ مزدوج
    res.status(200).json({ id: sub.id, seconds: voice.sec });
  } catch (e) {
    try { await undo(); } catch (e2) { console.error('[actor] refund after error failed: ' + (e2 && e2.message)); }
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
module.exports.ssmlFor = ssmlFor;
module.exports.emiratiVoice = emiratiVoice;
module.exports.portraitTask = portraitTask;
module.exports.submitLipsync = submitLipsync;
module.exports.VOICES = VOICES;
module.exports.LIPSYNC_MODEL_DEFAULT = LIPSYNC_MODEL_DEFAULT;
module.exports.ACTOR_MAX_SEC_DEFAULT = ACTOR_MAX_SEC_DEFAULT;
module.exports.minSecondsOf = minSecondsOf;
module.exports.SPEECH_MAX = SPEECH_MAX;
