// tests/pdf-docs.test.cjs — v-pdf-docs: زرّ «PDF» يقبل Word والنصوص لا الصور وحدها.
// العرض (عمران): «مااقدر احمل الملفات لي تحويل PDF… فقط صوره اقدر احمل».
// الجذر: <input accept="image/*"> (في أندرويد يفتح المعرض وحده) + runPdfFiles تُسقط كلّ ما ليس image/*.
// القرار: بلا accept، وملفّات Word/النصوص تُحوَّل داخل المتصفّح (mammoth موطَّنة) بتقسيم صفحات صحيح.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const UI = read('js/app-05-ui.js');
const FEATURES = read('js/app-10-features.js');
const HTML = read('index.html');

/* يستخرج دالّة كاملة من المصدر بمطابقة الأقواس (بلا تنفيذ بقيّة الملفّ) */
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

const ctx = { console, TextDecoder, Uint8Array, __swallow: () => {}, t: (k) => (k === 'pdfDocPage' ? 'صفحة {i}/{n}' : '[' + k + ']') };
vm.createContext(ctx);
vm.runInContext([
  "const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';",
  fnSource(UI, 'msgEscapeHtml'), fnSource(UI, 'omranPaginateBlocks'),
  fnSource(FEATURES, 'pdfKindOf'), fnSource(FEATURES, 'fmtPdf'), fnSource(FEATURES, 'readTextFile'), fnSource(FEATURES, 'textBlocks'),
  'this.msgEscapeHtml = msgEscapeHtml; this.omranPaginateBlocks = omranPaginateBlocks; this.pdfKindOf = pdfKindOf; this.fmtPdf = fmtPdf; this.readTextFile = readTextFile; this.textBlocks = textBlocks;',
].join('\n'), ctx);
const file = (name, type, bytes) => ({ name, type, arrayBuffer: async () => Uint8Array.from(bytes || []).buffer });

test('المنتقي بلا accept — image/* كان يخفي الملفّات (معرض أندرويد)', () => {
  const m = /<input type="file" id="imgToPdfInput"[^>]*>/.exec(HTML);
  assert.ok(m, 'حقل الملفّات موجود');
  assert.doesNotMatch(m[0], /accept=/);
  assert.match(m[0], /multiple/);
});

test('أنواع الملفّات: صور، docx، نصوص تُقبل؛ doc/xlsx/pptx/pdf/html تُتخطّى', () => {
  const k = (n, ty) => ctx.pdfKindOf(file(n, ty));
  assert.equal(k('a.png', 'image/png'), 'image');
  assert.equal(k('IMG_1.HEIC', ''), 'image', 'HEIC بلا نوع (هواوي) يُعرف بامتداده');
  assert.equal(k('تقرير.docx', ''), 'docx', 'امتداد docx بلا MIME (أندرويد)');
  assert.equal(k('x', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx');
  for (const n of ['a.txt', 'a.md', 'a.csv', 'a.tsv', 'a.log', 'a.json', 'a.yml']) assert.equal(k(n, ''), 'text', n);
  assert.equal(k('a', 'text/plain'), 'text');
  for (const [n, ty] of [['a.doc', 'application/msword'], ['a.xlsx', ''], ['a.pptx', ''], ['a.pdf', 'application/pdf'], ['a.html', 'text/html'], ['a.rtf', 'text/rtf'], ['', ''], ['a.exe', 'application/x-msdownload']]) {
    assert.equal(k(n, ty), 'other', n || '(بلا اسم)');
  }
});

test('قراءة النصّ: UTF-8 وUTF-16 وويندوز ١٢٥٦ (نوت باد العربيّ القديم)', async () => {
  const utf8 = Buffer.from('مرحبا بالعالم', 'utf8');
  assert.equal(await ctx.readTextFile(file('a.txt', 'text/plain', utf8)), 'مرحبا بالعالم');
  const bom16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('مرحبا', 'utf16le')]);
  assert.equal((await ctx.readTextFile(file('b.txt', '', bom16))).replace(/^﻿/, ''), 'مرحبا');
  // «مرحبا» بترميز cp1256
  const cp1256 = Buffer.from([0xE3, 0xD1, 0xCD, 0xC8, 0xC7]);
  assert.equal(await ctx.readTextFile(file('c.txt', '', cp1256)), 'مرحبا');
});

