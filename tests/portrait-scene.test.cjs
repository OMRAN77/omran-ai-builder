'use strict';
/* v-pstyle-scene (المالك ١٥ أكتوبر، صورة «معرض البطاقات الزجاجيّ»: قاعة رخام عاكس، أسطوانة زجاجيّة مضيئة تدور حولها بطاقات بورتريه
   للشخص نفسه، وعدّاد «12» في وسطها — «ادخل ستايل، شوف كيف توليد الصورة ووين مكانه، نفس الفكرة في أنماط الصور»، وقبلها رفض البطاقة
   في المعرض: «لا أريدها فوق وين تطلع الصورة»): أنماط الصور تأخذ آليّة «ستايل AI» نفسها (v-style-scene): المشهد مكان صورة النتيجة
   وعدّاد الصورة نفسه حيّ في موضعه، والحركة داخل الأسطوانة خلف العدّاد، والنتيجة تعود في المكان نفسه.
   v-pstyle-mix (ثلاث شبكات ٢×٢ من المالك: «حطّ هذيل كلّهم نفس موضوع الستايل، كلّ مرّة يتغيّر، قصّهم، ١٣ شكل، كلّ مرّة لون وشكل،
   لا تخلّي نفس الألوان ورا بعض، سوّهم مكس، وأريد الصورة نظيفة»): ١٢ مشهدًا مقصوصًا موضَّحًا يُضاف إلى معرض البطاقات = ١٣ في دور ممزوج.
   v-pstyle-counter (المالك: «وين العدّاد؟ شيل الكود من ستايل، الفكرة كاملة، وطبّقها في الأنماط — فقط غيّر الأشكال»): عدّاد الستايل نفسه
   (حلقة ورقم وشريط بتدرّجه ونصّ «NN% COMPLETE» وحزام الأنبوب) على الـ١٣ كلّها في وسط هيكل كلّ شكل، مع قرصه ومجرييه الخافتة لأنّ الصور بلا عدّاد. */
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

