// tests/freeze-why.test.cjs — v-freeze-why (لقطة عمران ١٠ نوفمبر: شريط «التطبيق يستجيب ببطء» طلع عنده، وقياسي بحسابه وبعرض شاشته لم يُعِده —
// أطول تعليق نصف ثانية). لا أحد يعرف ماذا جمّد الخيط لحظتها. الآن حين يطلع الشريط يُرسَل تقرير واحد إلى سجلّ أخطاء المالك (diag:freeze):
// مدّة التعليق، الشاشة، آخر النقرات (معرّف/مفتاح ترجمة لا نصّ)، وأطول الإطارات ومن جمّدها. على كاشف التجمّد نفسه (app-10-features) في vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'js', 'app-10-features.js'), 'utf8');
const s = SRC.indexOf('// --- Freeze detector');
const CODE = SRC.slice(s, SRC.indexOf('// --- AppGallery 7.5', s));

function el(id, attrs, parent) {
  const a = attrs || {};
  const node = { id: id || '', tagName: (a.tag || 'BUTTON'), textContent: a.text || '', parent: parent || null, offsetParent: a.hidden ? null : {},
    getAttribute: (k) => (a[k] === undefined ? null : a[k]) };
  node.closest = (sel) => {
    for (let n = node; n; n = n.parent) if (n.id || n.getAttribute('data-i18n') || n.getAttribute('data-i18n-title')) return sel.includes('[id]') ? n : null;
    return null;
  };
  return node;
}

function world(opts) {
  const o = opts || {};
  let now = 2000000;
  const listeners = {};
  const banner = { style: { display: 'none' } };
  let worker = null;
  let observerCb = null;
  const sent = [];
  const els = {};
  const timers = [];
  const winL = {};
  const doc = {
    hidden: false,
    images: { length: 21 },
    addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); },
    querySelector: (sel) => (sel === '.settingsPageActive' ? (o.settings ? { id: o.settings } : null) : null),
    querySelectorAll: () => (o.modals || []).map((id) => el(id)),
    getElementsByTagName: () => ({ length: 6085 }),
  };
  const ctx = {
    Date: { now: () => now }, Math, JSON, String, Number,
    document: doc,
    window: { Worker: function () {}, devicePixelRatio: 1, __omranBuild: () => 'b9e5725f',
      addEventListener: (k, f) => { (winL[k] = winL[k] || []).push(f); },
      removeEventListener: (k, f) => { winL[k] = (winL[k] || []).filter((x) => x !== f); } },
    setTimeout: (f) => { timers.push(f); return timers.length; },
    clearTimeout: (id) => { timers[id - 1] = null; },
    innerWidth: 1010, innerHeight: 1033,
    navigator: { hardwareConcurrency: 8, deviceMemory: 8, userAgent: 'test-ua' },
    location: { pathname: '/', href: 'https://x/?token=SECRET' },
    performance: { timeOrigin: 0, memory: { usedJSHeapSize: 300 * 1048576, jsHeapSizeLimit: 4096 * 1048576 } },
    getComputedStyle: () => ({ position: 'static', display: 'block' }),
    PerformanceObserver: Object.assign(function (cb) { observerCb = cb; this.observe = () => {}; }, { supportedEntryTypes: o.noLoaf ? ['longtask'] : ['longtask', 'long-animation-frame'] }),
    fetch: (url, init) => { sent.push({ url, body: JSON.parse(init.body), keepalive: init.keepalive }); return Promise.resolve({ ok: true }); },
    Worker: function () { worker = this; this.terminate = () => {}; },
    Blob: function () {}, URL: { createObjectURL: () => 'blob:x' },
    $: (sel) => (sel === '#freezeBanner' ? banner : (els[sel] = els[sel] || { onclick: null })),
    saveState() {}, __swallow(e) { if (o.strict) throw e; },
  };
  ctx.window.window = ctx.window;
  ctx.window.PerformanceObserver = ctx.PerformanceObserver; // في المتصفّح window هو النطاق العامّ
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  return {
    banner, sent,
    click(target) { now += 10; (listeners.click || []).forEach((f) => f({ target })); },
    frame(entry) { observerCb({ getEntries: () => [entry] }); },
    freeze(at) { // نبضتان متأخّرتان ٧ث والصفحة ظاهرة
      const t = at || now + 1000;
      now = t; worker.onmessage({ data: t - 50 });
      now = t + 8000; worker.onmessage({ data: t + 1000 });
      now = t + 8010; worker.onmessage({ data: t + 2000 });
    },
    healthy() { const t = now + 1000; now = t + 30; worker.onmessage({ data: t }); },
    dismiss() { els['#freezeDismissBtn'].onclick(); },
    flush() { timers.splice(0).forEach((f) => f && f()); }, // مرور الثانيتين
    pagehide() { (winL.pagehide || []).slice().forEach((f) => f()); },
    get now() { return now; },
  };
}

