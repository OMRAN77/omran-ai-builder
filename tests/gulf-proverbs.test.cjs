'use strict';
/* v-gulf-proverbs (المالك ١٥ نوفمبر: «سولي كل شي… الأمثال القديمة كلها… أبي الناس تعرف الكلمات كلها، وحط الكلمات القديمة مع معانيها»):
   الأمثال الشعبيّة الخليجيّة في api/_lib/gulf-proverbs.json، تصل ذيل الدور من gulf-dialect.js (turnNote) كما تصل الكلمات.
   ١ المثل المذكور مع سؤال معنى (كاملًا أو أوّل ثلاث كلمات) ← مدخله؛ وبلا سؤال معنى لا شيء
   ٢ «أمثال عن الصبر / مثل شعبي عن الجار» ← أمثال حقيقيّة موضوعها فيها، بلا اختراع
   ٣ المثل يسبق الكلمة، وسؤال الكلمة كما كان
   ٤ ملفّ الأمثال: البنية، بلا تكرار (إذا/لا/إلى في أوّله صيغة واحدة)، والعدد، والتراثيّة؛ والقاموس بعد الجولة الثانية للكلمات القديمة */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const g = require('../api/_lib/gulf-dialect.js');
const PROV = JSON.parse(fs.readFileSync(path.join(root, 'api/_lib/gulf-proverbs.json'), 'utf8'));
const LEX = JSON.parse(fs.readFileSync(path.join(root, 'api/_lib/gulf-lexicon.json'), 'utf8'));
const pick = (re) => PROV.find((e) => re.test(g.norm(e.p)));

test('١ المثل المذكور مع سؤال معنى ← مدخله', () => {
  const e = pick(/^اذا طاح الجمل/) || PROV.find((x) => x.p.split(' ').length >= 4);
  assert.ok(e, 'مثل للاختبار');
  const full = g.turnNote('شو معنى مثل ' + e.p);
  assert.match(full, /الأمثال الشعبيّة الخليجيّة/);
  assert.ok(full.includes('«' + e.p + '»'), 'المدخل نفسه');
  assert.ok(full.includes(e.ar), 'معناه');
  const head = e.p.split(' ').slice(0, 3).join(' ');
  assert.ok(g.turnNote('وش يقصدون بـ ' + head).includes('«' + e.p + '»'), 'أوّل ثلاث كلمات تكفي');
  assert.ok(g.turnNote(e.p + ' شو يعني').includes('«' + e.p + '»'));
  assert.equal(g.proverbNote(e.p), '', 'المثل وحده بلا سؤال: لا ملاحظة');
});

test('٢ أمثال الموضوع حقيقيّة من الملفّ', () => {
  const n = g.turnNote('عطني أمثال عن الصبر');
  assert.match(n, /طلب المستخدم أمثالًا عن «الصبر»/);
  assert.match(n, /لا تخترع أمثالًا/);
  const lines = n.split('\n').filter((l) => l.startsWith('• «'));
  assert.ok(lines.length >= 1 && lines.length <= 8, 'عدد الأمثال: ' + lines.length);
  for (const l of lines) assert.ok(PROV.some((e) => l.startsWith('• «' + e.p + '»')), 'من الملفّ: ' + l.slice(0, 40));
  assert.ok(/جار/.test(g.turnNote('ابي مثل شعبي عن الجار')), 'الجار');
  assert.equal(g.turnNote('عطني أمثال عن زقنبيلو'), '');
});

test('٣ المثل يسبق الكلمة، والكلمة كما كانت', () => {
  assert.match(g.turnNote('ما معنى كلمة روشن'), /قاموس اللهجة الخليجيّة/);
  assert.equal(g.turnNote('سولي صورة'), '');
  assert.equal(g.turnNote('كيف حالك'), '');
});

test('٤ ملفّ الأمثال، والقاموس بعد جولة الكلمات القديمة', () => {
  const C = new Set(['ae', 'sa', 'kw', 'qa', 'bh', 'om']);
  assert.ok(Array.isArray(PROV) && PROV.length >= 400, 'عدد الأمثال: ' + PROV.length);
  const seen = new Set();
  for (const e of PROV) {
    assert.ok(e.p && e.p.split(' ').length >= 2, 'مثل: ' + JSON.stringify(e).slice(0, 80));
    assert.ok(e.ar && e.ar.length >= 6 && e.en, 'معنى: ' + e.p);
    assert.ok(Array.isArray(e.c) && e.c.length && e.c.every((c) => C.has(c)), 'الدول: ' + e.p);
    assert.ok(['old', 'common'].includes(e.era), 'الزمن: ' + e.p);
    const k = g.norm(e.p);
    assert.ok(!seen.has(k), 'تكرار: ' + e.p); seen.add(k);
  }
  assert.ok(PROV.filter((e) => e.era === 'old').length >= 90, 'التراثيّة: ' + PROV.filter((e) => e.era === 'old').length);
  const dupHead = PROV.filter((e) => /^لا طاح الجمل/.test(g.norm(e.p)));
  assert.equal(dupHead.length, 0, '«لا طاح الجمل» صيغة لـ«إذا طاح الجمل» لا مثل ثانٍ');
  assert.ok(LEX.length >= 1600, 'القاموس بعد الكلمات القديمة: ' + LEX.length);
  assert.ok(LEX.filter((e) => e.era === 'old').length >= 600, 'الكلمات القديمة: ' + LEX.filter((e) => e.era === 'old').length);
  const src = fs.readFileSync(path.join(root, 'api/_lib/gulf-dialect.js'), 'utf8');
  assert.ok(src.includes("if (!PROV) PROV = require('./gulf-proverbs.json');") && !/^const .*gulf-proverbs\.json/m.test(src), 'كسول');
});
