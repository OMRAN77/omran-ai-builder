'use strict';
/* v-attach-picker + v-attach-anyfile — رفع الصور من «+» على أندرويد/شاومي.
   العرض: المالك يفتح «+» ← «إرفاق» ← يختار صورة ← يرجع، فلا تُرفق (شريط المرفقات
   فاضي). العلّة: قائمة accept (صور + امتدادات + «*» غير صالح) تجعل عارضة MIUI
   لا تُرجع الملف، وأحيانًا لا يصل حدث change. القرار: (١) إزالة accept من
   #attachInput فيقبل كلّ الأنواع؛ (٢) شبكة أمان تلتقط input.files عند عودة
   التركيز إن لم يصل change، مع علم __attachHandled يمنع الالتقاط المزدوج. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const attach = fs.readFileSync(path.join(root, 'js', 'app-09-attach.js'), 'utf8');

// (١) حقل الإرفاق بلا قائمة accept مقيِّدة — كان «*» غير الصالح والامتدادات تكسر MIUI.
const m = html.match(/<input[^>]*id="attachInput"[^>]*>/);
assert.ok(m, 'حقل attachInput موجود في index.html');
const inputTag = m[0];
assert.ok(!/accept=/.test(inputTag), 'attachInput بلا accept فيقبل كلّ الأنواع (صور · PDF · كود · مضغوط)');
assert.ok(/multiple/.test(inputTag), 'attachInput يبقى multiple');

// (٢) شبكة الأمان: علم + مستمع focus + التقاط يدويّ.
assert.ok(/let __attachHandled = false;/.test(attach), 'علم __attachHandled معرَّف');
assert.ok(/function __omranTakeAttachFiles\(/.test(attach), 'دالّة الالتقاط اليدويّ موجودة');
assert.ok(/window\.addEventListener\('focus', onBack\)/.test(attach), 'مستمع عودة التركيز مربوط عند الضغط على إرفاق');
assert.ok(/window\.removeEventListener\('focus', onBack\)/.test(attach), 'المستمع يُزال بعد أوّل عودة تركيز فلا يتراكم');

// (٣) حدث change يحترم العلم فلا يُرفق الملف مرّتين لو التقطته الشبكة.
const changeIdx = attach.indexOf("$('#attachInput').addEventListener('change'");
assert.ok(changeIdx > 0, 'معالج change موجود');
const changeBlock = attach.slice(changeIdx, changeIdx + 260);
assert.ok(/if\(__attachHandled\) return;/.test(changeBlock), 'change يتوقّف إن التقطتها شبكة الأمان');

// (٤) الضغط على «إرفاق» يصفّر العلم قبل فتح المنتقي.
const clickIdx = attach.indexOf("$('#btnAttach').onclick");
assert.ok(clickIdx > 0, 'معالج زرّ الإرفاق موجود');
const clickBlock = attach.slice(clickIdx, clickIdx + 320);
assert.ok(/__attachHandled = false;/.test(clickBlock), 'العلم يُصفَّر عند فتح المنتقي');
assert.ok(/input\.click\(\)/.test(clickBlock), 'المنتقي يُفتح فعلًا');

console.log('✓ attach-picker: الإرفاق بلا accept مقيِّد + شبكة أمان لعودة التركيز بلا تكرار');
