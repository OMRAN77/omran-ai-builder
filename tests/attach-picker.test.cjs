'use strict';
/* v-attach-picker-v2 — رفع الصور من «+» داخل غلاف أندرويد الأصلي (الحزمة على
   جوجل بلاي/TWA). العرض (فيديو المالك ١٧ سبتمبر ٢٠٢٦): يفتح «+» ← «إرفاق» ←
   يختار صورة من منتقي النظام ← يضغط «تم» ← يرجع للتطبيق، وشريط المرفقات فاضٍ
   تمامًا — لا صورة ولا رسالة خطأ.

   الجذر: النسخة الأولى (v-attach-picker) اعتمدت حصرًا على حدث window
   «focus» بعد إغلاق المنتقي، مع فحص واحد بعد 500ms. داخل WebView الغلاف
   الأصلي، منتقي الملفات يُدار عبر onShowFileChooser الأصلي و لا يُفقد
   تركيز الـwindow من منظور DOM أبدًا — فحدث focus لا يصل إطلاقًا في هذا
   الغلاف تحديدًا، وحدث change من بعض عارضات الأنظمة (شاومي/MIUI وغيرها)
   لا يصل أيضًا — فتتعطّل الشبكتان معًا وتصمت الواجهة كليًّا.

   القرار: omranWatchFilePicker — مراقبة مباشرة بفحص دوريّ لـinput.files
   (كل 350ms لعشرين ثانية) لا تعتمد على أي حدث متصفّح إطلاقًا، فتلتقط
   الملف حتى لو صمتت كل الأحداث معًا. مطبَّقة على مسار الإرفاق الرئيسي
   ومسار «صور → PDF» (نفس فئة العارضات). */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const attach = fs.readFileSync(path.join(root, 'js', 'app-09-attach.js'), 'utf8');
const features = fs.readFileSync(path.join(root, 'js', 'app-10-features.js'), 'utf8');

// (١) حقل الإرفاق بلا قائمة accept مقيِّدة — كان «*» غير الصالح والامتدادات تكسر MIUI.
const m = html.match(/<input[^>]*id="attachInput"[^>]*>/);
assert.ok(m, 'حقل attachInput موجود في index.html');
const inputTag = m[0];
assert.ok(!/accept=/.test(inputTag), 'attachInput بلا accept فيقبل كلّ الأنواع (صور · PDF · كود · مضغوط)');
assert.ok(/multiple/.test(inputTag), 'attachInput يبقى multiple');

// (٢) المراقب لا يعتمد على أي حدث وحيد — فحص دوريّ حقيقيّ بـsetInterval،
// مع focus وvisibilitychange كمسرّعات اختيارية فقط لا كمسار وحيد.
assert.ok(/function omranWatchFilePicker\(/.test(attach), 'مراقب المنتقي الموحّد معرَّف');
assert.ok(/setInterval\(\s*\(\)\s*=>\s*\{\s*take\(\);/.test(attach), 'فحص دوريّ حقيقيّ لـinput.files لا فحصًا واحدًا');
assert.ok(/document\.addEventListener\('visibilitychange', onVis\)/.test(attach), 'visibilitychange مسرّع إضافيّ (الغلاف الأصلي لا يُطلق focus)');
assert.ok(/window\.addEventListener\('focus', take\)/.test(attach), 'focus مسرّع إضافيّ أيضًا للمتصفح العادي');
assert.ok(/clearInterval\(iv\)/.test(attach), 'الفحص الدوريّ يتوقّف فور الالتقاط — لا يبقى يعمل للأبد');

// (٣) مسار الإرفاق الرئيسي يستعمل المراقب الموحّد، وحدث change يحترم العلم
// فلا يُرفق الملف مرّتين لو التقطه المراقب أولًا.
const clickIdx = attach.indexOf("$('#btnAttach').onclick");
assert.ok(clickIdx > 0, 'معالج زرّ الإرفاق موجود');
const clickBlock = attach.slice(clickIdx, clickIdx + 260);
assert.ok(/__attachHandled = false;/.test(clickBlock), 'العلم يُصفَّر عند فتح المنتقي');
assert.ok(/input\.click\(\)/.test(clickBlock), 'المنتقي يُفتح فعلًا');
assert.ok(/omranWatchFilePicker\(input,/.test(clickBlock), 'زرّ الإرفاق يستعمل المراقب الموحّد لا الشبكة القديمة');
const changeIdx = attach.indexOf("$('#attachInput').addEventListener('change'");
assert.ok(changeIdx > 0, 'معالج change موجود');
assert.ok(/if\(__attachHandled\) return;/.test(attach.slice(changeIdx, changeIdx + 260)), 'change يتوقّف إن التقطها المراقب أولًا');

// (٤) نفس العلّة تصيب «صور → PDF» (عارضة صور عامة أيضًا) — نفس المراقب مطبَّق هناك.
const pdfClickIdx = features.indexOf('btn.onclick = () => { __pdfPickHandled = false;');
assert.ok(pdfClickIdx > 0, 'زرّ PDF يستعمل نفس نمط المراقب الموحّد');
assert.ok(/omranWatchFilePicker\(input,/.test(features), '«صور → PDF» محميّة بنفس المراقب — لا تنفرد بالعلّة القديمة');
assert.ok(/input\.onchange = \(\) => \{ if\(__pdfPickHandled\) return;/.test(features), 'change في PDF يحترم علم الالتقاط أيضًا');

console.log('✓ attach-picker: مراقب دوريّ حقيقيّ يلتقط الملف حتى لو صمتت كل الأحداث (focus/change/visibilitychange) — مطبَّق على الإرفاق و«صور → PDF»');
