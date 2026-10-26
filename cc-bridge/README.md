# جسر Claude Code — لمالك التطبيق وحده

Claude Code **الخام** (حزمة الوكيل الرسميّة، لا حلقة من عندنا) يعمل على خادم خاصّ بالمالك وعليه نسخة من المستودع، ويظهر داخل تطبيق عمران في الإعدادات ← **Claude Code** لصاحب حساب المالك فقط. صلاحيّاته صلاحيّات جلسة المالك على الويب نفسها، والجسر لا يزيد عليه إلّا:

- **الأبواب المقفلة فقط** (`policy.mjs`): لا دفع إلى `main`/`master` ولا دفع قسريّ، لا دمج طلب سحب (`gh pr merge` ولا عبر `gh api`)، لا نشر على Vercel ولا نشر حزم، لا رجوع مدمّر (`git reset --hard`)، لا صلاحيّات نظام، ولا مسّ للأسرار (`.env`، الرموز، `/work/state`) ولا لإعدادات السياج. كلّ ما عدا ذلك مسموح كما في الويب: بحث الويب وجلبه، `curl`، `git fetch/pull`، الدفع إلى أيّ فرع آخر، `gh pr create/view/checks`، `gh run`، إعادة تشغيل الفحوص.
- **أمران للمالك:** «انشر» = التزام + دفع فرع `cc/…` + طلب سحب، و«ادمج» = دمج طلب السحب ثمّ عودة نسخة العمل إلى `main` (`git.mjs`). Vercel ينشر من `main` كالمعتاد. (إن طلب المالك في المهمّة نفسها فتح طلب السحب، يفتحه Claude Code بنفسه بـ`gh pr create` ويعطي الرابط؛ الدمج يبقى بأمر «ادمج» وحده.)
- **سجلّ تشغيل** يُستعاد إن انقطع الاتّصال، وجلسة تُستأنف بين الرسائل.

## ما تحتاجه مرّة واحدة

| المتغيّر | القيمة |
|---|---|
| `CC_ENABLED` | **`on` وحدها تشغّله** — بدونها الجسر موقوف (v-cc-off، أمر المالك ١٤ أكتوبر بعد ١٥٠ دولارًا في يوم): لا تشغيل ولا إيقاظ ذاتيّ ولا نشر ولا دمج؛ والمتغيّر نفسه في Vercel |
| `CC_BRIDGE_SECRET` | سرّ عشوائيّ ≥ ٢٤ حرفًا (نفسه في Vercel) |
| `ANTHROPIC_API_KEY` **أو** `CLAUDE_CODE_OAUTH_TOKEN` | مفتاح API يُدفع بالاستهلاك، أو رمز اشتراكك من `claude setup-token` (الموثّق رسميًّا لحزمة الوكيل هو المفتاح؛ الرمز يمرّ للحزمة كما هو فجرّبه أوّلًا) |
| `GITHUB_TOKEN` | مفتاح GitHub بصلاحيّات Contents + Pull requests + Actions (read) على المستودع؛ **يبقى في الجسر وحده** (v-audit-bridge): «انشر» و«ادمج» و`git push -u origin <فرع>` الذي يكتبه Claude Code يجريها الجسر بهذا المفتاح بوجهة `refs/heads/<فرع>` صريحة، لا `main` ولا قسر. لا يصل إلى بيئة Claude Code، لأنّ Contents: write يكفي للدفع إلى `main` والدمج بأيّ صيغة تفوت السياج النصّيّ. **حماية `main` على GitHub غير مفعّلة الآن** — فعّلها طبقةً ثانية (Settings ← Rules: لا دفع مباشر، والدمج عبر طلب سحب) |
| `CC_AGENT_GH_TOKEN` | اختياريّ: رمز fine-grained **بلا Contents: write** (Contents/Actions/Commit statuses: read، وPull requests: read/write) يصل إلى Claude Code باسم `GH_TOKEN` ليعمل `gh pr create/view/checks` و`gh run view`. بدونه يعمل `gh` في Claude Code بلا رمز (القراءة العامّة فقط) و«انشر» يفتح الطلب |
| `CC_REPO` | `OMRAN77/omran-ai-builder` (الافتراضيّ) |
| `CC_MODEL` | `claude-fable-5-1` افتراضيًّا (نموذج جلسة المالك على الويب نفسه)؛ أو `claude-opus-5` |
| `CC_FALLBACK_MODEL` | احتياط إن لم يتوفّر الأساسيّ: `claude-opus-5` افتراضيًّا |
| `CC_EFFORT` | الجهد: `max` افتراضيًّا (أو `xhigh` / `high` / `medium` / `low`)، مع تفكير تكيّفيّ |
| `CC_MAX_TURNS` / `CC_MAX_BUDGET_USD` | سقف الجولات (١٠٠٠) وسقف الكلفة للجلسة (اختياريّ) |
| `DIRECTOR_APP_URL` | التطبيق الذي يصوّر «مخرج التطبيق» شاشاته: `https://omran-ai-builder.vercel.app` افتراضيًّا (اختياريّ) |
| `DIRECTOR_CONCURRENCY` | مقاطع ffmpeg المتوازية في مهمّة المخرج: تلقائيًّا أنوية الجهاز ناقص واحد وما تحتمله ذاكرة الحاوية ((الحدّ − ٧٠٠ م.ب) ÷ ٤٠٠ م.ب لكلّ مقطع) بسقف ٤ — على ٥١٢ م.ب أو ١ غ.ب = ١ (اختياريّ). خفضه صراحةً إلى `DIRECTOR_CONCURRENCY=1` على Railway تجربة يقرّرها المالك |

