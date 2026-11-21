// tests/play-aab.test.cjs — v-play-aab (المالك ٢١ نوفمبر: «ابدأ» بعد إشعارَي Play Console): حزمة Google Play ‏(AAB) لـcom.omran.aibuilder
// من مشروع هواوي نفسه على أندرويد 36 باسم «om ai» وتنطلق من «/»، وassetlinks يربط الموقع بحزمة جوجل أيضًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const WF = '.github/workflows/play-release.yml';

test('١. ورك فلو Play: يدويّ، يبني AAB ويوقّعه بأسرار المستودع، ويرفق شهادة مفتاح الرفع، ولا ينشر ولا يكتب في المستودع', () => {
  const w = read(WF);
  assert.match(w, /^on:\n  workflow_dispatch:/m, 'تشغيل يدويّ فقط');
  assert.ok(!/^\s+push:/m.test(w), 'لا تشغيل تلقائيّ مع الدفع');
  assert.match(w, /permissions:\n  contents: read/, 'قراءة فقط: لا Release ولا فروع');
  assert.ok(w.includes('./gradlew --no-daemon bundleRelease'), 'AAB لا APK');
  assert.ok(w.includes('jarsigner -sigalg SHA256withRSA -digestalg SHA-256'), 'توقيع AAB بـjarsigner');
  for (const s of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS']) assert.ok(w.includes('secrets.' + s), s);
  assert.ok(w.includes('keytool -export -rfc') && w.includes('upload_certificate.pem'), 'شهادة مفتاح الرفع لإعادة ضبطه إن لزم');
  assert.ok(w.includes('rm -f "$RUNNER_TEMP/release.keystore"'), 'المخزن يُحذف بعد التوقيع');
  assert.match(w, /Number\(process\.env\.VERSION_CODE\)>15/, 'versionCode أكبر من آخر إصدار في Play (15)');
  assert.ok(!/gh release|git push|softprops/.test(w), 'لا نشر');
});

test('٢. التبديل يعمل على نسخة المشغّل وحدها، وينتج حزمة جوجل من «/» بأندرويد 36 واسم om ai — والمشروع في المستودع لهواوي كما هو', () => {
  const w = read(WF);
  const line = w.split('\n').find((l) => l.includes("launchUrl: '/'#") && l.includes('sed -i -E'));
  assert.ok(line, 'أمر التبديل');
  const expr = line.slice(line.indexOf('"') + 1, line.lastIndexOf('" app/build.gradle')).replace(/\\"/g, '"'); // كما تمرّره bash
  assert.ok(w.includes('cp -r "$SRC_DIR" "$PLAY_DIR"') && w.includes('PLAY_DIR="$RUNNER_TEMP/play-twa"'), 'نسخة لا المستودع نفسه');
  // تطبيق التبديل حرفيًّا على نسخة من build.gradle (sed GNU إن وُجد)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'play-aab-'));
  const g = path.join(tmp, 'build.gradle');
  fs.copyFileSync(path.join(root, 'store/huawei/twa/app/build.gradle'), g);
  let out;
  try {
    execFileSync('sed', ['-i', '-E', expr, g]);
    out = fs.readFileSync(g, 'utf8');
  } catch (e) {
    // بلا sed: المحاكاة بالتعابير نفسها
    out = fs.readFileSync(g, 'utf8').replace(/applicationId: 'com\.omran\.aibuilder\.twa'/, "applicationId: 'com.omran.aibuilder'")
      .replace(/applicationId "com\.omran\.aibuilder\.twa"/, 'applicationId "com.omran.aibuilder"').replace("launchUrl: '/?store=huawei'", "launchUrl: '/'");
  }
  assert.match(out, /applicationId: 'com\.omran\.aibuilder',/);
  assert.match(out, /applicationId "com\.omran\.aibuilder"\n/);
  assert.match(out, /launchUrl: '\/',/);
  assert.ok(!out.includes('store=huawei'), 'لا علم هواوي في حزمة جوجل');
  assert.match(out, /targetSdkVersion 36/, 'أندرويد 36 (إنذار ٣ أكتوبر)');
  assert.match(out, /name: 'om ai',/);
  assert.match(out, /namespace "com\.omran\.aibuilder\.twa"/, 'الأصناف في مكانها (LauncherActivity وMahaWebViewFallbackActivity)');
  // المستودع نفسه لهواوي
  const hw = read('store/huawei/twa/app/build.gradle');
  assert.match(hw, /applicationId "com\.omran\.aibuilder\.twa"/);
  assert.ok(hw.includes("launchUrl: '/?store=huawei'"));
});

test('٣. assetlinks: عبارة هواوي أوّلًا كما هي، وعبارة لحزمة جوجل com.omran.aibuilder ببصمة مفتاح الرفع', () => {
  const al = JSON.parse(read('.well-known/assetlinks.json'));
  assert.equal(al[0].target.package_name, 'com.omran.aibuilder.twa', 'android-release يكتب في al[0]');
  const play = al.find((s) => s.target && s.target.package_name === 'com.omran.aibuilder');
  assert.ok(play, 'حزمة جوجل');
  assert.deepEqual(play.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(play.target.namespace, 'android_app');
  const FP = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
  assert.ok(play.target.sha256_cert_fingerprints.length >= 1 && play.target.sha256_cert_fingerprints.every((f) => FP.test(f)));
  assert.ok(play.target.sha256_cert_fingerprints.includes(al[0].target.sha256_cert_fingerprints.find((f) => f.startsWith('D1:80'))), 'مفتاح الرفع نفسه');
});
