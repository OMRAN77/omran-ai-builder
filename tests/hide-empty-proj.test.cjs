// v-hide-empty-proj (المالك ١٧ أكتوبر «احذف مشروع جديد — اريده فقط اذا فتحت يطلع مشروع جديد»):
// المشروع الفارغ (بلا رسائل ولا كود) لا يُعرض في قائمة المشاريع؛ يظهر أوّل ما يُكتب فيه.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-04-i18n-state.js'), 'utf8');
const i = src.indexOf('function renderHistory(){');
assert.ok(i >= 0, 'renderHistory موجودة');
const body = src.slice(i, i + 6000);
const m = /const __histSorted = \[\.\.\.state\.projects\]\.filter\((p => .*?)\)\.sort\(/.exec(body);
assert.ok(m, 'القائمة تُصفّى قبل الترتيب');
const keep = eval('(' + m[1] + ')');
assert.ok(!keep({ id: 'p_1', title: 'مشروع جديد', messages: [], code: '' }), 'الفارغ مخفيّ');
assert.ok(!keep({ id: 'p_2', title: 'مشروع جديد' }), 'الفارغ بلا حقول مخفيّ');
assert.ok(keep({ id: 'p_3', title: 'سؤال', messages: [{ role: 'user', content: 'هلا' }], code: '' }), 'فيه رسالة يظهر');
assert.ok(keep({ id: 'p_4', title: 'إلهام', messages: [], code: '<html></html>' }), 'فيه كود يظهر');
assert.ok(!keep(null), 'العنصر الفارغ لا يكسر');
console.log('✓ hide-empty-proj');
