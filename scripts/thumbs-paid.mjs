// scripts/thumbs-paid.mjs — صور التطبيق الثابتة بمولّد الموقع المدفوع (gpt-image-2.5 / Gemini) بأعلى دقّة وبلا نصّ داخل الصورة.
//
// قرار المالك ١٧ أكتوبر: «وقف pollinations وReal-ESRGAN نهائيًّا. ولّد الصور بمولّد الموقع gpt-image-2.5 (أو Gemini) بأعلى دقّة،
// بدون أيّ نصّ داخل الصورة. أنا موافق على التكلفة. ورني كلّ صورة مكبّرة قبل الدمج.»
// قواعد الصور (CLAUDE.md): لا نصّ مطبوع، الدقّة الأصليّة للمولّد كما هي (لا تصغير ولا تكبير)، WebP q90.
//
//   OPENAI_API_KEY=… GEMINI_API_KEY=… node scripts/thumbs-paid.mjs <mode>
//   mode: edu-bg | edu-bg:wood,darkwood,… | poster | upload-art | opts | opts:furniture,flooring,fabric,wall,curtains | styles | places | fashion | fashion:women,men,kids,category,occasion,season,extras | studio
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
// ---------- خلفيّات قسم «التعليم» (المالك ٢٠ أكتوبر: «نفس هذي الفكرة… ٢٤ ثيم يعني بيكونون ٤٨… ما أريد الصور مغبّشة») ----------
// الفكرة من نماذجه: مشهد مكتب بأسلوب كلّ ثيم، وفي وسطه لوح/شاشة مستطيلة فاضية تمامًا بلون واحد — الواجهة الحقيقيّة (HTML بالـ١٤ لغة
// وبألوان الثيم) تُرسم فوق الشاشة مباشرةً بلا لوح تحتها. لا نصّ ولا حرف في الصورة (ظهور الكتب فاضية). نسختان لكلّ ثيم: حاسوب 16:9 وجوّال طوليّ.
// الدقّة: دقّة المولّد الأصليّة كما هي (cap كبير — لا تصغير)، WebP q90؛ سقف ١٩٥KB السابق (v-edu-bg) هو الذي غبّش الصور فأُلغي.
// لون الشاشة لكلّ ثيم من لون صفحته (--th-page) ليلتحم بالواجهة؛ المولّد لا يضبط الهندسة بالضبط فتُقاس حدود الشاشة من كلّ صورة بعد التوليد
// (scripts/edu-bg-measure.mjs → assets/edu-bg/meta.json) وتُبنى منها مواضع CSS.
const EDU_SKINS = {
  wood: { screen: '#f3ead8', style: 'Warm natural wood study theme in cream parchment, honey oak and soft brown: a wooden desk edge, an old leather notebook, a quill pen, dried wheat sprigs, a small brass desk lamp, rolled paper scrolls, a sprig of olive leaves.' },
  darkwood: { screen: '#1e140c', style: 'Dark walnut wood and brass study theme: carved dark walnut frames, brass candlesticks, stacks of dark leather books with brass corners, an antique brass lamp, a pocket watch, a rolled map.' },
  marble: { screen: '#0d0d0f', style: 'Black marble and gold theme: black marble slabs with thin glittering gold veins along the edges, a gold fountain pen, a few gold geometric frames, a gold laurel wreath fragment, small gold coins of pure ornament.' },
  code: { screen: '#0a1216', style: 'Dark developer theme in deep teal and soft green glow: abstract glowing circuit traces, floating mind-map node diagrams made only of circles and lines, a keyboard corner, a mechanical keyboard keycaps without any markings, glowing bracket shapes, small chips.' },
  cars: { screen: '#101114', style: 'Sports car theme in steel grey and electric blue: the glowing headlights and front fender of a sleek supercar at the bottom corner, carbon-fibre texture, brake disc, a racing helmet, light streaks of speed along the edges.' },
  kids: { screen: '#f7f3ff', style: 'Playful kids learning theme in soft pastel lilac, pink, mint and sky blue: colorful jigsaw puzzle pieces, crayons, a paper airplane, stars, a rainbow, a toy abacus with plain beads, building blocks without any letters, clouds.' },
  cuisine: { screen: '#fbf6f2', style: 'Cozy pastel kitchen theme in blush pink, cream and sage green: wooden spoons, a whisk, a small pot, herbs in pots, lemons, a rolling pin, a tea towel with a plain pattern, flour sprinkle, a ceramic bowl.' },
  sunset: { screen: '#3a2430', style: 'Luxury sunset theme in warm orange, coral and dusty rose: an infinity pool edge at golden hour, a glowing sun low over the sea, palm leaf silhouettes, a lounge chair corner, soft clouds lit in pink.' },
  beach: { screen: '#e6f6f8', style: 'Tropical beach theme in turquoise, sand and palm green: palm trees and fronds, seashells, a starfish, turquoise waves foaming at the corner, a straw hat, sparkling water.' },
  winter: { screen: '#f0f5fa', style: 'Winter mountain theme in icy white and pale blue: snow-covered pine branches, snowflakes, frosted pine cones, distant snowy peaks, a cosy knitted scarf corner, soft falling snow.' },
  garage: { screen: '#111113', style: 'Dark car-garage theme in charcoal, steel and red: a toolbox corner, wrenches, a tyre, red tail-light glow, a hanging work lamp, metal shelving, oil can, checker plate floor at the bottom.' },
  anime: { screen: '#150f26', style: 'Anime bedroom-studio night theme in deep purple, magenta and neon pink: a cozy desk corner with glowing monitors showing abstract glowing shapes, string lights, manga volumes with blank covers, posters of abstract shapes, a desk lamp, soft neon sunset through a window. No characters, no people.' },
  cyber: { screen: '#040d17', style: 'Cyber-security hacker night theme in deep navy and cyan: glowing holographic world map of dots, abstract padlock and shield shapes made of light, rows of server racks, floating hexagon grids, faint data streams. No people, no hooded figure.' },
  school: { screen: '#2c261c', style: 'Warm study-desk theme in dark chalkboard green-brown and amber: a pile of hardcover books with blank covers, a school backpack, pencils in a cup, a globe, a desk lamp glowing amber, an open window with warm evening light.' },
  tactical: { screen: '#4a0a1c', style: 'Crimson tactical theme in deep red and black: stylised tactical gear without any weapons: a helmet, a radio headset, night-vision goggles, a map case, carabiners, a compass, angular geometric crimson shapes and light streaks.' },
  angel: { screen: '#e7eef7', style: 'Heavenly angel theme in silver, ice blue and white: large soft feathered silver-white wings along the edges, floating feathers, ice crystal shards, glowing pale-blue light rays, silver armor ornaments, clouds. No face, no person.' },
  neonanime: { screen: '#040506', style: 'Neon cyber-anime theme in black, cyan and magenta: flowing liquid-chrome and cyan ribbons swirling at the edges, neon light trails, glowing geometric shards, a faint hex grid, sparks. No characters, no people.' },
  station: { screen: '#2d3236', style: 'Old industrial railway-station theme in rusty steel, brass and soft haze: iron roof girders with glass skylights, steam, brass lanterns, a vintage suitcase, a station clock without numerals, railway tracks at the bottom.' },
  rally: { screen: '#46412f', style: 'Desert rally theme in sand, dusty khaki and rust: dust clouds, rally-car tyre tracks, a spare wheel, jerrycans, a compass, dune ridges, a roll-cage corner, warm sun haze. No text on the car.' },
  smoke: { screen: '#050f1f', style: 'Deep blue smoke and liquid theme: flowing translucent navy and electric-blue smoke ribbons curling along the edges, glowing blue particles, faint light beams.' },
  library: { screen: '#eefafa', style: 'Modern bright aqua-and-white library atrium theme: tall white shelves full of blank-spined books, glass railings, teal reading chairs, a spiral staircase corner, ferns in white pots, soft daylight.' },
  cafe: { screen: '#f2e6d4', style: 'Warm coffee-shop theme in caramel, cream and latte brown: ceramic coffee cups with latte art, a croissant, an open blank notebook with a pen, string lights bokeh, a small plant, a wooden table edge, steam.' },
  workshop: { screen: '#14122a', style: 'Cyberpunk electronics workshop night theme in indigo, violet and electric blue: a soldering station, circuit boards, spools of cable, glowing LED strips, small robots parts, tool pegboard, a neon tube. No people.' },
  modern: { screen: '#e6e0d6', style: 'Minimal modern Scandinavian interior theme in warm greige, concrete and light oak: a lounge chair corner, a slim floor lamp, a ceramic vase with dried grass, a linen throw, a stack of plain books, soft window light.' },
};
const EDU_NO_TEXT = ' No people. Absolutely no text, no letters, no numbers, no writing, no symbols that look like letters, no captions, no signage, no labels, no watermark, no logo anywhere; every book spine and cover is completely blank with at most a thin plain ornamental line.';
const EDU_DESK = (s) => 'Photorealistic 3D rendered still life, wide 16:9 landscape, eye level, tack-sharp focus across the whole frame, premium cinematic lighting. ' + s.style +
  ' COMPOSITION, strict: a large thin-framed rectangular display board stands upright on the desk facing the camera squarely and fills the right three quarters of the frame;' +
  ' its screen spans from 27 percent to 97 percent of the image width and from 7 percent to 91 percent of the image height, perfectly rectangular, perfectly flat, front-facing with no perspective tilt.' +
  ' The entire screen is one perfectly uniform, smooth, matte, solid color ' + s.screen + ' with absolutely nothing on it: no glare, no reflections, no gradient, no vignette, no icons, no shapes, no glow. Nothing overlaps or touches the screen area.' +
  ' In the left quarter of the frame, in front of the board: a tall neat stack of hardcover books with completely blank spines, a glowing desk lamp, a small globe, an open notebook with blank pages.' +
  ' Along the bottom edge in front of the board, small and low so they stay below the screen: a graduation cap, a compass, a small potted plant, a pen holder with pens.' + EDU_NO_TEXT;
