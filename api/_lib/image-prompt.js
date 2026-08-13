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
    return 'Use appetizing editorial food composition and lighting appropriate to the named item.';
  if(/منتج|عطر|ساعة|هاتف|product|perfume|watch|phone/i.test(prompt))
    return 'Use a distinctive product composition appropriate to the item, not a generic portrait setup.';
  if(/شخص|رجل|امرأة|طفل|بورتريه|person|man|woman|child|portrait/i.test(prompt))
    return 'Use a natural environmental portrait treatment suited to the named person, action, place and mood.';
  if(reserveTextArea)
    return 'Use a calm editorial composition whose imagery supports the requested subject while leaving intentional breathing room.';
  return 'Choose composition, viewpoint, lens character, lighting and palette specifically for this request; do not reuse a default visual recipe.';
}

function buildGenerationPrompt(userPrompt, options){
  const prompt = cleanImagePrompt(userPrompt);
  const opts = options || {};
  const rules = [
    'Generate one original, high-fidelity image from the USER REQUEST below.',
    'USER REQUEST: ' + prompt,
    'The USER REQUEST is authoritative: preserve its subject, count, objects, setting, colors, time, mood and named style. Do not substitute them. Do not add objects, people, words, scenery or stylistic elements the user did not request.',
    subjectDirection(prompt, !!opts.reserveTextArea),
    'Do not impose a fixed portrait lens, photorealistic look or repeated composition. If the user names a style, medium, framing or aspect, follow it exactly; otherwise choose what naturally fits this particular subject. Treat this as a brand-new image, never as an instruction to alter or continue a previous image.'
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

module.exports = { cleanImagePrompt, environmentDirection, buildGenerationPrompt, buildEditPrompt, sourceStylePreservationRule, explicitlyRequestsStyleChange, subjectDirection };
