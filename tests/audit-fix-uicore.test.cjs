// tests/audit-fix-uicore.test.cjs — v-audit-uicore: فحص التطبيق كاملًا، مجموعة js/app-05-ui.js
// (حفظ PDF على الكمبيوتر، تصدير الردّ، سباق الخلفيّة الثلاثيّة، تصدير المشاريع في التطبيقات، إعادة محاولة بايثون).
// كلّ اختبار يبدأ بمعرّف العيب، ويشغّل الكود نفسه من المصدر في node:vm ببيئة وهميّة (بلا تنفيذ بقيّة الملفّ).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const UI = read('js/app-05-ui.js');

/* يستخرج دالّة كاملة من المصدر بمطابقة الأقواس */
function fnSource(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  assert.ok(m, 'الدالّة ' + name + ' موجودة');
  let i = src.indexOf('{', m.index), depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, k + 1); }
  }
  throw new Error('لم تُغلق ' + name);
}
const flush = () => new Promise((r) => setImmediate(r));
async function settle(n = 12) { for (let i = 0; i < n; i++) await flush(); }

/* ───────── ١: حفظ PDF على الكمبيوتر ───────── */
function saveEnv({ mobile = false, app = false, share = null } = {}) {
  const log = { fetch: [], sheets: [], downloads: [], shares: [] };
  const ctx = {
    console, Blob, File, URL: { createObjectURL: () => 'blob:local' }, setTimeout: () => 0,
    __swallow: () => {},
    omranNativeBridge: () => null,
    omranLikelyApp: () => app,
    omranMobileUA: () => mobile,
    omranPdfReadySheet: (url, file, name, kind) => { log.sheets.push({ url, name, kind }); return true; },
    msgDownloadBlob: (blob, name) => { log.downloads.push(name); },
    FileReader: class { readAsDataURL(b) { b.arrayBuffer().then((ab) => { this.result = 'data:;base64,' + Buffer.from(ab).toString('base64'); this.onload(); }); } },
    fetch: async (url, init) => { log.fetch.push(url); return { ok: true, status: 200, json: async () => ({ url: '/p/abc' }) }; },
    navigator: share ? { canShare: () => true, share: async (d) => { log.shares.push(d.files[0].name); if (share !== 'ok') { const e = new Error('x'); e.name = share; throw e; } } } : {},
    document: { createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} }, getElementById: () => null },
  };
  vm.createContext(ctx);
  vm.runInContext([fnSource(UI, 'omranBlobToServerLink'), fnSource(UI, 'omranSaveBlob')].join('\n') + '\nthis.omranSaveBlob = omranSaveBlob;', ctx);
  return { ctx, log };
}

test('cli-ui-core-1: الكمبيوتر (ويندوز/ماك بمشاركة ملفّات): PDF ينزل مباشرة — لا لوحة مشاركة النظام، وإغلاقها لا يُضيع الملفّ', async () => {
  for (const mode of ['AbortError', 'ok', 'NotAllowedError']) {
    const { ctx, log } = saveEnv({ share: mode });
    await ctx.omranSaveBlob(new Blob(['%PDF-1.3'], { type: 'application/pdf' }), 'omran-ai.pdf');
    assert.deepEqual(log.shares, [], mode + ': لا navigator.share على الكمبيوتر');
    assert.deepEqual(log.downloads, ['omran-ai.pdf'], mode + ': تنزيل مباشر');
    assert.equal(log.fetch.length, 0, mode + ': لا رفع للخادم');
  }
});

test('cli-ui-core-1: الجوّال والأغلفة كما كانا — المشاركة أوّلًا، وإلغاؤها بيد المستخدم لا يفتح ورقة ثانية', async () => {
  for (const env of [{ mobile: true }, { app: true }]) {
    const { ctx, log } = saveEnv(Object.assign({ share: 'AbortError' }, env));
    await ctx.omranSaveBlob(new Blob(['%PDF-1.3'], { type: 'application/pdf' }), 'omran-ai.pdf');
    assert.deepEqual(log.shares, ['omran-ai.pdf'], JSON.stringify(env));
    assert.equal(log.downloads.length + log.sheets.length, 0, JSON.stringify(env));
  }
  const { ctx, log } = saveEnv({ mobile: true, share: 'NotAllowedError' });
  await ctx.omranSaveBlob(new Blob(['%PDF-1.3'], { type: 'application/pdf' }), 'omran-ai.pdf');
  assert.equal(log.sheets.length, 1, 'رفض المشاركة على الجوّال → ورقة الأزرار كما كان');
});

