// scripts/thumbs-paid.mjs — صور التطبيق الثابتة بمولّد الموقع المدفوع (gpt-image-2.5 / Gemini) بأعلى دقّة وبلا نصّ داخل الصورة.
//
// قرار المالك ١٧ أكتوبر: «وقف pollinations وReal-ESRGAN نهائيًّا. ولّد الصور بمولّد الموقع gpt-image-2.5 (أو Gemini) بأعلى دقّة،
// بدون أيّ نصّ داخل الصورة. أنا موافق على التكلفة. ورني كلّ صورة مكبّرة قبل الدمج.»
// قواعد الصور (CLAUDE.md): لا نصّ مطبوع، الدقّة الأصليّة للمولّد كما هي (لا تصغير ولا تكبير)، WebP q90.
//
//   OPENAI_API_KEY=… GEMINI_API_KEY=… node scripts/thumbs-paid.mjs <mode>
//   mode: edu-bg | edu-bg:library,space | poster | upload-art | opts | opts:furniture,flooring,fabric,wall,curtains | styles | places | fashion | fashion:women,men,kids,category,occasion,season,extras | studio
//
// الأوصاف من مصادر الحقيقة نفسها في الخادم (design-create / fashion-create / STUDIO_OPTIONS) + الصياغات التي راجعها المالك بالعين
// (v-decor-18c/d/e) لخيارات الديكور. المخرجات في thumbs/<نوع>/<اسم>.webp ثمّ ينسخها الورك فلو إلى assets/.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const MODE = process.argv[2] || '';
const OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();
const GEMINI_KEY = (process.env.GEMINI_API_KEY || '').trim();
const CONC = Math.max(1, Number(process.env.THUMBS_CONCURRENCY) || 3);
const BUDGET_MS = (Number(process.env.THUMBS_BUDGET_MIN) || 170) * 60000;
const SKIP_EXISTING = process.env.THUMBS_SKIP_EXISTING === '1'; // افتراضيًّا كلّ المجموعة تُعاد (تشغيلة مدفوعة بقرار صريح)
if (!OPENAI_KEY && !GEMINI_KEY) { console.log('✗ لا OPENAI_API_KEY ولا GEMINI_API_KEY'); process.exit(1); }

const grabFrom = (file, name) => {
  const src = readFileSync(file, 'utf8');
  const m = src.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\};'));
  if (!m) throw new Error(name + ' غير موجود في ' + file);
  return new Function('return {' + m[1] + '}')();
};
const NO_TEXT = ' No people unless stated. No text, no letters, no numbers, no captions, no watermark, no logo.';

// ---------- الديكور: الأنماط والأماكن (صياغة الإنتاج نفسها في design-create) ----------
const D_LOOK = ' Award-winning architectural interior photography, magazine editorial quality: physically accurate global illumination,' +
  ' soft natural light with believable shadows and reflections, rich real materials and textures, tasteful premium styling, layered lighting,' +
  ' depth and atmosphere, tack-sharp focus, ultra-high detail, true-to-life color. Not a cartoon, not a 3D render, not CGI, no over-saturation.';
