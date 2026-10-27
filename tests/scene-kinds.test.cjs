// tests/scene-kinds.test.cjs — v-scene-kinds (١١ أكتوبر ٢٠٢٦): المالك بمجلّد صور للفيديو وصورة للديكور:
// «اللي في الملف للفيديوات وزّعه للفيديوات، والثانية للديكور… وكلّهم نفس الأفكار»، ثمّ أثناء العمل: «لا تخلط الديكور مع الفيديوهات».
// «نفس الأفكار» = ما ثبّته في الأزياء والستايل: عدّاد الصورة نفسه حيّ في موضعه، الحركة داخل الأنبوب، الصور موضَّحة، المشهد مكان
// ما يُخفى، والنتيجة تحلّ مكانه. الجديد: الصور ليست قالبًا واحدًا — حلقة ورقم وشريط، أو شريط فقط، أو حلقة على لوحة جانبيّة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-34-gen-wait.js');
const DS = read('js/app-12-studios.js');

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
const VIDEO = Array.from(W._videoScenes), TREND = Array.from(W._trendScenes), DECOR = Array.from(W._decorScenes);
const ALL = VIDEO.concat(TREND, DECOR);
const fileOf = (src) => src.replace(/^\//, '').replace(/\?v=\d+$/, '');
const pc = (v, total) => (Math.round(v / total * 100000) / 1000) + '%';
function webpSize(file) {
  const buf = fs.readFileSync(path.join(root, file));
  assert.equal(buf.slice(0, 4).toString('latin1'), 'RIFF', file);
  assert.equal(buf.slice(8, 12).toString('latin1'), 'WEBP', file);
  const kind = buf.slice(12, 16).toString('latin1');
  if (kind === 'VP8 ') { const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a])); return { w: buf.readUInt16LE(i + 3) & 0x3fff, h: buf.readUInt16LE(i + 5) & 0x3fff, bytes: buf.length, alpha: false }; }
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), bytes: buf.length, alpha: !!(buf[20] & 0x10) };
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff), bytes: buf.length, alpha: true }; }
  throw new Error(file + ': ' + kind);
}

test('١. ثلاث مجموعات لا تختلط: صانع الفيديو ١٤، الترندات ٤، الديكور ٤ — كلّ مجموعة في مجلّدها وبمعرّفاتها', () => {
  assert.equal(VIDEO.length, 14); assert.equal(TREND.length, 4); assert.equal(DECOR.length, 4);
  for (const sc of VIDEO) { assert.match(sc.id, /^vd[A-Z0-9]/, sc.id); assert.ok(sc.src.startsWith('/assets/videos/scenes/'), sc.id + ': ' + sc.src); assert.ok(!/trend-/.test(sc.src), sc.id); }
  for (const sc of TREND) { assert.match(sc.id, /^vt[A-Z]/, sc.id); assert.ok(sc.src.startsWith('/assets/videos/scenes/trend-'), sc.id + ': ' + sc.src); }
  for (const sc of DECOR) { assert.match(sc.id, /^dc[A-Z]/, sc.id); assert.ok(sc.src.startsWith('/assets/decor/scenes/'), sc.id + ': ' + sc.src); }
  const ids = ALL.map((s) => s.id), srcs = ALL.map((s) => s.src);
  assert.equal(new Set(ids).size, ALL.length, 'لا معرّف مكرَّر'); assert.equal(new Set(srcs).size, ALL.length, 'لا صورة مكرَّرة بين المجموعات');
  assert.equal(W.KINDS.vmaker.scenes, W._videoScenes); assert.equal(W.KINDS.vtrend.scenes, W._trendScenes); assert.equal(W.KINDS.decor.scenes, W._decorScenes);
  // مشاهد الأزياء والستايل كما هي
  assert.equal(Array.from(W._scenes).map((s) => s.id).join(','), 'neon,gold');
  assert.equal(Array.from(W._styleScenes).length, 5);
});