/* ───────── ٢–٥: تصدير الردّ (PDF / Word / صورة) ───────── */
const EXPORT_REGION = UI.slice(UI.indexOf('function msgEscapeHtml'), UI.indexOf('function exportReplyAsTxt'));
const CJK = /[\u3000-\u9fff\uff00-\uffef]/;
function exportEnv({ nullBlob = false } = {}) {
  const log = { paged: [], single: [], saved: [], fills: [], canvases: [], toasts: [], opened: 0 };
  const mkCanvas = () => {
    const st = { font: '', direction: 'inherit', textAlign: 'start', fillStyle: '#000' };
    const c2d = {
      get font() { return st.font; }, set font(v) { st.font = v; },
      get direction() { return st.direction; }, set direction(v) { st.direction = v; },
      get textAlign() { return st.textAlign; }, set textAlign(v) { st.textAlign = v; },
      get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
      /* عرض تقريبيّ: حرف CJK = حجم الخطّ كاملًا، وغيره نصفه */
      measureText: (s) => ({ width: Array.from(String(s)).reduce((w, ch) => w + (CJK.test(ch) ? 22 : 11), 0) }),
      fillRect() {}, fillText: (s, x, y) => log.fills.push({ s, x, y, direction: st.direction, textAlign: st.textAlign, font: st.font }),
      measure: null,
    };
    const cv = { width: 300, height: 150, getContext: () => c2d, toBlob: (cb, type) => cb(nullBlob ? null : new Blob(['png'], { type })) };
    log.canvases.push(cv);
    return cv;
  };
  const ctx = {
    console, Blob, setTimeout: () => 0, clearTimeout() {}, __swallow: () => {},
    t: (k) => 'T:' + k,
    settingsToast: (m) => log.toasts.push(m),
    omranNativeBridge: () => null,
    msgSaveExport: (blob, name) => { log.saved.push({ blob, name }); return false; },
    document: { createElement: (tag) => (tag === 'canvas' ? mkCanvas() : { style: {}, remove() {} }), body: { appendChild() {} }, head: { appendChild() {} } },
  };
  ctx.window = { open: () => { log.opened++; return null; } };
  vm.createContext(ctx);
  vm.runInContext(EXPORT_REGION, ctx);
  ctx.__stubPaged = async (blocks, opts) => { log.paged.push({ blocks, opts }); return { pages: 1 }; };
  ctx.__stubSingle = async (html, opts) => { log.single.push({ html, opts }); };
  vm.runInContext('omranExportPagedPdfFile = __stubPaged; omranExportHtmlAsPdfFile = __stubSingle;', ctx);
  return { ctx, log };
}
/* أيّ مصدّر PDF نودي: نصّ HTML كامل + اتّجاهه */
function pdfCall(log) {
  if (log.paged.length) return { html: log.paged[0].blocks.map((b) => b.html).join('\n'), opts: log.paged[0].opts, blocks: log.paged[0].blocks };
  if (log.single.length) return { html: log.single[0].html, opts: log.single[0].opts, blocks: null };
  return null;
}
const EN = 'Hello world.\nThis is an English reply, with punctuation!';
const AR = 'مرحبا بالعالم.\nهذا ردّ عربيّ فيه علامات ترقيم!';
const MD = 'Hello **world** and `x = 1`.\n### Title\n- first item\n1. numbered\n```js\nconst x = 1;\n  return x;\n```\n| Name | Age |\n|---|---|\n| Ali | 30 |\nend';

