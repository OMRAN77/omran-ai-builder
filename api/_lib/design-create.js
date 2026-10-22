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
    form.append('model', 'gpt-image-2.5-sunburst');
    form.append('prompt', String(promptText).slice(0, 3900));
    form.append('size', 'auto');
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
  /* v-decor-light-sheet (طلب المالك ١٤ أكتوبر ٢٠٢٦): الستة الجديدة من لوحة الإضاءة */
  natural: 'natural, balanced daylight coming through the windows',
  neutral: 'neutral white lighting (about 4000K), clean and balanced',
  golden: 'golden-hour glow lighting with rich amber tones',
  purple: 'night-time mood lighting with soft purple/violet ambient tones',
  sunset: 'warm pink-orange sunset light streaming through the windows',
  moon: 'cool blue moonlight night-time lighting, calm and dim',
  emerald: 'calm emerald-green indirect ambient lighting, elegant soft wall washes, keep furniture colors and material detail recognizable',
  turquoise: 'coastal turquoise ambient lighting with cyan indirect wall washes and fresh airy atmosphere',
  rose: 'soft powder-rose pink ambient lighting, delicate and refined, not saturated magenta',
  burgundy: 'cinematic deep burgundy-red evening lighting, rich wine-red ambient wall washes with readable room details',
  neon: 'dual-tone neon lighting: cyan from the left and fuchsia from the right, neutral soft key light on furniture, clearly two distinct colors',
  cinematic: 'balanced cinematic split lighting: cool steel-blue from the left and warm amber from the right, realistic indirect light falloff',
  aurora: 'aurora-inspired two-tone ambient lighting: emerald-green on the left blending into muted violet on the right, no literal aurora or sky indoors',
};

const FURNITURE_PROMPTS = {
  modern: 'modern furniture pieces',
  classic: 'classic traditional furniture pieces',
  simple: 'simple, minimal furniture pieces',
  luxury: 'luxurious, high-end furniture pieces',
  bohemian: 'bohemian-style furniture pieces',
  // v-decor-18 (المالك ١٦ أكتوبر: «تضيف لكلّ واحد ١٨»): سبعة عشر خيارًا + «بدون تغيير» كالإضاءة.
  scandinavian: 'Scandinavian furniture pieces: light oak wood, clean lines, soft wool textiles',
  japandi: 'Japandi furniture pieces: low natural-wood frames, linen upholstery, calm minimal forms',
  industrial: 'industrial furniture pieces: black metal frames, reclaimed wood, distressed leather',
  midcentury: 'mid-century modern furniture pieces: walnut wood, tapered legs, retro silhouettes',
  artdeco: 'Art Deco furniture pieces: curved velvet seating, brass and gold geometric details, lacquered surfaces',
  rattan: 'rattan and woven cane furniture pieces with natural linen cushions',
  velvet: 'plush velvet upholstered furniture pieces with rounded cushions',
  leather: 'rich brown leather furniture pieces with a Chesterfield-style tufted sofa',
  majlis: 'traditional Arabic majlis floor seating: low cushions along the walls with back bolsters and patterned fabric',
  modular: 'a large modular L-shaped sectional sofa with deep comfortable seats',
  curved: 'a curved crescent-shaped sofa and rounded organic furniture pieces',
  rustic: 'rustic solid wood furniture pieces with natural grain and linen cushions',
};

