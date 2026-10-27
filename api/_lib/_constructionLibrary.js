// Shared helper: growing library of saved construction designs (2D plans).
// Each generated design is saved as one JSON record in Upstash Redis so
// future users can browse similar designs (by floors + area range) before
// paying for a brand-new AI generation. Follows the same per-item KV pattern
// used across this app (auth.js, feedback.js).
const crypto = require('crypto');
const { kvGetJSON, kvPipeline } = require('./kv.js');

function itemPath(id) { return 'db/construction-library/' + id + '.json'; }

/* v-audit-stud2 (srv-studios-2-1 · 2-2، تدقيق التطبيق كاملًا): كلّ تصميم كان يُحفظ بصورة مخطّطه كاملة (مئات الكيلوبايت إلى ~٣ م.ب)
   بـSET بلا مدّة ولا تنظيف — Redis المجّانيّة (٢٥٦ م.ب) امتلأت قبلًا (v-redis-capacity) فتُرفض كلّ كتابة في التطبيق. والقائمة
   كانت SCAN على مساحة المفاتيح كلّها ثمّ GET لكلّ سجلّ بصورته، لطلب بلا جلسة، وردّ بـ١٢ صورة كاملة يتجاوز حدّ الدالّة (٤٫٥ م.ب)
   فيظهر «لا توجد تصاميم». الآن:
   • السجلّ بمدّة صلاحية في أمر SET نفسه، والمخطّط مصغّر WebP بعرض ١٠٢٤ (img-convert.toCardWebp)، وما بقي أكبر من السقف لا يُحفظ.
   • فهرس صغير (قائمة Redis، سطر وصف لكلّ تصميم بلا صورة) بسقف عدد: ما يُتجاوز يُقصّ من الفهرس ويُحذف سجلّه (الأقدم أوّلًا).
   • القائمة تُصفّى على الفهرس، ثمّ تُجلب سجلّات المختارة وحدها، بميزانيّة بايتات تحت حدّ الردّ.
   السجلّات القديمة قبل هذا (بلا مدّة ولا فهرس) لا تُمسّ ولا تُحذف — ولا تُعرض في القائمة (قرار حذفها للمالك). */
const INDEX_KEY = 'db/construction-library-index';
const LIB_TTL_SEC = 30 * 86400;   // ٣٠ يومًا (media-purge.GROUPS يستعمل العمر نفسه)
const LIB_MAX = 120;              // سقف عدد التصاميم المحفوظة
const LIB_IMG_MAX = 600000;       // أحرف base64 لمخطّط السجلّ الواحد (~٤٥٠ ك.ب) — المصغّر المعتاد أقلّ بكثير
const LIST_BYTES_MAX = 3500000;   // صور ردّ القائمة معًا — تحت حدّ ردّ الدالّة ٤٫٥ م.ب بهامش
function parseMeta(s) {
  try { const m = JSON.parse(s); return m && typeof m.id === 'string' && m.id ? m : null; } catch (e) { return null; } // سطر تالف = يُتجاهل
}

