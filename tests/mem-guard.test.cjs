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

/* reads يسجّل كلّ قراءة من المخزن (معرّفًا معرّفًا) — والقراءة غير متزامنة كالحقيقيّة فتتداخل الاستعادات.
   w نافذة وهميّة (المرآة المنحّفة __usingSlimProjects)، وmk يسجّل صنع نسخ العرض (بلا canvas في node) وتداخلها. */
const vaultLib = (vault, reads = [], w = {}, mk = { calls: 0, live: 0, maxLive: 0 }) => new Function('vault', 'state', 'reads', 'window', 'mk',
  'const __swallow = () => {};' +
  slice('const VAULT_MIN = 150000;', 'function idbImgPutAll(puts){') +
  'function idbImgPutAll(puts){ puts.forEach(x => { vault[x.id] = x.dataUrl; }); return Promise.resolve(); }' +
  'function idbImgGetMany(ids){ ids.forEach(id => reads.push(id)); const o = {}; ids.forEach(id => { if(vault[id]) o[id] = vault[id]; }); return new Promise(r => setTimeout(() => r(o), 5)); }' +
  'function idbImgGet(id){ reads.push(id); return new Promise(r => setTimeout(() => r(vault[id]), 5)); }' +
  'let idbSetCalls = []; function idbSet(k, v){ idbSetCalls.push([k, v]); return Promise.resolve(); }' +
  'function getCurrent(){ return (state.projects || []).find(p => p.id === state.currentId) || null; }' +
  slice('function __vaultRead(a){', 'function idbImgSweep(liveIds){') +
  'function __makeView(src){ mk.calls++; mk.live++; mk.maxLive = Math.max(mk.maxLive, mk.live); return new Promise(r => setTimeout(() => { mk.live--; r("data:image/jpeg;base64,VIEW" + src.length); }, 8)); }' +
  slice('async function __vaultSave(){', '/* الاستعادة: صور مشروع') +
  slice('async function hydrateProjectImages(p, fromIdx){', 'window.__hydrateProjectImages') +
  slice('function __vaultJsonSize(){', 'function saveStateLocal(){') +
  '; return { hydrateProjectImages, __imgWindowStart, __vaultJsonSize, __IMG_WINDOW, __vaultRead, __vaultRelease, __imgView, __vaultSave, __vaultReplacer, __projectsToJson, __vaultProjBlobs, __collectVaultIds, idbSetCalls: () => idbSetCalls };');

