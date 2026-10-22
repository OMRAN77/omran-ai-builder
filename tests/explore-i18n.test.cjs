// tests/explore-i18n.test.cjs — v-share-pages-i18n (تدقيق ١٨ أكتوبر، g02/page-explore): صفحة «استكشف» فيها ٧ لغات من ١٤
// (es وfil وid وml وru وtr وzh ترجع للعربيّ)، وكلّ نصوصها بالبراند القديم «⚡ … Omran AI Builder»، واسم الضيف يصل
// من الخادم «زائر» فيظهر «By زائر». الآن: الجدول باللغات الـ١٤ بمفاتيح واحدة، وOM Ai بلا ⚡، والضيف بلغة الواجهة.
// يشغّل سكربت explore.html الحقيقيّ في vm (نمط explore-xss).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'explore.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const LANGS = ['ar', 'en', 'fr', 'es', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'ml', 'ru', 'tr', 'zh'];
const ARABIC = /[؀-ۿ]/;

function table() {
  const at = script.indexOf('const EXPLORE_STR = ');
  const end = script.indexOf('\n};', at);
  return vm.runInNewContext('(' + script.slice(at + 'const EXPLORE_STR = '.length, end + 2) + ')');
}

function run(lang, items) {
  const mk = (tag) => ({ tagName: String(tag).toUpperCase(), className: '', textContent: '', href: '', style: {}, children: [], appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, remove() {} });
  const byId = {};
  for (const id of ['pageTitle', 'hTitle', 'hBack', 'empty', 'grid']) byId[id] = mk('div');
  const store = new Map([['aiapp_lang', lang]]);
  const documentElement = {};
  const fetch = async (url) => {
    const u = String(url);
    if (u.startsWith('/api/share?explore=1')) return { json: async () => ({ items }) };
    return { json: async () => ({}) };
  };
  const ctx = {
    document: { getElementById: (id) => byId[id], createElement: mk, documentElement },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch, confirm: () => false, alert() {}, Date, JSON, Promise, encodeURIComponent, console,
  };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return { byId, documentElement };
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test('١. EXPLORE_STR باللغات الـ١٤ بمجموعة مفاتيح واحدة، بلا «Omran AI Builder» ولا ⚡', () => {
  const S = table();
  assert.deepEqual(Object.keys(S).sort(), LANGS.slice().sort());
  const keys = Object.keys(S.ar).sort();
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(S[l]).sort(), keys, l);
    for (const k of keys) {
      assert.ok(typeof S[l][k] === 'string' && S[l][k].trim(), l + '.' + k);
      assert.doesNotMatch(S[l][k], /Omran AI Builder|⚡/, l + '.' + k);
      if (l !== 'ar' && l !== 'ur') assert.doesNotMatch(S[l][k], ARABIC, l + '.' + k);
    }
    assert.match(S[l].pageTitle, /OM Ai/, l);
    assert.match(S[l].back, /OM Ai/, l);
  }
  // المحتوى الثابت قبل السكربت كذلك
  assert.doesNotMatch(html, /Omran AI Builder|⚡/);
});

test('٢. بالتركيّة: رابط الرجوع والعنوان تركيّان وdir=ltr (كانت ترجع للعربيّ)', async () => {
  const S = table();
  const r = run('tr', []);
  await settle();
  assert.equal(r.byId.hBack.textContent, S.tr.back);
  assert.doesNotMatch(r.byId.hBack.textContent, ARABIC);
  assert.equal(r.byId.hTitle.textContent, S.tr.title);
  assert.equal(r.documentElement.dir, 'ltr');
  assert.equal(r.documentElement.lang, 'tr');
  assert.equal(r.byId.empty.textContent, S.tr.empty);
});

test('٣. اسم الضيف بلغة الواجهة: الخادم يرسل "" (أو «زائر» من سجلّ قديم) فيظهر «By Guest — …»', async () => {
  const now = Date.UTC(2026, 9, 18);
  const r = run('en', [{ id: 'a', title: 'x', username: '', createdAt: now }, { id: 'b', title: 'y', username: 'زائر', createdAt: now }, { id: 'c', title: 'z', username: 'sara', createdAt: now }]);
  await settle();
  const metas = r.byId.grid.children.map((card) => card.children[0].children[1].children[1].textContent);
  assert.ok(metas[0].startsWith('By Guest — '), metas[0]);
  assert.ok(metas[1].startsWith('By Guest — '), metas[1]);
  assert.ok(metas[2].startsWith('By sara — '), metas[2]);
  for (const m of metas) assert.doesNotMatch(m, ARABIC);
});
