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
/* v-lock-vid (srv-video-1، باب المال بموافقة المالك ٢٧ أكتوبر «صلح الخطير»): الكنس يردّ تذاكر غير Runway بلا سؤال المزوّد، ثمّ كان
   الاستطلاع يسلّم الفيديو نفسه — settleVideoJob(…, true) يرجع null ولا يفحصه أحد — فيصير الفيديو مجّانيًّا ويتكرّر بسكربت. وكذلك ردّ
   الاستطلاع عند عطل المزوّد أو تعذّر الرابط ثمّ نجاحه لاحقًا. الآن «لا تسليم فوق ردّ» (كـvideo-enhance): مفتاح التسوية '0' يرجع
   {refunded} فتردّ نقاط الاستطلاع الأربع FAILED بلا رابط، ويبقى بلا مدّة (أ أدناه) — وإلّا سلّم الاستطلاع بعد سقوطه. التسليم الذي لا يُحسم (حجزٌ تعطّل والتذكرة مفتوحة) {pending} = RUNNING ويعيد العميل: تسليمه الآن يترك التذكرة
   للكنس فيردّها بعد التسليم.
   v-lock-vid-r (الجولة الثانية، مراجعة معاكسة): (أ) علامة «رُدّت» بلا مدّة — ٣٠ يومًا كانت تسقط والمزوّد قد يحفظ الناتج أطول (fal وMiniMax
   بمدّة غير معلنة) فيعود التسليم؛ مفتاح صغير لكلّ فيديو رُدّ. (ب) ما لا يُقرأ لا يُسلَّم: التسليم يقرأ التذكرة والعلامة صارمًا، فالقراءة
   المرنة كانت تبتلع العطل وترجع null فيُقرأ «لا تذكرة» أو «لا علامة» ويُسلَّم والتذكرة مفتوحة (يردّها الكنس بعده) أو بعد ردّ. وتذكرة
   مفتوحة بلا علامة بعد حجز خاسر (SET NX بردّ ٢٠٠ لا يُقرأ يرجع false ولم يكتب) لم تُحسم كذلك: {pending} = RUNNING. */
const DELIVERY_PENDING = Object.freeze({ settled: false, refunded: false, pending: true });
/* v-lock-port-vid-r (الجولة الثالثة، مراجعة معاكسة للنقل): «0» كان يُكتب قبل أن يقع الردّ — SET NX يكتبه ثمّ يضيع ردّه (مهلة بعد الكتابة، أو
   ٢٠٠ لا يُقرأ) فيُقرأ «سوّاها غيري» وتسقط المهمّة من الفهرس، أو يرمي refundPoints ويُعدّ ردًّا: لا ردّ ولا تسليم للأبد. الآن حجز الردّ
   يحمل رمز كاتبه '0:<16 hex>' فيقرؤه صاحبه بعد ضياع الردّ ويكمل (ومن يرى رمزًا غير رمزه لا يردّ — لا ردّ مرّتين)، ورمية refundPoints
   تفكّ الحجز، وما لم يُحسم {retry} يبقى في الفهرس للكنس التالي. عطلان متتاليان (ضاع الردّ ثمّ تعذّرت قراءة الحجز) يبقيان كما كانا: لا ردّ
   ثانٍ مقدَّم على ردّ ضائع. */
const REFUND_RETRY = Object.freeze({ settled: false, refunded: false, retry: true });
const isRefundMark = (v) => { const s = String(v); return s === '0' || s.indexOf('0:') === 0; }; // '0' قبل هذا النشر، و'0:<رمز>' بعده
/* v-lock-vid-r: تخزين غير مهيّأ أصلًا لا تذكرة فيه ولا علامة (الإنشاء لم يكتب شيئًا) = سلوك ما قبل الملفّ، لا عطلًا عابرًا يُنتظر */
const kvUnconfigured = (e) => !!(e && e.code === 'kv_unconfigured');
/** v-lock-vid: حكم التسليم لمهمّة لم يحجز هذا النداء تسويتها — علامة الردّ = رُدّت (لا رابط)، وغيرها يسلَّم كما كان. */
async function deliveryVerdict(kv, key, hadTicket) {
  let done;
  try { done = await kv.kvGetJSON(key + ':done', { strict: true }); } catch (e) { // v-lock-vid-r: العلامات JSON صالح، والصارم يرمي عند العطل
    if (kvUnconfigured(e)) return null;
    console.error('[video-job] settle marker read failed: ' + (e && e.message));
    return DELIVERY_PENDING; // لا نعرف أسُلّمت أم رُدّت — يعيد العميل
  }
  if (done == null) return hadTicket ? DELIVERY_PENDING : null; // بلا تذكرة ولا علامة: المالك ومهمّة بلا خصم كما كانا
  if (isRefundMark(done)) return { settled: false, refunded: true, blocked: true };
  return null;
}
function openKey(username) {
  return 'vidjob:open:' + encodeURIComponent(String(username || '').trim().toLowerCase());
}

