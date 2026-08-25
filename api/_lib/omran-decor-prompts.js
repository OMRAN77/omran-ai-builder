/* =====================================================================
   omran-decor-prompts.js — مكتبة برومبتات ديكور AI (النسخة المحسّنة)
   مقتبسة من حزمة «عمران — AI ديكور» المقترحة، ومُكيّفة لتطبيقنا:
   مفاتيح الخيارات إنجليزية لتطابق ما ترسله الواجهة الحالية، وخريطة
   LEGACY_STYLE_MAP تُبقي كل أنماط الواجهة القديمة شغالة كما هي.
   ===================================================================== */

/* ---------- قفل الهندسة: أهم سطر في الملف ----------
   بدونه يغيّر النموذج شكل الغرفة نفسها ويطلع مكان ثاني.            */
const GEOMETRY_LOCK =
  ' CRITICAL: keep the exact same room. Do not move or resize walls, windows, doors,' +
  ' ceiling height, or the camera position and angle. Preserve the original perspective' +
  ' and the daylight direction coming through the windows. Change only furniture,' +
  ' finishes, colours, textiles and decor. Photorealistic interior photography,' +
  ' natural proportions, no text or watermark in the image.';

/* ---------- قفل الاتساق بين الزوايا ---------- */
const CONSISTENCY_LOCK =
  ' The second image is the approved design for another angle of THIS SAME ROOM.' +
  ' Reuse exactly the same furniture pieces, materials, wall colour, flooring, textiles' +
  ' and lighting temperature from it, so both angles clearly belong to one room.' +
  GEOMETRY_LOCK;

