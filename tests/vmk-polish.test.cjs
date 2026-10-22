'use strict';
/* v-vmk-polish — تدقيق ١٨–١٩ أكتوبر (صانع الفيديو، g07): بقايا الشكل والسلوك في الصانع، كلّ واحدة بجذرها:
   (أ) «اصنع الفيديو» في الترندات غامق: btn primary بتدرّج الثيم المحايد، فيصنّفه app-41 تعبئة صندوق ويُطلى #101013.
   (ب) دائرة التشغيل في وسط ملصقات «القوالب» فوق نصّها المرسوم في وسط الإطار.
   (ج) مثال «القوالب» بالإنجليزيّ يُظهر ملصقًا وعنوانًا عربيّين (عنوان index.json يغلب L(k)، والنصّ محروق في الصورة).
   (د) مربّع «إضافة تعليق صوتي» المفعَّل بلا ✓ ظاهرة (تعبئة om3-fill #101013 تغلب :checked، والعلامة #14140f على رماديّ داكن).
   (هـ) خانات اسم الشخصيّة و«ماذا تقول؟» بلون صندوقها نفسه (تناوب om3 بثلاث درجات فقط وأربعة صناديق فوقها).
   (و) «play() interrupted by pause()» خطأ صفحة عند المرور السريع على بطاقة مثال.
   (ز) دائرة التشغيل خارج البطاقة بالإنجليزيّ (inset-inline-start:auto يلغي left:50% في LTR)، والمثلّث يشير يسارًا بالعربيّ (حدّ منطقيّ).
   (ح) «تحسين فيديو» لملفّ WebM بلا مدّة يقف على 0% ثمّ يقفز إلى 100%.
   (ط) فيديو القوالب WebM وينزل باسم ‎.mp4. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const JS = rd('js/video.js');
const CSS = rd('css/modules.css');

/* دالّة من المصدر: سطر واحد إن اكتملت أقواسه فيه، وإلّا حتّى «  }» في أوّل السطر */
function fn(src, name, prefix) {
  const head = (prefix || '  function ') + name + '(';
  const a = src.indexOf(head);
  assert.ok(a >= 0, name);
  const eol = src.indexOf('\n', a);
  const line = src.slice(a, eol);
  let d = 0; for (const ch of line) { if (ch === '{') d++; else if (ch === '}') d--; }
  if (d === 0 && line.includes('{')) return line + '\n';
  return src.slice(a, src.indexOf('\n  }\n', a) + 4);
}
function lineOf(src, start) { const a = src.indexOf(start); assert.ok(a >= 0, start); return src.slice(a, src.indexOf('\n', a)) + '\n'; }

function classes() {
  const s = new Set();
  return { has: (c) => s.has(c), contains: (c) => s.has(c), add: (c) => s.add(c), remove: (c) => s.delete(c),
    toggle(c, f) { if (f === undefined) f = !s.has(c); if (f) s.add(c); else s.delete(c); return f; } };
}
function El(tag, opts) {
  const e = { tagName: String(tag).toUpperCase(), children: [], dataset: {}, attrs: {}, listeners: {}, classList: classes(), className: '',
    style: { setProperty(k, v) { this[k] = v; } },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    fire(t) { (this.listeners[t] || []).forEach((f) => f({ key: '', preventDefault() {} })); } };
  Object.defineProperty(e, 'innerHTML', { set() { e.children = []; }, get() { return ''; } });
  Object.defineProperty(e, 'textContent', { set(v) { e._t = String(v); }, get() { return (e._t || '') + e.children.map((c) => c.textContent).join(''); } });
  if (e.tagName === 'VIDEO') { e.play = (opts && opts.play) || (() => Promise.resolve()); e.pause = () => {}; }
  return e;
}
const walk = (e, f) => { f(e); e.children.forEach((c) => walk(c, f)); };
const isTut = (c) => /vmk-sm-tut/.test(c.className);

