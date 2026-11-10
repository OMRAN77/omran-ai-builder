// tests/audit-fix-tools.test.cjs — v-audit-tools (فحص التطبيق كاملًا، مجموعة «الأدوات»).
// العرض والجذر لكلّ حالة في اسم الاختبار؛ كلّها تشغّل الملفّ الحقيقيّ في vm بمستند وهميّ:
//   cli-tools-1  عدّاد الصلاة القادمة يترك مؤقّتًا يتيمًا بعد حلول الوقت فيجلب المواقيت كلّ ثانية حتّى بعد الإغلاق.
//   cli-tools-2  تنبيه «صورتك جاهزة» لا يصل على أندرويد: new Notification يرمي «Illegal constructor» هناك.
//   cli-tools-4  «تلقائي حسب موقعك»: قطر تأخذ طريقة دبي، وعُمان رابطة العالم الإسلاميّ بدل أمّ القرى.
//   cli-tools-5  إعادة فتح الاستوديو تكتب النتيجة القديمة المحجوزة فوق نتيجة وصلت والنافذة مغلقة.
//   cli-tools-8  مساعد المستندات يرسل الملفّ بلا سقف فيرى المستخدم «HTTP 413» خامًّا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

/* ───────────── القبلة: مستند وهميّ + ساعة ومؤقّتات وهميّة ───────────── */
const QSRC = read('js/app-26-qibla.js');
const TIMINGS = { Fajr: '05:02', Sunrise: '06:19', Dhuhr: '12:07', Asr: '15:22', Maghrib: '17:51', Isha: '19:05' };
function qibla(start) {
  let now = start.getTime();
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }
  const timers = new Map(); let seq = 0;
  const list = [];
  function fakeEl(tag) {
    const kids = {};
    const el = { tag, attrs: {}, dir: '', id: '', innerHTML: '', textContent: '', parentNode: null, style: { cssText: '' },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : (k === 'style' ? '' : null); },
      querySelector(sel) { if (!kids[sel]) kids[sel] = fakeEl('q'); return kids[sel]; }, querySelectorAll() { return []; },
      appendChild(c) { c.parentNode = this; return c; }, insertBefore(c) { c.parentNode = this; return c; },
      remove() { const i = list.indexOf(this); if (i >= 0) list.splice(i, 1); } };
    return el;
  }
  const countdown = fakeEl('div');
  const shellEl = () => list.find((e) => e.id === 'omranQiblaShell') || null;
  const urls = [];
  const store = { aiapp_lang: 'ar' };
  const ctx = {
    lang: 'ar', window: {}, navigator: {}, Date: FakeDate, Math, JSON, Object, Array, String, Number, Promise, Intl,
    setTimeout: () => 0, clearTimeout() {},
    setInterval: (fn) => { const id = ++seq; timers.set(id, fn); return id; },
    clearInterval: (id) => { timers.delete(id); },
    __swallow() {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); } },
    document: {
      body: { appendChild(c) { list.push(c); c.parentNode = this; return c; } },
      createElement: (t) => fakeEl(t), querySelector: () => null, addEventListener() {},
      getElementById(id) {
        const top = list.find((e) => e.id === id);
        if (top) return top;
        /* العدّاد داخل جسم الغلاف — يبقى في DOM حتّى والغلاف مخفيّ، كما في المتصفّح */
        const sh = shellEl();
        if (id === 'qCountdown' && sh && sh.querySelector('#qBody').innerHTML.indexOf('id="qCountdown"') >= 0) return countdown;
        return null;
      },
    },
    fetch: (u) => {
      urls.push(String(u));
      if (/ip-geo/.test(u)) return Promise.resolve({ json: () => ({ lat: 25.2, lng: 55.27 }) });
      return Promise.resolve({ json: () => ({ data: { timings: TIMINGS, date: { hijri: { day: '8', month: { ar: 'جمادى الأولى', en: 'Jumada al-Ula' }, year: '1448' } } } }) });
    },
  };
  vm.runInNewContext(QSRC, ctx);
  return {
    Q: ctx.window.omranQibla, urls, timers, shellEl,
    aladhan: () => urls.filter((u) => u.includes('aladhan')).length,
    /* ثانية واحدة: تتقدّم الساعة ثمّ يُنادى كلّ مؤقّت قائم */
    async tick(n, noFlush) {
      for (let i = 0; i < n; i++) {
        now += 1000;
        for (const [id, fn] of Array.from(timers.entries())) if (timers.has(id)) fn();
        if (!noFlush) await flush();
      }
    },
  };
}

