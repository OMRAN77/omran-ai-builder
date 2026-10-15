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
  line('const __rtBuildVerbRe = '), line('const __rtGiveRe = '), line('const __rtDlRe = '), line('const __rtLookupRe = '), line('const __rtBestRe = '), line('const __rtNounRe = '), line('const __rtNotLookupRe = '), line('const __rtEntityRe = '),
  line('const __rtMineRe = '), line('const __rtFeatureRe = '), line('const __rtCloneRe = '),
  SRC.slice(SRC.indexOf('  const __rtIsLookup = '), SRC.indexOf('\n  };\n', SRC.indexOf('  const __rtIsLookup = ')) + 5),
  'function wantLookup(text, code){ return __rtIsLookup(text, code); }',
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
  line('const __rtLaneImgRe = '), line('function omranLaneImgAsk('), // مراجعة الدفعة A (rel-1 · rel-5): ما يُبنى فقط إن قال المصنّف image
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
  'this.after = function(text, extra, chain){',
  '  const omranPrevTurnHadImage = __omranPrev;',
  '  const cur = { lastMsgWasImageEdit: chain !== false, lastEditedImage: { b64: "x", mime: "image/png" }, messages: [',
  '    { role: "user", content: "ارسم صورة صقر على جبل" }, { role: "assistant", content: "", attachments: [{ isImage: true, name: "generated.png" }] } ].concat(extra || []) };',
  '  const getCurrent = () => cur, pendingAttachments = [], imageAttachments = [];',
  line('const __rtWriteVerbRe = '), line('const __rtImgRefRe = '), line('const __rtDocNounRe = '), line('const __rtStyleCueRe = '), line('const __rtSuggestRe = '), line('const __rtPutRe = '), line('const __rtWriteAsk = '), line('const __rtTextOutRe = '), line('const __rtTextOut = '), line('const __rtTextRevRe = '), line('const __rtIsTextOut = '), line('const __rtQRe = '), line('const __rtContRe = '), line('const __rtDocNameRe = '),
  SRC.slice(SRC.indexOf('  const __rtCtx = '), SRC.indexOf('  })();', SRC.indexOf('  const __rtCtx = ')) + 7),
  line('const __rtTextRev = '), line('const __rtAfterTextOut = '),
  line('const __IMGF_NEW_RE = '), line('const __OMRAN_ACK_RE = '), line('const __IMGF_NOT_RE = '), line('const __IMG_EDIT_VERB_RE = '),
  imgFollowSrc,
  line('const __nanoQ = '), line('const __ATT_VISION_RE = '), line('const __codeWordRe = '),
  '  const __srcImg = null;',
  line('const __FOLLOW_ANY = '),
  line('const __imgEditRe = '), line('const __IMG_CREATIVE_RE = '), line('const __editStyleIntent = '), line('const __FOLLOW_DEFAULT = '),
  line('const __STYLE_RE = '), line('const __styleShort = '), line('const __STYLE_FOLLOW = '),
  '  const memAttach = !!(' + cond('if(!imageAttachments.length && cur.lastEditedImage && cur.lastEditedImage.b64 && !__rtWriteAsk').replace(/^/, '!imageAttachments.length && cur.lastEditedImage && cur.lastEditedImage.b64 && !__rtWriteAsk') + ');',
  '  return { follow: __IMG_FOLLOW, any: __FOLLOW_ANY, def: __FOLLOW_DEFAULT, style: __STYLE_FOLLOW, mem: memAttach, write: __rtWriteAsk, textOut: __rtTextOut, rev: __rtTextRev };',
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
  // لا lookbehind في الحزمة: سفاري قبل 16.4 يرفض السكربت كلّه فيموت التطبيق على الآيفونات الأقدم (main بلا أيّ واحد)
  assert.ok(!/\(\?<[!=]/.test(bundle), 'لا (?<! ولا (?<= في app.bundle.js');
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

test('١٥. v-route-sticky: بعد «اكتب لي قصيدة/بوست/ملخص» المراجعة النصّيّة («اختصرها/خله أقصر/بالإنجليزي») للنصّ، والتعديل البصريّ («بالليل/الخلفية بحر») للصورة كما في main', () => {
  const U = (c) => ({ role: 'user', content: c }), A = (c) => ({ role: 'assistant', content: c });
  const IMG = (r) => r.follow || r.any || r.def || r.style;
  const poem = [U('اكتب لي قصيدة عن الصقر'), A('يا صقرُ يا رمزَ العلا…')];
  for (const t of ['اختصرها', 'خله أقصر', 'خلها أطول', 'بالإنجليزي', 'ترجمها', 'اكتبه بأسلوب رسمي', 'سوه أرسمي شوي', 'اختصرها في ثلاث نقاط']) {
    const r = W.after(t, poem);
    assert.equal(r.rev, true, 'مراجعة نصّيّة: ' + t);
    assert.deepEqual([r.follow, r.any, r.def, r.style, r.mem], [false, false, false, false, false], 'بعد القصيدة للنصّ: ' + t);
  }
  // المراجعة الرابعة: التعديل البصريّ بعد الدور النصّيّ يبقى على الصورة (العلامة لا تُمسّ)
  for (const t of ['خلها بالليل', 'خل الخلفية بحر', 'خله كرتون', 'كبر الصقر', 'غير لون السماء للبنفسجي', 'خل السماء زرقاء']) {
    assert.equal(IMG(W.after(t, poem)), true, 'بصريّ بعد القصيدة: ' + t);
  }
  for (const pre of [[U('سوي لي ملخص عن تاريخ الاتحاد'), A('ملخص…')], [U('اكتب لي معلومات عن الجمال'), A('الجمال…')], [U('اكتب لي بوست لينكدإن عن العمل الجماعي'), A('بوست…')]]) {
    for (const t of ['بالإنجليزي', 'اختصرها في ثلاث نقاط', 'خله أقصر']) assert.equal(IMG(W.after(t, pre)), false, pre[0].content + ' ← ' + t);
  }
  // المسبار الأعمى (الجولة الأخيرة): «الثالث حلو» بعد «عطني خمس أسماء» للنصّ؛ «اختصر» بعد سؤال و«كمل»؛ «اختصر القصيدة» تسمّي النصّ
  const names = [U('اقترح لي اسم للنادي'), A('١. الفرسان…'), U('عطني خمس أسماء ثانية'), A('١… ٥…')];
  assert.equal(IMG(W.after('الثالث حلو', names)), false, 'بعد اقتراح الأسماء');
  assert.equal(IMG(W.after('خلها بالليل', names)), true, 'والتعديل الصريح بعدها يبقى');
  assert.equal(IMG(W.after('اختصر', [U('وش معنى الوردة الحمراء في الثقافة العربية'), A('…'), U('كمل'), A('…')])), false, 'بعد سؤال و«كمل»');
  assert.equal(IMG(W.after('اختصر القصيدة', [U('اكتب قصيدة عن الصورة'), A('…'), U('وش اسم هذي السلالة؟'), A('…')])), false, 'تسمية النصّ');
  // سلسلة مراجعات: «اختصرها» ثمّ «بالإنجليزي» كلاهما للنصّ
  assert.equal(IMG(W.after('بالإنجليزي', poem.concat([U('اختصرها'), A('…')]))), false, 'مراجعة بعد مراجعة');
  // «حلوة» بينهما تُرجع سلوك main، وبعد الصورة مباشرةً كما كانت
  assert.equal(W.after('اختصرها', poem.concat([U('حلوة'), A('شكرًا')])).rev, false, 'فاصل غير نصّيّ = سلوك main');
  assert.equal(W.after('خله أقصر').def, true, 'بعد الصورة مباشرةً «خله…» تعديل كما كان');
  assert.equal(W.after('خله كرتون').style, true);
  for (const t of ['خلها بالليل', 'خل الخلفية زرقاء']) assert.equal(W.after(t).follow || W.after(t).any, true, 'بعد الصورة مباشرةً: ' + t);
  // المسبار الأعمى: طلب مخرَج نصّيّ بعد صورة لا تُرفق له صورة الذاكرة؛ والسؤال عن الصورة يحملها كما كان
  for (const t of ['سوي لي ملخص عن تاريخ الاتحاد', 'اكتب لي معلومات عن الجمال', 'عطني نبذة عن الصقور', 'ابي شرح عن تاريخ الإمارات']) assert.equal(W.after(t).mem, false, 'بلا صورة ذاكرة: ' + t);
  /* v-chat-img-budget (لقطة مستخدم ١٥ أكتوبر: «ابا معلومات عن هندسه الطيران» بعد «اكتب تحت…» على صورة = 413): الإملاء الخليجيّ لفعل الطلب
     لم يكن في الحارس، فتُرفق صورة الذاكرة (٦٫٩ مليون حرف) بسؤال لا يخصّها */
  for (const t of ['ابا معلومات عن هندسه الطيران', 'أبا نبذة عن الصقور', 'ابغا شرح عن تاريخ الإمارات', 'ودي معلومات عن الخيل', 'نبي ملخص عن الاتحاد', 'بدي معلومات عن الطيران']) assert.equal(W.after(t).mem, false, 'بلا صورة الذاكرة: ' + t);
  for (const t of ['وش رايك فيها؟', 'اكتب لي وصف للصورة', 'سوي لي ملخص عن الصورة']) assert.equal(W.after(t).mem, true, 'السؤال عن الصورة يحملها: ' + t);
  // العلامة لا تُنزل في مسار النصّ (كما في main) — لا سطر نزع
  assert.ok(!/__rtTextOut && !imageAttachments\.length && cur\.lastMsgWasImageEdit\) cur\.lastMsgWasImageEdit = false/.test(SRC));
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
  // المراجعة العدائيّة: البدائل الجديدة مرسّاة باللام أوّل الكلمة — «النادي/المركز/المؤسسة…» جهات قائمة تُجلب كما كانت
  for (const q of ['عطني شعار النادي الأهلي', 'عطني لوجو النادي العربي', 'عطني شعار المركز الوطني للأرصاد', 'عطني شعار المؤسسة العامة للتأمينات الاجتماعية',
    'عطني شعار الجمعية التعاونية', 'عطني شعار المدرسة الإماراتية', 'عطني شعار الفريق الوطني']) assert.equal(L.fetch(q), true, q);
});

