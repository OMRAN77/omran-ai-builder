'use strict';
/* v-audit-attach (فحص التطبيق كاملًا — مجموعة «المرفقات» في js/app-09-attach.js):
   cli-chat-attach-3 — وثائق Word/Excel/PowerPoint كانت تصل للنموذج XML خامًا مقصوصًا (styles وtheme، ونصف الوثيقة يضيع).
   cli-chat-attach-4 — الملفّات الثنائيّة (صوت، doc/xls القديمة، أرشيفات rar/7z/apk) تُقرأ نصًّا وتُرسل حروفًا تالفة.
   cli-chat-attach-6 — الإيقاف أثناء «اسأل الكل»/البناء يترك فقاعة ⏳ عالقة ومؤقّت عرض حيًّا، ويُسقط الردّ الجزئيّ من السياق.
   cli-chat-attach-8 · x-i18n-6 — نصوص واجهة بلغتين فقط، وبعضها يعرض العربيّة لكلّ لغة غير الإنجليزيّة (والأورديّة عربيّة).
   الدوالّ الحقيقيّة تُستخرج من الملفّ بـacorn وتُشغَّل في vm بـDOM مزيّف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const AST = acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'script' });
/* تصريح أعلى الملفّ باسمه (دالّة أو const/let/var)؛ opt = لا يُشترط وجوده (اسم يضيفه الإصلاح) */
function decl(name, opt) {
  const n = AST.body.find((x) => (x.type === 'FunctionDeclaration' && x.id && x.id.name === name)
    || (x.type === 'VariableDeclaration' && x.declarations.some((d) => d.id && d.id.name === name)));
  if (!n) { assert.ok(opt, 'تصريح مفقود: ' + name); return ''; }
  return SRC.slice(n.start, n.end).replace(/^(const|let)\s/, 'var ');
}
const OPT = ['omranAttachT', 'omranXmlText', 'omranXlsxShared', 'omranXlsxSheetText', 'omranOfficeZipText', 'OMRAN_BINARY_EXT_RE', 'omranIsBinaryAttach', 'omranAskAllSealStop'];
const optSrc = () => OPT.map((n) => decl(n, true)).filter(Boolean).join('\n');

function baseCtx(extra) {
  const ctx = Object.assign({
    console: { log() {}, warn() {}, error() {} }, Promise, Object, Array, String, Number, Math, JSON, Map, Set, RegExp, Error, parseInt, isFinite,
    window: {}, lang: 'ar', I18N: { ar: {}, en: {} }, __swallow() {},
    t(k) { const d = ctx.I18N[ctx.lang] || {}; if (d[k] !== undefined) return d[k]; if (ctx.I18N.en[k] !== undefined) return ctx.I18N.en[k]; return k; },
    setInterval: () => 0, clearInterval: () => {},
  }, extra || {});
  vm.createContext(ctx);
  return ctx;
}

// ── cli-chat-attach-3: وثائق Office ──
function fakeZip(files) {
  const o = {};
  for (const [n, s] of Object.entries(files)) o[n] = { dir: false, async: async () => s };
  return { files: o };
}
function unzipCtx(zip) {
  const ctx = baseCtx();
  ctx.window.JSZip = { loadAsync: async (buf) => buf.__zip };
  vm.runInContext(optSrc() + '\n' + decl('unzipInBrowser'), ctx);
  return (name) => ctx.unzipInBrowser({ name, size: 1000, arrayBuffer: async () => ({ __zip: zip }) });
}
const CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>';
const para = (i) => '<w:p w:rsidR="00A1B2C3" w:rsidRDefault="00A1B2C3"><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:after="160" w:line="259" w:lineRule="auto"/><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:rtl/></w:rPr></w:pPr>'
  + '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:rtl/></w:rPr><w:t xml:space="preserve">فقرة رقم ' + i + ': </w:t></w:r>'
  + '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:rtl/></w:rPr><w:t>نصّ حقيقيّ من التقرير السنويّ للشركة</w:t></w:r></w:p>';
function docx(n, extraBody) {
  let body = '';
  for (let i = 1; i <= n; i++) body += para(i);
  return fakeZip({
    '[Content_Types].xml': CT,
    '_rels/.rels': '<Relationships/>',
    'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + (extraBody || '') + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>',
    'word/styles.xml': '<w:styles>' + '<w:style w:styleId="STYLE_MARKER"><w:name w:val="Normal"/></w:style>'.repeat(400) + '</w:styles>',
    'word/theme/theme1.xml': '<a:theme name="THEME_MARKER"/>',
    'word/numbering.xml': '<w:numbering>NUMBERING_MARKER</w:numbering>',
  });
}

