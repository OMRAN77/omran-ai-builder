'use strict';
// v-blockworld-online: الحفظ في الحساب، الغرف العامّة (في play-room.test.cjs)، الدردشة والوجوه، وتحديات اليوم.
// المنطق يُفحص هنا بلا شبكة ولا مفاتيح: الخادم بمخزن في الذاكرة، والوحدات التي بلا استيراد تُشغَّل كما هي.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { act, MAX_DATA } = require('../api/cloud-save.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const esm = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

function memoryKV() {
  const data = new Map(), ttl = new Map();
  const run = ([cmd, key, ...a]) => {
    if (cmd === 'GET') { const v = data.get(key); return typeof v === 'string' ? v : null; }
    if (cmd === 'SET') { data.set(key, String(a[0])); if (a[1] === 'EX') ttl.set(key, Number(a[2])); return 'OK'; }
    if (cmd === 'EXPIRE') { ttl.set(key, Number(a[0])); return 1; }
    throw new Error('unexpected command ' + cmd);
  };
  return {
    data, ttl,
    kvGetRaw: async (k) => run(['GET', k]),
    kvSetIfAbsent: async (k, v, t) => { if (data.has(k)) return false; data.set(k, String(v)); if (t) ttl.set(k, t); return true; },
    kvIncr: async (k) => { const n = Number(data.get(k) || 0) + 1; data.set(k, String(n)); return n; },
    kvExpire: async (k, t) => { ttl.set(k, t); },
    kvPipeline: async (cmds) => cmds.map(run),
  };
}

test('الحساب: رمز من ١٢ حرف ورقم، والعالم يرتفع ويرجع كما هو', async () => {
  const K = memoryKV();
  const n = await act({ op: 'new' }, '1.1.1.1', K);
  assert.equal(n.status, 200);
  assert.match(n.json.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/, 'بلا حروف تلتبس (0 O 1 I L)');
  const code = n.json.code, data = 'j:' + JSON.stringify({ v: 1, world: 'kawkab', log: [['put', 1, 2, 3, 4, 0]] });
  assert.deepEqual((await act({ op: 'get', code, world: 'kawkab' }, 'x', K)).json, { none: true });
  const p = await act({ op: 'put', code, world: 'kawkab', at: 1234, data }, 'x', K);
  assert.equal(p.status, 200);
  const g = await act({ op: 'get', code: code.toLowerCase().replace(/-/g, ' '), world: 'kawkab' }, 'x', K);
  assert.deepEqual(g.json, { at: 1234, data }, 'الرمز يُقبل بحروف صغيرة وبدون شرطات');
  assert.deepEqual((await act({ op: 'info', code }, 'x', K)).json, { worlds: { kawkab: 1234 } });
  assert.deepEqual((await act({ op: 'get', code, world: 'waha' }, 'x', K)).json, { none: true }, 'كل عالم حفظه');
  for (const k of K.ttl.keys()) if (k.startsWith('save/')) assert.equal(K.ttl.get(k), 365 * 86400, 'يبقى سنة من آخر استعمال: ' + k);
});

test('الحساب: الرمز نفسه ما ينحفظ، والرمز الغلط والحفظ الكبير والغريب ينرفضون', async () => {
  const K = memoryKV();
  const { code } = (await act({ op: 'new' }, 'a', K)).json;
  const plain = code.replace(/-/g, '');
  for (const k of K.data.keys()) assert.ok(!k.includes(plain) && !k.includes(code), 'المخزن فيه بصمة الرمز لا الرمز');
  assert.equal((await act({ op: 'get', code: 'AAAA-BBBB-CCCC', world: 'kawkab' }, 'a', K)).status, 404);
  assert.equal((await act({ op: 'get', code: '123', world: 'kawkab' }, 'a', K)).json.error, 'code');
  assert.equal((await act({ op: 'put', code, world: 'mars', data: 'j:' + 'x'.repeat(20) }, 'a', K)).json.error, 'world');
  assert.equal((await act({ op: 'put', code, world: 'kawkab', data: 'hello world!' }, 'a', K)).json.error, 'data');
  assert.equal((await act({ op: 'put', code, world: 'kawkab', data: 'g:' + 'A'.repeat(MAX_DATA) }, 'a', K)).status, 413);
  assert.equal((await act({ op: 'nope' }, 'a', K)).json.error, 'op');
  const future = await act({ op: 'put', code, world: 'kawkab', at: Date.now() + 1e9, data: 'j:' + 'x'.repeat(20) }, 'a', K);
  assert.ok(future.json.at <= Date.now() + 60000, 'وقت من المستقبل ما يغلب كل الأجهزة');
});

test('الحساب: إنشاء الحسابات والرفع محدودان لكل عنوان في الدقيقة', async () => {
  const K = memoryKV();
  let slow = 0;
  for (let i = 0; i < 6; i++) if ((await act({ op: 'new' }, 'same', K)).status === 429) slow++;
  assert.equal(slow, 3);
  const src = read('api/cloud-save.js');
  assert.ok(!/process\.env/.test(src), 'لا قراءة بيئة في الملف: المخزن يُحمَّل داخل المعالج');
  assert.ok(!/console\.(log|error|warn)/.test(src));
});

