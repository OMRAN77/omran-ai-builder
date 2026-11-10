// Vercel Serverless Function: polls the status of a previously-created
// Runway video generation task using the site owner's own server-side API
// key (RUNWAY_API_KEY env var).
const RUNWAY_VERSION = '2024-11-06';
const { resolveTaskId, RUNWAY_API_BASE } = require('./runway-keys');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const id = req.query && req.query.id;
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const { key: apiKey, rawId } = resolveTaskId(id);
    // v-sec-video-canon: نسوّي التذكرة بالمعرّف القانونيّ لا بما أرسله العميل حرفيًّا — فتهجئة
    // بديلة («01:x» أو معرّف خام) لا تترك التذكرة الحقيقيّة مفتوحةً فيكنسها التنظيف ويردّ نقاطًا
    // لفيديو سُلِّم فعلًا. الاستطلاع الناجح يسوّيها «مُسلَّمة» مهما كانت التهجئة.
    const canonId = require('./runway-keys').canonicalId(id);
    if (!apiKey) {
      console.error('[video-status] missing provider key'); res.status(500).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' });
      return;
    }

    const upstream = await fetch(RUNWAY_API_BASE + '/v1/tasks/' + encodeURIComponent(rawId), {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'X-Runway-Version': RUNWAY_VERSION,
      },
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('[video-status] upstream ' + upstream.status + ': ' + JSON.stringify(data).slice(0, 300));
      /* v-credit-out (أمر المالك ٢١ أكتوبر «ما تنخصم منه ولا نقطة»): المزوّد يرفض الاستطلاع نفسه لعطب عندنا (رصيده نفد، المفتاح، الصلاحيّة) — المهمّة لن
         تُتابَع أبدًا، وكانت تذكرتها تنتهي بعد ساعتين بلا ردّ. تُسوّى فشلًا الآن (مرّة واحدة) وunavailable يعرضه العميل «الخدمة متوقّفة مؤقّتًا». */
      if (require('./_videoFail.js').isOutage(upstream.status, JSON.stringify(data))) {
        await require('./video-job.js').settleVideoJob(canonId, false);
        res.status(503).json({ error: 'unavailable', retryable: false });
        return;
      }
      res.status(upstream.status).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' });
      return;
    }

    // v-video-refund: المهمّة انتهت فاشلة (أو أُلغيت) → ردّ الخصم والقفل وحصّة اليوم مرّة واحدة.
    const st = String((data && data.status) || '').toUpperCase();
    if (st === 'FAILED' || st === 'CANCELLED') await require('./video-job.js').settleVideoJob(canonId, false);
    else if (st === 'SUCCEEDED') await require('./video-job.js').settleVideoJob(canonId, true);
    // v-video-open-lock: مخرجات سلّمها خادمنا — وحدها تقبلها ترقية الجودة (video-upscale-create.js)
    if (st === 'SUCCEEDED') await require('./video-upscale-create.js').rememberOutputs(data.output);
    if (st === 'SUCCEEDED') await require('./our-media.js').rememberOurMedia(data.output); // v-dl-ours: حفظه لا يُعدّ على سقف التنزيل
    res.status(200).json(data);
  } catch (e) {
    console.error('[video-status] ' + (e && e.stack ? e.stack : e)); res.status(500).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' });
  }
};
