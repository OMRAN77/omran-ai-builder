// tests/android-contacts.test.cjs — v-talk-contacts-sync (غرفة الربع): الجزء الأصليّ من مزامنة جهات الاتّصال.
// لا Android SDK هنا، ففحوص نصّيّة على المصدر مثل بقيّة اختبارات الغلاف (hw-webview-gaps، cpu-raster): الصلاحيّة معلَنة، النشاط
// الشفّاف مُصدَّر بالمخطّط omranai://contacts-sync، التشفير AES-256-GCM بعد gzip، النطاق مكتوب في الكود وhttps وحده، جسر
// OmranContacts يتحقّق من نطاق الصفحة، فرع RC_CONTACTS في onRequestPermissionsResult، ولا رقم ولا اسم في أيّ سجلّ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SRC = 'store/huawei/twa/app/src/main/java/com/omran/aibuilder/twa/';
const C = read(SRC + 'ContactsSyncActivity.java');
const J = read(SRC + 'MahaWebViewFallbackActivity.java');
const M = read('store/huawei/twa/app/src/main/AndroidManifest.xml');
const APP_HOST = 'omran-ai-builder.vercel.app';

/** نهاية الرمز المغلِق المطابق لـopen عند start — يتخطّى النصوص والمحارف والتعليقات (فيها { و( في الجافا). */
function closeAt(src, start, open, close) {
  let depth = 0;
  for (let k = start; k < src.length; k++) {
    const ch = src[k];
    if (ch === '"' || ch === "'") { for (k++; k < src.length && src[k] !== ch; k++) if (src[k] === '\\') k++; continue; }
    if (ch === '/' && src[k + 1] === '/') { k = src.indexOf('\n', k); if (k < 0) break; continue; }
    if (ch === '/' && src[k + 1] === '*') { k = src.indexOf('*/', k + 2) + 1; continue; }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return k;
  }
  throw new Error('غير مغلق عند ' + start);
}
/** جسم دالّة/صنف من العلامة حتّى قوسه المغلِق. */
function block(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, 'موجود: ' + marker);
  return src.slice(at, closeAt(src, src.indexOf('{', at), '{', '}') + 1);
}
/** كلّ نداءات Log.x(...) في النصّ، بمعاملاتها كاملة. */
function logCalls(src) {
  const out = [];
  for (const m of src.matchAll(/\bLog\.[a-z]+\(/g)) {
    const open = m.index + m[0].length - 1;
    out.push(src.slice(open + 1, closeAt(src, open, '(', ')')));
  }
  return out;
}

test('١. البيان: READ_CONTACTS معلَنة، ونشاط شفّاف مُصدَّر يلتقط omranai://contacts-sync وحده', () => {
  assert.match(M, /<uses-permission android:name="android\.permission\.READ_CONTACTS"\/>/);
  assert.doesNotMatch(M, /WRITE_CONTACTS|READ_CALL_LOG|READ_SMS/, 'قراءة جهات الاتّصال فقط');
  const at = M.indexOf('<activity android:name=".ContactsSyncActivity"');
  assert.ok(at > 0, 'النشاط معلَن باسم نسبيّ (يصلح لحزمتي هواوي وPlay)');
  const act = M.slice(at, M.indexOf('</activity>', at));
  assert.match(act, /android:exported="true"/);
  assert.match(act, /android:theme="@android:style\/Theme\.Translucent\.NoTitleBar"/, 'شفّاف بلا واجهة');
  assert.match(act, /<action android:name="android\.intent\.action\.VIEW"\/>/);
  assert.match(act, /<category android:name="android\.intent\.category\.DEFAULT"\/>/);
  assert.match(act, /<category android:name="android\.intent\.category\.BROWSABLE"\/>/, 'Chrome يفتحه من ضغطة في الصفحة');
  assert.match(act, /<data android:scheme="omranai" android:host="contacts-sync"\/>/);
  assert.doesNotMatch(act, /autoVerify|android:scheme="https?"|configChanges|noHistory/, 'لا رابط https ولا noHistory (يُنهي النشاط عند حوار الصلاحيّة)');
  assert.equal((M.match(/<activity android:name="\.ContactsSyncActivity"/g) || []).length, 1);
});

test('٢. ContactsSyncActivity: القراءة والتشفير كما في العقد — gzip ثمّ AES-256-GCM بمفتاح ٣٢ بايت وIV ‏١٢ ووسم ١٢٨', () => {
  for (const imp of C.match(/^import [^;]+;/gm)) assert.match(imp, /^import (android|java|javax|org\.json)\./, 'لا androidx ولا appcompat: ' + imp);
  assert.match(C, /static final String APP_HOST = "omran-ai-builder\.vercel\.app";/);
  const read = block(C, 'static List<String[]> readContacts(');
  assert.match(read, /ContactsContract\.CommonDataKinds\.Phone\.CONTENT_URI/);
  assert.match(read, /Phone\.DISPLAY_NAME,\s*ContactsContract\.CommonDataKinds\.Phone\.NUMBER\}/);
  assert.match(read, /out\.size\(\) < MAX_ENTRIES/);
  assert.match(read, /!seen\.add\(number\)/, 'الرقم نفسه مرّة واحدة');
  assert.match(read, /finally \{\s*c\.close\(\);/);
  assert.match(C, /static final int MAX_ENTRIES = 3000;/);
  assert.match(C, /static final int NAME_MAX = 40;/);
  assert.match(block(C, 'static String clipName('), /isHighSurrogate/, 'لا يُقطع رمز تعبيريّ من نصفه');
  const iso = block(C, 'static String countryIso(');
  assert.ok(iso.indexOf('getSimCountryIso()') < iso.indexOf('getNetworkCountryIso()') && iso.indexOf('getNetworkCountryIso()') < iso.indexOf('Locale.getDefault().getCountry()'), 'الشريحة ثمّ الشبكة ثمّ لغة الجهاز');
  const seal = block(C, 'static String seal(');
  assert.match(seal, /new byte\[12\]/);
  assert.match(seal, /Cipher\.getInstance\("AES\/GCM\/NoPadding"\)/);
  assert.match(seal, /new GCMParameterSpec\(128, iv\)/);
  assert.match(seal, /System\.arraycopy\(iv, 0, out, 0, iv\.length\);\s*System\.arraycopy\(ct, 0, out, iv\.length, ct\.length\);/, 'IV ‖ النصّ المشفَّر‖الوسم');
  assert.match(C, /private static final SecureRandom RNG = new SecureRandom\(\);/);
  const sp = block(C, 'static String[] sealPayload(');
  assert.match(sp, /byte\[\] key = new byte\[32\];\s*RNG\.nextBytes\(key\);/);
  assert.match(sp, /seal\(key, gzip\(payloadJson\(iso, list, count\)\.getBytes\(StandardCharsets\.UTF_8\)\)\)/, 'gzip قبل التشفير');
  assert.match(sp, /blob\.length\(\) <= BLOB_MAX \|\| count == 0/, 'يحذف من آخر القائمة حتّى يدخل سقف الخادم');
  assert.match(C, /static final int BLOB_MAX = 110000;/);
  assert.match(block(C, 'static byte[] gzip('), /new GZIPOutputStream\(bos\)/);
  assert.match(C, /Base64\.URL_SAFE \| Base64\.NO_PADDING \| Base64\.NO_WRAP/, 'base64url بلا حشو');
  // JSON الحمولة كما في العقد، بلا محارف تكسر evaluateJavascript (U+2028/U+2029)
  assert.match(block(C, 'static String payloadJson('), /sb\.append\("\{\\"v\\":1,\\"iso\\":"\)\.append\(jsonString\(iso\)\)\.append\(",\\"list\\":\["\);/);
  assert.match(block(C, 'static String jsonString('), /0x2028\), "\\\\u2028"\)[\s\S]*0x2029\), "\\\\u2029"\)/);
  // التذكرة والـnonce بتعابير العقد
  assert.ok(C.includes('Pattern.compile("^[0-9a-f]{32}$")') && C.includes('Pattern.compile("^[A-Za-z0-9_-]{8,64}$")'));
});

