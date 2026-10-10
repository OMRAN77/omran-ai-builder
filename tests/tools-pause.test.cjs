// v-tools-pause: محلّل المصاريف ومولّد السيرة الذاتيّة مخفيّان مؤقّتًا — لا بطاقة في شاشة الأدوات ولا اقتراح في المحادثة،
// والكود والنوافذ باقية كي يكون الإرجاع حذف معرّف من قائمة واحدة.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'js/app-05-ui.js'), 'utf8');
const features = fs.readFileSync(path.join(root, 'js/app-10-features.js'), 'utf8');
const block = ui.slice(ui.indexOf('var OMRAN_PAUSED_TOOLS'), ui.indexOf('// ميزة الشخصية الكرتونية الناطقة'))
  + ui.slice(ui.indexOf('function capabilityHintFor'), ui.indexOf('// أيقونة القدرات'));
const CAP = new Function(block + '; return { OMRAN_PAUSED_TOOLS, APP_CAPABILITIES, capabilityHintFor };')();

test('القائمة الواحدة فيها الأداتان', () => {
  assert.deepStrictEqual(CAP.OMRAN_PAUSED_TOOLS, ['btnExpense', 'btnCV']);
});

test('المحادثة لا تقترح السيرة الذاتيّة، والاقتراحات الأخرى باقية', () => {
  assert.ok(!CAP.APP_CAPABILITIES.some((c) => CAP.OMRAN_PAUSED_TOOLS.includes(c.id)));
  assert.strictEqual(CAP.capabilityHintFor('اكتب لي سيرة ذاتية'), null);
  assert.strictEqual(CAP.capabilityHintFor('I need a resume'), null);
  assert.strictEqual(CAP.capabilityHintFor('حلل هذا العقد').id, 'btnDocs');
  assert.strictEqual(CAP.capabilityHintFor('ما حكم الصيام').id, 'btnReligion');
});

test('شاشة الأدوات تتخطّى المخفيّ قبل الصفّ وتخفيه في ⋮', () => {
  const loop = features.slice(features.indexOf('track.appendChild(start);'), features.indexOf('track.appendChild(end);'));
  const skip = loop.indexOf('OMRAN_PAUSED_TOOLS.indexOf(id) >= 0');
  assert.ok(skip > 0 && skip < loop.indexOf('track.appendChild(b)'), 'الفحص قبل الإلحاق بالصفّ');
  assert.match(loop, /b\.hidden = true; b\.style\.setProperty\('display', 'none', 'important'\); return;/);
});

test('الأداتان باقيتان في الكود (الإرجاع سطر واحد)', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const id of ['btnExpense', 'btnCV', 'expModal', 'cvModal']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(fs.readFileSync(path.join(root, 'js/exp.js'), 'utf8'), /getElementById\('btnExpense'\)/);
  assert.match(fs.readFileSync(path.join(root, 'js/ui-docs.js'), 'utf8'), /getElementById\('btnCV'\)/);
});
