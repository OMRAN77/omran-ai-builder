# ملفّات دفعة P4 — ما رُفع ونُشر فعلًا
**التاريخ:** ٦ أغسطس ٢٠٢٦ · **GitHub:** `ceba07b3` · **الإنتاج:** `dpl_6Ch3u1Xt` (READY ١٦ث) · **المعاينة قبله:** `4jxL9fVt`

## الخلاصة في سطرين
**٩ ملفّات** تغيّرت ورُفعت بايتاتها — إلى GitHub وإلى الإنتاج، متطابقة في الاثنين.
لقطة النشر نفسها تحتوي **١٩٣ ملفًّا (٤٤ م.ب)** لأنّ كلّ نشر في Vercel لقطة كاملة؛ لكن **١٨٤ ملفًّا لم تُرفع** — أُعيد استخدامها ببصمتها كما هي.

---

## أوّلًا: التسعة التي تغيّرت
| # | الملفّ | الحجم | sha256 | +/− أسطر | ما تغيّر |
|---|---|---|---|---|---|
| ١ | `vercel.json` | ٧١٥٥ ب | `dfc57d51fe86` | +٢٠ / −٠ | رؤوس الكاش الخمس (ffmpeg سنة `immutable` · js+css ٥د+SWR يوم · icons يوم+أسبوع · `index.html` و`sw.js` طازجان دائمًا) |
| ٢ | `package.json` | ٦٠٥ ب | `5b76d8978084` | +٣ / −٠ | `engines` تثبيت Node 24 |
| ٣ | `.nvmrc` | ٣ ب | `68ca3fba3b7e` | جديد | `24` |
| ٤ | `CONTRIBUTING.md` | ٢٩٣٧ ب | `ad375b4c4eae` | جديد | قواعد المساهمة (توثيق، صفر منطق) |
| ٥ | `index.html` | ٦٥٠٧٦ ب | `1669cc3a626c` | +١ / −١ | ترقيم نسخة الحزمة `?v=` |
| ٦ | `sw.js` | ٤٤١٩ ب | `84954da16fde` | +١ / −١ | اسم الكاش يوافق النسخة |
| ٧ | `js/app-01-boot-auth.js` | ٥٠٧٤٠ ب | `cf7f512c203c` | +٣ / −١ | لغة شاشة الدخول تقرأ اللغة الحيّة |
| ٨ | `js/app-04-i18n-state.js` | ٩٥٩٥٥ ب | `142341448995` | +٢ / −٢ | حارسا `btnLangAr` / `btnLangEn` |
| ٩ | `js/app.bundle.js` | ١١٤١٧٣٣ ب | `10cba084f924` | +٥ / −٣ | الحزمة المُجمَّعة = مجموع ٧ و٨ |

**مجموع المنطق الجديد: ٢٨ سطرًا** (الحزمة نقل لا إضافة). `stockTickerToggle` سليم في ٤ مواضع.

## ثانيًا: التحقّق (ما أُثبت، لا ما يُفترض)
- **قبل:** `backup/main-pre-p4/` — ٧/٧ sha256 ✓ · **بعد:** `backup/main-post-p4/` — ٩ ملفّات + `MANIFEST.sha256`.
- **GitHub:** ٩/٩ بصمة مطابقة (الاستعلام الأوّل قال ٨/٩ خطأً — تناقض لحظيّ بعد الكتابة، سُجّل فخًّا).
- **الإنتاج قبل النشر = `main` بالبايت** في السبعة المشتركة ⇒ لا انزياح.
- **دخان:** ١٨/٠ على المعاينة، و١٨/٠ على الإنتاج · الرؤوس الخمس مؤكَّدة حيًّا على `omran-ai-builder.vercel.app`.
- **نقطة الرجوع:** `dpl_FyDWdCEVL9n5qUmmf8PXMuUg3HR1`.

---

## ثالثًا: لقطة النشر الكاملة — ١٩٣ ملفًّا
النجمة **★** = من التسعة المرفوعة. الباقي منشور ضمن اللقطة لكن بايتاته لم تُرسَل.

### `(الجذر)` — 20 ملفًّا
- .gitignore · 0.9 ك.ب
- **★ .nvmrc** · 0.0 ك.ب
- .tasklet-source-revision · 0.0 ك.ب
- .vercelignore · 2.0 ك.ب
- **★ CONTRIBUTING.md** · 2.9 ك.ب
- README.md · 0.0 ك.ب
- explore.html · 12.6 ك.ب
- **★ index.html** · 63.6 ك.ب
- index.html.orig · 455.4 ك.ب
- legal-strings.js · 1.6 ك.ب
- manifest.json · 0.8 ك.ب
- p.html · 2.6 ك.ب
- **★ package.json** · 0.6 ك.ب
- privacy.html · 7.3 ك.ب
- robots.txt · 0.1 ك.ب
- sitemap.xml · 0.2 ك.ب
- **★ sw.js** · 4.3 ك.ب
- templates-data.js · 40.2 ك.ب
- terms.html · 8.2 ك.ب
- **★ vercel.json** · 7.0 ك.ب