// ---------- خيارات الديكور (الصياغات المراجَعة بالعين في v-decor-18c/d/e) ----------
const ROOM = 'cozy modern living room interior, eye-level wide shot, soft natural daylight from a window on the left, potted plant, round wooden coffee table, high detail, sharp focus.';
const THUMB = {
  furniture: {
    modern: 'a sleek modern sofa with clean straight lines and slim black metal legs, a glass coffee table',
    classic: 'a classic carved-wood sofa with tufted cream upholstery and two ornate wooden armchairs',
    simple: 'a simple low plain sofa and a plain wooden coffee table, almost no decor',
    luxury: 'a luxurious velvet sofa with gold metal details, a marble coffee table and a crystal table lamp',
    bohemian: 'a bohemian lounge with a rattan armchair, many colorful patterned cushions, layered kilim rugs, macrame wall hanging and plants',
    scandinavian: 'a Scandinavian light-grey sofa on light oak legs, a chunky wool throw, white and light wood everywhere',
    japandi: 'a low Japandi sofa on a natural wood platform, linen cushions, a paper lantern, very calm and minimal',
    industrial: 'an industrial set: black leather sofa, black metal and reclaimed wood coffee table, exposed red brick wall',
    midcentury: 'a mid-century modern walnut sofa with tapered legs, a mustard yellow armchair and teal accents',
    artdeco: 'an Art Deco curved emerald velvet sofa with brass and gold geometric side tables',
    rattan: 'woven natural rattan furniture: a rattan sofa frame, two round rattan armchairs and a rattan coffee table, the woven texture clearly visible',
    velvet: 'a plush rounded dusty-pink velvet sofa and a matching velvet armchair',
    leather: 'a rich brown leather Chesterfield tufted sofa with a leather armchair',
    majlis: 'traditional Arabic majlis floor seating: low cushions along the walls with back bolsters in patterned red and gold fabric, a low brass tray table',
    modular: 'a large grey modular L-shaped sectional sofa with deep seats',
    curved: 'a strongly curved semicircular crescent-shaped cream boucle sofa (a half-moon shape) and a round organic coffee table',
    rustic: 'rustic farmhouse furniture made of chunky rough reclaimed wood: a heavy wooden-frame sofa, a thick log slab coffee table, wooden beams on the ceiling',
  },
  wall: { forest: 'dark forest green (deep green paint covering every wall)', mocha: 'dark mocha chocolate brown', terracotta: 'bold terracotta orange clay', olive: 'olive green (khaki green, clearly green)' },
  curtains: {
    velvet: 'heavy deep-burgundy velvet floor-length drapes with rich folds',
    blackout: 'heavy charcoal-grey floor-length blackout drapes with rich folds, drawn fully closed across the whole window, thick opaque fabric',
    embroidered: 'cream curtains with wide gold Arabic embroidered borders and gold tassels',
    luxury: 'luxurious heavy gold and cream damask drapes with swags and tasselled tiebacks',
    pelmet: 'grey drapes under a large upholstered pelmet box valance spanning the top of the window',
    double: 'two curtain layers: a white sheer curtain behind and heavy charcoal drapes tied back in front',
    wave: 'light grey curtains hanging in perfectly even S-shaped wave folds from a ceiling track',
    motorized: 'modern charcoal curtains on a sleek ceiling track with a small motor box, half open',
    vertical: 'vertical slatted fabric blinds covering the whole window, clearly vertical stripes',
  },
};
const FLOOR_TOPDOWN = {
  checker: 'classic black and white checkerboard marble floor tiles',
  herringbone: 'golden oak parquet laid in a herringbone (V-shaped zig-zag) pattern of many small rectangular planks',
  hexagon: 'hexagonal honeycomb-shaped floor tiles, each tile a six-sided hexagon outlined by dark grout lines',
  moroccan: 'colorful blue and white patterned Moroccan cement floor tiles',
};
const OPTS = {
  furniture: { map: 'FURNITURE_PROMPTS', scene: (d) => 'Interior design photo of a living room featuring ' + d + '. The furniture is large in the frame and is the clear focus. Plain light walls, light oak floor, ' + ROOM },
  flooring: { map: 'FLOORING_PROMPTS', scene: (d) => 'Close-up interior photo looking down at the floor: ' + d + ' fills most of the image, its texture and pattern clearly visible, only the edge of a sofa and a coffee table leg at the top of the frame, soft daylight, photorealistic, high detail, sharp focus.' },
  fabric: { map: 'FABRIC_PROMPTS', scene: (d) => { const c = d.replace(/ (velvet )?fabrics for sofas\/cushions\/curtains/, ''); return 'Interior design photo of a ' + c + ' sofa with matching ' + c + ' armchair, cushions and curtains — the upholstery is clearly ' + c + '. White walls, light oak floor, ' + ROOM; } },
  wall: { map: 'WALLCOLOR_PROMPTS', scene: (d) => { const c = d.replace(/ wall paint$/, '').replace(/^a bold accent wall color$/, 'bold deep teal accent'); return 'Interior design photo of a room whose walls are painted solid ' + c + ' — every wall is clearly ' + c + '. White sofa, light oak floor, ' + ROOM; } },
  curtains: { map: 'CURTAIN_PROMPTS', scene: (d) => 'Interior design photo of a large window on the back wall dressed with ' + d + '. The window treatment is the clear focus. Beige sofa in front, white walls, light oak floor, ' + ROOM },
};
const OPT_FILE = { furniture: 'furniture', flooring: 'flooring', fabric: 'fabric', wall: 'wallcolor', curtains: 'curtains' };

