// v-studio-14: معاينة مصوّرة لأي خيار في ستايل الذكاء الاصطناعي — تُولَّد عند أول
// طلب من نموذج حقيقي من نماذجنا (assets/fashion/looks) عبر gpt-image-1 ثم تُحفظ في
// Redis وتُقدَّم للجميع بعدها فورًا. GET /api/studio-preview?feature=..&value=..
// (value=__tab لصورة تبويب الميزة). القائمة البيضاء تمنع أي استغلال.
'use strict';
const { kvGetRaw, kvSetRaw, kvSetIfAbsent, kvDel } = require('./kv.js');
const MORE = require('./studio-more.js');
/* v-studio-more-looks: الميزات الأساسيّة أيضًا (شعر، أظافر، مكياج…) — صور المكياج
   الجاهزة كانت لقطات جسم كامل لا يظهر فيها المكياج، فبدت الخيارات صورة واحدة.
   ملفّ البيانات صرف بلا أسرار، فلا يُحمَّل studio-create (يقرأ الحصص في نطاق الوحدة). */
const BASE = require('./studio-styles.js');
const CARD_FIX = require('./studio-card-fix.js'); /* v-style-match */
/* v-style-match: مفتاح البطاقة المصحَّحة القديم يُحذف مرّة لكلّ نسخة دالّة — في الإنتاج وحده، فنشر المعاينة
   (نفس Redis) لا يمسح صورةً ما زال الإنتاج يقدّمها قبل الدمج */
const cleaned = new Set();