test('٢. الصور في المستودع: موضَّحة، بنسبة إحداثيّات مشهدها، وأقواس الحلقات شفّافة', () => {
  let total = 0;
  for (const sc of ALL) {
    const m = webpSize(fileOf(sc.src)); total += m.bytes;
    assert.ok(m.w >= 1300, sc.id + ' — عرض موضَّح: ' + m.w);
    assert.ok(Math.abs(m.w / m.h - sc.w / sc.h) < 0.012, sc.id + ' — النسبة');
    assert.ok(m.bytes > 60 * 1024 && m.bytes < 420 * 1024, sc.id + ' — حجم معقول: ' + m.bytes);
    const rings = [].concat(sc.ring ? [sc.ring] : [], sc.more || []);
    for (const r of rings) {
      const a = webpSize(fileOf(r.img.src)); total += a.bytes;
      assert.ok(a.alpha, sc.id + ': قوس الحلقة شفّاف');
      assert.ok(a.bytes < 40 * 1024, sc.id + ': قوس صغير: ' + a.bytes);
      assert.ok(Math.abs(a.w / a.h - r.img.w / r.img.h) < 0.03, sc.id + ': نسبة القوس');
      // القصّة فوق موضع الحلقة: مركزها مركزها
      assert.ok(Math.abs(r.img.x + r.img.w / 2 - r.cx) < 1.2 && Math.abs(r.img.y + r.img.h / 2 - r.cy) < 1.2, sc.id + ': القوس متمركز على الحلقة');
    }
  }
  assert.ok(total < 5 * 1024 * 1024, 'المجموع ' + Math.round(total / 1024) + ' ك.ب — ويُحمَّل مشهد واحد لكلّ توليد');
});

test('٣. كلّ صورة بعدّادها هي: ما رُسم فيها يُرسم حيًّا — ولا شيء من عندنا', () => {
  const shape = (sc) => (sc.ring ? 'R' : '') + (sc.num ? 'N' : '') + (sc.bar ? 'B' : '') + (sc.more ? '+' + sc.more.length : '') || '-';
  // صانع الفيديو: أربعة بحلقة ورقم وشريط (الرئيسيّتان و«التصميم» و«الشبكة»)، وعشرة بشريط فقط
  assert.equal(VIDEO.map(shape).join(' '), 'RNB RNB B B RNB RNB B B B B B B B B');
  // الترندات: اثنان بحلقة اللوحة الجانبيّة الصغيرة، واثنان بشريط
  assert.equal(TREND.map(shape).join(' '), 'RN RN B B');
  // الديكور: غرفة النوم بلا عدّاد في صورتها، المعيشة بحلقتَي لوحتَيها، المطبخ والمقهى بحلقة
  assert.equal(DECOR.map(shape).join(' '), '- RN+1 RN RN');
  for (const sc of ALL) {
    const h = W._sceneHtml(sc), svg = h.slice(h.indexOf('<svg'), h.indexOf('</svg>'));
    assert.ok(h.includes('<svg class="genw-live" viewBox="0 0 ' + sc.w + ' ' + sc.h + '" aria-hidden="true">'), sc.id);
    assert.equal(sc.cap, undefined, sc.id + ': نصّ الصورة («الفيديو جاهز»…) يبقى منها — لا نصّ حيّ');
    assert.ok(!svg.includes('genw-cap') && !svg.includes('COMPLETE'), sc.id);
    assert.equal((svg.match(/<rect /g) || []).length, sc.bar ? 1 : 0, sc.id + ': مستطيل = تعبئة الشريط فقط');
    assert.equal((svg.match(/<circle /g) || []).length, 0, sc.id + ': لا دوائر مرسومة — القوس من بكسلات الصورة');
    const rings = [].concat(sc.ring ? [sc.ring] : [], sc.more || []);
    assert.equal((h.match(/<i class="genw-arcimg"/g) || []).length, rings.length, sc.id + ': قوس لكلّ حلقة');
    assert.equal((svg.match(/<text class="genw-num"/g) || []).length, sc.num ? 1 : 0, sc.id);
    assert.equal((svg.match(/<text class="genw-xnum"/g) || []).length, (sc.more || []).filter((m) => m.num).length, sc.id);
    assert.ok(!/genw-plate|genw-hud/.test(h), sc.id);
    if (sc.ring) {
      assert.equal(sc.sprite, true, sc.id);
      assert.match(svg, /<text class="genw-num"[^>]*>0%<\/text>/, sc.id + ': يبدأ من الصفر');
      const n = sc.num; assert.ok(Math.abs(n.x - sc.ring.cx) < 5 && n.y > sc.ring.cy && n.y < sc.ring.cy + 20, sc.id + ': الرقم داخل الحلقة');
      const g = sc.ring.img;
      assert.ok(h.includes('<i class="genw-arcimg" style="left:' + pc(g.x, sc.w) + ';top:' + pc(g.y, sc.h) + ';width:' + pc(g.w, sc.w) + ';height:' + pc(g.h, sc.h) + ';background-image:url(' + g.src + ')"></i>'), sc.id + ': القوس بنِسَب الصورة');
    }
    if (sc.bar) {
      assert.ok(sc.bar.grad && sc.bar.grad.length === 2, sc.id + ': تدرّج التعبئة من الصورة');
      assert.match(svg, /<rect class="genw-bar" [^>]*width="0"/, sc.id + ': الشريط يبدأ فارغًا');
      assert.ok(sc.bar.w > 90 && sc.bar.h > 5, sc.id + ': طول المجرى كلّه');
    }
  }
  // خطّ أرقام هذه الصور نحيف غير مضغوط — نمط سطريّ بلا علامة مزدوجة (القيمة داخل style="…")
  const withNum = ALL.find((s) => s.num), hh = W._sceneHtml(withNum);
  assert.match(hh, /<text class="genw-num"[^>]* style="font-family:'Bahnschrift'[^"]*;font-weight:300">0%<\/text>/);
  assert.ok(!/style="[^"]*"[A-Za-z]/.test(hh), 'لا خاصّيّة style مكسورة');
});