// ---------- الأزياء ----------
const F_LOOK = ' Professional fashion catalog photography, luxury studio, warm golden rim lighting, dark elegant backdrop, full body, photorealistic, high detail.';
const PERSON = { women: 'an elegant modest Middle Eastern woman model wearing ', men: 'a well-groomed Middle Eastern man model wearing ', kids: 'a happy child model wearing ' };
const CARD_SETS = {
  category: [
    { name: 'women', style: 'evening', gender: 'women', d: 'elegant confident woman, upper-body fashion portrait, looking at camera' },
    { name: 'men', style: 'formal', gender: 'men', d: 'confident stylish man, upper-body fashion portrait, looking at camera' },
    { name: 'kids', style: 'formal', gender: 'kids', d: 'cheerful well-dressed child, upper-body portrait, looking at camera' },
  ],
  occasion: [
    { name: 'wedding', style: 'wedding', gender: 'women', d: 'celebratory wedding look' },
    { name: 'work', style: 'formal', gender: 'women', d: 'smart modern office workwear' },
    { name: 'casual', style: 'casual', gender: 'women', d: 'relaxed everyday street style' },
    { name: 'sport', style: 'casual', gender: 'women', d: 'modest sporty athletic activewear, dynamic pose' },
    { name: 'travel', style: 'casual', gender: 'women', d: 'comfortable stylish travel outfit with an elegant small suitcase' },
    { name: 'formal', style: 'formal', gender: 'women', d: 'refined formal event look' },
    { name: 'graduation', style: 'formal', gender: 'women', d: 'graduation gown and cap, proud pose' },
    { name: 'religious', style: 'abaya', gender: 'women', d: 'dignified modest look for a religious occasion' },
  ],
  season: [
    { name: 'summer', style: 'casual', gender: 'women', d: 'breezy elegant summer outfit' },
    { name: 'autumn', style: 'casual', gender: 'women', d: 'layered stylish autumn outfit, warm tones' },
    { name: 'winter', style: 'casual', gender: 'women', d: 'cozy elegant winter coat outfit' },
    { name: 'spring', style: 'casual', gender: 'women', d: 'fresh light spring outfit, floral hints' },
  ],
  extras: [
    { name: 'glasses', style: 'casual', gender: 'women', d: 'close-up on elegant designer sunglasses worn by a model' },
    { name: 'watch', style: 'formal', gender: 'women', d: 'close-up on an elegant luxury wristwatch on a model wrist' },
    { name: 'handbag', style: 'evening', gender: 'women', d: 'close-up on an elegant designer handbag held by a model' },
    { name: 'shoes', style: 'evening', gender: 'women', d: 'close-up on elegant designer heels worn by a model' },
    { name: 'scarf', style: 'casual', gender: 'women', d: 'close-up on an elegant silk scarf styled on a model' },
    { name: 'makeup', style: 'evening', gender: 'women', d: 'close-up beauty portrait with elegant evening makeup' },
    // v-fx-gender-pics: إضافات الرجال والأطفال (كانت صور امرأة لكلّ الفئات) — القطعة الأولى من كتالوج الخادم نفسه (fashion-variety ACCESSORIES)
    { name: 'men-glasses', style: 'casual', gender: 'men', d: 'close-up on aviator glasses with gold metal frames worn by the model' },
    { name: 'men-watch', style: 'formal', gender: 'men', d: 'close-up on a classic dress watch with a steel case on the model wrist and shirt cuff; the dial is completely plain with simple stick hour markers only, no numerals, no letters, no logo' },
    { name: 'men-handbag', style: 'formal', gender: 'men', d: 'close-up on a cognac leather briefcase held by the model' },
    { name: 'men-shoes', style: 'formal', gender: 'men', d: 'close-up on polished oxford shoes worn by the model' },
    { name: 'men-scarf', style: 'winterlux', gender: 'men', d: 'close-up on a cashmere scarf draped loosely over the model coat' },
    { name: 'men-makeup', style: 'formal', gender: 'men', d: 'close-up grooming portrait: subtle natural grooming with matte even skin and tidy brows, the beard neatly kept' },
    { name: 'kids-glasses', style: 'casual', gender: 'kids', d: 'close-up on round kids sunglasses worn by the smiling child' },
    { name: 'kids-watch', style: 'casual', gender: 'kids', d: 'extreme close-up macro shot of a colorful analog kids watch on the child wrist, the watch filling most of the frame; the dial shows only simple dot markers, no numbers, no letters, no logo' },
    { name: 'kids-handbag', style: 'casual', gender: 'kids', d: 'close-up on a mini crossbody purse carried by the child' },
    { name: 'kids-shoes', style: 'casual', gender: 'kids', d: 'close-up on clean new low-top canvas sneakers with plain socks worn by the child, no logos, no prints, no marks' },
    { name: 'kids-scarf', style: 'winterlux', gender: 'kids', d: 'close-up on a soft knit scarf worn by the child' },
    { name: 'kids-makeup', style: 'eidkids', gender: 'kids', d: 'close-up portrait of the child with a natural face and a little festive cheek glitter, no adult makeup' },
  ],
};

