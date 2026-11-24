'use strict';
// v-talk-room: «غرفة الربع» — وسيط التعارف (طريقة غرف «عالم المكعبات»)، بمخزن في الذاكرة يقلّد أوامر Redis المستعملة.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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

test('بطاقة «غرفة الربع» بصورتين: الفاتحة في الوضع الفاتح والداكنة في الداكن، وتتبدّل مع تبديل الوضع', () => {
  const root = path.join(__dirname, '..'), js = fs.readFileSync(path.join(root, 'js/tool-card-images.js'), 'utf8');
  assert.match(js, /var THEMED = \{ btnTalkRoom: 1 \};/);
  assert.match(js, /getAttribute\('data-mode'\) === 'light'\) return '\/assets\/tool-cards\/s\/' \+ id \+ '-light\.jpg\?v=' \+ CLEAN_V/);
  assert.match(js, /attributeFilter:\['lang', 'data-mode'\]/, 'تبديل الوضع يعيد اختيار الصورة');
  for (const f of ['s/btnTalkRoom.jpg', 's/btnTalkRoom-light.jpg', 'clean/btnTalkRoom.jpg', 'clean/btnTalkRoom-light.jpg']) assert.ok(fs.existsSync(path.join(root, 'assets/tool-cards', f)), f);
});

test('الكاميرا: خطوط فيديو من البداية (كاميرا الضيف ↔ صاحب الغرفة + ضيفان عبره)، ووصف الاتّصال الأكبر يمرّ', async () => {
  const root = path.join(__dirname, '..'), html = fs.readFileSync(path.join(root, 'room.html'), 'utf8');
  assert.match(html, /gv\.push\(pc\.addTransceiver\('video', \{ direction: 'sendrecv' \}\)\); gv\.push\(pc\.addTransceiver\('video', \{ direction: 'recvonly' \}\)\); gv\.push\(pc\.addTransceiver\('video', \{ direction: 'recvonly' \}\)\);/);
  assert.match(html, /t\.sender\.replaceTrack\(o && o\.p\.cam && o\.p\.vtrack \? o\.p\.vtrack : null\)/, 'صاحب الغرفة يمرّر صورة الضيف للباقين');
  assert.match(html, /v\.muted = true;\s*\/\/ the sound comes on the voice line/, 'الصوت من خطّ الصوت وحده: لا صدى من الفيديو');
  const K = memoryKV(), { code } = (await act({ op: 'open' }, 'h', K, 'omran')).json;
  const big = 'v=0\r\n' + 'a=x\r\n'.repeat(5000);      // ~30 ألف حرف: وصف بخطوط فيديو
  assert.equal((await act({ op: 'join', code, name: 'n', offer: big }, 'g', K, null)).status, 200);
});

