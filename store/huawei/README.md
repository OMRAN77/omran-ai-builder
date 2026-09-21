# حزمة متجر هواوي (AppGallery) — 1.3.10 جاهزة للبناء بضغطة

**التطبيق:** Omran AI Builder · **معرّف AGC:** 118703501 · **اسم الحزمة المسجّل في AGC:** `com.omran.aibuilder.twa` (لا `com.omran.aibuilder` — ذاك اسم حزمة APKPure؛ AGC رفض الرفع به ١٨ سبتمبر)
**آخر رفض:** الإصدار 1.3.9 (٧ و١٥ سبتمبر ٢٠٢٦) بقاعدة **4.1 «ميزة واحدة»** — المراجع فتح غلاف الموقع
(TWA) فرأى شاشة محادثة واحدة **وشريط عنوان المتصفّح فوقها**، فحكم أنّه موقع لا تطبيق.

## لماذا رُفض فعلًا (جذران لا جذر واحد)
1. **رابط التشغيل في الحزمة كان `/` لا `/?store=huawei`**، فلم تعمل شاشة العرض التلقائيّ للأدوات
   (`v-store-showcase` في `js/selfdiag.js`) ولم تُخفَ الماليّة (`v-store-safe`).
2. **لا `assetlinks.json` على النطاق** ⇒ التحقّق من Digital Asset Links يفشل ⇒ TWA يعرض شريط عنوان
   المتصفّح ⇒ «هذا موقع». بلا التحقّق يبقى شكل الموقع مهما فعلنا في الواجهة.

## ما في المستودع
| الملفّ | دوره |
|---|---|
| `twa/` | **مشروع أندرويد كامل (Trusted Web Activity)** مولَّد بالقالب الرسميّ (`scripts/twa-generate.mjs` على `@bubblewrap/core`): الحزمة `com.omran.aibuilder.twa`، ينطلق من `/?store=huawei`، الإصدار 1.3.10، الاسم على الشاشة «عمران AI»، الأيقونات من `icons/`، وبلا متصفّح يدعم TWA يفتح **WebView ملء الشاشة** لا تبويب متصفّح. |
| `.github/workflows/android-release.yml` | يبني الـAPK على مشغّل GitHub (Android SDK جاهز هناك)، يوقّعه بمفتاحك من أسرار المستودع، ينشر **Release** `v1.3.10` بالـAPK، يطبع بصمة التوقيع، ويفتح طلب سحب يضعها في `assetlinks.json`. |
| `../../manifest-huawei.json` | بيان الحزمة: `start_url`/`id` = `/?store=huawei`، `scope` = `/`. البيان العامّ `manifest.json` لم يتغيّر. |
| `../../.well-known/assetlinks.json` | Digital Asset Links للحزمة. البصمة تُملأ تلقائيًّا من الورك فلو (أو يدويًّا). |
| `screenshots/` | ٨ لقطات ٩:١٦ (١٠٨٠×١٩٢٠) من الحزمة نفسها: مربّع الأدوات (شاشتان) وستّ أدوات. شاشة المحادثة وحدها استُبعدت عمدًا. |
| `twa/store_icon.png` | أيقونة المتجر ٥١٢×٥١٢. |
| `REVIEW-NOTES.md` | ملاحظات المراجع (عربيّ + إنجليزيّ)، ردّ على 4.1، ونصّا الوصف. |

## الخطوات — ثلاث فقط
### ١) مرّة واحدة: مفتاح التوقيع في أسرار المستودع
الحزمة الجديدة **يجب** أن توقَّع بالمفتاح نفسه الذي وقّع 1.3.9 وإلّا رفض AGC الرفع («شهادة التوقيع مختلفة»).
المفتاح عندك (ملفّ `.keystore`/`.jks`، أو داخل ملفّ PWABuilder المضغوط الذي حمّلته أوّل مرّة مع `signing-key-info.txt` فيه الاسم المستعار وكلمتا المرور).

في GitHub: **Settings ← Secrets and variables ← Actions ← New repository secret**، أربعة أسرار:

| الاسم | القيمة |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | ملفّ المفتاح مشفّرًا base64 (سطر واحد) |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور المخزن |
| `ANDROID_KEY_ALIAS` | الاسم المستعار للمفتاح (alias) |
| `ANDROID_KEY_PASSWORD` | كلمة مرور المفتاح — اتركه إن كانت نفس كلمة المخزن |

