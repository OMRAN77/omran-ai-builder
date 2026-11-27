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

test('بطاقات الشخصيات ما تتأثر بقواعد العوالم: عالم «ظلام» عنده .look (تلميح النظر) بموضع مطلق، فالبطاقات كانت فوق بعض', () => {
  const bag = read('shared/bag.js');
  assert.match(bag, /#bag \.look \{ position: relative; right: auto; bottom: auto; text-shadow: none;/);
  assert.match(read('styles/dhalam/hud.css'), /^\.look \{ position: absolute;/m, 'السبب ما زال موجود هناك: لذلك البطاقة تحدّد موضعها بنفسها');
  const out = read('shared/outfits.js');
  for (const k of ['greenelf', 'wanderer']) assert.match(out, new RegExp("key: '" + k + "'"), k);
  assert.match(out, /'bow', 'compass'\]\.includes\(c\.holds\)/, 'البوصلة تمرّ للاعبين الثانيين في الغرفة');
  assert.match(read('shared/avatar.js'), /H\('compass'\)/);
});

test('الصفحة الأولى: «عالمك اللانهائي المتجدد» بأربع بطاقات نصًّا (لا صورة فيها كتابة ولا شخصيات من لعبة ثانية)', () => {
  const html = read('index.html');
  const g = /<section class="guide"[\s\S]*?<\/section>/.exec(html);
  assert.ok(g, 'القسم موجود');
  assert.equal((g[0].match(/<li>/g) || []).length, 4);
  for (const t of ['عالم لا ينتهي', 'تضاريس تتجدّد', 'استكشاف بلا حدود', 'كنوز ومفاجآت']) assert.ok(g[0].includes(t), t);
  assert.ok(!/<img/.test(g[0]), 'نص وأيقونات بس، بلا صورة');
  assert.ok(html.indexOf('class="guide"') > html.indexOf('class="cards"') && html.indexOf('class="guide"') < html.indexOf('class="who"'), 'تحت العوالم وفوق الشخصيات');
});

test('تبديل العالم: زرّان في الزاوية، ونافذة توقف اللعب وتعرض العوالم الأربعة الثانية بصورها', async () => {
  const { WORLDS } = await esm('shared/switcher.js');
  const html = read('index.html');
  const ready = JSON.parse(/const READY = (\[[^\]]*\])/.exec(html)[1]);
  assert.deepEqual(WORLDS.map((w) => w.key).sort(), [...ready].sort(), 'نفس عوالم الصفحة الأولى');
  for (const w of WORLDS) assert.ok(fs.existsSync(path.join(ROOT, 'previews', w.key + '.webp')), 'صورة ' + w.key);
  const sw = read('shared/switcher.js');
  for (const t of ['تبديل العالم', 'الإعدادات', 'الانتقال إلى عالم آخر', 'أنت الآن في:', 'انتقل الآن', 'استكمال اللعب', 'العودة للقائمة الرئيسية']) assert.ok(sw.includes(t), t);
  assert.match(sw, /WORLDS\.filter\(\(w\) => w\.key !== G\.key\)/, 'العالم الحالي ما يطلع بين البطاقات');
  assert.match(sw, /play\.stop\(\)/, 'النافذة توقف اللعب');
  assert.match(sw, /const ok = save\(\);[\s\S]*?location\.reload\(\)/, 'يحفظ قبل ما ينتقل');
  const play = read('shared/play.js');
  assert.match(play, /return \(window\.__GAME_PLAY = \{/, 'اللعبة توصل للمتحكّم');
  assert.match(play, /import\('\.\/switcher\.js'\)\.then/, 'الزاوية تنركّب لما العالم انفتح من الصفحة الأولى');
  assert.match(play, /btn\('switch', 'تبديل العالم'\)/, 'وفي قائمة الإيقاف بعد');
});

test('الغرف في العوالم اللانهائية: صاحب الغرفة يقبل حفر الضيف وبناه داخل حدود العالم (16384) لا 4096', () => {
  const net = read('shared/net.js');
  assert.ok(!/n < 4096/.test(net), 'الحدّ الثابت القديم راح');
  assert.match(net, /lim = \[W\.sx \|\| 16384, W\.sy \|\| 256, W\.sz \|\| 16384\]/);
});

test('بدون نت: اللعبة كلها محفوظة في الجهاز (sw.js محدّث بكل ملفات اللعبة)، والـapi ما ينحفظ', () => {
  const { build, list } = require('../tools/offline.cjs');
  assert.equal(read('sw.js'), build(), 'sw.js قديم: شغّل «node tools/offline.cjs»');
  const files = list().map((f) => f[0]);
  for (const f of ['', 'manifest.webmanifest', 'shared/play.js', 'shared/net.js', 'shared/localroom.js', 'vendor/three.module.js', 'vendor/qr/jsQR.js', 'vendor/qr/qrcode.module.js', 'styles/barari/index.html', 'styles/dino/main.js', 'previews/kawkab.webp'])
    assert.ok(files.includes(f), 'محفوظ: ' + (f || 'الصفحة الأولى'));
  assert.ok(!files.some((f) => /^(api|tests|tools|knowledge)\//.test(f)), 'ما ينحفظ إلا ملفات اللعبة');
  const sw = read('sw.js');
  assert.match(sw, /rel\.startsWith\('api\/'\)[^\n]*return;/, 'الغرف والحفظ السحابي يروحون للشبكة دايم');
  const html = read('index.html');
  assert.match(html, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
  assert.match(html, /اللعبة محفوظة في جهازك/);
  assert.match(read('vercel.json'), /camera=\(self\)/, 'الكاميرا مسموحة عشان تصوير كود الغرفة');
});

test('غرفة بدون نت: كود الاتصال يتغلّف ويرجع نفسه، والكود الغلط ينرفض', async () => {
  const { packCode, unpackCode, trimSdp } = await esm('shared/localroom.js');
  const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=candidate:1 1 udp 2113937151 0b5c9f1e-1111-2222-3333-444455556666.local 50000 typ host generation 0 network-cost 999\r\na=ice-ufrag:abcd\r\na=ice-pwd:0123456789abcdefghijklmn\r\na=fingerprint:sha-256 33:EC:75:CD:C4:F1:6D:14:CA:A7:E5:C4:57:EE:11:9E:6E:E2:CB:16:B6:FF:DC:DE:C3:00:DA:35:E4:52:82:90\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n';
  const t = trimSdp(sdp);
  assert.ok(!/extmap-allow-mixed|msid-semantic|generation|network-cost/.test(t) && /a=fingerprint/.test(t) && t.endsWith('\r\n'));
  const offer = await packCode('offer', { world: 'barari', name: 'مزون' }, sdp);
  assert.match(offer, /^BWO1\.barari\./);
  assert.ok(offer.length < 700, 'صغير يكفي لصورة QR تنقرا من شاشة جوال: ' + offer.length);
  const back = await unpackCode(offer);
  assert.deepEqual([back.kind, back.world, back.name, back.sdp], ['offer', 'barari', 'مزون', t]);
  const ans = await unpackCode(await packCode('answer', { id: 'l3' }, sdp));
  assert.deepEqual([ans.kind, ans.id], ['answer', 'l3']);
  for (const bad of ['', 'hello', 'BWO1.barari.x', 'BWA1.l1.zAAAA', 'BWO1.barari.' + 'eA.' + 'r' + Buffer.from('not sdp').toString('base64')]) assert.equal(await unpackCode(bad), null, bad);
  const net = read('shared/net.js');
  assert.match(net, /const RTC_LOCAL = \{ iceServers: \[\] \}/, 'بدون نت: ما يدوّر خادم STUN');
  assert.match(net, /if \(local\) p\.reply = await packCode\('answer'/, 'صاحب الغرفة يرد بكود يتصوّر، مو من الموقع');
  assert.match(net, /if \(!local\) call\(\{ op: 'close'/, 'سكّر الغرفة بدون نت ما يكلّم الموقع');
  assert.match(net, /if \(local\) askVoice\(\);/, 'الصوت: الضيف يطلب خط الصوت أول ما يدخل');
  assert.match(net, /m\.t === 'rtc' && m\.type === 'offer' && typeof m\.sdp === 'string' && local\) addVoice/, 'وصاحب الغرفة يرد عليه من نفس الخط، بدون كود ثاني');
  assert.ok(!/الصوت ما يشتغل في الغرفة بدون نت/.test(net), 'أزرار المايك موجودة في الغرفة بدون نت');
});

test('عناصر العوالم الخمسة كما طلبها المالك: الفانوس، الطوطم الخشبي، الجاذبية، القافلة، تدفئة العش', () => {
  const kit = read('shared/kit.js'), craft = read('shared/craft.js');
  assert.match(kit, /\['lantern', 'فانوس مضيء', '#ffcf6a'\]\]/, 'الفانوس المضيء ليت (130+4=134)، فيضوّي جسور الظلام في اليد');
  assert.match(craft, /\{ out: 134, n: 1, needs: \[\[K\.TORCH, 1\], \[K\.GLASS, 1\]\] \}/, 'يتصنع من مشعل وزجاج');
  assert.match(craft, /\{ out: 55, n: 1, needs: \[\['wood', 3\]\], world: 'barari' \}/, 'الطوطم الخشبي يتصنع في البراري');
  assert.ok(craft.indexOf('out: 134') > craft.indexOf('K.CAR_SPORT'), 'الوصفات الجديدة في آخر القائمة (الفحص يصنع الصندوق برقمه)');
  assert.match(craft, /const outItem = \(r\) => \{ const it = kitItem\(r\.out, r\.n\) \|\| \(play\.itemOf \? play\.itemOf\(r\.out\) : null\)/, 'وصفة تطلع مكعب من مكعبات العالم نفسه (مو من الكت) ما تكسر صفحة التصنيع');
  assert.equal((craft.match(/RECIPES\.filter/g) || []).length, 1, 'القائمة والصنع من نفس الفلتر، فالأرقام ما تختلف');
  assert.match(read('styles/barari/blocks.js'), /\[B\.TOTEM_TOP\]: 'طوطم خشبي'/);
  assert.match(read('styles/barari/ideas.js'), /if \(id === B\.TOTEM_TOP\) addTotem\(x, y, z\);/, 'وضعه وحده يكفي: الحيوانات تتجمّع حوله');
  assert.match(read('styles/dhalam/mysteries.js'), /KIT_BLOCKS\[q\.id\]\.light/, 'أي ليت في اليد (ومنها الفانوس) يضوّي الجسر');
  assert.match(read('styles/kawkab/wonders.js'), /under === B\.GRAV && st\.onGround/, 'مكعب الجاذبية البنفسجي يرمي اللاعب فوق');
  const waha = read('styles/waha/wonders.js');
  assert.match(waha, /const trail = \[0, 1\]\.map/, 'قافلة: جملين ورا الأول');
  assert.match(waha, /new THREE\.BoxGeometry\(e, e, e\)/, 'الجمال مكعبات');
  assert.match(waha, /for \(const k of \['x', 'y', 'z', 'yaw'\]\)/, 'اللي توصله يتبدّل مكان الأول ويصير هو اللي يصاحبك');
  const dino = read('styles/dino/ideas.js');
  assert.match(dino, /const WARM = new Set\(\[B\.LAVA, B\.BASALT, B\.ASH, K\.FIRE, K\.FURNACE, K\.TORCH\]\);/);
  assert.match(dino, /if \(WARM\.has\(id\)\) \{/, 'مكعب دافي جنب العش يدفّيه');
  assert.match(read('styles/dino/gen.js'), /id === B\.ASH && r > 0\.995\) put = B\.NEST/, 'أعشاش قرب البراكين بعد');
});

test('تخصيص أماكن الأزرار من الإعدادات: تحريك وحجم وشفافية لكل زر ولوحة، ينحفظ لكل عالم وجهاز', () => {
  const lay = read('shared/layout.js'), play = read('shared/play.js');
  for (const t of ['تخصيص أماكن الأزرار', 'الحجم', 'الشفافية', 'حفظ واستخدام', 'خروج', 'إعادة ضبط']) assert.ok(lay.includes(t), t);
  assert.match(play, /btn\('layout', 'تخصيص أماكن الأزرار'\)/, 'الزر في الإعدادات');
  assert.match(play, /import\('\.\/layout\.js'\)\.then/, 'ينركّب في كل العوالم');
  assert.ok(!/أزرار اللمس ثابتة في مكانها/.test(play), 'الملاحظة القديمة راحت');
  assert.match(lay, /el\.style\.translate = /, 'يتحرك بـtranslate (ما يخرب تمركز العناصر)');
  assert.match(lay, /el\.style\.scale = /);
  assert.match(lay, /const KEY = 'bw-layout:' \+ String\(name \|\| 'world'\) \+ ':' \+ \(touch \? 't' : 'd'\);/, 'لكل عالم ولكل نوع شاشة');
  for (const a of ['stick', 'jump', 'dig', 'place', 'bag', 'pause', 'down']) assert.ok(lay.includes(`'${a}'`), a);
  assert.match(read('shared/switcher.js'), /const editing = !!\(window\.__GAME_LAYOUT && window\.__GAME_LAYOUT\.shown\)/, 'زرّا الزاوية يبانون وقت التخصيص عشان يتحركون بعد');
});

test('سفينة الجزر: سفينة على رصيف عند بداية كل عالم، وخريطة الجزر الخمس، وتبحر للجزيرة اللي تختارها', async () => {
  const v = read('shared/voyage.js');      // (it imports three, so it is read as text, not run)
  const keys = [...v.slice(v.indexOf('export const ISLANDS'), v.indexOf('];', v.indexOf('export const ISLANDS'))).matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);
  const ready = JSON.parse(/const READY = (\[[^\]]*\])/.exec(read('index.html'))[1]);
  assert.deepEqual(keys.sort(), [...ready].sort(), 'الجزر الخمس نفس العوالم');
  for (const t of ['خريطة الجزر الخمس', 'سفينة الجزر', 'أبحر إلى ', 'نبحر إلى ', 'أنت هني']) assert.ok(v.includes(t), t);
  assert.match(v, /const r = sw\.goTo\(pick\)/, 'تبحر بنفس طريق «تبديل العالم» (يحفظ عالمك قبل)');
  assert.match(v, /if \(net && net\.role\)/, 'في غرفة مع الربع: يطلع منها أول');
  assert.match(v, /if \(bad <= 8 && score < best\)/, 'تلقى مكان حتى في قاعدة مزحومة');
  assert.match(read('shared/adventure.js'), /import\('\.\/voyage\.js'\)\.then\(\(m\) => m\.createVoyage\(\{ play, kit, spawn, groundAt, avoid: tPos \}\)\)/, 'في كل العوالم، جنب التاجر');
  assert.match(read('shared/switcher.js'), /const api = \{ open, close, goTo,/);
});

test('شاشة النوم: قمر و«جاري النوم… حتى الصباح» وعدّاد ثواني و«استيقظ الآن»', () => {
  const a = read('shared/adventure.js');
  for (const t of ['جاري النوم… حتى الصباح', 'جاري الراحة… حتى الليل', 'استيقظ الآن', ' ثانية']) assert.ok(a.includes(t), t);
  assert.match(a, /const SLEEP_S = 10;/);
  assert.match(a, /return rest\(false\);/, 'السرير في الليل');
  assert.match(a, /return rest\(true\);/, 'السرير في النهار');
  assert.match(a, /play\.setModal\(true\);/, 'اللعبة ما تاخذ أزرار وقت النوم');
  assert.match(a, /#bwSleep \{ position: fixed; inset: 0; z-index: 62;/, 'فوق كل شي');
  assert.match(a, /let letGo = !!document\.pointerLockElement;/, 'القيام ينتظر المتصفح يفكّ الماوس (وإلا تنفتح قائمة الإيقاف بالغلط)');
});
