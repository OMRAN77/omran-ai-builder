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

// v-decor-art (دمج #1021 بأمر المالك ١٣ أكتوبر «ادمج»): الصورة رسمة SVG بألوان البطاقة بدل الصورة الحقيقيّة،
// في الخانة الصافية نفسها (بلا تظليل، والاسم المترجم تحتها). ملفّات الصور الحقيقيّة تبقى في المستودع (قرار المالك: الوسائط لا تُحذف).
test('١. لكل بطاقة رسمتها، وملفّات الصور الحقيقيّة باقية', () => {
  const KIND = { designAiRearrange: 'furniture', designAiDecorPlants: 'plants', designAiDecorArt: 'art', designAiDecorAccessories: 'accessories' };
  for (const [id, kind] of Object.entries(KIND)) assert.ok(src.includes(id + ":'" + kind + "'"), 'الرسمة مربوطة: ' + id);
  assert.ok(!src.includes('CBIMG'), 'لا صورة حقيقيّة مربوطة');
  for (const name of Object.values(IMGS)) assert.ok(fs.existsSync(path.join(root, 'assets/design/decor/' + name + '.webp')), 'الملفّ باقٍ: ' + name);
});

test('٢. الرسمة خلفية الخانة كاملة بلا قصّ، وتدرّج الألوان احتياط تحتها', () => {
  assert.ok(src.includes("'background:'+cbSvg(c,CBKIND[cb.id]||'furniture').replace('center/cover','center/contain')+','+"), 'الرسمة contain');
  assert.ok(src.includes('aspect-ratio:4/3'), 'خانة تتّسع للرسمة');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const v = Number((html.match(/design-sels\.js\?v=(\d+)/) || [])[1]);
  assert.ok(v > 563, 'وسم الملفّ مرفوع فوق نسخة الصور الحقيقيّة (563): ' + v);
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