في الحاوية أيضًا Chromium وPlaywright (كجلسة المالك على الويب) لمسابر `scripts/*-probe.mjs` واللقطات، وffmpeg وخطوط Noto لمخرج التطبيق، وإعدادات المستخدم وذاكرته على القرص الدائم (`/work/claude`)، والمهمّة الطويلة تُتابَع في المحادثة حتّى نهايتها مهما طالت.

## التشغيل على Railway (الأسهل — بلا خادم تديره)

1. في مشروع Railway: **New → GitHub Repo → `OMRAN77/omran-ai-builder`** (الفرع `main`).
2. **Settings → Source:** Root Directory = `/cc-bridge`، وWatch Paths = `/cc-bridge/**` (فلا يعاد النشر إلّا عند تغيّر الجسر).
   **الفرع يجب أن يبقى `main`:** خدمة تتبع فرع عمل قديمًا تتوقّف عن التحديث بصمت حين يتوقّف ذلك الفرع (حدث من ٢٠ سبتمبر إلى ١٢ أكتوبر ٢٠٢٦).
   للتأكّد بعد أيّ دمج يلمس الجسر: `curl https://<الجسر>/health` يحمل `renderJobs`.
3. **Settings → Volumes → Add Volume:** Mount Path = `/work` (نسخة المستودع وجلسات Claude Code وحالة الجسر تبقى فيه بين النشرات).
4. **Variables:** `CC_BRIDGE_SECRET` و`ANTHROPIC_API_KEY` (أو `CLAUDE_CODE_OAUTH_TOKEN`) و`GITHUB_TOKEN`؛ واختياريًّا `CC_MODEL`.
5. **Settings → Networking → Generate Domain** والمنفذ `8787`. (اختياريًّا Healthcheck Path = `/health`.)
6. بعد النشر افتح `https://<النطاق>/health` فيرجع `{"ok":true,…}`.
7. في Vercel: `CC_BRIDGE_URL=https://<النطاق>` و`CC_BRIDGE_SECRET` بالقيمة نفسها.

الحاوية تبدأ root لتملّك القرص المركّب للمستخدم `agent` ثمّ تنزل إليه فورًا؛ Claude Code لا يعمل root أبدًا.

## التشغيل على خادم صغير (Docker)

```bash
docker build -t omran-cc-bridge cc-bridge
docker run -d --name cc-bridge --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  -v cc-work:/work \
  -e CC_BRIDGE_SECRET='...' \
  -e ANTHROPIC_API_KEY='...' \
  -e GITHUB_TOKEN='...' \
  omran-cc-bridge
```

ضع أمامه HTTPS (Caddy أو Nginx) على نطاق مثل `cc.omran.example`، ولا تفتح المنفذ للعموم إلّا خلف TLS. الجسر يرفض كلّ طلب بلا السرّ.

## ربط التطبيق (Vercel)

