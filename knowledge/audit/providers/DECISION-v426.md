# v426 — المزوّدون الأربعة المعتمدون (منشور)

**الأمر:** عمران، ٦ أغسطس ٢٠٢٦ ٢٣:١٦ — «اعتمد موضوع المزودين على اخر اتفاق انك تشيلهم من القائمه وترتبهم».

## ما صار فعلًا
| | القيمة |
|---|---|
| القائمة الظاهرة (الإعدادات) | Claude · Gemini · OpenAI · Groq — بهذا الترتيب |
| بركة «اسأل الكل» | الأربعة فقط (كانت ٩) |
| سلسلة الاحتياط `AUTO_FALLBACK_ORDER` | الأربعة (كانت ٩) |
| مسابقة نصوص التصاميم `competeDesignLines` | الأربعة (كانت تنادي ٩ في كلّ تصميم) |
| المجموعات الوظيفية | claude:[claude] · gemini:[gemini,groq] · openai:[openai,perplexity] |
| خارج كلّ المسارات نهائيًّا | OpenRouter · Mistral · DeepSeek · Cohere |
| Perplexity | **خارج القائمة**، باقٍ محرّك الأخبار/الأسعار الحيّة + احتياط GPT فقط |
| النصوص الظاهرة | «٩ مزوّدين/نماذج» → «٤» في: عن البرنامج · og:description · اسأل الكل |
| بطاقات المفاتيح الخمس | **مخفيّة لا محذوفة** — `app-06-checkout.js` يقرأ عناصرها؛ الحذف = TypeError |

**لم يُلمس:** مفاتيح Vercel (٢١/٢١ باقية) · دوالّ `api/_lib/*.js` للخمسة · `api/ai.js` routing · `stockTickerToggle` · مها · تخطيط الجوّال.

## أرقام
- أسطر مُغيَّرة في المصدر: **~٨٣** (الحزمة مُولَّدة، لا تُحسب).
- ثلاث دفعات: `13daf72` · `5846b0b` · `762a05c` — كلّها متحقَّقة ببروتوكول git (٧/٧ ملفّات).
- نشر الإنتاج: `dpl_CWtNZLnaZokP2xuRfaRr1cdWQXUn` · دخان ١٨/٠ أخضر.
- نقطة الرجوع: `dpl_6Ch3u1XtSHiyqDpJkiWEzPqDzeZp`.
- نسخة احتياطيّة: `/tasklet/agent/home/backup/main-pre-providers4/` (٧ ملفّات).

## التراجع
```
bun /tasklet/agent/home/scripts/vercel-rollback.ts dpl_6Ch3u1XtSHiyqDpJkiWEzPqDzeZp
```
ثمّ دفع ملفّات `backup/main-pre-providers4/` إلى main. الرقعة نفسها: `/tasklet/agent/home/patches/providers-4/patch.py` (+`patch2.py`) — تُطبَّق على شجرة نظيفة وتُعكَس بالنسخة الاحتياطيّة.

## ما بقي مفتوحًا
- **Perplexity:** إن أردتَ إخراجه نهائيًّا فالأخبار والأسعار الحيّة تحتاج بديلًا (Tavily موجود في `/api/search` لكن غير موصول بمسار الدردشة النصّيّة) — عمل يوم، لا خمس دقائق.
- **i18n:** «9 AI models» باقٍ في ٨ ملفّات لغات أخرى (ru/tr/ur/hi/ne/ml/fil) — زرّ «اسأل الكل» مخفيّ أصلًا، فالأثر صفر.
- مفاتيح الخمسة في Vercel: باقية (لا مساس بالبيئة بلا أمر).
