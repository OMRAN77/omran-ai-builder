# taryam-cyber

## متغيرات البيئة المطلوبة على Vercel

| المتغير | ملاحظات |
|---|---|
| `AUTH_SECRET` | **إلزامي، 32 حرفًا على الأقل.** بدونه يرفض الخادم الدخول ورسائل الذكاء الاصطناعي (503). يُستخدم أيضًا لتشفير سجلات المستخدمين، فلا تغيّره دون ترحيل السجلات. لتوليد قيمة: `openssl rand -base64 48` |
| `BLOB_READ_WRITE_TOKEN` | إلزامي للحسابات والحصص. |
| `BLOB_STORE_ID` | معرّف مخزن Blob الحالي. |
| مفاتيح المزوّدين | `DEEPSEEK_API_KEY` و`OPENAI_API_KEY` وغيرها، كما كانت. |

## بعد النشر: ترحيل السجلات القديمة

النسخ السابقة حفظت سجلات المستخدمين وسجل بحث DeHashed في مسارات عامة يمكن تخمينها.
الحساب يُرحَّل تلقائيًا عند أول دخول له، ولترحيل الباقي:

```sh
# تجربة بدون كتابة
AUTH_SECRET=... BLOB_READ_WRITE_TOKEN=... BLOB_STORE_ID=... node scripts/migrate-legacy-blobs.js
# التنفيذ الفعلي
AUTH_SECRET=... BLOB_READ_WRITE_TOKEN=... BLOB_STORE_ID=... node scripts/migrate-legacy-blobs.js --apply
```

## أدوات معطّلة مؤقتًا

- **فحص المنافذ** (`api/portscan.js`): يمكن تجاوز حظر العناوين الداخلية، والتحقق من الملكية موجود في المتصفح فقط.
- **البحث المتقدم / DeHashed** (`api/dehashed.js`): يُرجع بيانات أشخاص آخرين دون التحقق من ملكية الإيميل أو النطاق.

## الاختبارات

لا تحتاج اختبارات الخادم أي حزمة خارجية (Node 22):

```sh
node --test "test/api/**/*.test.js"
```

اختبار المتصفح يحتاج Playwright:

```sh
npm install --no-save --no-package-lock playwright && npx playwright install chromium
node --test "test/ui/**/*.test.js"
```

تعمل الاختبارات نفسها تلقائيًا على GitHub Actions (`.github/workflows/tests.yml`).
