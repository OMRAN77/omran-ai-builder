'use strict';
/* v-store-twa — رفض هواوي 4.1 «ميزة واحدة» للمرّة الثانية (الإصدار 1.3.9، ١٥ سبتمبر ٢٠٢٦):
   الحزمة كانت تنطلق من / لا من /?store=huawei فلم يعمل عرض الأدوات، وبلا assetlinks.json يعرض
   TWA شريط عنوان المتصفّح فيبدو موقعًا. الاختبار: بيان الحزمة الخاصّ، وملفّ Digital Asset Links
   بهيكله الصحيح واسم الحزمة، وتبديل وسم البيان تحت علم المتجر، والبيان العامّ لم يتغيّر. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = (p) => path.join(__dirname, '..', p);

// بيان الحزمة لمتجر هواوي: ينطلق من ?store=huawei ونطاقه الجذر
const hw = JSON.parse(fs.readFileSync(R('manifest-huawei.json'), 'utf8'));
assert.strictEqual(hw.start_url, '/?store=huawei', 'رابط التشغيل يحمل علم المتجر');
assert.strictEqual(hw.id, '/?store=huawei'); assert.strictEqual(hw.scope, '/'); assert.strictEqual(hw.display, 'standalone');
const pub = JSON.parse(fs.readFileSync(R('manifest.json'), 'utf8'));
assert.ok(!/store=huawei/.test(pub.start_url || ''), 'البيان العامّ (الويب وبقيّة المتاجر) بلا علم هواوي');
assert.deepStrictEqual(hw.icons, pub.icons, 'الأيقونات نفسها');
for (const k of ['name', 'short_name', 'background_color', 'theme_color', 'lang', 'dir']) assert.strictEqual(hw[k], pub[k], k + ' مطابق للبيان العامّ');

// Digital Asset Links: هيكل جوجل الرسميّ واسم الحزمة المنشور
const al = JSON.parse(fs.readFileSync(R('.well-known/assetlinks.json'), 'utf8'));
assert.ok(Array.isArray(al) && al.length >= 1, 'مصفوفة عبارات');
const st = al[0];
assert.deepStrictEqual(st.relation, ['delegate_permission/common.handle_all_urls']);
assert.strictEqual(st.target.namespace, 'android_app');
assert.strictEqual(st.target.package_name, 'com.omran.aibuilder', 'اسم الحزمة كما نُشر');
assert.ok(Array.isArray(st.target.sha256_cert_fingerprints) && st.target.sha256_cert_fingerprints.length >= 1, 'خانة البصمة موجودة');
const FP = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const unfilled = st.target.sha256_cert_fingerprints.filter((f) => !FP.test(f));
if (unfilled.length) console.log('  ⚠ assetlinks.json: بصمة SHA-256 لم تُملأ بعد (' + unfilled.join(', ') + ') — التحقّق على الجهاز يفشل حتّى تُملأ');
else assert.ok(true);

// العميل: تحت علم المتجر يبدّل وسم البيان إلى بيان الحزمة، والملفّ مُصدَّر بوسم جديد
const sd = fs.readFileSync(R('js/selfdiag.js'), 'utf8');
assert.ok(sd.includes('v-store-twa') && sd.includes("__ml.setAttribute('href', '/manifest-huawei.json')"), 'تبديل وسم البيان تحت store-safe');
assert.ok(sd.indexOf("classList.add('store-safe')") < sd.indexOf('/manifest-huawei.json'), 'التبديل داخل فرع هواوي فقط');
const html = fs.readFileSync(R('index.html'), 'utf8');
assert.ok(/\/js\/selfdiag\.js\?v=hw-twa-\d+/.test(html), 'وسم ?v= لـselfdiag رُفع');
assert.ok(html.includes('rel="manifest" href="/manifest.json'), 'الوسم الافتراضيّ ما زال البيان العامّ');

// ملفّات المتجر للمالك لا للـCDN، واللقطات ٩:١٦ من الحزمة نفسها
assert.ok(fs.readFileSync(R('.vercelignore'), 'utf8').includes('\nstore/'), 'store/ لا يُنشر');
const shots = fs.readdirSync(R('store/huawei/screenshots')).filter((f) => f.endsWith('.png'));
assert.ok(shots.length >= 3 && shots.length <= 8, 'AppGallery: ٣ إلى ٨ لقطات');
const { PNG } = require('pngjs');
for (const f of shots) {
  const p = PNG.sync.read(fs.readFileSync(R('store/huawei/screenshots/' + f)));
  assert.strictEqual(p.width * 16, p.height * 9, f + ' نسبة ٩:١٦');
  assert.ok(fs.statSync(R('store/huawei/screenshots/' + f)).size < 2 * 1024 * 1024, f + ' أقلّ من ٢ م.ب');
}
for (const f of ['README.md', 'REVIEW-NOTES.md']) assert.ok(fs.existsSync(R('store/huawei/' + f)), f);
const notes = fs.readFileSync(R('store/huawei/REVIEW-NOTES.md'), 'utf8');
assert.ok(!/(password|كلمة المرور)\s*[:：]\s*\S{4,}/i.test(notes.replace(/\(password\)/g, '')), 'لا كلمة مرور حقيقيّة في المستودع');
// اللقطات تحتاج أعلام ui-shot الجديدة
const us = fs.readFileSync(R('scripts/ui-shot.mjs'), 'utf8');
for (const k of ["opt('viewport'", "opt('scale'", "opt('name'", "opt('settle'"]) assert.ok(us.includes(k), 'ui-shot: ' + k);
console.log('✓ store-huawei: بيان الحزمة ?store=huawei، assetlinks للحزمة com.omran.aibuilder، ولقطات المتجر ٩:١٦');
