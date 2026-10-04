# جلسة تدقيق ٤ أكتوبر ٢٠٢٦ — بواسطة وكيل Kimi Work خارجيّ

> ملخّص ما توصّل إليه وكيل Kimi Work (مساعد ذكاء اصطناعيّ من Moonshot على جهاز
> المالك) في جلسة تشخيص ومراجعة. تفاصيل قابلة للتحقّق من الكود والمستودع.

## ١. حادثة «لا يُحفظ شيء» (أخطاء 500)

**الأعراض:** 500 على `api/account?action=chats_save` و`api/system?action=client-errors`
و`api/system?action=memory` — والمحادثات لا تُحفظ.

**السبب الجذري:** قاعدة Upstash Redis (`omran-db`) ممتلئة: **264 MB / 256 MB**
(باقة Free). Redis يرفض كلّ كتابة جديدة عند امتلائه.

**المستهلك الحقيقي للمساحة (من الكود):**
- `db/img/<id>` — الصور المُشاركة كـ Base64 (img-share.js) بعمر 30 يومًا، حتى ~3MB
- `db/file/<id>` — الفيديوهات والملفات (file-share.js) بعمر 7 أيام، حتى ~4MB
- `db/pdf/<id>` — ملفّات PDF (pdf-share.js)

**ما ليس هو السبب:** محادثات `chats:*` — كلّها معًا ~3MB فقط. حذفها يؤذي
المستخدمين ولا يحلّ المشكلة.

**ملاحظة معماريّة:** Redis يُستعمل مخزنًا ثنائيًّا لأنّ Vercel Blob موقوف في
المشروع (`blob-client-upload.js` يرجع 503 عن قصد). الحلول الدائمة المقترحة:
نقل الوسائط إلى تخزين كائنات (Cloudflare R2 أو إعادة Vercel Blob)، أو ترقية
Upstash (Fixed 1GB = $20/شهر حتى سبتمبر 2026).

## ٢. مفاتيح Vercel (الحالة المؤكَّدة)

| المتغيّر | الحالة |
|---|---|
| `OPENROUTER_API_KEY` | موجود (منذ ٨ يوليو) — مفتاح Kimi يعمل عبره كوسيط |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | موجودان (منذ ٢٥ يوليو) — شارة «Needs Attention» تُحلّ بإعادة النشر |
| `KIMI_API_KEY` أو `MOONSHOT_API_KEY` | **يحتاج تأكيد الإضافة** — المسار المباشر (v-kimi في oa-direct.js) يقبل أحدهما |

## ٣. تدقيق المزوّدين — هل كلٌّ فعلًا ما يدّعي؟

| المزوّد في الواجهة | الوجهة الفعلية | المفتاح | أدوات |
|---|---|---|---|
| Claude - Anthropic | Anthropic مباشرة أو OR (`anthropic/claude-haiku-4.5`) | ANTHROPIC_API_KEY أو OPENROUTER_API_KEY | ✅ |
| GPT - OpenAI | OpenAI مباشرة (`/v1/responses`) للمالك، وإلا OR | OPENAI_API_KEY | ✅ |
| Gemini - Google | Google مباشرة للباقات، وإلا OR ببادئة `google/` | GEMINI_API_KEY | ✅ |
| Kimi - Moonshot | Moonshot مباشرة (`api.moonshot.ai`)، افتراضي `kimi-k3` | KIMI_API_KEY أو MOONSHOT_API_KEY | ✅ |
| DeepSeek | مباشر + OR `deepseek/` | DEEPSEEK_API_KEY | ✅ |
| Mistral | OR فقط `mistralai/` | OPENROUTER_API_KEY | ✅ (معطّل في الواجهة حاليًّا) |
| Groq | Groq مباشرة للمالك، وإلا OR | GROQ_API_KEY | ✅ |
| Perplexity | OR `perplexity/` (Sonar) | OPENROUTER_API_KEY | ❌ بحث مدمج عمدًا |
| Cohere | OR `cohere/command-a` | OPENROUTER_API_KEY | ✅ |
| OpenRouter | أيّ موديل في الكتالوج | OPENROUTER_API_KEY | ✅ |

**ثغرات وجدها التدقيق:**
1. Kimi لم يكن يظهر في `فحص النظام` (health.js) — أُصلح في PR #893 (v-health-kimi).
2. المنتقي (السهم) للمالك وحده؛ المستخدمون على توجيه الباقة/السلسلة.
3. السلسلة المجانية (`groq,gemini,mistral,openrouter`) لا تضم Kimi.
4. «Llama 4 Maverick» المتقاعد عند Groq يُرجَّل تلقائيًا إلى `gpt-oss-120b`.

## ٤. التعديلات المرفوعة في هذه الجلسة

- **PR #893** (مدمج): `v-health-kimi` — سطر Kimi في فحص النظام.
- **هذا الملف** + تحديث `api/_lib/_knowledge.js` (مستجدّات ٤ أكتوبر في الملخّص).

## ٥. مهام مفتوحة مقترحة

1. إضافة `KIMI_API_KEY` (أو `MOONSHOT_API_KEY`) في Vercel إن لم يكن موجودًا.
2. معالجة امتلاء Redis: تنظيف `db/img`/`db/file`/`db/pdf` أو قاعدة جديدة + ترقية.
3. لاحقًا: نقل الوسائط من Redis إلى تخزين كائنات (إنهاء السبب الجذري).
4. اختبار حيّ مقارن بين المزوّدين (نفس السؤال لكلٍّ) لتقييم «الأفضل» فعليًّا.