const FLOORING_PROMPTS = {
  parquet: 'wooden parquet flooring',
  marble: 'polished marble flooring',
  ceramic: 'ceramic tile flooring',
  carpet: 'soft carpet flooring',
  // v-decor-18 (المالك ١٦ أكتوبر: «تضيف لكلّ واحد ١٨»): سبعة عشر خيارًا + «بدون تغيير» كالإضاءة.
  herringbone: 'herringbone oak parquet flooring',
  darkwood: 'dark walnut wide-plank hardwood flooring',
  lightwood: 'light natural oak wide-plank hardwood flooring',
  blackmarble: 'polished black marble flooring with subtle gold veins',
  travertine: 'honed beige travertine stone tile flooring',
  terrazzo: 'polished terrazzo flooring with multicolored stone chips',
  concrete: 'seamless polished gray concrete flooring',
  porcelain: 'large-format glossy light porcelain tile flooring',
  moroccan: 'patterned Moroccan encaustic cement tile flooring',
  hexagon: 'matte hexagon tile flooring',
  checker: 'classic black-and-white checkerboard marble tile flooring',
  stone: 'natural slate stone flooring in earthy tones',
  persianrug: 'a large ornate Persian rug covering wooden flooring',
};

const FABRIC_PROMPTS = {
  light: 'light-colored fabrics for sofas/cushions/curtains',
  dark: 'dark-colored fabrics for sofas/cushions/curtains',
  neutral: 'neutral-toned fabrics for sofas/cushions/curtains',
  bold: 'bold, vibrant-colored fabrics for sofas/cushions/curtains',
  // v-decor-18 (المالك ١٦ أكتوبر: «تضيف لكلّ واحد ١٨»): سبعة عشر خيارًا + «بدون تغيير» كالإضاءة.
  cream: 'soft cream and ivory fabrics for sofas/cushions/curtains',
  navy: 'deep navy blue fabrics for sofas/cushions/curtains',
  emerald: 'rich emerald green fabrics for sofas/cushions/curtains',
  mustard: 'warm mustard yellow fabrics for sofas/cushions/curtains',
  terracotta: 'earthy terracotta orange fabrics for sofas/cushions/curtains',
  blush: 'soft blush pink fabrics for sofas/cushions/curtains',
  sage: 'muted sage green fabrics for sofas/cushions/curtains',
  charcoal: 'charcoal gray fabrics for sofas/cushions/curtains',
  burgundy: 'deep burgundy wine-red fabrics for sofas/cushions/curtains',
  teal: 'deep teal fabrics for sofas/cushions/curtains',
  camel: 'warm camel tan fabrics for sofas/cushions/curtains',
  lavender: 'soft lavender fabrics for sofas/cushions/curtains',
  skyblue: 'light sky blue fabrics for sofas/cushions/curtains',
};

const WALLCOLOR_PROMPTS = {
  white: 'white wall paint',
  beige: 'beige wall paint',
  gray: 'gray wall paint',
  bold: 'a bold accent wall color',
  // v-decor-18 (المالك ١٦ أكتوبر: «تضيف لكلّ واحد ١٨»): سبعة عشر خيارًا + «بدون تغيير» كالإضاءة.
  ivory: 'warm ivory off-white wall paint',
  greige: 'greige (warm gray-beige) wall paint',
  taupe: 'soft taupe wall paint',
  sage: 'muted sage green wall paint',
  olive: 'olive green wall paint',
  navy: 'deep navy blue wall paint',
  forest: 'deep forest green wall paint',
  terracotta: 'terracotta clay wall paint',
  blush: 'soft blush pink wall paint',
  lightblue: 'pale light blue wall paint',
  charcoal: 'charcoal gray wall paint',
  mocha: 'warm mocha brown wall paint',
  black: 'matte black wall paint',
};