// ---------- خيارات الاستوديو ----------
const FEAT_SHOT = {
  hair: (l) => 'studio beauty portrait of a woman with ' + l + ' hairstyle, focus on the hair,',
  nails: (l) => 'close-up of an elegant hand showing ' + l + ' manicure nails,',
  makeup: (l) => 'studio beauty portrait of a woman with ' + l + ' makeup look,',
  beard: (l) => 'studio portrait of a Middle Eastern man with a ' + l + ' beard style,',
  skin: (l) => 'studio beauty portrait of a woman in an elegant modest high-neck outfit showing ' + l + ' facial skin finish, focus on the radiant face,',
  glasses: (l) => 'studio portrait of a person wearing ' + l + ' eyeglasses,',
  tattoo: (l) => 'close-up of a forearm with a ' + l + ' style tattoo design,',
  anime: (l) => l + ' anime art style illustrated portrait of a young character,',
  heritage: (l) => 'studio portrait of a person in ' + l + ' traditional heritage attire,',
};
const STUDIO_CARDS = new Set(["anime-chibi", "anime-classic", "anime-cyberpunk", "anime-ghibli", "anime-kawaii", "anime-manga", "anime-retro90s", "anime-shonenstudio", "anime-webtoon", "beard-anchor", "beard-boxed", "beard-clean", "beard-faded", "beard-full", "beard-goatee", "beard-longbeard", "beard-mustache", "beard-stubble", "beard-vandyke", "glasses-aviator", "glasses-catseye", "glasses-clearframe", "glasses-goldframe", "glasses-hexagon", "glasses-oversized", "glasses-retroglasses", "glasses-rimless", "glasses-round", "glasses-sportglasses", "glasses-sunglasses", "glasses-wayfarer", "hair-black", "hair-blonde", "hair-blue", "hair-bob", "hair-brown", "hair-burgundy", "hair-colorful", "hair-curly", "hair-highlights", "hair-longlayers", "hair-ombre", "hair-pixie", "hair-platinum", "hair-red", "hair-rose", "hair-silver", "hair-straight", "hair-waves", "heritage-abaya", "heritage-bisht", "heritage-embroidered", "heritage-emirati", "heritage-kandora", "heritage-moroccanher", "heritage-omani", "heritage-palestinian", "heritage-saudi", "heritage-saudimen2", "makeup-bridal", "makeup-dewy", "makeup-editorial", "makeup-glam", "makeup-kohl", "makeup-matte", "makeup-natural", "makeup-redlips", "makeup-smokey", "makeup-softglam", "nails-artnails", "nails-black", "nails-chrome", "nails-french", "nails-glitter", "nails-gold", "nails-marble", "nails-mattegray", "nails-nude", "nails-ombrenails", "nails-pink", "nails-red", "skin-circles", "skin-freckles", "skin-glow", "skin-matteskin", "skin-subtle", "skin-tan", "tattoo-arabictattoo", "tattoo-back", "tattoo-custom", "tattoo-floraltattoo", "tattoo-geometric", "tattoo-minimalline", "tattoo-sleeve", "tattoo-tribal", "tattoo-wrist"]);
const S_LOOK = ' Professional studio photography, warm golden lighting, dark elegant backdrop, photorealistic, high detail.';
function grabStudioOptions() {
  const s = readFileSync('js/app-13-stocks-init.js', 'utf8');
  const i = s.indexOf('const STUDIO_OPTIONS = {');
  let depth = 0, j = i + 'const STUDIO_OPTIONS = '.length;
  for (; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}') { depth--; if (!depth) break; } }
  return new Function('return ' + s.slice(i + 'const STUDIO_OPTIONS = '.length, j + 1))();
}

// ---------- مربّعات الرفع: مشاهد بتكوين المالك (لوحة ذهبيّة فارغة في وسط الأسفل للزرّ، ومساحة صافية أعلى الوسط للعنوان) ----------
const UPLOAD_ART = {
  decor: 'Ultra-luxurious interior design studio hall in white marble and gold: symmetrical composition, eye-level wide shot. In the upper center a large clean plain wall area left completely empty (reserved space). ' +
    'In the lower center a wide polished gold console with a large blank engraved gold plaque on its front (completely empty, no writing). Two golden lion statues at the left and right edges, ' +
    'curving golden film-strip ribbons with small framed room-design screens along both side walls, a crystal chandelier, gold circuit-line inlays in the marble floor, warm luxury lighting, photorealistic, ultra-high detail.',
  fashion: 'Ultra-luxurious gold fashion atelier in white marble: symmetrical composition, eye-level wide shot. Upper center: a large clean plain marble wall area left completely empty (reserved space) under a crystal chandelier, ' +
    'with a slim gold dress mannequin standing below it. Lower center: a polished gold console with a large round blank gold plate on top (completely empty, no writing). Golden draped curtains at both sides, ' +
    'two dark bronze lion statues at the left and right edges, display niches with gowns and jewelry, gold circuit-line inlays in the floor, warm luxury lighting, photorealistic, ultra-high detail.',
  style: 'Futuristic luxury AI style studio in dark marble and gold at night: symmetrical composition, eye-level wide shot. Center: a translucent blue hologram of a stylized figure holding a mirror above a gold podium. ' +
    'On the podium front a large rectangular blank gold plaque (completely empty, no writing), and on the floor platform below it a smaller blank gold plaque (completely empty). Glass panels on both sides showing fabric swatches, ' +
    'jewelry and fashion silhouettes, two golden lion statues at the left and right edges, gold roses in the corners, golden arches with a starry sky, photorealistic, ultra-high detail.',
};