test('١. الاستعادة لنافذة العرض وحدها (آخر ٣٠ رسالة)، وكلّها حين يطلب «عرض الأقدم»', async () => {
  const vault = {}; const msgs = [];
  for (let i = 0; i < 40; i++) { vault['v' + i] = big('A'); msgs.push({ role: 'assistant', attachments: [{ isImage: true, vaultId: 'v' + i, dataUrl: '[media]' }], apiImages: [{ vaultId: 'v' + i, dataUrl: '[media]' }] }); }
  const p = { id: 'p', messages: msgs };
  const L = vaultLib(vault)(vault, { projects: [p] }, [], {}, { calls: 0, live: 0, maxLive: 0 });
  assert.equal(L.__IMG_WINDOW, 30);
  assert.equal(L.__imgWindowStart(p), 10);
  await L.hydrateProjectImages(p);
  const restored = msgs.map((m, i) => (m.attachments[0].dataUrl.length > 150000 ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual([restored.length, restored[0]], [30, 10], 'آخر ٣٠ رسالة فقط');
  assert.equal(msgs[9].attachments[0].dataUrl, '[media]', 'الأقدم تبقى بديلها حتّى تُعرض');
  assert.equal(msgs[39].apiImages[0].dataUrl, '[media]', 'v-img-view: apiImages لا يقرؤها شيء بعد تخزينها فلا تُستعاد (كانت تضاعف الذاكرة)');
  p.__showAllMsgs = true;
  await L.hydrateProjectImages(p);
  assert.equal(msgs[0].attachments[0].dataUrl.length > 150000, true, '«عرض الأقدم» = الكلّ');
  assert.match(src, /const __MSGWIN = __IMG_WINDOW;/, 'renderMessages يرسم النافذة نفسها');
});

test('٢. حارس حجم الحفظ لا يبني نصّ الصور: يقيس ما يُكتب فعلًا (صور المخزن معرّفات)', () => {
  const p = { id: 'p', messages: [{ role: 'assistant', attachments: [{ isImage: true, vaultId: 'v1', dataUrl: big('B') }] }, { role: 'user', content: 'مرحبا' }] };
  const L = vaultLib({})({}, { projects: [p] }, [], {}, { calls: 0, live: 0, maxLive: 0 });
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
  const L = vaultLib(vault)(vault, { projects: [A, B] }, [], {}, { calls: 0, live: 0, maxLive: 0 });
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
  const L = vaultLib(vault)(vault, { projects: [p] }, [], {}, { calls: 0, live: 0, maxLive: 0 });
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
  const L = vaultLib(vault)(vault, { projects: [p] }, reads, {}, { calls: 0, live: 0, maxLive: 0 });
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
  /* v-img-view: الأصل لا يُرسم — الأدوات وحدها تنتظره، كلّ واحدة في مهمّتها، والمنفصلة عن الصفحة تُتخطّى */
  assert.match(src, /__vaultRead\(a\)\.then\(d => \{ if\(__isBigDataImg\(d\)\) setTimeout\(\(\) => \{ if\(img\.isConnected && __ibox && window\.__omranImgTools\) window\.__omranImgTools\(__ibox, d, a\); \}, 0\);/);
  assert.ok(!/img\.src = d;/.test(src), 'لا يُعيَّن الأصل المقروء من المخزن للصورة المرسومة');
  const att = fs.readFileSync('js/app-09-attach.js', 'utf8');
  assert.match(att, /a\.isImage && \(\/\^data:image\\\/\/\.test\(a\.dataUrl \|\| ''\) \|\| \(a\.vaultId && !a\.purged\)\)\) __chain\.push\(a\)/, 'سلسلة التراجع تشمل المخزونة');
  assert.match(att, /await __vaultRead\(__pick\)/, 'وتقرأ المختارة من المخزن');
});

/* v-img-view (فيديو المالك بعد #740: الشعار وصور بطاقات الأدوات تشويش ومربّعات سوداء): الصور تُرسم بنسخة عرض 1280px
   تُصنع مرّة وتُحفظ في المخزن بمفتاح «معرّف~v»، والأصل للمشاركة والحفظ والعرض الكامل والتعديل. */
test('٨. نسخة العرض: تُصنع مرّة من الأصل وتُحفظ «معرّف~v»، ثمّ تُقرأ وحدها بلا الأصل بعد الإفراج', async () => {
  const vault = { a1: big('A') }; const reads = []; const mk = { calls: 0, live: 0, maxLive: 0 };
  const a = { isImage: true, vaultId: 'a1', dataUrl: '' };
  const p = { id: 'p', messages: [{ role: 'assistant', attachments: [a] }] };
  const L = vaultLib(vault)(vault, { projects: [p] }, reads, {}, mk);
  const v = await L.__imgView(a);
  assert.equal(v, 'data:image/jpeg;base64,VIEW' + vault.a1.length, 'صُنعت من الأصل المخزون');
  assert.equal(vault['a1~v'], v, 'وحُفظت في المخزن بمفتاحها');
  assert.equal(a.viewUrl, v); assert.equal(mk.calls, 1);
  assert.equal(await L.__imgView(a), v); assert.equal(mk.calls, 1, 'لا صنع ثانٍ');
  L.__vaultRelease(null, 0);
  assert.equal(a.viewUrl, undefined, 'الإفراج يشمل نسخة العرض'); assert.equal(a.dataUrl, '', 'والأصل');
  reads.length = 0;
  assert.equal(await L.__imgView(a), v, 'العودة تقرأ النسخة');
  assert.deepEqual(reads, ['a1~v'], 'النسخة وحدها — الأصل لا يُقرأ للعرض');
  assert.equal(a.dataUrl, '', 'والأصل لا يعود للذاكرة بسبب العرض');
});

test('٩. الصنع صورةً صورةً (طابور) مهما تزامن الرسم، ولكلّ صورة وعد واحد', async () => {
  const vault = {}; const mk = { calls: 0, live: 0, maxLive: 0 }; const atts = [];
  for (let i = 0; i < 5; i++) { vault['v' + i] = big('S'); atts.push({ isImage: true, vaultId: 'v' + i, dataUrl: '' }); }
  const p = { id: 'p', messages: atts.map(a => ({ role: 'assistant', attachments: [a] })) };
  const L = vaultLib(vault)(vault, { projects: [p] }, [], {}, mk);
  const out = await Promise.all(atts.concat(atts).map(a => L.__imgView(a)));
  assert.equal(mk.calls, 5, 'كلّ صورة تُصنع مرّة واحدة وإن طُلبت مرّتين');
  assert.equal(mk.maxLive, 1, 'لا يُفكّ أصلان معًا');
  assert.ok(out.every(Boolean));
});

test('١٠. صورة جديدة (معلّقة): نسختها في الذاكرة ثمّ تُكتب مع أصلها عند الحفظ؛ والسجلّ والمرآة بلا نسخة العرض', async () => {
  const vault = {}; const mk = { calls: 0, live: 0, maxLive: 0 };
  const a = { isImage: true, dataUrl: big('N') };
  const p = { id: 'p', messages: [{ role: 'assistant', attachments: [a] }] };
  const st = { projects: [p], currentId: 'p' };
  const L = vaultLib(vault)(vault, st, [], {}, mk);
  const v = await L.__imgView(a);
  assert.equal(a.viewUrl, v); assert.equal(Object.keys(vault).length, 0, 'بلا معرّف لا يُكتب شيء بعد');
  await L.__vaultSave();
  assert.ok(a.vaultId && vault[a.vaultId] === a.dataUrl && vault[a.vaultId + '~v'] === v, 'الحفظ يكتب الأصل ونسخته');
  const saved = JSON.stringify(L.idbSetCalls()[0][1]);
  assert.ok(!saved.includes('VIEW') && !saved.includes('viewUrl'), 'السجلّ بلا نسخة العرض');
  assert.ok(!L.__projectsToJson().includes('viewUrl'), 'ولا الحفظ الاحتياطيّ في localStorage');
  const __msgForServer = new Function(slice('function __msgForServer(m){', 'function chatsSlimForServer(){') + '; return __msgForServer;')();
  assert.ok(!JSON.stringify(__msgForServer(p.messages[0])).includes('viewUrl'), 'ولا المرآة/المزامنة');
  assert.match(src, /if\(!liveIds\.has\(String\(k\)\.replace\(\/~v\$\/, ''\)\)\) st\.delete\(k\);/, 'الكنس يُبقي النسخة ما بقي أصلها');
});

test('١١. المرآة المنحّفة عند الإقلاع لا تُقرأ أصولها ولا تُصنع منها نسخ، والرسم بالكاملة لا يتخطّاه تطابق البصمة', async () => {
  const vault = { s1: big('M') }; const reads = []; const mk = { calls: 0, live: 0, maxLive: 0 };
  const a = { isImage: true, vaultId: 's1', dataUrl: '[media]' };
  const p = { id: 'p', messages: [{ role: 'assistant', attachments: [a] }] };
  const L = vaultLib(vault)(vault, { projects: [p] }, reads, { __usingSlimProjects: true }, mk);
  assert.equal(await L.hydrateProjectImages(p), 0);
  assert.equal(await L.__imgView(a), '', 'بلا نسخة محفوظة: تنتظر الكاملة');
  assert.deepEqual([reads, mk.calls], [['s1~v'], 0], 'قراءة النسخة الصغيرة فقط — لا أصل');
  const att = fs.readFileSync('js/app-09-attach.js', 'utf8');
  assert.match(att, /window\.__usingSlimProjects = false;[\s\S]{0,700}window\.__renderMsgSig = '';\s*renderAll\(\);/);
});

test('١٢. الرسم: نسخة العرض أوّلًا، والأصل يظهر فورًا فقط لصورة جديدة لم تُخزَّن، والمخفيّة بعد خطأ تعود ظاهرة', () => {
  assert.match(src, /if\(a\.viewUrl\) img\.src = a\.viewUrl;/);
  assert.match(src, /if\(__isBigDataImg\(a\.dataUrl\) && \(!a\.vaultId \|\| a\.vaultPending\)\) img\.src = a\.dataUrl;/);
  assert.match(src, /__imgView\(a\)\.then\(__showSrc\)/);
  assert.match(src, /img\.style\.display = ''; img\.src = u;/);
  assert.match(src, /img\.decoding = 'async';/);
});

/* v-proj-vault (فحص الإقلاع في محادثة فارغة ببيانات كبيانات المالك: ١٨٣ م.ب نصوص base64 على مستوى المشروع — آخر صورة معدّلة،
   مصدر التعديل، أساس طبقة النصّ، لقطة الدليل، الديكور — تُحمَّل لكلّ المشاريع وينسخها كلّ حفظ ٣–٤ مرّات). */
const b64 = (c) => c.repeat(200000);
const imgProj = (id, c) => ({ id, messages: [{ role: 'user', content: 'x' }], lastEditedImage: { b64: b64(c + '1'), mime: 'image/png' }, imageEditSource: { b64: b64(c + '2'), mime: 'image/png' },
  imageTextLayer: { baseB64: b64(c + '3'), baseMime: 'image/png', text: 'نص', fontKey: 'k' }, guideShot: { b64: b64(c + '4'), mime: 'image/png' }, decorHistory: { 'مودرن': { b64: b64(c + '5'), mime: 'image/png' } } });

test('١٣. الحفظ يكتب base64 المشروع في مخزن الصور ويُبقي في السجلّ معرّفه؛ الصغير كما هو، والكنس يعدّها حيّة', async () => {
  const vault = {}; const A = imgProj('A', 'a'); A.imageEditSource = { b64: 'SMALL', mime: 'image/png' };
  const L = vaultLib(vault)(vault, { projects: [A], currentId: 'A' }, [], {}, { calls: 0, live: 0, maxLive: 0 });
  await L.__vaultSave();
  const rec = L.idbSetCalls()[0][1][0];
  for (const [f, k] of [['lastEditedImage', 'b64'], ['imageTextLayer', 'baseB64'], ['guideShot', 'b64']]) {
    assert.equal(rec[f][k], '', f + ' خارج السجلّ'); assert.ok(rec[f].vaultId && vault[rec[f].vaultId] === A[f][k], f + ' في المخزن');
    assert.equal(rec[f].vaultPending, undefined);
  }
  assert.equal(rec.decorHistory['مودرن'].b64, ''); assert.equal(vault[rec.decorHistory['مودرن'].vaultId], A.decorHistory['مودرن'].b64);
  assert.equal(rec.imageEditSource.b64, 'SMALL', 'الصغير يبقى في السجلّ'); assert.equal(rec.imageEditSource.vaultId, undefined);
  assert.equal(rec.imageTextLayer.text, 'نص', 'بقيّة الحقول كما هي');
  assert.ok(JSON.stringify(rec).length < 3000, 'السجلّ بلا base64');
  const live = L.__collectVaultIds([A]);
  assert.ok(live.has(A.lastEditedImage.vaultId) && live.has(A.decorHistory['مودرن'].vaultId), 'الكنس لا يمسحها');
  assert.ok(L.__vaultJsonSize() < 3000, 'حارس الحجم يقيس السجلّ بلا base64');
});

test('١٤. base64 المشاريع الأخرى يُفرَج عنه عند فتح غيرها ويعود حين يُفتح مشروعه (قراءة واحدة لكلّ كائن)؛ المعلّق لا يُمسّ', async () => {
  const vault = {}; const reads = []; const A = imgProj('A', 'a'); const B = imgProj('B', 'b');
  const st = { projects: [A, B], currentId: 'A' };
  const L = vaultLib(vault)(vault, st, reads, {}, { calls: 0, live: 0, maxLive: 0 });
  await L.__vaultSave();
  assert.equal(B.lastEditedImage.b64, '', 'أوّل حفظ ينقلها للمخزن ويُخرج غير المفتوح من الذاكرة فورًا');
  assert.ok(A.lastEditedImage.b64.length > 150000, 'والمفتوح يبقى');
  const pendingB = { b64: b64('p'), mime: 'image/png' }; B.imageEditSource = pendingB; pendingB.vaultId = 'vp'; pendingB.vaultPending = true;
  await L.hydrateProjectImages(A);
  assert.equal(B.lastEditedImage.b64, '', 'B خرج من الذاكرة'); assert.equal(B.imageTextLayer.baseB64, ''); assert.equal(B.decorHistory['مودرن'].b64, '');
  assert.equal(pendingB.b64.length, 200000, 'المعلّق (لم يُكتب بعد) لا يُمسّ');
  assert.ok(A.lastEditedImage.b64.length > 150000, 'المفتوح يبقى');
  assert.equal(L.__vaultProjBlobs(A), null, 'لا شيء في المخزن = لا وعد (الإرسال لا ينتظر)');
  reads.length = 0;
  const p1 = L.__vaultProjBlobs(B), p2 = L.__vaultProjBlobs(B);
  await Promise.all([p1, p2]);
  assert.equal(reads.length, 4, 'أربعة كائنات مخزونة = أربع قراءات مهما تكرّر الطلب');
  assert.equal(B.lastEditedImage.b64, vault[B.lastEditedImage.vaultId]); assert.equal(B.imageTextLayer.baseB64, vault[B.imageTextLayer.vaultId]); assert.equal(B.guideShot.b64, vault[B.guideShot.vaultId]); assert.ok(B.guideShot.b64.length > 150000);
});

test('١٥. الإرسال ينتظر الاستعادة قبل أن يقرأ آخر صورة معدّلة، ولا يتأخّر حين لا شيء في المخزن؛ والكتّاب يُسندون كائنًا جديدًا دائمًا', () => {
  const att = fs.readFileSync('js/app-09-attach.js', 'utf8');
  assert.match(att, /async function sendPrompt\(\)\{\n[^\n]*\n  try\{ const __cb = getCurrent\(\); const __bp = \(__cb && window\.__vaultProjBlobs\) \? window\.__vaultProjBlobs\(__cb\) : null; if\(__bp\) await __bp; \}/);
  assert.match(src, /if\(p\) __vaultProjBlobs\(p\);/, 'فتح المشروع يستعيدها');
  /* الحفظ يُبقي معرّف الكائن فإن عُدّلت الصورة في مكانها لا تُكتب وتُستعاد القديمة — الكاتب يجب أن يُسند كائنًا جديدًا */
  const inPlace = /(lastEditedImage|imageEditSource|imageTextLayer|guideShot)\s*\.\s*(b64|baseB64)\s*=[^=]|decorHistory\[[^\]]+\]\s*\.\s*b64\s*=[^=]/;
  for (const f of fs.readdirSync('js').filter(f => /\.js$/.test(f) && f !== 'app.bundle.js')) {
    assert.ok(!inPlace.test(fs.readFileSync('js/' + f, 'utf8')), f + ': تعديل base64 مشروع في مكانه');
  }
});

test('١٦. زرّ المشاركة لا يبني ملفّ الصورة الكامل لحظة ظهوره، ورقائق المستخدم بمصغّرتها، ونسخ العرض على لوحة برمجيّة', () => {
  const att = fs.readFileSync('js/app-09-attach.js', 'utf8');
  const fp = att.slice(att.indexOf('const filePossible = () => {'), att.indexOf('const saveOpen = (t) => {'));
  assert.ok(fp.length > 50 && !/fileOnce\(\)/.test(fp), 'filePossible لا يبني الملفّ');
  assert.match(fp, /new File\(\[new Uint8Array\(1\)\]/);
  assert.match(src, /if\(__chipThumb\) img\.src = __chipThumb;/);
  assert.match(src, /getContext\('2d', \{ willReadFrequently: true \}\)/);
});
