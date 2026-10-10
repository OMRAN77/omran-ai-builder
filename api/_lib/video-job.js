// api/_lib/video-job.js — v-video-refund (قرار ٢٨ سبتمبر ٢٠٢٦): الفيديو الذي يفشل **بعد** قبول
// المزوّد لا يكلّف المستخدم شيئًا.
//
// الجذر: v-plan-routing نصّ على «القفل يُفكّ عند فشل المزوّد مع ردّ النقاط»، ونُفِّذ للفشل
// المتزامن وحده (ردّ الإنشاء نفسه). لكنّ المحرّكات الثلاثة غير المتزامنة (Runway · Veo ·
// الاقتصاديّ) تقبل المهمّة ثمّ تفشل لاحقًا عند الاستطلاع — وأشيع أسبابه فلتر أمان المزوّد على
// صورة شخص. وقتها لم يكن أحد يردّ الخصم ولا يفكّ قفل الثلاث دقائق: مشترك الفيديو (باقتا ٧٥
// و٣٧٥ = فيديوهان وثلاثة) يخسر واحدًا بلا ناتج، وإعادة المحاولة فورًا ترجع `video_cooldown`.
//
// الحلّ: الإنشاء يسجّل تذكرة بمعرّف المهمّة {المستخدم · التكلفة · هل قُفل · هل خُصمت حصّة اليوم}،
// والاستطلاع يسوّيها: الفشل يردّ كلّ ما خُصم، والنجاح يمحو التذكرة فقط. «مرّة واحدة» محروسة
// بـSET NX على مفتاح تسوية منفصل، فاستطلاعان متزامنان (نافذتان مفتوحتان) لا يردّان مرّتين.
// عطب KV لا يوقف شيئًا: التسجيل والتسوية أفضل جهد، وأسوأ حالاته سلوك ما قبل هذا الملفّ.
const crypto = require('crypto');

// ساعتان تكفيان أطول مهمّة فيديو عند أيّ من المحرّكات الثلاثة.
const TICKET_TTL_SEC = 7200;

function ticketKey(taskId) {
  return 'vidjob:' + crypto.createHash('sha1').update(String(taskId || '')).digest('hex');
}

/** يسجّل ما خُصم على مهمّة قبِلها المزوّد. لا تذكرة لمن لم يُخصم منه (المالك). */
async function rememberVideoJob(taskId, job, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const j = job || {};
  const cost = Math.max(0, Math.floor(Number(j.cost) || 0));
  if (!taskId || !j.username || !cost) return false;
  try {
    await kv.kvSetRaw(ticketKey(taskId), JSON.stringify({
      u: String(j.username), c: cost, l: !!j.locked, q: !!j.quota,
    }), TICKET_TTL_SEC);
    return true;
  } catch (e) {
    console.error('[video-job] ticket write failed: ' + (e && e.message));
    return false;
  }
}

/**
 * يسوّي مهمّة انتهت: ok=false يردّ النقاط/رصيد الاشتراك ويفكّ قفل الثلاث دقائق ويعيد حصّة
 * اليوم، وok=true يمحو التذكرة وحدها. يرجع null إن لا تذكرة أو سوّاها نداءٌ آخر قبله.
 */
async function settleVideoJob(taskId, ok, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  if (!taskId) return null;
  const key = ticketKey(taskId);
  // kvGetJSON عقده «لا شيء عند العطب»: تخزين معطّل أو مفقود = لا تذكرة = لا تسوية،
  // وهو سلوك ما قبل هذا الملفّ بالضبط. لا تُقرأ الأسرار ولا تُنادى Redis في نطاق الوحدة.
  const job = await kv.kvGetJSON(key);
  if (!job || !job.u) return null;
  // حارس «مرّة واحدة»: من ينشئ مفتاح التسوية هو وحده من يردّ؛ الباقي يخرج بلا أثر.
  let mine = false;
  try {
    mine = await kv.kvSetIfAbsent(key + ':done', ok ? '1' : '0', TICKET_TTL_SEC);
  } catch (e) {
    console.error('[video-job] settle claim failed: ' + (e && e.message));
    return null;
  }
  if (!mine) return null;
  try { await kv.kvDel(key); } catch (e) { /* أفضل جهد — التذكرة تسقط بعد ساعتين */ }
  if (ok) return { settled: true, refunded: false, username: job.u };

  const points = opt.points || require('./points.js');
  const guard = opt.guard || require('./abuse-guard.js');
  const usage = opt.usage || require('./_videoUsage.js');
  try { await points.refundPoints(job.u, job.c); } catch (e) { console.error('[video-job] refund failed: ' + (e && e.message)); }
  if (job.l) {
    try { await guard.releaseVideoLock(job.u); } catch (e) { console.error('[video-job] unlock failed: ' + (e && e.message)); }
  }
  if (job.q) {
    try { await usage.releaseVideo(job.u); } catch (e) { console.error('[video-job] quota release failed: ' + (e && e.message)); }
  }
  return { settled: true, refunded: true, username: job.u, cost: job.c };
}

module.exports = { TICKET_TTL_SEC, ticketKey, rememberVideoJob, settleVideoJob };
