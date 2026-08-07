# المرحلة ٤ · شريحة ١ — تخزين + بيئة موحّدة
**٦ أغسطس ٢٠٢٦ · مُتحقَّقة على المعاينة · صفر سطر مدفوع**

| الملفّ | التغيير | أسطر |
|---|---|---|
| `vercel.json` | ٥ قواعد `Cache-Control` (ffmpeg سنة immutable · js/css swr · icons/assets يوم) | +٢٠ |
| `package.json` | `engines.node = 24.x` | +٣ |
| `.nvmrc` | `24` | +١ |
| `CONTRIBUTING.md` | قواعد المشروع + قائمة تحقّق (وثيقة) | جديد |

الأمان لم يُلمس: قاعدة `/(.*)` (CSP · HSTS · X-Frame · Referrer · Permissions) كما هي حرفًا.
`index.html` و`sw.js` و`templates-data.js` تبقى طازجة (`max-age=0`) — لا تُخزَّن.

**التحقّق:** معاينة `omran-ai-builder-zx00fo6p3-omran4.vercel.app` · دخان ١٨/٠ ·
ترويسات مطابقة للمقصود · DOM = ٢٨٣٩ عنصرًا مثل معاينة المرحلة ٣ بلا رقعة (صفر فرق).
**النشر:** `SRC_ROOT=/tmp/vc/src bun scripts/deploy-files.ts production "…" vercel.json package.json .nvmrc`
**الرجوع:** `bun scripts/vercel-rollback.ts dpl_FyDWdCEVL9n5qUmmf8PXMuUg3HR1`
