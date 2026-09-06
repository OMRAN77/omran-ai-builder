'use strict';

function cleanImagePrompt(value){
  return String(value || '').trim().slice(0, 2400);
}

const RAW_IMAGE_PREFIX_RE = /^\s*(?:نانو\s*بنانا|نانو|nano(?:\s*banana)?)\s*[:：\-–—]?\s*/i;

function isExplicitRawImagePrompt(value){
  return RAW_IMAGE_PREFIX_RE.test(String(value || ''));
}

function stripRawImagePrefix(value){
  return String(value || '').replace(RAW_IMAGE_PREFIX_RE, '').trim();
}

function shouldUseRawImagePrompt(value, options){
  const opts = options || {};
  if (opts.prayerPlan) return false;
  return isExplicitRawImagePrompt(value) || String(opts.envDefault || 'off').toLowerCase() === 'on';
}

/* v590 — بنك تنويع الخلفيّات البيئيّة. سبب الرقعة: الفرع البيئيّ كان يعيد جملة
 * إنجليزيّة واحدة ثابتة لكلّ طلب، فكلّ "خلفيّة بحر" تصل للمولّد بنفس النصّ حرفيًّا
 * ⇒ صور شقيقة. الآن يُركَّب التوجيه من ٦ محاور مستقلّة لحظيًّا.
 * الموضوع الذي يطلبه المستخدم مصون حرفيًّا — يتنوّع التنفيذ فقط. */
const BG_SCENES = {
  sea: ['tidal pools','rocky shore','open water','sea caves','coastal dunes','rolling surf','foggy headland','rippled shallows','distant horizon','foaming waves','wet shoreline','dark coves'],
  desert: ['sweeping dunes','dry salt basin','layered ravine','cracked earth','sandstone outcrops','empty flats','red cliffs','wind-shaped sand','rocky valley','wide plateau','dusty hills','dry riverbed'],
  mountain: ['sharp ridges','snow fields','misty valley','alpine lake','dark peaks','high meadow','frosted pass','sunlit slopes','glacial stream','rolling highlands','rocky summit','cloudy foothills'],
  city: ['wet pavement','tower blocks','quiet streets','modern facades','narrow lanes','elevated roads','open square','industrial district','glass rooftops','empty boulevard','layered bridges','stone passage'],
  nature: ['dense woodland','wild grasses','mossy stones','sunlit meadow','tall trees','dark waterfall','silver reeds','fern-covered ground','broad field','still pond','lush valley','ancient forest'],
  studio: ['smooth backdrop','floating shapes','curved wall','translucent layers','polished floor','textured surface','minimal arch','soft fabric folds','glowing panels','misty space','stacked blocks','paper-like waves']
};
const BG_COND = ['beneath soft haze','after gentle rainfall','under drifting clouds','at fading light','with layered reflections','in quiet atmosphere','under open skies','with subtle texture','through low mist','beneath diffuse light','with distant depth','in soft shadow','under muted skies','with calm stillness'];
const BG_COMP = ['wide atmospheric view','cinematic layered composition','foreground-led perspective','quiet panoramic framing','deep receding space','balanced open composition'];
const BG_LIGHT = ['soft diffused illumination','gentle directional glow','balanced ambient brightness','subtle rim illumination','low contrast illumination','soft backlit radiance','clean frontal illumination','muted side illumination'];
const BG_PAL = ['soft ivory and stone','muted blue and gray','warm beige and brown','deep teal and slate','dusty pink and sand','charcoal and silver tones','cool violet and graphite','olive and muted gold'];
const BG_LENS = ['wide environmental framing','low angle perspective','natural eye-level framing','shallow focus rendering','deep focus composition','symmetrical centered framing','foreground layered depth','soft background bokeh'];
const BG_FAMILY = [
  ['sea', /بحر|شاطئ|شواطئ|ساحل|سواحل|موج|امواج|أمواج|محيط|خليج|لاجون|sea|ocean|beach|coast|shore|wave|tide|lagoon/i],
  ['desert', /صحرا|صحراء|صحراوي|رمل|رمال|كثبان|كثيب|واحة|قاحل|desert|dune|sand|arid|oasis/i],
  ['mountain', /جبل|جبال|جبلي|قمة|قمم|وادي|وديان|ثلج|ثلوج|هضبة|منحدر|mountain|peak|ridge|alpine|snow|glacier|summit/i],
  ['city', /مدينة|مدن|شارع|شوارع|مبنى|مباني|ناطحة|ناطحات|عمارة|عمائر|جسر|جسور|رصيف|حضري|city|urban|street|building|skyline|tower|bridge|downtown|pavement/i],
  ['nature', /غابة|غابات|شجر|أشجار|اشجار|عشب|مرج|مروج|حقل|حقول|نهر|أنهار|انهار|بحيرة|شلال|زهور|طبيعة|حديقة|forest|woodland|tree|grass|meadow|field|river|lake|waterfall|nature|garden/i],
  ['studio', /استوديو|ستوديو|خلفية|خلفيه|خلفيات|مجرد|مجرّد|تجريدي|بسيط|أشكال|اشكال|تدرج|studio|backdrop|abstract|minimal|gradient|geometric|plain/i]
];
/* استثناء: الطلبات التي يخصّها فرع لاحق (طعام/منتج/بورتريه) لا تدخل البنك البيئيّ،
 * حتّى لا يسرق البنك سلوكًا قائمًا مثل «خلفيّة لمنتج عطر». */
