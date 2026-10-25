// v-studio-variants (طلب المالك ٢٩ سبتمبر): «أريد أكثر من ١٠٠ في كلّ شكل — لا تزيد
// شيئًا جديدًا، زِد في الأشكال نفسها: ١٠٠ حنّاء هندي، ١٠٠ شكل نظّارة…». السبب الذي
// ذكره: المشترك في الصور يرى نوعًا أو نوعين ثمّ يلغي؛ ولو وجد كلّ يوم شكلًا جديدًا بقي.
//
// الفكرة: لكلّ ميزة **محاور تنويع**، وكلّ محور قائمة خيارات عمليّة محسوسة. الرقم n
// يُفكّ على المحاور (نظام أساس مختلط) فيعطي **توجيهًا محدّدًا** لا جملة «نوّع» عامّة —
// النماذج تتجاهل العموميّات وتعيد التصميم نفسه، وتستجيب للتحديد. حاصل ضرب المحاور
// يعطي آلاف الأشكال داخل الخيار الواحد (الحدّ الأدنى المفروض في الاختبار: ١٠٠).
//
// قاعدة صارمة في الصياغة: المحاور تصف **الشيء المُضاف فقط** (النقش، الطلاء، الإطار،
// التسريحة…) ولا تمسّ الشخص ولا وقفته ولا زاوية الكاميرا ولا الخلفيّة — قفل التعديل
// (EDIT_LOCK) وقفل الجلد (SKIN_LOCK) يبقيان فوقها.
'use strict';

/* ملفّ بيانات صرف: بلا require وبلا process.env (يُحمَّل في مسارات مختلفة) */

const SKIN_DESIGN = {
  layout: ['centred on one bold focal motif with the rest trailing away from it', 'built as a corner-weighted composition growing from one side', 'running as a diagonal band across the area', 'following a vertical spine down the middle with symmetric branches', 'scattered as separate clusters with clear bare skin between them', 'framed as a decorative border around a bare centre', 'led from the fingertips inwards', 'built as stacked horizontal bands', 'arranged as one long curving S-line', 'radiating outwards from a single point like rays'],
  density: ['very airy, mostly bare skin', 'light, roughly a quarter covered', 'balanced, about half covered', 'rich, most of the area covered', 'very dense, almost no bare skin left'],
  motifLead: ['fine floral vines', 'paisley teardrops', 'geometric diamonds and triangles', 'lace netting (jaali)', 'graded dot work', 'leaf and petal shapes', 'interlacing arabesque ribbons', 'spirals and curls'],
  scale: ['tiny delicate motifs throughout', 'small motifs with a few larger anchors', 'medium motifs evenly sized', 'a few oversized motifs with small fillers'],
  finishTouch: ['outlined with fine dotted edges', 'finished with tight hatching inside the shapes', 'with some shapes filled solid for contrast', 'with deliberate negative-space gaps cut through the fill', 'with tiny cross and star fillers in the gaps', 'with a thin double outline around the main shapes'],
};