test('cli-chat-attach-3 ① docx من ٦٠٠ فقرة: الفقرات كلّها، كلّ فقرة في سطر، بلا وسوم ولا styles/theme', async () => {
  const out = await unzipCtx(docx(600))('report.docx');
  const lines = out.split('\n');
  for (let i = 1; i <= 600; i++) assert.ok(lines.includes('فقرة رقم ' + i + ': نصّ حقيقيّ من التقرير السنويّ للشركة'), 'الفقرة ' + i + ' مفقودة أو ملتصقة');
  assert.doesNotMatch(out, /<\/?w:|STYLE_MARKER|THEME_MARKER|NUMBERING_MARKER|Content_Types/);
  const realText = 600 * ('فقرة رقم 000: نصّ حقيقيّ من التقرير السنويّ للشركة'.length + 1);
  assert.ok(out.length < realText * 1.3, 'الحجم قريب من النصّ الحقيقيّ لا أضعافه: ' + out.length);
});

test('cli-chat-attach-3 ② النصّ المقسوم على أكثر من run يلتئم، والكيانات تُفكّ، و<w:tab/>/<w:br/> فواصل', async () => {
  const extra = '<w:p><w:r><w:t>Hel</w:t></w:r><w:r><w:t>lo &amp; &lt;world&gt; &#1593;</w:t></w:r><w:r><w:tab/><w:t>X</w:t><w:br/><w:t>Y</w:t></w:r></w:p>';
  const out = await unzipCtx(docx(1, extra))('a.docx');
  assert.ok(out.split('\n').includes('Hello & <world> ع\tX'), out);
  assert.ok(out.split('\n').includes('Y'));
});

test('cli-chat-attach-3 ③ xlsx: الخلايا بنصوصها المشتركة صفًّا صفًّا وبأعمدتها، والأوراق بترتيبها', async () => {
  const zip = fakeZip({
    '[Content_Types].xml': CT,
    'xl/workbook.xml': '<workbook><sheets><sheet name="Sales" sheetId="1"/></sheets></workbook>',
    'xl/styles.xml': '<styleSheet>STYLE_MARKER</styleSheet>',
    'xl/sharedStrings.xml': '<sst count="4"><si><t>الاسم</t></si><si><t>الدرجة</t></si><si><r><rPr><b/></rPr><t>أحمد</t></r><r><t xml:space="preserve"> علي</t></r></si><si><t>R&amp;D</t><rPh><t>PHONETIC</t></rPh></si></sst>',
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>ورقة ثانية</t></is></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet1.xml': '<worksheet><cols><col min="1" max="2" width="12"/></cols><sheetData>'
      + '<row r="1" spans="1:2"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s" s="1"><v>1</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="3"/><c r="C2"><f>SUM(1,2)</f><v>95</v></c></row>'
      + '<row r="3"><c r="B3" t="s"><v>3</v></c></row></sheetData></worksheet>',
  });
  const out = await unzipCtx(zip)('grades.xlsx');
  const lines = out.split('\n');
  assert.ok(lines.includes('الاسم\tالدرجة'), out);
  assert.ok(lines.includes('أحمد علي\t\t95'), out);
  assert.ok(lines.includes('\tR&D'), out);
  assert.doesNotMatch(out, /<v>|<c |STYLE_MARKER|PHONETIC/);
  assert.ok(out.indexOf('الاسم') < out.indexOf('ورقة ثانية'), 'sheet1 قبل sheet2');
});

test('cli-chat-attach-3 ④ pptx: الشرائح بترتيبها العدديّ (١ ثمّ ٢ ثمّ ١٠)، وكلّ فقرة في سطر', async () => {
  const sl = (s) => '<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="ar"/><a:t>' + s + '</a:t></a:r></a:p><a:p><a:r><a:t>' + s + ' تفصيل</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
  const zip = fakeZip({ '[Content_Types].xml': CT, 'ppt/slides/slide10.xml': sl('عاشرة'), 'ppt/slides/slide2.xml': sl('ثانية'), 'ppt/slides/slide1.xml': sl('أولى'), 'ppt/theme/theme1.xml': '<a:theme>THEME_MARKER</a:theme>' });
  const out = await unzipCtx(zip)('deck.pptx');
  const lines = out.split('\n');
  assert.ok(lines.includes('أولى') && lines.includes('أولى تفصيل'), out);
  assert.ok(out.indexOf('أولى') < out.indexOf('ثانية') && out.indexOf('ثانية') < out.indexOf('عاشرة'), 'ترتيب عدديّ');
  assert.doesNotMatch(out, /<a:|THEME_MARKER/);
});

