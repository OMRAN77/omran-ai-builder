'use strict';
/* v-merge-faces (المالك ٢٧ سبتمبر ٢٠٢٦: «في تحسن عند دمج الصور فيه تغير الملامح»).
   تاريخ الدمج قبل هذا الملفّ (maha-image): v-merge-faithful أبقى الحرارة المنخفضة، وv-merge-identity-lock v1→v3 نقل الهويّة
   إلى أوّل جملة وأقفل الشعر/الحجاب والتبرّج والإكسسوار والملابس (v2 أنهى تبدّل الشخص كلّه، v3 أنهى الحجاب المضاف). بقي
   انحراف الملامح نفسها — وحدّ v2 نفسه قال: بعد الصياغة ابحث في التنفيذ (الترتيب والحجم والصيغة) لا صياغة ثالثة. الجذور:
   ١) الموديل يرى كلّ صورة مرجعيّة بميزانيّة ثابتة من الرموز (جيل Gemini 3) مهما كبرت، فوجه يشغل جزءًا صغيرًا من الصورة يُرى
      خشنًا فيُعاد رسم ملامحه تقريبًا. الحلّ العمليّ (دليل OpenAI للأمانة العالية، ونمط مراجع جوجل): لقطة مقرّبة لكلّ وجه
      مرجعًا إضافيًّا للهويّة — نقصّها هنا من الصورة الأصليّة بدقّتها بعد كشف صناديق الوجوه (Gemini Flash، كما text-design).
   ٢) الصور بلا عناوين وبترتيب معكوس (الأخيرة رفعًا أوّلًا): التوثيق الرسميّ للطرفين يطلب ترقيم كلّ مرجع ودوره. صارت
      «Photo 1…N» بترتيب رفع المستخدم، وكلّ لقطة «Close-up k — the face of … in Photo i»، والأمر الكامل آخرًا (كأمثلة جوجل)
      فيستلمه GPT نفسه مع الصور بالترتيب نفسه.
   ٣) كلمات عاديّة تُخرج الدمج من الحرارة المنخفضة («واقعية/أجمل/احترافية/فخم») — mergeTemperature.
   ٤) لا نسبة أبعاد للدمج فتتبع آخر صورة مرفقة (قد تصير لقطة الوجه) — mergeAspect صريحة من الصورة الأساسيّة.
   حدود: برو يحفظ هويّة ٥ صور بشر كحدّ أعلى فاللقطات ضمن ٥ مع الصور. MERGE_FACE_CROPS=off يوقف اللقطات بلا نشر.
   مراجعة الخصومة (قبل النشر): الفكّ عبر decodeImage بسقف ٢٠ ميغابكسل ثمّ نسخة عمل ≤٢٠٤٨ فورًا (صورة ٤٨MP خام من أنماط
   الصور كانت تبلغ ٢ غيغا ذاكرة)، ودوران EXIF يُطبَّق لا يُتخطّى (الصورة الثانية في الاستوديو وأنماط الصور تصل خامًا من
   الكاميرا)، والموضع يُسمّى بين الوجوه المقصوصة وحدها، ولقطة وجه في صورة زوجين تقف عند منتصف المسافة إلى الوجه الآخر.
   لا يرمي أبدًا: عطب الكشف أو الفكّ = الدمج بالصور وعناوينها فقط كما كان. */
const { resample, encodeJpeg } = require('./face-composite');
const { imageSize, jpegOrientation } = require('./face-lock');
const { decodeImage } = require('./image-diff');

const DETECT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=';
const MAX_HUMAN_REFS = 5;
const CROP_MAX = 768;
const DETECT_MAX = 1024;
const WORK_MAX = 2048;

function sniffMime(b64) {
  const head = Buffer.from(String(b64 || '').slice(0, 24), 'base64');
  if (head[0] === 0xFF && head[1] === 0xD8) return 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50) return 'image/png';
  if (head.toString('ascii', 0, 4) === 'RIFF') return 'image/webp';
  return 'image/jpeg';
}

