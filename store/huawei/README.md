# حزمة متجر هواوي (AppGallery) — ما يلزم قبل إعادة الإرسال

**التطبيق:** Omran AI Builder · **معرّف AGC:** 118703501 · **اسم الحزمة:** `com.omran.aibuilder`
**آخر رفض:** الإصدار 1.3.9 (٧ و١٥ سبتمبر ٢٠٢٦) بقاعدة **4.1 «ميزة واحدة»** — المراجع فتح غلاف الموقع
(TWA) فرأى شاشة محادثة واحدة **وشريط عنوان المتصفّح فوقها**، فحكم أنّه موقع لا تطبيق.

## لماذا رُفض فعلًا (جذران لا جذر واحد)
1. **رابط التشغيل في الحزمة كان `/` لا `/?store=huawei`**، فلم تعمل شاشة العرض التلقائيّ للأدوات
   (`v-store-showcase` في `js/selfdiag.js`) ولم تُخفَ الماليّة (`v-store-safe`).
2. **لا `assetlinks.json` على النطاق** ⇒ التحقّق من Digital Asset Links يفشل ⇒ TWA يعرض شريط عنوان
   المتصفّح ⇒ «هذا موقع». هذا أهمّ من الأوّل: بلا التحقّق يبقى شكل الموقع مهما فعلنا في الواجهة.

## ما في هذا المستودع الآن
| الملفّ | دوره |
|---|---|
| `manifest-huawei.json` | بيان الحزمة لمتجر هواوي: `start_url` و`id` = `/?store=huawei`، و`scope` = `/`. يُعطى لمولّد الحزمة. البيان العامّ `manifest.json` لم يتغيّر (الويب وبقيّة المتاجر كاملة). |
| `.well-known/assetlinks.json` | Digital Asset Links للحزمة `com.omran.aibuilder`. **فيه خانة البصمة فارغة — املأها (الخطوة ٢).** |
| `js/selfdiag.js` (`v-store-twa`) | حين يدخل التطبيق بـ`?store=huawei` يبدّل وسم `<link rel="manifest">` إلى البيان الخاصّ فيبقى العلم بعد التثبيت ويقرأه المولّد من الصفحة نفسها. |
| `screenshots/` | ٨ لقطات ٩:١٦ (١٠٨٠×١٩٢٠) من الحزمة نفسها (`?store=huawei`): مربّع الأدوات كاملًا (شاشتان)، صانع الفيديو، الأزياء، الديكور، التلفزيون، التعليم، السيرة الذاتيّة. (شاشة المحادثة وحدها استُبعدت عمدًا: هي ما رآه المراجع فحكم «ميزة واحدة».) |
| `REVIEW-NOTES.md` | نصّ ملاحظات المراجع (عربيّ + إنجليزيّ) وردّ على قاعدة 4.1، ونصوص الوصف. |

## الخطوات — بالترتيب
### ١) بصمة SHA-256 لمفتاح التوقيع
البصمة **لا يمكن استنتاجها من المستودع**؛ هي من المفتاح الذي وقّعت به الحزمة. أحد ثلاثة مصادر:
- **ملفّ المفتاح عندك** (`.keystore`/`.jks`، أو `signing-key-info.txt` في ملفّ PWABuilder المضغوط الذي حمّلته أوّل مرّة):
  ```
  keytool -list -v -keystore MY.keystore -alias MY_ALIAS
  ```
  انسخ سطر `SHA256:` (٣٢ زوجًا ست‌عشريًّا بينها نقطتان).
- **من الـAPK نفسه** (النسخة المنشورة على APKPure هي الموقّعة بمفتاحك):
  ```
  keytool -printcert -jarfile app.apk
  ```
- **إن كان AGC يعيد التوقيع** (App signing مفعّل في AppGallery Connect ← التطبيق ← App signing): خذ
  بصمة **شهادة AGC** من الصفحة نفسها **وأضفها بصمةً ثانية** في المصفوفة — الجهاز يتحقّق من الشهادة
  المثبَّتة فعلًا.

ضع البصمة في `.well-known/assetlinks.json` مكان `REPLACE_WITH_APK_SIGNING_SHA256_FINGERPRINT`
(يمكن أكثر من بصمة في المصفوفة). ثمّ ادمج إلى `main` — Vercel ينشر تلقائيًّا.

### ٢) تحقّق أنّ الملفّ يُخدَم
```
curl -s https://omran-ai-builder.vercel.app/.well-known/assetlinks.json
```
ثمّ فحص جوجل:
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://omran-ai-builder.vercel.app&relation=delegate_permission/common.handle_all_urls
```
يجب أن يعيد statement فيه `com.omran.aibuilder` والبصمة.

### ٣) بناء حزمة جديدة برابط التشغيل الصحيح
**الإصدار:** 1.3.10 (`versionName`)، و`versionCode` أعلى من السابق بواحد على الأقلّ. **وقّع بالمفتاح نفسه.**
- **PWABuilder** (<https://www.pwabuilder.com>): أدخل `https://omran-ai-builder.vercel.app/?store=huawei` ←
  Android ← Options: **Package ID** `com.omran.aibuilder` · **Start URL** `/?store=huawei` ·
  **Manifest URL** `https://omran-ai-builder.vercel.app/manifest-huawei.json` · **Signing key: Use mine**
  (ارفع المفتاح نفسه) · Version 1.3.10 / Version code +1.
- **أو Bubblewrap**:
  ```
  bubblewrap init --manifest https://omran-ai-builder.vercel.app/manifest-huawei.json
  # packageId: com.omran.aibuilder · startUrl: /?store=huawei · appVersionName: 1.3.10 · appVersionCode: +1
  bubblewrap build   # بالمفتاح نفسه
  ```
  في `twa-manifest.json` تأكّد من: `"startUrl": "/?store=huawei"` و`"packageId": "com.omran.aibuilder"`.

### ٤) جرّب الحزمة على جهاز هواوي قبل الرفع
ثبّت الـAPK وافتحه: **لا شريط عنوان** (التحقّق نجح) + يفتح مربّع الأدوات تلقائيًّا من أوّل ثانية +
لا شريط أسهم ولا سوق أسهم (قاعدة 11.4 محفوظة). إن ظهر شريط العنوان فالبصمة أو اسم الحزمة خطأ.

### ٥) الرفع في AppGallery Connect
- الحزمة 1.3.10، اللقطات الثماني من `screenshots/` (٩:١٦، ≤ ٢ م.ب لكلّ لقطة)، وصف التطبيق من
  `REVIEW-NOTES.md`، وفي خانة **Remarks / Notes for review** النصّ الإنجليزيّ من `REVIEW-NOTES.md` مع
  حساب تجريبيّ (اسم مستخدم وكلمة مرور تُنشئهما أنت — لا تكتبهما في المستودع).
- ثمّ **Release**: في GitHub وسم `v1.3.10` مع الـAPK مرفقًا (اختياريّ لكنّه يحفظ نسخة المتجر بالضبط).

## ما لم يُفعل هنا وسببه
- **البصمة**: لا تُستنتج من الكود، والـAPK على APKPure محجوب عن بيئة العمل (403). تُملأ بيدك (الخطوة ١).
- **بناء الـAPK**: يحتاج مفتاح التوقيع وأداة البناء عندك؛ المستودع لا يحوي مشروع أندرويد.
- **لقطة القبلة** لم تُدرج: تحتاج موقعًا جغرافيًّا فتظهر «جارٍ تحديد موقعك…» في بيئة بلا موقع.
