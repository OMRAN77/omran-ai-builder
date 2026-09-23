# خريطة التوجيه — أين يذهب الطلب فعلًا

**ما هذا الملفّ:** مسار الطلب من نقطة الدخول إلى المزوّد، نقطةَ قرارٍ نقطة، مع مرساة
(`ملفّ:سطر`) لكلّ واحدة. استُخرج من الكود لا من الذاكرة، وتُحقّق منه `tests/routing-anchors.test.cjs`
(مسجَّل في `npm run ci`) — إن تغيّر التوجيه ولم تُحدَّث هذه الخريطة **يفشل الفحص**.

**لماذا:** كلّ من يريد تعديل التوجيه (أو يسأل عنه) كان يبدأ من الصفر. وأخطر ما تكشفه الخريطة
قسمُ **«أسلاك مقطوعة»** في آخرها: إعدادٌ في الواجهة لا يصل المسار الذي يستعمله المستخدم فعلًا.

> ملاحظة: `knowledge/PROJECT.md` مثالٌ حيّ على توثيقٍ تخلّف عن الواقع (`CLAUDE.md` نفسه يستثني
> منه نقطة). لذلك هذه الخريطة مقفولة باختبار، لا بالنيّة الحسنة.

---

## ١. نقطة الدخول الوحيدة

كلّ نداءات الذكاء تمرّ من دالّة واحدة: `api/ai.js:471` (`module.exports = withErrorCapture('ai', …)`).
الفرز بـ`?action=` عبر `load()` في `api/ai.js:18`.

```
POST /api/ai?action=<name>
│
├─ load(action)                                   ai.js:18
│     openai · gemini · groq · claude · cohere · deepseek · mistral
│     openrouter · perplexity · agent · chat
│     (غير ذلك → 404 «unknown ai route»)
│
└─ action ضمن PROVIDERS؟                          ai.js:469
   │  ['openai','gemini','groq','claude','cohere','deepseek',
   │   'mistral','openrouter','perplexity']   ← لاحظ: «chat» و«agent» ليسا منها
   │
   ├─ نعم (مزوّد مباشر) ──→ §٢
   └─ لا  (chat / agent) ──→ §٣
```

**نتيجة عمليّة:** كلّ ما يُحقن في `injectNote` لا يصل مسار المحادثة الرئيسيّ. هذا مصدر
«الأسلاك المقطوعة» في §٦.

---

## ٢. مسار المزوّد المباشر (PROVIDERS)

يُطبَّق فقط حين `action` في القائمة **و**`req.method === 'POST'` (`ai.js:479`).

| # | القرار | المرساة | الأثر |
|---|--------|---------|-------|
| ١ | تنظيف محادثة Claude (آخر رسالة يجب أن تكون للمستخدم) | `ai.js` داخل المعالج | يمنع خطأ 400 (v262) |
| ٢ | تنظيف `contents` لـGemini | `sanitizeGeminiContents` | يمنع 400 صامتًا |
| ٣ | هل الطالب المالك؟ | `isOwner` → `body.__ownerFactory` | يفتح الوضع الخام |
| ٤ | المالك + `raw !== false` → نزع طبقة التطبيق | `stripAppSystem` — `ai.js:351` | يحذف كلّ رسائل `system` |
| ٥ | حقن الملاحظات | `injectNote` — `ai.js:357` | §٢-أ |
| ٦ | حذف علم المالك قبل الإرسال | داخل المعالج | لا يتسرّب للمزوّد |

### ٢-أ. `injectNote` — ماذا يُحقن ومتى

```
injectNote(action, body, country)                 ai.js:357
│
├─ resolveMode(body)                              ai.js:306
│   ├─ body.mode صريح وضمن MODES؟ → هو            MODES: ai.js:295
│   │     ['factory','balanced','minimal','guided']   ('minimal' → 'balanced')
│   ├─ body.__ownerFactory === true  → 'factory'   (المالك افتراضًا)
│   └─ وإلّا → AI_MODE من البيئة أو 'balanced'     ai.js:293
│
├─ mode === 'factory'
│     └─ المالك فقط: OWNER_DIRECT_NOTE ثمّ **توقّف** — لا شيء آخر يُحقن
│
├─ mode === 'balanced'  (الافتراضيّ للمستخدم)
│     balancedNote + [صور؟ IMAGE_ANALYSIS_NOTE] + [إرشاد؟ SCREEN_GUIDE_NOTE]
│     + toneNote + intentNote + APP_FACTS_NOTE + HIVE
│
└─ وإلّا (guided / احترافيّ)
      serverNote + [CLAUDE_STYLE_NOTE | ORIGINAL_PERSONA_NOTE] + noteIdentity
      + IDENTITY_BEHAVIOR_NOTE + [أكاديميّ] + [صور] + toneNote + intentNote
      + APP_FACTS_NOTE + HIVE
```

