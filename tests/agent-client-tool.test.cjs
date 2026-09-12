// tests/agent-client-tool.test.cjs — v-agent-send-scope.
// لقطة المالك ١٢ سبتمبر: «Agent error: send is not defined». runInClient كانت تستدعي
// send وهو مُعرَّف داخل المعالج فقط، فأيّ أداة متصفّح تُسقط الوكيل كلّه. هذا الفحص
// يشغّل الدالّة فعلًا بمخزن مزيّف ويثبت أنّ حدث clientTool يصل وأنّ الناتج يعود.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-agent';
const root = path.join(__dirname, '..');

// مخزن KV مزيّف يُحقن قبل تحميل الوكيل: agent.js يطلبه داخل الدالّة فيصيب الكاش.
const store = new Map();
const kvPath = require.resolve('../api/_lib/kv.js');
require.cache[kvPath] = {
  id: kvPath, filename: kvPath, loaded: true,
  exports: {
    kvPutJSON: async (k, v) => { store.set(k, v); },
    kvGetJSON: async (k) => (store.has(k) ? store.get(k) : null),
    kvDel: async (k) => { store.delete(k); },
    kvExpire: async () => {},
    kvIncr: async () => 1,
  },
};

const { runInClient } = require('../api/_lib/agent.js').__test;

test('runInClient: emits clientTool through the passed send and returns the browser output', async () => {
  const events = [];
  const send = (ev) => {
    events.push(ev);
    // المتصفّح «يردّ» عبر المخزن كما تفعل نقطة agent-tool-result.
    if (ev.clientTool) store.set('agent/tool/' + ev.clientTool.id, { output: 'ran: ' + ev.clientTool.name });
  };
  const out = await runInClient(send, 'run_js', { code: '1+1' });
  assert.equal(out, 'ran: run_js');
  assert.equal(events.length, 1);
  assert.equal(events[0].clientTool.name, 'run_js');
  assert.deepEqual(events[0].clientTool.input, { code: '1+1' });
  assert.match(events[0].clientTool.id, /^c[a-z0-9]+$/);
  assert.ok(store.has('agent/wait/' + events[0].clientTool.id), 'تصريح الانتظار يُكتب قبل إرسال الأداة');
  assert.ok(!store.has('agent/tool/' + events[0].clientTool.id), 'الناتج يُنظَّف بعد قراءته');
});

test('source guard: every runInClient call site passes send explicitly', () => {
  const src = fs.readFileSync(path.join(root, 'api/_lib/agent.js'), 'utf8');
  assert.ok(src.includes('async function runInClient(send, name, input)'));
  const calls = src.match(/runInClient\((?!send\b)[^)]*\)/g) || [];
  const bad = calls.filter((c) => !c.startsWith('runInClient(send'));
  assert.deepEqual(bad, [], 'كلّ استدعاء يمرّر send');
});
