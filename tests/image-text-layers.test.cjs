'use strict';
/* v-text-layers — فيديو المالك (٢٦ سبتمبر) مقابل ChatGPT بالطلب نفسه:
   ١) «ابغي صوره مكتوب عليها ان الله و ان اليه واجعون و الصوره تعبر عن وفات شخص عزيز» ← أصيص ورد لا عزاء، والآية بأخطائها.
   ٢) «لا في الصوره بس مكتوب فيها ان الله وآنه اليه راجعون» ← الجديد فوق والقديم تحت (تراكم).
   ٣) «حوز الكلام الي تحت» ← نُفّذ نقلًا فتداخل النصّان. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseImageTextSpec } = require('../js/app-08-image-text.js');
const { buildGenerationPrompt } = require('../api/_lib/image-prompt');

// قيم سياق vm من «عالم» آخر — تُنسخ قيمًا عاديّة قبل المقارنة العميقة.
const plain = (x) => JSON.parse(JSON.stringify(x));
const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'js/app-09-attach.js'), 'utf8');

/* مساعدات الطبقة نفسها من ملفّ العميل، مع راسم وهميّ: «الصورة» نصّ JSON فيه الخلفيّة وقائمة النصوص المرسومة،
   و'auto' يختار الأعلى حين يكون الأسفل مشغولًا — كما يفعل الراسم الحقيقيّ بقياس تباين الشريطين. */
