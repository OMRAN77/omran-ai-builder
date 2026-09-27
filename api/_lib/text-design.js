'use strict';
/* v-text-design (المالك ٢٧ سبتمبر: «اريد شي جميل نفس الصوره الي فيها البنات ٤» — عنوان ذهبيّ وأبيات مشكولة عن الصورة نفسها،
   في مكان فارغ بعيدًا عن الوجوه). نداءان خفيفان على Gemini Flash يرى صورة المستخدم (والاحتياط GPT الخفيف):
   - authorTextDesign: «كلام حب / كلام جميل / شعر…» ← عنوان قصير + ٣–٥ أسطر مشكولة مستوحاة ممّا في الصورة فعلًا.
   - detectTextLayout: صناديق الوجوه والأشخاص (box_2d) كي يتجنّبها الراسم — الكشف المحلّيّ وحده غطّى وجه الرجل في لقطة المالك.
   لا نموذج صور ولا رصيد صور: نصّ JSON فقط. */
const { oaLightFetch } = require('./_oa-light.js');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=';
const AR = /[؀-ۿ]/;

function cleanRequest(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
}

function okImage(b64, mime) {
  const data = typeof b64 === 'string' ? b64.replace(/^data:[^,]*,/, '') : '';
  if (data.length < 200 || data.length > 900000) return null;
  return { data, mime: /^image\/(?:jpeg|png|webp)$/.test(String(mime || '')) ? mime : 'image/jpeg' };
}

function kindLine(kind) {
  if (kind === 'flirt') return 'tender, respectful romantic words (for a couple, a spouse or a beloved)';
  if (kind === 'poetry') return 'an original short Arabic poem in classical style';
  if (kind === 'prayer') return 'a complete Arabic supplication (dua), never falsely attributed to Quran or hadith';
  return 'beautiful, meaningful Arabic words';
}

function buildDesignPrompt(request, kind, hasImage) {
  return `You write the Arabic text for an elegant typographic poster printed ON ${hasImage ? 'the attached photo' : 'a photo'}.
The user asked: "${cleanRequest(request)}"
Write ${kindLine(kind)} that fit this request${hasImage ? ' AND what is actually visible in the photo (the people, place, light and mood)' : ''}.
Return one JSON object with:
- title: a short poetic Arabic heading of 1 to 3 words (like «البحر» or «حُبٌّ لا يَنتهي»), not a sentence.
- lines: 3 to 5 short lines, 3 to 7 words each, flowing as one piece (rhyme or rhythm welcome).
- topicLabel: a 1–3 word Arabic label of the topic.
Rules: full correct tashkeel (diacritics) on every word of title and lines; flawless spelling and grammar; original wording; no names unless the user gave them; no emoji, quotes, hashtags, English, or explanations; respectful and suitable for families.`;
}

