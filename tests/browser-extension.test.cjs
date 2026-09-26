// v-browser-ext: إضافة «Om ai» للمتصفّح (store/chrome/extension) + سؤال الرابط ?q= في التطبيق.
// المالك: «أريد نفس الفكرة بالضبط وإذا فيه أفضل عطني» — زرّ الشريط، «اسأل عن» بالزرّ الأيمن،
// om في شريط العنوان، ١٤ لغة؛ والأفضل: السؤال يصل صندوق المحادثة، Alt+O، «لخّص هذه الصفحة».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const ext = path.join(root, 'store/chrome/extension');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('store/chrome/extension/manifest.json'));
const LANGS = ['ar', 'bn', 'en', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh_CN'];
const KEYS = ['extName', 'extDesc', 'actionTitle', 'menuAsk', 'menuSummarize', 'summarizePrompt', 'omniboxHint'];

test('البيان: MV3 بأقلّ صلاحيّة — قوائم الزرّ الأيمن فقط، لا مواقع ولا سكربتات صفحات', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['contextMenus']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.omnibox.keyword, 'om');
  assert.equal(manifest.commands._execute_action.suggested_key.default, 'Alt+O');
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.background.service_worker, 'background.js');
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = fs.readFileSync(path.join(ext, file));
    assert.equal(png.readUInt32BE(16), Number(size), file + ' العرض');
    assert.equal(png.readUInt32BE(20), Number(size), file + ' الارتفاع');
  }
});

test('اللغات: ١٤ لغة بكلّ المفاتيح، والوصف ضمن حدّ المتجر، وبلا اسم مزوّد', () => {
  assert.deepEqual(fs.readdirSync(path.join(ext, '_locales')).sort(), LANGS.slice().sort());
  for (const lg of LANGS) {
    const m = JSON.parse(fs.readFileSync(path.join(ext, '_locales', lg, 'messages.json'), 'utf8'));
    for (const k of KEYS) assert.ok(m[k] && m[k].message, lg + ' ' + k);
    assert.equal(m.extName.message, 'Om ai');
    assert.ok([...m.extDesc.message].length <= 132, lg + ' الوصف ≤ ١٣٢ حرفًا');
    assert.match(m.menuAsk.message, /%s/, lg + ' النصّ المحدّد يظهر في القائمة');
    assert.match(m.summarizePrompt.message, /\$URL\$/);
    assert.equal(m.summarizePrompt.placeholders.url.content, '$1');
    assert.doesNotMatch(JSON.stringify(m), /claude|gemini|openai|gpt|grok|anthropic|groq/i, lg);
  }
});

test('المصدر واحد: الملفّات والملفّ المضغوط مبنيّة من scripts/build-extension.mjs', async () => {
  const { LOCALES } = await import(path.join(root, 'scripts/build-extension.mjs'));
  assert.deepEqual(Object.keys(LOCALES).sort(), LANGS.slice().sort());
  for (const lg of LANGS) {
    const m = JSON.parse(fs.readFileSync(path.join(ext, '_locales', lg, 'messages.json'), 'utf8'));
    assert.equal(m.extDesc.message, LOCALES[lg][0], lg + ' — أعد node scripts/build-extension.mjs');
  }
  const zip = fs.readFileSync(path.join(root, 'store/chrome/om-ai-extension.zip'));
  for (const f of ['manifest.json', 'background.js', 'icons/icon-128.png', ...LANGS.map((l) => `_locales/${l}/messages.json`)]) {
    assert.ok(zip.includes(Buffer.from(f)), 'في الملفّ المضغوط: ' + f);
  }
});

function runBackground() {
  const L = { en: JSON.parse(fs.readFileSync(path.join(ext, '_locales/en/messages.json'), 'utf8')) };
  const on = {};
  const ev = (name) => ({ addListener: (fn) => { on[name] = fn; } });
  const created = [], updated = [], menus = [];
  const chrome = {
    runtime: { onInstalled: ev('installed') },
    contextMenus: { removeAll: (cb) => cb(), create: (o) => menus.push(o), onClicked: ev('menu') },
    action: { onClicked: ev('action') },
    omnibox: { setDefaultSuggestion() {}, onInputEntered: ev('omnibox') },
    tabs: { create: (p) => created.push(p), update: (p) => updated.push(p) },
    i18n: { getMessage: (k, subs) => (L.en[k] ? L.en[k].message.replace('$URL$', (subs || [])[0] || '') : '') },
  };
  vm.runInNewContext(read('store/chrome/extension/background.js'), { chrome });
  return { on, created, updated, menus };
}