test('١٨. v-route-suggest: بعد صورة شعار «اقترح لي اسم للنادي/عطني خمس أسماء» جواب بالكلام لا تعديل على الصورة', () => {
  for (const t of ['اقترح لي اسم للنادي', 'عطني خمس أسماء ثانية', 'اقترح لي عبارة للبوستر', 'هات أسماء ثانية', 'suggest a name for the club']) {
    const r = W.after(t);
    assert.deepEqual([r.write, r.follow, r.any, r.mem], [true, false, false, false], t);
  }
  // الإشارة للصورة تبقيها على الصورة كما كانت
  for (const t of ['اكتب اسم النادي عليها', 'حط اسم النادي فوقها', 'عطني فكرة ثانية للصورة',
    /* المراجعة العدائيّة: فعل الوضع أو «على الشعار» يبقيها تعديلًا */ 'اقترح اسم ثاني واكتبه على الشعار', 'اقترح لي اسم وحطه على اللوجو', 'عطني اسم ثاني للنادي على الشعار', 'عطني فكرة ثانية']) {
    const r = W.after(t);
    assert.equal(r.write, false, t);
    assert.equal(r.follow || r.any, true, t);
  }
});

test('١٩. المراجعة العدائيّة: الصورة المولَّدة وتقريرها رسالتان — «أكثر واقعية/بالليل» بعدها تعديل كما في main، وصور أداة المحادثة كذلك', () => {
  const report = [{ role: 'assistant', content: '📋 تفسير الفكرة\n- صقر على قمّة جبل…' }];
  for (const t of ['أكثر واقعية', 'بالليل', 'خلها بالليل', 'نفس الشي بس مبتسمة']) {
    const r = W.after(t, report.concat([{ role: 'user', content: t }]));
    assert.equal(r.follow || r.any || r.def, true, 'بعد صورة + تقريرها: ' + t);
  }
  const tool = [{ role: 'user', content: 'ارسم لي شخصيات أطفال يلعبون' }, { role: 'assistant', content: 'تفضل 👇\n__IMG_1__' }];
  const r = W.after('غير الشخصيات الي 3d', tool);
  assert.equal(r.any || r.def || r.style, true, 'صورة أداة المحادثة رمزٌ في النصّ لا مرفق — المتابعة تعدّلها (v-tool-chain)');
});

