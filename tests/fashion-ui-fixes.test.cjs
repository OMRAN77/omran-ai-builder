'use strict';
/* v-fashion-ui-fixes (تدقيق ١٨ أكتوبر، الأزياء): IIFE الأزياء الحقيقيّ من app-12 في vm بـDOM مزيّف.
   ١) «استخدم هذه الإطلالة» كان ميّتًا مع صورة مرفوعة — يطبّق الإطلالة على صورتك نفسها مع «صمم» (لا تبديل يُسقط صورتك)،
      وفي الوضع النصّيّ يعبّئ الوصف بلا «Colors:» و«Accessories:» إنجليزيّة ولا «..».
   ٢) صفّ «عدّل شيئًا محددًا» يلتفّ فلا يُقصّ المثال، ورسالتا التحقّق تحت الصفّ لا عند «صمم» البعيد (خارج الشاشة).
   ٣) نتائج المقارنة بتسميات لغة الواجهة (A/B/C) وتلميح مترجم و«✓» للمختار، وخليّة الخطأ نصّ مفهوم لا رمز الخادم.
   ٤) البطاقة الرابعة تقول «الحد ٣ أنماط» بدل الصمت، وأيّ اختيار ناجح يمسح «اختر إطلالتين» الباقية. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const ST = fs.readFileSync(path.join(root, 'js', 'app-12-studios.js'), 'utf8');
const HELPERS = ST.slice(0, ST.indexOf('/* ---------- 🏠 AI Interior Design'));
const FX = ST.slice(ST.indexOf("(function(){\n  const modal = $('#fashionAiModal');"), ST.indexOf('/* ---------- 🕌 Religious Insights'));
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 15));
const WOMEN = (ST.match(/women: \[([^\]]*)\]/) || [])[1].split(',').map((s) => s.trim().replace(/'/g, ''));

function mkEl(tag, id) {
  const ls = {};
  const cls = new Set();
  let html = '';
  const q = {};
  const el = {
    tagName: String(tag || 'div').toUpperCase(), id: id || '', style: { cssText: '' }, dataset: {}, children: [], parentElement: null, parentNode: null,
    value: '', textContent: '', className: '', disabled: false, checked: false, files: null, options: [], attrs: {}, listeners: ls,
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; if (v) cls.add(c); else cls.delete(c); return v; } },
    addEventListener(t, f) { (ls[t] = ls[t] || []).push(f); },
    removeEventListener() {},
    dispatchEvent(ev) { (ls[ev.type] || []).slice().forEach((f) => f.call(el, ev)); return true; },
    appendChild(c) { c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c) { return el.appendChild(c); },
    insertAdjacentElement(pos, c) { if (el.parentElement && pos === 'afterend') el.parentElement.appendChild(c); return c; },
    remove() { el.removed = true; },
    setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    removeAttribute(k) { delete el.attrs[k]; }, hasAttribute(k) { return k in el.attrs; },
    /* عقد innerHTML تُصنع عند أوّل طلب بالصنف، ونصّها من القالب */
    querySelector(sel) {
      if (q[sel]) return q[sel];
      const m = /^\.([\w-]+)$/.exec(sel);
      if (m) {
        const tm = new RegExp('<(\\w+)[^>]*class="[^"]*\\b' + m[1] + '\\b[^"]*"[^>]*>([^<]*)<').exec(html);
        if (tm) { const c = mkEl(tm[1]); c.textContent = tm[2]; c.className = m[1]; c.parentElement = el; q[sel] = c; return c; }
      }
      for (const ch of el.children) { const r = ch.querySelector && ch.querySelector(sel); if (r) return r; }
      return null;
    },
    querySelectorAll(sel) {
      if (sel === ':scope > div') return el.children.filter((c) => c.tagName === 'DIV');
      const out = [];
      const match = (c) => (sel === '.fashionCompareCheck:checked' ? (c.className === 'fashionCompareCheck' && c.checked) : String(c.className || '').split(/\s+/).includes(sel.replace(/^\./, '')));
      const walk = (e) => { for (const c of e.children) { if (match(c)) out.push(c); walk(c); } };
      walk(el);
      return out;
    },
    closest() { return null; }, scrollIntoView() {}, focus() { el.focused = true; }, setPointerCapture() {},
    getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0 }; },
    click() { if (typeof el.onclick === 'function') return el.onclick({ preventDefault() {}, stopPropagation() {} }); },
  };
  Object.defineProperty(el, 'innerHTML', { get() { return html; }, set(v) { html = String(v); el.children = []; Object.keys(q).forEach((k) => delete q[k]); } });
  return el;
}

