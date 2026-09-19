'use strict';
/* v-media-gate (بلاغ المالك ١٩ سبتمبر «أيّ كلمة فيها فيديو يبني فيديو، وأيّ كلمة فيها صورة يرسم»):
   العميل كان يقرّر إنشاء صورة/فيديو بتعابير كلماتيّة قبل أن يرى النموذج الرسالة، فأيّ ذكر للكلمة يفتح
   مسار توليد (وبعضه يصرف رصيد Runway). هذه بوّابة نيّة واحدة رخيصة: Gemini Flash بحرارة صفر وجواب JSON
   قصير ومهلة ثوانٍ (نفس نمط image-intent-llm.js)، تقول: هل الرسالة أمرٌ صريح بإنشاء صورة أو فيديو الآن،
   أم كلام عن الصور والفيديو؟ التعذّر = null فيبقى الحكم للتعابير المضيَّقة في العميل. لا اسم مزوّد للمستخدم. */
const { extractJsonObject } = require('./image-edit-guard');
const { checkAndConsumeCustom, clientIp } = require('./_usage.js');

const LANES = ['image', 'video', 'none'];
const MIN_CONFIDENCE = 0.7;
const DAILY_LIMIT = 300;
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=';

function buildMediaIntentPrompt(text) {
  return [
    'You classify ONE chat message (Arabic dialects are common). Decide whether the user is explicitly commanding the assistant to CREATE a NEW image or a NEW video right now, versus merely talking about images/videos.',
    'Reply with JSON only: {"lane":"image"|"video"|"none","confidence":<0..1>}.',
    'lane=image: a direct command to draw/generate/design a picture, poster, logo, card, certificate, banner ("ارسم لي", "سوّ لي بوستر", "generate an image of").',
    'lane=video: a direct command to produce a video/clip/animation ("سوّ لي فيديو عن مطعمي", "animate this", "make a 10s clip of").',
    'lane=none: everything else — questions, how-to, advice, tips, best apps/tools, platforms (YouTube, TikTok, Instagram), scripts, captions, titles, ideas, editing text, uploading, downloading, watching, quality/format, or any sentence that only mentions the words image/video/picture.',
    'Rules: a question is always none. "how do I make a video" is none. "write a script for a video" is none. "what is the best app for editing photos" is none. Be conservative: if unsure, none. Confidence below 0.7 means none.',
    'Message: "' + String(text || '').replace(/["\n]+/g, ' ').slice(0, 400) + '"',
  ].join('\n');
}

/* يقرأ الجواب بحزم: مسار من القائمة وثقة رقميّة؛ غير ذلك null. إنشاء بثقة ضعيفة = none. */
function parseMediaIntentReply(raw) {
  const obj = (raw && typeof raw === 'object') ? raw : extractJsonObject(raw);
  if (!obj || typeof obj !== 'object') return null;
  const lane = String(obj.lane || '').trim().toLowerCase();
  const confidence = Number(obj.confidence);
  if (!LANES.includes(lane) || !Number.isFinite(confidence)) return null;
  if (lane !== 'none' && confidence < MIN_CONFIDENCE) return { lane: 'none', confidence };
  return { lane, confidence };
}

async function classifyMediaIntentLLM(opts) {
  const o = opts || {};
  if (!o.apiKey || !String(o.text || '').trim()) return null;
  const fetchImpl = o.fetchImpl || fetch;
  try {
    const r = await fetchImpl(ENDPOINT + o.apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(o.timeoutMs || 5000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildMediaIntentPrompt(o.text) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 128, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const d = await r.json().catch(() => null);
    const txt = String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join(' '));
    return parseMediaIntentReply(txt);
  } catch (e) { return null; }
}

// المعالج: POST { text, token, guestId } → { lane, confidence, source }. الفشل بأيّ شكل = lane:null (المحادثة العاديّة).
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  const text = String((body && body.text) || '').slice(0, 400);
  if (!text.trim()) { res.status(400).json({ error: 'text required' }); return; }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(200).json({ lane: null, source: 'unavailable' }); return; }
  try {
    const gate = await checkAndConsumeCustom(body.token, body.guestId, clientIp(req), 'media-intent', DAILY_LIMIT);
    if (!gate || !gate.allowed) { res.status(200).json({ lane: null, source: 'limit' }); return; }
  } catch (e) { /* العدّاد تحسين لا شرط */ }
  const r = await classifyMediaIntentLLM({ apiKey, text, timeoutMs: 5000 });
  if (!r) { res.status(200).json({ lane: null, source: 'unavailable' }); return; }
  res.status(200).json({ lane: r.lane, confidence: r.confidence, source: 'llm' });
}

module.exports = handler;
module.exports.LANES = LANES;
module.exports.MIN_CONFIDENCE = MIN_CONFIDENCE;
module.exports.buildMediaIntentPrompt = buildMediaIntentPrompt;
module.exports.parseMediaIntentReply = parseMediaIntentReply;
module.exports.classifyMediaIntentLLM = classifyMediaIntentLLM;
