'use strict';
/* v-vmk-stale-status — تدقيق الإنتاج ١٨–١٩ أكتوبر (صانع الفيديو، حاسوب عربيّ): فشل «سينمائي» يكتب «تعذّر توليد الفيديو الآن» في #videoMakerStatus،
   ثمّ التبديل إلى تبويب آخر (فيديو AI، ممثل يتكلم…) يُبقي الرسالة تحت المعاينة كأنّ القسم الجديد فشل. setTab (js/video.js) وupdateModeUI
   (app-11) لا يمسّان السطر. الإصلاح: setTab يمسحه ما لم يكن توليد جاريًا (زرّ «إنشاء» معطَّل طوال التوليد، وسطر التقدّم وبطاقة الانتظار
   في app-34 يقرآنه). setTab الحقيقيّ يُشغَّل في vm بما يلزمه وحده. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'video.js'), 'utf8');

function setTabSource() {
  const a = SRC.indexOf('  function setTab(v){');
  assert.ok(a > 0, 'setTab في js/video.js');
  const b = SRC.indexOf('\n  }\n', a);
  return SRC.slice(a, b + 4);
}

function boot({ busy = false } = {}) {
  const els = {
    videoMakerMode: { value: 'veo', changes: 0, dispatchEvent() { this.changes++; } },
    videoMakerStatus: { textContent: 'تعذّر توليد الفيديو الآن. أعد المحاولة لاحقًا.', style: { display: 'block' } },
    videoMakerGenerateBtn: { disabled: busy },
  };
  const calls = [];
  const ctx = {
    tab: 'veo', id: (k) => els[k] || null, Event: class { constructor(t) { this.type = t; } },
    tabsFor: () => ['trend', 'canvas', 'runway', 'veo', 'actor', 'clean'], drOwner: () => false,
    buildTabs: () => calls.push('buildTabs'), sync: () => calls.push('sync'), scrub: () => calls.push('scrub'),
  };
  vm.createContext(ctx);
  vm.runInContext(setTabSource(), ctx);
  return { ctx, els, calls };
}

test('١. فشل «سينمائي» ثمّ التبديل إلى تبويب آخر: سطر الخطأ يُمسح ويختفي', () => {
  for (const to of ['runway', 'actor', 'trend', 'clean', 'canvas']) {
    const { ctx, els, calls } = boot();
    ctx.setTab(to);
    assert.equal(els.videoMakerStatus.textContent, '', to + ': الرسالة بقيت بعد التبديل');
    assert.equal(els.videoMakerStatus.style.display, 'none', to);
    assert.equal(ctx.tab, to);
    assert.deepEqual(calls, ['buildTabs', 'sync', 'scrub'], to + ': بقيّة setTab كما كانت');
  }
});

test('٢. أثناء التوليد (زرّ «إنشاء» معطَّل) لا يُمسح سطر التقدّم — بطاقة الانتظار تقرؤه', () => {
  const { ctx, els } = boot({ busy: true });
  els.videoMakerStatus.textContent = '⏳ جاري توليد الفيديو…';
  ctx.setTab('runway');
  assert.equal(els.videoMakerStatus.textContent, '⏳ جاري توليد الفيديو…');
  assert.equal(els.videoMakerStatus.style.display, 'block');
});

test('٣. تبويب غير متاح (وضع المالك لغير المالك) لا يغيّر شيئًا', () => {
  const { ctx, els } = boot();
  ctx.setTab('omni');
  assert.equal(ctx.tab, 'veo');
  assert.notEqual(els.videoMakerStatus.textContent, '');
});

test('٤. وسم video.js مرفوع (النسخة المخبّأة بلا المسح)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = /src="\/js\/video\.js\?v=(\d+)"/.exec(html);
  assert.ok(m && Number(m[1]) >= 453, 'وسم video.js');
});

/* ── v-vmk-res-mode (تدقيق ١٨–١٩ أكتوبر، لقطة ٠٠٥): فيديو القوالب المجّانيّ و«تحميل الفيديو» يبقيان ظاهرين ويشتغلان في تبويب «فيديو AI»
   المدفوع — runCanvasOnly يُظهر النتيجة ولا يخفيها إلّا قسم «تحسين فيديو». النتيجة تُوسَم بوضعها عند «إنشاء» (app-11)، وsyncResult
   (js/video.js) يضع vmk-res-other على البطاقة في غير وضعها وفي الترندات والتحسين والمخرج ويوقفها، وترجع عند العودة إلى وضعها. ── */
