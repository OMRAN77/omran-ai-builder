// tests/trend-scenes.test.cjs — v-trend-scenes (١٨ أكتوبر ٢٠٢٦).
// المالك: «في ترند قصة بيكسار من ٣ مشاهد، مشاهده الثلاثة ثابتة (صباح، مدرسة، مساء)، واللي يكتبه المستخدم في «اكتب اللي
// تبيه» ينضاف بعدها بس. كتبت مشهدين عن البحر وطلع الفيديو عن المدرسة». المطلوب: خانات مشاهد تتعدّل بنصّها الافتراضيّ،
// و«المشهد الأول: … المشهد الثاني: …» في «اكتب اللي تبيه» تحلّ محلّ المشاهد وعدد الفيديوهات بعددها، و«ضعه في وصف المشهد»
// في مساعد الكتابة يعبّي الخانات، واختبار: نصّ عن البحر فلا تطلع school ولا classroom في الأمر.
'use strict';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const VT = require(rp('api/_lib/video-trends.js'));
const { TRENDS, buildTrendPrompt, splitScenes } = VT;
const LANGS = ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ml', 'ne', 'fil', 'id', 'zh', 'ru', 'tr', 'es'];
const SCHOOL = /school|classroom/i;

/* نصّ المالك: مشهدان عن البحر في «اكتب اللي تبيه» */
const SEA = 'المشهد الأول: سالم يركض على شاطئ البحر ويجمع الصدف وقت الغروب.\nالمشهد الثاني: سالم يركب قارب صيد صغير مع أبوه ويشوفون الدلافين تقفز حولهم';

test('١. (طلب المالك) نصّ عن البحر في «اكتب اللي تبيه»: مشهدان لا ثلاثة، ولا school ولا classroom في أيّ أمر', () => {
  const prompts = [];
  for (let i = 0; i < 3; i++) {
    const out = buildTrendPrompt('pixarstory', { name: 'سالم', text: 'سالم', extra: SEA, sceneIndex: i, hasImage: true, bg: 4 });
    assert.equal(out.sceneCount, 2, 'عدد الفيديوهات بعدد مشاهد المستخدم');
    assert.doesNotMatch(out.prompt, SCHOOL, 'المدرسة رجعت في المشهد ' + (i + 1));
    assert.doesNotMatch(out.prompt, /wakes up smiling|returns home in the evening/, 'مشهد افتراضيّ في المشهد ' + (i + 1));
    prompts.push(out.prompt);
  }
  assert.match(prompts[0], /scene 1 of 2: سالم يركض على شاطئ البحر ويجمع الصدف وقت الغروب\. Main character/);
  assert.match(prompts[1], /scene 2 of 2: سالم يركب قارب صيد صغير مع أبوه ويشوفون الدلافين تقفز حولهم\. Main character/);
  assert.equal(prompts[2], prompts[1], 'رقم مشهد أكبر من العدد (عميل قديم في الذاكرة) يُقصر على آخر مشهد للمستخدم لا على المدرسة');
  // المشاهد لا تُلحق مرّة ثانية «توجيهًا» — كلّ مقطع فيه مشهده وحده
  assert.ok(!prompts[0].includes('قارب صيد') && !prompts[1].includes('شاطئ البحر'), 'مشهد الآخر تسرّب للمقطع');
  assert.ok(!/USER DIRECTION/.test(prompts[0]), 'لا توجيه فارغ');
});

