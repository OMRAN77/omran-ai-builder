'use strict';
/* v-tool-drop (المالك ١٧ أكتوبر: «اذا اختار اي صوره من الانماط او الديكور اوالاستايل من اي مكان على طول تتحول الي الدردشة الصوره
   الموجوده مش الي انا اضيفها»): إفلات صورة أو لصقها في أيّ مكان من نوافذ الأدوات — غير المربّع المنقّط نفسه — كان يُلتقط على مستوى
   الصفحة فيصير مرفق دردشة، والأداة تبقى بصورتها القديمة (مسبار Playwright: الأدوات الأربع، إفلات ولصق = مرفق دردشة). الدوالّ
   الحقيقيّة من js/app-09-attach.js تُشغَّل هنا في vm بـDOM مزيّف، ثمّ يُثبَّت أنّ معالجي الإفلات واللصق يمرّان بها قبل الدردشة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const AST = acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'script' });
const top = (name) => {
  const n = AST.body.find((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === name);
  assert.ok(n, 'دالّة مفقودة: ' + name);
  return SRC.slice(n.start, n.end);
};
const TOOL_IDS = ['studioAiModal', 'fashionAiModal', 'designAiModal', 'portraitStyleSheet'];

/* DOM مزيّف بقدر ما تلمسه الدوالّ: ظهور بالأب (عنصر داخل أب مخفيّ لا مستطيلات له)، closest على معرّفات الأدوات، classList */
function makeEnv() {
  const els = {};
  const mk = (id, parent, opts) => {
    const o = opts || {};
    const el = {
      id, parent: parent || null, style: { display: o.display || 'block' }, cls: new Set(o.cls || []), files: null, events: [], value: o.value || '', imgs: o.imgs || 0, clicks: 0,
      classList: { contains: (c) => el.cls.has(c) },
      querySelector: (q) => (q === 'img' && el.imgs ? {} : null),
      click() { el.clicks++; },
      getClientRects() { for (let p = el; p; p = p.parent) if (p.style.display === 'none') return []; return [{}]; },
      closest(sel) { for (let p = el; p; p = p.parent) if (sel.split(',').some((s) => s.trim() === '#' + p.id)) return p; return null; },
      dispatchEvent(ev) { el.events.push(ev.type); return true; },
    };
    els[id] = el; return el;
  };
  const ctx = {
    document: { getElementById: (id) => els[id] || null },
    getComputedStyle: (el) => ({ display: el.style.display, visibility: 'visible' }),
    DataTransfer: class { constructor() { this.list = []; this.items = { add: (f) => this.list.push(f) }; } get files() { return this.list.slice(); } },
    Event: class { constructor(type) { this.type = type; } },
    __swallow: () => {},
    Array,
    window: {},
  };
  vm.createContext(ctx);
  vm.runInContext(top('omranToolShown') + '\n' + top('omranOpenImageTool') + '\n' + top('omranFilesToTool'), ctx);
  return { els, mk, ctx };
}
function withTools(open) {
  const env = makeEnv();
  const modal = env.mk('portraitStyleModal', null, { display: open.includes('portraitStyleSheet') ? 'block' : 'none' });
  for (const id of TOOL_IDS) {
    if (id === 'portraitStyleSheet') env.mk(id, modal, { display: 'flex' }); // الورقة flex دائمًا — يخفيها أبوها
    else env.mk(id, null, { display: open.includes(id) ? 'flex' : 'none' });
  }
  for (const id of ['fashionAiFileInput', 'designAiFileInput', 'portraitStyleFileInput', 'studioAiFileInputA', 'studioAiFileInputB']) env.mk(id, null, { display: 'none' });
  return env;
}

test('١ لا أداة ظاهرة = null (الدردشة كما كانت)، وورقة الأنماط داخل نافذة مخفيّة ليست ظاهرة', () => {
  const env = withTools([]);
  assert.equal(env.ctx.omranOpenImageTool(null), null);
  assert.equal(env.ctx.omranToolShown(env.els.portraitStyleSheet), false, 'display:flex لكن أبوها مخفيّ');
});

