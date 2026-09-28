// v-om-brand (٢٥ سبتمبر ٢٠٢٦): شعار «OM Ai» واحد لكلّ اللغات الأربع عشرة بدل شعار «عمران» لكلّ لغة،
// ونجومه الثلاث (سماويّ، أصفر، ورديّ) بجانبه تومض بالتناوب.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('index.html: الرأس والقائمة الجانبيّة بشعار «OM Ai» ونجومه، بلا تبديل حسب اللغة', () => {
  const html = read('index.html');
  const brands = html.match(/<span class="omBrand" dir="ltr">[\s\S]*?<\/svg><\/span>/g) || [];
  assert.equal(brands.length, 2, 'الرأس + رأس القائمة الجانبيّة');
  assert.equal(brands[0], brands[1], 'نسخة واحدة في المكانين');
  for (const [cls, color] of [['s1', '#04BAEC'], ['s2', '#FEED01'], ['s3', '#F049D7']]) {
    assert.ok(brands[0].includes('class="omBrandStar ' + cls + '" fill="' + color + '"'), cls);
  }
  assert.doesNotMatch(html, /icons\/brand-(?:ar|en|zh|hi|es|fr|bn|ru|ur|id|fil|tr|ne|ml)(?:-s)?\.png/, 'لا شعار «عمران» لأيّ لغة');
  assert.doesNotMatch(html, /alt="عمران Ai"/);
  assert.doesNotMatch(html, /var W = \{ zh:84/, 'سكربت الوميض لا يبدّل الصورة');
  assert.match(html, /css\/redesign\.css\?v=687/);
});

test('app-10 + الحزمة: syncBrand لا يبدّل الصورة حسب اللغة', () => {
  for (const f of ['js/app-10-features.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /BRAND_L10N_W/, f);
    assert.doesNotMatch(s, /icons\/brand-/, f);
  }
});

test('redesign.css: النجوم تومض بالتناوب وتسكن مع تقليل الحركة، والنجوم يمين الكلمة في العربيّة', () => {
  const css = read('css/redesign.css');
  assert.match(css, /\.omBrand\{display:inline-flex; align-items:center; direction:ltr;\}/);
  assert.match(css, /\.omBrandStar\{transform-origin:0 0; animation:omTwinkle /);
  assert.match(css, /\.omBrandStar\.s2\{[^}]*animation-delay:\.7s;\}/);
  assert.match(css, /\.omBrandStar\.s3\{[^}]*animation-delay:1\.4s;\}/);
  assert.match(css, /@keyframes omTwinkle\{/);
  assert.match(css, /html\.omAndroid \.omBrandStar\{filter:none;\}/, 'لا فلتر متحرّك على أندرويد (v-android-gpu)');
  assert.doesNotMatch(css, /(^|[\s,}])\.omStar\{/, 'لا قاعدة عامّة تمسّ نجوم زرّ «محادثة جديدة»');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{ \.omBrandStar\{animation:none;/);
});

test('ملفّ الشعار موجود بالأبعاد المعلنة (422×126 = 141×42 عرضًا)', () => {
  const b = fs.readFileSync(path.join(__dirname, '..', 'icons/brand-om-s.png'));
  assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [422, 126]);
});
