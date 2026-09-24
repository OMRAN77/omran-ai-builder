'use strict';
/* v-art-defer + v-webview-opaque + v-fold-config (المالك ٢٤ سبتمبر: «افحص لي من الصفر الشاشة
   كاملة فيه وميض ومشوّشة ومشاكل والأدوات… هذي المشكلة من أمس ولم يحلّها أحد»).

   قياس على مقاس جهازه (٧٠٠×٧٧٠ بكثافة ٢٫٦٢٥، محادثة فارغة، UA وWebView هواوي): ٧٤ صورة
   تُحمَّل عند الإقلاع = ٥٠٫٤ م.ب بكسلات، والمعروض منها ٠٫١٨ م.ب — ٦٩ صورة داخل نوافذ مغلقة.
   وفي الغلاف الأصليّ: نشاط WebView يرث سمة نافذة شفّافة، وconfigChanges بلا أعلام الطيّ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const R = (p) => fs.readFileSync(p, 'utf8');

/* ————— المساعد نفسه: يُشغَّل حقيقيًّا لا يُقرأ نصًّا ————— */
function runHelper({ withObserver = true } = {}) {
  const observed = [];
  const unobserved = [];
  let cb = null;
  const ctx = {
    window: {},
    console,
    __swallow() {},
    IntersectionObserver: withObserver
      ? function (fn, opts) {
        cb = fn;
        this.observe = (el) => observed.push(el);
        this.unobserve = (el) => unobserved.push(el);
        this.opts = opts;
      }
      : undefined,
  };
  ctx.window.__swallow = ctx.__swallow;
  vm.createContext(ctx);
  const src = html.slice(html.indexOf('window.__omranWhenSeen ='));
  vm.runInContext(src.slice(0, src.indexOf('\n</script>')), ctx);
  return {
    whenSeen: ctx.window.__omranWhenSeen,
    observed,
    unobserved,
    fire: (el) => cb([{ isIntersecting: true, target: el }]),
    miss: (el) => cb([{ isIntersecting: false, target: el }]),
  };
}

test('١. المساعد يؤجّل العمل حتّى يدخل العنصر الشاشة، ثمّ ينفّذه مرّة واحدة ويفكّ المراقبة', () => {
  const h = runHelper();
  const el = { tag: 'img' };
  let ran = 0;
  h.whenSeen(el, () => { ran++; });
  assert.equal(ran, 0, 'لا ينفَّذ قبل الظهور — هذا كلّ الفرق');
  assert.deepEqual(h.observed, [el], 'العنصر مُراقَب');
  h.miss(el);
  assert.equal(ran, 0, 'تقاطع سالب لا ينفّذ شيئًا');
  h.fire(el);
  assert.equal(ran, 1);
  assert.deepEqual(h.unobserved, [el], 'يفكّ المراقبة بعد التنفيذ فلا تتراكم');
  h.fire(el);
  assert.equal(ran, 1, 'لا يتكرّر');
});

test('٢. نداءات متعدّدة على العنصر نفسه تُجمَّع (applyToolPhotos يعمل أربع مرّات عند الإقلاع)', () => {
  const h = runHelper();
  const el = {};
  const ran = [];
  h.whenSeen(el, () => ran.push('a'));
  h.whenSeen(el, () => ran.push('b'));
  h.whenSeen(el, () => ran.push('c'));
  assert.equal(h.observed.length, 1, 'مراقبة واحدة لا ثلاث');
  h.fire(el);
  assert.deepEqual(ran, ['a', 'b', 'c']);
  // بعد الظهور، نداء جديد يعمل فورًا (إعادة التطبيق عند تبديل اللغة)
  let after = 0;
  h.whenSeen(el, () => { after++; });
  h.fire(el);
  assert.equal(after, 1);
});

test('٣. رمية من دالّة لا تمنع البقيّة، ولا مراقب = تنفيذ فوريّ كما كان قبل التأجيل', () => {
  const h = runHelper();
  const el = {};
  const ran = [];
  h.whenSeen(el, () => { throw new Error('boom'); });
  h.whenSeen(el, () => ran.push('ok'));
  h.fire(el);
  assert.deepEqual(ran, ['ok'], '__swallow يبتلع الرمية والثانية تعمل');

  const n = runHelper({ withObserver: false });
  let ranNow = 0;
  n.whenSeen({}, () => { ranNow++; });
  assert.equal(ranNow, 1, 'متصفّح بلا IntersectionObserver يرجع للسلوك القديم');
  n.whenSeen(null, () => { ranNow++; });
  assert.equal(ranNow, 1, 'بلا عنصر لا شيء');
});

