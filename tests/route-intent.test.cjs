// tests/route-intent.test.cjs — v-route-gate / v-route-design / v-route-ad / v-route-write / v-route-logo / v-route-formal
// العرض (تدقيق التوجيه ١٠ أكتوبر، مسبار ١١٥ رسالة لمستخدمة عاديّة عبر sendPrompt الحقيقيّ): «سوي لي ملخص لاجتماع اليوم» و«اعمل لي
// ايميل ترحيب» تُجاب «تبيني أبدأ البناء الحين؟» بلا أدوات، و«صمّم لي بوستر لليوم الوطني» تُستأذن ثمّ تُبنى صفحة HTML، وحين يتعذّر
// المصنّف تصير «اكتب لي إعلان وظيفة» و«أبي أعرف أسعار الفلل للإيجار» صورة إعلان «للبيع»، و«اكتب لي قصيدة» بعد صورة تُطبع
// على الصورة، و«سوّ لي لوجو لمقهى» تبحث عن شعار رسميّ، و«إيميل رسميّ» ينتظر المصنّف.
// يشغّل التعابير والشروط الحقيقيّة من js/app-09-attach.js (لا نصّها) في vm، والمحلّل الحقيقيّ لنصّ الصورة من app-08.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SRC = read('js/app-09-attach.js');

/* سطر يبدأ بالرأس حتّى نهاية السطر */
const line = (head) => { const i = SRC.indexOf(head); assert.ok(i >= 0, 'مفقود: ' + head); return SRC.slice(i, SRC.indexOf('\n', i)); };
/* جملة قد تمتدّ أسطرًا: من الرأس حتّى أوّل «;» في آخر سطر */
const stmt = (head) => { const i = SRC.indexOf(head); assert.ok(i >= 0, 'مفقود: ' + head); return SRC.slice(i, SRC.indexOf(';\n', i) + 1); };
/* شرط if/else if: من الرأس حتّى «){» في آخر سطره */
const cond = (head) => {
  const i = SRC.indexOf(head); assert.ok(i >= 0, 'مفقود: ' + head);
  const j = SRC.indexOf('){\n', i); assert.ok(j > i);
  return SRC.slice(i + head.length, j);
};

/* المحلّل الحقيقيّ لنصّ الصورة (app-08) — يستعمله __explicitImageTextRequest و__IMG_FOLLOW */
const IMG_TEXT = { window: {} }; IMG_TEXT.self = IMG_TEXT.window; IMG_TEXT.globalThis = IMG_TEXT;
vm.runInNewContext(read('js/app-08-image-text.js'), IMG_TEXT);
const parseSpec = IMG_TEXT.window.__parseImageTextSpec;
const isExplicitEdit = IMG_TEXT.window.__isExplicitImageEdit;
assert.equal(typeof parseSpec, 'function');

/* ── ١. بوّابة البناء كما في __sendPromptCore (نفس تركيب tests/loc-ask) ── */
/* v-route-want: شرط فتح البوّابة الحقيقيّ (فرع __setPend) بنصّه من الكود، مع __rtWantLookup الحقيقيّ — code = مشروع مفتوح */
const GATE_HEAD = '} else if(text && !__IMG_FOLLOW && !__explicitImageTextRequest && !__looksPasted && ';
const GATE_TAIL = '&& !omranEditBigOpen(getCurrent())){';
const GATE_COND = (() => { const i = SRC.indexOf(GATE_HEAD); assert.ok(i >= 0, 'مفقود: فرع فتح البوّابة'); const j = SRC.indexOf(GATE_TAIL, i); assert.ok(j > i); return SRC.slice(i + GATE_HEAD.length, j) + GATE_TAIL.slice(0, -2); })();
const G = {};
vm.runInNewContext([
  line('const __strongBuildRe = '),
  line('const GATE_BUILD_RE = '), line('const GATE_CMD_RE = '), line('const GATE_FIX_RE = '), line('const GATE_HARD_RE = '),
  line('const __routeBuildRe = '), line('const __routeCmdRe = '),
  line('const __rtBuildVerbRe = '), line('const __rtLookupRe = '), line('const __rtGiveRe = '), line('const __rtEntityRe = '), line('const __rtMineRe = '),
  'function wantLookup(text, code){ const getCurrent = () => ({ code: code || "" }); ' + stmt('const __rtWantLookup = ').replace('const __rtWantLookup = ', 'return ') + ' }',
  'this.wantLookup = wantLookup;',
  'this.gate = function(text, code){',
  '  const getCurrent = () => ({ code: code || "" }), omranEditBigOpen = () => false;',
  '  const __IMG_FOLLOW = false, __explicitImageTextRequest = false, __looksPasted = false, __rtWantLookup = wantLookup(text, code);',
  '  ' + line('const __gateText = '),
  '  return !!(text && !__IMG_FOLLOW && !__explicitImageTextRequest && !__looksPasted && ' + GATE_COND + ');',
  '};',
  'this.askAllShape = (text) => !!((__routeBuildRe.test(text) && __routeCmdRe.test(text) && !wantLookup(text)) || __strongBuildRe.test(text));',
].join('\n'), G);