// ---------- المهامّ ----------
const JOBS = []; // {kind, name, prompt, shape: 'land16'|'port'|'wide2'}
const isMode = (k) => MODE === k || MODE.startsWith(k + ':');
const sub = (k) => (MODE.startsWith(k + ':') ? MODE.slice(k.length + 1).split(',').map((x) => x.trim()).filter(Boolean) : null);
if (isMode('opts')) {
  const want = sub('opts') || Object.keys(OPTS);
  for (const sec of want) {
    const o = OPTS[sec]; if (!o) continue;
    const map = grabFrom('api/_lib/design-create.js', o.map);
    Object.entries(map).forEach(([v, desc]) => {
      if (sec === 'curtains' && v === 'remove') desc = 'no curtains at all, a bare uncovered window';
      if (THUMB[sec] && THUMB[sec][v]) desc = sec === 'wall' ? THUMB[sec][v] + ' wall paint' : THUMB[sec][v];
      const scene = (sec === 'flooring' && FLOOR_TOPDOWN[v])
        ? 'Top-down photo looking straight down at a floor of ' + FLOOR_TOPDOWN[v] + '. The floor pattern fills the entire image edge to edge, no furniture, no objects, soft daylight, photorealistic, sharp focus.'
        : o.scene(desc);
      JOBS.push({ kind: 'dopts', name: OPT_FILE[sec] + '-' + v, shape: 'land16', prompt: scene + D_LOOK + NO_TEXT });
    });
  }
}
if (isMode('styles')) {
  const STYLES = grabFrom('api/_lib/design-create.js', 'STYLE_PROMPTS');
  Object.entries(STYLES).forEach(([v, desc]) => JOBS.push({ kind: 'dstyle', name: v, shape: 'port', prompt: 'Photorealistic interior design photograph of a living room decorated in ' + desc + '.' + D_LOOK + NO_TEXT }));
}
if (isMode('places')) {
  const PLACES = grabFrom('api/_lib/design-create.js', 'PLACE_PROMPTS');
  Object.entries(PLACES).forEach(([v, desc]) => JOBS.push({ kind: 'dplace', name: v, shape: 'port', prompt: 'Photorealistic interior design photograph of ' + desc + ', tasteful modern decor.' + D_LOOK + NO_TEXT }));
}
if (isMode('fashion')) {
  const want = sub('fashion') || ['women', 'men', 'kids', 'category', 'occasion', 'season', 'extras'];
  const W = grabFrom('api/_lib/fashion-create.js', 'STYLE_PROMPTS'), M = grabFrom('api/_lib/fashion-create.js', 'STYLE_PROMPTS_MEN'), K = grabFrom('api/_lib/fashion-create.js', 'STYLE_PROMPTS_KIDS');
  const styleOf = (g, s) => ((g === 'men' ? M : g === 'kids' ? K : null) || {})[s] || W[s] || W.evening;
  // v-fx-mukhawara: البطاقة على صورة المالك المرجعيّة نفسها («هذا شكل المخوره») لا على الوصف القصير
  const CARD_DESC = { women: { mukhawara: 'a traditional Emirati mukhawar: a flowing floor-length A-line dress with long wide sleeves, a stand collar opening into a V, a sequined metallic talli-embroidered panel down the front with a row of small buttons, matching embroidered cuffs, in printed floral chiffon over a lining with metallic embroidered swirls and sequins, modest' } };
  for (const g of want) {
    if (CARD_SETS[g]) {
      CARD_SETS[g].forEach((c) => JOBS.push({ kind: g, name: c.name, shape: 'port', prompt: 'Fashion catalog photo of ' + PERSON[c.gender] + styleOf(c.gender, c.style) + ' — ' + c.d + '.' + F_LOOK + ' No text, no letters, no watermark, no logo.' }));
    } else {
      const map = g === 'men' ? M : g === 'kids' ? K : g === 'women' ? W : null; if (!map) continue;
      Object.entries(map).forEach(([v, desc]) => JOBS.push({ kind: g, name: v, shape: 'port', prompt: 'Fashion catalog photo of ' + PERSON[g] + (((CARD_DESC[g] || {})[v]) || desc) + '.' + F_LOOK + ' No text, no letters, no watermark, no logo.' }));
    }
  }
}
if (isMode('studio')) {
  const SO = grabStudioOptions();
  Object.entries(SO).forEach(([feat, list]) => {
    if (!Array.isArray(list) || !FEAT_SHOT[feat]) return;
    // الكتالوج ١٠١٧ خيارًا ومعاينات أغلبها حيّة؛ البطاقات الثابتة هي الـ٩٦ المسمّاة في STUDIO_CARDS — هذه وحدها تُعاد.
    list.filter((o) => STUDIO_CARDS.has(feat + '-' + o.value))
      .forEach((o) => JOBS.push({ kind: 'studioopt', name: feat + '-' + o.value, shape: 'port', prompt: FEAT_SHOT[feat](o.en || o.value) + S_LOOK + ' No text, no letters, no watermark, no logo.' }));
  });
}
if (isMode('upload-art')) {
  Object.entries(UPLOAD_ART).forEach(([k, p]) => JOBS.push({ kind: 'upart', name: k, shape: 'wide2', prompt: p + ' Absolutely no text, no letters, no numbers, no signage, no watermark, no logo anywhere in the image.' }));
}
// ---------- خلفيّات قسم «التعليم» (أمر المالك ١٩ أكتوبر): زخرفة على الأطراف بلا أيّ نصّ والوسط هادئ غامق (الأزرار HTML فوقه) ----------
// ثلاث نسخ لكلّ ثيم: desktop (أفقيّة) وmobile (طوليّة) وlight (أفقيّة للوضع الفاتح). تُحفظ مباشرةً في assets/edu-bg/ (الورك فلو يضيف assets كلّها)
// WebP أقلّ من ٢٠٠KB (جودة تنزل تدريجيًّا ثمّ العرض). الثيمان التجريبيّان: library (مكتبة كلاسيكيّة) وspace (فضاء).
const EDU_BG_COMMON = ' Decorative background art for an education app screen. All ornaments sit only along the outer edges and corners of the frame;' +
  ' the whole central area, about 60 percent of the image, is a calm, smooth, empty, softly lit region with no objects, no panels, no frames, no screens, no windows, no devices, no UI elements,' +
  ' so that buttons and cards can be placed over it and stay readable. Soft depth of field on the ornaments, premium cinematic quality, tack-sharp edges. No people.' +
  ' Absolutely no text, no letters, no numbers, no writing, no symbols that look like letters, no captions, no signage, no watermark, no logo anywhere; book spines and covers are blank with only abstract ornamental patterns.';
