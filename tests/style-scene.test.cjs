// tests/style-scene.test.cjs — v-style-scene (١١ أكتوبر ٢٠٢٦): المالك بخمس صور «برج الستايل»:
// «ستايل الذكاء الاصطناعي — نفس فكرة الأزياء سوّها في ستايل. افهم أوّل شي، وبعد ما تخلص أريد ترتّب قبل وبعد».
// «نفس فكرة الأزياء» = ما ثبّته في v-gen-scene-exact وv-gen-steady: عدّاد الصورة نفسه حيّ في موضعه، الحركة داخل الأنبوب خلف
// العدّاد، الصور موضَّحة، المشهد مكان خانة الصورة، المشاهد تتبادل، والنتيجة تحلّ في المكان نفسه وتدخل كاملة في الشاشة.
// «ترتّب قبل وبعد» = شريط «قبل/بعد» في الستايل: منطبق في الواجهة العربيّة وغير مشوَّه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-34-gen-wait.js');
const ST = read('js/app-13-stocks-init.js');

function load(storage) {
  const sandbox = {
    window: {},
    document: { readyState: 'complete', body: null, documentElement: {}, querySelectorAll: () => [], getElementById: () => null, querySelector: () => null },
    MutationObserver: function () { return { observe() {} }; },
    setTimeout: () => 0,
  };
  if (storage) sandbox.localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox.window.omranGenWait;
}
const W = load();
const SCENES = Array.from(W._styleScenes);
const byId = (id) => SCENES.find((s) => s.id === id);
const pc = (v, total) => (Math.round(v / total * 100000) / 1000) + '%';

test('١. خمسة مشاهد — صور المالك موضَّحة في المستودع، بترتيبه', () => {
  assert.equal(SCENES.map((s) => s.id).join(','), 'stSilver,stGold,stWhite,stArab,stNeon');
  assert.equal(W.KINDS.studio.scenes, W._styleScenes);
  for (const sc of SCENES) {
    const m = /^\/assets\/studio\/gen-scene-([a-z]+)\.webp\?v=\d+$/.exec(sc.src);
    assert.ok(m, sc.id + ': المسار ' + sc.src);
    const file = 'assets/studio/gen-scene-' + m[1] + '.webp';
    const buf = fs.readFileSync(path.join(root, file));
    assert.equal(buf.slice(0, 4).toString('latin1'), 'RIFF', file);
    assert.equal(buf.slice(8, 12).toString('latin1'), 'WEBP', file);
    assert.ok(buf.length > 80 * 1024 && buf.length < 700 * 1024, file + ' — حجم معقول للتحميل: ' + buf.length);
    const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    assert.ok(i > 0, file + ': رأس VP8');
    const width = buf.readUInt16LE(i + 3) & 0x3fff, height = buf.readUInt16LE(i + 5) & 0x3fff;
    assert.ok(width >= 1500, file + ' — عرض موضَّح («الصورة مغبّشة» في الأزياء): ' + width);
    assert.ok(Math.abs(width / height - sc.w / sc.h) < 0.01, file + ' — النسبة نسبة إحداثيّات المشهد');
  }
  // مشهدا الأزياء كما هما
  assert.equal(Array.from(W._scenes).map((s) => s.id).join(','), 'neon,gold');
  assert.equal(W.KINDS.fashion.scenes, W._scenes);
});

test('٢. بلا نصّ واجهة جديد: مراحل الستايل وتوقّعه من نصوص قائمة (قاعدة ١٤ لغة)', () => {
  const K = W.KINDS;
  for (const l of ['ar', 'en']) {
    const known = [].concat(Array.from(K.image.stages[l]), Array.from(K.styles.stages[l]), Array.from(K.fashion.stages[l]), Array.from(K.video.stages[l]));
    const st = Array.from(K.studio.stages[l]);
    assert.equal(st.length, 4);
    for (const s of st) assert.ok(known.includes(s), l + ': «' + s + '» نصّ قائم');
    assert.equal(K.studio.expect[l], K.image.expect[l]);
    assert.equal(K.studio.slow[l], K.image.slow[l]);
    assert.equal(K.studio.hint[l], K.image.hint[l]);
  }
  assert.ok(!Array.from(K.studio.stages.ar).join(' ').includes('الأنماط'), '«الأنماط» اسم أداة أخرى — لا تظهر في الستايل');
  assert.equal(K.studio.est, 30, 'التقدير يوافق التوقّع المعروض (~٣٠ ثانية)');
});

