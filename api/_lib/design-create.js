const { judgeBest, duoEnabled } = require('./image-judge');
// Vercel Serverless Function: "🏠 AI Interior Design". Takes a photo of a
// real room plus a chosen style, and asks Gemini's image-generation model
// (server-side owner API key, GEMINI_API_KEY) to redesign the room in that
// style while keeping the room's basic layout/structure. Returns a base64
// PNG/JPEG the client can preview and download.
const { checkDesignQuota, consumeDesign, DESIGN_DAILY_LIMIT } = require('./_designUsage');

// v-design-rescue: إعادة تصميم الغرفة عبر gpt-image-1 عند رفض Gemini (نفس نمط
// خطّ إنقاذ الأزياء والبورتريه). يرجع base64 أو null — لا يرمي أبدًا.
async function openaiDesignEdit(promptText, imageBase64, mimeType) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  try {
    const bytes = Buffer.from(imageBase64, 'base64');
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', String(promptText).slice(0, 3900));
    form.append('size', 'auto');
    /* v-strong-rescue */
    form.append('input_fidelity', 'high');
    form.append('quality', 'high');
    form.append('output_format', 'webp');
    form.append('image', new Blob([bytes], { type: mimeType || 'image/jpeg' }), 'room.jpg');
    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: form,
      signal: AbortSignal.timeout(240000), /* v-image-timeout */
    });
    const d = await r.json();
    if (!r.ok) { console.warn('[design-create] openai HTTP ' + r.status + ' ' + String((d.error && d.error.message) || '').slice(0, 120)); return null; }
    return (d && d.data && d.data[0] && d.data[0].b64_json) || null;
  } catch (e) { console.warn('[design-create] openai ' + (e && e.message)); return null; }
}

const STYLE_PROMPTS = {
  modern: 'a clean modern minimalist interior design style, neutral colors, sleek furniture',
  bohemian: 'a bohemian (boho) interior design style, warm earthy colors, woven textures, plants',
  luxury: 'a luxurious high-end interior design style, marble, gold accents, elegant furniture',
  simple: 'a simple minimalist interior design style, light colors, uncluttered, functional furniture',
  arabic: 'a traditional Arabic/Majlis interior design style, ornate patterns, rich fabrics, low seating',
  classic: 'a classic elegant interior design style, warm wood tones, traditional furniture',
  najdi: 'a traditional Najdi Saudi interior design style, carved gypsum wall panels with geometric triangular motifs, earthy clay and sand tones, exposed wooden ceiling beams, floor seating with patterned cushions',
  islamic: 'a contemporary Islamic interior design style, mashrabiya screens, arched niches, subtle geometric patterns, warm neutral palette with brass and walnut accents',
  andalusi: 'an Andalusian Moorish interior design style, horseshoe arches, zellige mosaic tilework, carved stucco details, deep blue and terracotta palette, lush courtyard feel',
  // v-decor-45: كتالوج موسّع — ٤٥ نمطًا حتى لا يملّ المستخدم من ٩.
  emirati: 'a contemporary Emirati/Khaleeji interior style, sand and cream palette, brass lanterns, palm motifs, modern majlis seating with heritage accents',
  scandinavian: 'a Scandinavian interior design style, white walls, light oak wood, cozy hygge textiles, functional clean-lined furniture',
  japandi: 'a Japandi interior style blending Japanese minimalism and Scandinavian warmth, low wooden furniture, neutral tones, paper lanterns',
  industrial: 'an industrial loft interior style, exposed brick and concrete, black steel frames, Edison bulbs, leather sofa',
  midcentury: 'a mid-century modern interior style, walnut furniture with tapered legs, mustard and teal accents, geometric patterns',
  artdeco: 'an Art Deco interior style, bold geometric patterns, brass and velvet, fan motifs, glamorous 1920s luxury',
  neoclassic: 'a neoclassical interior style, wall moldings and wainscoting, marble, muted palette, elegant symmetry',
  victorian: 'a Victorian interior style, ornate carved furniture, rich wallpaper, chandeliers, deep jewel tones',
  baroque: 'an opulent Baroque interior style, gilded ornament, dramatic ceiling details, rich burgundy and gold',
  gothic: 'a refined gothic interior style, pointed arches, dark wood, stained-glass accents, moody elegance',
  rustic: 'a rustic interior style, reclaimed wood beams, stone fireplace, warm earthy textures',
  farmhouse: 'a modern farmhouse interior style, shiplap walls, white and wood palette, cozy family feel',
  coastal: 'a coastal beach-house interior style, white and sea-blue palette, rattan, linen, airy light',
  mediterranean: 'a Mediterranean interior style, whitewashed walls, terracotta floors, arched doorways, olive greens and sea blues',
  moroccan: 'a Moroccan interior style, colorful zellige tiles, carved wood, lanterns, layered rugs and poufs',
  turkish: 'an Ottoman Turkish interior style, iznik tile patterns, rich carpets, carved wood, warm reds and blues',
  persian: 'a Persian-inspired interior style, ornate rugs, arched mirrors-work niches, turquoise and gold accents',
  indian: 'an Indian-inspired interior style, carved dark wood, vibrant silk textiles, brass decor, jewel tones',
  japanese: 'a traditional Japanese interior style, tatami mats, shoji screens, low table, serene natural wood',
  zen: 'a zen minimalist interior style, natural stone and wood, indoor plants, soft diffused light, calm empty space',
  wabisabi: 'a wabi-sabi interior style, imperfect natural textures, handmade ceramics, muted earthy calm',
  tropical: 'a tropical interior style, lush green plants, rattan and bamboo, botanical prints, bright natural light',
  desert: 'a desert-inspired interior style, sand tones, cactus and dried pampas, terracotta pots, warm sunset palette',
  loft: 'an open urban loft interior style, high ceilings, large windows, mixed concrete and warm wood',
  futuristic: 'a futuristic interior style, curved white surfaces, hidden LED lighting, smart minimal furniture',
  cyberpunk: 'a cyberpunk interior style, neon accent lighting, dark walls, high-tech gaming aesthetics',
  gamer: 'a gamer room interior style, RGB LED strips, dual monitor desk setup, acoustic panels, dark theme',
  darkacademia: 'a dark academia interior style, floor-to-ceiling bookshelves, dark wood, leather chesterfield, brass lamps',
  chalet: 'an alpine chalet interior style, warm timber walls, fur throws, fireplace, cozy mountain cabin feel',
  provence: 'a French Provence interior style, lavender and cream palette, distressed furniture, floral linen',
  hollywood: 'a Hollywood Regency glam interior style, mirrored furniture, velvet, bold black-white-gold contrast',
  monochrome: 'a monochrome interior style, black white and gray palette, strong contrast, graphic minimalism',
  earthy: 'an earthy organic interior style, terracotta clay tones, curved plaster walls, natural fibers',
  pastel: 'a soft pastel interior style, blush pink mint and baby blue accents, playful modern furniture',
  smart: 'a smart-home tech interior style, integrated screens, voice-controlled ambient lighting, sleek surfaces',
  eco: 'a sustainable eco interior style, recycled materials, living plant wall, natural light, green tones',
  retro70s: 'a retro 1970s interior style, orange and brown palette, shag rug, curved sofa, vinyl corner',
  popart: 'a pop-art interior style, bold primary colors, comic prints, playful statement furniture',
  minimalwhite: 'an all-white gallery-like minimalist interior, seamless white surfaces, single statement artwork',
};