const EDU_BG = {
  library: {
    dark: 'Classic old-world library theme in deep navy blue and warm antique gold: stacks of leather-bound books with gold ornamental tooling, a brass compass, an armillary sphere, a brass globe, laurel branches, a graduation cap, a magnifying glass, a quill and ink pot, soft golden bokeh of library shelves and tall windows far in the background.' +
      ' The central calm region is a dark navy blue gradient (about #0d1b36 to #14284d) with only a faint warm vignette.',
    light: 'The same classic old-world library theme but in a bright airy light-mode palette: warm cream and pale ivory paper tones with soft gold and tan leather, light wood, brass details.' +
      ' The central calm region is a bright soft cream-white gradient (about #fbf6ea to #f1e7d2).',
  },
  space: {
    dark: 'Deep space theme in rich violet and purple: planets with rings, a crescent moon, a small telescope, star clusters, a swirling purple and magenta nebula and a distant spiral galaxy, tiny glowing stars, a small rocket far away.' +
      ' The central calm region is a dark deep-indigo gradient (about #0c0a24 to #1a1245) with only a faint starfield.',
    light: 'The same deep-space theme but in a bright light-mode palette: soft lavender, lilac and pearl-white tones, pastel planets with rings, a pale crescent moon, a gentle pastel nebula and light stars.' +
      ' The central calm region is a bright soft lavender-white gradient (about #f7f4ff to #e7e0fb).',
  },
};
if (isMode('edu-bg')) {
  const only = MODE.includes(':') ? MODE.split(':')[1].split(',').map((x) => x.trim()).filter(Boolean) : Object.keys(EDU_BG);
  only.filter((k) => EDU_BG[k]).forEach((k) => {
    const d = EDU_BG[k];
    JOBS.push({ kind: 'edubg', name: k + '-desktop', shape: 'land16', cap: 1920, prompt: 'Wide landscape 16:9 composition. ' + d.dark + EDU_BG_COMMON });
    JOBS.push({ kind: 'edubg', name: k + '-mobile', shape: 'port', cap: 1080, prompt: 'Tall portrait 2:3 composition for a phone screen; ornaments gather at the top corners and bottom edge and thinly along the sides, the tall middle stays empty. ' + d.dark + EDU_BG_COMMON });
    JOBS.push({ kind: 'edubg', name: k + '-light', shape: 'land16', cap: 1920, prompt: 'Wide landscape 16:9 composition. ' + d.light + EDU_BG_COMMON });
  });
}
// ---------- بوستر الديكور (أمر المالك ١٧ أكتوبر «أولّده»): الغرف الـ١٢ في شبكة ٤×٣ بلا أيّ نصّ — الأسماء HTML فوقه، والنقاط تُقاس من الصورة ----------
const POSTER_ROOMS = [
  ['a fine-dining restaurant with set tables and chairs', 'a cozy coffee shop with an espresso bar and stools', 'a serene master bedroom with a made bed and wardrobe', 'a traditional Arabic majlis with low patterned floor seating and ornate carpets'],
  ['a modern living room with a sofa, TV wall and plants', 'a modern kitchen with cabinets, island and appliances', 'a home office with a desk, computer monitor and bookshelves', "a colorful children's bedroom with a small bed and toys"],
  ['a boutique clothing shop with racks and a display window', 'a bathroom with a walk-in shower, vanity and mirror', 'a house entrance with a wooden front door, lantern and plant pots', 'a small garden with lawn, trees, flowers and a stone path'],
];
if (isMode('poster')) {
  JOBS.push({ kind: 'poster', name: 'poster', shape: 'poster', prompt:
    'Isometric 3D diorama poster on a dark charcoal reflective stage with subtle gold accents and a faint glowing network of thin golden lines in the background.' +
    ' Exactly twelve miniature open-box room dioramas, each on its own square marble plinth, arranged in a strict, evenly spaced grid of three rows and four columns' +
    ' that fills the frame with equal margins. Every diorama is the same size, viewed from the same isometric angle, cutaway with two walls removed so the interior is fully visible.' +
    ' Row 1 left to right: ' + POSTER_ROOMS[0].join('; ') + '. Row 2 left to right: ' + POSTER_ROOMS[1].join('; ') + '. Row 3 left to right: ' + POSTER_ROOMS[2].join('; ') + '.' +
    ' Warm interior lights inside each room, photoreal materials, crisp detail, cinematic studio lighting. Nothing between or above the rooms, no central object, no signs, no plaques, no labels on the plinths.' +
    ' Absolutely no text, no letters, no numbers, no captions, no watermark, no logo anywhere.' });
}
const OUT_DIR = { edubg: 'assets/edu-bg', poster: 'assets/decor/chips', dopts: 'assets/design/decor-opts', dstyle: 'assets/design/styles', dplace: 'assets/design/opts', women: 'assets/fashion/looks/women', men: 'assets/fashion/looks/men', kids: 'assets/fashion/looks/kids', category: 'assets/fashion/looks/category', occasion: 'assets/fashion/looks/occasion', season: 'assets/fashion/looks/season', extras: 'assets/fashion/looks/extras', studioopt: 'assets/studio/options', upart: 'assets/upload-art' };
const outName = (j) => (j.kind === 'dplace' ? 'place-' : '') + j.name + '.webp';
const jobs = SKIP_EXISTING ? JOBS.filter((j) => !existsSync(OUT_DIR[j.kind] + '/' + outName(j))) : JOBS;
if (!jobs.length) { console.log('لا مهامّ للوضع «' + MODE + '»'); process.exit(MODE ? 0 : 1); }
console.log('المطلوب: ' + jobs.length + ' صورة (' + MODE + ') بتوازٍ ' + CONC);