function loadLayerHelpers(){
  const lev = CLIENT.slice(CLIENT.indexOf('function __omLev('), CLIENT.indexOf('function __spellGuardOk('));
  const helpers = CLIENT.slice(CLIENT.indexOf('function __tlFp('), CLIENT.indexOf('/* v-edit-shrink'));
  const fixes = CLIENT.slice(CLIENT.indexOf('const __QURAN_FIXES = ['), CLIENT.indexOf('async function omranSpellFix('));
  assert.ok(lev && helpers.includes('function __tlKeep(') && fixes.includes('راجعون'), 'مساعدات الطبقة موجودة في العميل');
  const ctx = {
    enc: (o) => Buffer.from(JSON.stringify(o)).toString('base64'),
    dec: (b) => JSON.parse(Buffer.from(b, 'base64').toString()),
    overlayTextOnImage: async (b64, mime, txt, fontKey, color, position, info) => {
      const img = ctx.dec(b64);
      let pos = position;
      if(!pos || pos === 'auto') pos = img.texts.some(t => t.position === 'bottom') ? 'top' : 'bottom';
      if(info) info.position = pos;
      img.texts.push({ text: txt, position: pos });
      return ctx.enc(img);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(lev + helpers + fixes + '\nthis.fixes = __QURAN_FIXES; this.api = { __tlFp, __tlItems, __tlLive, __tlMake, __tlRender, __tlSimilar, __tlKeep };', ctx);
  return ctx;
}

test('the video conversation parses as: text + scene, then replace, then remove the bottom text', () => {
  const t1 = parseImageTextSpec('ابغي صوره مكتوب عليها ان الله و ان اليه واجعون و الصوره تعبر عن وفات شخص عزيز');
  assert.equal(t1.exactText, 'ان الله و ان اليه واجعون');
  assert.equal(t1.visualPrompt, 'الصوره تعبر عن وفات شخص عزيز', '«ابغي صوره» طلب عامّ لا يُلصق بوصف المشهد');
  const t2 = parseImageTextSpec('لا في الصوره بس مكتوب فيها ان الله وآنه اليه راجعون');
  assert.equal(t2.exactText, 'ان الله وآنه اليه راجعون');
  assert.equal(t2.replaceText, true, '«لا… بس مكتوب» استبدال للكتابة الموجودة');
  assert.equal(t2.visualEdit, null, '«لا في الصوره بس» مقدّمة تصحيح لا تعديل بصريّ');
  const t3 = parseImageTextSpec('حوز الكلام الي تحت');
  assert.equal(t3.removeText, true, '«حوز» حذف لا نقل');
  assert.equal(t3.styleEdit, undefined);
  assert.deepEqual(t3.removeTarget, { age: '', side: '', vertical: 'bottom' });
});

test('removal verbs and targets; unrelated words are not removals', () => {
  for (const p of ['حوّز الكلام اللي تحت', 'حذف الكلام اللي تحت', 'شل الكتابة', 'احذف الكلام']) assert.equal(parseImageTextSpec(p).removeText, true, p);
  assert.equal(parseImageTextSpec('امسح الكلام القديم').removeTarget.age, 'old');
  assert.equal(parseImageTextSpec('شيل الكتابة الجديدة').removeTarget.age, 'new');
  assert.equal(parseImageTextSpec('احذف الكلام').removeTarget, null, 'بلا هدف = كلّ الكتابة');
  assert.notEqual(parseImageTextSpec('صورة شلال هذا جميل').removeText, true, '«شلال» ليست «شل»');
  const swap = parseImageTextSpec('احذف الكلام واكتب عمران');
  assert.equal(swap.exactText, 'عمران');
  assert.equal(swap.replaceText, true);
  assert.equal(swap.visualEdit, null, 'شطر الحذف لا يُرسل للمولّد تعديلًا بصريًّا');
  const bg = parseImageTextSpec('غير الخلفية واكتب عليها عمران');
  assert.equal(bg.replaceText, undefined, '«غيّر الخلفية» ليست استبدال كتابة');
  assert.equal(bg.visualEdit, 'غير الخلفية');
});

test('scene tails beyond «الصورة تعبّر» stay visual; literal and quoted wording is never cut', () => {
  const base = 'ابغي صوره مكتوب عليها انا لله وانا اليه راجعون';
  for (const [tail, scene] of [[' والصورة حزينة', 'الصورة حزينة'], [' بخلفية مقبرة', 'بخلفية مقبرة'], [' عن وفاة شخص عزيز', 'عن وفاة شخص عزيز']]) {
    const s = parseImageTextSpec(base + tail);
    assert.equal(s.exactText, 'انا لله وانا اليه راجعون', tail);
    assert.equal(s.visualEdit, scene, tail);
  }
  assert.equal(parseImageTextSpec('اكتب عليها تعازينا عن وفاة الوالد').exactText, 'تعازينا عن وفاة الوالد', '«عن وفاة» يُقطع فقط بعد عبارة عزاء تامّة');
  assert.equal(parseImageTextSpec('اكتب عليها «الحب والصورة الجميلة»').exactText, 'الحب والصورة الجميلة', 'داخل الاقتباس لا يُقطع شيء');
});

test('a condolence phrase with no scene gets a quiet mourning scene, never a random one', () => {
  for (let i = 0; i < 12; i++) {
    const s = parseImageTextSpec('ابغي صوره مكتوب عليها إنا لله وإنا إليه راجعون');
    assert.equal(s.visualEdit, null);
    assert.match(s.visualPrompt, /^مشهد تعزية هادئ بلا أشخاص ولا وجوه/);
  }
});

test('server: condolence requests get a symbolic mourning direction, not a portrait or product polish', () => {
  const p = buildGenerationPrompt('الصوره تعبر عن وفات شخص عزيز', { reserveTextArea: true, textPosition: 'bottom' });
  assert.match(p, /quiet, dignified condolence composition/);
  assert.match(p, /Show no faces, portraits or identifiable people/);
  assert.doesNotMatch(p, /portrait treatment|SIGNATURE POLISH|product hero render/);
  const person = buildGenerationPrompt('صورة شخص يمشي في الحديقة');
  assert.match(person, /portrait treatment/, 'غير العزاء كما كان');
  assert.match(person, /SIGNATURE POLISH/);
  assert.doesNotMatch(buildGenerationPrompt('صورة محل حداد يصنع بابًا'), /condolence/, '«حداد» مهنة واسم عائلة لا عزاء');
});

test('the verse of return is spelled correctly from every common misspelling', () => {
  const { fixes } = loadLayerHelpers();
  const fix = (t) => fixes.reduce((s, [re, rep]) => s.replace(re, rep), t);
  for (const typo of ['ان الله و ان اليه واجعون', 'ان الله وآنه اليه راجعون', 'انا لله وانا اليه راجعون', 'إنا لله و إنا إليه راجعون', 'انا الله وانا اليه رجعون', 'إنّا لله وإنّا إليه لراجعون']) {
    assert.equal(fix(typo), 'إنا لله وإنا إليه راجعون', typo);
  }
  assert.equal(fix('عمران'), 'عمران');
  assert.equal(fix('ان الله غفور رحيم'), 'ان الله غفور رحيم', 'آية أخرى لا تُمسّ');
});

test('layers: a correction replaces the old text on the clean base instead of stacking', async () => {
  const ctx = loadLayerHelpers(), L = ctx.api;
  const base = ctx.enc({ bg: 'clean', texts: [] });
  const r1 = await L.__tlRender(base, 'image/png', [{ text: 'ان الله و ان اليه واجعون', position: 'bottom' }]);
  const layer1 = L.__tlMake(base, 'image/png', r1.items, r1.b64);
  assert.equal(L.__tlLive(layer1, r1.b64), true, 'الصورة الحاليّة ناتج الطبقة');
  assert.equal(L.__tlLive(layer1, base), false, 'بعد تراجع أو تعديل بالذكاء لا تُستعمل الطبقة');
  // الدور الثاني: «لا… بس مكتوب فيها X» = X وحده على الأساس النظيف
  const r2 = await L.__tlRender(layer1.baseB64, layer1.baseMime, [{ text: 'إنا لله وإنا إليه راجعون', position: 'auto' }]);
  assert.deepEqual(ctx.dec(r2.b64).texts, [{ text: 'إنا لله وإنا إليه راجعون', position: 'bottom' }], 'لا أثر للنصّ القديم');
  assert.equal(ctx.dec(r2.b64).bg, 'clean');
  // تصحيح بلا «لا/بس» يُعرف بالشبه، واسمٌ مختلف ليس تصحيحًا
  assert.equal(L.__tlSimilar('ان الله و ان اليه واجعون', 'إنا لله وإنا إليه راجعون'), true);
  assert.equal(L.__tlSimilar('إنا لله وإنا إليه راجعون', 'عمران'), false);
});

test('layers: two texts, then «remove the bottom / old / new» removes only that one', async () => {
  const ctx = loadLayerHelpers(), L = ctx.api;
  const base = ctx.enc({ bg: 'clean', texts: [] });
  const r = await L.__tlRender(base, 'image/png', [{ text: 'القديم', position: 'bottom' }, { text: 'الجديد', position: 'auto' }]);
  assert.deepEqual(plain(r.items.map(i => i.position)), ['bottom', 'top'], 'الموضع الفعليّ لـauto يُحفظ');
  const layer = L.__tlMake(base, 'image/png', r.items, r.b64);
  assert.equal(layer.text, 'الجديد', 'حقول المستوى الأعلى تعكس آخر نصّ (توافق قديم)');
  const items = L.__tlItems(layer);
  assert.deepEqual(plain(L.__tlKeep(items, parseImageTextSpec('حوز الكلام الي تحت').removeTarget).map(i => i.text)), ['الجديد']);
  assert.deepEqual(plain(L.__tlKeep(items, parseImageTextSpec('امسح الكلام القديم').removeTarget).map(i => i.text)), ['الجديد']);
  assert.deepEqual(plain(L.__tlKeep(items, parseImageTextSpec('شيل الكتابة الجديدة').removeTarget).map(i => i.text)), ['القديم']);
  assert.deepEqual(plain(L.__tlKeep(items, parseImageTextSpec('احذف الكلام').removeTarget)), []);
  assert.equal(L.__tlKeep([items[1]], { age: '', side: '', vertical: 'bottom' }), null, 'لا نصّ من طبقتنا تحت ⇒ يسقط لمسار التعديل');
  const kept = await L.__tlRender(layer.baseB64, layer.baseMime, L.__tlKeep(items, { age: '', side: '', vertical: 'bottom' }));
  assert.deepEqual(ctx.dec(kept.b64).texts, [{ text: 'الجديد', position: 'top' }], 'يُعاد رسم الباقي في مكانه على الأساس النظيف');
  // طبقة قديمة محفوظة قبل هذا الإصدار (نصّ واحد بلا items ولا outFp) تبقى مقروءة
  assert.deepEqual(plain(L.__tlItems({ baseB64: base, text: 'نص', fontKey: 'k', color: '#fff', position: 'bottom' }).map(i => i.text)), ['نص']);
});

test('client wiring: new text draws on the clean base, AI never paints over our layer, every path spell-checks', () => {
  assert.match(CLIENT, /const __tl = \(!__isNewImageSource && __tlLive\(cur\.imageTextLayer, __b64\)\) \? cur\.imageTextLayer : null;/);
  assert.match(CLIENT, /let __wb64 = __tl \? __tl\.baseB64 : __b64, __wmime = __tl \? __tl\.baseMime : __mime;/);
  assert.match(CLIENT, /if\(__tl\) throw \{ __localFont: true \};/);
  assert.match(CLIENT, /const __replaceAll = !!\(__textSpec\.replaceText \|\| __nameSwap\);/);
  assert.match(CLIENT, /cur\.imageTextLayer = __newLayer;/, 'ما رسمه الذكاء ليس طبقة — لا أساس ملوّث');
  assert.match(CLIENT, /const __overlayText = textSpec\.exactText \? await omranSpellFix\(textSpec\.exactText\)/, 'وضع الصورة يدقّق الإملاء أيضًا');
  assert.match(CLIENT, /if\(info\) info\.position = position;/);
  assert.doesNotMatch(CLIENT, /cur\.imageTextLayer = \{ baseB64:__wb64/, 'لا حفظ لصورة فيها كتابة قديمة أساسًا نظيفًا');
});
