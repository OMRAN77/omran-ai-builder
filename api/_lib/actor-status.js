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
    if (!st.ok) { res.status(st.status >= 500 ? 502 : st.status).json({ error: 'lipsync status ' + st.status }); return; }
    if (sd.status !== 'COMPLETED') { res.status(200).json({ status: 'RUNNING', queue: sd.queue_position }); return; }

    const rr = await fetch(responseUrl, auth);
    const rd = await rr.json().catch(() => ({}));
    const url = rd && rd.video && rd.video.url;
    if (!rr.ok || !url) {
      await settle(false);
      const why = String((rd && (rd.detail && (rd.detail[0] && rd.detail[0].msg || rd.detail))) || (rd && rd.error) || ('HTTP ' + rr.status));
      res.status(200).json({ status: 'FAILED', failure: why.slice(0, 300) });
      return;
    }
    await settle(true);
    res.status(200).json({ status: 'SUCCEEDED', output: [url] });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
