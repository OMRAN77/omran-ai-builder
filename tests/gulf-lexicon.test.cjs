'use strict';
/* v-gulf-lexicon (المالك ١٥ نوفمبر: «ما معنى كلمة روشن؟» — التطبيق: «تعني واضح أو مضيء… هذا الجواب خطأ»؛ «تزويد المعلومات باللهجة الإماراتيّة
   والخليجيّة من ا إلى ي، القديمة والجديدة»). الجذر: النموذج يخمّن من الفارسيّة (روشن = مضيء)، وفي الخليج الروشن كوّة/رفّ في جدار البيت.
   الحلّ: قاموس خليجيّ (api/_lib/gulf-lexicon.json) يصل مدخله إلى ذيل دور سؤال المعنى (api/_lib/gulf-dialect.js ← chat.js).
   ١ كشف أسئلة المعنى بصيغها الخليجيّة، وما ليس سؤال معنى لا يُكشف
   ٢ المطابقة: «ال»، الهمزات والتاء المربوطة، چ/ج/ك وگ/ق، الجمع والصيغ
   ٣ ملاحظة الدور: مدخل القاموس مرجعًا بلا تخمين ولا بحث؛ والكلمة الغائبة تنبيه «ابحث ولا تختلق» لسؤال صريح فقط
   ٤ القاموس نفسه: صالح البنية، بلا تكرار، يغطّي الحروف كلّها والدول الستّ والأزمنة الثلاثة، وروشن بمعناها الخليجيّ
   ٥ الربط في chat.js: ذيل الدور ونظام السلسلة المجّانيّة، والقاموس كسول لا يُحمَّل في نطاق الوحدة */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const g = require('../api/_lib/gulf-dialect.js');
const LEX = JSON.parse(read('api/_lib/gulf-lexicon.json'));

test('١ كشف أسئلة المعنى بصيغها الخليجيّة', () => {
  const yes = {
    'ما معنى كلمة روشن': ['روشن'], 'شو معنى روشن؟': ['روشن'], 'وش يعني الروشن': ['الروشن'], 'يا خوي روشن يعني شو': ['روشن'],
    'روشن شو يعني': ['روشن'], 'شنو معنى هالكلمة روشن': ['روشن'], 'ابي اعرف معنى روشن': ['روشن'], 'شو معنى روشن اللي يقولونها': ['روشن'],
    'معنى كلمة «روشن» بالإماراتي': ['روشن'], 'what does روشن mean': ['روشن'], 'شو معنى روشن وباچر': ['روشن', 'باچر'],
  };
  for (const [t, w] of Object.entries(yes)) assert.deepEqual(g.askedWords(t), w, t);
  for (const t of ['كيف حالك', 'ابي اروح البر شو رايك', 'يعني شو تقصد بكلامك', 'شو معنى هالكلمة', 'ارسم لي صورة روشن']) assert.deepEqual(g.askedWords(t), [], t);
});

test('٢ المطابقة بأشكال الكتابة', () => {
  const has = (q, w) => assert.ok(g.lookup(q).some((e) => e.w === w), q + ' ← ' + w);
  has('روشن', 'روشن'); has('الروشن', 'روشن'); has('رواشن', 'روشن');
  has('باچر', 'باچر'); has('باجر', 'باچر');
  assert.equal(g.norm('إِمَارَاتِيّة'), 'اماراتيه');
  assert.ok(g.forms('چبير').includes('كبير') && g.forms('گال').includes('قال') && g.forms('البوش').includes('بوش'));
  assert.deepEqual(g.lookup('كلمةغيرموجودةابدا'), []);
});

test('٣ ملاحظة الدور: المدخل مرجع، والغائب تنبيه بلا اختلاق', () => {
  const n = g.turnNote('ما معنى كلمة روشن');
  assert.match(n, /قاموس اللهجة الخليجيّة/);
  assert.match(n, /«روشن»/);
  assert.ok(n.indexOf('• «روشن»') >= 0 && n.indexOf('• «روشن»') < (n.indexOf('• «روشان»') + 1 || Infinity), 'المدخل نفسه أوّلًا');
  assert.match(n, /كوّ?[ةه]|رفّ?|تجويف|فتح[ةه]/, 'المعنى الخليجيّ في المدخل');
  assert.match(n, /لا تخمّن معنًى من الفارسيّة/);
  assert.match(n, /ولا حاجة للبحث/);
  assert.doesNotMatch(n, /«روشن»[^\n]*\]: (?:واضح|مضيء)/, 'لا «مضيء» معنًى');
  const miss = g.turnNote('شو معنى كلمة زقنبيلو');
  assert.match(miss, /ابحث عن معناها في اللهجة/);
  assert.match(miss, /لا تختلق معنى/);
  assert.equal(g.turnNote('وش يعني اسوي الحين'), '', 'سؤال قصد لا معنى: لا تنبيه');
  assert.equal(g.turnNote('سولي صورة'), '');
});