const AXES = {
  henna: SKIN_DESIGN,
  tattoo: {
    layout: ['composed around one central subject', 'flowing along the limb as a long band', 'built from stacked elements', 'arranged as a diagonal sweep', 'framed inside a geometric border', 'scattered as linked smaller pieces'],
    density: ['minimal and open', 'lightly filled', 'balanced fill', 'heavily detailed', 'fully packed with detail'],
    lineWeight: ['hairline single-weight strokes', 'mixed thin and bold outlines', 'bold heavy outlines', 'no outline at all, shape defined by shading'],
    shading: ['flat with no shading', 'soft grey wash shading', 'dense stippled shading', 'sharp black fills', 'smooth gradient shading'],
    accent: ['with fine dotted detailing', 'with small geometric fillers', 'with negative-space highlights', 'with a thin decorative frame'],
  },
  nails: {
    artLayout: ['the same design on every nail', 'tips only, the rest sheer', 'a half-and-half split on each nail', 'a diagonal cut across each nail', 'one central stripe down each nail', 'colour at the cuticle fading out', 'a French variation on every nail', 'free-form art that differs on each nail'],
    accentNails: ['no accent nail', 'one accent nail on the ring finger', 'two accent nails (index and ring)', 'every nail slightly different', 'alternating two designs across the hand'],
    finishMix: ['all glossy', 'all matte', 'matte base with glossy accents', 'a chrome accent on one or two nails', 'a glitter accent on one or two nails', 'a velvet magnetic accent'],
    detail: ['no extra detail', 'one fine gold line per nail', 'tiny dots along the cuticle', 'a few small crystals near the cuticle', 'one 3D bead or pearl accent', 'a small hand-painted motif on the accent nail'],
    shapeNuance: ['kept exactly as the natural nail shape', 'filed slightly squarer', 'filed slightly rounder', 'a touch longer', 'a touch shorter'],
  },
  makeup: {
    /* v-visible-change: «barely there» حُذفت — كانت تُخرج وجهًا بلا مكياج ظاهر فيقول المالك «ما تغيّر» */
    intensity: ['clearly visible and wearable', 'balanced everyday-to-evening strength', 'strong and defined', 'maximum intensity within this exact look'],
    eyeNuance: ['blended rounder for an open eye', 'lifted at the outer corner', 'elongated outwards', 'softly diffused with no hard edges', 'sharply defined with clean edges', 'concentrated in the centre of the lid'],
    blushPlacement: ['high on the cheekbones', 'on the apples of the cheeks', 'draped up towards the temples', 'sweeping lightly across the nose too', 'barely visible, just a hint of warmth'],
    lipFinish: ['matte', 'satin', 'high gloss', 'blurred at the edges', 'sharply lined'],
    glow: ['completely matte skin', 'soft satin skin', 'dewy skin', 'strong luminous highlight'],
  },
  hair: {
    parting: ['a centre parting', 'a deep side parting', 'a soft zigzag parting', 'no visible parting, brushed back', 'a low side parting'],
    volume: ['flat and smooth at the roots', 'natural body', 'lifted and voluminous at the crown', 'very full and blown out'],
    textureFinish: ['high-gloss and sleek', 'matte and undone', 'softly textured with a little frizz', 'defined and piecey', 'brushed out and soft'],
    faceFraming: ['tucked behind both ears', 'with soft face-framing pieces left out', 'tucked on one side only', 'all brought forward over the shoulders', 'all swept back off the face'],
    ends: ['with blunt even ends', 'with soft tapered ends', 'with flicked-out ends', 'with ends curved inwards'],
  },
  beard: {
    lengthNuance: ['trimmed very short', 'kept short and neat', 'at medium length', 'grown a little longer', 'at its fullest length'],
    edges: ['with razor-sharp cheek and neck lines', 'with softly blended natural edges', 'with a faded transition at the sideburns', 'with a defined cheek line but a natural neck'],
    moustache: ['with the moustache trimmed close', 'with a fuller moustache', 'with the moustache slightly styled at the corners', 'with the moustache blended into the beard'],
    density: ['sparse and light', 'medium density', 'thick and dense', 'very thick with strong coverage'],
    greying: ['with no grey at all', 'with a few grey strands at the chin', 'with light salt-and-pepper throughout'],
  },
  glasses: {
    frameThickness: ['with a hairline-thin frame', 'with a slim frame', 'with a medium frame', 'with a bold thick frame'],
    material: ['in polished metal', 'in matte metal', 'in glossy acetate', 'in matte acetate', 'in a metal-and-acetate combination'],
    /* v-visible-change: «عدسة شفّافة تمامًا» كانت تقلب الشمسيّة إلى طبّيّة — درجة العدسة تبقى كما في الخيار */
    lensEdge: ['with slightly rounded lens corners', 'with sharper lens corners', 'with a thin lens bevel catching the light', 'with a flat lens edge', 'with a subtle lens-edge highlight'],
    size: ['in a small narrow size', 'in a medium size', 'in an oversized size'],
    detail: ['with plain temples', 'with a fine decorative detail at the hinge', 'with a keyhole bridge', 'with a double bridge bar', 'with a subtle two-tone colour'],
  },
  skin: {
    strength: ['at a clearly noticeable but natural level', 'at a moderate, obvious level', 'at a strong but still believable level'],
    texture: ['keeping every pore and fine line visible', 'keeping most natural texture', 'smoothing texture noticeably while staying real'],
    tone: ['keeping the exact current tone', 'evening the tone very slightly', 'warming the tone a touch', 'cooling the tone a touch'],
    finish: ['with a completely matte finish', 'with a soft satin finish', 'with a fresh dewy finish'],
    focus: ['focused on the cheeks', 'focused on the forehead and nose', 'applied evenly across the whole face', 'focused around the eyes'],
  },
  anime: {
    composition: ['as a close bust shot', 'as an upper-body shot', 'with the figure slightly off-centre', 'with a dynamic tilted framing'],
    lineWork: ['with fine delicate line art', 'with bold confident outlines', 'with sketchy textured lines', 'with clean uniform lines'],
    palette: ['in warm tones', 'in cool tones', 'in high-contrast saturated colour', 'in soft muted pastels', 'in a limited two-tone palette'],
    lighting: ['with soft even lighting', 'with strong rim lighting', 'with dramatic side light', 'with a glowing backlight'],
    backdrop: ['on a plain flat backdrop', 'with a simple gradient backdrop', 'with a lightly detailed scene behind', 'with abstract shapes and sparkles behind'],
  },
  outfit: {
    fabric: ['in a light flowing fabric', 'in a structured heavier fabric', 'in a soft matte fabric', 'in a fabric with a subtle sheen', 'in a lightly textured weave'],
    detail: ['with plain clean lines and no ornament', 'with fine embroidery at the edges', 'with rich all-over embroidery', 'with a decorative trim or piping', 'with a subtle tonal pattern'],
    colourDepth: ['in a pale light shade', 'in a mid shade', 'in a deep rich shade', 'in a near-black deep shade', 'in a warm golden shade'],
    drape: ['fitted close to the body', 'with a relaxed drape', 'with a full flowing drape', 'with crisp structured folds'],
    finishing: ['with no accessories added', 'with one small traditional accessory', 'with matching subtle jewellery', 'with a contrasting belt or sash'],
  },
  background: {
    timeOfDay: ['at bright midday', 'in warm late-afternoon light', 'at golden-hour sunset', 'at blue hour after sunset', 'at night'],
    depth: ['sharply in focus', 'softly blurred', 'heavily blurred to pure bokeh', 'with a gentle depth gradient'],
    framing: ['seen wide and open', 'seen at a medium distance', 'seen close with only a section visible'],
    weather: ['under a clear sky', 'with light haze', 'with soft clouds', 'with dramatic clouds'],
    accent: ['with no added elements', 'with a few subtle foreground elements', 'with soft light flares', 'with reflective surfaces catching light'],
  },
  /* v-visible-change: حُذف «أخفّ مستوى» و«التركيز على اليسار/اليمين» (للعيون = عين واحدة تتلوّن أو لا شيء) و«اللمعة» */
  DEFAULT: {
    strength: ['clearly visible', 'bold and obvious', 'at its fullest level within this exact style'],
    detail: ['kept simple and clean', 'with a little added detail', 'with rich detail', 'with maximum fine detail'],
    finish: ['with a matte finish', 'with a satin finish', 'with a glossy finish'],
    styling: ['in a classic interpretation', 'in a modern interpretation', 'in a minimal interpretation'],
    tone: ['in a cooler tone', 'in a neutral tone', 'in a warmer tone', 'in a deeper tone', 'in a lighter tone'],
  },
  /* v-visible-change: لون القزحيّة وحده — بدرجاته ونقشه الطبيعيّ، في العينين معًا دائمًا */
  IRIS: {
    shade: ['a light clear shade', 'a medium natural shade', 'a deep rich shade', 'a vivid saturated shade'],
    pattern: ['with fine radial streaks in the iris', 'with a few lighter flecks near the pupil', 'with an evenly toned iris', 'with a subtle golden ring around the pupil'],
    ring: ['with a defined darker outer ring', 'with a soft outer ring', 'with no visible outer ring'],
    clarity: ['crisp and bright', 'natural and soft', 'luminous and clear'],
  },
};