test('١. البوّابة: المخرجات النصّيّة وطلبات التصميم ليست «بناء» (كانت تُجاب «تبيني أبدأ البناء الحين؟»)', () => {
  for (const t of ['سوي لي ملخص لاجتماع اليوم: ناقشنا الميزانية', 'سوي لي جدول مقارنة بين تويوتا ونيسان', 'سوي لي خطة تدريب لمدة شهر',
    'سوي لي جدول دوام للموظفين الأسبوع الجاي', 'اعمل لي ايميل ترحيب بموظف جديد', 'اعمل لي مقارنة بين الآيفون والسامسونج',
    'صمم لي خطة تسويق لمطعم', 'ممكن تسوي لي قائمة مشتريات للبيت', 'صمم لي جدول مذاكرة للامتحانات',
    'صمم لي بوستر لليوم الوطني الإماراتي', 'صمم لي شعار لشركة استشارات اسمها رؤية', 'صمم لي بطاقة تهنئة بعيد الفطر',
    'صمم لي فلاير لفعالية اليوم الوطني', 'Make me a logo for a coffee shop', 'سوي لي شهادة تقدير', 'make me a summary of the meeting']) {
    assert.equal(G.gate(t), false, t);
  }
  // و«اسأل الكل» القديم (تعليمة BUILD request) لا يلتقط طلب التصميم بعد خروجه من البوّابة
  for (const t of ['ممكن تكتب لي دعوة لعرس أخوي', 'أبغى بوستر للعيد', 'صمم لي بطاقة تهنئة']) assert.equal(G.askAllShape(t), false, t);
});

test('٢. البوّابة: البناء الحقيقيّ يبقى بناءً (موقع/تطبيق/لعبة/صفحة/حاسبة… وقرار v-loc-not-build)', () => {
  for (const t of ['ابني لي موقع لشركة عقارات', 'سوي لي آلة حاسبة', 'سوي لي لعبة ثعبان', 'اعمل لي صفحة هبوط لمنتجي', 'ممكن تسوي لي تطبيق ملاحظات',
    'make me a todo list app', 'build a website for my shop', 'سوي لي ساعة رقمية', 'سوي لي متجر الكتروني للعطور',
    'اريد موقع لشركتي', 'سوي الموقع', 'صمم لي الموقع']) {
    assert.equal(G.gate(t), true, t);
  }
  assert.equal(G.askAllShape('ابني لي تطبيق ملاحظات'), true);
  for (const t of ['دي تو دي عجمان\n\n\nعطني الموقع', 'عطني موقعه', 'صلح الموقع']) assert.equal(G.gate(t), false, t);
});

/* ── ٢. البانِي المباشر للصور: شرط الدخول الحقيقيّ مع متغيّراته ── */
const BUILDER_HEAD = 'if(text && !__blockAutoImage && __mediaLane !== \'none\' && __mediaLane !== \'video\' /* v-media-gate */ && (!__srcImg || __freshGenWins)';
const B = { parse: parseSpec };
vm.runInNewContext([
  'this.builder = function(text, __mediaLane){',
  '  const __entryImageTextSpec = parse(text);',
  line('const __rtImgRefRe = '), line('const __rtWriteDocAsk = '),
  stmt('const __explicitImageTextRequest = '),
  line('const __codeWordRe = '), line('const __designDocRe = '), line('const __nanoQ = '),
  line('const __imgGenIntentRe = '), line('const __unifiedBuildRe = '), line('const __txtOnlyImgRe = '),
  line('const __rtDesignMakeRe = '), line('const __rtDesignWantRe = '), line('const __rtDesignImg = '),
  '  const __blockAutoImage = false, __srcImg = null, __freshGenWins = false, __followUp = false, __archImagesDone = false;',
  '  return !!(' + BUILDER_HEAD.slice(3) + cond(BUILDER_HEAD) + ');',
  '};',
].join('\n'), B);

