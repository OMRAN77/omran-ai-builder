// tests/studio-variety.test.cjs — v-studio-variety (٢٨ سبتمبر ٢٠٢٦): شكوى المالك «عندي أنواع في
// الاستايل لكن لمّا أختار شيئًا كلّهم نوع واحد… وفي الحنّاء مع أنّ فيها اختيارات كلّهم نفس الشيء».
// السبب الجذريّ ثلاثة أشياء يقفلها هذا الاختبار:
//   (١) قالب الحنّاء كان يفرض «reddish-brown» على كلّ خيار — فالبيضاء والخضاب الأسود يخرجان بنّيّين.
//   (٢) أوصاف الخيارات كانت سطرًا عامًّا قصيرًا متشابهًا (مكياج: طبيعي/سوفت قلام/ديوي…).
//   (٣) الخيار نفسه كان يعطي التصميم نفسه حرفيًّا كلّ مرّة (أمر ثابت + حرارة ٠٫١٥).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-studio-variety';
const studioCreate = require(path.join(root, 'api/_lib/studio-create.js'));
const studioMore = require(path.join(root, 'api/_lib/studio-more.js'));

/* خيارات الواجهة للميزات الأربع عشرة (ملفّ بيانات عميل: window.__STUDIO_MORE) */
function clientMore() {
  const sandbox = { window: {} };
  const src = fs.readFileSync(path.join(root, 'js/app-12-studio-more.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(sandbox.window);
  return sandbox.window.__STUDIO_MORE;
}
/* خيارات المكياج في الواجهة الأساسيّة (app-13-stocks-init.js) */
function clientMakeupValues() {
  const src = fs.readFileSync(path.join(root, 'js/app-13-stocks-init.js'), 'utf8');
  const block = src.slice(src.indexOf('    makeup: ['));
  const list = block.slice(0, block.indexOf('    ],'));
  return (list.match(/value:'([a-zA-Z0-9]+)'/g) || []).map((m) => m.slice(7, -1));
}

test('قالب الحنّاء لا يفرض لونًا — اللون من الخيار نفسه', () => {
  const instr = studioMore.FEATURE_INSTRUCTIONS.henna('X');
  assert.ok(!/reddish-brown/.test(instr), 'القالب ما زال يفرض reddish-brown على كلّ الخيارات');
  assert.match(instr, /colour, pattern and placement described/, 'القالب يجب أن يحيل اللون والنقش إلى الخيار');

  const white = studioCreate.buildSinglePrompt('henna', 'whitehenna', '', false, 1);
  assert.ok(!/reddish-brown/.test(white), 'الحنّاء البيضاء يجب ألّا يصلها أمر بنّيّ');
  assert.match(white, /bright white/, 'الحنّاء البيضاء بلا وصف أبيض صريح');

  const black = studioCreate.buildSinglePrompt('henna', 'khidab', '', false, 1);
  assert.ok(!/reddish-brown/.test(black), 'الخضاب الأسود يجب ألّا يصلها أمر بنّيّ');
  assert.match(black, /glossy black/, 'الخضاب بلا وصف أسود صريح');
});

test('كلّ خيارات الحنّاء والمكياج أوصافها مميّزة ومفصّلة (لا سطر عامّ متكرّر)', () => {
  const groups = { henna: studioMore.STYLE_PROMPTS.henna, makeup: studioCreate.STYLE_TEXT.makeup };
  for (const [feature, map] of Object.entries(groups)) {
    const seen = new Set();
    for (const [k, v] of Object.entries(map)) {
      assert.ok(v.length >= 80, feature + '/' + k + ': الوصف أقصر من أن يُفرّق (' + v.length + ' حرفًا)');
      assert.ok(!seen.has(v), feature + '/' + k + ': وصف مكرّر حرفيًّا');
      seen.add(v);
    }
  }
});

test('بذرة التنويع: الخيار نفسه يعطي أمرًا مختلفًا كلّ مرّة لميزات الرسم', () => {
  for (const feature of studioCreate.DESIGN_FEATURES) {
    const style = Object.keys(studioCreate.STYLE_TEXT[feature])[0];
    const a = studioCreate.buildSinglePrompt(feature, style, '', false, 1);
    const b = studioCreate.buildSinglePrompt(feature, style, '', false, 2);
    assert.match(a, /VARIETY \(design seed #1\)/, feature + ': لا بذرة تنويع في الأمر');
    assert.notEqual(a, b, feature + ': بذرتان مختلفتان تعطيان الأمر نفسه');
    assert.match(a, /brand-new original/, feature + ': لا طلب تصميم جديد');
    // التنويع لا يُفلت الستايل المختار
    assert.match(a, /exactly as asked/, feature + ': التنويع بلا قيد يحفظ الخيار');
  }
  // المكياج على الوجه — بلا بذرة (قفل الهويّة أولى)
  assert.ok(!/VARIETY/.test(studioCreate.buildSinglePrompt('makeup', 'coral', '', false, 1)), 'المكياج لا يأخذ بذرة تنويع');
});

test('خيارات الواجهة والخادم متطابقة بعد الإضافة (حنّاء ١٢، مكياج ١٤)', () => {
  const more = clientMore();
  for (const feature of Object.keys(more.options)) {
    const cli = more.options[feature].map((o) => o.value);
    const srv = Object.keys(studioMore.STYLE_PROMPTS[feature] || {});
    assert.deepEqual(cli.slice().sort(), srv.slice().sort(), feature + ': خيارات الواجهة لا تطابق الخادم');
  }
  assert.equal(Object.keys(studioMore.STYLE_PROMPTS.henna).length, 12, 'خيارات الحنّاء يجب أن تكون ١٢');
  assert.deepEqual(
    clientMakeupValues().slice().sort(),
    Object.keys(studioCreate.STYLE_TEXT.makeup).slice().sort(),
    'خيارات المكياج في الواجهة لا تطابق الخادم',
  );
});

/* ───── v-studio-more-looks: «ولّد المعاينات» + «زيد الأشكال» (أمر المالك ٢٨ سبتمبر) ───── */
const studioStyles = require(path.join(root, 'api/_lib/studio-styles.js'));
const app13 = fs.readFileSync(path.join(root, 'js/app-13-stocks-init.js'), 'utf8');
function clientBaseValues(feature) {
  const block = app13.slice(app13.indexOf('    ' + feature + ': ['));
  const list = block.slice(0, block.indexOf('    ],'));
  return (list.match(/value:'([A-Za-z0-9]+)'/g) || []).map((m) => m.slice(7, -1));
}

test('ملفّ أوصاف الميزات الأساسيّة بيانات صرف — لا أسرار ولا قراءة بيئة في نطاق الوحدة', () => {
  const src = fs.readFileSync(path.join(root, 'api/_lib/studio-styles.js'), 'utf8');
  assert.ok(!/process\.env/.test(src), 'ملفّ البيانات يقرأ البيئة — مولّد المعاينات يُحمَّل في بيئة عارية');
  assert.ok(!/require\(/.test(src), 'ملفّ البيانات يجب أن يبقى بلا اعتماديّات');
  assert.equal(studioStyles.STYLE_TEXT.makeup.natural, require(path.join(root, 'api/_lib/studio-create.js')).STYLE_TEXT.makeup.natural, 'studio-create لا يقرأ من ملفّ البيانات نفسه');
});

test('مولّد المعاينات يشمل الميزات الأساسيّة بتأطير يُظهر الميزة', () => {
  const prev = fs.readFileSync(path.join(root, 'api/_lib/studio-preview.js'), 'utf8');
  assert.match(prev, /require\('\.\/studio-styles\.js'\)/, 'studio-preview لا يعرف الميزات الأساسيّة');
  assert.match(prev, /MORE\.STYLE_PROMPTS\[feature\] \|\| BASE\.STYLE_TEXT\[feature\]/, 'القائمة البيضاء لا تشمل الأساسيّة');
  assert.match(prev, /feature === 'anime' \? 'A character illustration of '/, 'الأنمي يجب ألّا يُطلب كصورة فوتوغرافيّة');
  for (const feature of Object.keys(studioStyles.STYLE_TEXT)) {
    assert.ok(studioStyles.PREVIEW_FRAME[feature], feature + ': لا تأطير معاينة');
    assert.ok(studioStyles.PREVIEW_FEATURE_NAME[feature], feature + ': لا اسم ميزة للمعاينة');
    assert.ok((studioStyles.PREVIEW_SUBJECT[feature] || {}).__tab, feature + ': لا نموذج معاينة افتراضيّ');
  }
  // المكياج والبشرة قريبان من الوجه — لا لقطة جسم كامل تُخفي الميزة
  assert.match(studioStyles.PREVIEW_FRAME.makeup, /close-up/, 'تأطير المكياج يجب أن يكون وجهًا قريبًا');
  assert.match(studioStyles.PREVIEW_FRAME.nails, /close-up/, 'تأطير الأظافر يجب أن يكون يدًا قريبة');
});

test('المكياج يأخذ المعاينة المولّدة أوّلًا (صوره الجاهزة جسم كامل لا يظهر فيها)', () => {
  assert.match(app13, /const PREVIEW_FIRST = \['makeup'\]/, 'لا قائمة معاينة-أوّلًا');
  assert.match(app13, /function optionImgs\(f, v\)/, 'لا دالّة اختيار صورة الخيار');
  assert.match(app13, /PREVIEW_FIRST\.indexOf\(f\) !== -1 \? \{ img: gen, img2: asset \}/, 'الترتيب معكوس');
  assert.ok(!/img: 'assets\/studio\/options\/' \+ feature \+ '-' \+ opt\.value/.test(app13), 'المنتقي ما زال يثبّت الصورة الجاهزة');
});

test('دفعة الأشكال الجديدة: كلّ ميزة أساسيّة توسّعت وخياراتها مطابقة بين الواجهة والخادم', () => {
  const MIN = { hair: 28, nails: 24, makeup: 22, beard: 16, skin: 12, glasses: 18, tattoo: 16, anime: 16, heritage: 18 };
  for (const [feature, min] of Object.entries(MIN)) {
    const srv = Object.keys(studioStyles.STYLE_TEXT[feature]);
    assert.ok(srv.length >= min, feature + ': ' + srv.length + ' خيارًا فقط (المطلوب ' + min + ')');
    assert.deepEqual(clientBaseValues(feature).slice().sort(), srv.slice().sort(), feature + ': خيارات الواجهة لا تطابق الخادم');
    for (const [k, v] of Object.entries(studioStyles.STYLE_TEXT[feature])) {
      assert.ok(v.length >= 30, feature + '/' + k + ': وصف قصير جدًّا');
    }
  }
  const MORE_MIN = { hijab: 12, gulfmen: 12, wedding: 12, accessories: 12, background: 12, iconic: 12, henna: 12 };
  for (const [feature, min] of Object.entries(MORE_MIN)) {
    assert.ok(Object.keys(studioMore.STYLE_PROMPTS[feature]).length >= min, feature + ': لم تتوسّع إلى ' + min);
  }
});

test('الخيارات الجديدة مترجَمة بالـ١٤ لغة، ولها نموذج معاينة', () => {
  const LANGS = ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml'];
  const more = clientMore();
  const NEW_HENNA = ['moroccan', 'cuff', 'fingertips', 'glitterhenna'];
  for (const value of NEW_HENNA) {
    const opt = more.options.henna.find((o) => o.value === value);
    assert.ok(opt, value + ': لا خيار في الواجهة');
    for (const lg of LANGS) assert.ok(opt[lg] && opt[lg].trim(), value + ': ناقص ترجمة ' + lg);
    assert.ok(studioMore.PREVIEW_SUBJECT.henna[value], value + ': لا نموذج معاينة في PREVIEW_SUBJECT');
  }
  const NEW_MAKEUP = ['coral', 'goldeye', 'glassskin', 'berry'];
  const src = fs.readFileSync(path.join(root, 'js/app-13-stocks-init.js'), 'utf8');
  for (const value of NEW_MAKEUP) {
    assert.ok(studioCreate.STYLE_TEXT.makeup[value], value + ': لا أمر خادم');
    assert.match(src, new RegExp("value:'" + value + "'"), value + ': لا خيار في الواجهة');
  }
});
