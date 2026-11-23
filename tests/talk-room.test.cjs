'use strict';
// v-talk-room: «غرفة الربع» — وسيط التعارف (طريقة غرف «عالم المكعبات»)، بمخزن في الذاكرة يقلّد أوامر Redis المستعملة.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { act, MAX_PENDING } = require('../api/_lib/talk-room.js');

function memoryKV() {
  const data = new Map(), ttl = new Map(), log = [];
  const run = ([cmd, key, ...a]) => {
    log.push(cmd);
    if (cmd === 'RPUSH') { const l = data.get(key) || []; l.push(a[0]); data.set(key, l); return l.length; }
    if (cmd === 'RPOP') { const l = data.get(key) || []; return l.pop() ?? null; }
    if (cmd === 'LPOP') { const l = data.get(key) || []; const out = l.splice(0, Number(a[0])); return out.length ? out : null; }
    if (cmd === 'EXPIRE') { ttl.set(key, Number(a[0])); return 1; }
    if (cmd === 'DEL') return data.delete(key) ? 1 : 0;
    throw new Error('unexpected command ' + cmd);
  };
  return {
    data, ttl, log,
    kvGetRaw: async (k) => { log.push('GET'); const v = data.get(k); return typeof v === 'string' ? v : null; },
    kvSetRaw: async (k, v, t) => { log.push('SET'); data.set(k, String(v)); if (t) ttl.set(k, t); },
    kvSetIfAbsent: async (k, v, t) => { log.push('SETNX'); if (data.has(k)) return false; data.set(k, String(v)); if (t) ttl.set(k, t); return true; },
    kvIncr: async (k) => { const n = Number(data.get(k) || 0) + 1; data.set(k, String(n)); return n; },
    kvExpire: async (k, t) => { ttl.set(k, t); },
    kvPipeline: async (cmds) => cmds.map(run),
  };
}
const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n';

test('فتح الغرفة يحتاج حسابًا، ويعطي كودًا من أربعة أرقام وسرًّا لصاحبها، ولها عمر', async () => {
  const K = memoryKV();
  assert.equal((await act({ op: 'open' }, 'ip', K, null)).status, 401, 'بلا حساب ما في فتح');
  const r = await act({ op: 'open', name: 'عمران' }, 'ip', K, 'omran');
  assert.equal(r.status, 200);
  assert.match(r.json.code, /^\d{4}$/);
  assert.match(r.json.key, /^[0-9a-f]{24}$/);
  assert.equal(K.ttl.get('talk/room/' + r.json.code), 900);
  assert.deepEqual((await act({ op: 'peek', code: r.json.code }, 'g', K, null)).json, { name: 'عمران' }, 'الضيف يشوف اسم صاحب الغرفة بس');
});

test('الضيف بلا حساب يطلب بالكود، وصاحب الغرفة يسحب الطلب مرّة ويقبل أو يرفض', async () => {
  const K = memoryKV();
  const { code, key } = (await act({ op: 'open' }, 'h', K, 'omran')).json;
  const j = await act({ op: 'join', code, name: ' فاطمة<script> ', offer: SDP }, 'g', K, null);
  assert.equal(j.status, 200);
  assert.deepEqual((await act({ op: 'answer', code, id: j.json.id }, 'g', K, null)).json, { wait: true });
  const p = await act({ op: 'pending', code, key, keep: 1 }, 'h', K, null);
  assert.equal(p.json.joins.length, 1);
  assert.equal(p.json.joins[0].name, 'فاطمةscript', 'الاسم منظَّف');
  assert.equal((await act({ op: 'pending', code, key }, 'h', K, null)).json.joins.length, 0, 'ما يتسلّم مرّتين');
  await act({ op: 'admit', code, key, id: j.json.id, answer: SDP }, 'h', K, null);
  assert.deepEqual((await act({ op: 'answer', code, id: j.json.id }, 'g', K, null)).json, { answer: SDP });
  const j2 = (await act({ op: 'join', code, name: 'x', offer: SDP }, 'g2', K, null)).json;
  await act({ op: 'deny', code, key, id: j2.id }, 'h', K, null);
  assert.deepEqual((await act({ op: 'answer', code, id: j2.id }, 'g2', K, null)).json, { denied: true });
});

test('أوامر صاحب الغرفة تحتاج سرّه، والطابور محدود، والإغلاق يمحو الغرفة', async () => {
  const K = memoryKV();
  const { code, key } = (await act({ op: 'open' }, 'h', K, 'omran')).json;
  for (const op of ['pending', 'admit', 'deny', 'close']) assert.equal((await act({ op, code, key: 'x'.repeat(24), id: 'a'.repeat(12), answer: SDP }, 'x', K, null)).status, 403, op);
  let busy = 0;
  for (let i = 0; i < MAX_PENDING + 2; i++) if ((await act({ op: 'join', code, name: 'n' + i, offer: SDP }, 'ip' + i, K, null)).json.error === 'busy') busy++;
  assert.equal(busy, 2);
  await act({ op: 'close', code, key }, 'h', K, null);
  assert.equal((await act({ op: 'join', code, name: 'n', offer: SDP }, 'z', K, null)).json.error, 'no-room');
  assert.equal((await act({ op: 'join', code: '12', name: 'n', offer: SDP }, 'z', K, null)).json.error, 'code');
  assert.equal((await act({ op: 'join', code, name: 'n', offer: 'hello' }, 'z', K, null)).json.error, 'offer');
});

test('الأوامر قليلة (حدّ الباقة المجانيّة)، والملفّ لا يقرأ سرًّا في نطاق الوحدة ولا يطبع العرض', async () => {
  const K = memoryKV();
  const { code, key } = (await act({ op: 'open' }, 'h', K, 'omran')).json;
  K.log.length = 0;
  await act({ op: 'pending', code, key }, 'h', K, null);
  assert.deepEqual(K.log, ['GET', 'LPOP']);
  const src = fs.readFileSync(path.join(__dirname, '..', 'api/_lib/talk-room.js'), 'utf8');
  assert.ok(!/process\.env/.test(src));
  assert.ok(!/console\.(log|error|warn)/.test(src));
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'api/system.js'), 'utf8'), /case 'room': return require\('\.\/_lib\/talk-room\.js'\)/);
});

test('الصفحة ‎/room‎: الكلام يُعرض نصًّا لا HTML، والزرّ في الأدوات بالـ١٤ لغة، وما في اسم مزوّد', () => {
  const root = path.join(__dirname, '..'), html = fs.readFileSync(path.join(root, 'room.html'), 'utf8');
  assert.match(html, /d\.appendChild\(document\.createTextNode\(l\.text\)\)/);
  assert.match(html, /b\.textContent = l\.who/);
  assert.match(html, /if \(t\.length >= 5\) \{ stamps\.set\(id, t\); return false; \}/, 'صاحب الغرفة يقطع اللي يرسل وايد بسرعة');
  assert.ok(!/claude|gemini|openai|gpt|anthropic|groq/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'ما في اسم مزوّد في نصّ يراه المستخدم');
  assert.match(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'), /"source": "\/room",\s*"destination": "\/room\.html"/);
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /id="btnTalkRoom"[^>]*data-i18n-title="talkRoomTitle"/);
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) assert.match(fs.readFileSync(path.join(root, 'i18n', l + '.js'), 'utf8'), /talkRoomTitle: '/, l);
  assert.equal((fs.readFileSync(path.join(root, 'js/app-03-i18n-data.js'), 'utf8').match(/talkRoomTitle: '/g) || []).length, 2, 'العربيّة والإنجليزيّة');
});
