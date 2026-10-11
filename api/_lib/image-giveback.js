// api/_lib/image-giveback.js — v-unchanged-cap (١١ أكتوبر ٢٠٢٦، ثغرات الفلوس): سقف ردّ «لم يُنفَّذ» (٤٢٢ image_unchanged).
// ٤٢٢ لا يخرج إلّا بعد نداء محرّك صور مدفوع واحد على الأقلّ (والمحرّك الآخر غالبًا معه)، وكان يردّ الحصّة/النقاط بلا حدّ:
// زائر يكرّر الطلب نفسه يحرق نداءين مدفوعين في كلّ دورة وعدّاده يبقى صفرًا. الآن: أوّل IMAGE_UNCHANGED_FREE (افتراضيًّا ٢)
// في اليوم (UTC) لكلّ فاعل تُردّ كما كانت، وبعدها يبقى الخصم. عطب KV = ردّ كما كان (لا يُعاقَب الصادق على عطبنا،
// ومع عطب KV يسقط حجز الضيف والنقاط قبل أيّ محرّك أصلًا). البيئة تُقرأ داخل الدالّة لا في نطاق الوحدة.
const DAY_TTL_SEC = 172800;

/** عدد الردود المجانيّة في اليوم لكلّ فاعل: ٠ = لا ردّ أبدًا؛ قيمة فاسدة = ٢. */
function freeLimit(env) {
  const n = parseInt((env || process.env).IMAGE_UNCHANGED_FREE, 10);
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
      const key = 'abuse:img-unchanged:' + encodeURIComponent(String(id)).slice(0, 200) + ':' + day;
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

module.exports = { unchangedGiveback, freeLimit };