الحقن نفسه يُكتب في الحقل الذي يقرأه كلّ مزوّد: `applyNote` — `ai.js:432`
(Gemini → `systemInstruction`، Claude → `body.system`، الباقي → رسالة `system` في `messages`).

مصادر الملاحظات: النيّة `quickIntent` — `_lib/router.js:32` و`INTENT_NOTES` — `router.js:78`؛
النبرة `toneSection` — `_lib/tone.js:85` (تفضيل صريح أو كشف تلقائيّ).

---

## ٣. مسار المحادثة الرئيسيّ (`action=chat`)

`api/ai.js:30` يسلّم كلّ شيء إلى `api/_lib/chat.js:1035`. **لا يمرّ بـ`injectNote` إطلاقًا.**

### ٣-أ. اختيار الوجهة والمفتاح

```
prov (من body.provider، افتراضه 'claude')
│
├─ viaOR ؟                                        chat.js:1056
│     claude:  لا ANTHROPIC_API_KEY  و  يوجد OPENROUTER_API_KEY
│     غيره:    يوجد OPENROUTER_API_KEY
│
├─ المفتاح   = viaOR ? OPENROUTER_API_KEY : ANTHROPIC_API_KEY     chat.js:1059
│     (لا مفتاح → 500 صريح، لا هبوط صامت)                          chat.js:1060
│
├─ العنوان   = viaOR ? openrouter.ai/api/v1/messages              chat.js:1061
│                    : api.anthropic.com/v1/messages
│
└─ النموذج الافتراضيّ                              chat.js:1067
      viaOR → OR_MODELS[prov]        (chat.js:595)
      وإلّا → CHAT_CLAUDE_MODEL أو 'claude-sonnet-5'
```

**v-plan-routing (قرار المالك ٢٠ سبتمبر):** الحقول الأربعة أعلاه `let` لا `const`، لأنّ `applyRoute(p, model)`
(`chat.js:1096`) يعيد ضبطها معًا (المزوّد · الوسيط · المفتاح · العنوان · الموديل) بقرار الباقة أو بالالتقاط.
مزوّد بلا مفتاح في البيئة لا يُختار (تعود false فلا يتغيّر شيء).

**اختيار المستخدم للنموذج — للمالك وحده:** `chat.js:1074` يستدعي `pickClaudeModel`
(`chat.js:588`) فقط إن كان `prov === 'claude'` **و**الطالب المالك. القائمة المقبولة حصرًا
`CLAUDE_MODELS` (`chat.js:582`) — أيّ اسم خارجها يسقط للافتراضيّ بلا خطأ.

**v-owner-direct (أمر المالك ٢٢ سبتمبر) — Groq وGPT مباشرةً للمالك:** `chat.js:1079` — إن كان الطالب المالك والمزوّد
`groq` أو `openai` ومفتاحه (`GROQ_API_KEY` / `OPENAI_API_KEY`) في البيئة، يُرسل الطلب إلى عنوان المزوّد نفسه
(`api.groq.com` / `api.openai.com`, صيغة chat/completions) عبر `api/_lib/oa-direct.js` الذي يترجم الطلب والبثّ
بين البروتوكولين فلا تتغيّر حلقة الأدوات. فشل المباشر قبل أوّل حرف = الوسيط للمزوّد نفسه بسطر حالة
`stModelFallback`. غير المالك، أو بلا المفتاح: الوسيط كما في المخطّط أعلاه.

### ٣-ب. بوّابة الطبقة والحصّة

