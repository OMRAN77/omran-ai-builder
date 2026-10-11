// tests/gen-scene.test.cjs — v-gen-scene (١١ أكتوبر ٢٠٢٦): أمر المالك بصورة «برج الأزياء»: «في الأزياء تطلّع لي هذي
// عند توليد الصورة، لكن تكون ممطرة، والعدّاد يشتغل [يبدأ من الصفر]، ويكون فوق مش تحت».
// وفي الطريق كُشف عطب قائم: v-clean-ui يحذف بادئة الإيموجي من سطر الحالة قبل أن يقرأه الرصد، فلم تكن بطاقة أيّ لوحة
// (فيديو، أنماط، أزياء) تظهر أصلًا.
// v-gen-scene-exact (بعد النشر، بلقطة من جوّاله: «الفكرة كلّها خطأ… هذا التصميم الذي أريده بالضبط: العدّاد يكون نفس الفكرة
// داخل ونفس التصميم، وهذه الصورة تكون نفس مكان رفع الصورة»): اللوحة الداكنة أُزيلت — العدّاد عدّاد الصورة نفسه في موضعه،
// والمشهد مكان مربّع الرفع. ثمّ: «أريد الحركة داخل، خلف العدّاد — مكان الأنبوب الخلفيّ» — المطر على الصورة كلّها أُزيل والجريان
// داخل أنبوب البرج. هذا الملفّ يقفل الثلاثة: المشهد وتصميمه وحركته، موضعه، وقراءة «مشغول» التي تصمد للتنظيف.
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
const sceneHtml = SRC.slice(SRC.indexOf("root.innerHTML = cfg.scene ? (''"), SRC.indexOf(") : ''", SRC.indexOf("root.innerHTML = cfg.scene ? (''")));

test('١. المشهد: الأزياء بخلفيّة المالك (v=2)، والصورة في المستودع بمقاسها', () => {
  const { w } = load(false);
  assert.equal(w.KINDS.fashion.scene, '/assets/fashion/gen-scene.webp?v=2');
  assert.equal(w.KINDS.fashion.est, 40, 'التقدير كما كان');
  for (const k of ['image', 'video', 'styles']) assert.equal(w.KINDS[k].scene, undefined, k + ': البطاقة الذهبيّة كما هي');
  const buf = fs.readFileSync(path.join(root, 'assets/fashion/gen-scene.webp'));
  assert.equal(buf.slice(0, 4).toString('latin1'), 'RIFF');
  assert.equal(buf.slice(8, 12).toString('latin1'), 'WEBP');
  assert.ok(buf.length > 40 * 1024 && buf.length < 200 * 1024, 'حجم معقول للتحميل: ' + buf.length);
});