test('٢. خانات المشاهد (params.scenes): نصّ المستخدم يحلّ محلّ المشهد، والرقم مشهد افتراضيّ لم يُعدَّل', () => {
  const sea = ['سالم يبني قلعة رمل على الشاطئ', 'موجة تهدم القلعة وسالم يضحك'];
  for (let i = 0; i < 2; i++) {
    const out = buildTrendPrompt('pixarstory', { name: 'سالم', scenes: sea, sceneIndex: i });
    assert.equal(out.sceneCount, 2);
    assert.doesNotMatch(out.prompt, SCHOOL);
    assert.ok(out.prompt.includes('scene ' + (i + 1) + ' of 2: ' + sea[i] + '. '));
  }
  // تعديل المشهد الثاني وحده: الأوّل والثالث بأمرهما الإنجليزيّ كما كان
  const mix = (i) => buildTrendPrompt('pixarstory', { name: 'ريم', scenes: [0, 'ريم تسبح مع السلاحف في بحر صافي', 2], sceneIndex: i }).prompt;
  assert.match(mix(0), /scene 1 of 3: ريم wakes up smiling to the alarm clock/);
  assert.match(mix(1), /scene 2 of 3: ريم تسبح مع السلاحف في بحر صافي\. /);
  assert.doesNotMatch(mix(1), SCHOOL);
  assert.match(mix(2), /scene 3 of 3: ريم returns home in the evening/);
  // مدخلات غريبة تُسقط: فارغ، رقم خارج المدى، كسر، كائن — والحدّ ٥
  const junk = buildTrendPrompt('pixarstory', { scenes: ['', '   ', 7, -1, 1.5, { a: 1 }, null, 'قارب في البحر'] });
  assert.equal(junk.sceneCount, 1);
  assert.match(junk.prompt, /^Pixar-style 3D animated scene: قارب في البحر\. Main character: a cheerful child, the SAME/, 'مشهد واحد بلا «1 of 1» وبلا «named ,»');
  const many = buildTrendPrompt('pixarstory', { scenes: ['أ', 'ب', 'ج', 'د', 'ه', 'و', 'ز'] });
  assert.equal(many.sceneCount, VT.MAX_SCENES);
  // كلّها فارغة = الافتراضيّ
  assert.equal(buildTrendPrompt('pixarstory', { scenes: ['', ' '], sceneIndex: 1 }).sceneCount, 3);
  // مشاهد «اكتب اللي تبيه» تغلب الخانات (هي آخر ما كتبه المستخدم صراحةً)
  const both = buildTrendPrompt('pixarstory', { scenes: ['خانة'], extra: SEA, sceneIndex: 0 });
  assert.equal(both.sceneCount, 2);
  assert.ok(both.prompt.includes('شاطئ البحر') && !both.prompt.includes('خانة'));
});

test('٣. بلا مشاهد من المستخدم: السلوك القديم حرفيًّا (ثلاثة، والمدرسة في الثاني)، و«زي المشهد الأول بس بالليل» لا تُقسَم', () => {
  const p = (i, extra) => buildTrendPrompt('pixarstory', { name: 'سالم', sceneIndex: i, extra });
  assert.equal(p(0).sceneCount, 3);
  assert.match(p(1).prompt, /^Pixar-style 3D animated scene 2 of 3: سالم arrives at school, greets friends in a bright classroom/);
  assert.equal(p(0).prompt.indexOf('Pixar-style 3D animated scene 1 of 3: سالم wakes up smiling'), 0);
  const ref = p(2, 'زي المشهد الأول بس بالليل');
  assert.equal(ref.sceneCount, 3, 'إشارة لمشهد ليست قائمة مشاهد');
  assert.match(ref.prompt, /USER DIRECTION[^]*زي المشهد الأول بس بالليل/);
  // الترندات الأخرى: «اكتب اللي تبيه» كما كان (لا تقسيم ولا عدد)
  const dance = buildTrendPrompt('dance', { extra: SEA });
  assert.equal(dance.sceneCount, 1);
  assert.ok(dance.prompt.includes('USER DIRECTION'));
  assert.ok(!/\{n\}|\{i\}/.test(buildTrendPrompt('pixarstory', {}).prompt));
});