const LIGHTING_PROMPTS = {
  warm: 'warm, cozy ambient lighting (soft yellow tones)',
  cool: 'cool, crisp lighting (white/blue tones)',
  bright: 'bright, well-lit daylight-style lighting',
  dim: 'dim, relaxing night-time mood lighting',
};

const FURNITURE_PROMPTS = {
  modern: 'modern furniture pieces',
  classic: 'classic traditional furniture pieces',
  simple: 'simple, minimal furniture pieces',
  luxury: 'luxurious, high-end furniture pieces',
  bohemian: 'bohemian-style furniture pieces',
};

const FLOORING_PROMPTS = {
  parquet: 'wooden parquet flooring',
  marble: 'polished marble flooring',
  ceramic: 'ceramic tile flooring',
  carpet: 'soft carpet flooring',
};

const FABRIC_PROMPTS = {
  light: 'light-colored fabrics for sofas/cushions/curtains',
  dark: 'dark-colored fabrics for sofas/cushions/curtains',
  neutral: 'neutral-toned fabrics for sofas/cushions/curtains',
  bold: 'bold, vibrant-colored fabrics for sofas/cushions/curtains',
};

const WALLCOLOR_PROMPTS = {
  white: 'white wall paint',
  beige: 'beige wall paint',
  gray: 'gray wall paint',
  bold: 'a bold accent wall color',
};

const CURTAIN_PROMPTS = {
  simple: 'simple curtains',
  luxury: 'luxurious, elegant curtains',
  remove: 'no curtains at all (remove existing curtains)',
};

// أنواع الأماكن — مسار «بلا صورة»: يبني المشهد من الصفر بدل تعديل صورة.
const PLACE_PROMPTS = {
  restaurant: 'a restaurant dining hall interior',
  cafe: 'a coffee shop / cafe interior',
  bedroom: 'a bedroom interior',
  majlis: 'a traditional Arabic majlis sitting room interior',
  living: 'a living room interior',
  kitchen: 'a kitchen interior',
  office: 'an office workspace interior',
  shop: 'a retail shop interior',
  bath: 'a bathroom interior',
  kids: "a children's bedroom interior",
  entrance: 'a home entrance / foyer interior',
  garden: 'an outdoor garden terrace seating area',
};