const BG_NOT_ENV = /طعام|قهوة|حلوى|طبق|وجبة|food|coffee|dessert|dish|منتج|عطر|ساعة|هاتف|product|perfume|watch|phone|شخص|رجل|امرأة|طفل|بورتريه|person|portrait/i;
const bgPick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ===== v591 — تعميم التنويع: طعام · منتج · بورتريه · عامّ =====
 * نفس مبدأ v590: محاور تُركَّب لحظيًّا بدل جملة إنجليزيّة واحدة ثابتة.
 * كلّ محور يُطبَّق فقط حيث يسكت طلب المستخدم، ولا يلغي شيئًا سمّاه. */
const FD_SURFACE = ['on dark slate','on aged wood','on white ceramic','on brushed marble','on woven linen','on matte stoneware','on a rustic board','on polished steel','on textured paper','on a glass surface','on terracotta','on a concrete slab'];
const FD_STATE = ['with rising steam','with fresh garnish','with a glistening surface','with a light dusting','with a delicate drizzle','with condensation beads','with a partial serving','with crumbs nearby','with soft shadows beneath','with natural imperfection'];
const FD_COMP = ['overhead flat-lay','a 45-degree editorial angle','tight macro detail','a low three-quarter view','an off-center plated arrangement','a layered table scene','a straight-on side profile','a diagonal leading arrangement'];
const FD_LIGHT = ['soft window light','directional side light with gentle falloff','bright airy diffusion','warm low-key illumination','crisp backlight through the dish','even overhead softbox light','dappled natural light','moody single-source light'];
const FD_PAL = ['warm amber and cream','cool white and gray','deep green and walnut','muted terracotta and sand','soft pastel neutrals','rich burgundy and gold','fresh white and herb green','charcoal with warm highlights'];
const FD_LENS = ['shallow depth with a soft background','deep focus across the plate','macro texture emphasis','natural standard perspective','a slight wide-angle table view','compressed telephoto framing','centered symmetrical framing','loose negative-space framing'];
const PR_SETTING = ['on a seamless studio backdrop','on a stone pedestal','on brushed metal','on rippled fabric','on a reflective black surface','among soft geometric blocks','on a sunlit plaster ledge','within a floating acrylic frame','on wet polished concrete','against a gradient wall','among drifting mist','on a raw travertine slab'];
const PR_ATM = ['with a clean airy feel','with a dramatic moody feel','with soft drifting haze','with crisp graphic clarity','with subtle floating particles','with gentle reflections','with a tactile organic feel','with a polished premium feel'];
const PR_COMP = ['a hero centered presentation','an off-center editorial arrangement','a tight cropped detail','a low heroic angle','a floating suspended layout','a three-quarter turned view','a straight-on symmetrical layout','a diagonal dynamic placement'];
const PR_LIGHT = ['crisp specular highlights','soft gradient studio light','dramatic single-source light','bright even diffusion','rim light separating the edges','a warm directional glow','cool controlled reflections','high-contrast sculpted light'];
const PR_PAL = ['monochrome graphite and silver','warm sand and bronze','deep navy and chrome','clean white and pale gray','black with amber accents','muted sage and ivory','burgundy and brushed gold','cool slate and glass tones'];
const PR_LENS = ['macro material detail','shallow focus with soft falloff','deep focus full clarity','compressed telephoto rendering','a slight wide-angle presence','flat catalog perspective','a tilted dynamic perspective','a tight crop on the key feature'];
const PT_SETTING = ['in an open sunlit space','against a plain textured wall','in a doorway with soft spill','among tall grasses','on a quiet street at low light','in a room with window light','against layered city depth','under an arched passage','beside a reflective surface','in shaded greenery','in a wide open landscape','against a simple studio backdrop'];
const PT_MOOD = ['with a calm natural presence','with quiet confidence','with an unforced candid feel','with gentle warmth','with a thoughtful stillness','with relaxed ease','with subtle dignity','with an open approachable feel'];
const PT_COMP = ['a close intimate framing','a relaxed medium framing','a wide environmental framing','an off-center placement with breathing room','a slightly low respectful angle','an over-the-shoulder framing','a candid unposed arrangement','a centered direct composition'];
const PT_LIGHT = ['soft directional window light','warm late-day light','even overcast diffusion','gentle rim separation','soft frontal light','shaded open light','dappled light through foliage','low-contrast ambient light'];
const PT_PAL = ['warm neutral tones with muted surroundings','cool gray and soft blue','earthy brown and olive','clean white and pale neutrals','deep shadow with warm highlights','muted teal and sand','soft rose and cream','charcoal with gentle warmth'];
const PT_LENS = ['shallow focus with soft background separation','natural standard perspective','compressed telephoto rendering','a wider contextual perspective','a tight crop on expression','full-length framing','waist-up framing','three-quarter framing'];
const GN_COMP = ['a balanced deliberate arrangement','an off-center editorial layout','a tight detailed crop','a wide contextual view','a layered foreground and background','a centered symmetrical layout','a diagonal dynamic arrangement','a minimal spacious composition'];
const GN_LIGHT = ['soft directional light','even diffused light','dramatic single-source light','a warm ambient glow','cool controlled light','gentle rim separation','bright open light','low-contrast shading'];
const GN_PAL = ['muted neutral tones','warm earthy tones','cool blue and gray','clean white and light gray','deep tones with bright accents','a soft pastel range','rich saturated contrast','monochrome with one accent'];
const GN_LENS = ['shallow focus rendering','deep focus clarity','macro detail emphasis','natural standard perspective','compressed telephoto framing','slight wide-angle framing','a tight crop','loose negative-space framing'];
const bgWords = (p) => String(p || '').trim().split(/\s+/).filter(Boolean).length;
function variedDirection(lead, concrete, comp, light, pal, lens){
  return lead + ' Vary the execution so repeated requests never look alike.'
    + (concrete ? ' Where the USER REQUEST leaves this open, realize it concretely as: ' + concrete + ' (adapt it if it does not suit the named subject).' : '')
    + ' Composition: ' + comp + '. Lighting: ' + light + '. Palette: ' + pal + '. Framing: ' + lens + '.'
    + ' These execution choices apply only where the USER REQUEST is silent; never override any subject, object, count, color, time, mood or style it names.';
}
function foodDirection(prompt){
  return variedDirection('Use appetizing editorial food composition and lighting appropriate to the named item.',
    bgWords(prompt) <= 6 ? bgPick(FD_SURFACE) + ' ' + bgPick(FD_STATE) : '',
    bgPick(FD_COMP), bgPick(FD_LIGHT), bgPick(FD_PAL), bgPick(FD_LENS));
}
function productDirection(prompt){
  return variedDirection('Use a distinctive product composition appropriate to the item, not a generic portrait setup.',
    bgWords(prompt) <= 6 ? bgPick(PR_SETTING) + ' ' + bgPick(PR_ATM) : '',
    bgPick(PR_COMP), bgPick(PR_LIGHT), bgPick(PR_PAL), bgPick(PR_LENS));
}
function portraitDirection(prompt){
  return variedDirection('Use a natural environmental portrait treatment suited to the named person, action, place and mood.',
    bgWords(prompt) <= 6 ? bgPick(PT_SETTING) + ' ' + bgPick(PT_MOOD) : '',
    bgPick(PT_COMP), bgPick(PT_LIGHT), bgPick(PT_PAL), bgPick(PT_LENS));
}
function genericDirection(lead){
  return variedDirection(lead, '', bgPick(GN_COMP), bgPick(GN_LIGHT), bgPick(GN_PAL), bgPick(GN_LENS));
}

