// v-cc-off (المالك ١٤ أكتوبر: «الرصيد ١٥٠ دولار راحو يوم واحد — وقف كودي من اي شي لا تخليه يسوي اي شي»): Claude Code موقوف
// افتراضيًّا في الطرق الثلاث: مرحّل التطبيق (cc.js)، والجسر على Railway (تشغيل وإيقاظ ذاتيّ ودمج تلقائيّ)، والتفويض إلى Actions.
// يعود فقط بمتغيّر صريح يضعه المالك: CC_ENABLED=on (Vercel وRailway) وCODE_DELEGATE_ENABLED=on (التفويض).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

process.env.AUTH_SECRET = 'cc-off-test-secret-0123456789';
process.env.CC_BRIDGE_URL = 'https://bridge.example';
process.env.CC_BRIDGE_SECRET = 'x'.repeat(24);
delete process.env.CC_ENABLED;
delete process.env.CODE_DELEGATE_ENABLED;
const cc = require('../api/_lib/cc.js');
const D = require('../api/_lib/agent-delegate.js');

function ownerToken() {
  const p = Buffer.from(JSON.stringify({ u: 'omran', exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
async function call(op) {
  const sent = [];
  const save = global.fetch;
  global.fetch = async (url) => { sent.push(String(url)); return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.end = (b) => { if (b) r.body = b; return r; };
  try { await cc({ method: 'POST', query: {}, body: { op, token: ownerToken(), message: 'سوّ كذا' } }, r); } finally { global.fetch = save; }
  return { r, sent };
}

test('١. مرحّل التطبيق: التشغيل والنشر والدمج مرفوضة للمالك نفسه قبل أن تصل الجسر، والإيقاف والحالة تبقى', async () => {
  for (const op of ['chat', 'publish', 'merge', 'reset', 'watch']) {
    const { r, sent } = await call(op);
    assert.equal(r.code, 403, op);
    assert.ok(r.body.off && /موقوف بأمر المالك/.test(r.body.error), op);
    assert.equal(sent.length, 0, op + ': لا نداء للجسر');
  }
  for (const op of ['stop', 'status', 'notes']) {
    const { sent } = await call(op);
    assert.equal(sent.length, 1, op + ': يصل الجسر (إيقاف تشغيل جارٍ يبقى ممكنًا)');
  }
  process.env.CC_ENABLED = 'on';
  try { assert.equal((await call('publish')).sent.length, 1, 'يعود بالمفتاح الصريح وحده'); } finally { delete process.env.CC_ENABLED; }
});

test('٢. الجسر (Railway): موقوف افتراضيًّا — لا تشغيل ولا إيقاظ ذاتيّ ولا مراقبة تدمج، و/render و/stop باقيان', () => {
  const s = read('cc-bridge/server.mjs');
  assert.ok(s.includes("const ENABLED = String(env.CC_ENABLED || '').trim().toLowerCase() === 'on';"));
  assert.ok(s.includes("if (!ENABLED && req.method === 'POST' && ['/chat', '/publish', '/merge', '/reset', '/watch'].includes(url.pathname)) return json(res, 403, { error: CC_OFF, off: true });"));
  assert.ok(s.includes('if (!ENABLED) { wakeQueue.length = 0; return; }'), 'فحص أحمر أو تعليق لا يوقظ جلسة بأقصى جهد');
  assert.ok(s.includes('async function watchLoop() {\n  if (!ENABLED) return;'), 'لا دمج تلقائيّ ولا مراقبة');
  const renderAt = s.indexOf("url.pathname === '/render'"), gateAt = s.indexOf('if (!ENABLED && req.method');
  assert.ok(renderAt > 0 && renderAt < gateAt, 'مخرج التطبيق (بلا Claude) قبل البوّابة');
});

test('٣. التفويض إلى Claude Code في Actions موقوف بلا أيّ نداء؛ ويعود بـCODE_DELEGATE_ENABLED=on', async () => {
  let calls = 0;
  const opts = { fetchImpl: async () => { calls++; return new Response('{}', { status: 500 }); }, env: { GITHUB_TOKEN: 'tok' } };
  const r = await D.startTask({ task: 'أصلح تحليل الصورة في api/_lib/chat.js: الصورة لا تصل النموذج' }, opts);
  assert.match(r.error, /موقوف بأمر المالك/);
  assert.equal(calls, 0, 'لا مسألة ولا تشغيل');
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/cc-off.test.cjs'));
});
