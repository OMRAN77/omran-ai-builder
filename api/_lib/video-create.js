// Vercel Serverless Function: starts an AI video generation task on Runway
// (text-to-video, Gen-4.5) using the site owner's own server-side API key
// (RUNWAY_API_KEY env var). Requires a logged-in account and enforces a
// small daily quota per account (see api/_videoUsage.js) because each
// generated video costs the owner real money.
const { checkVideoQuota, consumeVideo, checkOwnerBypass } = require('./_videoUsage');
const { pickKey, encodeTaskId, clearStuckTask, saveLastTask } = require('./runway-keys');

const RUNWAY_VERSION = '2024-11-06';

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
    const { promptText, ratio, duration, style, token, longMode, imageBase64, imageMime } = body;

    if (!promptText || !String(promptText).trim()) {
      res.status(400).json({ error: 'Missing promptText' });
      return;
    }

    // "Long video" mode (many chained scenes for a multi-minute video) is
    // restricted to the owner's own account and bypasses the small daily
    // quota entirely, since it intentionally burns many scenes in one run.
    // Everyone else still goes through the normal per-account daily limit.
    let usageResult;
    if (longMode === true) {
      usageResult = await checkOwnerBypass(token);
      if (!usageResult.allowed) {
        if (usageResult.reason === 'auth') {
          res.status(401).json({ error: 'auth_required' });
        } else {
          res.status(403).json({ error: 'owner_only' });
        }
        return;
      }
    } else {
      usageResult = await checkVideoQuota(token);
      if (!usageResult.allowed) {
        if (usageResult.reason === 'auth') {
          res.status(401).json({ error: 'auth_required' });
        } else {
          res.status(429).json({ error: 'daily_limit_reached' });
        }
        return;
      }
    }

    const picked = pickKey();
    if (!picked) {
      res.status(500).json({ error: 'Server is missing RUNWAY_API_KEY' });
      return;
    }
    const apiKey = picked.key;

    const allowedRatios = ['1280:720', '720:1280'];
    const finalRatio = allowedRatios.includes(ratio) ? ratio : '1280:720';
    let finalDuration = parseInt(duration, 10);
    if (!Number.isFinite(finalDuration) || finalDuration < 2) finalDuration = 5;
    if (finalDuration > 10) finalDuration = 10;

    let finalPrompt = String(promptText).trim().slice(0, 950);
    if (style === 'anime') {
      finalPrompt += ', anime and cartoon animation style, 2D animated, vibrant colors';
    } else {
      finalPrompt += ', cinematic realistic footage, photorealistic, high detail';
    }

    // Auto-cancel any previous stuck task on this key so it doesn't hog the
    // account's single concurrency slot forever (see runway-keys.js).
    await clearStuckTask(picked.index, apiKey);

    // 🎬 صورة مرفقة → image_to_video (تحريك الصورة نفسها)، بدونها → text_to_video
    const useImage = !!(imageBase64 && String(imageBase64).length > 50);
    const endpoint = useImage
      ? 'https://api.dev.runwayml.com/v1/image_to_video'
      : 'https://api.dev.runwayml.com/v1/text_to_video';
    const upstreamBody = useImage
      ? {
          model: 'gen4_turbo',
          promptImage: 'data:' + (imageMime || 'image/png') + ';base64,' + imageBase64,
          promptText: finalPrompt,
          ratio: finalRatio,
          duration: finalDuration,
        }
      : {
          model: 'gen4.5',
          promptText: finalPrompt,
          ratio: finalRatio,
          duration: finalDuration,
        };
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'X-Runway-Version': RUNWAY_VERSION,
      },
      body: JSON.stringify(upstreamBody),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Runway error: ' + (data.error || JSON.stringify(data)).toString().slice(0, 500) });
      return;
    }

    // Only burn one of the daily allowance now that Runway has actually
    // accepted and started the task. Long-mode (owner-only) scenes never
    // touch the normal daily quota.
    const remaining = (longMode === true) ? null : await consumeVideo(usageResult.username);
    await saveLastTask(picked.index, data.id);
    res.status(200).json({ id: encodeTaskId(picked.index, data.id), remaining });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
