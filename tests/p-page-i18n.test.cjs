// tests/p-page-i18n.test.cjs — v-share-pages-i18n (تدقيق ١٨ أكتوبر، g02/page-p-shared): صفحة المشروع المنشور p.html
// بلا أيّ ترجمة — «بواسطة زائر» وتاريخ ar-EG وحالات التحميل والخطأ وشارة «صُنع بـ… سوّ موقعك ببلاش» عربيّة لكلّ لغة،
// و<html> بلا lang/dir، والبراند القديم «⚡ Omran AI Builder». الآن: جدول P_STR باللغات الـ١٤، واللغة من aiapp_lang
// ثمّ لغة المتصفّح ثمّ العربيّة، والعنوان المترجَم من ذاكرة «استكشف» المحلّيّة (explore_title_cache) بلا أيّ نداء ترجمة.
// يشغّل سكربت p.html الحقيقيّ في vm على DOM مزيّف (نمط explore-xss).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'p.html'), 'utf8');
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const LANGS = ['ar', 'en', 'fr', 'es', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'ml', 'ru', 'tr', 'zh'];
const ARABIC = /[؀-ۿ]/;

function run({ lang = 'en', nav = 'en-US', data = null, status = 200, titleCache = null, id = 'abc' } = {}) {
  const mk = () => ({ textContent: '', style: {}, dir: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild() {}, set srcdoc(v) { this._src = v; }, get srcdoc() { return this._src; } });
  const byId = {};
  for (const k of ['state', 'frame', 'pTitle', 'pMeta', 'chatWrap', 'chatInner']) byId[k] = mk();
  const badgeParts = { '.mw': mk(), '.cta': mk(), 'button': mk() };
  byId.omMadeWith = Object.assign(mk(), { querySelector: (s) => badgeParts[s] || null });
  const store = new Map();
  if (lang) store.set('aiapp_lang', lang);
  if (titleCache) store.set('explore_title_cache', JSON.stringify(titleCache));
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => (data || {}) };
  };
  const documentElement = { lang: '', dir: '' };
  const ctx = {
    document: { getElementById: (k) => byId[k] || null, createElement: mk, createTextNode: (t) => ({ t }), documentElement, title: '' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    navigator: { language: nav },
    location: { search: id ? '?id=' + id : '' },
    URLSearchParams, fetch, Date, JSON, Promise, String, Array, encodeURIComponent, console,
  };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return { byId, badgeParts, documentElement, calls, ctx };
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const CREATED = Date.UTC(2026, 9, 18, 9, 0, 0);

test('١. بالإنجليزيّة: «By Guest — <تاريخ en>» بلا حرف عربيّ، وhtml lang=en dir=ltr، والشارة إنجليزيّة', async () => {
  const r = run({ lang: 'en', data: { title: 'My shop', username: 'زائر', createdAt: CREATED, code: '<p>x</p>' } });
  await settle();
  const meta = r.byId.pMeta.textContent;
  assert.ok(meta.startsWith('By Guest — '), meta);
  assert.ok(meta.includes(new Date(CREATED).toLocaleDateString('en-US')), meta);
  assert.doesNotMatch(meta, ARABIC);
  assert.equal(r.documentElement.lang, 'en');
  assert.equal(r.documentElement.dir, 'ltr');
  assert.equal(r.badgeParts['.mw'].textContent, 'Made with');
  assert.doesNotMatch(r.badgeParts['.cta'].textContent, ARABIC);
  assert.equal(r.badgeParts.button.attrs['aria-label'], 'Hide');
  assert.equal(r.byId.omMadeWith.dir, 'ltr');
  assert.equal(r.ctx.document.title, 'My shop — OM Ai');
  assert.equal(r.byId.pTitle.dir, 'auto', 'العنوان باتّجاه نصّه');
  // اسم حقيقيّ يبقى كما هو، والفارغ ضيف
  const named = run({ lang: 'en', data: { title: 't', username: 'sara', createdAt: CREATED, code: 'x' } });
  await settle();
  assert.ok(named.byId.pMeta.textContent.startsWith('By sara — '));
  const blank = run({ lang: 'en', data: { title: 't', username: '', createdAt: CREATED, code: 'x' } });
  await settle();
  assert.ok(blank.byId.pMeta.textContent.startsWith('By Guest — '));
});

test('٢. P_STR باللغات الـ١٤ بمجموعة مفاتيح واحدة، وكلّ لغة تُعرف (lang/dir) وحالاتها بلغتها', async () => {
  const at = script.indexOf('const P_STR = ');
  assert.ok(at >= 0, 'الجدول موجود');
  const end = script.indexOf('\n  };', at);
  const P = vm.runInNewContext('(' + script.slice(at + 'const P_STR = '.length, end + 4) + ')');
  assert.deepEqual(Object.keys(P).sort(), LANGS.slice().sort());
  const keys = Object.keys(P.ar).sort();
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(P[l]).sort(), keys, l);
    for (const k of keys) assert.ok(typeof P[l][k] === 'string' && P[l][k].trim(), l + '.' + k);
    if (l !== 'ar' && l !== 'ur') for (const k of keys) assert.doesNotMatch(P[l][k], ARABIC, l + '.' + k);
    const r = run({ lang: l, data: null, status: 404 });
    await settle();
    assert.equal(r.documentElement.lang, l);
    assert.equal(r.documentElement.dir, (l === 'ar' || l === 'ur') ? 'rtl' : 'ltr', l);
    assert.equal(r.byId.state.textContent, P[l].notFound, l + ': رسالة «غير موجود» بلغتها');
  }
});