/* الميزات التي تغيّر زيًّا/إطلالة تشترك في محاور الزيّ */
const OUTFIT_FEATURES = ['heritage', 'hijab', 'gulfmen', 'wedding', 'seasons', 'iconic', 'palette', 'idphoto'];
for (const f of OUTFIT_FEATURES) if (!AXES[f]) AXES[f] = AXES.outfit;
if (!AXES.menhair) AXES.menhair = AXES.hair;

/* v-visible-change: تعديلات دقيقة مطلوبة بعينها — التنويع فيها يُضعفها («أيّ شكل» لعمرٍ أو
   لتبييض أسنان لا معنى له، وكان يُخرج النتيجة بلا تغيير). لا سطر تنويع لها أصلًا. */
/* v-style-match: الألوان تغيّر ألوان الزيّ وحدها (القفل «the colors of the outfit»)، والصورة الرسميّة
   مقاييسها ثابتة — محاور الزيّ (تطريز كامل، حزام، درجة شبه سوداء) كانت تناقضهما. */
const NO_VARIATION = {
  eyes: ['whiteteeth', 'bigsmile', 'lashes', 'brows'],
  body: '*',
  age: '*',
  palette: '*',
  idphoto: '*',
};
/* محاور خاصّة بخيار بعينه داخل الميزة */
const STYLE_AXES = { eyes: { blue: 'IRIS', green: 'IRIS', hazel: 'IRIS', grey: 'IRIS' } };

