'use strict';
/* v-device-control (أمر المالك ٣ أكتوبر: «تقدر تسوّيلي إيّاها في الاثنين من غير الآيفون»): جسر الأجهزة.
   (١) الوحدة بمخزن ذاكرة: رمز ← مفتاح، الحضور، الأمر والناتج واللقطة، وكلّ رفض.
   (٢) المعالج الحقيقيّ (agent.js) بمزوّد مزيّف وجهاز مزيّف يسحب الأمر ويردّ — اللقطة تصل النموذج صورةً. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'device-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const store = new Map();
const kv = {
  kvPutJSON: async (k, v) => { store.set(k, structuredClone(v)); },
  kvGetJSON: async (k) => (store.has(k) ? structuredClone(store.get(k)) : null),
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvIncr: async () => 1,
};
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
stub('api/_lib/kv.js', kv);
let usageUser = 'omran';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: usageUser }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
const device = require(rp('api/_lib/device.js'));
const agent = require(rp('api/_lib/agent.js'));
const { claim, poll, result } = device.__test;

async function pairDevice(owner, type) {
  const code = await device.createPairCode(owner);
  const r = await claim({ code: code.toLowerCase().replace('-', ' '), type, name: 'جهازي' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.key;
}

test('١. الربط: الرمز يُستبدل مرّة واحدة بمفتاح لا يُحفظ نصًّا، والرمز المستعمل أو المشوّه مرفوض', async () => {
  const code = await device.createPairCode('omran');
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  const r = await claim({ code, type: 'android', name: 'Galaxy' });
  assert.equal(r.status, 200);
  assert.match(r.json.key, /^dvk_[a-f0-9]{48}$/);
  assert.ok(![...store.keys()].some((k) => k.includes(r.json.key)) && ![...store.values()].some((v) => JSON.stringify(v).includes(r.json.key)), 'المفتاح لا يُخزَّن نصًّا');
  assert.equal((await claim({ code, type: 'android' })).status, 403, 'الرمز لمرّة واحدة');
  assert.equal((await claim({ code: 'zz' })).status, 400);
});

test('٢. الحضور والأمر والناتج: نبضة ← جاهز، الأمر يُسحب مرّة واحدة، والناتج مع اللقطة يعود للوكيل', async () => {
  const key = await pairDevice('omran', 'desktop');
  assert.equal(await device.deviceOnline('omran'), null, 'غائب قبل أوّل نبضة');
  assert.equal((await poll({ key: 'dvk_' + '0'.repeat(48) })).status, 403, 'مفتاح غير معروف');
  const p0 = await poll({ key, w: 1920, h: 1080 });
  assert.equal(p0.json.action, null);
  assert.ok(await device.deviceOnline('omran'), 'حاضر بعد النبضة');
  const pending = device.runOnDevice('omran', 'tap', { x: 10, y: 20 }, { waitMs: 3000, everyMs: 20 });
  await new Promise((r) => setTimeout(r, 30));
  const p1 = await poll({ key });
  assert.deepEqual([p1.json.action.name, p1.json.action.input], ['tap', { x: 10, y: 20 }]);
  assert.equal((await poll({ key })).json.action, null, 'لا يُنفَّذ مرّتين');
  const other = await pairDevice('someone', 'desktop');
  assert.equal((await result({ key: other, id: p1.json.action.id, output: 'x' })).status, 403, 'جهاز مالك آخر لا يردّ على أمري');
  assert.equal((await result({ key, id: 'dnotissued1', output: 'x' })).status, 403, 'معرّف لم يصدره الخادم');
  assert.equal((await result({ key, id: p1.json.action.id, output: 'ضغطت', image: 'data:image/jpeg;base64,QUJD', w: 1280, h: 720 })).status, 200);
  const out = await pending;
  assert.match(out.text, /^ضغطت · اللقطة 1280×720/);
  assert.equal(out.image, 'QUJD');
  assert.equal((await result({ key, id: p1.json.action.id, output: 'مكرّر' })).status, 403, 'ناتج واحد فقط');
});

test('٣. لقطة أكبر من الحدّ تُسقَط بملاحظة، وأمر غير معروف يُرفض، والجهاز الصامت يُبلَّغ', async () => {
  const key = await pairDevice('omran', 'desktop');
  const pending = device.runOnDevice('omran', 'screenshot', {}, { waitMs: 3000, everyMs: 20 });
  await new Promise((r) => setTimeout(r, 30));
  const a = (await poll({ key })).json.action;
  await result({ key, id: a.id, output: 'لقطة', image: 'A'.repeat(950000) });
  const out = await pending;
  assert.equal(out.image, '');
  assert.match(out.text, /أكبر من الحدّ/);
  assert.match((await device.runOnDevice('omran', 'rm -rf', {})).text, /غير معروف/);
  assert.match((await device.runOnDevice('omran', 'tap', { x: 1, y: 1 }, { waitMs: 60, everyMs: 20 })).text, /لم يردّ/);
});

test('٤. trimDeviceImages: تبقى آخر لقطتين في السجلّ', () => {
  const img = () => ({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: [{ type: 'image', source: {} }, { type: 'text', text: 't' }] }] });
  const convo = [img(), img(), img(), img()];
  agent.__test.trimDeviceImages(convo, 2);
  const has = convo.map((c) => c.content[0].content.some((x) => x.type === 'image'));
  assert.deepEqual(has, [false, false, true, true]);
});

/* ── (٢) المعالج الحقيقيّ ── */
function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
const sse = (events) => new Response(events.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const tapThen = () => sse([
  { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 5, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name: 'device_tap', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"x":100,"y":200}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 9 } },
]);
const answer = (t) => sse([
  { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 5, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
]);
async function runAgent(user, script) {
  usageUser = user;
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, init) => {
    if (!/api\.anthropic\.com\/v1\/messages/.test(String(url))) return new Response('{}', { status: 404 });
    calls.push(JSON.parse(init.body));
    return script[Math.min(i++, script.length - 1)]();
  };
  const req = { method: 'POST', headers: { host: 'x' }, body: { messages: [{ role: 'user', content: 'اضغط زرّ ابدأ' }], token: token(user) } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write() {}, end() {}, flush() {} };
  try { await agent(req, res); } finally { global.fetch = save; }
  return calls;
}
const sysText = (c) => (Array.isArray(c.system) ? c.system.map((b) => b.text).join('') : String(c.system || ''));