function fnSource(name) {
  const a = SRC.indexOf('  function ' + name + '(');
  assert.ok(a > 0, name + ' في js/video.js');
  const b = SRC.indexOf('\n  }\n', a);
  return SRC.slice(a, b + 4);
}
function classes() {
  const s = new Set();
  return { has: (c) => s.has(c), contains: (c) => s.has(c), add: (c) => s.add(c), remove: (c) => s.delete(c),
    toggle(c, f) { if (f === undefined) f = !s.has(c); if (f) s.add(c); else s.delete(c); return f; } };
}
function bootResult({ resMode = 'canvas', mode = 'canvas', tab = 'canvas' } = {}) {
  const card = { classList: classes() };
  const res = { dataset: resMode ? { mode: resMode } : {}, style: { display: 'block' }, paused: false, pauses: 0, pause() { this.paused = true; this.pauses++; } };
  const els = {
    videoMakerMode: { value: mode, dispatchEvent() {} },
    videoMakerStatus: { textContent: '✅ تم الانتهاء!', style: { display: 'block' } },
    videoMakerGenerateBtn: { disabled: false },
    videoMakerResult: res,
  };
  const ctx = { tab, M: { firstElementChild: card }, id: (k) => els[k] || null, Event: class { constructor(t) { this.type = t; } },
    tabsFor: () => ['trend', 'canvas', 'runway', 'veo', 'actor', 'clean'], drOwner: () => false, buildTabs() {}, scrub() {} };
  vm.createContext(ctx);
  vm.runInContext(setTabSource() + '\n' + fnSource('syncResult') + '\nfunction sync(){ syncResult(); }', ctx);
  /* setTab الحقيقيّ يضبط الـselect، والمزيّف هنا يُضبط باليد كما يفعل حدث change */
  const go = (v) => { if (v !== 'trend' && v !== 'clean') els.videoMakerMode.value = v; ctx.setTab(v); };
  return { ctx, card, res, els, go };
}

test('٥. نتيجة «قوالب» ثمّ تبويب «فيديو AI»: النتيجة ورابط التحميل يختفيان والفيديو يتوقّف، والعودة إلى «قوالب» ترجعها', () => {
  const { card, res, go } = bootResult();
  go('runway');
  assert.equal(card.classList.has('vmk-res-other'), true, 'النتيجة ظاهرة في وضع لم ينتجها');
  assert.equal(res.paused, true, 'الفيديو يشتغل مخفيًّا (autoplay)');
  go('canvas');
  assert.equal(card.classList.has('vmk-res-other'), false, 'الرجوع إلى وضعها يعيدها');
  for (const t of ['trend', 'clean']) { go(t); assert.equal(card.classList.has('vmk-res-other'), true, t); }
  go('canvas');
  assert.equal(card.classList.has('vmk-res-other'), false);
});

test('٦. نتيجة بلا وسم (لم يُولَّد شيء بعد) لا تُخفى في الأوضاع، والنتيجة الظاهرة في وضعها لا تُوقف', () => {
  const a = bootResult({ resMode: '', mode: 'runway', tab: 'runway' });
  a.ctx.syncResult();
  assert.equal(a.card.classList.has('vmk-res-other'), false);
  const b = bootResult({ resMode: 'runway', mode: 'runway', tab: 'runway' });
  b.ctx.syncResult();
  assert.equal(b.res.pauses, 0);
});

