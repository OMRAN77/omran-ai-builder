'use strict';
// وسيط تعارف اللعب الجماعيّ في «عالم المكعبات» — كود من أربعة أرقام، طلب دخول، قبول أو رفض.
// المنطق يُفحص هنا بمخزن في الذاكرة يقلّد أوامر Redis المستعملة؛ لا شبكة ولا مفاتيح.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { act, MAX_PENDING } = require('../api/play-room.js');

function memoryKV() {
  const data = new Map(), ttl = new Map(), log = [];
  const run = ([cmd, key, ...a]) => {
    log.push(cmd);
    if (cmd === 'RPUSH') { const l = data.get(key) || []; l.push(a[0]); data.set(key, l); return l.length; }
    if (cmd === 'RPOP') { const l = data.get(key) || []; return l.pop() ?? null; }
    if (cmd === 'LPOP') { const l = data.get(key) || []; const out = l.splice(0, Number(a[0])); return out.length ? out : null; }
    if (cmd === 'EXPIRE') { ttl.set(key, Number(a[0])); return 1; }
    if (cmd === 'DEL') { return data.delete(key) ? 1 : 0; }
    throw new Error('unexpected command ' + cmd);
  };
  return {
    data, ttl, log,
    kvGetRaw: async (k) => { log.push('GET'); const v = data.get(k); return typeof v === 'string' ? v : null; },
    kvSetRaw: async (k, v, t) => { log.push('SET'); data.set(k, String(v)); if (t) ttl.set(k, t); },
    kvSetIfAbsent: async (k, v, t) => { log.push('SETNX'); if (data.has(k)) return false; data.set(k, String(v)); if (t) ttl.set(k, t); return true; },
    kvIncr: async (k) => { log.push('INCR'); const n = Number(data.get(k) || 0) + 1; data.set(k, String(n)); return n; },
    kvExpire: async (k, t) => { log.push('EXPIRE'); ttl.set(k, t); },
    kvPipeline: async (cmds) => cmds.map(run),
  };
}
const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n';

test('الغرفة تُفتح بكود من أربعة أرقام وسرّ لصاحبها، ولها عمر', async () => {
  const K = memoryKV();
  const r = await act({ op: 'open', world: 'kawkab' }, '1.1.1.1', K);
  assert.equal(r.status, 200);
  assert.match(r.json.code, /^\d{4}$/);
  assert.match(r.json.key, /^[0-9a-f]{24}$/);
  assert.equal(K.ttl.get('play/room/' + r.json.code), 900);
  assert.equal((await act({ op: 'open', world: 'mars' }, '1.1.1.1', K)).status, 400, 'عالم غير معروف يُرفض');
});

test('الضيف يطلب الدخول، وصاحب الغرفة يسحب الطلب مرّة واحدة ثمّ يقبل', async () => {
  const K = memoryKV();
  const { code, key } = (await act({ op: 'open', world: 'waha' }, 'h', K)).json;
  const j = await act({ op: 'join', code, world: 'waha', name: ' فاطمة<script> ', offer: SDP }, 'g', K);
  assert.equal(j.status, 200);
  assert.match(j.json.id, /^[0-9a-f]{12}$/);
  assert.deepEqual((await act({ op: 'answer', code, id: j.json.id }, 'g', K)).json, { wait: true });
  const p = await act({ op: 'pending', code, key, keep: 1 }, 'h', K);
  assert.equal(p.json.joins.length, 1);
  assert.equal(p.json.joins[0].name, 'فاطمةscript', 'الاسم يُنظَّف من الرموز');
  assert.equal(p.json.joins[0].offer, SDP);
  assert.equal((await act({ op: 'pending', code, key }, 'h', K)).json.joins.length, 0, 'الطلب لا يُسلَّم مرّتين');
  assert.equal((await act({ op: 'admit', code, key, id: j.json.id, answer: SDP }, 'h', K)).json.ok, true);
  assert.deepEqual((await act({ op: 'answer', code, id: j.json.id }, 'g', K)).json, { answer: SDP });
  assert.equal(K.ttl.get('play/room/' + code + '/out/' + j.json.id), 180, 'الجواب يُمحى بعد ثلاث دقائق');
});

