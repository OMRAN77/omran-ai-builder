// Vercel Serverless Function: on-demand single-image generator for the
// "🏗️ تصاميم المقاولات والبناء" section. Generates ONE image per request
// (either an exterior angle view, or an interior room view with a chosen
// color scheme) so the user only pays the API cost for views they actually
// ask for. Shares the same daily quota counter as construction-create.js.
const { checkConstructionQuota, consumeConstruction, CONSTRUCTION_DAILY_LIMIT } = require('./_constructionUsage');
const falBackup = require('./fal-fallback.js'); /* v-fal-backup */

/* v-fal-backup (أمر المالك ٣ نوفمبر ٢٠٢٦: «موجود خارجي وصله»): نفاد رصيد Gemini كان يُسقط «شاهد المبنى من زوايا أخرى» و«شاهد الغرف
   من الداخل» إلى بديل OpenAI النصّيّ (يتجاهل صورة المرجع) أو «الخدمة متوقّفة». الاحتياط النموذج نفسه عند fal بجسم الطلب نفسه (2K،
   وصورة المرجع معه إن وُجدت) قبل بديل OpenAI، وناتجه يُسلَّم ويُستهلك كناتج Gemini. مهلته ما بقي من حدّ الدالّة (٣٠٠ ث)، مرّة واحدة. */
const VIEW_MODEL = 'gemini-3-pro-image';
const FAL_BUDGET_MS = 270000;
function falOpts(t0) {
  const left = FAL_BUDGET_MS - (Date.now() - t0);
  return left >= 15000 ? { where: 'construction-view', timeoutMs: Math.min(150000, left) } : null;
}

const BUILDING_LABELS = {
  villa: 'a residential villa',
  apartment: 'an apartment building',
  office: 'an office building',
  warehouse: 'an industrial warehouse',
  mosque: 'a mosque',
  shop: 'a retail shop/storefront',
  rest: 'a private weekend rest house (istiraha) with a majlis and outdoor seating',
  farm: 'a farm house with surrounding agricultural land',
  annexhome: 'a small residential annex / guest house',
  mall: 'a small commercial retail mall',
  school: 'a school building with classrooms',
  hall: 'a wedding and events hall',
};

const STYLE_LABELS = {
  modern: 'modern minimalist architectural style, clean lines, large glass windows',
  classic: 'classic elegant architectural style, columns, warm stone finishes',
  gulf: 'traditional Gulf/Emirati architectural style, mashrabiya patterns, sand-tone facade',
  luxury: 'luxurious high-end architectural style, premium materials, dramatic lighting',
  industrial: 'industrial architectural style, exposed steel and concrete',
  andalusi: 'Andalusian Moorish architectural style, horseshoe arches, carved plasterwork, patterned tilework, inner courtyard',
  islamic: 'contemporary Islamic architectural style, geometric mashrabiya screens, clean modern volumes, subtle pointed arches',
  mediterranean: 'Mediterranean architectural style, white stucco walls, terracotta roof tiles, arched openings, wooden shutters',
  najdi: 'traditional Najdi architectural style, thick earth-tone walls, triangular openings, exposed wooden roof beams',
  neoclassic: 'neo-classical architectural style, symmetrical facade, ornate cornices, tall columns, cream stone finish',
};

const ANGLE_LABELS_EN = {
  front: 'front facade view, eye level',
  side: 'side facade view, eye level',
  back: 'rear facade view, eye level',
  aerial: 'aerial drone top-down view of the whole building and plot',
};

const ROOM_LABELS_EN = {
  living: 'main living room',
  majlis: 'majlis / formal sitting room',
  bedroom: 'master bedroom',
  kitchen: 'kitchen',
  bathroom: 'bathroom',
  dining: 'dining room',
  office: 'home office / study room',
  kids: "children's bedroom",
  stairs: 'main staircase and entrance hall',
  roof: 'rooftop terrace with outdoor seating',
};