test('٣. التصميم: فعل تصميم + بوستر/شعار/بطاقة/فلاير/لوجو = البانِي المباشر (/api/maha-image)، بالمصنّف أو بدونه', () => {
  for (const t of ['صمم لي بوستر لليوم الوطني الإماراتي', 'صمم لي شعار لشركة استشارات اسمها رؤية', 'صمم لي بطاقة تهنئة بعيد الفطر',
    'سوّ لي لوجو لمقهى اسمه سنع', 'صمم لي فلاير لفعالية اليوم الوطني', 'Make me a logo for a coffee shop', 'صمم لي دعوة عرس']) {
    assert.equal(B.builder(t, null), true, 'بلا مصنّف: ' + t);
    assert.equal(B.builder(t, 'image'), true, 'المصنّف image: ' + t);
    assert.equal(B.builder(t, 'none'), false, 'المصنّف none يغلقه كما كان: ' + t);
  }
  // فعل الرغبة وحده يدخل فقط إن قال المصنّف image
  assert.equal(B.builder('ابي انفوجرافيك عن خطوات تجديد الرخصة', 'image'), true);
  assert.equal(B.builder('ابي انفوجرافيك عن خطوات تجديد الرخصة', null), false);
  // الطرق القائمة كما كانت
  assert.equal(B.builder('ارسم صورة برج خليفة بالليل', null), true);
  assert.equal(B.builder('أبي صورة قطة لابسة نظارة', null), true);
  assert.equal(B.builder('صمم بطاقة واكتب عليها «عيد مبارك»', null), true, 'تصميم بنصّ حرفيّ');
});

test('٤. الكتابة ليست تصميمًا: «اكتب لي دعوة/شهادة خبرة» محادثة حتّى بلا مصنّف (كانت صورة بنصّ)', () => {
  for (const t of ['اكتب لي دعوة لاجتماع الفريق يوم الأحد الساعة 10 الصبح', 'اكتب لي شهادة خبرة لموظف اشتغل عندنا سنتين',
    'اكتب لي بطاقة شكر لزميلي', 'اعمل لي شهادة خبرة لموظف', 'سوي لي دعوة لاجتماع الفريق', 'كيف أصمم شعار؟',
    'صمم لي شعار لتطبيقي', 'سوي لي ملخص لاجتماع اليوم', 'اكتب لي قصيدة قصيرة عن الصقر']) {
    assert.equal(B.builder(t, null), false, t);
  }
});

/* ── ٣. مسار صورة الإعلان: الشرط الحقيقيّ كاملًا ── */
const AD_HEAD = '} else if(text && __adIntentRe.test(text) && !__blockAutoImage';
const A = {};
vm.runInNewContext([
  'this.ad = function(text, __mediaLane, __srcImg){',
  line('const __adIntentRe = '), line('const __rtAdNoRe = '), line('const __rtAdListing = '), line('const __rtAdMake = '),
  line('const __rtAdHardNo = '), line('const __rtAdImg = '), line('const __rtAdOk = '),
  line('const __codeWordRe = '),
  '  const __blockAutoImage = false, cur = {};',
  '  return !!(text && __adIntentRe.test(text) && !__blockAutoImage' + cond(AD_HEAD) + ');',
  '};',
].join('\n'), A);

