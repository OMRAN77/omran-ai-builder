'use strict';
/* v-request-check (المالك ٦ سبتمبر: «ما يعطيني الطلب الي أريده بالضبط… الصور من 0 وصلت 60%»): فحص عام بعد كل تعديل — يسأل
   flash (رؤية) «هل تطبّق النتيجةُ طلبَ المستخدم كما كتبه؟» بلا حكم على الذوق. إن لم يُنفَّذ، يعيد maha-image المحاولة مرة
   واحدة مع ذكر ما نقص حرفيًا، ويقبل الثانية فقط إن اجتازت الفحص. IMAGE_REQUEST_CHECK=off يعطّله. */
const { extractJsonObject } = require('./image-edit-guard');
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=';

function requestCheckEnabled(env) {
  return !/^(?:0|off|false|no)$/i.test(String((env && env.IMAGE_REQUEST_CHECK) || '').trim());
}

function buildRequestCheckPrompt(request) {
  return [
    'The user asked, verbatim: "' + String(request || '').replace(/["\n]+/g, ' ').slice(0, 400) + '".',
    'IMAGE 1 is the source they attached. IMAGE 2 is the edited result.',
    'Decide ONLY whether IMAGE 2 applies that request the way a reasonable person would expect: the requested style, change, removal, rearrangement, outfit, text change, or people matching the names written next to them. Ignore taste and quality.',
    'If the request is vague and IMAGE 2 is a plausible fulfilment, answer applied=true. Answer applied=false only when something the request clearly asked for is visibly not done.',
    'Reply with JSON only: {"applied": true|false, "missing": "<one short sentence naming what the request asked for that IMAGE 2 does not show; empty when applied>"}',
  ].join('\n');
}

/* يقرأ جواب النموذج بحزم: applied منطقي وإلا null (= لا إعادة محاولة) */
function parseRequestCheck(raw) {
  const o = (raw && typeof raw === 'object') ? raw : extractJsonObject(raw);
  if (!o || typeof o.applied !== 'boolean') return null;
  return { applied: o.applied, missing: String(o.missing || '').replace(/\s+/g, ' ').trim().slice(0, 400) };
}

async function verifyRequestApplied({ apiKey, request, source, result, timeoutMs }) {
  if (!apiKey || !request || !source || !source.b64 || !result || !result.b64) return null;
  try {
    const parts = [{ text: buildRequestCheckPrompt(request) }, { text: 'IMAGE 1:' }, { inlineData: { mimeType: source.mime || 'image/jpeg', data: source.b64 } }, { text: 'IMAGE 2:' }, { inlineData: { mimeType: result.mime || 'image/png', data: result.b64 } }];
    const r = await fetch(ENDPOINT + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs || 20000),
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0, maxOutputTokens: 256, responseMimeType: 'application/json' } }),
    });
    if (!r.ok) return null;
    const d = await r.json().catch(function () { return null; });
    const txt = String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map(function (p) { return p.text || ''; }).join(' '));
    return parseRequestCheck(txt);
  } catch (e) { return null; }
}

module.exports = { requestCheckEnabled, buildRequestCheckPrompt, parseRequestCheck, verifyRequestApplied };
