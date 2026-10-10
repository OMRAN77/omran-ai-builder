// tests/panel-x.test.cjs — v-panel-x + v-chat-order (طلب المالك ١٠ أكتوبر):
// ١) «إذا فاتح محادثة فيها صورة تكون في المعاينة، وإذا دخلت محادثة أخرى فيها كتابة تكون الصورة موجودة» — الصورة تخصّ محادثتها.
// ٢) «الإكس مسؤول في الصندوق فقط، إلّا إذا أريد أرجعه من عند المحادثة» — الإكس يقفل المعروض ولا يطوي اللوحة (الكمبيوتر).
// ٣) «أريد المحادثات بالترتيب — آخر وحدة كتبتها تكون أوّل وحدة» — مفتاح الترتيب p.updatedAt المحفوظ والمتزامن.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const a5 = read('js/app-05-ui.js');
const a4 = read('js/app-04-i18n-state.js');

function loadPanel() {
  const start = a5.indexOf('/* v-panel-x: معاينة تطبيق محادثةٍ أقفلها الإكس');
  const end = a5.indexOf('\nlet pyodideInstance', start);
  assert.ok(start > 0 && end > start);
  const node = () => ({ style: { display: '' }, textContent: '', innerHTML: '' });
  const els = { '#pyConsole': node(), '#emptyStateSpinner': node(), '#emptyTitleEl': node(), '#emptyDescEl': node(), '#pyOutput': node(), '#pyStatus': node() };
  const ctx = {
    window: {}, state: { currentId: 'A' }, projects: {},
    previewFrame: { style: { display: 'none' }, srcdoc: '', _imageView: false },
    emptyState: { style: { display: 'flex' } }, codeEl: { value: '' },
    $: (s) => els[s], t: (k) => k, genAbortController: null, runPythonCode() {},
    document: { getElementById: () => null }, __swallow: (e) => { throw e; },
  };
  ctx.getCurrent = () => ctx.projects[ctx.state.currentId] || null;
  vm.createContext(ctx);
  vm.runInContext(a5.slice(start, end), ctx);
  return ctx;
}
const shows = (c) => ({ frame: c.previewFrame.style.display, empty: c.emptyState.style.display, img: !!c.previewFrame._imageView, doc: c.previewFrame.srcdoc });

test('١. صورة محادثة لا تبقى في معاينة محادثة أخرى', () => {
  const c = loadPanel();
  c.projects = { A: { id: 'A', code: '' }, B: { id: 'B', code: '' } };
  // نقر الصورة في A (كما في app-04): العلم ومعرّف المحادثة
  Object.assign(c.previewFrame, { _imageView: true, _imagePid: 'A', srcdoc: '<img src="x">', style: { display: 'block' } });
  vm.runInContext('renderCodeAndPreview()', c);
  assert.equal(shows(c).img, true, 'في محادثتها تبقى');
  c.state.currentId = 'B';
  vm.runInContext('renderCodeAndPreview()', c);
  assert.deepEqual(shows(c), { frame: 'none', empty: 'flex', img: false, doc: '' }, 'محادثة كتابة ← الصندوق فارغ لا صورة A');
  assert.match(a4, /previewFrame\._imagePid = state\.currentId;/, 'نقر الصورة يسجّل محادثتها');
});