test('٢ كلّ أداة تعطي ملفّ صورتها: الديكور والأزياء والأنماط، والاستوديو يلصق بنفسه', () => {
  for (const [id, input, own] of [['designAiModal', 'designAiFileInput', false], ['fashionAiModal', 'fashionAiFileInput', false], ['portraitStyleSheet', 'portraitStyleFileInput', false], ['studioAiModal', 'studioAiFileInputA', true]]) {
    const env = withTools([id]);
    const t = env.ctx.omranOpenImageTool(null);
    assert.equal(t.id, id); assert.equal(t.input.id, input); assert.equal(t.ownPaste, own, id);
  }
});

test('٣ الاستوديو: الخانة الثانية حين تظهر فارغة والأولى ممتلئة، وإلّا الأولى', () => {
  let env = withTools(['studioAiModal']);
  env.mk('studioAiSlotA', null, { cls: ['has'] }); env.mk('studioAiSlotB'); env.mk('studioAiImageBWrap', null, { display: 'block' });
  assert.equal(env.ctx.omranOpenImageTool(null).input.id, 'studioAiFileInputB');
  env = withTools(['studioAiModal']);
  env.mk('studioAiSlotA', null, { cls: ['has'] }); env.mk('studioAiSlotB'); env.mk('studioAiImageBWrap', null, { display: 'none' });
  assert.equal(env.ctx.omranOpenImageTool(null).input.id, 'studioAiFileInputA', 'خانة واحدة: تُستبدل الأولى');
});

test('٤ الإفلات داخل أداة بعينها يذهب لها ولو ظهرت أداة أخرى', () => {
  const env = withTools(['designAiModal', 'fashionAiModal']);
  const card = env.mk('card', env.els.fashionAiModal);
  assert.equal(env.ctx.omranOpenImageTool(card).id, 'fashionAiModal');
  assert.equal(env.ctx.omranOpenImageTool(null).id, 'fashionAiModal', 'بلا هدف: الترتيب الثابت');
});

test('٥ omranFilesToTool: أوّل صورة إلى ملفّ الأداة بحدث change، وغير الصور لا شيء', () => {
  const env = withTools(['designAiModal']);
  const t = env.ctx.omranOpenImageTool(null);
  const pdf = { name: 'a.pdf', type: 'application/pdf' }, img = { name: 'me.jpg', type: 'image/jpeg' };
  assert.equal(env.ctx.omranFilesToTool([pdf, img], t), true);
  assert.deepEqual(Array.from(t.input.files), [img]); assert.deepEqual(t.input.events, ['change']);
  const heic = { name: 'IMG_1.HEIC', type: '' };
  assert.equal(env.ctx.omranFilesToTool([heic], t), true, 'HEIC من الآيفون بلا نوع');
  const env2 = withTools(['designAiModal']); const t2 = env2.ctx.omranOpenImageTool(null);
  assert.equal(env2.ctx.omranFilesToTool([pdf], t2), false); assert.deepEqual(t2.input.events, []);
  assert.equal(env2.ctx.omranFilesToTool([img], { id: 'x', input: null }), false);
});

test('٦ معالجا الإفلات واللصق على الصفحة يمرّان بالأداة المفتوحة قبل الدردشة', () => {
  const drop = SRC.slice(SRC.indexOf("document.addEventListener('drop', (e) => {"), SRC.indexOf("document.addEventListener('paste', (e) => {"));
  assert.ok(drop.indexOf('omranOpenImageTool(e.target)') > 0 && drop.indexOf('omranOpenImageTool(e.target)') < drop.indexOf('omranIngestFiles(files)'), 'الإفلات: الأداة قبل الدردشة');
  assert.match(drop, /if\(__tool\)\{ omranFilesToTool\(files, __tool\); return; \}/);
  assert.ok(drop.indexOf('if(e.defaultPrevented) return;') > 0, 'مربّعات الأدوات الخاصّة تأخذ إفلاتها أوّلًا كما كانت');
  const paste = SRC.slice(SRC.indexOf("document.addEventListener('paste', (e) => {"));
  const i = paste.indexOf('omranOpenImageTool(ae)');
  assert.ok(i > 0 && i < paste.indexOf('pendingAttachments.push'), 'اللصق: الأداة قبل مرفق الدردشة');
  assert.match(paste, /if\(!__tool\.ownPaste[^)]*\)\)\{ e\.preventDefault\(\); omranFilesToTool\(files, __tool\); \} return;/, 'الاستوديو يلصق بنفسه بلا نسخة في الدردشة');
});

