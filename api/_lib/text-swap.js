// «تبديل نص على الصورة» (فكرة عمران: الذكاء يقرأ الصورة ويفهم طلب المستخدم) —
// «بدل التاريخ بدل 28 حط 12»: بدل إرسال الصورة لمولّد يعيد رسمها كلها (ويشوّه
// الخط العربي)، تقرأ الرؤية الصورة وتحدد سطر النص المطلوب تغييره وموضعه ولونه،
// والعميل يبدله محليًّا على كانفس — باقي الصورة لا يُمسّ بكسلًا واحدًا.
const { checkAndConsume, clientIp } = require('./_usage');

const PROMPT = [
  'You are given an image that contains written text, plus a user request (usually Arabic dialect)',
  'asking to change some of that text (a date, a name, a number, a word...).',
  'Find the ONE existing text line that must change. Return ONLY strict JSON, no markdown:',
  '{"found":true,"box":{"x":number,"y":number,"w":number,"h":number},',
  '"newLine":string,"color":"#rrggbb","fontKey":"naskh"|"diwani"|"kufi"|"ruqaa"|"default","bold":boolean}',
  'Rules:',
  '- newLine: the COMPLETE line exactly as it should read AFTER the change — apply only the requested',
  '  replacement and keep every other character identical (same language, same spelling, same digits).',
  '- box: a snug bounding box around the EXISTING line as fractions of image width/height (0..1),',
  '  x/y = top-left corner. Cover the whole line, not just the changed word.',
  '- color: the hex color of the existing text. fontKey: closest Arabic style of the existing text',
  '  (naskh = classic serif-like, diwani = ornate calligraphy, kufi = geometric, ruqaa = handwriting,',
  '  default = clean modern sans).',
  '- If the request is NOT about changing written text, or you cannot confidently locate the line,',
  '  return {"found":false}.',
].join('\n');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.status(405).end('{"error":"POST only"}'); return; }
  try {
    let b = req.body;
    if (typeof b === 'string') b = JSON.parse(b);
    b = b || {};
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(500).end(JSON.stringify({ error: 'no key' })); return; }
    const imageBase64 = typeof b.imageBase64 === 'string' ? b.imageBase64 : '';
    const request = String(b.request || '').slice(0, 400);
    if (imageBase64.length < 100 || !request) {
      res.status(400).end(JSON.stringify({ error: 'bad input' }));
      return;
    }
    const usage = await checkAndConsume(b.token, b.guestId, 'gemini', clientIp(req));
    if (!usage.allowed) {
      res.status(429).end(JSON.stringify({ error: 'daily_limit_reached', message_ar: 'وصلت الحد اليومي، جرّب بكرة.' }));
      return;
    }
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: PROMPT + '\nUser request: "' + request.replace(/["\n\r]/g, ' ') + '"' },
          { inlineData: { mimeType: b.mimeType || 'image/jpeg', data: imageBase64 } },
        ] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      res.status(upstream.status >= 500 ? 502 : upstream.status).end(JSON.stringify({ error: (data && data.error && data.error.message) || 'upstream' }));
      return;
    }
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const textPart = parts.find((p) => typeof p.text === 'string');
    let spec = null;
    try { spec = JSON.parse(String(textPart && textPart.text || '').replace(/^\s*```(?:json)?|```\s*$/g, '').trim()); } catch (e) { spec = null; }
    const frac = (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : null);
    const bx = spec && spec.box ? spec.box : null;
    const ok = spec && spec.found === true && bx
      && frac(bx.x) != null && frac(bx.y) != null && frac(bx.w) != null && frac(bx.h) != null
      && bx.w > 0.01 && bx.h > 0.005
      && typeof spec.newLine === 'string' && spec.newLine.trim();
    if (!ok) { res.status(200).end(JSON.stringify({ found: false })); return; }
    res.status(200).end(JSON.stringify({
      found: true,
      box: { x: bx.x, y: bx.y, w: bx.w, h: bx.h },
      newLine: spec.newLine.trim().slice(0, 200),
      color: /^#[0-9a-f]{6}$/i.test(String(spec.color)) ? spec.color : '#333333',
      fontKey: ['naskh', 'diwani', 'kufi', 'ruqaa', 'default'].indexOf(spec.fontKey) >= 0 ? spec.fontKey : 'naskh',
      bold: spec.bold === true,
    }));
  } catch (e) {
    res.status(500).end(JSON.stringify({ error: 'text-swap: ' + (e && e.message ? e.message : String(e)) }));
  }
};
