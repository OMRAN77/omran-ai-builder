'use strict';
// Live camera descriptions use an independent accessibility quota.
const { checkAndConsumeCustom, clientIp } = require('./_usage.js');
const { logError } = require('./log-error.js');
const MODEL = process.env.VISUAL_GUIDE_MODEL || process.env.SCREEN_GUIDE_MODEL || 'gemini-3.1-pro-preview';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DAILY_LIMIT = Math.max(1, Math.min(500, Number(process.env.VISUAL_GUIDE_DAILY_LIMIT || 300)));
const MODES = new Set(['describe', 'read', 'steps']);
function imageFrom(body) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(body.image || '').trim());
  if (!match) return null;
  const b64 = match[2].replace(/\s+/g, '');
  if (!b64 || Math.floor(b64.length * 3 / 4) > MAX_IMAGE_BYTES) return null;
  return { mime: match[1], b64 };
}
function promptFor(mode, question, lang) {
  const ar = String(lang || 'ar').toLowerCase().startsWith('ar');
  const base = ar ? 'أنت مرشد بصري لشخص كفيف أو ضعيف البصر. أجب بالعربية الواضحة بنص يصلح للنطق. لا تستخدم Markdown أو رموزًا أو مقدمات. كن صادقًا ولا تخمّن نصًا أو خطرًا لا تراه. إذا كانت الصورة غير واضحة أو لا تكفي للإجابة، قل ذلك واطلب تغيير زاوية الكاميرا بدل اختراع إجابة.' : 'You are a visual guide for a blind or low-vision person. Reply in clear spoken English. Do not use Markdown, symbols, or an introduction. Be honest and never invent text or hazards you cannot see. If the image is unclear or insufficient, say so and ask for a better angle instead of guessing.';
  const task = mode === 'read' ? (ar ? 'اقرأ النص الظاهر حرفيًا قدر الإمكان، بما فيه الأرقام والمبالغ والتواريخ. إن لم يكن واضحًا، اطلب تقريب الكاميرا أو تثبيتها.' : 'Read visible text as literally as possible, including numbers, prices, and dates. If it is unclear, ask the person to move closer or steady the camera.') : mode === 'steps' ? (ar ? 'أعطِ الخطوة العملية التالية فقط في جملة أو جملتين. نبّه فورًا عن أي خطر واضح.' : 'Give only the next practical step in one or two sentences. Warn immediately about any visible danger.') : (ar ? 'صف أهم ما أمامه باختصار مع الموضع النسبي. ابدأ بالخطر أو العائق الواضح إن وجد.' : 'Briefly describe the most important things ahead and their relative position. Start with any clear obstacle or danger.');
  return base + '\n' + task + '\n' + (ar ? 'سؤال المستخدم: ' : 'User question: ') + String(question || '').slice(0, 700);
}
module.exports = async function visualGuide(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const image = imageFrom(body);
    if (!image) { res.status(400).json({ error: 'invalid_image' }); return; }
    const mode = MODES.has(body.mode) ? body.mode : 'describe';
    const gate = await checkAndConsumeCustom(body.token, body.guestId, clientIp(req), 'visualguide', DAILY_LIMIT);
    if (!gate.allowed) { res.status(gate.reason === 'auth' ? 401 : 429).json({ error: gate.reason === 'auth' ? 'auth_required' : 'daily_limit' }); return; }
    const key = process.env.GEMINI_API_KEY;
    if (!key) { res.status(503).json({ error: 'visual_guide_unavailable' }); return; }
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(MODEL) + ':generateContent?key=' + key, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: image.mime, data: image.b64 } }, { text: promptFor(mode, body.question, body.lang) }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 520, topP: 0.2 } })
    });
    const raw = await upstream.text();
    if (!upstream.ok) { logError('visual-guide:gemini', new Error('gemini_' + upstream.status), { status: upstream.status }); res.status(502).json({ error: 'vision_unavailable' }); return; }
    const data = JSON.parse(raw);
    const text = String(data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text || '').trim();
    res.status(200).json({ text });
  } catch (error) {
    logError('visual-guide:handler', error, {});
    res.status(500).json({ error: 'visual_guide_failed' });
  }
};