function environmentDirection(prompt){
  let fam = '';
  for(const pair of BG_FAMILY){ if(pair[1].test(prompt)){ fam = pair[0]; break; } }
  const words = String(prompt || '').trim().split(/\s+/).filter(Boolean).length;
  const scene = (fam && words <= 6) ? bgPick(BG_SCENES[fam]) + ' ' + bgPick(BG_COND) : '';
  return 'Use an expansive environmental composition with depth and lighting natural to the requested place and time. '
    + 'Vary the execution so repeated requests never look alike.'
    + (scene ? ' Where the USER REQUEST leaves the scene open, realize it concretely as: ' + scene + '.' : '')
    + ' Composition: ' + bgPick(BG_COMP) + '. Lighting: ' + bgPick(BG_LIGHT) + '. Palette: ' + bgPick(BG_PAL) + '. Framing: ' + bgPick(BG_LENS) + '.'
    + ' These execution choices apply only where the USER REQUEST is silent; never override any subject, object, count, color, time, mood or style it names.';
}

function subjectDirection(prompt, reserveTextArea){
  if(!BG_NOT_ENV.test(prompt) && (BG_FAMILY.some(function(p){ return p[1].test(prompt); }) || /شمس|شروق|غروب|سماء|سحاب|أفق|افق|طقس|sun|sunrise|sunset|sky|cloud|horizon|weather/i.test(prompt)))
    return environmentDirection(prompt);
  if(/طعام|قهوة|حلوى|طبق|وجبة|food|coffee|dessert|dish/i.test(prompt))
    return foodDirection(prompt);
  if(/منتج|عطر|ساعة|هاتف|product|perfume|watch|phone/i.test(prompt))
    return productDirection(prompt);
  if(/شخص|رجل|امرأة|طفل|بورتريه|person|man|woman|child|portrait/i.test(prompt))
    return portraitDirection(prompt);
  if(reserveTextArea)
    return genericDirection('Use a calm editorial composition whose imagery supports the requested subject while leaving intentional breathing room.');
  return genericDirection('Choose composition, viewpoint, lens character, lighting and palette specifically for this request; do not reuse a default visual recipe.');
}

