'use strict';
// Live camera descriptions use an independent accessibility quota.
const { checkAndConsumeCustom, clientIp } = require('./_usage.js');
const { logError } = require('./log-error.js');
const MODEL = process.env.VISUAL_GUIDE_MODEL || process.env.SCREEN_GUIDE_MODEL || 'gemini-3.1-pro-preview';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DAILY_LIMIT = Math.max(1, Math.min(500, Number(process.env.VISUAL_GUIDE_DAILY_LIMIT || 300)));
const MODES = new Set(['describe', 'read', 'steps', 'translate', 'ask']);
function imageFrom(body) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(body.image || '').trim());
  if (!match) return null;
  const b64 = match[2].replace(/\s+/g, '');
  if (!b64 || Math.floor(b64.length * 3 / 4) > MAX_IMAGE_BYTES) return null;
  return { mime: match[1], b64 };
}
const VG_LANG_NAMES = { en: 'English', fr: 'French', hi: 'Hindi', bn: 'Bengali', ne: 'Nepali', id: 'Indonesian', fil: 'Filipino', tr: 'Turkish', zh: 'Simplified Chinese', ru: 'Russian', es: 'Spanish', ml: 'Malayalam' };
function promptFor(mode, question, lang) {
  const lg = String(lang || 'ar').toLowerCase();
  const ar = lg.startsWith('ar') || lg.startsWith('ur');
  /* v-vg-i18n (طلب عمران): الرد بلغة التطبيق — 14 لغة لا عربي/إنجليزي فقط */
  const langRule = (!ar && VG_LANG_NAMES[lg] && lg !== 'en') ? (' Reply ONLY in ' + VG_LANG_NAMES[lg] + ' — never in any other language.') : '';
  // «عين عمران»: وضعا الترجمة والسؤال يخدمان الجميع لا المكفوفين فقط —
  // فقاعدتهما محايدة (بلا إطار الإعاقة البصرية) مع نفس صرامة الصدق.
  if (mode === 'translate' || mode === 'ask') {
    const nbase = ar ? 'أنت «عين عمران»: مساعد بصري يرى عبر كاميرا الهاتف. أجب بالعربية الواضحة بنص يصلح للنطق. لا تستخدم Markdown أو رموزًا أو مقدمات. كن صادقًا ولا تخترع ما لا تراه، وإذا كانت الصورة غير واضحة فقل ذلك واطلب تقريب الكاميرا.' : ('You are "Omran Eye": a visual assistant seeing through the phone camera. Reply in clear spoken language. No Markdown, symbols, or introduction. Be honest, never invent what you cannot see; if the image is unclear, say so and ask for a closer shot.' + langRule);
    const ntask = mode === 'translate'
      ? (ar ? 'اقرأ كل نص ظاهر في الصورة — لافتة، قائمة طعام، عبوة، وثيقة — ثم قدّمه مترجمًا إلى العربية بصياغة سليمة. إن كان النص عربيًا أصلًا فاقرأه كما هو. اذكر الأرقام والمبالغ بدقة. إن لم يوجد نص واضح فقل ذلك في جملة واحدة.' : 'Read every visible text in the image — sign, menu, package, document — then present it translated into English, well phrased. If it is already in English, read it as is. Keep numbers and amounts exact. If no clear text exists, say so in one sentence.')
      : (ar ? 'أجب عن سؤال المستخدم عمّا يظهر في الصورة كخبير عملي: تعريف الشيء، حالته، سعره التقريبي إن كان منتجًا معروفًا، أو نصيحة الاستخدام — حسب ما يخدم السؤال. اختصر في جملتين إلى أربع، وصرّح بعدم التأكد عند الحاجة.' : 'Answer the user\'s question about what appears in the image like a practical expert: what it is, its condition, rough price if a known product, or usage advice — whatever serves the question. Keep it to two to four sentences and state uncertainty when needed.');
    return nbase + '\n' + ntask + '\n' + (ar ? 'سؤال المستخدم: ' : 'User question: ') + String(question || '').slice(0, 700);
  }
  const base = ar ? 'أنت مرشد بصري لشخص كفيف أو ضعيف البصر. أجب بالعربية الواضحة بنص يصلح للنطق. لا تستخدم Markdown أو رموزًا أو مقدمات. كن صادقًا ولا تخمّن نصًا أو خطرًا لا تراه. إذا كانت الصورة غير واضحة أو لا تكفي للإجابة، قل ذلك واطلب تغيير زاوية الكاميرا بدل اختراع إجابة.' : ('You are a visual guide for a blind or low-vision person. Reply in clear spoken language. Do not use Markdown, symbols, or an introduction. Be honest and never invent text or hazards you cannot see. If the image is unclear or insufficient, say so and ask for a better angle instead of guessing.' + langRule);
  const task = mode === 'read' ? (ar ? 'اقرأ النص الظاهر حرفيًا قدر الإمكان، بما فيه الأرقام والمبالغ والتواريخ. إن لم يكن واضحًا، اطلب تقريب الكاميرا أو تثبيتها.' : 'Read visible text as literally as possible, including numbers, prices, and dates. If it is unclear, ask the person to move closer or steady the camera.') : mode === 'steps' ? (ar ? 'أعطِ الخطوة العملية التالية فقط في جملة أو جملتين. نبّه فورًا عن أي خطر واضح.' : 'Give only the next practical step in one or two sentences. Warn immediately about any visible danger.') : (ar ? 'صف أهم ما أمامه باختصار مع الموضع النسبي. ابدأ بالخطر أو العائق الواضح إن وجد.' : 'Briefly describe the most important things ahead and their relative position. Start with any clear obstacle or danger.');
  return base + '\n' + task + '\n' + (ar ? 'سؤال المستخدم: ' : 'User question: ') + String(question || '').slice(0, 700);
}
// v-eye-rescue: خط الإنقاذ الثامن — إن غاب مفتاح Gemini أو تعطّل أو أعاد
// نصًا فارغًا، تُكمل «عين عمران» عبر رؤية OpenAI بنفس التوجيه تمامًا،
// فلا يموت المرشد بموت مزوّد واحد.
async function openaiRescue(image, prompt) {
  const okey = process.env.OPENAI_API_KEY;
  if (!okey) return null;
  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + okey },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: process.env.VISUAL_GUIDE_RESCUE_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: 'data:' + image.mime + ';base64,' + image.b64 } },
          { type: 'text', text: prompt }
        ] }],
        max_tokens: 600, temperature: 0.2
      })
    });
    if (!upstream.ok) { logError('visual-guide:rescue', new Error('openai_' + upstream.status), { status: upstream.status }); return null; }
    const data = await upstream.json().catch(() => null);
    const text = String(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
    return text || null;
  } catch (error) {
    logError('visual-guide:rescue', error, {});
    return null;
  }
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
    const prompt = promptFor(mode, body.question, body.lang);
    const key = process.env.GEMINI_API_KEY;
    let text = '';
    if (key) {
      const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(MODEL) + ':generateContent?key=' + key, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: image.mime, data: image.b64 } }, { text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 520, topP: 0.2 } })
      }).catch(() => null);
      if (upstream && upstream.ok) {
        const raw = await upstream.text().catch(() => '');
        try {
          const data = JSON.parse(raw);
          text = String(data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text || '').trim();
        } catch (error) { logError('visual-guide:gemini-parse', error, {}); }
      } else if (upstream) {
        logError('visual-guide:gemini', new Error('gemini_' + upstream.status), { status: upstream.status });
      }
    }
    let engine = text ? 'gemini' : '';
    if (!text) { text = (await openaiRescue(image, prompt)) || ''; if (text) engine = 'openai'; }
    if (!text) { res.status(key ? 502 : 503).json({ error: key ? 'vision_unavailable' : 'visual_guide_unavailable' }); return; }
    // v-eye-probe: اسم المحرك في الرد — العميل يتجاهله والمجس يشخّص به.
    res.status(200).json({ text, engine });
  } catch (error) {
    logError('visual-guide:handler', error, {});
    res.status(500).json({ error: 'visual_guide_failed' });
  }
};