test('٧ «دمج شخصين»/«ستايل عائلي»: صورة الشخص الثاني لخانة الصور الإضافية لا فوق صورتك', () => {
  const env = withTools(['portraitStyleSheet']);
  env.mk('portraitStyleSelect', null, { value: 'merge2' });
  env.mk('portraitMultiFileInput', null, { display: 'none' });
  const mw = env.mk('portraitMultiWrap', env.els.portraitStyleSheet, { display: 'block' });
  env.mk('portraitMultiPreviewWrap', mw);
  env.ctx.window.__portraitHasPhoto = true;
  assert.equal(env.ctx.omranOpenImageTool(null).input.id, 'portraitMultiFileInput', 'صورتك موجودة والإضافيّة فارغة');
  assert.equal(env.ctx.omranOpenImageTool(env.mk('inMw', mw)).input.id, 'portraitMultiFileInput', 'الإفلات على خانة الإضافيّة');
  env.els.portraitMultiPreviewWrap.imgs = 1;
  assert.equal(env.ctx.omranOpenImageTool(null).input.id, 'portraitStyleFileInput', 'الإضافيّة ممتلئة: تُستبدل صورتك');
  env.els.portraitStyleSelect.value = 'anime'; env.els.portraitMultiPreviewWrap.imgs = 0;
  assert.equal(env.ctx.omranOpenImageTool(null).input.id, 'portraitStyleFileInput', 'نمط عاديّ');
});

test('٨ الصورة المُفلتة في الأنماط لا تولّد بنفسها، وفي الأزياء تفتح لوح الصورة إن كان «من وصف نصّي»', () => {
  let env = withTools(['portraitStyleSheet']);
  env.ctx.window.__portraitAutoRun = true; // «جرّب على صورتك» ثمّ ألغى المنتقي
  env.ctx.omranFilesToTool([{ name: 'me.jpg', type: 'image/jpeg' }], env.ctx.omranOpenImageTool(null));
  assert.equal(env.ctx.window.__portraitAutoRun, false);
  env = withTools(['fashionAiModal']);
  const tab = env.mk('fashionAiTabImage');
  env.ctx.omranFilesToTool([{ name: 'me.jpg', type: 'image/jpeg' }], env.ctx.omranOpenImageTool(null));
  assert.equal(tab.clicks, 1, 'لوح النصّ ظاهر ← يُفتح لوح الصورة');
  tab.cls.add('primary');
  env.ctx.omranFilesToTool([{ name: 'me.jpg', type: 'image/jpeg' }], env.ctx.omranOpenImageTool(null));
  assert.equal(tab.clicks, 1, 'لوح الصورة ظاهر أصلًا ← لا ضغطة');
});

test('٩ الصور لا تُسحب في التطبيق كلّه إلّا صور المحادثة (المسار الحقيقيّ: ضغطة بحركة يد بسيطة = صورة العيّنة تُفلت مرفقًا)', () => {
  const m = /document\.addEventListener\('dragstart', \(e\) => \{([^\n]*)\}, true\);/.exec(SRC);
  assert.ok(m, 'مستمع dragstart في مرحلة الالتقاط');
  assert.match(m[1], /tagName === 'IMG'/);
  assert.match(m[1], /!tg\.closest\('#messages'\)/, 'كلّ صورة خارج المحادثة — بطاقات الأدوات والأقسام والمعارض لا نوافذ الأدوات الأربع وحدها');
  assert.match(m[1], /e\.preventDefault\(\)/);
  const ctx = { e: null }; vm.createContext(ctx);
  const run = (tag, inChat) => { const ev = { target: { tagName: tag, closest: (q) => (q === '#messages' && inChat ? {} : null) }, prevented: false, preventDefault() { this.prevented = true; } }; vm.runInContext('(function(e){' + m[1] + '})', ctx)(ev); return ev.prevented; };
  assert.equal(run('IMG', false), true, 'عيّنة نمط أو بطاقة أداة: لا سحب');
  assert.equal(run('IMG', true), false, 'صورة في المحادثة: تُسحب لحفظها');
  assert.equal(run('A', false), false, 'الروابط والنصوص كما هي');
  const paste = SRC.slice(SRC.indexOf("document.addEventListener('paste', (e) => {"));
  assert.match(paste, /if\(!__tool\.ownPaste \|\| \(ae && ae\.id === 'prompt'\)\)\{ e\.preventDefault\(\); omranFilesToTool\(files, __tool\); \}/, 'الاستوديو والتركيز في صندوق الدردشة المخفيّ: لا تضيع الصورة');
});