function buildGenerationPrompt(userPrompt, options){
  const prompt = cleanImagePrompt(userPrompt);
  const opts = options || {};
  const rules = [
    'Generate one original, high-fidelity image from the USER REQUEST below.',
    'USER REQUEST: ' + prompt,
    'The USER REQUEST is authoritative: preserve its subject, count, objects, setting, colors, time, mood and named style. Do not substitute them. Do not add objects, people, words, scenery or stylistic elements the user did not request.',
    subjectDirection(prompt, !!opts.reserveTextArea),
    'Do not impose a fixed portrait lens, photorealistic look or repeated composition. If the user names a style, medium, framing or aspect, follow it exactly; otherwise choose what naturally fits this particular subject. Treat this as a brand-new image, never as an instruction to alter or continue a previous image.',
    // v656: مستوى «انبهار» إلزامي — كانت النتائج تُوصف بأنها مثل لعب الأطفال.
    'QUALITY BAR (mandatory): produce a breathtaking, award-winning, magazine-cover-grade image — masterful composition, rich micro-detail, crisp tack-sharp focus on the subject, professional cinematic lighting with true-to-life color grading, flawless anatomy and geometry, no blur, no smudges, no toy-like or amateur rendering, no artifacts. The viewer should be stunned by the quality.',
    // v-signature-polish (طلب عمران: نفس قوة أيقونات التطبيق): عندما لا يطلب
    // المستخدم أسلوبًا/وسيطًا محددًا، الافتراضي مستوى استوديو فاخر — لا يُطبَّق
    // إن طلب المستخدم صورة واقعية أو أسلوبًا بعينه (تلك تُتَّبع حرفيًا).
    'SIGNATURE POLISH (default when the user did NOT name a specific style, medium or "realistic photo"): give the image a premium studio-grade finish — a rich deep gradient backdrop with subtle bokeh/particles, a single clean hero subject with glossy tactile materials, elegant rim light and soft glow, refined depth and dimensionality, high-end color grading. Aim for the polish of a top app-store icon / product hero render. If the user DID name a style, medium, or asked for a real/realistic photo, IGNORE this and follow their request exactly.',
    // v668: شكوى عمران — الدعاء/النص كان ينكتب فوق الرسمة نفسها ويخربها.
    'TEXT PLACEMENT (mandatory): if the image contains ANY text, captions or labels, place them ONLY in clean empty areas (top or bottom margins, plain background zones) and NEVER overlapping or covering the main subject, faces or key details. Compose the scene FIRST to reserve that empty space for the text. Text must be fully legible with strong contrast, correct spelling, and consistent typography. Choose a text color that HARMONIZES with the palette of the image itself (e.g. a hue drawn from the scene, lightened or darkened for contrast) — do not default to plain white unless it truly fits. If the requested text is long, shrink the subject or move it aside so the text gets its own dedicated clear area.'
  ];
  if(opts.prayerArt){
    rules.push('This is a topic-specific supplication artwork based on an approved visual plan. Follow the concrete scene in USER REQUEST; do not replace it with generic religious imagery. Unless the USER REQUEST itself explicitly calls for one, exclude boats, ships, coastlines, sunsets, mosque silhouettes and posed people praying. Make the scene visually distinct through its subject, viewpoint, composition and palette.');
  }
  if(opts.architectural){
    rules.push('This is an architectural visualization. Keep geometry buildable and coherent, use realistic materials and an architectural viewpoint suited to the request. Preserve every named constraint exactly, including floor count, room count, openings, garage capacity, materials and dimensions. Do not add people unless requested.');
  }
  if(opts.reserveTextArea){
    const area = opts.textPosition === 'top' ? 'upper' : opts.textPosition === 'center' ? 'central' : 'lower';
    rules.push('Do not render any words, letters, numbers, calligraphy, captions, logos, signatures or watermarks. Keep the ' + area + ' portion calm and uncluttered so exact text can be overlaid separately.');
  }else{
    rules.push('Do not render legible words, letters, numbers, calligraphy, captions, logos, signatures or watermarks. Any requested wording is handled separately after generation.');
  }
  return rules.join('\n');
}

function sourceStylePreservationRule(){
  return 'Preserve the source image medium and visual style exactly. A real photograph must remain a real photorealistic photograph. Never convert it to anime, cartoon, illustration, painting, 3D render or any other stylized medium unless the USER REQUEST explicitly asks for that exact transformation.';
}

function explicitlyRequestsStyleChange(value){
  const text = cleanImagePrompt(value).toLowerCase().replace(/أ|إ|آ/g, 'ا');
  const style = '(?:انمي|anime|كرتون(?:ي(?:ة)?)?|كارتون(?:ي(?:ة)?)?|cartoon(?:ish)?|illustration|رسم(?:ة|ي|ية)?|لوحة|painting|sketch|pixel art|بيكسار|pixar|ghibli|جيبلي|3d render)';
  const denied = new RegExp('(?:لا|لات|مو|مب|مش|بدون|من دون|ممنوع|لا اريد|ما\\s+(?:ابي|ابغى|ابغي|اريد)|do not|don.t|without|no)[^\\n,.،؛]{0,36}' + style, 'i');
  if(denied.test(text)) return false;
  const affirmative = new RegExp('(?:حول|حوّل|غيّر|غير(?:ها|ه|الصورة|الصوره)|اجعل|خلي|خل|صير|صيّر|ارسم|سوي|سوّي|اعط|أعط|ابي|ابغى|ابغي|اريد|ودي|نسخة|ستايل|نمط|طابع|transform|convert|change|restyle|make|turn|redraw|render|give|apply|want|would like|version|style|look)[^\\n,.،؛]{0,40}' + style, 'i');
  const styleFirst = new RegExp('^\\s*' + style + '(?:\\s+(?:version|style|look|نسخة|ستايل|نمط))?\\s*[.!؟]*$', 'i');
  return affirmative.test(text) || styleFirst.test(text);
}

// 🌟 v605 — ترقية مشهد كامل (لا تعديل موضعيّ). buildEditPrompt يأمر
// بإرجاع الصورة كما هي عند الطلب المبهم، وهو الصحيح لصور الأشخاص؛ أمّا
// «أعطني الأفضل» لغرفة أو مكان فيلزمه أمر صريح بتنفيذ الترقية كلّها مع
// تثبيت الهندسة والزاوية. حفظ الأشخاص وبقاء الصورة فوتوغرافيّة يبقيان.
function buildSceneUpgradePrompt(userPrompt){
  const prompt = cleanImagePrompt(userPrompt);
  return [
    'TASK: "' + prompt + '"',
    '',
    'This is an APPROVED FULL SCENE UPGRADE of the attached source photograph: the same real place, restaged and restyled into its best possible version. Rules:',
    '1. Same place, same camera: identical viewpoint, framing, focal length, perspective lines, room geometry, wall/window/door positions, ceiling height and layout. The result must be instantly recognizable as the same place shot from the same spot.',
    '2. Apply a complete, coherent upgrade to everything that can legitimately be styled: lighting design and colour temperature, wall and ceiling finish, flooring and rugs, furniture quality and arrangement, textiles, greenery, artwork, accessories, decluttering and staging. A full visible improvement is expected here — do NOT return the image essentially unchanged.',
    '3. ' + sourceStylePreservationRule(),
    '4. The result must stay a real, believable photograph of a real place: natural light falloff, real materials, physically correct shadows and reflections, no CGI or 3D-render look, no over-saturation, no HDR halos, no fake bloom.',
    '5. Preserve every person exactly as in the source: same faces, features, skin tone, body and clothing, recognizable and untouched. Do not add or remove people.',
    '6. Do not render words, letters, numbers, logos, captions, signatures or watermarks; keep any existing text character-for-character.',
    '7. Follow any specific direction named in the USER REQUEST (style, palette, budget, function). If none is named, choose ONE coherent premium direction that suits this particular place and execute it fully and tastefully.',
    'Return only one finished photograph of the upgraded place.'
  ].join('\n');
}

