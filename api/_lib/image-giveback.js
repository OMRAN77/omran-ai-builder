// api/_lib/image-giveback.js — v-unchanged-cap (١١ أكتوبر ٢٠٢٦، ثغرات الفلوس): سقف ردّ «لم يُنفَّذ» (٤٢٢ image_unchanged).
// ٤٢٢ لا يخرج إلّا بعد نداء محرّك صور مدفوع واحد على الأقلّ (والمحرّك الآخر غالبًا معه)، وكان يردّ الحصّة/النقاط بلا حدّ:
// زائر يكرّر الطلب نفسه يحرق نداءين مدفوعين في كلّ دورة وعدّاده يبقى صفرًا. الآن: أوّل IMAGE_UNCHANGED_FREE (افتراضيًّا ٢)
// في اليوم (UTC) لكلّ فاعل تُردّ كما كانت، وبعدها يبقى الخصم. عطب KV = ردّ كما كان (لا يُعاقَب الصادق على عطبنا،
// ومع عطب KV يسقط حجز الضيف والنقاط قبل أيّ محرّك أصلًا). البيئة تُقرأ داخل الدالّة لا في نطاق الوحدة.
const DAY_TTL_SEC = 172800;
const UNCHANGED_PREFIX = 'abuse:img-unchanged:';
const GUARD_PREFIX = 'abuse:img-guard:';
const GUARD_NAMESPACES = ['studio', 'fashion', 'portrait']; // كلّ ns يمرّ بـkeepGuardCharge — tests/image-guard-cap يستخرجها من الكود

/** هويّة الحساب في العدّادين ('u:' + الاسم مطبَّعًا): maha-image لـ«لم يُنفَّذ»، وkeepGuardCharge بعد ns. */
const userMeterId = (username) => 'u:' + String(username).trim().toLowerCase();
/** مفتاح عدّاد اليوم لهويّة — بانيه الوحيد (العدّ ونقله بتغيير الاسم). */
const meterKey = (id, day, prefix) => (prefix || UNCHANGED_PREFIX) + encodeURIComponent(String(id)).slice(0, 200) + ':' + day;

/** عدد الردود المجانيّة في اليوم لكلّ فاعل: ٠ = لا ردّ أبدًا؛ قيمة فاسدة = ٢. name: مفتاح البيئة (v-guard-cap: IMAGE_GUARD_FREE). */
function freeLimit(env, name) {
  const n = parseInt((env || process.env)[name || 'IMAGE_UNCHANGED_FREE'], 10);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

/** ids: هويّات الفاعل ('u:'+الحساب، أو مفتاح معرّف الضيف + مفتاح شبكته). true = يُردّ الخصم؛ false = يبقى.
    كلّ هويّة تزيد ذرّيًّا (SET NX EX ثمّ INCR)؛ تجاوز أيّ منها = يُنقص ما زيد في هذا النداء فلا يُعدّ ما لم يُردّ. */
async function unchangedGiveback(ids, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const limit = typeof opt.limit === 'number' ? opt.limit : freeLimit();
  const day = new Date(typeof opt.now === 'number' ? opt.now : Date.now()).toISOString().slice(0, 10);
  const taken = [];
  try {
    for (const id of (ids || []).filter(Boolean)) {
      const key = meterKey(id, day, opt.prefix);
      await kv.kvSetIfAbsent(key, 0, DAY_TTL_SEC);
      const n = Number(await kv.kvIncr(key));
      taken.push(key);
      if (n > limit) {
        for (const k of taken) { try { await kv.kvDecrBy(k, 1); } catch (e) { /* أفضل جهد — العدّاد يسقط مع اليوم */ } }
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error('[image-giveback] meter unavailable: ' + (e && e.message));
    return true;
  }
}

/* v-guard-cap (١١ أكتوبر ٢٠٢٦): ٤٢٢ الحارس (الهويّة/الأسلوب/«ما تغيّر») في أدوات الحصّة اليوميّة — الاستوديو والأزياء والبورتريه —
   يخرج بعد نداء صور مدفوع واحد على الأقلّ، وكان الحجز يُردّ دائمًا: خطوة سلسلة بصورة شخص آخر تفشل حتميًّا فتتكرّر بلا حدّ والعدّاد صفر.
   الآن أوّل IMAGE_GUARD_FREE (٢) في اليوم لكلّ حساب ولكلّ أداة (ns) تُردّ كما كانت، وبعدها يُستهلك المقعد قبل الردّ (consume يثبّت
   الحجز فلا يردّه إرسال الردّ). الرمز نفسه (لا يدّعي «ما انحسبت»)، وبلا إعادة تلقائيّة. المالك وVIP لا يُعدّون. العدّ بالحساب لا
   بالعنوان (مكتب خلف NAT واحد لا يتأثّر). عطب KV = ردّ كما كان. البيئة تُقرأ هنا لا في نطاق الوحدة. يرجع true إن بقي الخصم. */
async function keepGuardCharge(ns, quota, consume, o) {
  if (!quota || quota.unlimited || !quota.username) return false;
  const opt = Object.assign({ prefix: GUARD_PREFIX, limit: freeLimit(null, 'IMAGE_GUARD_FREE') }, o);
  if (await unchangedGiveback([ns + ':' + userMeterId(quota.username)], opt)) return false;
  try { await consume(quota.username, quota.limit); } catch (e) { console.warn('[image-giveback] guard charge failed: ' + (e && e.message)); return false; }
  return true;
}

/* المراجعة العدائيّة (img422-1، farm-6، INT-1): العدّادان بالحساب كانا يبقيان على الاسم القديم بتغيير الاسم — كلّ اسم جديد ردّان مجّانيّان
   جديدان لكلّ أداة (studio/fashion/portrait) و«لم يُنفَّذ» في مها، فالنداءات المدفوعة بلا حدّ والعدّاد صفر. الآن عدّادات اليوم تتبع الحساب
   كـ_dailyQuota.moveToday: INCRBY + EXPIRE على الجديد ثمّ حذف القديم (auth.moveLiveCounters). عطب KV = لا نقل، ويُسجَّل. */
async function moveToday(oldUser, newUser, o) {
  if (!oldUser || !newUser || userMeterId(oldUser) === userMeterId(newUser)) return;
  const day = new Date(o && typeof o.now === 'number' ? o.now : Date.now()).toISOString().slice(0, 10);
  const keysOf = (u) => GUARD_NAMESPACES.map((ns) => meterKey(ns + ':' + userMeterId(u), day, GUARD_PREFIX)).concat([meterKey(userMeterId(u), day, UNCHANGED_PREFIX)]);
  const from = keysOf(oldUser), to = keysOf(newUser);
  try {
    const kv = (o && o.kv) || require('./kv.js');
    const vals = await kv.kvPipeline(from.map((k) => ['GET', k]));
    const cmds = [];
    (vals || []).forEach((v, i) => {
      const n = parseInt(v, 10);
      if (n > 0) cmds.push(['INCRBY', to[i], String(n)], ['EXPIRE', to[i], String(DAY_TTL_SEC)], ['DEL', from[i]]);
    });
    if (cmds.length) await kv.kvPipeline(cmds);
  } catch (e) { console.warn('[image-giveback] rename meters not moved: ' + (e && e.message)); }
}

module.exports = { unchangedGiveback, freeLimit, keepGuardCharge, moveToday, userMeterId, meterKey, GUARD_NAMESPACES, GUARD_PREFIX, UNCHANGED_PREFIX };