test('١٠ __compressImg: HEIC يُحوَّل قبل الأداة، والفشل يفرّغ الاختيار بدل إبقاء الصورة السابقة', async () => {
  const S2 = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-12-studios.js'), 'utf8');
  const A2 = acorn.parse(S2, { ecmaVersion: 'latest', sourceType: 'script' });
  const n = A2.body.find((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === '__compressImg');
  const code = S2.slice(n.start, n.end);
  const conv = [];
  const ctx = {
    omranNormalizeImageFile: async (f) => { conv.push(f.name); return { name: 'me.jpg', type: 'image/jpeg', bad: f.bad }; },
    FileReader: class { readAsDataURL(f) { setTimeout(() => { if (f.readFail) this.onerror(); else { this.result = 'data:' + f.type + ';base64,AA'; this.onload(); } }, 0); } },
    Image: class { set src(v) { setTimeout(() => { if (/bad/.test(v) || ctx.__badImg) this.onerror(); else { this.width = 10; this.height = 10; this.onload(); } }, 0); } },
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,OK' }) },
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const run = (f) => new Promise((res) => ctx.__compressImg(f, res));
  assert.equal(await run({ name: 'IMG_1.HEIC', type: '' }), 'data:image/jpeg;base64,OK', 'HEIC بلا نوع ← محوَّل');
  assert.deepEqual(conv, ['IMG_1.HEIC']);
  ctx.__badImg = true;
  assert.equal(await run({ name: 'x.png', type: 'image/png' }), '', 'صورة لا تُفكّ ← فارغ (لا تعليق)');
  ctx.__badImg = false;
  assert.equal(await run({ name: 'x.png', type: 'image/png', readFail: true }), '', 'فشل القراءة ← فارغ');
  assert.equal((S2.match(/if\(!dataUrl\)\{ selectedBase64 = ''; sourcePreview\.style\.display = 'none'; return; \}/g) || []).length, 3, 'الديكور والأنماط والأزياء: الفشل لا يبقي الصورة السابقة');
});

test('١١ الديكور: صورتك الظاهرة تُرسل ولو اختير مكان من الملصق قبلها، وإعادة التحديث لا تقع والأداة مفتوحة', () => {
  const S2 = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-12-studios.js'), 'utf8');
  assert.match(S2, /const photoOn = !!\(selectedBase64 && sourcePreview && sourcePreview\.style\.display !== 'none'\);[^\n]*\n\s*const placeVal = photoOn \? '' :/);
  const SD = fs.readFileSync(path.join(__dirname, '..', 'js', 'selfdiag.js'), 'utf8');
  const busy = SD.slice(SD.indexOf('var __v653Busy'), SD.indexOf('var __v653Go'));
  assert.match(busy, /window\.omranSwipeBack && window\.omranSwipeBack\.top\(\)\) return true;/, 'منتقي الصور يخفي الصفحة والأداة مفتوحة: لا إعادة تحميل');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const at = html.indexOf('/js/selfdiag.js'); const v = /hw-twa-(\d+)/.exec(html.slice(at, html.indexOf('"', at))); // الوسم من index.html لا مثبَّتًا (سقّاطة vPinTests)
  assert.ok(v && Number(v[1]) >= 9, 'وسم selfdiag مرفوع');
});
