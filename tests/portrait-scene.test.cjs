'use strict';
/* v-pstyle-scene (المالك ١٥ أكتوبر، صورة «معرض البطاقات الزجاجيّ»: قاعة رخام عاكس، أسطوانة زجاجيّة مضيئة تدور حولها بطاقات بورتريه
   للشخص نفسه، وعدّاد «12» في وسطها — «ادخل ستايل، شوف كيف توليد الصورة ووين مكانه، نفس الفكرة في أنماط الصور»، وقبلها رفض البطاقة
   في المعرض: «لا أريدها فوق وين تطلع الصورة»): أنماط الصور تأخذ آليّة «ستايل AI» نفسها (v-style-scene): المشهد مكان صورة النتيجة
   وعدّاد الصورة نفسه حيّ في موضعه، والحركة داخل الأسطوانة خلف العدّاد، والنتيجة تعود في المكان نفسه.
   v-pstyle-mix (ثلاث شبكات ٢×٢ من المالك: «حطّ هذيل كلّهم نفس موضوع الستايل، كلّ مرّة يتغيّر، قصّهم، ١٣ شكل، كلّ مرّة لون وشكل،
   لا تخلّي نفس الألوان ورا بعض، سوّهم مكس، وأريد الصورة نظيفة»): ١٢ مشهدًا مقصوصًا موضَّحًا يُضاف إلى معرض البطاقات = ١٣ في دور ممزوج. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-34-gen-wait.js');
function load(storage) {
  const sandbox = { window: {}, document: { readyState: 'complete', body: null, documentElement: {}, querySelectorAll: () => [], getElementById: () => null, querySelector: () => null }, MutationObserver: function () { return { observe() {} }; }, setTimeout: () => 0 };
  if (storage) sandbox.localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  vm.createContext(sandbox); vm.runInContext(SRC, sandbox); return sandbox.window.omranGenWait;
}
const W = load();
const SC = Array.from(W._portraitScenes);

const webpSize = (file) => {
  const buf = fs.readFileSync(path.join(root, file));
  assert.equal(buf.slice(0, 4).toString('latin1'), 'RIFF'); assert.equal(buf.slice(8, 12).toString('latin1'), 'WEBP');
  assert.ok(buf.length > 60 * 1024 && buf.length < 700 * 1024, file + ' حجم معقول: ' + buf.length);
  const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a])); assert.ok(i > 0, file + ' رأس VP8');
  return { width: buf.readUInt16LE(i + 3) & 0x3fff, height: buf.readUInt16LE(i + 5) & 0x3fff };
};

test('١. ١٣ مشهدًا من صور المالك: معرض البطاقات ثمّ ١٢ من الشبكات الثلاث، كلّها موضَّحة (≥١٥٠٠ عرضًا) بنسبة إحداثيّاتها، ومربوطة بنوع الأنماط بدور مستقلّ', () => {
  assert.equal(SC.length, 13); assert.equal(SC[0].id, 'psGallery', 'صورة المالك الأولى تبقى أوّل الدور');
  assert.equal(new Set(SC.map((s) => s.id)).size, 13, 'معرّفات فريدة');
  assert.equal(W.KINDS.styles.scenes, W._portraitScenes); assert.equal(W.KINDS.styles.sceneKey, 'aiapp_ps_scene');
  const files = new Set();
  for (const sc of SC) {
    const m = /^\/assets\/portrait\/gen-scene-([a-z-]+)\.webp\?v=\d+$/.exec(sc.src); assert.ok(m, sc.src);
    files.add(m[1]);
    const { width, height } = webpSize('assets/portrait/gen-scene-' + m[1] + '.webp');
    assert.ok(width >= 1500, sc.id + ' موضَّحة: ' + width); assert.equal(sc.w, width, sc.id + ' عرض الإحداثيّات = عرض الصورة');
    assert.equal(sc.h, height, sc.id + ' ارتفاع الإحداثيّات = ارتفاع الصورة');
  }
  assert.equal(files.size, 13, 'لكلّ مشهد صورته');
  // الشبكات الثلاث كاملة: ٣ ألوان × ٤ أشكال
  for (const th of ['ice', 'gold', 'neon']) for (const sh of ['spiral', 'cubes', 'sphere', 'arch']) assert.ok(files.has(th + '-' + sh), th + '-' + sh);
  // الدور يمرّ على الـ١٣ كلّها ثمّ يعود لأوّله، والستايل والأزياء كما هما
  const st = new Map(); const w2 = load(st);
  const seen = [];
  for (let i = 0; i < 13; i++) seen.push(w2._nextScene(w2.KINDS.styles).id);
  assert.deepEqual(seen, SC.map((s) => s.id)); assert.equal(st.get('aiapp_ps_scene'), '0', 'بعد ١٣ يعود الدور لأوّله');
  assert.equal(w2._nextScene(w2.KINDS.styles).id, 'psGallery');
  assert.equal(w2.KINDS.studio.scenes.length, 5); assert.equal(w2.KINDS.fashion.scenes.length, 2);
  for (const k of ['image', 'video']) assert.equal(w2.KINDS[k].scenes, undefined, k + ': البطاقة الذهبيّة كما هي');
});

test('٤. الدور ممزوج: لا لون ولا شكل يتكرّر في مشهدين متتاليين (دائريًّا)، ومشاهد الشبكات بلا عدّاد مرسوم فلا حلقة ولا رقم — الجريان داخل هيكلها وحده', () => {
  const hues = new Set(), shapes = new Set();
  for (let i = 0; i < SC.length; i++) {
    const a = SC[i], b = SC[(i + 1) % SC.length];
    assert.ok(a.hue && a.shape, a.id + ' لون وشكل');
    hues.add(a.hue); shapes.add(a.shape);
    assert.notEqual(a.hue, b.hue, a.id + ' ← ' + b.id + ': اللون نفسه ورا بعض');
    assert.notEqual(a.shape, b.shape, a.id + ' ← ' + b.id + ': الشكل نفسه ورا بعض');
  }
  assert.deepEqual([...hues].sort(), ['amber', 'blue', 'gallery', 'gold', 'green', 'ice', 'purple'], 'ثلجيّ وذهبيّ ونيون بأربعة ألوان ومعرض البطاقات');
  assert.deepEqual([...shapes].sort(), ['arch', 'cubes', 'cylinder', 'sphere', 'spiral']);
  for (const sc of SC.slice(1)) {
    assert.ok(!sc.ring && !sc.num && !sc.bar && !sc.cap && !sc.refl && !sc.rip, sc.id + ': لا عدّاد في الصورة فلا يُرسم (v-scene-kinds)');
    assert.ok(sc.tube && sc.tube.blend === 'screen' && sc.flow && sc.bg, sc.id + ': أنبوب جريان بلون المشهد');
    const t = sc.tube;
    assert.ok(t.x > 0 && t.x + t.w < sc.w && t.y >= 0 && t.y + t.h <= sc.h, sc.id + ': الأنبوب داخل الصورة');
    assert.ok(Math.abs((t.x + t.w / 2) - sc.w / 2) < 2, sc.id + ': الهيكل في منتصف العرض — فيبقى على الجوّال حين تُقصّ الجوانب');
    assert.ok(t.w >= 0.2 * sc.w && t.w <= 0.3 * sc.w && t.h >= 0.45 * sc.h, sc.id + ': بحجم الهيكل الزجاجيّ');
    const h = W._sceneHtml(sc);
    assert.ok(h.includes('<svg class="genw-live" viewBox="0 0 ' + sc.w + ' ' + sc.h + '" aria-hidden="true"></svg>'), sc.id + ': لوحة حيّة فارغة — لا قوس ولا رقم ولا شريط');
    assert.ok(/class="genw-tube" style="left:\d+(\.\d+)?%;top:\d+(\.\d+)?%;width:\d+(\.\d+)?%;height:\d+(\.\d+)?%;mix-blend-mode:screen"><span><em><b>/.test(h), sc.id + ': الأنبوب بلا ثقب (لا حلقة) وبلا حزام');
    assert.ok(!/genw-rip|genw-arcimg/.test(h), sc.id);
  }
  // الشكل نفسه = أنبوب بالنِّسَب نفسها في ألوانه الثلاثة (الشبكات بالتكوين نفسه)
  const byShape = {};
  for (const sc of SC.slice(1)) {
    const k = [sc.tube.x, sc.tube.w, Math.round(sc.tube.y / sc.h * 100), Math.round((sc.tube.y + sc.tube.h) / sc.h * 100)].join(',');
    (byShape[sc.shape] = byShape[sc.shape] || new Set()).add(k);
  }
  for (const k in byShape) assert.equal(byShape[k].size, 1, k + ': نِسَب واحدة');
  assert.equal(new Set(Object.values(byShape).map((s) => [...s][0])).size, 4, 'ولكلّ شكل نِسَبه');
  const bundle = read('js/app.bundle.js');
  for (const id of ['psNeonSpiral', 'psIceArch']) assert.ok(bundle.includes("'" + id + "'"), 'الحزمة مبنيّة: ' + id);
});

test('٢. عدّاد الصورة نفسه: حلقة ورقم فقط (كما رُسم فيها — لا شريط ولا نصّ ولا لوحة)، والجريان داخل الأسطوانة مثقوب عند الحلقة', () => {
  const sc = SC[0];
  const h = W._sceneHtml(sc);
  assert.ok(h.includes('<svg class="genw-live" viewBox="0 0 1600 804" aria-hidden="true">'));
  const svg = h.slice(h.indexOf('<svg'), h.indexOf('</svg>'));
  assert.equal((svg.match(/<circle /g) || []).length, 2, 'القوس ووهجه');
  for (const c of svg.match(/<circle [^>]+>/g)) assert.match(c, /cx="802" cy="346" r="72"[^>]*stroke-dasharray="[\d.]+" stroke-dashoffset="[\d.]+"/);
  assert.equal((svg.match(/<rect /g) || []).length, 0, 'لا شريط في الصورة فلا يُرسم');
  assert.ok(!/genw-cap|genw-plate|genw-hud|genw-refl/.test(svg), 'رقم فقط');
  assert.match(svg, /<text class="genw-num" x="802" y="366" text-anchor="middle"[^>]*font-size="50"[^>]*>0%<\/text>/);
  assert.ok(sc.num.y > sc.ring.cy && sc.num.y < sc.ring.cy + sc.ring.r, 'خطّ قاعدة الرقم داخل الحلقة');
  assert.ok(sc.tube && sc.ring.cx > sc.tube.x && sc.ring.cx < sc.tube.x + sc.tube.w && sc.ring.cy > sc.tube.y && sc.ring.cy < sc.tube.y + sc.tube.h, 'الحلقة داخل الأسطوانة');
  assert.match(h, /class="genw-tube" style="left:35%;top:3\.731%;width:30%;height:80\.846%;mix-blend-mode:screen"/);
  assert.ok(/<em style="-webkit-mask-image:radial-gradient\(ellipse/.test(h), 'الجريان مثقوب عند الحلقة');
  assert.ok(!/genw-rip/.test(h), 'بلا تموّجات — أرضه رخام');
});

test('٣. المكان: المشهد مكان صورة النتيجة (قبل شريط «قبل/بعد»)، وتُخفى النتيجة السابقة وزرّا التحميل والمشاركة ما دام؛ الحالة «⏳ جارٍ التحويل…» تبدؤه', () => {
  assert.equal(W.PANELS.length, 6, 'لا لوحة جديدة — لوحة الأنماط نفسها صارت مشهدًا');
  const p = W.PANELS.find((x) => x.id === 'styles');
  assert.equal(p.sel, '#portraitStyleStatus'); assert.equal(p.kind, 'styles'); assert.equal(p.scope, 'body', 'ورقة الأنماط تُنقل خارج النافذة — النطاق الصفحة كلّها وإلّا تكرّرت البطاقة كلّ مسح');
  assert.equal(Array.from(p.busy).join('|'), '⏳|🎞️'); assert.equal(Array.from(p.top).join('|'), '⏳|🎞️');
  assert.equal(p.topSel, '#portraitCompareWrap');
  assert.equal(p.hideSel, '#portraitCompareWrap, #portraitStyleDownloadLink, #portraitShareBtn');
  const partials = read('js/partials-core.js');
  for (const id of ['portraitCompareWrap', 'portraitStyleResult', 'portraitStyleDownloadLink', 'portraitShareBtn', 'portraitStyleStatus']) assert.ok(partials.includes('id="' + id + '"'), id);
  assert.ok(read('js/app-12-studios.js').includes("['portraitStyleStatus','portraitCompareWrap','portraitStyleDownloadLink','portraitShareBtn'].forEach"), 'الحالة ثمّ الشريط ثمّ الزرّان في لوحة العمل — فالمشهد بينهما مكان الصورة');
  const ar = read('js/app-03-i18n-data.js');
  assert.ok(ar.includes("portraitGenerating: '⏳ جارٍ التحويل...'") && ar.includes("portraitGenerating: '⏳ Transforming...'"), 'نصّ الحالة القائم يبدأ بـ⏳ — بلا نصّ واجهة جديد');
  const dialog = { id: 'dialog' }, wrap = { id: 'wrap', parentNode: dialog }, pel = { parentNode: dialog, nextSibling: { id: 'next' } };
  const doc = { querySelector: (sel) => (sel === p.topSel ? wrap : null) };
  const up = W._mountPoint(p, pel, '⏳ جارٍ التحويل...', doc);
  assert.equal(up.top, true); assert.equal(up.before, wrap, 'قبل شريط «قبل/بعد» — مكان الصورة');
  assert.equal(W._mountPoint(p, pel, '🎞️ جاري بناء الصورة المتحرّكة…', doc).top, true, 'ومسار GIF');
  assert.equal(W._mountPoint(p, pel, '⏳ جارٍ التحويل...', { querySelector: () => null }).top, false, 'بلا مرساة = تحت سطر الحالة كما كان');
  assert.equal(W._panelBusy(p, '⏳ جارٍ التحويل...'), true); assert.equal(W._panelBusy(p, '✅ تم!'), false);
  const mkEl = (id) => { const at = {}; return { id, hasAttribute: (k) => k in at, setAttribute: (k, v) => { at[k] = v; }, removeAttribute: (k) => { delete at[k]; }, at }; };
  const els = ['wrap', 'download', 'share'].map(mkEl);
  const topCard = { id: 'card' };
  const scope = { querySelectorAll: (sel) => (sel === p.hideSel ? els : []), querySelector: (sel) => (/data-genw-top/.test(sel) ? topCard : null) };
  W._applyHide(p, scope); assert.ok(els.every((e) => e.at['data-genw-hide'] === '1'), 'مخفيّة ما دام المشهد');
  scope.querySelector = () => null; W._applyHide(p, scope); assert.ok(els.every((e) => !('data-genw-hide' in e.at)), 'تعود فور رفعه — النتيجة في مكانها');
  assert.ok(SRC.includes("tg.closest('#btnPortraitStyle, #portraitStyleGenerateBtn')"), 'تحميل المشهد مسبقًا عند فتح الأداة وعند «حوّل»');
  assert.ok(read('js/app.bundle.js').includes("id: 'psGallery'"), 'الحزمة مبنيّة');
});
