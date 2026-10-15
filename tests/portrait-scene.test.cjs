'use strict';
/* v-pstyle-scene (المالك ١٥ أكتوبر، صورة «معرض البطاقات الزجاجيّ»: قاعة رخام عاكس، أسطوانة زجاجيّة مضيئة تدور حولها بطاقات بورتريه
   للشخص نفسه، وعدّاد «12» في وسطها — «ادخل ستايل، شوف كيف توليد الصورة ووين مكانه، نفس الفكرة في أنماط الصور»، وقبلها رفض البطاقة
   في المعرض: «لا أريدها فوق وين تطلع الصورة»): أنماط الصور تأخذ آليّة «ستايل AI» نفسها (v-style-scene): المشهد مكان صورة النتيجة
   وعدّاد الصورة نفسه حيّ في موضعه، والحركة داخل الأسطوانة خلف العدّاد، والنتيجة تعود في المكان نفسه. */
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

test('١. مشهد واحد من صورة المالك: موضَّح (≥١٥٠٠ عرضًا)، بنسبة إحداثيّاته، ومربوط بنوع الأنماط بدور مستقلّ', () => {
  assert.equal(SC.length, 1); assert.equal(SC[0].id, 'psGallery');
  assert.equal(W.KINDS.styles.scenes, W._portraitScenes); assert.equal(W.KINDS.styles.sceneKey, 'aiapp_ps_scene');
  const m = /^\/assets\/portrait\/gen-scene-([a-z]+)\.webp\?v=\d+$/.exec(SC[0].src); assert.ok(m, SC[0].src);
  const buf = fs.readFileSync(path.join(root, 'assets/portrait/gen-scene-' + m[1] + '.webp'));
  assert.equal(buf.slice(0, 4).toString('latin1'), 'RIFF'); assert.equal(buf.slice(8, 12).toString('latin1'), 'WEBP');
  assert.ok(buf.length > 60 * 1024 && buf.length < 700 * 1024, 'حجم معقول: ' + buf.length);
  const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a])); assert.ok(i > 0, 'رأس VP8');
  const width = buf.readUInt16LE(i + 3) & 0x3fff, height = buf.readUInt16LE(i + 5) & 0x3fff;
  assert.ok(width >= 1500, 'موضَّحة: ' + width); assert.ok(Math.abs(width / height - SC[0].w / SC[0].h) < 0.01, 'النسبة');
  // الأنماط لها دورها، والستايل والأزياء كما هما
  const st = new Map(); const w2 = load(st);
  assert.equal(w2._nextScene(w2.KINDS.styles).id, 'psGallery'); assert.equal(st.get('aiapp_ps_scene'), '0', 'مشهد واحد = الدور يعود لأوّله');
  assert.equal(w2.KINDS.studio.scenes.length, 5); assert.equal(w2.KINDS.fashion.scenes.length, 2);
  for (const k of ['image', 'video']) assert.equal(w2.KINDS[k].scenes, undefined, k + ': البطاقة الذهبيّة كما هي');
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