/* v-text-edit (لقطة المالك «شيل حرف م واكتب ع»): تعديل حرف/كلمة على صورة فيها
   نصوص كثيفة (لقطة شاشة/شعار) كان يعيد رسم الصورة كلها فتتشوّه بقيّة الحروف
   العربية («٤» و«تعديل» بدل م/ع). القاعدة الإضافية: عند طلب كتابة/حذف حرف أو
   كلمة، الْمس المنطقة المطلوبة فقط واترك كل حرف آخر مطابقًا حرفًا بحرف. */
function isTextEditRequest(text){
  return /\b(?:write|add|remove|delete|erase|replace|change|swap)\b[^\n]{0,40}\b(?:letter|word|text|character|caption|title|logo)\b/i.test(text)
    || /(?:اكتب|أكتب|اضف|أضف|ضيف|شيل|احذف|امسح|بدّل|بدل|غيّر|غير|استبدل)[^\n]{0,30}(?:حرف|كلمة|كلمه|نص|النص|اسم|أسماء|اسماء|عنوان|شعار|رقم)/.test(text);
}
/* v-remove-text (المالك: «بدون أسماء — يحذف الأسماء من الصورة»): طلب إزالة
   الأسماء/الكتابة/العلامة المائية من الصورة. */
function isRemoveTextRequest(text){
  const t = String(text || '');
  return /(?:بدون|بلا|من\s*دون)\s*(?:أسماء|اسماء|اسم|كتابة|كتابه|نص|نصوص|كلام|حروف|أرقام|ارقام|توقيع|علامة|لوجو|شعار|واتر\s*مارك)/.test(t)
    || /(?:احذف|امسح|شيل|ازل|أزل|نظّف|نظف|اخفِ|اخفي)\s*(?:ال)?(?:أسماء|اسماء|اسم|كتابة|كتابه|النص|نص|نصوص|كلام|حروف|أرقام|ارقام|توقيع|علامة\s*مائية|لوجو|شعار|واتر\s*مارك)/.test(t)
    || /\b(?:remove|erase|delete|clear|without|no)\b[^\n]{0,20}\b(?:names?|text|writing|words?|letters?|numbers?|caption|watermark|logo|signature|labels?)\b/i.test(t);
}
/* v-raw-words (خطة المالك ٦ سبتمبر، البند ٢: «إرسال كلماتي خامًا في المسارات الإبداعية»): في مسار الأدوات كان نموذج الصور
   يرى إعادة الصياغة الإنجليزية فقط، وكلمات المستخدم تُقرأ للنيّة ثم تُرمى. الآن كلماته الحرفية هي سطر المهمة الأول في
   الترقية والفكرة الجديدة وتحويل الأسلوب، وإعادة الصياغة سطر ثانٍ يخدمها لا يحلّ محلّها. */
function taskHeader(prompt, userWords, label){
  const words = String(userWords || '').trim().slice(0, 600);
  const tag = label ? ' (' + label + ')' : '';
  if(!words || words === prompt) return ['TASK' + tag + ': "' + prompt + '"'];
  return ['TASK' + tag + ' (the user\'s own words — follow them as written): "' + words + '"', 'Assistant reading of the task (secondary; the user\'s words win): "' + prompt + '"'];
}
/* IMAGE_RAW_CREATIVE=on: المسارات الإبداعية ترسل كلمات المستخدم وحدها مع سطر جودة واحد — كتطبيق Gemini حرفيًا (للمقارنة A/B) */
function creativeRawEnabled(env){
  return /^(?:1|on|true|yes)$/i.test(String((env && env.IMAGE_RAW_CREATIVE) || '').trim());
}
function rawCreativePrompt(prompt, userWords){
  const words = String(userWords || '').trim() || cleanImagePrompt(prompt);
  return words + '\n\nHighest quality, magazine-cover finish. Keep any real person recognizably the same person. Never write these instructions inside the image.';
}
/* v-person-swap (لقطة المالك ٦ سبتمبر «غيّر أشكال الأشخاص على الاسم الموجود تحت من غير تكرار الأشخاص»): طلب تغيير هوية
   الأشخاص عمدًا. كلمة «الاسم» في الجملة كانت تحوّله إلى تبديل حرف («غيّر فقط الحرف المسمّى»)، ثم يرفض حارسُ الهوية النتيجة
   لأنها غيّرت الشخص — وهو المطلوب حرفيًا. مسار خاص: برو، بلا حارس هوية، وبلا gpt-image (إخلاصه العالي يُبقي الوجوه). */