const EDU_PHONE = (s) => 'Photorealistic 3D rendered still life, tall portrait composition for a phone screen, eye level, tack-sharp focus across the whole frame, premium cinematic lighting. ' + s.style +
  ' COMPOSITION, strict: a tall thin-framed rectangular board stands upright facing the camera squarely and fills almost the whole frame;' +
  ' its screen spans from 6 percent to 94 percent of the image width and from 12 percent to 86 percent of the image height, perfectly rectangular, perfectly flat, front-facing with no perspective tilt.' +
  ' The entire screen is one perfectly uniform, smooth, matte, solid color ' + s.screen + ' with absolutely nothing on it: no glare, no reflections, no gradient, no vignette, no icons, no shapes, no glow. Nothing overlaps or touches the screen area.' +
  ' Ornaments only along the top edge above the board (a graduation cap, a small potted plant, a few hanging paper hearts) and along the bottom edge in front of the board (a short stack of hardcover books with blank spines, a small desk lamp, a small globe, an open notebook with blank pages); the side margins stay thin and plain.' + EDU_NO_TEXT;
if (isMode('edu-bg')) {
  const only = MODE.includes(':') ? MODE.split(':')[1].split(',').map((x) => x.trim()).filter(Boolean) : Object.keys(EDU_SKINS);
  only.forEach((k) => {
    const s = EDU_SKINS[k]; if (!s) { console.log('ثيم مجهول ' + k); return; }
    // cap كبير = دقّة المولّد الأصليّة بلا تصغير (قرار المالك: لا صور مغبّشة). بادئة skin- تمنع اصطدام الأسماء على فرع الروبوت.
    JOBS.push({ kind: 'edubg', name: 'skin-' + k + '-desktop', shape: 'land16', cap: 8192, prompt: EDU_DESK(s) });
    JOBS.push({ kind: 'edubg', name: 'skin-' + k + '-mobile', shape: 'port', cap: 8192, prompt: EDU_PHONE(s) });
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
  const CAP = j.cap || ({ port: 1024, land16: 1536, wide2: 3072, poster: 1640 }[j.shape] || 1024); // البوستر يُعرض بعرض ≤ ٨٢٠؛ j.cap يفرض سقفًا خاصًّا (edu-bg: الدقّة الأصليّة)
  img = img.resize({ width: CAP, withoutEnlargement: true, kernel: 'lanczos3' });
  // edu-bg يُكتب مباشرةً في assets/edu-bg (الورك فلو يضيف assets كلّها) — تعديل الورك فلو يحتاج صلاحيّة workflow غير متاحة للجسر.
  const dir = j.kind === 'edubg' ? OUT_DIR.edubg : 'thumbs/' + j.kind;
  mkdirSync(dir, { recursive: true });
  const out = dir + '/' + outName(j);
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
