// v-el-voices (المالك ٢٩ أكتوبر، بعد عشرة أيّام على الأصوات المدرَّبة بالفصحى «٦ من ١٠» والأصوات الجاهزة «صفر»: سمع مكتبة
// ElevenLabs فقال «كلهم اللي أريدهم»، واختار رجلًا وامرأة بلهجة خليجيّة، ثمّ «لا تنسى… أصوات لمحرّكات الفيديوهات بعد»):
// «استمع» على ردود المحادثة وتعليق الفيديو للمالك وحده بالصوتين اللذين اختارهما. لا يعمل إلّا بمفتاح ELEVENLABS_API_KEY
// في Vercel، وأصوات المكتبة لا تُستعمل من خارج موقعهم إلّا بباقة مدفوعة (قرار المالك) — بلا مفتاح لا شيء يتغيّر.
// البيئة: ELEVENLABS_API_KEY، EL_VOICE_MALE/EL_VOICE_FEMALE (رقما الصوتين؛ الافتراضيّان اختياره)، EL_MODEL.

const VOICES = { male: 'lXwVtAOOlP0Qf7aXOebM', female: '4uJbyDJGijiDphW2T3vP' };
const MODEL = 'eleven_v4';
const FALLBACK_MODEL = 'eleven_multilingual_v2'; // لو رُفض الأحدث باسمه

class ElVoicesError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

function settings() {
  return {
    key: String(process.env.ELEVENLABS_API_KEY || '').trim(),
    male: String(process.env.EL_VOICE_MALE || VOICES.male).trim(),
    female: String(process.env.EL_VOICE_FEMALE || VOICES.female).trim(),
    model: String(process.env.EL_MODEL || MODEL).trim(),
  };
}

function enabledFor(username) {
  let owner = false;
  try { owner = require('./_owner.js').isOwnerName(username); } catch (e) { owner = false; } // بلا وحدة المالك = لا أحد
  return owner && !!settings().key;
}

async function call(s, voiceId, model, text, speed) {
  const body = { text, model_id: model };
  if (speed && speed !== 1) body.voice_settings = { speed };
  try {
    return await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'xi-api-key': s.key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    throw new ElVoicesError('el-down', 'el_down', 502);
  }
}

// MP3 بصوت الرجل أو المرأة؛ speed معامل رقميّ (١ = عاديّ).
async function speak({ text, gender, speed }) {
  const s = settings();
  const t = String(text || '').trim().slice(0, 4000);
  if (!t) throw new ElVoicesError('empty-text', 'empty', 400);
  const voiceId = gender === 'male' ? s.male : s.female;
  let r = await call(s, voiceId, s.model, t, speed);
  if ((r.status === 400 || r.status === 422) && s.model !== FALLBACK_MODEL) {
    const why = await r.text().catch(() => '');
    if (/model/i.test(why)) r = await call(s, voiceId, FALLBACK_MODEL, t, speed);
    else r = new Response(why, { status: r.status });
  }
  if (!r.ok) {
    const why = await r.text().catch(() => '');
    // نفاد الرصيد الشهريّ، أو صوت مكتبة على حساب مجّانيّ (يحتاج باقة مدفوعة) — لا مفتاح ولا نصّ يُطبع
    if (/quota_exceeded|paid_plan_required|payment_required|free users/i.test(why) || r.status === 402) throw new ElVoicesError('el-quota', 'el_quota', 429);
    console.error('el voices', r.status, why.replace(/sk_[A-Za-z0-9]+/g, '***').slice(0, 300));
    throw new ElVoicesError('el-failed:' + r.status, 'el_failed', 502);
  }
  const audio = Buffer.from(await r.arrayBuffer());
  if (audio.length < 200) throw new ElVoicesError('el-empty', 'el_failed', 502);
  return audio;
}

module.exports = { enabledFor, speak, settings, ElVoicesError, VOICES, MODEL };