test('الحساب في اللعبة: الحفظ يُضغط ويرجع كما هو، ويرتبط بالحفظ والقائمة', async () => {
  const { pack, unpack, showCode } = await esm('shared/cloud.js');
  const text = JSON.stringify({ v: 1, world: 'kawkab', log: Array.from({ length: 2000 }, (_, i) => ['put', i % 64, 10, i % 50, 4, 0]) });
  const p = await pack(text);
  assert.match(p, /^g:/);
  assert.ok(p.length < text.length / 4, 'المضغوط أصغر بوايد: ' + p.length + ' من ' + text.length);
  assert.equal(await unpack(p), text);
  assert.equal(await unpack('j:{"a":1}'), '{"a":1}');
  assert.equal(showCode('k7qm 2xpa 9dtr'), 'K7QM-2XPA-9DTR');
  assert.equal(showCode('short'), '');
  // the linked code is read live (it was once copied when the object was made, so a new account looked unlinked)
  global.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  global.fetch = async () => ({ json: async () => ({ code: 'K7QM-2XPA-9DTR' }) });
  const { createCloud } = await esm('shared/cloud.js');
  const c = createCloud({ world: 'kawkab' });
  assert.equal(c.code, '');
  assert.equal(await c.create(), true);
  assert.equal(c.code, 'K7QM-2XPA-9DTR', 'بعد ما ينسوّى الحساب، الرمز مربوط');
  c.unlink();
  assert.equal(c.code, '');
  delete global.window; delete global.fetch;
  const save = read('shared/save.js'), play = read('shared/play.js');
  assert.match(save, /cloud: createCloud\(\{ world \}\)/);
  assert.match(save, /got && got\.at > mine \? JSON\.parse\(got\.text\) : null/, 'حفظ الحساب ياخذ مكان حفظ المتصفح إذا كان أحدث بس');
  assert.match(save, /api\.disabled = 'pulling'/, 'ما ينكتب فوق شي وهو يجيب حفظ الحساب');
  assert.match(play, /btn\('cloud', window\.__GAME_CLOUD\.code \? 'حسابي ✓'/);
  assert.match(play, /view === 'cloud'/);
});

test('الدردشة: السطر ينظَّف ويُقصّ، والوجوه ثمانية، وصاحب الغرفة يمرّرها باسم المرسل', async () => {
  const { cleanLine, EMOTES, MAX_LINE } = await esm('shared/chat.js');
  assert.equal(cleanLine('  هلا\n<b>والله</b>  '), 'هلا <b>والله</b>', 'يبقى كما كُتب: يُعرض نصًّا لا HTML');
  assert.equal(cleanLine('\u202eعكس'), 'عكس', 'علامات قلب الاتجاه تنشال');
  assert.equal(cleanLine('x'.repeat(500)).length, MAX_LINE);
  assert.equal(cleanLine('   '), '');
  assert.equal(EMOTES.length, 8);
  const chat = read('shared/chat.js'), net = read('shared/net.js');
  assert.match(chat, /b\.textContent = cleanName\(name\);/, 'الاسم والنص يُكتبان نصًّا لا HTML');
  assert.match(chat, /d\.append\(b, document\.createTextNode\(text\)\);/);
  assert.match(chat, /if \(t\.length >= 5\) \{ heard\.set\(id, t\); return false; \}/, 'ضيف يرسل وايد بسرعة ينقطع');
  assert.match(chat, /net\.say\(null, \{ t: 'chat', s: text, who: from, n: nameOf\(from\) \}\);/);
  assert.match(net, /net\.chat = createChat\(\{ play, net \}\);/);
  assert.match(net, /data-chat="1"/);
});

test('الغرف العامة في اللعبة: زر غرفة عامة وقائمة تطلب الدخول بدون كود', () => {
  const net = read('shared/net.js');
  assert.match(net, /call\(\{ op: 'open', world, pub: open \? 1 : 0, name: myName \}\)/);
  assert.match(net, /call\(\{ op: 'list', world \}\)/);
  assert.match(net, /data-host="2">افتح غرفة عامة/);
  assert.match(net, /else if \(t\.dataset\.pick\) join\(t\.dataset\.pick,/, 'الدخول من القائمة نفس الدخول بالكود: صاحب الغرفة يدخّل');
});

test('تحديات اليوم: ثلاثة مختلفة، نفسها للكل في اليوم نفسه، وتتغيّر مع الأيام', async () => {
  const { dailyFor, DAILY, DAILY_COUNT } = await esm('shared/daily.js');
  const a = dailyFor('2026-11-23'), b = dailyFor('2026-11-23');
  assert.equal(a.length, DAILY_COUNT);
  assert.equal(new Set(a.map((q) => q[0])).size, DAILY_COUNT, 'ما يتكرر تحدي في اليوم');
  assert.deepEqual(a.map((q) => q[0]), b.map((q) => q[0]));
  const days = new Set(Array.from({ length: 30 }, (_, i) => dailyFor('2026-12-' + (i + 1)).map((q) => q[0]).join()));
  assert.ok(days.size > 15, 'تتغيّر مع الأيام: ' + days.size + ' تشكيلة في 30 يوم');
  const st = { broken: 7, kills: { animal: 2 } };
  assert.equal(DAILY.find((q) => q[0] === 'break')[2](st), 7);
  assert.equal(DAILY.find((q) => q[0] === 'hunt')[2](st), 2);
  assert.equal(DAILY.find((q) => q[0] === 'trade')[2]({}), 0, 'عدّاد ما بدأ = صفر');
  const adv = read('shared/adventure.js');
  assert.match(adv, /if \(!daily\.base && played > 3\)/, 'بداية اليوم تنحسب بعد ما يرجع الحفظ، مو قبله');
  assert.match(adv, /play\.give\(kitItem\(K\.LUCKY, 1\)\)/, 'الثلاثة كلها = صندوق حظ');
});