test('٥. الإعلان: الكتابة/الترجمة/التلخيص/السؤال عن السعر لا تصير صورة «للبيع» — بالمصنّف المعطّل وحتّى إن قال image', () => {
  const U2 = 'لخص النص التالي: أعلنت دائرة التنمية الاقتصادية اليوم عن إطلاق منصة رقمية جديدة، كما سيتم نشر إعلان رسمي في الصحف المحلية خلال الأسبوع القادم';
  for (const t of ['اكتب لي إعلان وظيفة محاسب في شركتنا', U2, 'أبي أعرف أسعار الفلل للإيجار في العين', 'كم سعر إعلان في جريدة الخليج',
    'ترجم الإعلان هذا للإنجليزي: للبيع شقة في الريم غرفتين', 'ساعدني أكتب رسالة لصاحب العقار إن الشقة للإيجار ما تناسبني',
    'اكتب نص إعلان إذاعي عن اليوم الوطني', 'عندي شقة للبيع كم أحطّ سعرها']) {
    assert.equal(A.ad(t, null), false, 'بلا مصنّف: ' + t);
  }
  assert.equal(A.ad('اكتب لي إعلان وظيفة محاسب', 'image'), false, 'فعل الكتابة يغلب خطأ المصنّف');
  assert.equal(A.ad('اعلان لمطعمي الجديد', null), false, 'بلا تفاصيل بيع ولا فعل صنع ولا مصنّف = محادثة');
});

test('٦. الإعلان: إعلان البيع/الإيجار الصريح وفعل الصنع والمصنّف image تبقى صورة إعلان، وإعلان الفيديو لا (v-video-ad-route)', () => {
  for (const t of ['اعلان سيارة للبيع لكزس موديل 2020 السعر 90 الف', 'للبيع ايفون 15 برو ماكس يصور فيديو 4K السعر 3500',
    'ابي اعلان لشقة للإيجار في العين غرفتين', 'سوّ لي إعلان لمحل عطور', 'للبيع باترول 2018 ممشى 150 الف كم السعر 120 الف' /* «كم» هنا كيلومتر لا سؤال */]) {
    assert.equal(A.ad(t, null), true, t);
  }
  assert.equal(A.ad('اعلان لمطعمي الجديد', 'image'), true, 'المصنّف image');
  assert.equal(A.ad('أبي إعلان فيديو لمطعمي', null), false, 'إعلان فيديو ليس صورة إعلان');
  assert.equal(A.ad('اعلان سيارة للبيع لكزس موديل 2020 السعر 90 الف', 'none'), false, 'المصنّف none يغلقه كما كان');
});

/* ── ٤. طلب كتابة بعد صورة مولَّدة: متابعة الصورة + الإرفاق التلقائيّ من الذاكرة ── */
const imgFollowStart = SRC.indexOf('const __IMG_FOLLOW = (function(){');
const imgFollowSrc = SRC.slice(imgFollowStart, SRC.indexOf('\n  })();', imgFollowStart) + '\n  })();'.length);
const W = { window: { __isExplicitImageEdit: isExplicitEdit } };
vm.runInNewContext([
  'const __omranPrev = ' + SRC.slice(SRC.indexOf('function omranPrevTurnHadImage(messages){'), SRC.indexOf('\n}\n', SRC.indexOf('function omranPrevTurnHadImage(messages){')) + 2) + ';',
  'this.after = function(text, extra){',
  '  const omranPrevTurnHadImage = __omranPrev;',
  '  const cur = { lastMsgWasImageEdit: true, lastEditedImage: { b64: "x", mime: "image/png" }, messages: [',
  '    { role: "user", content: "ارسم صورة صقر على جبل" }, { role: "assistant", content: "", attachments: [{ isImage: true, name: "generated.png" }] } ].concat(extra || []) };',
  '  const getCurrent = () => cur, pendingAttachments = [], imageAttachments = [];',
  line('const __rtWriteVerbRe = '), line('const __rtImgRefRe = '), line('const __rtDocNounRe = '), line('const __rtStyleCueRe = '), line('const __rtSuggestRe = '), line('const __rtWriteAsk = '),
  line('const __IMGF_NEW_RE = '), line('const __IMGF_NOT_RE = '), line('const __IMG_EDIT_VERB_RE = '),
  imgFollowSrc,
  line('const __nanoQ = '), line('const __ATT_VISION_RE = '), line('const __codeWordRe = '), line('const __ackOnly = '),
  '  const __srcImg = null;',
  line('const __FOLLOW_ANY = '),
  '  const memAttach = !!(' + cond('if(!imageAttachments.length && cur.lastEditedImage && cur.lastEditedImage.b64 && !__rtWriteAsk').replace(/^/, '!imageAttachments.length && cur.lastEditedImage && cur.lastEditedImage.b64 && !__rtWriteAsk') + ');',
  '  return { follow: __IMG_FOLLOW, any: __FOLLOW_ANY, mem: memAttach, write: __rtWriteAsk };',
  '};',
].join('\n'), W);

