# عمران AI في Microsoft Store (ويندوز) — تطبيق PWA

ويندوز يثبّت الموقع نفسه كتطبيق (نافذة مستقلّة، أيقونة في قائمة ابدأ، يتحدّث تلقائيًّا مع كلّ نشر على Vercel).
لا شيفرة جديدة: الحزمة تُولَّد من البيان العامّ `manifest.json` عبر PWABuilder (أداة مايكروسوفت الرسميّة).

## ما جُهّز في البيان
| الحقل | القيمة | لماذا |
|---|---|---|
| `id` | `/index.html` | هويّة ثابتة للتطبيق = ما كان المتصفّح يحسبه من `start_url`، فمن ثبّته سابقًا لا يتكرّر عنده |
| `categories` | productivity, utilities, education | فئة المتجر |
| `screenshots` | `assets/screenshots/` (عريضة ١٢٨٠×٨٠٠ + طوليّتان ٥٤٠×٩٦٠) | نافذة التثبيت الغنيّة في Chrome/Edge وقائمة المتجر |
| الأيقونات | ١٩٢ و٥١٢ (any + maskable) | موجودة من قبل |

## الخطوات
1. **حساب Partner Center:** https://partner.microsoft.com/dashboard/registration — نوع «فرد». أعلنت مايكروسوفت أنّ تسجيل
   الأفراد صار مجّانيًّا (سبتمبر ٢٠٢٥)؛ **إن طلبت الصفحة رسومًا فلا تدفع قبل أن تقرّر.**
2. في Partner Center: **Apps and games ← New product ← MSIX or PWA app** ← احجز الاسم «Omran AI Builder» (أو «عمران AI»).
3. افتح المنتج ← **Product management ← Product identity** وانسخ ثلاث قيم: `Package/Identity/Name`،
   `Package/Identity/Publisher`، `Package/Properties/PublisherDisplayName`.
4. افتح https://www.pwabuilder.com ← الصق `https://omran-ai-builder.vercel.app/` ← **Package for stores ← Windows ← Generate**
   ← ضع القيم الثلاث في الحقول بالاسم نفسه ← نزّل الملفّ المضغوط (فيه `.msixbundle` و`.classic.appxbundle`).
5. في Partner Center ← **Start submission**: السعر «مجّانيّ»، الفئة Productivity، العمر (استبيان IARC)، وارفع الحزمتين
   في **Packages**، واللقطات من `assets/screenshots/wide-home.webp` (حوّلها PNG إن طلب)، وسياسة الخصوصيّة
   https://omran-ai-builder.vercel.app/privacy.html ← **Submit to the Store**.
6. المراجعة عادةً أيّام قليلة. بعدها لا حاجة لرفع حزمة جديدة مع كلّ تحديث — التطبيق يحمّل الموقع الحيّ.

## ملاحظات
- التطبيق داخل المتجر يعرض الأسعار والدفع كما في الموقع (البيان العامّ بلا `?store=`). إن رُفض لسبب الدفع فالحلّ
  بيان مستقلّ بعلم متجر كما فعلنا في هواوي (`manifest-huawei.json` + `v-store-safe`) — لم يُفعل الآن لأنّ
  Microsoft Store يسمح بالدفع الخارجيّ لتطبيقات PWA.
- وصف المتجر: الجملة الأخيرة من «الوصف الطويل» في `../browser-extension/README.md` (ما بعد «يفتح عمران AI…»)؛
  جمل الزرّ الأيمن وشريط العنوان خاصّة بالإضافة.