module.exports = async (req, res) => {
  const t0 = Date.now(); /* v-fal-backup: بداية ميزانيّة الدالّة */
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'unavailable' }); /* v-provider-fail-rest: لا اسم مفتاح ولا مزوّد في ردّ المستخدم */
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { mode, buildingType, floors, area, style, notes, token, angle, room, color, refImageBase64 } = body;
    if (!buildingType || !area || (mode !== 'angle' && mode !== 'room')) {
      res.status(400).json({ error: 'Missing/invalid parameters' });
      return;
    }

    const quota = await checkConstructionQuota(token, res); /* v-atomic-quota: حجز ذرّيّ يُردّ إن فشل */
    if (!quota.allowed) {
      if (quota.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'daily_limit_reached' });
      }
      return;
    }

    const buildingDesc = BUILDING_LABELS[buildingType] || 'a building';
    const styleDesc = STYLE_LABELS[style] || STYLE_LABELS.modern;
    const floorsText = floors ? (floors + '-floor ') : '';
    const notesText = notes ? (' Additional requirements: ' + notes + '.') : '';

    let prompt;
    if (mode === 'angle') {
      const angleDesc = ANGLE_LABELS_EN[angle] || ANGLE_LABELS_EN.front;
      prompt =
        'A photorealistic architectural exterior render of ' + floorsText + buildingDesc +
        ', approximately ' + area + ' square meters, in ' + styleDesc + '.' + notesText +
        ' Camera angle: ' + angleDesc + '.' +
        ' Daytime, clear sky, professional architectural visualization, high detail, no people, no text overlays.';
    } else {
      const roomDesc = ROOM_LABELS_EN[room] || ROOM_LABELS_EN.living;
      const colorText = color ? (' Main color scheme/palette: ' + color + '.') : '';
      prompt =
        'A photorealistic interior design render of the ' + roomDesc + ' inside ' + floorsText + buildingDesc +
        ', in ' + styleDesc + '.' + colorText + notesText +
        ' Show room proportions and furniture layout clearly, warm lighting, high-end interior design magazine quality, no people, no text overlays.';
    }

    const imgEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
    const promptParts = [{ text: prompt }];
    if (mode === 'angle' && typeof refImageBase64 === 'string' && refImageBase64.length > 100) {
      promptParts[0].text += ' IMPORTANT: the attached reference image shows this exact same building. Keep identical facade materials, colors, proportions, window and door layout, floor count and annexes — change ONLY the camera angle.';
      promptParts.unshift({ inlineData: { mimeType: 'image/jpeg', data: refImageBase64 } });
    }
    const imgReqBody = { contents: [{ parts: promptParts }], generationConfig: { imageConfig: { imageSize: '2K' } } };

    /* v-fal-backup: الرصيد خلص قبل دقائق ← النموذج نفسه عند fal مباشرة بلا نداء فاشل قبله */
    let falOut = null, falTried = false;
    if (await falBackup.geminiOutRecently()) {
      const fo = falOpts(t0);
      if (fo) {
        falTried = true;
        const f0 = await falBackup.imageFromGemini(VIEW_MODEL, imgReqBody, fo);
        if (f0 && f0.b64) falOut = f0;
      }
    }

    let upstream = null, data = null;
    if (!falOut) {
      try {
        upstream = await fetch(imgEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(imgReqBody), signal: AbortSignal.timeout(240000) /* v-image-timeout */ });
        data = await upstream.json();
      } catch (e) { upstream = null; data = null; }
    }

    let outB64 = null, outMime = 'image/png';
    if (falOut) { outB64 = falOut.b64; outMime = falOut.mime; }
    if (upstream && upstream.ok) {
      const parts = (((data && data.candidates || [])[0] || {}).content || {}).parts || [];
      const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
      if (imgPart) { outB64 = imgPart.inlineData.data; outMime = imgPart.inlineData.mimeType || 'image/png'; }
    }
    /* v-fal-backup: نفاد الرصيد ← fal بالنموذج نفسه قبل بديل OpenAI (والباقي كما كان) */
    if (!outB64 && !falTried && upstream && !upstream.ok) {
      const fo = falOpts(t0);
      const fb = fo ? await falBackup.rescueImage(upstream.status, String((data && data.error && data.error.message) || ''), VIEW_MODEL, imgReqBody, fo) : null;
      if (fb) { outB64 = fb.b64; outMime = fb.mime; }
    }
    // v-construction-rescue: رفض/سقوط Gemini يهبط تلقائيًا إلى gpt-image-1
    if (!outB64) {
      const key = (process.env.OPENAI_API_KEY || '').trim();
      if (key) {
        try {
          const r = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-image-2.5-flare', prompt: prompt.slice(0, 3900), size: '1536x1024', quality: 'high' }),
            signal: AbortSignal.timeout(240000), /* v-image-timeout */
          });
          const d = await r.json();
          if (r.ok && d && d.data && d.data[0] && d.data[0].b64_json) { outB64 = d.data[0].b64_json; outMime = 'image/png'; }
        } catch (e) { /* الإنقاذ فشل — يمضي لإعلان الخطأ الأصلي */ }
      }
    }
    /* v-provider-fail-rest (تدقيق ١٨–١٩ أكتوبر): «شاهد المبنى من زوايا أخرى» و«شاهد الغرف من الداخل» كانا يمرّران حالة المزوّد ونصّه
       (402 رصيده)، فتعرض الواجهة «❌ خطأ: <نصّ المزوّد>». رمزٌ لا نصّ: رفض المزوّد ← toolFail، وفشل النداء نفسه (مهلة/انقطاع) ← unavailable،
       وردّ بلا صورة ← failed. الحجز الذرّيّ للحصّة يُردّ عند أيّ ردّ لم يُستهلك فيه (v-atomic-quota) فالحالة لا تمسّه. */
    if (!outB64) {
      if (upstream && !upstream.ok) {
        const tech = String((data && data.error && data.error.message) || '');
        console.error('[construction-view] upstream ' + upstream.status + ': ' + tech.slice(0, 200));
        const fail = require('./_videoFail.js').toolFail(upstream.status, tech);
        res.status(fail.code).json(fail.body);
      } else if (!upstream) {
        console.error('[construction-view] upstream call failed (timeout/network)');
        res.status(503).json({ error: 'unavailable' });
      } else {
        res.status(502).json({ error: 'failed' });
      }
      return;
    }

    const remaining = await consumeConstruction(quota.username, quota.limit);
    res.status(200).json({
      imageBase64: outB64,
      mimeType: outMime,
      remaining,
      dailyLimit: quota.limit || CONSTRUCTION_DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[construction-view] ' + (e && e.message ? e.message : String(e)));
    res.status(503).json({ error: 'unavailable' }); /* v-provider-fail-rest: كان «Proxy error: <نصّ تقنيّ>» */
  }
};