// v-cx-lib (تدقيق ١٨–١٩ أكتوبر: «المكتبة تعرض مخطّطات بالإسبانيّ والإندونيسيّ والإنجليزيّ لمستخدم عربيّ»):
// construction-create يكتب أسماء الغرف بالعربيّة لـar/ur، وبلغة التطبيق إن كانت في LANG_NAMES، وبالإنجليزيّة لما عداها.
// كلّ تصميم يُحفظ بلغة تسمياته، والقائمة لا تعرض إلّا لغة الطالب. السجلّات القديمة بلا لغة (صورة ومفاتيح فقط، لا نصّ
// يُستدلّ منه) لا تُعرف لغتها فلا تُعرض في قائمة لغة — ولا يُحذف منها شيء. طلب بلا لغة (عميل قديم) يرى الكلّ كما كان.
const PLAN_LANGS = ['ar', 'en', 'fr', 'hi', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
function planLang(l) {
  const s = String(l || '').toLowerCase();
  if (!s) return '';
  if (s === 'ur') return 'ar';
  return PLAN_LANGS.includes(s) ? s : 'en';
}

async function saveDesign(entry) {
  const id = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
  const record = Object.assign({ id, createdAt: Date.now() }, entry);
  if (record.lang !== undefined) record.lang = planLang(record.lang) || 'ar';
  try { /* v-audit-stud2: مصغّر WebP بدل الصورة الكاملة — حين يصغر فعلًا */
    const w = await require('./img-convert.js').toCardWebp(record.planImageBase64, 1024, 85);
    if (w && w.b64 && w.b64.length < String(record.planImageBase64 || '').length) { record.planImageBase64 = w.b64; record.planMimeType = 'image/webp'; }
  } catch (e) { /* ليست PNG/JPEG/WebP أو تعذّر الترميز: يبقى الأصل، وسقف الحجم أدناه يحدّه */ }
  if (String(record.planImageBase64 || '').length > LIB_IMG_MAX) return null;
  const meta = JSON.stringify({ id, t: record.createdAt, b: record.buildingType, f: record.floors, a: record.area, l: record.lang });
  try {
    const r = await kvPipeline([
      ['SET', itemPath(id), JSON.stringify(record), 'EX', String(LIB_TTL_SEC)],
      ['LPUSH', INDEX_KEY, meta],
      ['LRANGE', INDEX_KEY, String(LIB_MAX), '-1'],
      ['LTRIM', INDEX_KEY, '0', String(LIB_MAX - 1)],
      ['EXPIRE', INDEX_KEY, String(LIB_TTL_SEC)],
    ]);
    const old = (Array.isArray(r[2]) ? r[2] : []).map(parseMeta).filter(Boolean).map((m) => itemPath(m.id));
    if (old.length) await kvPipeline([['DEL'].concat(old)]).catch(() => null); // أفضل جهد — مدّة الصلاحية تحذفها على أيّ حال
    if (r[0] !== 'OK') return null;
  } catch (e) {
    return null;
  }
  return id;
}

async function listDesigns({ buildingType, floors, area, limit, lang }) {
  let filtered;
  try {
    const r = await kvPipeline([['LRANGE', INDEX_KEY, '0', String(LIB_MAX - 1)]]); // v-audit-stud2: الفهرس لا SCAN ولا الصور
    filtered = (Array.isArray(r[0]) ? r[0] : []).map(parseMeta).filter(Boolean);
  } catch (e) {
    return [];
  }
  const wantLang = planLang(lang);
  if (wantLang) filtered = filtered.filter((d) => d.l === wantLang); // v-cx-lib
  if (buildingType) filtered = filtered.filter((d) => d.b === buildingType);
  if (floors) {
    filtered = filtered.filter((d) => Math.abs(Number(d.f) - Number(floors)) <= 0.5);
  }
  if (area) {
    const a = Number(area);
    filtered = filtered.filter((d) => d.a && Math.abs(Number(d.a) - a) / a <= 0.35);
  }
  filtered.sort((a, b) => (b.t || 0) - (a.t || 0));
  const recs = await Promise.all(filtered.slice(0, limit || 12).map((m) => kvGetJSON(itemPath(m.id)).catch(() => null)));
  const out = [];
  let bytes = 0;
  for (const d of recs) {
    if (!d) continue; // انتهت مدّته أو حُذف
    const n = String(d.planImageBase64 || '').length;
    if (bytes + n > LIST_BYTES_MAX) continue; // v-audit-stud2: الردّ تحت حدّ الدالّة
    bytes += n;
    out.push(d);
  }
  return out;
}

module.exports = { saveDesign, listDesigns, planLang, PLAN_LANGS, LIB_TTL_SEC, LIB_MAX, LIB_IMG_MAX, LIST_BYTES_MAX, INDEX_KEY };
