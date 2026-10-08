// Vercel Serverless Function: starts a Runway "Magnific" video-upscale task on
// an already-generated video (from /api/video-create), to offer an optional
// "higher quality" pass. Requires a logged-in account (same as video
// generation) but does NOT consume the daily video-generation quota — it's a
// secondary, optional enhancement on a video the user already generated.
//
// v-video-open-lock: كان «تسجيل دخول» فقط — بلا سقف ولا فحص حظر، ويقبل أيّ رابط https (ترقية مجّانيّة حتّى 4K لأيّ
// فيديو في العالم على رصيد المالك)، ونسخة verifyToken المحلّيّة تقبل تذكرة مهمّة البناء رمزًا لا ينتهي (بلا exp).
// الآن، بلا تغيير أسعار: رمز جلسة حقيقيّ فقط (_session.js)، وسقف ثابت مستقلّ ٣ ترقيات يوميًّا للحساب
// (checkAndConsumeCustom: المالك وVIP معفيّان، والمحظور مرفوض)، والرابط من مخرجات Runway التي سلّمها خادمنا نفسه
// (video-status.js يسجّلها عند النجاح) — لا رابط من خارج.
const crypto = require('crypto');

const RUNWAY_VERSION = '2024-11-06';
const { pickKey, encodeTaskId, RUNWAY_API_BASE } = require('./runway-keys');
const UPSCALE_DAILY = 3;
const OUTPUT_TTL_SEC = 2 * 86400; // روابط مخرجات Runway موقّعة وتنتهي خلال يوم أو يومين

const outputKey = (url) => 'runway:out:' + crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 40);

/** يسجّل مخرجات مهمّة Runway ناجحة سلّمها خادمنا — أفضل جهد، لا يرمي. */
async function rememberOutputs(urls) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter((u) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4);
  if (!list.length) return;
  try {
    const { kvSetRaw } = require('./kv.js');
    for (const u of list) await kvSetRaw(outputKey(u), '1', OUTPUT_TTL_SEC);
  } catch (e) { console.warn('[upscale] outputs not remembered:', e && e.message); }
}

async function isOurOutput(url) {
  try { return !!(await require('./kv.js').kvGetRaw(outputKey(url))); } catch (e) { return false; } // تعذّر التحقّق = ليس من مخرجاتنا
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { videoUrl, token, resolution } = body;

    const username = require('./_session.js').sessionUser(token);
    if (!username) {
      res.status(401).json({ error: 'auth_required' });
      return;
    }
    if (!videoUrl || !/^https:\/\//.test(String(videoUrl))) {
      res.status(400).json({ error: 'Missing or invalid videoUrl' });
      return;
    }
    if (!(await isOurOutput(videoUrl))) {
      res.status(400).json({ error: 'unknown_video' });
      return;
    }
    const usage = require('./_usage.js');
    const gate = await usage.checkAndConsumeCustom(token, null, usage.clientIp(req), 'video-upscale', UPSCALE_DAILY);
    if (!gate.allowed) {
      if (gate.banned) { res.status(403).json({ error: 'banned' }); return; }
      if (gate.reason === 'auth') { res.status(401).json({ error: 'auth_required' }); return; }
      res.status(429).json({ error: 'daily_limit_reached', limit: UPSCALE_DAILY });
      return;
    }

    const picked = pickKey();
    if (!picked) {
      res.status(500).json({ error: 'Server is missing RUNWAY_API_KEY' });
      return;
    }
    const apiKey = picked.key;

    const allowedRes = ['720p', '1k', '2k', '4k'];
    const finalRes = allowedRes.includes(resolution) ? resolution : '2k';

    const upstream = await fetch(RUNWAY_API_BASE + '/v1/video_upscale', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'X-Runway-Version': RUNWAY_VERSION,
      },
      body: JSON.stringify({
        model: 'magnific_video_upscaler_creative',
        videoUri: videoUrl,
        resolution: finalRes,
        flavor: 'natural',
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Runway error: ' + (data.error || JSON.stringify(data)).toString().slice(0, 500) });
      return;
    }

    res.status(200).json({ id: encodeTaskId(picked.index, data.id) });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
module.exports.rememberOutputs = rememberOutputs;
module.exports.UPSCALE_DAILY = UPSCALE_DAILY;