test('٤. العدّاد حيّ: القوس يُكشف بقناع مخروطيّ بقدر النسبة، والشريط والرقم منها — والحلقة الثانية تمشي معها', () => {
  const body = SRC.slice(SRC.indexOf('function paintScene(shown){'), SRC.indexOf('if(pctSmall) pctSmall.textContent = hint;'));
  const mk = () => ({ textContent: '', attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const run = (sc) => {
    const rings = [].concat(sc.ring ? [sc.ring] : [], sc.more || []);
    const ctx = { sc, sceneArc: 0, numEl: sc.num ? mk() : null, arcEl: null, arcGlow: null, barEl: sc.bar ? mk() : null, capEl: null, reflEl: null,
      arcImgs: rings.map(mk), xArcs: [], xGlows: [], xNums: (sc.more || []).map((m) => (m.num ? mk() : null)) };
    vm.runInNewContext(body + '\nthis.paint = paintScene;', ctx);
    return ctx;
  };
  const main = VIDEO[0], c = run(main);
  c.paint(0);
  assert.equal(c.numEl.textContent, '0%'); assert.equal(c.barEl.attrs.width, '0');
  assert.equal(c.arcImgs[0].style.maskImage, 'conic-gradient(#000 0%,transparent 0)', 'القوس مخفيّ عند الصفر');
  c.paint(85);
  assert.equal(c.numEl.textContent, '85%');
  assert.equal(c.numEl.attrs.textLength, String(Math.round((2 * main.num.dw + main.num.pw) * 10) / 10), 'بعرض «85%» في صورته');
  assert.equal(c.barEl.attrs.width, String(Math.round(main.bar.w * 85) / 100));
  assert.equal(c.arcImgs[0].style.maskImage, 'conic-gradient(#000 85%,transparent 0)');
  assert.equal(c.arcImgs[0].style.webkitMaskImage, c.arcImgs[0].style.maskImage);
  // شريط فقط
  const bar = VIDEO.find((s) => !s.ring), b = run(bar);
  assert.doesNotThrow(() => b.paint(40)); assert.equal(b.barEl.attrs.width, String(Math.round(bar.bar.w * 40) / 100));
  // بلا عدّاد أصلًا: لا خطأ
  assert.doesNotThrow(() => run(DECOR[0]).paint(50));
  // حلقتان: قوسان ورقمان
  const two = DECOR.find((s) => s.more), t = run(two);
  t.paint(60);
  assert.equal(t.arcImgs.length, 2);
  assert.equal(t.arcImgs[1].style.maskImage, 'conic-gradient(#000 60%,transparent 0)');
  assert.equal(t.numEl.textContent, '60%'); assert.equal(t.xNums[0].textContent, '60%');
  assert.equal(t.xNums[0].attrs.textLength, String(Math.round((2 * two.more[0].num.dw + two.more[0].num.pw) * 10) / 10));
  assert.match(SRC, /\.genw-arcimg\{position:absolute;z-index:2;background:center\/100% 100% no-repeat;-webkit-mask-image:conic-gradient\(#000 0,transparent 0\);mask-image:conic-gradient\(#000 0,transparent 0\)\}/, 'مخفيّ حتى أوّل رسم، فوق الجريان وتحت الأرقام');
  // مشاهد الأزياء والستايل ما زالت بقوسها المرسوم
  for (const sc of Array.from(W._scenes).concat(Array.from(W._styleScenes))) { const h = W._sceneHtml(sc); assert.equal((h.match(/<circle /g) || []).length, 2, sc.id); assert.ok(!h.includes('genw-arcimg'), sc.id); }
});

test('٥. الحركة داخل الأنبوب: مثقوبة عند الحلقة إن كانت داخله، وبحزام بلا جريان عند الشريط والنصّ', () => {
  for (const sc of ALL) {
    const h = W._sceneHtml(sc), t = sc.tube;
    assert.ok(t, sc.id + ': لكلّ مشهد أنبوب');
    assert.ok(h.includes('<div class="genw-tube" style="left:' + pc(t.x, sc.w) + ';top:' + pc(t.y, sc.h) + ';width:' + pc(t.w, sc.w) + ';height:' + pc(t.h, sc.h) + ';mix-blend-mode:' + t.blend + '">'), sc.id);
    assert.ok(Math.abs(t.x + t.w / 2 - sc.w / 2) < sc.w * 0.03, sc.id + ': الأنبوب في منتصف المشهد');
    assert.match(h, /<b><\/b><b><\/b><b><\/b><\/em><\/span>/, sc.id);
    assert.ok(sc.flow && /^#[0-9a-f]{6}$/.test(sc.flow), sc.id + ': لون الجريان');
    const inTube = !!(sc.ring && sc.ring.cx > t.x && sc.ring.cx < t.x + t.w && sc.ring.cy > t.y && sc.ring.cy < t.y + t.h);
    assert.equal(/<em style="-webkit-mask-image:radial-gradient\(/.test(h), inTube, sc.id + ': ثقب الحلقة فقط إن كانت داخل الأنبوب');
    if (inTube) assert.ok(h.includes(' at ' + pc(sc.ring.cx - t.x, t.w) + ' ' + pc(sc.ring.cy - t.y, t.h) + ','), sc.id + ': مركز الثقب مركز الحلقة');
    if (sc.bar) { assert.ok(t.gap && t.gap[0] < sc.bar.y && t.gap[1] > sc.bar.y + sc.bar.h + 12, sc.id + ': الحزام يغطّي الشريط والنصّ تحته'); assert.ok(h.includes('<span style="-webkit-mask-image:linear-gradient(180deg,'), sc.id); }
    assert.ok(h.indexOf('class="genw-tube"') < h.indexOf('class="genw-live"'), sc.id + ': الجريان تحت العدّاد');
  }
  // حلقات لوحات الديكور الجانبيّة خارج الأنبوب
  assert.ok(DECOR.filter((s) => s.ring).some((s) => s.ring.cx < s.tube.x || s.ring.cx > s.tube.x + s.tube.w));
  const sizes = [...SRC.matchAll(/\.genw\[class\*="genw--dc"\] \.genw-tube b:nth-child\(\d\)\{background-size:[\d.]+% ([\d.]+)%\}/g)].map((m) => Number(m[1]));
  assert.equal(sizes.length, 3);
  for (const hh of sizes) assert.ok(Math.abs(50 / hh - Math.round(50 / hh)) < 0.01, 'نصف الطبقة = عدد صحيح من البلاطات (' + hh + '%)');
});

test('٦. بلا نصّ واجهة جديد، ودور مستقلّ لكلّ مجموعة', () => {
  const K = W.KINDS;
  for (const l of ['ar', 'en']) {
    assert.equal(Array.from(K.vmaker.stages[l]).join('|'), Array.from(K.video.stages[l]).join('|'));
    assert.equal(Array.from(K.vtrend.stages[l]).join('|'), Array.from(K.video.stages[l]).join('|'));
    assert.equal(Array.from(K.decor.stages[l]).join('|'), Array.from(K.image.stages[l]).join('|'));
    assert.equal(K.vmaker.expect[l], K.video.expect[l]); assert.equal(K.decor.expect[l], K.image.expect[l]);
  }
  assert.equal(K.vmaker.est, 120); assert.equal(K.vtrend.est, 120); assert.equal(K.decor.est, 30);
  assert.equal([K.fashion.sceneKey, K.studio.sceneKey, K.vmaker.sceneKey, K.vtrend.sceneKey, K.decor.sceneKey].join(','), ',aiapp_st_scene,aiapp_vd_scene,aiapp_vt_scene,aiapp_dc_scene');
  const store = new Map(), a = load(store);
  assert.equal(a._nextScene(a.KINDS.vmaker).id, 'vdMain'); assert.equal(a._nextScene(a.KINDS.vmaker).id, VIDEO[1].id);
  assert.equal(a._nextScene(a.KINDS.vtrend).id, TREND[0].id, 'الترندات تبدأ من أوّلها — لا تتأثّر بدور الصانع');
  assert.equal(a._nextScene(a.KINDS.decor).id, DECOR[0].id);
  assert.equal(store.get('aiapp_vd_scene'), '2'); assert.equal(store.get('aiapp_vt_scene'), '1'); assert.equal(store.get('aiapp_dc_scene'), '1');
  const seq = []; for (let i = 0; i < 4; i++) seq.push(a._nextScene(a.KINDS.decor).id);
  assert.equal(seq.join(','), [DECOR[1].id, DECOR[2].id, DECOR[3].id, DECOR[0].id].join(','), 'الدور يدور داخل مجموعته');
  assert.ok(SRC.includes("tg.closest('#btnVideoMaker, #videoMakerGenerateBtn') ? KINDS.vmaker : (tg.closest('#vtGrid, #vtGo') ? KINDS.vtrend : (tg.closest('#btnDesignAI, #designAiGenerateBtn, #designAiIdeaAI') ? KINDS.decor : null))"), 'يُحمَّل القادم وحده لكلّ مجموعة');
});

test('٧. اللوحات: الصانع مكان شاشة المعاينة، الترندات حيث تظهر نتيجتها، الديكور مكان صندوق الأفكار', () => {
  assert.equal(W.PANELS.length, 6);
  const by = (id) => W.PANELS.find((p) => p.id === id);
  const v = by('video'), tr = by('vtrend'), d = by('decor');
  // الصانع
  assert.equal(v.sel, '#videoMakerStatus'); assert.equal(v.kind, 'vmaker'); assert.equal(v.scope, '#videoMakerModal');
  assert.equal(v.topSel, '#videoMakerModal .vmk-stage'); assert.equal(v.hideSel, '.vmk-stage');
  assert.equal(Array.from(v.top).join(''), Array.from(v.busy).join(''), 'كلّ حالات انشغاله تُركَّب مكان الشاشة');
  assert.ok(read('js/video.js').includes("side.innerHTML='<div class=\"vmk-stage\">"), 'شاشة المعاينة في عمودها');
  const side = { id: 'side' }, stage = { id: 'stage', parentNode: side }, pel = { parentNode: side, nextSibling: { id: 'dl' } };
  const up = W._mountPoint(v, pel, '🎬 جاري إنشاء الفيديو…', { querySelector: (s) => (s === v.topSel ? stage : null) });
  assert.equal(up.top, true); assert.equal(up.before, stage, 'قبل شاشة المعاينة — والشاشة تُخفى ما دام');
  assert.equal(W._mountPoint(v, pel, '🎬 جاري إنشاء الفيديو…', { querySelector: () => null }).top, false, 'بلا شاشة (قبل بناء الاستوديو) = تحت سطر الحالة كما كان');
  assert.match(SRC, /\.vmk-side \.genw--scene\{width:100%;margin:0 0 10px\}/, 'بعرض عمود المعاينة');
  // الترندات
  assert.equal(tr.sel, '#vtStatus'); assert.equal(tr.kind, 'vtrend'); assert.equal(tr.topSel, undefined, 'تحت سطر الحالة — فوق #vtOut');
  assert.equal(tr.scroll, true, 'يُمرَّر إليه: سطر الحالة عند حافّة الشاشة السفلى');
  const vt = read('js/app-11-video-trends.js');
  assert.ok(vt.indexOf("st.id = 'vtStatus'") < vt.indexOf("out.id = 'vtOut'") && vt.includes('panel.appendChild(st); panel.appendChild(out);'), 'النتيجة بعد سطر الحالة مباشرة');
  assert.ok(vt.includes("out.style.cssText = 'margin-top:10px;max-width:760px;margin-inline:auto;';"), 'والنتيجة بعرض المشهد');
  // v-trend-scene-live: «مشغول» سمة تضبطها اللوحة — نصوصها تُكتب بلا إيموجي (ui ← noEmoji) فلم يُرَ الانشغال بالرمز قطّ؛
  // كان هذا الاختبار يمرّ بنصوص كُتبت باليد بـ⏳. التفصيل والمسار كاملًا في trend-scene-live.test.cjs
  assert.equal(tr.busyAttr, 'data-genw-busy'); assert.equal(tr.busyHas, undefined);
  // الديكور
  assert.equal(d.sel, '#designAiStatus'); assert.equal(d.kind, 'decor'); assert.equal(d.scope, '#designAiModal'); assert.equal(d.topSel, '#designAiIdeas');
  assert.equal(d.hideSel, '#designAiIdeas, #designBAWrap, #designAiResult, #designAiGrid, #designAiDownloadLink');
  const w3 = load(), d3 = w3.PANELS.find((p) => p.id === 'decor');
  assert.equal(w3._panelBusy(d3, '🎨 جاري تصميم الغرفة...'), true);
  assert.equal(w3._panelBusy(d3, '🤔 جاري التفكير بأفكار...'), false, 'الاقتراح ليس توليدًا');
  assert.equal(w3._panelBusy(d3, '✅ تم التصميم!'), false);
  const partials = read('js/partials-core.js');
  for (const id of ['designAiIdeas', 'designBAWrap', 'designAiResult', 'designAiGrid', 'designAiDownloadLink', 'designAiStatus']) assert.ok(partials.includes('id="' + id + '"'), id);
});

/* كتلة الديكور في app-12: من ثابت النقل إلى تعليق المقارنة */
const A = DS.indexOf("const DS_RESULT_STYLE = { maxWidth: '760px', marginInline: 'auto' };");
const B = DS.indexOf('/* ---- v-decor-compare:', A);
function runDecor(opts) {
  opts = opts || {};
  const mk = (id) => ({ id, style: { display: 'none' }, clientWidth: 0 });
  const order = [];
  const anchor = { id: 'designAiIdeas' };
  anchor.parentNode = { insertBefore: (n, ref) => { assert.equal(ref, anchor, 'قبل صندوق الأفكار'); order.push(n.id); } };
  const listeners = {}, win = {}, observers = []; let sized = 0;
  const img = (id) => { const n = mk(id); n.naturalWidth = 0; n.naturalHeight = 0; n.addEventListener = (ev, fn) => { listeners[id + ':' + ev] = fn; }; return n; };
  const nodes = { baWrap: mk('designBAWrap'), resultEl: img('designAiResult'), gridEl: mk('designAiGrid'), downloadEl: mk('designAiDownloadLink'), baAfter: img('designBAAfter'), baBefore: mk('designBABefore'), baBeforeClip: mk('designBABeforeClip') };
  function RO(cb) { this.cb = cb; this.live = true; observers.push(this); }
  RO.prototype.observe = function (el) { this.el = el; };
  RO.prototype.disconnect = function () { this.live = false; };
  const ctx = Object.assign({
    document: { getElementById: (id) => (id === 'designAiIdeas' ? anchor : null) },
    window: { innerHeight: opts.vh || 900, addEventListener: (ev, fn) => { win[ev] = fn; } },
    ResizeObserver: opts.noRO ? undefined : RO, baSize: () => { sized++; }, __swallow: (e) => { throw e; }, Object, Math,
  }, nodes);
  vm.runInNewContext(DS.slice(A, B) + ';this.dsReveal = dsReveal;', ctx);
  return { order, nodes, listeners, win, observers, dsReveal: ctx.dsReveal, sized: () => sized };
}

test('٨. الديكور: النتيجة (سحّاب، صورة، شبكة) وزرّ التحميل تُنقل مكان المشهد وبعرضه وتدخل في الشاشة', () => {
  assert.ok(A > 0 && B > A, 'كتلة النقل موجودة');
  const R = runDecor();
  assert.equal(R.order.join(','), 'designBAWrap,designAiResult,designAiGrid,designAiDownloadLink');
  for (const k of ['baWrap', 'resultEl', 'gridEl', 'downloadEl']) { assert.equal(R.nodes[k].style.maxWidth, '760px', k); assert.equal(R.nodes[k].style.marginInline, 'auto', k); }
  // غرفة عرضيّة تبقى بعرض المشهد؛ طوليّة يُحدّ عرضها حتى يدخل ارتفاعها في ٧٠٪ من الشاشة
  assert.equal(R.listeners['designBAAfter:load'], R.listeners['designAiResult:load']); assert.equal(R.win.resize, R.listeners['designBAAfter:load']);
  R.nodes.baAfter.naturalWidth = 1200; R.nodes.baAfter.naturalHeight = 800; R.listeners['designBAAfter:load']();
  assert.equal(R.nodes.baWrap.style.maxWidth, '760px');
  R.nodes.baAfter.naturalWidth = 768; R.nodes.baAfter.naturalHeight = 1024; R.listeners['designBAAfter:load']();
  assert.equal(R.nodes.baWrap.style.maxWidth, '473px');
  R.nodes.resultEl.naturalWidth = 768; R.nodes.resultEl.naturalHeight = 1024; R.win.resize();
  assert.equal(R.nodes.resultEl.style.maxWidth, '473px', 'والصورة المفردة كذلك');
  // السحّاب في الواجهة العربيّة: طبقة «قبل» تُثبَّت من اليسار، وعرض صورتها يتبع مقاس الحاوية
  assert.equal(R.nodes.baBeforeClip.style.right, 'auto', 'inset:0 + width في RTL كان يثبّتها من اليمين والخطّ يُحسب من اليسار');
  const sync = R.observers.find((o) => o.el === R.nodes.baWrap);
  assert.ok(sync); sync.cb(); assert.equal(R.sized(), 0, 'حاوية مخفيّة لا تُقاس');
  R.nodes.baWrap.clientWidth = 760; sync.cb(); assert.equal(R.sized(), 1);
  // التمرير المؤجَّل إلى أن تظهر النتيجة فعلًا — nearest فلا قفزة
  const scrolls = [], el = { clientWidth: 0, scrollIntoView: (o) => scrolls.push(o.block) };
  R.dsReveal(el); assert.equal(scrolls.length, 0);
  const ro = R.observers[R.observers.length - 1]; ro.cb(); assert.equal(scrolls.length, 0, 'ما زالت مخفيّة');
  el.clientWidth = 760; ro.cb();
  assert.equal(scrolls.join(','), 'nearest'); assert.equal(ro.live, false);
  assert.doesNotThrow(() => runDecor({ noRO: true }).dsReveal({ clientWidth: 0, scrollIntoView: () => { throw new Error('لا'); } }));
  assert.ok(DS.includes('dsReveal(gridEl); /* v-scene-kinds */') && DS.includes("dsReveal((baWrap && baWrap.style.display !== 'none') ? baWrap : resultEl); /* v-scene-kinds */"), 'مسارا النجاح يطلبانه');
});

test('٩. الحزمة، التسجيل، القرار', () => {
  const bundle = read('js/app.bundle.js');
  for (const k of ['var VIDEO_SCENES = [', 'var TREND_SCENES = [', 'var DECOR_SCENES = [', "KINDS.decor.sceneKey = 'aiapp_dc_scene';", "const DS_RESULT_STYLE = { maxWidth: '760px', marginInline: 'auto' };", 'function dsReveal(el){', "if(baBeforeClip) baBeforeClip.style.right = 'auto';", 'function busyText(p, txt){']) assert.ok(bundle.includes(k), 'الحزمة تحمل: ' + k);
  assert.ok(read('package.json').includes('node tests/scene-kinds.test.cjs'), 'الاختبار مسجَّل');
  assert.ok(read('knowledge/DECISIONS.md').includes('## ١١ أكتوبر ٢٠٢٦ — v-scene-kinds:'), 'مدخل القرار في السجلّ');
  const block = SRC.slice(SRC.indexOf('/* @vd-scenes:start'), SRC.indexOf('/* @vd-scenes:end */'));
  assert.doesNotMatch(block + DS.slice(A, B), /gemini|claude|openai|gpt|groq|anthropic|runway|veo/i, 'لا اسم مزوّد أو نموذج');
});
