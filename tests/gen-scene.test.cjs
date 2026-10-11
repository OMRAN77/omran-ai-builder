// tests/gen-scene.test.cjs — v-gen-scene (١١ أكتوبر ٢٠٢٦): أمر المالك بصورة «برج الأزياء»: «في الأزياء تطلّع لي هذي
// عند توليد الصورة، لكن تكون ممطرة، والعدّاد يشتغل [يبدأ من الصفر]، ويكون فوق مش تحت».
// وفي الطريق كُشف عطب قائم: v-clean-ui يحذف بادئة الإيموجي من سطر الحالة قبل أن يقرأه الرصد، فلم تكن بطاقة أيّ لوحة
// (فيديو، أنماط، أزياء) تظهر أصلًا. هذا الملفّ يقفل الاثنين: المشهد وموضعه، وقراءة «مشغول» التي تصمد للتنظيف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-34-gen-wait.js');

/* يحمّل المنظِّف الحقيقيّ (app-36) ثمّ الرصد (app-34) في سياق واحد بمستند وهميّ — نصوص اللوحات قابلة للتبديل */
function load(withCleaner) {
  const status = { '#videoMakerStatus': { textContent: '' }, '#portraitStyleStatus': { textContent: '' }, '#fashionAiStatus': { textContent: '' } };
  const sandbox = {
    window: {},
    document: {
      readyState: 'complete', body: null, documentElement: {},
      querySelectorAll: () => [], getElementById: () => null,
      querySelector: (sel) => status[sel] || null,
    },
    MutationObserver: function () { return { observe() {} }; },
    setTimeout: () => 0,
  };
  vm.createContext(sandbox);
  if (withCleaner) vm.runInContext(read('js/app-36-clean-ui.js'), sandbox);
  vm.runInContext(SRC, sandbox);
  return { w: sandbox.window.omranGenWait, status, clean: sandbox.window.__noEmoji };
}

test('١. المشهد: الأزياء بخلفيّة المالك، والصورة في المستودع بمقاسها والعدّاد المرسوم فيها مطموس من المصدر', () => {
  const { w } = load(false);
  assert.equal(w.KINDS.fashion.scene, '/assets/fashion/gen-scene.webp?v=1');
  assert.equal(w.KINDS.fashion.est, 40, 'التقدير كما كان');
  for (const k of ['image', 'video', 'styles']) assert.equal(w.KINDS[k].scene, undefined, k + ': البطاقة الذهبيّة كما هي');
  const buf = fs.readFileSync(path.join(root, 'assets/fashion/gen-scene.webp'));
  assert.equal(buf.slice(0, 4).toString('latin1'), 'RIFF');
  assert.equal(buf.slice(8, 12).toString('latin1'), 'WEBP');
  assert.ok(buf.length > 40 * 1024 && buf.length < 200 * 1024, 'حجم معقول للتحميل: ' + buf.length);
});