/* v-style-match (تدقيق ٢٥ أكتوبر، المالك: «الصور ما تطابق الشي اللي اخترته»): سطر التنويع كان يأخذ
   المحاور كلّها مهما قال الخيار — «حلاقة كاملة» يصلها «لحية بأطول طول وكثيفة»، و«خلفية بيضاء» يصلها
   «ليل وغيوم»، و«نظّارة بلا إطار» يصلها «إطار عريض سميك». الآن ما سمّاه وصف الخيار نفسه لا يُنوَّع:
   كلّ قاعدة إن طابق وصفُ الخيار `when` (ولم يطابق `unless`) سقطت محاور `drop` أو قيمها المطابقة لـ`vals`،
   و`all` = لا تنويع لهذا الخيار أصلًا. المحاور نفسها كما هي، فالمخزون ١٠٠+ باقٍ للخيارات التي تتركها مفتوحة. */
const HAIR_GUARDS = [
  { when: /same length and cut|colou?r only/, drop: ['volume', 'textureFinish', 'ends'] },
  { when: /curl|coil|wave|wavy|straight|sleek|flat|frizz|kink|afro|perm|textur|spiral|ringlet|twist/, drop: ['volume', 'textureFinish'] },
  { when: /gloss|shine|shiny|matte|messy|neat|polished|undone|piecey/, drop: ['textureFinish'] },
  { when: /bang|fringe|updo|bun\b|ponytail|braid|plait|cornrow|knot|chignon|slick|swept|parting|\bpart\b|crown|halo|half-up|side part/, drop: ['faceFraming', 'parting'] },
  { when: /bob|pixie|lob\b|layer|shag|wolf|butterfly|mullet|blunt|\bcut\b|length|long|short|crop|buzz|fade|undercut|taper|crew|quiff|pompadour|mohawk|shaved|bald/, drop: ['ends'] },
  { when: /buzz|crew cut|crop|fade|shaved|bald|induction|pixie|undercut|high and tight|caesar|flat top|very short/, drop: ['volume', 'faceFraming', 'parting', 'ends'] },
  { when: /volume|voluminous|\bflat\b|\bfull\b|blown|blowout|\bbig\b|lift/, drop: ['volume'] },
];
const OUTFIT_COLOUR = /white|black|ivory|cream|beige|navy|red|green|blue|gold|silver|pastel|grey|gray|brown|olive|burgundy|maroon|pink|rose|lilac|lavender|mint|emerald|teal|coral|mustard|camel|khaki|charcoal|nude|neutral|colou?r|\btones?\b|shade|palette|monochrome|kandora|thobe|dishdasha|ghutra|bisht|abaya|jalabiya|galabeya|tuxedo|bride|bridal|gown|scrubs|uniform/;
const GUARDS = {
  beard: [
    { when: /clean-shaven|clean shave|no beard|beardless/, all: true },
    { when: /stubble|short|long|length|\bfull|grown|trimmed|fullest/, drop: ['lengthNuance'] },
    { when: /moustache|mustache/, drop: ['moustache'] },
    { when: /thick|dense|sparse|patchy|light|\bfull/, drop: ['density'] },
    { when: /black|brown|grey|gray|salt|pepper|henna|\bred\b|blond|ginger|silver|white|colou?r|dyed/, drop: ['greying'] },
    { when: /line|edge|fade|faded|blend|sharp|crisp|shaved|cheeks/, drop: ['edges'] },
  ],
  hair: HAIR_GUARDS,
  menhair: HAIR_GUARDS,
  nails: [
    { unless: /art|design|pattern|french|ombre|marble|stripe|\bdots?\b|flower|floral|glitter|chrome|foil|gem|crystal|stone|charm|3d|sticker|abstract|swirl|heart|star|leopard|tortoise|aura|cat-eye|magnetic|velvet|gradient|half|\btips?\b|\bline|accent|mismatch|print|check|plaid|lace|confetti|holo|mirror|pearl|stud|rhinestone|bow|cloud|smiley|cherry|fruit|evil eye|henna|calligraph|motif/, drop: ['artLayout', 'accentNails', 'detail'] },
    { when: /almond|coffin|ballerina|stiletto|square|squoval|oval|round|lipstick|flare|edge|long|short|length|\bxl\b|extra|bitten/, drop: ['shapeNuance'] },
    { when: /gloss|matte|chrome|glitter|velvet|magnetic|satin|shimmer|metallic|jelly|sheer|pearl|holo|mirror|frosted|translucent/, drop: ['finishMix'] },
    { when: /french|ombre|\btips?\b|half|gradient|cuticle|reverse|negative space|v-shape|diagonal|stripe|split/, drop: ['artLayout'] },
    { when: /accent|one nail|ring finger|mismatch|every nail|each nail|alternat/, drop: ['accentNails'] },
    { when: /gem|crystal|pearl|charm|stud|rhinestone|gold line|\bdots?\b|3d|bead|bow|sticker|foil/, drop: ['detail'] },
  ],
  makeup: [
    { when: /natural|no-makeup|barely|subtle|soft|minimal|fresh|clean|light|sheer|nude/, vals: { intensity: /maximum|strong/, glow: /strong luminous/ } },
    { when: /dewy|glass|matte|satin|glow|luminous|radiant|powder|shine|shimmer|highlight/, drop: ['glow'] },
    { when: /matte|gloss|glossy|satin|vinyl|lined|blurred|velvet|shine|sheer/, drop: ['lipFinish'] },
    { when: /cat-eye|winged|wing|smok|cut crease|graphic|liner|halo|kohl|eyeshadow|shadow|lid|lash/, drop: ['eyeNuance'] },
    { when: /blush|bronz|contour|sunburn|flush|cheek/, drop: ['blushPlacement'] },
  ],
  skin: [
    { when: /subtle|natural|light|pores?|real texture|gentle|soft/, vals: { strength: /strong/, texture: /smoothing texture noticeably/ } },
    { when: /\btan|bronz|brighten|glow|warm|cool|even|radian|lighten|darken|\btone|sunburn|\bred/, drop: ['tone'] },
    { when: /matte|satin|dewy|glow|glass|luminous|radiant|shine|oil|velvet/, drop: ['finish'] },
    { when: /\beyes?\b|dark circle|forehead|nose|chin|cheek|t-zone|jaw|\blips?\b|neck|beard|mouth|brow|under-eye/, drop: ['focus'] },
    { when: /pore|texture|smooth|scar|acne|blemish|wrinkle|\blines?\b|freckle|spot|mark|blur/, drop: ['texture'] },
  ],
  glasses: [
    { when: /rimless|frameless|half-rim|semi-rim/, drop: ['frameThickness', 'material'] },
    { when: /thin|slim|hairline|wire|bold|thick|chunky|heavy|\bfine\b/, drop: ['frameThickness'] },
    { when: /metal|gold|silver|titanium|acetate|tortoise|plastic|wood|crystal|transparent|clear|horn|steel/, drop: ['material'] },
    { when: /oversized|small|narrow|large|\bbig\b|wide|mini|petite/, drop: ['size'] },
    { when: /round|oval|circle|aviator|teardrop|cat-eye|square|rectangular|hexagon|octagon|geometric|browline|wayfarer|shield/, vals: { lensEdge: /corners/ } },
    { when: /two-tone|black|white|\bred\b|navy|tortoise|gold|silver|clear|colou?r|pink|blue|green|brown|crystal/, vals: { detail: /two-tone/ } },
    { when: /keyhole|double bridge|\bbar\b|hinge|temple/, drop: ['detail'] },
  ],
  tattoo: [
    { when: /wrist|forearm|upper arm|\barm\b|shoulder|\bback\b|chest|neck|ankle|finger|\bhand|rib|calf|\bleg\b|\bear\b|collarbone|spine|hip|thigh|\bfoot|small|tiny|minimal|large|\bfull|sleeve|piece|\bband\b/, drop: ['layout'] },
    { when: /fine-line|fine line|minimal|\bline|dotwork|\bdot|blackwork|watercolou?r|realis|tribal|geometric|traditional|old school|neo|shad|bold|outline|script|calligraph|lettering|ornamental|mandala|sketch/, drop: ['lineWeight', 'shading'] },
    { when: /minimal|small|tiny|simple|delicate|dense|detailed|packed|\bfull|bold|heavy/, drop: ['density'] },
    { when: /\bdot|geometric|frame|negative space|filler/, drop: ['accent'] },
  ],
  henna: [
    { when: /minimal|simple|delicate|airy|\bbare|dense|\bfull|bridal|heavy|cover|sparse|light|lace|intricate/, drop: ['density'] },
    { when: /floral|flower|paisley|geometric|diamond|lace|jaali|\bdot|leaf|petal|arabesque|spiral|mandala|peacock|vine|moroccan|lattice|chevron|rose|lotus|bird|calligraph|motif|pattern/, drop: ['motifLead'] },
    { when: /thumb|finger|wrist|ankle|\bfoot|feet|sole|back of|palm|neck|shoulder|\barm\b|fingertip|\bband\b|cuff|ring|bracelet|chain|harness|\bline\b|single/, drop: ['layout'] },
    { when: /tiny|small|large|oversized|bold|\bfine\b|\bbig\b|delicate|dainty/, drop: ['scale'] },
    { when: /\bdots?\b|hatch|outline|\bfill|negative|glitter|white|gold/, drop: ['finishTouch'] },
  ],
  /* الأنمي: القالب يحفظ الوقفة والتكوين («preserving … pose … and general composition») — محور التكوين يناقضه دائمًا */
  anime: [
    { when: /./, drop: ['composition'] },
    { when: /palette|colou?r|pastel|neon|warm|cool|vivid|muted|monochrome|black and white|sepia|two-tone|limited|\btones?\b/, drop: ['palette'] },
    { when: /city|scene|scenery|background|backdrop|forest|\bsky|street|stage|space|world|landscape|rain|room|garden|desert|\bsea\b|ocean|school|castle|village/, drop: ['backdrop'] },
    { when: /\bline|\bink|sketch|outline|\bcel\b|watercolou?r|painterly|brush|crayon|pencil|shaded|\bflat/, drop: ['lineWork'] },
    { when: /light|glow|neon|shadow|\brim\b|backlit|sunset|night|dramatic|moon/, drop: ['lighting'] },
  ],
  outfit: [
    { when: OUTFIT_COLOUR, drop: ['colourDepth'] },
    { when: /embroider|plain|ornament|bead|sequin|lace|pattern|print|trim|tassel|stitch|gold thread|zari|nashl|tatreez|motif|brocade|piping|tonal/, drop: ['detail'] },
    { when: /silk|satin|velvet|linen|cotton|wool|chiffon|crepe|lace|leather|denim|tulle|organza|brocade|sheer|fabric|knit|jersey|cashmere|tweed|\bfur\b/, drop: ['fabric'] },
    { when: /fitted|loose|flowing|relaxed|structured|tailored|drape|wide|slim|oversized|a-line|mermaid|ball gown|puff/, drop: ['drape'] },
    { when: /belt|sash|jewel|accessor|necklace|bracelet|brooch|tiara|crown|\bbag\b|clutch|earring|watch|dagger|khanjar|\bcane\b|bouquet|veil/, drop: ['finishing'] },
  ],
  /* الحجاب لباس ساتر — «fitted close to the body» يناقضه في كلّ خياراته */
  hijab: [{ when: /./, vals: { drape: /fitted close/ } }],
  /* الزيّ الرجاليّ الخليجيّ: «matching subtle jewellery» لا يناسب كندورة وغترة */
  gulfmen: [{ when: /./, vals: { finishing: /jewellery/ } }],
  background: [
    { when: /\bday|daylight|midday|noon|sunset|sunrise|golden|dusk|dawn|night|evening|blue hour|morning|afternoon/, drop: ['timeOfDay'] },
    { when: /plain|solid|studio|seamless|backdrop|gradient|\bwall\b|colou?red background|white background|grey background/, drop: ['timeOfDay', 'weather', 'framing', 'accent'] },
    { when: /office|library|caf|room|palace|\bhall|interior|\bmall|studio|kitchen|lounge|home|house|majlis/, drop: ['weather'] },
    { when: /blur|bokeh|sharp|focus/, drop: ['depth'] },
    { when: /space|planet|\bstars?\b|galaxy|moon|nebula/, drop: ['timeOfDay', 'weather'] },
    { when: /\bsky|cloud|clear|haze|fog|rain|snow|storm/, drop: ['weather'] },
  ],
  DEFAULT: [
    { when: /minimal|bold|statement|vintage|modern|classic|simple|chunky|delicate|dainty|ornate|retro|sleek/, drop: ['styling', 'strength', 'detail'] },
    { when: /matte|satin|gloss|polished|brushed|shiny|metallic/, drop: ['finish'] },
    { when: /gold|silver|rose|black|white|pearl|leather|colou?r|\btones?\b|metal|brown|\bred\b|navy|tortoise|blue|green|pink|beige|wood/, drop: ['tone'] },
  ],
  IRIS: [
    { when: /natural|soft|muted|light|pale|vivid|bright|intense|deep|rich|dark|\bice|clear|saturated|glow/, drop: ['shade'] },
    { when: /ring|fleck|streak|central|heterochromia|sectoral|two different|spot|burst|limbal/, drop: ['pattern'] },
    { when: /ring|limbal|outer/, drop: ['ring'] },
    { when: /blue|grey|gray|violet|purple|\bice|silver|black/, vals: { pattern: /golden ring/ } },
  ],
};