test('cli-chat-attach-3 ⑤ وثيقة Office بلا نصّ = خطأ فيكمل المسار إلى الخادم؛ وأرشيف الكود كما كان', async () => {
  const empty = fakeZip({ '[Content_Types].xml': CT, 'word/document.xml': '<w:document><w:body><w:p/></w:body></w:document>', 'word/styles.xml': '<w:styles/>' });
  await assert.rejects(() => unzipCtx(empty)('empty.docx'));
  const code = fakeZip({ 'src/app.js': 'console.log(1);', 'config/site.xml': '<site name="x"/>', 'node_modules/x/i.js': 'NO' });
  const out = await unzipCtx(code)('proj.zip');
  assert.match(out, /--- src\/app\.js ---\nconsole\.log\(1\);/);
  assert.match(out, /--- config\/site\.xml ---\n<site name="x"\/>/, 'xml في أرشيف عاديّ يبقى نصًّا كما هو');
  assert.doesNotMatch(out, /NO/);
});

// ── cli-chat-attach-4: الملفّات الثنائيّة ──
function ingestCtx(readImpl, langCode, dict) {
  const reads = [];
  const ctx = baseCtx({ lang: langCode || 'ar', renderAttachStrip() {}, omranPickerDiag() {} });
  if (dict) ctx.I18N[langCode] = dict;
  ctx.readFileAsText = async (f) => { reads.push(f.name); return readImpl(f); };
  vm.runInContext('var pendingAttachments = [];\n' + ['MAX_TEXT_ATTACH_CHARS', 'MAX_ATTACH_FILE_BYTES', 'ARCHIVE_EXT_RE', 'IMAGE_TYPES', 'IMAGE_EXT_RE', 'isImageAttachment', 'omranIngestFiles'].map((n) => decl(n)).join('\n') + '\n' + optSrc(), ctx);
  return { ctx, reads };
}
const garbage = (n) => { let s = ''; for (let i = 0; i < n; i++) s += (i % 3 === 0 ? '�' : String.fromCharCode(33 + (i % 90))); return s; };

test('cli-chat-attach-4 ① رسالة صوتيّة ‎.ogg‎ (٢ م.ب) و‎.doc‎ قديم و‎.apk‎: شريحة خطأ بلا قراءة ولا إرسال للحروف التالفة', async () => {
  const { ctx, reads } = ingestCtx(() => garbage(450000));
  await ctx.omranIngestFiles([
    { name: 'voice-note.ogg', type: 'audio/ogg', size: 2e6 },
    { name: 'تقرير قديم.doc', type: '', size: 300000 },
    { name: 'game.apk', type: 'application/vnd.android.package-archive', size: 5e6 },
    { name: 'song.m4a', type: '', size: 4e6 },
  ]);
  assert.equal(ctx.pendingAttachments.length, 4);
  for (const a of ctx.pendingAttachments) {
    assert.equal(a.error, true, a.name + ' يجب أن يكون شريحة خطأ');
    assert.ok(a.text.length < 400 && !a.text.includes('�'), a.name + ': بلا حروف تالفة');
    assert.ok(a.text.includes(a.name));
  }
  assert.deepEqual(reads, [], 'لا قراءة نصّيّة لملفّ ثنائيّ معروف');
});

test('cli-chat-attach-4 ② امتداد مجهول بمحتوى ثنائيّ (NUL أو حروف تالفة كثيرة) يُكشف من العيّنة بعد القراءة', async () => {
  const { ctx } = ingestCtx((f) => (f.name === 'a.dat' ? 'MZ\u0000\u0000\u0003' + 'x'.repeat(5000) : garbage(20000)));
  await ctx.omranIngestFiles([{ name: 'a.dat', type: '', size: 5005 }, { name: 'blob', type: 'application/octet-stream', size: 20000 }]);
  assert.deepEqual(Array.from(ctx.pendingAttachments, (a) => a.error), [true, true]);
  assert.ok(ctx.pendingAttachments.every((a) => a.text.length < 400));
});

