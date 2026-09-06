'use strict';
/* v-intent-llm (خطة المالك ٦ سبتمبر، البند ١: «مصنّف بنموذج بدل التعابير النمطية»): كل صياغة جديدة («عطني فكرة»،
   «شغل فوتوشوب») كانت تحتاج ترقيعًا يدويًا في image-intent.js. الآن التعابير النمطية مرساة (ما أثبته المالك يبقى كما
   هو)، ونموذج flash يوسّعها: حين لا تلتقط النية أي مسار إبداعي لطلب قصير على صورة مصدر، يُسأل «أي مسار؟» بجواب JSON
   قصير بحرارة صفر ومهلة ٦ ثوانٍ. تعذّر النداء أو ثقة منخفضة = يبقى التعديل الموضعي كما كان. IMAGE_INTENT_LLM=off يعطّله. */
const { extractJsonObject } = require('./image-edit-guard');

const INTENT_LANES = ['edit', 'elevate', 'reimagine', 'restyle', 'same'];
const MIN_CONFIDENCE = 0.7;
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=';

function llmIntentEnabled(env) {
  return !/^(?:0|off|false|no)$/i.test(String((env && env.IMAGE_INTENT_LLM) || '').trim());
}

function buildIntentClassifierPrompt(text) {
  return [
    'You route a user request about an ATTACHED image to exactly one lane. Reply with JSON only: {"lane":"<lane>","confidence":<0..1>}.',
    'Lanes:',
    '- edit: a localized change that names a specific thing to change, add, remove or recolour (text, name, letter, colour, background, an object, a person\'s clothes, crop/rotate/format). Also any question or non-image request.',
    '- elevate: the same picture made much stronger, richer, more premium or more professional, composition kept ("أقوى", "طوّرها", "خلها فخمة", "make it pop").',
    '- reimagine: a new design or concept of the same subject ("عطني فكرة", "فكرة ثانية", "شي مختلف", "مو شغل فوتوشوب", "give me an idea").',
    '- restyle: convert the whole image into a named art style or medium (cartoon, anime, 3D, pixel art, watercolor, oil painting, sketch).',
    '- same: keep the image exactly as it is, only fix quality/sharpness ("نفس الصورة بالضبط").',
    'Rules: if the request names a specific element to change, it is edit even if it contains praise words. A bare compliment or greeting is edit. Arabic dialects are common; judge the intent, not the spelling. Be conservative: confidence below 0.7 means edit.',
    'Request: "' + String(text || '').replace(/["\n]+/g, ' ').slice(0, 300) + '"',
  ].join('\n');
}

/* يقرأ جواب النموذج بحزم: مسار من القائمة وثقة رقمية، وإلا null (= لا تغيير في النية) */
function parseIntentReply(raw) {
  const obj = (raw && typeof raw === 'object') ? raw : extractJsonObject(raw);
  if (!obj || typeof obj !== 'object') return null;
  const lane = String(obj.lane || '').trim().toLowerCase();
  const confidence = Number(obj.confidence);
  if (!INTENT_LANES.includes(lane) || !Number.isFinite(confidence)) return null;
  if (lane === 'edit' || confidence < MIN_CONFIDENCE) return null;
  return { lane, confidence };
}

async function classifyEditIntentLLM({ apiKey, text, timeoutMs }) {
  if (!apiKey || !String(text || '').trim()) return null;
  try {
    const r = await fetch(ENDPOINT + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs || 6000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildIntentClassifierPrompt(text) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 256, responseMimeType: 'application/json' }, /* v-flash-budget */
      }),
    });
    const d = await r.json().catch(function () { return null; });
    const txt = String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map(function (p) { return p.text || ''; }).join(' '));
    return parseIntentReply(txt);
  } catch (e) { return null; }
}

module.exports = { INTENT_LANES, MIN_CONFIDENCE, llmIntentEnabled, buildIntentClassifierPrompt, parseIntentReply, classifyEditIntentLLM };