const CURTAIN_PROMPTS = {
  simple: 'simple curtains',
  luxury: 'luxurious, elegant curtains',
  remove: 'no curtains at all (remove existing curtains)',
  // v-decor-18 (المالك ١٦ أكتوبر: «تضيف لكلّ واحد ١٨»): سبعة عشر خيارًا + «بدون تغيير» كالإضاءة.
  sheer: 'sheer white chiffon curtains letting soft light through',
  linen: 'natural linen curtains',
  velvet: 'heavy velvet floor-length curtains',
  blackout: 'thick blackout curtains',
  roman: 'fabric Roman shades with neat horizontal folds',
  roller: 'minimal fabric roller blinds',
  wooden: 'horizontal wooden slat blinds',
  vertical: 'vertical fabric blinds',
  wave: 'modern wave-fold (S-fold) curtains on a ceiling track',
  double: 'double-layer curtains: a sheer inner layer with heavy outer drapes',
  embroidered: 'curtains with traditional Arabic embroidery and gold trim',
  motorized: 'sleek motorized curtains on a hidden ceiling track',
  bamboo: 'woven bamboo shades',
  pelmet: 'elegant drapes with an upholstered pelmet box above the window',
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
  /* v-decor-outdoor (طلب المالك ١٥ أكتوبر ٢٠٢٦): أفكار وتصاميم الديكور الخارجي */
  facade: 'an exterior house/villa front facade and architectural elevation with landscape lighting',
  pool: 'an outdoor luxury swimming pool and poolside lounge patio area',
  pergola: 'an outdoor wooden pergola shaded seating area in a landscaped garden',
  bbq: 'an outdoor barbecue kitchen and cozy firepit seating area',
  rooftop: 'an outdoor rooftop terrace lounge with ambient lighting and planters',
  pathway: 'an outdoor landscaped stone walkway and villa entrance garden path',
};

const DECOR_PROMPTS = {
  plants: 'add decorative indoor plants',
  art: 'add wall art/paintings',
  accessories: 'add luxury decorative accessories',
};

/* v-decor-fallback (لقطة المالك ١٣ أكتوبر: «خطأ: لم يرجع النموذج أي شكل» على «٣ كراسي فخمة»):
   مسار «بلا صورة» كان على gpt-image-2.5-flare وحده — رفض موديل أو سلامة أو زحام أو رصيد = صفر أشكال،
   والسبب في detail لا يعرضه أحد. الآن كلّ لقطة تتدرّج Flare ← gpt-image-2 (مثل maha-image)، وإن لم يرجع
   أيّ شكل من OpenAI تُرسم بنانو برو ← نانو ٢ بمفتاح GEMINI_API_KEY نفسه، كلّه داخل حدّ الدالّة (٣٠٠ث). */
const PLACE_OA_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2'];
const PLACE_GEMINI_MODELS = ['gemini-3-pro-image', 'gemini-3.1-flash-image'];
const PLACE_BUDGET_MS = 285000;
const PLACE_GEMINI_RESERVE_MS = 70000;

// خطأ يخصّ موديلًا واحدًا (غير متاح، رفض سلامته، زحامه، عطل مؤقّت) يُجرَّب بعده التالي؛ الرصيد والمفتاح للحساب كلّه.
function oaNextModel(status, msg) {
  if (/insufficient_quota|billing|exceeded your current quota|invalid api key|incorrect api key/i.test(msg)) return false;
  if ((status === 400 || status === 404) && /model/i.test(msg)) return true;
  if (status === 400 && /safety system|content policy|rejected by the safety|moderation/i.test(msg)) return true;
  return status === 429 || status >= 500;
}

async function placeShotOpenAI(key, prompt, deadline, noteErr) {
  for (let i = 0; i < PLACE_OA_MODELS.length; i++) {
    const m = PLACE_OA_MODELS[i];
    const left = deadline - Date.now() - PLACE_GEMINI_RESERVE_MS;
    if (left < 15000) return null;
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: m,
          prompt,
          size: '1536x1024',
          /* v-decor-hq (المالك: «الصور لم تعجبني»): أعلى جودة بدل medium وضغط أخفّ */
          quality: 'high',
          n: 1,
          output_format: 'webp',
          output_compression: 92,
        }),
        signal: AbortSignal.timeout(Math.min(240000, left)),
      });
      const d = await r.json().catch(() => null);
      const b = (((d && d.data) || [])[0] || {}).b64_json;
      if (b) return b;
      const msg = String((d && d.error && (d.error.message || d.error.code)) || 'empty response');
      noteErr(m + ' ' + r.status + ': ' + msg);
      if (!oaNextModel(r.status, msg)) return null;
    } catch (e) { noteErr(m + ': ' + ((e && e.message) || e)); return null; }
  }
  return null;
}

