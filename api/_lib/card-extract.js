// «نموذج مرتب» — يقرأ بطاقة/نموذجًا مصوّرًا (بطاقة طالب، استمارة، شهادة…) ويعيد
// محتواه JSON منظّمًا (عنوان + صفوف تسمية/قيمة + مواضع الصورة الشخصية والرسومات)
// ليعيد العميل رسمه محليًّا بخط مرتب على كانفس — النص لا يمرّ على مولّد صور إطلاقًا،
// فلا يتشوّه حرف واحد. نفس حارس استهلاك Gemini النصّي.
const { checkAndConsume, clientIp } = require('./_usage');

const PROMPT = [
  'You read a photographed card/form (student info card, certificate, simple form).',
  'Return ONLY strict JSON, no markdown, exactly this shape:',
  '{"title":string|null,"rows":[{"label":string,"value":string}],',
  '"photoBox":{"x":number,"y":number,"w":number,"h":number}|null,',
  '"decorBoxes":[{"x":number,"y":number,"w":number,"h":number}],',
  '"theme":"pink"|"blue"|"green"|"purple"|"gold"|"neutral"}',
  'Rules:',
  '- rows: every label/value line of text on the card, in top-to-bottom order,',
  '  copied EXACTLY as written (same language, same spelling, same digits).',
  '  Split each line at its ":" into label (before) and value (after).',
  '  A line without ":" goes in as {"label":"","value":"<the line>"}.',
  '- title: only if the card has a distinct heading line; else null. Never invent one.',
  '- photoBox: bounding box of the person/child photo if present, else null.',
  '- decorBoxes: up to 2 boxes of decorative cartoon/mascot graphics (NOT the person photo,',
  '  NOT text). Empty array if none.',
  '- All boxes are fractions of image width/height, 0..1, x/y = top-left corner.',
  '- theme: the dominant decorative color family of the card.',
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
    if (imageBase64.length < 100) {
      res.status(400).end(JSON.stringify({ error: 'no image', message_ar: 'أرفق صورة النموذج أولًا.' }));
      return;
    }
    const usage = await checkAndConsume(b.token, b.guestId, 'gemini', clientIp(req));
    if (!usage.allowed) {
      res.status(429).end(JSON.stringify({ error: 'daily_limit_reached', message_ar: 'وصلت الحد اليومي، جرّب بكرة.' }));
      return;
    }
    const hint = String(b.hint || '').slice(0, 300);
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: PROMPT + (hint ? ('\nUser request (context only): "' + hint.replace(/["\n\r]/g, ' ') + '"') : '') },
          { inlineData: { mimeType: b.mimeType || 'image/jpeg', data: imageBase64 } },
        ] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
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
    if (!spec || !Array.isArray(spec.rows) || !spec.rows.length) {
      res.status(422).end(JSON.stringify({ error: 'no_rows', message_ar: 'ما قدرت أقرأ نصوص النموذج من الصورة — جرّب صورة أوضح.' }));
      return;
    }
    const frac = (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : null);
    const box = (o) => {
      if (!o) return null;
      const x = frac(o.x), y = frac(o.y), w = frac(o.w), h = frac(o.h);
      return (x != null && y != null && w != null && h != null && w > 0.02 && h > 0.02) ? { x, y, w, h } : null;
    };
    res.status(200).end(JSON.stringify({
      title: typeof spec.title === 'string' && spec.title.trim() ? spec.title.trim().slice(0, 80) : null,
      rows: spec.rows.slice(0, 14).map((r) => ({
        label: String(r && r.label || '').slice(0, 60),
        value: String(r && r.value || '').slice(0, 120),
      })).filter((r) => r.label || r.value),
      photoBox: box(spec.photoBox),
      decorBoxes: (Array.isArray(spec.decorBoxes) ? spec.decorBoxes : []).map(box).filter(Boolean).slice(0, 2),
      theme: ['pink', 'blue', 'green', 'purple', 'gold', 'neutral'].indexOf(spec.theme) >= 0 ? spec.theme : 'neutral',
    }));
  } catch (e) {
    res.status(500).end(JSON.stringify({ error: 'card-extract: ' + (e && e.message ? e.message : String(e)) }));
  }
};