/* v-studio-catalog-100: خيارات القزحيّة الجديدة (ir…) تأخذ محاور القزحيّة، وباقي لمسات العيون
   الخفيفة (ابتسامة، رموش، حواجب، أسنان…) تعديل دقيق بعينه بلا تنويع */
function isIris(feature, style) { return feature === 'eyes' && (/^ir[a-z]/.test(String(style || '')) || ['blue', 'green', 'hazel', 'grey'].indexOf(style) !== -1); }
function guardsOf(feature, style) {
  if (isIris(feature, style)) return GUARDS.IRIS;
  if (GUARDS[feature]) return GUARDS[feature].concat(OUTFIT_FEATURES.indexOf(feature) !== -1 ? GUARDS.outfit : []);
  if (OUTFIT_FEATURES.indexOf(feature) !== -1) return GUARDS.outfit;
  return AXES[feature] ? [] : GUARDS.DEFAULT;
}
/* v-style-match: المحاور بعد إسقاط ما سمّاه الخيار؛ null = الخيار يحدّد كلّ شيء (لا تنويع) */
function guardedAxes(axes, guards, text) {
  const t = String(text || '').toLowerCase();
  if (!t) return axes;
  const out = {};
  for (const k of Object.keys(axes)) out[k] = axes[k].slice();
  for (const g of guards) {
    if (g.when && !g.when.test(t)) continue;
    if (g.unless && g.unless.test(t)) continue;
    if (g.all) return null;
    for (const k of g.drop || []) delete out[k];
    for (const k of Object.keys(g.vals || {})) if (out[k]) out[k] = out[k].filter((v) => !g.vals[k].test(v));
  }
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k];
  return Object.keys(out).length ? out : null;
}
function hasVariation(feature, style, text) {
  if (feature === 'eyes' && !isIris(feature, style)) return false;
  const nv = NO_VARIATION[feature];
  if (nv === '*') return false;
  if (nv && nv.indexOf(style) !== -1) return false;
  return !!axesOf(feature, style, text);
}
function axesOf(feature, style, text) {
  let base;
  if (isIris(feature, style)) base = AXES.IRIS;
  else {
    const own = STYLE_AXES[feature] && STYLE_AXES[feature][style];
    base = own ? AXES[own] : (AXES[feature] || AXES.DEFAULT);
  }
  return text ? guardedAxes(base, guardsOf(feature, style), text) : base;
}

