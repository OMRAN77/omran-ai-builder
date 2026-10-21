'use strict';
/* v-nav-truth (تدقيق ١٨–١٩ أكتوبر، g02): التبويب المضيء في الشريط السفليّ يتبع الشاشة الظاهرة فعلًا لا آخر نقرة.
   العرض: «الأدوات» مضيء من أوّل التطبيق والمحادثة هي الظاهرة (active ثابت في index.html منذ استبدل «الأدوات» «الرئيسيّة»)،
   و«المحادثات» يبقى مضيئًا بعد إغلاق الدرج بالخلفيّة أو السهم أو السحب أو اختيار محادثة.
   الاختبار يشغّل js/ui-wiring.js الحقيقيّ كاملًا في vm على شجرة وهميّة: الأزرار من index.html نفسه بأصنافها،
   والمراقب يُستدعى عند كلّ تغيير صنف أو سمة كما يفعل المتصفّح. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HTML = read('index.html');

function env() {
  const observers = [];
  function fire(el, attr) { observers.forEach((o) => { if (o.el === el && (!o.filter || o.filter.indexOf(attr) >= 0)) o.cb([{ type: 'attributes', attributeName: attr, target: el }]); }); }
  function mk(id, classes, attrs) {
    const set = new Set(classes || []);
    const el = {
      id, attrs: Object.assign({}, attrs || {}), listeners: {}, style: { setProperty() {}, removeProperty() {} }, children: [],
      classList: {
        add(c) { if (!set.has(c)) { set.add(c); fire(el, 'class'); } },
        remove(c) { if (set.has(c)) { set.delete(c); fire(el, 'class'); } },
        toggle(c, on) { const want = on === undefined ? !set.has(c) : !!on; if (want) el.classList.add(c); else el.classList.remove(c); return want; },
        contains(c) { return set.has(c); },
      },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null; },
      setAttribute(k, v) { el.attrs[k] = String(v); fire(el, k); },
      removeAttribute(k) { if (Object.prototype.hasOwnProperty.call(el.attrs, k)) { delete el.attrs[k]; fire(el, k); } },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(el.attrs, k); },
      addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
      click() { (el.listeners.click || []).forEach((fn) => fn({ type: 'click', target: el, stopPropagation() {} })); },
      appendChild(c) { el.children.push(c); return c; },
      getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }; },
    };
    return el;
  }
  const sidebar = mk('sidebar'), workarea = mk('workarea'), overlay = mk('sectionsToolsOverlay'), settings = mk('settingsDialog');
  const backdrop = mk('drawerBackdrop');
  const byId = { sidebar, workarea, sectionsToolsOverlay: overlay, settingsDialog: settings, drawerBackdrop: backdrop, omranDeleteConfirmLoader: {} };
  function closeDrawers() { sidebar.classList.remove('open'); workarea.classList.remove('open'); backdrop.classList.remove('show'); }
  function openDrawer(el) { const was = el.classList.contains('open'); closeDrawers(); if (!was) { el.classList.add('open'); backdrop.classList.add('show'); } }
  /* الأزرار الحقيقيّة التي ينقرها السلك (app-10: openDrawer؛ الإعدادات: <dialog> بسمة open) */
  const btnToggleProjects = mk('btnToggleProjects'); btnToggleProjects.addEventListener('click', () => openDrawer(sidebar));
  const btnToggleHistory = mk('btnToggleHistory'); btnToggleHistory.addEventListener('click', () => openDrawer(workarea));
  const btnSettings = mk('btnSettings'); btnSettings.addEventListener('click', () => settings.setAttribute('open', ''));
  const sel = { '#btnToggleProjects': btnToggleProjects, '#btnToggleHistory': btnToggleHistory, '#btnSettings': btnSettings, 'link[data-omran-tool-photos]': {}, 'script[data-omran-tool-photos]': {} };
  /* أزرار التبويبات كما في index.html (الشريط السفليّ + أزرار القائمة على الحاسوب) */
  const navs = [];
  const re = /<button type="button" class="([^"]*\bomNavBtn\b[^"]*)" data-omnav="(\w+)"/g; let m;
  while ((m = re.exec(HTML))) navs.push(mk('', m[1].split(/\s+/), { 'data-omnav': m[2] }));
  assert.ok(navs.length >= 4, 'أزرار التبويبات مقروءة من index.html');
  const body = mk('body');
  const document = {
    body, head: mk('head'), documentElement: mk('html'), activeElement: null,
    getElementById: (id) => byId[id] || null,
    querySelector: (s) => sel[s] || null,
    querySelectorAll: (s) => (s === '.omNavBtn' ? navs.slice() : []),
    createElement: () => mk(''),
  };
  class MutationObserver { constructor(cb) { this.cb = cb; } observe(el, opts) { observers.push({ el, cb: this.cb, filter: opts && opts.attributeFilter }); } disconnect() {} }
  const ctx = {
    document, MutationObserver, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile' },
    localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { removeItem() {} },
    setTimeout: () => 0, Date, Math, Event: function () {}, __swallow: () => {}, closeDrawers,
    innerWidth: 400,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/ui-wiring.js'), ctx);
  const lit = () => navs.filter((b) => b.classList.contains('active')).map((b) => b.getAttribute('data-omnav') + (b.classList.contains('omDeskNav') ? '@desk' : ''));
  const tab = (k) => navs.find((b) => b.getAttribute('data-omnav') === k && !b.classList.contains('omDeskNav'));
  return { sidebar, workarea, overlay, settings, closeDrawers, navs, lit, tab };
}

test('١. index.html: لا تبويب مضيء ثابت في الشيفرة', () => {
  assert.doesNotMatch(HTML, /class="omNavBtn[^"]*\bactive\b[^"]*" data-omnav=/, 'active ثابت على تبويب في index.html');
});

test('٢. الإقلاع: المحادثة ظاهرة فلا تبويب مضيء', () => {
  const e = env();
  assert.deepEqual(e.lit(), []);
});

test('٣. «الأدوات»: يضيء ما دامت شاشة الأدوات ظاهرة، ويطفأ حين تُغلق بأيّ طريق', () => {
  const e = env();
  e.tab('tools').click();
  assert.ok(e.overlay.classList.contains('show'), 'النقرة فتحت شاشة الأدوات');
  assert.deepEqual(e.lit().filter((x) => !/@desk/.test(x)), ['tools']);
  assert.ok(e.lit().indexOf('tools@desk') >= 0, 'زرّ الحاسوب للأداة نفسها يتبع');
  e.overlay.classList.remove('show'); // ✕ أو النقر خارجها أو الرجوع
  assert.deepEqual(e.lit(), []);
});

test('٤. «المحادثات» و«الملفات»: يضيئان مع الدرج ويطفآن عند إغلاقه بالخلفيّة أو السهم أو السحب', () => {
  const e = env();
  e.tab('chats').click();
  assert.ok(e.sidebar.classList.contains('open'));
  assert.deepEqual(e.lit().filter((x) => !/@desk/.test(x)), ['chats']);
  e.closeDrawers(); // backdropEl.onclick = closeDrawers وسهم الدرج والسحب
  assert.deepEqual(e.lit(), []);
  e.tab('files').click();
  assert.deepEqual(e.lit().filter((x) => !/@desk/.test(x)), ['files']);
  e.tab('chats').click(); // تبديل درج بدرج
  assert.deepEqual(e.lit().filter((x) => !/@desk/.test(x)), ['chats']);
  e.sidebar.classList.remove('open'); // اختيار محادثة من القائمة
  assert.deepEqual(e.lit(), []);
});

test('٥. «الإعدادات»: يتبع سمة open على النافذة', () => {
  const e = env();
  e.tab('settings').click();
  assert.deepEqual(e.lit().filter((x) => !/@desk/.test(x)), ['settings']);
  e.settings.removeAttribute('open');
  assert.deepEqual(e.lit(), []);
});