test('٤. splitScenes: صيغ العلامة بالعربيّ والإنجليزيّ وغيرهما، وما لا يُعدّ علامة', () => {
  const S = (x) => splitScenes(x).scenes;
  assert.deepEqual(splitScenes(SEA), { scenes: ['سالم يركض على شاطئ البحر ويجمع الصدف وقت الغروب.', 'سالم يركب قارب صيد صغير مع أبوه ويشوفون الدلافين تقفز حولهم'], rest: '' });
  assert.deepEqual(S('المشهد الاول: أ المشهد الثانى: ب المشهد الثالث: ج'), ['أ', 'ب', 'ج'], 'بلا همزة وبألف مقصورة');
  assert.deepEqual(S('المشهد الأوّل - أ\nالمشهد الثاني - ب'), ['أ', 'ب'], 'بشدّة وشرطة');
  assert.deepEqual(S('مشهد ١: أ\nمشهد ٢: ب'), ['أ', 'ب'], 'أرقام عربيّة');
  assert.deepEqual(S('المشهد رقم 1: أ. المشهد رقم 2: ب'), ['أ.', 'ب']);
  assert.deepEqual(S('المشهد الأول\nسالم على البحر\nالمشهد الثاني\nسالم في القارب'), ['سالم على البحر', 'سالم في القارب'], 'عناوين في سطور');
  assert.deepEqual(S('المشهد الأول سالم على البحر المشهد الثاني سالم في القارب'), ['سالم على البحر', 'سالم في القارب'], 'بلا فواصل لكن قائمة');
  assert.deepEqual(S('المشهد الأول: سالم على البحر، والمشهد الثاني: سالم في القارب'), ['سالم على البحر', 'سالم في القارب'], 'واو العطف لا تبقى ذيلًا');
  assert.deepEqual(S('المشهد الأول: سالم على البحر و المشهد الثاني: سالم في القارب'), ['سالم على البحر', 'سالم في القارب']);
  assert.deepEqual(S('Scene 1: a beach\nScene 2: a boat'), ['a beach', 'a boat']);
  assert.deepEqual(S('scene one - beach. SCENE TWO - boat'), ['beach.', 'boat']);
  assert.deepEqual(S('Scène 1 : plage Scène 2 : bateau'), ['plage', 'bateau']);
  assert.deepEqual(S('第1幕：海边 第2幕：小船'), ['海边', '小船']);
  assert.deepEqual(S('Сцена 1: пляж Сцена 2: лодка'), ['пляж', 'лодка']);
  // مشهد واحد بفاصل = مشهد واحد (فيديو واحد)
  assert.deepEqual(splitScenes('الجوّ ليل. المشهد الأول: سالم يصطاد'), { scenes: ['سالم يصطاد'], rest: 'الجوّ ليل.' }, 'ما قبل أوّل علامة توجيه عامّ');
  // ليست علامات
  for (const x of ['زي المشهد الأول بس بالليل', 'بالمشهد الأول: لا', 'obscene 1: no', 'scene one-shot', 'يلبس بشت ذهبي، معه صقر', 'مشهدك الأول: لا', '', null, undefined]) {
    assert.deepEqual(S(x), [], 'ليست قائمة مشاهد: ' + x);
  }
  // علامة بلا نصّ تُسقط، وأكثر من ٥ تُضمّ في الخامس فلا يضيع شيء ولا يُحرق أكثر من ٥ مقاطع
  assert.deepEqual(S('المشهد الأول: المشهد الثاني: ب'), ['ب']);
  assert.deepEqual(S('مشهد 1: أ مشهد 2: ب مشهد 3: ج مشهد 4: د مشهد 5: ه مشهد 6: ح مشهد 7: ز'), ['أ', 'ب', 'ج', 'د', 'ه ح ز']);
});

