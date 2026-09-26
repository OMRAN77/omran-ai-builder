# إضافة «om ai» للمتصفّحات — Chrome وEdge وFirefox

حزمة واحدة (Manifest V3) تُرفع كما هي للمتاجر الثلاثة. ما تفعله:

| الطريقة | النتيجة |
|---|---|
| زرّ الإضافة في شريط الأدوات | نافذة صغيرة: اكتب سؤالك ← يفتح التطبيق وسؤالك في صندوق المحادثة |
| تحديد نصّ في أيّ صفحة ← زرّ أيمن ← «اسأل om ai عن …» | يفتح التطبيق والنصّ المحدّد في الصندوق |
| كتابة `om` ثمّ مسافة في شريط العنوان | ما يُكتب بعدها يُفتح في التطبيق |

التطبيق يعبّئ الصندوق من `?q=` **ولا يرسل** — الإرسال بيد المستخدم.
الصلاحيّة الوحيدة `contextMenus`؛ لا وصول لأيّ موقع، لا قراءة صفحات، لا جمع بيانات. ١٤ لغة في `_locales/`
(العربيّة والأورديّة من اليمين لليسار تلقائيًّا).

## البناء
```
npm run extension:zip     # ← store/browser-extension/dist/om-ai-1.0.0.zip
```
التجربة المحلّيّة قبل الرفع: Chrome/Edge ← `chrome://extensions` ← «وضع المطوّر» ← «تحميل غير مضغوط» ← اختر
مجلّد `store/browser-extension`. Firefox ← `about:debugging` ← «هذا Firefox» ← «تحميل إضافة مؤقّتة» ← `manifest.json`.

## الرفع — كلّ متجر بحسابك أنت
| المتجر | الرابط | الرسوم |
|---|---|---|
| Chrome Web Store | https://chrome.google.com/webstore/devconsole | **٥ دولارات مرّة واحدة** للتسجيل — لا تُدفع إلّا بقرارك |
| Microsoft Edge Add-ons | https://partner.microsoft.com/dashboard/microsoftedge | مجّانًا |
| Firefox Add-ons | https://addons.mozilla.org/developers/ | مجّانًا |

في كلّ متجر: «إضافة جديدة» ← ارفع الـzip ← املأ الحقول بالنصوص أدناه ← أرسل للمراجعة.
Firefox لن يطلب الشيفرة المصدريّة: الملفّات غير مصغّرة ولا مبنيّة.

### نصوص المتجر
- **الاسم:** om ai (كلّ اللغات، يأتي من `_locales` تلقائيًّا — مثل اسم البحث v-om-ai-search)
- **الفئة:** Productivity / الإنتاجيّة
- **الوصف القصير:** من `extDesc` في `_locales/<اللغة>/messages.json`
- **الوصف الطويل (عربيّ):** om ai مساعدك الذكيّ في كلّ صفحة. حدّد أيّ نصّ واضغط بالزرّ الأيمن لتسأل عنه، أو اكتب
  `om` في شريط العنوان، أو اضغط زرّ الإضافة واكتب سؤالك. يفتح om ai ومعه سؤالك جاهزًا: محادثة، إنشاء تطبيقات
  ومواقع، صور وفيديو، مستندات، تعليم، قبلة ومواقيت، وأكثر.
- **Long description (English):** om ai on every page. Select any text and right-click to ask about it, type `om`
  in the address bar, or click the toolbar button and type your question. om ai opens with your question ready:
  chat, build apps and websites, images and video, documents, learning, prayer times, and more.
- **سياسة الخصوصيّة:** https://omran-ai-builder.vercel.app/privacy.html
- **الموقع:** https://omran-ai-builder.vercel.app/
- **الأيقونة:** `icons/icon-128.png`
- **لقطات الشاشة (١٢٨٠×٨٠٠):** `../../assets/screenshots/wide-home.webp` (حوّلها PNG إن طلب المتجر)، ولقطة للنافذة.

### أسئلة الخصوصيّة في Chrome Web Store
- **الغرض الوحيد (Single purpose):** فتح om ai بسؤال المستخدم أو النصّ الذي حدّده.
- **لماذا `contextMenus`:** لإضافة «اسأل om ai» إلى قائمة الزرّ الأيمن على النصّ المحدّد.
- **شيفرة عن بُعد (Remote code):** لا.
- **جمع البيانات:** لا شيء. الإضافة لا ترسل شيئًا بنفسها؛ النصّ يذهب في رابط التبويب الذي يفتحه المستخدم.

## إصدار جديد
ارفع `version` في `manifest.json` ثمّ `npm run extension:zip` وارفع الملفّ الجديد في كلّ متجر.