test('٧. بعد صورة: «اكتب لي قصيدة/إيميل/تهنئة…» محادثة لا كتابة على الصورة، ولا تُرفق الصورة تلقائيًّا', () => {
  for (const t of ['اكتب لي قصيدة قصيرة عن الصقر', 'اكتب لي تهنئة قصيرة للموظفين', 'اكتب لي إيميل للعميل عن موعد التسليم', 'اكتب مقال عن الصقور']) {
    const r = W.after(t);
    assert.deepEqual([r.follow, r.any, r.mem], [false, false, false], t);
  }
});

test('٨. بعد صورة: الكتابة عليها والتعديل يبقيان على الصورة كما كانا', () => {
  for (const t of ['اكتب عليها عيد مبارك', 'اكتب «عيد مبارك» في الأعلى', 'اكتب قصيدة على الصورة', 'خلها بالليل']) {
    const r = W.after(t);
    assert.equal(r.write, false, t);
    assert.equal(r.follow || r.any, true, t);
    assert.equal(r.mem, true, 'الإرفاق التلقائيّ كما كان: ' + t);
  }
});

/* ── ٥. جلب الشعار الرسميّ ── */
const L = {};
vm.runInNewContext([
  'this.fetch = function(text){',
  '  const __freshChat = true, cur = { code: "" }, __ownerAppPlace = false;',
  line('const __logoFetchRe = '), line('const __logoDesignRe = '), line('const __logoNewRe = '), line('const __logoRefRe = '),
  line('const __isLogoFetch = '),
  '  return __isLogoFetch;',
  '};',
].join('\n'), L);

test('٩. الشعار: طلب التصميم («سوّ لي لوجو لمقهى») لا يذهب لجلب الشعار الرسميّ، و«عطني شعار شرطة دبي» يجلبه', () => {
  for (const t of ['سوّ لي لوجو لمقهى اسمه سنع', 'سو لي شعار لكافيه', 'أبي لوجو لصالون تجميل', 'Make me a logo for a coffee shop', 'صمم لي شعار لشركة']) {
    assert.equal(L.fetch(t), false, t);
  }
  for (const t of ['عطني شعار شرطة دبي', 'عطني شعار دائرة التنمية الاقتصادية', 'عطني شعار سوق دبي الحرة', 'عطني شعار المكتب الإعلامي لحكومة دبي']) {
    assert.equal(L.fetch(t), true, t);
  }
});

/* ── ٦. «رسمي» ليست كلمة وسائط ── */
test('١٠. «إيميل رسمي/خطاب رسمي» لا تنتظر مصنّف الوسائط؛ «ارسم/رسمة» كما كانت', () => {
  const WORD = vm.runInNewContext(line('const __MEDIA_WORD_RE = ').replace(/^const __MEDIA_WORD_RE = /, '').replace(/;$/, ''));
  for (const t of ['اكتب لي إيميل رسمي لمديري أطلب فيه إجازة ثلاث أيام', 'اكتب خطاب رسمي لهيئة الطرق بخصوص الاعتراض على مخالفة', 'الأوراق الرسمية للشركة']) {
    assert.equal(WORD.test(t), false, t);
  }
  for (const t of ['ارسم لي قطة', 'رسمة طفل يلعب', 'رسمها بالألوان المائية', 'صمم لي شعار', 'ابي انفوجرافيك عن خطوات تجديد الرخصة']) assert.equal(WORD.test(t), true, t);
});

test('١١. الحزمة مبنيّة من الجزء (الشروط الجديدة نفسها في app.bundle.js)', () => {
  const bundle = read('js/app.bundle.js');
  for (const head of ['const __strongBuildRe = ', 'const GATE_BUILD_RE = ', 'const __rtAdOk = ', 'const __rtDesignImg = ', 'const __rtWriteAsk = ', 'const __logoDesignRe = ', 'const __MEDIA_WORD_RE = ']) {
    assert.ok(bundle.includes(line(head)), head);
  }
  assert.ok(bundle.includes("&& __rtAdOk /* v-route-ad */ && !cur.adMode"), 'شرط الإعلان');
  assert.ok(bundle.includes('(__rtDesignImg /* v-route-design */ || __explicitImageTextRequest'), 'شرط البانِي');
});

