'use strict';
/* v-cpu-raster (فيديو المالك ٢٤ سبتمبر ١٧:٤٤، مكبَّرًا بدقّته الأصليّة 1170×1280):
   الصفوف العليا من كلّ نسيج في معالج الرسوم تتلف — صور البطاقات (شريط خطوط أفقيّة ثمّ معتم مكعّب)
   وأطلس الحروف (تختفي م ا ن و ل: «صـع فيدي» بدل «صانع الفيديو»). نفس البطاقات في كلّ إطار وفي
   الوضعين، بـ١١ م.ب صور فقط على جهاز ٨ غ.ب ⇒ عطل تعريف معالج الرسوم، لا الصفحة.
   العلاج: WebView يرسم بالمعالج المركزيّ، ويعود لمعالج الرسوم أثناء الفيديو فقط. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const JAVA = fs.readFileSync('store/huawei/twa/app/src/main/java/com/omran/aibuilder/twa/MahaWebViewFallbackActivity.java', 'utf8');
const HTML = fs.readFileSync('index.html', 'utf8');
const A = HTML.indexOf('/* v-cpu-raster (الجزء الذي في الصفحة)');
const PAGE = HTML.slice(A, HTML.indexOf('})();', A) + 5);

/* الجسر الحقيقيّ من الصفحة، في vm بـdocument مزيّف وفيديوهات مزيّفة */
function boot({ bridge = true } = {}) {
  const calls = [];
  const listeners = {};
  const videos = [];
  const timers = [];
  const ctx = {
    window: bridge ? { OmranRender: { video: (on) => calls.push(on) } } : {},
    document: {
      getElementsByTagName: (t) => (t === 'video' ? videos : []),
      addEventListener: (t, fn, capture) => { (listeners[t] = listeners[t] || []).push({ fn, capture }); },
    },
    setTimeout: (fn) => timers.push(fn),
  };
  vm.createContext(ctx);
  vm.runInContext(PAGE, ctx);
  const fire = (t) => { (listeners[t] || []).forEach((l) => l.fn()); while (timers.length) timers.shift()(); };
  return { calls, listeners, videos, fire };
}

test('١. تشغيل فيديو يعيد معالج الرسوم، وإيقافه يرجع للمعالج المركزيّ', () => {
  const b = boot();
  const v = { paused: true, ended: false };
  b.videos.push(v);
  v.paused = false; b.fire('play');
  assert.deepEqual(b.calls, [true], 'التلفزيون يعمل بالتسريع العتاديّ');
  v.paused = true; b.fire('pause');
  assert.deepEqual(b.calls, [true, false], 'بعد الإيقاف يعود الرسم الآمن');
});

test('٢. لا نداء مكرّر — الحالة نفسها لا تُرسل مرّتين (play ثمّ playing)', () => {
  const b = boot();
  const v = { paused: false, ended: false };
  b.videos.push(v);
  b.fire('play'); b.fire('playing');
  assert.deepEqual(b.calls, [true]);
});

test('٣. فيديوهان: إيقاف أحدهما لا يطفئ التسريع والآخر يعمل', () => {
  const b = boot();
  const v1 = { paused: false, ended: false }, v2 = { paused: false, ended: false };
  b.videos.push(v1, v2);
  b.fire('play');
  v1.paused = true; b.fire('pause');
  assert.deepEqual(b.calls, [true], 'الثاني ما زال يعمل');
  v2.ended = true; b.fire('ended');
  assert.deepEqual(b.calls, [true, false]);
});

test('٤. المستمعون على مرحلة الالتقاط (أحداث الوسائط لا تفقّع)، وخارج التطبيق لا شيء', () => {
  const b = boot();
  for (const t of ['play', 'playing', 'pause', 'ended', 'emptied', 'abort']) {
    assert.ok(b.listeners[t] && b.listeners[t][0].capture === true, 'التقاط: ' + t);
  }
  const n = boot({ bridge: false });
  assert.deepEqual(Object.keys(n.listeners), [], 'متصفّح عاديّ: لا مستمع ولا نداء');
});

test('٥. الغلاف: طبقة برمجيّة لهواوي، والعاديّة أثناء الفيديو، في مسارَي إنشاء WebView', () => {
  assert.match(JAVA, /CPU_RASTER = "HUAWEI"\.equalsIgnoreCase\(Build\.MANUFACTURER\)/);
  assert.match(JAVA, /setLayerType\(mVideoPlaying \? View\.LAYER_TYPE_NONE : View\.LAYER_TYPE_SOFTWARE, null\)/);
  assert.match(JAVA, /addJavascriptInterface\(new RenderBridge\(\), "OmranRender"\)/);
  assert.equal((JAVA.match(/attachRenderBridge\(mWebView\);/g) || []).length, 2, 'الإقلاع والتعافي من انهيار');
  assert.match(JAVA, /@JavascriptInterface\s+public void video\(final boolean playing\)/);
  assert.match(JAVA, /runOnUiThread\(/, 'setLayerType على خيط الواجهة لا خيط الجسر');
  assert.match(JAVA, /@JavascriptInterface\s+public String mode\(\)/);
  // الجسر يُعلَن قبل تحميل الصفحة، فيكون window.OmranRender جاهزًا لسكربت الرأس
  const create = JAVA.indexOf('attachRenderBridge(mWebView);');
  assert.ok(create > 0 && create < JAVA.indexOf('mWebView.loadUrl(mLaunchUrl.toString(), headers)'));
});

test('٦. الجسر في رأس الصفحة، والمسبار يبلّغ وضع الرسم بلا لمس معالج الرسوم', () => {
  assert.ok(A > 0 && A < HTML.indexOf('<link rel="stylesheet"'), 'قبل أوّل ورقة أنماط');
  const sd = fs.readFileSync('js/selfdiag.js', 'utf8');
  assert.match(sd, /'رسم=' \+ \(window\.OmranRender && window\.OmranRender\.mode/);
  assert.doesNotMatch(sd.slice(sd.indexOf('(function memProbe(){')), /getContext\(/, 'المسبار لا يلمس معالج الرسوم');
  assert.ok(fs.existsSync('gpu-test.html') && /UNMASKED_RENDERER_WEBGL/.test(fs.readFileSync('gpu-test.html', 'utf8')), 'اسم المعالج في صفحة الفحص');
  assert.match(HTML, /\/js\/selfdiag\.js\?v=hw-twa-7/);
});
