# جسر Claude Code — لمالك التطبيق وحده

Claude Code **الخام** (حزمة الوكيل الرسميّة، لا حلقة من عندنا) يعمل على خادم خاصّ بالمالك وعليه نسخة من المستودع، ويظهر داخل تطبيق عمران في الإعدادات ← **Claude Code** لصاحب حساب المالك فقط. صلاحيّاته صلاحيّات جلسة المالك على الويب نفسها، والجسر لا يزيد عليه إلّا:

- **الأبواب المقفلة فقط** (`policy.mjs`): لا دفع إلى `main`/`master` ولا دفع قسريّ، لا دمج طلب سحب (`gh pr merge` ولا عبر `gh api`)، لا نشر على Vercel ولا نشر حزم، لا رجوع مدمّر (`git reset --hard`)، لا صلاحيّات نظام، ولا مسّ للأسرار (`.env`، الرموز، `/work/state`) ولا لإعدادات السياج. كلّ ما عدا ذلك مسموح كما في الويب: بحث الويب وجلبه، `curl`، `git fetch/pull`، الدفع إلى أيّ فرع آخر، `gh pr create/view/checks`، `gh run`، إعادة تشغيل الفحوص.
- **أمران للمالك:** «انشر» = التزام + دفع فرع `cc/…` + طلب سحب، و«ادمج» = دمج طلب السحب ثمّ عودة نسخة العمل إلى `main` (`git.mjs`). Vercel ينشر من `main` كالمعتاد. (إن طلب المالك في المهمّة نفسها فتح طلب السحب، يفتحه Claude Code بنفسه بـ`gh pr create` ويعطي الرابط؛ الدمج يبقى بأمر «ادمج» وحده.)
- **سجلّ تشغيل** يُستعاد إن انقطع الاتّصال، وجلسة تُستأنف بين الرسائل.

## ما تحتاجه مرّة واحدة

| المتغيّر | القيمة |
|---|---|
| `CC_BRIDGE_SECRET` | سرّ عشوائيّ ≥ ٢٤ حرفًا (نفسه في Vercel) |
| `ANTHROPIC_API_KEY` **أو** `CLAUDE_CODE_OAUTH_TOKEN` | مفتاح API يُدفع بالاستهلاك، أو رمز اشتراكك من `claude setup-token` (الموثّق رسميًّا لحزمة الوكيل هو المفتاح؛ الرمز يمرّ للحزمة كما هو فجرّبه أوّلًا) |
| `GITHUB_TOKEN` | مفتاح GitHub بصلاحيّات Contents + Pull requests + Actions (read) على المستودع؛ يمرّ إلى Claude Code باسم `GH_TOKEN` ليعمل `gh` و`git push` إلى الفروع (حماية الفرع `main` على GitHub تمنع الدفع إليه من طبقة ثانية) |
| `CC_REPO` | `OMRAN77/omran-ai-builder` (الافتراضيّ) |
| `CC_MODEL` | `claude-opus-5` افتراضيًّا؛ أو `claude-fable-5-1` |
| `CC_MAX_TURNS` / `CC_MAX_BUDGET_USD` | سقف الجولات (٢٠٠) وسقف الكلفة للجلسة (اختياريّ) |

## التشغيل على Railway (الأسهل — بلا خادم تديره)

1. في مشروع Railway: **New → GitHub Repo → `OMRAN77/omran-ai-builder`** (الفرع `main`).
2. **Settings → Source:** Root Directory = `/cc-bridge`، وWatch Paths = `/cc-bridge/**` (فلا يعاد النشر إلّا عند تغيّر الجسر).
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
- الوضع لا يعمل مع صورة مرفقة، وردوده لا تدخل ذاكرة المستخدم. لا قسم مستقلّ في الإعدادات.

## نقاط الجسر (للاطّلاع)

`POST /chat` (SSE) · `GET /runs/:id?since=` · `POST /stop` · `GET /status` · `POST /publish` · `GET /pr/:n` · `POST /merge` · `POST /reset` — كلّها بترويسة `Authorization: Bearer <CC_BRIDGE_SECRET>`.