test('٣. اللغة: aiapp_lang أوّلًا، ثمّ لغة المتصفّح، ثمّ العربيّة؛ وبلا معرّف رسالة بلغتها', async () => {
  assert.equal(run({ lang: null, nav: 'tr-TR', status: 404 }).documentElement.lang, 'tr');
  assert.equal(run({ lang: null, nav: 'de-DE', status: 404 }).documentElement.lang, 'ar');
  assert.equal(run({ lang: 'fr', nav: 'tr-TR', status: 404 }).documentElement.lang, 'fr');
  const noId = run({ lang: 'en', id: '' });
  assert.equal(noId.byId.state.textContent, 'No project ID in the link.');
  assert.equal(noId.calls.length, 0);
  await settle();
});

test('٤. العنوان المترجَم من ذاكرة «استكشف» المحلّيّة إن وُجد، وبلا أيّ نداء /api/translate', async () => {
  const cached = run({ lang: 'ar', titleCache: { abc_ar: 'برجاء البناء والنشر' }, data: { title: 'Please build and deploy the co', username: 'sara', createdAt: CREATED, code: 'x' } });
  await settle();
  assert.equal(cached.byId.pTitle.textContent, 'برجاء البناء والنشر');
  assert.ok(cached.calls.every((u) => !u.includes('/api/translate')), cached.calls.join());
  const raw = run({ lang: 'en', titleCache: { abc_ar: 'برجاء' }, data: { title: 'Please build and deploy the co', username: 'sara', createdAt: CREATED, code: 'x' } });
  await settle();
  assert.equal(raw.byId.pTitle.textContent, 'Please build and deploy the co', 'ذاكرة لغة أخرى لا تُستعمل');
  assert.deepEqual(raw.calls, ['/api/share?id=abc']);
});

test('٥. لا براند قديم «Omran AI Builder» في الصفحة، والرابط والعنوان باسم OM Ai', () => {
  assert.doesNotMatch(html, /Omran AI Builder/);
  assert.match(html, /<a class="brand" href="\/">OM Ai<\/a>/);
  assert.match(html, /<title>[^<]*— OM Ai<\/title>/);
});