تحويل الملفّ إلى base64:
```
# Mac / Linux
base64 -i signing.keystore | tr -d '\n' | pbcopy      # Mac: يُنسخ للحافظة
base64 -w0 signing.keystore                           # Linux: انسخ الناتج
# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("signing.keystore")) | Set-Clipboard
```

### ١-ب) ضاع المفتاح؟ المسار البديل بلا أوامر (PWABuilder)
مفتاح 1.3.9 ضاع (المالك ١٨ سبتمبر). الجلسة لا تولّد مفاتيح توقيع ولا تضعها في المستودع؛ المفتاح يُنشأ عندك ويبقى عندك.
أسهل طريقة بلا طرفيّة — الموقع نفسه الذي بُنيت به الحزم السابقة:
1. افتح <https://www.pwabuilder.com> وأدخل `https://omran-ai-builder.vercel.app/?store=huawei` ← **Package for stores** ← **Android**.
2. في الخيارات: **Package ID** `com.omran.aibuilder.twa` · **App name** `Omran AI Builder` · **Launcher name** `عمران AI` ·
   **Version** `1.3.10` · **Version code** `20260918` · **Start URL** `/?store=huawei` ·
   **Manifest URL** `https://omran-ai-builder.vercel.app/manifest-huawei.json` · **Fallback** WebView ·
   **Signing key: Create new** (املأ الاسم والمنظّمة كيفما شئت).
3. **Download** ← ملفّ مضغوط فيه الـAPK الموقّع و`assetlinks.json` و`signing.keystore` و`signing-key-info.txt`.
   **احفظ الملفّ المضغوط في مكانين** (هذا هو المفتاح؛ ضياعه يعني حزمة جديدة من الصفر مرّة أخرى).
4. أرسل للجلسة محتوى `assetlinks.json` من الملفّ المضغوط (بصمة عامّة، ليست سرًّا) — تُوضع في `.well-known/assetlinks.json` وتُدمج.
5. ارفع الـAPK في AppGallery Connect كما في الخطوة ٣ أدناه.

> **AppGallery والشهادة الجديدة:** إن رفض AGC الرفع بسبب «شهادة التوقيع مختلفة عن النسخة السابقة» — كلّ الإصدارات السابقة
> مرفوضة ولم يُنشر شيء — احذف التطبيق غير المنشور من AppGallery Connect وأنشئه من جديد بالاسم والحزمة نفسيهما ثمّ ارفع.
> وإن لم يسمح بحذفه، أنشئه بحزمة جديدة مثل `com.omran.aibuilder.app` وأعِد التوليد بعد تغيير `PACKAGE_ID` في
> `scripts/twa-generate.mjs` وفي `assetlinks.json`.

**لاحقًا (اختياريّ):** ضع الأربعة من `signing-key-info.txt` في أسرار المستودع (الخطوة ١) فتُبنى الإصدارات القادمة بضغطة من هنا.

### ٢) البناء: ضغطة واحدة
**Actions ← android-release ← Run workflow** (الإصدار 1.3.10 و`versionCode` 20260918 جاهزان؛ لا تغيّر شيئًا)، أو قل للجلسة «ابنِ 1.3.10».
بعد دقائق:
- **Release `v1.3.10`** في صفحة المستودع (Releases) وفيه `omran-ai-builder-1.3.10.apk` — حمّله.
- ملخّص التشغيل يعرض **بصمة التوقيع SHA-256**، ويُفتح طلب سحب يضعها في `assetlinks.json` — ادمجه (Vercel ينشر تلقائيًّا).
  تحقّق: `https://omran-ai-builder.vercel.app/.well-known/assetlinks.json` يعرض البصمة.
- إن كان **App signing** مفعّلًا في AppGallery Connect (التطبيق ← App signing) فخذ بصمة شهادة AGC من الصفحة نفسها
  وأضفها بصمةً ثانية في `assetlinks.json` — الجهاز يتحقّق من الشهادة المثبَّتة فعلًا.

### ٣) الرفع في AppGallery Connect
- جرّب الـAPK على جهاز هواوي أوّلًا: **بلا شريط عنوان** + مربّع الأدوات يفتح من أوّل ثانية + لا شريط أسهم. (شريط عنوان = البصمة لم تُنشر بعد على النطاق.)
- ارفع `omran-ai-builder-1.3.10.apk`، اللقطات الثماني من `screenshots/`، الأيقونة `twa/store_icon.png`، الوصف من
  `REVIEW-NOTES.md`، وفي خانة **Remarks / Notes for review** النصّ الإنجليزيّ من `REVIEW-NOTES.md` مع حساب تجريبيّ
  (اسم مستخدم وكلمة مرور تُنشئهما أنت — لا تكتبهما في المستودع).