test('٥. المالك بلا جهاز حاضر: أداة الربط فقط، بلا أدوات الشاشة ولا ملاحظة الجهاز', async () => {
  store.clear();
  const calls = await runAgent('omran', [() => answer('اكتب الرمز')]);
  const names = calls[0].tools.map((t) => t.name);
  assert.ok(names.includes('device_pair_code'));
  assert.ok(!names.includes('device_tap'));
  assert.ok(!sysText(calls[0]).includes('[جهاز المالك حاضر الآن'));
});

test('٦. المالك والجهاز حاضر: الأدوات والملاحظة (قبل أوامر المالك)، والضغطة تصل الجهاز واللقطة تعود صورةً', async () => {
  store.clear();
  const key = await pairDevice('omran', 'android');
  await poll({ key, w: 1080, h: 2400 });
  let stop = false;
  const fakeDevice = (async () => {
    while (!stop) {
      const a = (await poll({ key })).json.action;
      if (a) await result({ key, id: a.id, output: 'ضغطت ' + a.input.x + '،' + a.input.y, image: 'SU1H', w: 540, h: 1200 });
      await new Promise((r) => setTimeout(r, 20));
    }
  })();
  const calls = await runAgent('omran', [tapThen, () => answer('ضغطت ابدأ')]);
  stop = true; await fakeDevice;
  const names = calls[0].tools.map((t) => t.name);
  for (const n of ['device_screenshot', 'device_tap', 'device_swipe', 'device_type', 'device_key']) assert.ok(names.includes(n), n);
  const s = sysText(calls[0]);
  assert.ok(s.includes('[جهاز المالك حاضر الآن — أندرويد «جهازي»]'));
  assert.ok(s.indexOf('[جهاز المالك حاضر الآن') < s.indexOf('[أوامر المالك'), 'أوامر المالك تبقى آخر النظام');
  const tr = calls[1].messages[calls[1].messages.length - 1].content[0];
  assert.equal(tr.type, 'tool_result');
  assert.deepEqual(tr.content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'SU1H' } });
  assert.match(tr.content[1].text, /^ضغطت 100،200 · اللقطة 540×1200/);
});

test('٧. غير المالك: لا أداة جهاز ولا ربط، حتّى لو كان للمالك جهاز حاضر', async () => {
  const calls = await runAgent('someone', [() => answer('تم')]);
  assert.ok(!calls[0].tools.some((t) => /^device_/.test(t.name)));
});
