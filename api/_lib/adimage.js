// «استوديو الإعلانات» — توليد الإعلان صورةً كاملة عبر OpenAI (gpt-image-2).
// يأخذ صورة المستخدم + بيانات إعلانه ويعيد ملصقًا عموديًّا ٩:١٦ مُولَّدًا بالكامل
// (مشهد + إضاءة + قصّ الشخص + كتابة عربيّة داخل الصورة) — لا HTML فوق صورة.
// حارسان قبل أي مفتاح: هويّة مُتحقَّقة (لا ضيوف) ثمّ سقف يوميّ منفصل عن المحادثة.
// ⚠️ فخّ مُثبت: حارس _fetch-timeout.js يقطع كلّ fetch عند ٣٠ ثانية، وتوليد الصورة
//    يستغرق ٦٠–١٥٠ ثانية. لذلك نمرّر signal خاصًّا بنا — الحارس يترك من يمرّر signal.
const { checkAndConsumeCustom } = require('./_usage.js');
const { verifyPointsToken } = require('./points.js');

const LANGN = { ar:'العربيّة', en:'English', fr:'French', hi:'Hindi', ur:'Urdu', bn:'Bengali', ml:'Malayalam', ne:'Nepali', fil:'Filipino', id:'Indonesian', zh:'Chinese (Simplified)', ru:'Russian', tr:'Turkish', es:'Spanish' };
const pickLang = (b) => { const l = String((b && b.lang) || 'ar').slice(0, 3); return LANGN[l] ? l : 'ar'; };

const DAILY = 8; // صورة/يوم للمستخدم المسجَّل (المالك وVIP معفيان داخل الدالّة)