/* تصغير بمتوسّط المساحة (لا ثنائيّ الخطّية) — صورة كاميرا ٦٠٠٠ بكسل إلى ٢٠٤٨ بلا تسنّن في ملامح الوجه */
function shrinkTo(img, max) {
  const m = Math.max(img.w, img.h);
  if (m <= max) return img;
  const W = Math.max(1, Math.round(img.w * max / m)), H = Math.max(1, Math.round(img.h * max / m));
  if (img.w / W < 1.5) return resample(img, W, H);
  const out = Buffer.alloc(W * H * 4), sx = img.w / W, sy = img.h / H, d = img.data;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * img.w + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; c++; }
      const o = (y * W + x) * 4; out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c; out[o + 3] = 255;
    }
  }
  return { w: W, h: H, data: out };
}

/* اتّجاه EXIF ٢–٨ على بكسلات RGBA كما يعرضها الهاتف */
function orient(img, o) {
  if (!o || o === 1 || o > 8) return img;
  const w = img.w, h = img.h, W = o >= 5 ? h : w, H = o >= 5 ? w : h, d = img.data;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = o === 2 || o === 3 ? w - 1 - x : o === 4 ? x : o === 5 || o === 8 ? y : h - 1 - y;
    const ny = o === 2 ? y : o === 3 || o === 4 ? h - 1 - y : o === 5 || o === 6 ? x : w - 1 - x;
    const s = (y * w + x) * 4, t = (ny * W + nx) * 4;
    out[t] = d[s]; out[t + 1] = d[s + 1]; out[t + 2] = d[s + 2]; out[t + 3] = d[s + 3];
  }
  return { w: W, h: H, data: out };
}

/* نسخة عمل مستقيمة ≤٢٠٤٨: الأصل الكامل يُترك للذاكرة فور التصغير (الفكّ متزامن، فلا يعيش أكثر من أصل واحد) */
function decodeWork(b64) {
  const buf = Buffer.from(String(b64 || ''), 'base64');
  const full = decodeImage(buf); /* ≤٢٠ ميغابكسل و٥١٢ ميغا؛ أكبر = بلا لقطة */
  if (!full) return null;
  let o = 1;
  try { if (buf[0] === 0xFF && buf[1] === 0xD8) o = jpegOrientation(buf) || 1; } catch (e) { o = 1; } /* guard-ok — بلا اتّجاه = كما خُزّنت */
  return orient(shrinkTo(full, WORK_MAX), o);
}

function crop(img, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x1) * 4), y * w * 4);
  return { w, h, data: out };
}

