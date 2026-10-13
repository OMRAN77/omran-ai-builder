// v-decor-toggle-img: بطاقات «لمسات ديكورية إضافية» بصور حقيقية بلا نصّ، والاسم من الترجمة بالـ١٤ لغة.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/design-sels.js'), 'utf8');
const IMGS = {
  designAiRearrange: 'rearrange', designAiDecorPlants: 'plants',
  designAiDecorArt: 'art', designAiDecorAccessories: 'accessories'
};
const KEYS = ['designAiRearrangeLabel', 'designAiDecorPlants', 'designAiDecorArt', 'designAiDecorAccessories'];

test('١. لكل بطاقة صورتها، والملفّ موجود وصغير', () => {
  for (const [id, name] of Object.entries(IMGS)) {
    const rel = 'assets/design/decor/' + name + '.webp';
    assert.ok(src.includes(id + ":'" + rel + "'"), 'الصورة مربوطة: ' + id);
    const st = fs.statSync(path.join(root, rel));
    assert.ok(st.size > 2000 && st.size < 120000, 'حجم معقول: ' + rel);
  }
});

test('٢. الصورة خلفية البطاقة وتدرّج الألوان احتياط تحتها', () => {
  assert.match(src, /'background:'\+\(img\?'url\("'\+img\+'"\) center\/cover no-repeat,':''\)\+/);
  assert.ok(src.includes('aspect-ratio:8/3'), 'الصورة بنسبتها');
});

test('٢-ب. الصورة صافية: لا تظليل ولا اسم فوقها — الاسم سطر تحتها', () => {
  const fn = src.slice(src.indexOf('function proToggle'), src.indexOf('v-decor-full-page'));
  assert.ok(!fn.includes('rgba(0,0,0,.78)'), 'لا تظليل أسود فوق الصورة');
  assert.ok(fn.includes('pic.appendChild(tk); d.appendChild(pic); d.appendChild(nm);'), 'الاسم بعد الصورة لا داخلها');
});

test('٣. الاسم من مفتاح الترجمة، وكل مفتاح موجود في الـ١٤ لغة', () => {
  assert.ok(src.includes("sp.getAttribute('data-i18n')") && src.includes('window.t(key)'), 'الاسم من window.t');
  const core = fs.readFileSync(path.join(root, 'js/app-03-i18n-data.js'), 'utf8');
  const langs = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
  for (const k of KEYS) {
    assert.strictEqual((core.match(new RegExp('\\b' + k + '\\s*:', 'g')) || []).length, 2, 'العربي والإنجليزي: ' + k);
    for (const l of langs) {
      const f = fs.readFileSync(path.join(root, 'i18n', l + '.js'), 'utf8');
      assert.ok(new RegExp('"?' + k + '"?\\s*:').test(f), l + ': ' + k);
    }
  }
});
