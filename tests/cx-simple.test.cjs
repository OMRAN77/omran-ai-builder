// tests/cx-simple.test.cjs — v-cx-simple (الطبقتان ٢ و٣ من تبسيط المقاولات، بعد v-cx-brief):
// ستّ بطاقات بدء تملأ النموذج بضغطة، وكلّ الأقسام تُطوى تحت «تفاصيل أكثر ▾» ويبقى ظاهرًا ما
// يغيّره الناس فعلًا (الأدوار والمساحة). يثبّت: أنّ شيئًا لم يُحذف (العقد تُنقل لا تُبنى)،
// وأنّ البطاقة بداية نظيفة (ملاحق الاختيار السابق تُطفأ)، وأنّ زرّ التوليد يبقى ظاهرًا،
// وأنّ أسماء البطاقات تأتي من النموذج نفسه فتُترجم مجّانًا، والـ14 لغة.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const SRC = read('js/app-15-cx-simple.js');
const PARTIAL = read('js/partials-core.js');

/** يقيّم كتلة من المصدر الحقيقيّ في vm ويعيد ما صدّرته على this */
function evalBlock(startMark, endMark, extra, keepEnd) {
  const i = SRC.indexOf(startMark);
  let j = SRC.indexOf(endMark, i);
  assert.ok(i > 0 && j > i, 'الكتلة غير موجودة: ' + startMark);
  if (keepEnd) j += endMark.length;
  const ctx = Object.assign({}, extra || {});
  vm.runInNewContext(SRC.slice(i, j) + '\n' + (extra && extra.__tail ? extra.__tail : ''), ctx);
  return ctx;
}

test('١. القيَم الشائعة: ستّ بطاقات، ومفاتيحها كلّها موجودة في النموذج نفسه', () => {
  const ctx = evalBlock('var PRESETS = [', '\n  ];', { __tail: 'this.PRESETS = PRESETS;' }, true);
  const P = ctx.PRESETS;
  assert.equal(P.length, 6);
  assert.equal(P.map((p) => p.type).join(','), 'villa,rest,annexhome,apartment,shop,mosque');
  const brief = require('../api/_lib/construction-brief.js');
  for (const p of P) {
    assert.ok(brief.TYPES.includes(p.type), 'نوع مجهول: ' + p.type);
    assert.ok(brief.STYLES.includes(p.style), 'طراز مجهول: ' + p.style);
    for (const a of p.annexes) assert.ok(brief.ANNEXES.includes(a), 'ملحق مجهول: ' + a);
    assert.ok(p.floors >= 1 && p.floors <= 60, 'أدوار خارج حدّ النموذج: ' + p.type);
    assert.ok(p.area >= 20 && p.area <= 100000, 'مساحة خارج حدّ النموذج: ' + p.type);
    // والقيمة موجودة فعلًا كخيار في القائمة المعروضة
    assert.ok(PARTIAL.includes('value="' + p.type + '"'), 'النوع ليس خيارًا في النموذج: ' + p.type);
    assert.ok(PARTIAL.includes('value="' + p.style + '"'), 'الطراز ليس خيارًا في النموذج: ' + p.style);
  }
});

