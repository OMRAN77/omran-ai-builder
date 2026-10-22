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

test('١. ثلاث صور مولَّدة 2:1 بلا نصّ (قواعد الصور ١٧ أكتوبر: Gemini 4K ثمّ تصغير واحد بـLanczos إلى 3072×1536 = ضعفا عرض المربّع، WebP q90)', () => {
  for (const t of ['decor', 'fashion', 'style']) {
    const f = path.join(root, 'assets/upload-art/' + t + '.webp');
    assert.ok(fs.existsSync(f), f);
    assert.ok(!fs.existsSync(path.join(root, 'assets/upload-art/' + t + '-ar.webp')), t + ': لا صورة بنصّ مطبوع');
    const b = fs.readFileSync(f); const [w, h] = webpSize(b);
    assert.deepEqual([w, h], [3072, 1536], t + ': ' + w + '×' + h);
    assert.ok(b.length > 200000 && b.length < 1500000, t + ': جودة ٩٠ (' + b.length + ')');
  }
});

test('٢. CSS: الصورة النظيفة لكلّ اللغات والنصّ فوقها في مواضع مقيسة — محمّل في index.html', () => {
  const css = read('css/رفع-الصور.css');
  for (const t of ['decor', 'fashion', 'style']) {
    const cls = '.omUp' + t[0].toUpperCase() + t.slice(1);
    assert.ok(css.includes(cls + '{background-image:url(/assets/upload-art/' + t + '.webp?v='), t + ' نظيفة');
  }
  assert.ok(!css.includes('html[lang="ar"]') && !css.includes('-ar.webp'), 'العربيّة كبقيّة اللغات: نصّ HTML فوق الصورة النظيفة لا صورة مكتوبة');
  assert.ok(css.includes('.omUpArt{position:relative !important') && css.includes('aspect-ratio:2/1'), 'إطار 2:1 ثابت فالمواضع نسبٌ');
  assert.match(read('index.html'), /css\/رفع-الصور\.css\?v=\d+/);
  // الجولة ٢ («دقّق… كلّهم»): المواضع المقيسة من الصور العربيّة (مركز السطر %)، الحجم بـcqw، والذهبيّ المتدرّج كالعربيّ
  assert.ok(css.includes('.omUpDecor{--t:32%;--h:45%;--b:70%;'), 'الديكور: عنوان/تلميح/لوحة');
  assert.ok(css.includes('.omUpFashion{--t:26%;--h:36%;--b:79.5%;'), 'الأزياء');
  assert.ok(css.includes('.omUpStyle{--b:74.5%;--l:90.5%;') && css.includes('.omUpStyle :is(.omUpT,.omUpH){opacity:0;}'), 'الستايل: اللوحتان ولا عنوان كتصميم المالك');
  assert.ok(css.includes('.omUpArt{container-type:inline-size;}') && css.includes('var(--ts,3.8cqw)'), 'الحجم من عرض المربّع');
  assert.ok(css.includes('-webkit-background-clip:text !important'), 'نصّ ذهبيّ متدرّج');
});

test('٣. المربّعات الثلاثة تحمل الأصناف، والعنوان الجديد بالـ١٤ لغة، ومصنّف الألوان الثلاثة يتخطّاها', () => {
  const core = read('js/partials-core.js');
  const sels = read('js/design-sels.js');
  assert.ok(core.includes('id="fashionAiDropZone" class="omUpArt omUpFashion om3-skip"'), 'الأزياء');
  assert.equal((core.match(/class="stSlot omUpArt omUpStyle om3-skip"/g) || []).length, 2, 'الستايل: الخانتان');
  assert.equal((core.match(/<span class="omUpB" data-i18n="uploadPlateBtn">/g) || []).length, 2, 'زرّ الملفّ فوق اللوحة في الستايل');
  assert.ok(core.includes('id="fashionAiFileBtn" style="width:auto; white-space:nowrap; border-color:rgba(212,175,55,.5);" data-i18n="uploadPlateBtn">') && sels.includes('<b class="omUpB" data-i18n="uploadPlateBtn"></b>'), 'نصّ اللوحة بلا إيموجي');
  assert.equal((core.match(/<span class="omUpL" data-i18n="studioPlateLabel">/g) || []).length, 2, 'كلمة «ستايل» على اللوحة الصغيرة');
  assert.ok(sels.includes("dz.className='dzArea omUpArt omUpDecor om3-skip';") && sels.includes('<b class="omUpT" data-i18n="designDropTitle">') && sels.includes('<small class="omUpH" data-i18n="designDropHint">'), 'الديكور');
  const data = read('js/app-03-i18n-data.js');
  for (const k of ['designDropTitle', 'designDropHint', 'studioPlateLabel', 'uploadPlateBtn']) {
    assert.equal((data.match(new RegExp('\\n\\s*' + k + ": '[^']+',", 'g')) || []).length, 2, k + ': العربيّة والإنجليزيّة');
    for (const l of LANGS) assert.match(read('i18n/' + l + '.js'), new RegExp('\\n\\s*' + k + ': "[^"]+",'), k + ' ' + l);
  }
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