const DECOR_PROMPTS = {
  plants: 'add decorative indoor plants',
  art: 'add wall art/paintings',
  accessories: 'add luxury decorative accessories',
};

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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { imageBase64, mimeType, style, lighting, furniture, flooring, fabric, wallColor, curtains, rearrange, decor, token, place, count, notes, variantOf } = body;
    const notesText = String(notes || '').replace(/[\r\n]+/g, ' ').replace(/["`\\]/g, '').trim().slice(0, 400);
    const notesPart = notesText ? (' User request (highest priority, follow it closely): ' + notesText + '.') : '';
    if (!imageBase64 && !place) {
      res.status(400).json({ error: 'Missing imageBase64 or place' });
      return;
    }

    const quota = await checkDesignQuota(token);
    if (!quota.allowed) {
      if (quota.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'daily_limit_reached' });
      }
      return;
    }

    const styleDesc = STYLE_PROMPTS[style] || STYLE_PROMPTS.modern;
    const extras = [];
    if (LIGHTING_PROMPTS[lighting]) extras.push(LIGHTING_PROMPTS[lighting]);
    if (FURNITURE_PROMPTS[furniture]) extras.push(FURNITURE_PROMPTS[furniture]);
    if (FLOORING_PROMPTS[flooring]) extras.push(FLOORING_PROMPTS[flooring]);
    if (FABRIC_PROMPTS[fabric]) extras.push(FABRIC_PROMPTS[fabric]);
    if (WALLCOLOR_PROMPTS[wallColor]) extras.push(WALLCOLOR_PROMPTS[wallColor]);
    if (CURTAIN_PROMPTS[curtains]) extras.push(CURTAIN_PROMPTS[curtains]);
    if (rearrange) extras.push('rearrange the furniture layout for better flow while keeping the room structure');
    if (Array.isArray(decor)) {
      decor.forEach((d) => { if (DECOR_PROMPTS[d]) extras.push(DECOR_PROMPTS[d]); });
    }
    const extrasText = extras.length ? (' Additionally apply these specific changes: ' + extras.join('; ') + '.') : '';

    // ── مسار «بلا صورة»: أشكال جاهزة من نوع المكان. يعمل على OpenAI لا على نموذج جوجل. ──
    if (!imageBase64) {
      const oaKey = process.env.OPENAI_API_KEY;
      if (!oaKey) {
        res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
        return;
      }
      // v-decor-ideas: «custom» = مكان يصفه المستخدم بكلماته (مجلس لعشرين شخصًا…) بلا صورة
      const placeDesc = place === 'custom' ? (notesText ? 'an interior space exactly as the user describes' : null) : PLACE_PROMPTS[place];
      if (!placeDesc) {
        res.status(400).json({ error: 'Unknown place' });
        return;
      }
      const n = Math.min(Math.max(parseInt(count, 10) || 4, 1), 4);
      const VIEWS = [
        'wide establishing shot taken from the doorway',
        'view from the opposite corner of the space',
        'closer shot focused on the main seating or feature area',
        'elevated three-quarter angle showing the whole layout',
      ];
      const base = 'Photorealistic interior design photograph of ' + placeDesc + ', decorated in ' + styleDesc + '.' + extrasText +
        ' Award-winning architectural interior photography, magazine editorial quality (Architectural Digest / Elle Decor grade):' +
        ' physically accurate global illumination, soft natural light with believable shadows and reflections, rich real materials and textures,' +
        ' tasteful premium styling, layered lighting, depth and atmosphere, tack-sharp focus, ultra-high detail, true-to-life color.' +
        ' Not a cartoon, not a 3D render, not CGI, no over-saturation, no HDR halos.' +
        ' No people, no text, no watermark, no logo.' + notesPart;
      const vSrc = String(variantOf || '');
      if (vSrc && vSrc.length > 64) {
        try {
          const fd = new FormData();
          fd.append('model', 'gpt-image-2');
          fd.append('prompt', 'Create a new variation of this interior photograph. Keep the same overall design style, color palette, materials and camera angle, but vary the furniture arrangement and the decorative details.' + notesPart + ' Photorealistic architectural photography. No people, no text, no watermark, no logo.');
          fd.append('size', '1536x1024');
          /* v-decor-hq (المالك: «الصور لم تعجبني»): أعلى جودة بدل medium وضغط أخفّ */
          fd.append('quality', 'high');
          fd.append('n', String(n));
          fd.append('output_format', 'webp');
          fd.append('output_compression', '92');
          fd.append('image', new Blob([Buffer.from(vSrc, 'base64')], { type: 'image/webp' }), 'ref.webp');
          const vr = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + oaKey },
            body: fd,
            signal: AbortSignal.timeout(240000),
          });
          const vd = await vr.json();
          const vimgs = (((vd && vd.data) || []).map((x) => x && x.b64_json).filter(Boolean))
            .map((b64) => ({ imageBase64: b64, mimeType: 'image/webp' }));
          if (vimgs.length) {
            const vrem = await consumeDesign(quota.username);
            res.status(200).json({ images: vimgs, remaining: vrem, dailyLimit: DESIGN_DAILY_LIMIT });
            return;
          }
        } catch (e) { /* fallback to normal generation below */ }
      }
      // v-decor-detail: لا نبتلع خطأ المزوّد — نكشفه منظّفًا في detail ليُشخَّص
      // (رصيد؟ اسم نموذج؟) بدل 502 صامتة. المفاتيح تُشطب دائمًا.
      let upstreamErr = '';
      const noteErr = (m) => { if (!upstreamErr && m) upstreamErr = String(m).slice(0, 300); };
      const shots = await Promise.all(Array.from({ length: n }, (_, i) => fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + oaKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: base + ' Camera: ' + VIEWS[i % VIEWS.length] + '.',
          size: '1536x1024',
          /* v-decor-hq (المالك: «الصور لم تعجبني»): أعلى جودة بدل medium وضغط أخفّ */
          quality: 'high',
          n: 1,
          output_format: 'webp',
          output_compression: 92,
        }),
        signal: AbortSignal.timeout(240000),
      }).then((r) => r.json()).then((d) => {
        const b = (((d && d.data) || [])[0] || {}).b64_json || null;
        if (!b) noteErr(d && d.error && d.error.message);
        return b;
      }).catch((e) => { noteErr((e && e.message) || e); return null; })));
      const images = shots.filter(Boolean).map((b64) => ({ imageBase64: b64, mimeType: 'image/webp' }));
      if (!images.length) {
        res.status(502).json({
          error: 'لم يرجع النموذج أي شكل. جرّب نمطًا أو نوع مكان آخر.',
          detail: upstreamErr.replace(/key=[^&\s"']+/g, 'key=***'),
        });
        return;
      }
      const rem = await consumeDesign(quota.username);
      res.status(200).json({ images, remaining: rem, dailyLimit: DESIGN_DAILY_LIMIT });
      return;
    }

    const promptText =
      'Redesign this room photo into ' + styleDesc + '.' + extrasText + ' ' +
      'Keep the same room layout, walls, windows and camera angle, but replace the furniture, ' +
      'colors, decor and finishes to match the requested style. Output a single photorealistic image of the redesigned room.' + notesPart;

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
    const reqBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { imageConfig: { imageSize: '2K' } },
    };
    /* v-image-duo: gpt-image بالتوازي مع Gemini، والحكم يختار الأدقّ في النهاية */
    const duoP = duoEnabled() ? openaiDesignEdit(promptText, imageBase64, mimeType).catch(function () { return null; }) : null;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(240000), /* v-image-timeout */
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      // v-design-rescue: رفض Gemini (رصيد/حصة/غيره) يهبط تلقائيًا إلى gpt-image-1
      // بمفتاح الخادم — نفس خط إنقاذ الأزياء والبورتريه والستايل.
      const rescued = duoP ? await duoP : await openaiDesignEdit(promptText, imageBase64, mimeType);
      if (rescued) {
        const rrem = await consumeDesign(quota.username);
        res.status(200).json({ imageBase64: rescued, mimeType: 'image/webp', remaining: rrem, dailyLimit: DESIGN_DAILY_LIMIT, engine: 'openai' });
        return;
      }
      const gmsg = String((data && data.error && data.error.message) || 'Upstream error');
      res.status(upstream.status).json({ error: gmsg.replace(/key=[^&\s"']+/g, 'key=***') });
      return;
    }

    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بصورة أو ستايل آخر.' });
      return;
    }

    let outB64 = imgPart.inlineData.data, outMime = imgPart.inlineData.mimeType || 'image/png', outEngine = 'gemini';
    if (duoP) {
      try {
        const alt = await duoP;
        if (alt) {
          const pick = await judgeBest({ apiKey, prompt: promptText, source: { b64: imageBase64, mime: mimeType || 'image/jpeg' }, a: { b64: outB64, mime: outMime }, b: { b64: alt, mime: 'image/webp' } });
          if (pick === 'b') { outB64 = alt; outMime = 'image/webp'; outEngine = 'openai+judge'; } else outEngine = 'gemini+judge';
        }
      } catch (e) { console.warn('[design-create] duo skipped: ' + (e && e.message)); }
    }
    const remaining = await consumeDesign(quota.username);
    res.status(200).json({
      imageBase64: outB64,
      mimeType: outMime,
      engine: outEngine,
      remaining,
      dailyLimit: DESIGN_DAILY_LIMIT,
    });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