test('٢. الإكس يقفل الصورة ثمّ معاينة التطبيق داخل الصندوق، والرجوع من المحادثة أو تبويب المعاينة', () => {
  const c = loadPanel();
  c.projects = { A: { id: 'A', code: '<h1>app</h1>', codeType: 'html' }, B: { id: 'B', code: '' } };
  vm.runInContext('renderCodeAndPreview()', c);
  assert.equal(shows(c).doc, '<h1>app</h1>');
  Object.assign(c.previewFrame, { _imageView: true, _imagePid: 'A', _lastSrc: null, srcdoc: '<img>' });
  vm.runInContext('omranPanelCloseShown()', c);
  assert.equal(shows(c).img, false); assert.equal(shows(c).doc, '<h1>app</h1>', 'الإكس على الصورة ← ترجع معاينة المحادثة');
  vm.runInContext('omranPanelCloseShown()', c);
  assert.deepEqual(shows(c), { frame: 'none', empty: 'flex', img: false, doc: '' }, 'الإكس على التطبيق ← الصندوق فارغ ولا يبقى يعمل');
  assert.equal(c.codeEl.value, '<h1>app</h1>', 'خانة الكود تبقى بكودها (الحفظ لا يمحوه)');
  c.state.currentId = 'B'; vm.runInContext('renderCodeAndPreview()', c);
  c.state.currentId = 'A'; vm.runInContext('renderCodeAndPreview()', c);
  assert.equal(shows(c).frame, 'none', 'يبقى مقفولًا لمحادثته بعد التنقّل');
  vm.runInContext('omranPanelReopen()', c);
  assert.equal(shows(c).doc, '<h1>app</h1>', 'تبويب المعاينة يرجّعه');
  vm.runInContext('omranPanelCloseShown()', c);
  c.projects.A.code = '<h1>v2</h1>'; vm.runInContext('renderCodeAndPreview()', c);
  assert.equal(shows(c).doc, '<h1>v2</h1>', 'كود جديد في المحادثة يرجع تلقائيًّا');
});

test('٢ب. الأسلاك: الإكس لا يطوي اللوحة على الكمبيوتر، والجوّال كما كان، والرجوع موصول', () => {
  const i = a5.indexOf('  cls.onclick = function(){');
  const h = a5.slice(i, a5.indexOf('\n  };', i));
  assert.match(h, /if\(document\.getElementById\('omranCodeViewer'\)\)\{ omranCloseCodeViewer\(\); return; \}/);
  assert.match(h, /if\(document\.documentElement\.classList\.contains\('mobile-ui'\)\)\{\n\s+try\{ var cb = document\.getElementById\('waCollapseBtn'\)/);
  assert.match(h, /\n    omranPanelCloseShown\(\);$/);
  assert.match(a5, /if\(tab\.dataset\.tab === 'preview'\) omranPanelReopen\(\);/);
  assert.match(a4, /if\(window\.__omranPanelHidden\) delete window\.__omranPanelHidden\[cur\.id\];/, '«استخدم هذا الإصدار»');
  assert.ok(!/waFullBtn|panelFullTitle/.test(a5 + read('css/tokens.css') + read('js/app-03-i18n-data.js')), 'زرّ التكبير (فهم خاطئ للطلب) أُزيل');
});

test('٣. الترتيب بآخر كتابة: محفوظ ومرفوع ومدموج، وما لم يُكتب فيه بوقت إنشائه', () => {
  const m = /const __histTs = \(p\) => \{[^\n]+\};/.exec(a4);
  assert.ok(m, 'مفتاح الترتيب');
  const key = vm.runInNewContext(m[0] + ';__histTs', { Number, String });
  const list = [
    { id: 'p_1791000003000', title: 'الأحدث إنشاءً' },
    { id: 'p_1791000001000', title: 'الأقدم وكُتب فيه الآن', updatedAt: 1791000009000 },
    { id: 'p_1791000002000', title: 'الوسط' },
  ];
  assert.deepEqual(list.sort((a, b) => key(b) - key(a)).map((p) => p.title), ['الأقدم وكُتب فيه الآن', 'الأحدث إنشاءً', 'الوسط']);
  assert.match(read('js/app-09-attach.js'), /cur\.messages\.push\(__nextUserMessage\);\n  \}\n  cur\.updatedAt = Date\.now\(\);/, 'الإرسال يختم المحادثة');
  assert.match(read('js/app-32-video-watch.js'), /cur\.updatedAt = Date\.now\(\);/);
  assert.match(a4, /updatedAt: Number\(p\.updatedAt\) \|\| 0,/, 'يُرفع للخادم');
  assert.match(a4, /if\(\(Number\(sp\.updatedAt\) \|\| 0\) > \(Number\(local\.updatedAt\) \|\| 0\)\) local\.updatedAt = Number\(sp\.updatedAt\);/, 'كتابة جهاز آخر');
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'x'.repeat(64); // الوحدة ترفض التحميل بلا سرّ (كبقيّة اختبارات chats)
  const { slimProjects } = require(path.join(root, 'api/_lib/chats.js')).__vkeep;
  assert.equal(slimProjects([{ id: 'p_1', messages: [], updatedAt: 42 }])[0].updatedAt, 42, 'الخادم يحفظه');
});