test('cli-chat-attach-4 ③ النصّ الحقيقيّ يمرّ كما كان: عربيّ وCSV فيه حرف تالف واحد، ومخطّط ‎.dot‎ وقالب ‎.pot‎ النصّيّان', async () => {
  const ar = 'السلام عليكم، هذا ملفّ ملاحظات عربيّ.\n'.repeat(200);
  const csv = 'name,score\n' + 'a,1\n'.repeat(3000) + 'b�,2\n';
  const dot = 'digraph G { a -> b; b -> c; }\n';
  const pot = 'msgid "Hello"\nmsgstr ""\n';
  const word97 = 'ÐÏ\u0011à¡±\u001aá\u0000\u0000' + 'x'.repeat(3000); // قالب Word قديم ‎.dot‎ ثنائيّ
  const by = { 'notes.txt': ar, 'data.csv': csv, 'graph.dot': dot, 'messages.pot': pot, 'letter.dot': word97 };
  const { ctx } = ingestCtx((f) => by[f.name]);
  await ctx.omranIngestFiles([{ name: 'notes.txt', type: 'text/plain', size: 9000 }, { name: 'data.csv', type: 'text/csv', size: 12000 },
    { name: 'graph.dot', type: '', size: 40 }, { name: 'messages.pot', type: '', size: 30 }, { name: 'letter.dot', type: 'application/msword', size: 3010 }]);
  assert.deepEqual(Array.from(ctx.pendingAttachments.slice(0, 4), (a) => [a.error || false, a.text]), [[false, ar], [false, csv], [false, dot], [false, pot]]);
  assert.equal(ctx.pendingAttachments[4].error, true, 'قالب Word الثنائيّ تكشفه العيّنة');
});

test('cli-chat-attach-4 ④ نصّ الشريحة بلغة الواجهة: مفتاح الفرنسيّة إن وُجد، والأورديّة بلا مفتاح = إنجليزيّة لا عربيّة', async () => {
  let r = ingestCtx(() => '', 'fr', { axAttachBinary: 'FORMAT_FR' });
  await r.ctx.omranIngestFiles([{ name: 'v.ogg', type: 'audio/ogg', size: 10 }]);
  assert.match(r.ctx.pendingAttachments[0].text, /FORMAT_FR/);
  r = ingestCtx(() => '', 'ur');
  await r.ctx.omranIngestFiles([{ name: 'v.ogg', type: 'audio/ogg', size: 10 }]);
  assert.doesNotMatch(r.ctx.pendingAttachments[0].text, /[؀-ۿ]/, 'لا عربيّة لمستخدم الأورديّة');
});

// ── cli-chat-attach-6: الإيقاف أثناء «اسأل الكل» ──
function sealCtx() {
  const cleared = [];
  const ctx = baseCtx({ clearInterval: (id) => cleared.push(id) });
  vm.runInContext(optSrc(), ctx);
  assert.equal(typeof ctx.omranAskAllSealStop, 'function', 'دالّة ختم الإيقاف غير موجودة — الإيقاف يترك الفقاعات _loading');
  return { ctx, cleared };
}

test('cli-chat-attach-6 ① مزوّد واحد بلا نصّ بعد: الفقاعة الفارغة تُحذف فيضيف الإمساك الخارجيّ رسالة الإيقاف، ومؤقّت العرض يُطفأ', () => {
  const { ctx, cleared } = sealCtx();
  const user = { role: 'user', content: 'ابني لي متجر…' };
  const ph = { role: 'assistant', content: '', _loading: true, _uid: 5 };
  const cur = { messages: [user, ph] };
  const rs = new Map([[5, { target: '', shown: 0, done: false, timer: 77 }]]);
  ctx.omranAskAllSealStop(cur, [ph], { role: 'assistant', _loading: true }, rs);
  assert.deepEqual(cleared, [77]);
  assert.equal(rs.size, 0);
  assert.equal(cur.messages[cur.messages.length - 1], user, 'آخر رسالة للمستخدم = شرط إضافة omranStopMsg في الإمساك الخارجيّ');
  assert.ok(!cur.messages.some((m) => m._loading));
});

