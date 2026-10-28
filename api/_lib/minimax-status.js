// Vercel Serverless Function: polls a MiniMax video task and, once it succeeds,
// returns its temporary download URL. Normalizes the provider's shape to the
// same {status, output:[url]} the client already handles for Runway, so the
// client's poll loop stays uniform. Uses MINIMAX_API_KEY.
// v-minimax-h3 (١٠ أكتوبر ٢٠٢٦): واجهة v2 — GET /v2/query/video_generation/{task_id} يردّ { task: { status, content:{url}, error } }
// بحالات queued|running|succeeded|failed|cancelled. لا معرّف ملفّ ولا خطوة جلب ملفّ ولا حقل حالة داخليّ كما في v1.
const MM_BASE = (process.env.MINIMAX_API_BASE || 'https://api.minimax.io').replace(/\/+$/, '');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const taskId = req.query && (req.query.task_id || req.query.id);
    if (!taskId) { res.status(400).json({ error: 'Missing task_id' }); return; }
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) { console.error('[minimax-status] missing provider key'); res.status(500).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' }); return; }
    const auth = { 'Authorization': 'Bearer ' + apiKey };

    const q = await fetch(MM_BASE + '/v2/query/video_generation/' + encodeURIComponent(taskId), { headers: auth });
    const qd = await q.json().catch(() => ({}));
    const errBody = !!(qd && qd.type === 'error');
    if (!q.ok || errBody) {
      console.error('[minimax-status] query HTTP ' + q.status + ' ' + JSON.stringify(qd).slice(0, 300));
      /* v-credit-out (أمر المالك ٢١ أكتوبر «ما تنخصم منه ولا نقطة»): المزوّد يرفض الاستطلاع نفسه لعطب عندنا (رصيده نفد، المفتاح، الصلاحيّة) — المهمّة لن
         تُتابَع أبدًا، وكانت تذكرتها تنتهي بعد ساعتين بلا ردّ. تُسوّى فشلًا الآن (مرّة واحدة) وunavailable يعرضه العميل «الخدمة متوقّفة مؤقّتًا». */
      if (require('./_videoFail.js').isOutage(q.status, JSON.stringify(qd))) {
        await require('./video-job.js').settleVideoJob(taskId, false);
        res.status(503).json({ error: 'unavailable', retryable: false });
        return;
      }
      /* v-minimax-h3: v2 يردّ الخطأ بحالة HTTP غير ٢٠٠ وجسم { type:'error' }. ٤٢٩ و٥xx عابرة (المزوّد مشغول) فتبقى خطأً
         يحتمله حارس الاستطلاع في العميل؛ وما عداها (٤٠٠/٤٠٤/٤٢٢) نهائيّ لهذه المهمّة — المستخدم دفع ولن يستلم،
         فتُسوّى التذكرة فشلًا وتُردّ النقاط (روح v-video-retrieve-refund). */
      const transient = q.status === 429 || q.status >= 500;
      if (!transient) {
        await require('./video-job.js').settleVideoJob(taskId, false);
        res.status(200).json({ status: 'FAILED' });
        return;
      }
      res.status(q.status || 502).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' });
      return;
    }

    const task = (qd && qd.task) || {};
    const raw = String(task.status || '').toLowerCase();
    const done = raw === 'succeeded' || raw === 'success';
    // v-video-refund: الفشل يردّ الخصم ويفكّ قفل الثلاث دقائق (تذكرة سجّلها minimax-create).
    if (raw === 'failed' || raw === 'fail' || raw === 'cancelled' || raw === 'canceled') {
      if (task.error) console.error('[minimax-status] task error ' + JSON.stringify(task.error).slice(0, 200));
      await require('./video-job.js').settleVideoJob(taskId, false);
      res.status(200).json({ status: 'FAILED' });
      return;
    }
    if (!done) {
      // queued / running — لسّا شغّال.
      res.status(200).json({ status: 'RUNNING' });
      return;
    }

    const url = task.content && task.content.url;
    if (!url) {
      /* v-video-retrieve-refund (بموافقة المالك): التوليد نجح لكنّ رابط الملفّ لم يصل — المستخدم دفع
         ولم يستلم. تُسوّى التذكرة فشلًا فتُردّ النقاط ويُفكّ القفل وتُعاد حصّة اليوم. حارس «مرّة واحدة»
         في settleVideoJob يمنع الاسترجاع المزدوج لو نجح استطلاع لاحق. */
      console.error('[minimax-status] succeeded without content.url ' + JSON.stringify(task).slice(0, 300));
      await require('./video-job.js').settleVideoJob(taskId, false);
      res.status(200).json({ status: 'FAILED' });
      return;
    }

    await require('./video-job.js').settleVideoJob(taskId, true);
    await require('./our-media.js').rememberOurMedia([url]); // v-dl-ours: ناتج مدفوع — حفظه لا يُعدّ على سقف التنزيل
    res.status(200).json({ status: 'SUCCEEDED', output: [url] });
  } catch (e) {
    console.error('[minimax-status] ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' });
  }
};