test('٢. المشهد: مطر متحرّك بالتحويل وحده، تموّجات، عدّاد حيّ (حلقة + رقم + شريط) بالخطّافات نفسها، ويحترم تقليل الحركة', () => {
  assert.match(SRC, /root\.className = 'genw' \+ \(cfg\.wide \? ' genw--video' : ''\) \+ \(cfg\.scene \? ' genw--scene' : ''\);/);
  assert.match(SRC, /<div class="genw-rain"><i><\/i><i><\/i><i><\/i><\/div>/, 'ثلاث طبقات مطر');
  assert.match(SRC, /<div class="genw-rip">(?:<i><\/i>){7}<\/div>/, 'سبع تموّجات على الأرضيّة');
  for (const k of ['genwRain1', 'genwRain2', 'genwRain3']) assert.match(SRC, new RegExp('@keyframes ' + k + '\\{to\\{transform:translate3d\\(0,\\d+px,0\\)\\}\\}'), k + ': تحويل فقط');
  // كلّ طبقة تنزل بارتفاع بلاطتها بالضبط — وإلّا قفز المطر عند كلّ دورة
  for (const [n, h] of [[1, 260], [2, 200], [3, 150]]) {
    assert.match(SRC, new RegExp('nth-child\\(' + n + '\\)\\{background-image:\' \\+ rainTile\\(\\d+, ' + h + ','), 'بلاطة الطبقة ' + n);
    assert.match(SRC, new RegExp('@keyframes genwRain' + n + '\\{to\\{transform:translate3d\\(0,' + h + 'px,0\\)\\}\\}'));
  }
  // العدّاد: الخطّافات التي تحرّكها النبضة موجودة في هيكل المشهد
  const scene = SRC.slice(SRC.indexOf("root.innerHTML = cfg.scene ? (''"), SRC.indexOf(") : ''", SRC.indexOf("root.innerHTML = cfg.scene ? (''")));
  for (const hook of ['class="genw-pct">0%<small></small>', 'class="genw-fill"', 'class="genw-stage"', 'class="genw-timer"', 'class="genw-arc"']) assert.ok(scene.includes(hook), hook);
  assert.match(SRC, /if\(arcEl\) arcEl\.style\.strokeDashoffset = String\(Math\.round\(ARC_LEN \* \(100 - shown\)\) \/ 100\);/, 'الحلقة تمتلئ مع الرقم');
  assert.match(SRC, /prefers-reduced-motion:reduce\)\{\.genw--scene \.genw-frame,\.genw-rain i,\.genw-rip i\{animation:none\}/);
  assert.match(SRC, /html\.omAndroid \.genw-rain i:nth-child\(3\)\{display:none\}/, 'أندرويد: طبقتان');
  assert.doesNotMatch(SRC, /backdrop-filter|filter:blur/, 'لا تغبيش (v-android-gpu)');
  // الوضع الفاتح لا يقلب المشهد الداكن ولا لون الرقم
  assert.match(SRC, /\.genw--scene \.genw-canvas,html\[data-mode="light"\] \.genw--scene \.genw-canvas\{/);
  assert.match(SRC, /\.genw--scene \.genw-pct,html\[data-mode="light"\] \.genw--scene \.genw-pct\{/);
});

test('٣. العدّاد يبدأ من الصفر ويصعد', () => {
  const { w } = load(false);
  assert.equal(w._eased(0), 0);
  assert.ok(w._eased(0.1) > 0 && w._eased(0.1) < w._eased(0.5) && w._eased(0.5) < w._eased(0.9));
  assert.match(SRC, /<div class="genw-pct">0%<small><\/small><\/div><\/div>/, 'الرقم الأوّل في المشهد ٠٪');
});

test('٤. «فوق مش تحت»: التوليد (🎨) قبل صفّ التبويبين أعلى الاستوديو؛ التعديل الموضعيّ وبقيّة اللوحات تحت سطر الحالة', () => {
  const { w } = load(false);
  const fashion = w.PANELS.find((p) => p.id === 'fashion');
  assert.equal(fashion.scope, '#fashionAiModal');
  assert.equal(fashion.topSel, '#fashionAiTabImage');
  assert.deepEqual(Array.from(fashion.top), ['🎨']);
  const dialog = { id: 'dialog' };
  const row = { id: 'tabsRow', parentNode: dialog };
  const tab = { parentNode: row };
  const next = { id: 'afterStatus' };
  const pel = { parentNode: dialog, nextSibling: next };
  const doc = { querySelector: (sel) => (sel === '#fashionAiTabImage' ? tab : null) };
  const up = w._mountPoint(fashion, pel, '🎨 جاري تصميم الزي...', doc);
  assert.equal(up.top, true); assert.equal(up.parent, dialog); assert.equal(up.before, row);
  for (const txt of ['جاري تطبيق التعديل…', 'Applying your edit…']) {
    const down = w._mountPoint(fashion, pel, txt, doc);
    assert.equal(down.top, false, txt); assert.equal(down.parent, dialog); assert.equal(down.before, next);
  }
  const noAnchor = w._mountPoint(fashion, pel, '🎨 جاري تصميم الزي...', { querySelector: () => null });
  assert.equal(noAnchor.top, false, 'مرساة غائبة = الموضع القديم لا خطأ');
  assert.equal(noAnchor.before, next);
  const video = w.PANELS.find((p) => p.id === 'video');
  assert.equal(w._mountPoint(video, pel, '🚀 جاري إرسال الطلب', doc).top, false, 'الفيديو والأنماط في موضعهما');
  // المسح يصعد إلى البطاقة حين تُركَّب فوق، ويبحث عنها في النافذة كلّها
  assert.match(SRC, /var mp = mountPoint\(p, pel, rawBusy\[p\.id\] \|\| ptxt, document\);\n\s+mp\.parent\.insertBefore\(node, mp\.before\);/);
  assert.match(SRC, /if\(mp\.top\)\{ try\{ node\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\); \}/);
  assert.match(SRC, /if\(p\.scope\)\{ try\{ scopeEl = document\.querySelector\(p\.scope\) \|\| pel\.parentNode; \}/);
});

test('٥. العطب القائم: المنظِّف يحذف «🎨» من سطر الحالة — اللوحة تبقى «مشغولة» لأنّ الحالة قُرئت قبل التنظيف', () => {
  const { w, status, clean } = load(true);
  assert.equal(typeof clean, 'function', 'المنظِّف الحقيقيّ محمَّل');
  for (const [id, sel, raw] of [['fashion', '#fashionAiStatus', '🎨 جاري تصميم الزي...'], ['styles', '#portraitStyleStatus', '⏳ جارٍ التحويل…'], ['video', '#videoMakerStatus', '🚀 جاري إرسال الطلب لمحرك الفيديو الذكي...']]) {
    const p = w.PANELS.find((x) => x.id === id);
    const cleaned = clean(raw);
    assert.notEqual(cleaned, raw, id + ': المنظِّف يحذف البادئة فعلًا');
    assert.equal(w._panelBusy(p, cleaned), false, id + ': بلا قراءة سابقة، النصّ المنظَّف وحده ليس «مشغولًا» (هذا هو العطب)');
    status[sel].textContent = raw; w._sample();       // لحظة كتابة الحالة — قبل التنظيف
    status[sel].textContent = cleaned;                // ثمّ ينظّفها v-clean-ui
    assert.equal(w._panelBusy(p, cleaned), true, id + ': تبقى مشغولة بعد حذف الإيموجي');
    assert.equal(w._panelBusy(p, clean('✅ تم!')), false, id + ': «تمّ» ينهي الانشغال');
    assert.equal(w._panelBusy(p, cleaned), false, id + ': ولا تعود مشغولة بنصّ قديم بعد الانتهاء');
  }
  // الراصد يقرأ الحالة فورًا ثمّ يجدول المسح، والمسح يعتمد panelBusy
  assert.match(SRC, /new MutationObserver\(function\(\)\{ sample\(\); schedule\(\); \}\)/);
  assert.match(SRC, /var busy = panelBusy\(p, ptxt\);/);
});

test('٦. بلا منظِّف (متصفّح قديم): البادئة تبقى في النصّ والمطابقة كما كانت', () => {
  const { w } = load(false);
  const p = w.PANELS.find((x) => x.id === 'fashion');
  assert.equal(w._panelBusy(p, '🎨 جاري تصميم الزي...'), true);
  assert.equal(w._panelBusy(p, 'جاري تطبيق التعديل…'), true, 'بادئة كلاميّة');
  assert.equal(w._panelBusy(p, '❌ خطأ: x'), false);
  assert.equal(w._panelBusy(p, ''), false);
});

test('٧. لا نصّ واجهة جديد ولا اسم مزوّد، والحزمة والتسجيل والقرار', () => {
  const added = SRC.slice(SRC.indexOf('function rainTile('), SRC.indexOf("var AR_DIG = "));
  assert.doesNotMatch(added, /[؀-ۿ]{3,}[^*\n]*'/, 'أنماط المشهد بلا نصّ عربيّ معروض');
  assert.doesNotMatch(SRC, /Gemini|GPT|OpenAI|Runway|Claude/i, 'لا اسم مزوّد');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("scene: '/assets/fashion/gen-scene.webp?v=1'"), 'الحزمة تحمل المشهد');
  assert.ok(bundle.includes('function panelBusy(p, ptxt){'), 'الحزمة تحمل إصلاح القراءة');
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/gen-scene.test.cjs'));
  assert.ok(read('knowledge/DECISIONS.md').slice(0, 5000).includes('v-gen-scene'));
});