/* كلّ الوجوه في صورة واحدة: [{ box:[x0,y0,x1,y1] نسبيّ }] — نسخة مصغّرة تكفي للكشف وأسرع رفعًا */
async function detectFaces(apiKey, img, opts) {
  const o = opts || {};
  const small = shrinkTo(img, DETECT_MAX);
  const r = await (o.fetchImpl || fetch)(DETECT_URL + apiKey, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(o.timeoutMs || 15000),
    body: JSON.stringify({
      contents: [{ parts: [
        { inlineData: { mimeType: 'image/jpeg', data: Buffer.from(encodeJpeg(small, 85)).toString('base64') } },
        { text: 'Find every human face in this photo. For each face return box_2d [ymin, xmin, ymax, xmax] normalized to 0-1000, from the hairline/forehead to the chin and ear to ear. Return JSON {"faces": [{"box_2d": [...]}]} only; an empty list if there are no people.' },
      ] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', required: ['faces'], properties: { faces: { type: 'ARRAY', items: { type: 'OBJECT', required: ['box_2d'], properties: { box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } } } } } } } },
    }),
  });
  if (!r.ok) return [];
  const d = await r.json().catch(() => null);
  const txt = ((((d && d.candidates) || [])[0] || {}).content || {}).parts || [];
  const s = txt.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const faces = (JSON.parse(s || '{}').faces || []);
  const boxes = faces.map((f) => {
    const b = Array.isArray(f && f.box_2d) ? f.box_2d.map(Number) : null;
    if (!b || b.length !== 4 || b.some((v) => !Number.isFinite(v))) return null;
    const c = (v) => Math.max(0, Math.min(1, v / 1000));
    const box = [c(b[1]), c(b[0]), c(b[3]), c(b[2])];
    return box[2] > box[0] && box[3] > box[1] ? { box } : null;
  }).filter(Boolean).sort((a, b) => area(b.box) - area(a.box));
  /* صندوق مكرّر للوجه نفسه (تقاطع > ٥٠٪) يُسقط */
  return boxes.filter((f, i) => !boxes.slice(0, i).some((g) => iou(f.box, g.box) > 0.5)).slice(0, 12);
}
function area(b) { return (b[2] - b[0]) * (b[3] - b[1]); }
function iou(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  const i = w > 0 && h > 0 ? w * h : 0;
  return i / (area(a) + area(b) - i);
}

/* مستطيل ١٫٥× الوجه (أعلى قليلًا لمنبت الشعر/الحجاب) داخل الصورة. أوسع يُدخل وجه الجار فتلتبس اللقطة: مع وجه آخر في
   الصورة يقف القصّ عند منتصف المسافة بينهما، ووجهان متداخلان = بلا لقطة (null). الشعر والملابس كاملة في الصورة نفسها. */
function headRect(img, box, other) {
  const fw = (box[2] - box[0]) * img.w, fh = (box[3] - box[1]) * img.h;
  const cx = (box[0] + box[2]) / 2 * img.w, cy = ((box[1] + box[3]) / 2 - 0.08 * (box[3] - box[1])) * img.h;
  const side = Math.min(img.w, img.h, Math.round(Math.max(fw, fh) * 1.5));
  let x0 = Math.max(0, Math.min(img.w - side, cx - side / 2)), y0 = Math.max(0, Math.min(img.h - side, cy - side / 2));
  let x1 = x0 + side, y1 = y0 + side;
  if (other) {
    const [ax0, ay0, ax1, ay1] = [box[0] * img.w, box[1] * img.h, box[2] * img.w, box[3] * img.h];
    const [bx0, by0, bx1, by1] = [other[0] * img.w, other[1] * img.h, other[2] * img.w, other[3] * img.h];
    if (bx0 >= ax1) x1 = Math.min(x1, (ax1 + bx0) / 2);
    else if (bx1 <= ax0) x0 = Math.max(x0, (bx1 + ax0) / 2);
    else if (by0 >= ay1) y1 = Math.min(y1, (ay1 + by0) / 2);
    else if (by1 <= ay0) y0 = Math.max(y0, (by1 + ay0) / 2);
    else return null;
  }
  return { x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1), fh };
}

/* الموضع بين الوجوه المقصوصة وحدها (≤ ٢) — لا بين المارّة الصغار في الخلفيّة */
function whereIn(f, main) {
  if (main.length < 2) return 'the person';
  const o = main[0] === f ? main[1] : main[0];
  const dx = (f.box[0] + f.box[2]) - (o.box[0] + o.box[2]), dy = (f.box[1] + f.box[3]) - (o.box[1] + o.box[3]);
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'the person on the left' : 'the person on the right';
  return dy < 0 ? 'the upper person' : 'the lower person';
}

