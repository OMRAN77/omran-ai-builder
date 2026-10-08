// tests/explore-xss.test.cjs — v-explore-xss (مراجعة ٨ أكتوبر، ثمّ «نعم أضفه»): صفحة «استكشف» كانت تبني البطاقة بـinnerHTML
// من عنوان المشروع واسم الناشر — يكتبهما الناشر (والعنوان المترجَم ناتج نموذج) — فعنوان مثل <img src=x onerror=…> ينفّذ
// سكربتًا على نطاق التطبيق نفسه ويقرأ رمز الجلسة من التخزين. الآن نصّ (textContent) لا HTML.
// يشغّل سكربت explore.html الحقيقيّ في vm على DOM مزيّف يسجّل كلّ innerHTML.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'explore.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const PAYLOAD = '<img src=x onerror="window.__pwned=1">';

function run({ lang = 'ar', translated = null, me = null } = {}) {
  const htmlWrites = [];
  const all = [];
  const mk = (tag) => {
    const n = {
      tagName: String(tag).toUpperCase(), className: '', textContent: '', href: '', type: '', title: '',
      style: {}, children: [], listeners: {},
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(t, f) { this.listeners[t] = f; },
      remove() {},
      querySelector() { return null; },
    };
    Object.defineProperty(n, 'innerHTML', { set(v) { htmlWrites.push(String(v)); }, get() { return ''; } });
    all.push(n);
    return n;
  };
  const byId = {};
  for (const id of ['pageTitle', 'hTitle', 'hBack', 'empty', 'grid']) byId[id] = mk('div');
  const store = new Map([['aiapp_lang', lang]]);
  if (me) store.set('aiapp_username', me);
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const items = [{ id: 'p1', title: PAYLOAD, username: '<svg onload="window.__pwned=2">', createdAt: Date.now() }];
  const fetch = async (url) => {
    const u = String(url);
    if (u.startsWith('/api/share?explore=1')) return { json: async () => ({ items }) };
    if (u.startsWith('/api/translate')) return { json: async () => ({ translations: [translated || PAYLOAD] }) };
    return { json: async () => ({}) };
  };
  const ctx = {
    document: { getElementById: (id) => byId[id], createElement: mk, documentElement: {} },
    localStorage: storage, sessionStorage: { getItem: () => null, setItem() {} },
    fetch, confirm: () => false, alert() {}, Date, JSON, Promise, encodeURIComponent, console,
  };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return { htmlWrites, all, grid: byId.grid, ctx };
}
const settle = () => new Promise((r) => setTimeout(r, 30));
const texts = (n, out = []) => { out.push(n.textContent); n.children.forEach((c) => texts(c, out)); return out; };

test('١. عنوان المشروع واسم الناشر نصّ لا HTML — بلا أيّ innerHTML يحمل ما كتبه الناشر', async () => {
  const r = run({ lang: 'ar' });
  await settle();
  assert.equal(r.grid.children.length, 1, 'البطاقة رُسمت');
  const joined = r.htmlWrites.join('\n');
  assert.doesNotMatch(joined, /onerror|onload/, 'لا innerHTML بمدخل الناشر: ' + joined.slice(0, 200));
  const t = texts(r.grid);
  assert.ok(t.includes(PAYLOAD), 'العنوان يظهر حرفيًّا نصًّا');
  assert.ok(t.some((x) => x.includes('<svg onload')), 'اسم الناشر يظهر حرفيًّا نصًّا');
  assert.equal(r.ctx.__pwned, undefined);
});

test('٢. العنوان المترجَم (ناتج نموذج) نصّ كذلك، والرابط والحذف لصاحب المشروع كما كانا', async () => {
  const r = run({ lang: 'en', translated: '<img src=y onerror=alert(1)>', me: '<svg onload="window.__pwned=2">' });
  await settle();
  assert.doesNotMatch(r.htmlWrites.join('\n'), /onerror|onload/);
  const card = r.grid.children[0];
  const link = card.children[0];
  assert.equal(link.href, '/p.html?id=p1');
  const del = card.children.find((c) => c.className === 'delBtn');
  assert.ok(del && typeof del.listeners.click === 'function', 'زرّ الحذف لصاحب المشروع');
  assert.ok(texts(card).includes('<img src=y onerror=alert(1)>'));
});
