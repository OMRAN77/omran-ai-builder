'use strict';
/* v-chip-selected (تدقيق ١٨–١٩ أكتوبر، g14 — منتقي المزوّد للمالك تحت صندوق الكتابة):
   العرض: (١) المزوّد والنموذج المختاران رماديّان باهتان كأنّهما معطّلان — التمييز كان لون var(--accent) وحده، وهو #6b7280
   في الوضع الأسود، أبهت من النصّ العاديّ. (٢) «الوكيل» ظاهر مع كلّ مزوّد، ونقره مع GPT يطلق توست «الوكيل شغّال»
   والشريحة لا تتغيّر — والوكيل يعمل مع Claude وحده (v-prov-self).
   القرار: المختار بلون النصّ نفسه وخطّ عريض وخلفيّة خفيفة وaria-current وعلامة ✓؛ وصفّ الوكيل مع Claude وحده ومعلَّم حين يعمل.
   الاختبار يشغّل js/modes.js الحقيقيّ في vm على شجرة صغيرة تحلّل الوسوم التي يبنيها. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function miniDom() {
  const all = (el, out) => { const list = out || []; list.push(el); for (const c of el.children) all(c, list); return list; };
  const simple = (el, part) => (part.match(/^[a-z]+|#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]/g) || []).every((t) => {
    if (t[0] === '#') return el.id === t.slice(1);
    if (t[0] === '.') return el.cls.has(t.slice(1));
    if (t[0] === '[') { const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(t); return m[1] in el.attrs && (m[2] === undefined || el.attrs[m[1]] === m[2]); }
    return el.tagName === t.toUpperCase();
  });
  const matches = (el, list) => list.split(',').some((s) => simple(el, s.trim()));
  const camel = (k) => k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const mk = (tag, attrs) => {
    const el = { tagName: String(tag).toUpperCase(), attrs: Object.assign({}, attrs), children: [], parentElement: null, style: {}, cls: new Set(), listeners: {}, _text: '' };
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach((x) => el.cls.add(x));
      if (k === 'style') String(v).split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) el.style[camel(d.slice(0, i))] = d.slice(i + 1).trim(); });
    }
    el.id = el.attrs.id || '';
    el.hidden = 'hidden' in el.attrs;
    el.classList = { add: (x) => el.cls.add(x), remove: (x) => el.cls.delete(x), contains: (x) => el.cls.has(x), toggle: (x, on) => { const w = on === undefined ? !el.cls.has(x) : !!on; if (w) el.cls.add(x); else el.cls.delete(x); return w; } };
    el.setAttribute = (k, v) => { el.attrs[k] = String(v); if (k === 'id') el.id = String(v); };
    el.getAttribute = (k) => (k in el.attrs ? el.attrs[k] : null);
    el.hasAttribute = (k) => k in el.attrs;
    el.removeAttribute = (k) => { delete el.attrs[k]; };
    el.appendChild = (c) => { if (c.parentElement) c.remove(); c.parentElement = el; el.children.push(c); return c; };
    el.insertBefore = (c, ref) => { if (!ref) return el.appendChild(c); if (c.parentElement) c.remove(); c.parentElement = el; el.children.splice(el.children.indexOf(ref), 0, c); return c; };
    el.remove = () => { const p = el.parentElement; if (p) { p.children.splice(p.children.indexOf(el), 1); el.parentElement = null; } };
    el.querySelectorAll = (sel) => all(el).filter((x) => x !== el && matches(x, sel));
    el.querySelector = (sel) => el.querySelectorAll(sel)[0] || null;
    el.closest = (sel) => { let p = el; while (p) { if (p.cls && matches(p, sel)) return p; p = p.parentElement; } return null; };
    el.addEventListener = (t, fn) => { (el.listeners[t] = el.listeners[t] || []).push(fn); };
    el.click = () => { el.clicks = (el.clicks || 0) + 1; };
    Object.defineProperty(el, 'parentNode', { get: () => el.parentElement });
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    Object.defineProperty(el, 'firstElementChild', { get: () => el.children[0] || null });
    Object.defineProperty(el, 'nextSibling', { get: () => { const p = el.parentElement; return p ? p.children[p.children.indexOf(el) + 1] || null : null; } });
    Object.defineProperty(el, 'nextElementSibling', { get: () => { const p = el.parentElement; return p ? p.children.slice(p.children.indexOf(el) + 1).find((c) => c.tagName !== '#TEXT') || null : null; } });
    Object.defineProperty(el, 'textContent', { get: () => el._text + el.children.map((c) => c.textContent).join(''), set: (v) => { el.children = []; el._text = String(v); } });
    Object.defineProperty(el, 'innerHTML', { get: () => '', set: (html) => { el.children = []; el._text = ''; parse(String(html), el); } });
    Object.defineProperty(el, 'className', { get: () => [...el.cls].join(' '), set: (v) => { el.cls = new Set(String(v).split(/\s+/).filter(Boolean)); } });
    return el;
  };
  const parse = (html, parent) => {
    const re = /<(\/)?([a-z]+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>|([^<]+)/g;
    let cur = parent, m;
    while ((m = re.exec(html))) {
      if (m[4] !== undefined) { const t = mk('#text', {}); t._text = m[4].replace(/&times;/g, '×'); cur.appendChild(t); continue; }
      if (m[1]) { cur = cur.parentElement; continue; }
      const attrs = {};
      for (const a of m[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? '' : a[2];
      const el = mk(m[2], attrs);
      cur.appendChild(el);
      cur = el;
    }
    assert.equal(cur, parent, 'الوسوم متوازنة');
  };
  return { mk, all };
}

function boot(provider, agentOn) {
  const { mk, all } = miniDom();
  const root = mk('body', {});
  const box = root.appendChild(mk('div', { id: 'composerBox' }));
  box.appendChild(mk('textarea', { id: 'prompt' }));
  root.appendChild(mk('div', { id: 'plusToolsPopup' }));
  const inputbar = root.appendChild(mk('div', { id: 'inputbar' }));
  inputbar.appendChild(mk('div', { id: 'composerRow' }));
  inputbar.appendChild(mk('div', { id: 'omranBelow' }));
  const toggle = root.appendChild(mk('button', { id: 'btnPremiumToggle' }));
  const store = new Map([['aiapp_provider', provider]]);
  const document = {
    readyState: 'complete', body: root,
    documentElement: { getAttribute: (k) => (k === 'lang' ? 'ar' : null) },
    getElementById: (id) => all(root).find((x) => x.id === id) || null,
    createElement: (tag) => mk(tag, {}),
    addEventListener() {},
  };
  const ctx = {
    document, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    authGet: (k) => (k === 'aiapp_username' ? 'omran' : ''), omranOwnerUi: () => true, t: (k) => k,
    fetch: () => Promise.resolve({ ok: false }), setTimeout: () => 0, MutationObserver: class { observe() {} },
    addEventListener() {}, Date, Math, JSON, String, Promise,
  };
  ctx.window = ctx;
  ctx.__agentModeOn = !!agentOn;
  vm.createContext(ctx);
  vm.runInContext(read('js/modes.js'), ctx);
  const pop = document.getElementById('omModelPopup');
  assert.ok(pop && pop.children.length, 'المنتقي بُني للمالك');
  return { ctx, pop, toggle, store };
}
const ACCENT = /accent/;
const marked = (el) => el.getAttribute('aria-current') === 'true' && /✓/.test(el.textContent) && String(el.style.fontWeight) === '700';

test('١. المزوّد والنموذج المختاران بلون النصّ وخطّ عريض وaria-current و✓ — لا لون الإبراز الرماديّ', () => {
  const { pop } = boot('openai');
  const heads = pop.querySelectorAll('.omProvHead');
  const sel = heads.filter((h) => h.getAttribute('data-prov') === 'openai');
  assert.equal(sel.length, 1);
  assert.ok(marked(sel[0]), 'رأس المختار معلَّم');
  assert.doesNotMatch(String(sel[0].style.color), ACCENT, 'لون المختار صار var(--accent) الباهت');
  assert.ok(sel[0].style.background, 'خلفيّة خفيفة تميّزه');
  for (const h of heads) if (h !== sel[0]) { assert.equal(h.getAttribute('aria-current'), null, h.getAttribute('data-prov')); assert.doesNotMatch(h.textContent, /✓/); }
  const models = pop.querySelectorAll('.omProvModel').filter((m) => m.getAttribute('aria-current') === 'true');
  assert.equal(models.length, 1, 'نموذج واحد مختار');
  assert.equal(models[0].getAttribute('data-prov'), 'openai');
  assert.ok(marked(models[0]));
  assert.doesNotMatch(String(models[0].style.color), ACCENT);
});

test('٢. تبديل المزوّد ينقل العلامة ولا يتركها على السابق', () => {
  const b = boot('openai');
  b.store.set('aiapp_provider', 'deepseek');
  b.ctx.omModelChipSync();
  const on = b.pop.querySelectorAll('.omProvHead').filter((h) => h.getAttribute('aria-current') === 'true').map((h) => h.getAttribute('data-prov'));
  assert.deepEqual(on, ['deepseek']);
  assert.equal(b.pop.querySelectorAll('.omProvHead').filter((h) => /✓/.test(h.textContent)).length, 1, '✓ واحدة');
});

test('٣. «الوكيل» مع GPT: الصفّ مخفيّ ونقره لا يشغّل الوكيل', () => {
  const { pop, toggle } = boot('openai');
  const row = pop.querySelector('.omModelOpt[data-act="agent"]');
  assert.ok(row);
  assert.equal(row.style.display, 'none', 'ظاهر مع غير Claude');
  assert.equal(row.nextElementSibling.style.display, 'none', 'خطّ الفصل تحته يختفي معه');
  (pop.listeners.click || []).forEach((fn) => fn({ target: row, stopPropagation() {} }));
  assert.equal(toggle.clicks || 0, 0, 'نقره شغّل الوكيل مع GPT');
});

test('٤. «الوكيل» مع Claude: ظاهر، ومعلَّم حين يعمل', () => {
  const off = boot('claude', false);
  const r0 = off.pop.querySelector('.omModelOpt[data-act="agent"]');
  assert.notEqual(r0.style.display, 'none');
  assert.equal(r0.getAttribute('aria-current'), null);
  const on = boot('claude', true);
  const r1 = on.pop.querySelector('.omModelOpt[data-act="agent"]');
  assert.notEqual(r1.style.display, 'none');
  assert.ok(marked(r1), 'الوكيل الشغّال معلَّم');
  (on.pop.listeners.click || []).forEach((fn) => fn({ target: r1, stopPropagation() {} }));
  assert.equal(on.toggle.clicks, 1, 'مع Claude يبدّل كما كان');
});
