// tests/arabic-wordb.test.cjs — v-arabic-wordb
// العرض: \w في تعابير JS لاتينيّ فقط، فـ`\b` بجوار حرف عربيّ لا يطابق أبدًا. ٩ تعابير حيّة كانت ميّتة كلّها أو بعضها حتّى ١١ أكتوبر:
// حارس «الطلب المبهم» (فـ«ابي صورة» تولّد عشوائيًّا)، فيتو الشكر بعد الصورة، «سؤال يبدأ بـكيف/شو» والمشروع مفتوح (فصار أمر تعديل للكود)،
// فرع «فيديو قصير/سينمائي»، «سو» في قواعد البناء، «ما/من» في مدخل التعديل، تلميح «مساعد المستندات»، «الهند» في البحث، و«نمر» في الطوابع.
// القرار: حدود يدويّة لكلّ واحد، وقاعدة في الحارس (scripts/guard.mjs «ز») تفشل npm run ci على أيّ \b يلمس حرفًا عربيًّا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { deadBoundaries, scanTree } = require('../scripts/lib/arabic-wordb.cjs');
const { load } = require('./_route-src.cjs');

test('١. الكاشف: \\b بجوار حرف عربيّ أو مجموعة فيها بديل عربيّ ميّت، والحدود اللاتينيّة والهروب والأقواس المربّعة سليمة', () => {
  for (const p of ['\\b(?:كيف|ليش)', 'الهند\\b', '(?:مستند|contract)\\b', '\\bسو', 'ما\\b|من\\b', '^(شو|what)\\b']) assert.ok(deadBoundaries(p) > 0, 'ميّت: ' + p);
  for (const p of ['\\bvideo\\b', '[\\b]', '\\\\b', '(?:^|[\\s،,])كيف(?=$|\\s)', '(?:a|b)\\b', 'الهند(?![\\u0600-\\u06FF])', '\\b(?:an?|the)\\s+(?:image|picture)\\b']) assert.equal(deadBoundaries(p), 0, 'سليم: ' + p);
});

test('٢. لا تعبير حرفيّ في أجزاء الواجهة ولا في شيفرة الخادم فيه \\b يلمس حرفًا عربيًّا (كانت ٩)', () => {
  const found = scanTree(root);
  assert.deepEqual(found.map((r) => r.file + ':' + r.line), []);
  assert.ok(read('scripts/guard.mjs').includes("createRequire(import.meta.url)('./lib/arabic-wordb.cjs')"), 'الحارس يشغّل الكاشف نفسه');
});

test('٣. سؤال يبدأ بأداة استفهام عربيّة والمشروع مفتوح نقاشٌ لا أمر تعديل للكود؛ أمر التعديل يبقى تعديلًا', () => {
  const h = load();
  const q = h.R.questionStart;
  for (const t of ['كيف اضيف ميزة البحث؟', 'شو رايك اضيف قسم', 'هل اقدر احط زر', 'ليش ما يشتغل', 'ما هو الأفضل', 'how do I add a button']) assert.ok(q.test(t), 'سؤال: ' + t);
  for (const t of ['كبر الشعار', 'كيفك اليوم', 'شيل المستطيل الأصفر', 'whatever']) assert.ok(!q.test(t), 'ليس سؤالًا: ' + t);
  // الشرط الحقيقيّ __editIntent بنصّه، والمشروع مفتوح
  const i = h.SRC.indexOf('  const __editVerbRe = ');
  const src = [h.SRC.slice(i, h.SRC.indexOf('\n', i)), h.SRC.slice(h.SRC.indexOf('  const __editObjRe = '), h.SRC.indexOf('\n', h.SRC.indexOf('  const __editObjRe = '))),
    h.SRC.slice(h.SRC.indexOf('  const __questionStartRe = '), h.SRC.indexOf('\n', h.SRC.indexOf('  const __questionStartRe = '))),
    h.SRC.slice(h.SRC.indexOf('  const __editVerbHit = '), h.SRC.indexOf('\n', h.SRC.indexOf('  const __editVerbHit = '))), 'this.r = __editIntent;'].join('\n'); // rel-4: سطر __editVerbHit و__editIntent معًا
  const edit = (text) => { const c = { text, cur: { code: '<html></html>' }, __imgWriteAsk: false }; require('vm').runInNewContext(src, c); return c.r; };
  assert.equal(edit('كيف اضيف ميزة البحث؟'), false, 'سؤال = نقاش');
  assert.equal(edit('ليش ما تضيف ميزة البحث'), false, 'سؤال = نقاش');
  for (const t of ['اضيف ميزة البحث', 'شيل المستطيل الأصفر', 'غير لون الزر للأحمر', 'كيف أغير لون الزر؟']) assert.equal(edit(t), true, 'تعديل: ' + t); // عنصر التصميم (لون/زر) يبقى تعديلًا كما كان
  // مراجعة الدفعة A (rel-4): «هل تقدر/هل ممكن + فعل تعديل» طلبٌ لا سؤال (كانت تخرج من مسار تعديل الكود)
  for (const t of ['هل تقدر تضيف ميزة البحث', 'هل ممكن تضيف واتساب للتواصل']) { assert.ok(!q.test(t), 'ليس سؤالًا: ' + t); assert.equal(edit(t), true, 'تعديل: ' + t); }
});

test('٤. «الهند» وحدها بلد في البحث، و«الهندسة» لا؛ «نمر» ثيم الأساطير و«نمرة» لا؛ «عقد/فاتورة» وحدها تقترح مساعد المستندات', () => {
  const { regionOf } = require('../api/_lib/search.js');
  assert.equal(regionOf('فنادق رخيصة في الهند'), 'IN');
  assert.equal(regionOf('مطاعم الهند'), 'IN');
  assert.notEqual(regionOf('كلية الهندسة'), 'IN');
  const st = read('api/_lib/stamps.js');
  const k = st.match(/\{ k: (\/[^\n]*?\/i), teen: true, d: 'LEGENDARY EMBLEMS/);
  const legend = require('vm').runInNewContext(k[1]);
  assert.ok(legend.test('طوابع نمر'), 'نمر');
  assert.ok(!legend.test('نمرة السيارة'), 'نمرة ليست نمرًا');
  const ui = read('js/app-05-ui.js');
  const block = ui.slice(ui.indexOf('var OMRAN_PAUSED_TOOLS'), ui.indexOf('// ميزة الشخصية الكرتونية الناطقة')) + ui.slice(ui.indexOf('function capabilityHintFor'), ui.indexOf('// أيقونة القدرات'));
  const CAP = new Function('document', '__swallow', block + '; return { capabilityHintFor };')({ getElementById: () => null }, () => {});
  for (const t of ['عندي عقد إيجار وابي اعرف حقوقي', 'فاتورة الكهرباء طالعة غلط', 'please check this invoice']) assert.equal((CAP.capabilityHintFor(t) || {}).id, 'btnDocs', t);
  for (const t of ['حليت العقدة', 'كم سعر الذهب']) assert.equal(CAP.capabilityHintFor(t), null, t);
});
