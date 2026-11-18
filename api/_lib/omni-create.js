// Vercel Serverless Function: generates a video with Google Gemini Omni
// (gemini-omni-1.1-flash) via the Interactions API — the "cinematic" engine
// added alongside Runway, Veo and MiniMax. Uses GEMINI_API_KEY. Unlike the
// others this call is SYNCHRONOUS: the POST blocks until the clip is generated
// (fits the api/*.js maxDuration of 300s) and returns a Google file URI, which
// the client streams through the existing veo-download proxy (same key/host).
// Points mirror the Veo path (owner bypass, per-account cooldown, refund on
// failure) at the higher omni_video cost, since Omni is priced ~$0.10/sec.
const { checkOwnerBypass } = require('./_videoUsage');

const GL = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');

/* v-omni-first-frame: مع صورة يُبنى أوّل إطار بوجه الشخص نفسه (trend-people.soloFirstFrame) ثمّ يحرّكه المحرّك.
   الأدوار مصرَّح بها في أوّل الأمر وإرشادها في آخره، بصيغة التوثيق الرسميّ حرفيًّا:
   «[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2] … Use Image1 as the starting frame.
   Use Image2 as a reference for the video generation.» — Image1 الإطار، وImage2 لقطة الوجه (أو الصورة نفسها). */
const FRAME_DECL = '[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2] ';
const FRAME_GUIDE = ' Use Image1 as the starting frame. Use Image2 as a reference for the video generation: it shows the same real person as Image1 — use it only to keep their face and identity; the clothing and setting come from Image1 and the description, not from Image2.';
/* v-omni-role-words (توثيق المحرّك ١٧ نوفمبر ٢٠٢٦): وسوم التحكّم داخل النصّ (<FIRST_FRAME> <LAST_FRAME> <IMAGE_REF_n> <VIDEO_REF_n>)
   مهجورة في الإصدار الجديد وغير مدعومة فيما بعده، والبديل وصف دور كلّ صورة بلغة طبيعيّة — «النموذج يستنتج وضع التوليد وأدوار الوسائط من
   نصّ الأمر». فالأدوار نفسها تُكتب بصيغتين: الوسوم للإصدار الحاليّ كما هي حرفيًّا، والكلمات لكلّ اسم إصدار غيره (الجديد وما بعده).
   الاسم المرسَل هو الحكم: في ٣ ديسمبر ٢٠٢٦ يحوّل المزوّد طلبات الاسم الحاليّ إلى الجديد بلا تغيير عندنا، وهي تبقى بوسومها حتّى يُحسم
   بتشغيلة حيّة — لا تبديل بالتاريخ (يغيّر الترندات بلا دليل). OMNI_ROLE_STYLE=words|tags يفرض إحداهما على الكلّ بلا نشر. */
function roleWords(model) {
  const force = String(process.env.OMNI_ROLE_STYLE || '').toLowerCase();
  if (force === 'tags') return false;
  if (force === 'words') return true;
  return !/omni-1\.1-|omni-flash-preview/i.test(String(model || ''));
}
/* إرشاد الأدوار مكتوب أصلًا بلغة طبيعيّة على اسمَي Image1/Image2 اللذين يعرّفهما سطر الوسوم — بلا ذلك السطر يصيران «the first image»
   و«the second image» (ترتيب الصور في input)، وبقيّة الجملة — أقفال الوجه والشعر — كما هي حرفيًّا فلا تفترق الصيغتان مع الوقت. */
const ROLE_ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
function imageWords(s) {
  return String(s).replace(/(^|\. )?\bImage([1-6])(?!\d)/g, (m, lead, d) => (lead === undefined ? 'the ' : lead + 'The ') + ROLE_ORDINALS[d - 1] + ' image');
}
/* صيغة الكلمات تُشتقّ من أمر الوسوم نفسه: يُحذف كلّ وسم تحكّم وسطر التصريح (قائمة «<A>, <B> and <C>» كلّها) — فلا وسم يصل الإصدار
   الجديد مهما بنى المتّصل أو كتب المستخدم */