function bootSamples({ lang = 'ar', mode = 'canvas', play } = {}) {
  const box = El('div'); const prompt = { value: '', focus() {} };
  const els = { vmkSamples: box, videoMakerMode: { value: mode }, videoMakerPrompt: prompt };
  const played = [];
  const ctx = {
    document: { documentElement: { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' }, createElement: (t) => El(t, { play }) },
    id: (k) => els[k] || null, L: (k) => (lang === 'ar' ? 'AR:' : 'EN:') + k, tab: mode,
    VIDEOS: JSON.parse(rd('media/samples/index.json')), openPlayer: (s) => played.push(s), setVal: (el, v) => { el.value = v; },
  };
  vm.createContext(ctx);
  const ui = JS.indexOf('  function uiLang(') > 0 ? fn(JS, 'uiLang') : '';
  vm.runInContext(fn(JS, 'ar') + fn(JS, 'Cap') + fn(JS, 'tutUrl') + ui + lineOf(JS, '  var HUE=') + fn(JS, 'syncSamples'), ctx);
  ctx.syncSamples();
  return { box, prompt, played, ctx };
}

test('أ. «اصنع الفيديو» في الترندات ذهبيّ كزرّ الإنشاء، والتدرّج الذهبيّ لا يُصنَّف تعبئة صندوق', () => {
  assert.ok(CSS.includes('#videoMakerModal #vtGo{background:linear-gradient(135deg,#f0cf8f,#c9964a)!important;color:#1a1408!important;'), 'قاعدة #vtGo الذهبيّة');
  const tc = rd('js/app-41-three-colors.js');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fn(tc, 'rgba') + fn(tc, 'boxFill') + fn(tc, 'gradBox'), ctx);
  assert.equal(ctx.gradBox('linear-gradient(135deg, rgb(240, 207, 143), rgb(201, 150, 74))'), false, 'الذهبيّ المشبع ليس صندوقًا');
  assert.equal(ctx.gradBox('linear-gradient(135deg, rgb(43, 46, 53) 0%, rgb(43, 46, 53) 100%)'), true, 'التدرّج المحايد القديم كان يُطلى #101013');
});

test('ب. أمثلة «القوالب»: الصندوق يحمل وضعه، والدائرة أسفل الملصق تحت النصّ لا فوقه', () => {
  const { box } = bootSamples({ mode: 'canvas' });
  assert.equal(box.dataset.mode, 'canvas');
  const rule = '#videoMakerModal .vmk-samples[data-mode=canvas] .vmk-sm-play{top:auto;bottom:8px;margin-top:0}';
  assert.ok(CSS.includes(rule), 'قاعدة القوالب');
  const center = CSS.indexOf('#videoMakerModal .vmk-sm.has-vid .vmk-sm-play,#videoMakerModal .vmk-sm-tut .vmk-sm-play{');
  assert.ok(center > 0 && CSS.indexOf(rule) > center, 'بعد قاعدة التوسيط (الأولويّة نفسها)');
  assert.equal(bootSamples({ mode: 'runway' }).box.dataset.mode, 'runway');
});

test('ج. بالإنجليزيّ: مثال «القوالب» نصّ L(k) بلا ملصق canvas-1 العربيّ؛ بالعربيّ عنوان الفيديو وملصقه كما كانا', () => {
  const en = bootSamples({ lang: 'en', mode: 'canvas' });
  const card = en.box.children.find((c) => !isTut(c));
  assert.ok(card, 'بطاقة المثال');
  assert.equal(card.title || card.textContent, 'EN:videoIdeaCanvas');
  let posters = []; walk(en.box, (e) => { if (e.poster) posters.push(e.poster); if (e.style && e.style.backgroundImage) posters.push(e.style.backgroundImage); });
  assert.ok(!posters.some((p) => /canvas-1/.test(p)), 'ملصق عربيّ في الواجهة الإنجليزيّة: ' + posters.join(','));
  card.fire('click');
  assert.equal(en.prompt.value, 'EN:videoIdeaCanvas', 'الضغط يملأ الوصف بالإنجليزيّ');
  const ar = bootSamples({ lang: 'ar', mode: 'canvas' });
  const c2 = ar.box.children.find((c) => !isTut(c));
  assert.equal(c2.title, JSON.parse(rd('media/samples/index.json'))['canvas-1'].title);
  posters = []; walk(ar.box, (e) => { if (e.poster) posters.push(e.poster); });
  assert.ok(posters.some((p) => /canvas-1\.jpg$/.test(p)), 'الفيديو العربيّ باقٍ للعربيّ');
  /* runway-1 بلا نصّ محروق: الفيديو يبقى لكلّ اللغات، والعنوان العربيّ للعربيّ وحده */
  const rw = bootSamples({ lang: 'en', mode: 'runway' });
  const c3 = rw.box.children.find((c) => !isTut(c));
  assert.equal(c3.title, 'EN:videoIdeaRunway');
  posters = []; walk(rw.box, (e) => { if (e.poster) posters.push(e.poster); });
  assert.ok(posters.some((p) => /runway-1\.jpg$/.test(p)));
  const idx = JSON.parse(rd('media/samples/index.json'));
  assert.equal(idx['canvas-1'].lang, 'ar'); assert.equal(idx['canvas-2'].lang, 'ar');
  assert.ok(!idx['runway-1'].lang, 'فيديو الصقر بلا نصّ: لكلّ اللغات');
});

test('د. المربّع المفعَّل: تعبئة om3-fill لا تمسّ :checked، و:checked ذهبيّ بعلامة داكنة', () => {
  const black = rd('css/أدوات-أسود.css');
  const fills = black.match(/^html[^{\n]*\.om3-fill[^{\n]*\{background:#[0-9a-f]+ !important;\}$/gmi) || [];
  assert.equal(fills.length, 3, 'قواعد التناوب الثلاث');
  fills.forEach((r) => assert.ok(r.includes(':not(:checked)'), r.slice(0, 120)));
  const rd2 = rd('css/redesign.css');
  assert.ok(rd2.includes('html:not(.mobile-ui) #videoMakerModal input[type=checkbox]:checked{background:linear-gradient(135deg,#f0cf8f,#c9964a); border-color:transparent;}'));
  assert.ok(/#videoMakerModal input\[type=checkbox\]:checked::after\{[^}]*color:#1a1408;\}/.test(rd2), '✓ داكنة على الذهبيّ');
});

test('هـ. خانات الشخصيّات #000 داخل صندوقها #101013 على الحاسوب، وبأولويّة تغلب om3-field', () => {
  assert.ok(CSS.includes('html:not([data-mode="light"]):not(.skin):not(.mobile-ui) #videoMakerModal .vmk-ch :is(input,textarea):not(#om3-a#om3-b){background:#000 !important}'));
});

test('و. المرور السريع على بطاقة مثال: وعد play() المرفوض لا يصير خطأ صفحة', async () => {
  assert.ok(!/[{;]\s*vd\.play\(\);/.test(JS), 'play() بلا catch');
  assert.ok(/var pp=vd\.play\(\); if\(pp&&typeof pp\.catch==='function'\) pp\.catch\(/.test(JS), 'وعد play() بمعالج');
  let unhandled = 0; const h = () => { unhandled++; };
  process.on('unhandledRejection', h);
  try {
    const { box } = bootSamples({ lang: 'ar', mode: 'runway', play: () => Promise.reject(new Error('The play() request was interrupted by a call to pause().')) });
    const card = box.children.find((c) => !isTut(c) && /has-vid/.test(c.className + ' ' + (c.classList.has('has-vid') ? 'has-vid' : '')));
    assert.ok(card, 'بطاقة بفيديو');
    card.fire('mouseenter'); card.fire('mouseleave');
    await new Promise((r) => setTimeout(r, 20));
  } finally { process.off('unhandledRejection', h); }
  assert.equal(unhandled, 0, 'رفض بلا معالج');
});

test('ز. الدائرة في منتصف البطاقة بالاتّجاهين، والمثلّث يشير يمينًا دائمًا (حدود فيزيائيّة)', () => {
  const m = CSS.match(/#videoMakerModal \.vmk-sm\.has-vid \.vmk-sm-play,#videoMakerModal \.vmk-sm-tut \.vmk-sm-play\{([^}]*)\}/);
  assert.ok(m, 'قاعدة التوسيط');
  assert.ok(m[1].includes('left:50%') && !m[1].includes('inset-inline-start'), m[1]);
  const after = CSS.match(/[^}]*\.vmk-sm-play:after\{[^}]*\}/g) || [];
  assert.ok(after.length >= 4, 'قواعد المثلّث');
  after.forEach((r) => assert.ok(!/border-inline-start/.test(r), r.trim().slice(0, 120)));
  assert.ok(CSS.includes('#videoMakerModal .vmk-sm-play:after{content:"";position:absolute;top:50%;left:50%;transform:translate(-35%,-50%);border-left:10px solid #fff;'));
});

test('ح. تقدّم «تحسين فيديو»: بمدّة معروفة نسبة، وبلا مدّة الزمن المعالَج والشريط بلمعة غير محدّدة', () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fn(JS, 'clProg'), ctx);
  assert.deepEqual({ ...ctx.clProg({ sec: 0 }, { progress: 0, time: 2500000 }) }, { clock: '0:02' });
  assert.deepEqual({ ...ctx.clProg(null, { progress: 0, time: 75000000 }) }, { clock: '1:15' });
  assert.deepEqual({ ...ctx.clProg({ sec: 10 }, { progress: 0.4, time: 4000000 }) }, { pct: 40 });
  assert.deepEqual({ ...ctx.clProg({ sec: 10 }, { progress: 1.7 }) }, { pct: 100 });
  /* المتصفّح يعرف المدّة والأداة لا تعرفها (نسبتها صفر دائمًا — مسبار المحرّك الحقيقيّ): الزمن واللمعة لا «0%» واقفة */
  assert.deepEqual({ ...ctx.clProg({ sec: 9 }, { progress: 0, time: 1000000 }) }, { clock: '0:01' });
  assert.ok(/window\.__vmkClProg=clProg/.test(JS));
  const run = JS.slice(JS.indexOf('  async function clRun(){'), JS.indexOf('  function clCancel(){'));
  assert.ok(/var r=clProg\(CL\.meta,e\)/.test(run) && /classList\.toggle\('vmk-cl-ind',r\.pct==null\)/.test(run), 'onProg يستعملها');
  assert.ok(CSS.includes('#videoMakerModal .vmk-cl-track.vmk-cl-ind i{'), 'لمعة الشريط');
});

test('ط. فيديو القوالب WebM ينزل بامتداده، والاسم الافتراضيّ يُعاد قبل كلّ توليد', async () => {
  const app = rd('js/app-11-video.js');
  const src = fn(app, 'runCanvasOnly', '  async function ');
  const dlNameSrc = app.split('\n').find((l) => l.trim().startsWith('function dlName('));
  const mk = (type, muxType) => {
    const ctx = { setStatus() {}, bT: (a) => a, recordCanvasClip: async () => ({ type, size: 9 }),
      fetch: async () => ({ ok: true, blob: async () => ({ type: 'audio/mpeg' }) }), muxNarrationAny: async () => ({ type: muxType || type }),
      cleanNarrationText: (x) => x, getNarrationGender: () => 'female', getNarrationSpeed: () => 'fast', URL: { createObjectURL: () => 'blob:x' },
      resultEl: { style: {} }, downloadEl: { style: {}, download: 'omran-film.mp4' }, autoSaveVideo() {}, JSON };
    vm.createContext(ctx); vm.runInContext(dlNameSrc + '\n' + src, ctx); return ctx; // dlName (الدفعة ١، v-vmk-dl-ext) يسمّي الامتداد من النوع
  };
  let c = mk('video/webm;codecs=vp9'); await c.runCanvasOnly('x', '16:9', 5, '', false, '');
  assert.equal(c.downloadEl.download, 'omran-ai-video.webm');
  c = mk('video/webm', 'video/webm'); await c.runCanvasOnly('x', '16:9', 5, '', true, 'y');
  assert.equal(c.downloadEl.download, 'omran-ai-video.webm', 'مع التعليق الصوتيّ (دمج WebM السريع)');
  c = mk('video/webm', 'video/mp4'); await c.runCanvasOnly('x', '16:9', 5, '', true, 'y');
  assert.equal(c.downloadEl.download, 'omran-ai-video.mp4', 'احتياط الترميز MP4');
  const gen = app.slice(app.indexOf('btnGenerate.onclick = async () => {'), app.indexOf('function friendlyError(err){'));
  assert.ok(gen.includes("downloadEl.download = 'omran-ai-video.mp4';"), 'اسم «omran-film.mp4» أو ‎.webm لا يلتصق بالتوليد التالي');
});