test('٢. «الحركة داخل، خلف العدّاد — مكان الأنبوب»: لا مطر على الصورة كلّها؛ جريان داخل أنبوب البرج وتموّجات عند قاعدته', () => {
  // المطر المائل على المشهد كلّه أُزيل تمامًا
  assert.doesNotMatch(SRC, /genw-rain|rainTile|genwRain\d/, 'لا أثر لمطر الصورة كلّها');
  // حاوية فوق عمود الضوء في الصورة (٣٦٦..٦٥٩ × ٠..٤١٤) بمقياس الصورة، ومنتصفها منتصفها
  assert.match(sceneHtml, /<div class="genw-tube"><span><b><\/b><b><\/b><b><\/b><\/span><\/div>/, 'ثلاث طبقات جريان داخل الأنبوب');
  assert.match(SRC, /\.genw-tube\{position:absolute;left:50%;top:0;width:calc\(var\(--u,0px\) \* 293\);height:calc\(var\(--u,0px\) \* 414\);margin-left:calc\(var\(--u,0px\) \* -146\.5\);/);
  // خلف العدّاد: الأنبوب تحت الإطار الحيّ، ووجه العدّاد وإطاره يُرسمان فوق الجريان
  assert.match(SRC, /\.genw-tube\{[^}]*z-index:1;/);
  assert.match(SRC, /\.genw-live\{[^}]*z-index:3;/);
  assert.ok(sceneHtml.indexOf('class="genw-tube"') < sceneHtml.indexOf('class="genw-live"'), 'الأنبوب قبل العدّاد في الترتيب');
  assert.match(sceneHtml, /<circle class="genw-face" cx="512" cy="297" r="42\.6"><\/circle>/, 'وجه العدّاد يحجب الجريان خلفه');
  assert.match(sceneHtml, /<circle class="genw-rim" cx="512" cy="297" r="45\.2"><\/circle>/, 'الحلقة الورديّة فوق الجريان');
  assert.match(sceneHtml, /<rect class="genw-plate" x="423\.6" y="356\.4" width="176\.6" height="9\.6" rx="4\.8"><\/rect>/);
  assert.match(sceneHtml, /<rect class="genw-plate2" x="463" y="373" width="98" height="19" rx="2"><\/rect>/);
  // الطبقات ضعف ارتفاع الحاوية وتنزل نصفها بالضبط، والبلاطات نِسَب تقسم النصف بلا باقٍ — فلا قفزة عند كلّ دورة
  assert.match(SRC, /\.genw-tube b\{position:absolute;left:0;right:0;top:-100%;height:200%;background-repeat:repeat\}/);
  assert.match(SRC, /@keyframes genwFlow\{from\{transform:translate3d\(0,0,0\)\}to\{transform:translate3d\(0,50%,0\)\}\}/, 'تحويل وحده');
  const sizes = [...SRC.matchAll(/\.genw-tube b:nth-child\(\d\)\{background-image:' \+ flowTile\([^;]+;background-size:[\d.]+% ([\d.]+)%;/g)].map((m) => Number(m[1]));
  assert.equal(sizes.length, 3);
  for (const h of sizes) assert.ok(Math.abs(50 / h - Math.round(50 / h)) < 0.01, 'نصف الطبقة = عدد صحيح من البلاطات (' + h + '%)');
  assert.match(SRC, /viewBox="0 0 ' \+ w \+ ' ' \+ h \+ '" preserveAspectRatio="none"/, 'البلاطة تتمدّد على نِسَب الحاوية');
  // التموّجات على بركة قاعدة الأنبوب، بمقياس الصورة
  assert.match(sceneHtml, /<div class="genw-rip">(?:<i><\/i>){7}<\/div>/);
  assert.match(SRC, /\.genw-rip\{position:absolute;left:50%;top:calc\(var\(--u,0px\) \* 405\);width:calc\(var\(--u,0px\) \* 380\);/);
  assert.match(SRC, /prefers-reduced-motion:reduce\)\{\.genw--scene \.genw-frame,\.genw-tube b,\.genw-rip i\{animation:none\}/);
  assert.match(SRC, /html\.omAndroid \.genw-tube\{mix-blend-mode:normal\}/, 'أندرويد: بلا دمج ضوئيّ');
  assert.match(SRC, /html\.omAndroid \.genw-tube b:nth-child\(1\)\{display:none\}/, 'أندرويد: طبقتان');
  assert.doesNotMatch(SRC, /backdrop-filter|filter:blur/, 'لا تغبيش (v-android-gpu)');
  assert.match(SRC, /\.genw--scene \.genw-canvas,html\[data-mode="light"\] \.genw--scene \.genw-canvas\{display:block;aspect-ratio:1024\/559;/, 'الوضع الفاتح لا يقلب المشهد');
});

test('٣. «نفس التصميم داخل الصورة»: لا لوحة داكنة — عدّاد الصورة نفسه SVG بإحداثيّاتها، يكبر ويصغر معها', () => {
  // اللوحة التي رفضها المالك أُزيلت تمامًا
  assert.doesNotMatch(SRC, /genw-hud|genw-ring|genw-hudb|genw-sbar/, 'لا أثر للوحة العدّاد الداكنة');
  // إطار حيّ واحد بإحداثيّات الصورة: الحلقة مركزها (٥١٢،٢٩٧) وقوس التقدّم يبدأ من الأعلى
  assert.match(sceneHtml, /<svg class="genw-live" viewBox="412 246 200 152" aria-hidden="true">/);
  assert.match(sceneHtml, /<circle class="genw-arc" cx="512" cy="297" r="39\.3" transform="rotate\(-90 512 297\)">/);
  assert.match(sceneHtml, /<text class="genw-num" x="512" y="310\.6" text-anchor="middle" lengthAdjust="spacingAndGlyphs">0%<\/text>/, 'الرقم داخل الحلقة، يبدأ من ٠');
  assert.match(sceneHtml, /<rect class="genw-bar" x="424\.6" y="357\.3" width="0" height="7\.8" rx="3\.9">/, 'تعبئة الشريط تبدأ من صفر');
  assert.match(sceneHtml, /<text class="genw-cap" x="512" y="389\.2" text-anchor="middle" lengthAdjust="spacingAndGlyphs">0% COMPLETE<\/text>/, 'النصّ تحت الشريط كما في تصميمه');
  // الإطار يُوضع بمقياس واحد (--u = ارتفاع المشهد ÷ ٥٥٩) ومنتصفه منتصف الصورة — فيطابقها بأيّ مقاس وبأيّ قصّ جانبيّ
  assert.match(SRC, /\.genw-live\{position:absolute;left:50%;top:calc\(var\(--u,0px\) \* 246\);width:calc\(var\(--u,0px\) \* 200\);height:calc\(var\(--u,0px\) \* 152\);margin-left:calc\(var\(--u,0px\) \* -100\);/);
  assert.match(SRC, /var u = Math\.round\(h \/ SCENE_H \* 10000\) \/ 10000;/);
  assert.match(SRC, /var SCENE_H = 559;/);
  assert.match(SRC, /\.genw-live\{[^}]*opacity:0\}/, 'لا يظهر قبل ضبط المقياس');
  assert.match(SRC, /\.genw--fit \.genw-live\{opacity:1\}/);
  assert.match(SRC, /if\(node\.__genwFit\)\{ try\{ node\.__genwFit\(\); \}/, 'المقياس يُضبط لحظة التركيب قبل أوّل رسم');
  // الجوّال: إطار أطول يكبّر البرج وعدّاده بلا تغيير في التصميم
  assert.match(SRC, /@media \(max-width:520px\)\{\.genw--scene \.genw-canvas,html\[data-mode="light"\] \.genw--scene \.genw-canvas\{aspect-ratio:5\/4\}\}/);
});

test('٤. العدّاد حيّ: الرقم والقوس والشريط والنصّ من النسبة نفسها، بأرقام لاتينيّة وبعرض حروف الأصل', () => {
  const body = SRC.slice(SRC.indexOf('function paintScene(shown){'), SRC.indexOf("if(pctSmall) pctSmall.textContent = hint;"));
  assert.ok(body.length > 100, 'رسّام المشهد موجود');
  // نشغّله على عناصر وهميّة
  const mk = () => ({ textContent: '', attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const ctx = { numEl: mk(), arcEl: mk(), arcGlow: mk(), barEl: mk(), capEl: mk(), ARC_LEN: 246.9, BAR_W: 175 };
  vm.runInNewContext(body + '\nthis.paint = paintScene;', ctx);
  ctx.paint(0);
  assert.equal(ctx.numEl.textContent, '0%'); assert.equal(ctx.capEl.textContent, '0% COMPLETE');
  assert.equal(ctx.arcEl.style.strokeDashoffset, '246.9', 'القوس فارغ عند الصفر'); assert.equal(ctx.barEl.attrs.width, '0');
  ctx.paint(75);
  assert.equal(ctx.numEl.textContent, '75%'); assert.equal(ctx.capEl.textContent, '75% COMPLETE');
  assert.equal(ctx.numEl.attrs.textLength, '46', '«75%» بعرضها في صورة المالك (٤٦ بكسل)');
  assert.equal(ctx.capEl.attrs.textLength, '91.3', '«75% COMPLETE» بعرضها في صورته');
  assert.equal(ctx.arcEl.style.strokeDashoffset, '61.73', 'ثلاثة أرباع الحلقة — كما رُسمت في صورته');
  assert.equal(ctx.arcGlow.style.strokeDashoffset, ctx.arcEl.style.strokeDashoffset);
  assert.equal(ctx.barEl.attrs.width, '131.25', 'ثلاثة أرباع الشريط');
  assert.doesNotMatch(body, /fmt\(|toAr\(/, 'أرقام المشهد لاتينيّة كما في التصميم');
  assert.match(SRC, /if\(cfg\.scene\)\{ fit\(\); paintScene\(shown\); \}\n\s+else \{ pctEl\.firstChild\.textContent = fmt\(shown\) \+ '%'; fillEl\.style\.width = shown \+ '%'; \}/, 'البطاقة الذهبيّة كما كانت');
  const { w } = load(false);
  assert.equal(w._eased(0), 0, 'يبدأ من الصفر');
  assert.ok(w._eased(0.1) > 0 && w._eased(0.1) < w._eased(0.5) && w._eased(0.5) < w._eased(0.9));
});

test('٥. «نفس مكان رفع الصورة»: التوليد (🎨) قبل لوح الصورة ومربّع الرفع مخفيّ؛ التعديل الموضعيّ وبقيّة اللوحات تحت سطر الحالة', () => {
  const { w } = load(false);
  const fashion = w.PANELS.find((p) => p.id === 'fashion');
  assert.equal(fashion.scope, '#fashionAiModal');
  assert.equal(fashion.topSel, '#fashionAiImagePane');
  assert.equal(fashion.hideSel, '#fashionAiDropZone');
  assert.deepEqual(Array.from(fashion.top), ['🎨']);
  const dialog = { id: 'dialog' };
  const pane = { id: 'fashionAiImagePane', parentNode: dialog };
  const next = { id: 'afterStatus' };
  const pel = { parentNode: dialog, nextSibling: next };
  const doc = { querySelector: (sel) => (sel === '#fashionAiImagePane' ? pane : null) };
  const up = w._mountPoint(fashion, pel, '🎨 جاري تصميم الزي...', doc);
  assert.equal(up.top, true); assert.equal(up.parent, dialog); assert.equal(up.before, pane, 'قبل لوح الصورة نفسه — فيقع مكان مربّع الرفع');
  for (const txt of ['جاري تطبيق التعديل…', 'Applying your edit…']) {
    const down = w._mountPoint(fashion, pel, txt, doc);
    assert.equal(down.top, false, txt); assert.equal(down.parent, dialog); assert.equal(down.before, next);
  }
  const noAnchor = w._mountPoint(fashion, pel, '🎨 جاري تصميم الزي...', { querySelector: () => null });
  assert.equal(noAnchor.top, false, 'مرساة غائبة = الموضع القديم لا خطأ');
  const video = w.PANELS.find((p) => p.id === 'video');
  assert.equal(w._mountPoint(video, pel, '🚀 جاري إرسال الطلب', doc).top, false, 'الفيديو والأنماط في موضعهما');
  // المربّع يُخفى ما دامت بطاقة «فوق» موجودة ويعود فور رفعها — وله display سطريّ فلا بدّ من !important
  assert.match(SRC, /if\(mp\.top\) node\.setAttribute\('data-genw-top', '1'\);/);
  assert.match(SRC, /var topCard = scopeEl\.querySelector\('\.genw\[data-genw-panel="' \+ p\.id \+ '"\]\[data-genw-top\]'\);/);
  assert.match(SRC, /if\(topCard && !hideEl\.hasAttribute\('data-genw-hide'\)\) hideEl\.setAttribute\('data-genw-hide', '1'\);\n\s+else if\(!topCard && hideEl\.hasAttribute\('data-genw-hide'\)\) hideEl\.removeAttribute\('data-genw-hide'\);/);
  assert.match(SRC, /\[data-genw-hide\]\{display:none !important\}/);
  assert.match(SRC, /if\(mp\.top\)\{ try\{ node\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\); \}/);
});

test('٦. العطب القائم: المنظِّف يحذف «🎨» من سطر الحالة — اللوحة تبقى «مشغولة» لأنّ الحالة قُرئت قبل التنظيف', () => {
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
  assert.match(SRC, /new MutationObserver\(function\(\)\{ sample\(\); schedule\(\); \}\)/);
  assert.match(SRC, /var busy = panelBusy\(p, ptxt\);/);
});

test('٧. بلا منظِّف (متصفّح قديم): البادئة تبقى في النصّ والمطابقة كما كانت', () => {
  const { w } = load(false);
  const p = w.PANELS.find((x) => x.id === 'fashion');
  assert.equal(w._panelBusy(p, '🎨 جاري تصميم الزي...'), true);
  assert.equal(w._panelBusy(p, 'جاري تطبيق التعديل…'), true, 'بادئة كلاميّة');
  assert.equal(w._panelBusy(p, '❌ خطأ: x'), false);
  assert.equal(w._panelBusy(p, ''), false);
});

test('٨. لا اسم مزوّد، والحزمة والتسجيل والقرار', () => {
  assert.doesNotMatch(SRC, /Gemini|GPT|OpenAI|Runway|Claude/i, 'لا اسم مزوّد');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("scene: '/assets/fashion/gen-scene.webp?v=2'"), 'الحزمة تحمل المشهد الجديد');
  assert.ok(bundle.includes('<svg class="genw-live" viewBox="412 246 200 152"'), 'الحزمة تحمل عدّاد الصورة');
  assert.ok(bundle.includes('function panelBusy(p, ptxt){'), 'الحزمة تحمل إصلاح القراءة');
  assert.ok(!bundle.includes('genw-hud'), 'الحزمة بلا اللوحة الداكنة');
  assert.ok(bundle.includes('class="genw-tube"') && !bundle.includes('genw-rain'), 'الحزمة: الجريان داخل الأنبوب وبلا مطر الصورة كلّها');
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/gen-scene.test.cjs'));
  assert.ok(read('knowledge/DECISIONS.md').slice(0, 6000).includes('v-gen-scene-exact'));
});
