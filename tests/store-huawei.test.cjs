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
// v-store-twa (تتمّة «أريد 1.3.10 جاهزة»): مشروع TWA مولَّد في المستودع + ورك فلو يبنيه ويوقّعه وينشره
const twa = 'store/huawei/twa/';
const bg = fs.readFileSync(R(twa + 'app/build.gradle'), 'utf8');
assert.ok(bg.includes("applicationId: 'com.omran.aibuilder'") && bg.includes("hostName: 'omran-ai-builder.vercel.app'"), 'الحزمة والنطاق');
assert.ok(bg.includes("launchUrl: '/?store=huawei'"), 'رابط التشغيل يحمل علم المتجر');
assert.ok(/versionName "1\.3\.10"/.test(bg) && /versionCode 2026\d{4}/.test(bg), 'الإصدار 1.3.10 ورمز بصيغة تاريخ');
assert.ok(bg.includes("fallbackType: 'webview'"), 'بلا متصفّح TWA يفتح WebView ملء الشاشة لا تبويبًا');
assert.ok(bg.includes('com.google.androidbrowserhelper:androidbrowserhelper'), 'مكتبة TWA الرسميّة');
const rootBg = fs.readFileSync(R(twa + 'build.gradle'), 'utf8');
assert.ok(!rootBg.includes('jcenter()') && rootBg.includes('mavenCentral()'), 'jcenter مغلق — Maven Central');
const am = fs.readFileSync(R(twa + 'app/src/main/AndroidManifest.xml'), 'utf8');
assert.ok(am.includes('package="com.omran.aibuilder"') && am.includes('android.support.customtabs.trusted.DEFAULT_URL') && am.includes('android:autoVerify="true"'), 'AndroidManifest');
const strs = fs.readFileSync(R(twa + 'app/src/main/res/values/strings.xml'), 'utf8');
assert.ok(strs.includes('https://omran-ai-builder.vercel.app') && strs.includes('delegate_permission/common.handle_all_urls'), 'asset statements في الحزمة');
const tm = JSON.parse(fs.readFileSync(R(twa + 'twa-manifest.json'), 'utf8'));
assert.strictEqual(tm.packageId, 'com.omran.aibuilder'); assert.strictEqual(tm.startUrl, '/?store=huawei'); assert.strictEqual(tm.appVersion, '1.3.10');
assert.strictEqual(tm.webManifestUrl, 'https://omran-ai-builder.vercel.app/manifest-huawei.json');
for (const f of ['gradlew', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties', 'settings.gradle', 'app/src/main/java/com/omran/aibuilder/LauncherActivity.java', 'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 'store_icon.png']) assert.ok(fs.existsSync(R(twa + f)), 'ملفّ المشروع: ' + f);
assert.ok(fs.statSync(R(twa + 'gradlew')).mode & 0o111, 'gradlew قابل للتنفيذ');
const wf = fs.readFileSync(R('.github/workflows/android-release.yml'), 'utf8');
for (const k of ['workflow_dispatch', 'assembleRelease', 'zipalign', 'apksigner" sign', 'ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'gh release', 'assetlinks.json', 'rm -f "$RUNNER_TEMP/release.keystore"', "default: '1.3.10'"]) assert.ok(wf.includes(k), 'workflow: ' + k);
assert.ok(!/(store|key)pass\s*[:=]\s*['"]?[A-Za-z0-9]{6,}/i.test(wf), 'لا كلمة مرور في الورك فلو');
const tracked = require('node:child_process').execSync('git ls-files', { cwd: R('.') }).toString();
assert.ok(!/\.(keystore|jks)$/m.test(tracked), 'لا مخزن مفاتيح في المستودع');
const gi = fs.readFileSync(R('.gitignore'), 'utf8');
assert.ok(gi.includes('*.keystore') && gi.includes('*.jks') && gi.includes('store/huawei/twa/app/build/'), '.gitignore: المفاتيح وناتج البناء');
assert.ok(fs.existsSync(R('scripts/twa-generate.mjs')) && fs.readFileSync(R('scripts/twa-generate.mjs'), 'utf8').includes("setFetchEngine('node-fetch')"), 'المولّد في المستودع');
console.log('✓ store-huawei: بيان الحزمة ?store=huawei، assetlinks للحزمة com.omran.aibuilder، ولقطات المتجر ٩:١٦');
