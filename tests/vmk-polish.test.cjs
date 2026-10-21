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

