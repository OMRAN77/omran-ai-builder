// tests/gen-scene.test.cjs — v-gen-scene (١١ أكتوبر ٢٠٢٦): أمر المالك بصورة «برج الأزياء»: «في الأزياء تطلّع لي هذي
// عند توليد الصورة، لكن تكون ممطرة، والعدّاد يشتغل [يبدأ من الصفر]، ويكون فوق مش تحت».
// وفي الطريق كُشف عطب قائم: v-clean-ui يحذف بادئة الإيموجي من سطر الحالة قبل أن يقرأه الرصد، فلم تكن بطاقة أيّ لوحة
// (فيديو، أنماط، أزياء) تظهر أصلًا.
// v-gen-scene-exact — تصحيحات المالك بعد النشر، بلقطاته:
//   (١) «العدّاد يكون نفس الفكرة داخل ونفس التصميم» — عدّاد الصورة نفسه في موضعه لا لوحة داكنة من عندنا.
//   (٢) «هذه الصورة تكون نفس مكان رفع الصورة» — المشهد مكان مربّع الرفع.
//   (٣) «أريد الحركة داخل، خلف العدّاد — مكان الأنبوب الخلفيّ» — لا مطر على الصورة كلّها؛ جريان داخل أنبوب البرج.
//   (٤) «الصورة مغبّشة، وشيل التضليل اللي داخل العدّاد — يكون رقم فقط، وهذه الصورة [الذهبيّة] نفس الفكرة: مرّة هذي ومرّة
//       الثانية عند التوليد» — صورتان موضَّحتان، رقم فقط داخل الحلقة، ومشهدان يتبادلان.
// v-gen-steady (بلقطة من الموقع: «الصورة بعد ما تخلص تنزل تحت — أريدها تكون ثابتة نفس المكان، والعدّاد الخارجيّ الصغير اللي
//   مكتوب نرسم تحت فيه وميض قويّ»): النتيجة وأزرارها تُنقل مكان المشهد وتدخل كاملة في الشاشة، وسطر الوقت لا يرمش ولا يتزحزح.
// v-fashion-compare-rtl (المالك: «أصلحه»): شريط «قبل/بعد» منطبق في الواجهة العربيّة ولا يغطّي صفّ التعديل ولا يخطف نقره.
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
function load(withCleaner, storage) {
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
  if (storage) sandbox.localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  vm.createContext(sandbox);
  if (withCleaner) vm.runInContext(read('js/app-36-clean-ui.js'), sandbox);
  vm.runInContext(SRC, sandbox);
  return { w: sandbox.window.omranGenWait, status, clean: sandbox.window.__noEmoji };
}
const W0 = load(false).w;
const NEON = W0._scenes[0], GOLD = W0._scenes[1];

test('١. مشهدان — صورتا المالك موضَّحتان في المستودع، والبطاقات الأخرى ذهبيّة كما هي', () => {
  assert.equal(W0.KINDS.fashion.est, 40, 'التقدير كما كان');
  assert.equal(W0.KINDS.fashion.scenes, W0._scenes);
  assert.equal(W0._scenes.map((s) => s.id).join(','), 'neon,gold'); // سلسلة لا مصفوفة: مصفوفات vm من نطاق آخر (PITFALLS)
  for (const k of ['image', 'video']) assert.equal(W0.KINDS[k].scenes, undefined, k + ': البطاقة الذهبيّة كما هي'); // v-pstyle-scene: الأنماط صار لها مشهد
  assert.equal(NEON.src, '/assets/fashion/gen-scene.webp?v=4');
  assert.equal(GOLD.src, '/assets/fashion/gen-scene-gold.webp?v=2');
  for (const [sc, file] of [[NEON, 'assets/fashion/gen-scene.webp'], [GOLD, 'assets/fashion/gen-scene-gold.webp']]) {
    const buf = fs.readFileSync(path.join(root, file));
    assert.equal(buf.slice(0, 4).toString('latin1'), 'RIFF', file);
    assert.equal(buf.slice(8, 12).toString('latin1'), 'WEBP', file);
    assert.ok(buf.length > 80 * 1024 && buf.length < 700 * 1024, file + ' — حجم معقول للتحميل: ' + buf.length);
    // «الصورة مغبّشة»: العرض المخزَّن أوسع من الأصل (١٠٢٤/١٢٨٠) — VP8 يكتب العرض في رأس الإطار
    const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    assert.ok(i > 0, file + ': رأس VP8');
    const width = buf.readUInt16LE(i + 3) & 0x3fff, height = buf.readUInt16LE(i + 5) & 0x3fff;
    assert.ok(width >= 1500, file + ' — عرض موضَّح: ' + width);
    assert.ok(Math.abs(width / height - sc.w / sc.h) < 0.01, file + ' — النسبة نسبة إحداثيّات المشهد');
  }
});

test('٢. «مرّة هذي ومرّة الثانية عند التوليد»: المشهدان يتبادلان بالدور، والدور يُتذكّر بين الجلسات', () => {
  const a = load(false).w;
  assert.deepEqual([a._nextScene().id, a._nextScene().id, a._nextScene().id, a._nextScene().id], ['neon', 'gold', 'neon', 'gold']);
  const store = new Map([['aiapp_fx_scene', '1']]);
  const b = load(false, store).w;
  assert.equal(b._nextScene().id, 'gold', 'يكمل من حيث توقّف');
  assert.equal(store.get('aiapp_fx_scene'), '0');
  assert.equal(b._nextScene().id, 'neon');
  assert.equal(store.get('aiapp_fx_scene'), '1');
  assert.ok(SRC.includes('var sc = cfg.scenes ? nextScene(cfg) : null;'), 'مشهد لكلّ توليد (بدور نوعه — v-style-scene)');
  assert.match(SRC, /root\.className = 'genw' \+ \(cfg\.wide \? ' genw--video' : ''\) \+ \(sc \? ' genw--scene genw--' \+ sc\.id : ''\);/);
});

