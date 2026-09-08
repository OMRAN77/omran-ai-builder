/**
 * image-merge.js — دمج نانو (Gemini) + GPT (OpenAI) لتوليد وتعديل الصور،
 * مع أخذ «الفكرة كاملة» من سياق المحادثة قبل الرسم.
 *
 * المنطق:
 *   • صورة مرفقة  → تعديل: نانو أولًا (يحافظ على الأصل)، ثمّ GPT احتياطًا.
 *   • بلا صورة    → توليد جديد: GPT أولًا (نصّ/عدّ/تخطيط)، ثمّ نانو احتياطًا.
 *   • buildImageBrief يجمع الفكرة من المحادثة كاملة (لا من آخر رسالة فقط).
 *
 * كلّ الدوال تُرجع صورة كـ base64 خام (بلا بادئة data:).
 * المفاتيح: OPENAI_API_KEY · GEMINI_API_KEY
 * النماذج : IMAGE_EDIT_MODEL (نانو، افتراضي gemini-2.5-flash-image) · gpt-image-2
 */

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const NANO_MODEL = (process.env.IMAGE_EDIT_MODEL || 'gemini-2.5-flash-image').trim(); // نانو
const GPT_MODEL  = 'gpt-image-2';
const TIMEOUT    = 240000; // ٤ دقائق — التوليد/التعديل عالي الدقّة قد يطول

const GPT_SIZE = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536', '16:9': '1536x864' };

/* ════════════ 1) GPT (OpenAI) ════════════ */

async function gptGenerate({ prompt, aspect = '1:1', transparent = false }) {
  const body = { model: GPT_MODEL, prompt, size: GPT_SIZE[aspect] || '1024x1024', n: 1 };
  if (transparent) { body.background = 'transparent'; body.output_format = 'png'; }
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`gpt gen ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const b64 = (await res.json())?.data?.[0]?.b64_json;
  if (!b64) throw new Error('gpt gen: empty response');
  return b64;
}

async function gptEdit({ prompt, imageB64, mime = 'image/png' }) {
  const form = new FormData();
  form.append('model', GPT_MODEL);
  form.append('prompt', prompt);
  form.append('image', new Blob([Buffer.from(imageB64, 'base64')], { type: mime }), 'src.png');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}` }, // بلا Content-Type — FormData يضبط الحدود
    body: form,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`gpt edit ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const b64 = (await res.json())?.data?.[0]?.b64_json;
  if (!b64) throw new Error('gpt edit: empty response');
  return b64;
}

/* ════════════ 2) نانو (Gemini) ════════════ */

async function nanoCall(model, parts, aspect) {
  const generationConfig = aspect ? { imageConfig: { aspectRatio: aspect } } : undefined;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], ...(generationConfig ? { generationConfig } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT),
    }
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const found = ((await res.json())?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!found) throw new Error('gemini: no image part');
  return found.inlineData.data;
}

const nanoGenerate = ({ prompt, aspect = '1:1' }) =>
  nanoCall(NANO_MODEL, [{ text: prompt }], aspect);

const nanoEdit = ({ prompt, imageB64, mime = 'image/png' }) =>
  nanoCall(NANO_MODEL, [{ text: prompt }, { inlineData: { mimeType: mime, data: imageB64 } }], null);

/* ════════════ 3) الاحتياط: جرّب الأساسيّ ثمّ الثاني ════════════ */

async function withFallback(primary, backup) {
  try { const b = await primary(); if (b) return b; }
  catch (e) { console.warn('[image-merge] primary failed → fallback:', e.message); }
  return await backup();
}

/* ════════════ 4) «الفكرة كاملة» من سياق المحادثة ════════════ */

/**
 * يبني وصف صورة إنجليزيًّا غنيًّا من المحادثة كلّها، لا من آخر رسالة فقط.
 * @param {Array}   messages   رسائل المحادثة [{role, content}]
 * @param {string}  userRequest نصّ طلب الصورة الحاليّ
 * @param {object}  llm        مزوّدك النصّيّ: يوفّر chat(system, user) → نصّ
 */
async function buildImageBrief(messages, userRequest, llm) {
  const ctx = (messages || [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-14) // آخر ١٤ دورًا نصّيًّا كسياق للفكرة
    .map((m) => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content.slice(0, 600))
    .join('\n');

  if (!ctx || !llm || typeof llm.chat !== 'function') return userRequest;

  const system =
    'You turn a conversation into ONE rich English image-generation prompt. ' +
    'Gather the FULL accumulated idea from the whole chat — subject, every agreed ' +
    'detail, style, colors, mood, composition — not just the last line. Merge them ' +
    'into a single vivid prompt for an image model. Return ONLY the prompt, no preamble.';
  const user =
    'Conversation:\n' + ctx + '\n\nImage request now: ' + userRequest + '\n\nFull English prompt:';

  try { return (await llm.chat(system, user)).trim() || userRequest; }
  catch (e) { console.warn('[image-merge] brief failed → raw request:', e.message); return userRequest; }
}

/* ════════════ 5) الدمج الذكيّ — نقطة الدخول الوحيدة ════════════ */

/**
 * @param {object} o
 * @param {string} o.prompt      وصف الصورة (يُفضّل تمريره من buildImageBrief)
 * @param {string} [o.imageB64]  صورة مرفقة base64 → يتحوّل لمسار التعديل (نانو)
 * @param {string} [o.mime]      نوع الصورة المرفقة
 * @param {string} [o.aspect]    النسبة: 1:1 · 3:2 · 2:3 · 16:9
 * @param {boolean}[o.transparent] خلفية شفافة (شعارات)
 * @returns {Promise<string>} صورة base64 خام
 */
async function smartImage({ prompt, imageB64 = null, mime = 'image/png', aspect = '1:1', transparent = false }) {
  if (imageB64) {
    // صورة مرفقة → تعديل: نانو أولًا (يحافظ على الأصل)، ثمّ GPT
    return withFallback(
      () => nanoEdit({ prompt, imageB64, mime }),
      () => gptEdit({ prompt, imageB64, mime })
    );
  }
  // بلا صورة → توليد جديد: GPT أولًا (نصّ/عدّ/تخطيط)، ثمّ نانو
  return withFallback(
    () => gptGenerate({ prompt, aspect, transparent }),
    () => nanoGenerate({ prompt, aspect })
  );
}

/**
 * غلاف كامل: يأخذ الفكرة من المحادثة ثمّ يرسم. الاستعمال الأبسط.
 * @example
 *   const b64 = await imageFromConversation({
 *     messages: cur.messages, userRequest: userText,
 *     llm, imageB64: srcImage, mime, aspect: '1:1',
 *   });
 *   // اعرضها: `data:image/png;base64,${b64}`
 */
async function imageFromConversation({ messages, userRequest, llm, imageB64 = null, mime = 'image/png', aspect = '1:1', transparent = false }) {
  const prompt = await buildImageBrief(messages, userRequest, llm);
  return smartImage({ prompt, imageB64, mime, aspect, transparent });
}

module.exports = {
  imageFromConversation, // ← الأبسط: فكرة المحادثة كاملة ثمّ رسم
  smartImage,            // ← دمج نانو+GPT مباشرة بوصف جاهز
  buildImageBrief,       // ← تقطير المحادثة إلى وصف
  gptGenerate, gptEdit,
  nanoGenerate, nanoEdit,
};
