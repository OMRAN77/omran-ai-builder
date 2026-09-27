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
   لا يرمي أبدًا: عطب الكشف أو الفكّ = الدمج بالصور وعناوينها فقط كما كان. */
const { decode, resample, encodeJpeg } = require('./face-composite');
const { imageSize, jpegOrientation } = require('./face-lock');

const DETECT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=';
const MAX_HUMAN_REFS = 5;
const CROP_MAX = 768;
const DETECT_MAX = 1024;

function sniffMime(b64) {
  const head = Buffer.from(String(b64 || '').slice(0, 24), 'base64');
  if (head[0] === 0xFF && head[1] === 0xD8) return 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50) return 'image/png';
  if (head.toString('ascii', 0, 4) === 'RIFF') return 'image/webp';
  return 'image/jpeg';
}

/* صورة مفكوكة بلا دوران EXIF — دوران غير ١ يُتخطّى (القصّ سيخرج مائلًا عن الصورة التي يراها الموديل) */
function decodeUpright(b64) {
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf[0] === 0xFF && buf[1] === 0xD8 && (jpegOrientation(buf) || 1) !== 1) return null;
    return decode(buf);
  } catch (e) { return null; } /* guard-ok — صورة لا تُفكّ = بلا لقطة لها */
}

function crop(img, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x1) * 4), y * w * 4);
  return { w, h, data: out };
}

function shrinkTo(img, max) {
  const m = Math.max(img.w, img.h);
  return m > max ? resample(img, Math.max(1, Math.round(img.w * max / m)), Math.max(1, Math.round(img.h * max / m))) : img;
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
  return faces.map((f) => {
    const b = Array.isArray(f && f.box_2d) ? f.box_2d.map(Number) : null;
    if (!b || b.length !== 4 || b.some((v) => !Number.isFinite(v))) return null;
    const c = (v) => Math.max(0, Math.min(1, v / 1000));
    const box = [c(b[1]), c(b[0]), c(b[3]), c(b[2])];
    return box[2] > box[0] && box[3] > box[1] ? { box } : null;
  }).filter(Boolean).slice(0, 12);
}

/* مربّع حول الوجه بهامش ٥٠٪ (أعلى قليلًا لمنبت الشعر/الحجاب) داخل الصورة — أوسع من ذلك يُدخل وجه الجار في الصورة
   الجماعيّة فتلتبس اللقطة؛ الشعر والملابس كاملة تبقى في الصورة الأصليّة نفسها */
function headRect(img, box) {
  const fw = (box[2] - box[0]) * img.w, fh = (box[3] - box[1]) * img.h;
  const cx = (box[0] + box[2]) / 2 * img.w, cy = ((box[1] + box[3]) / 2 - 0.08 * (box[3] - box[1])) * img.h;
  const side = Math.min(img.w, img.h, Math.round(Math.max(fw, fh) * 1.5));
  const x0 = Math.round(Math.max(0, Math.min(img.w - side, cx - side / 2))), y0 = Math.round(Math.max(0, Math.min(img.h - side, cy - side / 2)));
  return { x0, y0, x1: x0 + side, y1: y0 + side, fh };
}

function whereIn(box, all) {
  if (all.length < 2) return 'the person';
  const cx = (box[0] + box[2]) / 2;
  const xs = all.map((f) => (f.box[0] + f.box[2]) / 2).sort((a, b) => a - b);
  const i = xs.indexOf(cx);
  if (i === 0) return 'the person on the left';
  if (i === xs.length - 1) return 'the person on the right';
  return xs.length === 3 ? 'the person in the middle' : 'the ' + ['', '2nd', '3rd', '4th', '5th', '6th'][i] + ' person from the left';
}

/* photos: [{ data, mime }] بترتيب رفع المستخدم → [{ of, who, data, mime }] لقطات وجوه، أكبرها في كلّ صورة أوّلًا */
async function faceCrops(apiKey, photos, opts) {
  const o = opts || {};
  if (!apiKey || String(process.env.MERGE_FACE_CROPS || 'on').toLowerCase() === 'off') return [];
  const budget = Math.min(4, MAX_HUMAN_REFS - photos.length);
  if (budget <= 0) return [];
  const per = await Promise.all(photos.map(async (p, i) => {
    try {
      const img = decodeUpright(p.data);
      if (!img) return [];
      const faces = await detectFaces(apiKey, img, o);
      const biggest = Math.max(0, ...faces.map((f) => f.box[3] - f.box[1]));
      const main = faces.filter((f) => f.box[3] - f.box[1] >= biggest * 0.5);
      /* صورة جماعيّة (٣ وجوه فأكثر): لقطة أيّ وجه تُدخل وجوه جيرانه فتلتبس — تبقى الصورة وحدها مرجعًا */
      if (main.length > 2) return [];
      return main.map((f) => {
        const r = headRect(img, f.box);
        /* وجه يملأ الصورة أصلًا = الموديل يراه جيّدًا؛ وجه أصغر من ٣٢ بكسل = لا تفاصيل تُنقذ */
        if (r.fh >= img.h * 0.45 || r.fh < 32 || r.x1 - r.x0 < 48) return null;
        return { of: i, who: whereIn(f.box, faces), size: f.box[3] - f.box[1], rect: r, img };
      }).filter(Boolean).sort((a, b) => b.size - a.size);
    } catch (e) { console.error('[merge-identity] faces ' + (i + 1) + ': ' + (e && e.message ? e.message : e)); return []; }
  }));
  /* بالتناوب بين الصور (وجه كلّ صورة الأكبر أوّلًا) حتّى تنفد الحصّة */
  const picked = [];
  for (let round = 0; picked.length < budget && per.some((l) => l.length > round); round++) {
    per.forEach((l) => { if (l[round] && picked.length < budget) picked.push(l[round]); });
  }
  return picked.map((c) => {
    const r = c.rect;
    const img = shrinkTo(crop(c.img, r.x0, r.y0, r.x1, r.y1), CROP_MAX);
    return { of: c.of, who: c.who, data: Buffer.from(encodeJpeg(img, 92)).toString('base64'), mime: 'image/jpeg' };
  });
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
/* نسبة صريحة من الصورة الأساسيّة (آخر ما رفعه المستخدم) بأقرب نسبة مدعومة، وكلمة صريحة في الطلب تغلب */
function mergeAspect(photo, text) {
  const s = String(text || '');
  if (/عرضي|عرضيه|عرضية|بانر|landscape|banner|16\s*[:x]\s*9/i.test(s)) return '16:9';
  if (/مربع|مربعه|مربعة|square|1\s*[:x]\s*1/i.test(s)) return '1:1';
  if (/ستوري|استوري|story|9\s*[:x]\s*16|ريلز|reels/i.test(s)) return '9:16';
  let d = null;
  try { const buf = Buffer.from(String(photo && photo.data || ''), 'base64'); d = imageSize(buf); if (d && d.type === 'jpeg' && (jpegOrientation(buf) || 1) >= 5) d = { w: d.h, h: d.w }; } catch (e) { d = null; } /* guard-ok — بلا أبعاد = الافتراضيّ */
  if (!d || !d.w || !d.h) return '3:4';
  const r = Math.log(d.w / d.h);
  return RATIOS.reduce((best, x) => { const [a, b] = x.split(':').map(Number); return Math.abs(Math.log(a / b) - r) < Math.abs(Math.log(best.split(':')[0] / best.split(':')[1]) - r) ? x : best; }, '1:1');
}

module.exports = { faceCrops, detectFaces, mergeParts, mergeInstruction, mergeTemperature, mergeAspect, headRect, sniffMime, MAX_HUMAN_REFS };
