# رقعة «صلاحيات VIP» — نسخة محلّية غير منشورة

بُنيت وتُحقّق منها محليًّا فقط في `/tmp/vc/src`. **لا دفع، لا نشر.**

## ملفّات جديدة

| الملفّ | أسطر مضافة | sha256 |
|---|---:|---|
| `api/_lib/_vip.js` | +99 (ملفّ جديد) | `1aa44165da4bf8c42f424a32ba373e255ad05431afcd0538f3f35ccb11a94db6` |
| `api/_lib/vip.js` | +120 (ملفّ جديد) | `da6912d39d62235ed63306e26d42b5626a049be752926fa77ee76f3674cbc1c1` |

## ملفّات مُعدَّلة (diff مقابل النسخة المحفوظة في /tmp/vip-pre)

| الملفّ | + | - | صافي | sha256 بعد |
|---|---:|---:|---:|---|
| `api/account.js` | +1 | -0 | 1 | `534bdfa574269af3b6ac296b86db6bd1f93a20d3079cc72d6acaf68d88caed02` |
| `vercel.json` | +1 | -0 | 1 | `19999ad714800a69ef1e4ca003f15d299af5e33b35a77334e706f496604164a8` |
| `api/_lib/_usage.js` | +11 | -4 | 7 | `2cabe44b10ab222110cb3777122a891901c5afe6dcf4d0f7fe5ee2bef34d8326` |
| `api/_lib/points.js` | +13 | -0 | 13 | `585f224378be2e71d313805035f25a2955ef7a36740e1472c52619bd3dd28783` |
| `js/partials-settings.js` | +7 | -0 | 7 | `4c759e31bd32af945996a0aad18fe94354c17212c6db9207f7a6328b30302de4` |
| `js/app-01-boot-auth.js` | +68 | -1 | 67 | `f882153059edf9307e278829d7c5b9d1a98265c23c0ef15aae758a799d691f08` |
| `js/app.bundle.js` | +68 | -1 | 67 | `47b6c91b700750761fe334363a20623c8b510a752d5706d0170c26d26c2ce759` |
| `index.html` | +1 | -1 | 0 | `5a6695875c963a7e5dc01644cf94e641042eb8d54f8aa8e5c15e3dfd4269259b` |
| `sw.js` | +1 | -1 | 0 | `9809f5c3a70f3b3100dac8d7cc83588279322b23d1f71607299b08d6ea77ec2f` |

**إجمالي الأسطر المضافة (جديد + مُعدَّل): 390 سطرًا.**
**منها مكتوبة بيد: 320 سطرًا** — الباقي (٦٨ في الحزمة + ١ + ١) ناتج بناءٍ مكرَّر لا كتابة جديدة.

> `js/app.bundle.js` و`index.html` و`sw.js` **نتيجة بناء لا مصدر**:
> `npm run bundle` يولّدها من `js/app-NN-*.js`، و`npm run verify` يفشل إن لم تتطابق.
> التعديل اليدويّ كان في `js/app-01-boot-auth.js` وحده. أسطر الحزمة المضافة
> = نفس أسطر الجزء، وindex.html/sw.js تغيّرا ببصمة المحتوى فقط (80aacae5 → 47b6c91b).

## ما تغيّر

- `api/_lib/_vip.js` — مفتاح `vip_users` في Redis · `getVipList/addVip/removeVip/isVip` · ذاكرة ٣٠ث تُبطَّل عند الإضافة/الحذف · `isVip` لا ترمي أبدًا (عطب = false).
- `api/_lib/vip.js` — GET/POST/DELETE، وكلٌّ منها خلف `isOwner(req)`؛ غير المالك ← 403 `{error:'غير مصرح'}`. DELETE يقبل `id` من الاستعلام أو الجسم. الإيميل يُحوَّل إلى اسم الحساب وقت الإضافة (خارج الطريق الساخن).
- `api/account.js` — `case 'vip'`.
- `vercel.json` — `/api/vip → /api/account?action=vip` (٦٧ تحويلة، jq نظيف).
- `api/_lib/_usage.js` — البوّابات الثلاث (١١٥ · ١٧٤ · ٢٠٧): `isOwnerUsername(u) || await isVip(u)` والمالك أوّلًا.
- `api/_lib/points.js` — تجاوز الخصم (١٣١)، وسطر الحالة (٢٠٧ · `unlimited:true`)، و`refundPoints` (١٦٧) حتى لا تُهدى نقاط لمن لم يُخصم منه.
- `js/partials-settings.js` — كتلة «⭐ صلاحيات VIP» داخل `adminSectionWrap`: `vipInput` · `vipAddBtn` · `vipListBox`.
- `js/app-01-boot-auth.js` — `loadVipList/addVipUser/removeVipUser` بجوار `loadAdminStats`، ونداء `loadVipList()` عند كشف قسم المالك.

## التحقّق

- `node --check` على كل ملفّ جديد/مُعدَّل ✅ (بما فيها app.bundle.js و partials-settings.js)
- `jq . vercel.json` ✅
- `npm run ci` ✅ (check · guard: ١٢٧ ملفًا نظيفًا · verify: الحزمة تطابق أجزاءها · test: ١١/١١)
- `stockTickerToggle`: ٤ في الحزمة و١ في index.html — قبل وبعد سواء.
- لا `@media` في partials-settings.js أصلًا؛ تخطيط الجوّال لم يُمسّ.
