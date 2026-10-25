// Starts a Google Veo 3 video generation via the Gemini API
// (predictLongRunning). Owner-only for now because each 8s clip costs
// real money. Uses GEMINI_API_KEY env var.
const { checkOwnerBypass } = require('./_videoUsage');

const GL = 'https://generativelanguage.googleapis.com/v1beta';
/* v-video-photo-identity: حدود الأمر حدودنا لا حدّ المحرّك (١٠٢٤ رمزًا) — مقسّمة حسب المسار كي لا يتجاوز
   نصّ عربيّ طويل حدّ الرموز: قوالب الترندات (إنجليزيّة غالبًا) ٢٦٠٠؛ الوصف الحرّ مع صورة ٢٠٠٠ (قفل الهويّة
   ~٣٧٠ + وصف يتّسع لأمر الممثّل كاملًا: كلامه وتزامن الشفاه و«بلا ترجمة» في آخره)؛ وبلا صورة ١٥٠٠ كما كان. */
const VEO_PROMPT_MAX = 2600;
const VEO_FREE_IMAGE_MAX = 2000;
const VEO_FREE_MAX = 1500;
/* v-video-first-frame: قفل «الإطار جاهز — حرّكه كما هو» صار في trend-people.js يشترك فيه كلّ محرّك (نصّه كما هو). */
const { FRAME_LOCK } = require('./trend-people.js');
/* v-trend-scenes: مساحة «اكتب اللي تبيه» تُحسب من حدّ Veo نفسه بعد حجز قفل الإطار الأوّل (كان ١٤٨٠/١١٧٠ فيسقط مع الصورة) */
const TREND_OPTS = { cap: VEO_PROMPT_MAX - FRAME_LOCK.length };

/* v-talkchar-confirm (مراجعة ٢): خطوات الشخصيّة الناطقة بترتيب خصمها — [سبب، نقاط] كما يخصمها maha-image ثمّ هذا الملفّ. أمر الكرتنة
   «تحويل أسلوب» (3D/chibi) فهو إبداعيّ: الأساس ثمّ فرق الإبداعيّ (image_creative كاملًا)، إلّا «العاديّة» المدفوعة من رصيد اشتراك الصور
   (بلا فرق). كان السعر ١٧٥+٢٠ والخصم ١٧٥+٣٥ — أكثر ممّا وافق عليه، ومن رصيده ١٩٥–٢٠٩ يدفع الكرتون ثمّ points_insufficient. */
async function talkSteps(username, withCartoon, C) {
  const steps = [];
  if (withCartoon) {
    const media = require('./_mediaPlans.js');
    const q = await media.imageQuality(username, '').catch(() => null);
    const base = q === 'normal' ? 'image_normal' : 'image';
    const baseCovered = (await media.coverage(username, [base]).catch(() => [false]))[0];
    steps.push([base, C.image]);
    if (!(baseCovered && q === 'normal')) steps.push(['image_creative', C.image_creative - C.image]);
  }
  steps.push(['veo_video', C.veo_video]);
  return steps;
}

/* v-trend-one-confirm (فحص الترندات، المالك ٢٤ أكتوبر «سويه»): قصّة الترند بعدّة مشاهد (بيكسار ٣ افتراضيًّا، حتّى ٥) — كلّ مشهد فيديو
   مستقلّ بسعره، فكان المستخدم يُسأل «تخصم ١٧٥» عند كلّ مشهد ولا يرى المجموع، وإلغاء الثاني يُضيع الأوّل المدفوع. السؤال الآن مرّة
   واحدة بالمجموع قبل الأوّل: ما تغطّيه صلاحيّة فيديوهات الباقة (كما يصرفها الإنشاء للترند) لا يُحسب، والباقي سعر Veo لكلّ مشهد. */
const TREND_SCENES_MAX = 5;
async function trendSteps(username, scenes, C) {
  let planLeft = 0;
  try { planLeft = Math.max(0, Number(await require('./_planVideos.js').planVideoLeft(username)) || 0); } catch (e) { planLeft = 0; }
  const paid = Math.max(0, scenes - planLeft);
  return Array.from({ length: paid }, () => ['veo_video', C.veo_video]);
}

/* v-trend-omni (المالك ٢٤ أكتوبر: «ننقل الترندات لمحرّك Gemini Omni Flash» — «السعر يبقى ١٧٥»): أوقفت جوجل Veo 3.1 Preview في ٢٢ أكتوبر
   (فحص الموديلات #1225: veo-3.1-fast-generate-preview وveo-3.1-generate-preview غير موجودين)، فكانت الترندات كلّها «الخدمة متوقّفة».
   الترند يمرّ هنا كما كان — الأمر والإطار الأوّل والخصم (veo_video ١٧٥ وصلاحيّة الباقة) والمهلة والتذكرة — والمحرّك وحده Omni، بنداء
   متزامن كـomni-create (الواجهة نفسها وأدواره)، ويُحفظ ناتجه بمعرّف مهمّة omni/… يقرؤه veo-status: العملاء كلّهم كما هم (op ثمّ استطلاع)،
   والتذكرة تُسوّى عند التسليم كـVeo. TREND_ENGINE=veo يعيد المسار القديم بلا نشر (لنموذج Veo حيّ لاحقًا). */