test('٤ القاموس: البنية والتغطية', () => {
  const C = new Set(['ae', 'sa', 'kw', 'qa', 'bh', 'om']), POS = new Set(['اسم', 'فعل', 'صفة', 'ظرف', 'حرف', 'تعبير']);
  assert.ok(Array.isArray(LEX) && LEX.length >= 1000, 'عدد المداخل: ' + LEX.length);
  const keys = new Set();
  for (const e of LEX) {
    assert.ok(e.w && typeof e.w === 'string' && /[ء-يچگڤ]/.test(e.w), 'كلمة: ' + JSON.stringify(e));
    assert.ok(e.ar && e.ar.length >= 3 && e.en && e.en.length >= 2, 'معنى بالفصحى والإنجليزيّة: ' + e.w);
    assert.ok(Array.isArray(e.c) && e.c.length && e.c.every((c) => C.has(c)), 'الدول: ' + e.w);
    assert.ok(['old', 'common', 'new'].includes(e.era), 'الزمن: ' + e.w);
    assert.ok(!e.pos || POS.has(e.pos), 'نوع الكلمة: ' + e.w + ' ' + e.pos);
    assert.ok(Array.isArray(e.alt), 'الصيغ مصفوفة: ' + e.w);
    const k = g.norm(e.w) + '|' + g.norm(e.ar).slice(0, 12);
    assert.ok(!keys.has(k), 'تكرار: ' + e.w); keys.add(k);
  }
  const first = (w) => g.norm(w).replace(/^ال(?=\S{2,})/, '')[0];
  const letters = new Set(LEX.map((e) => first(e.w)));
  // الظاء وحدها: الخليجيّ ينطقها ضادًا ولا مفردة لهجيّة موثوقة تبدأ بها (لم يجد البحث كلمة مؤكَّدة)
  for (const L of 'ابتثجحخدذرزسشصضطعغفقكلمنهوي') assert.ok(letters.has(L), 'حرف بلا مداخل: ' + L);
  for (const c of C) assert.ok(LEX.filter((e) => e.c.includes(c)).length >= 50, 'دولة قليلة المداخل: ' + c);
  for (const era of ['old', 'common', 'new']) assert.ok(LEX.filter((e) => e.era === era).length >= 40, 'زمن قليل: ' + era);
  const r = LEX.filter((e) => g.norm(e.w) === 'روشن' || (e.alt || []).some((a) => g.norm(a) === 'روشن'));
  assert.ok(r.length, 'روشن في القاموس');
  assert.ok(r.some((e) => /كوّ?[ةه]|رفّ?|تجويف|نافذ|فتح/.test(e.ar)) && r.every((e) => !/^(?:واضح|مضيء)/.test(e.ar)), 'روشن بمعناها الخليجيّ: ' + r.map((e) => e.ar).join(' | '));
});

test('٥ الربط في chat.js، والقاموس كسول', () => {
  const chat = read('api/_lib/chat.js');
  assert.ok(chat.includes("const __gulfNote = (typeof lastUserText === 'string' && lastUserText) ? require('./gulf-dialect.js').turnNote(lastUserText) : '';"));
  assert.ok(chat.includes('.concat(__gulfNote ? [__gulfNote] : []) /* v-gulf-lexicon */'), 'في ذيل الدور');
  assert.ok(chat.includes("__provSelfSys + (__gulfNote ? '\\n\\n' + __gulfNote : '') /* v-gulf-lexicon */"), 'في نظام السلسلة المجّانيّة');
  const src = read('api/_lib/gulf-dialect.js');
  assert.ok(!/^const .*require\('\.\/gulf-lexicon\.json'\)/m.test(src), 'لا تحميل للقاموس في نطاق الوحدة');
  assert.ok(src.includes("if (!LEX) LEX = require('./gulf-lexicon.json');"));
});

/* v-gulf-owner (المالك ١٥ نوفمبر بعد الدمج: «ما معنى كلمة روشن — هذا البضاعة اللي يشترونها للبيت من الطعام والشراب»): معنى أكّده المالك
   (src: owner) يتقدّم على المعاني المنشورة، ويبقى التراثيّ بعده لا محذوفًا. */
test('٦ تصحيح المالك أوّلًا: روشن = مقاضي البيت، والتراثيّ بعده', () => {
  const es = g.lookup('روشن');
  assert.equal(es[0].src, 'owner');
  assert.match(es[0].ar, /مقاضي البيت/);
  assert.ok(es[0].c.includes('ae'));
  assert.ok(es.slice(1).some((e) => /كوّ?[ةه]|تجويف/.test(e.ar)), 'معنى الكوّة باقٍ بعده');
  const n = g.turnNote('ما معنى كلمة روشن');
  assert.ok(n.indexOf('مقاضي البيت') > 0 && n.indexOf('مقاضي البيت') < n.indexOf('كوّة'), 'مقاضي البيت قبل الكوّة في الملاحظة');
  assert.match(n, /وإن تعدّدت المعاني فابدأ بالأوّل/);
});