```
resolveTier(username)                             tier.js:153
│  لا اسم           → guest            (cap = caps().guest)
│  المالك            → owner  · subscriber:true · cap = ∞     tier.js:133
│  VIP              → vip    · subscriber:true · cap = ∞
│  باقة سارية        → sub    · subscriber:true · cap = caps()[plan]   planActive: tier.js:138
│  وإلّا             → free   · subscriber:false
│  (نتيجة مخبّأة TIER_CACHE_MS لكلّ اسم)
│
planRoute(tier, reqProv, lastUserText)            tier.js:51  ← v-plan-routing (مشترك فقط)
│  الجدول PLAN_ROUTING                             tier.js:37
│    basic (Plus): دردشة DeepSeek · قويّ DeepSeek · مسموح deepseek/groq · التقاط groq
│    pro:          دردشة DeepSeek · قويّ Claude Haiku 4.5 · مسموح deepseek/groq/gemini/mistral · التقاط gemini→deepseek
│    max:          دردشة Claude Haiku 4.5 · قويّ Claude Sonnet 5 · مسموح الكلّ · التقاط openai→gemini→deepseek
│  الدور القويّ = isStrongTurn (tier.js:44): كتلة كود، أو ≥ ٦٠٠ حرف، أو كلمات برمجة/بناء/رياضيات
│  المطلوب من المنتقي يُقبل إن كان في المسموح، وإلّا افتراضيّ الباقة؛ القويّ يغلب المطلوب
│  التطبيق في chat.js:1167 (قبل الحصّة كي تُعدّ الرسالة على المزوّد الذي يخدمها فعلًا)
│  المالك · VIP · المجانيّ · الضيف → null (لا يمرّون هنا)
│
checkAndConsume(...)                              chat.js:1173
│  السلّة = غير مشترك ? 'chat' : prov   ← المجانيّ سقفه رقم واحد، والمشترك سلّة مزوّده
│
├─ usage.allowed === false                        chat.js:1174
│    ├─ reason 'auth'          → «الجلسة منتهية…»
│    ├─ free / guest           → tier:'free-limit' | 'guest-limit' + نصّ + done
│    │                            (**لا هبوط لمزوّد آخر** — كلّها مغلقة أمامه)
│    └─ مشترك تجاوز سقفه        → FREE_TEXT.subLimit(cap)
│
└─ __freeLane = usage.tier && !usage.subscriber   chat.js:1189
```

### ٣-ج. بناء تعليمات النظام

```
sysParts                                          chat.js:1244
├─ رسائل system من العميل (ما عدا نسخة الذاكرة القديمة — isClientMemoryNote)
├─ body.system إن وُجد
├─ ذاكرة الحساب (memoryPromptBlock)
└─ التعليمات المخصّصة                              chat.js:1251
      customInstructionsBlock(body.customInstructions)   chat.js:62
      سقف 1500 حرفًا · تعلو على الأسلوب الافتراضيّ · تحت الهويّة والأبواب المقفلة

baseSystem = sysParts.join('\n\n')
النظام النهائيّ = PERSONA_NOTE + '\n' + baseSystem + (وقت · دولة · ملف المالك · ملاحظات الصور)
PERSONA_NOTE هو ميثاق الشخصيّة (الهويّة · اللغة · الأسلوب العفويّ الافتراضيّ · الأدوات · قواعد صلبة)
```

### ٣-د. الطبقة المجانيّة تنتهي هنا

```
if (__freeLane)                                   chat.js:1384
   send({tier}) ثمّ streamFreeChain(...)           free-chain.js:156
   بلا أدوات · بلا بحث حيّ · بلا صور · وينتهي الطلب
   فشل السلسلة كلّها → logError + tierDiag + FREE_TEXT.busy   (لا خطأ تقنيّ للمستخدم)
```

### ٣-هـ. المشترك: الجولة مع الأدوات

`MAX_STEPS` جولات: النموذج يقرّر بنفسه متى يستعمل `web_search` · `fetch_page` ·
`generate_image` · `edit_image` · `run_js` · `test_html` · `get_location` · `read_github`
(v-chat-github-read: قراءة GitHub فقط لكلّ المزوّدين — غير المالك بلا مفتاح؛ لا `write_github` هنا).
من يمرّ بهذا المسار من العميل: `TOOL_PROVIDERS` في `app-06` — claude · openai · gemini · deepseek · mistral ·
groq · cohere (v-cohere-tools: Cohere عبر الوسيط `cohere/command-a`). Perplexity و«OpenRouter» العامّ يبقيان
على المسار المباشر (§٢) **بلا أدوات** — Sonar لا يقبل أدوات وبحثه مدمج.
دور فيه صورة يعيد ضبط النموذج عبر `imageTurnConfig` — `chat.js:562` / `chat.js:1340`.