test('خوادم الترحيل (TURN): لغرفة قائمة فقط، والمفتاح في الخادم، والبيانات قصيرة العمر، وحدّ يوميّ، وبلا مفتاح STUN وحده', async () => {
  const { iceServers, STUN, TTL } = require('../api/_lib/turn-ice.js');
  const K = memoryKV();
  const saved = { id: process.env.CLOUDFLARE_TURN_KEY_ID, tok: process.env.CLOUDFLARE_TURN_API_TOKEN, cap: process.env.TURN_DAILY_CAP, fetch: global.fetch };
  try {
    delete process.env.CLOUDFLARE_TURN_KEY_ID; delete process.env.CLOUDFLARE_TURN_API_TOKEN;
    assert.deepEqual((await iceServers(K)).iceServers, STUN, 'بلا مفتاح: كما كان');
    process.env.CLOUDFLARE_TURN_KEY_ID = 'abcdef1234567890'; process.env.CLOUDFLARE_TURN_API_TOKEN = 'tok'; process.env.TURN_DAILY_CAP = '2';
    let asked = null;
    global.fetch = async (url, o) => { asked = { url, auth: o.headers.Authorization, body: JSON.parse(o.body) }; return { ok: true, json: async () => ({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u1', credential: 'c1' }] }) }; };
    const r = await iceServers(K);
    assert.equal(asked.url, 'https://rtc.live.cloudflare.com/v1/turn/keys/abcdef1234567890/credentials/generate-ice-servers');
    assert.equal(asked.auth, 'Bearer tok'); assert.equal(asked.body.ttl, TTL); assert.equal(TTL, 4 * 3600);
    const turn = r.iceServers.find((s) => s.username);
    assert.deepEqual(turn.urls, ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], 'المنفذ ٥٣ محجوب في المتصفّحات فيُسقط');
    assert.equal(turn.credential, 'c1');
    assert.ok(!JSON.stringify(r).includes('tok"'), 'رمز المفتاح لا يخرج');
    await iceServers(K);
    const third = await iceServers(K);
    assert.equal(third.capped, true, 'بعد الحدّ اليوميّ STUN وحده'); assert.deepEqual(third.iceServers, STUN);
    process.env.TURN_DAILY_CAP = '100';
    global.fetch = async () => { throw new Error('down'); };
    assert.deepEqual((await iceServers(memoryKV())).iceServers, STUN, 'Cloudflare ما ردّ: STUN بلا خطأ');
  } finally {
    for (const [k, v] of [['CLOUDFLARE_TURN_KEY_ID', saved.id], ['CLOUDFLARE_TURN_API_TOKEN', saved.tok], ['TURN_DAILY_CAP', saved.cap]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    global.fetch = saved.fetch;
  }
  // through the room server: a room that exists, or nothing
  const K2 = memoryKV(), fake = async () => ({ iceServers: [{ urls: 'turn:x', username: 'a', credential: 'b' }] });
  assert.equal((await act({ op: 'ice', code: '1234' }, 'g', K2, null, fake)).status, 404, 'بلا غرفة: لا بيانات ترحيل');
  const { code } = (await act({ op: 'open' }, 'h', K2, 'omran')).json;
  assert.deepEqual((await act({ op: 'ice', code }, 'g', K2, null, fake)).json, { iceServers: [{ urls: 'turn:x', username: 'a', credential: 'b' }] });
  const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
  assert.match(html, /if \(!\(iceFor === code && icePromise\)\) \{ ice\(code\)\.then\(function \(\) \{ admit\(id\); \}\); return; \}/, 'صاحب الغرفة يأخذ الخوادم قبل أوّل وصلة');
  assert.match(html, /if \(!\(iceFor === c && icePromise\)\) \{ ice\(c\)\.then\(function \(\) \{ join\(c, name\); \}\); return; \}/, 'والضيف كذلك');
});

// ---- v-talk-contacts
function contactsKV() {
  const K = memoryKV();
  K.kvGetJSON = async (k) => { const v = await K.kvGetRaw(k); return v ? JSON.parse(v) : null; };
  return K;
}
const PHONES = { '+971500000001': 'omran', '+971500000002': 'fatima' };
const fakes = (pushed) => ({
  phoneLink: { normalizePhone: require('../api/_lib/phone-link.js').normalizePhone, maskPhone: require('../api/_lib/phone-link.js').maskPhone, phoneOwner: async (p) => (PHONES[p] ? { key: PHONES[p], user: {} } : null) },
  auth: { getUser: async (u) => ({ phone: Object.keys(PHONES).find((p) => PHONES[p] === u) || null, displayName: u === 'omran' ? 'عمران' : u }) },
  push: async (K, user, payload) => { pushed.push({ user, payload }); return true; },
});

test('جهات الاتّصال: تحتاج حسابًا، والرقم يُنظَّف، و«على التطبيق» من رقم موثَّق، ورقمك ما ينضاف، والإضافة محدودة', async () => {
  const K = contactsKV(), pushed = [], o = fakes(pushed);
  assert.equal((await act({ op: 'contacts' }, 'ip', K, null, null, o)).status, 401);
  const a = await act({ op: 'contact-add', phone: '00971 50-000-0002', name: 'فاطمة<x>' }, 'ip', K, 'omran', null, o);
  assert.deepEqual(a.json, { ok: true, contact: { phone: '+971500000002', name: 'فاطمةx', onApp: true } });
  assert.equal((await act({ op: 'contact-add', phone: '+971 55 123 4567', name: 'علي' }, 'ip', K, 'omran', null, o)).json.contact.onApp, false);
  assert.equal((await act({ op: 'contact-add', phone: '123', name: 'x' }, 'ip', K, 'omran', null, o)).json.error, 'bad-phone');
  assert.equal((await act({ op: 'contact-add', phone: '+971500000001', name: 'أنا' }, 'ip', K, 'omran', null, o)).json.error, 'self');
  const l = (await act({ op: 'contacts' }, 'ip', K, 'omran', null, o)).json;
  assert.equal(l.me.phone, '+971•••••01', 'رقمك مخفيّ الوسط'); assert.equal(l.me.name, 'عمران', 'اسمه في الحساب يصير اسمه في الغرفة');
  assert.deepEqual(l.list.map((c) => [c.name, c.onApp]), [['علي', false], ['فاطمةx', true]]);
  assert.ok(!JSON.stringify(l).includes('fatima'), 'اسم حساب الآخر لا يُكشف');
  await act({ op: 'contact-del', phone: '+971551234567' }, 'ip', K, 'omran', null, o);
  assert.equal((await act({ op: 'contacts' }, 'ip', K, 'omran', null, o)).json.list.length, 1);
  let slow = 0;
  for (let i = 0; i < 45; i++) if ((await act({ op: 'contact-add', phone: '+9715600000' + String(i).padStart(2, '0'), name: 'n' }, 'ip', K, 'fatima', null, o)).status === 429) slow++;
  assert.ok(slow >= 5, 'الإضافة محدودة في اليوم (منع مسح الأرقام): ' + slow);
});

test('المكالمة: صاحب الغرفة يتّصل بجهة على التطبيق، يصلها إشعار ومكالمة واردة، وحين تدخل تمرّ بلا انتظار', async () => {
  const K = contactsKV(), pushed = [], o = fakes(pushed);
  await act({ op: 'contact-add', phone: '+971500000002', name: 'فاطمة' }, 'ip', K, 'omran', null, o);
  const { code, key } = (await act({ op: 'open' }, 'h', K, 'omran')).json;
  assert.equal((await act({ op: 'ring', code, key: 'x'.repeat(24), phone: '+971500000002' }, 'h', K, 'omran', null, o)).status, 403, 'غرفته وبسرّها');
  assert.equal((await act({ op: 'ring', code, key, phone: '+971550000009' }, 'h', K, 'omran', null, o)).json.error, 'not-contact', 'من في جهاته فقط');
  const r = await act({ op: 'ring', code, key, phone: '+971500000002' }, 'h', K, 'omran', null, o);
  assert.deepEqual(r.json, { ok: true, pushed: true });
  assert.equal(pushed[0].user, 'fatima'); assert.equal(pushed[0].payload.url, '/room?c=' + code + '&ring=1'); assert.match(pushed[0].payload.title, /عمران/);
  assert.deepEqual((await act({ op: 'rings' }, 'g', K, 'fatima', null, o)).json, { ring: { code, from: 'عمران' } });
  assert.deepEqual((await act({ op: 'rings' }, 'g', K, 'someone', null, o)).json, { ring: null });
  const SDPx = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n';
  await act({ op: 'join', code, name: 'فاطمة', offer: SDPx }, 'g', K, 'fatima');
  await act({ op: 'join', code, name: 'غريب', offer: SDPx }, 'g2', K, 'stranger');
  const p = (await act({ op: 'pending', code, key }, 'h', K, null)).json.joins;
  assert.deepEqual(p.map((j) => [j.name, !!j.inv]), [['فاطمة', true], ['غريب', false]], 'المدعوّة تُعلَّم، والباقون ينتظرون الموافقة');
  await act({ op: 'ring-end' }, 'g', K, 'fatima', null, o);
  assert.deepEqual((await act({ op: 'rings' }, 'g', K, 'fatima', null, o)).json, { ring: null });
});

test('عشرة في الغرفة: الحدّ ١٠، وطابور الطلبات يتّسع لهم، وصورة كلّ ضيف تُخفَّض كلّما زاد العدد', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
  assert.match(html, /MAX = 10, MAX_LINE = 300;/);
  assert.match(html, /var max = n <= 3 \? 450000 : n <= 6 \? 180000 : 110000/, 'رفع صاحب الغرفة يبقى صغيرًا مع تسعة ضيوف');
  assert.match(html, /var others = pickOthers\(g\.id, ids, camIsOn\)/, 'revideo يختار بالدور لا بترتيب واحد للكلّ');
  assert.match(html, /tile\('s' \+ i, cleanName\(sl\.name\), gstreams\[i\]\)/, 'مربّع الضيف مربوط بالخطّ لا بالشخص: تغيّر الدور لا يومض أسود');
  assert.ok(MAX_PENDING >= 9, 'تسعة يطلبون معًا بلا «زحمة»');
});

// استخراج دالّة من room.html لتشغيلها كما هي (طريقة tests/del-stick.test.cjs)
function fnSrc(src, head) {
  const a = src.indexOf(head);
  assert.ok(a >= 0, head);
  let d = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
  return src.slice(a, i + 1);
}
const roomHtml = () => fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');

test('الكاميرات بالدور: مع تسعة ضيوف كاميراتهم شغّالة كلّ كاميرا تصل ضيفين، لا يرى الكلّ أوّل اثنين دخلوا', () => {
  const ctx = {};
  vm.runInNewContext(fnSrc(roomHtml(), 'function pickOthers('), ctx);
  const ids = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9'];
  const seen = (isOn) => {
    const n = new Map(ids.map((id) => [id, 0])), picks = {};
    ids.forEach((g) => { const p = Array.from(ctx.pickOthers(g, ids, isOn)); picks[g] = p; p.forEach((x) => n.set(x, n.get(x) + 1)); });
    return { n, picks };
  };

  const all = seen(() => true);
  ids.forEach((g) => {
    assert.equal(all.picks[g].length, 2, g + ' يرى اثنين');
    assert.ok(!all.picks[g].includes(g), g + ' لا يرى نفسه');
    assert.equal(all.n.get(g), 2, 'كاميرا ' + g + ' تصل ضيفين بالضبط');
  });
  assert.deepEqual(all.picks.g9, ['g1', 'g2'], 'الدور يلفّ من الآخر إلى الأوّل');

  const on = new Set(['g3', 'g5', 'g7', 'g8']);
  const mixed = seen((id) => on.has(id));
  on.forEach((g) => assert.ok(mixed.n.get(g) >= 1, 'كاميرا ' + g + ' تصل ضيفًا واحدًا على الأقلّ'));
  ids.forEach((g) => mixed.picks[g].forEach((x) => assert.ok(on.has(x), g + ': الكاميرات الشغّالة أوّلًا ما دام فيها من يُرى')));

  assert.deepEqual(Array.from(ctx.pickOthers('g1', ['g1', 'g2'], () => false)), ['g2'], 'ضيفان: كلّ واحد يرى الثاني ولو كاميرته مطفأة (كما كان)');
});

// المتصفّحات الحديثة تفصل وصلة واحدة بـdisconnect(dest)؛ Safari قبل 14.1 (webkitAudioContext) ليس عنده إلّا disconnect(output)،
// فالوجهة تُقرأ رقم ٠ ويُفصل المصدر عن كلّ شيء بلا خطأ — الاختبار يمرّ على الاثنين
for (const engine of ['حديث', 'Safari قديم']) test('مزج الصوت عند صاحب الغرفة لا يتراكم ولا ينقطع (' + engine + '): بعد دخول تسعة وإطفاء المايك وخروج ضيف يبقى لكلّ ضيف مزج واحد كامل', () => {
  const oldSafari = engine !== 'حديث';
  const edges = new Set();
  let nodeN = 0;
  const node = (kind) => {
    const n = { id: kind + (++nodeN) };
    n.connect = (dest) => { edges.add(n.id + '>' + dest.id); };
    n.disconnect = (dest) => {
      if (!dest || oldSafari) { [...edges].forEach((e) => { if (e.startsWith(n.id + '>')) edges.delete(e); }); return; }
      if (!edges.delete(n.id + '>' + dest.id)) throw new Error('InvalidAccessError');      // كما في المتصفّح: فصل ما ليس موصولًا يرمي
    };
    return n;
  };
  // كلّ مزج قائم: المايك (إن كان) + كلّ الضيوف الآخرين — لا أقلّ (انقطاع) ولا مزوج زائدة (تسرّب)
  const full = (mic) => { ctx.outs.forEach((o, id) => assert.equal([...edges].filter((e) => e.endsWith('>' + o.dest.id)).length, (mic ? 1 : 0) + ctx.outs.size - 1, 'مزج ' + id + ' كامل')); };
  class FakeAC {
    constructor() { this.state = 'running'; }
    resume() { return Promise.resolve(); }
    createMediaStreamSource() { return node('src'); }
    createMediaStreamDestination() {
      const d = node('dest'), tr = { stop() { this.stopped = true; } };
      d.disconnect = () => {};      // بلا مخارج: الفصل منه لا يفعل شيئًا — هذا أصل التسرّب القديم
      d.stream = { getAudioTracks: () => [tr], getTracks: () => [tr] };
      return d;
    }
  }
  const html = roomHtml();
  const ctx = {
    role: 'host', peers: new Map(), heard: new Map(), outs: new Map(),
    micOn: true, mic: { getAudioTracks: () => [{}] }, actx: null, micNode: null,
    window: { AudioContext: FakeAC },
  };
  vm.runInNewContext(fnSrc(html, 'function unmix(') + '\n' + fnSrc(html, 'function remix('), ctx);
  const sender = () => ({ replaceTrack: () => Promise.resolve() });
  const destsWithInputs = () => new Set([...edges].map((e) => e.split('>')[1])).size;

  for (let k = 1; k <= 9; k++) {
    ctx.peers.set('g' + k, { tx: { sender: sender() } });
    ctx.heard.set('g' + k, { stream: {}, node: null });
    vm.runInNewContext('remix(); remix();', ctx);      // كما في admit: مرّة مع وصول الصوت ومرّة بعد الجواب
  }
  assert.equal(destsWithInputs(), 9, 'تسعة مزوج حيّة فقط (كانت عشرات)');
  assert.equal(edges.size, 9 * 9, 'كلّ مزج: المايك + الثمانية الآخرين');
  full(true);

  vm.runInNewContext('micOn = false; micNode = null; remix();', ctx);
  assert.equal(edges.size, 9 * 8, 'إطفاء المايك يفصله عن كلّ المزوج');
  full(false);

  ctx.peers.delete('g1'); ctx.heard.get('g1').node.disconnect(); ctx.heard.delete('g1');
  vm.runInNewContext("unmix('g1'); remix();", ctx);
  assert.equal(edges.size, 8 * 7, 'خروج ضيف: مزجه يُفكّ ولا يبقى منه شيء');
  assert.ok(!ctx.outs.has('g1'));
  full(false);

  for (let k = 2; k <= 8; k++) { ctx.peers.delete('g' + k); ctx.heard.get('g' + k).node.disconnect(); ctx.heard.delete('g' + k); }
  vm.runInNewContext('remix();', ctx);
  assert.equal(edges.size, 0, 'ضيف واحد باقٍ: يأخذ المايك مباشرة وكلّ المزوج تُفكّ');
  assert.equal(ctx.outs.size, 0);
});