test('cli-ui-core-2: PDF الردّ يمرّ بالمصدّر المقسَّم — كلّ سطر كتلة مستقلّة فلا يُقطع سطر عند حدّ الصفحة ولا لوحة واحدة عملاقة', async () => {
  const lines = Array.from({ length: 120 }, (_, i) => 'Line ' + (i + 1) + ' of a long reply that keeps going');
  const { ctx, log } = exportEnv();
  ctx.exportReplyAsPdf(lines.join('\n'));
  await settle();
  assert.equal(log.single.length, 0, 'لا رسم للردّ كلّه في لوحة واحدة تُقصّ بارتفاع ثابت');
  assert.equal(log.paged.length, 1, 'omranExportPagedPdfFile');
  const blocks = log.paged[0].blocks;
  assert.ok(blocks.length >= 120, 'كتلة لكلّ سطر: ' + blocks.length);
  for (const b of blocks) assert.ok((b.html.match(/Line \d+ of/g) || []).length <= 1, 'لا كتلة تجمع سطرين: ' + b.html.slice(0, 80));
  assert.equal(log.paged[0].opts.fileName, 'omran-ai.pdf');
  /* التقسيم نفسه: أسطر بارتفاع ٣٠ لا تُقصّ أبدًا (لا clipH) */
  vm.runInContext(fnSource(UI, 'omranPaginateBlocks'), ctx);
  const pages = vm.runInContext('omranPaginateBlocks(' + JSON.stringify(blocks.map(() => 30)) + ', 1037)', ctx);
  assert.ok(pages.length > 1 && pages.every((p) => !p.clipH), 'صفحات كاملة بلا شرائح مقصوصة');
});

test('cli-ui-core-3: الاتّجاه من النصّ — الإنجليزيّ يسار في PDF وWord والصورة، والعربيّ يمين كما كان', async () => {
  for (const [text, rtl] of [[EN, false], [AR, true]]) {
    const tag = rtl ? 'AR' : 'EN';
    let e = exportEnv();
    e.ctx.exportReplyAsPdf(text);
    await settle();
    const p = pdfCall(e.log);
    assert.ok(p, tag + ': PDF نودي');
    assert.equal(p.opts.rtl, rtl, tag + ': rtl في خيارات PDF');
    assert.doesNotMatch(p.html, rtl ? /dir="ltr"/ : /dir="rtl"|direction:\s*rtl/, tag + ': PDF');
    e = exportEnv();
    e.ctx.exportReplyAsWord(text);
    const html = await e.log.saved[0].blob.text();
    assert.match(html, new RegExp('<body dir="' + (rtl ? 'rtl' : 'ltr') + '"'), tag + ': Word body');
    assert.doesNotMatch(html, rtl ? /dir="ltr"/ : /dir="rtl"/, tag + ': Word');
    e = exportEnv();
    e.ctx.exportReplyAsImage(text);
    const fills = e.log.fills.filter((f) => f.s.trim());
    assert.ok(fills.length >= 2, tag + ': رُسمت الأسطر');
    for (const f of fills) {
      assert.equal(f.direction, rtl ? 'rtl' : 'ltr', tag + ': ' + f.s);
      assert.equal(f.textAlign, rtl ? 'right' : 'left', tag + ': ' + f.s);
      assert.equal(f.x, rtl ? 860 : 40, tag + ': ' + f.s);
    }
  }
});

test('cli-ui-core-3: ردّ عربيّ فيه كود — الكود يسار وحده، والنصّ يمين', async () => {
  const text = 'هذا مثال على الكود:\n```js\nconst x = 1;\n```\nانتهى المثال.';
  const e = exportEnv();
  e.ctx.exportReplyAsWord(text);
  const html = await e.log.saved[0].blob.text();
  assert.match(html, /<body dir="rtl"/);
  assert.match(html, /dir="ltr"[^>]*>const x = 1;/, 'سطر الكود ltr');
  const img = exportEnv();
  img.ctx.exportReplyAsImage(text);
  const code = img.log.fills.find((f) => f.s.includes('const x = 1;'));
  const ar = img.log.fills.find((f) => f.s.includes('انتهى'));
  assert.equal(code.direction, 'ltr');
  assert.equal(ar.direction, 'rtl');
});