## عطل معروف: مها (المايك) لا يفتح داخل التطبيق المثبَّت — v-maha-webview-mic (٢١ سبتمبر ٢٠٢٦)
بلاغ المالك بفيديو حيّ: «المايك مشغول ببرنامج ثاني» يطلع فورًا (أقل من ثانية) وبشكل دائم عند فتح
مها من التطبيق المثبَّت (AppGallery/APK) — لا علاقة له بأي سباق جافاسكربت (`v-maha-mic-race` في
`knowledge/DECISIONS.md` يعالج مشكلة مختلفة تمامًا لمستخدمي متصفّح حقيقيّ). السبب: `fallbackType:
'webview'` (`app/build.gradle:48`) يعني كل أجهزة هواوي (بلا كروم/خدمات جوجل) تفتح الموقع داخل
**WebView أندرويد خام** (`WebViewFallbackActivity` من مكتبة `androidbrowserhelper` مباشرة، بلا فرع
محليّ) — و`AndroidManifest.xml` كان بلا `android.permission.RECORD_AUDIO` إطلاقًا، فيفشل
`getUserMedia` دائمًا بصلاحية "خطِرة" غير معلَنة في البيان، بغضّ النظر عن أي كود.
- **أُضيف:** صلاحية `RECORD_AUDIO` في `AndroidManifest.xml`، وفرع محليّ كامل
  (`MahaWebViewFallbackActivity.java`، نسخة من `WebViewFallbackActivity` الأصليّ مأخوذة من مصدر
  المكتبة الحقيقيّ `GoogleChrome/android-browser-helper` ٢٫٦٫٢) يمنح صلاحية المايك وقت التشغيل عبر
  `WebChromeClient.onPermissionRequest` — الأصل لا يُنفّذها إطلاقًا (تأكّدنا من المصدر مباشرة).
  `LauncherActivity.getFallbackStrategy()` (نقطة توسيع رسميّة موثَّقة في المكتبة نفسها) يوجّه
  إليه بدل الأصل. التفاصيل الكاملة في `knowledge/DECISIONS.md` (v-maha-webview-mic-2).
- **⚠️ غير مُتحقَّق ببناء حقيقيّ:** لا Android SDK/محاكي/جهاز في جلسة الكتابة — التحقّق الوحيد كان
  قراءة مصدر المكتبة الحقيقيّ ومطابقة التوقيعات يدويًّا. **الخطوة التالية اللازمة:** `Actions ←
  android-release` (Android SDK حقيقيّ هناك) ثمّ تثبيت الـAPK على جهاز فعليّ وتجربة مها — أوّل
  تحقّق حاسم ممكن لهذا الإصلاح.
- **⚠️ إعادة التوليد تمحو كل هذا:** `node scripts/twa-generate.mjs` يحذف `store/huawei/twa` كاملًا
  ويعيد بناءه من الصفر (`fs.rmSync` في السكربت) — أي إعادة توليد لاحقة (تغيير أيقونة، رفع إصدار
  جذريّ...) تُسقط صلاحية `RECORD_AUDIO` **و**`MahaWebViewFallbackActivity.java` **و**تعديل
  `LauncherActivity.java` معًا ما لم تُعَد يدويًّا بعدها مباشرة (أو عبر PWABuilder، الخطوة ١-ب —
  مسار مختلف كليًّا لا يحتاج هذا الفرع، لكن نسخة AppGallery المرفوعة ١٨ سبتمبر عبره كانت تعاني
  نفس العطل، فليس بديلًا مضمونًا).

## تفاصيل للصيانة
- **إعادة توليد المشروع** (بعد تغيير البيان أو الأيقونات): `npm i --no-save @bubblewrap/core && node scripts/twa-generate.mjs --version 1.3.11 --code 20261001`.
- **`versionCode`** بصيغة تاريخ (`20260918`) لأنّ رموز الإصدارات السابقة غير مسجّلة في المستودع؛ أيّ رقم أكبر يمرّ، وكلّ إصدار جديد بتاريخ أحدث.
- **البناء لا يجري في بيئة الجلسة** (لا Android SDK فيها) — لذلك الورك فلو.
- **بناء يدويّ** إن أردت: `cd store/huawei/twa && ./gradlew assembleRelease` ثمّ `zipalign` و`apksigner sign` من build-tools بالمفتاح نفسه.
