// «طوابع المدرسة» — ورقة طوابع/ملصقات قابلة للطباعة والقص عبر OpenAI (gpt-image-2).
// يأخذ صورة الطفل + اسمه ويعيد ورقة كاملة فيها طوابع صغيرة كثيرة بأشكال جميلة.
// نفس حرّاس adimage.js: هويّة مُتحقَّقة ثم سقف يومي، وsignal خاص يتخطى حارس الـ٣٠ ثانية.
const { checkAndConsumeCustom } = require('./_usage.js');
const { verifyPointsToken } = require('./points.js');

const DAILY = 8;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.status(405).end('{"error":"POST only"}'); return; }
  try {
    let b = req.body;
    if (typeof b === 'string') b = JSON.parse(b);
    b = b || {};

    const username = verifyPointsToken(typeof b.token === 'string' ? b.token : '');
    if (!username) {
      res.status(401).end(JSON.stringify({ error: 'auth', message_ar: 'سجّل الدخول أوّلًا لتوليد الطوابع.' }));
      return;
    }
    const key = process.env.OPENAI_API_KEY;
    if (!key) { res.status(500).end(JSON.stringify({ error: 'no key' })); return; }

    const cut = (x, n) => String(x == null ? '' : x).slice(0, n).replace(/["\n\r]/g, ' ').trim();
    const name = cut(b.name, 30);
    const hasImg = typeof b.imageBase64 === 'string' && b.imageBase64.length > 100;
    if (!hasImg) {
      res.status(400).end(JSON.stringify({ error: 'no image', message_ar: 'أرفق صورة الطفل أولاً عشان أسوي الطوابع.' }));
      return;
    }

    // الخصم من الحد اليومي بعد اكتمال كل التحققات — طلب ناقص ما يحرق محاولة
    const gate = await checkAndConsumeCustom(b.token, null, null, 'adimage', DAILY);
    if (!gate.allowed) {
      res.status(429).end(JSON.stringify({ error: 'limit', message_ar: 'بلغتَ حدّ اليوم (' + DAILY + ' صور). جرّب غدًا.' }));
      return;
    }

    let p = 'A printable sticker/stamp sheet for a school kid, vertical portrait page on a clean WHITE background, designed for home printing and scissor cutting.\n'
      + 'The provided image is the child\'s REAL photo. STRICT RULE: the face must stay EXACTLY as photographed — same face, same features, same skin tone, same hair. Do NOT beautify, restyle, cartoonize or replace the face. You may neatly crop it into each sticker frame.\n'
      + 'Layout: a tidy grid of 12 small stickers (4 rows x 3 columns), evenly spaced with generous white gaps and a thin light-grey dashed cut line around every sticker.\n'
      + 'Every sticker features the child\'s photo inside a different cute frame shape: circle, heart, star, cloud, hexagon, flower, shield/badge, rounded square, oval, ribbon rosette, pencil-shaped frame, open-book-shaped frame.\n'
      + 'Frames use cheerful kid-friendly pastel colours (soft blue, mint, peach, lilac, sunny yellow) with tiny playful doodles (stars, sparkles, pencils, books) around the frames — never covering the face.\n'
      + (name
        ? 'Under the photo inside EVERY sticker: a small neat label with the name "' + name + '" in clear bold Arabic-friendly lettering. CRITICAL TEXT ACCURACY: reproduce the name letter-for-letter EXACTLY as written — never misspell, never invent extra words.\n'
        : 'Do NOT write any name or any text inside the stickers — photo and frame only.\n')
      + 'No other text anywhere, no watermark, no logo, no invented letters. Clean, bright, printable, joyful school-stickers style.';

    const body = {
      model: 'gpt-image-2',
      prompt: p,
      size: '1024x1536',
      quality: 'medium',
      n: 1,
      output_format: 'webp',
      output_compression: 82,
    };
    const form = new FormData();
    for (const k of Object.keys(body)) form.append(k, String(body[k]));
    const mime = /^image\/(png|jpeg|webp)$/.test(String(b.mimeType || '')) ? b.mimeType : 'image/jpeg';
    form.append('image[]', new Blob([Buffer.from(b.imageBase64, 'base64')], { type: mime }), 'photo.' + mime.split('/')[1]);

    const init = { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form };
    init.signal = AbortSignal.timeout(240000);
    const upstream = await fetch('https://api.openai.com/v1/images/edits', init);

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const m = (data && data.error && data.error.message) || ('HTTP ' + upstream.status);
      res.status(upstream.status).end(JSON.stringify({ error: 'upstream', message_ar: 'تعذّر توليد الطوابع: ' + m }));
      return;
    }
    const out = ((data && data.data) || [])[0];
    if (!out || !out.b64_json) {
      res.status(502).end(JSON.stringify({ error: 'empty', message_ar: 'لم يرجع النموذج صورة. جرّب مرّة أخرى.' }));
      return;
    }
    res.status(200).end(JSON.stringify({ imageBase64: out.b64_json, mimeType: 'image/webp', dailyLimit: DAILY }));
  } catch (e) {
    const msg = e && e.name === 'TimeoutError' ? 'استغرق التوليد وقتًا أطول من المسموح. جرّب مرّة أخرى.' : (e && e.message ? e.message : String(e));
    res.status(500).end(JSON.stringify({ error: 'proxy', message_ar: msg }));
  }
};