### `.github/workflows` — 1 ملفًّا
- ci.yml · 2.3 ك.ب

### `.vercel` — 1 ملفًّا
- project.json · 0.1 ك.ب

### `api` — 8 ملفًّا
- account.js · 1.7 ك.ب
- ai.js · 32.0 ك.ب
- edu.js · 32.0 ك.ب
- media.js · 1.0 ك.ب
- system.js · 1.7 ك.ب
- telegram.js · 7.8 ك.ب
- tools.js · 2.0 ك.ب
- video.js · 1.2 ك.ب

### `api/_lib` — 83 ملفًّا
- _carUsage.js · 2.4 ك.ب
- _constructionLibrary.js · 1.6 ك.ب
- _constructionUsage.js · 2.2 ك.ب
- _designUsage.js · 2.6 ك.ب
- _emailCrypto.js · 1.3 ك.ب
- _errors.js · 4.6 ك.ب
- _fashionUsage.js · 2.2 ك.ب
- _fetch-timeout.js · 2.1 ك.ب
- _owner.js · 2.9 ك.ب
- _portraitUsage.js · 2.9 ك.ب
- _retired.js · 1.6 ك.ب
- _secrets.js · 1.5 ك.ب
- _studioUsage.js · 2.5 ك.ب
- _usage.js · 11.0 ك.ب
- _videoUsage.js · 4.4 ك.ب
- admin-actions.js · 3.3 ك.ب
- admin-stats.js · 6.2 ك.ب
- agent-tool-result.js · 2.1 ك.ب
- agent.js · 45.3 ك.ب
- analyze-zip.js · 7.3 ك.ب
- auth-google-callback.js · 6.2 ك.ب
- auth.js · 24.7 ك.ب
- blob-client-upload.js · 0.8 ك.ب
- car-tools.js · 10.5 ك.ب
- chats.js · 6.3 ك.ب
- check-reminders.js · 7.5 ك.ب
- claude.js · 5.7 ك.ب
- client-errors.js · 2.8 ك.ب
- cohere.js · 4.0 ك.ب
- construction-create.js · 13.9 ك.ب
- construction-library.js · 1.1 ك.ب
- construction-view.js · 5.3 ك.ب
- create-checkout-session.js · 6.7 ك.ب
- deepseek.js · 3.8 ك.ب
- design-create.js · 6.3 ك.ب
- design-suggest.js · 4.1 ك.ب
- email-calendar.js · 3.7 ك.ب
- email-callback.js · 2.5 ك.ب
- email-ignore.js · 1.6 ك.ب
- email-list.js · 9.6 ك.ب
- email-send.js · 3.5 ك.ب
- env.js · 5.6 ك.ب
- fashion-create.js · 6.3 ك.ب
- fashion-suggest.js · 5.6 ك.ب
- feedback.js · 2.9 ك.ب
- gemini.js · 5.0 ك.ب
- groq.js · 2.9 ك.ب
- health.js · 2.2 ك.ب
- kv.js · 3.9 ك.ب
- log-error.js · 2.4 ك.ب
- maha-image.js · 9.4 ك.ب
- memory.js · 11.6 ك.ب
- mistral.js · 2.9 ك.ب
- openai.js · 4.0 ك.ب
- openrouter.js · 3.0 ك.ب
- paypal-client-id.js · 0.4 ك.ب
- paypal-order.js · 5.6 ك.ب
- perplexity.js · 3.0 ك.ب
- points.js · 11.8 ك.ب
- portrait-style.js · 19.0 ك.ب
- push-subscribe.js · 1.7 ك.ب
- realtime-session.js · 36.5 ك.ب
- reminders.js · 3.9 ك.ب
- runway-keys.js · 3.9 ك.ب
- safe-parse.js · 0.7 ك.ب
- search.js · 22.9 ك.ب
- share.js · 5.6 ك.ب
- stocks.js · 22.1 ك.ب
- stt.js · 10.6 ك.ب
- studio-create.js · 9.9 ك.ب
- studio-suggest.js · 5.4 ك.ب
- translate.js · 3.9 ك.ب
- tts.js · 7.6 ك.ب
- usage-status.js · 1.1 ك.ب
- vapid-public-key.js · 0.3 ك.ب
- veo-create.js · 3.7 ك.ب
- veo-download.js · 1.2 ك.ب
- veo-status.js · 2.1 ك.ب
- video-balance.js · 1.0 ك.ب
- video-create.js · 6.1 ك.ب
- video-script.js · 7.4 ك.ب
- video-status.js · 1.6 ك.ب
- video-upscale-create.js · 3.0 ك.ب

