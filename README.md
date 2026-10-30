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

## مختبر RTP (`lab/`)

قسم مستقل عن أدوات الأمن، يُفتح من قائمة ⋮ ← «مختبر RTP» أو مباشرة على `lab/index.html`.
كل الحسابات تتم في متصفح المستخدم داخل Web Worker، وسياسة CSP للصفحة (`connect-src 'none'`)
تمنع أي إرسال للبيانات.

| التبويب | ما يحسبه |
|---|---|
| RTP النظري | RTP دقيق (كسر BigInt) من كل توليفات البكرات، نسبة الفوز، الانحراف المعياري، أعلى ربح، مساهمة كل رمز وكل ميزة (wild، scatter، لفات مجانية بمضاعف وإعادة تفعيل). الإدخال: النموذج، أو JSON، أو CSV (`lab/samples/`). |
| RTP الفعلي | من سجل CSV (bet, win): RTP، فاصل ثقة 90–99.9٪، اختبار z مقابل المعلن، وعدد الجولات اللازم. |
| فحص RNG | اختبارات NIST SP 800-22 الخمسة عشر، ومربع كاي، والارتباط التسلسلي. |
| العدالة المثبتة | تحقق جماعي من التزامات SHA-256 ونتائج HMAC-SHA256، أو سلسلة hashes. |
| مونت كارلو | محاكاة ببذرة ثابتة (xoshiro128** من SHA-256 للبذرة): نفس البذرة تعطي نفس الأرقام ونفس البصمة. |
| التقرير | PDF عربي/إنجليزي برقم تقرير وتاريخ وبصمة SHA-256 لكل مدخل، مع إرفاق المدخلات داخل الـPDF. |

بيانات NIST المرجعية (توسعة e وπ الثنائية) تُولّد بـ `node scripts/make-nist-constants.mjs`،
وملف `lab/samples.js` يُولّد من `lab/samples/*.json` بـ `node scripts/make-lab-samples.mjs`.

## الاختبارات

لا تحتاج اختبارات الخادم أي حزمة خارجية (Node 22):

```sh
node --test "test/api/**/*.test.js"
node --test "test/lab/**/*.test.mjs"
```

اختبار المتصفح يحتاج Playwright:

```sh
npm install --no-save --no-package-lock playwright && npx playwright install chromium
node --test "test/ui/**/*.test.js"
```

تعمل الاختبارات نفسها تلقائيًا على GitHub Actions (`.github/workflows/tests.yml`).