const ROLE_TAG = '<(?:FIRST_FRAME|LAST_FRAME|IMAGE_REF_\\d+|VIDEO_REF_\\d+)>';
const ROLE_TAG_RUN = new RegExp(' ?' + ROLE_TAG + '(?:(?:,| and|, and)? ' + ROLE_TAG + ')*', 'g');
function stripRoleTags(s) {
  return String(s).replace(/\[# (?:Sources|References)[^\]]*\] ?/g, '').replace(ROLE_TAG_RUN, '');
}
const FRAME_DECL_WORDS = 'Two images are attached: the first image is the exact opening frame of the video and the second image is the reference image. ';
/* generation_config.video_config.task احتياطًا (التوثيق: «جرّب اللغة الطبيعيّة بلا task أوّلًا» — يقيّد عدد الصور وطريقة جمعها): مطفأ،
   وOMNI_ROLE_TASK=on يرسله لصيغة الكلمات حين للصور دور واحد (أوّل إطار، أو أوّل وآخر، أو مرجع). الإطار مع مرجع بلا task: لا قيمة تجمعهما. */
const ROLE_TASKS = { frame: 'image_to_video', frames: 'image_to_video', ref: 'reference_to_video' };
function roleTask(kind, words) {
  const task = words && String(process.env.OMNI_ROLE_TASK || 'off').toLowerCase() === 'on' ? ROLE_TASKS[kind] : '';
  return task ? { generation_config: { video_config: { task } } } : {};
}
function framedPrompt(desc, people, words) {
  /* v-two-people: people > 1 = صورة فيها شخصان كشفهما أوّل الإطار — القفل بصيغة الجمع */
  const decl = words ? FRAME_DECL_WORDS : FRAME_DECL;
  const guide = words ? imageWords(FRAME_GUIDE) : FRAME_GUIDE;
  const lock = require('./video-trends.js').withIdentityLock(desc, 1500 - decl.length - guide.length, words ? 'the reference image' : 'the reference image <IMAGE_REF_0>', people);
  return decl + lock + guide;
}
/* الإطار والمحرّك داخل نداء واحد متزامن: maxDuration لـapi/*.js في vercel.json ٣٠٠ث. الإطار (كشف + توليد) ≤ ٩٠ث،
   والمحرّك يأخذ ما بقي ناقص هامش — فلا تقتل المنصّة الدالّة قبل أن يُستردّ رصيد مستخدم عند المهلة. */
const FN_MAX_MS = 300000;
const FRAME_BUDGET_MS = 90000;
const OMNI_MARGIN_MS = 15000;
function omniTimeoutFor(elapsedMs, configuredMs) {
  return Math.max(30000, Math.min(configuredMs, FN_MAX_MS - OMNI_MARGIN_MS - elapsedMs));
}

module.exports = async (req, res) => {
  const t0 = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  /* v-omni-refund: خارج try — مهلة الشبكة وأيّ رمية أخرى تسقط في الـcatch الأخير، وكان يردّ ٥٠٠
     بلا استرجاع نقاط ولا فكّ قفل، خلافًا لمسارات الفشل الثلاثة الأخرى. */
  let chargedUser = null;
  let videoLocked = null;
  let chargedPay = null; // v-refund-kind: نتيجة الخصم نفسها — الردّ يعود إلى نوعه
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    let { promptText, ratio, token, quality, imageBase64, imageMime } = body;
    const userDesc = promptText; /* v-omni-first-frame: وصف المستخدم قبل القفل — مشهد أوّل الإطار */
    /* v-video-first-frame: أنمي/كرتون الواجهة — سطر الأسلوب أوّل الوصف (كان لا يصل هذا المحرّك أصلًا)، والإطار يُرسم به */
    if (!body.trend && body.style === 'anime' && promptText && String(promptText).trim()) promptText = require('./trend-people.js').STYLE_ANIME_VIDEO + String(promptText).trim();
    const styledDesc = promptText;
    const model = process.env.OMNI_VIDEO_MODEL || 'gemini-omni-1.1-flash';
    const words = roleWords(model); /* v-omni-role-words: الإصدار الجديد يأخذ دور الصورة بالكلمات لا بالوسم */
    /* v-video-trends: ترند بلمسة — الأمر يُبنى على الخادم من قالب الترند */
    if (body.trend) {
      const built = require('./video-trends.js').buildTrendPrompt(String(body.trend), Object.assign({}, body.params || {}, { hasImage: !!(imageBase64 && String(imageBase64).trim()) }));
      if (!built) { res.status(400).json({ error: 'unknown trend' }); return; }
      promptText = built.prompt; ratio = ratio || built.ratio;
    } else if (imageBase64 && String(imageBase64).trim() && promptText) {
      /* v-video-identity: الوصف الحرّ مع صورة — قفل الهويّة نفسه كالترندات.
         v-video-photo-identity: والصورة مسمّاة بوسمها <IMAGE_REF_0> (أوّل صورة في input) — بلا وسم يقرّر
         Omni وحده دور الصورة، وهو ما أخرج فيديو المالك بوجه آخر. */
      promptText = require('./video-trends.js').withIdentityLock(promptText, 1500, 'the reference image <IMAGE_REF_0>');
    }
    if (!promptText || !String(promptText).trim()) {
      res.status(400).json({ error: 'Missing promptText' });
      return;
    }

    // 💰 النقاط: المحرّك السينمائيّ متاح للجميع — المالك بلا حدود، وغيره يدفع
    // omni_video نقطة (الأغلى). يُسترجع الرصيد تلقائيًا لو فشل الطلب.
    const pointsLib = require('./points.js');
    const gate = await checkOwnerBypass(token);
    if (!gate.allowed) {
      if (gate.reason === 'auth') { res.status(401).json({ error: 'auth_required' }); return; }
      const username = pointsLib.verifyPointsToken(token);
      if (!username) { res.status(401).json({ error: 'auth_required' }); return; }
      if (await require('./_videoSubs.js').denyFree(res, username)) return; // v-video-subs: الفيديو للمشتركين — قبل سؤال الخصم
      quality = await require('./_qualityGate.js').gateQuality(username, quality); // v-quality-gate: الجودة العالية للمشتركين والمالك
      const gateOm = pointsLib.requireConfirmation(body, pointsLib.COSTS.omni_video, 'فيديو المحرّك السينمائيّ');
      if (gateOm) { res.status(gateOm.status).json(gateOm.payload); return; }
      const pay = await pointsLib.spendPoints(username, pointsLib.COSTS.omni_video, 'omni_video');
      if (!pay.ok) {
        res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.omni_video, points: pay.points || 0 });
        return;
      }
      chargedUser = username; chargedPay = pay;
      if (!pay.owner) {
        const __vl = await require('./abuse-guard.js').videoLock(username);
        if (!__vl.ok) {
          await pointsLib.refundPoints(username, pointsLib.COSTS.omni_video, pay); chargedUser = null; /* v-video-giveback: رُدّ هنا — catch لا يردّ ثانيةً */
          res.status(429).json({ error: 'video_cooldown', retryAfter: __vl.retryAfter });
          return;
        }
        videoLocked = username;
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.omni_video, chargedPay);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      console.error('[omni-create] missing provider key');
      res.status(500).json({ error: 'تعذّر توليد الفيديو الآن. أعد المحاولة.' });
      return;
    }

    const resolution = quality === 'high' ? '1080p' : '720p';
    const aspect = ratio === '720:1280' ? '9:16' : '16:9';
    let prompt = String(promptText).trim().slice(0, 1500);
    const hasImage = !!(imageBase64 && String(imageBase64).trim());

    /* v-omni-first-frame: الوصف الحرّ مع صورة — أوّل إطار بوجهه أوّلًا. OMNI_FIRST_FRAME=off يوقفه بلا نشر،
       وأيّ عطب (كشف، توليد، حجب، مهلة) = الطلب السابق حرفيًّا أدناه، فلا يفشل فيديو بسبب الإطار. */
    let frame = null;
    if (!body.trend && hasImage && userDesc && !body.keepPhoto && require('./trend-people.js').firstFrameOn() && String(process.env.OMNI_FIRST_FRAME || 'on').toLowerCase() !== 'off') {
      frame = await require('./trend-people.js').soloFirstFrame(apiKey, { data: String(imageBase64).trim(), mime: imageMime }, String(userDesc), ratio, { style: body.style, budgetMs: FRAME_BUDGET_MS });
      if (frame && frame.b64) console.log('[omni-create] first frame ready in ' + Math.round((Date.now() - t0) / 1000) + 's (face close-up: ' + (frame.ref ? 'yes' : 'no') + ')');
      else console.warn('[omni-create] first frame skipped: ' + ((frame && frame.error) || 'none'));
    }

    // input مصفوفة: صورة (اختياريّة) ثمّ النصّ. الفيديو الكبير يُطلب كـuri لتفادي
    // حدّ حجم الحمولة، ويُقرأ الـuri من ردّ الإنشاء نفسه (مضمون هنا).
    const input = [];
    if (frame && frame.b64) {
      input.push({ type: 'image', data: frame.b64, mime_type: frame.mime });
      input.push(frame.ref
        ? { type: 'image', data: frame.ref.data, mime_type: frame.ref.mime }
        : { type: 'image', data: String(imageBase64).trim(), mime_type: imageMime || 'image/png' });
      prompt = framedPrompt(String(styledDesc), frame.people, words);
    } else if (hasImage) {
      input.push({ type: 'image', data: String(imageBase64).trim(), mime_type: imageMime || 'image/png' });
    }
    /* v-omni-role-words: الإصدار الجديد بلا أيّ وسم (ولو كتبه المستخدم) — صورة الوصف الحرّ بلا إطار تبقى «the reference image» وحدها */
    if (words) prompt = stripRoleTags(prompt);
    input.push({ type: 'text', text: prompt });

    /* v-omni-store: النداء متزامن ويحجب دقيقة إلى ثلاث حتّى ينتهي التوليد، وحارس المهلة العامّ
       (_fetch-timeout.js) يقطع كلّ نداء بلا signal عند ٣٠ ثانية — فكان يُجهَض قبل أن يردّ المزوّد.
       من يمرّر signal خاصًّا يتركه الحارس وشأنه. ٢٧٠ث دون maxDuration المضبوط للدالّة،
       وv-omni-first-frame: ناقص ما أخذه أوّل الإطار (omniTimeoutFor). */
    const OMNI_TIMEOUT_MS = omniTimeoutFor(Date.now() - t0, Number(process.env.OMNI_TIMEOUT_MS || 270000));
    const upstream = await fetch(GL + '/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({
        model,
        input,
        response_format: { type: 'video', resolution, aspect_ratio: aspect, delivery: 'uri' },
        /* v-omni-store: طلب الفيديو كرابط (delivery:'uri') يشترط store:true — الرابط مرجع إلى
           مخرَج مخزَّن، فبلا تخزين لا شيء يُشار إليه ويُرفض الطلب كلّه («store=true is required
           when response format has video delivery set to URI»). توصية store:false في التوثيق
           تخصّ التسليم المضمَّن، وهو محجوب علينا: سقفه ٤م ومقاطعنا 720p/1080p أكبر منه. */
        background: false, store: true, stream: false,
      }, roleTask(!body.trend && hasImage && !(frame && frame.b64) ? 'ref' : '', words))), /* v-omni-role-words: صورة الوصف الحرّ بلا إطار = مرجع ملامح */
      signal: AbortSignal.timeout(OMNI_TIMEOUT_MS),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.omni_video, chargedPay);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      const msg = (data && data.error && data.error.message) ? data.error.message : JSON.stringify(data);
      console.error('[omni-create] upstream ' + upstream.status + ': ' + String(msg).slice(0, 300));
      const fail = require('./_videoFail.js').startFail(upstream.status, msg); /* v-credit-out: كان «أعد المحاولة» لكلّ رفض — نفاد رصيد المزوّد يُعاد ويُخصم ويُردّ بلا نهاية */
      res.status(fail.code).json(fail.body);
      return;
    }

    // استخرج مخرج الفيديو من steps → model_output → content[type=video].
    let uri = '', b64 = '', mime = 'video/mp4';
    for (const s of (data.steps || [])) {
      if (!s || s.type !== 'model_output') continue;
      for (const c of (s.content || [])) {
        if (c && c.type === 'video') { if (c.uri) uri = c.uri; if (c.data) b64 = c.data; if (c.mime_type) mime = c.mime_type; }
      }
    }
    if (!uri && !b64) {
      // اكتمل بلا فيديو (غالبًا حجبته فلاتر الأمان) — لا يُخصم شيء.
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.omni_video, chargedPay);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      res.status(502).json({ error: 'لم يُنتَج فيديو (قد يكون الطلب محجوبًا بفلاتر الأمان). جرّب وصفًا آخر.' });
      return;
    }

    if (uri) {
      // نمرّره عبر بروكسي veo-download (يضيف مفتاح Google لتنزيل ملفّ generativelanguage).
      res.status(200).json({ url: require('./veo-download.js').downloadUrl(uri) }); // v-video-open-lock: موقّع على الملفّ
    } else {
      res.status(200).json({ dataUrl: 'data:' + mime + ';base64,' + b64 });
    }
  } catch (e) {
    /* v-omni-refund: الاسترجاع أفضل جهد ولا يحجب الردّ — بلا هذا تحترق نقاط المستخدم عند كلّ انقطاع */
    try {
      const pl = require('./points.js');
      if (chargedUser) await pl.refundPoints(chargedUser, pl.COSTS.omni_video, chargedPay);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
    } catch (e2) { typeof require === 'function' && require('./_swallow.js').swallow(e2, '_lib/omni-create:193'); /* guard-ok — فشل الاسترجاع لا يُخفي الخطأ الأصليّ، ويُسجَّل أدناه */ }
    console.error('[omni-create] ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'تعذّر توليد الفيديو الآن. أعد المحاولة.', retryable: true });
  }
};

module.exports.FRAME_DECL = FRAME_DECL;
module.exports.FRAME_GUIDE = FRAME_GUIDE;
module.exports.framedPrompt = framedPrompt;
module.exports.roleWords = roleWords; // v-omni-role-words
module.exports.imageWords = imageWords;
module.exports.stripRoleTags = stripRoleTags;
module.exports.roleTask = roleTask;
module.exports.FRAME_DECL_WORDS = FRAME_DECL_WORDS;
module.exports.omniTimeoutFor = omniTimeoutFor;
module.exports.FN_MAX_MS = FN_MAX_MS;
module.exports.FRAME_BUDGET_MS = FRAME_BUDGET_MS;
module.exports.OMNI_MARGIN_MS = OMNI_MARGIN_MS;
