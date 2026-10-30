// tests/hw-webview-gaps.test.cjs — v-hw-1315 (رفض هواوي ٣٠ أكتوبر ٢٠٢٦ لـ1.3.14): القاعدة 3.1 «مساعد المستندات ← حلّل المستند
// ← لا يمكن تحميل ملف» و1.14 «اللقطات لا تطابق الوظائف الفعليّة». مراجع هواوي (EMUI 16، بلا Chrome) يشغّل التطبيق في WebView
// الاحتياطيّ MahaWebViewFallbackActivity، ولم يكن فيه onShowFileChooser — فكلّ «اختيار ملف» ميت. مراجعة WebView كاملة على
// مسارات المراجع أضافت: الموقع للقبلة، حفظ تنزيلات blob:/data:، ملفّ واحد في كلّ اختيار (معرض هواوي المتعدّد لا يعيد شيئًا)،
// وعلى الموقع: تصغير صور الكاميرا في المستندات، وتمييز الغلاف (omranHwWebView) لحفظ الملفّات وكاميرا الستايل ومها وربط Gmail.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const J = read('store/huawei/twa/app/src/main/java/com/omran/aibuilder/twa/MahaWebViewFallbackActivity.java');
const M = read('store/huawei/twa/app/src/main/AndroidManifest.xml');

/** جسم دالّة جافا/جافاسكربت بمطابقة الأقواس من أوّل { بعد العلامة. */
function block(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, 'موجود: ' + marker);
  let i = src.indexOf('{', at), depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(at, k + 1);
  }
  throw new Error('غير مغلق: ' + marker);
}