test('٢٠. المراجعة العدائيّة: البناء بوصفه أو ملكيّته أو استنساخه يبقى بناءً؛ الجهات القائمة بحث', () => {
  for (const t of ['أبغى موقع الكتروني', 'اريد موقع للشركة', 'ابي موقع للمطعم', 'ابي صفحة للحجز', 'ابي موقع للعيادة حقتي', 'ابي موقع للشركة حقتنا',
    'ابي موقع رسمي لشركتي', 'ابي موقع لمطعمي فيه رابط واتساب', 'ابي موقع لمطعمي فيه عنوان وخريطة', 'ابي تطبيق يعرض أفضل المطاعم', 'أبي برنامج أعرف فيه مصاريفي',
    'ابي موقع لمرسمي', 'ابي نسخة من انستقرام', 'أبي تطبيق مثل سناب شات',
    /* المراجعة الثانية */ 'ابي موقع بنك اسئلة للطلاب', 'ابي تطبيق جامع للملاحظات والمهام', 'ابي موقع مستشفى لمشروع التخرج', 'ابي تطبيق مطاردة سيارات',
    'ابي تطبيق بنك بسيط', 'ابي موقع مستشفى متكامل', 'ابي تطبيق بس ما اعرف برمجة', 'ابي موقع بس ما اعرف كيف ابدأ', 'ابي تطبيق اعرف منه كم صرفت',
    'ابي صفحة تحميل لتطبيقي', 'ابي صفحة تحميل للتطبيق حقي', 'ابي موقع لكتبي وفيه تحميل pdf', 'ابي صفحة لينك تري', 'عطني موقع حق مطعمي', 'عطني صفحة حق متجري',
    /* المراجعة الثالثة */ 'ابي موقع وما اعرف برمجة', 'ابي موقع ولا اعرف ابرمج', 'أبي تطبيق يرسل رابط الدفع للعملاء', 'ابي تطبيق يولد رابط دعوة للحفلة', 'ابي موقع يختصر رابط طويل',
    'ابي تطبيق عشان اعرف كم صرفت في الشهر', 'ابي موقع لمتجري انزل عليه المنتجات', 'ابي تطبيق اقدر احمل عليه الفيديوهات', 'ابي موقع بنك الأسئلة للطلاب',
    'ابي تطبيق مجلس الطلاب', 'ابي تطبيق دائرة الأصدقاء', 'ابي تطبيق حساب الدائرة']) {
    assert.equal(G.gate(t), true, t);
  }
  // «سو» بلا ياء: بناء عبر «اسأل الكل» كما كان في main (فعل بناء صريح فلا يُقرأ جلبًا)
  for (const t of ['سو لي موقع فيه رابط انستقرام', 'سو لي تطبيق يعرض أفضل العروض']) assert.equal(G.askAllShape(t), true, t);
  for (const t of ['I want an app that generates a payment link', 'I want a link shortener website', 'i want a link in bio page']) assert.equal(G.wantLookup(t, ''), false, t);
  for (const t of ['عطني موقع وزارة الاقتصاد', 'ابي رابط تطبيق الهيئة', 'ابي موقع وزارة الصحة', 'ابي تطبيق الهيئة الاتحادية للضرائب', 'وين أحمله تطبيق سهل؟ ابي رابط التحميل',
    'ابي موقع شرطة دبي', 'ابي موقع بنك دبي الاسلامي', 'أبي أعرف موقع الدائرة الاقتصادية في دبي', 'ابي تطبيق احمله للايفون', 'ممكن تعطيني موقع مستشفى راشد']) {
    assert.equal(G.wantLookup(t, ''), true, t);
  }
});

