'use strict';
/* v-decor-upload-top (المالك ٢٤ أكتوبر بلقطتي نافذة الديكور: «اريد التحميل فوق والأفكار تحت واذا فتحت الأفكار خاصية التحميل ماتسكر»):
   ١) الرفع (صفّ الملفّ الذي يركّب design-sels مربّعه الذهبيّ مكانه، ومعاينة الصورة) أوّل النافذة بعد الوصف، وصندوق «أفكار بلا صورة» بعده،
      ثمّ «نوع المكان» و«نمط الديكور» كما كانا.
   ٢) النتيجة (سحّاب قبل/بعد، الصورة، الشبكة، التحميل) تُنقل إلى قبل صندوق الأفكار — فتأتي بين الرفع والأفكار — ومشهد التوليد مكان الأفكار
      يخفيها والنتيجة السابقة وحدها: الرفع لا يُخفى أثناء التوليد.
   ٣) لا شيء في الديكور يلمس مربّع الرفع؛ المكان المختار يخفي المعاينة وحدها (سلوكه في vm: decor-place-sync ٤ و٥ و٧ و٨). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١ partials-core: الرفع أوّل نافذة الديكور بعد الوصف، والأفكار بعده، ثمّ نوع المكان والنمط', () => {
  const pc = read('js/partials-core.js');
  const a = pc.indexOf('<div id="designAiModal"');
  const modal = pc.slice(a, pc.indexOf('id="designAiGenerateBtn"', a));
  assert.ok(a > 0 && modal.length > 1000);
  const at = (s) => { const i = modal.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = [
    'data-i18n="designAiDesc"', 'id="designAiFileInput"', 'id="designAiFileBtn"', 'id="designAiFileName"', 'id="designAiSourcePreview"',
    'id="designAiIdeas"', 'id="designAiPlace"', 'id="designAiStyle"',
  ].map(at);
  assert.deepEqual(order, order.slice().sort((x, y) => x - y), 'الترتيب: الوصف ← الرفع ← المعاينة ← الأفكار ← المكان ← النمط');
  assert.equal(modal.split('id="designAiFileInput"').length, 2, 'عنصر رفع واحد لا اثنان');
  const pv = (modal.match(/<img id="designAiSourcePreview" style="([^"]*)"/) || [])[1] || '';
  assert.match(pv, /background:transparent;/, 'المعاينة بلا شريط أسود تحت الرفع في الفاتح');
});

test('٢ design-sels: المربّع الذهبيّ يُركَّب مكان صفّ الملفّ (فيصعد معه) ويأخذ اسم الملفّ، والصفّ يُخفى', () => {
  const ds = read('js/design-sels.js');
  const i = ds.indexOf('  function dropZone(mid,pfx){');
  const dz = ds.slice(i, ds.indexOf('\n  }\n', i));
  assert.ok(dz.includes("row=fb.parentElement") && dz.includes('row.parentElement.insertBefore(dz,row);'), 'قبل الصفّ مباشرة');
  assert.ok(dz.includes(".dzN').appendChild(fn)") && dz.includes("row.style.display='none';"));
});

test('٣ النتيجة بين الرفع والأفكار، ومشهد التوليد يخفي الأفكار والنتيجة السابقة لا الرفع', () => {
  const st = read('js/app-12-studios.js');
  const decor = st.slice(0, st.indexOf('/* v-tools-i18n-full'));
  assert.ok(/const anchor = document\.getElementById\('designAiIdeas'\);[\s\S]{0,200}\[baWrap, resultEl, gridEl, downloadEl\]\.forEach[\s\S]{0,120}anchor\.parentNode\.insertBefore\(n, anchor\)/.test(decor), 'النتيجة قبل صندوق الأفكار');
  const gw = read('js/app-34-gen-wait.js');
  const m = gw.match(/\{ id: 'decor',[\s\S]*?hideSel: '([^']*)' \}/);
  assert.ok(m, 'لوحة الديكور في مشهد الانتظار');
  assert.ok(m[0].includes("topSel: '#designAiIdeas'"), 'المشهد مكان الأفكار');
  for (const up of ['dzArea', 'designAiFileInput', 'designAiFileBtn', 'designAiFileName', 'designAiSourcePreview']) {
    assert.ok(!m[1].includes(up), 'الرفع لا يُخفى أثناء التوليد: ' + up);
  }
});

test('٤ لا شيء في الديكور يلمس مربّع الرفع، والمعاينة تُخفى في موضعين فقط: مكان مختار (syncPlace) وفشل قراءة الصورة', () => {
  const st = read('js/app-12-studios.js');
  const decor = st.slice(0, st.indexOf('/* v-tools-i18n-full'));
  const code = decor.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/dzArea|omUp/.test(code), 'لا إشارة إلى المربّع الذهبيّ في كود الديكور');
  assert.ok(!/fileBtn\.(style|hidden)|fileBtn\.parentElement/.test(code), 'ولا إخفاء لزرّ الملفّ أو صفّه');
  const i = decor.indexOf('  function syncPlace(){');
  assert.ok(i > 0, 'syncPlace');
  const sync = decor.slice(i, decor.indexOf('\n  }\n', i));
  assert.ok(!/\.style\.(display|setProperty)|hidden/.test(sync.replace(/sourcePreview\.style\.display/g, '')), 'syncPlace يلمس المعاينة وحدها');
  assert.ok(!/btnOpen\.addEventListener\('click'/.test(decor), 'لا مزامنة عند فتح النافذة (كانت تخفي بالمكان المكتوب من البوستر)');
  const hides = decor.match(/sourcePreview\.style\.display = [^;]*/g) || [];
  assert.deepEqual(hides, [
    "sourcePreview.style.display = (!on && selectedBase64) ? 'block' : 'none'",
    "sourcePreview.style.display = 'none'",
    "sourcePreview.style.display = 'block'",
  ], 'المعاينة: syncPlace، وفشل الضغط، والنجاح');
});