test('١٢. المراجعة قبل الدمج: صورة مرفقة + «للبيع» إعلان كما كان، والتفاصيل تغلب كلمات السعر، والكتابة بخطّ على الصورة', () => {
  const photo = { isImage: true }, mem = { isImage: true, _fromMemory: true };
  for (const t of ['سيارة للبيع', 'للبيع', 'اعلان لسيارتي', 'إعلان لمحل العطور', 'للإيجار فيلا في العين', 'سيارتي للبيع بحالة ممتازة']) {
    assert.equal(A.ad(t, null, photo), true, 'مع صورة: ' + t);
    assert.equal(A.ad(t, null, mem), A.ad(t, null, null), 'صورة الذاكرة ليست مرفقًا جديدًا: ' + t);
  }
  assert.equal(A.ad('وش رأيك في هذا الإعلان؟', null, photo), false, 'السؤال عن صورة إعلان محادثة');
  assert.equal(A.ad('ترجم الإعلان هذا', null, photo), false, 'الترجمة محادثة حتّى مع صورة');
  for (const t of ['للإيجار شقق مفروشة في الشارقة أسعار مناسبة للتواصل 0501234567', 'للبيع أراضي سكنية في العين اسعار تبدأ من 200 ألف',
    'سعر حرق للبيع ايفون 15 برو 2500 درهم']) {
    assert.equal(A.ad(t, null, null), true, 'إعلان بتفاصيله: ' + t);
  }
  assert.equal(A.ad('ترجم الإعلان هذا للإنجليزي: للبيع شقة في الريم غرفتين', null, null), false, 'الترجمة تغلب التفاصيل');
  for (const t of ['اكتب رسالة رمضان كريم بخط ذهبي', 'اكتب رسالة: رمضان كريم', 'اكتب الرسالة: كل عام وأنتم بخير', 'اكتب رسالة عيد مبارك بخط ديواني']) {
    const r = W.after(t);
    assert.equal(r.write, false, 'كتابة على الصورة: ' + t);
    assert.equal(r.follow || r.any, true, t);
  }
  assert.equal(W.after('اكتب لي قصيدة قصيرة عن الصقر').write, true, 'الوثيقة كما هي');
});

test('١٣. v-route-want: «عطني/أبي + موقع/تطبيق/برنامج» بلا فعل بناء ولا وصف صنع = سؤال/بحث (كانت «تبيني أبدأ البناء؟» بلا أدوات)', () => {
  for (const t of ['عطني موقع مركز خدمة العملاء في دبي مول', 'ابي موقع السفارة الهندية في دبي', 'أبي رابط موقع الهيئة الاتحادية للهوية والجنسية',
    'عطني موقع رسمي أقدر أدفع منه المخالفات المرورية', 'ممكن تعطيني موقع مستشفى راشد', 'أبي أفضل تطبيق لتعلم الإنجليزي',
    'ممكن تقترح لي برنامج لإدارة المشاريع', 'عطني أداة أحول فيها PDF إلى وورد', 'ابي صفحة الدائرة الرسمية في انستقرام',
    'أبي لعبة حلوة أنزلها لولدي عمره ٨ سنوات' /* «أنزل» تغلب الملكيّة */, 'عطني تطبيق للملاحظات' /* «عطني» بلا ملكيّة جلب/توصية؛ البناء بفعله */,
    'هات لي موقع شرطة دبي' /* «لي» بعد الفعل ليست ملكيّة */]) {
    assert.equal(G.gate(t), false, t);
    assert.equal(G.askAllShape(t), false, 'اسأل الكل: ' + t);
  }
});

test('١٤. v-route-want: الرغبة + اسم البناء + وصف صنع تبقى بناءً، وفعل البناء الصريح والمشروع المفتوح كما كانا', () => {
  for (const t of ['اريد موقع لشركتي', 'ابغى موقع لشركتي فيه حجز مواعيد', 'أبي تطبيق يحسب الزكاة', 'ابي لعبة فيها سيارات', 'أبي برنامج يحسب الرواتب',
    'i want a website for my bakery', 'سوي لي موقع لمطعمي فيه منيو وحجز', 'ممكن تسوي لي صفحة هبوط لمعرض الكتاب', 'ابني لي موقع لشركة عقارات',
    /* كما كانت قبل v-route-want — لا تراجع */ 'أبي تطبيق ملاحظات', 'ابي لعبة سيارات', 'ابي موقع', 'ابي صفحة الهبوط لمنتجي', 'اريد موقع الشركة حقي',
    /* «عطني» + ملكيّة = صنع (owner-route-tools ٨) */ 'عطني موقع لمطعمي', 'هات لي تطبيق لشركتي']) {
    assert.equal(G.gate(t), true, t);
  }
  // مشروع مفتوح: «عطني صفحة تواصل» تعديل على الكود الحاضر لا جلب
  assert.equal(G.wantLookup('عطني صفحة تواصل', '<html></html>'), false);
  assert.equal(G.wantLookup('عطني صفحة تواصل', ''), true);
  // «الرابط/أفضل» تغلب وصف الصنع: سؤال توصية لا بناء
  assert.equal(G.gate('أبي أفضل برنامج لإدارة المشاريع'), false);
});