/* photos: [{ data, mime }] بترتيب رفع المستخدم → [{ of, who, data, mime }] لقطات وجوه، أكبرها في كلّ صورة أوّلًا */
async function faceCrops(apiKey, photos, opts) {
  const o = opts || {};
  if (!apiKey || String(process.env.MERGE_FACE_CROPS || 'on').toLowerCase() === 'off') return [];
  const budget = Math.min(4, MAX_HUMAN_REFS - photos.length);
  if (budget <= 0) return [];
  const per = await Promise.all(photos.map(async (p, i) => {
    try {
      const img = decodeWork(p.data);
      if (!img) return [];
      const faces = await detectFaces(apiKey, img, o);
      const biggest = Math.max(0, ...faces.map((f) => f.box[3] - f.box[1]));
      const main = faces.filter((f) => f.box[3] - f.box[1] >= biggest * 0.5);
      /* صورة جماعيّة (٣ وجوه فأكثر): لقطة أيّ وجه تُدخل وجوه جيرانه فتلتبس — تبقى الصورة وحدها مرجعًا */
      if (main.length > 2) return [];
      /* القصّ هنا من نسخة العمل (صغيرة) — لا تُحفظ صور كاملة حتّى نهاية كلّ الصور */
      return main.map((f) => {
        const r = headRect(img, f.box, main.length === 2 ? (main[0] === f ? main[1] : main[0]).box : null);
        /* وجه يملأ الصورة أصلًا = الموديل يراه جيّدًا؛ وجه أصغر من ٣٢ بكسل = لا تفاصيل تُنقذ */
        if (!r || r.fh >= img.h * 0.45 || r.fh < 32 || r.x1 - r.x0 < 48 || r.y1 - r.y0 < 48) return null;
        const c = shrinkTo(crop(img, r.x0, r.y0, r.x1, r.y1), CROP_MAX);
        return { of: i, who: whereIn(f, main), size: f.box[3] - f.box[1], data: Buffer.from(encodeJpeg(c, 92)).toString('base64'), mime: 'image/jpeg' };
      }).filter(Boolean);
    } catch (e) { console.error('[merge-identity] faces ' + (i + 1) + ': ' + (e && e.message ? e.message : e)); return []; }
  }));
  /* بالتناوب بين الصور (وجه كلّ صورة الأكبر أوّلًا) حتّى تنفد الحصّة */
  const picked = [];
  for (let round = 0; picked.length < budget && per.some((l) => l.length > round); round++) {
    per.forEach((l) => { if (l[round] && picked.length < budget) picked.push(l[round]); });
  }
  return picked.map((c) => ({ of: c.of, who: c.who, data: c.data, mime: c.mime }));
}

function closeupLine(c, k) {
  return 'Close-up ' + (k + 1) + ' = the face of ' + c.who + ' in Photo ' + (c.of + 1);
}

/* الأمر الكامل (آخر جزء نصّيّ — يستلمه GPT كما هو مع الصور بالترتيب نفسه). يحفظ صياغة v3 حرفيًّا */
function mergeInstruction(n, crops, task) {
  const cs = crops || [];
  return 'You are given ' + (n + cs.length) + ' separate reference images, attached in this exact order: Photo 1' + (n > 1 ? ' to Photo ' + n : '') + ' (the user\'s own photos)' +
    (cs.length ? ', then ' + cs.length + ' face close-up' + (cs.length > 1 ? 's' : '') + ' cropped from those same photos (' + cs.map(closeupLine).join('; ') + '). A close-up is the SAME person as in its photo, zoomed in only so you can copy the face precisely' : '') + '.\n' +
    'For any reference image that shows a real human face, that exact person\'s full appearance — face shape, features, skin tone, hair (loose or covered by a hijab/headscarf exactly as photographed; never add, remove, or restyle a head covering), makeup, jewelry, and clothing — MUST be reproduced with full fidelity in the output, precisely as photographed in that image: never invented, never averaged or blended with another person\'s face or style, never swapped onto the wrong body, never restyled to a different look. ' +
    (cs.length ? 'Copy each face from its close-up: the same eyes, eyebrows, nose, lips, jawline, facial hair, skin marks, apparent age and expression lines. ' : '') +
    'This holds even when the task changes their pose, camera angle, or places them together in a brand-new shared scene — only the scene, pose and angle change; who each person is and exactly how they look never changes. The same fidelity rule applies to any logo or exact text in a reference image.\n\n' +
    'TASK: "' + String(task || '').trim() + '"\n\n' +
    'Now combine every reference photo into ONE single, cohesive, photorealistic result following that task exactly:\n' +
    '1. Every reference photo\'s subject MUST appear in the final result - never drop one' + (cs.length ? ', and never add a close-up as another person' : '') + '.\n' +
    '2. Arrange them exactly as the task asks (e.g. the people from the separate reference photos placed together, naturally, in one new shared scene; or a logo/text laid out with other elements). When the task says "the first/second photo", it means Photo 1/Photo 2.\n' +
    '3. Any Arabic text must remain correct and readable.\n' +
    'Output a single finished image only.';
}