test('٧. الوسم يُكتب عند «إنشاء» في app-11 ويُراقَب في video.js، وmodules.css يخفي النتيجة ورابطها وروابط المشاهد تحت vmk-res-other', () => {
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app-11-video.js'), 'utf8');
  const gen = app.slice(app.indexOf('btnGenerate.onclick = async () => {'), app.indexOf('function friendlyError(err){'));
  assert.ok(/resultEl\.dataset\.mode = modeEl\.value;/.test(gen), 'وسم الوضع عند بدء التوليد');
  assert.ok(/function sync\(\)\{[\s\S]*?syncResult\(\);/.test(SRC), 'sync() تنادي syncResult');
  assert.ok(/new MutationObserver\(syncResult\)\.observe\(rs,\{attributes:true,attributeFilter:\['data-mode'\]\}\)/.test(SRC), 'تغيّر الوسم يعيد الحساب (لا صنف قديم يخفي نتيجة جديدة في وضعها)');
  assert.ok(/rs\.addEventListener\('play',syncResult\)/.test(SRC), 'autoplay في وضع آخر يُوقف');
  const css = fs.readFileSync(path.join(ROOT, 'css', 'modules.css'), 'utf8');
  assert.ok(css.includes('#videoMakerModal .vmk-studio.vmk-res-other #videoMakerResult,#videoMakerModal .vmk-studio.vmk-res-other #videoMakerDownloadLink,#videoMakerModal .vmk-studio.vmk-res-other #filmSceneLinks{display:none!important}'));
});

/* ── v-vmk-chat-tab (تدقيق ١٨–١٩ أكتوبر، g05 لقطة ٠٣٢): طلب فيديو من المحادثة يملأ الوصف ثمّ يُفتح الصانع على «الترندات» والوصف مخفيّ
   في قسم آخر. omranOpenVideoMaker يضع data-vmk-tab بالوضع الحاليّ حين يأتيه نصّ أو صورة، ومراقب الفتح يقرؤها مرّة ويمحوها؛
   الفتح العاديّ يبقى على الترندات كلّ مرّة (v-vmk-sections). ── */
function observerSource() {
  const a = SRC.indexOf('  new MutationObserver(function(){\n    var open=');
  assert.ok(a > 0, 'مراقب الفتح');
  const b = SRC.indexOf('}).observe(M,', a);
  return 'var __obs=' + SRC.slice(a + '  new MutationObserver('.length, b + 1) + ';';
}
function fakeEl(tag) {
  const e = { tagName: String(tag).toUpperCase(), children: [], style: {}, dataset: {}, attrs: {}, classList: classes(), listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; }, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } };
  Object.defineProperty(e, 'innerHTML', { set() { e.children = []; }, get() { return ''; } });
  return e;
}
function bootOpen() {
  const header = fakeEl('div'); const card = fakeEl('div'); card.firstElementChild = header; header.nextSibling = null;
  const M = fakeEl('div'); M.firstElementChild = card; M.style.display = 'none';
  let tb = null;
  const ctx = { M, tab: 'trend', wasOpen: false, TAB_ART: { actor: '/a.webp' }, document: { createElement: fakeEl },
    id: (k) => (k === 'vmkTabs' ? tb : null), tabsFor: () => ['trend', 'canvas', 'runway', 'veo', 'actor', 'clean'], drOwner: () => false,
    tabLabel: (v) => v, setTab() {}, opened: 0 };
  ctx.enhance = function () { ctx.opened++; vm.runInContext('buildTabs()', ctx); };
  ctx.__keepTb = (x) => { tb = x; x.previousElementSibling = header; };
  vm.createContext(ctx);
  const bt = fnSource('buildTabs').replace("tb=document.createElement('div');", "tb=document.createElement('div'); __keepTb(tb);");
  const art = SRC.indexOf('  function tabArt(') > 0 ? fnSource('tabArt') : '';
  /* v-tab-video: المربّع يُبنى بـtabMedia (صورة بلا فيديو مرفوع) */
  const media = SRC.indexOf('  function tabMedia(') > 0 ? 'var VIDEOS={};\n' + fnSource('tabVid') + '\n' + fnSource('tabMedia') : '';
  vm.runInContext(art + '\n' + media + '\n' + bt + '\n' + observerSource(), ctx);
  const open = (attr) => { if (attr) M.attrs['data-vmk-tab'] = attr; M.style.display = 'flex'; ctx.__obs(); };
  const close = () => { M.style.display = 'none'; ctx.__obs(); };
  return { ctx, M, card, open, close };
}

test('٨. فتح من المحادثة بنصّ (data-vmk-tab=runway): القسم «فيديو AI» والوصف ظاهر، والعلامة تُمحى؛ والفتح التالي العاديّ على الترندات', () => {
  const { ctx, M, card, open, close } = bootOpen();
  open('runway');
  assert.equal(ctx.tab, 'runway', 'الفتح من المحادثة بقي على الترندات');
  assert.equal(card.classList.has('vmk-tab-trend'), false, 'الاستوديو مخفيّ خلف الترندات');
  assert.equal(M.getAttribute('data-vmk-tab'), null, 'العلامة تُقرأ مرّة');
  close(); open();
  assert.equal(ctx.tab, 'trend', 'الفتح العاديّ على الترندات (v-vmk-sections)');
  assert.equal(card.classList.has('vmk-tab-trend'), true);
  close(); open('omni');
  assert.equal(ctx.tab, 'trend', 'قسم غير متاح لهذا الحساب ← الترندات');
});

test('٩. omranOpenVideoMaker يضع العلامة بالوضع الحاليّ قبل إظهار النافذة، حين يأتيه نصّ أو صورة فقط', () => {
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app-11-video.js'), 'utf8');
  const a = app.indexOf('window.omranOpenVideoMaker = function(prompt, heroDataUrl, heroMimeType){');
  const f = app.slice(a, app.indexOf('\n  };\n', a));
  const mark = f.indexOf('modal.dataset.vmkTab = ');
  assert.ok(mark > 0, 'علامة القسم');
  assert.ok(mark < f.indexOf("modal.style.display = 'flex';"), 'قبل الإظهار (المراقب يقرؤها عند الفتح)');
  assert.ok(/if\(\(prompt && String\(prompt\)\.trim\(\)\) \|\| heroDataUrl\)/.test(f), 'بلا نصّ ولا صورة (ترندات المحادثة، مها) يبقى على الترندات');
});
