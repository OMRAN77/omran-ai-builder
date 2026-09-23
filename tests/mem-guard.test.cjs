'use strict';
/* v-mem-guard (لقطات المالك ٢٣ سبتمبر: «خربت الدنيا — ولا شي يفتح»: الكتابة خطوط تشويش، صفوف سوداء، الشعار تشويش).
   الجذر: v-vault-restore يستعيد كلّ صور المحادثة المفتوحة بحجمها الكامل، والحفظ (كلّ ١٫٥ث) يبني نصّ المشروع بصوره لحارس
   الحجم، والمرآة/المزامنة (كلّ ١٠ث) تنسخ كلّ رسالة بصورها. مسبار Playwright (٤٠ صورة ≈٤ م.ب): الذاكرة ٨٢٩ م.ب، حارس الحفظ
   نصّ ٣٣٣ مليون حرف في ٣٫٨ث، والمرآة ٤ث وتُكتب فارغة (سقف ٢ م.ب يُسقط كلّ المحادثات). بعده: ٩٤ م.ب، ٠ م.ث، والمرآة كاملة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync('js/app-04-i18n-state.js', 'utf8');
const slice = (from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i); assert.ok(i >= 0 && j > i, from); return src.slice(i, j); };
const big = (c) => 'data:image/png;base64,' + c.repeat(200000);
const thumb = 'data:image/jpeg;base64,' + 'T'.repeat(30000);

/* reads يسجّل كلّ قراءة من المخزن (معرّفًا معرّفًا) — والقراءة غير متزامنة كالحقيقيّة فتتداخل الاستعادات */
const vaultLib = (vault, reads = []) => new Function('vault', 'state', 'reads',
  'const __swallow = () => {};' +
  slice('const VAULT_MIN = 150000;', 'function idbImgPutAll(puts){') +
  'function idbImgGetMany(ids){ ids.forEach(id => reads.push(id)); const o = {}; ids.forEach(id => { if(vault[id]) o[id] = vault[id]; }); return new Promise(r => setTimeout(() => r(o), 5)); }' +
  'function idbImgGet(id){ reads.push(id); return new Promise(r => setTimeout(() => r(vault[id]), 5)); }' +
  slice('function __vaultRead(a){', 'function idbImgSweep(liveIds){') +
  slice('async function hydrateProjectImages(p, fromIdx){', 'window.__hydrateProjectImages') +
  slice('function __vaultJsonSize(){', '// ⚡ v320') +
  '; return { hydrateProjectImages, __imgWindowStart, __vaultJsonSize, __IMG_WINDOW, __vaultRead, __vaultRelease };');