/* ---------- ٢٤ نمطًا ---------- */
const STYLES = [
  // عربية وخليجية
  { id: 'najdi', name: 'نجدي', emoji: '🏜', cat: 'ar', desc: 'طين وخشب وزخرفة',
    prompt: 'Traditional Najdi Saudi interior: earthen clay-toned walls, carved geometric wooden panels and doors, recessed triangular wall niches, woven floor seating with camel-wool cushions, palm-wood ceiling beams, warm ochre and sand palette.' },
  { id: 'andalusi', name: 'أندلسي', emoji: '🏛', cat: 'ar', desc: 'أقواس وزليج',
    prompt: 'Andalusian Moorish interior: horseshoe arches, glazed zellige tilework in emerald and cobalt, carved plaster arabesque, patterned tiled floor, brass lanterns, indoor courtyard feel with lush greenery.' },
  { id: 'islamic', name: 'إسلامي معاصر', emoji: '🕌', cat: 'ar', desc: 'خط وهندسة',
    prompt: 'Contemporary Islamic interior: clean modern volumes with geometric mashrabiya screens, subtle Arabic calligraphy wall art, warm limestone and walnut, muted sand and deep green palette, indirect cove lighting.' },
  { id: 'emirati', name: 'إماراتي فاخر', emoji: '🐪', cat: 'ar', desc: 'مجلس وسدو',
    prompt: 'Luxury Emirati majlis: long low seating along the walls in cream and gold upholstery, sadu-patterned cushions, oversized ornate rug, brass coffee service table, gypsum ceiling detail with warm downlights, palm and desert tones.' },
  { id: 'moroccan', name: 'مغربي', emoji: '🧿', cat: 'ar', desc: 'فوانيس وألوان',
    prompt: 'Moroccan riad interior: tadelakt plaster walls, pierced brass lanterns casting patterned shadows, layered kilim rugs, low carved wooden furniture, jewel tones of saffron, terracotta and teal.' },
  { id: 'ramadan', name: 'رمضاني', emoji: '🌙', cat: 'ar', desc: 'فوانيس ودفء',
    prompt: 'Ramadan-styled living space: warm lantern lighting, crescent and star decorative accents, deep purple and gold textiles, generous floor seating, dates and coffee setup on a low table, cosy nighttime ambience.' },
  // حديثة
  { id: 'modern', name: 'مودرن', emoji: '⬜', cat: 'md', desc: 'خطوط نظيفة',
    prompt: 'Modern interior: clean straight lines, low-profile furniture, matte neutral palette, hidden storage, large format porcelain floor, integrated linear lighting, uncluttered surfaces.' },
  { id: 'minimal', name: 'مينيمال', emoji: '◻', cat: 'md', desc: 'أقل وأهدأ',
    prompt: 'Minimalist interior: very few carefully chosen pieces, off-white and warm grey palette, one sculptural chair, empty wall space as a design element, soft diffused daylight, no clutter.' },
  { id: 'japandi', name: 'يباندي', emoji: '🎋', cat: 'md', desc: 'ياباني إسكندنافي',
    prompt: 'Japandi interior: low light-oak furniture, paper-textured lighting, linen and wool in oat and clay tones, one ikebana arrangement, tatami-inspired textures, calm restrained styling.' },
  { id: 'scandi', name: 'إسكندنافي', emoji: '🕯', cat: 'md', desc: 'خشب فاتح',
    prompt: 'Scandinavian interior: pale ash wood, white walls, soft grey textiles, sheepskin throw, simple functional furniture, candles, abundant natural light, hygge warmth.' },
  { id: 'zen', name: 'زن', emoji: '🧘', cat: 'md', desc: 'هدوء وتوازن',
    prompt: 'Zen interior: balanced symmetry, natural stone and bamboo, water feature accent, muted earth palette, floor cushions, soft indirect lighting, deep sense of calm.' },
  { id: 'smart', name: 'ذكي', emoji: '🤖', cat: 'md', desc: 'تقنية مدمجة',
    prompt: 'Smart-home interior: concealed technology, motorised blinds, tunable LED cove lighting, wall control panel, matte charcoal and cool grey palette, cable-free surfaces, subtle blue accent glow.' },
  // فخمة
  { id: 'luxury', name: 'فاخر', emoji: '💎', cat: 'lx', desc: 'رخام وذهبي',
    prompt: 'High-luxury interior: book-matched marble surfaces, brushed brass details, deep velvet upholstery, crystal pendant lighting, layered ambient lighting, rich cream and champagne palette.' },
  { id: 'neo', name: 'نيو كلاسيك', emoji: '👑', cat: 'lx', desc: 'فخامة أوروبية',
    prompt: 'Neoclassical interior: wall panelling with fine mouldings, tufted upholstery, ornate chandelier, marble console, symmetrical layout, ivory and antique-gold palette.' },
  { id: 'artdeco', name: 'آرت ديكو', emoji: '🔶', cat: 'lx', desc: 'أشكال وذهبي',
    prompt: 'Art Deco interior: bold geometric patterns, fluted panels, lacquered black and gold, curved velvet seating, sunburst mirror, dramatic feature lighting.' },
  { id: 'dark', name: 'داكن درامي', emoji: '🖤', cat: 'lx', desc: 'ألوان غامقة',
    prompt: 'Dark dramatic interior: charcoal and deep green walls, matte black joinery, moody focused lighting, brass accents, textured heavy fabrics, cinematic contrast.' },
  // دافئة ومتنوعة
  { id: 'boho', name: 'بوهيمي', emoji: '🌿', cat: 'wm', desc: 'خامات ونباتات',
    prompt: 'Bohemian interior: layered patterned rugs, rattan and macrame, abundant trailing plants, mixed warm textiles, low seating, relaxed collected-over-time feel.' },
  { id: 'rustic', name: 'ريفي', emoji: '🪵', cat: 'wm', desc: 'خشب خام',
    prompt: 'Rustic interior: reclaimed rough timber, exposed beams, stone accent wall, linen and jute textiles, iron hardware, warm amber lighting.' },
  { id: 'midcent', name: 'منتصف القرن', emoji: '🪑', cat: 'wm', desc: 'ستينات أنيقة',
    prompt: 'Mid-century modern interior: walnut furniture with tapered legs, mustard and teal accents, geometric sideboard, globe pendant lamp, low sculptural seating.' },
  { id: 'coastal', name: 'ساحلي', emoji: '🌊', cat: 'wm', desc: 'أزرق وأبيض',
    prompt: 'Coastal interior: white-washed walls, soft blue and sand palette, linen slipcovers, rattan accents, driftwood textures, breezy sheer curtains, bright airy daylight.' },
  { id: 'industrial', name: 'صناعي', emoji: '🏭', cat: 'wm', desc: 'طوب ومعدن',
    prompt: 'Industrial interior: exposed brick, black steel framing, concrete floor, leather seating, Edison filament lighting, raw utilitarian character.' },
  { id: 'garden', name: 'حديقة داخلية', emoji: '🌴', cat: 'wm', desc: 'نباتات كثيفة',
    prompt: 'Indoor-garden interior: dense layered plants of varying heights, planted vertical wall, terracotta pots, rattan furniture, abundant natural light, fresh green palette.' },
  { id: 'maximal', name: 'ماكسيمال', emoji: '🎨', cat: 'wm', desc: 'ألوان وجرأة',
    prompt: 'Maximalist interior: saturated colour blocking, bold pattern mixing, gallery wall of framed art, statement furniture, layered accessories, confident and full.' },
  { id: 'kids', name: 'أطفال مرح', emoji: '🎈', cat: 'wm', desc: 'ألوان وآمن',
    prompt: 'Playful kids room: soft rounded child-safe furniture, cheerful pastel palette, play nook with cushions, open low toy storage, wall decals, warm friendly lighting.' },
];