---

## ٤. سلسلة الاحتياط المجانيّة

```
streamFreeChain(args)                             free-chain.js:156
│
├─ الترتيب: freeChain(env)                        tier.js:198
│     من FREE_CHAIN في البيئة، وإلّا DEFAULT_CHAIN  tier.js:111
│     ['groq','gemini','mistral','openrouter']   ← v-plan-routing: Groq أوّلًا (المجّاني ٥ رسائل عليه)
│     ومزوّد بلا مفتاح يُستبعد من القائمة أصلًا
│
├─ لكلّ مزوّد: modelsToTry                         free-chain.js:244
│     المفضّل من البيئة أوّلًا، ثمّ مرشّحو المزوّد، ثمّ استكشاف /models
│     والمتقاعدون مستبعَدون (RETIRED_MODELS)
│
├─ نجح → rememberWorking(id, model)               free-chain.js:251
│     يُحفظ في ذاكرة العمليّة فلا تتكرّر المحاولات كلّ رسالة
│
├─ فشل (429 أو أيّ عطل) → المزوّد التالي **بصمت**
└─ فشل الجميع → {ok:false, errors}
```

كلّها بصيغة OpenAI المتوافقة (`chat/completions` + SSE) فدالّة بثّ واحدة تكفي.
ملاحظة نظامها `FREE_NOTE` — `free-chain.js:18` (بلا اسم أيّ مزوّد — قرار المالك).

---

## ٥. مسارات الفشل (مَن يلتقط ماذا)

| الحالة | أين | ماذا يحدث |
|--------|-----|-----------|
| لا `ANTHROPIC_API_KEY` ولا `OPENROUTER_API_KEY` | `chat.js:1060` | 500 صريح — **لا هبوط** |
| الطبقة المجانيّة | `chat.js:1384` | السلسلة المجانيّة، وينتهي الطلب |
| 400 على حقول إطفاء التفكير (وسيط OpenRouter، غير كلود) | قبل الفشل النهائيّ (`v-chat-fast`، `chat/or-quick-400`) | إعادة فوريّة بلا الحقل المرفوض (`thinking`/`reasoning`)، ويُذكَر المستوى لبقيّة عمر الدالّة (`__orQuick.level`) |
| مشترك: تعطّل مزوّد باقته **قبل أوّل حرف** | `chat.js:1499` (`v-plan-routing`، `chat/plan-fallback-<status>`) | التالي في سلسلة الباقة **بصمت** (أرخص فأرخص، مزوّد بلا مفتاح يُتخطّى) قبل الهبوط المجانيّ أدناه |
| انهيار المحرّك الاحترافيّ **قبل أوّل حرف** (رصيد · 401 · 429 · 5xx) | `chat.js:1514` (`v-king-fallback`) | هبوط إلى `streamFreeChain` **بصمت** (`v-silent-fallback`) — بلا سطر حالة ولا بادئة |
| … ودور فيه **صورة** | نفس الموضع (`v-img-no-blind`) | `requireVision`: المزوّدات بلا رؤية تُستبعد (Gemini وحده يرى)؛ لا مزوّد يرى → `FREE_TEXT.imageBusy` صريح، **لا تأليف** ولا هبوط للعميل. المالك وحده يرى `modelLabel: احتياط · مزوّد/نموذج`. نفاد الرصيد (402) → إشعار دفع للمالك مرّة كلّ ٦ ساعات (`_owner-alert.js`) |
| فشل السلسلة أيضًا | نفس الموضع | `tierDiag` + `error` مع `fallback:true` فيهبط العميل بمساره القديم |
| انهيار **بعد** بدء البثّ (`anyText`) | نفس الموضع | لا هبوط — النصّ المكتوب يبقى |
| نفاد حصّة المجانيّ/الضيف | `chat.js:1174` | ردّ عاديّ بزرّ اشتراك، لا خطأ |

القاعدة المستخلصة: **الهبوط الصامت مشروط بألّا يكون كُتب حرف واحد.**