const OMNI_OP_PREFIX = 'omni/';
const OMNI_OP_TTL_SEC = 2 * 86400; // كتذكرة المهمّة: يومان
function omniOpKey(op) { return 'omni:op:' + String(op); }
const OMNI_FRAME_MS = 120000; // إطار المجموعة قبل Omni: يترك للمحرّك وقته داخل حدّ الدالّة (٣٠٠ث)
function trendEngine() { return String(process.env.TREND_ENGINE || 'omni').toLowerCase() === 'veo' ? 'veo' : 'omni'; }
const TREND_NO_CUTS = ' In a single continuous shot, no scene cuts.';
const TREND_REVEAL_DECL = '[# Sources <FIRST_FRAME>@Image1 <LAST_FRAME>@Image2] ';
const TREND_REVEAL_GUIDE = ' Use Image1 as the starting frame and Image2 as the final frame: the clip ends exactly on Image2, the plain real photo.';
const TREND_REF_GUIDE = ' Use the given image as a reference for video generation — keep the face and identity of the person in it. The image should not be used as a literal initial frame.';
/* v-trend-omni-refs: التوثيق يربط المرجع بالشخص داخل النصّ («a woman <IMAGE_REF_0> is walking»)، وomni-create يفعل ذلك في قفله؛
   أوامر الترندات (مكتوبة لـVeo) تقول «the reference image» بلا وسم — فيُلحق الوسم بها حين يكون للصورة مرجع واحد. */
function bindTrendRef(p) { return String(p).replace(/the reference image(?! <IMAGE_REF_)/g, 'the reference image <IMAGE_REF_0>'); }
/* صورة واحدة فيها شخصان (كشفهما الإطار): مرجعها الصورة نفسها، والإرشاد بالجمع كالأمر */
const TREND_FRAME_GUIDE_MANY = ' Use Image1 as the starting frame. Use Image2 as a reference for the video generation: it shows the same real people as Image1 — use it only to keep each person\'s own face and identity; the clothing and setting come from Image1 and the description, not from Image2.';
/* إطار المجموعة: «the reference image shows/contains N people» (أمر Veo) ← صور المراجع، كلّ صورة شخص */
function bindGroupRefs(p, n) {
  const tags = Array.from({ length: n }, (_, k) => '<IMAGE_REF_' + k + '>').join(n > 2 ? ', ' : ' and ').replace(/, (<IMAGE_REF_\d>)$/, ' and $1');
  return String(p).replace(/the reference image (shows|contains)/g, 'the reference photos ' + tags + ' show')
    .replace(/the reference image(?! <IMAGE_REF_)/g, 'the reference photos ' + tags);
}
const imgList = (n) => Array.from({ length: n }, (_, k) => 'Image' + (k + 2)).join(n > 2 ? ', ' : ' and ').replace(/, (Image\d)$/, ' and $1');
function groupRefDecl(n) { return '[# Sources <FIRST_FRAME>@Image1] [# References ' + Array.from({ length: n }, (_, k) => '<IMAGE_REF_' + k + '>@Image' + (k + 2)).join(' ') + '] '; }
function groupRefGuide(n) {
  return ' Use Image1 as the starting frame. Use ' + imgList(n) + ' as references for the video generation: each one shows one of the real people already in Image1'
    + ' — use them only to keep each person\'s own face and identity, never as extra people; the clothing and setting come from Image1 and the description.';
}
async function trendOmni(o) {
  const omni = require('./omni-create.js');
  const input = [];
  let prompt = o.prompt;
  if (o.imageBase64) {
    input.push({ type: 'image', data: o.imageBase64, mime_type: o.imageMime || 'image/png' });
    /* v-trend-omni-face: Omni يصنع افتراضيًّا عدّة لقطات بقطع بينها، والقطع يعيد رسم الوجه — لقطة واحدة متّصلة (توثيقه حرفيًّا) */
    const cuts = o.multiShot ? '' : TREND_NO_CUTS; // قالب مونتاج بنصّه (عشر دول…) يبقى بلقطاته
    const refs = o.framed ? (o.refs || []).filter((r) => r && r.data).slice(0, 3) : [];
    if (o.framed && o.lastFrame && o.lastFrame.data) {
      /* v-trends-oct-12 («سامحوني.. هذي الحقيقة»): الإطار الأسطوريّ أوّلًا وصورته نفسها آخرًا — صيغة التوثيق حرفيًّا
         «[# Sources <FIRST_FRAME>@Image1 <LAST_FRAME>@Image2]… the second image as the final frame» */
      input.push({ type: 'image', data: o.lastFrame.data, mime_type: o.lastFrame.mime || 'image/png' });
      prompt = TREND_REVEAL_DECL + prompt + cuts + TREND_REVEAL_GUIDE;
    } else if (refs.length === 1) {
      /* الإطار الأوّل بوجهه في المشهد + مرجع ملامحه (لقطة الوجه أو صورته) — أدوار omni-create حرفيًّا، والمرجع مربوط في النصّ */
      input.push({ type: 'image', data: refs[0].data, mime_type: refs[0].mime || 'image/png' });
      prompt = omni.FRAME_DECL + bindTrendRef(prompt) + cuts + (o.people > 1 ? TREND_FRAME_GUIDE_MANY : omni.FRAME_GUIDE);
    } else if (refs.length > 1) {
      /* إطار المجموعة + صورة كلّ شخص مرجعًا لوجهه (صيغة التوثيق لعدّة مراجع) */
      refs.forEach((r) => input.push({ type: 'image', data: r.data, mime_type: r.mime || 'image/png' }));
      prompt = groupRefDecl(refs.length) + bindGroupRefs(prompt, refs.length) + cuts + groupRefGuide(refs.length);
    } else if (o.framed || !o.person) {
      /* إطار مبنيّ بلا مرجع (ترند بعمر آخر — مرجع البالغ يشدّ الطفل إلى عمره)، أو صورة يُقصد تحريكها هي نفسها
         (منتج، مكان، حيوان، «حرّك الصورة»): أوّل إطار كما كانت عند Veo (instance.image) */
      prompt = '[# Sources <FIRST_FRAME>@Image1] ' + prompt + cuts + ' Use Image1 as the starting frame.';
    } else {
      /* ترند شخص بلا إطار مبنيّ (بيكسار ورمضان، أو تعذّر الإطار): الصورة مرجع لا لقطة أولى — كانت تظهر خامًا في أوّل الفيديو.
         صيغة التوثيق: «Use the given image(s) as references… should not be used as literal initial frames». */
      prompt = '[# References <IMAGE_REF_0>@Image1] ' + bindTrendRef(prompt) + cuts + TREND_REF_GUIDE;
    }
  }
  input.push({ type: 'text', text: prompt });
  const upstream = await fetch((process.env.GEMINI_API_BASE || GL).replace(/\/+$/, '') + '/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': o.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OMNI_VIDEO_MODEL || 'gemini-omni-1.1-flash',
      input,
      response_format: { type: 'video', resolution: o.quality === 'high' ? '1080p' : '720p', aspect_ratio: o.ratio === '720:1280' ? '9:16' : '16:9', delivery: 'uri' },
      background: false, store: true, stream: false, // v-omni-store: الرابط يشترط store:true
    }),
    signal: AbortSignal.timeout(omni.omniTimeoutFor(Date.now() - o.t0, Number(process.env.OMNI_TIMEOUT_MS || 270000))),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return { status: upstream.status, msg: (data && data.error && data.error.message) ? data.error.message : JSON.stringify(data) };
  for (const s of (data.steps || [])) {
    if (!s || s.type !== 'model_output') continue;
    for (const c of (s.content || [])) if (c && c.type === 'video' && c.uri) return { uri: c.uri };
  }
  return { empty: true }; // اكتمل بلا فيديو (غالبًا فلاتر الأمان)
}