const PERSON_WORDS = '(?:أشخاص|اشخاص|شخص|رجال|رجل|بنات|بنت|نساء|امرأة|مرأة|أولاد|اولاد|أطفال|اطفال|ناس|موديل|موديلات|شخصيات|شخصي[ةه]|people|persons?|faces?|men|women|models?|characters?)';
const PERSON_SWAP_RE = new RegExp([
  '(?:^|[\\s،,])(?:غيّ?ر|غيري|بدّ?ل|بدلي|استبدل|خل|خلي|خلّي|اجعل|سوّ?ي?)\\s*(?:لي\\s*)?(?:(?:أشكال|اشكال|شكل|وجوه|وجه|ملامح|هوي[ةه]|صور[ةه]?|صور)\\s*)?(?:ال)?' + PERSON_WORDS + '(?=$|[\\s،,.!؟?])',
  '(?:^|[\\s،,])(?:ال)?(?:أشخاص|اشخاص|وجوه|شخصيات|رجال|بنات|نساء)\\s*(?:مختلف|مختلفين|مختلفة|مختلفه|ثانيين|ثانية|ثانيه|جدد|جديدة|جديده|غير)(?=$|[\\s،,.!؟?])',
  '(?:بدون|من\\s*غير|بلا)\\s*تكرار\\s*(?:ال)?' + PERSON_WORDS,
  '\\b(?:change|replace|swap|use)\\s+(?:the\\s+|all\\s+)?(?:different\\s+|new\\s+)?(?:faces?|people|persons?|models?|characters?|men|women)\\b',
  '\\b(?:different|new|unique)\\s+(?:faces?|people|persons?|models?)\\b',
].join('|'), 'i');
function isPersonSwapRequest(text){ return PERSON_SWAP_RE.test(String(text || '')); }
function buildPersonSwapPrompt(userPrompt, userWords){
  const prompt = cleanImagePrompt(userPrompt);
  return [
    ...taskHeader(prompt, userWords),
    '',
    'PEOPLE REPLACEMENT on the attached source image. The user explicitly wants the people changed, so their identity must NOT be preserved:',
    '1. Replace each person with a NEW, distinct, realistic person as the request describes. If a name, caption or label sits under or next to a person, that person must plausibly match that name (gender, age and cultural cues). No two people may look alike — different faces, hair, skin tones, builds and expressions; never repeat the same face twice.',
    '2. Keep everything else exactly as in the source: layout, frames, positions, poses, outfits and dress code, background, lighting, colours, and every piece of text and every label character-for-character.',
    '3. Never write the instruction itself into the image. Return only one finished image.'
  ].join('\n');
}
/* v-broad-edit (لقطة المالك ٦ سبتمبر «غير الملابس ورتب الصور خلها فقط صور» على لقطة شاشة مليئة بالنصوص): طلب مركّب يعيد
   الترتيب ويحذف الكتابة كلها ويغيّر اللبس. القالب الموضعي («لا تغيّر إلا ما طُلب واحفظ كل بكسل») يناقض إعادة الترتيب،
   ومسار النصّ الكثيف يرسله إلى gpt-image المحافظ فتخرج الواجهة نفسها بحروف مشوّهة. مسار خاص: برو، بلا حارس، كل الأوامر معًا. */
const BROAD_EDIT_RE = new RegExp([
  '(?:^|[\\s،,])(?:رتّ?ب|رتبي|ترتيب|أعد\\s*ترتيب|اعد\\s*ترتيب|نظّ?م|تنظيم|وزّ?ع)(?:ها|هم|ه|ي)?(?=$|[\\s،,.!؟?])',
  '(?:خلّ?ي?ها|اجعلها|سوّ?ي?ها|خله|خلي)\\s*(?:فقط|بس)\\s*(?:ال)?صور[ةه]?',
  '(?:^|[\\s،,])(?:فقط|بس)\\s*(?:ال)?صور(?=$|[\\s،,.!؟?])|(?:^|[\\s،,])(?:ال)?صور\\s*(?:فقط|بس)(?=$|[\\s،,.!؟?])',
  '(?:بدون|بلا|من\\s*غير)\\s*(?:أي\\s*)?(?:كتابة|كتابه|كلام|نص|نصوص|عناوين|تسميات|شرح|واجهة|أزرار|ازرار)',
  '\\b(?:rearrange|reorganize|re-?layout|reorder|photos?\\s+only|pictures?\\s+only|images?\\s+only|only\\s+(?:the\\s+)?(?:photos?|pictures?|images?)|no\\s+text|without\\s+(?:any\\s+)?text)\\b',
].join('|'), 'i');
function isBroadEditRequest(text){ return BROAD_EDIT_RE.test(String(text || '')); }
function buildBroadEditPrompt(userPrompt, userWords){
  const prompt = cleanImagePrompt(userPrompt);
  return [
    ...taskHeader(prompt, userWords),
    '',
    'BROAD EDIT of the attached source image. The request may contain several instructions (for example: change the outfits, rearrange the pictures, and keep only the pictures) — apply EVERY one of them faithfully. Rules:',
    '1. Keep the subject matter: every person stays recognizably the same person (face, skin, age) unless the request changes people; keep the same set of pictures and elements unless the request removes or adds some.',
    '2. Rearranging is allowed and expected when asked: build a clean, balanced, professional layout (even grid, equal sizes, consistent spacing, no leftover UI chrome). Change clothes, colours, backgrounds or styles exactly as requested.',
    '3. If the request says pictures only / no text / no labels, remove ALL text, captions, headers, badges, buttons and interface elements and rebuild the surface cleanly behind them. Otherwise keep existing text correct character-for-character — never re-typeset it into garbled letters.',
    '4. Never write the instruction itself into the image. Output one finished, sharp image with no artifacts.'
  ].join('\n');
}
/* v-remove-not-swap (لقطة المالك «شيل الاسم كامل» → «لم أستطع تحديد الحرف المطلوب»): حذف الاسم/النصّ كلّه
   ليس تبديل حرف — كان يُحشر في مسار تبديل الحروف («غيّر فقط الحرف المسمّى») فيفشل. حذفٌ صِرف = بلا بديل بعده
   («شيل الاسم وحط عمران» تبديل، «شيل حرف م» يبقى تبديلًا لأنه حرف لا اسم). */
