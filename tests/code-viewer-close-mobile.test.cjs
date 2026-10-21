'use strict';
/* v-code-x-mobile + v-code-crlf + v-code-save (تدقيق ١٨ أكتوبر، g04/attach-text-file وg06/work-tabs-menu):
   ١) في الجوّال ✕ لوحة الكود لا يغلقها: النقرة الأولى تزيل العارض وحده ويبقى الدرج مفتوحًا، والتالية تنقر زرّ الطيّ
      #waCollapseBtn المخفيّ (لا عمل له تحت mobile-ui). القرار: في تخطيط الدرج (mobile-ui أو ≤860) يغلق العارض ثمّ الدرج.
      الحاسوب كما هو (v-panel-x: الإكس يقفل المعروض ولا يطوي اللوحة).
   ٢) ملفّ CRLF: محدّد التعليق //[^\n]* يبتلع \r فيحوّله محلّل HTML سطرًا زائدًا، والهامش يعدّ بـ\n — الأرقام لا تطابق.
      القرار: نهايات الأسطر توحَّد قبل العدّ والتلوين.
   ٣) «حفظ» كان ينادي save() غير موجودة فلا يُحفظ شيء ولا تأكيد، و«تعديل» بلا علامة (التمييز على زرّ داخل قائمة مغلقة).
      القرار: saveState() ثمّ توست acctSaved، وإطار تمييز مضمّن على خانة الكود وقت التحرير يزول بالحفظ أو الإغلاق.
   الكتلة الحقيقيّة من app-05-ui (عارض الكود وشريطه) تُنفَّذ هنا في vm بـDOM مزيّف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const A5 = fs.readFileSync(path.join(ROOT, 'js/app-05-ui.js'), 'utf8');
const START = A5.indexOf('/* v-code-viewer: عارض قراءة داخل تبويب «الكود»');
const END = A5.indexOf('/* v-panel-x: معاينة تطبيق محادثةٍ أقفلها الإكس');
assert.ok(START > 0 && END > START, 'كتلة عارض الكود');
const BLOCK = A5.slice(START, END);

function cls() {
  const s = new Set();
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, on) => { if (on === undefined ? !s.has(c) : on) s.add(c); else s.delete(c); } };
}
function harness({ mobile, width }) {
  const all = [];
  const mk = (tag) => {
    const e = {
      tagName: String(tag).toUpperCase(), id: '', style: {}, dataset: {}, children: [], parentNode: null,
      classList: cls(), attrs: {}, textContent: '', innerHTML: '', title: '', value: '', readOnly: false,
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      appendChild(c) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); return c; },
      remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } },
      querySelector(sel) { const id = sel.replace(/^#/, ''); const walk = (n) => { for (const c of n.children) { if (c.id === id) return c; const r = walk(c); if (r) return r; } return null; }; return walk(this); },
      querySelectorAll() { return []; }, focus() { this.focused = true; }, click() { if (this.onclick) this.onclick({ stopPropagation() {} }); },
      get lastElementChild() { return this.children[this.children.length - 1] || null; },
      get innerText() { return this.textContent || this.innerHTML.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); },
    };
    all.push(e);
    return e;
  };
  const body = mk('body');
  const tabs = mk('div'); tabs.id = 'tabs'; body.appendChild(tabs);
  const host = mk('div'); body.appendChild(host);
  const codeEl = mk('textarea'); codeEl.id = 'code'; host.appendChild(codeEl);
  const collapse = mk('button'); collapse.id = 'waCollapseBtn'; tabs.appendChild(collapse);
  let collapseClicks = 0; collapse.onclick = () => { collapseClicks++; };
  const attached = (n) => { while (n) { if (n === body) return true; n = n.parentNode; } return false; };
  const counts = { closeDrawers: 0, panelCloseShown: 0, saveState: 0, toasts: [], render: 0, get collapseClicks() { return collapseClicks; } };
  const workareaEl = { classList: cls() }, backdropEl = { classList: cls() };
  const docEl = { classList: cls() };
  if (mobile) docEl.classList.add('mobile-ui');
  const ctx = {
    window: { innerWidth: width }, console,
    document: {
      documentElement: docEl, body,
      getElementById: (id) => all.find((e) => e.id === id && attached(e)) || null,
      createElement: mk, addEventListener() {}, removeEventListener() {},
    },
    getComputedStyle: () => ({ position: 'relative' }),
    localStorage: { getItem: () => null, setItem() {} },
    state: { currentId: 'p_1', projects: [{ id: 'p_1', code: '<h1>x</h1>', codeType: 'html' }] },
    lang: 'ar', t: (k) => ({ acctSaved: 'SAVED' }[k] || k),
    codeEl, workareaEl, backdropEl,
    switchWorkTab() {}, setTimeout: (f) => { f(); return 0; }, clearTimeout() {},
    closeDrawers() { counts.closeDrawers++; workareaEl.classList.remove('open'); backdropEl.classList.remove('show'); },
    omranPanelCloseShown() { counts.panelCloseShown++; },
    saveState() { counts.saveState++; },
    settingsToast(m) { counts.toasts.push(m); },
    renderCodeAndPreview() { counts.render++; },
    __swallow(e) { throw e; },
  };
  ctx.getCurrent = () => ctx.state.projects[0];
  vm.createContext(ctx);
  vm.runInContext(BLOCK, ctx);
  const bar = () => ctx.document.getElementById('omranCodeViewerBar');
  const btn = (i) => bar().children[i];
  return { ctx, counts, codeEl, workareaEl, backdropEl, bar, btn, open: (txt) => ctx.window.omranOpenTextInCodePanel(txt, 't') };
}

test('١. الجوّال: ✕ يغلق العارض والدرج معًا، وبلا عارض يغلق الدرج — لا نقر لزرّ الطيّ المخفيّ', () => {
  const h = harness({ mobile: true, width: 400 });
  h.open('a\nb');
  assert.ok(h.ctx.document.getElementById('omranCodeViewer'), 'العارض مفتوح');
  assert.ok(h.workareaEl.classList.contains('open') && h.backdropEl.classList.contains('show'), 'الفتح يفتح الدرج (كما كان)');
  h.btn(2).click();
  assert.equal(h.ctx.document.getElementById('omranCodeViewer'), null, 'العارض أُزيل');
  assert.equal(h.workareaEl.classList.contains('open'), false, 'الدرج أُغلق بالنقرة الأولى');
  assert.equal(h.backdropEl.classList.contains('show'), false);
  // درج مفتوح بلا عارض (المعاينة) ← ✕ يغلقه
  h.workareaEl.classList.add('open'); h.backdropEl.classList.add('show');
  h.btn(2).click();
  assert.equal(h.workareaEl.classList.contains('open'), false, 'بلا عارض: الدرج يُغلق');
  assert.equal(h.counts.collapseClicks, 0, 'لا نقر لـ#waCollapseBtn');
  assert.equal(h.counts.panelCloseShown, 0, 'لا قفل للمعروض في الجوّال');
});

test('١ب. شاشة ضيّقة ≤860 بلا mobile-ui (نافذة حاسوب مصغّرة) تعامل كالدرج', () => {
  const h = harness({ mobile: false, width: 800 });
  h.open('a');
  h.btn(2).click();
  assert.equal(h.workareaEl.classList.contains('open'), false);
  assert.equal(h.counts.panelCloseShown, 0);
});

test('٢. الحاسوب كما هو: ✕ يغلق العارض وحده ثمّ يقفل المعروض، ولا يمسّ الدرج', () => {
  const h = harness({ mobile: false, width: 1280 });
  h.open('a');
  h.btn(2).click();
  assert.equal(h.ctx.document.getElementById('omranCodeViewer'), null);
  assert.equal(h.counts.closeDrawers, 0);
  assert.equal(h.counts.panelCloseShown, 0, 'النقرة الأولى للعارض وحده');
  h.btn(2).click();
  assert.equal(h.counts.panelCloseShown, 1, 'الثانية تقفل المعروض (v-panel-x)');
  assert.equal(h.counts.closeDrawers, 0);
});

test('٣. CRLF: أرقام الهامش تطابق الأسطر ولا \\r في العرض', () => {
  const h = harness({ mobile: false, width: 1280 });
  h.open('a\r\n// c\r\nb\r\n');
  const g = h.ctx.document.getElementById('omranCodeGutter').textContent;
  const pre = h.ctx.document.getElementById('omranCodePre').innerHTML;
  assert.equal(g.split('\n').length, 4, 'أربعة أرقام: ' + JSON.stringify(g));
  assert.ok(!pre.includes('\r'), 'لا \\r يحوّله المحلّل سطرًا زائدًا');
  assert.equal(pre.split('\n').length, 4, 'أسطر العرض = أرقام الهامش');
  h.open('x\ry');
  assert.equal(h.ctx.document.getElementById('omranCodeGutter').textContent.split('\n').length, 2, 'CR وحده (ماك قديم) سطر');
});

test('٤. «تعديل» يضع إطار تمييز على خانة الكود، و«حفظ» يحفظ فعلًا (saveState) ويؤكّد ويزيل الإطار', () => {
  const h = harness({ mobile: false, width: 1280 });
  vm.runInContext('omranBuildCodeViewerBar()', h.ctx);
  const edt = h.btn(0), sav = h.btn(1);
  edt.click();
  assert.ok(String(h.codeEl.style.outline || '').includes('solid'), 'إطار التحرير: ' + h.codeEl.style.outline);
  h.codeEl.value = '<h1>edited</h1>';
  sav.click();
  assert.equal(h.ctx.getCurrent().code, '<h1>edited</h1>');
  assert.equal(h.counts.saveState, 1, 'saveState نودي');
  assert.deepEqual(h.counts.toasts, ['SAVED'], 'توست acctSaved');
  assert.equal(h.codeEl.style.outline || '', '', 'الإطار زال بعد الحفظ');
  // الإغلاق يزيل الإطار أيضًا
  edt.click();
  assert.ok(String(h.codeEl.style.outline || '').includes('solid'));
  h.btn(2).click();
  assert.equal(h.codeEl.style.outline || '', '', 'الإطار زال بالإغلاق');
  // حفظ نصّ مفتوح في العارض: يحفظ ويغلق العارض ويؤكّد
  h.open('print(1)');
  sav.click();
  assert.equal(h.ctx.getCurrent().code, 'print(1)');
  assert.equal(h.counts.saveState, 2);
  assert.equal(h.counts.toasts.length, 2);
  assert.equal(h.ctx.document.getElementById('omranCodeViewer'), null);
});

test('٥. لا نداء لـsave() غير الموجودة', () => {
  const i = A5.indexOf('  sav.onclick = function(){');
  const h = A5.slice(i, A5.indexOf('\n  };', i));
  assert.ok(!/\bsave\(\)/.test(h.replace(/saveState\(\)/g, '')), 'save() خرجت');
  assert.match(h, /saveState\(\)/);
  assert.match(h, /settingsToast\(t\('acctSaved'\)\)/);
});
