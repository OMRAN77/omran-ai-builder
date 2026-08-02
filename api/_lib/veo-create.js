// Starts a Google Veo 3 video generation via the Gemini API
// (predictLongRunning). Owner-only for now because each 8s clip costs
// real money. Uses GEMINI_API_KEY env var.
const { checkOwnerBypass } = require('./_videoUsage');

const GL = 'https://generativelanguage.googleapis.com/v1beta';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { promptText, ratio, token, quality, imageBase64, imageMime, durationSeconds } = body;
    let durSec = parseInt(durationSeconds, 10);
    if (![4, 6, 8].includes(durSec)) durSec = 0; // 0 = default (leave to Veo)
    if (!promptText || !String(promptText).trim()) {
      res.status(400).json({ error: 'Missing promptText' });
      return;
    }

    // 💰 نظام النقاط: Veo 3 متاح للجميع — المالك بلا حدود، وغيره يدفع
    // 400 نقطة للفيديو الواحد. يُسترجع الرصيد تلقائيًا لو فشل الطلب.
    const pointsLib = require('./points.js');
    const gate = await checkOwnerBypass(token);
    let chargedUser = null;
    if (!gate.allowed) {
      if (gate.reason === 'auth') { res.status(401).json({ error: 'auth_required' }); return; }
      const username = pointsLib.verifyPointsToken(token);
      if (!username) { res.status(401).json({ error: 'auth_required' }); return; }
      const pay = await pointsLib.spendPoints(username, pointsLib.COSTS.veo_video, 'veo_video');
      if (!pay.ok) {
        res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.veo_video, points: pay.points || 0 });
        return;
      }
      chargedUser = username;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' }); return; }

    const model = quality === 'high' ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview';
    const aspectRatio = ratio === '720:1280' ? '9:16' : '16:9';
    const prompt = String(promptText).trim().slice(0, 1500);

    // Veo 3.1 image-to-video: attach a starting image when provided so the
    // generated clip animates that exact character (with native audio/speech).
    const instance = { prompt };
    if (imageBase64 && String(imageBase64).trim()) {
      instance.image = {
        bytesBase64Encoded: String(imageBase64).trim(),
        mimeType: imageMime || 'image/png',
      };
    }

    const upstream = await fetch(GL + '/models/' + model + ':predictLongRunning', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [instance],
        parameters: durSec ? { aspectRatio, durationSeconds: durSec } : { aspectRatio },
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : JSON.stringify(data);
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.veo_video);
      res.status(upstream.status).json({ error: 'Veo error: ' + String(msg).slice(0, 500) });
      return;
    }
    res.status(200).json({ op: data.name });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