test('١. منتقي الملفّات: onShowFileChooser في عميل Chrome، وملفّ واحد في كلّ اختيار، والنداء يُستدعى دائمًا', () => {
  const chrome = block(J, 'private WebChromeClient createWebViewChromeClient()');
  const show = block(chrome, 'public boolean onShowFileChooser(');
  assert.match(show, /startActivityForResult\(Intent\.createChooser\(\s*buildFileChooserIntent\(fileChooserParams\), null\), RC_FILE_CHOOSER\);\s*return true;/);
  assert.match(show, /catch \(ActivityNotFoundException e\)[\s\S]*mFileChooserCallback = null;\s*return false;/, 'لم يُفتح شيء = false بلا نداء');
  assert.match(show, /if \(mFileChooserCallback != null\) \{\s*mFileChooserCallback\.onReceiveValue\(null\);/, 'منتقٍ معلَّق سابق يُغلق');
  const build = block(J, 'static Intent buildFileChooserIntent(');
  assert.match(build, /new Intent\(Intent\.ACTION_GET_CONTENT\)/);
  assert.match(build, /addCategory\(Intent\.CATEGORY_OPENABLE\)/);
  assert.match(build, /EXTRA_MIME_TYPES/);
  assert.doesNotMatch(J, /EXTRA_ALLOW_MULTIPLE/, 'لا اختيار متعدّد: معرض هواوي يعيد «تمّ» بلا ملفّات (v-attach-huawei)');
  const mimes = block(J, 'static List<String> acceptToMimeTypes(');
  assert.match(mimes, /getMimeTypeFromExtension\(type\.substring\(1\)\)/, '.pdf ← application/pdf');
  assert.match(mimes, /if \(mime == null\) \{\s*mimes\.clear\(\);\s*return mimes;/, 'امتداد مجهول = بلا تصفية');
  const result = block(J, 'protected void onActivityResult(');
  assert.match(result, /requestCode != RC_FILE_CHOOSER/);
  assert.match(result, /mFileChooserCallback = null;\s*if \(callback != null\) \{\s*callback\.onReceiveValue\(pickedUris\(resultCode, data\)\);/, 'الإلغاء أيضًا يعيد null للنداء');
  assert.match(block(J, 'static Uri[] pickedUris('), /getClipData\(\)[\s\S]*getData\(\)/);
  // بعد انهيار المُرسِم: WebView الجديد يأخذ عميل Chrome (منتقٍ + مايك + موقع) كالأوّل
  const gone = block(J, 'public boolean onRenderProcessGone(');
  assert.match(gone, /mWebView\.setWebChromeClient\(createWebViewChromeClient\(\)\);/);
});

test('٢. الموقع: onGeolocationPermissionsShowPrompt لنطاق التطبيق وحده، وصلاحيّة تقريبيّة معلَنة ومطلوبة وقت التشغيل', () => {
  const chrome = block(J, 'private WebChromeClient createWebViewChromeClient()');
  const geo = block(chrome, 'public void onGeolocationPermissionsShowPrompt(');
  assert.match(geo, /equalsIgnoreCase\(mLaunchUrl\.getHost\(\)\)/, 'نطاق آخر يُرفض');
  assert.match(geo, /checkSelfPermission\([\s\S]*ACCESS_COARSE_LOCATION\) == PackageManager\.PERMISSION_GRANTED\) \{\s*callback\.invoke\(origin, true, false\);/);
  assert.match(geo, /requestPermissions\([\s\S]*ACCESS_COARSE_LOCATION\}, RC_LOCATION\);/);
  const perm = block(J, 'public void onRequestPermissionsResult(');
  assert.match(perm, /if \(requestCode == RC_LOCATION\) \{[\s\S]*geo\.invoke\(origin, grantResults\.length > 0\s*&& grantResults\[0\] == PackageManager\.PERMISSION_GRANTED, false\);[\s\S]*return;/);
  assert.ok(perm.indexOf('RC_LOCATION') < perm.indexOf('RC_RECORD_AUDIO'), 'الموقع قبل حارس المايك الذي يخرج مبكّرًا');
  assert.match(M, /<uses-permission android:name="android\.permission\.ACCESS_COARSE_LOCATION"\/>/);
  assert.doesNotMatch(M, /ACCESS_FINE_LOCATION"\/>/, 'الدقيق غير لازم (enableHighAccuracy:false)');
});

test('٣. التنزيلات: blob: عبر جسر الصفحة أجزاءً، data: تُفكّ في الغلاف، وhttp(s) لمنزّل النظام كما كانت', () => {
  const listen = block(J, 'private void attachDownloadListener(');
  assert.match(listen, /addJavascriptInterface\(new BlobSaveBridge\(\), "OmranBlobSave"\)/);
  assert.match(listen, /url\.startsWith\("blob:"\)\) \{\s*webView\.evaluateJavascript\(String\.format\(BLOB_SAVE_JS,/);
  assert.match(listen, /url\.startsWith\("data:"\)\) \{\s*saveDataUrl\(url, mimetype\);/);
  assert.match(listen, /startSystemDownload\(url, userAgent, contentDisposition, mimetype\);/);
  assert.equal((J.match(/attachDownloadListener\(mWebView\);/g) || []).length, 2, 'الجسر في مساري إنشاء WebView');
  assert.match(block(J, 'private SaveTarget openDownload('), /RELATIVE_PATH, Environment\.DIRECTORY_DOWNLOADS\);\s*values\.put\(MediaStore\.MediaColumns\.IS_PENDING, 1\);\s*Uri uri = getContentResolver\(\)\.insert\(MediaStore\.Downloads\.EXTERNAL_CONTENT_URI, values\);/);
  assert.match(block(J, 'void finish()'), /IS_PENDING, 0/);
  // نصّ الجافاسكربت المحقون كما سيصل للصفحة: ملفّ ٢ م.ب يمرّ ثلاثة أجزاء كاملًا وباسمه
  const lit = J.match(/BLOB_SAVE_JS =\s*([\s\S]*?);\n/)[1];
  const tpl = [...lit.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => JSON.parse('"' + x[1] + '"')).join('');
  assert.equal((tpl.match(/%/g) || []).length, 2, 'String.format: علامتا %s فقط');
  const js = tpl.replace('%s,%s', JSON.stringify('blob:https://x/1') + ',' + JSON.stringify('video/mp4'));
  const size = 2 * 1024 * 1024 + 5, bytes = Buffer.alloc(size, 7), calls = [];
  const B = { begin: (n, t, s) => { calls.push(['begin', n, t, s]); return 3; }, chunk: (id, b) => calls.push(['chunk', id, Buffer.from(b, 'base64').length]),
    end: (id) => calls.push(['end', id]), fail: (id) => calls.push(['fail', id]) };
  class FakeBlob { constructor(buf, type) { this.buf = buf; this.type = type; this.size = buf.length; } slice(a, b) { return new FakeBlob(this.buf.subarray(a, b), this.type); } }
  class FileReader { readAsDataURL(b) { setImmediate(() => { this.result = 'data:' + b.type + ';base64,' + b.buf.toString('base64'); this.onload(); }); } }
  const document = { querySelectorAll: () => [{ href: 'blob:https://x/1', getAttribute: () => 'clip.mp4' }] };
  const fetch = async () => ({ blob: async () => new FakeBlob(bytes, 'video/mp4') });
  new Function('window', 'document', 'fetch', 'FileReader', js)({ OmranBlobSave: B }, document, fetch, FileReader);
  return new Promise((done) => setTimeout(() => {
    const chunks = calls.filter((c) => c[0] === 'chunk');
    assert.deepEqual(calls[0], ['begin', 'clip.mp4', 'video/mp4', size]);
    assert.equal(chunks.reduce((a, c) => a + c[2], 0), size, 'كلّ البايتات');
    assert.ok(chunks.length >= 3);
    assert.deepEqual(calls[calls.length - 1], ['end', 3]);
    done();
  }, 300));
});

test('٤. الموقع يعرف الغلاف: omranHwWebView بجسر OmranRender، وomranLikelyApp يقرأ علم المتجر من sessionStorage', () => {
  const ui = read('js/app-05-ui.js');
  const src = block(ui, 'function omranHwWebView()') + '\n' + block(ui, 'function omranLikelyApp()');
  const run = (win, ss) => new Function('window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'matchMedia', '__swallow',
    src + '; return [omranHwWebView(), omranLikelyApp()];')(win, { referrer: '' }, { getItem: () => null, setItem() {} },
    { getItem: (k) => (ss[k] || null) }, {}, () => ({ matches: false }), () => {});
  assert.deepEqual(run({}, {}), [false, false], 'الموقع العاديّ');
  assert.deepEqual(run({ OmranRender: { mode: () => 'cpu' } }, {}), [true, true], 'WebView حزمة هواوي');
  assert.deepEqual(run({}, { aiapp_store: 'huawei' }), [false, true], 'حزمة المتجر في Chrome/TWA');
  assert.deepEqual(run({ OmranRender: {} }, {}), [false, false], 'جسر بلا mode ليس جسرنا');
});

test('٥. داخل الغلاف: «📷 الكاميرا» في الستايل تفتح المنتقي مباشرةً، وكاميرا مها مخفيّة بجواب صادق، وGmail يُعاد عند الرجوع', () => {
  const st = read('js/app-13-stocks-init.js');
  assert.match(block(st, 'function studioOpenMenu(which)'), /if\(!coarse \|\| \(typeof omranHwWebView === 'function' && omranHwWebView\(\)\)\)\{ \(which === 'A' \? fileInputA : fileInputB\)\.click\(\); return; \}/);
  const maha = read('js/app-08-maha.js');
  const look = block(maha, 'async function mahaLookCamera(question)');
  assert.ok(look.indexOf('omranHwWebView()') < look.indexOf('await mahaCameraOn()'), 'قبل محاولة فتح الكاميرا');
  assert.match(look, /do not ask them to allow camera access/);
  assert.match(maha, /if\(b && typeof omranHwWebView === 'function' && omranHwWebView\(\)\)\{ b\.style\.display = 'none'; return; \}/);
  const em = read('js/app-12-studios.js');
  assert.match(em, /if\(typeof document\.addEventListener === 'function'\) document\.addEventListener\('visibilitychange', \(\) => \{\s*if\(document\.visibilityState !== 'visible' \|\| typeof omranHwWebView !== 'function' \|\| !omranHwWebView\(\)\) return;\s*if\(modal\.style\.display === 'flex' && connectBox\.style\.display !== 'none' && localStorage\.getItem\('aiapp_auth_token'\)\) btnOpen\.click\(\);/);
});

test('٦. مساعد المستندات: صورة الكاميرا الكبيرة تُصغَّر قبل سقف ٣ م.ب بدل أن تُرفض، ووسم ui-docs مرفوع', () => {
  const d = read('js/ui-docs.js');
  const run = block(d, 'async function run()');
  const shrinkAt = run.indexOf('await docShrinkImage(curFile)'), capAt = run.indexOf('curFile.size > DOC_MAX_BYTES');
  assert.ok(shrinkAt > 0 && shrinkAt < capAt, 'التصغير قبل فحص السقف');
  assert.match(run, /if\(curFile && !shrunk && curFile\.size > DOC_MAX_BYTES\)/, 'السقف للأصل غير المصغَّر وحده');
  assert.match(run, /!\/pdf\/i\.test\(curFile\.type\) && curFile\.size > DOC_SHRINK_FROM/, 'PDF لا يُمسّ');
  assert.match(run, /if\(shrunk\)\{ payload\.fileBase64=shrunk\.base64; payload\.mime=shrunk\.mime; \}/);
  assert.match(d, /var DOC_SHRINK_FROM=1\.5\*1024\*1024;/);
  assert.match(block(d, 'function docShrinkImage(f)'), /1600\/Math\.max[\s\S]*toDataURL\('image\/jpeg',0\.82\)/);
  const tag = read('index.html').match(/\/js\/ui-docs\.js\?v=(\d+)"/);
  assert.ok(tag && Number(tag[1]) >= 480, 'وسم ui-docs.js مرفوع بعد v-hw-doc-shrink');
});