test('cli-ui-core-4: الماركداون يُحوَّل في PDF وWord والصورة — لا ** ولا ### ولا ``` ولا |---| خامًا، وTXT يبقى كما هو', async () => {
  let e = exportEnv();
  e.ctx.exportReplyAsWord(MD);
  const word = await e.log.saved[0].blob.text();
  e = exportEnv();
  e.ctx.exportReplyAsPdf(MD);
  await settle();
  const pdf = pdfCall(e.log).html;
  for (const [tag, html] of [['Word', word], ['PDF', pdf]]) {
    assert.doesNotMatch(html, /\*\*|###|```|\|---/, tag + ': رموز خامّة');
    assert.match(html, /<b>world<\/b>/, tag + ': عريض');
    assert.match(html, /<h3[^>]*>Title<\/h3>/, tag + ': عنوان');
    assert.match(html, /<li>first item<\/li>/, tag + ': قائمة');
    assert.match(html, /<ol start="1"[^>]*><li>numbered<\/li>/, tag + ': قائمة مرقّمة');
    assert.match(html, /<code[^>]*>x = 1<\/code>/, tag + ': كود داخل السطر');
    assert.match(html, /monospace[^>]*>const x = 1;/, tag + ': كتلة كود أحاديّة الخطّ');
    assert.match(html, /monospace[^>]*>  return x;/, tag + ': مسافات الكود محفوظة');
    assert.match(html, /<td[^>]*>Name<\/td><td[^>]*>Age<\/td>/, tag + ': جدول');
    assert.match(html, /<td[^>]*>Ali<\/td>/, tag + ': صفّ الجدول');
  }
  /* الهروب ما زال قائمًا: لا وسم من نصّ الردّ يصل للمستند */
  e = exportEnv();
  e.ctx.exportReplyAsWord('**<img src=x onerror=alert(1)>**\n`<b>`');
  const esc = await e.log.saved[0].blob.text();
  assert.doesNotMatch(esc, /<img/);
  assert.match(esc, /<b>&lt;img src=x onerror=alert\(1\)&gt;<\/b>/);
  assert.match(esc, /<code[^>]*>&lt;b&gt;<\/code>/);
  /* الصورة: نصّ نظيف */
  e = exportEnv();
  e.ctx.exportReplyAsImage(MD);
  const drawn = e.log.fills.map((f) => f.s).join('\n');
  assert.doesNotMatch(drawn, /\*\*|###|```|`|\|---/, 'الصورة: ' + drawn);
  for (const s of ['Hello world and x = 1.', 'Title', '• first item', '1. numbered', 'const x = 1;', '  return x;', 'Ali']) assert.ok(drawn.includes(s), 'الصورة فيها: ' + s);
  /* TXT خامّ كما هو */
  const txt = { saved: [] };
  const c2 = { Blob, msgSaveExport: (b, n) => txt.saved.push(b) };
  vm.createContext(c2);
  vm.runInContext(fnSource(UI, 'exportReplyAsTxt'), c2);
  c2.exportReplyAsTxt(MD);
  assert.equal(await txt.saved[0].text(), MD);
});

test('cli-ui-core-4: جدول مختلط (عربيّ فيه صفّ إنجليزيّ خالص، وإنجليزيّ فيه صفّ عربيّ) — اتّجاه واحد للجدول كلّه فلا ينعكس ترتيب الأعمدة', async () => {
  const cases = [
    ['AR', 'هذه مقارنة الهواتف:\n| الهاتف | الوصف |\n|---|---|\n| iPhone 15 Pro Max | Apple flagship smartphone |\n| سامسونج | هاتف ممتاز |', true],
    ['EN', 'Here is the vocabulary list you asked for, with translations:\n| Word | Meaning |\n|---|---|\n| hello | greeting |\n| مرحبا | سلام |', true],
    ['EN-only', 'Here is the comparison table for the two phones you asked about:\n| Phone | Notes |\n|---|---|\n| Pixel | good |\n| Galaxy | great |', false],
  ];
  for (const [tag, text, rtl] of cases) {
    const want = rtl ? 'rtl' : 'ltr';
    let e = exportEnv();
    e.ctx.exportReplyAsWord(text);
    const word = await e.log.saved[0].blob.text();
    e = exportEnv();
    e.ctx.exportReplyAsPdf(text);
    await settle();
    const pdf = pdfCall(e.log).html;
    for (const [fmt, html] of [['Word', word], ['PDF', pdf]]) {
      const dirs = [...html.matchAll(/<table dir="(rtl|ltr)"/g)].map((m) => m[1]);
      assert.equal(dirs.length, 3, tag + ' ' + fmt + ': ثلاثة صفوف جدول: ' + dirs.length);
      assert.deepEqual(dirs, [want, want, want], tag + ' ' + fmt + ': كلّ صفوف الجدول باتّجاه واحد (قاعدة الشاشة)');
    }
    e = exportEnv();
    e.ctx.exportReplyAsImage(text);
    const rows = e.log.fills.filter((f) => f.s.includes('|'));
    assert.equal(rows.length, 3, tag + ' الصورة: ثلاثة صفوف: ' + rows.map((f) => f.s).join(' / '));
    const mk = rtl ? '\u200f' : '\u200e';
    for (const f of rows) {
      assert.equal(f.direction, want, tag + ' الصورة: ' + f.s);
      assert.equal(f.textAlign, rtl ? 'right' : 'left', tag + ' الصورة: ' + f.s);
      assert.equal(f.x, rtl ? 860 : 40, tag + ' الصورة: ' + f.s);
      assert.ok(f.s.includes(mk + '   |   ' + mk), tag + ' الصورة: علامة اتّجاه قويّة حول الفاصل فلا يندمج الصفّ مقطعًا واحدًا: ' + JSON.stringify(f.s));
    }
  }
});

test('cli-ui-core-5: الصورة تلتفّ بالحرف — الصينيّة بلا مسافات والرابط الطويل لا يخرجان عن اللوحة', () => {
  const zh = '这是一个很长的中文段落没有任何空格所以以前整个段落会变成一行并且被裁剪到画布之外'.repeat(4);
  const url = 'https://example.com/' + 'a'.repeat(200);
  const { ctx, log } = exportEnv();
  ctx.exportReplyAsImage(zh + '\n' + url + '\nshort tail');
  const measure = (s) => Array.from(s).reduce((w, ch) => w + (CJK.test(ch) ? 22 : 11), 0);
  const zhLines = log.fills.filter((f) => CJK.test(f.s));
  assert.ok(zhLines.length >= 4, 'الفقرة الصينيّة عدّة أسطر: ' + zhLines.length);
  assert.equal(zhLines.map((f) => f.s).join(''), zh, 'لا حرف ضائع ولا مكرّر');
  const urlLines = log.fills.filter((f) => /a{10}|example/.test(f.s));
  assert.ok(urlLines.length >= 2, 'الرابط الطويل التفّ');
  assert.equal(urlLines.map((f) => f.s).join(''), url);
  for (const f of log.fills) assert.ok(measure(f.s) <= 820, 'سطر داخل الحدّ (820): ' + measure(f.s) + ' — ' + f.s.slice(0, 30));
  assert.equal(log.saved.length, 1);
  assert.equal(log.saved[0].name, 'omran-ai-reply.png');
});

test('cli-ui-core-5: ردّ أطول من حدّ اللوحة، أو toBlob=null — لا صمت: رسالة مترجمة وPDF بدل الصورة', async () => {
  const long = Array.from({ length: 1200 }, (_, i) => 'line ' + i).join('\n');
  let e = exportEnv();
  e.ctx.exportReplyAsImage(long);
  await settle();
  for (const c of e.log.canvases) assert.ok(c.height <= 16000, 'لا لوحة فوق ١٦٠٠٠ بكسل: ' + c.height);
  assert.equal(e.log.saved.length, 0, 'لا صورة مقصوصة');
  assert.deepEqual(e.log.toasts, ['T:axUicoreImgAsPdf']);
  assert.equal(e.log.paged.length + e.log.single.length, 1, 'حُفظ PDF بدلًا منها');
  e = exportEnv({ nullBlob: true });
  e.ctx.exportReplyAsImage('short reply');
  await settle();
  assert.equal(e.log.saved.length, 0);
  assert.deepEqual(e.log.toasts, ['T:axUicoreImgAsPdf'], 'toBlob=null لم يعد صامتًا');
  assert.equal(e.log.paged.length + e.log.single.length, 1);
});

/* ───────── ٦: سباق applyBg3D ───────── */
function bgEnv(delays) {
  const log = { created: [], custom: [] };
  const store = new Map();
  const ctx = {
    console, setTimeout, Promise, log, delays,
    localStorage: { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) || null },
    document: { body: { classList: { toggle() {} } }, getElementById: () => ({ innerHTML: '' }) },
    __swallow: () => {}, cancelAnimationFrame: () => {},
  };
  ctx.window = ctx;
  ctx.removeEventListener = () => {};
  ctx.VANTA = {};
  for (const n of ['WAVES', 'FOG', 'NET']) ctx.VANTA[n] = () => { const fx = { n, destroyed: false, destroy() { this.destroyed = true; } }; log.created.push(fx); return fx; };
  vm.createContext(ctx);
  const decl = /let bg3dGen = 0;/.test(UI) ? 'let bg3dGen = 0;' : '';
  vm.runInContext([
    'let currentVantaEffect = null; let currentCustomBg = null; let bg3dAutoTimer = null;', decl,
    "const BG3D_EFFECTS = [{ id: 'none', lib: null }, { id: 'waves', lib: 'three' }, { id: 'fog', lib: 'three' }, { id: 'net', lib: 'three' }, { id: 'ocean', lib: 'custom' }];",
    'const BG3D_LIGHT_EXTRA = {};',
    'function bg3dPalette(){ return { light: false, bgHex: 0 }; } function getBg3DAccentColorHex(){ return 0; } function bg3dStill(){ return false; }',
    'async function ensureBg3DDeps(lib){}',
    'function ensureVantaEffectScript(id){ return new Promise((r) => setTimeout(r, delays[id] || 0)); }',
    "function initCustomBg3D(id){ log.custom.push(id); currentCustomBg = { raf: 1, canvas: id }; }",
    fnSource(UI, 'destroyBg3D'), fnSource(UI, 'applyBg3D'),
    'this.applyBg3D = applyBg3D; this.cur = () => ({ vanta: currentVantaEffect && currentVantaEffect.n, custom: currentCustomBg && currentCustomBg.canvas });',
  ].join('\n'), ctx);
  return { ctx, log };
}
const alive = (log) => log.created.filter((fx) => !fx.destroyed).map((fx) => fx.n);

test('cli-ui-core-6: «أمواج» ثمّ «ضباب» أثناء التحميل — المعروض آخر اختيار، ولا أثر WebGL يبقى بلا destroy', async () => {
  const { ctx, log } = bgEnv({ waves: 40, fog: 5 });
  const a = ctx.applyBg3D('waves');
  const b = ctx.applyBg3D('fog');
  await Promise.all([a, b]);
  assert.equal(ctx.cur().vanta, 'FOG', 'المعروض = آخر اختيار');
  assert.deepEqual(alive(log), ['FOG'], 'أثر واحد حيّ: ' + JSON.stringify(log.created.map((f) => f.n)));
  await ctx.applyBg3D('none');
  assert.deepEqual(alive(log), [], '«بدون خلفية» تُطفئ كلّ شيء');
});

test('cli-ui-core-6: «أمواج» ثمّ «محيط» (لوحة متزامنة) — لا يُرسمان معًا', async () => {
  const { ctx, log } = bgEnv({ waves: 20 });
  const a = ctx.applyBg3D('waves');
  await ctx.applyBg3D('ocean');
  await a;
  assert.deepEqual(alive(log), [], 'الأمواج لم تُنشأ فوق المحيط');
  assert.equal(ctx.cur().custom, 'ocean');
  assert.equal(ctx.cur().vanta, null);
});

test('cli-ui-core-6: اختيار واحد يعمل كما كان', async () => {
  const { ctx, log } = bgEnv({ net: 3 });
  await ctx.applyBg3D('net');
  assert.deepEqual(alive(log), ['NET']);
  assert.equal(ctx.cur().vanta, 'NET');
});

/* ───────── ٧: تصدير المشاريع ───────── */
function projEnv({ app = false, mobile = false, bridge = false } = {}) {
  const log = { saveBlob: [], downloads: [], clicks: 0, alerts: [] };
  const ctx = {
    console: { error() {}, log() {}, warn() {} }, Blob, JSON, Date, setTimeout: () => 0,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    __swallow: () => {}, t: (k) => 'T:' + k, alert: (m) => log.alerts.push(m),
    state: { projects: [{ id: 'p1', title: 'x', messages: [{ role: 'user', content: 'hi' }], code: '' }] },
    omranNativeBridge: (n) => (bridge && n === 'omranShare' ? { postMessage() {} } : null),
    omranLikelyApp: () => app, omranMobileUA: () => mobile,
    omranSaveBlob: async (blob, name) => { log.saveBlob.push({ name, type: blob.type, size: blob.size }); },
    msgDownloadBlob: (blob, name) => log.downloads.push(name),
    document: { createElement: () => ({ style: {}, click: () => { log.clicks++; } }), body: { appendChild() {}, removeChild() {} } },
  };
  vm.createContext(ctx);
  vm.runInContext([fnSource(UI, 'msgSaveExport'), fnSource(UI, 'exportProjects')].join('\n') + '\nthis.exportProjects = exportProjects;', ctx);
  return { ctx, log };
}

test('cli-ui-core-7: داخل التطبيقات (هواوي/آيفون/أندرويد) التصدير يمرّ بالمسار الموحّد — لا <a download> ميت ولا «تمّ» كاذبة', async () => {
  for (const env of [{ app: true, mobile: true }, { app: true, bridge: true }, { mobile: true }]) {
    const { ctx, log } = projEnv(env);
    ctx.exportProjects();
    await settle();
    assert.equal(log.clicks, 0, JSON.stringify(env) + ': لا نقر رابط blob');
    assert.equal(log.saveBlob.length, 1, JSON.stringify(env) + ': omranSaveBlob');
    assert.match(log.saveBlob[0].name, /^omran-ai-builder-projects-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(log.saveBlob[0].type, 'application/json');
    assert.ok(log.saveBlob[0].size > 20);
    assert.deepEqual(log.alerts, [], JSON.stringify(env) + ': ورقة «الملف جاهز» هي التأكيد');
  }
});

test('cli-ui-core-7: الكمبيوتر كما كان — تنزيل مباشر ورسالة النجاح', async () => {
  const { ctx, log } = projEnv();
  ctx.exportProjects();
  await settle();
  assert.equal(log.saveBlob.length, 0);
  assert.equal(log.downloads.length + log.clicks, 1, 'تنزيل واحد');
  assert.deepEqual(log.alerts, ['T:exportProjectsSuccess']);
});

/* ───────── ٨: بايثون ───────── */
function pyBlock() {
  const a = UI.indexOf('let pyodideInstance = null;');
  const b = UI.indexOf('function renderAll(keepScroll){', a);
  assert.ok(a > 0 && b > a);
  return UI.slice(a, b);
}
function pyEnv({ loadImpl, scriptImpl = null }) {
  const els = { '#pyStatus': { textContent: '' }, '#pyOutput': { textContent: '', scrollTop: 0, scrollHeight: 0 }, '#btnRunPython': { disabled: false } };
  const log = { scripts: [], removed: 0, timers: [], loads: 0 };
  const ctx = {
    $: (s) => els[s], t: (k) => 'T:' + k, console: { warn() {}, error() {}, log() {} }, __swallow() {},
    setTimeout: (fn, ms) => { log.timers.push({ fn, ms }); return log.timers.length; }, clearTimeout: () => {},
    document: {
      createElement: () => { const s = { remove() { log.removed++; } }; log.scripts.push(s); return s; },
      head: { appendChild: (s) => { setImmediate(() => scriptImpl(s, ctx, log)); } },
    },
  };
  ctx.window = ctx;
  if (loadImpl) ctx.loadPyodide = async (c) => { log.loads++; return loadImpl(log.loads, c); };
  vm.createContext(ctx);
  vm.runInContext(pyBlock(), ctx);
  return { ctx, els, log };
}

test('cli-ui-core-8: فشل عابر في loadPyodide لا يُخزَّن — التشغيل التالي يعيد المحاولة وينجح', async () => {
  const h = pyEnv({ loadImpl: (n) => { if (n === 1) throw new Error('network blip'); return { setStdout() {}, setStderr() {}, runPythonAsync: async () => {} }; } });
  await vm.runInContext("runPythonCode('print(1)')", h.ctx);
  assert.equal(h.els['#pyStatus'].textContent, 'T:pythonError');
  assert.equal(h.els['#pyOutput'].textContent, 'T:axUicorePyLoadFail', 'سطر يشرح السبب وكيف يُعاد');
  assert.equal(h.els['#btnRunPython'].disabled, false);
  await vm.runInContext("runPythonCode('print(1)')", h.ctx);
  assert.equal(h.log.loads, 2, 'محاولة ثانية فعلًا');
  assert.equal(h.els['#pyStatus'].textContent, 'T:pythonDone');
});

test('cli-ui-core-8: سكربت بايثون فشل تحميله يُزال ويُعاد في المحاولة التالية', async () => {
  let attempt = 0;
  const h = pyEnv({
    loadImpl: null,
    scriptImpl: (s, ctx) => {
      attempt++;
      if (attempt === 1) { s.onerror(new Error('cdn')); return; }
      ctx.loadPyodide = async () => ({ setStdout() {}, setStderr() {}, runPythonAsync: async () => {} });
      s.onload();
    },
  });
  await vm.runInContext("runPythonCode('print(1)')", h.ctx);
  assert.equal(h.els['#pyStatus'].textContent, 'T:pythonError');
  assert.equal(h.log.removed, 1, 'وسم السكربت الفاشل أُزيل');
  await vm.runInContext("runPythonCode('print(1)')", h.ctx);
  assert.equal(h.log.scripts.length, 2, 'سكربت جديد');
  assert.equal(h.els['#pyStatus'].textContent, 'T:pythonDone');
});

test('cli-ui-core-8: CDN معلّق — مهلة ٦٠ ثانية تُعيد الزرّ وتشرح، والتحميل الجاري لا يتكرّر', async () => {
  let resolveLoad;
  const h = pyEnv({ loadImpl: () => new Promise((r) => { resolveLoad = r; }) });
  const run = vm.runInContext("runPythonCode('print(1)')", h.ctx);
  await settle();
  assert.equal(h.els['#btnRunPython'].disabled, true, 'أثناء التحميل');
  const timer = h.log.timers.find((x) => x.ms >= 30000 && x.ms <= 120000);
  assert.ok(timer, 'مهلة للتحميل: ' + JSON.stringify(h.log.timers.map((x) => x.ms)));
  timer.fn();
  await run;
  assert.equal(h.els['#btnRunPython'].disabled, false, 'الزرّ عاد');
  assert.equal(h.els['#pyStatus'].textContent, 'T:pythonError');
  assert.equal(h.els['#pyOutput'].textContent, 'T:axUicorePyLoadFail');
  /* التحميل الأوّل ينتهي متأخّرًا: التشغيل التالي يستعمله بلا تحميل ثانٍ */
  resolveLoad({ setStdout() {}, setStderr() {}, runPythonAsync: async () => {} });
  await settle();
  await vm.runInContext("runPythonCode('print(1)')", h.ctx);
  assert.equal(h.log.loads, 1, 'لا تحميل مكرّر');
  assert.equal(h.els['#pyStatus'].textContent, 'T:pythonDone');
});
