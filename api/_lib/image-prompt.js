'use strict';

function cleanImagePrompt(value){
  return String(value || '').trim().slice(0, 2400);
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
    // v668: شكوى عمران — الدعاء/النص كان ينكتب فوق الرسمة نفسها ويخربها.
    'TEXT PLACEMENT (mandatory): if the image contains ANY text, captions or labels, place them ONLY in clean empty areas (top or bottom margins, plain background zones) and NEVER overlapping or covering the main subject, faces or key details. Compose the scene FIRST to reserve that empty space for the text. Text must be fully legible with strong contrast, correct spelling, and consistent typography. If the requested text is long, shrink the subject or move it aside so the text gets its own dedicated clear area.'
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

function buildEditPrompt(userPrompt){
  const prompt = cleanImagePrompt(userPrompt);
  return [
    'TASK: "' + prompt + '"',
    '',
    'This is a LOCALIZED EDIT of the attached ORIGINAL SOURCE image, not a re-creation. Apply the complete current task directly to this source; do not continue any style or appearance invented by a previous generated result. Rules:',
    '1. Change ONLY what the USER REQUEST explicitly asks. Everything else (faces, skin tone, facial features, clothing, colors, lighting, textures, proportions and composition) must be carried over from the original image pixel-accurately, as if untouched.',
    '2. Do NOT re-draw, re-light, re-color, smooth, beautify or stylize any region the USER REQUEST did not mention. Every person must remain identical and recognizable.',
    '3. ' + sourceStylePreservationRule(),
    '4. Use exactly the named item, brand, model, type and color. Do not substitute or generalize it.',
    '5. Preserve the original image resolution, sharpness, white balance, exposure, saturation and skin tones. Do not add color grading or filters.',
    '6. Never write, draw, translate or render the instruction itself inside the image. Preserve existing text character-for-character unless the USER REQUEST explicitly replaces it.',
    '7. If the USER REQUEST is vague and names no specific element, return the image essentially unchanged.',
    'Re-read the USER REQUEST now: "' + prompt + '". Return only one finished edited image.'
  ].join('\n');
}

module.exports = { cleanImagePrompt, environmentDirection, buildGenerationPrompt, buildEditPrompt, buildSceneUpgradePrompt, sourceStylePreservationRule, explicitlyRequestsStyleChange, subjectDirection };
