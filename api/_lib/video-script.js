// Vercel Serverless Function: breaks a topic down into a sequence of short
// (~8 second) video scenes + narration lines, sized to a target total
// duration in minutes. Used only by the "long video" (multi-minute,
// many-scene) feature, which is restricted to the owner's own account
// (see api/_videoUsage.js -> checkOwnerBypass) because chaining that many
// AI-generated video scenes costs real money.
const { checkOwnerBypass, checkVideoQuota, isOwner } = require('./_videoUsage');

const SCENE_SECONDS = 8; // each Runway scene is generated at this length

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
    const { topic, minutes, style, lang, token, mode, sceneCount, hero } = body;

    const isFilm = mode === 'film';
    let filmQuota = null;
    if (isFilm) {
      // "Full mini-film" mode: available to ANY logged-in account. It only
      // writes the script here; each scene generation is still charged
      // against the normal daily video quota by video-create.
      filmQuota = await checkVideoQuota(token);
      const quota = filmQuota;
      if (!quota.allowed) {
        if (quota.reason === 'auth') {
          res.status(401).json({ error: 'auth_required' });
        } else {
          res.status(403).json({ error: 'daily_limit_reached' });
        }
        return;
      }
    } else {
      const usageResult = await checkOwnerBypass(token);
      if (!usageResult.allowed) {
        if (usageResult.reason === 'auth') {
          res.status(401).json({ error: 'auth_required' });
        } else {
          res.status(403).json({ error: 'owner_only' });
        }
        return;
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
      return;
    }
    if (!topic || String(topic).trim().length < 2) {
      res.status(400).json({ error: 'Missing topic' });
      return;
    }

    let scenesWanted;
    if (isFilm) {
      // Film mode: small fixed scene count. Regular accounts are capped at 3
      // scenes (one film = one day's video allowance); the owner may go to 5.
      const requested = Math.max(2, Math.min(5, Number(sceneCount) || 3));
      const ownerReq = isOwner(filmQuota && filmQuota.username);
      scenesWanted = ownerReq ? requested : Math.min(3, requested);
    } else {
      const mins = Math.max(1, Math.min(10, Number(minutes) || 1));
      scenesWanted = Math.max(1, Math.round((mins * 60) / SCENE_SECONDS));
    }
    const isAr = (lang || 'ar') === 'ar';
    const styleLabel = style === 'anime'
      ? (isAr ? 'أنيمي/رسوم متحركة' : 'anime/cartoon animation')
      : (isAr ? 'واقعي سينمائي' : 'cinematic realistic');

    const sys = isAr
      ? `أنت مخرج فيديو محترف. تقسّم موضوعًا إلى سلسلة مشاهد فيديو قصيرة متتابعة (كل مشهد حوالي ${SCENE_SECONDS} ثوانٍ فقط) بأسلوب ${styleLabel}، بحيث تحكي كل المشاهد مجتمعة قصة أو عرضًا تسويقيًا متماسكًا ومتصاعدًا لموضوع الفيديو. أعد فقط JSON بدون أي نص خارجه.`
      : `You are a professional video director. Break a topic down into a sequence of short consecutive video scenes (each only about ${SCENE_SECONDS} seconds) in a ${styleLabel} style, so that all scenes together tell a coherent, flowing story or marketing pitch about the topic. Return ONLY JSON, no text outside it.`;

    const heroNote = hero
      ? (isAr
        ? '\n\nمهم جدًا: بطل هذا الفيلم هو الشخص الظاهر في صورة مرجعية سيبدأ منها كل مشهد. اجعل كل وصف بصري يبدأ بـ "The person in the image" ويصف حركته وما يفعله وحركة الكاميرا (بالإنجليزية)، بدون وصف ملامحه أو ملابسه — الصورة تحددها.'
        : '\n\nVERY IMPORTANT: the hero of this film is the person shown in a reference photo that each scene will start from. Every visual description MUST start with "The person in the image" and describe their motion, actions and camera movement — do NOT describe their face or clothing, the photo defines that.')
      : '';

    const userMsg = (isAr
      ? `الموضوع: "${topic}"\n\nأنشئ بالضبط ${scenesWanted} مشهدًا متتابعًا. أعد فقط JSON بهذا الشكل بالضبط:\n{\n  "title": "عنوان الفيديو",\n  "scenes": [\n    { "visual": "وصف بصري مختصر ودقيق لما يظهر في هذا المشهد تحديدًا (بالإنجليزية لتوليد أفضل نتيجة من نموذج الفيديو)", "narration": "نص السرد بالعربية الذي سيُقرأ بصوت طبيعي فوق هذا المشهد تحديدًا (جملة أو جملتين قصيرتين تناسب ${SCENE_SECONDS} ثوانٍ)" }\n  ]\n}\nالمشهد الأول يفتتح الفكرة، والمشهد الأخير يختمها بشكل مؤثر.`
      : `Topic: "${topic}"\n\nGenerate exactly ${scenesWanted} consecutive scenes. Return ONLY JSON in exactly this shape:\n{\n  "title": "Video title",\n  "scenes": [\n    { "visual": "Short precise visual description of exactly what appears in this specific scene (for the video generation model)", "narration": "Narration text that will be read aloud over this specific scene (one or two short sentences fitting about ${SCENE_SECONDS} seconds)" }\n  ]\n}\nThe first scene opens the idea, the last scene closes it with impact.`) + heroNote;

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' },
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({ error: 'OpenAI error: ' + errText.slice(0, 500) });
      return;
    }

    const data = await upstream.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) {
      res.status(500).json({ error: 'Empty response from model' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      res.status(500).json({ error: 'Model returned invalid JSON' });
      return;
    }

    if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      res.status(500).json({ error: 'Model returned no scenes' });
      return;
    }

    res.status(200).json({ title: parsed.title || topic, scenes: parsed.scenes, sceneSeconds: SCENE_SECONDS });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + (e && e.message ? e.message : String(e)) });
  }
};