test('١. الاستعادة لنافذة العرض وحدها (آخر ٣٠ رسالة)، وكلّها حين يطلب «عرض الأقدم»', async () => {
  const vault = {}; const msgs = [];
  for (let i = 0; i < 40; i++) { vault['v' + i] = big('A'); msgs.push({ role: 'assistant', attachments: [{ isImage: true, vaultId: 'v' + i, dataUrl: '[media]' }], apiImages: [{ vaultId: 'v' + i, dataUrl: '[media]' }] }); }
  const p = { id: 'p', messages: msgs };
  const L = vaultLib(vault)(vault, { projects: [p] }, []);
  assert.equal(L.__IMG_WINDOW, 30);
  assert.equal(L.__imgWindowStart(p), 10);
  await L.hydrateProjectImages(p);
  const restored = msgs.map((m, i) => (m.attachments[0].dataUrl.length > 150000 ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual([restored.length, restored[0]], [30, 10], 'آخر ٣٠ رسالة فقط');
  assert.equal(msgs[9].attachments[0].dataUrl, '[media]', 'الأقدم تبقى بديلها حتّى تُعرض');
  assert.equal(msgs[39].apiImages[0].dataUrl.length > 150000, true, 'نسخة المحرّر في النافذة تعود');
  p.__showAllMsgs = true;
  await L.hydrateProjectImages(p);
  assert.equal(msgs[0].attachments[0].dataUrl.length > 150000, true, '«عرض الأقدم» = الكلّ');
  assert.match(src, /const __MSGWIN = __IMG_WINDOW;/, 'renderMessages يرسم النافذة نفسها');
});

test('٢. حارس حجم الحفظ لا يبني نصّ الصور: يقيس ما يُكتب فعلًا (صور المخزن معرّفات)', () => {
  const p = { id: 'p', messages: [{ role: 'assistant', attachments: [{ isImage: true, vaultId: 'v1', dataUrl: big('B') }] }, { role: 'user', content: 'مرحبا' }] };
  const L = vaultLib({})({}, { projects: [p] }, []);
  assert.ok(L.__vaultJsonSize() < 1000, 'بلا base64 المخزون');
  assert.match(src, /const __sz = __vaultJsonSize\(\);/);
  assert.ok(!/const __sz = __projectsToJson\(\)\.length;/.test(src), 'لم يعد يبني نصّ المشروع بصوره في كلّ حفظ');
});

test('٣. نسخة المرآة/المزامنة تُبنى بلا صور كبيرة: المصغّرة للصورة، «[media]» لما فوق 150KB (ومنها apiImages)، والصغيرة كما هي', () => {
  const __msgForServer = new Function(slice('function __msgForServer(m){', 'function chatsSlimForServer(){') + '; return __msgForServer;')();
  const m = { role: 'assistant', content: 'x', attachments: [{ isImage: true, dataUrl: big('C'), serverThumb: thumb }, { isImage: true, dataUrl: big('D') }, { isImage: true, dataUrl: thumb }], apiImages: [{ dataUrl: big('E'), mime: 'image/png' }] };
  const o = __msgForServer(m);
  assert.equal(o.attachments[0].dataUrl, thumb); assert.equal(o.attachments[0].serverThumb, undefined);
  assert.equal(o.attachments[1].dataUrl, '[media]');
  assert.equal(o.attachments[2].dataUrl, thumb, 'الصغيرة تبقى');
  assert.equal(o.apiImages[0].dataUrl, '[media]', 'apiImages كانت تُنسخ كاملة فتتجاوز سقف ٢ م.ب وتُسقط كلّ المحادثات');
  assert.equal(m.attachments[0].dataUrl.length > 150000 && !!m.attachments[0].serverThumb, true, 'الأصل لم يُمسّ');
  assert.ok(!/var o = JSON\.parse\(JSON\.stringify\(m\)\);/.test(src), 'لا نسخة كاملة بصورها');
});

/* v-mem-guard2 (فيديو المالك بعد #739 «بعدها تشوش»: النصّ سليم لكنّ الشعار تشويش وصفوف الإعدادات لا تُرسم — حتّى في محادثة
   جديدة فارغة): صور المحادثة التي غادرها بقيت بحجمها الكامل في الذاكرة، وفتح المحادثة كان يقرأ كلّ صورة ≈٤٫٥ مرّات بالتوازي. */
const imgMsg = (id, du) => ({ role: 'assistant', attachments: [{ isImage: true, vaultId: id, dataUrl: du }] });

test('٤. مغادرة محادثة الصور تعيد صورها لمعرّفها (الأصل في المخزن)، والعودة تستعيدها — المعلّقة والصغيرة لا تُمسّ', async () => {
  const vault = { a1: big('A'), a2: big('B'), b1: big('C') };
  const A = { id: 'A', messages: [imgMsg('a1', '[media]'), imgMsg('a2', '[media]')] };
  A.messages.push({ role: 'user', attachments: [{ isImage: true, vaultId: 'a3', vaultPending: true, dataUrl: big('P') }, { isImage: true, dataUrl: thumb }] });
  const B = { id: 'B', messages: [imgMsg('b1', '')] };
  const L = vaultLib(vault)(vault, { projects: [A, B] }, []);
  await L.hydrateProjectImages(A);
  assert.equal(A.messages[0].attachments[0].dataUrl, vault.a1, 'فتح A يستعيد صوره');
  await L.hydrateProjectImages(B);
  assert.equal(B.messages[0].attachments[0].dataUrl, vault.b1, 'فتح B يستعيد صوره');
  assert.deepEqual(A.messages.slice(0, 2).map(m => m.attachments[0].dataUrl), ['', ''], 'صور A خرجت من الذاكرة وأنت في B');
  assert.equal(A.messages[0].attachments[0].vaultId, 'a1', 'والمعرّف باقٍ فلا يكنسها المخزن');
  assert.equal(A.messages[2].attachments[0].dataUrl.length > 150000, true, 'المعلّقة (لم تُكتب في المخزن بعد) لا تُمسّ');
  assert.equal(A.messages[2].attachments[1].dataUrl, thumb, 'الصغيرة بلا معرّف لا تُمسّ');
  await L.hydrateProjectImages({ id: 'new', messages: [] });
  assert.equal(B.messages[0].attachments[0].dataUrl, '', 'محادثة جديدة فارغة = لا صورة كبيرة في الذاكرة');
  await L.hydrateProjectImages(A);
  assert.equal(A.messages[1].attachments[0].dataUrl, vault.a2, 'العودة إلى A تعيدها من المخزن');
});

test('٥. ما يخرج من نافذة المحادثة المفتوحة يعود لمعرّفه، وتُقرأ منه حين تُعرض', async () => {
  const vault = {}; const msgs = [];
  for (let i = 0; i < 31; i++) { vault['v' + i] = big('Q'); msgs.push(imgMsg('v' + i, '')); }
  const p = { id: 'p', messages: msgs };
  const L = vaultLib(vault)(vault, { projects: [p] }, []);
  await L.hydrateProjectImages(p, 0);
  assert.equal(msgs[0].attachments[0].dataUrl.length > 150000, true);
  await L.hydrateProjectImages(p);
  assert.equal(msgs[0].attachments[0].dataUrl, '', 'الأولى خرجت من نافذة آخر ٣٠');
  assert.equal(msgs[1].attachments[0].dataUrl.length > 150000, true, 'ما في النافذة يبقى');
  assert.equal(await L.__vaultRead(msgs[0].attachments[0]), vault.v0, 'وتُقرأ من المخزن حين تُعرض');
});

test('٦. كلّ صورة تُقرأ من المخزن مرّة واحدة مهما تكرّر الرسم أثناء القراءة', async () => {
  const vault = {}; const msgs = []; const reads = [];
  for (let i = 0; i < 6; i++) { vault['v' + i] = big('R'); msgs.push(imgMsg('v' + i, '[media]')); }
  const p = { id: 'p', messages: msgs };
  const L = vaultLib(vault)(vault, { projects: [p] }, reads);
  const runs = [L.hydrateProjectImages(p), L.hydrateProjectImages(p), L.hydrateProjectImages(p)];
  const draws = msgs.map(m => L.__vaultRead(m.attachments[0])); // مسار الرسم أثناء الاستعادة
  const got = await Promise.all(draws); await Promise.all(runs);
  assert.equal(reads.length, 6, 'ستّ صور = ستّ قراءات (كانت ≈٤٫٥ لكلّ صورة)');
  assert.ok(got.every((d, i) => d === vault['v' + i]), 'الرسم ينتظر القراءة نفسها ويأخذ الأصل');
  assert.equal(L.__vaultRelease(p, 99), 6, 'انتهت القراءة فلا قفل باقٍ يمنع الإفراج');
  assert.equal(await L.__vaultRead(msgs[0].attachments[0]), vault.v0);
  assert.equal(reads.length, 7, 'وبعد الإفراج تذهب القراءة للمخزن من جديد — لا نسخة مخبّأة في الذاكرة');
});

test('٧. الرسم يقرأ عبر القارئ المشترك ويُلحق أدوات المشاركة حين يصل الأصل، والتراجع يقرأ الصورة المختارة من المخزن', () => {
  assert.match(src, /if\(p\) __vaultRelease\(p, start\);/, 'كلّ فتح/رسم يحرّر ما خارج النافذة');
  /* v-mem-guard3: كلّ صورة تُعيَّن في مهمّتها (setTimeout) لا كلّها في مهمّة الدفعة الواحدة، والمنفصلة عن الصفحة (رسم أحدث) تُتخطّى */
  assert.match(src, /__vaultRead\(a\)\.then\(d => \{ if\(typeof d === 'string' && d\.length > VAULT_MIN\) setTimeout\(\(\) => \{ if\(!img\.isConnected\) return; img\.src = d; if\(__ibox && window\.__omranImgTools\)/);
  assert.ok(!/idbImgGet\(a\.vaultId\)\.then\(d => \{ if\(typeof d === 'string' && d\)\{ a\.dataUrl = d; delete a\.purged; img\.src = d;/.test(src), 'لا قراءة ثانية مستقلّة في مسار الرسم');
  const att = fs.readFileSync('js/app-09-attach.js', 'utf8');
  assert.match(att, /a\.isImage && \(\/\^data:image\\\/\/\.test\(a\.dataUrl \|\| ''\) \|\| \(a\.vaultId && !a\.purged\)\)\) __chain\.push\(a\)/, 'سلسلة التراجع تشمل المخزونة');
  assert.match(att, /await __vaultRead\(__pick\)/, 'وتقرأ المختارة من المخزن');
});