const REPLACE_CUE_RE = /(?:^|[\s،,و])(?:حط|حطي|اكتب|أكتب|بدل|بدّل|خل|خلي|استبدل|مكان[هاي]?|بدال[هاي]?)(?=$|[\s،,])|\b(?:with|to|into)\b|→|->|(?:^|\s)(?:إلى|الى)(?=\s)/i;
function isPureTextRemoval(text){
  const t = String(text || '');
  return isRemoveTextRequest(t) && !REPLACE_CUE_RE.test(t);
}
/* v-elevate (المالك: «أقوى = نفس الفكرة مرفوعة، لا فكرة جديدة») ثم
   v-nano-pro-edit (المالك: «الصورة المزخرفة من نانو والثانية من التطبيق — النتيجة صفر»):
   الصياغة السابقة كانت تفرض «خامات واقعية وإضاءة سينمائية» وتمنع أي إضافة، فتخرج
   صورةً فوتوغرافية باهتة لموضوع الكرت بدل تصميم أغنى. الآن: الفكرة نفسها والتركيب
   نفسه، لكن مع إثراء ينتمي للموضوع (زخارف، رموز، خطّ عربي صحيح مرتبط بالمعنى، عمق
   وإضاءة درامية) — وهو ما يفعله نانو بنانا عندما يُطلب منه «أقوى». */
function buildElevatePrompt(userPrompt, userWords){
  const prompt = cleanImagePrompt(userPrompt);
  return [
    ...taskHeader(prompt, userWords),
    '',
    'Create a STRONGER, RICHER, far more impressive version of the attached SOURCE image — the SAME idea taken to a much higher level, the way a top art director would "plus" it. Rules:',
    '1. Same idea: keep the main subject, the setting, the message and the purpose, any key wording, and any real person recognizably the same. Anyone who sees the source must recognize the result as THIS idea taken much further — not a replaced subject, not an unrelated concept. The composition may be rebuilt, reframed or expanded whenever that makes the result stronger: this is a redesign of the same idea, not the same picture with more glow.',
    '2. A subtle polish is a FAILURE. At a glance the result must look clearly different and clearly better. Go big: dramatic cinematic lighting, atmosphere (glow, haze, golden light, reflections, particles), much richer detail and textures, a stronger focal point, refined premium colour grading, real depth and dimensionality.',
    '3. Enrich with elements that BELONG to the theme of the source: symbolic motifs, ornamental patterns, storytelling details in the background or foreground, and — where it fits the subject — elegant decorative calligraphy or lettering tied to its meaning (only correctly spelled, legible; Arabic in correct right-to-left joined script). Every added element must reinforce the same idea. Never add unrelated objects, random faces, gadgets, jewels, wires or gimmicks.',
    '4. Match the source medium: a designed graphic, card, poster, icon or illustration becomes a richer, more elaborate design; a real photograph of a place or person stays a believable photograph with upgraded lighting, staging, materials and atmosphere.',
    '5. Keep any real person recognizably the same person. Keep existing text correct character-for-character unless the request changes it. Never write the instruction itself into the image.',
    '6. Finish quality: magazine-cover / app-store-hero grade, tack-sharp, coherent, no artifacts, no blur, no toy-like rendering.',
    'Return only one finished, elevated image.'
  ].join('\n');
}
/* v-reimagine-design (لقطة المالك ٦ سبتمبر «عطني فكرة أقوى من هذي — شغل فوتوشوب»): «فكرة أقوى/عطني فكرة» كانت تمرّ بقالب
   الترقية (التركيب نفسه + زخارف وخط) فتخرج كلصقة فوتوشوب. هذا القالب يطلب تصميمًا جديدًا جريئًا للموضوع نفسه كما يفعل Gemini:
   الموضوع والرسالة والأشخاص الحقيقيون ثابتون، وكل ما عداهم (التركيب، الإطار، الخلفية، الإضاءة، الألوان، أسلوب الخط) يُعاد ابتكاره. */
