// v-browser-install: التطبيق في المتصفّحات — زرّ التثبيت وخطوات كلّ متصفّح بـ١٤ لغة، ?q= يعبّئ الصندوق،
// بيان جاهز لـMicrosoft Store، وإضافة واحدة لـChrome وEdge وFirefox.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const EXT = 'store/browser-extension/';
const APP = 'https://omran-ai-builder.vercel.app/';
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
const HOW = ['installHowIOS', 'installHowIOSOther', 'installHowAndroid', 'installHowDesktop', 'installHowMacSafari', 'installHowFirefox'];
const PROVIDERS = /claude|gemini|openai|gpt|groq|anthropic|openrouter/i;

test('زرّ التثبيت خرج من قاعدة الإخفاء والخمسة الباقية مخفيّة', () => {
  const html = read('index.html');
  const rule = /\n(#btnTemplates[^{]*)\{ display: none !important; \}/.exec(html);
  assert.ok(rule, 'قاعدة v473 موجودة');
  assert.doesNotMatch(rule[1], /#btnInstall\b(?!Header)/);
  for (const id of ['btnTemplates', 'btnAgentMode', 'btnInstallHeader', 'btnShareApp', 'btnGov']) assert.match(rule[1], new RegExp('#' + id + '\\b'));
  assert.match(html, /<button class="btn" id="btnInstall">/);
  assert.match(html, /rel="manifest" href="\/manifest\.json\?v=516-browser-install"/);
});

function howKeyFn() {
  const src = read('js/app-10-features.js');
  const m = /function installHowKey\(ua, touchPoints\)\{[\s\S]*?\n\}/.exec(src);
  assert.ok(m, 'installHowKey موجودة');
  const ctx = {};
  vm.runInNewContext(m[0] + '; this.f = installHowKey;', ctx);
  return ctx.f;
}

test('كلّ متصفّح يحصل على خطواته', () => {
  const f = howKeyFn();
  const cases = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 0, 'installHowDesktop'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', 0, 'installHowDesktop'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0', 0, 'installHowFirefox'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 0, 'installHowMacSafari'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 0, 'installHowDesktop'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 5, 'installHowIOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 5, 'installHowIOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1', 5, 'installHowIOSOther'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', 5, 'installHowAndroid'],
    ['Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0', 5, 'installHowAndroid'],
  ];
  for (const [ua, tp, want] of cases) assert.equal(f(ua, tp), want, ua);
  assert.match(read('js/app-10-features.js'), /alert\(d\[key\] \|\| \(I18N\.en \|\| \{\}\)\[key\] \|\| ''\)/);
});

