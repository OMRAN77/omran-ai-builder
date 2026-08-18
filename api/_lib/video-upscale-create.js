// Vercel Serverless Function: starts a Runway "Magnific" video-upscale task on
// an already-generated video (from /api/video-create), to offer an optional
// "higher quality" pass. Requires a logged-in account (same as video
// generation) but does NOT consume the daily video-generation quota — it's a
// secondary, optional enhancement on a video the user already generated.
const crypto = require('crypto');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;
const RUNWAY_VERSION = '2024-11-06';
const { pickKey, encodeTaskId } = require('./runway-keys');

function verifyToken(token) {
  try {
    const [payload, sig] = String(token).split('.');
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.u;
  } catch (e) {
    return null;
  }
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

    const username = verifyToken(token);
    if (!username) {
      res.status(401).json({ error: 'auth_required' });
      return;
    }
    if (!videoUrl || !/^https:\/\//.test(String(videoUrl))) {
      res.status(400).json({ error: 'Missing or invalid videoUrl' });
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

    const upstream = await fetch('https://api.runwayml.com/v1/video_upscale', {
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
