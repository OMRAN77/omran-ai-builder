'use strict';
// اختبارات شريط الردّ الحقيقيّ وقائمة المزيد بعزل DOM صغير، دون تشغيل التطبيق كاملًا.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const between = (source, first, last) => {
  const a = source.indexOf(first);
  assert.ok(a !== -1, 'بداية المقطع: ' + first);
  const b = source.indexOf(last, a + first.length);
  assert.ok(b !== -1, 'نهاية المقطع: ' + last);
  return source.slice(a, b);
};

// يُنفّذ مقطع إنشاء الأزرار نفسه، وليس نسخة مخفّفة من منطقه.
const renderer = between(read('js/app-04-i18n-state.js'),
  "    if((m.content && m.content.trim()) || (m.role !== 'user' && m.attachments",
  '    if(m.code && m.providerLabel){');
const ui = read('js/app-05-ui.js');
const menuState = between(ui, 'let __msgMoreMenuOpen = null;', '// ✨ v363:');
const openMenu = between(ui, 'function openMsgMoreMenu(', '/* v-code-viewer:');

class Node {
  constructor(tag, doc) {
    this.tagName = tag;
    this.doc = doc;
    this.children = [];
    this.attrs = {};
    this.style = {};
    this.classes = new Set();
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name),
      toggle: (name, force) => {
        if (force === undefined ? !this.classes.has(name) : force) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
  }
  set className(value) { this._className = value; this.classes = new Set(value.split(/\s+/)); }
  get className() { return this._className || ''; }
  set innerHTML(value) { this._html = value; this.children = []; }
  get innerHTML() { return this._html || ''; }
  get firstChild() { return this.children[0] || null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(el) { this.children.push(el); el.parentNode = this; return el; }
  insertBefore(el, other) {
    const i = this.children.indexOf(other);
    this.children.splice(i < 0 ? this.children.length : i, 0, el);
    el.parentNode = this;
    return el;
  }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  click() { if (!this.disabled && this.onclick) return this.onclick({ stopPropagation() {} }); }
  focus() { this.doc.activeElement = this; }
  select() {}
  getBoundingClientRect() { return { left: 20, top: 300, bottom: 330 }; }
  querySelectorAll(selector) {
    return this.children.filter((n) => n.tagName === 'button' && (selector === 'button:not(:disabled)' ? !n.disabled : true));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function setup({ mobile = false, clipboard = async () => {}, fallback = true, confirmReport = true, fetchReport = async () => ({ ok: true, json: async () => ({ ok: true }) }) } = {}) {
  const events = new Map();
  const timers = [];
  const calls = { toast: [], share: [], regen: [], exports: [], speech: [], stopped: 0, fetch: [], confirm: 0 };
  const document = {
    activeElement: null,
    createElement(tag) { return new Node(tag, document); },
    addEventListener(name, fn) { events.set(name, fn); },
    removeEventListener(name, fn) { if (events.get(name) === fn) events.delete(name); },
    execCommand: () => fallback,
    documentElement: { classList: { contains: (c) => c === 'mobile-ui' && mobile } },
  };
  document.body = document.createElement('body');
  const window = {
    innerWidth: 1100, innerHeight: 800, scrollX: 0, scrollY: 0,
    addEventListener(name, fn) { events.set('window:' + name, fn); },
    removeEventListener(name, fn) { if (events.get('window:' + name) === fn) events.delete('window:' + name); },
    chatRegenerateMessage: (i) => calls.regen.push(i),
    omranShareText: (...args) => calls.share.push(args),
  };
  const ctx = {
    document, window, navigator: { clipboard: { writeText: clipboard } },
    t: (key) => key, lang: 'ar',
    confirm: () => { calls.confirm++; return confirmReport; },
    fetch: async (...args) => { calls.fetch.push(args); return fetchReport(...args); },
    settingsToast: (s) => calls.toast.push(s),
    authGet: () => 'tester',
    __swallow() {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: (id) => { timers[id - 1] = null; },
    speakSmart: (...args) => calls.speech.push(args),
    stopAllSpeaking: () => { calls.stopped++; },
  };
  for (const name of ['Pdf', 'Word', 'Image', 'Txt']) {
    ctx['exportReplyAs' + name] = (text) => calls.exports.push([name, text]);
  }
  vm.createContext(ctx);
  vm.runInContext(menuState + '\n' + openMenu +
    '\nthis.renderToolbar = function(m, mIdx, textDiv, msgWordEls){ let copyMsgBtn = null;\n' +
    renderer + '\nreturn copyMsgBtn; };', ctx);
  const message = (extra = {}) => Object.assign({ role: 'assistant', content: 'رد تجريبي', attachments: [], provider: 'test' }, extra);
  const render = (m = message()) => ctx.renderToolbar(m, 7, { innerText: 'ردّ ظاهر' }, []);
  const menu = () => document.body.children.find((n) => n.classList.contains('msgMoreMenu'));
  const items = () => menu().children.filter((n) => n.tagName === 'button');
  return { ctx, document, events, calls, timers, message, render, menu, items };
}
const titles = (bar) => bar.children.map((el) => el.title);
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('المفاتيح الخمسة الجديدة مترجمة في القواميس الأربعة عشر', () => {
  const keys = ['msgRegenerate', 'msgStopListening', 'msgCopyFailed', 'msgReportFailed', 'msgToolbarLabel'];
  const base = between(read('js/app-03-i18n-data.js'), 'const I18N = {', '};window.I18N = I18N;');
  const context = {};
  vm.createContext(context);
  vm.runInContext('const I18N = {' + base.slice('const I18N = {'.length) + '}; this.dictionaries = I18N;', context);
  const languages = ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ne', 'ml', 'fil', 'id', 'zh', 'ru', 'tr', 'es'];
  for (const language of languages.filter((l) => l !== 'ar' && l !== 'en')) {
    // نقرأ تعريف القاموس نفسه، قبل تهيئة الواجهة والإضافات غير المتعلقة بالشريط.
    const source = read('i18n/' + language + '.js');
    const end = source.indexOf('\n};');
    assert.ok(end !== -1, language + ': نهاية القاموس');
    vm.runInContext(source.slice(0, end + 3), context, { filename: language + '.js' });
  }
  assert.equal(Object.keys(context.dictionaries).length, 14);
  for (const language of languages) {
    for (const key of keys) {
      assert.ok(typeof context.dictionaries[language][key] === 'string' && context.dictionaries[language][key].trim(),
        language + ': ' + key);
    }
  }
});

test('ترتيب الكمبيوتر نسخ/استماع/إعادة/المزيد؛ الجوال لا إعادة؛ المستخدم نسخ فقط', () => {
  const e = setup();
  const bar = e.render();
  assert.deepEqual(titles(bar), ['copyMsgTitle', 'speakBtn', 'msgRegenerate', 'moreOptionsTitle']);
  bar.children[2].click();
  assert.deepEqual(e.calls.regen, [7]);
  assert.deepEqual(titles(setup({ mobile: true }).render()), ['copyMsgTitle', 'speakBtn', 'moreOptionsTitle']);
  assert.deepEqual(titles(setup({ mobile: true }).render(e.message({ role: 'user' }))), ['copyMsgTitle']);
});

test('المزيد يعرض المشاركة/التقييم/البلاغ وأربع صيغ التصدير بالترتيب ويُرسل الأفعال', () => {
  const e = setup();
  const bar = e.render();
  bar.children[3].click();
  assert.deepEqual(e.items().map((n) => n.title), [
    'msgShareReply', 'thumbUpTitle', 'thumbDownTitle', 'reportMsgTitle',
    'convertToPdf', 'convertToWord', 'convertToImage', 'downloadTxt',
  ]);
  assert.equal(e.menu().getAttribute('role'), 'menu');
  assert.equal(bar.children[3].getAttribute('aria-expanded'), 'true');
  assert.equal(e.document.activeElement, e.items()[0]);
  e.items()[0].click();
  assert.equal(e.calls.share[0][0], 'ردّ ظاهر');
  assert.equal(e.menu(), undefined);
  for (const [i, name] of [[4, 'Pdf'], [5, 'Word'], [6, 'Image'], [7, 'Txt']]) {
    bar.children[3].click();
    e.items()[i].click();
    assert.deepEqual(e.calls.exports.at(-1), [name, 'رد تجريبي']);
  }
});

test('التقييم متبادل الحصر ويعود عند إعادة فتح القائمة وإعادة الرسم', () => {
  const e = setup();
  const m = e.message();
  const bar = e.render(m);
  const more = bar.children.at(-1);
  more.click(); e.items()[1].click();
  assert.equal(m._feedback, 'up');
  more.click();
  assert.equal(e.items()[1].classList.contains('msgMoreActive'), true);
  e.items()[2].click();
  assert.equal(m._feedback, 'down');
  more.click();
  assert.equal(e.items()[1].classList.contains('msgMoreActive'), false);
  assert.equal(e.items()[2].classList.contains('msgMoreActive'), true);
  e.items()[2].click();
  assert.equal(m._feedback, null);
  e.render(m).children.at(-1).click();
  assert.equal(e.items()[2].classList.contains('msgMoreActive'), false);
});

test('النسخ يبدّل زرّه فقط ويعيد العنوان؛ فشل الحافظة والاحتياط لا يمسّ الإخوة', async () => {
  for (const options of [{}, { clipboard: async () => { throw Error('denied'); } },
    { clipboard: async () => { throw Error('denied'); }, fallback: false }]) {
    const e = setup(options);
    const bar = e.render();
    const siblings = bar.children.slice(1);
    const before = siblings.map((n) => n.innerHTML);
    await bar.children[0].click();
    assert.deepEqual(bar.children.slice(1), siblings);
    assert.deepEqual(siblings.map((n) => n.innerHTML), before);
    if (options.fallback === false) {
      assert.deepEqual(e.calls.toast, ['msgCopyFailed']);
      assert.equal(bar.children[0].title, 'copyMsgTitle');
    } else {
      assert.equal(bar.children[0].title, 'copiedToast');
      assert.deepEqual(e.calls.toast, ['copiedToast']);
      e.timers.filter(Boolean).forEach((fn) => fn());
      assert.equal(bar.children[0].title, 'copyMsgTitle');
    }
  }
});

test('الاستماع يتحول إلى إيقاف ويعيد عنوانه عند الإيقاف أو انتهاء القراءة', () => {
  const e = setup();
  const btn = e.render().children[1];
  btn.click();
  assert.equal(btn.title, 'msgStopListening');
  assert.equal(btn.getAttribute('aria-label'), 'msgStopListening');
  btn.click();
  assert.equal(e.calls.stopped, 1);
  assert.equal(btn.title, 'speakBtn');
  btn.click();
  e.calls.speech.at(-1)[2]();
  assert.equal(btn.title, 'speakBtn');
  assert.equal(btn.getAttribute('aria-label'), 'speakBtn');
});

test('البلاغ الملغى لا يرسل؛ الخطأ يتيح المحاولة ثانية؛ النقر المزدوج لا يكرّر الطلب', async () => {
  let resolve;
  const e = setup({ confirmReport: false, fetchReport: () => new Promise((r) => { resolve = r; }) });
  const m = e.message();
  const more = e.render(m).children.at(-1);
  more.click(); await e.items()[3].click();
  assert.equal(e.calls.fetch.length, 0);
  e.ctx.confirm = () => true;
  more.click();
  e.items()[3].click();
  assert.equal(e.calls.fetch.length, 1);
  more.click();
  assert.equal(e.items()[3].disabled, true);
  e.items()[3].click();
  assert.equal(e.calls.fetch.length, 1);
  resolve({ ok: false, status: 503 });
  await flush();
  assert.equal(m._reported, undefined);
  assert.equal(m._reportPending, false);
  assert.ok(e.calls.toast.includes('msgReportFailed'));
  more.click(); // أغلِق القائمة المفتوحة أثناء انتظار الشبكة قبل محاولة فتح جديدة.
  more.click();
  assert.ok(!e.items()[3].disabled);
  e.items()[3].click();
  assert.equal(e.calls.fetch.length, 2);
  resolve({ ok: true, json: async () => ({ ok: true }) });
  await flush();
  assert.equal(m._reported, true);
  more.click();
  assert.equal(e.items()[3].disabled, true);
});

test('القائمة تُغلق بالتبديل والخارج وEscape يعيد التركيز ويزيل حالة الوصول', () => {
  const e = setup();
  const more = e.render().children.at(-1);
  more.click();
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  more.click();
  assert.equal(e.menu(), undefined);
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  more.click();
  e.events.get('click')();
  assert.equal(e.menu(), undefined);
  more.click();
  let prevented = false;
  e.events.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(e.document.activeElement, more);
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.equal(more.getAttribute('aria-controls'), null);
});