// أنماط الواجهة القديمة تبقى شغالة حرفيًا — تُترجم لأقرب نمط في المكتبة.
const LEGACY_STYLE_MAP = {
  bohemian: 'boho',
  simple: 'minimal',
  arabic: 'emirati',
  classic: 'neo',
};

/* ---------- ١٥ مكانًا ---------- */
const PLACES = [
  { id: 'majlis', name: 'مجلس', prompt: 'a traditional Arabic majlis sitting room' },
  { id: 'living', name: 'صالة', prompt: 'a family living room' },
  { id: 'bed', name: 'غرفة نوم', prompt: 'a master bedroom' },
  { id: 'kids', name: 'غرفة أطفال', prompt: 'a children bedroom' },
  { id: 'kitchen', name: 'مطبخ', prompt: 'a kitchen' },
  { id: 'bath', name: 'حمام', prompt: 'a bathroom' },
  { id: 'entry', name: 'مدخل', prompt: 'an entrance hallway' },
  { id: 'office', name: 'مكتب', prompt: 'a home office' },
  { id: 'shop', name: 'محل', prompt: 'a retail shop interior' },
  { id: 'cafe', name: 'كافيه', prompt: 'a coffee shop interior' },
  { id: 'rest', name: 'مطعم', prompt: 'a restaurant dining area' },
  { id: 'garden', name: 'حديقة', prompt: 'an outdoor garden seating area' },
  { id: 'dining', name: 'سفرة', prompt: 'a formal dining room' },
  { id: 'balcony', name: 'بلكونة', prompt: 'a balcony lounge area' },
  { id: 'majlism', name: 'مجلس رجال', prompt: 'a formal mens majlis reception' },
];

// أسماء الأماكن في الواجهة القديمة → معرفات المكتبة.
const LEGACY_PLACE_MAP = {
  restaurant: 'rest',
  bedroom: 'bed',
  bathroom: 'bath',
  entrance: 'entry',
};