function reqOrigin(req) {
  const h = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(',')[0].trim();
  if (/^[a-z0-9.-]+(:\d+)?$/i.test(h) && /\./.test(h)) return 'https://' + h;
  return 'https://omran-ai-builder.vercel.app';
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sendImage(res, b64, temporary) {
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', temporary ? 'no-store' : 'public, max-age=31536000, immutable');
  res.status(200).end(Buffer.from(b64, 'base64'));
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const q = req.query || {};
  const feature = String(q.feature || '').trim();
  let value = String(q.value || '').trim();
  /* v-video-trends: feature=trend → معاينة بطاقات ترندات الفيديو من نفس المولّد */
  const TRENDS = require('./video-trends.js').TRENDS;
  const isTrend = feature === 'trend';
  /* v-open-tools-cap: البحث بـ[] يقرأ النموذج الأوّليّ — feature=hair&value=toString أو constructor/keys أو
     __proto__/hasOwnProperty كانت تعبر القائمة البيضاء فيولّد كلّ واحد صورة مدفوعة. الآن مفاتيح الكائن نفسه وحدها. */
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const known = !isTrend && (own(MORE.STYLE_PROMPTS, feature) || own(BASE.STYLE_TEXT, feature));
  const isBase = known && !own(MORE.STYLE_PROMPTS, feature);
  const map = isTrend
    ? Object.fromEntries(Object.keys(TRENDS).map((k) => [k, TRENDS[k].preview.frame]))
    : (known ? (MORE.STYLE_PROMPTS[feature] || BASE.STYLE_TEXT[feature]) : null);
  if (!map) { res.status(404).json({ error: 'unknown feature' }); return; }
  if (value === '__tab') value = Object.keys(map)[0];
  if (!own(map, value) || typeof map[value] !== 'string' || !map[value]) { res.status(404).json({ error: 'unknown value' }); return; }
  const fk = feature + ':' + value;
  const rev = (!isTrend && own(CARD_FIX.REV, fk)) ? CARD_FIX.REV[fk] : 0;
  const baseKey = 'studio:preview:v2:' + feature + ':' + value; /* v2: توليد من الصفر بتأطير يُظهر الميزة (الإصدار الأول عدّل صورة كاملة فلم تظهر الحناء ولا شكل الجسم) */
  const key = rev ? baseKey + ':r' + rev : baseKey; /* v-style-match: البطاقة المصحَّحة بمفتاح جديد */
  const dropOld = () => {
    if (!rev || cleaned.has(fk) || process.env.VERCEL_ENV !== 'production') return;
    cleaned.add(fk);
    const old = [baseKey];
    for (let i = 1; i < rev; i++) old.push(baseKey + ':r' + i);
    Promise.all(old.map((k) => kvDel(k))).catch((e) => console.warn('[studio-preview] old key cleanup ' + fk + ': ' + (e && e.message)));
  };

  try {
    const cached = await kvGetRaw(key);
    if (cached) { dropOld(); sendImage(res, cached); return; }
  } catch (e) { /* بلا كاش نولّد مباشرة */ }

  /* v-style-match (المالك ٢٥ أكتوبر: «استعين بنانو بي الصور، أريد الصور مش غبشه ونظيفه ومرتبه»): بطاقات الستايل من
     نانو بنانا برو؛ معاينات الترندات كما كانت */
  const oaKey = (process.env.OPENAI_API_KEY || '').trim();
  const gemKey = (process.env.GEMINI_API_KEY || '').trim();
  if (isTrend ? !oaKey : !gemKey) { res.status(503).json({ error: 'preview generator not configured' }); return; }

  // قفل: توليد واحد فقط لكل خيار مهما تزامنت الطلبات؛ الباقون ينتظرون الكاش
  /* v-redis-capacity: القفل كان يفتح على الفشل (got = true) — فحين تمتلئ القاعدة (كلّ كتابة مرفوضة) يُولَّد كلّ طلب صورةً مدفوعة
     ولا تُحفظ، فيُولَّد مثلها عند الطلب التالي: كلّ مصغّر في شبكة الاستوديو = توليد جديد. امتلاء القاعدة = لا توليد (٥٠٣)، وأيّ عطل
     عابر آخر يبقى كما كان (يفتح). */
  let got = false;
  try { got = await kvSetIfAbsent(key + ':lock', String(Date.now()), 120); }
  catch (e) {
    if (require('./media-purge.js').isStoreFull(e)) { res.setHeader('Retry-After', '600'); res.status(503).json({ error: 'preview store full' }); return; }
    got = true;
  }
  if (!got) {
    for (let i = 0; i < 12; i++) {
      await sleep(2500);
      try { const c = await kvGetRaw(key); if (c) { sendImage(res, c); return; } } catch (e) { /* نكمل الانتظار */ }
    }
    res.setHeader('Retry-After', '10');
    res.status(503).json({ error: 'preview pending' });
    return;
  }

  try {
    if (isTrend) {
      const tp = 'High quality ' + map[value] + ', vertical 3:4 composition, cinematic color grading, no text, no watermark, no logo.';
      const tr = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { Authorization: 'Bearer ' + oaKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-2.5-flare', prompt: tp.slice(0, 3900), size: '1024x1536', quality: 'medium', n: 1, output_format: 'webp', output_compression: 72 }),
        signal: AbortSignal.timeout(240000),
      });
      const td = await tr.json();
      const tb = td && td.data && td.data[0] && td.data[0].b64_json;
      if (!tr.ok || !tb) throw new Error('openai ' + tr.status);
      try { await kvSetRaw(key, tb); } catch (e) { require('./log-error.js').logError('studio-preview/save', e); /* يُقدَّم الآن */ }
      sendImage(res, tb); return;
    }
    const subjects = (isBase ? BASE.PREVIEW_SUBJECT : MORE.PREVIEW_SUBJECT)[feature] || {};
    const gender = (own(CARD_FIX.SUBJECT, fk) && CARD_FIX.SUBJECT[fk]) || subjects[value] || subjects.__tab || 'w'; /* v-style-match */
    const who = (feature === 'age') ? ('an Arab ' + (gender === 'm' ? 'man' : 'woman')) : ('a young Arab ' + (gender === 'm' ? 'man' : 'woman'));
    const frames = isBase ? BASE.PREVIEW_FRAME : MORE.PREVIEW_FRAME;
    const names = isBase ? BASE.PREVIEW_FEATURE_NAME : MORE.PREVIEW_FEATURE_NAME;
    /* v-style-match: تأطير البطاقة ووصفها الخاصّان حين يخفي تأطير الميزة أو وصف التعديل الشيءَ المختار */
    const frame = (own(CARD_FIX.FRAME, fk) && CARD_FIX.FRAME[fk]) || frames[feature] || 'three-quarter portrait';
    const fname = names[feature] || 'the requested style';
    const desc = (own(CARD_FIX.DESC, fk) && CARD_FIX.DESC[fk]) || map[value];
    const bg = (feature === 'background' || feature === 'idphoto' || feature === 'iconic' || feature === 'seasons')
      ? ''
      : ' Dark warm brown studio backdrop with soft golden light.';
    /* الأنمي رسمة لا صورة — «photorealistic» كان يناقض الستايل نفسه */
    const head = feature === 'anime' ? 'A character illustration of ' : 'Photorealistic editorial studio photograph of ';
    /* v-style-match: «مش غبشه ونظيفه ومرتبه» — حدّة على الشخص والشيء المختار، وخلفيّة بلا زحام، والشخص في المنتصف */
    const prompt = head + who + ', ' + frame + ', ' + desc + ' — the image must clearly and prominently show ' + fname + '.' +
      bg + ' Tack-sharp focus on the subject and on ' + fname + ', crisp fine detail, clean uncluttered composition with the subject centred, consistent premium studio style, natural skin texture. No text, no watermark, no logo.';
    const b64 = await nanoCard(gemKey, prompt);
    try { await kvSetRaw(key, b64); dropOld(); } catch (e) { require('./log-error.js').logError('studio-preview/save', e); /* الصورة تُقدَّم الآن ولو تعذّر الحفظ — وتُسجَّل لأنّها توليد مدفوع ضاع */ }
    sendImage(res, b64);
  } catch (e) {
    console.error('[studio-preview] ' + feature + '/' + value + ': ' + (e && e.message));
    /* v-style-match: البطاقة المصحَّحة إن تعذّر توليدها تعرض صورتها القديمة مؤقّتًا — بلا تخزين في المتصفّح، فتأتي الجديدة لاحقًا */
    if (rev) {
      try { const old = await kvGetRaw(baseKey); if (old) { sendImage(res, old, true); return; } } catch (e2) { /* بلا قديمة: الخطأ كما هو */ }
    }
    res.setHeader('Retry-After', '60');
    res.status(502).json({ error: 'preview failed' });
  }
};

/* v-style-match: بطاقة واحدة من نانو بنانا برو (gemini-3-pro-image) بدقّة 2K وطول ٢:٣، تُصغَّر بمتوسّط المساحة إلى عرض ١٠٢٤
   وتُكتب WebP عالية الجودة (الناتج PNG بالميغابايتات لا يتّسع له Redis). يرمي بسبب واضح عند الفشل. */
const CARD_MODEL = 'gemini-3-pro-image';
async function nanoCard(apiKey, prompt) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + CARD_MODEL + ':generateContent?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt.slice(0, 3900) }] }], generationConfig: { imageConfig: { imageSize: '2K', aspectRatio: '2:3' } } }),
    signal: AbortSignal.timeout(240000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('nano ' + r.status + ' ' + String((d && d.error && d.error.message) || '').replace(/key=[^&\s"']+/g, 'key=***').slice(0, 120));
  const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
  const img = parts.find((p) => p.inlineData && p.inlineData.data);
  if (!img) throw new Error('nano no image ' + String((((d.candidates || [])[0] || {}).finishReason) || (d.promptFeedback && d.promptFeedback.blockReason) || '').slice(0, 40));
  return (await require('./img-convert.js').toCardWebp(img.inlineData.data, 1024, 88)).b64;
}