test('الإضافة تعمل: القائمتان، «اسأل عن»، التلخيص، الزرّ، وشريط العنوان', () => {
  const b = runBackground();
  b.on.installed();
  assert.deepEqual(b.menus.map((m) => [m.id, m.contexts[0]]), [['om-ask', 'selection'], ['om-summarize', 'page']]);
  assert.match(b.menus[0].title, /%s/);

  b.on.menu({ menuItemId: 'om-ask', selectionText: '  ما هو الذكاء؟ & كذا ' }, { index: 3 });
  assert.equal(b.created[0].url, 'https://omran-ai-builder.vercel.app/?q=' + encodeURIComponent('ما هو الذكاء؟ & كذا'));
  assert.equal(b.created[0].index, 4, 'التبويب الجديد بجانب الصفحة');

  b.on.menu({ menuItemId: 'om-summarize', pageUrl: 'https://news.example/a?b=1' }, { index: 0 });
  assert.equal(decodeURIComponent(b.created[1].url.split('?q=')[1]), 'Summarize this page for me: https://news.example/a?b=1');

  b.on.action({ index: 1 });
  assert.equal(b.created[2].url, 'https://omran-ai-builder.vercel.app/');

  b.on.omnibox('وش الطقس', 'currentTab');
  assert.equal(b.updated[0].url, 'https://omran-ai-builder.vercel.app/?q=' + encodeURIComponent('وش الطقس'));
  b.on.omnibox('x'.repeat(5000), 'newBackgroundTab');
  const last = b.created[b.created.length - 1];
  assert.equal(last.active, false);
  assert.equal(decodeURIComponent(last.url.split('?q=')[1]).length, 1800, 'النصّ الطويل يُقصّ');
});

// ── التطبيق: js/app-22-session-new.js يقرأ ?q= ──
function runSessionNew({ search, newSession, typed, messages }) {
  const prompt = { value: typed || '', focused: false, dispatchEvent() {}, focus() { this.focused = true; }, setSelectionRange() {} };
  const state = { currentId: 'p1', projects: [{ id: 'p1', messages: messages || [] }] };
  const replaced = [];
  const store = newSession ? {} : { omran_sess_v1: '1' };
  const history = { children: { length: 1 } };
  const ctx = {
    window: { __omrS: state },
    location: { search, pathname: '/', hash: '' },
    history: { state: null, replaceState: (s, t, u) => replaced.push(u) },
    sessionStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    localStorage: { getItem: () => null },
    document: {
      readyState: 'complete',
      getElementById: (id) => (id === 'prompt' ? prompt : id === 'history' ? history : null),
      createElement: () => ({ style: {}, remove() {} }),
      body: { appendChild() {} },
    },
    URLSearchParams, Event: class { constructor(t) { this.type = t; } },
    requestAnimationFrame: () => {}, setTimeout: () => {}, MutationObserver: class { observe() {} disconnect() {} },
    saveState() {}, renderAll() {}, t: () => 'محادثة جديدة', lang: 'ar', __swallow() {},
  };
  ctx.window.__omrS = state;
  vm.runInNewContext(read('js/app-22-session-new.js'), ctx);
  return { prompt, state, replaced };
}

test('التطبيق: السؤال في صندوق المحادثة الجديدة ولا يُرسل، والرابط يُنظَّف', () => {
  const r = runSessionNew({ search: '?q=' + encodeURIComponent('لخّص لي هذه الصفحة') + '&ref=abc', newSession: true, messages: [{ role: 'user', content: 'قديم' }] });
  assert.equal(r.state.projects.length, 2, 'زيارة جديدة = محادثة جديدة رغم السؤال المكتوب');
  assert.equal(r.state.currentId, r.state.projects[1].id);
  assert.equal(r.prompt.value, 'لخّص لي هذه الصفحة');
  assert.equal(r.prompt.focused, true);
  assert.deepEqual(r.replaced, ['/?ref=abc'], 'q يُحذف وتبقى البقيّة');
  assert.doesNotMatch(read('js/app-22-session-new.js'), /sendPrompt\(/, 'لا إرسال تلقائيّ');
});

test('التطبيق: نفس التبويب يكتب في المحادثة الحاليّة، وما كتبه المستخدم لا يُطمس، والسؤال يُقصّ', () => {
  const same = runSessionNew({ search: '?q=hello', newSession: false, messages: [{ role: 'user', content: 'x' }] });
  assert.equal(same.state.projects.length, 1);
  assert.equal(same.prompt.value, 'hello');

  const typed = runSessionNew({ search: '?q=hello', newSession: false, typed: 'كنت أكتب' });
  assert.equal(typed.prompt.value, 'كنت أكتب');

  const long = runSessionNew({ search: '?q=' + 'a'.repeat(9000), newSession: false });
  assert.equal(long.prompt.value.length, 4000);

  const none = runSessionNew({ search: '', newSession: false });
  assert.equal(none.prompt.value, '');
  assert.deepEqual(none.replaced, []);
});

test('ملفّات المتجر لا تُنشر على الموقع', () => {
  const ignore = read('.vercelignore');
  assert.match(ignore, /^store\/$/m);
  assert.match(ignore, /^\*\.zip$/m);
});