test('١. الشريط يطلع ← تقرير واحد diag:freeze فيه المدّة والشاشة وآخر نقرة ومن جمّد الإطار، وبلا نصّ المستخدم', () => {
  const w = world({ settings: 'ownerSection', modals: ['plansModal'], strict: true });
  w.click(el('', { 'data-i18n': 'ownerRefreshStats', text: 'تحديث الإحصائيات' }));
  w.click(el('sendBtn', { text: 'نصّ سرّيّ كتبه المستخدم' }));
  w.frame({ startTime: w.now - 500, duration: 7400, scripts: [
    { duration: 7200, invoker: 'BUTTON#sendBtn.onclick', sourceFunctionName: 'renderHistory', sourceURL: 'https://x/js/app.bundle.js?t=1', sourceCharPosition: 1234567 },
    { duration: 90, invokerType: 'event-listener', sourceFunctionName: 'saveState', sourceURL: 'https://x/js/app.bundle.js', sourceCharPosition: 99 },
  ] });
  w.frame({ startTime: w.now, duration: 120, scripts: [] }); // قصير: لا يُحفظ
  w.freeze(w.now + 20000 + 2000000); // بعد مهلة الإقلاع
  assert.equal(w.banner.style.display, 'flex');
  assert.equal(w.sent.length, 0, 'ينتظر ثانيتين حتّى يصل سجلّ الإطار الطويل');
  w.flush();
  assert.equal(w.sent.length, 1);
  const r = w.sent[0];
  assert.equal(r.url, '/api/system?action=client-errors');
  assert.equal(r.keepalive, true, 'يصل ولو ضغط «إعادة التحميل» فورًا');
  assert.equal(r.body.source, 'diag:freeze');
  assert.match(r.body.message, /^تعليق \d+ث — settings:ownerSection \+plansModal — آخر نقرة: #sendBtn$/);
  assert.match(r.body.stack, /النقرات: button\[ownerRefreshStats\] -\d+s · #sendBtn -\d+s/);
  assert.match(r.body.stack, /7400ms .*7200ms BUTTON#sendBtn\.onclick renderHistory @app\.bundle\.js:1234567/);
  assert.ok(!/120ms/.test(r.body.stack), 'الإطار القصير لا يُذكر');
  assert.match(r.body.stack, /vp 1010x1033 .*heap 300\/4096MB dom 6085 img 21/);
  assert.equal(r.body.build, 'b9e5725f');
  assert.equal(r.body.url, '/', 'المسار وحده — لا رمز في الرابط');
  const all = JSON.stringify(r.body);
  assert.ok(!all.includes('سرّيّ') && !all.includes('SECRET') && !all.includes('تحديث الإحصائيات'), 'لا نصّ مستخدم ولا رمز ولا نصّ الزرّ');
  assert.ok(r.body.stack.length <= 1500 && r.body.message.length <= 500, 'داخل حدود الخادم');
});

test('٢. لا تقرير بلا تعليق، وثلاثة على الأكثر في الفتح الواحد', () => {
  const w = world();
  for (let i = 0; i < 5; i++) w.healthy();
  assert.equal(w.sent.length, 0);
  // خمس مرّات: تعليق ← الشريط ← المستخدم يغلقه ← بعد دقيقتين تعليق جديد
  for (let i = 0; i < 5; i++) {
    w.freeze(w.now + 200000);
    w.flush();
    assert.equal(w.banner.style.display, 'flex', 'الشريط نفسه كما كان في كلّ مرّة');
    w.dismiss();
  }
  assert.equal(w.sent.length, 3, 'ثلاثة تقارير على الأكثر في الفتح الواحد');
});

test('٣. متصفّح بلا Long Animation Frames: التقرير يصل بالمدّة والشاشة والنقرات، والإطارات من longtask بلا أسماء', () => {
  const w = world({ noLoaf: true, strict: true });
  w.frame({ startTime: w.now, duration: 6900 });
  w.freeze(w.now + 2000000 + 20000);
  w.flush();
  assert.equal(w.sent.length, 1);
  assert.match(w.sent[0].body.message, /— chat — آخر نقرة: لا شيء$/);
  assert.match(w.sent[0].body.stack, /6900ms -\d+s \[\]/);
});

test('٤. الخادم يعدّه قياسًا لا خطأ (isDiag) فلا يرفع عدّاد أخطاء المالك', () => {
  const { isDiag } = require(path.join(root, 'api', '_lib', 'app-errors.js'));
  assert.equal(isDiag({ source: 'diag:freeze', message: 'تعليق 9ث' }), true);
});

test('٥. «إعادة التحميل» قبل الثانيتين: التقرير يُرسَل فورًا عند مغادرة الصفحة، ومرّة واحدة', () => {
  const w = world({ strict: true });
  w.freeze(w.now + 2000000 + 20000);
  assert.equal(w.sent.length, 0);
  w.pagehide();
  assert.equal(w.sent.length, 1);
  w.flush(); w.pagehide();
  assert.equal(w.sent.length, 1, 'لا تكرار');
});