في متغيّرات البيئة على Vercel: `CC_BRIDGE_URL=https://cc.omran.example` و`CC_BRIDGE_SECRET` بالقيمة نفسها. بعد النشر يظهر قسم **Claude Code** في الإعدادات لحساب المالك.

## الاستعمال (من صندوق المحادثة نفسه)

- في صندوق المحادثة اضغط **@** واختر **Claude Code** (يظهر لحساب المالك وحده)، ثمّ اكتب المهمّة كما تكتبها في أيّ جلسة Claude Code. الأدوات تظهر في شريط الحالة، والردّ يأتي رسالةً عاديّة في المحادثة مع حالة git (الفرع، التغييرات، الالتزامات).
- **انشر** (أو «انشر: عنوان»): يدفع الفرع ويفتح طلب سحب ويعطيك الرابط.
- **ادمج** (أو «ادمج 123»، بعد التأكيد): يدمج الطلب إن كانت فحوصه خضراء، فينشره Vercel. «ادمج بالقوّة» يتجاوز فحصًا أحمر.
- **تراجع**: يسقط التغييرات المحلّيّة ويعود إلى أحدث `main`. **الحالة**: حالة git. **جلسة جديدة**: ينسى سياق الجلسة السابقة. **أوقف**: يوقف التشغيل الجاري.
- أرفق لقطة شاشة مع الرسالة فيراها Claude Code كما تراها (png/jpeg/webp/gif، حتّى ٤ صور)؛ ردوده لا تدخل ذاكرة المستخدم. لا قسم مستقلّ في الإعدادات.

## نقاط الجسر (للاطّلاع)

`POST /chat` (SSE) · `GET /runs/:id?since=` · `POST /stop` · `GET /status` · `POST /publish` · `GET /pr/:n` · `POST /merge` · `POST /reset` — كلّها بترويسة `Authorization: Bearer <CC_BRIDGE_SECRET>`.

## مخرج التطبيق (v-app-director)

قسم «مخرج التطبيق» في صانع الفيديو (للمالك وحده) يكتب السيناريو ويسجّل التعليق في Vercel، ثمّ يرسل مانيفست المشاهد إلى الجسر الذي يصوّر شاشات التطبيق المنشور بـChromium (١٢٨٠×٧٢٠ ×٣، ثيم داكن) ويرسم بطاقات العناوين ويدمج الفيديو بـffmpeg (zoompan، والانتقال xfade مخبوز في آخر كلّ مقطع فيكون الدمج لصقًا بلا إعادة ترميز وبذاكرة ثابتة؛ ‏1080p30 H.264/AAC). الترميز يبدأ أثناء التصوير، ولقطة تتعذّر مرّتين تصير بطاقة عنوان بدل فشل الفيديو.

- `POST /render` · `GET /render/:jobId` · `GET /render/:jobId/video.mp4` — بترويسة `Authorization: Bearer <رمز مهمّة>` لا السرّ الخام: الرمز HMAC بـ`CC_BRIDGE_SECRET` يصدره Vercel للمالك (`/api/ai?action=app-director-token`، ساعتان، يحمل اسم المالك ومعرّف المهمّة). الجسر يجيب CORS لأصل التطبيق ومعاينات Vercel.
- الناتج يبقى ٢٤ ساعة في `/work/state/render/jobs/<jobId>` ثمّ يُحذف. حدود: ٩٠ مشهدًا، ١٦٠ م.ب للمانيفست، ٥٥ دقيقة للمهمّة.
- في Vercel يلزم `CC_BRIDGE_URL` و`CC_BRIDGE_SECRET` (موجودان) و`GEMINI_API_KEY`، واختياريًّا `DIRECTOR_MODEL` (نموذج المخرج؛ الافتراضيّ أحدث Pro).
- الصوت الاحتياطيّ (حين يرفض مزوّد صوت مها/عبدالله) بالمفتاح نفسه `GEMINI_API_KEY`؛ اختياريًّا `DIRECTOR_TTS_MODEL` (نموذج الصوت الذي يُجرَّب أوّلًا)
  و`DIRECTOR_VOICE_FEMALE` / `DIRECTOR_VOICE_MALE` (اسم الصوت؛ الافتراضيّ Kore / Charon). ملفّ الصوت يصل الجسر WAV أو MP3 ويُكتب بامتداده من محتواه.