test('٣. ContactsSyncActivity: الشبكة https على النطاق الثابت بخيط خلفيّ ومهلة، والعودة إلى LauncherActivity صراحةً', () => {
  const post = block(C, 'static boolean postSyncPut(');
  assert.match(post, /new URL\("https:\/\/" \+ APP_HOST \+ "\/api\/system\?action=room"\)/);
  assert.match(post, /setConnectTimeout\(CONNECT_TIMEOUT_MS\)/);
  assert.match(post, /setReadTimeout\(READ_TIMEOUT_MS\)/);
  assert.match(post, /setRequestMethod\("POST"\)/);
  assert.match(post, /setRequestProperty\("Content-Type", "application\/json"\)/);
  assert.match(post, /\{\\"op\\":\\"sync-put\\",\\"id\\":" \+ jsonString\(ticket\) \+ ",\\"blob\\":" \+ jsonString\(blob\) \+ "\}/);
  assert.match(post, /setInstanceFollowRedirects\(false\)/, 'لا تحويل إلى نطاق آخر');
  assert.match(post, /return code == 200;/);
  assert.doesNotMatch(C, /http:\/\//, 'https وحده');
  const sync = block(C, 'private void startSync()');
  assert.match(sync, /new Thread\(/, 'القراءة والشبكة خارج خيط الواجهة');
  assert.ok(sync.indexOf('new Thread(') < sync.indexOf('postSyncPut(') && sync.indexOf('new Thread(') < sync.indexOf('readContacts(app)'));
  assert.match(sync, /fragment = "#cs=" \+ ticket \+ "\." \+ nonce \+ "\." \+ sealed\[1\];/, 'المفتاح بعد # وحده');
  assert.match(sync, /String fragment = "#cse=" \+ nonce;/, 'أيّ فشل = #cse');
  // الخادم يأخذ النصّ المشفَّر وحده؛ المفتاح (sealed[1]) لا يظهر إلّا في الجزء بعد #
  assert.match(sync, /postSyncPut\(ticket, sealed\[0\]\)/);
  assert.equal((C.match(/sealed\[1\]/g) || []).length, 1, 'المفتاح في مكان واحد فقط');
  // نسخة ثانية للتذكرة نفسها (تدوير أثناء الرفع، ضغطتان) لا ترفع ثانيةً — كان sync-put الثاني يُرفض فيصل #cse بعد #cs
  assert.ok(sync.indexOf('sSyncingTicket = ticket;') >= 0 && sync.indexOf('sSyncingTicket = ticket;') < sync.indexOf('new Thread('));
  assert.match(sync, /if \(ticket\.equals\(sSyncingTicket\)\) \{\s*sSyncingTicket = null;[\s\S]*?if \(alive\(ContactsSyncActivity\.this\)\) \{\s*openRoom\(done\);\s*if \(follower != null\) \{\s*follower\.finish\(\);/);
  const open = block(C, 'private void openRoom(');
  assert.match(open, /new Intent\(Intent\.ACTION_VIEW,\s*Uri\.parse\("https:\/\/" \+ APP_HOST \+ "\/room\.html" \+ fragment\)\)/);
  assert.match(open, /intent\.setClass\(app, LauncherActivity\.class\);/);
  assert.match(open, /intent\.addFlags\(Intent\.FLAG_ACTIVITY_NEW_TASK\);/);
  assert.match(open, /finish\(\);/);
  // النطاق لا يُؤخذ من النيّة الواردة: getHost() يُقارن بـcontacts-sync فقط، ولا رابط يُبنى من getData()
  assert.deepEqual([...C.matchAll(/(\w+(?:\.\w+)*)\.getHost\(\)/g)].map((m) => m[0]), ['data.getHost()']);
  assert.match(C, /SYNC_HOST\.equalsIgnoreCase\(data\.getHost\(\)\)/);
  const create = block(C, 'protected void onCreate(');
  assert.match(create, /if \(!validNonce\(n\)\) \{[\s\S]*?finish\(\);\s*return;/);
  assert.match(create, /if \(!validTicket\(t\)\) \{\s*openRoom\("#cse=" \+ n\);/);
  assert.ok(create.indexOf('t.equals(sSyncingTicket)') > 0 && create.indexOf('t.equals(sSyncingTicket)') < create.indexOf('showDisclosure('), 'التذكرة الجارية قبل أيّ إفصاح أو رفع');
  assert.match(block(C, 'private void onDisclosureAllowed()'), /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.M && !mAsked\) \{\s*mAsked = true;\s*requestPermissions\(new String\[\]\{Manifest\.permission\.READ_CONTACTS\}, RC_CONTACTS\);/);
  assert.match(block(C, 'static boolean hasContactsPermission('), /SDK_INT < Build\.VERSION_CODES\.M\) \{\s*return true;[\s\S]*checkSelfPermission\(Manifest\.permission\.READ_CONTACTS\)/, 'minSdk 21: الطلب وقت التشغيل من أندرويد ٦');
  const res = block(C, 'public void onRequestPermissionsResult(');
  assert.match(res, /grantResults\[0\] == PackageManager\.PERMISSION_GRANTED\) \{\s*startSync\(\);\s*\} else \{\s*openRoom\("#csd=" \+ mNonce\);/);
  assert.doesNotMatch(C, /getSharedPreferences|openFileOutput|FileOutputStream/, 'القائمة لا تُخزَّن على الجهاز (allowBackup=true)');
});

test('٤. جسر OmranContacts في WebView الاحتياطيّ: نطاق الصفحة أوّلًا، وRC_CONTACTS بأسلوب RC_* القائمة', () => {
  assert.match(block(J, 'private void attachRenderBridge(WebView webView)'), /webView\.addJavascriptInterface\(new ContactsBridge\(\), "OmranContacts"\);/);
  assert.equal((J.match(/attachRenderBridge\(mWebView\);/g) || []).length, 2, 'مسارا إنشاء WebView');
  assert.match(J, /private static final int RC_CONTACTS = 8424;/);
  const bridge = block(J, 'private final class ContactsBridge');
  assert.match(bridge, /@JavascriptInterface\s+public String granted\(\)/, 'public: R8 يبقي دوالّ الجسر العامّة');
  assert.match(bridge, /@JavascriptInterface\s+public void read\(final String nonce\)/);
  const granted = block(bridge, 'public String granted()');
  assert.ok(granted.indexOf('pageOnAppHost') < granted.indexOf('hasContactsPermission'), 'النطاق قبل الجواب');
  assert.match(granted, /runOnUiThread\(onHost\);/, 'getUrl() على خيط الواجهة');
  assert.match(block(bridge, 'public void read(final String nonce)'), /if \(!ContactsSyncActivity\.validNonce\(nonce\)\) \{\s*return;/);
  const host = block(J, 'private boolean pageOnAppHost()');
  assert.match(host, /wv\.getUrl\(\)/);
  assert.match(host, /"https"\.equalsIgnoreCase\(u\.getScheme\(\)\)\s*&& ContactsSyncActivity\.APP_HOST\.equalsIgnoreCase\(u\.getHost\(\)\)/);
  assert.match(block(J, 'private void startContactsRead('), /if \(!pageOnAppHost\(\)\) \{\s*return;[\s\S]*Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.M\) \{\s*requestPermissions\(new String\[\]\{Manifest\.permission\.READ_CONTACTS\}, RC_CONTACTS\);/);
  const rca = block(J, 'private void readContactsAsync(');
  assert.ok(rca.indexOf('new Thread(') > 0 && rca.indexOf('new Thread(') < rca.indexOf('readContacts(app)'), 'القراءة خارج خيط الواجهة');
  // قراءة واحدة في كلّ مرّة: أوّل nonce يكسب، ونداءات read بعده لا تفتح خيطًا ولا تغيّر من يستلم الجواب
  assert.match(rca, /if \(mContactsReadNonce != null\) \{\s*return;\s*\}\s*mContactsReadNonce = nonce;/);
  assert.ok(rca.indexOf('if (mContactsReadNonce != null)') < rca.indexOf('new Thread('));
  assert.match(rca, /mContactsReadNonce = null;\s*deliverContacts\(nonce, p, er\);/);
  const deliver = block(J, 'private void deliverContacts(');
  assert.match(deliver, /if \(wv == null \|\| !pageOnAppHost\(\)\) \{\s*return;/, 'تحقّق ثانٍ لحظة التسليم');
  const expr = deliver.match(/evaluateJavascript\(("window\.__omranContacts&&window\.__omranContacts\(" \+ JSONObject\.quote\(nonce\) \+ ","\s*\+ \(payload == null \? "null" : payload\) \+ "," \+ JSONObject\.quote\(err\) \+ "\)"), null\)/);
  assert.ok(expr, 'نداء الصفحة كما في العقد');
  // النصّ المحقون كما يبنيه الجافا (JSONObject.quote ≈ JSON.stringify): يصل الدالّة بمعاملاتها، وبلا دالّة لا يرمي
  const js = (nonce, payload, err) => 'window.__omranContacts&&window.__omranContacts(' + JSON.stringify(nonce) + ',' + (payload == null ? 'null' : payload) + ',' + JSON.stringify(err) + ')';
  const got = [];
  new Function('window', js('abcDEF_-12', '{"v":1,"iso":"ae","list":[["A","+971 50 123 4567"]]}', ''))({ __omranContacts: (...a) => got.push(a) });
  new Function('window', js('abcDEF_-12', null, 'denied'))({ __omranContacts: (...a) => got.push(a) });
  new Function('window', js('abcDEF_-12', null, 'error'))({});
  assert.deepEqual(got, [['abcDEF_-12', { v: 1, iso: 'ae', list: [['A', '+971 50 123 4567']] }, ''], ['abcDEF_-12', null, 'denied']]);
  // فرع الصلاحيّة: بعد الموقع وقبل حارس المايك الذي يخرج مبكّرًا
  const perm = block(J, 'public void onRequestPermissionsResult(');
  assert.ok(perm.indexOf('RC_LOCATION') < perm.indexOf('RC_CONTACTS') && perm.indexOf('RC_CONTACTS') < perm.indexOf('RC_RECORD_AUDIO'));
  assert.match(perm, /if \(requestCode == RC_CONTACTS\) \{\s*String nonce = mContactsNonce;\s*mContactsNonce = null;[\s\S]*?grantResults\[0\] == PackageManager\.PERMISSION_GRANTED\) \{\s*readContactsAsync\(nonce\);\s*\} else \{\s*deliverContacts\(nonce, null, "denied"\);[\s\S]*?return;\s*\}/);
});

test('٥. لا رقم ولا اسم في أيّ سجلّ: Log في الجزء الجديد بنصّ ثابت ونوع الخطأ فقط', () => {
  const parts = [C, block(J, 'private final class ContactsBridge'), block(J, 'private boolean pageOnAppHost()'), block(J, 'private void startContactsRead('),
    block(J, 'private void readContactsAsync('), block(J, 'private void deliverContacts(')];
  let n = 0;
  for (const src of parts) {
    for (const args of logCalls(src)) {
      n++;
      const rest = args.replace(/"(?:[^"\\]|\\.)*"/g, '').replace(/\be\.getClass\(\)\.getSimpleName\(\)/g, '').replace(/\bTAG\b/g, '');
      assert.match(rest, /^[\s,+]*$/, 'سجلّ بقيمة متغيّرة: Log(' + args + ')');
    }
    assert.doesNotMatch(src, /printStackTrace|System\.(out|err)/);
  }
  assert.ok(n >= 3, 'السجلّات موجودة وفُحصت');
});

test('٦. التوثيق: الصلاحيّة تصل المتجرين، وإجابات Data safety وهواوي، وملاحظة المراجع', () => {
  const readme = read('store/huawei/README.md');
  const sec = readme.slice(readme.indexOf('## مزامنة جهات الاتّصال لغرفة الربع'), readme.indexOf('## تفاصيل للصيانة'));
  assert.ok(sec.length > 500, 'قسم README');
  for (const k of ['READ_CONTACTS', 'android-release', 'play-release', 'Data safety', 'AppGallery Connect', 'privacy.html', 'adb shell am start', 'omranai://contacts-sync']) assert.ok(sec.includes(k), 'README: ' + k);
  assert.match(sec, /\*\*الأسماء تبقى على الجهاز\*\*/);
  const notes = read('store/huawei/REVIEW-NOTES.md');
  const rn = notes.slice(notes.indexOf('## Contacts permission (READ_CONTACTS)'), notes.indexOf('## خانة Remarks في AGC'));
  assert.ok(rn.includes('Phone numbers are sent only as one-way hashes') && rn.includes('Contact names stay on the phone') && rn.includes('the server does not store them'));
  assert.ok(notes.indexOf('## Contacts permission') > 0 && notes.indexOf('## Contacts permission') < notes.indexOf('It has '), 'خارج قائمة الأدوات');
  assert.ok(!rn.includes(APP_HOST + '/api'), 'لا تفاصيل خادم للمراجع');
  // أسماء الأزرار في خطوات المراجع والمالك هي نصوص الصفحة نفسها (I18N.en وI18N.ar في room.html)
  const room = read('room.html');
  const str = (k) => [...room.matchAll(new RegExp('\\b' + k + ": '([^']*)'", 'g'))].map((m) => m[1]);
  const [enBtn, arBtn] = str('syncBtn'), [enAllow, arAllow] = str('syncAllow'), [enLater, arLater] = str('syncLater');
  assert.ok(enBtn && arBtn && enAllow && arAllow && enLater && arLater, 'نصوص المزامنة في الصفحة');
  assert.ok(rn.includes('"' + enBtn + '"') && rn.includes('> ' + enBtn + ' > ' + enAllow + ' >') && rn.includes('"' + enAllow + '"'), 'REVIEW-NOTES: ' + enBtn);
  assert.ok(sec.includes('«' + arBtn + '»') && sec.includes('«' + arAllow + ' / ' + arLater + '»') && sec.includes(enAllow + ' / ' + enLater), 'README: ' + arBtn);
  // الإفصاح الأصليّ قبل حوار أندرويد في المسارين، والحدّ الباقي (مخطّط omranai:// مدّعى) وقرار «لا App Link» موثّقان
  assert.ok(rn.includes('the Android permission dialog comes only after') && rn.includes('shows its own notice'), 'REVIEW-NOTES: الإفصاح الأصليّ');
  assert.ok(sec.includes('كلّ إطلاق يبدأ بالإفصاح الأصليّ') && sec.includes('قائمة مزيّفة') && sec.includes('لا App Link'), 'README: الحدّ والقرار');
});

test('٧. ContactsSyncActivity: الإفصاح الأصليّ في كلّ إطلاق قبل أيّ طلب صلاحيّة أو قراءة أو رفع', () => {
  const show = block(C, 'static AlertDialog showDisclosure(');
  assert.match(show, /new AlertDialog\.Builder\(activity, android\.R\.style\.Theme_Material_Dialog_Alert\)/, 'android.app.AlertDialog، بلا appcompat');
  assert.match(show, /\.setTitle\(R\.string\.sync_title\)\s*\.setMessage\(R\.string\.sync_disclose\)/);
  assert.match(show, /\.setPositiveButton\(R\.string\.sync_allow, new DialogInterface\.OnClickListener\(\) \{[\s\S]*?onAllow\.run\(\);/);
  assert.match(show, /\.setNegativeButton\(R\.string\.sync_later, new DialogInterface\.OnClickListener\(\) \{[\s\S]*?onLater\.run\(\);/);
  assert.match(show, /\.setOnCancelListener\(new DialogInterface\.OnCancelListener\(\) \{[\s\S]*?onLater\.run\(\);/, 'الرجوع واللمس خارج الحوار = ليس الآن');
  assert.equal((show.match(/onAllow\.run\(\)/g) || []).length, 1, '«سماح» وحده يكمل');
  assert.match(show, /dialog\.show\(\);/);
  const create = block(C, 'protected void onCreate(');
  for (const k of ['requestPermissions(', 'startSync(', 'readContacts(', 'postSyncPut(', 'hasContactsPermission(']) {
    assert.ok(!create.includes(k), 'لا ' + k + ' في onCreate — بعد «سماح» وحده');
  }
  const showAt = create.indexOf('mDisclosure = showDisclosure(this,');
  assert.ok(showAt > create.indexOf('validTicket(t)') && showAt > create.indexOf('if (mAsked)'), 'الإفصاح بعد فحص الرابط');
  assert.match(create.slice(showAt), /public void run\(\) \{\s*onDisclosureAllowed\(\);[\s\S]*?public void run\(\) \{\s*openRoom\("#csd=" \+ mNonce\);/, '«سماح» ← onDisclosureAllowed، «ليس الآن» ← #csd');
  // إعادة إنشاء بعد «سماح» (حوار أندرويد مفتوح): لا إفصاح ثانٍ ولا طلب ثانٍ، الجواب يصل onRequestPermissionsResult
  assert.match(create, /if \(mAsked\) \{[\s\S]*?return;\s*\}/);
  // المدخل الوحيد: requestPermissions مرّة واحدة في onDisclosureAllowed، وstartSync من onDisclosureAllowed أو جواب ذلك الطلب فقط
  const allowed = block(C, 'private void onDisclosureAllowed()');
  assert.equal((C.match(/requestPermissions\(/g) || []).length, 1);
  assert.ok(allowed.includes('requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, RC_CONTACTS);'));
  assert.equal((C.match(/\bstartSync\(\);/g) || []).length, 2);
  assert.ok(allowed.includes('startSync();') && block(C, 'public void onRequestPermissionsResult(').includes('startSync();'));
  assert.equal((C.match(/\bonDisclosureAllowed\(\);/g) || []).length, 1, 'من زرّ «سماح» وحده');
  // القراءة والرفع داخل startSync وحده (غير تعريفيهما)
  const sync = block(C, 'private void startSync()');
  assert.equal((C.match(/readContacts\(app\)/g) || []).length, 1); assert.ok(sync.includes('readContacts(app)'));
  assert.equal((C.match(/postSyncPut\(ticket/g) || []).length, 1); assert.ok(sync.includes('postSyncPut(ticket, sealed[0])'));
  // الحوار يُغلق مع النشاط (تدوير) بلا #csd: dismiss لا يستدعي onCancel
  assert.match(block(C, 'protected void onDestroy()'), /mDisclosure\.dismiss\(\);[\s\S]*super\.onDestroy\(\);/);
});

test('٨. جسر OmranContacts: الإفصاح الأصليّ قبل requestPermissions إن لم تُمنح، صامت إن مُنحت، وأوّل طلب جارٍ يكسب', () => {
  const start = block(J, 'private void startContactsRead(');
  const at = (s) => { const i = start.indexOf(s); assert.ok(i >= 0, 'موجود: ' + s); return i; };
  const guard = at('if (mContactsNonce != null || mContactsReadNonce != null) {');
  assert.match(start.slice(guard), /^if \(mContactsNonce != null \|\| mContactsReadNonce != null\) \{\s*return;/, 'نداء read أثناء آخر جارٍ يُتجاهل');
  assert.ok(at('pageOnAppHost()') < guard && guard < at('hasContactsPermission(this)'));
  // ممنوحة: قراءة صامتة ثمّ خروج قبل الإفصاح
  assert.match(start, /hasContactsPermission\(this\)\) \{[\s\S]*?readContactsAsync\(nonce\);\s*return;\s*\}/);
  const show = at('ContactsSyncActivity.showDisclosure(this, () -> {');
  const req = at('requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, RC_CONTACTS);');
  assert.ok(at('readContactsAsync(nonce);') < show && at('mContactsNonce = nonce;') < show && show < req, 'الإفصاح قبل طلب الصلاحيّة');
  const later = start.indexOf('}, () -> {', show);
  assert.ok(later > req, 'الطلب داخل «سماح» لا «ليس الآن»');
  assert.match(start.slice(show, later), /if \(nonce\.equals\(mContactsNonce\) && Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.M\) \{\s*requestPermissions/);
  assert.match(start.slice(later), /if \(nonce\.equals\(mContactsNonce\)\) \{\s*mContactsNonce = null;\s*deliverContacts\(nonce, null, "denied"\);/, '«ليس الآن» = denied للصفحة');
  // لا طلب صلاحيّة جهات اتّصال في أيّ مكان آخر من الملفّ
  assert.equal((J.match(/Manifest\.permission\.READ_CONTACTS/g) || []).length, 1);
  // أوّل nonce يستلم الجواب: لا «أحدث nonce» بعد اليوم
  assert.doesNotMatch(J, /String latest = mContactsReadNonce/);
});

test('٩. بطاقة تقدّم ظاهرة لا تُلغى أثناء القراءة والرفع، والنتيجة تُسقط إن هُدم النشاط أو أُنهي', () => {
  const prog = block(C, 'private void showProgress()');
  assert.match(prog, /mBusy = true;/);
  assert.match(prog, /new ProgressBar\(this\)/);
  assert.match(prog, /label\.setText\(R\.string\.sync_progress\);/);
  assert.match(prog, /setContentView\(root\);/, 'ظاهرة: لم تعد نافذة شفّافة فارغة');
  assert.match(prog, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.TIRAMISU\) \{\s*getOnBackInvokedDispatcher\(\)\.registerOnBackInvokedCallback\(\s*OnBackInvokedDispatcher\.PRIORITY_DEFAULT,/, 'targetSdk 36: الرجوع لا يصل onBackPressed');
  assert.match(block(C, 'public void onBackPressed()'), /if \(mBusy\) \{[\s\S]*?return;\s*\}\s*super\.onBackPressed\(\);/);
  const sync = block(C, 'private void startSync()');
  assert.ok(sync.indexOf('showProgress();') > 0 && sync.indexOf('showProgress();') < sync.indexOf('new Thread('), 'قبل بدء العمل');
  assert.match(block(C, 'protected void onCreate('), /sFollower = new WeakReference<ContactsSyncActivity>\(this\);\s*showProgress\(\);\s*return;/, 'النسخة المنتظرة تُظهرها أيضًا');
  // منتظرة أقدم للتذكرة نفسها تُغلق قبل تسجيل الجديدة: الرفع لا يغلق إلّا الأخيرة، فكانت تبقى بطاقة عالقة والرجوع فيها مبتلع
  assert.match(block(C, 'protected void onCreate('), /ContactsSyncActivity prev = sFollower == null \? null : sFollower\.get\(\);\s*if \(alive\(prev\)\) \{[\s\S]*?prev\.finish\(\);\s*\}\s*sFollower = new WeakReference/);
  assert.match(block(C, 'static boolean alive('), /return a != null && !a\.isFinishing\(\) && !a\.isDestroyed\(\);/);
  // في نداء النهاية: لا openRoom إلّا من نشاط حيّ، وإلّا تُسقط النتيجة
  const done = sync.slice(sync.indexOf('runOnUiThread('));
  assert.match(done, /if \(alive\(ContactsSyncActivity\.this\)\) \{\s*openRoom\(done\);[\s\S]*?\} else if \(alive\(follower\)\) \{[\s\S]*?follower\.openRoom\(done\);\s*\} else \{[\s\S]*?Log\.w\(TAG, "contacts sync result dropped: activity gone"\);\s*\}/);
  assert.equal((done.match(/openRoom\(/g) || []).length, 2, 'كلّ openRoom تحت فحص alive');
});

/** strings.xml بسيط بلا محلّل خارجيّ: مقدّمة، جذر resources واحد، عناصر string فقط، وهروب أندرويد (\' و\") وXML (&amp; &lt;). */
function parseStrings(xml, where) {
  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>\s*/, where + ': المقدّمة');
  const noComments = xml.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!noComments.includes('<!--') && !noComments.includes('-->'), where + ': تعليق غير مغلق');
  const root = noComments.replace(/^<\?xml[^>]*\?>/, '').match(/^\s*<resources>([\s\S]*)<\/resources>\s*$/);
  assert.ok(root, where + ': جذر resources واحد');
  const out = {};
  const re = /<string name="([A-Za-z_][A-Za-z0-9_]*)">([^<]*)<\/string>/g;
  assert.equal(root[1].replace(re, '').trim(), '', where + ': عناصر string فقط ومغلقة');
  for (const [, name, raw] of root[1].matchAll(re)) {
    assert.ok(!(name in out), where + ': مكرّر ' + name);
    assert.doesNotMatch(raw, /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/, where + ': & بلا هروب في ' + name);
    assert.doesNotMatch(raw.replace(/\\\\/g, ''), /(?<!\\)['"]/, where + ': \' أو " بلا \\ في ' + name);
    assert.doesNotMatch(raw, /^[@?]/, where + ': @ أو ? في أوّل ' + name);
    out[name] = raw.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
      .replace(/\\(['"\\])/g, '$1');
  }
  return out;
}

test('١٠. نصوص الإفصاح الأصليّ: الإنجليزيّة افتراضًا و١٤ مجلّد لغة بالمفاتيح الخمسة، وXML سليم', () => {
  const RES = 'store/huawei/twa/app/src/main/res/';
  const KEYS = ['sync_title', 'sync_disclose', 'sync_allow', 'sync_later', 'sync_progress'];
  const DIRS = ['values-ar', 'values-fr', 'values-es', 'values-tr', 'values-ru', 'values-zh', 'values-hi', 'values-ur', 'values-bn', 'values-ne',
    'values-ml', 'values-in', 'values-fil', 'values-tl'];
  assert.equal(DIRS.length, 14);
  const en = parseStrings(read(RES + 'values/strings.xml'), 'values');
  assert.ok(en.assetStatements.includes('"site": "https://omran-ai-builder.vercel.app"'), 'assetStatements كما هو');
  const all = { values: en };
  for (const d of DIRS) {
    assert.ok(fs.existsSync(path.join(root, RES + d, 'strings.xml')), d);
    all[d] = parseStrings(read(RES + d + '/strings.xml'), d);
    assert.deepEqual(Object.keys(all[d]).sort(), [...KEYS].sort(), d + ': المفاتيح الخمسة وحدها');
  }
  for (const [d, s] of Object.entries(all)) {
    for (const k of KEYS) assert.ok(typeof s[k] === 'string' && s[k].trim().length > 0, d + ': ' + k);
    assert.ok(s.sync_disclose.includes('om ai'), d + ': «om ai» كما هو');
    assert.ok(s.sync_disclose.length > 3 * s.sync_title.length, d + ': نصّ الإفصاح كامل');
  }
  assert.doesNotMatch(en.sync_disclose, /encrypt/i, 'البصمة ليست تشفيرًا');
  assert.match(en.sync_disclose, /one-way code \(a hash\)/);
  assert.match(en.sync_disclose, /Names stay on your phone\./);
  assert.ok(en.sync_disclose.includes("phone's contacts") && read(RES + 'values/strings.xml').includes("phone\\'s contacts"), 'الفاصلة العليا مهرَّبة');
  assert.deepEqual(all['values-tl'], all['values-fil'], 'values-tl = values-fil');
  assert.notDeepEqual(all['values-ar'], en, 'العربيّة مترجمة');
  // أزرار الإفصاح الأصليّ هي أزرار بطاقة الصفحة نفسها (I18N.en وI18N.ar في room.html)
  const room = read('room.html');
  const str = (k) => [...room.matchAll(new RegExp('\\b' + k + ": '([^']*)'", 'g'))].map((m) => m[1]);
  const [enAllow, arAllow] = str('syncAllow'), [enLater, arLater] = str('syncLater');
  assert.deepEqual([en.sync_allow, en.sync_later, all['values-ar'].sync_allow, all['values-ar'].sync_later], [enAllow, enLater, arAllow, arLater]);
  // الأكواد تستعمل المفاتيح الخمسة كلّها
  for (const k of KEYS) assert.ok(C.includes('R.string.' + k), 'ContactsSyncActivity: R.string.' + k);
});
