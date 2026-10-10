// Vercel Serverless Function: polls a MiniMax (Hailuo) video task and, once it
// succeeds, resolves the temporary download URL. Normalizes MiniMax's shape to
// the same {status, output:[url]} the client already handles for Runway, so the
// client's poll loop stays uniform. Uses MINIMAX_API_KEY (and optional
// MINIMAX_GROUP_ID, required by the files/retrieve endpoint on some accounts).
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
    const groupId = process.env.MINIMAX_GROUP_ID || '';

    const q = await fetch(MM_BASE + '/v1/query/video_generation?task_id=' + encodeURIComponent(taskId), { headers: auth });
    const qd = await q.json().catch(() => ({}));
    if (!q.ok) {
      console.error('[minimax-status] query HTTP ' + q.status + ' ' + JSON.stringify(qd).slice(0, 300));
      res.status(q.status).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' });
      return;
    }

    const raw = String(qd.status || '').toLowerCase();
    const done = raw === 'success' || raw === 'succeeded';
    /* v-video-poll: المزوّد يردّ ٢٠٠ مع base_resp.status_code≠0 عند الرفض المنطقيّ، وبلا حقل status
       إطلاقًا — فكان يقع في فرع «لسّا شغّال» فيبقى المستخدم على «⏳ يولّد الفيديو» أبدًا ولا تُسوّى
       تذكرته فلا تُردّ نقاطه. الإنشاء يفحص base_resp من قبل، والاستطلاع لم يكن يفحصه. */
    const rejected = !done && !!(qd && qd.base_resp && Number(qd.base_resp.status_code) !== 0);
    // v-video-refund: الفشل يردّ الخصم ويفكّ قفل الثلاث دقائق (تذكرة سجّلها minimax-create).
    if (raw === 'fail' || raw === 'failed' || rejected) {
      if (rejected) console.error('[minimax-status] base_resp ' + JSON.stringify(qd.base_resp).slice(0, 200));
      await require('./video-job.js').settleVideoJob(taskId, false);
      res.status(200).json({ status: 'FAILED' });
      return;
    }
    if (!done) {
      // Preparing / Queueing / Processing — لسّا شغّال.
      res.status(200).json({ status: 'RUNNING' });
      return;
    }

    const fileId = qd.file_id;
    if (!fileId) { res.status(200).json({ status: 'RUNNING' }); return; }
    let retrieveUrl = MM_BASE + '/v1/files/retrieve?file_id=' + encodeURIComponent(fileId);
    if (groupId) retrieveUrl += '&GroupId=' + encodeURIComponent(groupId);
    const f = await fetch(retrieveUrl, { headers: auth });
    const fd = await f.json().catch(() => ({}));
    const url = fd && fd.file && (fd.file.download_url || fd.file.backup_download_url);
    if (!f.ok || !url) {
      /* v-video-retrieve-refund (بموافقة المالك): التوليد نجح لكنّ رابط الملفّ لم يصل — المستخدم دفع
         ولم يستلم. تُسوّى التذكرة فشلًا فتُردّ النقاط ويُفكّ القفل وتُعاد حصّة اليوم. حارس «مرّة واحدة»
         في settleVideoJob يمنع الاسترجاع المزدوج لو نجح استطلاع لاحق. */
      console.error('[minimax-status] retrieve HTTP ' + f.status + ' ' + JSON.stringify(fd).slice(0, 300));
      await require('./video-job.js').settleVideoJob(taskId, false);
      res.status(f.ok ? 502 : f.status).json({ error: 'تعذّر تحميل الفيديو الآن. أعد المحاولة.' });
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
