'use strict';
// v-decor-light-sheet (طلب المالك ١٤ أكتوبر ٢٠٢٦: «اريد صور هذي الصور ضيفها»):
// الإضاءة في الديكور عشرة خيارات، وكلّ بطاقة تعرض قصّتها من لوحة المالك نفسها lighting-sheet.webp.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ORDER = ['warm', 'cool', 'bright', 'dim', 'natural', 'neutral', 'golden', 'purple', 'sunset', 'moon'];

// ١) القائمة في الواجهة: العشر بنفس ترتيب اللوحة (بعد «بدون تغيير»)
const html = read('js/partials-core.js');
const sel = html.match(/<select id="designAiLighting"[\s\S]*?<\/select>/);
assert.ok(sel, 'designAiLighting select مفقود');
const vals = [...sel[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
assert.deepStrictEqual(vals, ORDER, 'خيارات الإضاءة لا تطابق ترتيب اللوحة');
ORDER.slice(4).forEach((v) => {
  assert.ok(new RegExp('<option value="' + v + '" data-en="[^"]+"').test(sel[0]), 'الخيار ' + v + ' بلا data-en');
});

// ٢) مواضع القصّ: كلّ قيمة لها موضع بين 0 و100، عمودان (يسار/يمين) وصفوف تنزل
const sels = read('js/design-sels.js');
const posM = sels.match(/var LIGHT_POS=\{([\s\S]*?)\};/);
assert.ok(posM, 'LIGHT_POS مفقود');
const pos = {};
for (const m of posM[1].matchAll(/(\w+):\[([\d.]+),([\d.]+)\]/g)) pos[m[1]] = [Number(m[2]), Number(m[3])];
assert.deepStrictEqual(Object.keys(pos), ORDER, 'مفاتيح LIGHT_POS لا تطابق القائمة');
ORDER.forEach((v, i) => {
  const [x, y] = pos[v];
  // v-decor-light-clear: الصورة كاملة بعرض البطاقة، فالموضع العمودي يتجاوز 0..100 في الصفّين الطرفيّين
  assert.ok(x >= 0 && x <= 100 && y >= -50 && y <= 150, 'موضع ' + v + ' خارج المدى');
  assert.ok(i % 2 === 0 ? x < 50 : x > 50, 'عمود ' + v + ' غلط');
  if (i >= 2) assert.ok(y > pos[ORDER[i - 2]][1], 'صفّ ' + v + ' لا ينزل عن الذي فوقه');
});

// ٣) الصورة من اللوحة: roomBg يرسمها، وselImg لا يطلب ملفًّا منفصلًا
assert.ok(sels.includes("var LIGHT_SHEET='assets/design/opts/lighting-sheet.webp'"), 'LIGHT_SHEET لا يشير للوحة');
assert.ok(sels.includes("if(id==='designAiLighting'&&LIGHT_POS[v]) return lightBg(v);"), 'roomBg لا يستعمل اللوحة');
assert.ok(sels.includes("if(id==='designAiLighting'&&LIGHT_POS[v]) return '';"), 'selImg يطلب ملفًّا منفصلًا للإضاءة');
assert.ok(fs.existsSync(path.join(root, 'assets/design/opts/lighting-sheet.webp')), 'ملفّ اللوحة lighting-sheet.webp مفقود');

// ٤) وصف عربي تحت كلّ خيار
// يُقرأ من SUBS: قائمة الأيقونات فوقها فيها \u{…} وقوسها يقطع المطابقة
const subsM = sels.slice(sels.indexOf('var SUBS=')).match(/designAiLighting:\{([\s\S]*?)\}/);
assert.ok(subsM, 'أوصاف الإضاءة مفقودة');
ORDER.forEach((v) => assert.ok(new RegExp('\\b' + v + ":'").test(subsM[1]), 'لا وصف لـ' + v));

// ٥) أوامر الخادم: كلّ خيار يتطبّق فعلًا على التصميم
const srv = read('api/_lib/design-create.js');
const lp = srv.match(/const LIGHTING_PROMPTS = \{([\s\S]*?)\n\};/);
assert.ok(lp, 'LIGHTING_PROMPTS مفقود');
ORDER.forEach((v) => assert.ok(new RegExp('\\n\\s*' + v + ": '").test(lp[1]), 'لا أمر توليد لـ' + v));

// ٦) الوضوح: عمود اللوحة بعرض البطاقة لا قصّة مكبّرة، وقناع يخفي الصفوف المجاورة
assert.ok(sels.includes("/ 200% auto no-repeat"), 'الإضاءة رجعت للقصّة المكبّرة المغبّشة');
assert.ok(sels.includes('var LIGHT_MASK='), 'قناع الصفوف المجاورة مفقود');

console.log('decor-light-sheet: ok (' + ORDER.length + ' lighting options)');
