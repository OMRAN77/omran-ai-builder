// tests/upload-art.test.cjs — v-upload-art (المالك ١٦ أكتوبر بستّ صور: «حطّهم كلّهم في الأزياء والديكور ستايل رتّبهم مع ١٤ لغة»،
// ثمّ «الأُوَل خلّها بالعربي وهذي بالـ١٤ لغة»): مربّع رفع الصورة في الديكور والأزياء والستايل صورة المالك؛ العربيّة بصورتها
// المكتوبة، وبقيّة اللغات بالصورة النظيفة والنصّ فوقها مترجمًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const LANGS = ['fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml'];

function webpSize(b) {
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  const c = b.toString('ascii', 12, 16);
  if (c === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (c === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (c === 'VP8L') { const x = b.readUInt32LE(21); return [(x & 0x3fff) + 1, ((x >> 14) & 0x3fff) + 1]; }
  return [0, 0];
}

test('١. ستّ صور 1280×720… بل 2:1 (1280×640): لكلّ أداة نظيفة ومكتوبة بالعربيّة', () => {
  for (const t of ['decor', 'fashion', 'style']) for (const suf of ['', '-ar']) {
    const f = path.join(root, 'assets/upload-art/' + t + suf + '.webp');
    assert.ok(fs.existsSync(f), f);
    const [w, h] = webpSize(fs.readFileSync(f));
    assert.deepEqual([w, h], [1280, 640], t + suf + ': ' + w + '×' + h);
    assert.ok(fs.statSync(f).size < 260000, t + suf + ' أثقل من ٢٥٠ك');
  }
});

test('٢. CSS: العربيّة بالصورة المكتوبة ونصّها مخفيّ، والبقيّة بالنظيفة والنصّ فوقها — محمّل في index.html', () => {
  const css = read('css/رفع-الصور.css');
  for (const t of ['decor', 'fashion', 'style']) {
    const cls = '.omUp' + t[0].toUpperCase() + t.slice(1);
    assert.ok(css.includes(cls + '{--t:') && css.includes('url(/assets/upload-art/' + t + '.webp?v='), t + ' نظيفة');
    assert.ok(css.includes('html[lang="ar"] ' + cls + '{background-image:url(/assets/upload-art/' + t + '-ar.webp?v='), t + ' عربيّة');
  }
  assert.ok(css.includes('html[lang="ar"] .omUpArt :is(.omUpT,.omUpH,.omUpB){opacity:0;}'), 'نصّ HTML يختفي تحت الصورة المكتوبة (والنقر باقٍ)');
  assert.ok(css.includes('.omUpArt{position:relative !important') && css.includes('aspect-ratio:2/1'), 'إطار 2:1 ثابت فالمواضع نسبٌ');
  assert.match(read('index.html'), /css\/رفع-الصور\.css\?v=\d+/);
});

test('٣. المربّعات الثلاثة تحمل الأصناف، والعنوان الجديد بالـ١٤ لغة، ومصنّف الألوان الثلاثة يتخطّاها', () => {
  const core = read('js/partials-core.js');
  assert.ok(core.includes('id="fashionAiDropZone" class="omUpArt omUpFashion om3-skip"'), 'الأزياء');
  assert.equal((core.match(/class="stSlot omUpArt omUpStyle om3-skip"/g) || []).length, 2, 'الستايل: الخانتان');
  assert.equal((core.match(/<span class="omUpB" data-i18n="fileChooseBtn">/g) || []).length, 2, 'زرّ الملفّ فوق اللوحة في الستايل');
  const sels = read('js/design-sels.js');
  assert.ok(sels.includes("dz.className='dzArea omUpArt omUpDecor om3-skip';") && sels.includes('<b class="omUpT" data-i18n="designDropTitle">'), 'الديكور');
  const data = read('js/app-03-i18n-data.js');
  assert.equal((data.match(/\n\s*designDropTitle: '[^']+',/g) || []).length, 2, 'العربيّة والإنجليزيّة');
  for (const l of LANGS) assert.match(read('i18n/' + l + '.js'), /\n\s*designDropTitle: "[^"]+",/, l);
  const black = read('css/أدوات-أسود.css');
  assert.ok(!black.includes('#fashionAiDropZone') && !black.includes('#studioAiModal .stSlot'), 'لا تسويد للمربّعات (كانت تخفي الصورة)');
});

test('٤. الستايل على الحاسوب: الضغط على الخانة يفتح الملفّات مباشرةً — لا قائمة «المعرض» وحدها تطفو (لقطة المالك)', () => {
  const src = read('js/app-13-stocks-init.js');
  const fn = src.slice(src.indexOf('function studioOpenMenu(which){'), src.indexOf('function studioOpenMenu(which){') + 1400);
  const direct = fn.indexOf("if(!coarse){ (which === 'A' ? fileInputA : fileInputB).click(); return; }");
  assert.ok(direct > 0, 'فتح مباشر بلا قائمة');
  assert.ok(direct < fn.indexOf("add(t('studioSrcGallery')"), 'قبل بناء القائمة');
});
