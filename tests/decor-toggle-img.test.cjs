// v-decor-toggle-img + v-decor-photos: بطاقات «لمسات ديكورية إضافية» بصور حقيقية بلا نصّ، والاسم من الترجمة بالـ١٤ لغة.
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
  assert.ok(!src.includes('CBKIND'), 'لا رسمة SVG مربوطة');
  assert.ok(!src.includes('function cbSvg'), 'دالّة الرسمة أُزيلت من الوجه');
});

test('٢. الصورة خلفية البطاقة وتدرّج الألوان احتياط تحتها', () => {
  assert.match(src, /'background:'\+\(img\?'url\("'\+img\+'"\) center\/cover no-repeat,':''\)\+/);
  assert.ok(src.includes('aspect-ratio:8/3'), 'الصورة بنسبتها');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const v = Number((html.match(/design-sels\.js\?v=(\d+)/) || [])[1]);
  assert.ok(v > 564, 'وسم الملفّ مرفوع فوق نسخة الرسمة (564): ' + v);
});

// v-photo-only (المالك ١٧ أكتوبر: «اي صوره تحتها احذفها نهائي») أحدث من «الاسم سطر تحتها»: لا شيء تحت الصورة، والاسم فوق أسفلها.
test('٢-ب. البطاقة صورتها وحدها: الاسم فوق أسفل الصورة لا سطر تحتها', () => {
  const fn = src.slice(src.indexOf('function proToggle'), src.indexOf('v-decor-full-page'));
  assert.ok(!fn.includes('rgba(0,0,0,.78)'), 'لا تظليل أسود ثقيل فوق الصورة');
  assert.ok(fn.includes('pic.appendChild(tk); pic.appendChild(nm); d.appendChild(pic);') && !fn.includes('d.appendChild(nm)'), 'الاسم داخل الصورة لا بعدها');
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
