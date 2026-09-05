'use strict';
/* v-image-duo (طلب المالك ٥ سبتمبر: «عندي نانو بنانا وOpenAI، ادمجهم وتطلع النتيجة قوية»):
   المحرّكان يعملان معًا على الطلب نفسه، وموديل رؤية (Gemini flash) يقارن النتيجتين بالطلب
   وبالصورة الأصلية إن وُجدت ويختار الأدقّ. أي فشل في الحكم = نُبقي المرشّح الأول. */
const JUDGE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=';

function duoEnabled() {
  return String(process.env.IMAGE_DUO || 'on').toLowerCase() !== 'off' && !!(process.env.OPENAI_API_KEY || '').trim();
}

/* opts: { apiKey, prompt, source:{b64,mime}|null, a:{b64,mime}, b:{b64,mime}, timeoutMs } → 'a' | 'b' */
async function judgeBest(opts) {
  try {
    if (!opts || !opts.apiKey || !opts.a || !opts.b || !opts.a.b64 || !opts.b.b64) return 'a';
    const rubric = opts.source
      ? 'You are a strict photo editor judging two AI edits of the SOURCE photo for this request: "' + String(opts.prompt || '').slice(0, 600) + '".\n' +
        'Pick the candidate that (1) keeps the same person: identical face, skin tone, body shape and identity; (2) applies exactly what was requested and nothing else; (3) keeps unrequested details (pose, background, framing) as in the source; (4) looks most realistic with correct text/letters if any. Reject candidates with distorted faces, changed identity, or artifacts.'
      : 'You are a strict art director judging two AI images generated for this request: "' + String(opts.prompt || '').slice(0, 600) + '".\n' +
        'Pick the candidate that (1) follows the request most faithfully; (2) renders any text or letters correctly (Arabic must be correct and readable); (3) has the best composition, lighting and realism; (4) has no artifacts, extra limbs or garbled details.';
    const parts = [{ text: rubric + '\nAnswer with exactly one letter: A or B.' }];
    if (opts.source && opts.source.b64) { parts.push({ text: 'SOURCE:' }); parts.push({ inlineData: { mimeType: opts.source.mime || 'image/jpeg', data: opts.source.b64 } }); }
    parts.push({ text: 'CANDIDATE A:' }); parts.push({ inlineData: { mimeType: opts.a.mime || 'image/png', data: opts.a.b64 } });
    parts.push({ text: 'CANDIDATE B:' }); parts.push({ inlineData: { mimeType: opts.b.mime || 'image/png', data: opts.b.b64 } });
    const r = await fetch(JUDGE + opts.apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs || 25000),
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0, maxOutputTokens: 4 } }),
    });
    if (!r.ok) { console.warn('[image-judge] status=' + r.status); return 'a'; }
    const d = await r.json().catch(() => null);
    const txt = String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join(' ')).trim().toUpperCase();
    const pick = /^\s*B\b/.test(txt) ? 'b' : (/^\s*A\b/.test(txt) ? 'a' : (/\bB\b/.test(txt) && !/\bA\b/.test(txt) ? 'b' : 'a'));
    console.warn('[image-judge] pick=' + pick + ' raw=' + txt.slice(0, 12));
    return pick;
  } catch (e) { console.warn('[image-judge] ' + (e && e.message)); return 'a'; }
}

module.exports = { judgeBest, duoEnabled };
