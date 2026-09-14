---
name: verify-ui
description: التحقّق البصريّ لأيّ تغيير في واجهة تطبيق عمران — لقطات حاسوب وجوّال محلّيًّا بـscripts/ui-shot.mjs قبل أن تقول «تمّ». استعمله بعد كلّ تعديل يمسّ index.html أو css/ أو js/app-NN-*.js أو js/partials-*.js.
---

# التحقّق البصريّ (كما يفعله المالك في جلسة الويب)

1. إن لمست `js/app-NN-*.js` أو `js/partials-*.js`: `npm run bundle` أوّلًا (الحزمة تُبنى، لا تُحرَّر).
2. لقطتان: `node scripts/ui-shot.mjs --out /tmp/shots --user omran --both`
   - صفحة إعدادات: أضف `--settings accountSection` (أو `home` للقائمة الرئيسيّة).
   - حالة معيّنة: أضف `--eval "window.__omSetMode('cc')"` أو أيّ JS يفتح ما تريد تصويره.
   - الصفحة كاملة: `--full`.
3. افتح `desktop.png` و`mobile.png` بأداة القراءة وقارنهما بما طلبه المالك حرفيًّا؛ الجوّال لا يُلمس بلا طلب لكنّه لا ينكسر.
4. أيّ سطر في `pageErrors` أو `consoleErrors` من المخرجات = العمل لم ينتهِ؛ أصلحه ثمّ أعد اللقطة.
5. `npm run ci` كاملًا، ثمّ اذكر في التقرير ما رأيته في اللقطات بالأرقام (المقاسات، ما ظهر وما اختفى).