test('٤. الدور ممزوج: لا لون ولا شكل يتكرّر في مشهدين متتاليين (دائريًّا)؛ وعلى الـ١٢ عدّاد الستايل كاملًا في مركز المنطقة الداكنة وسط كلّ شكل (بمعامل الشكل)، مع قرصه ومجرييه لأنّ الصور بلا عدّاد', () => {
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
  // عدّاد الستايل (stScene على ١٢٨٠: حلقة ٣٦٫٦، رقم ٣٠، شريط ١٢٧٫٥×٨، نصّ ١٢٫٨) مكبَّرًا بمعامل الشكل — لا من رأسي؛ في مركز
  // المنطقة الداكنة وسط الهيكل (عمود الحلزون يمين المنتصف وضيّق فمعامله أصغر، لوح الكرة يمين المنتصف، كتلة المكعّبات وفتحة القوس)
  const K = { spiral: 1.1, cubes: 1.366, sphere: 1.366, arch: 1.366 }, CX = { spiral: 872, cubes: 800, sphere: 852, arch: 790 };
  const pos = {};
  for (const sc of SC.slice(1)) {
    const r = sc.ring, t = sc.tube, k = K[sc.shape];
    assert.ok(r && sc.num && sc.bar && sc.cap && sc.ink && sc.arc && sc.glow && sc.capInk, sc.id + ': عدّاد الستايل كاملًا');
    assert.equal(r.cx, CX[sc.shape], sc.id + ': مركز المنطقة الداكنة');
    assert.ok(Math.abs(r.r - 36.6 * k) < 0.1 && Math.abs(r.sw - 3.8 * k) < 0.1 && Math.abs(r.hole - 47.5 * k) < 0.1, sc.id + ': حلقة الستايل مكبَّرة');
    assert.ok(Math.abs(sc.num.size - 30 * k) < 0.1 && Math.abs(sc.num.y - (r.cy + 11.6 * k)) < 0.1, sc.id + ': رقم الستايل');
    assert.ok(Math.abs(sc.bar.y - (r.cy + 60.3 * k)) < 0.1 && Math.abs(sc.bar.w - 127.5 * k) < 0.6 && Math.abs(sc.bar.h - 8 * k) < 0.1 && Math.abs(sc.bar.x + sc.bar.w / 2 - r.cx) < 0.6, sc.id + ': شريط الستايل');
    assert.ok(Array.isArray(sc.bar.grad) && sc.bar.grad.length === 2, sc.id + ': تدرّج الشريط');
    assert.ok(Math.abs(sc.cap.y - (r.cy + 86.1 * k)) < 0.1 && Math.abs(sc.cap.size - 12.8 * k) < 0.1, sc.id + ': نصّ الستايل');
    assert.ok(t.gap && Math.abs(t.gap[0] - (r.cy + 51.8 * k)) < 0.1 && Math.abs(t.gap[1] - (r.cy + 91.8 * k)) < 0.1, sc.id + ': حزام الأنبوب');
    assert.ok(r.disc && r.track && sc.bar.trough, sc.id + ': قرص ومجرى الحلقة ومجرى الشريط — لا عدّاد في الصورة');
    // داخل الهيكل: الأنبوب = المنطقة الداكنة، والعدّاد كلّه (من فوق قرصه إلى تحت نصّه) داخله بهامش، والأنبوب داخل الصورة
    assert.ok(t.x > 0 && t.x + t.w < sc.w && t.y >= 0 && t.y + t.h <= sc.h, sc.id + ': الأنبوب داخل الصورة');
    assert.ok(Math.abs((t.x + t.w / 2) - r.cx) < 4, sc.id + ': العدّاد في منتصف منطقته');
    assert.ok(r.cy - r.r - r.sw * 1.2 > t.y + 4 && sc.cap.y + 3 < t.y + t.h - 4 && sc.bar.x > t.x + 8 && sc.bar.x + sc.bar.w < t.x + t.w - 8, sc.id + ': العدّاد كلّه داخل الهيكل بهامش');
    assert.ok(t.w >= 0.1 * sc.w && t.w <= 0.25 * sc.w && t.h >= 0.2 * sc.h && t.h <= 0.5 * sc.h, sc.id + ': بحجم المنطقة الداكنة لا الهيكل كلّه');
    // الجوّال يقصّ الجوانب إلى ٥:٤ حول المنتصف — العدّاد وأنبوبه داخل المرئيّ
    const half = sc.h * 1.25 / 2;
    assert.ok(t.x > 800 - half + 20 && t.x + t.w < 800 + half - 20, sc.id + ': داخل قصّ الجوّال');
    (pos[sc.shape] = pos[sc.shape] || new Set()).add([Math.round(r.cy / sc.h * 100), r.cx, k].join(','));
    const h = W._sceneHtml(sc);
    const svg = h.slice(h.indexOf('<svg'), h.indexOf('</svg>'));
    assert.equal((svg.match(/<circle /g) || []).length, 4, sc.id + ': قرص ومجرى وقوس ووهجه');
    assert.match(svg, new RegExp('<circle class="genw-disc" cx="' + r.cx + '" cy="' + r.cy + '" r="[\\d.]+" fill="rgba\\(6,9,18,\\.5\\)"></circle><circle class="genw-track" cx="' + r.cx + '" cy="' + r.cy + '" r="' + r.r + '" stroke="rgba\\(255,255,255,\\.2\\)" stroke-width="' + r.sw + '"></circle><circle class="genw-arcg"'));
    assert.match(svg, new RegExp('<text class="genw-num" x="' + r.cx + '" y="[\\d.]+" text-anchor="middle"[^>]*font-size="' + sc.num.size + '"[^>]*>0%</text><rect class="genw-trough" [^>]*></rect><rect class="genw-bar" [^>]*width="0"[^>]*fill="url\\(#genwBarG-'));
    assert.match(svg, new RegExp('<text class="genw-cap" x="' + r.cx + '" y="[\\d.]+" text-anchor="middle"[^>]*font-size="' + sc.cap.size + '"[^>]*>0% COMPLETE</text>'));
    assert.ok(/<em style="-webkit-mask-image:radial-gradient\(ellipse/.test(h) && /<span style="-webkit-mask-image:linear-gradient\(180deg/.test(h), sc.id + ': الأنبوب مثقوب عند الحلقة وبحزام عند الشريط');
    assert.ok(!/genw-rip|genw-arcimg|genw-refl/.test(h), sc.id);
  }
  // الشكل نفسه = موضع ومعامل واحد في ألوانه الثلاثة (الشبكات بالتكوين نفسه)، ولكلّ شكل موضعه
  for (const k in pos) assert.equal(pos[k].size, 1, k + ': موضع واحد');
  assert.equal(new Set(Object.values(pos).map((s) => [...s][0])).size, 4, 'ولكلّ شكل موضعه');
  // مشاهد الستايل والأزياء والفيديو كما هي حرفًا: القرص والمجرى والحوض لا يُرسمان إلّا لمن طلبهم
  for (const sc of [].concat(W._styleScenes, W.KINDS.fashion.scenes)) {
    const h = W._sceneHtml(sc); assert.ok(!/genw-disc|genw-track|genw-trough/.test(h), sc.id + ': بلا إضافة');
  }
  const bundle = read('js/app.bundle.js');
  for (const id of ['psNeonSpiral', 'psIceArch']) assert.ok(bundle.includes("'" + id + "'"), 'الحزمة مبنيّة: ' + id);
  assert.ok(bundle.includes('.genw-live circle.genw-disc{fill:'), 'قرص العدّاد مملوء رغم قاعدة الدوائر بلا ملء');
});

test('٢. معرض البطاقات: عدّاد صورة المالك كلّه حيّ في مواضعه — حلقة ٧٢ ورقمها، والشريط والنصّ حيث رُسما (ومُحيا من الصورة)، والجريان داخل الأسطوانة مثقوب عند الحلقة وبحزام عند الشريط', () => {
  const sc = SC[0];
  const h = W._sceneHtml(sc);
  assert.ok(h.includes('<svg class="genw-live" viewBox="0 0 1600 804" aria-hidden="true">'));
  const svg = h.slice(h.indexOf('<svg'), h.indexOf('</svg>'));
  assert.equal((svg.match(/<circle /g) || []).length, 4, 'قرص ومجرى وقوس ووهجه');
  for (const c of svg.match(/<circle class="genw-arcg?" [^>]+>/g)) assert.match(c, /cx="802" cy="346" r="72"[^>]*stroke-dasharray="[\d.]+" stroke-dashoffset="[\d.]+"/);
  assert.match(svg, /<text class="genw-num" x="802" y="366" text-anchor="middle"[^>]*font-size="50"[^>]*>0%<\/text>/);
  assert.ok(sc.num.y > sc.ring.cy && sc.num.y < sc.ring.cy + sc.ring.r, 'خطّ قاعدة الرقم داخل الحلقة');
  // الشريط حيث رُسم في الصورة (٤٥٨–٤٧٨) والنصّ حيث رُسم (٤٩٠–٥٠٨)، في منتصف الحلقة
  assert.deepEqual([sc.bar.x, sc.bar.y, sc.bar.w, sc.bar.h], [692, 459, 220, 18]); assert.equal(sc.bar.x + sc.bar.w / 2, 802);
  assert.deepEqual([sc.cap.x, sc.cap.y, sc.cap.size], [802, 507, 19]);
  assert.equal((svg.match(/<rect /g) || []).length, 2, 'مجرى الشريط ثمّ الشريط');
  assert.match(svg, /<rect class="genw-trough" x="692" y="459" width="220" height="18" rx="9" fill="rgba\(30,22,14,\.4\)"><\/rect><rect class="genw-bar" x="692" y="459" width="0" height="18" rx="9" fill="url\(#genwBarG-psGallery\)"/, 'مجرى داكن على زجاج المعرض الفاتح');
  assert.match(svg, /<text class="genw-cap" x="802" y="507"[^>]*font-size="19"[^>]*>0% COMPLETE<\/text>/);
  // الصورة v=2: الشريط الأبيض والنصّ مُحيا (صفوفهما بلون الأسطوانة لا بياض)
  assert.match(sc.src, /\?v=[3-9]$/, 'وسم الصورة مرفوع بعد المحو (v=3: محو عمودًا عمودًا بانعكاس النسيج — بلا حافّة)');
  assert.ok(sc.tube && sc.ring.cx > sc.tube.x && sc.ring.cx < sc.tube.x + sc.tube.w && sc.ring.cy > sc.tube.y && sc.ring.cy < sc.tube.y + sc.tube.h, 'الحلقة داخل الأسطوانة');
  assert.match(h, /class="genw-tube" style="left:35%;top:3\.731%;width:30%;height:80\.846%;mix-blend-mode:screen"><span style="-webkit-mask-image:linear-gradient\(180deg/, 'حزام الأنبوب عند الشريط والنصّ');
  assert.ok(/<em style="-webkit-mask-image:radial-gradient\(ellipse/.test(h), 'الجريان مثقوب عند الحلقة');
  assert.ok(sc.tube.gap[0] < sc.bar.y && sc.tube.gap[1] > sc.cap.y, 'الحزام يغطّي الشريط والنصّ');
  assert.ok(!/genw-rip|genw-refl/.test(h), 'بلا تموّجات ولا انعكاس — أرضه رخام');
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