test('٢. لا حذف ولا بناء: العقد تُنقل، وزرّ التوليد والأرقام خارج المطويّ', () => {
  // الأقسام تُنقل بـappendChild لا تُنسخ ولا تُفرَّغ
  assert.match(SRC, /secs\.forEach\(function\(s\)\{ more\.appendChild\(s\); \}\);/);
  assert.ok(!/innerHTML\s*=\s*''/.test(SRC), 'لا تفريغ لأيّ عقدة قائمة');
  assert.ok(!/\.remove\(\)/.test(SRC.replace("$('cxStartQuick').remove();", '')), 'لا حذف إلّا لحاوية فارغة من صنعنا');
  // صفّ الأدوار والمساحة يُنقل كما هو (لا نسخة ثانية للحالة)
  assert.match(SRC, /\$\('cxStartQuick'\)\.appendChild\(row\)/);
  assert.match(SRC, /row\.contains\(\$\('constructionArea'\)\)/, 'يتحقّق أنّه الصفّ الصحيح قبل النقل');
  // بنية غير متوقّعة = لا نلمس شيئًا
  assert.match(SRC, /if\(secs\.length < 3\) return;/);
  assert.match(SRC, /if\(!brief\) return;/, 'لا يركّب قبل الطبقة ١');
  // المطويّ يبدأ مخفيًّا ويُدرج بعد بطاقة البدء — فزرّ التوليد وما بعده يبقى ظاهرًا
  assert.match(SRC, /more\.style\.display = 'none';/);
  assert.match(SRC, /box\.insertAdjacentElement\('afterend', more\);/);
  // المخرجات لم تُمسّ افتراضاتها (تغييرها كلفة توليد = باب المالك): سطر «ما في الداخل» يقرؤها ولا يكتبها —
  // الكتابة الوحيدة على خانة في الملفّ كلّه هي ملاحق البطاقة (applyAnnexes)
  const writes = SRC.replace(/\/\*[\s\S]*?\*\//g, '').match(/\.checked\s*=[^=]/g) || [];
  assert.equal(writes.length, 1, 'كتابة واحدة فقط على .checked: ' + writes.join(' | '));
  assert.match(SRC, /if\(box\.checked !== on\)\{ box\.checked = on;/, 'وهي ملاحق البطاقة');
});

test('٣. البطاقة بداية نظيفة: ملاحقها تُشعل وما عداها يُطفأ', () => {
  const ctx = evalBlock('function applyAnnexes(list){', 'function apply(p, st)', {
    document: { querySelectorAll: () => ctx.boxes },
    __tail: 'this.applyAnnexes = applyAnnexes;',
  });
  const boxes = [
    { value: 'majlis', checked: true, dispatchEvent() {} },
    { value: 'pool', checked: false, dispatchEvent() {} },
    { value: 'solar', checked: true, dispatchEvent() {} },
  ];
  ctx.boxes = boxes;
  ctx.fire = () => {};
  ctx.applyAnnexes(['pool']);
  assert.equal(boxes.map((b) => b.value + ':' + b.checked).join(' '), 'majlis:false pool:true solar:false');
  ctx.applyAnnexes([]);
  assert.equal(boxes.map((b) => b.checked).join(','), 'false,false,false', 'قائمة فارغة تُطفئ الكلّ');
});

test('٤. أسماء البطاقات من النموذج نفسه — لا جدول ترجمة ثانٍ', () => {
  assert.match(SRC, /function optText\(selId, value\)/);
  assert.match(SRC, /optText\('constructionType', p\.type\)/, 'اسم البطاقة من خيار القائمة');
  assert.match(SRC, /optText\('constructionStyle', p\.style\)/, 'الطراز في الملخّص من القائمة');
  // الإيموجي يُفصل عن الاسم بتعبير يونيكودي لا بقصّ ثابت
  assert.match(SRC, /Extended_Pictographic/);
  // v-fx-simple: كود «تذكّر الإمارة» كان ميّتًا — #constructionEmirate حُذف من الواجهة (v-cx-noprice)
  assert.ok(!/constructionEmirate|EMIRATE_KEY/.test(SRC), 'لا كود لعنصر غير موجود');
  assert.ok(!/id="constructionEmirate"|id="constructionBudget"/.test(PARTIAL), 'الواجهة فعلًا بلا إمارة ولا ميزانيّة');
  // سطر «ما في الداخل» تحت زرّ التفاصيل — من نصوص النموذج نفسها
  assert.match(SRC, /id="cxMorePeek"/);
  assert.match(SRC, /function peek\(\)\{/);
  assert.match(SRC, /sel\('constructionType'\)/);
  assert.match(SRC, /sel\('constructionStyle'\)/);
  assert.match(SRC, /'🏠 ' \+ ann \+ '\/' \+ all/);
  assert.match(SRC, /modal\.addEventListener\('change', function\(\)\{ requestAnimationFrame\(render\); \}\);/, 'السطر يتبع كلّ تغيير');
});

test('٥. النصوص بالـ14 لغة وبلا اسم مزوّد', () => {
  const ctx = evalBlock('var TX = {', '\n  };', { __tail: 'this.TX = TX;' }, true);
  const LANGS = ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml'];
  const keys = Object.keys(ctx.TX);
  assert.equal(keys.slice().sort().join(','), 'less,more,ready,start');
  for (const k of keys) {
    assert.equal(Object.keys(ctx.TX[k]).sort().join(','), LANGS.slice().sort().join(','), 'لغات ناقصة في: ' + k);
    for (const l of LANGS) {
      assert.ok(String(ctx.TX[k][l]).trim(), 'فارغ: ' + k + '/' + l);
      assert.ok(!/veo|runway|minimax|gemini|claude|gpt/i.test(ctx.TX[k][l]), 'اسم مزوّد في ' + k + '/' + l);
    }
  }
  assert.ok(ctx.TX.ready.ar.includes('{s}'));
});

test('٦. الحزمة مبنيّة، والترتيب: الوصف ← السطر ← البطاقات ← المطويّ', () => {
  const b = read('js/app.bundle.js');
  assert.ok(b.includes("box.id = 'cxStart'"), 'الجزء داخل الحزمة');
  assert.ok(b.includes("box.id = 'cxBrief'"), 'الطبقة ١ داخل الحزمة');
  // السطر يُدرج بعد الوصف، والبطاقات بعد السطر، والمطويّ بعد البطاقات
  assert.match(read('js/app-15-cx-brief.js'), /desc\.insertAdjacentElement\('afterend', box\);/);
  assert.match(SRC, /brief\.insertAdjacentElement\('afterend', box\);/);
  // والمعرض باقٍ آخر النافذة (v-cx-brief)
  assert.match(read('js/app-15-cx-ideas.js'), /tail\.insertAdjacentElement\('afterend', box\);/);
});
