'use strict';

const crypto = require('crypto');

const ISTIKHARA_PRAYER = 'اللَّهُمَّ إِنِّي أَسْتَخِيرُكَ بِعِلْمِكَ، وَأَسْتَقْدِرُكَ بِقُدْرَتِكَ، وَأَسْأَلُكَ مِنْ فَضْلِكَ الْعَظِيمِ، فَإِنَّكَ تَقْدِرُ وَلَا أَقْدِرُ، وَتَعْلَمُ وَلَا أَعْلَمُ، وَأَنْتَ عَلَّامُ الْغُيُوبِ. اللَّهُمَّ إِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ خَيْرٌ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَاقْدُرْهُ لِي وَيَسِّرْهُ لِي، ثُمَّ بَارِكْ لِي فِيهِ، وَإِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ شَرٌّ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَاصْرِفْهُ عَنِّي وَاصْرِفْنِي عَنْهُ، وَاقْدُرْ لِيَ الْخَيْرَ حَيْثُ كَانَ، ثُمَّ أَرْضِنِي بِهِ.';

const VISUAL_DIRECTIONS = [
  'an intimate still life built from objects that directly symbolize the request',
  'a wide place-based scene with no posed subject, chosen specifically for the request',
  'a macro natural detail whose transformation mirrors the request',
  'an authentic everyday human moment, without showing anyone praying',
  'architectural light and shadow used as a concrete metaphor for the request',
  'a tactile abstract composition made from natural materials linked to the request',
  'an overhead composition of meaningful objects, with strong negative space',
  'a quiet interior scene whose details tell the request’s story without religious clichés',
  // v578: ٨ اتجاهات كانت تُعيد نفس عائلة المشاهد. ١٢ اتجاهًا إضافيًّا توسّع مدى المخطّط.
  'a weather-driven scene where the atmosphere itself carries the request',
  'a single texture studied at close range, filling the whole frame',
  'a long-distance landscape whose scale dwarfs every human trace',
  'a night scene lit only by one practical light source inside the environment',
  'a symmetrical architectural frame with the subject deliberately off-centre',
  'traces left behind by an action, with the actor absent from the frame',
  'a reflective surface that doubles and reorganizes the scene',
  'a view shot through an intervening layer such as glass, mesh, or foliage',
  'a seasonal agricultural landscape at one specific stage of growth',
  'an aerial geometric pattern formed by terrain or manmade lines',
  'motion frozen mid-air inside an otherwise completely still environment',
  'a narrow slice of a much larger space, implying what lies outside the frame',
];

function cleanRequest(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800);
}

function chooseDirection(index) {
  const i = Number.isInteger(index) ? Math.abs(index) % VISUAL_DIRECTIONS.length : crypto.randomInt(VISUAL_DIRECTIONS.length);
  return VISUAL_DIRECTIONS[i];
}

function buildPlannerPrompt(request, options = {}) {
  const clean = cleanRequest(request);
  const position = /^(top|center|bottom)$/.test(options.textPosition || '') ? options.textPosition : 'bottom';
  const direction = options.direction || chooseDirection(options.directionIndex);
  const retry = options.retryReason ? '\nYour previous plan was rejected because: ' + options.retryReason + '. Make this attempt materially different.' : '';
  const kind = options.kind === 'poetry' ? 'short original Arabic poem' : options.kind === 'flirt' ? 'elegant original Arabic romantic passage' : options.kind === 'phrase' ? 'expressive original Arabic passage of 12 to 25 words that fits the request exactly, with no supplication or religious wording' : 'complete Arabic supplication';
  return `Create one ${kind} and one original visual concept for this exact user request:\n"${clean}"\n\nReturn one JSON object only, with these string fields: prayerText, visualBrief, topicLabel.\n\nRules for prayerText:\n- Understand any supplication topic dynamically; never choose from a fixed topic list.\n- ${options.kind === 'poetry' ? 'Write an original polished 3–6 line Arabic poem' : options.kind === 'flirt' ? 'Write elegant respectful Arabic romantic words' : 'Write a complete natural Arabic supplication'}, not a title; use 30–70 words and never falsely attribute original wording to Quran, hadith, or a poet.\n- For supplications only, if the request explicitly names a well-known transmitted wording such as istikhara or travel, reproduce it accurately.\n- Do not add a heading, quotation marks, source, explanation, or emoji.\n\nRules for visualBrief:\n- Describe a concrete, production-ready scene that expresses this request’s specific meaning. Name the subject, setting, composition, light, palette, and camera viewpoint.\n- Do not default to a boat, sea/coast, sunset, mosque silhouette, posed person praying, steaming cup or mug, open book or notebook, lamp by a window, olive branch, or decorative sprout. Use one only when the user explicitly requested it.\n- Do not merely swap props inside the same still-life/poster template. Different topics must lead to materially different subjects, settings, viewpoints, compositions, light, and palettes.\n- Include no legible writing, calligraphy, signs, numbers, watermark, or decorative pseudo-text in the scene.\n- Keep the ${position} region calm enough for a separate Arabic text overlay, but do not draw the overlay.\n- Creative-direction nudge: ${direction}. Use it only when it fits the request; semantic fit wins.\n\nRules for topicLabel:\n- Give a short Arabic label describing the actual topic, without the word "دعاء".${retry}`;
}

