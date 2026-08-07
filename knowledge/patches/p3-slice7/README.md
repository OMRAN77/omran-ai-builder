# المرحلة ٣ — الشرائح ١–٧ · نقطة استعادة كاملة
**٦ أغسطس ٢٠٢٦ · ✅ في الإنتاج**
دفعة `main` `7925708c` · نشر `dpl_FyDWdCEVL9n5qUmmf8PXMuUg3HR1` · للرجوع `dpl_4EnPn4ZGeownPSPKbxHNAsbRzA19`
احتياطيّ ما قبل الدفع: `backup/prod-pre-p3-20260806.tgz` + `backup/main-pre-p3/index.html`

معاينة الشريحة ٧: `https://omran-ai-builder-fjr41o6an-omran4.vercel.app`
نقطة الرجوع في Vercel: `dpl_4EnPn4ZGeownPSPKbxHNAsbRzA19`

---

## الحصيلة

| | سطور |
|---|---|
| `index.html` الأصليّ | ٤٨٠٥ |
| `index.html` بعد الشرائح ١–٧ | **٤١٦** (−٩١٪) |
| مجموع الملفّات الستّة عشر | ٤٨٢٥ |
| **منطق جديد صافٍ للمرحلة كلّها** | **+٢٠ سطرًا** |

كلّ ما عدا العشرين سطرًا **نقلٌ حرفيّ** مُثبَت بـsha256.

## الملفّات

`index.html` · `css/tokens.css` `redesign.css` `modules.css`
`js/edu.js` `ui-docs.js` `ui-wiring.js` `premium.js` `exp.js` `video.js`
`js/design-sels.js` `design-gen.js` `themes.js` `selfdiag.js`
`js/partials-core.js` (١١٣٢) · `js/partials-settings.js` (٥٥٩) ← الشريحة ٧

## الشريحة ٧ — كيف تعمل

بنية HTML لا يمكن تأجيلها: كلّ مودال يُوصَل لحظة تنفيذ `app.bundle.js` بـ`$('#id')` ثمّ
`if(!modal) return;` — والحزمة فيها **٥ معالجات `DOMContentLoaded` بلا حارس readyState**،
فأيّ تحميل متأخّر يُعطّل الميزات **صامتًا**.

الحلّ: `document.write` من **سكربت حاجز للمحلّل** موضوع في نفس نقطة التحليل.
المحلّل يُدرج النصّ في مجرى الدخل عند تلك النقطة بالضبط ⇒ ترتيب DOM مطابق،
والسكربتات الداخليّة (`themes.js` + سطر `acctToggleRow`) تنفَّذ بنفس ترتيبها،
و`DOMContentLoaded` لا يُطلق قبل اكتمال ذلك. الحمولة تُنزَّل بالتوازي (preload scanner)
فلا تأخير شبكيّ إضافيّ. ولكلّ ملفّ مسار احتياطيّ إن نُفِّذ متأخّرًا (يُدرج بدل أن يمسح المستند).

- `partials-core.js` = ١١٢٠ سطرًا: `authOverlay` … `designAiModal` + `portraitStyleModal` … `shareModal`
- `partials-settings.js` = ٥٤٨ سطرًا: `settingsDialog` + `clockDialog` + `templatesModal`

**قيد**: المنطقتان يجب أن تبقيا خاليتين من `` ` `` و`${` و`\` (المولّد يتحقّق ويتوقّف).

## التحقّق

| فحص | النتيجة |
|---|---|
| النصّ المُدرَج مقابل الأصل | **بايت-ببايت** · sha256 `3439992f…` و`f9958a39…` |
| `diff` على `index.html` | ١١٢٠+٥٤٨ محذوفًا · ٤ مضافة · صفر تغيير آخر |
| ترتيب عناصر `body` | **٣٧ = ٣٧** مطابق |
| مجموع العناصر المقيسة | **٧٣١ = ٧٣١** (مطابق لمعاينة الشريحة ٦) |
| المودالات: تفتح وتُغلق | **١٧/١٨** (الفرق = استخراج `themes.js`، مُفسَّر) |
| ٩ أزرار فتح × click | ٩/٩ `flex` ثمّ `none` |
| `themes.js` + السكربت الداخليّ | `applyAppTheme` `applyTickerColor` `acctToggleRow` = دوال · ٨ دوائر ألوان · ٨ ألوان شريط |
| أخطاء الصفحة | **٠** |
| دخان | **١٨ / ٠** |
| قواعد CSS · مفاتيح i18n | مطابقة (١٠/١٢ مفتاح probe؛ المختلفان `extScripts`/`inlineScripts` = هدف الاستخراج) |

فرقان دائمان معروفان وليسا انحرافًا: إزاحة تمرير الشريط (متحرّكة)، وطور نبضة وهج **مها** (موضعها ثابت `618,414,45,45`).

## عيب وقع وأُصلح
مولّد ٧ب أشار في وسم السكربت إلى `partials-core.js` بدل `partials-settings.js`
⇒ حُمِّلت مودالات الأساس مرّتين واختفت الإعدادات. كشفه فحص ترتيب `body`
(٤٥ عنصرًا بدل ٣٧ + `settingsDialog` غائب). **الدرس: افحص ترتيب `body` دائمًا — الدخان الأخضر لم يكشفه.**

## الترقية إلى الإنتاج
```
cd /tasklet/agent/home
SRC_ROOT=/tmp/p3 bun scripts/deploy-files.ts production "المرحلة ٣ · الشرائح ١–٧" \
  index.html css/tokens.css css/redesign.css css/modules.css \
  js/edu.js js/ui-docs.js js/ui-wiring.js js/premium.js js/exp.js js/video.js \
  js/design-sels.js js/design-gen.js js/themes.js js/selfdiag.js \
  js/partials-core.js js/partials-settings.js
```
لإعادة بناء `/tmp/p3`: `bun scripts/pull-src.ts` ثمّ اسكب هذا المجلّد فوق `/tmp/vc/src`.

## المولّدات
`scripts/p3-slice7.py` (٧أ) · `scripts/p3-slice7b.py` (٧ب) — كلاهما يتحقّق ويطبع sha256.
التحقّق المستقلّ: `/tmp/ver7.mjs` نمطًا (يُنفّذ الملفّ بـ`document` مزيّف ويقارن الهاش).
المسبار: `scripts/p3-probe-s7.ts` + `audit/p3/probe-s7.js`.