// ---------- المحرّكات ----------
const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(7, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OA_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2'];
async function openai(prompt, size) {
  for (const model of OA_MODELS) {
    for (let a = 1; a <= 2; a++) {
      try {
        const r = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST', headers: { Authorization: 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: prompt.slice(0, 3900), size, quality: 'high', n: 1, output_format: 'png' }),
          signal: AbortSignal.timeout(240000),
        });
        const d = await r.json().catch(() => ({}));
        const b64 = d && d.data && d.data[0] && d.data[0].b64_json;
        if (r.ok && b64) return Buffer.from(b64, 'base64');
        const msg = String((d.error && d.error.message) || '').slice(0, 160);
        if (/insufficient_quota|billing|exceeded your current quota|invalid api key|incorrect api key/i.test(msg)) throw new Error('OpenAI: ' + msg);
        console.log(el(), '… ' + model + ' محاولة ' + a + ' — HTTP ' + r.status + ' ' + msg);
        if ((r.status === 400 || r.status === 404) && /model/i.test(msg)) break; // الموديل غير متاح → التالي
        if (r.status === 400 && /safety|policy|moderation/i.test(msg)) break;
        await sleep(r.status === 429 ? 20000 * a : 6000 * a);
      } catch (e) { if (/^OpenAI: /.test(e && e.message)) throw e; console.log(el(), '… ' + model + ' محاولة ' + a + ' — ' + (e && e.message)); await sleep(6000 * a); }
    }
  }
  return null;
}
async function gemini(prompt, aspect, imageSize) {
  if (!GEMINI_KEY) return null;
  const models = imageSize === '4K' ? ['gemini-3-pro-image'] : ['gemini-3-pro-image', 'gemini-3.1-flash-image'];
  for (const m of models) {
    for (let a = 1; a <= 2; a++) {
      try {
        const gc = /pro-image/.test(m) ? { imageConfig: { imageSize, aspectRatio: aspect } } : { responseModalities: ['IMAGE'] };
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + GEMINI_KEY, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: gc }), signal: AbortSignal.timeout(240000),
        });
        const d = await r.json().catch(() => null);
        const c = ((d && d.candidates) || [])[0] || {};
        const part = ((c.content || {}).parts || []).find((x) => x && x.inlineData && x.inlineData.data);
        if (part) return Buffer.from(part.inlineData.data, 'base64');
        console.log(el(), '… ' + m + ' محاولة ' + a + ' — ' + r.status + ' ' + ((d && d.error && d.error.message) || c.finishReason || 'no image'));
        await sleep(8000 * a);
      } catch (e) { console.log(el(), '… ' + m + ' محاولة ' + a + ' — ' + (e && e.message)); await sleep(8000 * a); }
    }
  }
  return null;
}

