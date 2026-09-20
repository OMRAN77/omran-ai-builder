// tests/image-edit-pro.test.cjs — v-edit-pro (٢٠ سبتمبر ٢٠٢٦): «كمّل ٣ و٤ — تكون الكتابة أفضل شي على الصور»:
// التعديل الموضعيّ على نانو بنانا برو (2K، يحفظ الحروف) بدل نانو ٢٫٥، والمصدر يصل بلا ضغط مبكّر.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١. الخادم (v-lanes): المسار الأمين على برو 2K مع إبقاء الحرارة المنخفضة، وبرو/نانو بالبيئة، ونانو خام والإنقاذ كما هما', () => {
  const mi = read('api/_lib/maha-image.js');
  assert.match(mi, /const editModel = \(process\.env\.IMAGE_EDIT_MODEL \|\| 'gemini-3-pro-image'\)\.trim\(\);/);
  assert.match(mi, /const __faithfulLane = !!editImageBase64 && !extras\.length && !isCreativeEdit && !isPersonSwap && !isBroadEdit;/);
  assert.match(mi, /if \(!nanoPrimary && !__faithfulLane\) delete cfg\.temperature;/, 'الحرارة 0.15 تبقى للمسار الأمين على برو — درس v-edit-pro-revert');
  assert.match(mi, /\(isCreativeEdit \|\| isTextSwap \|\| isPersonSwap \|\| isBroadEdit\) \? creativeModel : editModel/, 'الفرز القائم لم يُمسّ');
  assert.match(mi, /const primaryModel = \(__optForceEngine === 'nano'\) \? 'gemini-2\.5-flash-image'/, 'توغّل «نانو خام» للمالك باقٍ');
  assert.match(mi, /const nanoPrimary = \/2\\\.5-flash-image\/\.test\(primaryModel\);/);
  assert.ok(mi.includes('v-lanes'), 'القرار موثّق في الكود');
});

test('٢. العميل: الرفع حتّى 1.5MB بلا إعادة ترميز، و2048px بجودة 0.92، وتصغير التعديل يمرّر حتّى 2M حرفًا بجودة 0.92', () => {
  const a9 = read('js/app-09-attach.js');
  assert.match(a9, /const IMAGE_MAX_DIMENSION = 2048;\nconst IMAGE_JPEG_QUALITY = 0\.92;\nconst IMAGE_PASSTHROUGH_BYTES = 1536 \* 1024;/);
  assert.match(a9, /async function omranShrinkForEdit\(b64, mime, maxPx, force\)\{\n\s+try\{\n\s+if\(!b64 \|\| \(!force && b64\.length < 2000000\)\) return \{ b64: b64, mime: mime \};/);
  assert.match(a9, /if\(!force && sc >= 1 && b64\.length < 2600000\) return \{ b64: b64, mime: mime \};/);
  assert.match(a9, /c\.toDataURL\('image\/jpeg', force \? 0\.88 : 0\.92\)/, 'ذاكرة الأدوار (force) تبقى صغيرة، والمصدر بجودة أعلى');
  assert.match(a9, /const mx = maxPx \|\| 2048/, 'سقف التعديل بصورة واحدة 2048 (v-full-res)');
  // مع قناع أو صور إضافية يبقى 1280 كي لا يتجاوز الطلب حدّ Vercel
  assert.match(a9, /omranShrinkForEdit\(\(__xa\.dataUrl \|\| ''\)\.split\(','\)\[1\] \|\| '', __xa\.mime \|\| 'image\/png', 1280\)/);
  assert.ok(read('js/app.bundle.js').includes('const IMAGE_PASSTHROUGH_BYTES = 1536 * 1024;'), 'الحزمة مبنيّة');
});