/* المراجعة المستقلّة: صيغ عربيّة شائعة كانت تُرجع المدرسة بصمت، وإشارات إلى المشاهد كانت تُقسَم خطأً */
test('٤ب. صيغ المراجعة: الفاصلة، «الـ1»، «١)»، «(1):»، «؛»، علامات الاتّجاه الملصوقة، إيموجي قبلها، «اللقطة»؛ وما هو إشارة لا قائمة', () => {
  const S = (x) => splitScenes(x).scenes;
  const RLM = String.fromCharCode(0x200F), LRE = String.fromCharCode(0x202A);
  const yes = [
    ['المشهد الأول، سالم على البحر. المشهد الثاني، القارب', ['سالم على البحر.', 'القارب']],
    ['المشهد الـ1: أ المشهد الـ2: ب', ['أ', 'ب']],
    ['المشهد ال1: أ المشهد ال2: ب', ['أ', 'ب']],
    ['المشهد ١) أ المشهد ٢) ب', ['أ', 'ب']],
    ['المشهد (1): أ المشهد (2): ب', ['أ', 'ب']],
    ['المشهد الأول؛ سالم على البحر', ['سالم على البحر']],
    [RLM + 'المشهد الأول: أ ' + RLM + 'المشهد الثاني: ب', ['أ', 'ب']],
    [LRE + 'Scene 1: a ' + LRE + 'Scene 2: b', ['a', 'b']],
    ['🌊المشهد الأول: البحر', ['البحر']],
    ['فالمشهد الأول: أ', ['أ']],
    ['اللقطة الأولى: أ اللقطة الثانية: ب', ['أ', 'ب']],
    ['المقطع الأول: أ\nالمقطع الثاني: ب', ['أ', 'ب']],
    ['1- المشهد الأول: أ\n2- المشهد الثاني: ب', ['أ', 'ب']],
    ['١) المشهد الأول: أ ٢) المشهد الثاني: ب', ['أ', 'ب']],
    ['المشهد الأول: سالم على البحر ثم المشهد الثاني: القارب', ['سالم على البحر', 'القارب']],
    ['المشهد الأول: سالم على البحر وبعدين المشهد الثاني: القارب', ['سالم على البحر', 'القارب']],
    ['Scene 1: a beach and Scene 2: a boat', ['a beach', 'a boat']],
    ['First scene: a beach\nSecond scene: a boat', ['a beach', 'a boat']],
    ['قصة سالم: المشهد الأول سالم المشهد الثاني القارب', ['سالم', 'القارب']],
    ['المشهد الأول سالم على البحر\r\nالمشهد الثاني سالم في القارب', ['سالم على البحر', 'سالم في القارب']],
  ];
  for (const [x, want] of yes) assert.deepEqual(S(x), want, JSON.stringify(x));
  assert.equal(splitScenes('🌊المشهد الأول: البحر').rest, '', 'إيموجي وحدها ليست توجيهًا');
  assert.equal(splitScenes('1- المشهد الأول: أ\n2- المشهد الثاني: ب').rest, '', 'رقم القائمة لا يصير توجيهًا');
  const no = [
    'غيّر المشهد الثاني والمشهد الثالث خلهم في البحر',
    'زي المشهد الأول بس بالليل، والمشهد الثاني نفسه',
    'زي المشهد الأول، بس بالليل',
    'In scene 2 make it rainy. In scene 3 make it sunny',
    'the first scene was nice',
    'مقطع 2 دقيقة عن البحر',
    '١- بشت ذهبي ٢- صقر',
    '我们看第一场电影然后第二场电影',
  ];
  for (const x of no) assert.deepEqual(S(x), [], 'إشارة لا قائمة: ' + x);
  // رقم في آخر المشهد ليس رقم قائمة
  assert.deepEqual(splitScenes('سالم عمره 7 المشهد الثاني: ب'), { scenes: ['ب'], rest: 'سالم عمره 7' });
  // نصّ ضخم من خارج الواجهة (قبل الدخول في المعالجات): مقصوص قبل أيّ تعبير — كان ٢٥٠ ألف حرف يحبس الدالّة دقائق
  const big = 'المشهد 1: x' + ' '.repeat(250000) + 'x المشهد 2: y';
  const t0 = Date.now(); splitScenes(big); buildTrendPrompt('pixarstory', { extra: big, sceneIndex: 1 });
  assert.ok(Date.now() - t0 < 500, 'بطيء: ' + (Date.now() - t0) + 'ms');
  // لا حرف تحكّم اتّجاه خفيّ في مصدر الدالّة (هروب نصّيّ فقط)
  const CTRL = new RegExp('[' + String.fromCharCode(0x200B) + '-' + String.fromCharCode(0x200F) + String.fromCharCode(0x202A) + '-' + String.fromCharCode(0x202E) + String.fromCharCode(0x2066) + '-' + String.fromCharCode(0x2069) + ']');
  for (const f of ['api/_lib/video-trends.js', 'js/app-11-video-trends.js']) assert.doesNotMatch(read(f), CTRL, f);
});

