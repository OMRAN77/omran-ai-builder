# جسر Claude Code — لمالك التطبيق وحده

Claude Code **الخام** (حزمة الوكيل الرسميّة، لا حلقة من عندنا) يعمل على خادم خاصّ بالمالك وعليه نسخة من المستودع، ويظهر داخل تطبيق عمران في الإعدادات ← **Claude Code** لصاحب حساب المالك فقط. الجسر لا يزيد على Claude Code إلّا:

- **سياج:** لا دفع ولا طلب سحب ولا دمج ولا نشر ولا شبكة من داخل الأوامر (`policy.mjs`).
- **أمران للمالك:** «انشر» = التزام + دفع فرع `cc/…` + طلب سحب، و«ادمج» = دمج طلب السحب ثمّ عودة نسخة العمل إلى `main` (`git.mjs`). Vercel ينشر من `main` كالمعتاد.
- **سجلّ تشغيل** يُستعاد إن انقطع الاتّصال، وجلسة تُستأنف بين الرسائل.

## ما تحتاجه مرّة واحدة

| المتغيّر | القيمة |
|---|---|
| `CC_BRIDGE_SECRET` | سرّ عشوائيّ ≥ ٢٤ حرفًا (نفسه في Vercel) |
| `ANTHROPIC_API_KEY` **أو** `CLAUDE_CODE_OAUTH_TOKEN` | مفتاح API يُدفع بالاستهلاك، أو رمز اشتراكك من `claude setup-token` (الموثّق رسميًّا لحزمة الوكيل هو المفتاح؛ الرمز يمرّ للحزمة كما هو فجرّبه أوّلًا) |
| `GITHUB_TOKEN` | مفتاح GitHub بصلاحيّات Contents + Pull requests (write) على المستودع |
| `CC_REPO` | `OMRAN77/omran-ai-builder` (الافتراضيّ) |
| `CC_MODEL` | `claude-opus-5` افتراضيًّا؛ أو `claude-fable-5-1` |
| `CC_MAX_TURNS` / `CC_MAX_BUDGET_USD` | سقف الجولات (٨٠) وسقف الكلفة للجلسة (اختياريّ) |

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

## الاستعمال

- اكتب المهمّة كما تكتبها في أيّ جلسة Claude Code. يرى الردّ والأدوات لحظة بلحظة، ويلتزم محلّيًّا على فرع.
- **انشر** (زرّ أو الكلمة وحدها): يدفع الفرع ويفتح طلب سحب ويعطيك الرابط.
- **ادمج** (زرّ أو الكلمة وحدها، بعد التأكيد): يدمج الطلب إن كانت فحوصه خضراء، فينشره Vercel. «ادمج بالقوّة» يتجاوز فحصًا أحمر.
- **تراجع**: يسقط التغييرات المحلّيّة ويعود إلى أحدث `main`. **جلسة جديدة**: ينسى سياق الجلسة السابقة.

## نقاط الجسر (للاطّلاع)

`POST /chat` (SSE) · `GET /runs/:id?since=` · `POST /stop` · `GET /status` · `POST /publish` · `GET /pr/:n` · `POST /merge` · `POST /reset` — كلّها بترويسة `Authorization: Bearer <CC_BRIDGE_SECRET>`.