test('cli-chat-attach-6 ② نصّ جزئيّ وصل: يُختم ردًّا موقوفًا بنصّه (يدخل سياق الدور التالي)، والمنتهي لا يُمسّ، وفقاعة التجهيز تُحذف', () => {
  const { ctx, cleared } = sealCtx();
  const user = { role: 'user', content: 'سؤال' };
  const done = { role: 'assistant', content: 'ردّ كامل', _loading: false, _uid: 1 };
  const part = { role: 'assistant', content: '', _loading: true, _uid: 2 };
  const empty = { role: 'assistant', content: '', _loading: true, _uid: 3 };
  const prep = { role: 'assistant', content: '🧠 …', _loading: true, isAskAllPrep: true, _uid: 4 };
  const cur = { messages: [user, done, part, empty, prep] };
  const rs = new Map([[1, { target: 'ردّ كامل', done: true, timer: 11 }], [2, { target: 'نصف الجواب', done: false, timer: 12 }]]);
  ctx.omranAskAllSealStop(cur, [done, part, empty], prep, rs);
  assert.deepEqual(cleared.sort(), [11, 12]);
  assert.deepEqual(cur.messages, [user, done, part]);
  assert.deepEqual([part.content, part._loading, part._stopped], ['نصف الجواب', false, true]);
  assert.deepEqual([done.content, done._loading, done._stopped], ['ردّ كامل', false, undefined]);
  const hist = cur.messages.filter((m) => !m._loading);
  assert.ok(hist.includes(part), 'الجزئيّ في التاريخ');
});

test('cli-chat-attach-6 ③ الأسلاك: فرع الإيقاف في «اسأل الكل» يختم قبل رمي AbortError', () => {
  const i = SRC.indexOf('if(__runCtl.signal.aborted){');
  assert.ok(i > 0);
  const blk = SRC.slice(i, SRC.indexOf('throw abortErr;', i));
  assert.match(blk, /omranAskAllSealStop\(cur, placeholders, prepMsg, revealStates\)/);
});

// ── cli-chat-attach-8 · x-i18n-6: نصوص الواجهة ──
test('cli-chat-attach-8 ① المساعد: المفتاح بلغة الواجهة، وبلا مفتاح العربيّة للعربيّة وحدها (الأورديّة والفرنسيّة إنجليزيّة)', () => {
  const ctx = baseCtx();
  vm.runInContext(optSrc(), ctx);
  assert.equal(typeof ctx.omranAttachT, 'function');
  ctx.I18N.fr = { axAttachX: 'FR' };
  for (const [lg, want] of [['ar', 'عربي'], ['en', 'EN'], ['fr', 'FR'], ['ur', 'EN'], ['hi', 'EN']]) {
    ctx.lang = lg;
    assert.equal(ctx.omranAttachT('axAttachX', 'عربي', 'EN'), want, lg);
  }
  ctx.I18N.ur = { axAttachX: 'اردو' }; ctx.lang = 'ur';
  assert.equal(ctx.omranAttachT('axAttachX', 'عربي', 'EN'), 'اردو');
});

/* لصق نصّ طويل: معالج الصفحة الحقيقيّ (IIFE السحب والإفلات واللصق) في vm */
function pasteRun(langCode, txt) {
  const listeners = {};
  const toasts = [];
  const ctx = baseCtx({
    lang: langCode,
    document: {
      getElementById: (id) => (id === 'composerBox' ? { setAttribute() {}, classList: { add() {}, remove() {} } } : null),
      createElement: () => ({}), head: { appendChild() {} },
      addEventListener: (type, fn) => { listeners[type] = fn; }, activeElement: { id: 'prompt', tagName: 'TEXTAREA' },
    },
    $: () => ({ focus() {} }), renderAttachStrip() {}, settingsToast: (m) => toasts.push(m), omranOpenImageTool: () => null, omranIngestFiles: async () => {},
  });
  const iife = AST.body.find((x) => x.type === 'ExpressionStatement' && SRC.slice(x.start, x.end).includes("getElementById('composerBox')") && SRC.slice(x.start, x.end).includes("addEventListener('paste'"));
  assert.ok(iife, 'معالج اللصق');
  vm.runInContext('var pendingAttachments = [];\n' + ['MAX_TEXT_ATTACH_CHARS', 'OMRAN_PASTE_ATTACH_CHARS'].map((n) => decl(n)).join('\n') + '\n' + optSrc() + '\n' + SRC.slice(iife.start, iife.end), ctx);
  listeners.paste({ preventDefault() {}, clipboardData: { items: [], getData: () => txt } });
  return { att: ctx.pendingAttachments[0], toasts };
}

test('cli-chat-attach-8 ② لصق نصّ طويل: الأورديّة لا ترى «نص ملصوق» العربيّ، والعربيّة كما كانت', () => {
  const long = 'سطر من نصّ طويل للصق\n'.repeat(120);
  const ur = pasteRun('ur', long);
  assert.ok(ur.att && ur.att._pasted);
  assert.doesNotMatch(ur.att.name + ' ' + ur.toasts.join(' '), /ملصوق|حُوّل النص/, 'لا عربيّة لمستخدم الأورديّة');
  const ar = pasteRun('ar', long);
  assert.match(ar.att.name, /^نص ملصوق · \d+ KB$/);
  assert.match(ar.toasts[0], /حُوّل النص إلى مرفق/);
});