function buildReimaginePrompt(userPrompt, userWords){
  const prompt = cleanImagePrompt(userPrompt);
  return [
    ...taskHeader(prompt, userWords),
    '',
    'The attached SOURCE image is the BRIEF, not the template. Design a NEW, far stronger concept for the SAME subject and purpose — the kind of bold alternative a top art director would pitch. Rules:',
    '1. Keep: the subject(s), the message and purpose, any real person recognizably the same person, and any logo, brand name or key wording (spelled exactly as in the source; Arabic in correct, cleanly joined right-to-left script).',
    '2. Reinvent everything else: composition and layout, framing and viewpoint, environment and background, lighting and atmosphere, colour palette, typography style, decorative system and storytelling details. The result must read as a different, more striking design of the same idea.',
    '3. Returning the source layout with extra ornaments, frames, glow or a caption added on top is a FAILURE — that is a Photoshop overlay, not a new concept.',
    '4. Match the source medium: a card, poster, icon set, app screen or illustration becomes a new design of that kind; a real photograph becomes a new photograph of the same subject.',
    '5. Never write the instruction itself into the image, and add no text that the source did not have unless the request asks for it.',
    '6. Quality bar: breathtaking, award-winning, magazine-cover / app-store-hero grade, tack-sharp, coherent, professional cinematic lighting, no artifacts, no toy-like rendering.',
    'Return only one finished image.'
  ].join('\n');
}
function buildEditPrompt(userPrompt){
  const prompt = cleanImagePrompt(userPrompt);
  const rules = [
    'TASK: "' + prompt + '"',
    '',
    'This is a LOCALIZED EDIT of the attached ORIGINAL SOURCE image, not a re-creation. Apply the complete current task directly to this source; do not continue any style or appearance invented by a previous generated result. Rules:',
    '1. Change ONLY what the USER REQUEST explicitly asks. Everything else (faces, skin tone, facial features, clothing, colors, lighting, textures, proportions and composition) must be carried over from the original image pixel-accurately, as if untouched.',
    '2. Do NOT re-draw, re-light, re-color, smooth, beautify or stylize any region the USER REQUEST did not mention. Every person must remain identical and recognizable.',
    '3. ' + sourceStylePreservationRule(),
    '4. Use exactly the named item, brand, model, type and color. Do not substitute or generalize it.',
    '5. Preserve the original image resolution, sharpness, white balance, exposure, saturation and skin tones. Do not add color grading or filters.',
    '6. Never write, draw, translate or render the instruction itself inside the image. Preserve existing text character-for-character unless the USER REQUEST explicitly replaces it.',
    '7. Never return the image unchanged. Always apply the USER REQUEST as written: if it is short or vague, apply its most reasonable literal interpretation to the closest matching element — changing nothing else. Do not add, invent or improve anything the USER REQUEST did not ask for.'
  ];
  if(isRemoveTextRequest(prompt)){
    rules.push('8. REMOVE TEXT: completely erase ALL names, words, letters, numbers, captions, signatures, logos and watermarks that appear in the image, unless the request names specific text to keep. Rebuild whatever was behind the removed text so the surface looks clean and natural (matching colour, texture, lighting and perspective) as if the text was never there. Do NOT leave blur, smudges, ghosting or empty boxes. Change nothing else in the image.');
  } else if(isTextEditRequest(prompt)){
    rules.push('8. TEXT/LETTER EDIT: touch ONLY the exact letter or word named in the request. Every OTHER letter, word, number and label anywhere in the image must stay identical, character-for-character, in the same font, size, colour and position — do NOT repaint, reflow or re-typeset surrounding text. Render any new Arabic text with correct, cleanly joined right-to-left glyphs. Do NOT insert stray digits, random symbols, or the words of the instruction (like "تعديل"/"edit").');
  }
  rules.push('Re-read the USER REQUEST now: "' + prompt + '". Return only one finished edited image.');
  return rules.join('\n');
}

/* v-restyle-bold (مقارنة المالك مع ChatGPT «عدل 3d»): طلب تحويل أسلوب كامل
   كان يمر بقالب التعديل الموضعي («غيّر فقط ما طُلب واحفظ كل بكسل») فيخرج
   الأسلوب خجولًا، وأحيانًا تُرسم التعليمة نفسها كعنوان داخل الصورة. هذا
   القالب يطلب إعادة رسم جريئة بالأسلوب المطلوب مع تثبيت التخطيط والنصوص. */
/* v-letter-swap (لقطة المالك: «غير حرف م حط ع» رجّعت الصورة نفسها من تطبيقنا بينما Gemini بدّل الحرف في
   مكانه): تطبيق Gemini يرسل الصورة كاملة مع تعليمة المستخدم القصيرة إلى نانو بنانا برو — لا قناع ولا
   ثماني قواعد. تعليمة قصيرة وحاسمة: بدّل هذا الحرف/الكلمة فقط، وكل بكسل آخر كما هو. */
function buildLetterSwapPrompt(userPrompt){
  const prompt = cleanImagePrompt(userPrompt);
  return [
    'Edit the attached image: "' + prompt + '"',
    'Change ONLY the letter/word/number named in that request, in place. Keep every other pixel, letter, colour, font, size, position and the whole layout exactly as in the source — no redraw, no re-typesetting, no new elements.',
    'Render the new Arabic text with correct, cleanly joined right-to-left glyphs in the same font, size, colour and position as the text it replaces. Never write the instruction itself into the image.',
    'Return only one finished image.'
  ].join('\n');
}

function buildRestylePrompt(userPrompt, userWords){
  const prompt = cleanImagePrompt(userPrompt);
  const p = prompt.toLowerCase();
  const style3d = /3d|ثلاثي|مجسم|مجسّم|render/.test(p);
  const styleHint = style3d
    ? 'BOLD premium 3D style: chunky volumetric objects with real depth, glossy and metallic materials, strong studio key light with soft rim light, crisp cast shadows, rounded beveled cards with subtle glow — the "3D icon pack / Fluent 3D" look, striking and polished.'
    : 'Apply the requested style fully and confidently across the whole image — a clear, unmistakable transformation, not a subtle filter.';
  return [
    ...taskHeader(prompt, userWords, 'style transformation'),
    '',
    'Re-render the ENTIRE attached image in the requested style. ' + styleHint,
    'Rules:',
    '1. Keep the exact layout: same grid, same card positions and sizes, same element order, same aspect ratio and framing.',
    '2. Every piece of text must be reproduced EXACTLY as in the source, character-for-character, same language and same position — Arabic labels must stay correct and readable. Never translate, paraphrase, drop or invent text.',
    '3. NEVER write the task instruction itself (words like "3d", "عدل", "style") anywhere in the image.',
    '4. Keep each icon\'s meaning and subject (a camera stays a camera, a dress stays a dress) while rendering it in the new style.',
    '5. Output one finished image only — no borders, captions, watermarks or UI chrome added.',
  ].join('\n');
}

module.exports = { cleanImagePrompt, isExplicitRawImagePrompt, stripRawImagePrefix, shouldUseRawImagePrompt, environmentDirection, buildGenerationPrompt, buildEditPrompt, buildElevatePrompt, buildReimaginePrompt, taskHeader, creativeRawEnabled, rawCreativePrompt, buildLetterSwapPrompt, isPersonSwapRequest, buildPersonSwapPrompt, isBroadEditRequest, buildBroadEditPrompt, buildSceneUpgradePrompt, buildRestylePrompt, isTextEditRequest, isRemoveTextRequest, isPureTextRemoval, sourceStylePreservationRule, explicitlyRequestsStyleChange, subjectDirection };