test('cli-tools-1 عدّاد الصلاة: بعد حلول الوقت مؤقّت واحد وطلب مواقيت واحد، ولا طلب ولا مؤقّت بعد الإغلاق', async () => {
  const q = qibla(new Date(2026, 9, 19, 12, 6, 50)); // ١٠ ثوانٍ قبل الظهر
  q.Q.open(); await flush();
  assert.equal(q.aladhan(), 1, 'طلب الفتح');
  assert.equal(q.timers.size, 1, 'مؤقّت العدّ وحده');
  await q.tick(20);
  assert.equal(q.aladhan(), 2, 'حلّ الظهر ← طلب واحد للمواقيت الجديدة لا طلب كلّ ثانية (كان ١٩ في ٢٠ ثانية)');
  assert.equal(q.timers.size, 1, 'مؤقّت واحد بعد إعادة الرسم (كانت تتراكم)');
  q.Q.close();
  assert.equal(q.timers.size, 0, 'الإغلاق يوقف كلّ مؤقّت');
  await q.tick(20);
  assert.equal(q.aladhan(), 2, 'لا طلب بعد الإغلاق');
});

test('cli-tools-1 عدّاد الصلاة: إغلاق والطلب الجديد في الطريق ← المؤقّت الذي يولد بعده يوقف نفسه', async () => {
  const q = qibla(new Date(2026, 9, 19, 12, 6, 58));
  q.Q.open(); await flush();
  await q.tick(3, true);            // حلّ الوقت والطلب لم يرجع بعد
  q.Q.close();
  await flush();                    // رجع الطلب والشاشة مغلقة
  await q.tick(5);
  assert.equal(q.timers.size, 0, 'لا مؤقّت يعمل والشاشة مغلقة');
  const n = q.aladhan();
  await q.tick(30);
  assert.equal(q.aladhan(), n, 'ولا طلب');
});

test('cli-tools-4 «تلقائي حسب موقعك»: قطر 10 والبحرين 8 وعُمان 4، والإمارات 16 كما كانت', async () => {
  const q = qibla(new Date(2026, 9, 19, 10, 0, 0));
  const cases = [
    ['الدوحة', 25.2854, 51.5310, 10], ['الخور', 25.6839, 51.5058, 10], ['دخان', 25.4296, 50.7856, 10],
    ['المنامة', 26.2285, 50.5860, 8], ['المحرّق', 26.2572, 50.6119, 8],
    ['مسقط', 23.5880, 58.3829, 4], ['صحار', 24.3470, 56.7090, 4], ['صور', 22.5667, 59.5289, 4], ['صلالة', 17.0151, 54.0924, 4],
    ['دبي', 25.2048, 55.2708, 16], ['أبوظبي', 24.4539, 54.3773, 16], ['العين', 24.2075, 55.7447, 16], ['الفجيرة', 25.1288, 56.3265, 16],
    ['الرياض', 24.7136, 46.6753, 4], ['الكويت', 29.3759, 47.9774, 9],
    ['جاسك (إيران — لا يدخل مربّع عُمان)', 25.6400, 57.7700, 3],
  ];
  const got = [];
  for (const [name, lat, lng, want] of cases) {
    q.Q._S.loc = { lat, lng }; q.Q._S.timings = null;
    const before = q.urls.length;
    await q.Q.live();
    const u = q.urls.slice(before).find((x) => x.includes('aladhan')) || '';
    const m = u.match(/method=(\d+)/);
    got.push(name + ':' + (m ? m[1] : '?') + (m && +m[1] === want ? '' : ' (المتوقّع ' + want + ')'));
  }
  assert.ok(got.every((g) => !/المتوقّع/.test(g)), got.join(' | '));
});

/* ───────────── تنبيه اكتمال الصورة: باني Notification كما في أندرويد ───────────── */
function notify(opts) {
  const o = Object.assign({ ctorThrows: true, sw: true }, opts || {});
  const src = read('js/media-notify.js');
  const made = [], shown = [];
  function N(t, op) { if (o.ctorThrows) throw new TypeError("Failed to construct 'Notification': Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead."); this.title = t; this.opts = op; made.push(this); }
  Object.defineProperty(N, 'permission', { get: () => 'granted' });
  N.requestPermission = () => Promise.resolve('granted');
  const reg = { showNotification: (t, op) => { shown.push({ t, op }); return Promise.resolve(); } };
  const nav = o.sw ? { serviceWorker: { ready: Promise.resolve(reg) } } : {};
  const document = { documentElement: { lang: 'ar' }, hidden: true, body: { appendChild() {} }, readyState: 'complete',
    getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {} };
  const ls = { getItem: () => null, setItem() {}, removeItem() {} };
  const swallowed = [];
  const win = { __swallow: (e, tag) => swallowed.push(tag), fetch: () => Promise.resolve({}), focus() {} };
  new Function('window', 'document', 'localStorage', 'sessionStorage', 'Notification', 'MutationObserver', 'navigator', src)
    (win, document, ls, ls, N, function () { this.observe = () => {}; }, nav);
  return { win, made, shown, swallowed };
}