test('cli-chat-attach-8 ③ «جاري تحليل الصورة» بمفتاح لا بالعربيّة لكلّ غير الإنجليزيّة، وتنبيه الانتظار عامّ لا «الأرشيف»', () => {
  const has = (re) => re.test(SRC);
  assert.ok(!has(/lang === 'en'\) \? '🔍 Analyzing image\.\.\.' : '🔍 جاري تحليل الصورة\.\.\.'/), 'العربيّة لكلّ غير الإنجليزيّة');
  assert.ok(has(/__statusEl\.textContent = '🔍 ' \+ omranAttachT\('axAttachAnalyzingImage'/), 'مفتاح تحليل الصورة');
  assert.ok(!has(/alert\(lang === 'ar' \? 'الرجاء الانتظار حتى ينتهي تحليل الأرشيف'/), '«الأرشيف» لكلّ مرفق معلَّق');
  assert.ok(has(/alert\(omranAttachT\('axAttachWaitPending'/), 'مفتاح الانتظار العامّ');
});

test('x-i18n-6 ① ورقة «إرسال الصورة» على كلّ صورة: مفاتيح الورقة القائمة (sheetCopyImg/sheetCopyLink/closeTitle) وبلا ثنائيّات إلّا أسماء التطبيقات', () => {
  const s = SRC.indexOf('window.__omranImgTools = function(');
  const body = SRC.slice(s, SRC.indexOf('\n};', s));
  for (const k of ['sheetCopyImg', 'sheetCopyLink', 'closeTitle', 'axAttachSendImage', 'axAttachShareDevice']) assert.ok(body.includes("omranAttachT('" + k + "'"), k);
  const pairs = Array.from(body.matchAll(/\bar \? '([^']*)' : '([^']*)'/g), (m) => m[2]);
  const BRANDS = ['WhatsApp', 'Telegram', 'Instagram', 'Snapchat', 'Facebook'];
  assert.deepEqual(pairs.filter((en) => !BRANDS.includes(en)), [], 'نصّ واجهة بثنائيّة عربيّ/إنجليزيّ في الورقة');
  assert.ok(!/\bar \? \(/.test(body), 'ثنائيّة بأقواس');
});

test('x-i18n-6 ② الشخصيّة المتكلّمة والفيديو: لا ثنائيّة isAr/lang في النافذتين ولا حالات الفيديو، والأورديّة من اليمين، والثواني بأرقام اللغة', () => {
  const a = SRC.indexOf('window.pickTalkCharacter = ');
  const b = SRC.indexOf('const __tcChoice = await window.askTalkCharOpts(');
  assert.ok(a > 0 && b > a);
  const modal = SRC.slice(a, b);
  assert.ok(!/isAr\s*\?\s*'/.test(modal), 'نصّ بثنائيّة isAr في نافذتي الشخصيّة');
  assert.equal((modal.match(/lang === 'ur'/g) || []).length, 2, 'اتّجاه الأورديّة في النافذتين');
  assert.match(modal, /__tcSec\(4\)[\s\S]*__tcSec\(6\)[\s\S]*__tcSec\(8\)/);
  const v0 = SRC.indexOf('if(__wantsVideo){');
  const vid = SRC.slice(v0, SRC.indexOf("omranAttachT('axAttachVidReady'", v0));
  assert.ok(vid.length > 100 && !/lang === 'ar' \?/.test(vid), 'حالات الفيديو في المحادثة بمفاتيح');
});

test('x-i18n-6 ③ إيقاف الصورة بلغة الواجهة: مفتاح الفرنسيّة، والأورديّة بلا مفتاح إنجليزيّة لا عربيّة', () => {
  const ctx = baseCtx();
  vm.runInContext(optSrc() + '\n' + decl('__imgAbortNote'), ctx);
  const run = (lg, dict, timedOut) => { ctx.lang = lg; ctx.I18N[lg] = dict || {}; ctx.window.__omranTimedOut = !!timedOut; const c = { messages: [] }; ctx.__imgAbortNote(c); return c.messages[0].content; };
  assert.equal(run('fr', { axAttachImgStopped: 'Génération arrêtée.' }), 'Génération arrêtée.');
  assert.doesNotMatch(run('ur'), /[؀-ۿ]/);
  assert.equal(run('ar'), 'تم إيقاف إنشاء الصورة.');
  assert.match(run('en', null, true), /^⚠️ The connection dropped/);
});

/* سقف تراجعيّ: عدد ثنائيّات «عربيّ ؟ إنجليزيّ» في الملفّ لا يزيد — كلّ نصّ واجهة جديد بمفتاح الـ١٤ لغة. الباقي: أسماء التطبيقات،
   ونصوص الوكيل (للمالك وحده)، وأوامر النموذج (لا تُعرض)، والديكور بأسماء أنماطه، والمخطّط، والإعلان، وتعليمات الكتابة الطويلة. */
const BILINGUAL_RE = /\b(?:lang\s*===?\s*'ar'|isAr|__isAr|__ar|ar)\s*\)?\s*\?\s*\(?\s*['"(]/g;
const BILINGUAL_MAX = 56;
test('x-i18n-6 ④ سقف ثنائيّات العربيّ/الإنجليزيّ في app-09 لا يزيد عن ' + BILINGUAL_MAX + ' (كانت ١٦٦)', () => {
  const n = (SRC.match(BILINGUAL_RE) || []).length;
  assert.ok(n <= BILINGUAL_MAX, 'ثنائيّات: ' + n);
});

/* قائمة ⋮ لكلّ محادثة في الشريط الجانبيّ (app-04): الدالّتان الحقيقيّتان في vm بـDOM مزيّف */
const SRC04 = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-04-i18n-state.js'), 'utf8');
const AST04 = acorn.parse(SRC04, { ecmaVersion: 'latest', sourceType: 'script' });
const fn04 = (name) => { const n = AST04.body.find((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === name); assert.ok(n, name); return SRC04.slice(n.start, n.end); };
function histMenu(langCode, dict) {
  const prompts = [];
  const mk = () => { const el = { children: [], classList: { add() {}, remove() {} }, style: {}, appendChild(c) { this.children.push(c); } }; return el; };
  const menu = mk();
  const ctx = baseCtx({
    lang: langCode, prompt: (q) => { prompts.push(q); return null; },
    document: { documentElement: { dir: 'ltr' }, createElement: mk, getElementById: () => menu },
    ensureHistItemMenu: () => menu,
  });
  ctx.window.innerWidth = 1280; ctx.window.innerHeight = 800;
  ctx.I18N.en = { shareProjectBtnTitle: 'Share project via public link', bgImgDelete: 'Delete' };
  ctx.I18N.ar = { shareProjectBtnTitle: 'شارك المشروع برابط عام', bgImgDelete: 'حذف' };
  if (dict) ctx.I18N[langCode] = dict;
  vm.runInContext(optSrc() + '\n' + fn04('histRenameProject') + '\n' + fn04('openHistItemMenu'), ctx);
  ctx.openHistItemMenu({ getBoundingClientRect: () => ({ left: 10, right: 40, top: 10, bottom: 30 }) }, { title: 'x' }, 'claude');
  const labels = menu.children.map((b) => String(b.innerHTML).replace(/^[\s\S]*<span>|<\/span>$/g, ''));
  menu.children[0].onclick({ stopPropagation() {} }); // «إعادة تسمية» يفتح نافذة الاسم
  return { labels, prompt: prompts[0] };
}

test('x-i18n-6 ⑥ قائمة ⋮ في الشريط الجانبيّ ونافذة إعادة التسمية: مفاتيح الـ١٤ لغة، والأورديّة لا ترى العربيّة', () => {
  const fr = histMenu('fr', { axAttachHistRename: 'Renommer', axAttachHistNewName: 'Nouveau nom :', bgImgDelete: 'Supprimer', shareProjectBtnTitle: 'Partager' });
  assert.deepEqual(fr.labels, ['Renommer', 'Partager', 'Supprimer']);
  assert.equal(fr.prompt, 'Nouveau nom :');
  const ur = histMenu('ur');
  assert.doesNotMatch(ur.labels.join(' ') + ' ' + ur.prompt, /[؀-ۿ]/, 'لا عربيّة لمستخدم الأورديّة: ' + ur.labels.join(' | '));
  const ar = histMenu('ar');
  assert.deepEqual(ar.labels, ['إعادة تسمية', 'شارك المشروع برابط عام', 'حذف']);
  assert.equal(ar.prompt, 'الاسم الجديد للمشروع:');
});

test('x-i18n-6 ⑦ خيارات الديكور الخارجيّ الستّة بمفتاح data-i18n يقرؤه مترجم الخيارات (__optT)', () => {
  const P = fs.readFileSync(path.join(__dirname, '..', 'js', 'partials-core.js'), 'utf8');
  for (const v of ['facade', 'pool', 'pergola', 'bbq', 'rooftop', 'pathway']) {
    assert.match(P, new RegExp('<option value="' + v + '" data-en="[^"]+" data-i18n="axAttachDecor[A-Z][a-z]+">'), v);
  }
  const D = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-03-i18n-data.js'), 'utf8');
  const line = D.split('\n').find((l) => l.startsWith('window.__optT='));
  const ctx = baseCtx({ lang: 'fr' });
  ctx.window.t = ctx.t; ctx.I18N.fr = { axAttachDecorPool: '🏊 Piscine et patio' };
  vm.runInContext(line + '\n' + D.split('\n').find((l) => l.startsWith('window.__optXlLang=')), ctx);
  const opt = { textContent: '🏊 مسبح وجلسة', getAttribute: (a) => ({ 'data-i18n': 'axAttachDecorPool', 'data-en': '🏊 Pool & Patio' })[a] || null };
  assert.equal(ctx.window.__optT(opt), '🏊 Piscine et patio');
});

/* بطاقة انتظار فيديو المحادثة (app-34) تُركَّب حين يرصد سطر «🎬 جاري إنشاء الفيديو…» — والسطر صار بلغة الواجهة */
function chatVideoScan(line, dict) {
  const hostCalls = [];
  const host = { querySelector: (s) => { hostCalls.push(s); return {}; } }; // بطاقة موجودة = لا تركيب جديد، ويكفي أنّه سأل عنها
  const sb = {
    window: {}, __swallow() {},
    t: (k) => (dict && dict[k] !== undefined ? dict[k] : k),
    document: {
      body: {}, documentElement: {}, getElementById: () => null, querySelector: () => null,
      querySelectorAll: (s) => (s === '.chat-status-text' ? [{ textContent: line, closest: () => host }] : []),
    },
    MutationObserver: function () { return { observe() {} }; },
    setTimeout: () => 0,
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'app-34-gen-wait.js'), 'utf8'), sb);
  sb.window.omranGenWait.scan();
  return hostCalls.some((s) => /chatvideo/.test(s));
}

test('x-i18n-6 ⑧ بطاقة انتظار فيديو المحادثة تُرصد بسطر اللغة الحاليّة لا بالعربيّ والإنجليزيّ وحدهما', () => {
  assert.equal(chatVideoScan('🎬 جاري إنشاء الفيديو… قد يستغرق ١–٣ دقائق'), true, 'العربيّ كما كان');
  assert.equal(chatVideoScan('🎬 Creating video… PENDING'), true, 'الإنجليزيّ كما كان');
  const fr = { axAttachVidCreating: 'Création de la vidéo… cela peut prendre 1 à 3 minutes', axAttachVidCreatingShort: 'Création de la vidéo…' };
  assert.equal(chatVideoScan('🎬 Création de la vidéo… cela peut prendre 1 à 3 minutes', fr), true, 'سطر البدء بالفرنسيّة');
  assert.equal(chatVideoScan('🎬 Création de la vidéo… RUNNING', fr), true, 'سطر الاستطلاع بالفرنسيّة');
  assert.equal(chatVideoScan('🎬 Animation du personnage…', fr), false, 'سطر آخر بـ🎬 ليس فيديو المحادثة');
});

const STR = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
test('x-i18n-6 ⑤ كلّ مفتاح axAttach* بنصّين احتياطيّين متطابقين في كلّ مواضعه، وبلا اسم مزوّد أو نموذج', () => {
  const seen = new Map();
  for (const m of SRC.matchAll(new RegExp(String.raw`omranAttachT\('(axAttach[A-Za-z0-9]+)', ` + STR + ', ' + STR + String.raw`\)`, 'g'))) {
    const v = m[2] + '|' + m[3];
    if (seen.has(m[1])) assert.equal(seen.get(m[1]), v, m[1]);
    seen.set(m[1], v);
    assert.doesNotMatch(v, /Claude|Gemini|GPT|OpenAI|Groq|Grok|Veo|Runway|MiniMax|DeepSeek|Kling|Mistral|Cohere|Perplexity|Kimi|كلود|جيمناي|جيميني/i, m[1]);
  }
  assert.ok(seen.size >= 90, 'مفاتيح: ' + seen.size);
});
