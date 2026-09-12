// tests/provider-msgs.test.cjs — v-static-leak: علامة __static لا تصل أيّ مزوّد.
// لقطة المالك: Groq 400 «property '__static' is unsupported» على المسار الاحتياطيّ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { stripPrivateKeys } = require('../api/_lib/_msgs.js');

test('stripPrivateKeys: drops every __-prefixed key, keeps role/content/images and non-object items', () => {
  const sys = { role: 'system', content: 'S', __static: true };
  const usr = { role: 'user', content: [{ type: 'text', text: 'hi' }], images: [{ dataUrl: 'x' }] };
  const out = stripPrivateKeys([sys, usr, null, 'str']);
  assert.deepEqual(out[0], { role: 'system', content: 'S' });
  assert.equal(out[1], usr, 'رسالة بلا مفاتيح خاصّة تعود بالمرجع نفسه');
  assert.equal(out[2], null); assert.equal(out[3], 'str');
  assert.equal(sys.__static, true, 'لا تعديل في المكان — نسخة جديدة');
  assert.equal(stripPrivateKeys(undefined), undefined);
  assert.deepEqual(stripPrivateKeys([{ role: 'user', content: 'a', __meta: 1, __x: 2 }]), [{ role: 'user', content: 'a' }]);
});

test('source guard: every OpenAI-style proxy sanitizes before forwarding, and the client no longer tags messages', () => {
  for (const f of ['openai', 'groq', 'deepseek', 'mistral', 'openrouter', 'perplexity', 'cohere']) {
    const src = read('api/_lib/' + f + '.js');
    assert.ok(src.includes("require('./_msgs.js')"), f + ': يطلب المعقّم');
    assert.ok(src.includes('stripPrivateKeys(') , f + ': يطبّقه على الرسائل');
  }
  const client = read('js/app-09-attach.js');
  assert.ok(!/__static:\s*true/.test(client), 'العميل لا يضع الخاصيّة على الرسالة');
  assert.ok(client.includes('const __staticSys = ') && client.includes('m !== __staticSys'), 'الترشيح بالهويّة لا بالخاصيّة');
});