/* أجزاء Gemini: كلّ صورة بعنوانها قبلها مباشرة، ثمّ اللقطات بعناوينها، ثمّ الأمر الكامل */
function mergeParts(photos, crops, task) {
  const n = photos.length, parts = [];
  photos.forEach((p, i) => {
    parts.push({ text: 'Photo ' + (i + 1) + ' of ' + n + ':' });
    parts.push({ inlineData: { mimeType: p.mime || sniffMime(p.data), data: p.data } });
  });
  (crops || []).forEach((c, k) => {
    parts.push({ text: 'Close-up ' + (k + 1) + ' — the face of ' + c.who + ' in Photo ' + (c.of + 1) + ' (the same person, zoomed in; identity reference only, not an extra person):' });
    parts.push({ inlineData: { mimeType: c.mime, data: c.data } });
  });
  parts.push({ text: mergeInstruction(n, crops, task) });
  return parts;
}

/* الدمج ينقل أشخاصًا حقيقيّين: حرارة منخفضة دائمًا. «واقعي/أجمل/احترافي/فخم» ليست تحويل أسلوب للوجوه؛ أسلوب فنّيّ صريح
   (كرتون/أنمي/لوحة…) يأخذ حرارة الأسلوب نفسها (0.6) لا حرارة جوجل الافتراضيّة (1.0) التي تعيد تخيّل الوجوه. */
function mergeTemperature(isRestyle, text) {
  return isRestyle && !/واقعي|realistic|photo-?real|حقيقي/i.test(String(text || '')) ? 0.6 : 0.15;
}

const RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
function nearestRatio(w, h) {
  const r = Math.log(w / h);
  return RATIOS.reduce((best, x) => { const [a, b] = x.split(':').map(Number); const [c, d] = best.split(':').map(Number); return Math.abs(Math.log(a / b) - r) < Math.abs(Math.log(c / d) - r) ? x : best; }, '1:1');
}
/* نسبة صريحة للدمج: كلمة المستخدم أوّلًا (عرضي/مربع/ستوري/طولي/خلفية جوال/نسبة رقميّة)، وإلّا أقرب نسبة مدعومة للصورة
   الأساسيّة (آخر ما رفعه المستخدم) — كي لا يتبع الناتج لقطة الوجه الأخيرة. لا «شعار = مربّع» هنا: دمج شعار مع صورة ليس توليد شعار. */
function mergeAspect(photo, text) {
  const s = String(text || '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660));
  const m = /(?:^|[^\d])(\d{1,2})\s*[:x×\/]\s*(\d{1,2})(?!\d)/.exec(s);
  if (m && +m[1] > 0 && +m[2] > 0 && +m[1] / +m[2] <= 4 && +m[2] / +m[1] <= 4) return nearestRatio(+m[1], +m[2]);
  if (/ستوري|استوري|خلفي[ةه]\s*(?:جوال|هاتف|موبايل)|wallpaper|story|ريلز|reels|تيك\s*توك|tiktok|شورتس|shorts/i.test(s)) return '9:16';
  if (/عرضي|عرضيه|عرضية|بانر|بنر|غلاف\s*(?:يوتيوب|قناة|فيس)|landscape|banner|widescreen/i.test(s)) return '16:9';
  if (/مربع|مربعه|مربعة|square|بوست\s*انستقرام|instagram\s*post|بروفايل|profile\s*(?:pic|photo)/i.test(s)) return '1:1';
  if (/طولي|طوليه|طولية|عمودي|عموديه|عمودية|portrait|vertical/i.test(s)) return '3:4';
  let d = null;
  try { const buf = Buffer.from(String(photo && photo.data || ''), 'base64'); d = imageSize(buf); if (d && d.type === 'jpeg' && (jpegOrientation(buf) || 1) >= 5) d = { w: d.h, h: d.w }; } catch (e) { d = null; } /* guard-ok — بلا أبعاد = الافتراضيّ */
  return d && d.w && d.h ? nearestRatio(d.w, d.h) : '3:4';
}

module.exports = { faceCrops, detectFaces, mergeParts, mergeInstruction, mergeTemperature, mergeAspect, headRect, whereIn, orient, sniffMime, MAX_HUMAN_REFS };
