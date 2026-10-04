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

module.exports = { purgeOldShares, GROUPS };
