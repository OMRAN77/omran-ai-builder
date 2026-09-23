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

const vaultLib = (vault) => new Function('vault', 'state',
  'const __swallow = () => {};' +
  slice('const VAULT_MIN = 150000;', 'function idbImgPutAll(puts){') +
  'function idbImgGetMany(ids){ const o = {}; ids.forEach(id => { if(vault[id]) o[id] = vault[id]; }); return Promise.resolve(o); }' +
  slice('async function hydrateProjectImages(p, fromIdx){', 'window.__hydrateProjectImages') +
  slice('function __vaultJsonSize(){', '// ⚡ v320') +
  '; return { hydrateProjectImages, __imgWindowStart, __vaultJsonSize, __IMG_WINDOW };');

test('١. الاستعادة لنافذة العرض وحدها (آخر ٣٠ رسالة)، وكلّها حين يطلب «عرض الأقدم»', async () => {
  const vault = {}; const msgs = [];
  for (let i = 0; i < 40; i++) { vault['v' + i] = big('A'); msgs.push({ role: 'assistant', attachments: [{ isImage: true, vaultId: 'v' + i, dataUrl: '[media]' }], apiImages: [{ vaultId: 'v' + i, dataUrl: '[media]' }] }); }
  const p = { id: 'p', messages: msgs };
  const L = vaultLib(vault)(vault, { projects: [p] });
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
  const L = vaultLib({})({}, { projects: [p] });
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