test('٣. المشاهد الخمسة تتبادل بالدور، بدور مستقلّ عن الأزياء ويُتذكّر بين الجلسات', () => {
  const store = new Map();
  const a = load(store);
  const K = a.KINDS.studio;
  const seq = []; for (let i = 0; i < 7; i++) seq.push(a._nextScene(K).id);
  assert.equal(seq.join(','), 'stSilver,stGold,stWhite,stArab,stNeon,stSilver,stGold');
  assert.equal(store.get('aiapp_st_scene'), '2');
  assert.equal(store.has('aiapp_fx_scene'), false, 'دور الأزياء لم يُمسّ');
  assert.equal(a._nextScene().id, 'neon', 'الأزياء تبدأ من أوّلها بلا وسيط كما كانت');
  assert.equal(store.get('aiapp_fx_scene'), '1');
  assert.equal(a._nextScene(K).id, 'stWhite', 'والستايل يكمل دوره');
  // peek: المشهد القادم بلا تقديم الدور (للتحميل المسبق)
  const b = load(new Map([['aiapp_st_scene', '3']]));
  assert.equal(b._nextScene(b.KINDS.studio, true).id, 'stArab');
  assert.equal(b._nextScene(b.KINDS.studio, true).id, 'stArab', 'النظرة لا تقدّم الدور');
  assert.equal(b._nextScene(b.KINDS.studio).id, 'stArab');
  assert.equal(b._nextScene(b.KINDS.studio).id, 'stNeon');
  assert.ok(SRC.includes("var sc = cfg.scenes ? nextScene(cfg) : null;"), 'مشهد لكلّ توليد بدور نوعه');
  assert.ok(SRC.includes("if(tg && tg.closest && tg.closest('#btnStudioAI, #studioAiGenerateBtn')){ try{ (new Image()).src = nextScene(KINDS.studio, true).src; }"), 'يُحمَّل القادم وحده لا الخمسة');
});

test('٤. عدّاد الصورة نفسه في موضعه: حلقة ورقم وشريط ونصّ — لا لوحة من عندنا', () => {
  for (const sc of SCENES) {
    const h = W._sceneHtml(sc);
    assert.ok(h.includes('<svg class="genw-live" viewBox="0 0 ' + sc.w + ' ' + sc.h + '" aria-hidden="true">'), sc.id + ': بإحداثيّات الصورة');
    const svg = h.slice(h.indexOf('<svg'), h.indexOf('</svg>'));
    assert.equal((svg.match(/<circle /g) || []).length, 2, sc.id + ': دائرتان = القوس ووهجه');
    for (const c of svg.match(/<circle [^>]+>/g)) assert.match(c, /stroke-dasharray="[\d.]+" stroke-dashoffset="[\d.]+"/, sc.id + ': القوس يبدأ فارغًا');
    assert.equal((svg.match(/<rect /g) || []).length, 1, sc.id + ': المستطيل الوحيد تعبئة الشريط');
    assert.match(svg, /<rect class="genw-bar" [^>]*width="0"/, sc.id + ': الشريط يبدأ فارغًا');
    assert.ok(!/genw-plate|genw-hud/.test(svg), sc.id + ': رقم فقط');
    // الشريط بتدرّجه كما رُسم، على طول المجرى كلّه
    assert.ok(sc.bar.grad && sc.bar.grad.length === 2, sc.id + ': تدرّج التعبئة');
    assert.ok(svg.includes('<linearGradient id="genwBarG-' + sc.id + '" gradientUnits="userSpaceOnUse" x1="' + sc.bar.x + '" y1="0" x2="' + (sc.bar.x + sc.bar.w) + '" y2="0">'), sc.id);
    assert.ok(svg.includes('fill="url(#genwBarG-' + sc.id + ')"'), sc.id);
    // الهندسة داخل الصورة ومتناسقة: الرقم داخل الحلقة، الشريط تحتها، النصّ تحته
    assert.ok(sc.num.y > sc.ring.cy && sc.num.y < sc.ring.cy + sc.ring.r, sc.id + ': خطّ قاعدة الرقم داخل الحلقة');
    assert.ok(Math.abs((sc.num.x || sc.ring.cx) - sc.ring.cx) < 2, sc.id + ': الرقم في منتصف الحلقة');
    assert.ok(sc.bar.y > sc.ring.cy + sc.ring.hole && sc.cap.y > sc.bar.y + sc.bar.h, sc.id);
    assert.ok(Math.abs(sc.bar.x + sc.bar.w / 2 - sc.ring.cx) < 1.5, sc.id + ': الشريط متمركز تحت الحلقة');
  }
  // الأربعة الأولى بقياس واحد، والنيون نسخة ٠٫٨ منه
  const s0 = byId('stSilver'), n = byId('stNeon');
  for (const id of ['stGold', 'stWhite', 'stArab']) { const s = byId(id); assert.equal(s.ring.cx + '/' + s.ring.cy + '/' + s.ring.r, s0.ring.cx + '/' + s0.ring.cy + '/' + s0.ring.r, id); assert.equal(s.w + 'x' + s.h, '1280x699'); }
  assert.equal(n.w + 'x' + n.h, '1024x559');
  assert.ok(Math.abs(n.ring.r / s0.ring.r - 0.8) < 0.02 && Math.abs(n.bar.w / s0.bar.w - 0.8) < 0.03, 'النيون بمقياس ٠٫٨');
});