### `assets/characters` — 6 ملفًّا
- c1.png · 1017.2 ك.ب
- c2.png · 1034.7 ك.ب
- c3.png · 998.9 ك.ب
- c4.png · 1083.6 ك.ب
- c5.png · 1152.6 ك.ب
- c6.png · 1177.3 ك.ب

### `css` — 3 ملفًّا
- modules.css · 38.2 ك.ب
- redesign.css · 20.4 ك.ب
- tokens.css · 52.0 ك.ب

### `ffmpeg/core` — 2 ملفًّا
- ffmpeg-core.js · 111.8 ك.ب
- ffmpeg-core.wasm · 31376.1 ك.ب

### `ffmpeg/lib` — 8 ملفًّا
- classes.js · 8.5 ك.ب
- const.js · 1.0 ك.ب
- empty.mjs · 0.2 ك.ب
- errors.js · 0.3 ك.ب
- index.js · 0.0 ك.ب
- types.js · 0.3 ك.ب
- utils.js · 0.1 ك.ب
- worker.js · 4.7 ك.ب

### `ffmpeg/util` — 4 ملفًّا
- const.js · 0.1 ك.ب
- errors.js · 0.2 ك.ب
- index.js · 4.7 ك.ب
- types.js · 0.0 ك.ب

### `i18n` — 12 ملفًّا
- bn.js · 90.6 ك.ب
- es.js · 58.2 ك.ب
- fil.js · 59.2 ك.ب
- fr.js · 56.7 ك.ب
- hi.js · 85.6 ك.ب
- id.js · 56.1 ك.ب
- ml.js · 112.2 ك.ب
- ne.js · 91.9 ك.ب
- ru.js · 81.9 ك.ب
- tr.js · 58.0 ك.ب
- ur.js · 67.8 ك.ب
- zh.js · 52.9 ك.ب

### `icons` — 8 ملفًّا
- apple-touch-icon-v2.png · 41.5 ك.ب
- brand-ar.png · 189.7 ك.ب
- brand-en.png · 212.9 ك.ب
- favicon-32-v2.png · 2.1 ك.ب
- icon-192-v2.png · 47.0 ك.ب
- icon-512-v2.png · 306.9 ك.ب
- maha-icon.png · 32.8 ك.ب
- og-image.png · 152.1 ك.ب

### `js` — 32 ملفًّا
- _floorplan-editor-client.js · 10.2 ك.ب
- app-00-swallow.js · 4.0 ك.ب
- **★ app-01-boot-auth.js** · 49.6 ك.ب
- app-02-tts.js · 23.3 ك.ب
- app-03-i18n-data.js · 115.6 ك.ب
- **★ app-04-i18n-state.js** · 93.7 ك.ب
- app-05-ui.js · 112.2 ك.ب
- app-06-checkout.js · 110.1 ك.ب
- app-07-voice.js · 17.3 ك.ب
- app-08-maha.js · 98.3 ك.ب
- app-09-attach.js · 203.8 ك.ب
- app-10-features.js · 42.1 ك.ب
- app-11-video.js · 54.5 ك.ب
- app-12-studios.js · 55.9 ك.ب
- app-13-stocks-init.js · 60.1 ك.ب
- app-14-tester.js · 18.1 ك.ب
- app-15-floorplan.js · 39.6 ك.ب
- app-16-snapbuild.js · 12.5 ك.ب
- app-17-agent-tools.js · 4.3 ك.ب
- **★ app.bundle.js** · 1115.0 ك.ب
- design-gen.js · 5.3 ك.ب
- design-sels.js · 5.9 ك.ب
- edu.js · 57.3 ك.ب
- exp.js · 8.0 ك.ب
- partials-core.js · 100.0 ك.ب
- partials-settings.js · 72.9 ك.ب
- premium.js · 5.1 ك.ب
- selfdiag.js · 1.3 ك.ب
- themes.js · 3.2 ك.ب
- ui-docs.js · 16.6 ك.ب
- ui-wiring.js · 11.8 ك.ب
- video.js · 5.0 ك.ب

### `scripts` — 4 ملفًّا
- build.mjs · 2.6 ك.ب
- guard.mjs · 8.9 ك.ب
- smoke.mjs · 7.9 ك.ب
- verify-bundle.mjs · 1.3 ك.ب

### `tests` — 1 ملفًّا
- owner-gate.test.cjs · 2.3 ك.ب