// ---------- الحفظ: الدقّة الأصليّة، قصّ النسبة فقط، WebP q90 ----------
const sharp = (await import('sharp')).default;
// خلفيّات التعليم: أقلّ من ٢٠٠KB — الجودة تنزل من ٩٠ إلى ٥٠ بخطوات، فإن لم تكفِ يصغَّر العرض (بلا تكبير أبدًا)
const EDU_MAX = 195 * 1024;
async function saveEdu(j, img, meta) {
  const out = OUT_DIR.edubg + '/' + outName(j);
  mkdirSync(OUT_DIR.edubg, { recursive: true });
  const base = await img.toBuffer();
  for (let w = Math.min(j.cap, meta.width || j.cap); w >= 640; w = Math.round(w * 0.88)) {
    for (let q = 88; q >= 50; q -= 6) {
      const buf = await sharp(base).resize({ width: w, withoutEnlargement: true, kernel: 'lanczos3' }).webp({ quality: q, effort: 6 }).toBuffer();
      if (buf.length <= EDU_MAX) {
        writeFileSync(out, buf);
        const m = await sharp(buf).metadata();
        return out + ' ' + m.width + '×' + m.height + ' q' + q + ' ' + Math.round(buf.length / 1024) + 'KB';
      }
    }
  }
  throw new Error('تعذّر الوصول لأقلّ من ٢٠٠KB');
}
async function save(j, buf) {
  const meta = await sharp(buf).metadata();
  let img = sharp(buf);
  const want = j.shape === 'land16' ? 16 / 9 : j.shape === 'wide2' ? 2 : j.shape === 'poster' ? 4 / 3 : 0; // 0 = كما هي (3:4 و2:3 تُقصّ بـobject-fit عند العرض)
  if (want) {
    const w = meta.width, h = meta.height;
    const cw = Math.min(w, Math.round(h * want)), ch = Math.min(h, Math.round(w / want));
    img = img.extract({ left: Math.floor((w - cw) / 2), top: Math.floor((h - ch) / 2), width: cw, height: ch });
  }
  // المولّد يرجع أكبر من المطلوب (1792×2400 / 5376×2688): تصغير واحد بـLanczos من الخام إلى ضعفَي أكبر عرض عرضٍ في التطبيق
  // (بطاقة ≤ ٣٦٠ → 1024، بطاقة عريضة ≤ ٢٣١ وغطاء الجوّال → 1536، مربّع الرفع ≤ ١٣٧٥ → 3072) — لا تكبير أبدًا (withoutEnlargement).
  const CAP = { port: 1024, land16: 1536, wide2: 3072, poster: 1640 }[j.shape] || 1024; // البوستر يُعرض بعرض ≤ ٨٢٠
  if (j.kind === 'edubg') return saveEdu(j, img, meta);
  img = img.resize({ width: CAP, withoutEnlargement: true, kernel: 'lanczos3' });
  mkdirSync('thumbs/' + j.kind, { recursive: true });
  const out = 'thumbs/' + j.kind + '/' + outName(j);
  const info = await img.webp({ quality: 90 }).toFile(out);
  return out + ' ' + info.width + '×' + info.height + ' ' + Math.round(info.size / 1024) + 'KB';
}

async function run(j) {
  let buf = null;
  if (j.shape === 'poster') {
    buf = await gemini(j.prompt, '4:3', '4K');
    if (!buf && OPENAI_KEY) buf = await openai(j.prompt, '1536x1024');
  } else if (j.shape === 'wide2') {
    // أعلى دقّة متاحة: Gemini 3 Pro 4K بنسبة 21:9 ثمّ قصّ 2:1 (~3500×1750) — gpt-image حدّه 1536
    buf = await gemini(j.prompt, '21:9', '4K');
    if (!buf && OPENAI_KEY) buf = await openai(j.prompt, '1536x1024');
  } else {
    const size = j.shape === 'land16' ? '1536x1024' : '1024x1536';
    if (OPENAI_KEY) buf = await openai(j.prompt, size);
    if (!buf) buf = await gemini(j.prompt, j.shape === 'land16' ? '16:9' : '3:4', '2K');
  }
  if (!buf) throw new Error('كلّ المحرّكات فشلت');
  return save(j, buf);
}

let failed = 0, done = 0, stopped = 0, i = 0;
async function worker() {
  while (i < jobs.length) {
    if (Date.now() - t0 > BUDGET_MS) { stopped += jobs.length - i; i = jobs.length; break; }
    const j = jobs[i++];
    try { const r = await run(j); done++; console.log(el(), '✓ ' + j.kind + '/' + j.name + ' — ' + r); }
    catch (e) { failed++; console.log(el(), '✗ ' + j.kind + '/' + j.name + ' — ' + (e && e.message)); if (/^OpenAI: /.test(e && e.message) && !GEMINI_KEY) { i = jobs.length; } }
  }
}
await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, worker));
if (stopped) console.log('⏱️ الميزانية انتهت — تبقّى ' + stopped);
console.log((failed ? '✗ ' + failed + ' فشلت · ' : '') + '✓ ' + done + '/' + jobs.length + ' صورة جاهزة');
process.exitCode = done ? 0 : 2;
