/* ===== app-99-boot-ok — آخر شريحة في الحزمة (scripts/build.mjs يرتّب الأجزاء بالاسم) =====
   v-ios-boot-flag (فحص ١١ أكتوبر): حارس إقلاع الآيفون (selfdiag.js) يعدّ الإقلاع مكتملًا حين __omranBootOk
   (ui-wiring) و__omranBundleOk معًا. ضابط الثاني حُذف مع app-24-visual-guide (٢ سبتمبر) فصار كلّ فتح على الآيفون
   «إقلاع ناقص bundle=false» + إعادة تحميل قسريّة بعد ٥ ثوانٍ، وتُخفي الحالات الحقيقيّة. وصول هذا السطر = الحزمة نُفّذت كاملة. */
window.__omranBundleOk = true;
