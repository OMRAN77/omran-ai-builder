# دفعة ١٨ — رقعتان مُرقّاتان في الإنتاج (٦ أغسطس ٢٠٢٦)
مُدمجتان: production `dpl_…rld01nqov`، GitHub `732caa2`.
- قفل `window.t`: 5 أسطر قبل `function applyLanguage(){` في `js/app-04-i18n-state.js`.
- عنوان التبويب: `index.html` وسم `<title id="pageTitle">` كان مسافة واحدة؛ و`document.title = dict.pageTitle`
  صار محروسًا لأنّ `pageTitle` مسافة واحدة في **كل** ملفّات `i18n/` الاثني عشر.
- درسٌ: ملفّ `app-04-i18n-state.patch` كان **صفر سطر** لأنّ `js/app-NN-*.js` تعيد 404 من الشبكة
  فتعذّرت المقارنة؛ الحزمة وحدها حفظت الشيفرة. لذا تُحفظ النسخة المطبَّقة كاملة هنا لا كرقعة.
