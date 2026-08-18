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

    // 💰 نظام النقاط: فيديو Runway = 60 نقطة لغير المالك. يُخصم قبل
    // الإنشاء ويُسترجع تلقائيًا لو فشل الطلب عند Runway.
    const pointsLib = require('./points.js');
    let chargedUser = null;
    if (usageResult.username && !pointsLib.isOwnerUsername(usageResult.username)) {
      const gateRw = pointsLib.requireConfirmation(body, pointsLib.COSTS.runway_video, 'فيديو Runway');
      if (gateRw) { res.status(gateRw.status).json(gateRw.payload); return; }
      const pay = await pointsLib.spendPoints(usageResult.username, pointsLib.COSTS.runway_video, 'runway_video');
      if (!pay.ok) {
        res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.runway_video, points: pay.points || 0 });
        return;
      }
      chargedUser = usageResult.username;
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
    if (!Number.isFinite(finalDuration)) finalDuration = 5;
    // Runway only accepts 5 or 10 seconds — snap anything else
    finalDuration = finalDuration <= 7 ? 5 : 10;

    const styleSuffix = (style === 'anime')
      ? ', anime and cartoon animation style, 2D animated, vibrant colors'
      : ', cinematic realistic footage, photorealistic, high detail';
    // Runway hard limit: promptText <= 1000 chars TOTAL (base + suffix)
    let finalPrompt = String(promptText).trim().slice(0, 1000 - styleSuffix.length) + styleSuffix;

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
          model: 'gen4_turbo',
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
      // Always include Runway's FULL response body (it puts the useful
      // validation details in extra fields, not just in .error).
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.runway_video);
      res.status(upstream.status).json({ error: 'Runway error: ' + JSON.stringify(data).slice(0, 700) });
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