test('١٥. v-route-sticky: «اختصر/بالإنجليزي/خله أقصر» بعد ردّ نصّيّ لا تعود لآخر صورة؛ بعد الصورة مباشرةً كما كانت', () => {
  const poem = [{ role: 'user', content: 'اكتب لي قصيدة عن الصقر' }, { role: 'assistant', content: 'يا صقرُ يا رمزَ العلا…' }];
  for (const t of ['اختصرها', 'خله أقصر', 'بالإنجليزي', 'اكتبه بأسلوب رسمي', 'سوه أرسمي شوي']) {
    const r = W.after(t, poem);
    assert.equal(r.any, false, 'بعد القصيدة: ' + t);
  }
  for (const t of ['خلها بالليل', 'خل الخلفية زرقاء']) assert.equal(W.after(t).any, true, 'بعد الصورة مباشرةً: ' + t);
});

test('١٦. «أرسمي» (أكثر رسميّة) ليست «ارسم»: لا تفتح أنماط الصورة؛ «ارسم/ارسمي لي» كما كانتا', () => {
  const M = {};
  vm.runInNewContext([
    'this.m = function(text){',
    line('const __MEDIA_WORD_RE = '), line('const __MEDIA_MAKE_RE = '), line('const __explicitImgReq = '),
    line('const __archVerbRe = '), line('const __txtOnlyImgRe = '),
    '  return __MEDIA_WORD_RE.test(text) || __MEDIA_MAKE_RE.test(text) || __explicitImgReq || __archVerbRe.test(text) || __txtOnlyImgRe.test(text);',
    '};',
  ].join('\n'), M);
  for (const t of ['سوه أرسمي شوي', 'خله أرسمي', 'اكتبه بأسلوب أرسمي ومختصر']) assert.equal(M.m(t), false, t);
  for (const t of ['ارسم لي قطة', 'ارسمي لي وردة حمراء', 'أرسم لك صورة صقر']) assert.equal(M.m(t), true, t);
  for (const t of ['سوه أرسمي شوي', 'خله أرسمي']) assert.equal(B.builder(t, null), false, 'البانِي: ' + t);
});

test('١٧. الشعار: «ارسم لي شعار لنادي الشطرنج» تصميم لا جلب شعار رسميّ (كانت تبحث)', () => {
  for (const t of ['ارسم لي شعار لنادي الشطرنج', 'ارسم شعار لفريق كرة القدم في المدرسة', 'سو لي شعار لجمعية الصيادين']) assert.equal(L.fetch(t), false, t);
  assert.equal(L.fetch('عطني شعار نادي الشارقة'), true, 'شعار الجهة القائمة يُجلب كما كان');
});

test('١٨. v-route-suggest: بعد صورة شعار «اقترح لي اسم للنادي/عطني خمس أسماء» جواب بالكلام لا تعديل على الصورة', () => {
  for (const t of ['اقترح لي اسم للنادي', 'عطني خمس أسماء ثانية', 'اقترح لي عبارة للبوستر', 'هات أفكار ثانية', 'suggest a name for the club']) {
    const r = W.after(t);
    assert.deepEqual([r.write, r.follow, r.any, r.mem], [true, false, false, false], t);
  }
  // الإشارة للصورة تبقيها على الصورة كما كانت
  for (const t of ['اكتب اسم النادي عليها', 'حط اسم النادي فوقها', 'عطني فكرة ثانية للصورة']) {
    const r = W.after(t);
    assert.equal(r.write, false, t);
    assert.equal(r.follow || r.any, true, t);
  }
});
