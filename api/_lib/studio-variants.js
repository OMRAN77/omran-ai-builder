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
const NO_VARIATION = {
  eyes: ['whiteteeth', 'bigsmile', 'lashes', 'brows'],
  body: '*',
  age: '*',
};
/* محاور خاصّة بخيار بعينه داخل الميزة */
const STYLE_AXES = { eyes: { blue: 'IRIS', green: 'IRIS', hazel: 'IRIS', grey: 'IRIS' } };

/* v-studio-catalog-100: خيارات القزحيّة الجديدة (ir…) تأخذ محاور القزحيّة، وباقي لمسات العيون
   الخفيفة (ابتسامة، رموش، حواجب، أسنان…) تعديل دقيق بعينه بلا تنويع */
function isIris(feature, style) { return feature === 'eyes' && (/^ir[a-z]/.test(String(style || '')) || ['blue', 'green', 'hazel', 'grey'].indexOf(style) !== -1); }
function hasVariation(feature, style) {
  if (feature === 'eyes') return isIris(feature, style);
  const nv = NO_VARIATION[feature];
  if (!nv) return true;
  if (nv === '*') return false;
  return nv.indexOf(style) === -1;
}
function axesOf(feature, style) {
  if (isIris(feature, style)) return AXES.IRIS;
  const own = STYLE_AXES[feature] && STYLE_AXES[feature][style];
  if (own) return AXES[own];
  return AXES[feature] || AXES.DEFAULT;
}

/* عدد الأشكال الممكنة داخل الخيار الواحد */
function variantCount(feature, style) {
  return Object.values(axesOf(feature, style)).reduce((n, list) => n * list.length, 1);
}

/* خلط بيجكتيفي: الضغطتان المتتاليتان تختلفان في عدّة محاور لا في المحور الأوّل وحده،
   مع بقاء الدورة كاملة (لا تكرار قبل استنفاد كلّ الأشكال). أطوال المحاور عواملها ٢ و٣
   و٥ فقط، و٧٩١٩ عدد أوّليّ أكبر منها — فهو أوّليّ نسبيًّا مع أيّ حاصل ضرب منها. */
const MIX = 7919;

/* n → توجيه محسوس (فكّ على المحاور بنظام أساس مختلط) */
function variantDirective(feature, n, style) {
  const axes = axesOf(feature, style);
  const keys = Object.keys(axes);
  const total = variantCount(feature, style);
  let x = ((Math.abs(Math.floor(Number(n) || 0)) % total) * MIX) % total;
  const picked = [];
  for (const k of keys) {
    const list = axes[k];
    picked.push(list[x % list.length]);
    x = Math.floor(x / list.length);
  }
  return picked.join('; ');
}

module.exports = { AXES, axesOf, variantCount, variantDirective, hasVariation, NO_VARIATION, STYLE_AXES, OUTFIT_FEATURES };