test('٥. نسخة العميل من splitScenes هي نسخة الخادم حرفيًّا وتعطي النتائج نفسها', () => {
  const cli = read('js/app-11-video-trends.js');
  const srv = read('api/_lib/video-trends.js');
  /* الخادم: الدالّة في العمود صفر وتُغلق بـ«}» في أوّل السطر؛ العميل: داخل IIFE بإزاحة سطرين */
  const grab = (src, close) => { const a = src.indexOf('function splitScenes(text){'); const b = src.indexOf(close, a); assert.ok(a > 0 && b > a); return src.slice(a, b + close.length); };
  const fs_ = grab(srv, '\n}\n');
  const fc = grab(cli, '\n  }\n');
  const dedent = (f) => f.split('\n').map((l) => l.replace(/^ {2}/, '')).join('\n');
  assert.ok(fs_.length > 900 && /return \{ scenes: scenes, rest:/.test(fs_), 'الدالّة كاملة');
  assert.equal(dedent(fc), fs_, 'النسختان افترقتا — عدّل الاثنتين معًا');
  const box = {}; vm.runInNewContext(fc + '\nthis.splitScenes = splitScenes;', box);
  for (const x of [SEA, 'Scene 1: a\nScene 2: b', 'زي المشهد الأول بس بالليل', 'قبل. مشهد ٣: ج', '第1幕：海边 第2幕：小船', 'المشهد الأول سالم المشهد الثاني القارب']) {
    assert.deepEqual(JSON.parse(JSON.stringify(box.splitScenes(x))), splitScenes(x), x);
  }
  // بلا lookbehind ولا \p في التعبير (الحزمة تُحلَّل على المحرّكات القديمة)
  assert.doesNotMatch(fc, /\(\?<[=!]|\\p\{/);
});

test('٦. الواجهة: خانات المشاهد، التقسيم قبل الإرسال، العدد في الزرّ، ومساعد الكتابة يعبّي الخانات لا خانة الاسم', () => {
  const src = read('js/app-11-video-trends.js');
  const make = src.slice(src.indexOf('async function make(t){'), src.indexOf('function boot(){'));
  assert.ok(make.indexOf('pullScenes(t);') > 0 && make.indexOf('pullScenes(t);') < make.indexOf("var extra = ($('vtExtra')"), 'التقسيم قبل قراءة «اكتب اللي تبيه»');
  assert.match(make, /if\(!same\)\{ params\.scenes = list\.map\(function\(x\)\{ return x\.def != null \? x\.def : x\.text; \}\); n = list\.length; \}/);
  assert.match(make, /urls\.push\(await clipInSequence\(t, Object\.assign\(\{ sceneIndex: i \}, params\), token, i \+ 1, n\)\);/);
  // كلّ الخانات فاضية: «اكتب اللي تبيه» هو المشهد (لا رجوع صامت للمدرسة)، وبلا نصّ: تنبيه قبل أيّ توليد أو قفل
  assert.match(make, /if\(!list\.length\)\{\s*if\(!extra\)\{ status\(ui\('scenesNone'\)\); return; \}\s*setScenes\(t, \[\{ text: extra, def: null \}\]\); \$\('vtExtra'\)\.value = ''; delete params\.extra;/);
  assert.ok(make.indexOf("status(ui('scenesNone'))") < make.indexOf('busy = true;'), 'التنبيه قبل قفل الزرّ');
  // ما يمحوه تنظيف الخادم («<>») خانة فاضية في العدّ أيضًا
  assert.ok(src.includes(".filter(function(x){ return x.text.replace(/[\"`\\\\<>\\s]/g, ''); });"), 'عدّ العميل = عدّ الخادم');
  const open = src.slice(src.indexOf('function openTrend(t){'), src.indexOf('function status(txt)'));
  assert.ok(open.indexOf("sw.id = 'vtScenes'") > 0 && open.indexOf("sw.id = 'vtScenes'") < open.indexOf("xinp.id = 'vtExtra'"), 'الخانات قبل «اكتب اللي تبيه»');
  assert.ok(open.includes('xinp.onchange = function(){ pullScenes(t); };'));
  assert.ok(open.includes('if(sceneTrend(t)) setScenes(t, defaultScenes(t)); else goLabel(t);'));
  const asst = src.slice(src.indexOf('function assistant(t){'), src.indexOf('function openTrend(t){'));
  assert.match(asst, /scenes: sceneTrend\(t\) \? \(readScenes\(\)\.length \|\| t\.scenes\) : undefined/);
  assert.match(asst, /if\(sceneTrend\(t\)\) b\.appendChild\(chip\(W\('vwToScene'\), function\(\)\{[^]*?setScenes\(t, arr\.map/);
  assert.match(asst, /else if\(main\) b\.appendChild\(chip\(W\('vwToScene'\)/, 'الترندات الأخرى كما كانت');
  assert.match(asst, /put\(extra, all\); pullScenes\(t\);/);
  // الحزمة تحمل الجزء الجديد
  assert.ok(read('js/app.bundle.js').includes("sw.id = 'vtScenes'"));
});

test('٧. النصوص: المشاهد الافتراضيّة والعنوانان بالـ١٤ لغة، والتلميح بصيغة تنقسم فعلًا في كلّ لغة', () => {
  const c = { window: {} }; vm.runInNewContext(read('js/app-11-video-trends-data.js'), c);
  const D = c.window.__VIDEO_TRENDS;
  const px = D.trends.find((t) => t.key === 'pixarstory');
  assert.equal(px.scenes, 3);
  assert.equal(px.sceneText.length, TRENDS.pixarstory.scenes.length, 'خانة لكلّ مشهد على الخادم');
  for (const s of px.sceneText) for (const l of LANGS) assert.ok(s[l] && s[l].length > 20, 'مشهد ناقص: ' + l);
  assert.match(px.sceneText[1].ar, /المدرسة/); assert.match(px.sceneText[1].en, /school/);
  const EMOJI = new RegExp('[' + String.fromCodePoint(0x1F300) + '-' + String.fromCodePoint(0x1FAFF) + String.fromCharCode(0x2600) + '-' + String.fromCharCode(0x27BF) + ']', 'u');
  for (const l of LANGS) {
    assert.ok(D.ui.sceneN[l] && D.ui.sceneN[l].includes('{i}'), 'sceneN ناقص: ' + l);
    const h = D.ui.scenesHint[l];
    assert.ok(h, 'scenesHint ناقص: ' + l);
    assert.ok(D.ui.scenesNone[l] && D.ui.scenesNone[l].length > 5, 'scenesNone ناقص: ' + l);
    assert.equal(splitScenes(h).scenes.length, 2, 'مثال التلميح لا ينقسم في ' + l + ': ' + h);
    for (const x of [h, D.ui.sceneN[l], D.ui.scenesNone[l]].concat(px.sceneText.map((s) => s[l]))) {
      assert.doesNotMatch(x, /veo|runway|gemini|claude|openai|gpt|minimax/i, 'اسم مزوّد: ' + l);
      assert.doesNotMatch(x, EMOJI, 'إيموجي: ' + l);
    }
  }
});

test('٨. مساعد الكتابة: scenes = وصف لكلّ مشهد، وبلاها الأمر كما كان حرفيًّا', async () => {
  const VW = require(rp('api/_lib/video-write.js'));
  const base = { request: 'اكتب قصة عن سالم والبحر', kind: 'story', seconds: 24, characters: [] };
  assert.equal(VW.buildPrompt(Object.assign({}, base, { scenes: 0 })), VW.buildPrompt(base), 'بلا scenes: لا تغيير');
  const p = VW.buildPrompt(Object.assign({}, base, { scenes: 3 }));
  assert.match(p, /Plan 3 consecutive scene\(s\) of ONE story/);
  assert.match(p, /"scenes":\["\.\.\.", \.\.\.\]/);
  assert.doesNotMatch(VW.buildPrompt(base), /"scenes"/);
  const r = VW.parseReply(JSON.stringify({ scene: 'قصة', scenes: ['أ', '', 'ب', 'x'.repeat(900), 'ج', 'د', 'ه'], narration: '', lines: [] }), 24, []);
  assert.deepEqual(r.scenes.slice(0, 2), ['أ', 'ب']);
  assert.equal(r.scenes.length, 5); assert.equal(r.scenes[2].length, 400);
  assert.equal(VW.parseReply('{"scene":"قصة","narration":"","lines":[]}', 8, []).scenes, undefined, 'لا حقل بلا مشاهد');
  // مزوّد يرجع المشاهد كائنات: الوصف يُؤخذ منها، وما ليس نصًّا يسقط — لا «[object Object]» في الخانات
  const objs = VW.parseReply(JSON.stringify({ scene: 'قصة', scenes: [{ description: 'شاطئ' }, { scene: 'قارب' }, { foo: 1 }, 7, ['x'], { description: { deep: 1 } }], narration: '', lines: [] }), 24, []);
  assert.deepEqual(objs.scenes, ['شاطئ', 'قارب']);
  assert.equal(VW.parseReply(JSON.stringify({ scene: '', scenes: [{ foo: 1 }, 3], narration: '', lines: [] }), 24, []), null, 'مصفوفة بلا نصّ = لا جواب');
  // طلب المشاهد: جواب بلا مصفوفة ← المزوّد التالي؛ وإن لم يأتِ أحد بها يرجع أوّل جواب مقروء
  const seen = [];
  const chain = async ({ accept }) => {
    const answers = ['{"scene":"قصة البحر","narration":"","lines":[]}', '{"scene":"قصة","scenes":["شاطئ","قارب"],"narration":"","lines":[]}'];
    for (const a of answers) { seen.push(a); if (accept(a)) return { ok: true, text: a, provider: 'p' + seen.length }; }
    return { ok: false, errors: [] };
  };
  const got = await VW.write(Object.assign({}, base, { scenes: 3, chain }));
  assert.deepEqual(got.scenes, ['شاطئ', 'قارب']);
  assert.equal(seen.length, 2);
  const none = await VW.write(Object.assign({}, base, { scenes: 3, chain: async ({ accept }) => { accept('{"scene":"قصة فقط","narration":"","lines":[]}'); return { ok: false, errors: [] }; } }));
  assert.equal(none.scene, 'قصة فقط', 'بلا مشاهد من أحد: الجواب المقروء أفضل من «تعذّرت»');
  const VWSRC = read('api/_lib/video-write.js');
  assert.match(VWSRC, /const seconds = scenes \? 8 \* scenes : secondsOf\(body\.duration\);/, 'ميزانيّة الكلام بطول القصّة كلّها');
  assert.match(VWSRC, /write\(\{ request, kind, seconds, characters, scenes,/);
});

test('٩. المعالج الحقيقيّ (veo-create): نصّ البحر يصل المحرّك بلا school ولا classroom', async () => {
  const stubs = {
    'api/_lib/_videoUsage.js': { checkOwnerBypass: async () => ({ allowed: true }), checkVideoQuota: async () => ({ allowed: true, username: 'omran' }), consumeVideo: async () => 3 },
    'api/_lib/video-job.js': { rememberVideoJob: async () => true, settleVideoJob: async () => null },
    'api/_lib/points.js': { isOwnerUsername: () => true, COSTS: { veo_video: 400 } },
  };
  const saved = {};
  for (const [rel, exp] of Object.entries(stubs)) { const p = rp(rel); saved[p] = require.cache[p]; require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; }
  const hp = rp('api/_lib/veo-create.js'); delete require.cache[hp];
  const savedKey = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'gk';
  const realFetch = global.fetch; const sent = [];
  global.fetch = async (url, init) => {
    if (String(url).includes(':predictLongRunning')) { sent.push(JSON.parse(init.body).instances[0].prompt); return Response.json({ name: 'op/' + sent.length }); }
    throw new Error('unexpected fetch: ' + url);
  };
  const PHOTO = Buffer.from('not-a-real-jpeg-'.repeat(8)).toString('base64');
  const DIRECTION = 'الجوّ ليل والنجوم واضحة في السماء';
  try {
    const handler = require(hp);
    const post = async (body) => {
      const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
      await handler({ method: 'POST', body: Object.assign({ trend: 'pixarstory', ratio: '1280:720', token: 't', quality: 'fast', durationSeconds: 8 }, body) }, res);
      assert.equal(res.code, 200, JSON.stringify(res.body));
    };
    for (let i = 0; i < 2; i++) await post({ params: { name: 'سالم', text: 'سالم', extra: SEA, sceneIndex: i, bg: 2 } });
    // مع صورة: المشاهد في صلب الأمر، والتوجيه العامّ قبل أوّل علامة يصل كاملًا (كان سقف ١٤٨٠ يقصّه)
    for (let i = 0; i < 2; i++) await post({ params: { name: 'سالم', text: 'سالم', extra: DIRECTION + '. ' + SEA, sceneIndex: i, bg: 2 }, imageBase64: PHOTO, imageMime: 'image/jpeg' });
  } finally {
    global.fetch = realFetch;
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = savedKey;
    delete require.cache[hp];
    for (const [p, v] of Object.entries(saved)) { if (v) require.cache[p] = v; else delete require.cache[p]; }
  }
  assert.equal(sent.length, 4);
  for (const pr of sent) assert.doesNotMatch(pr, SCHOOL, 'المدرسة وصلت المحرّك');
  assert.ok(sent[0].includes('شاطئ البحر') && sent[1].includes('قارب صيد'));
  assert.ok(sent[2].includes('شاطئ البحر') && sent[3].includes('قارب صيد'), 'مع صورة أيضًا');
  for (const pr of sent.slice(2)) {
    assert.ok(pr.includes('USER DIRECTION (follow it; it wins over the setting if it names a place): ' + DIRECTION + '.'), 'التوجيه العامّ قُصّ: ' + pr.slice(-900));
    assert.match(pr, /IDENTITY \(mandatory\)/, 'قفل الهويّة في الذيل');
  }
});

/* قياس أثناء المراجعة: مع صورة شخصين كان «اكتب اللي تبيه» يسقط كلّه في الـ٥٥ ترندًا (ومع شخص واحد يُقصّ في ١٦) —
   سقفا ١٤٨٠/١١٧٠ من زمن حدّ ١٥٠٠، وحدّ Veo للترندات ٢٦٠٠. */
test('١٠. سقف Veo: «اكتب اللي تبيه» يصل مع الصورة في كلّ الترندات، والأمر داخل حدّه مع قفل الإطار؛ وبقيّة المسارات كما كانت', () => {
  const { FRAME_LOCK } = require(rp('api/_lib/trend-people.js'));
  const VEO_MAX = 2600; /* veo-create.VEO_PROMPT_MAX — يُقرأ من مصدره أدناه */
  const vcSrc = read('api/_lib/veo-create.js');
  assert.match(vcSrc, /const VEO_PROMPT_MAX = 2600;/);
  assert.match(vcSrc, /const TREND_OPTS = \{ cap: VEO_PROMPT_MAX - FRAME_LOCK\.length \};/);
  assert.equal((vcSrc.match(/buildTrendPrompt\([^\n]*TREND_OPTS\)/g) || []).length, 3, 'النداءات الثلاثة في veo-create بالسقف');
  assert.match(vcSrc, /const bParams = trendsLib\.sceneParams\(String\(body\.trend\), /, 'المشاهد تُفصل قبل حلقة القصّ');
  const opts = { cap: VEO_MAX - FRAME_LOCK.length };
  const X = 'يلبس بشت ذهبي ومعه صقر والجوّ ليل والمكان صحراء';
  for (const k of Object.keys(TRENDS)) for (const people of [1, 2, 3]) {
    const p = { name: 'سالم', text: 'سالم', extra: X, hasImage: true, people, bg: 3 };
    const veo = buildTrendPrompt(k, p, opts).prompt;
    assert.ok(veo.includes('USER DIRECTION') && veo.includes(X), k + '/' + people + ': التوجيه لم يصل');
    assert.ok(veo.length + FRAME_LOCK.length <= VEO_MAX, k + '/' + people + ': فوق الحدّ ' + veo.length);
    assert.equal(buildTrendPrompt(k, p).prompt, buildTrendPrompt(k, p, null).prompt, 'بلا سقف = السلوك القديم');
  }
  // بلا سقف (omni/minimax/video-create): كما كان حرفيًّا — شخصان يُسقط التوجيه
  assert.ok(!buildTrendPrompt('heritagesing', { text: 'يا هلا', hasImage: true, people: 2, extra: X }).prompt.includes(X));
  // حلقة القصّ في veo-create تقصّ extra — بعد sceneParams لا علامة فيه، فالمشاهد لا تسقط بالقصّ
  const bp = VT.sceneParams('pixarstory', { extra: 'الجوّ ليل. ' + SEA });
  assert.equal(bp.extra, 'الجوّ ليل.');
  assert.equal(bp.scenes.length, 2);
  assert.equal(buildTrendPrompt('pixarstory', Object.assign({}, bp, { extra: '' , sceneIndex: 1 }), opts).sceneCount, 2);
  assert.deepEqual(VT.sceneParams('dance', { extra: SEA }), { extra: SEA }, 'ترند بلا مشاهد: كما هو');
});