function fxEnv(lang, replies) {
  const els = {};
  const byId = (id) => els[id] || (els[id] = mkEl('div', id));
  const created = [];
  const fetched = [];
  const style = byId('fashionAiStyle');
  style.options = WOMEN.map((v) => ({ value: v, textContent: v, hasAttribute: () => false, getAttribute: () => null }));
  style.value = 'evening';
  byId('fashionAiTabImage').classList.add('primary');
  const store = { aiapp_lang: lang };
  const ctx = {
    console, Promise, JSON, Math, Array, Object, String, Number, Error, Date, RegExp, setTimeout, clearTimeout, Response,
    $: (s) => byId(String(s).replace(/^#/, '')),
    document: { getElementById: (id) => byId(id), createElement: (t) => { const e = mkEl(t); created.push(e); return e; }, documentElement: mkEl('html') },
    window: { addEventListener() {}, innerHeight: 900 },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    ResizeObserver: class { observe() {} disconnect() {} },
    Event: class { constructor(type, o) { this.type = type; this.bubbles = !!(o && o.bubbles); } },
    __swallow() {}, authGet: () => 'tok', closeHeaderMenu() {},
    fetch: async (u, o) => {
      const body = o && o.body ? JSON.parse(o.body) : null;
      fetched.push({ u: String(u), body });
      const r = replies && replies(String(u), body);
      return r || new Response(JSON.stringify({ error: 'x' }), { status: 500 });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(HELPERS + '\n' + FX, ctx);
  ctx.__compressImg = (file, cb) => cb('data:image/jpeg;base64,UEhPVE8=');
  const upload = () => { const fi = byId('fashionAiFileInput'); fi.files = [{ name: 'me.jpg', type: 'image/jpeg' }]; fi.onchange(); };
  const byNewId = (id) => created.find((e) => e.id === id);
  return { ctx, els, byId, created, fetched, upload, byNewId };
}
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200 });
const SUGG = { suggestions: [
  { title: 'سهرة', clothing: 'فستان سهرة طويل من الساتان.', colors: 'كحلي وذهبي', accessories: 'حقيبة صغيرة وأقراط', matchPercent: 92 },
  { title: 'نهاري', clothing: 'بلوزة وتنورة', colors: 'بيج', accessories: 'ساعة', matchPercent: 85 },
] };
const LOOK = 'فستان سهرة طويل من الساتان. كحلي وذهبي. حقيبة صغيرة وأقراط';

/* ١ (لبس الإطلالة على الصورة المرفوعة) مع طلب الأزياء المنفصل #1200 — يحتاج أمر الخادم */

test('٢ «استخدم هذه الإطلالة» في الوضع النصّيّ: الوصف بلا تسميات إنجليزيّة ولا نقطتين', async () => {
  const E = fxEnv('ar', (u) => (u === '/api/fashion-suggest' ? json(SUGG) : null));
  E.byId('fashionAiTabText').onclick();
  E.byId('fashionAiDescription').value = 'فستان';
  await E.byId('fashionAiSuggestBtn').onclick();
  E.byId('fashionAiSuggestions').children[0].querySelector('.useLookBtn').onclick();
  const d = E.byId('fashionAiDescription').value;
  assert.equal(d, LOOK);
  assert.doesNotMatch(d, /Colors:|Accessories:|\.\./);
  // بلا صورة في وضع الصورة: ينتقل إلى الوصف كما كان
  const E2 = fxEnv('ar', (u) => (u === '/api/fashion-suggest' ? json(SUGG) : null));
  E2.byId('fashionAiDescription').value = 'فستان';
  await E2.byId('fashionAiSuggestBtn').onclick();
  E2.byId('fashionAiSuggestions').children[1].querySelector('.useLookBtn').onclick();
  assert.equal(E2.byId('fashionAiTabText').classList.contains('primary'), true);
  assert.equal(E2.byId('fashionAiDescription').value, 'بلوزة وتنورة. بيج. ساعة');
});

test('٣ صفّ التعديل يلتفّ، ورسالتا التحقّق تحته لا عند «صمم»، والكتابة تمسحها', async () => {
  const E = fxEnv('en', (u) => (u === '/api/fashion-create' ? json({ imageBase64: 'UkVT', mimeType: 'image/png' }) : null));
  E.upload();
  await E.byId('fashionAiGenerateBtn').onclick();
  const row = E.byNewId('fashionRefineRow');
  const input = E.byNewId('fashionRefineInput');
  assert.ok(row && input, 'الصفّ مبنيّ بعد النتيجة');
  assert.match(row.style.cssText, /flex-wrap:\s*wrap/);
  assert.match(input.style.cssText, /flex:\s*1 1 280px/);
  const status = E.byId('fashionAiStatus');
  const before = status.textContent;
  await E.byNewId('fashionRefineBtn').onclick();
  const rs = E.byNewId('fashionRefineStatus');
  assert.ok(rs, '#fashionRefineStatus موجود');
  assert.equal(rs.attrs.role, 'status');
  assert.ok(row.children.includes(rs) || (rs.parentElement && rs.parentElement === row.parentElement), 'ملاصق للصفّ');
  assert.equal(rs.textContent, 'Type the change you want first');
  assert.equal(rs.style.display, 'block');
  assert.equal(status.textContent, before, '#fashionAiStatus البعيد لم يُلمس');
  assert.equal(input.focused, true);
  input.dispatchEvent({ type: 'input' });
  assert.equal(rs.style.display, 'none', 'الكتابة تمسح الرسالة');
});

test('٤ المقارنة: الرابعة تقول «الحد ٣ أنماط»، والاختيار يمسح «اختر إطلالتين»، والنتائج بتسميات اللغة', async () => {
  let n = 0;
  const E = fxEnv('en', (u) => (u === '/api/fashion-create' ? (++n === 3 ? json({ error: 'tmp_unavailable' }, 502) : json({ imageBase64: 'UkVT', mimeType: 'image/png' })) : null));
  E.upload();
  const cs = E.byId('fashionAiCompareStatus');
  await E.byId('fashionAiCompareBtn').onclick();
  assert.equal(cs.textContent, 'fashionCompareNeedTwo');
  assert.equal(cs.style.display, 'block');
  const wraps = E.byId('fashionAiCompareChecks').children;
  wraps[0].onclick(); wraps[1].onclick(); wraps[2].onclick();
  assert.equal(cs.style.display, 'none', '«اختر إطلالتين» لا تبقى وأنت مختار ٣');
  wraps[3].onclick();
  assert.equal(wraps[3].children.find((c) => c.className === 'fashionCompareCheck').checked, false);
  assert.equal(cs.style.display, 'block');
  assert.equal(cs.textContent, 'Max 3 styles', 'الحدّ يُقال لا يُسكت عنه');
  wraps[2].onclick(); wraps[2].onclick(); // إلغاء ثمّ اختيار: تبديل ناجح يمسح رسالة الحدّ
  assert.equal(cs.style.display, 'none');
  await E.byId('fashionAiCompareBtn').onclick();
  const cells = E.byId('fashionAiCompareResults').children;
  assert.equal(cells.length, 3);
  assert.match(cells[0].innerHTML, />A<\/span>/);
  assert.match(cells[1].innerHTML, />B<\/span>/);
  for (const c of cells) assert.doesNotMatch(c.innerHTML, /[؀-ۿ]/, 'لا عربيّة في الواجهة الإنجليزيّة: ' + c.innerHTML);
  assert.equal(cells[0].querySelector('.fashionPickHint').textContent, '👍 Pick this');
  assert.doesNotMatch(cells[2].innerHTML, /tmp_unavailable/, 'لا رمز خادم خام');
  assert.match(cells[2].innerHTML, /designAiSuggestError/);
  cells[1].onclick();
  assert.equal(cells[1].querySelector('.fashionPickHint').textContent, '✓');
  assert.equal(cells[0].querySelector('.fashionPickHint').textContent, '👍 Pick this');
});

test('٥ المقارنة بالعربيّة كما كانت: أ/ب و«اضغطي للاختيار ✓»', async () => {
  const E = fxEnv('ar', (u) => (u === '/api/fashion-create' ? json({ imageBase64: 'UkVT', mimeType: 'image/png' }) : null));
  E.upload();
  const wraps = E.byId('fashionAiCompareChecks').children;
  wraps[0].onclick(); wraps[1].onclick();
  await E.byId('fashionAiCompareBtn').onclick();
  const cells = E.byId('fashionAiCompareResults').children;
  assert.match(cells[0].innerHTML, />أ<\/span>/);
  assert.match(cells[1].innerHTML, />ب<\/span>/);
  assert.equal(cells[0].querySelector('.fashionPickHint').textContent, 'اضغطي للاختيار ✓');
});