test('كتل النصّ: سطر لكلّ كتلة، الهروب من HTML، الفراغ يُحفظ، وأوّل كتلة تبدأ صفحة', () => {
  const b = ctx.textBlocks('سطر\r\n\r\n<img src=x onerror=alert(1)>\tوسم', '');
  assert.equal(b.length, 3);
  assert.equal(b[0].newpage, true);
  assert.match(b[1].html, /&nbsp;/);
  assert.doesNotMatch(b[2].html, /<img/);
  assert.match(b[2].html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(b[0].html, /dir="auto"/, 'اتّجاه السطر يُكتشف من حروفه');
  const withTitle = ctx.textBlocks('x', 'ملف<1>.txt');
  assert.equal(withTitle.length, 2);
  assert.match(withTitle[0].html, /ملف&lt;1&gt;\.txt/);
  assert.equal(withTitle[0].newpage, true, 'العنوان يفتح صفحة الملفّ الجديد');
  assert.ok(!withTitle[1].newpage);
  // سقف الأسطر: ملفّ بمئات الآلاف من الأسطر لا يُنشئ مئات الآلاف من العقد
  assert.ok(ctx.textBlocks('x\n'.repeat(100000), '').length <= 20000);
});

test('التقسيم إلى صفحات: لا تُقطع كتلة، لا صفحة فارغة، الترتيب محفوظ', () => {
  const pages = ctx.omranPaginateBlocks([300, 300, 300, 300, 300, 300, 300], 1000);
  assert.deepEqual(JSON.parse(JSON.stringify(pages)), [{ items: [0, 1, 2] }, { items: [3, 4, 5] }, { items: [6] }]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.omranPaginateBlocks([], 1000))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.omranPaginateBlocks([0, 0], 1000))), [{ items: [0, 1] }]);
});

test('التقسيم: «صفحة جديدة» تُحترم (ملفّ جديد/صورة) ولا تُنشئ صفحة فارغة في الأوّل', () => {
  const pages = ctx.omranPaginateBlocks([100, 100, 100, 100], 1000, [true, false, true, false]);
  assert.deepEqual(JSON.parse(JSON.stringify(pages)), [{ items: [0, 1] }, { items: [2, 3] }]);
});

test('التقسيم: كتلة أطول من صفحة تُقصّ إلى شرائح تغطّيها كاملة ثمّ يُستأنف التعبئة', () => {
  const pages = JSON.parse(JSON.stringify(ctx.omranPaginateBlocks([200, 2500, 200], 1000)));
  assert.deepEqual(pages, [
    { items: [0] },
    { items: [1], clipTop: 0, clipH: 1000 }, { items: [1], clipTop: 1000, clipH: 1000 }, { items: [1], clipTop: 2000, clipH: 1000 },
    { items: [2] },
  ]);
  const clips = pages.filter((p) => p.clipH);
  assert.ok(clips[clips.length - 1].clipTop + clips[clips.length - 1].clipH >= 2500, 'الشرائح تغطّي ٢٥٠٠px كاملة');
});

test('التقسيم: وثيقة طويلة — كلّ كتلة تظهر مرّة واحدة بالترتيب', () => {
  const heights = Array.from({ length: 500 }, (_, i) => 20 + (i % 7) * 15);
  const pages = JSON.parse(JSON.stringify(ctx.omranPaginateBlocks(heights, 1037)));
  const seen = pages.flatMap((p) => p.items);
  assert.deepEqual(seen, heights.map((_, i) => i));
  for (const p of pages) assert.ok(p.items.reduce((s, i) => s + heights[i], 0) <= 1037, 'الصفحة لا تتجاوز ارتفاعها');
});

test('المسار: ملفّ غير صورة يذهب لـrunPdfDocs، والصور وحدها تبقى على المسار القديم', () => {
  const body = fnSource(FEATURES, 'runPdfFiles');
  assert.match(body, /pdfKindOf\(f\) !== 'image'\)\) return runPdfDocs\(all\)/);
  assert.match(body, /if\(!files\.length\)\{ try\{ input\.value = ''/, 'الخروج المبكّر ينظّف الحقل');
  assert.match(body, /omranSaveBlob\(pdf\.output\('blob'\), 'omran-images\.pdf'\)/, 'مسار الصور كما كان');
});