/* v-lock-port-vid-r: هويّة المهمّة عند المزوّد لا تهجئتها — تهجئتان يقرؤهما المزوّد مهمّةً واحدة تُسوّيان بمفتاح واحد:
   Runway «الفهرس:المعرّف» بحروف صغيرة (معرّفاته UUID صغيرة، والكبيرة قد يقرؤها المهمّةَ نفسها: ردّ عطلنا ٤٠٢ ثمّ الاستطلاع بالكبيرة كان
   يسلّم، أو يسلّم بالكبيرة ثمّ يُردّ)، وعمليّة Veo بمعرّفها وحده («models/<نموذج>/» قد يتجاهله جوجل). المعرّفات الحقيقيّة صغيرة أصلًا
   فمفاتيحها كما كانت، وVeo المباشر متوقّف منذ ٢٢ أكتوبر (نماذجه أُزيلت، v-trend-omni) فلا تذكرة مفتوحة بمفتاحه السابق. */
function jobIdentity(taskId) {
  const s = String(taskId || '');
  let m = /^(\d+):(.+)$/.exec(s);
  if (m) return m[1] + ':' + m[2].toLowerCase();
  m = /^models\/[^/]+\/operations\/([^/]+)$/.exec(s);
  if (m) return 'veo-op:' + m[1];
  return s;
}
function ticketKey(taskId) {
  return 'vidjob:' + crypto.createHash('sha1').update(jobIdentity(taskId)).digest('hex');
}

/* v-lock-port-vid-r: رقم طابور fal واحد بمفتاحي تذكرة — «ممثل يتكلم» actor:<uuid> (actor-create) واحتياط الفيديو bk/<uuid>
   (fal-fallback.VIDEO_OP_PREFIX)، على حساب FAL_KEY نفسه. actor-status وfalStatus يبنيان رابط الطابور من الرقم وحده إن غاب سجلّه، فإن قرأ fal
   الطلب برقمه أيًّا كان مسار التطبيق في الرابط سلّم كلّ باب فيديو الآخر: بعد ردّه، أو قبل أن يكنسه الكنس فيُردّ بعد التسليم. المفتاحان
   باقيان (تذاكر مفتوحة قبل النشر)، والتسليم بأحدهما يسوّي الآخر أوّلًا: رُدّ = لا تسليم، لم يُحسم = RUNNING، مفتوح = يُسوّى تسليمًا. */