const LOOKS = {
  cinema:   'cinematic dusk scene, dramatic side light, shallow depth of field, subtle film grain',
  layers:   'modern layered collage composition, bold geometric shapes behind the subject',
  poster:   'graphic print-poster look, flat strong colours, crisp high-contrast shapes',
  elegant:  'calm elegant scene, soft diffused light, generous negative space, refined mood',
  bold:     'high-energy scene, strong coloured spotlights, deep shadows, sharp contrast',
  luxe:     'luxurious dark scene, warm golden rim light, glossy reflective surfaces',
  minimal:  'minimal clean studio backdrop, soft gradient, gentle floor reflection',
  magazine: 'editorial magazine cover styling, refined layout, premium fashion lighting',
  neon:     'dramatic night scene, glowing neon rim light, wet reflective asphalt, volumetric haze, light streaks',
};

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.status(405).end('{"error":"POST only"}'); return; }
  try {
    let b = req.body;
    if (typeof b === 'string') b = JSON.parse(b);
    b = b || {};

    // ① الهويّة قبل المفتاح.
    const lg = pickLang(b);
    const username = verifyPointsToken(typeof b.token === 'string' ? b.token : '');
    if (!username) {
      res.status(401).end(JSON.stringify({ error: 'auth', message_ar: 'سجّل الدخول أوّلًا لتوليد الإعلان صورةً.',
        message: lg === 'ar' ? undefined : 'Sign in first to generate the ad as an image.' }));
      return;
    }
    // ② سقف يوميّ مستقلّ — الصورة أغلى من الرسالة.
    const gate = await checkAndConsumeCustom(b.token, null, null, 'adimage', DAILY);
    if (!gate.allowed) {
      res.status(429).end(JSON.stringify({ error: 'limit', message_ar: 'بلغتَ حدّ اليوم (' + DAILY + ' صور) لتوليد الإعلانات. جرّب غدًا.' }));
      return;
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) { res.status(500).end(JSON.stringify({ error: 'no key' })); return; }

    const cut = (x, n) => String(x == null ? '' : x).slice(0, n).replace(/["\n\r]/g, ' ').trim();
    const look = LOOKS[b.look] || LOOKS.neon;
    const title = cut(b.title, 60), spec = cut(b.spec, 120), kick = cut(b.kick, 40);
    const price = cut(b.price, 30), unit = cut(b.unit, 20), tel = cut(b.tel, 30);
    const note = cut(b.note, 40), foot = cut(b.foot, 50);
    const chips = Array.isArray(b.chips) ? b.chips.slice(0, 4).map(c => cut(c, 40)).filter(Boolean) : [];
    const accent = /^#[0-9a-fA-F]{6}$/.test(String(b.ac || '')) ? String(b.ac) : '#a855f7';
    const hasImg = typeof b.imageBase64 === 'string' && b.imageBase64.length > 100;

    const RK = ['square','tall','wide'].includes(b.ratio) ? b.ratio : 'tall';
    const ORI = { square: 'square 1:1', tall: 'vertical 2:3 story', wide: 'horizontal 3:2 landscape' };
    let p = 'Create ONE high-end ' + ORI[RK] + ' advertising poster, photorealistic, professionally art-directed.\n';
    if (hasImg) {
      p += 'Use the subject in the provided photo as the hero of the poster: cut it out cleanly and place it inside a NEW scene. '
         + 'Keep the face, body and clothing recognisable and unchanged — do not restyle the person.\n';
    }
    // العيب: كان يأمر المولّد برسم «نصّ عربيّ من اليمين لليسار» حتّى لو كان النصّ صينيًّا.
    const SCRIPTN = { ar: 'ARABIC', en: 'ENGLISH', fr: 'FRENCH', hi: 'HINDI (Devanagari script)', ur: 'URDU (Nastaliq script)',
      bn: 'BENGALI script', ml: 'MALAYALAM script', ne: 'NEPALI (Devanagari script)', fil: 'FILIPINO', id: 'INDONESIAN',
      zh: 'SIMPLIFIED CHINESE', ru: 'RUSSIAN (Cyrillic script)', tr: 'TURKISH', es: 'SPANISH' };
    const rtl = (lg === 'ar' || lg === 'ur');
    p += 'Scene and mood: ' + look + '. Accent/glow colour: ' + accent + '.\n'
       + 'Render the following ' + (SCRIPTN[lg] || 'ENGLISH') + ' text INSIDE the poster, spelled EXACTLY as written, '
       + (rtl ? 'right-to-left, with correct letter joining and diacritic-free modern bold typography'
              : 'left-to-right, with clean modern bold typography') + ':\n';
    if (kick)  p += '- At the very top: "' + kick + '" written in large luxurious 3D metallic-gold calligraphy with a soft golden glow\n';
    if (title) p += '- Main headline below it, very large bold white letters with a subtle glow: "' + title + '"\n';
    if (spec)  p += '- One elegant gold sub-line under the headline: "' + spec + '"\n';
    if (chips.length) {
      p += '- A single horizontal row of ' + chips.length + ' small rounded rectangular info cards under the headline, each with a thin gold border on dark glass background, a tiny gold line icon on one side, gold label on top and white value below. The cards read exactly: '
         + chips.map(c => '"' + c + '"').join(', ') + '\n';
    }
    if (price) p += '- Near the bottom: a wide hexagonal gold-outlined price plaque with very large glowing gold numerals: "' + price + (unit ? ' ' + unit : '') + '"' + (note ? ' and a small white line under the number inside the plaque: "' + note + '"' : '') + '\n';
    if (tel)   p += '- Below the price: a dark pill-shaped contact button with thin gold border, a small phone handset icon, and the number in bright teal digits: "' + tel + '"\n';
    if (foot)  p += '- Very small white footer line at the very bottom: "' + foot + '"\n';
    p += 'The hero subject sits in the middle of the poster between the info cards and the price plaque, photorealistic, lit by warm golden street light, on wet reflective ground at night. '
       + 'Do not add any other text, no watermark, no logo, no invented or misspelled letters. '
       + 'Composition must be clean, balanced, symmetric and ready to publish — premium classifieds-ad style, black and gold.';

    const SIZES = { square: '1024x1024', tall: '1024x1536', wide: '1536x1024' };
    // ⚠️ فخّان مقيسان حيًّا (٩ أغسطس ٢٠٢٦):
    //   ١) /v1/images/generations يرفض multipart/form-data ويردّ 400 فورًا —
    //      كلّ إعلان بلا صورة مستخدم كان يفشل قبل أن يبدأ. JSON للتوليد، multipart للتعديل.
    //   ٢) gpt-image-2 لا يدعم input_fidelity (400 صريح) — حُذف.
    // وwebp/82 بدل png: 3.13MB → 0.23MB base64 (١٤×) — يبقى تحت سقف Vercel ٤٫٥MB.
    const body = {
      model: 'gpt-image-2',
      prompt: p,
      size: SIZES[RK],
      quality: 'high',
      n: 1,
      output_format: 'webp',
      output_compression: 82,
    };

    let url, init;
    if (hasImg) {
      const mime = /^image\/(png|jpeg|webp)$/.test(String(b.mimeType || '')) ? b.mimeType : 'image/jpeg';
      const form = new FormData();
      for (const k of Object.keys(body)) form.append(k, String(body[k]));
      form.append('image', new Blob([Buffer.from(b.imageBase64, 'base64')], { type: mime }), 'photo.' + mime.split('/')[1]);
      url = 'https://api.openai.com/v1/images/edits';
      init = { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form };
    } else {
      url = 'https://api.openai.com/v1/images/generations';
      init = { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    }
    init.signal = AbortSignal.timeout(240000); // يتخطّى حارس الـ٣٠ ثانية عمدًا
    const upstream = await fetch(url, init);

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const m = (data && data.error && data.error.message) || ('HTTP ' + upstream.status);
      res.status(upstream.status).end(JSON.stringify({ error: 'upstream', message_ar: 'تعذّر توليد الإعلان: ' + m }));
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
