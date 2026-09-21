// tests/error-push.test.cjs — v-error-push (٢١ سبتمبر ٢٠٢٦): طلب المالك «أي خطأ يبلغني على
// طول» — كلّ خطأ خادم جديد (يمرّ بـ_errors.js#reportError) يدفع إشعار Web Push فوريًّا لكلّ
// مالك له اشتراك، بنفس آلية v-credit-alert القائمة (pushToOwners معمَّمة). تكرار نفس الخطأ
// (route+message) لا يُعيد الإشعار — كي لا يتحوّل عطل متكرّر إلى وابل إشعارات. رسائل الرصيد
// (402…) لا تصل إشعارًا مزدوجًا: alertOwnerCredit وحدها تغطّيها بمسارها الخاصّ ذي المهلة الست
// ساعات.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));

function freshErrors({ kv, alertCalls }) {
  delete require.cache[rp('api/_lib/_errors.js')];
  delete require.cache[rp('api/_lib/_owner-alert.js')];
  require.cache[rp('api/_lib/kv.js')] = {
    id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true,
    exports: { kvGetJSON: kv.kvGetJSON, kvPutJSON: kv.kvPutJSON },
  };
  require.cache[rp('api/_lib/_owner-alert.js')] = {
    id: rp('api/_lib/_owner-alert.js'), filename: rp('api/_lib/_owner-alert.js'), loaded: true,
    exports: {
      alertOwnerError: async (entry) => { alertCalls.push(entry); return { sent: 1, reason: 'ok' }; },
      alertOwnerCredit: async () => ({ sent: 0, reason: 'not-credit' }),
      isCreditFailure: (status, text) => Number(status) === 402 || /credit balance|too low|insufficient/i.test(String(text || '')),
    },
  };
  return require(rp('api/_lib/_errors.js'));
}

function fakeKv() {
  const store = new Map();
  return { store, kvGetJSON: async (k) => (store.has(k) ? store.get(k) : null), kvPutJSON: async (k, v) => { store.set(k, v); } };
}

test('خطأ جديد → alertOwnerError يُستدعى مرّة واحدة بمعلومات الخطأ', async () => {
  const alertCalls = [];
  const errors = freshErrors({ kv: fakeKv(), alertCalls });
  await errors.reportError(new Error('boom'), { route: 'chat', action: 'send' });
  assert.equal(alertCalls.length, 1);
  assert.equal(alertCalls[0].route, 'chat');
  assert.equal(alertCalls[0].action, 'send');
  assert.equal(alertCalls[0].message, 'boom');
});

test('نفس الخطأ (نفس route+message) مرّة ثانية لا يُعيد الإشعار — لا وابل إشعارات لعطل متكرّر', async () => {
  const alertCalls = [];
  const errors = freshErrors({ kv: fakeKv(), alertCalls });
  await errors.reportError(new Error('boom'), { route: 'chat' });
  await errors.reportError(new Error('boom'), { route: 'chat' });
  await errors.reportError(new Error('boom'), { route: 'chat' });
  assert.equal(alertCalls.length, 1, 'إشعار واحد فقط رغم ثلاث مرّات');
});

test('خطأ مختلف (route أو message مختلف) يُعيد الإشعار — كلّ خطأ مميَّز له إشعاره', async () => {
  const alertCalls = [];
  const errors = freshErrors({ kv: fakeKv(), alertCalls });
  await errors.reportError(new Error('boom'), { route: 'chat' });
  await errors.reportError(new Error('bang'), { route: 'chat' });
  await errors.reportError(new Error('boom'), { route: 'other-route' });
  assert.equal(alertCalls.length, 3);
});

test('فشل alertOwnerError نفسه (أو تعطّله) لا يُسقط reportError — الإشعار تحسين لا شرط', async () => {
  delete require.cache[rp('api/_lib/_errors.js')];
  require.cache[rp('api/_lib/kv.js')] = {
    id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true,
    exports: fakeKv(),
  };
  require.cache[rp('api/_lib/_owner-alert.js')] = {
    id: rp('api/_lib/_owner-alert.js'), filename: rp('api/_lib/_owner-alert.js'), loaded: true,
    exports: { alertOwnerError: async () => { throw new Error('push service down'); } },
  };
  const errors = require(rp('api/_lib/_errors.js'));
  await assert.doesNotReject(errors.reportError(new Error('x'), { route: 'r' }));
});

test('مهلة الإشعار محدودة (لا يعلّق ردّ الخطأ إلى الأبد لو تعطّل webpush)، والمؤقّت يُلغى لا يُترك معلَّقًا', () => {
  const src = fs.readFileSync(path.join(root, 'api/_lib/_errors.js'), 'utf8');
  assert.match(src, /const ERROR_PUSH_TIMEOUT_MS = \d+;/);
  assert.match(src, /const t = setTimeout\(resolve, ERROR_PUSH_TIMEOUT_MS\);/);
  assert.match(src, /require\('\.\/_owner-alert\.js'\)\.alertOwnerError\(entry\)\s*\n\s*\.then\(\(\) => \{ clearTimeout\(t\); resolve\(\); \}, \(\) => \{ clearTimeout\(t\); resolve\(\); \}\);/);
});

test('رسائل الرصيد (402…) لا تصل إشعارًا مزدوجًا: alertOwnerError نفسها تستثنيها (تختبرها _owner-alert مباشرة)', async () => {
  delete require.cache[rp('api/_lib/_owner-alert.js')];
  const alert = require(rp('api/_lib/_owner-alert.js'));
  const r = await alert.alertOwnerError({ route: 'chat', message: 'Your credit balance is too low' });
  assert.equal(r.reason, 'not-credit', 'alertOwnerCredit (بمهلتها الست ساعات) هي المسؤولة عن هذه الحالة، لا المسار العامّ');
});

console.log('✓ error-push: كلّ خطأ خادم جديد يبلّغ المالك فورًا، وتكرار الخطأ نفسه لا يُغرقه بإشعارات');
