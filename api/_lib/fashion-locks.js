// 👗 أقفال أداة الأزياء — من حزمة المالك (أغسطس ٢٠٢٦)، مصهورة في بنية التطبيق.
//
// ثلاثة أقفال نصّية تُلحق ببرومبت توليد الصورة:
// • قفل الهوية: يمنع النموذج من «تجميل» الشخص أو تنحيفه أو تغيير ملامحه —
//   بدونه المستخدمة ترى شخصًا آخر لابسًا الفستان وتفقد الأداة معناها.
// • قفل عدالة المقارنة: نفس الخلفية والإضاءة والوقفة في كل خيارات المقارنة —
//   بدونه تقارن المستخدمة إضاءتين لا ملابس.
// • قفل الاحتشام: تغطية كاملة عند الأنماط المحتشمة.

const IDENTITY_LOCK =
  ' CRITICAL: keep the exact same person — same face, skin tone, hair, and natural body ' +
  'shape and proportions. Do not slim, lighten, beautify, or change age. Change only the ' +
  'clothing and accessories. Full body visible from head to shoes. Realistic fabric drape ' +
  'and natural fit on this specific body. No text, no watermark, no logo.';

const FAIRNESS_LOCK =
  ' Use an identical neutral studio setup for this image: same plain light-grey seamless ' +
  'background, same soft even frontal lighting, same camera distance, same eye-level angle, ' +
  'and the same standing pose. Only the outfit differs between images.';

const MODEST_LOCK =
  ' Modest styling is required: full coverage of arms to the wrists and legs to the ankles, ' +
  'no tight or sheer fabrics, no exposed chest or back. Elegant and dignified.';

// الأنماط التي تستوجب الاحتشام تلقائيًّا حتى بلا طلب صريح.
const MODEST_STYLES = ['abaya', 'traditional'];

function locksFor(opts) {
  const o = opts || {};
  let out = IDENTITY_LOCK;
  if (o.fairness) out += FAIRNESS_LOCK;
  if (o.modest || MODEST_STYLES.indexOf(o.style) !== -1 || o.occasion === 'religious') out += MODEST_LOCK;
  return out;
}

module.exports = { IDENTITY_LOCK, FAIRNESS_LOCK, MODEST_LOCK, MODEST_STYLES, locksFor };