function extractJsonText(data) {
  const parts = (((data && data.candidates || [])[0] || {}).content || {}).parts || [];
  const text = parts.filter((part) => typeof part.text === 'string').map((part) => part.text).join('\n').trim();
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function validatePrayerPlan(value, request) {
  if (!value || typeof value !== 'object') throw new Error('planner_json_missing');
  const prayerText = String(value.prayerText || '').trim();
  const visualBrief = String(value.visualBrief || '').replace(/\s+/g, ' ').trim();
  const topicLabel = String(value.topicLabel || '').replace(/\s+/g, ' ').trim();
  if (!/[\u0600-\u06ff]/.test(prayerText) || prayerText.split(/\s+/).length < 5 || prayerText.length > 900) throw new Error('invalid_prayer_text');
  if (visualBrief.length < 80 || visualBrief.length > 1800) throw new Error('invalid_visual_brief');
  if (!/[\u0600-\u06ff]/.test(topicLabel) || topicLabel.length > 100) throw new Error('invalid_topic_label');
  const requested = cleanRequest(request);
  const forbiddenDefaults = [
    { asked: /(?:قارب|سفين|بحر|ساحل|شاطئ|boat|ship|sea|ocean|coast|beach)/i, shown: /(?:\bboat\b|\bship\b|\bocean\b|\bsea\b|\bcoast(?:line)?\b|\bbeach\b|قارب|سفينة|بحر|ساحل|شاطئ)/i },
    { asked: /(?:غروب|sunset)/i, shown: /(?:\bsunset\b|غروب)/i },
    { asked: /(?:مسجد|مصل|يصلي|تصلي|mosque|pray)/i, shown: /(?:mosque silhouette|person (?:who is )?praying|ظل مسجد|شخص يصلي)/i },
    { asked: /(?:كوب|فنجان|قهوة|شاي|cup|mug|coffee|tea)/i, shown: /(?:steaming (?:cup|mug)|ceramic (?:cup|mug)|cup of (?:coffee|tea)|mug of (?:coffee|tea)|كوب|فنجان)/i },
    { asked: /(?:كتاب|دفتر|مصحف|book|notebook|journal)/i, shown: /(?:open (?:book|notebook|journal)|كتاب مفتوح|دفتر مفتوح)/i },
    { asked: /(?:مصباح|إضاءة|اضاءة|lamp)/i, shown: /(?:(?:desk|reading|brass|table) lamp|مصباح)/i },
    { asked: /(?:زيتون|olive)/i, shown: /(?:olive branch|غصن زيتون)/i },
    { asked: /(?:نبت|برعم|شتل|sprout|seedling)/i, shown: /(?:decorative sprout|tiny (?:green )?sprout|small (?:green )?sprout|برعم|نبتة صغيرة)/i },
  ];
  if (forbiddenDefaults.some((item) => !item.asked.test(requested) && item.shown.test(visualBrief))) throw new Error('generic_visual_cliche');
  const finalPrayerText = /(?:دعاء\s*)?الاستخار[ةه]/i.test(requested) ? ISTIKHARA_PRAYER : prayerText;
  return { prayerText: finalPrayerText, visualBrief, topicLabel };
}

async function authorPrayerPlan(apiKey, request, options = {}) {
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildPlannerPrompt(request, {
      textPosition: options.textPosition,
      kind: options.kind,
      direction: options.direction,
      directionIndex: options.directionIndex == null ? undefined : options.directionIndex + attempt,
      retryReason: attempt ? String(lastError && lastError.message || 'invalid output') : '',
    });
    const upstream = await (options.fetchImpl || fetch)(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.95,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            required: ['prayerText', 'visualBrief', 'topicLabel'],
            properties: {
              prayerText: { type: 'STRING' },
              visualBrief: { type: 'STRING' },
              topicLabel: { type: 'STRING' },
            },
          },
        },
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      lastError = new Error('planner_upstream_' + upstream.status);
      if (![429, 500, 503].includes(upstream.status)) break;
      continue;
    }
    try {
      return validatePrayerPlan(JSON.parse(extractJsonText(data)), request);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('prayer_planner_failed');
}

module.exports = { VISUAL_DIRECTIONS, buildPlannerPrompt, extractJsonText, validatePrayerPlan, authorPrayerPlan };