test('الرفض يصل للضيف، والعالم المختلف والكود الخطأ يُرفضان بسبب واضح', async () => {
  const K = memoryKV();
  const { code, key } = (await act({ op: 'open', world: 'dhalam' }, 'h', K)).json;
  const j = (await act({ op: 'join', code, world: 'dhalam', name: 'علي', offer: SDP }, 'g', K)).json;
  await act({ op: 'deny', code, key, id: j.id }, 'h', K);
  assert.deepEqual((await act({ op: 'answer', code, id: j.id }, 'g', K)).json, { denied: true });
  const w = await act({ op: 'join', code, world: 'kawkab', name: 'علي', offer: SDP }, 'g', K);
  assert.equal(w.status, 409);
  assert.deepEqual(w.json, { error: 'world', world: 'dhalam' });
  const other = code === '1234' ? '4321' : '1234';
  assert.equal((await act({ op: 'join', code: other, world: 'dhalam', name: 'علي', offer: SDP }, 'g', K)).json.error, 'no-room');
  assert.equal((await act({ op: 'join', code: '12', world: 'dhalam', offer: SDP }, 'g', K)).json.error, 'code');
  assert.equal((await act({ op: 'join', code, world: 'dhalam', offer: 'hello' }, 'g', K)).json.error, 'offer');
});

test('أوامر صاحب الغرفة تحتاج سرّه، والإغلاق يمحو الغرفة', async () => {
  const K = memoryKV();
  const { code, key } = (await act({ op: 'open', world: 'kawkab' }, 'h', K)).json;
  for (const op of ['pending', 'admit', 'deny', 'close']) {
    const r = await act({ op, code, key: 'x'.repeat(24), id: 'a'.repeat(12), answer: SDP }, 'x', K);
    assert.equal(r.status, 403, op + ' بلا السرّ');
  }
  assert.equal((await act({ op: 'close', code, key }, 'h', K)).json.ok, true);
  assert.equal((await act({ op: 'pending', code, key }, 'h', K)).json.error, 'no-room');
});

test('طابور الطلبات محدود، والفتح والطلب محدودان لكلّ عنوان في الدقيقة', async () => {
  const K = memoryKV();
  const { code } = (await act({ op: 'open', world: 'kawkab' }, 'h', K)).json;
  let busy = 0;
  for (let i = 0; i < MAX_PENDING + 2; i++) { const r = await act({ op: 'join', code, world: 'kawkab', name: 'n' + i, offer: SDP }, 'ip' + i, K); if (r.json.error === 'busy') busy++; }
  assert.equal(busy, 2);
  assert.equal(K.data.get('play/room/' + code + '/in').length, MAX_PENDING);
  let slow = 0;
  for (let i = 0; i < 20; i++) { const r = await act({ op: 'open', world: 'kawkab' }, 'same-ip', K); if (r.status === 429) slow++; }
  assert.equal(slow, 8, 'بعد ١٢ في الدقيقة يُرفض');
});

test('الأوامر قليلة: سحب الطلبات أمر واحد، وسؤال الضيف أمر واحد (حدّ الباقة المجانيّة)', async () => {
  const K = memoryKV();
  const { code, key } = (await act({ op: 'open', world: 'kawkab' }, 'h', K)).json;
  K.log.length = 0;
  await act({ op: 'pending', code, key }, 'h', K);
  assert.deepEqual(K.log, ['GET', 'LPOP']);
  K.log.length = 0;
  await act({ op: 'answer', code, id: 'a'.repeat(12) }, 'g', K);
  assert.deepEqual(K.log, ['GET']);
});

test('الملفّ لا يقرأ سرًّا في نطاق الوحدة ولا يطبع العرض', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api/play-room.js'), 'utf8');
  assert.ok(!/process\.env/.test(src), 'لا قراءة بيئة هنا: المخزن يُحمَّل داخل المعالج');
  assert.ok(!/console\.(log|error|warn)/.test(src), 'العرض والجواب يحملان عناوين اللاعبين فلا يُطبعان');
  const kv = fs.readFileSync(path.join(__dirname, '..', 'api/_kv.js'), 'utf8');
  assert.ok(!/^const .*process\.env/m.test(kv), 'الأسرار تُقرأ داخل النداء');
});
