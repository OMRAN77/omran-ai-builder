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

function buildEditPrompt(userPrompt){
  return [
    'Edit the attached image only as explicitly requested.',
    'USER REQUEST: ' + cleanImagePrompt(userPrompt),
    'Preserve every unmentioned subject, face, object, color, crop, layout and background as closely as possible. Do not restyle, replace or add anything the user did not request.',
    'Return only the finished edited image, with no explanation and no watermark.'
  ].join('\n');
}

module.exports = { cleanImagePrompt, buildGenerationPrompt, buildEditPrompt, subjectDirection };