/* عدد الأشكال الممكنة داخل الخيار الواحد */
function variantCount(feature, style, text) {
  const axes = axesOf(feature, style, text);
  return axes ? Object.values(axes).reduce((n, list) => n * list.length, 1) : 0;
}
/* v-style-match: الضغطة الأولى لكلّ خيار كانت تأخذ التوجيه نفسه في الميزة كلّها (n=1 للجميع) —
   إزاحة ثابتة من اسم الخيار تجعل لكلّ خيار بدايته، والدورة كاملة كما هي */
function styleSeed(style) {
  let h = 0;
  for (const ch of String(style || '')) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return h;
}

/* خلط بيجكتيفي: الضغطتان المتتاليتان تختلفان في عدّة محاور لا في المحور الأوّل وحده،
   مع بقاء الدورة كاملة (لا تكرار قبل استنفاد كلّ الأشكال). أطوال المحاور عواملها ٢ و٣
   و٥ فقط، و٧٩١٩ عدد أوّليّ أكبر منها — فهو أوّليّ نسبيًّا مع أيّ حاصل ضرب منها. */
const MIX = 7919;

/* n → توجيه محسوس (فكّ على المحاور بنظام أساس مختلط) */
function variantDirective(feature, n, style, text) {
  const axes = axesOf(feature, style, text);
  if (!axes) return '';
  const keys = Object.keys(axes);
  const total = variantCount(feature, style, text);
  const start = text ? styleSeed(style) : 0;
  let x = (((Math.abs(Math.floor(Number(n) || 0)) + start) % total) * MIX) % total;
  const picked = [];
  for (const k of keys) {
    const list = axes[k];
    picked.push(list[x % list.length]);
    x = Math.floor(x / list.length);
  }
  return picked.join('; ');
}

module.exports = { AXES, axesOf, variantCount, variantDirective, hasVariation, NO_VARIATION, STYLE_AXES, OUTFIT_FEATURES, GUARDS };
