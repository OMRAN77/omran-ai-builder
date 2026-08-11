'use strict';

function cleanImagePrompt(value){
  return String(value || '').trim().slice(0, 2400);
}

function subjectDirection(prompt, reserveTextArea){
  if(/شمس|شروق|غروب|سماء|سحاب|بحر|جبل|صحراء|sun|sunrise|sunset|sky|sea|mountain|desert/i.test(prompt))
    return 'Use an expansive environmental composition with depth and lighting natural to the requested place and time.';
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

function buildEditPrompt(userPrompt){
  const prompt = cleanImagePrompt(userPrompt);
  return [
    'TASK: "' + prompt + '"',
    '',
    'This is a LOCALIZED EDIT of the attached image, not a re-creation. Rules:',
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

module.exports = { cleanImagePrompt, buildGenerationPrompt, buildEditPrompt, sourceStylePreservationRule, subjectDirection };
