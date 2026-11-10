'use strict';
/* v-pptx-audit / v-xlsx-pdf-calc / v-docx / v-dl-unified (طلب المالك ٩ نوفمبر: «افحص الباور بوينت كامل… من أ إلى ي… كل ملفات التحميل»).
   الفحص بنى الملفّات الحقيقيّة في Chromium وفتحها في LibreOffice ورسمها صورًا. كلّ اختبار هنا يفشل على ما قبل الإصلاح:
   ١–٥ PowerPoint (المكتبة المضمَّنة نفسها): اتّجاه النقاط ولغتها، «24 ساعة»، نسب الدائرة، ترتيب الأعمدة الأفقيّة، النصّ الطويل داخل الشريحة.
   ٦ نصّ الأداة للنموذج: العرض بلا زرّ PDF.
   ٧–٩ Excel وPDF الطباعة: صفحة واحدة لكشف ٢٥ صفًّا، والمعادلات والمجاميع والعملة والألوان والصفحة الأفقيّة في PDF، والحاسبة.
   ١٠ صفحات PDF الأفقيّة في المصدّر المشترك.
   ١١ Word ‎.docx‎ حقيقيّ: ZIP سليم (CRC) وأجزاء الحزمة.
   ١٢ تنزيل كود التطبيق وجدول الكمّيّات عبر مسار الحفظ الموحّد، واسم الملفّ في الكرت باتّجاهه. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { sanitizeSpec, createFile } = require(path.join(root, 'api/_lib/office.js'));

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
/* فكّ ZIP (مخزّن أو deflate) من الدليل المركزيّ: { اسم: Buffer } */
function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  assert.ok(e >= 0, 'نهاية الدليل المركزيّ');
  const n = buf.readUInt16LE(e + 10), out = {};
  let p = buf.readUInt32LE(e + 16);
  for (let k = 0; k < n; k++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8');
    const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28);
    const raw = buf.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    const data = method === 0 ? raw : zlib.inflateRawSync(raw);
    if (typeof zlib.crc32 === 'function') assert.equal(zlib.crc32(data) >>> 0, crc, 'CRC ' + name);
    out[name] = data;
    p += 46 + nl + xl + cl;
  }
  return out;
}
/* app-44 في سياق معزول، والمكتبتان المضمَّنتان (PptxGenJS وExcelJS) تُحمَّلان كما في المتصفّح */
function officeEnv() {
  const ctx = {
    console, Blob, Uint8Array, ArrayBuffer, Promise, Date, Math, JSON, Object, Array, String, Number, Error, TextEncoder, TextDecoder, Intl, Buffer,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, setImmediate, queueMicrotask,
    __swallow: () => {}, t: (k) => k, localStorage: { getItem: () => '1', setItem() {} }, navigator: { userAgent: 'test' },
  };
  ctx.window = ctx; ctx.self = ctx; ctx.global = ctx; ctx.globalThis = ctx;
  ctx.document = {
    getElementById: () => null,
    createElement: (tag) => (tag === 'script' ? { tag } : { style: {}, getContext() { throw new Error('no canvas'); } }),
    head: { appendChild(s) {
      try { vm.runInContext(read(s.src.replace(/^\//, '').replace(/\?.*$/, '')), ctx); setImmediate(() => s.onload()); }
      catch (e) { setImmediate(() => s.onerror(e)); }
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(read('js/app-44-office.js'), ctx);
  return ctx.omranOffice;
}
const office = officeEnv();
const officeX = officeEnv(); /* ExcelJS في سياق منفصل: تحميله بعد PptxGenJS في سياق vm واحد يتعارض (في المتصفّح يعملان معًا) */
const spec = (o) => { const r = sanitizeSpec(o); assert.ok(r.spec, r.error); return r.spec; };
async function pptxParts(s) { return unzip(Buffer.from(await (await office.buildPptx(s)).arrayBuffer())); }
const slideXml = (parts, n) => parts['ppt/slides/slide' + n + '.xml'].toString('utf8');
const paraList = (xml) => xml.match(/<a:p>.*?<\/a:p>/g) || [];

const AR_DECK = spec({ kind: 'pptx', lang: 'ar', title: 'إدارة الأزمات', fileName: 'إدارة الأزمات', slides: [
  { layout: 'bullets', title: 'أنواع الأزمات', bullets: ['الأزمات الطبيعية: الزلازل والفيضانات', 'أزمات السمعة: «لا تعليق» خطأ', 'أزمات مالية'] },
  { layout: 'stats', title: 'أرقام', stats: [{ value: '69%', label: 'من القادة' }, { value: '24 ساعة', label: 'الفترة الذهبية' }] },
  { layout: 'chart', title: 'توزيع', chart: { type: 'pie', labels: ['تقنية', 'سمعة', 'مالية'], series: [{ name: 'النسبة', values: [50, 30, 20] }] } },
  { layout: 'chart', title: 'جاهزية الأقسام', chart: { type: 'bar', labels: ['الإعلام', 'التقنية', 'المالية'], series: [{ name: 'الجاهزية', values: [80, 65, 70] }] } },
] });

test('١. PowerPoint عربيّ: كلّ فقرة نقطة يمين-يسار (rtl="1") ولغة النصّ ar-SA — كان العنوان وحده rtl وكلّ النصّ en-US', async () => {
  const xml = slideXml(await pptxParts(AR_DECK), 1);
  const bullets = paraList(xml).filter((p) => p.includes('buChar'));
  assert.equal(bullets.length, 3, 'ثلاث نقاط');
  for (const p of bullets) assert.match(p, /<a:pPr[^>]*rtl="1"/, 'نقطة rtl: ' + p.slice(0, 120));
  assert.doesNotMatch(xml, /<a:rPr lang="en-US"/, 'لا نصّ en-US في عرض عربيّ');
  assert.match(xml, /<a:rPr lang="ar-SA"/);
});

test('٢. بطاقة الأرقام: «24 ساعة» فقرة rtl (كانت تُقرأ «ساعة 24») و«69%» تبقى كما هي', async () => {
  const xml = slideXml(await pptxParts(AR_DECK), 2);
  const of = (s) => paraList(xml).find((p) => p.includes('<a:t>' + s + '</a:t>'));
  assert.match(of('24 ساعة'), /<a:pPr[^>]*rtl="1"/);
  assert.doesNotMatch(of('69%'), /rtl="1"/);
});

test('٣–٤. الرسم الدائريّ: النسب بيضاء في وسط الشريحة (كانت رماديّة داكنة على الكحليّ)؛ والأعمدة الأفقيّة: أوّل بند في الأعلى', async () => {
  const parts = await pptxParts(AR_DECK);
  const charts = Object.keys(parts).filter((k) => /^ppt\/charts\/chart\d+\.xml$/.test(k)).map((k) => parts[k].toString('utf8'));
  const pie = charts.find((x) => x.includes('<c:pieChart>')), bar = charts.find((x) => x.includes('<c:barDir val="bar"/>'));
  assert.ok(pie && bar, 'الرسمان');
  const dl = pie.slice(pie.indexOf('<c:dLbls>'), pie.indexOf('</c:dLbls>'));
  assert.match(dl, /<c:dLblPos val="ctr"\/>/);
  assert.match(dl, /<a:srgbClr val="FFFFFF"\/>/);
  /* PowerPoint يرسم الفئة الأولى أسفل الأعمدة الأفقيّة — فتُكتب مقلوبة: «الإعلام» آخرًا */
  const cats = [...bar.slice(bar.indexOf('<c:cat>'), bar.indexOf('</c:cat>')).matchAll(/<c:v>([^<]*)<\/c:v>/g)].map((m) => m[1]);
  assert.deepEqual(cats, ['المالية', 'التقنية', 'الإعلام']);
});

test('٥. النصّ الطويل في حدود المخطّط يُصغَّر ليبقى داخل الشريحة، والعاديّ بحجمه كما كان', async () => {
  const long = (n) => 'نص طويل جدًا لاختبار الالتفاف داخل الصندوق وعدم خروجه عن حدود الشريحة '.repeat(5).slice(0, n);
  const parts = await pptxParts(spec({ kind: 'pptx', lang: 'ar', title: 'x', slides: [
    { layout: 'bullets', title: long(100), bullets: Array.from({ length: 8 }, () => long(160)) },
    { layout: 'table', title: 'جدول', table: { headers: Array.from({ length: 8 }, (_, i) => 'عمود رقم ' + (i + 1) + ' طويل'), rows: Array.from({ length: 12 }, (_, r) => Array.from({ length: 8 }, (_, c) => 'قيمة ' + r + '-' + c + ' نص أطول قليلًا')) } },
    { layout: 'bullets', title: 'عنوان قصير', bullets: ['نقطة عاديّة أولى', 'نقطة عاديّة ثانية'] },
  ] }));
  const sizes = (xml, pred) => paraList(xml).filter(pred).map((p) => Number((/sz="(\d+)"/.exec(p) || [])[1]));
  const s1 = slideXml(parts, 1), s3 = slideXml(parts, 3);
  const longB = sizes(s1, (p) => p.includes('buChar')), shortB = sizes(s3, (p) => p.includes('buChar'));
  assert.ok(longB.length === 8 && longB.every((z) => z < 1700), 'ثماني نقاط طويلة تصغر عن ١٧: ' + longB);
  assert.deepEqual(shortB, [2000, 2000], 'نقطتان قصيرتان بحجمهما (٢٠)');
  assert.ok(sizes(s1, (p) => !p.includes('buChar') && p.includes('نص طويل'))[0] < 3000, 'العنوان الطويل يصغر عن ٣٠');
  assert.equal(sizes(s3, (p) => p.includes('عنوان قصير'))[0], 3000, 'العنوان القصير ٣٠');
  /* الجدول: مجموع ارتفاع الصفوف (EMU) لا يتجاوز أسفل الشريحة (٧٫٥ − ٠٫٦ − ١٫٥٥ بوصة) — كان صفّه الأخير يُقصّ */
  const rows = [...slideXml(parts, 2).matchAll(/<a:tr h="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(rows.length, 13);
  assert.ok(rows.reduce((a, b) => a + b, 0) <= (7.5 - 0.6 - 1.55) * 914400 + 1, 'الجدول داخل الشريحة: ' + rows.reduce((a, b) => a + b, 0));
});

test('٦. ردّ الأداة للنموذج: العرض «بزرّي التحميل والمشاركة» بلا PDF (كان يَعِد بـPDF للطباعة)، وExcel معه PDF', async () => {
  const ctx = { subscriber: true };
  const p = await createFile({ kind: 'pptx', title: 'عرض', slides: [{ title: 'أ', bullets: ['ب'] }] }, ctx);
  const x = await createFile({ kind: 'xlsx', title: 'جدول', sheets: [{ columns: [{ header: 'أ' }] }] }, ctx);
  assert.doesNotMatch(p.result, /PDF/);
  assert.match(x.result, /PDF للطباعة/);
});

const XL = spec({ kind: 'xlsx', lang: 'ar', title: 'كشف', fileName: 'كشف', sheets: [
  { name: 'اليومي', title: 'سجل الحضور', subtitle: 'نوفمبر', fields: ['اسم الجهة', 'القسم', 'المشرف', 'التاريخ'],
    columns: [{ header: 'م', type: 'index' }, { header: 'الاسم', type: 'text', width: 26 }, { header: 'الحضور', type: 'time' }, { header: 'الانصراف', type: 'time' }, { header: 'الساعات', type: 'hours' }, { header: 'الحالة', type: 'choice', choices: ['حاضر', 'غائب'] }, { header: 'التوقيع', type: 'signature' }],
    rows: [[1, 'أحمد', '08:00', '16:30', '', 'حاضر', ''], [2, 'سارة', '08:20', '16:00', '', 'غائب', '']], blankRows: 23,
    totals: { label: 'الإجمالي', ops: { '5': 'sum' } }, highlight: [{ value: 'غائب', color: 'red' }], signatures: ['المشرف', 'المدير'], note: 'ملاحظة' },
  { name: 'الشهري', title: 'الشهري', columns: [{ header: 'م', type: 'index' }, { header: 'الاسم', type: 'text' }], blankRows: 10, days: { month: '2026-11', choices: ['ح', 'غ'] } },
  { name: 'المصاريف', title: 'المصاريف', columns: [{ header: 'م', type: 'index' }, { header: 'البند', type: 'text' }, { header: 'الكمية', type: 'number' }, { header: 'السعر', type: 'currency', currency: 'ر.س' }, { header: 'الإجمالي', type: 'formula', formula: '=IF({c3}="","",{c3}*{c4})', format: 'currency' }],
    rows: [[1, 'قرطاسية', 10, 15.5, ''], [2, 'صيانة', 1, 450, '']], blankRows: 3, totals: { label: 'المجموع', ops: { '5': 'sum' } } },
  { name: 'طويل', title: 'طويل', columns: [{ header: 'م', type: 'index' }, { header: 'الاسم', type: 'text' }], blankRows: 200 },
] });

test('٧. Excel: كشف ٢٥ صفًّا بترويسته وتواقيعه يُطبع صفحة واحدة (كانت التواقيع وحدها في صفحة ثانية)، و٢٠٠ صفّ صفحات كما كان', async () => {
  const parts = unzip(Buffer.from(await (await officeX.buildXlsx(XL)).arrayBuffer()));
  const ps = (n) => /<pageSetup[^>]*>/.exec(parts['xl/worksheets/sheet' + n + '.xml'].toString('utf8'))[0];
  assert.match(ps(1), /fitToHeight="1"/);
  assert.match(ps(2), /orientation="landscape"/);
  assert.match(ps(4), /fitToHeight="0"/);
});

test('٨. PDF الطباعة: المعادلة تُحسب، والعملة بتنسيقها، وسطر المجاميع، والألوان الشرطيّة، وشبكة الأيّام أفقيّة — كانت المعادلة فارغة ولا مجاميع', () => {
  const blocks = office.xlsxPdfBlocks(XL);
  const all = blocks.map((b) => b.html).join('\n');
  assert.match(all, />155\.00</, 'الإجمالي = ١٠ × ١٥٫٥');
  assert.match(all, />450\.00</);
  assert.match(all, />15\.50 ر\.س</, 'العملة');
  assert.match(all, />605\.00</, 'المجموع');
  assert.match(all, />16\.2</, 'مجموع الساعات ٨٫٥ + ٧٫٧ (٧٫٦٧)');
  assert.match(all, /colspan="4"[^>]*>الإجمالي</, 'عنوان المجاميع حتّى أوّل عمود مجموع كما في Excel');
  assert.match(all, /background:#FFC7CE;color:#9C0006;font-weight:700">غائب</, 'لون «غائب»');
  const land = blocks.filter((b) => b.landscape).map((b) => b.html).join('');
  assert.ok(land.includes('الشهري') && !land.includes('المصاريف'), 'ورقة الأيّام وحدها أفقيّة');
});

test('٩. حاسبة المعادلات: الأولويّة، IF وIFERROR كسولتان، النصوص والمقارنة بالفراغ، والمجهول يرمي', () => {
  const ev = (f, cells) => office.fxEval(f, (n) => (cells || {})[n] === undefined ? '' : cells[n]);
  assert.equal(ev('=1+2*3^2'), 19);
  assert.equal(ev('=(1+2)*3'), 9);
  assert.equal(ev('=-{c1}+10%', { 1: 2 }), -1.9);
  assert.equal(ev('=IF({c3}="","",{c3}*{c4})', { 3: 10, 4: 15.5 }), 155);
  assert.equal(ev('=IF({c3}="","",{c3}*{c4})', {}), '');
  assert.equal(ev('=IFERROR({c1}/{c2},"—")', { 1: 5, 2: 0 }), '—');
  assert.equal(ev('=IF({c1}>=50,"ناجح","راسب")', { 1: 72 }), 'ناجح');
  assert.equal(ev('={c1}&" "&{c2}', { 1: 'أحمد', 2: 'علي' }), 'أحمد علي');
  assert.equal(ev('=ROUND(SUM({c1},{c2},3)/3;1)', { 1: 1, 2: 2 }), 2);
  assert.equal(ev('=AND({c1}>0,OR({c2}="ح",{c2}="ت"))', { 1: 1, 2: 'ت' }), true);
  assert.equal(ev('=MOD(-1,24)'), 23);
  assert.throws(() => ev('=VLOOKUP(1,2,3)'));
  assert.throws(() => ev('={c1}/0', { 1: 1 }));
  assert.throws(() => ev('=1+'));
});

test('١٠. المصدّر المشترك: كتلة landscape صفحة A4 أفقيّة (اختياريّ لكلّ كتلة)، وتغيّر الاتّجاه يبدأ صفحة، وبقيّة المصادر كما كانت', () => {
  const UI = read('js/app-05-ui.js');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fnSource(UI, 'omranPaginateBlocks'), ctx);
  /* ارتفاع الصفحة لكلّ كتلة: الأفقيّة ٧٠٨ والعموديّة ١٠٣٧ */
  const pages = JSON.parse(JSON.stringify(vm.runInContext('omranPaginateBlocks([400, 400, 400, 400], (i) => (i >= 2 ? 708 : 1037), [false, false, true, false])', ctx)));
  assert.deepEqual(pages, [{ items: [0, 1] }, { items: [2] }, { items: [3] }]);
  const fn = fnSource(UI, 'omranExportPagedPdfFile');
  assert.match(fn, /pdf\.addPage\('a4', pageLand\(pg\) \? 'landscape' : 'portrait'\)/);
  assert.match(fn, /orientation: pageLand\(pages\[0\]\) \? 'landscape' : 'portrait'/);
  assert.match(fn, /landAt\(i\) !== landAt\(i - 1\)/, 'تغيّر الاتّجاه = صفحة جديدة');
  assert.match(fn, /const anyLand = blocks\.some/, 'بلا كتلة أفقيّة لا قياس ثانٍ');
});

test('١١. Word: ‎.docx‎ حقيقيّ — ZIP سليم بـCRC صحيح وأجزاء الحزمة الخمسة وXML بلا محارف ممنوعة (كان HTML باسم ‎.doc‎)', async () => {
  const UI = read('js/app-05-ui.js');
  const saved = [];
  const ctx = { console, Blob, TextEncoder, msgSaveExport: (b, n) => saved.push({ b, n }) };
  vm.createContext(ctx);
  const from = UI.indexOf('function msgExportParse'), to = UI.indexOf('function msgExportInline');
  vm.runInContext([UI.slice(from, to), fnSource(UI, 'omranCrc32'), fnSource(UI, 'omranZipStore'), fnSource(UI, 'msgDocxRuns'), fnSource(UI, 'msgDocxXml'), fnSource(UI, 'msgDocxBlob'), fnSource(UI, 'exportReplyAsWord')].join('\n'), ctx);
  ctx.exportReplyAsWord('## عنوان\nنصّ **عريض** وتحكّم \u0001 ممنوع & <وسم>\n| أ | ب |\n|---|---|\n| ١ | ٢ |');
  assert.equal(saved[0].n, 'omran-ai-reply.docx');
  assert.equal(saved[0].b.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const parts = unzip(Buffer.from(await saved[0].b.arrayBuffer()));
  assert.deepEqual(Object.keys(parts).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml']);
  const doc = parts['word/document.xml'].toString('utf8');
  assert.doesNotMatch(doc, /[\u0001]/, 'لا محرف تحكّم في XML');
  assert.match(doc, /&amp; &lt;وسم&gt;/);
  assert.match(doc, /<w:tbl><w:tblPr><w:bidiVisual\/>/);
  assert.match(parts['[Content_Types].xml'].toString('utf8'), /wordprocessingml\.document\.main\+xml/);
});

test('١٢. تنزيل كود التطبيق (HTML/Python/ZIP) وجدول الكمّيّات CSV عبر مسار الحفظ الموحّد، واسم الملفّ في كرت Office باتّجاهه', () => {
  const co = fnSource(read('js/app-06-checkout.js'), 'omranSaveOrShareFile');
  assert.match(co, /^async function omranSaveOrShareFile\(blob, fname\)\{\s*\/\*[\s\S]*?\*\/\s*if\(typeof omranSaveBlob === 'function'\) return omranSaveBlob\(blob, fname\);/);
  const boq = read('js/app-13-stocks-init.js');
  assert.match(boq, /msgSaveExport\(new Blob\(\[csv\], \{ type: 'text\/csv;charset=utf-8' \}\), 'omran-boq\.csv'\); return; \}/);
  assert.match(read('js/app-44-office.js'), /nameEl\.dir = 'auto';/);
});
