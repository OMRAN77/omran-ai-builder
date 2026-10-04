// v-media-purge (المالك ٤ أكتوبر: Redis المجانيّة ٢٥٦ م.ب امتلأت فرُفضت كلّ كتابة — حفظ المحادثات والذاكرة
// وسجلّ الأخطاء — وأمر: «أحذف صور وملفات المشاركة القديمة… والحسابات والمحادثات ما تنلمس»).
// روابط المشاركة وحدها (db/img · db/file · db/pdf ومقاطعها <id>:<i>) — لا حسابات ولا محادثات ولا ذاكرة.
// صور المحادثة نفسها على جهاز المستخدم؛ هذه نسخ روابط «مشاركة/تنزيل» مؤقّتة بعمر محدّد أصلًا.
// العمر من TTL المتبقّي: المفتاح كُتب بعمر ttlSec، فما مضى = ttlSec − المتبقّي. بالدفعات عبر /pipeline،
// وDEL يعمل حتّى والقاعدة ممتلئة.
const GROUPS = [
  // الصور: القديمة كُتبت بعمر ٣٠ يومًا والجديدة بـ٧ — المتبقّي ≤ ٧ أيّام ملتبس (جديدة أو قديمة تنتهي قريبًا) فلا يُمسّ.
  { prefix: 'db/img/', ttlSec: 60 * 60 * 24 * 30, keepIfTtlBelow: 60 * 60 * 24 * 7 },
  { prefix: 'db/file/', ttlSec: 60 * 60 * 24 * 7 },
  { prefix: 'db/pdf/', ttlSec: 60 * 60 * 24 * 7 },
];
const BATCH = 200;

async function purgeOldShares(kv, opts) {
  const days = (opts && opts.maxAgeDays != null) ? Number(opts.maxAgeDays) : 7;
  const maxAgeSec = Math.max(0, days) * 86400;
  const out = { scanned: 0, deleted: 0, byPrefix: {} };
  for (const g of GROUPS) {
    const keys = await kv.kvList(g.prefix);
    let del = 0;
    for (let i = 0; i < keys.length; i += BATCH) {
      const part = keys.slice(i, i + BATCH);
      const ttls = await kv.kvPipeline(part.map((k) => ['TTL', k]));
      // -1 = بلا عمر (لا يُفترض أن يوجد) يُحذف؛ -2 = انتهى للتوّ.
      const old = part.filter((k, j) => {
        const t = Number(ttls[j]);
        if (t === -1) return true;
        if (t < 0 || (g.keepIfTtlBelow && t <= g.keepIfTtlBelow)) return false;
        return g.ttlSec - t > maxAgeSec;
      });
      if (old.length) { await kv.kvPipeline([['DEL'].concat(old)]); del += old.length; }
    }
    out.scanned += keys.length;
    out.deleted += del;
    out.byPrefix[g.prefix] = { scanned: keys.length, deleted: del };
  }
  return out;
}

// v-media-autopurge (المالك ٤ أكتوبر: «لا تسأل… صلحه»): حفظ رابط مشاركة رُفض لأنّ القاعدة ممتلئة = تنظيف
// روابط المشاركة القديمة (القاعدة نفسها التي وافق عليها المالك) مرّة كلّ ١٠ دقائق للعمليّة، ثمّ إعادة الحفظ مرّة.
// حدّ الطلبات اليوميّ ليس امتلاءً — لا يُنظَّف له.
const FULL_RE = /OOM|maxmemory|max(imum)? (database|data|db) size|database size limit|exceeds? .*(storage|size) limit/i;
let lastAuto = 0, running = null;
function isStoreFull(e) { return FULL_RE.test(String((e && e.message) || e || '')); }
async function setIfAbsentWithRoom(kv, key, value, ttlSec) {
  try {
    return await kv.kvSetIfAbsent(key, value, ttlSec);
  } catch (e) {
    if (!isStoreFull(e)) throw e;
    if (!running && Date.now() - lastAuto > 10 * 60 * 1000) {
      lastAuto = Date.now();
      running = purgeOldShares(kv, { maxAgeDays: 7 }).catch(() => null).finally(() => { running = null; });
    }
    if (running) await running;
    return await kv.kvSetIfAbsent(key, value, ttlSec);
  }
}

module.exports = { purgeOldShares, GROUPS, setIfAbsentWithRoom, isStoreFull, _resetAuto: () => { lastAuto = 0; running = null; } };