/* ---------- التخصيص المتقدم (مفاتيح إنجليزية = ما ترسله الواجهة) ---------- */
const OPTIONS = {
  light: {
    warm: 'warm 2700K lighting', cool: 'cool 5000K lighting',
    bright: 'bright well-lit space', dim: 'dim moody evening lighting',
  },
  furn: {
    modern: 'modern furniture', classic: 'classic furniture', simple: 'simple furniture',
    luxury: 'high-end luxury furniture', bohemian: 'bohemian furniture',
  },
  floor: {
    parquet: 'wooden parquet flooring', marble: 'marble flooring',
    ceramic: 'porcelain tile flooring', carpet: 'carpeted flooring',
  },
  fabric: {
    light: 'light-toned fabrics', dark: 'dark-toned fabrics',
    neutral: 'neutral fabrics', bold: 'bold colourful fabrics',
  },
  wall: {
    white: 'white walls', beige: 'beige walls',
    gray: 'grey walls', bold: 'bold accent wall colour',
  },
  curt: {
    simple: 'simple curtains', luxury: 'luxurious layered drapery',
    remove: 'no curtains, bare windows',
  },
  extra: {
    plants: 'add indoor plants', art: 'add framed wall art',
    accessories: 'add decorative accessories',
    rearrange: 'rearrange the furniture layout for better flow',
  },
};

function styleOf(styleId) {
  const id = LEGACY_STYLE_MAP[styleId] || styleId;
  return STYLES.find((x) => x.id === id) || STYLES.find((x) => x.id === 'modern');
}
function placeOf(placeId) {
  const id = LEGACY_PLACE_MAP[placeId] || placeId;
  return PLACES.find((x) => x.id === id) || null;
}
function optionsText(options) {
  return Object.entries(options || {})
    .map(([k, v]) => OPTIONS[k] && OPTIONS[k][v])
    .filter(Boolean);
}

/* ---------- بناء البرومبت ---------- */

/** الوضع الأول: من صورة الغرفة. isReference=true عند تمرير زاوية معتمدة. */
function buildFromPhoto({ styleId, placeId, options = {}, isReference = false, note = '' }) {
  const s = styleOf(styleId);
  const p = placeOf(placeId);
  const extras = optionsText(options);
  let text = 'Redesign this real photo of ' + (p ? p.prompt : 'this room') + ' in the following style. ' + s.prompt;
  if (extras.length) text += ' Also apply: ' + extras.join(', ') + '.';
  if (note) text += ' Client note (highest priority, follow it closely): ' + note + '.';
  text += isReference ? CONSISTENCY_LOCK : GEOMETRY_LOCK;
  return text;
}

/** الوضع الثاني: من الكلام فقط — بدون صورة. */
function buildFromText({ styleId, placeId, description = '', options = {}, note = '' }) {
  const s = styleOf(styleId);
  const p = placeOf(placeId);
  const extras = optionsText(options);
  let text = 'Photorealistic interior design photograph of ' + (p ? p.prompt : 'an interior space') + '.';
  if (description) text += ' The space: ' + description + '.';
  if (s) text += ' Style: ' + s.prompt;
  if (extras.length) text += ' Details: ' + extras.join(', ') + '.';
  if (note) text += ' Client note (highest priority, follow it closely): ' + note + '.';
  text +=
    ' Shot with a wide-angle architectural lens at eye level, realistic proportions,' +
    ' natural daylight from a window, professional interior photography, high detail.' +
    ' No people, no text, no watermark.';
  return text;
}

/* ---------- حصر القطع — أهم إضافة تجارية ---------- */
const PARTS_PROMPT =
  'You are an interior fit-out estimator. Look at this interior image and list the main' +
  ' purchasable items. Reply with ONLY a JSON array, no markdown, no explanation.' +
  ' Each item: {"emoji":"","name_ar":"","spec_ar":"","price_aed":0}.' +
  ' name_ar and spec_ar must be in Arabic. spec_ar should include material/colour and an' +
  ' approximate size. price_aed is a realistic UAE retail estimate as a plain number.' +
  ' Maximum 8 items, ordered from most to least expensive.';

module.exports = {
  STYLES, PLACES, OPTIONS,
  LEGACY_STYLE_MAP, LEGACY_PLACE_MAP,
  GEOMETRY_LOCK, CONSISTENCY_LOCK, PARTS_PROMPT,
  styleOf, placeOf, optionsText,
  buildFromPhoto, buildFromText,
};