test('٤. المساعد مُعرَّف قبل أيّ سكربت يستعمله وقبل أوّل ورقة أنماط', () => {
  const def = html.indexOf('window.__omranWhenSeen =');
  assert.ok(def > 0, 'مُعرَّف في الصفحة');
  assert.ok(def < html.indexOf('<link rel="stylesheet"'), 'قبل أوّل ورقة أنماط');
  for (const s of ['/js/design-gen.js', '/js/app.bundle.js', '/js/ui-wiring.js']) {
    assert.ok(def < html.indexOf(s), 'قبل ' + s);
  }
  assert.match(html, /new IntersectionObserver/);
});

test('٥. كلّ مُنشئ صور داخل نافذة مغلقة يمرّ بالمساعد ولا يعيّن src عند الإقلاع', () => {
  // استوديو الأزياء: صفّ المقارنة ٣٦ بطاقة + مصغّرة النمط (٣٧ صورة، ~٢٤ م.ب)
  const a12 = R('js/app-12-studios.js');
  assert.match(a12, /window\.__omranWhenSeen\(img, function\(\)\{ img\.src = __src; \}\)/);
  assert.doesNotMatch(a12, /img\.src = 'assets\/fashion\/looks\/' \+ gender/, 'لا تعيين مباشر');
  assert.doesNotMatch(a12, /img\.loading = 'eager'/, 'eager كان يتجاوز التأجيل');

  // الفئات والإضافات والمناسبة والموسم (design-gen)
  const dg = R('js/design-gen.js');
  assert.match(dg, /window\.__omranWhenSeen\(im,function\(\)\{ im\.src=url; \}\)/);
  assert.doesNotMatch(dg, /im\.src=url; im\.loading='eager'/);

  // بطاقات الأدوات الثماني عشرة — التأجيل على الزرّ لا على الصورة
  const tc = R('js/tool-card-images.js');
  assert.match(tc, /window\.__omranWhenSeen\(btn, function\(\)\{ upgradeButton\(id, srcFor\(id\)\); \}\)/);
  assert.match(tc, /decorate\(id\);/, 'النصّ يبقى عند الإقلاع');

  // البطاقة المصغّرة الموحّدة (الديكور + المناسبة + الموسم) ومصغّرة الاستوديو
  assert.match(R('js/app-05-ui.js'), /window\.__omranWhenSeen\(im, function\(\)\{ im\.src = s\.img; \}\)/);
  const a13 = R('js/app-13-stocks-init.js');
  assert.match(a13, /window\.__omranWhenSeen\(img, function\(\)\{ img\.src = __sSrc; \}\)/);
  assert.doesNotMatch(a13, /img\.src = 'assets\/studio\/options\/' \+ feature/);

  // كلّ موضع له طريق رجوع إن غاب المساعد
  for (const [f, s] of [['js/app-12-studios.js', a12], ['js/design-gen.js', dg],
    ['js/tool-card-images.js', tc], ['js/app-13-stocks-init.js', a13], ['js/app-05-ui.js', R('js/app-05-ui.js')]]) {
    assert.match(s, /else (im|img)\.src|else upgradeButton/, 'طريق رجوع في ' + f);
  }
});

