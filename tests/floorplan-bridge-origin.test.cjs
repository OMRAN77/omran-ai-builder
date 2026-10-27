// tests/floorplan-bridge-origin.test.cjs — v-sec-postmsg (إعادة التقييم ١٠ أكتوبر).
// العرض: مستمع جسر المخطّطات (app-15-floorplan.js) كان يقبل {__omranView:1} من أيّ نافذة، فموقع آخر يفتح التطبيق في نافذة منبثقة
// ويرسل الرسالة فيولّد التطبيق صورة مدفوعة برمز المستخدم. القرار: الطلب من إطار داخل صفحة التطبيق وحده.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/app-15-floorplan.js'), 'utf8');
const start = SRC.indexOf('/* ───────── التكامل: زر المقاولات + جسر توليد الصور');
assert.ok(start > 0, 'كتلة الجسر موجودة');
const BLOCK = SRC.slice(start);

function harness(frameWin) {
  let handler = null; const fetches = []; const replies = []; const asks = [];
  const ctx = {
    window: { location: { origin: 'https://app.example' }, omranFloorplan: { facadePrompt: () => 'facade prompt' }, addEventListener: (t, f) => { if (t === 'message') handler = f; }, getGuestId: () => 'g' },
    document: { getElementsByTagName: () => [{ contentWindow: frameWin }], getElementById: (id) => id === 'previewFrame' ? { contentWindow: frameWin } : null, querySelectorAll: () => [] },
    fetch: (url, init) => { fetches.push({ url, init }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ imageBase64: 'AAAA', mimeType: 'image/png' }) }); },
    authGet: () => 'tok', __swallow: () => {}, console,
    confirm: (m) => { asks.push(m); return true; }, // v-lock-quotab (cli-studios-12): المستخدم وافق على السعر في نافذة التطبيق
  };
  ctx.window.window = ctx.window;
  vm.runInNewContext('var window = this.window; var document = this.document;\n' + BLOCK, ctx);
  assert.equal(typeof handler, 'function', 'المستمع مسجَّل');
  return { handler, fetches, replies, asks };
}
const flush = () => new Promise((r) => setImmediate(r)); // v-lock-quotab: التوليد بعد تأكيد السعر (وعد) لا في المستمع نفسه
// v-lock-quotab (cli-studios-12، المراجعة): الرفض يُفحص بعد أن تجري الوعود — فحص متزامن بعد handler() كان ينجح ولو أُزيل الحارس كلّه.
const spyWin = (replies) => ({ postMessage: (m) => replies.push(m) });

test('رسالة من نافذة خارجيّة (ليست إطارًا في الصفحة) لا تولّد صورة', async () => {
  const ownFrame = { postMessage() {} };
  const h = harness(ownFrame);
  const evil = spyWin(h.replies);
  h.handler({ data: { __omranView: 1, id: 1, view: 'front', spec: {} }, source: evil, origin: 'https://evil.example' });
  await flush(); await flush();
  assert.equal(h.fetches.length, 0, 'لا نداء مدفوع لمصدر خارجيّ');
  assert.equal(h.asks.length, 0, 'ولا سؤال سعر يفتحه مصدر خارجيّ');
  assert.equal(h.replies.length, 0, 'ولا ردّ له');
});

test('رسالة المحرّر من إطار المعاينة نفسه تعمل كما كانت', async () => {
  const ownFrame = { postMessage() {} };
  const h = harness(ownFrame);
  h.handler({ data: { __omranView: 1, id: 2, view: 'front', spec: {} }, source: ownFrame, origin: 'https://app.example' /* معاينة srcdoc ترث أصل التطبيق */ });
  await flush();
  assert.equal(h.fetches.length, 1);
  assert.equal(h.fetches[0].url, '/api/maha-image');
});

test('المراجعة العدائيّة: إطار معزول آخر (جرّبه لي، run_js — أصله «null» وليس إطار المعاينة) لا يولّد صورة مدفوعة', async () => {
  // v-sec-sandbox: المعاينة نفسها صارت معزولة (أصلها null)، فالتمييز صار بهويّة الإطار لا بالأصل:
  // إطار المعاينة (#previewFrame) مسموح، وأيّ إطار معزول آخر (run_js/test_html) مرفوض ولو كان أصله null أيضًا.
  const previewWin = { postMessage() {} };   // إطار المعاينة (يحمله المحرّر)
  const h = harness(previewWin);
  const sandboxedRunJs = spyWin(h.replies); // إطار «جرّبه لي» — نافذة أخرى
  h.handler({ data: { __omranView: 1, id: 3, view: 'front', spec: {} }, source: sandboxedRunJs, origin: 'null' });
  await flush(); await flush();
  assert.equal(h.fetches.length, 0, 'كود النموذج في إطار معزول غير المعاينة لا ينفق نقاط المستخدم');
  assert.equal(h.asks.length, 0, 'ولا يفتح سؤال سعر في نافذة التطبيق');
  assert.equal(h.replies.length, 0, 'ولا ردّ له');
});

test('إطار المعاينة المعزول (أصله «null» بعد sandbox) يعمل بهويّته', async () => {
  const previewWin = { postMessage() {} };
  const h = harness(previewWin);
  h.handler({ data: { __omranView: 1, id: 4, view: 'front', spec: {} }, source: previewWin, origin: 'null' });
  await flush();
  assert.equal(h.fetches.length, 1, 'المحرّر في إطار المعاينة يولّد كما كان ولو صار أصله null');
});
