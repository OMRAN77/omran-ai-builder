'use strict';
/* v-spell-literal — لقطة المالك ٢٧ سبتمبر: «اكتب على اليمين مشكور اخوي» طُبعت «آخوي». المدقّق القديم سأل مزوّدًا آخر وقبل
   حارسه كلّ تعديل ≤ حرفين للكلمة. السياسة الآن: النصّ الحرفيّ يمرّ على قاموس ثابت فقط (omranSpellFix = literalSpellFix +
   fixKnownPhrases للاسترجاع)، وأيّ ناتج غير ناتج القاموس نفسه مرفوض. أزواج القبول والرفض من تحقيق إعادة البناء. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fixKnownPhrases } = require('../js/app-08-image-text.js');
const attach = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const ISTIRJA = 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ';

const a = attach.indexOf('const __SPELL_PHRASES'), fStart = attach.indexOf('async function omranSpellFix');
const b = attach.indexOf('\n}\n', fStart) + 3;
const calls = [];
const ctx = { window: { __fixKnownPhrases: fixKnownPhrases }, callProviderAI: async (...x) => { calls.push(x); return 'آخوي'; }, fetch: async (...x) => { calls.push(x); throw new Error('no network'); } };
vm.createContext(ctx);
vm.runInContext(attach.slice(a, b) + ';this.fix=literalSpellFix;this.spell=omranSpellFix;', ctx);
const fix = (t) => ctx.fix(t);
/* الحارس كما في التحقيق: لا يُقبل إلّا النصّ كما هو أو ناتج القاموس نفسه */
const allowed = async (orig, fixed) => fixed === orig || fixed === await ctx.spell(orig);

test('dictionary fixes: every occurrence, punctuation as a boundary, Uthmani istirja via fixKnownPhrases', async () => {
  const T = [
    ['انشاء الله', 'إن شاء الله'], ['ان شاء الله', 'إن شاء الله'], ['انشالله.', 'إن شاء الله.'], ['ان شاءالله', 'إن شاء الله'], ['انشاالله', 'إن شاء الله'],
    ['انشاء الله انشاء الله', 'إن شاء الله إن شاء الله'], ['ماشاء الله!', 'ما شاء الله!'], ['ماشالله', 'ما شاء الله'], ['«ماشالله» عليك', '«ما شاء الله» عليك'],
    ['الحمدالله', 'الحمد لله'], ['الحمد الله', 'الحمد لله'], ['عبداله', 'عبدالله'], ['عبداله،', 'عبدالله،'], ['عبداله عبداله', 'عبدالله عبدالله'], ['عبد اله', 'عبد الله'],
    ['جزاك اله خير', 'جزاك الله خير'], ['بارك اله فيك', 'بارك الله فيك'], ['حبيبه قلبي', 'حبيبة قلبي'], ['غاليه عمري', 'غالية عمري'], ['قره عيني', 'قرة عيني'],
    ['انشـاء الله', 'إن شاء الله'],
  ];
  for (const [x, y] of T) assert.equal(fix(x), y, x);
  assert.equal(await ctx.spell('انا لله وانا اليه راجعون'), ISTIRJA, 'الاسترجاع برسم المصحف مشكولًا');
  assert.equal(fix('انشاء\nالله'), 'انشاء\nالله', 'العبارة لا تعبر سطرًا');
  assert.equal(fix('انشاء، الله'), 'انشاء، الله', 'ولا علامة ترقيم');
  for (const [x] of T) assert.equal(fix(fix(x)), fix(x), 'ثابت عند التكرار: ' + x);
});

test('never touched: dialect, names, hamza/madda, diacritics, gender', async () => {
  for (const t of ['مشكور اخوي', 'اخوي', 'امي', 'ابوي', 'هلا', 'شلونك', 'حبيبه', 'قلبه', 'محمد', 'سعيد', 'ريم', 'هند', 'احمد', 'شكراً اخوي', 'الحمدلله', 'عبدالله', 'إن شاء الله', 'اله', 'انشاء', 'ان', 'الله أكبر', 'يعطيك العافيه', 'على اليمين مشكور اخوي', 'عمران', 'أخوي', 'البَحر'])
    assert.equal(await ctx.spell(t), t, t);
  assert.equal(await ctx.spell('  مشكور اخوي  '), 'مشكور اخوي', 'تقليم الأطراف فقط');
  assert.equal(await ctx.spell('Thanks bro'), 'Thanks bro', 'بلا عربيّة كما هو');
});

test('guard: only the dictionary output is accepted — «اخوي→آخوي» and «عمران→عمرن» are rejected', async () => {
  const REJECT = [
    ['اخوي', 'آخوي'], ['اخوي', 'أخوي'], ['مشكور اخوي', 'مشكور آخوي'], ['مشكور اخوي', 'مشكور أخوي'], ['اخوي', 'أخي'], ['اخوي', 'خوي'], ['اخوي', 'اخوك'],
    ['مشكور', 'مشكوور'], ['مشكور', 'مشكورة'], ['مشكور', 'مَشْكُور'], ['شكراً اخوي', 'شكرًا أخوي'],
    ['محمد', 'أحمد'], ['سعيد', 'سعود'], ['ريم', 'مريم'], ['هند', 'هنا'], ['نوف', 'نور'], ['امي', 'أمي'], ['امي', 'آمي'], ['ابوي', 'أبوي'], ['هلا', 'أهلا'],
    ['حبيبه', 'حبيبة'], ['حبيبي', 'حبيبتي'], ['تسلم', 'تسلمي'], ['مبروك', 'مبارك'], ['عمران', 'عُمران'], ['عمران', 'عمرن'],
    ['انشاء الله', 'إنشاء الله'], ['عبداله', 'عبد الله'],
  ];
  const ACCEPT = [['حبيبه قلبي', 'حبيبة قلبي'], ['انشاء الله', 'إن شاء الله'], ['عبداله', 'عبدالله'], ['مشكور اخوي', 'مشكور اخوي'], ['الحمدالله', 'الحمد لله']];
  for (const [x, y] of REJECT) assert.equal(await allowed(x, y), false, x + ' → ' + y);
  for (const [x, y] of ACCEPT) assert.equal(await allowed(x, y), true, x + ' → ' + y);
});

test('no AI, no network, no timeout: the provider stub is never called and the old guard is gone', async () => {
  calls.length = 0;
  const t0 = Date.now();
  for (const t of ['مشكور اخوي', 'عبداله', 'انشاء الله يا اخوي']) await ctx.spell(t);
  assert.equal(calls.length, 0, 'لا نداء لمزوّد');
  assert.ok(Date.now() - t0 < 200, 'بلا مهلة ٦ ثوانٍ');
  const body = attach.slice(fStart, b);
  assert.doesNotMatch(body, /callProviderAI|groq|mistral|setTimeout|fetch\(/);
  assert.doesNotMatch(attach, /function __spellGuardOk|function __omLev|const __QURAN_FIXES/);
  /* النداءان باقيان كما هما: مسار الكتابة على صورة، ومسار التوليد */
  assert.match(attach, /if\(__resolvedText\) __resolvedText = await omranSpellFix\(__resolvedText\);/);
  assert.match(attach, /__genTextSpec\.exactText \? await omranSpellFix\(__genTextSpec\.exactText\)/);
});