test('٥. المشهد العربيّ بأرقامه العربيّة و«كاملة» كما رُسم؛ والبقيّة لاتينيّة «COMPLETE»', () => {
  const body = SRC.slice(SRC.indexOf('function paintScene(shown){'), SRC.indexOf('if(pctSmall) pctSmall.textContent = hint;'));
  const mk = () => ({ textContent: '', attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const run = (sc) => {
    const ctx = { numEl: mk(), arcEl: mk(), arcGlow: mk(), barEl: mk(), capEl: mk(), reflEl: null, sc, sceneArc: Math.round(2 * Math.PI * sc.ring.r * 10) / 10 };
    vm.runInNewContext(body + '\nthis.paint = paintScene;', ctx);
    return ctx;
  };
  const ar = byId('stArab');
  assert.equal(ar.dig, '٠١٢٣٤٥٦٧٨٩');
  const a = run(ar);
  a.paint(0);
  assert.equal(a.numEl.textContent, '٠%'); assert.equal(a.capEl.textContent, '٠%', 'الكلمة عنصر ثابت بجانبه');
  a.paint(75);
  assert.equal(a.numEl.textContent, '٧٥%');
  assert.equal(a.capEl.textContent, '٧٥%');
  assert.equal(a.numEl.attrs.textLength, String(Math.round((2 * ar.num.dw + ar.num.pw) * 10) / 10));
  assert.equal(a.barEl.attrs.width, String(Math.round(ar.bar.w * 75) / 100));
  const ah = W._sceneHtml(ar);
  assert.match(ah, /<text class="genw-num"[^>]*>٠%<\/text>/, 'يبدأ من الصفر بأرقامه');
  assert.match(ah, /<text class="genw-cap" x="[\d.]+" y="[\d.]+" text-anchor="start"[^>]*>٠%<\/text>/, 'الرقم يمين الكلمة ويبدأ من حافّته');
  assert.match(ah, /<text class="genw-capw" x="[\d.]+" y="[\d.]+" text-anchor="middle" lengthAdjust="spacingAndGlyphs" textLength="[\d.]+" font-size="[\d.]+" fill="[^"]+">كاملة<\/text>/);
  assert.ok(ar.cap.word.x < ar.cap.x, '«كاملة» يسار الرقم — كما في الصورة');
  assert.match(SRC, /\.genw--stArab \.genw-num,\.genw--stArab \.genw-cap,\.genw-capw\{font-family:' \+ AR_HUD_FONT \+ ';font-weight:700\}/, 'خطّ عربيّ لأرقامه وكلمته');
  for (const sc of SCENES.filter((s) => s.id !== 'stArab')) {
    assert.equal(sc.dig, undefined, sc.id);
    const c = run(sc);
    c.paint(75);
    assert.equal(c.numEl.textContent, '75%', sc.id);
    assert.equal(c.capEl.textContent, '75% COMPLETE', sc.id);
    assert.equal(c.capEl.attrs.textLength, String(Math.round((2 * sc.cap.dw + sc.cap.rest) * 10) / 10), sc.id);
    assert.equal(c.arcEl.style.strokeDashoffset, String(Math.round(c.sceneArc * 25) / 100), sc.id + ': ثلاثة أرباع الحلقة');
    const h = W._sceneHtml(sc);
    assert.match(h, /<text class="genw-cap"[^>]*text-anchor="middle"[^>]*>0% COMPLETE<\/text>/, sc.id);
    assert.ok(!h.includes('genw-capw'), sc.id);
  }
  assert.doesNotMatch(body, /fmt\(|toAr\(|isAr\(/, 'أرقام المشهد من تصميمه لا من لغة الواجهة');
});

test('٦. «الحركة داخل، خلف العدّاد»: جريان داخل الأنبوب، مثقوب عند الحلقة، وبلا جريان عند الشريط والنصّ', () => {
  for (const sc of SCENES) {
    const h = W._sceneHtml(sc), t = sc.tube;
    assert.ok(h.includes('<div class="genw-tube" style="left:' + pc(t.x, sc.w) + ';top:' + pc(t.y, sc.h) + ';width:' + pc(t.w, sc.w) + ';height:' + pc(t.h, sc.h) + ';mix-blend-mode:' + t.blend + '">'), sc.id);
    assert.ok(sc.ring.cx > t.x && sc.ring.cx < t.x + t.w && sc.ring.cy > t.y && sc.ring.cy < t.y + t.h, sc.id + ': الحلقة داخل الأنبوب');
    assert.ok(Math.abs(t.x + t.w / 2 - sc.ring.cx) < 6, sc.id + ': الأنبوب متمركز على الحلقة');
    assert.ok(sc.ring.hole > sc.ring.r + sc.ring.sw / 2, sc.id + ': الثقب أوسع من القوس');
    assert.ok(h.includes(' at ' + pc(sc.ring.cx - t.x, t.w) + ' ' + pc(sc.ring.cy - t.y, t.h) + ','), sc.id + ': مركز الثقب مركز الحلقة');
    // الأنبوب هنا يمتدّ تحت الشريط والنصّ — حزام بلا جريان يغطّيهما
    assert.ok(t.gap && t.gap[0] < sc.bar.y && t.gap[1] > sc.cap.y, sc.id + ': الحزام يغطّي الشريط والنصّ');
    assert.ok(t.y + t.h > t.gap[1] + 40, sc.id + ': والجريان يعود تحتهما');
    const g0 = (t.gap[0] - t.y) / t.h * 100, g1 = (t.gap[1] - t.y) / t.h * 100, rd = (v) => (Math.round(v * 100) / 100) + '%';
    const bm = 'linear-gradient(180deg,transparent 0,#000 6%,#000 ' + rd(g0 - 3.5) + ',transparent ' + rd(g0) + ',transparent ' + rd(g1) + ',#000 ' + rd(g1 + 3.5) + ',#000 94%,transparent 100%)';
    assert.ok(h.includes('<span style="-webkit-mask-image:' + bm + ';mask-image:' + bm + '"><em style="-webkit-mask-image:radial-gradient('), sc.id + ': قناع الحزام على طبقة الجريان');
    assert.match(h, /<b><\/b><b><\/b><b><\/b><\/em><\/span>/, sc.id + ': ثلاث طبقات');
    assert.ok(h.indexOf('class="genw-tube"') < h.indexOf('class="genw-live"'), sc.id + ': الجريان تحت العدّاد');
    assert.equal(sc.rip, null, sc.id + ': لا بركة ماء في هذه الصور');
  }
  // الدمج بحسب إضاءة الصورة: المضيئة (ذهبيّ، أبيض) تُظلَّل، والداكنة تُضاء
  assert.equal(SCENES.map((s) => s.tube.blend).join(','), 'screen,multiply,multiply,screen,screen');
  // بلاطات أعرض لأنبوب أضيق، والارتفاعات تقسم النصف بلا باقٍ (لا قفزة عند كلّ دورة)
  const sizes = [...SRC.matchAll(/\.genw\[class\*="genw--st"\] \.genw-tube b:nth-child\(\d\)\{background-size:[\d.]+% ([\d.]+)%\}/g)].map((m) => Number(m[1]));
  assert.equal(sizes.length, 3);
  for (const hh of sizes) assert.ok(Math.abs(50 / hh - Math.round(50 / hh)) < 0.01, 'نصف الطبقة = عدد صحيح من البلاطات (' + hh + '%)');
  // مشهدا الأزياء بلا حزام — هيكلهما كما كان
  for (const sc of Array.from(W._scenes)) assert.ok(W._sceneHtml(sc).includes('<span><em style="-webkit-mask-image:radial-gradient('), sc.id);
  assert.doesNotMatch(SRC, /backdrop-filter|filter:blur/, 'لا تغبيش (v-android-gpu)');
});

test('٧. المشهد مكان خانة «صورتك»: يُركَّب قبل عنوانها، وتُخفى هي وعنوانها والنتيجة السابقة ما دام', () => {
  assert.equal(W.PANELS.length, 6, 'مع لوحتَي الترندات والديكور (v-scene-kinds)');
  const p = W.PANELS.find((x) => x.id === 'studio');
  assert.equal(p.sel, '#studioAiStatus'); assert.equal(p.kind, 'studio'); assert.equal(p.scope, '#studioAiModal');
  assert.equal(Array.from(p.busy).join('|'), '🎨'); assert.equal(Array.from(p.top).join('|'), '🎨');
  assert.equal(p.topSel, '#studioAiModal .stStep[data-i18n="studioStepPhoto"]');
  assert.equal(p.hideSel, '.stStep[data-i18n="studioStepPhoto"], #studioAiSlots, #studioAiResultWrap, #studioMultiResults, #studioAiDownloadLink, #studioAiFavoriteSaveBtn');
  // العنوان والخانة موجودان في القالب بهذه المعرّفات
  const partials = read('js/partials-core.js');
  assert.ok(partials.includes('<div class="stStep" data-i18n="studioStepPhoto">'), 'عنوان «① صورتك»');
  assert.ok(partials.indexOf('<div class="stStep" data-i18n="studioStepPhoto">') < partials.indexOf('<div id="studioAiSlots"'), 'العنوان قبل الخانة');
  const dialog = { id: 'dialog' }, label = { id: 'label', parentNode: dialog }, next = { id: 'afterStatus' };
  const pel = { parentNode: dialog, nextSibling: next };
  const doc = { querySelector: (sel) => (sel === p.topSel ? label : null) };
  const up = W._mountPoint(p, pel, '🎨 جاري التوليد...', doc);
  assert.equal(up.top, true); assert.equal(up.before, label, 'قبل عنوان «① صورتك» — فيقع مكان الخانة');
  const chain = W._mountPoint(p, pel, '🎨 جاري التوليد... — أسود (٢/٣)', doc);
  assert.equal(chain.top, true, 'وتقدّم السلسلة كذلك');
  assert.equal(W._mountPoint(p, pel, '💡 جارٍ التحليل والاقتراح...', doc).top, false, 'الاقتراح ليس توليدًا');
  // الحالة «🎨 …» = مشغول؛ الاقتراح والتمّ والخطأ لا
  const w2 = load();
  const p2 = w2.PANELS.find((x) => x.id === 'studio');
  assert.equal(w2._panelBusy(p2, '🎨 جاري التوليد...'), true);
  assert.equal(w2._panelBusy(p2, '✅ تم!'), false);
  assert.equal(w2._panelBusy(p2, '💡 جارٍ التحليل والاقتراح...'), false);
  // الإخفاء على القائمة كلّها
  const mkEl = (id) => { const at = {}; return { id, hasAttribute: (k) => k in at, setAttribute: (k, v) => { at[k] = v; }, removeAttribute: (k) => { delete at[k]; }, at }; };
  const els = ['label', 'slots', 'result', 'multi', 'download', 'fav'].map(mkEl);
  let topCard = { id: 'card' };
  const scope = { querySelectorAll: (sel) => { assert.equal(sel, p.hideSel); return els; }, querySelector: () => topCard };
  W._applyHide(p, scope);
  assert.ok(els.every((e) => e.at['data-genw-hide'] === '1'));
  topCard = null; W._applyHide(p, scope);
  assert.ok(els.every((e) => !('data-genw-hide' in e.at)), 'رُفع المشهد ← يعود كلّ شيء');
});

/* كتلة استوديو الستايل في app-13: من ثابت النقل إلى مرجع زرّ المفضّلة */
const A = ST.indexOf("const ST_RESULT_STYLE = { maxWidth: '760px', marginInline: 'auto' };");
const B = ST.indexOf("const favoritesBtn = $('#studioAiFavoritesBtn');", A);
function runStudio(opts) {
  opts = opts || {};
  const mk = (id) => ({ id, style: {} });
  const order = [];
  const anchor = mk('stepPhoto');
  anchor.parentNode = { insertBefore: (n, ref) => { assert.equal(ref, anchor, 'قبل عنوان «① صورتك»'); order.push(n.id); } };
  const nodes = { resultWrap: mk('studioAiResultWrap'), downloadEl: mk('studioAiDownloadLink'), favSaveBtn: mk('studioAiFavoriteSaveBtn') };
  nodes.resultWrap.clientWidth = 0;
  const listeners = {}, winListeners = {}, observers = [];
  const resultEl = { naturalWidth: 0, naturalHeight: 0, addEventListener: (ev, fn) => { listeners[ev] = fn; } };
  const beforeWrap = { style: {} }, beforeImg = { style: {} };
  const win = { innerHeight: opts.vh || 900, addEventListener: (ev, fn) => { winListeners[ev] = fn; } };
  function RO(cb) { this.cb = cb; this.live = true; observers.push(this); }
  RO.prototype.observe = function (el) { this.el = el; };
  RO.prototype.disconnect = function () { this.live = false; };
  const ctx = {
    modal: { querySelector: (sel) => (sel === '.stStep[data-i18n="studioStepPhoto"]' ? anchor : null) },
    resultWrap: nodes.resultWrap, downloadEl: nodes.downloadEl, favSaveBtn: nodes.favSaveBtn, resultEl, beforeWrap, beforeImg,
    window: win, ResizeObserver: opts.noRO ? undefined : RO, __swallow: (e) => { throw e; }, Object, Math,
  };
  vm.runInNewContext(ST.slice(A, B) + ';this.stReveal = stReveal;', ctx);
  return { order, nodes, listeners, winListeners, observers, resultEl, beforeWrap, beforeImg, win, stReveal: ctx.stReveal };
}

test('٨. «نفس فكرة الأزياء»: النتيجة وأزرارها تُنقل مكان المشهد، بعرضه، وتدخل كاملة في الشاشة', () => {
  assert.ok(A > 0 && B > A, 'كتلة النقل موجودة بعد مراجع النتيجة');
  const R = runStudio();
  assert.equal(R.order.join(','), 'studioAiResultWrap,studioAiDownloadLink,studioAiFavoriteSaveBtn');
  for (const n of Object.values(R.nodes)) { assert.equal(n.style.maxWidth, '760px', n.id); assert.equal(n.style.marginInline, 'auto', n.id); }
  // شبكة النتائج المتعدّدة تُنشأ بعد حاوية النتيجة فتتبعها إلى الأعلى
  assert.ok(ST.includes('resultWrap.parentNode.insertBefore(multiEl, resultWrap.nextSibling);'));
  // المقاس: الطوليّة ٧٦٨×١٠٢٤ بعرض ٧٦٠ = ١٠١٣ ارتفاعًا (أطول من شاشة ٩٠٠) — يُحدّ العرض فيدخل الارتفاع في ٧٠٪
  assert.equal(R.winListeners.resize, R.listeners.load, 'عند تحميل كلّ نتيجة وعند تغيّر النافذة');
  R.listeners.load();
  assert.equal(R.nodes.resultWrap.style.maxWidth, '760px', 'بلا أبعاد بعد = لا تغيير');
  R.resultEl.naturalWidth = 768; R.resultEl.naturalHeight = 1024; R.listeners.load();
  assert.equal(R.nodes.resultWrap.style.maxWidth, '473px');
  R.resultEl.naturalWidth = 1600; R.resultEl.naturalHeight = 900; R.listeners.load();
  assert.equal(R.nodes.resultWrap.style.maxWidth, '760px', 'العرضيّة لا تتجاوز عرض المشهد');
  const M = runStudio({ vh: 800 });
  M.resultEl.naturalWidth = 768; M.resultEl.naturalHeight = 1024; M.listeners.load();
  assert.equal(M.nodes.resultWrap.style.maxWidth, '420px', 'الجوّال: الحدّ أوسع من الشاشة — الصورة بعرضها الكامل كما كانت');
  // المشهد يُركَّب قبل العنوان نفسه — فالنتيجة تحلّ في مكانه
  assert.ok(W.PANELS.find((x) => x.id === 'studio').topSel.endsWith('.stStep[data-i18n="studioStepPhoto"]'));
});

test('٩. النتيجة مخفيّة لحظة عرضها (المشهد ما زال مكانها): التمرير إليها يُنفَّذ مرّة حين تظهر — nearest فلا قفزة', () => {
  const R = runStudio();
  const scrolls = [];
  const el = { clientWidth: 473, scrollIntoView: (o) => scrolls.push(o.block) };
  R.stReveal(el);
  assert.equal(scrolls.join(','), 'nearest', 'ظاهرة: تمرير فوريّ (لا يتحرّك شيء إن كانت في النظر)');
  const before = R.observers.length;
  const hidden = { clientWidth: 0, scrollIntoView: (o) => scrolls.push(o.block) };
  R.stReveal(hidden);
  assert.equal(scrolls.length, 1, 'مخفيّة: ينتظر');
  const ro = R.observers[R.observers.length - 1];
  assert.equal(R.observers.length, before + 1); assert.equal(ro.el, hidden);
  ro.cb();
  assert.equal(scrolls.length, 1, 'ما زالت مخفيّة');
  hidden.clientWidth = 473; ro.cb();
  assert.equal(scrolls.length, 2); assert.equal(ro.live, false, 'مرّة واحدة ثمّ يتوقّف الرصد');
  assert.doesNotThrow(() => R.stReveal(null));
  const N = runStudio({ noRO: true });
  assert.doesNotThrow(() => N.stReveal({ clientWidth: 0, scrollIntoView: () => { throw new Error('لا'); } }), 'متصفّح بلا ResizeObserver: لا خطأ');
  // مسارات النجاح الثلاثة تطلبه: التوليد العاديّ، السلسلة بنتيجة واحدة، والنتائج المتعدّدة
  assert.equal(ST.split('stReveal(resultWrap); /* v-style-scene */').length - 1, 2);
  assert.ok(ST.includes('stReveal(multiEl); /* v-style-scene'));
});

test('١٠. «ترتّب قبل وبعد»: «قبل» منطبقة على «بعد» في الواجهة العربيّة، غير مشوَّهة، وتتبع مقاس الحاوية', () => {
  const R = runStudio();
  assert.equal(R.beforeWrap.style.direction, 'ltr', 'الصورة الأعرض من طبقتها تبدأ من يسارها — في RTL كانت تفيض يسارًا فيظهر نصفها الأيمن');
  assert.equal(R.beforeImg.style.objectFit, 'contain', 'تُعرض كاملة داخل صندوق النتيجة — لا تُمدَّد');
  assert.equal(R.beforeImg.style.background, '#000');
  const sync = R.observers.find((o) => o.el === R.nodes.resultWrap);
  assert.ok(sync, 'رصد مقاس حاوية النتيجة');
  sync.cb();
  assert.equal(R.beforeImg.style.width, undefined, 'حاوية مخفيّة (صفر) لا تُكتب');
  R.nodes.resultWrap.clientWidth = 473; sync.cb();
  assert.equal(R.beforeImg.style.width, '473px');
  // القالب: طبقة «قبل» مقصوصة من يسار الحاوية والمقبض على حافّتها — والسحب المباشر كما كان
  const partials = read('js/partials-core.js');
  assert.ok(partials.includes('<div id="studioAiBeforeWrap" style="display:none; position:absolute; top:0; left:0; height:100%; overflow:hidden; border-right:2px solid #fff;">'));
  assert.ok(ST.includes("resultWrap.addEventListener('pointerdown', (ev) => {"));
});

test('١١. الحزمة، التسجيل، القرار، ولا اسم مزوّد', () => {
  const bundle = read('js/app.bundle.js');
  for (const k of ['var STYLE_SCENES = [', "KINDS.studio.sceneKey = 'aiapp_st_scene';", "const ST_RESULT_STYLE = { maxWidth: '760px', marginInline: 'auto' };", 'function stFitResult(){', 'function stReveal(el){', "if(beforeWrap) beforeWrap.style.direction = 'ltr';"]) assert.ok(bundle.includes(k), 'الحزمة تحمل: ' + k);
  assert.ok(read('package.json').includes('node tests/style-scene.test.cjs'), 'الاختبار مسجَّل');
  assert.ok(read('knowledge/DECISIONS.md').includes('## ١١ أكتوبر ٢٠٢٦ — v-style-scene:'), 'مدخل القرار في السجلّ');
  const block = SRC.slice(SRC.indexOf('var STYLE_SCENES = ['), SRC.indexOf('KINDS.studio.scenes = STYLE_SCENES;'));
  assert.doesNotMatch(block + ST.slice(A, B), /gemini|claude|openai|gpt|groq|anthropic/i, 'لا اسم مزوّد أو نموذج');
});
