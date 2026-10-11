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
  for (const k of ['image', 'video', 'styles']) assert.equal(W0.KINDS[k].scenes, undefined, k + ': البطاقة الذهبيّة كما هي');
  assert.equal(NEON.src, '/assets/fashion/gen-scene.webp?v=3');
  assert.equal(GOLD.src, '/assets/fashion/gen-scene-gold.webp?v=1');
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
  assert.match(SRC, /var sc = cfg\.scenes \? nextScene\(\) : null;/, 'مشهد لكلّ توليد');
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

test('٦. «نفس مكان رفع الصورة»: التوليد (🎨) قبل لوح الصورة ومربّع الرفع مخفيّ؛ التعديل الموضعيّ وبقيّة اللوحات تحت سطر الحالة', () => {
  const fashion = W0.PANELS.find((p) => p.id === 'fashion');
  assert.equal(fashion.scope, '#fashionAiModal');
  assert.equal(fashion.topSel, '#fashionAiImagePane');
  assert.equal(fashion.hideSel, '#fashionAiDropZone');
  assert.deepEqual(Array.from(fashion.top), ['🎨']);
  const dialog = { id: 'dialog' };
  const pane = { id: 'fashionAiImagePane', parentNode: dialog };
  const next = { id: 'afterStatus' };
  const pel = { parentNode: dialog, nextSibling: next };
  const doc = { querySelector: (sel) => (sel === '#fashionAiImagePane' ? pane : null) };
  const up = W0._mountPoint(fashion, pel, '🎨 جاري تصميم الزي...', doc);
  assert.equal(up.top, true); assert.equal(up.parent, dialog); assert.equal(up.before, pane, 'قبل لوح الصورة نفسه — فيقع مكان مربّع الرفع');
  for (const txt of ['جاري تطبيق التعديل…', 'Applying your edit…']) {
    const down = W0._mountPoint(fashion, pel, txt, doc);
    assert.equal(down.top, false, txt); assert.equal(down.parent, dialog); assert.equal(down.before, next);
  }
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
  assert.match(SRC, /var busy = panelBusy\(p, ptxt\);/);
});

test('٨. بلا منظِّف (متصفّح قديم): البادئة تبقى في النصّ والمطابقة كما كانت', () => {
  const p = W0.PANELS.find((x) => x.id === 'fashion');
  assert.equal(W0._panelBusy(p, '🎨 جاري تصميم الزي...'), true);
  assert.equal(W0._panelBusy(p, 'جاري تطبيق التعديل…'), true, 'بادئة كلاميّة');
  assert.equal(W0._panelBusy(p, '❌ خطأ: x'), false);
  assert.equal(W0._panelBusy(p, ''), false);
});

test('٩. لا اسم مزوّد، والحزمة والتسجيل والقرار', () => {
  assert.doesNotMatch(SRC, /Gemini|GPT|OpenAI|Runway|Claude/i, 'لا اسم مزوّد');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("src: '/assets/fashion/gen-scene.webp?v=3'") && bundle.includes("src: '/assets/fashion/gen-scene-gold.webp?v=1'"), 'الحزمة تحمل المشهدين');
  assert.ok(bundle.includes('function sceneHtml(sc){') && bundle.includes('function nextScene(){'), 'الحزمة تحمل البناء والتبادل');
  assert.ok(bundle.includes('function panelBusy(p, ptxt){'), 'الحزمة تحمل إصلاح القراءة');
  assert.ok(!bundle.includes('genw-hud') && !bundle.includes('genw-face') && !bundle.includes('genw-rain'), 'الحزمة بلا اللوحة الداكنة ولا القرص ولا مطر الصورة كلّها');
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/gen-scene.test.cjs'));
  assert.ok(read('knowledge/DECISIONS.md').slice(0, 7000).includes('v-gen-scene-exact'));
});
