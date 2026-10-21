'use strict';
/* api/_lib/actor-status.js — v-actor-lipsync: استطلاع مهمّة «ممثل يتكلم» عند المحرّك (fal). شكل الردّ نفس veo-status
   (RUNNING / SUCCEEDED + output / FAILED + failure) فيستعمل العميل حلقته نفسها. انتهاء المهمّة يسوّي تذكرتها:
   الفشل يردّ الخصم ويفكّ القفل (video-job). المفتاح داخل المعالج ولا يصل المتصفّح أبدًا. */

const QUEUE = 'https://queue.fal.run/';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const id = String((req.query && req.query.id) || '');
    if (!/^[\w-]{8,80}$/.test(id)) { res.status(400).json({ error: 'Missing id' }); return; }
    const key = String(process.env.FAL_KEY || '').trim();
    if (!key) { res.status(500).json({ error: 'lipsync_unavailable' }); return; }
    const saved = await require('./kv.js').kvGetJSON('actor/req/' + id);
    const model = String(process.env.ACTOR_LIPSYNC_MODEL || '').trim() || require('./actor-create.js').LIPSYNC_MODEL_DEFAULT;
    const base = QUEUE + model.split('/').slice(0, 2).join('/') + '/requests/' + id;
    const statusUrl = (saved && saved.s) || base + '/status';
    const responseUrl = (saved && saved.r) || base;
    const auth = { headers: { Authorization: 'Key ' + key } };
    const settle = (ok) => require('./video-job.js').settleVideoJob('actor:' + id, ok);

    const st = await fetch(statusUrl, auth);
    const sd = await st.json().catch(() => ({}));
    if (!st.ok) {
      /* v-credit-out (أمر المالك ٢١ أكتوبر «ما تنخصم منه ولا نقطة»): المزوّد يرفض الاستطلاع نفسه لعطب عندنا (رصيده نفد، المفتاح، الصلاحيّة) — المهمّة لن
         تُتابَع أبدًا، وكانت تذكرتها تنتهي بعد ساعتين بلا ردّ. تُسوّى فشلًا الآن (مرّة واحدة) وunavailable يعرضه العميل «الخدمة متوقّفة مؤقّتًا». */
      if (require('./_videoFail.js').isOutage(st.status, JSON.stringify(sd))) {
        console.error('[actor-status] status HTTP ' + st.status + ' ' + JSON.stringify(sd).slice(0, 300));
        await settle(false);
        res.status(503).json({ error: 'unavailable', retryable: false });
        return;
      }
      res.status(st.status >= 500 ? 502 : st.status).json({ error: 'lipsync status ' + st.status }); return;
    }
    if (sd.status !== 'COMPLETED') { res.status(200).json({ status: 'RUNNING', queue: sd.queue_position }); return; }

    const rr = await fetch(responseUrl, auth);
    const rd = await rr.json().catch(() => ({}));
    const url = rd && rd.video && rd.video.url;
    if (!rr.ok || !url) {
      await settle(false);
      const why = String((rd && (rd.detail && (rd.detail[0] && rd.detail[0].msg || rd.detail))) || (rd && rd.error) || ('HTTP ' + rr.status));
      if (require('./_videoFail.js').isOutage(rr.status, why)) { console.error('[actor-status] result ' + why.slice(0, 300)); res.status(503).json({ error: 'unavailable', retryable: false }); return; } // v-credit-out: «User is locked. Exhausted balance» كان يصل المستخدم سببًا
      res.status(200).json({ status: 'FAILED', failure: why.slice(0, 300) });
      return;
    }
    await settle(true);
    await require('./our-media.js').rememberOurMedia([url]); // v-dl-ours: ناتج مدفوع — حفظه لا يُعدّ على سقف التنزيل
    res.status(200).json({ status: 'SUCCEEDED', output: [url] });
  } catch (e) {
    console.error('[actor-status] ' + (e && e.stack ? e.stack : e)); res.status(500).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' });
  }
};