test('cli-tools-2 أندرويد: الباني يرمي «Illegal constructor» ← الإشعار يصل من عامل الخدمة بالنصّ والوسم نفسيهما', async () => {
  const a = notify({ ctorThrows: true, sw: true });
  assert.equal(a.win.mediaReadyNotify('image', true), true, 'كانت false والخطأ يُبتلع بصمت');
  await flush();
  assert.equal(a.shown.length, 1, 'showNotification من تسجيل عامل الخدمة');
  assert.match(a.shown[0].op.body, /صورتك جاهزة/);
  assert.equal(a.shown[0].op.tag, 'maha-media-ready', 'الوسم الثابت نفسه — لا تكديس');
  assert.ok(String(a.shown[0].op.icon).includes('icon-192'));
  const v = notify({ ctorThrows: true, sw: true });
  v.win.mediaReadyNotify('video', false); await flush();
  assert.match(v.shown[0].op.body, /تعذّر إكمال الفيديو/);
  /* الحاسوب كما كان: الباني يعمل ← إشعار الباني وحده بلا عامل الخدمة */
  const d = notify({ ctorThrows: false, sw: true });
  assert.equal(d.win.mediaReadyNotify('image', true), true);
  await flush();
  assert.equal(d.made.length, 1); assert.equal(d.shown.length, 0, 'لا إشعار مزدوج');
  /* بلا عامل خدمة والباني يرمي ← false كما كان (لا وعد كاذب) */
  const none = notify({ ctorThrows: true, sw: false });
  assert.equal(none.win.mediaReadyNotify('image', true), false);
});

/* ───────────── حجز صور النوافذ المغلقة ───────────── */
const FSRC = read('js/app-10-features.js');
const RSTART = FSRC.indexOf('(function omranModalImgRelease(){');
const RBODY = FSRC.slice(RSTART, FSRC.indexOf('\n})();', RSTART) + 6);
function relImg(nw, nh, src) {
  const a = { src };
  return { naturalWidth: nw, naturalHeight: nh, __omHold: null,
    getAttribute(k) { return k === 'src' ? (a.src == null ? null : a.src) : null; },
    removeAttribute(k) { if (k === 'src') a.src = null; },
    set src(v) { a.src = v; }, get src() { return a.src; } };
}
function relRun(m) {
  const ctx = { window: {}, console, __swallow() {}, setTimeout() {},
    document: { readyState: 'complete', getElementById: (id) => (id === m.id ? m : null), addEventListener() {} },
    getComputedStyle: (el) => ({ display: el.offsetParent ? 'flex' : 'none' }),
    MutationObserver: function (fn) { this.observe = (el) => { el.__obs = fn; }; } };
  vm.createContext(ctx); vm.runInContext(RBODY, ctx);
  return ctx;
}

test('cli-tools-5 نتيجة جديدة وصلت والاستوديو مغلق ← إعادة الفتح تعرضها هي لا المحجوزة القديمة', () => {
  const A = 'data:image/png;base64,AAAA', B = 'data:image/png;base64,BBBB';
  const im = relImg(2048, 2048, A);
  const m = { id: 'studioAiModal', offsetParent: {}, __imgs: [im], getElementsByTagName() { return this.__imgs; } };
  const ctx = relRun(m);
  m.offsetParent = null; m.__obs();                 // أغلق المستخدم النافذة أثناء التوليد
  assert.equal(im.__omHold, A);
  im.src = B;                                       // وصلت النتيجة الجديدة والنافذة مخفيّة
  assert.equal(ctx.window.omranModalImgSrc(im), B, 'المصدر المقروء والنافذة مغلقة هو الأحدث');
  m.offsetParent = {}; m.__obs();                   // أعاد فتحها
  assert.equal(im.getAttribute('src'), B, 'كانت تعود data:A فوق B');
  assert.equal(im.__omHold, null, 'الحافظة القديمة فُرّغت');
  /* المسار الأصليّ كما كان: بلا مصدر جديد تعود المحجوزة */
  const im2 = relImg(2048, 2048, A);
  const m2 = { id: 'studioAiModal', offsetParent: {}, __imgs: [im2], getElementsByTagName() { return this.__imgs; } };
  relRun(m2);
  m2.offsetParent = null; m2.__obs(); m2.offsetParent = {}; m2.__obs();
  assert.equal(im2.getAttribute('src'), A);
});