---

## ٦. أسلاك مقطوعة (إعداد واجهة لا يصل وجهته)

أهمّ قسم. كلّ بند هنا **مُثبَت بالكود لا مُخمَّن**.

### ٦-أ. مُصلَحة

| السلك | كان ينقطع عند | الحالة |
|-------|---------------|--------|
| أزرار «النبرة» (ودود · مباشر · رسمي) | العميل يحقن `tone` لطلبات `/api/ai`، و`injectNote` لا يقرأه إلّا لمسارات `PROVIDERS` (`ai.js:469`) — و`chat` ليس منها | **حُذفت** (`v-tone-buttons-removed`). البديل: الأسلوب العفويّ في `PERSONA_NOTE` + حقل التعليمات المخصّصة |

### ٦-ب. قائمة ما زال يستحقّ الانتباه

| البند | الواقع | الأثر |
|-------|--------|-------|
| `tone.js` كامل (`TONE_MATCHING` · `TONE_BLOCKS` · `TONE_LIMITS`) | يعمل على مسارات `PROVIDERS` فقط، ولا يصل `action=chat` | مسار المحادثة الرئيسيّ **لا يرى** حدود النبرة الثابتة (`TONE_LIMITS`: منع الغزل وادّعاء الإنسانيّة). بدائلها في `PERSONA_NOTE` جزئيّة |
| `quickIntent` / `INTENT_NOTES` (`router.js`) | نفس الشيء — `injectNote` فقط | تصنيف النيّة لا يصل المحادثة الرئيسيّة |
| `APP_FACTS_NOTE` (حارس أسئلة «مَن صنع التطبيق») | نفس الشيء | حماية خصوصيّة المالك من هذا الحارس لا تسري على `chat` (يغطّيها `_knowledge.js` و`PERSONA_NOTE` بصياغة أخرى) |
| `ONBOARDING` في `tone.js:132` | مُصدَّر ولا يستهلكه أحد | كود ميّت |
| `scripts/build.mjs` يختم `sw.js` | يبحث عن `CACHE_NAME` و`sw.js` يستعمل `BUILD_ID` | الختم لاغٍ. غير مؤثّر عمليًّا (القشرة تُجلب `no-store`) لكنّه تناقض قائم |

> **القاعدة:** أيّ إعداد واجهة جديد يجب أن يُثبِت وصوله إلى المسار الذي يستعمله المستخدم
> فعلًا — لا إلى مسارٍ كان يستعمله يومًا. `chat` انفصل عن `PROVIDERS` فسقطت معه كلّ طبقة
> كانت تُحقن في `injectNote`، بصمتٍ تامّ.

---

## ٧. كيف تُحدَّث هذه الخريطة

أداتان تحرسان هذه الخريطة:

| الأداة | ماذا تفحص | متى تعمل |
|--------|-----------|----------|
| `tests/routing-anchors.test.cjs` | **البنية**: كلّ مرساة `ملفّ:سطر` موجودة وتحمل التعريف الذي ادّعته الخريطة (٥١ مرساة، ٦ ملفّات)، والقوائم الحاسمة (`PROVIDERS` · `DEFAULT_CHAIN` · `MODES` · `CLAUDE_MODELS`) مطابقة عنصرًا عنصرًا، والأسلاك المقطوعة في §٦-ب ما زالت مقطوعة فعلًا | داخل `npm run ci` |
| `scripts/routing-probe.mjs` | **السلوك**: ١٩ نقطة قرار تُستدعى فعلًا (`__resolveMode` · `__injectNote` · `__stripAppSystem` · `resolveTier` · `freeChain`) ويُقارَن الفرع المأخوذ بما تصفه الخريطة. بلا شبكة وبلا مفاتيح | `node scripts/routing-probe.mjs` |

الأوّل يمسك انزياح الكود، والثاني يمسك تغيّر السلوك مع بقاء الشكل. أُثبت أنّ الأوّل يفشل
فعلًا: إزاحة سطر واحد في `api/ai.js` أسقطته فورًا («المرساة `api/ai.js:471` تشير إلى سطر فارغ»).

عند تغيير التوجيه: عدّل الكود، ثمّ عدّل هذه الخريطة، ثمّ `npm run ci`.