test('٦. التأجيل على الزرّ في بطاقات الأدوات — الصورة بلا hasToolPhoto بلا ارتفاع فلا تتقاطع', () => {
  const css = R('css/tool-card-images.css');
  // الارتفاع ١١٨px مشروط بالصنف الذي لا يُضاف إلّا بعد تحميل الصورة — لذلك يُراقَب الزرّ
  assert.match(css, /\.btn\.hasToolPhoto img\.stp3d\.toolPhotoImage\{[^}]*height:118px!important/);
  const tc = R('js/tool-card-images.js');
  assert.ok(tc.indexOf('__omranWhenSeen(btn') > 0 && !/__omranWhenSeen\((img|oldImage|preload)/.test(tc),
    'الزرّ لا الصورة — وإلّا لا تظهر بطاقة أبدًا');
});

test('٧. وسوم الكاش رُفعت لكلّ ملفّ يُحمَّل منفصلًا وتغيّر', () => {
  assert.match(html, /\/js\/design-gen\.js\?v=608/);
  assert.match(html, /\/js\/ui-wiring\.js\?v=650/);
  assert.match(R('js/ui-wiring.js'), /\/js\/tool-card-images\.js\?v=15/);
});

/* ————— الغلاف الأصليّ: الجذر الذي لم يُفحص في خمس جولات ————— */
const TWA = 'store/huawei/twa/app/src/main/';
const manifest = R(TWA + 'AndroidManifest.xml');

test('٨. نشاط WebView الذي يرسم التطبيق له سمة معتمة — لا Theme.Translucent الموروثة', () => {
  // السمة الشفّافة ما زالت على <application> (صحيحة لـLauncherActivity وحده)
  assert.match(manifest, /<application[\s\S]*?android:theme="@android:style\/Theme\.Translucent\.NoTitleBar"/);
  // ونشاطا WebView يتجاوزانها
  for (const name of ['com.google.androidbrowserhelper.trusted.WebViewFallbackActivity', '.MahaWebViewFallbackActivity']) {
    const re = new RegExp('<activity android:name="' + name.replace(/\./g, '\\.') + '"[\\s\\S]{0,240}?/>');
    const m = manifest.match(re);
    assert.ok(m, 'النشاط معلَن: ' + name);
    assert.match(m[0], /android:theme="@style\/OmranWebViewTheme"/, 'سمة معتمة: ' + name);
  }
  const styles = R(TWA + 'res/values/styles.xml');
  assert.match(styles, /<style name="OmranWebViewTheme" parent="@android:style\/Theme\.NoTitleBar">/);
  assert.match(styles, /<item name="android:windowIsTranslucent">false<\/item>/);
  assert.match(styles, /<item name="android:windowBackground">@color\/omranWindowBackground<\/item>/);
  assert.match(R(TWA + 'res/values/colors.xml'), /<color name="omranWindowBackground">#000000<\/color>/);
  // الأسود نفسه الذي يعلنه التطبيق للنظام — فلا ومضة بيضاء بين النافذة والصفحة
  assert.equal(JSON.parse(fs.readFileSync('manifest.json', 'utf8')).background_color, '#000000');
  assert.match(html, /<meta name="theme-color" content="#000000">/);
});

test('٩. WebView نفسه يُرسم أسود معتمًا في مسارَي إنشائه (الإقلاع والتعافي من انهيار)', () => {
  const java = R(TWA + 'java/com/omran/aibuilder/twa/MahaWebViewFallbackActivity.java');
  assert.match(java, /private static void paintOpaque\(WebView webView\) \{\s*webView\.setBackgroundColor\(0xFF000000\);/);
  assert.equal((java.match(/paintOpaque\(mWebView\);/g) || []).length, 2, 'المساران معًا — الافتراضيّ أبيض');
  const create = java.indexOf('setContentView(mWebView');
  assert.ok(java.indexOf('paintOpaque(mWebView);') < create, 'قبل عرض النشاط لا بعده');
});

test('١٠. جهاز المالك قابل للطيّ: configChanges يمنع هدم النشاط وإعادة تحميل الصفحة', () => {
  const need = ['orientation', 'screenSize', 'screenLayout', 'smallestScreenSize', 'density', 'keyboardHidden', 'uiMode'];
  const all = manifest.match(/android:configChanges="([^"]+)"/g) || [];
  assert.equal(all.length, 2, 'نشاطا WebView وحدهما');
  for (const decl of all) {
    const flags = decl.match(/"([^"]+)"/)[1].split('|');
    for (const f of need) assert.ok(flags.includes(f), f + ' ناقص في ' + decl);
  }
  // الطيّ/الفتح يغيّر هذين تحديدًا — غيابهما كان يُعيد إنشاء النشاط وWebView معه
  assert.ok(!/android:configChanges="orientation\|screenSize"/.test(manifest), 'القيمة القديمة لم تبقَ في أيّ نشاط');
  const java = R(TWA + 'java/com/omran/aibuilder/twa/MahaWebViewFallbackActivity.java');
  assert.match(java, /public void onConfigurationChanged\(@NonNull Configuration newConfig\)/, 'المستقبِل موجود');
});