async function placeShotGemini(apiKey, prompt, deadline, noteErr) {
  for (const m of PLACE_GEMINI_MODELS) {
    const left = deadline - Date.now();
    if (left < 10000) return null;
    try {
      /* برو يقبل imageSize/aspectRatio؛ نانو ٢ بالصيغة النظيفة responseModalities وحدها (درس v-nano-banana) */
      const gc = /pro-image/.test(m) ? { imageConfig: { imageSize: '2K', aspectRatio: '16:9' } } : { responseModalities: ['IMAGE'] };
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: gc }),
        signal: AbortSignal.timeout(Math.min(150000, left)),
      });
      const d = await r.json().catch(() => null);
      const c = ((d && d.candidates) || [])[0] || {};
      const part = ((c.content || {}).parts || []).find((x) => x && x.inlineData && x.inlineData.data);
      if (part) return { b64: part.inlineData.data, mime: part.inlineData.mimeType || 'image/png' };
      noteErr(m + ' ' + r.status + ': ' + ((d && d.error && d.error.message) || c.finishReason || (d && d.promptFeedback && d.promptFeedback.blockReason) || 'no image'));
    } catch (e) { noteErr(m + ': ' + ((e && e.message) || e)); }
  }
  return null;
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

    const quota = await checkDesignQuota(token, res); /* v-atomic-quota: حجز ذرّيّ يُردّ إن فشل */
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
    /* v-decor-18 (مراجعة نقض): لون القماش يقول «للكنب والمخدّات والستائر»؛ إن اختار المستخدم ستارة بعينها (شيفون أبيض، بلا ستائر…)
       فاللون للكنب والمخدّات فقط — وإلّا تناقض الأمر نفسه وضاع أحد الاختيارين. */
    if (FABRIC_PROMPTS[fabric]) extras.push(CURTAIN_PROMPTS[curtains] ? FABRIC_PROMPTS[fabric].replace('sofas/cushions/curtains', 'sofas and cushions') : FABRIC_PROMPTS[fabric]);
    if (WALLCOLOR_PROMPTS[wallColor]) extras.push(WALLCOLOR_PROMPTS[wallColor]);
    if (CURTAIN_PROMPTS[curtains]) extras.push(CURTAIN_PROMPTS[curtains]);
    if (rearrange) extras.push('rearrange the furniture layout for better flow while keeping the room structure');
    if (Array.isArray(decor)) {
      decor.forEach((d) => { if (DECOR_PROMPTS[d]) extras.push(DECOR_PROMPTS[d]); });
    }
    const extrasText = extras.length ? (' Additionally apply these specific changes: ' + extras.join('; ') + '.') : '';

    // ── مسار «بلا صورة»: أشكال جاهزة من نوع المكان. يعمل على OpenAI لا على نموذج جوجل. ──
    if (!imageBase64) {
      const deadline = Date.now() + PLACE_BUDGET_MS; /* v-decor-fallback: الميزانيّة من بداية المسار (يشمل محاولة «نسخة ثانية») */
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
          fd.append('model', 'gpt-image-2.5-sunburst');
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
            const vrem = await consumeDesign(quota.username, quota.limit);
            res.status(200).json({ images: vimgs, remaining: vrem, dailyLimit: quota.limit || DESIGN_DAILY_LIMIT });
            return;
          }
        } catch (e) { /* fallback to normal generation below */ }
      }
      // v-decor-detail: لا نبتلع خطأ المزوّد — نكشفه منظّفًا في detail ليُشخَّص
      // (رصيد؟ اسم نموذج؟) بدل 502 صامتة. المفاتيح تُشطب دائمًا.
      // v-decor-fallback: كلّ لقطة تتدرّج بين موديلات OpenAI، وإن لم يرجع أيّ شكل تُرسم بنانو.
      const errs = [];
      const noteErr = (m) => { const t = String(m || '').slice(0, 160); if (t && errs.length < 3 && errs.indexOf(t) < 0) errs.push(t); };
      const prompts = Array.from({ length: n }, (_, i) => base + ' Camera: ' + VIEWS[i % VIEWS.length] + '.');
      let images = (await Promise.all(prompts.map((pr) => placeShotOpenAI(oaKey, pr, deadline, noteErr))))
        .filter(Boolean).map((b64) => ({ imageBase64: b64, mimeType: 'image/webp' }));
      if (!images.length) {
        images = (await Promise.all(prompts.map((pr) => placeShotGemini(apiKey, pr, deadline, noteErr))))
          .filter(Boolean).map((g) => ({ imageBase64: g.b64, mimeType: g.mime }));
      }
      if (!images.length) {
        res.status(502).json({
          error: 'لم يرجع النموذج أي شكل. جرّب نمطًا أو نوع مكان آخر.',
          detail: errs.join(' | ').slice(0, 300).replace(/key=[^&\s"']+/g, 'key=***'),
        });
        return;
      }
      const rem = await consumeDesign(quota.username, quota.limit);
      res.status(200).json({ images, remaining: rem, dailyLimit: quota.limit || DESIGN_DAILY_LIMIT });
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
        const rrem = await consumeDesign(quota.username, quota.limit);
        res.status(200).json({ imageBase64: rescued, mimeType: 'image/webp', remaining: rrem, dailyLimit: quota.limit || DESIGN_DAILY_LIMIT, engine: 'openai' });
        return;
      }
      const gmsg = String((data && data.error && data.error.message) || 'Upstream error');
      /* v-credit-out (أمر المالك ٢١ أكتوبر): رصيد المزوّد نفد — «الخدمة متوقّفة مؤقّتًا» (الواجهة تعرف unavailable)، لا نصّ فوترة المزوّد */
      if (require('./_videoFail.js').isOutage(upstream.status, gmsg)) { console.error('[design-create] upstream ' + upstream.status + ': ' + gmsg.slice(0, 200)); res.status(503).json({ error: 'unavailable' }); return; }
      /* v-rest-fixes: كان نصّ المزوّد نفسه (بالإنجليزيّة) يصل المستخدم؛ الآن رسالة عامّة، والسبب في detail يراه المالك وحده (v-decor-fallback) */
      res.status(upstream.status).json({ error: 'تعذّر تصميم الصورة الآن — حاول مرّة أخرى.', detail: gmsg.replace(/key=[^&\s"']+/g, 'key=***').slice(0, 300) });
      return;
    }

    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      /* v-guard-cap: Gemini أجاب ٢٠٠ بلا صورة («طلب المستخدم» الحرّ يوجّهه لذلك) والنداء الموازي مدفوع — كان يُرمى والحجز يُردّ
         فيتكرّر بلا حدّ. الآن يُسلَّم بشكل إنقاذ !upstream.ok نفسه ويُستهلك؛ ٥٠٠ فقط حين لا صورة مدفوعة. */
      const rescuedN = duoP ? await duoP : null;
      if (rescuedN) {
        const nrem = await consumeDesign(quota.username, quota.limit);
        res.status(200).json({ imageBase64: rescuedN, mimeType: 'image/webp', remaining: nrem, dailyLimit: quota.limit || DESIGN_DAILY_LIMIT, engine: 'openai' });
        return;
      }
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
    const remaining = await consumeDesign(quota.username, quota.limit);
    res.status(200).json({
      imageBase64: outB64,
      mimeType: outMime,
      engine: outEngine,
      remaining,
      dailyLimit: quota.limit || DESIGN_DAILY_LIMIT,
    });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