/* ───────────── مساعد المستندات: سقف الحجم و413 ───────────── */
function docs(lng, tDict, fetchImpl) {
  const els = {};
  function el(id) {
    if (els[id]) return els[id];
    const e = { id, style: {}, innerHTML: '', textContent: '', value: '', dir: '', listeners: {},
      classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } },
      addEventListener(t, fn) { (e.listeners[t] = e.listeners[t] || []).push(fn); },
      dispatch(t) { (e.listeners[t] || []).forEach((fn) => fn({ type: t, target: e })); if (typeof e['on' + t] === 'function') e['on' + t]({ type: t, target: e }); },
      querySelectorAll: () => [], click() { e.dispatch('click'); } };
    els[id] = e; return e;
  }
  const calls = [];
  function FileReader() {}
  FileReader.prototype.readAsDataURL = function (f) { this.result = 'data:' + f.type + ';base64,' + 'A'.repeat(Math.ceil(f.size / 3) * 4); setImmediate(() => this.onload()); };
  const ctx = { document: { getElementById: el, documentElement: { lang: lng } }, lang: lng, localStorage: { getItem: () => lng },
    FileReader, setTimeout: () => 0, __swallow: () => {}, console,
    fetch: async (u, init) => { calls.push({ u, len: String(init && init.body || '').length }); return fetchImpl ? fetchImpl(u, init) : { ok: true, status: 200, json: async () => ({ doc: { summary: 'x', docText: 'x' } }) }; } };
  ctx.window = ctx;
  if (tDict) ctx.t = (k) => (k in tDict ? tDict[k] : k);
  vm.createContext(ctx);
  vm.runInContext(read('js/ui-docs.js'), ctx);
  return { el, calls };
}
const edge413 = async () => ({ ok: false, status: 413, json: async () => { throw new SyntaxError('Unexpected token R'); } });

test('cli-tools-8 ملفّ ٤ م.ب ← لا يُرسل، ورسالة مترجمة بالحدّ الحقيقيّ بدل «HTTP 413»', async () => {
  const d = docs('ar', null, edge413);
  d.el('btnDocs').click();
  d.el('docFile').files = [{ name: 'contract.pdf', type: 'application/pdf', size: 4 * 1024 * 1024 }];
  d.el('docFile').onchange();
  await d.el('docGo').onclick();
  await flush();
  const err = d.el('docErr').innerHTML;
  assert.equal(d.calls.length, 0, 'لا طلب يتجاوز حدّ جسم الطلب (كان يُرسل ٥٫٦ م.ب base64)');
  assert.doesNotMatch(err, /HTTP 413/);
  assert.match(err, /xmErr/);
  assert.match(err, /3/, 'الحدّ الحقيقيّ في الرسالة: ' + err);
  /* المفتاح من القاموس حين يوجد (كلّ اللغات) */
  const f = docs('fr', { axToolsDocTooBig: 'Fichier de plus de {n} Mo' }, edge413);
  f.el('btnDocs').click();
  f.el('docFile').files = [{ name: 'a.pdf', type: 'application/pdf', size: 5 * 1024 * 1024 }];
  f.el('docFile').onchange();
  await f.el('docGo').onclick(); await flush();
  assert.match(f.el('docErr').innerHTML, /Fichier de plus de 3 Mo/);
});

test('cli-tools-8 ملفّ تحت السقف يُرسل كما كان، و413 من الحافّة تظهر رسالة الحجم المترجمة لا «HTTP 413»', async () => {
  const ok = docs('ar');
  ok.el('btnDocs').click();
  ok.el('docFile').files = [{ name: 'small.pdf', type: 'application/pdf', size: 2 * 1024 * 1024 }];
  ok.el('docFile').onchange();
  await ok.el('docGo').onclick(); await flush();
  assert.equal(ok.calls.length, 1, 'ملفّ ٢ م.ب يُرسل');
  assert.ok(ok.calls[0].len < 4.5e6, 'جسم الطلب تحت حدّ الحافّة: ' + ok.calls[0].len);

  const e = docs('en', null, edge413);
  e.el('btnDocs').click();
  e.el('docPaste').value = 'long pasted text';
  await e.el('docGo').onclick(); await flush();
  const err = e.el('docErr').innerHTML;
  assert.doesNotMatch(err, /HTTP 413/, err);
  assert.match(err, /3 MB/, err);
});