module.exports = async (req, res) => {
  const t0 = Date.now(); // v-trend-omni: ميزانيّة النداء المتزامن داخل حدّ الدالّة
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  /* v-video-giveback: خارج try — الرمية بعد الخصم (نداء الإنشاء أو إطار المجموعة) كانت تردّ ٥٠٠ بلا ردّ نقاط ولا فكّ قفل */
  let chargedUser = null;
  let videoLocked = null;
  let chargedPay = null; // v-refund-kind: نتيجة الخصم نفسها — الردّ يعود إلى نوعه
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    let { promptText, ratio, token, quality, imageBase64, imageMime, durationSeconds } = body;
    const rawDesc = promptText; /* v-video-first-frame: وصف المستخدم قبل الأسلوب والقفل — مشهد أوّل الإطار */
    /* v-trend-people: شخصيّتان أو ثلاث — الصور الزائدة تصل في imagesBase64 ويُبنى منها أوّل إطار واحد. */
    /* v-trends-oct-12: ترند شخص واحد بطبيعته («سامحوني»، «من ينقذك؟») — الصور الزائدة تُهمل، والأولى في imageBase64 كما كانت */
    const singleSubject = !!body.trend && require('./trend-people.js').SINGLE_SUBJECT_TRENDS.has(String(body.trend));
    const trendPeople = (!singleSubject && Array.isArray(body.imagesBase64))
      ? body.imagesBase64.map((d, i) => ({ data: d, mime: (body.imagesMime || [])[i] })).filter((x) => x && x.data)
      : [];
    /* v-video-trends: ترند بلمسة — الأمر يُبنى على الخادم من قالب الترند ومدخلات المستخدم */
    const hasImage = !!(imageBase64 && String(imageBase64).trim());
    /* v-trend-omni-refs: صورة المستخدم كما رفعها — الإطار يحلّ محلّها في imageBase64، وتبقى هي مرجع الملامح عند Omni */
    const userPhoto = hasImage ? { data: String(imageBase64).trim(), mime: imageMime || 'image/png' } : null;
    /* v-video-first-frame (المالك: «كل الفيديوات»): مع صورة يُبنى أوّل إطار بوجه الشخص في مشهد الوصف أو الترند ثمّ
       يحرّكه المحرّك (trend-people.soloFirstFrame) — للوصف الحرّ، ولترندات الشخص الواحد في SOLO_FRAME_TRENDS.
       keepPhoto (شخصيّة المحادثة الكرتونيّة الجاهزة) = الصورة نفسها أوّل إطار كما كانت. */
    const tp = require('./trend-people.js');
    /* v-trend-omni-face: على Omni يُبنى الإطار أيضًا لترندات الشخص المنقول إلى مشهد أو عمر (OMNI_FRAME_TRENDS)، وللمتحوّل أثناء
       الفيديو بلحظته الأولى (OMNI_MORPH_TRENDS) — صورته الخام أوّل إطار كانت تظهر ثمّ يقطع المحرّك ويرسم وجهًا آخر. Veo كما كان. */
    const trendId = String(body.trend || '');
    const omniTrend = !!body.trend && trendEngine() === 'omni';
    const morph = omniTrend && tp.OMNI_MORPH_TRENDS.has(trendId);
    const reveal = omniTrend && tp.OMNI_REVEAL_TRENDS.has(trendId); // v-trends-oct-12: إطار أسطوريّ أوّلًا وصورته نفسها آخرًا
    const soloWanted = hasImage && !body.keepPhoto && tp.firstFrameOn() && (body.trend
      ? (trendPeople.length <= 1 && (tp.SOLO_FRAME_TRENDS.has(trendId) || (omniTrend && (tp.OMNI_FRAME_TRENDS.has(trendId) || morph || reveal))))
      : !!(rawDesc && String(rawDesc).trim()));
    /* أنمي/كرتون الواجهة: سطر الأسلوب أوّل الوصف (كان لا يصل هذا المحرّك أصلًا) */
    if (!body.trend && body.style === 'anime' && promptText && String(promptText).trim()) promptText = tp.STYLE_ANIME_VIDEO + String(promptText).trim();
    let trendParams = null; /* v-two-people: لإعادة بناء أمر الترند بصيغة الجمع إن كشف الإطار شخصين في صورة واحدة */
    if (body.trend) {
      const trendsLib = require('./video-trends.js');
      const bParams = trendsLib.sceneParams(String(body.trend), Object.assign({}, body.params || {}, { hasImage }, singleSubject ? { people: 1 } : {})); /* v-trend-scenes: قبل القصّ */
      trendParams = bParams;
      let built = trendsLib.buildTrendPrompt(String(body.trend), bParams, TREND_OPTS);
      if (!built) { res.status(400).json({ error: 'unknown trend' }); return; }
      /* v-video-photo-identity: قفل الإطار الأوّل (FRAME_LOCK) يُلحق بعد البناء لترندات الأشخاص — فيُحجز له
         مكانه هنا: يُقصّ كلام المستخدم وحده (الاسم يتكرّر في بعض القوالب) لا الأقفال. أطول حالة قيست: ٢٧٨٩. */
      for (let keep = 360; (trendPeople.length > 1 || soloWanted) && built.prompt.length + FRAME_LOCK.length > VEO_PROMPT_MAX && keep >= 0; keep -= 40) {
        const cut = (v) => String(v || '').slice(0, keep);
        built = trendsLib.buildTrendPrompt(String(body.trend), Object.assign({}, bParams, { name: cut(bParams.name), text: cut(bParams.text), extra: cut(bParams.extra) }), TREND_OPTS) || built;
      }
      promptText = built.prompt; ratio = ratio || built.ratio; if (!durationSeconds) durationSeconds = 8;
    } else if (hasImage && promptText) {
      /* v-video-identity: الوصف الحرّ مع صورة — قفل الهويّة نفسه كالترندات */
      promptText = require('./video-trends.js').withIdentityLock(promptText, VEO_FREE_IMAGE_MAX);
    }
    let durSec = parseInt(durationSeconds, 10);
    if (![4, 6, 8].includes(durSec)) durSec = 0; // 0 = default (leave to Veo)
    if (!promptText || !String(promptText).trim()) {
      res.status(400).json({ error: 'Missing promptText' });
      return;
    }

    /* v-video-stream: فحص المفتاح قبل أيّ خصم — كان بعد spendPoints وvideoLock ويردّ ٥٠٠ بلا
       استرجاع ولا فكّ قفل، فغياب المفتاح يحرق نقاط المستخدم في كلّ محاولة. */
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error('[veo-create] missing provider key'); res.status(500).json({ error: 'تعذّر توليد الفيديو الآن. أعد المحاولة.' }); return; }

    // 💰 نظام النقاط: Veo 3 متاح للجميع — المالك بلا حدود، وغيره يدفع
    // 400 نقطة للفيديو الواحد. يُسترجع الرصيد تلقائيًا لو فشل الطلب.
    const pointsLib = require('./points.js');
    const gate = await checkOwnerBypass(token);
    /* v-talkchar-confirm (مراجعة باب المال): سؤال السعر وحده قبل خطوة مدفوعة تسبق الفيديو (كرتنة الشخصيّة الناطقة) — كانت الكرتنة
       تُخصم ثمّ يأتي سؤال الفيديو، فالإلغاء يقول «لم تُخصم أيّ نقاط» وقد خُصمت، ومن رصيده لا يكفي الفيديو يدفع الكرتون ثمّ يُردّ.
       لا خصم هنا ولا قفل ولا نداء مزوّد ولا صلاحيّة باقة؛ الموافقة يحملها العميل إلى الإنشاء (confirmed:true). */
    if (req.query && req.query.action === 'veo-price') { /* إجراء مستقلّ لا علم في الجسم: موجّه أقدم يرفضه (404) فلا يصير إنشاءً مدفوعًا عند تراجع النشر */
      if (gate.allowed) { res.status(200).json({ ok: true, priceOk: true }); return; }
      const pcUser = gate.reason === 'auth' ? null : pointsLib.verifyPointsToken(token);
      if (!pcUser) { res.status(401).json({ error: 'auth_required' }); return; }
      if (await require('./_videoSubs.js').denyFree(res, pcUser)) return; // v-video-subs: الفيديو للمشتركين — قبل سؤال الخصم
      const withCartoon = body.withCartoon === true;
      /* v-trend-one-confirm: قصّة ترند (trend + scenes) — المجموع، ومهلة الثلاث دقائق يتولّاها العميل بين المشاهد (لا تُرفض القصّة هنا) */
      const tScenes = body.trend ? Math.min(TREND_SCENES_MAX, Math.max(1, parseInt(body.scenes, 10) || 1)) : 0;
      const story = tScenes ? await trendSteps(pcUser, tScenes, pointsLib.COSTS) : null;
      const pcSteps = story || await talkSteps(pcUser, withCartoon, pointsLib.COSTS);
      const pcCost = pcSteps.reduce((a, s) => a + s[1], 0);
      const pcLeft = story ? 0 : await require('./abuse-guard.js').videoCooldownLeft(pcUser); // VIP خارج المهلة كما في videoLock أدناه (pay.owner)
      if (pcLeft > 0 && !(await require('./_vip.js').isVip(pcUser))) { res.status(429).json({ error: 'video_cooldown', retryAfter: pcLeft }); return; }
      if (!(await pointsLib.canAfford(pcUser, pcSteps))) { res.status(402).json({ error: 'points_insufficient', needed: pcCost }); return; }
      /* لا خصم على القصّة كلّها (صلاحيّة الباقة) أو على VIP (spendPoints لا يخصم منه) = لا سؤال */
      if (story && (!pcCost || await require('./_vip.js').isVip(pcUser))) { res.status(200).json({ ok: true, priceOk: true }); return; }
      const pcGate = story
        ? pointsLib.requireConfirmation(body, pcCost, 'قصّة ترند بعدّة مشاهد — فيديو بالصوت لكلّ مشهد') /* حرفيّ (video-names): المجموع في النصّ نفسه */
        : withCartoon ? pointsLib.requireConfirmation(body, pcCost, 'شخصيّة كرتونيّة ناطقة') : pointsLib.requireConfirmation(body, pcCost, 'فيديو سينمائي بالصوت');
      if (pcGate) { res.status(pcGate.status).json(pcGate.payload); return; }
      res.status(200).json({ ok: true, priceOk: true });
      return;
    }
    if (!gate.allowed) {
      if (gate.reason === 'auth') { res.status(401).json({ error: 'auth_required' }); return; }
      const username = pointsLib.verifyPointsToken(token);
      if (!username) { res.status(401).json({ error: 'auth_required' }); return; }
      if (await require('./_videoSubs.js').denyFree(res, username)) return; // v-video-subs: الفيديو للمشتركين — قبل سؤال الخصم
      quality = await require('./_qualityGate.js').gateQuality(username, quality); // v-quality-gate: الجودة العالية للمشتركين والمالك
      /* v-plan-videos: الترند وحده (لا الوصف الحرّ) يُصرف من صلاحيّة فيديوهات الباقة أوّلًا — بلا تأكيد خصم. نفادها = كما كان. */
      let pay = (body.trend && (await require('./_planVideos.js').planVideoLeft(username)) > 0)
        ? await pointsLib.spendPoints(username, pointsLib.COSTS.veo_video, 'veo_video', { planVideoOnly: true }) : null;
      if (!pay || !pay.ok) {
        const gateVeo = pointsLib.requireConfirmation(body, pointsLib.COSTS.veo_video, 'فيديو سينمائي بالصوت');
        if (gateVeo) { res.status(gateVeo.status).json(gateVeo.payload); return; }
        pay = await pointsLib.spendPoints(username, pointsLib.COSTS.veo_video, 'veo_video');
      }
      if (!pay.ok) {
        res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.veo_video, points: pay.points || 0 });
        return;
      }
      chargedUser = username; chargedPay = pay;
      // v-plan-routing: فيديو واحد كلّ ٣ دقائق لكلّ حساب — VIP خارجها (pay.owner). القفل يُفكّ لو فشل Veo.
      if (!pay.owner) {
        const __vl = await require('./abuse-guard.js').videoLock(username);
        if (!__vl.ok) {
          await pointsLib.refundPoints(username, pointsLib.COSTS.veo_video, pay); chargedUser = null; /* v-video-giveback: رُدّ هنا — catch لا يردّ ثانيةً */
          res.status(429).json({ error: 'video_cooldown', retryAfter: __vl.retryAfter });
          return;
        }
        videoLocked = username;
      }
    }


    /* v-trend-people: أوّل إطار فيه كلّ الأشخاص معًا في مشهد الترند، ثمّ يحرّكه المحرّك. بعد القفل
       عمدًا: مهلة الثلاث دقائق هي ما يحدّ نداءات الدمج. فشله = لا خصم ولا قفل (يُردّان هنا). */
    let groupFramed = false; // v-trend-omni: الصورة صارت أوّل إطار (دور Image1 عند Omni)
    if (body.trend && trendPeople.length > 1) {
      /* v-two-people: مشهد القالب وحده — فقرة «WHO THEY ARE» ليست مشهدًا (كانت أوّل ٧٠٠ حرف من «المشهد») */
      const frame = await require('./trend-people.js').groupFirstFrame(apiKey, trendPeople, tp.trendScene(promptText), ratio, trendEngine() === 'omni' ? Object.assign({ timeoutMs: OMNI_FRAME_MS }, morph ? { start: true } : {}) : undefined);
      if (frame && frame.b64) {
        imageBase64 = frame.b64; imageMime = frame.mime; groupFramed = true;
        /* v-trend-identity: الإطار الأوّل بُني للتوّ بوجوه الأشخاص الحقيقيّة داخل مشهد الترند، لكنّ أمر
           الترند نفسه يبقى «Transform the person … into …» — فيعيد المحرّك تنفيذ التحويل فوق إطار
           نُفِّذ فيه أصلًا، ويرسم وجوهًا جديدة. هذا السطر يُلحق أخيرًا فيغلب: التحويل انتهى، والمطلوب
           تحريك ما في الإطار كما هو. v-trend-omni-face: المتحوّل أثناء الفيديو (Omni) — إطاره قبل التحوّل، والقفل يمنعه. */
        if (!morph) promptText += FRAME_LOCK;
      }
      else if (frame && frame.error) {
        if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.veo_video, chargedPay);
        if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
        chargedUser = null; videoLocked = null; /* v-video-giveback: رُدّ هنا — catch لا يردّ ثانيةً */
        /* v-trend-codes (فحص الترندات ٢٤ أكتوبر): فشل إطار المجموعة كان نصًّا عربيًّا ثابتًا «أعد المحاولة» بـ٥٠٢ لكلّ سبب — نفاد رصيد
           المزوّد يُقرأ زحامًا (والعميل لا يعرض «الخدمة متوقّفة مؤقّتًا»)، والنصّ عربيّ في اللغات الـ١٣. الآن رمز كبدء الفيديو نفسه:
           نفاد/مفتاح = unavailable، زحام = video_busy، صورة محجوبة = video_rejected؛ والعربيّ في message_ar. */
        const fail = frame.rejected
          ? { code: 502, body: { error: 'video_rejected', message_ar: String(frame.error).replace(/ \([A-Z_]+\)$/, ''), retryable: false } }
          : require('./_videoFail.js').startFail(frame.upstream || frame.status || 502, frame.tech);
        res.status(fail.code).json(fail.body);
        return;
      }
    }

    /* v-video-first-frame: شخص واحد — أوّل إطار بوجهه في المشهد (الترند: مشهد القالب وحده وأسلوبه)، ثمّ القفل نفسه
       كإطار المجموعة. أيّ عطب = الصورة نفسها أوّل إطار كما كانت، فلا يفشل فيديو بسبب الإطار. */
    let framed = false;
    let frameRef = null; // v-trend-omni: لقطة الوجه من الإطار الفرديّ (Image2 عند Omni)
    let soloPeople = 0; // v-trend-omni-refs: شخصان كشفهما الإطار في صورة واحدة — إرشاد المرجع بالجمع
    if (soloWanted) {
      const solo = await tp.soloFirstFrame(apiKey, { data: String(imageBase64).trim(), mime: imageMime },
        body.trend ? tp.trendScene(promptText) : String(rawDesc), ratio,
        { style: body.trend ? '' : body.style, artHint: !!body.trend && tp.SOLO_FRAME_ART_TRENDS.has(String(body.trend)), budgetMs: 90000,
          start: morph, ageShift: omniTrend && tp.AGE_SHIFT_TRENDS.has(trendId),
          /* v-trend-frame-face: Omni يحفظ وجه الإطار طوال المقطع — فالإطار 2K بوجه كبير؛ الدمية والليغو 2K وحده (لعبة صغيرة في عبوتها) */
          detail: omniTrend && !tp.SOLO_FRAME_TOY_TRENDS.has(trendId), hiRes: omniTrend });
      if (solo && solo.b64) {
        imageBase64 = solo.b64; imageMime = solo.mime;
        /* v-two-people: الإطار كشف شخصين في الصورة الواحدة — الأمر بصيغة الجمع (كلّ واحد بوجهه) قبل القفل */
        if (solo.people > 1 && !singleSubject) {
          const vt = require('./video-trends.js');
          if (body.trend) {
            const b2 = vt.buildTrendPrompt(String(body.trend), Object.assign({}, trendParams, { people: solo.people }), TREND_OPTS);
            if (b2 && b2.prompt.length + FRAME_LOCK.length <= VEO_PROMPT_MAX) promptText = b2.prompt;
          } else {
            promptText = vt.withIdentityLock((body.style === 'anime' ? tp.STYLE_ANIME_VIDEO : '') + String(rawDesc).trim(), VEO_FREE_IMAGE_MAX, undefined, solo.people);
          }
        }
        /* v-trend-omni-face: المتحوّل أثناء الفيديو — إطاره قبل التحوّل، والقفل يمنعه؛ v-trends-oct-12: والكشف ينتهي بصورته لا بالإطار */
        if (!morph && !reveal) promptText += FRAME_LOCK;
        framed = true; frameRef = solo.ref || null; soloPeople = singleSubject ? 0 : (solo.people || 0);
        console.log('[veo-create] first frame ready' + (solo.cached ? ' (cached)' : '') + (body.trend ? ' for trend ' + String(body.trend).slice(0, 20) : ''));
      } else console.warn('[veo-create] first frame skipped: ' + ((solo && solo.error) || 'none'));
    }

    if (body.trend && trendEngine() === 'omni') {
      const r = await trendOmni({ apiKey, prompt: String(promptText).trim().slice(0, VEO_PROMPT_MAX), imageBase64: imageBase64 && String(imageBase64).trim(),
        imageMime, framed: framed || groupFramed, ratio, quality, t0, person: tp.omniPersonTrend(trendId),
        /* v-trend-omni-refs (المالك بعد v-trend-omni-face: «بعده يغيّر شكل الشخصيّة في الملامح»): مرجع الملامح مع كلّ إطار مبنيّ —
           لقطة الوجه، وإلّا الصورة نفسها كما في omni-create (السيلفي: وجه يملأ الصورة لا تُقصّ له لقطة، فكان الإطار وحده)، وصور
           الأشخاص مع إطار المجموعة (كان بلا أيّ مرجع). ترند العمر الآخر بلا مرجع البالغ (يشدّ الطفل إلى عمره) إلّا رحلة العمر. */
        /* v-trends-oct-12: الكشف — صورته نفسها <LAST_FRAME> بدل المرجع */
        lastFrame: reveal && framed ? userPhoto : null,
        refs: ((tp.AGE_SHIFT_TRENDS.has(trendId) && !morph) || (reveal && framed)) ? []
          : groupFramed ? (tp.omniPersonTrend(trendId) ? trendPeople.map((x) => ({ data: String(x.data).trim(), mime: x.mime || 'image/png' })) : []) /* منتج أو مكان بعدّة صور: ليست وجوه أشخاص */
            : framed ? [frameRef || userPhoto] : [],
        people: soloPeople,
        /* قصّة المحادثة في مقطع واحد (oneClip بعدّة مشاهد) لقطات متتالية بنصّها — كقوالب المونتاج */
        multiShot: tp.MULTI_SHOT_TRENDS.has(trendId) || !!(trendParams && trendParams.oneClip && Array.isArray(trendParams.scenes) && trendParams.scenes.length > 1) });
      if (!r.uri) {
        if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.veo_video, chargedPay);
        if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
        chargedUser = null; videoLocked = null; /* v-video-giveback: رُدّ هنا — catch لا يردّ ثانيةً */
        if (r.status) {
          console.error('[veo-create] omni upstream ' + r.status + ': ' + String(r.msg).slice(0, 300));
          const fail = require('./_videoFail.js').startFail(r.status, r.msg); /* نفاد الرصيد unavailable · زحام video_busy · رفض video_rejected */
          res.status(fail.code).json(fail.body);
        } else {
          console.warn('[veo-create] omni: completed without a video (likely safety filters)');
          res.status(502).json({ error: 'video_rejected', message_ar: 'لم يُنتَج فيديو (قد يكون الطلب محجوبًا بفلاتر الأمان) — جرّب صورة أو وصفًا آخر.', retryable: false });
        }
        return;
      }
      const op = OMNI_OP_PREFIX + require('crypto').randomUUID();
      await require('./kv.js').kvSetRaw(omniOpKey(op), JSON.stringify({ uri: r.uri }), OMNI_OP_TTL_SEC);
      // v-video-refund: التذكرة كـVeo — veo-status يسوّيها عند التسليم، والكنس يردّها إن لم يُسلَّم
      await require('./video-job.js').rememberVideoJob(op, { username: chargedUser, cost: pointsLib.COSTS.veo_video, locked: !!videoLocked, pay: chargedPay });
      chargedUser = null; videoLocked = null;
      console.log('[veo-create] trend ' + String(body.trend).slice(0, 20) + ' ready on omni in ' + Math.round((Date.now() - t0) / 1000) + 's');
      res.status(200).json({ op });
      return;
    }

    const model = quality === 'high' ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview';
    const aspectRatio = ratio === '720:1280' ? '9:16' : '16:9';
    /* v-video-photo-identity: حدّ ١٥٠٠ كان يقصّ قفل «الإطار الأوّل يُظهر كلّ شخص… لا تحوّل مرّة ثانية»
       في كلّ ترند متعدّد الأشخاص (٣٣٠ من ٣٣٠ قياسًا) لأنّه يُلحق بعد بناء الأمر — الحدّ الآن حسب المسار
       (انظر رأس الملفّ)، وللقفل مكانه محجوز عند البناء. */
    const prompt = String(promptText).trim().slice(0, body.trend ? VEO_PROMPT_MAX : (framed ? VEO_FREE_IMAGE_MAX + FRAME_LOCK.length : (hasImage ? VEO_FREE_IMAGE_MAX : VEO_FREE_MAX)));

    // Veo 3.1 image-to-video: attach a starting image when provided so the
    // generated clip animates that exact character (with native audio/speech).
    const instance = { prompt };
    if (imageBase64 && String(imageBase64).trim()) {
      instance.image = {
        bytesBase64Encoded: String(imageBase64).trim(),
        mimeType: imageMime || 'image/png',
      };
    }

    const upstream = await fetch(GL + '/models/' + model + ':predictLongRunning', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [instance],
        parameters: durSec ? { aspectRatio, durationSeconds: durSec } : { aspectRatio },
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : JSON.stringify(data);
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.veo_video, chargedPay);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      chargedUser = null; videoLocked = null; /* v-video-giveback: رُدّ هنا — catch لا يردّ ثانيةً */
      console.error('[veo-create] upstream ' + upstream.status + ': ' + String(msg).slice(0, 300));
      const fail = require('./_videoFail.js').startFail(upstream.status, msg); /* v-video-names: مؤقّت · عطب عندنا · رفض للطلب (_videoFail.js) */
      res.status(fail.code).json(fail.body);
      return;
    }
    // v-video-refund: تذكرة المهمّة — فشلها لاحقًا عند الاستطلاع يردّ الخصم ويفكّ القفل.
    await require('./video-job.js').rememberVideoJob(data.name, { username: chargedUser, cost: pointsLib.COSTS.veo_video, locked: !!videoLocked, pay: chargedPay });
    chargedUser = null; videoLocked = null; /* v-video-giveback: التذكرة تملك الردّ من هنا — catch لا يردّ مرّتين (كـactor-create) */
    res.status(200).json({ op: data.name });
  } catch (e) {
    /* v-video-giveback: أيّ رمية بعد الخصم (انقطاع أو مهلة عند نداء الإنشاء) تردّ النقاط وتفكّ القفل كـomni-create — أفضل جهد لا يحجب الردّ */
    try {
      if (chargedUser) await require('./points.js').refundPoints(chargedUser, require('./points.js').COSTS.veo_video, chargedPay);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
    } catch (e2) { /* guard-ok — فشل الاسترجاع لا يُخفي الخطأ الأصليّ، ويُسجَّل أدناه */ }
    console.error('[veo-create] ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'تعذّر بدء الفيديو مؤقتًا — أعد المحاولة بعد لحظات.', retryable: true });
  }
};
module.exports.VEO_PROMPT_MAX = VEO_PROMPT_MAX;
module.exports.OMNI_OP_PREFIX = OMNI_OP_PREFIX;
module.exports.omniOpKey = omniOpKey;
module.exports.trendEngine = trendEngine;
module.exports.TREND_NO_CUTS = TREND_NO_CUTS;
module.exports.TREND_REF_GUIDE = TREND_REF_GUIDE;
module.exports.bindTrendRef = bindTrendRef;
module.exports.groupRefDecl = groupRefDecl;
module.exports.groupRefGuide = groupRefGuide;
module.exports.bindGroupRefs = bindGroupRefs;
module.exports.TREND_FRAME_GUIDE_MANY = TREND_FRAME_GUIDE_MANY;
module.exports.TREND_REVEAL_DECL = TREND_REVEAL_DECL;
module.exports.TREND_REVEAL_GUIDE = TREND_REVEAL_GUIDE;
module.exports.VEO_FREE_IMAGE_MAX = VEO_FREE_IMAGE_MAX;
module.exports.VEO_FREE_MAX = VEO_FREE_MAX;
module.exports.FRAME_LOCK = FRAME_LOCK;