function validateDesign(value) {
  if (!value || typeof value !== 'object') throw new Error('design_json_missing');
  const title = String(value.title || '').replace(/\s+/g, ' ').trim();
  const lines = (Array.isArray(value.lines) ? value.lines : String(value.lines || '').split('\n'))
    .map((l) => String(l || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6);
  if (!AR.test(title) || title.length > 40 || title.split(' ').length > 4) throw new Error('design_bad_title');
  if (lines.length < 2 || lines.some((l) => !AR.test(l) || l.length > 70)) throw new Error('design_bad_lines');
  if (/[a-z]{3,}|https?:|[«»"#@]/i.test(title + lines.join(' '))) throw new Error('design_noise');
  return { title, lines, topicLabel: String(value.topicLabel || '').trim().slice(0, 40) };
}

function extractText(data) {
  const parts = (((data && data.candidates || [])[0] || {}).content || {}).parts || [];
  return parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/* box_2d = [ymin, xmin, ymax, xmax] من ٠ إلى ١٠٠٠ ← [x0, y0, x1, y1] من ٠ إلى ١ */
function normBoxes(list) {
  return (Array.isArray(list) ? list : []).map((o) => {
    const b = o && Array.isArray(o.box_2d) ? o.box_2d.map(Number) : null;
    if (!b || b.length !== 4 || b.some((v) => !Number.isFinite(v))) return null;
    const c = (v) => Math.max(0, Math.min(1, v / 1000));
    const box = [c(b[1]), c(b[0]), c(b[3]), c(b[2])];
    return box[2] > box[0] && box[3] > box[1] ? { box, label: /face|وجه/i.test(String(o.label || '')) ? 'face' : 'person' } : null;
  }).filter(Boolean).slice(0, 24);
}

const BOX_SCHEMA = { type: 'ARRAY', items: { type: 'OBJECT', required: ['label', 'box_2d'], properties: { label: { type: 'STRING' }, box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } } } } };
const AVOID_RULE = 'Also list in "avoid" every human face (label "face") and every person\'s head-and-shoulders area (label "person") as box_2d [ymin, xmin, ymax, xmax] normalized to 0–1000, so text can be placed away from them.';

async function geminiJson(apiKey, parts, schema, fetchImpl) {
  const upstream = await (fetchImpl || fetch)(GEMINI_URL + apiKey, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.9, responseMimeType: 'application/json', responseSchema: schema } }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw new Error('design_upstream_' + upstream.status);
  return JSON.parse(extractText(data));
}

async function authorTextDesign(apiKey, request, options = {}) {
  const img = okImage(options.imageBase64, options.imageMime);
  const prompt = buildDesignPrompt(request, options.kind, !!img) + (img ? '\n' + AVOID_RULE : '');
  let lastError = null;
  if (apiKey) {
    const schema = { type: 'OBJECT', required: ['title', 'lines', 'topicLabel'], properties: { title: { type: 'STRING' }, lines: { type: 'ARRAY', items: { type: 'STRING' } }, topicLabel: { type: 'STRING' }, avoid: BOX_SCHEMA } };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const parts = (img ? [{ inline_data: { mime_type: img.mime, data: img.data } }] : []).concat([{ text: prompt + (attempt ? '\nYour previous answer was invalid (' + (lastError && lastError.message) + '); follow every rule.' : '') }]);
        const v = await geminiJson(apiKey, parts, schema, options.fetchImpl);
        return Object.assign(validateDesign(v), { avoid: normBoxes(v.avoid) });
      } catch (error) { lastError = error; }
    }
  }
  /* احتياط GPT الخفيف (قرار المالك: الكتابة لـGPT أو نانو فقط) — يرى الصورة أيضًا */
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const content = [{ type: 'text', text: prompt + '\nReturn ONLY the JSON object {"title","lines","topicLabel"' + (img ? ',"avoid"' : '') + '}.' }];
      if (img) content.push({ type: 'image_url', image_url: { url: 'data:' + img.mime + ';base64,' + img.data } });
      const upstream = await oaLightFetch(openaiKey, { temperature: 0.9, response_format: { type: 'json_object' }, messages: [{ role: 'user', content }] }, { fetchImpl: options.fetchImpl });
      const data = await upstream.json().catch(() => ({}));
      if (upstream.ok) {
        const v = JSON.parse(String((((data.choices || [])[0] || {}).message || {}).content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
        return Object.assign(validateDesign(v), { avoid: normBoxes(v.avoid) });
      }
      lastError = new Error('design_rescue_' + upstream.status);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('design_failed');
}

async function detectTextLayout(apiKey, options = {}) {
  const img = okImage(options.imageBase64, options.imageMime);
  if (!img || !apiKey) return { avoid: [] };
  const v = await geminiJson(apiKey, [{ inline_data: { mime_type: img.mime, data: img.data } }, { text: 'Detect where text must NOT be placed on this photo. ' + AVOID_RULE + ' Return JSON {"avoid": [...]} only; an empty list if there are no people.' }],
    { type: 'OBJECT', required: ['avoid'], properties: { avoid: BOX_SCHEMA } }, options.fetchImpl);
  return { avoid: normBoxes(v && v.avoid) };
}

/* موجّها maha-image (يبقى ذلك الملفّ قصيرًا — سقف image-lanes): layoutOnly لا يفشل الكتابة أبدًا (قائمة فارغة)،
   وتصميم فاشل يرجع false فيكمل المخطّط الكلاسيكيّ. الدعاء لا يمرّ هنا: يبقى على مخطّطه ونصوصه المأثورة. */
async function layoutRoute(body, res, apiKey, consume) {
  try {
    const usage = await consume();
    res.status(200).json(usage && usage.allowed ? await detectTextLayout(apiKey, { imageBase64: body.imageBase64, imageMime: body.imageMime }) : { avoid: [] });
  } catch (error) {
    console.error('[text-design] layout failed: ' + (error && error.message ? error.message : error));
    res.status(200).json({ avoid: [] });
  }
}
async function designRoute(body, res, apiKey, request) {
  try {
    const d = await authorTextDesign(apiKey, request, { kind: body.textKind, imageBase64: body.designImageBase64, imageMime: body.designImageMime });
    res.status(200).json({ authoredText: d.title + '\n\n' + d.lines.join('\n'), title: d.title, lines: d.lines, avoid: d.avoid, prayerTopic: d.topicLabel });
    return true;
  } catch (error) {
    console.error('[text-design] design failed: ' + (error && error.message ? error.message : error));
    return false;
  }
}

module.exports = { authorTextDesign, detectTextLayout, layoutRoute, designRoute, buildDesignPrompt, validateDesign, normBoxes, okImage };