test('٣. «رقم فقط» داخل العدّاد، بتصميم الصورة وفي موضعه: لا قرص ولا مجرى ولا لوحة داكنة', () => {
  assert.doesNotMatch(SRC, /genw-hud|genw-ring|genw-hudb|genw-sbar|genw-face|genw-in\b|genw-arc0|genw-rim|genw-rail/, 'لا تعبئة ولا دوائر من عندنا داخل الحلقة');
  for (const sc of [NEON, GOLD]) {
    const h = W0._sceneHtml(sc);
    assert.ok(h.includes('<svg class="genw-live" viewBox="0 0 ' + sc.w + ' ' + sc.h + '" aria-hidden="true">'), sc.id + ': العدّاد بإحداثيّات الصورة');
    const svg = h.slice(h.indexOf('<svg'), h.indexOf('</svg>'));
    // داخل الحلقة: قوس التقدّم (ووهجه) والرقم — لا غير
    assert.equal((svg.match(/<circle /g) || []).length, 2, sc.id + ': دائرتان فقط = القوس ووهجه');
    for (const c of svg.match(/<circle [^>]+>/g)) assert.match(c, /stroke-dasharray="[\d.]+" stroke-dashoffset="[\d.]+"/, sc.id + ': كلّ دائرة قوس تقدّم يبدأ فارغًا');
    assert.match(svg, new RegExp('<text class="genw-num" x="' + sc.ring.cx + '" y="' + String(sc.num.y).replace('.', '\\.') + '" text-anchor="middle" lengthAdjust="spacingAndGlyphs" font-size="' + sc.num.size + '" fill="' + sc.ink + '"[^>]*>0%</text>'), sc.id + ': الرقم يبدأ من ٠');
    assert.match(svg, /<rect class="genw-bar" [^>]*width="0"/, sc.id + ': الشريط يبدأ فارغًا');
    assert.match(svg, /<text class="genw-cap"[^>]*>0% COMPLETE<\/text>/, sc.id + ': النصّ كما في تصميمه');
    // لا لوحات من عندنا: مجرى الشريط ولوحة النصّ من الصورة نفسها، والرقم بلا هالة
    assert.ok(!/<rect class="genw-plate"/.test(svg) && !/ stroke="[^"]+" stroke-width="[^"]+">0%/.test(svg), sc.id + ": رقم فقط");
    assert.equal((svg.match(/<rect /g) || []).length, 1, sc.id + ": المستطيل الوحيد تعبئة الشريط");
    // الجريان ينتهي فوق الشريط فلا يمسّه ولا النصّ
    assert.ok(sc.tube.y + sc.tube.h < sc.bar.y, sc.id + ": الأنبوب فوق الشريط");
  }
  assert.ok(W0._sceneHtml(GOLD).includes('<text class="genw-refl"'), 'الذهبيّ: انعكاس النصّ على الأرضيّة حيّ');
  assert.ok(!W0._sceneHtml(NEON).includes('genw-refl'));
  // التموضع CSS صرف: إطار بنسبة الصورة ومنتصفه منتصفها — بلا قياس ولا متغيّر مقياس
  assert.match(SRC, /\.genw-fx\{position:absolute;top:0;left:50%;height:100%;aspect-ratio:var\(--ar\);transform:translateX\(-50%\);pointer-events:none\}/);
  assert.match(SRC, /root\.style\.setProperty\('--ar', sc\.w \+ '\/' \+ sc\.h\);/);
  assert.doesNotMatch(SRC, /var\(--u|genw--fit|__genwFit/, 'لا مقياس يُقاس بعد اليوم');
  assert.match(SRC, /@media \(max-width:520px\)\{\.genw--scene \.genw-canvas,html\[data-mode="light"\] \.genw--scene \.genw-canvas\{aspect-ratio:5\/4\}\}/, 'الجوّال: البرج وعدّاده أكبر');
  assert.match(SRC, /\.genw--scene \.genw-canvas,html\[data-mode="light"\] \.genw--scene \.genw-canvas\{display:block;aspect-ratio:var\(--ar\);/, 'الوضع الفاتح لا يقلب المشهد');
});

test('٤. العدّاد حيّ: الرقم والقوس والشريط والنصّ من النسبة نفسها، بأرقام لاتينيّة وبعرض حروف كلّ صورة', () => {
  const body = SRC.slice(SRC.indexOf('function paintScene(shown){'), SRC.indexOf('if(pctSmall) pctSmall.textContent = hint;'));
  assert.ok(body.length > 100, 'رسّام المشهد موجود');
  const mk = () => ({ textContent: '', attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const run = (sc) => {
    const ctx = { numEl: mk(), arcEl: mk(), arcGlow: mk(), barEl: mk(), capEl: mk(), reflEl: sc.refl ? mk() : null, sc, sceneArc: Math.round(2 * Math.PI * sc.ring.r * 10) / 10 };
    vm.runInNewContext(body + '\nthis.paint = paintScene;', ctx);
    return ctx;
  };
  const n = run(NEON);
  n.paint(0);
  assert.equal(n.numEl.textContent, '0%'); assert.equal(n.capEl.textContent, '0% COMPLETE');
  assert.equal(n.arcEl.style.strokeDashoffset, '246.9', 'القوس فارغ عند الصفر'); assert.equal(n.barEl.attrs.width, '0');
  n.paint(75);
  assert.equal(n.numEl.textContent, '75%');
  assert.equal(n.numEl.attrs.textLength, '46', 'النيون: «75%» بعرضها في صورته (٤٦)');
  assert.equal(n.capEl.attrs.textLength, '91.3', 'النيون: «75% COMPLETE» بعرضها في صورته');
  assert.equal(n.arcEl.style.strokeDashoffset, '61.73', 'ثلاثة أرباع الحلقة — كما رُسمت في صورته');
  assert.equal(n.arcGlow.style.strokeDashoffset, n.arcEl.style.strokeDashoffset);
  assert.equal(n.barEl.attrs.width, '131.25', 'ثلاثة أرباع الشريط');
  const g = run(GOLD);
  g.paint(75);
  assert.equal(g.numEl.attrs.textLength, '56.7', 'الذهبيّ: «75%» بعرضها في صورته');
  assert.equal(g.capEl.attrs.textLength, '114.5', 'الذهبيّ: «75% COMPLETE» بعرضها في صورته');
  assert.equal(g.reflEl.textContent, '75% COMPLETE', 'الانعكاس يتبع العدّاد');
  assert.equal(g.reflEl.attrs.textLength, '114.5');
  assert.equal(g.barEl.attrs.width, '171.75');
  assert.doesNotMatch(body, /fmt\(|toAr\(/, 'أرقام المشهد لاتينيّة كما في التصميم');
  assert.match(SRC, /if\(sc\) paintScene\(shown\);\n\s+else \{ pctEl\.firstChild\.textContent = fmt\(shown\) \+ '%'; fillEl\.style\.width = shown \+ '%'; \}/, 'البطاقة الذهبيّة كما كانت');
  assert.equal(W0._eased(0), 0, 'يبدأ من الصفر');
  assert.ok(W0._eased(0.1) > 0 && W0._eased(0.1) < W0._eased(0.5) && W0._eased(0.5) < W0._eased(0.9));
});

test('٥. «الحركة داخل، خلف العدّاد — مكان الأنبوب»: جريان داخل عمود الضوء، مثقوب عند الحلقة، وتحت العدّاد', () => {
  assert.doesNotMatch(SRC, /genw-rain|rainTile|genwRain\d/, 'لا أثر لمطر الصورة كلّها');
  for (const sc of [NEON, GOLD]) {
    const h = W0._sceneHtml(sc), t = sc.tube;
    const pc = (v, total) => (Math.round(v / total * 100000) / 1000) + '%';
    assert.ok(h.includes('<div class="genw-tube" style="left:' + pc(t.x, sc.w) + ';top:' + pc(t.y, sc.h) + ';width:' + pc(t.w, sc.w) + ';height:' + pc(t.h, sc.h) + ';mix-blend-mode:' + t.blend + '">'), sc.id + ': الأنبوب فوق عمود الضوء بنِسَب الصورة');
    assert.match(h, /<span><em style="-webkit-mask-image:radial-gradient\(ellipse [\d.]+% [\d.]+% at [\d.]+% [\d.]+%,transparent 0,transparent 96%,#000 100%\);mask-image:[^"]+"><b><\/b><b><\/b><b><\/b><\/em><\/span>/, sc.id + ': ثلاث طبقات، مثقوبة عند الحلقة');
    // الثقب يغطّي قوس التقدّم كلّه ومركزه مركز الحلقة
    assert.ok(sc.ring.hole > sc.ring.r + sc.ring.sw / 2, sc.id + ': الثقب أوسع من القوس');
    assert.ok(h.includes(' at ' + pc(sc.ring.cx - t.x, t.w) + ' ' + pc(sc.ring.cy - t.y, t.h) + ','), sc.id + ': مركز الثقب مركز الحلقة');
    assert.ok(h.indexOf('class="genw-tube"') < h.indexOf('class="genw-live"'), sc.id + ': الأنبوب قبل العدّاد في الترتيب');
    // الحلقة داخل عمود الضوء أصلًا
    assert.ok(sc.ring.cx > t.x && sc.ring.cx < t.x + t.w && sc.ring.cy > t.y && sc.ring.cy < t.y + t.h, sc.id);
  }
  assert.match(SRC, /\.genw-tube\{position:absolute;overflow:hidden;z-index:1;/);
  assert.match(SRC, /\.genw-live\{position:absolute;top:0;left:0;width:100%;height:100%;z-index:3;/, 'العدّاد فوق الجريان');
  // الطبقات ضعف ارتفاع الحاوية وتنزل نصفها بالضبط، والبلاطات نِسَب تقسم النصف بلا باقٍ — فلا قفزة عند كلّ دورة
  assert.match(SRC, /\.genw-tube b\{position:absolute;left:0;right:0;top:-100%;height:200%;background-repeat:repeat\}/);
  assert.match(SRC, /@keyframes genwFlow\{from\{transform:translate3d\(0,0,0\)\}to\{transform:translate3d\(0,50%,0\)\}\}/, 'تحويل وحده');
  const sizes = [...SRC.matchAll(/\.genw-tube b:nth-child\(\d\)\{background-size:[\d.]+% ([\d.]+)%;/g)].map((m) => Number(m[1]));
  assert.equal(sizes.length, 3);
  for (const hh of sizes) assert.ok(Math.abs(50 / hh - Math.round(50 / hh)) < 0.01, 'نصف الطبقة = عدد صحيح من البلاطات (' + hh + '%)');
  assert.match(SRC, /preserveAspectRatio="none"/, 'البلاطة تتمدّد على نِسَب الحاوية');
  assert.match(SRC, /flows\[fi\]\.style\.backgroundImage = flowTile\(FLOW_TILES\[fi\]\[0\], FLOW_TILES\[fi\]\[1\], FLOW_TILES\[fi\]\[2\], sc\.flow\);/, 'لون الجريان من المشهد');
  // التموّجات عند قاعدة أنبوب النيون (بركة ماء)؛ الذهبيّ أرضه رخام فلا تموّجات
  assert.match(W0._sceneHtml(NEON), /<div class="genw-rip" style="[^"]+">(?:<i><\/i>){7}<\/div>/);
  assert.ok(!W0._sceneHtml(GOLD).includes('genw-rip'));
  assert.match(SRC, /prefers-reduced-motion:reduce\)\{\.genw--neon \.genw-frame,\.genw-tube b,\.genw-rip i\{animation:none\}/);
  assert.match(SRC, /html\.omAndroid \.genw-tube\{mix-blend-mode:normal !important\}/, 'أندرويد: بلا دمج ضوئيّ');
  assert.match(SRC, /html\.omAndroid \.genw-tube b:nth-child\(1\)\{display:none\}/, 'أندرويد: طبقتان');
  assert.doesNotMatch(SRC, /backdrop-filter|filter:blur/, 'لا تغبيش (v-android-gpu)');
});

test('٦. «نفس مكان رفع الصورة»: التوليد (🎨) والتعديل الموضعيّ قبل لوح الصورة ومربّع الرفع مخفيّ؛ بقيّة اللوحات تحت سطر الحالة', () => {
  const fashion = W0.PANELS.find((p) => p.id === 'fashion');
  assert.equal(fashion.scope, '#fashionAiModal');
  assert.equal(fashion.topSel, '#fashionAiImagePane');
  assert.ok(fashion.hideSel.split(', ').includes('#fashionAiDropZone'), 'مربّع الرفع يُخفى (والنتيجة السابقة معه — الاختبار ١١)');
  assert.equal(Array.from(fashion.top).join('|'), '🎨|جاري تطبيق|Applying', 'التعديل الموضعيّ يصعد أيضًا — النتيجة صارت هناك');
  const dialog = { id: 'dialog' };
  const pane = { id: 'fashionAiImagePane', parentNode: dialog };
  const next = { id: 'afterStatus' };
  const pel = { parentNode: dialog, nextSibling: next };
  const doc = { querySelector: (sel) => (sel === '#fashionAiImagePane' ? pane : null) };
  const up = W0._mountPoint(fashion, pel, '🎨 جاري تصميم الزي...', doc);
  assert.equal(up.top, true); assert.equal(up.parent, dialog); assert.equal(up.before, pane, 'قبل لوح الصورة نفسه — فيقع مكان مربّع الرفع');
  for (const txt of ['جاري تطبيق التعديل…', 'Applying your edit…']) {
    const upToo = W0._mountPoint(fashion, pel, txt, doc);
    assert.equal(upToo.top, true, txt); assert.equal(upToo.before, pane);
  }
  const other = W0._mountPoint(fashion, pel, '⏳ شيء آخر', doc);
  assert.equal(other.top, false); assert.equal(other.parent, dialog); assert.equal(other.before, next, 'بادئة غير معروفة = تحت سطر الحالة');
  assert.equal(W0._mountPoint(fashion, pel, '🎨 جاري تصميم الزي...', { querySelector: () => null }).top, false, 'مرساة غائبة = الموضع القديم لا خطأ');
  const video = W0.PANELS.find((p) => p.id === 'video');
  assert.equal(W0._mountPoint(video, pel, '🚀 جاري إرسال الطلب', doc).top, false, 'الفيديو والأنماط في موضعهما');
  assert.match(SRC, /if\(mp\.top\) node\.setAttribute\('data-genw-top', '1'\);/);
  assert.match(SRC, /var topCard = scopeEl\.querySelector\('\.genw\[data-genw-panel="' \+ p\.id \+ '"\]\[data-genw-top\]'\);/);
  assert.match(SRC, /if\(topCard && !hideEl\.hasAttribute\('data-genw-hide'\)\) hideEl\.setAttribute\('data-genw-hide', '1'\);\n\s+else if\(!topCard && hideEl\.hasAttribute\('data-genw-hide'\)\) hideEl\.removeAttribute\('data-genw-hide'\);/);
  assert.match(SRC, /\[data-genw-hide\]\{display:none !important\}/);
  assert.match(SRC, /if\(mp\.top\)\{ try\{ node\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\); \}/);
});

test('٧. العطب القائم: المنظِّف يحذف «🎨» من سطر الحالة — اللوحة تبقى «مشغولة» لأنّ الحالة قُرئت قبل التنظيف', () => {
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
  assert.match(SRC, /var busy = p\.busyAttr \? attrBusy\(p, pel\) : panelBusy\(p, ptxt\);/); // v-trend-scene-live: لوحة الترندات بسمتها، والباقي بنصّها كما هنا
});

test('٨. بلا منظِّف (متصفّح قديم): البادئة تبقى في النصّ والمطابقة كما كانت', () => {
  const p = W0.PANELS.find((x) => x.id === 'fashion');
  assert.equal(W0._panelBusy(p, '🎨 جاري تصميم الزي...'), true);
  assert.equal(W0._panelBusy(p, 'جاري تطبيق التعديل…'), true, 'بادئة كلاميّة');
  assert.equal(W0._panelBusy(p, '❌ خطأ: x'), false);
  assert.equal(W0._panelBusy(p, ''), false);
});

test('٩. «فيه وميض قويّ»: سطر الوقت يُبنى مرّة منظَّفًا خارج المحادثة، ولا يتغيّر فيه إلّا خانة الثواني الثابتة العرض — مرّة في الثانية', () => {
  const { clean } = load(true);
  const body = SRC.slice(SRC.indexOf('var inChat = null, lastSec = -1, secEl = null;'), SRC.indexOf("timerEl.textContent = '⏱ ' + fmt(0)"));
  assert.ok(body.includes('function uiText(txt){') && body.includes('function paintTimer(sec){'), 'دالّتا النصّ المعروض وسطر الوقت');
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const run = (inMsg) => {
    const writes = [];   // كلّ كتابة في السطر: [أين، ماذا]
    const mkNode = (kind) => {
      const n = { kind, style: {}, kids: [], _t: '' };
      Object.defineProperty(n, 'textContent', { get: () => n._t + n.kids.map((k) => k.textContent).join(''), set: (v) => { n._t = String(v); n.kids = []; writes.push([kind, String(v)]); } });
      n.appendChild = (k) => { n.kids.push(k); };
      return n;
    };
    const timerEl = mkNode('line');
    const ctx = {
      root: { closest: (sel) => (sel === '.msg' && inMsg ? {} : null) }, stripEmoji: (t) => clean(t), timerEl,
      document: { createElement: (tag) => mkNode(tag), createTextNode: (t) => ({ kind: 'text', textContent: String(t) }) },
      fmt: (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]), isAr: () => true, expect: 'الإطلالات تاخذ ~٤٠ ثانية', SEC_DIGIT_EM: W0._secDigitEm,
    };
    vm.runInNewContext(body + ';this.uiText = uiText; this.paintTimer = paintTimer;', ctx);
    return { uiText: ctx.uiText, paintTimer: ctx.paintTimer, timerEl, writes };
  };
  // في لوحة الأداة: النصّ كما سيتركه المنظِّف — فلا يجد ما يمسحه ولا يتناوب نصّان
  const P = run(false);
  P.paintTimer(7);
  assert.equal(P.timerEl.textContent, clean('⏱ ') + '٧ث — الإطلالات تاخذ ~٤٠ ثانية');
  assert.ok(!P.timerEl.textContent.includes('⏱'));
  assert.equal(clean(P.timerEl.textContent), P.timerEl.textContent, 'المنظِّف لا يغيّر فيه شيئًا');
  const box = P.timerEl.kids[0];
  assert.equal(box.kind, 'b'); assert.equal(P.timerEl.kids.length, 2, 'خانة الثواني ثمّ الوحدة والمتوقَّع');
  assert.equal(box.style.minWidth, (1 * W0._secDigitEm) + 'em');
  const built = P.writes.length;
  for (let i = 0; i < 6; i++) P.paintTimer(7);   // النبضة كلّ ١٥٠ مث: الثانية نفسها = لا كتابة
  assert.equal(P.writes.length, built, 'لا كتابة ما دامت الثانية نفسها (كانت ~١٣ تبديلًا في الثانية مع المنظِّف)');
  P.paintTimer(8); P.paintTimer(17);
  assert.equal(P.writes.slice(built).map((w) => w.join(':')).join(','), 'b:٨,b:١٧', 'الثانية الجديدة تكتب في الخانة وحدها — السطر لا يُعاد بناؤه');
  assert.equal(box.style.minWidth, (2 * W0._secDigitEm) + 'em', 'عرض الخانة بعدد خاناتها');
  assert.equal(P.timerEl.textContent, clean('⏱ ') + '١٧ث — الإطلالات تاخذ ~٤٠ ثانية');
  assert.ok(W0._secDigitEm >= 0.6 && W0._secDigitEm <= 0.7, 'أعرض رقم مقيس ٠٫٦em — الخانة تسعه بلا فراغ ظاهر');
  assert.ok(SRC.includes('.genw-timer b{display:inline-block;text-align:end;font-weight:inherit}'), 'الخانة كتلة سطريّة والرقم ملاصق للوحدة');
  // داخل المحادثة (.msg) المنظِّف لا يمسّها — تبقى ببادئتها
  const C = run(true);
  C.paintTimer(3);
  assert.equal(C.timerEl.textContent, '⏱ ٣ث — الإطلالات تاخذ ~٤٠ ثانية');
  assert.equal(P.uiText('اللمسات الأخيرة ✨'), clean('اللمسات الأخيرة ✨'), 'والمرحلة تُكتب منظَّفة كذلك');
  assert.equal(C.uiText('اللمسات الأخيرة ✨'), 'اللمسات الأخيرة ✨');
  assert.ok(SRC.includes('      paintTimer(Math.floor(el));'), 'النبضة تستدعي paintTimer بالثانية الصحيحة');
  assert.equal(SRC.split('timerEl.textContent = ').length - 1, 2, 'كتابتان للسطر كلّه فقط: نصّ البناء، ثمّ بادئة paintTimer مرّة');
  assert.ok(SRC.includes('stageEl.textContent = uiText(slowTxt);'));
  assert.ok(SRC.includes('stageEl.textContent = uiText(stages[stageIdx]);'));
});

test('١٠. «الصورة بعد ما تخلص تنزل تحت — أريدها ثابتة نفس المكان»: النتيجة وأزرارها قبل لوح الصورة، بعرض المشهد، وتدخل كاملة في الشاشة', () => {
  const st = read('js/app-12-studios.js');
  const a = st.indexOf("const FX_RESULT_STYLE = { maxWidth: '760px', marginInline: 'auto' };");
  const b = st.indexOf("const favoritesBtn = $('#fashionAiFavoritesBtn');", a);
  assert.ok(a > 0 && b > a, 'كتلة النقل موجودة بعد مراجع النتيجة');
  const block = st.slice(a, b);
  const mk = (id) => ({ id, style: {} });
  const run = (opts) => {
    const order = [];
    const pane = mk('fashionAiImagePane');
    pane.parentNode = { insertBefore: (n, ref) => { assert.equal(ref, pane, 'قبل لوح الصورة'); order.push(n.id); } };
    const nodes = { resultWrap: mk('fashionAiResultWrap'), downloadEl: mk('fashionAiDownloadLink'), favSaveBtn: mk('fashionAiFavoriteSaveBtn'), fxTry: mk('fxTry') };
    const listeners = {}; const winListeners = {}; const observed = [];
    const scrolls = [];
    const resultEl = { naturalWidth: 0, naturalHeight: 0, addEventListener: (ev, fn) => { listeners[ev] = fn; }, scrollIntoView: (o) => { scrolls.push(o.block); } };
    const beforeImg = { style: {} };
    const win = { innerHeight: opts.vh || 900, addEventListener: (ev, fn) => { winListeners[ev] = fn; } };
    function RO(cb) { this.cb = cb; }
    RO.prototype.observe = function (el) { observed.push({ el, cb: this.cb }); };
    const ctx = {
      $: (sel) => (sel === '#fashionAiImagePane' ? pane : null),
      document: { getElementById: (id) => (id === 'fxTry' && opts.fxTry !== false ? nodes.fxTry : null) },
      resultWrap: nodes.resultWrap, downloadEl: nodes.downloadEl, favSaveBtn: nodes.favSaveBtn, resultEl, beforeImg, beforeWrap: { style: {} },
      window: win, ResizeObserver: opts.noRO ? undefined : RO, __swallow: (e) => { throw e; }, Object, Math,
    };
    vm.runInNewContext(block + ';this.setPending = () => { fxRevealPending = true; }; this.reveal = fxRevealResult;', ctx);
    return { order, nodes, listeners, winListeners, observed, resultEl, beforeImg, win, scrolls, setPending: ctx.setPending, reveal: ctx.reveal };
  };
  // النقل: العقد نفسها قبل لوح الصورة بترتيبها، وبعرض المشهد موسَّطة
  const R = run({});
  assert.equal(R.order.join(','), 'fashionAiResultWrap,fxTry,fashionAiDownloadLink,fashionAiFavoriteSaveBtn', 'الترتيب كما كان: النتيجة، «جرّب»، التحميل، المفضّلة');
  for (const n of Object.values(R.nodes)) { assert.equal(n.style.maxWidth, '760px', n.id + ': بعرض المشهد'); assert.equal(n.style.marginInline, 'auto', n.id + ': موسَّط مثله'); }
  assert.equal(run({ fxTry: false }).order.join(','), 'fashionAiResultWrap,fashionAiDownloadLink,fashionAiFavoriteSaveBtn', 'بلا صفّ «جرّب» بعد');
  assert.ok(read('js/app-12-fx-simple.js').includes("tr.style.cssText = 'display:none;flex-wrap:wrap;gap:6px;margin-top:10px;max-width:760px;margin-inline:auto;';"), 'وصفّ «جرّب» يُنشأ بالعرض نفسه');
  // المقاس: الطوليّة ٧٦٨×١٠٢٤ بعرض ٧٦٠ = ١٠١٣ ارتفاعًا (أطول من شاشة ٩٠٠) — يُحدّ العرض فيدخل الارتفاع في ٧٠٪ من الشاشة
  assert.equal(typeof R.listeners.load, 'function', 'يُعاد الضبط عند تحميل كلّ نتيجة');
  assert.equal(R.winListeners.resize, R.listeners.load, 'وعند تغيّر مقاس النافذة');
  R.listeners.load();
  assert.equal(R.nodes.resultWrap.style.maxWidth, '760px', 'بلا أبعاد بعد = لا تغيير');
  R.resultEl.naturalWidth = 768; R.resultEl.naturalHeight = 1024;
  R.listeners.load();
  assert.equal(R.nodes.resultWrap.style.maxWidth, '473px', '٩٠٠×٠٫٧=٦٣٠ ارتفاعًا ← ٤٧٣ عرضًا');
  assert.ok(473 * 1024 / 768 <= 900 * 0.7 + 1, 'فالارتفاع ضمن الحدّ');
  R.resultEl.naturalWidth = 1600; R.resultEl.naturalHeight = 900;
  R.listeners.load();
  assert.equal(R.nodes.resultWrap.style.maxWidth, '760px', 'العرضيّة لا تتجاوز عرض المشهد');
  R.resultEl.naturalWidth = 768; R.resultEl.naturalHeight = 1024; R.win.innerHeight = 700;
  R.winListeners.resize();
  assert.equal(R.nodes.resultWrap.style.maxWidth, '368px', 'نافذة أقصر ← نتيجة أصغر');
  const M = run({ vh: 800 });
  M.resultEl.naturalWidth = 768; M.resultEl.naturalHeight = 1024; M.listeners.load();
  assert.equal(M.nodes.resultWrap.style.maxWidth, '420px', 'الجوّال (٨٠٠): الحدّ ٤٢٠ أوسع من الشاشة — فالصورة بعرضها الكامل كما كانت');
  // صورة «قبل» تتبع عرض الحاوية (كان يُقاس مرّة، والحاوية الآن مخفيّة لحظة العرض ويتغيّر عرضها)
  assert.equal(R.observed.length, 1); assert.equal(R.observed[0].el, R.nodes.resultWrap);
  R.nodes.resultWrap.clientWidth = 0; R.observed[0].cb();
  assert.equal(R.beforeImg.style.width, undefined, 'حاوية مخفيّة (صفر) لا تُكتب');
  R.nodes.resultWrap.clientWidth = 473; R.observed[0].cb();
  assert.equal(R.beforeImg.style.width, '473px');
  assert.equal(run({ noRO: true }).observed.length, 0, 'متصفّح بلا ResizeObserver: لا خطأ');
  // لا قفزة: التمرير للنتيجة «nearest» — لا يتحرّك شيء ما دامت ظاهرة (كان center)
  R.reveal();
  assert.equal(R.scrolls.join(','), 'nearest');
  // والنتيجة مخفيّة لحظة عرضها (المشهد ما زال مكانها): التمرير يُعاد مرّة واحدة حين تظهر فعلًا — لمن نزّل الصفحة أثناء الانتظار
  R.nodes.resultWrap.clientWidth = 473; R.observed[0].cb();
  assert.equal(R.scrolls.length, 1, 'بلا نتيجة جديدة: تغيّر المقاس لا يمرّر');
  R.setPending();
  R.nodes.resultWrap.clientWidth = 0; R.observed[0].cb();
  assert.equal(R.scrolls.length, 1, 'ما زالت مخفيّة — ينتظر');
  R.nodes.resultWrap.clientWidth = 473; R.observed[0].cb(); R.observed[0].cb();
  assert.equal(R.scrolls.length, 2, 'ظهرت ← تمرير واحد لا أكثر');
  const iPend = st.indexOf('      fxRevealPending = true;'), iRev = st.indexOf('      fxRevealResult();', iPend), iDl = st.indexOf('      downloadEl.href = dataUrl;', iPend);
  assert.ok(iPend > 0 && iRev > iPend && iDl > iRev && iDl - iPend < 120, 'مسار النجاح يطلبه قبل إظهار زرّ التحميل');
  assert.ok(!st.includes("resultEl.scrollIntoView({ behavior:'smooth', block:'center' })"));
  // اختيار إطلالة من المقارنة يضعها في النتيجة — وقد صعدت، فيصعد إليها (وإلّا لا أثر ظاهر ولا زرّ تحميل عند المستخدم)
  const pick = st.slice(st.indexOf('cell.onclick = () => {'), st.indexOf("cell.innerHTML = '<p style=\"font-size:11.5px; color:#f87171;\">"));
  assert.ok(pick.includes("resultEl.src = r.dataUrl;") && pick.includes('fxRevealResult();'));
  // المشهد يُركَّب قبل لوح الصورة أيضًا — فالنتيجة تحلّ في مكانه نفسه
  assert.equal(W0.PANELS.find((p) => p.id === 'fashion').topSel, '#fashionAiImagePane');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("const FX_RESULT_STYLE = { maxWidth: '760px', marginInline: 'auto' };") && bundle.includes('function fxFitResult(){') && bundle.includes('function fxRevealResult(){') && bundle.includes('function uiText(txt){') && bundle.includes('function paintTimer(sec){') && bundle.includes('function applyHide(p, scopeEl){'), 'الحزمة تحمل الإصلاحات');
});

test('١١. التعديل الموضعيّ: المشهد يحلّ مكان النتيجة السابقة — تُخفى هي وأزرارها ومربّع الرفع ما دام، والإخفاء قبل التمرير', () => {
  const fashion = W0.PANELS.find((p) => p.id === 'fashion');
  assert.equal(fashion.hideSel, '#fashionAiDropZone, #fashionAiResultWrap, #fxTry, #fashionAiDownloadLink, #fashionAiFavoriteSaveBtn');
  const mkEl = (id) => { const at = {}; return { id, hasAttribute: (k) => k in at, setAttribute: (k, v) => { at[k] = v; }, removeAttribute: (k) => { delete at[k]; }, at }; };
  const els = ['fashionAiDropZone', 'fashionAiResultWrap', 'fxTry', 'fashionAiDownloadLink', 'fashionAiFavoriteSaveBtn'].map(mkEl);
  let topCard = { id: 'card' };
  const asked = [];
  const scope = { querySelectorAll: (sel) => { asked.push(sel); return els; }, querySelector: () => topCard };
  W0._applyHide(fashion, scope);
  assert.equal(asked[0], fashion.hideSel);
  assert.ok(els.every((e) => e.at['data-genw-hide'] === '1'), 'كلّها مخفيّة ما دامت بطاقة «فوق»');
  W0._applyHide(fashion, scope);
  assert.ok(els.every((e) => e.at['data-genw-hide'] === '1'), 'النداء المكرَّر لا يغيّر شيئًا');
  topCard = null;
  W0._applyHide(fashion, scope);
  assert.ok(els.every((e) => !('data-genw-hide' in e.at)), 'رُفعت البطاقة ← تعود كلّها معًا');
  const video = W0.PANELS.find((p) => p.id === 'video');
  assert.doesNotThrow(() => W0._applyHide(video, { querySelectorAll: () => { throw new Error('لا يُسأل'); } }), 'لوحة بلا hideSel لا تُمسّ');
  // الترتيب في scan: تركيب ← إخفاء ← تمرير (وإلّا حُسب موضع البطاقة تحت نتيجة ستختفي)
  const iIns = SRC.indexOf('mp.parent.insertBefore(node, mp.before);');
  const iHide = SRC.indexOf('applyHide(p, scopeEl);', iIns);
  const iScroll = SRC.indexOf("if(mp.top){ try{ node.scrollIntoView({ behavior: 'smooth', block: 'center' }); }", iIns);
  assert.ok(iIns > 0 && iHide > iIns && iScroll > iHide, 'الإخفاء بين التركيب والتمرير');
  assert.equal(SRC.split('applyHide(p, scopeEl);').length - 1, 2, 'عند التركيب، وفي آخر كلّ مسح');
});

test('١٢. «أصلحه»: شريط «قبل/بعد» — «قبل» منطبقة على «بعد» في الواجهة العربيّة، طبقتها على الصورة وحدها، ونقر صفّ التعديل ليس سحبًا', () => {
  const st = read('js/app-12-studios.js');
  // (أ) الطبقة LTR دائمًا وارتفاعها ارتفاع الصورة — تُشغَّل كتلة النقل نفسها على عقد وهميّة
  const a = st.indexOf("const FX_RESULT_STYLE = { maxWidth: '760px', marginInline: 'auto' };");
  const b = st.indexOf("const favoritesBtn = $('#fashionAiFavoritesBtn');", a);
  const observed = [];
  function RO(cb) { this.cb = cb; }
  RO.prototype.observe = function (el) { observed.push({ el, cb: this.cb }); };
  const resultWrap = { id: 'fashionAiResultWrap', style: {}, clientWidth: 0 };
  const resultEl = { naturalWidth: 0, naturalHeight: 0, clientHeight: 0, addEventListener: () => {}, scrollIntoView: () => {} };
  const beforeWrap = { style: { height: '100%' } };
  const beforeImg = { style: {} };
  vm.runInNewContext(st.slice(a, b), {
    $: () => null, document: { getElementById: () => null }, resultWrap, downloadEl: { style: {} }, favSaveBtn: { style: {} }, resultEl, beforeWrap, beforeImg,
    window: { innerHeight: 900, addEventListener: () => {} }, ResizeObserver: RO, __swallow: (e) => { throw e; }, Object, Math,
  });
  assert.equal(beforeWrap.style.direction, 'ltr', 'الصورة الأعرض من طبقتها تبدأ من يسارها — في RTL كانت تفيض يسارًا فيظهر نصفها الأيمن');
  observed[0].cb();
  assert.equal(beforeWrap.style.height, '100%', 'حاوية مخفيّة: لا شيء يُكتب');
  resultWrap.clientWidth = 473;
  observed[0].cb();
  assert.equal(beforeImg.style.width, '473px'); assert.equal(beforeWrap.style.height, '100%', 'الصورة لم تُحمَّل بعد: الارتفاع كما هو');
  resultEl.clientHeight = 631;
  observed[0].cb();
  assert.equal(beforeWrap.style.height, '631px', 'ارتفاع الطبقة = ارتفاع الصورة (الحاوية ٦٧٩ بصفّ التعديل) — الزرّ لا يُغطّى، و«قبل» في صندوق «بعد» نفسه');
  // (ب) نقر صفّ التعديل لا يسحب الشريط ولا يمنع التركيز؛ والسحب على الصورة كما كان
  const h0 = st.indexOf('let __fashionBaDragging = false;');
  const h1 = st.indexOf('/* ---- 📊 v-fashion-compare-cards', h0);
  assert.ok(h0 > 0 && h1 > h0);
  const on = {}; const clips = []; let prevented = 0;
  const wrap = { style: {}, addEventListener: (ev, fn) => { on[ev] = fn; }, getBoundingClientRect: () => ({ left: 0, width: 400 }), setPointerCapture: () => {} };
  const bw = { style: { display: 'block' } };
  vm.runInNewContext(st.slice(h0, h1), { resultWrap: wrap, beforeWrap: bw, updateSliderClip: (p) => clips.push(p) });
  const ev = (inRow, x) => ({ target: { closest: (sel) => (sel === '#fashionRefineRow' && inRow ? {} : null) }, clientX: x, pointerId: 1, preventDefault: () => { prevented++; } });
  on.pointerdown(ev(true, 100)); on.pointermove(ev(true, 300));
  assert.equal(clips.length, 0, 'نقر الحقل أو الزرّ لا يحرّك الشريط');
  assert.equal(prevented, 0, 'ولا يُمنع افتراضيّه — فيتركّز الحقل وينضغط الزرّ');
  on.pointerdown(ev(false, 100)); on.pointermove(ev(false, 200));
  assert.equal(clips.join(','), '25,50', 'السحب على الصورة كما كان');
  assert.equal(prevented, 1);
  on.pointerup(ev(false, 200)); on.pointermove(ev(false, 300));
  assert.equal(clips.length, 2, 'انتهى السحب برفع الإصبع');
  bw.style.display = 'none';
  on.pointerdown(ev(false, 100));
  assert.equal(clips.length, 2, 'بلا «قبل» لا شريط');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("if(beforeWrap) beforeWrap.style.direction = 'ltr';") && bundle.includes("if(ev.target && ev.target.closest && ev.target.closest('#fashionRefineRow')) return;"), 'الحزمة تحمل الإصلاح');
});

test('١٣. لا اسم مزوّد، والحزمة والتسجيل والقرار', () => {
  assert.doesNotMatch(SRC, /Gemini|GPT|OpenAI|Runway|Claude/i, 'لا اسم مزوّد');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("src: '/assets/fashion/gen-scene.webp?v=4'") && bundle.includes("src: '/assets/fashion/gen-scene-gold.webp?v=2'"), 'الحزمة تحمل المشهدين');
  assert.ok(bundle.includes('function sceneHtml(sc){') && bundle.includes('function nextScene(cfg, peek){'), 'الحزمة تحمل البناء والتبادل');
  assert.ok(bundle.includes('function panelBusy(p, ptxt){'), 'الحزمة تحمل إصلاح القراءة');
  assert.ok(!bundle.includes('genw-hud') && !bundle.includes('genw-face') && !bundle.includes('genw-rain'), 'الحزمة بلا اللوحة الداكنة ولا القرص ولا مطر الصورة كلّها');
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/gen-scene.test.cjs'));
  const dec = read('knowledge/DECISIONS.md'); /* السجلّ يكبر من رأسه — المدخلان موجودان أينما صارا */
  assert.ok(dec.includes('v-gen-scene-exact') && dec.includes('v-gen-steady'));
});
