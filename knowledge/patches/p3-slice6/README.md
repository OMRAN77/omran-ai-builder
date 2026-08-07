# المرحلة ٣ — الشرائح ١–٦ · نقطة استعادة كاملة
**٦ أغسطس ٢٠٢٦ · متحقَّقة على المعاينة · صفر سطر دُفع إلى `main` أو الإنتاج.**

## الحصيلة
`index.html`: **٤٨٠٥ → ٢٠٨٠ سطرًا** (−٢٧٢٥ · **٥٧٪**) · ١٣ ملفًّا خارجيًّا = ٢٧١٨ سطرًا.

| شريحة | المخرج | أسطر |
|---|---|---|
| ١ | `css/tokens.css` ٦٧٦ · `css/redesign.css` ١٩٢ | −٨٧١ |
| ٢ | `css/modules.css` ٣٢٣ | −٣١٨ |
| ٣ | `js/edu.js` ٦٦٣ | −٦٦٣ |
| ٤ | `js/ui-docs.js` ١٩٩ · `js/ui-wiring.js` ١٦٥ | −٣٦٦ |
| **٥** | `js/premium.js` ١٢١ · `js/exp.js` ٩٢ · `js/video.js` ٨٣ | **−٢٩٩** |
| **٦** | `js/design-sels.js` ٨٩ · `js/design-gen.js` ٧٥ · `js/themes.js` ١١ · `js/selfdiag.js` ٢٩ | **−٢٠٨** |

## إثبات النقل الحرفيّ (٥+٦)
أُعيد تركيب `index.html` من الملفّات السبعة ووُوزن بـ sha256 مقابل الأصل: **مطابقة بايت-ببايت**.
`node --check` أخضر على السبعة. صفر بقايا داخليّة. ترتيب التنفيذ محفوظ (لا `defer` ولا `async`).

## ما بقي داخل `index.html` عمدًا
- بذرة `__swallow` (١٠ أسطر، السطر ٤) — يجب أن تسبق كلّ شيء.
- `application/ld+json` (٢٢ سطرًا) — ليست JavaScript.
- سطران أحاديّان مدفونان داخل أسطر HTML — إخراجهما لا يوفّر شيئًا.

## اكتشاف: الحارس كان أعمى عن ٥٤٨ سطرًا
`guard.mjs` يفحص `*.js` فقط — فكلّ JS داخل `index.html` لم يُفحَص يومًا. الاستخراج أدخله تحت الحارس فوقعت ٤ اكتشافات:
- `design-sels.js` ٣ كتمات صامتة `catch(e){}` → صارت `__swallow(e,'design-sels:boot|lang|observe')`. **إصلاح حقيقيّ، لا تجميل.**
- `selfdiag.js` `.catch(function(){})` → `guard-ok` موثَّق: مُبلِّغ الأخطاء لا يُبلّغ عن فشل إبلاغه (حلقة).
- صفر سطر إضافيّ: ٣ أسطر عُدِّلت في مكانها.

## التحقّق على المعاينة
`https://omran-ai-builder-5qjf59lko-omran4.vercel.app` · نشرة `dpl_6yj4o1xRT6jBjrThQQvBjKBz8igh` · رجوع `dpl_4EnPn4ZGeownPSPKbxHNAsbRzA19`

| قياس | إنتاج | شريحة | حكم |
|---|---|---|---|
| قواعد CSS | ٧٤٢ | ٧٤٢ | ✔ |
| عناصر مقيسة | ٧٣٥ | ٧٣١ | ✔ الفرق = ٤ وسوم `<style id>` خرجت في ١–٢ |
| مفاتيح وظيفيّة | ٣٠ | ٣٠ | ✔ ٢٨ مطابق · المختلفان مقصودان: `inlineScripts` ١٤→٤ و`extScripts` ٢→١٣ |
| أخطاء JS | ٠ | ٠ | ✔ |
| الدخان | — | ١٨/٠ أخضر | ✔ |
| مها | ٢١ خصيصة | ٢٠ مطابقة | ✔ الفرق الوحيد `boxShadow` = طور نبضة الوهج (٠٫٦٥٠ ↔ ٠٫٦٦٣) · الموضع متطابق |
| شريط الأسهم | — | — | ✔ الفرق = إطار الحركة فقط |

## درس قياس جديد
المقارنة تُفسد بحالة المتصفّح لا بالكود. ثُبِّت قبل كلّ قياس:
`aiapp_lang='ar'` · `panelWidthSidebar='250'` · حذف `tickerCollapsed` و`waCollapsed`.
بدونه ظهرت فروق كاذبة: لغة `en` مقابل `ar` (طول نصّ المصاريف ٢٢٢↔٢٦٨) وعرض شريط ٣٣٠ مقابل ٢٥٠ (انزياح ٨٠px في ٣٤ عنصرًا).

## الاسترداد بعد محو `/tmp`
```
bun /tasklet/agent/home/scripts/pull-src.ts          # الإنتاج → /tmp/vc/src
rm -rf /tmp/p3 && cp -r /tmp/vc/src /tmp/p3
cp -r /tasklet/agent/home/patches/p3-slice6/. /tmp/p3/   # يغطّي index.html + css + js
```
أو إعادة البناء من الصفر: `python3 scripts/p3-slice5.py` ثمّ `p3-slice6.py` على `/tmp/p3` المبنيّ من `patches/p3-slice4`.

## الترقية إلى الإنتاج (أمر واحد)
```
SRC_ROOT=/tmp/p3 bun /tasklet/agent/home/scripts/deploy-files.ts production "المرحلة ٣ شرائح ١–٦" \
  index.html css/tokens.css css/redesign.css css/modules.css \
  js/edu.js js/ui-docs.js js/ui-wiring.js js/premium.js js/exp.js js/video.js \
  js/design-sels.js js/design-gen.js js/themes.js js/selfdiag.js
```

## العائق الوحيد
٢٧١٨ سطرًا منقولًا ÷ ٤٠٠/يوم = ٧ أيّام. والسؤال لم يُجَب: **هل النقل الحرفيّ المُثبَت بـsha256 يُحتسب من السقف؟**
حتّى يأمر عمران بغيره: يُحتسب. لذلك **لم يُدفع شيء**.