test('خطوات التثبيت في ١٤ لغة بلا اسم مزوّد، ووسم ملفّات اللغات رُفع', () => {
  const data = read('js/app-03-i18n-data.js');
  for (const k of HOW) assert.equal((data.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 2, k + ' في العربيّة والإنجليزيّة');
  for (const lg of LANGS) {
    const src = read('i18n/' + lg + '.js');
    const ctx = { I18N: { [lg]: {} } };
    ctx.window = ctx;
    vm.runInNewContext(src, ctx);
    const d = ctx.I18N[lg];
    for (const k of ['install', ...HOW]) {
      assert.ok(typeof d[k] === 'string' && d[k].length > (k === 'install' ? 1 : 20), k + ' في ' + lg);
      assert.doesNotMatch(d[k], PROVIDERS, k + ' في ' + lg);
    }
  }
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=693'"));
});

function runQ(href) {
  const src = read('js/app-10-features.js');
  const m = /\(function\(\)\{\n  try \{\n    const u = new URL\(location\.href\);[\s\S]*?\n\}\)\(\);/.exec(src);
  assert.ok(m, 'كتلة ?q= موجودة');
  const prompt = { value: '', events: [], focused: false, dispatchEvent(e) { this.events.push(e.type); }, focus() { this.focused = true; } };
  const replaced = [];
  const timers = [];
  const ctx = {
    URL, location: { href }, history: { state: null, replaceState: (s, t, u) => replaced.push(u) },
    document: { readyState: 'complete', getElementById: (id) => (id === 'prompt' ? prompt : null), addEventListener() {} },
    Event: class { constructor(t) { this.type = t; } },
    setTimeout: (fn) => timers.push(fn), __swallow: () => {},
  };
  vm.runInNewContext(m[0], ctx);
  timers.forEach((fn) => fn());
  return { prompt, replaced };
}

test('?q= يعبّئ صندوق المحادثة ولا يرسل، ويُحذف من الرابط وحده', () => {
  const r = runQ('https://omran-ai-builder.vercel.app/?ref=abc&q=' + encodeURIComponent('  اشرح هذا النصّ  ') + '#x');
  assert.equal(r.prompt.value, 'اشرح هذا النصّ');
  assert.deepEqual(r.prompt.events, ['input']);
  assert.ok(r.prompt.focused);
  assert.deepEqual(r.replaced, ['/?ref=abc#x']);
  const none = runQ('https://omran-ai-builder.vercel.app/?ref=abc');
  assert.equal(none.prompt.value, '');
  assert.deepEqual(none.replaced, []);
  assert.equal(runQ(APP + '?q=' + 'a'.repeat(5000)).prompt.value.length, 4000);
  assert.match(read('opensearch.xml'), /template="https:\/\/omran-ai-builder\.vercel\.app\/\?q=\{searchTerms\}"/, 'بحث المتصفّح يمرّ بالمسار نفسه');
});

test('البيان جاهز لـMicrosoft Store ونافذة التثبيت الغنيّة، بلا تغيير هويّة التطبيق', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(new URL(m.id, APP).href, new URL(m.start_url, new URL('manifest.json', APP)).href, 'id = ما كان يُحسب من start_url');
  assert.equal(m.display, 'standalone');
  assert.ok(Array.isArray(m.categories) && m.categories.includes('productivity'));
  assert.equal(m.prefer_related_applications, false);
  const forms = new Set();
  for (const s of m.screenshots) {
    const buf = fs.readFileSync(path.join(ROOT, s.src));
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
    assert.ok(buf.length < 200 * 1024, s.src + ' خفيفة');
    assert.match(s.sizes, /^\d+x\d+$/);
    forms.add(s.form_factor);
  }
  assert.deepEqual([...forms].sort(), ['narrow', 'wide']);
  assert.doesNotMatch(read('.vercelignore'), /^assets\/?$/m, 'اللقطات تُنشر');
  assert.ok(fs.existsSync(path.join(ROOT, 'store/microsoft/README.md')));
});

test('إضافة المتصفّح: MV3 لثلاثة متصفّحات بأقلّ صلاحيّة', () => {
  const m = JSON.parse(read(EXT + 'manifest.json'));
  assert.equal(m.manifest_version, 3);
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(m.permissions, ['contextMenus']);
  assert.equal(m.host_permissions, undefined);
  assert.equal(m.content_scripts, undefined);
  assert.equal(m.background.service_worker, 'background.js', 'Chrome وEdge');
  assert.deepEqual(m.background.scripts, ['background.js'], 'Firefox');
  assert.equal(m.omnibox.keyword, 'om');
  assert.ok(m.browser_specific_settings.gecko.id);
  assert.deepEqual(m.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
  for (const [size, p] of Object.entries(m.icons)) {
    const buf = fs.readFileSync(path.join(ROOT, EXT, p));
    assert.equal(buf.readUInt32BE(16), Number(size), p + ' عرضه ' + size);
    assert.equal(buf.readUInt32BE(20), Number(size));
  }
  for (const f of ['popup.html', 'popup.js', 'popup.css', 'background.js']) assert.ok(fs.existsSync(path.join(ROOT, EXT, f)), f);
  assert.doesNotMatch(read(EXT + 'popup.html'), /<script>(?!<)/, 'لا سكربت مضمَّن (CSP في MV3)');
});

test('إضافة المتصفّح: الزرّ الأيمن وشريط العنوان يفتحان التطبيق بالنصّ', () => {
  const menus = [];
  const tabs = [];
  const on = {};
  const ev = (name) => ({ addListener: (fn) => { on[name] = fn; } });
  const chrome = {
    runtime: { onInstalled: ev('installed') },
    contextMenus: { removeAll: (cb) => cb(), create: (o) => menus.push(o), onClicked: ev('clicked') },
    omnibox: { setDefaultSuggestion() {}, onInputEntered: ev('omnibox') },
    tabs: { create: (o) => tabs.push(o.url) },
    i18n: { getMessage: (k) => k },
  };
  vm.runInNewContext(read(EXT + 'background.js'), { chrome });
  on.installed();
  assert.deepEqual(menus.map((x) => [x.id, x.contexts[0]]), [['omran-ask', 'selection'], ['omran-open', 'action']]);
  on.clicked({ menuItemId: 'omran-ask', selectionText: '  مرحبا & يا عمران ' });
  on.omnibox('build me a site');
  on.clicked({ menuItemId: 'omran-open' });
  assert.deepEqual(tabs, [APP + '?q=' + encodeURIComponent('مرحبا & يا عمران'), APP + '?q=build%20me%20a%20site', APP]);
  assert.match(read(EXT + 'popup.js'), /const APP = 'https:\/\/omran-ai-builder\.vercel\.app\/';/);
});

test('إضافة المتصفّح: ١٤ لغة كاملة، الوصف ضمن حدّ Chrome، بلا اسم مزوّد', () => {
  const dirs = fs.readdirSync(path.join(ROOT, EXT, '_locales')).sort();
  assert.deepEqual(dirs, ['ar', 'bn', 'en', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh_CN']);
  const used = new Set();
  const all = read(EXT + 'manifest.json') + read(EXT + 'popup.html') + read(EXT + 'background.js');
  for (const r of [/__MSG_(\w+)__/g, /data-msg(?:-placeholder)?="(\w+)"/g, /getMessage\('(\w+)'\)/g]) for (const x of all.matchAll(r)) used.add(x[1]);
  assert.ok(used.size >= 7);
  for (const lg of dirs) {
    const msgs = JSON.parse(read(EXT + '_locales/' + lg + '/messages.json'));
    for (const k of used) assert.ok(msgs[k] && msgs[k].message, k + ' في ' + lg);
    assert.ok(msgs.extName.message.length <= 45, 'الاسم ' + lg);
    assert.ok(msgs.extDesc.message.length <= 132, 'الوصف ' + lg + ' ' + msgs.extDesc.message.length);
    assert.match(msgs.ctxAsk.message, /%s/, 'النصّ المحدّد في عنوان القائمة ' + lg);
    assert.doesNotMatch(JSON.stringify(msgs), PROVIDERS, lg);
  }
});

test('إضافة المتصفّح: الحزمة zip سليمة وتضمّ ملفّات الإضافة وحدها', async () => {
  const { buildZip } = await import(path.join(ROOT, 'scripts/extension-zip.mjs'));
  const zlib = require('node:zlib');
  const files = [{ name: 'manifest.json', data: Buffer.from('{"a":1}') }, { name: '_locales/ar/messages.json', data: Buffer.from('{"x":"عمران"}') }];
  const zip = buildZip(files);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  let off = 0;
  for (const f of files) {
    const nameLen = zip.readUInt16LE(off + 26);
    const size = zip.readUInt32LE(off + 18);
    assert.equal(zip.toString('utf8', off + 30, off + 30 + nameLen), f.name);
    const body = zlib.inflateRawSync(zip.subarray(off + 30 + nameLen, off + 30 + nameLen + size));
    assert.deepEqual(body, f.data);
    assert.equal(zip.readUInt32LE(off + 14), zlib.crc32(f.data) >>> 0);
    off += 30 + nameLen + size;
  }
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), files.length);
  const src = read('scripts/extension-zip.mjs');
  assert.match(src, /const SKIP = new Set\(\['dist', 'README\.md'/, 'الوثائق والناتج لا تدخل الحزمة');
  assert.equal(JSON.parse(read('package.json')).scripts['extension:zip'], 'node scripts/extension-zip.mjs');
});