test('runPdfDocs: يرتّب الملفّات، يتخطّى غير المدعوم باسمه، يبلّغ الأخطاء، لا يخسر الباقي', () => {
  const body = fnSource(FEATURES, 'runPdfDocs');
  assert.match(body, /kind === 'other'\)\{ skipped\.push/);
  assert.match(body, /omranExportPagedPdfFile\(blocks/);
  assert.match(body, /failed\.push\(/);
  assert.match(body, /source: 'doc-to-pdf'/, 'الفشل يصل لوحة أخطاء المالك');
  assert.match(body, /try\{ input\.value = ''/, 'تنظيف الحقل بعد القراءة لا قبلها');
  assert.match(body, /btn\.disabled = false/);
  assert.doesNotMatch(body, /\.\.\.part/, 'لا spread لآلاف الكتل (حدّ وسائط الدالّة)');
});

test('Word: القائمة البيضاء تُسقط أيّ وسم أو خاصّية خطرة قبل لمس الصفحة', () => {
  const body = fnSource(FEATURES, 'docxBlocks');
  assert.match(body, /script,style,iframe,object,embed,link,meta,form,svg/);
  assert.match(body, /removeAttribute\(a\.name\)/);
  assert.match(body, /data:image\\\//, 'src للصور data: فقط');
  assert.doesNotMatch(body, /'href'|"href"|onerror/i, 'لا تمرير لـhref ولا لمعالجات الأحداث');
  assert.match(body, /new DOMParser\(\)\.parseFromString/, 'التحليل في مستند خامل لا في الصفحة الحيّة');
});

test('المصدّر المقسَّم: لوحة لكلّ صفحة، سقف صفحات، نفس إصلاح الموضع، وحفظ بالمسار الموحَّد', () => {
  const body = fnSource(UI, 'omranExportPagedPdfFile');
  assert.match(body, /toCanvas\(holder,\s*\{[^}]*style:\s*\{\s*position:\s*'static',\s*left:\s*'0',\s*top:\s*'0'\s*\}/);
  assert.match(body, /omranPaginateBlocks\(heights, contentH, breaks\)/);
  assert.match(body, /maxPages/);
  assert.match(body, /await omranSaveBlob\(pdf\.output\('blob'\)/);
  assert.match(body, /holder\.remove\(\)/, 'حاوية الصفحة تُزال حتى عند الفشل');
  assert.match(body, /display:flow-root/, 'هوامش الكتلة داخل ارتفاعها المقيس');
  assert.match(body, /t\('pdfDocPage'\)/);
});

test('mammoth موطَّنة ومحمَّلة كسولًا، وترخيصها مرفق', () => {
  const lib = path.join(root, 'js/vendor/mammoth.browser.min.js');
  assert.ok(fs.statSync(lib).size > 100000, 'المكتبة موجودة');
  assert.match(fs.readFileSync(lib, 'utf8').slice(0, 400), /mammoth/);
  assert.match(fs.readFileSync(path.join(root, 'js/vendor/mammoth.LICENSE.txt'), 'utf8'), /Redistribution and use in source and binary forms/);
  assert.match(fnSource(UI, 'omranLoadMammoth'), /\/js\/vendor\/mammoth\.browser\.min\.js\?v=1/);
  assert.doesNotMatch(HTML, /mammoth/, 'لا تُحمَّل مع الصفحة — عند أوّل ملفّ Word فقط');
});

test('النصوص الأربعة في ١٤ لغة، وبلا اسم مزوّد/نموذج', () => {
  const KEYS = ['pdfDocPage', 'pdfDocSkipped', 'pdfDocTruncated', 'pdfDocFail'];
  const data = read('js/app-03-i18n-data.js');
  for (const k of KEYS) assert.equal((data.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 2, k + ' في ar وen');
  for (const lg of ['fr', 'es', 'ru', 'tr', 'id', 'fil', 'hi', 'ne', 'bn', 'ur', 'ml', 'zh']) {
    const src = read('i18n/' + lg + '.js');
    for (const k of KEYS) assert.ok(src.includes('"' + k + '"'), lg + ' ينقصها ' + k);
    const i = src.indexOf('"pdfDocPage"');
    assert.match(src.slice(i, i + 900), /\{i\}[\s\S]*\{n\}/, lg + ': عناصر الصفحة {i}/{n}');
    assert.ok(/\{names\}/.test(src.slice(src.indexOf('"pdfDocSkipped"'), src.indexOf('"pdfDocSkipped"') + 600)), lg + ': {names}');
  }
  const blob = KEYS.map((k) => { const i = data.indexOf(k + ':'); return data.slice(i, i + 400); }).join('\n');
  assert.doesNotMatch(blob, /claude|gemini|gpt|groq|openai|anthropic|كلود|جيمناي/i);
  assert.equal(ctx.fmtPdf('pdfDocPage', { i: 2, n: 5 }), 'صفحة 2/5');
  assert.equal(ctx.fmtPdf('pdfDocFail', { why: 'x' }), '[pdfDocFail]', 'نصّ بلا عناصر لا يتأثّر');
  assert.equal(ctx.fmtPdf('pdfDocPage', {}), 'صفحة {i}/{n}', 'عنصر ناقص يبقى ظاهرًا لا undefined');
});

test('وسم تحميل اللغات مرفوع (نصوص جديدة في الملفّات المنفصلة)', () => {
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=731'"));
});