test('٢١. المراجعة العدائيّة: «تمام/زين/اوكي شكرا» بعد جواب بحث ليست موافقة على بناء ما بُحث عنه (شبكة استرجاع الطلب المعلّق)', () => {
  const i = SRC.indexOf('        const __cand = [...__ms].reverse().find(m => {');
  assert.ok(i > 0);
  const j = SRC.indexOf('        const __lastU = ', i);
  const finder = SRC.slice(i, SRC.indexOf('\n', j)).replace('const __lastU = ', 'return ');
  const R = {};
  vm.runInNewContext([line('const GATE_BUILD_RE = '), line('const GATE_CMD_RE = '),
    line('const __rtBuildVerbRe = '), line('const __rtGiveRe = '), line('const __rtDlRe = '), line('const __rtLookupRe = '), line('const __rtBestRe = '), line('const __rtNounRe = '), line('const __rtNotLookupRe = '), line('const __rtEntityRe = '),
    line('const __rtMineRe = '), line('const __rtFeatureRe = '), line('const __rtCloneRe = '),
    SRC.slice(SRC.indexOf('  const __rtIsLookup = '), SRC.indexOf('\n  };\n', SRC.indexOf('  const __rtIsLookup = ')) + 5),
    'this.pick = function(__ms){ const __gp = { code: "" }; ' + finder + ' };'].join('\n'), R);
  for (const q of ['أبي أفضل تطبيق لتعلم الإنجليزي', 'عطني موقع وزارة الاقتصاد', 'ابي رابط تطبيق الهيئة', 'ممكن تقترح لي برنامج لإدارة المشاريع']) {
    assert.ok(!R.pick([{ role: 'user', content: q }, { role: 'assistant', content: 'أنصحك بـ…' }]), q);
  }
  const b = R.pick([{ role: 'user', content: 'أبي تطبيق ملاحظات' }, { role: 'assistant', content: 'تبيني أبدأ؟' }]);
  assert.equal(b && b.content, 'أبي تطبيق ملاحظات', 'طلب البناء يُسترجع كما كان');
  // المراجعة الثانية: لا يتخطّى البحث إلى طلب بناء أقدم أُجّل («لا بعدين»)
  assert.equal(R.pick([{ role: 'user', content: 'ابي موقع لمطعمي' }, { role: 'assistant', content: 'تبيني أبدأ البناء؟' }, { role: 'user', content: 'لا بعدين' },
    { role: 'assistant', content: 'تمام' }, { role: 'user', content: 'عطني رابط موقع وزارة الصحة' }, { role: 'assistant', content: 'هذا الرابط…' }]), null);
});
