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

// v-video-sweep: يومان لا ساعتان — التذكرة تنتظر عودة صاحبها ليُكنس ما لم يُسلَّم (كانت تسقط بعد ساعتين بلا ردّ).
const TICKET_TTL_SEC = 2 * 86400;
/* v-video-sweep (أمر المالك ٢١ أكتوبر: «فيديو يسكّره المستخدم قبل ما يخلص: الخادم يرجّع نقاطه إذا ما انسلم الفيديو»): التذكرة كانت
   تُسوّى من الاستطلاع وحده، فمن أغلق التطبيق قبل النهاية لا يستطلع أحدٌ مهمّته. الآن لكلّ مستخدم قائمة بتذاكره المفتوحة، وعند قراءة
   رصيده (الواجهة تقرؤه عند كلّ فتح) تُسوّى فشلًا كلّ تذكرة تجاوزت STALE_MS بلا تسليم: التسليم الوحيد استطلاعٌ رجع SUCCEEDED وسوّاها،
   وأطول انتظار في الواجهة ١٥ دقيقة، فنصف ساعة بلا تسليم = لم يُسلَّم. «مرّة واحدة» هي نفسها (مفتاح التسوية): استطلاع متأخّر لا يردّ ثانية. */
const STALE_MS = 30 * 60 * 1000;
const OPEN_MAX = 30;
function openKey(username) {
  return 'vidjob:open:' + encodeURIComponent(String(username || '').trim().toLowerCase());
}

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
    // v-refund-kind: k = نوع الخصم (v صلاحيّة الباقة · m رصيد الاشتراك · p نقاط) وpl خانة الاشتراك، ليعود الردّ إليهما — بلا pay كما كان.
    const pay = j.pay && typeof j.pay === 'object' ? j.pay : null;
    await kv.kvSetRaw(ticketKey(taskId), JSON.stringify(Object.assign({
      u: String(j.username), c: cost, l: !!j.locked, q: !!j.quota,
    }, pay ? { k: pay.planVideo ? 'v' : (pay.media ? 'm' : 'p') } : {}, pay && pay.media && pay.pool ? { pl: String(pay.pool) } : {})), TICKET_TTL_SEC);
    try { // v-video-sweep: فهرس التذاكر المفتوحة — أفضل جهد، وعطبه سلوك ما قبل الكنس
      const prev = await kv.kvGetJSON(openKey(j.username));
      const list = (Array.isArray(prev) ? prev : []).filter((x) => x && x.id && x.id !== String(taskId)).slice(-(OPEN_MAX - 1));
      list.push({ id: String(taskId), at: Number(opt.now) || Date.now() });
      await kv.kvSetRaw(openKey(j.username), JSON.stringify(list), TICKET_TTL_SEC);
    } catch (e) { console.error('[video-job] open index write failed: ' + (e && e.message)); }
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
  const how = job.k ? { planVideo: job.k === 'v', media: job.k === 'm', pool: job.pl || '' } : undefined; // تذكرة قديمة بلا k = المطابقة بالمبلغ كما كانت
  try { await points.refundPoints(job.u, job.c, how); } catch (e) { console.error('[video-job] refund failed: ' + (e && e.message)); }
  if (job.l) {
    try { await guard.releaseVideoLock(job.u); } catch (e) { console.error('[video-job] unlock failed: ' + (e && e.message)); }
  }
  if (job.q) {
    try { await usage.releaseVideo(job.u); } catch (e) { console.error('[video-job] quota release failed: ' + (e && e.message)); }
  }
  return { settled: true, refunded: true, username: job.u, cost: job.c };
}

/* v-sec-video-verify: حكم المزوّد على مهمّة Runway قبل أن يردّ التنظيف نقاطها.
   skip = ليس معرّف Runway حديثًا (veo/minimax/قديم) → السلوك السابق. delivered/failed/pending/unknown
   من حالة Runway. fetch قابل للحقن للاختبار؛ أيّ تعذّر = unknown (لا ردّ، تبقى التذكرة). */
async function runwayVerdict(id, o) {
  const opt = o || {};
  const str = String(id || '');
  if (!/^\d+:.+/.test(str)) return 'skip';
  let rk, apiKey, rawId;
  try { rk = require('./runway-keys'); ({ key: apiKey, rawId } = rk.resolveTaskId(str)); } catch (e) { return 'unknown'; }
  if (!apiKey) return 'unknown';
  const fetchImpl = opt.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return 'unknown';
  try {
    const r = await fetchImpl(rk.RUNWAY_API_BASE + '/v1/tasks/' + encodeURIComponent(rawId), {
      method: 'GET', headers: { 'Authorization': 'Bearer ' + apiKey, 'X-Runway-Version': rk.RUNWAY_VERSION },
    });
    if (!r.ok) return 'unknown';
    const data = await r.json().catch(() => ({}));
    const st = String((data && data.status) || '').toUpperCase();
    if (st === 'SUCCEEDED') return 'delivered';
    if (st === 'FAILED' || st === 'CANCELLED') return 'failed';
    return 'pending';
  } catch (e) { return 'unknown'; }
}

/** v-video-sweep: يسوّي تذاكر المستخدم المفتوحة الأقدم من STALE_MS، بتأكيد المزوّد قبل الردّ. يرجع {refunded, points}. لا يرمي. */
async function sweepStaleVideoJobs(username, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const now = Number(opt.now) || Date.now();
  const out = { refunded: 0, points: 0 };
  if (!username) return out;
  let list;
  try { list = await kv.kvGetJSON(openKey(username)); } catch (e) { return out; }
  if (!Array.isArray(list) || !list.length) return out;
  const keep = [];
  for (const x of list) {
    if (!x || !x.id) continue;
    if (now - Number(x.at || 0) < STALE_MS) { keep.push(x); continue; }
    // v-sec-video-verify: نسأل المزوّد قبل الردّ. المُسلَّم يُسوّى بلا ردّ؛ غير المحسوم/تعذّر الوصول تبقى تذكرته.
    const verdict = await runwayVerdict(x.id, opt);
    if (verdict === 'delivered') { await settleVideoJob(x.id, true, opt); continue; }
    if (verdict === 'pending' || verdict === 'unknown') { keep.push(x); continue; }
    const r = await settleVideoJob(x.id, false, opt); // 'failed' أو 'skip': سُلِّم أو سُوّي من قبل = لا تذكرة = لا أثر
    if (r && r.refunded) { out.refunded++; out.points += Number(r.cost) || 0; }
  }
  try {
    if (keep.length) await kv.kvSetRaw(openKey(username), JSON.stringify(keep), TICKET_TTL_SEC);
    else await kv.kvDel(openKey(username));
  } catch (e) { /* guard-ok — المسوّى محسوم بمفتاح التسوية، والفهرس يسقط بعد يومين */ }
  return out;
}

module.exports = { TICKET_TTL_SEC, STALE_MS, ticketKey, rememberVideoJob, settleVideoJob, sweepStaleVideoJobs };