const FAL_ALIAS_RE = /^(actor:|bk\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
function deliveryAliases(taskId) {
  const m = FAL_ALIAS_RE.exec(String(taskId || ''));
  return m ? [(m[1] === 'actor:' ? 'bk/' : 'actor:') + m[2]] : [];
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
 * v-lock-vid: مع ok=true يرجع {refunded:true} إن رُدّت المهمّة قبله (لا تسليم)، و{pending:true} إن لم يُحسم (RUNNING).
 * v-lock-port-vid-r: مع ok=false يرجع {retry:true} إن لم يُحسم الردّ (تبقى المهمّة في فهرس الكنس)؛ ومع ok=true يُسوّى رقم fal الآخر أوّلًا.
 */
async function settleVideoJob(taskId, ok, o) {
  const opt = o || {};
  if (!taskId) return null;
  if (ok) {
    for (const alias of deliveryAliases(taskId)) { // v-lock-port-vid-r: رُدّ أو لم يُحسم بالباب الآخر = لا تسليم من هذا
      const v = await settleOne(alias, true, opt);
      if (v && (v.pending || v.refunded)) return v;
    }
  }
  return settleOne(taskId, ok, opt);
}

async function settleOne(taskId, ok, opt) {
  const kv = opt.kv || require('./kv.js');
  const key = ticketKey(taskId);
  // لا تُقرأ الأسرار ولا تُنادى Redis في نطاق الوحدة. v-lock-vid-r: التسليم يقرأ صارمًا، وعطل القراءة {pending} لا «لا تذكرة» (تسليم
  // والتذكرة مفتوحة يردّها الكنس بعده). v-lock-port-vid-r: والردّ كذلك — عطل القراءة {retry} لا «لا تذكرة» (كانت تسقط من الفهرس بلا ردّ).
  let job;
  try { job = await kv.kvGetJSON(key, { strict: true }); } catch (e) {
    if (kvUnconfigured(e)) return null; // بلا تخزين أصلًا: لا تذاكر = سلوك ما قبل هذا الملفّ
    console.error('[video-job] ticket read failed: ' + (e && e.message));
    return ok ? DELIVERY_PENDING : REFUND_RETRY;
  }
  if (!job || !job.u) return ok ? deliveryVerdict(kv, key, false) : null; // v-lock-vid: رُدّت ومُحيت تذكرتها = لا تسليم
  // حارس «مرّة واحدة»: من ينشئ مفتاح التسوية هو وحده من يردّ أو يسلّم؛ الباقي يخرج بلا أثر.
  if (ok) {
    let mine = false;
    try { mine = await kv.kvSetIfAbsent(key + ':done', '1', TICKET_TTL_SEC); } catch (e) {
      console.error('[video-job] settle claim failed: ' + (e && e.message));
      return DELIVERY_PENDING;
    }
    if (!mine) return deliveryVerdict(kv, key, true);
    try { await kv.kvDel(key); } catch (e) { /* أفضل جهد — علامة التسليم تحسم، والتذكرة تسقط بعد يومين */ }
    return { settled: true, refunded: false, username: job.u };
  }
  // v-lock-vid-r: «رُدّت» بلا مدّة — لا تسليم بعدها أبدًا. v-lock-port-vid-r: بالرمز يُعرف الحاجز إن ضاع ردّ SET NX.
  const claim = '0:' + crypto.randomBytes(8).toString('hex');
  let mine = false;
  try { mine = await kv.kvSetIfAbsent(key + ':done', JSON.stringify(claim)); } catch (e) {
    console.error('[video-job] refund claim failed (reading it back): ' + (e && e.message));
  }
  if (!mine) {
    let done;
    try { done = await kv.kvGetJSON(key + ':done', { strict: true }); } catch (e) {
      console.error('[video-job] refund claim read-back failed: ' + (e && e.message));
      return REFUND_RETRY;
    }
    if (done == null) return REFUND_RETRY; // لم يُكتب الحجز: التذكرة مفتوحة كما كانت، والكنس التالي يعيد
    if (String(done) !== claim) return null; // سلّمها غيري ('1') أو حجز ردّها غيري برمزه — هو يردّ، لا أنا
  }

  const points = opt.points || require('./points.js');
  const guard = opt.guard || require('./abuse-guard.js');
  const usage = opt.usage || require('./_videoUsage.js');
  const how = job.k ? { planVideo: job.k === 'v', media: job.k === 'm', pool: job.pl || '' } : undefined; // تذكرة قديمة بلا k = المطابقة بالمبلغ كما كانت
  try { await points.refundPoints(job.u, job.c, how); } catch (e) {
    /* v-lock-port-vid-r: refundPoints يسجّل أعطال القيد ويبتلعها، فرميته قبل أن يمسّ الرصيد (قراءة VIP) — لا يُعدّ ردًّا: يُفكّ الحجز فتعود
       المهمّة مفتوحة كما كانت (الكنس التالي يردّها، أو يستلمها صاحبها)، والتذكرة لم تُمحَ بعد. */
    console.error('[video-job] refund failed, claim released: ' + (e && e.message));
    try { await kv.kvDel(key + ':done'); } catch (e2) { console.error('[video-job] claim release failed: ' + (e2 && e2.message)); }
    return REFUND_RETRY;
  }
  try { await kv.kvDel(key); } catch (e) { /* أفضل جهد — علامة الردّ تحسم (من يرى رمزًا غير رمزه لا يردّ)، والتذكرة تسقط بعد يومين */ }
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
    if (r && r.retry) { keep.push(x); continue; } // v-lock-port-vid-r: لم يُحسم الردّ (عطل تخزين أو رمية refundPoints) — يعيده الكنس التالي
    if (r && r.refunded) { out.refunded++; out.points += Number(r.cost) || 0; }
  }
  try {
    if (keep.length) await kv.kvSetRaw(openKey(username), JSON.stringify(keep), TICKET_TTL_SEC);
    else await kv.kvDel(openKey(username));
  } catch (e) { /* guard-ok — المسوّى محسوم بمفتاح التسوية، والفهرس يسقط بعد يومين */ }
  return out;
}

module.exports = { TICKET_TTL_SEC, STALE_MS, ticketKey, deliveryAliases, rememberVideoJob, settleVideoJob, sweepStaleVideoJobs };
