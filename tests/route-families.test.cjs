// tests/route-families.test.cjs — v-ack-one / v-vague-guard / v-animate-phrase / v-att-ocr / v-want-verbs
// العرض (مسبار التوجيه ١١ أكتوبر، sendPrompt الحقيقيّ في Chromium على مدوّنات عمياء): بعد صورة مولَّدة ٧ من ١٠ رسائل شكر («شكرا وايد»،
// «تسلم ايدك»، «thanks a lot»، «خلاص بس»…) صارت تعديلًا مدفوعًا؛ و«ابي صورة/ابغى رسمة/ارسم لي شي/make me a video» تولّد عشوائيًّا
// بدل «عن شو؟»؛ ومع صورة «خلها تتحرك/خلها متحركة» تعديلٌ لا فيديو، و«حول اللي في الصورة لنص» تعديل، و«اكتب النص اللي في الصورة»
// كتابة عليها؛ و«ودي فيديو…»، «نبي فيديو…»، «ممكن ترسم لي…»، «تقدر تصمم لي شعار…» تذهب للمحادثة بلا مربّع ولا حلقة تعديل.
// كلّ ما هنا يشغّل التعابير والشروط الحقيقيّة من js/app-09-attach.js (tests/_route-src.cjs)، لا نسخة منها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { load } = require('./_route-src.cjs');
const h = load();
const R = h.R;

test('١. الشكر بعد الصورة: قائمة واحدة، والشكر بمقوّياته ليس تعديلًا', () => {
  assert.ok(R.ack, '__OMRAN_ACK_RE موجودة');
  const acks = ['شكرا', 'شكرا وايد', 'مشكور', 'مشكور ما قصرت', 'يعطيك العافية', 'يعطيك العافية وايد حلوة', 'تسلم ايدك', 'حلوة وايد', 'ممتاز',
    'thanks a lot', 'thank you so much', 'الله يسلمك', 'تمام كذا', 'خلاص بس', 'تمام 👍', 'شكرا يا عمران', 'والله حلوة', 'زين', 'ok', 'perfect'];
  for (const t of acks) {
    assert.ok(R.ack.test(t), 'شكر: ' + t);
    const a = h.after(t, 'ارسم لي وردة حمراء');
    assert.equal(a.edit, false, 'بعد صورة ليس تعديلًا: ' + t + ' ' + JSON.stringify(a));
  }
});

test('٢. التعديل القصير بعد الصورة يبقى تعديلًا، ولو بدأ بكلمة شكر', () => {
  const edits = ['تمام بس كبر الشعار', 'حلوة بس الإضاءة قوية', 'نفس الشي بس مبتسمة', 'لا، الخلفية فقط', 'أكثر واقعية', 'خلها بالليل', 'شكرا بس خلها زرقا', 'تمام مرة ثانية'];
  for (const t of edits) {
    assert.ok(!R.ack.test(t), 'ليس شكرًا: ' + t);
    assert.equal(h.after(t, 'ارسم لي وردة حمراء').edit, true, 'تعديل: ' + t);
  }
});

test('٣. الطلب المبهم يُسأل عنه («صورة عن شو؟»/«فيديو عن شو؟»)، وطلب له موضوع يمرّ', () => {
  for (const t of ['ابي صورة', 'ابغى رسمة', 'سو لي رسمة', 'ارسم لي شي', 'ودي صورة', 'صورة لو سمحت', 'ابي فيديو', 'سوي فيديو', 'اريد مقطع', 'make me a video', 'make an image', 'ابغى صورة', 'ارسم لي صورة']) {
    assert.equal(h.vague(t), true, 'مبهم: ' + t);
  }
  for (const t of ['صورة قطة', 'ابي صورة لحصان', 'رسمة بسيطة لطفل يصلي', 'تصور معماري لفيلا', 'draw a cat', 'ارسم لي قطة', 'فيديو لطيور تطير', 'سوي لي فيديو عن دبي']) {
    assert.equal(h.vague(t), false, 'له موضوع: ' + t);
  }
  // البانِي يسأل عن المبهم حتّى حين يطابق __txtOnlyImgRe («ارسم لي شي» كانت تتخطّى الفحص)
  const i = h.SRC.indexOf('      if(__bareDraw || ');
  const cond = h.SRC.slice(i + '      if('.length, h.SRC.indexOf('){', i));
  const asks = (text) => vm.runInNewContext(cond, { text, __bareDraw: R.bareDraw.test(text), __txtOnlyImgRe: R.txtOnly, __isVagueMediaRequest: h.vague });
  for (const t of ['ارسم لي شي', 'ابغى رسمة', 'صورة لو سمحت', 'ابي صورة']) assert.equal(asks(t), true, 'البانِي يسأل: ' + t);
  for (const t of ['ارسم لي قطة', 'صورة قطة لابسة نظارة']) assert.equal(asks(t), false, 'البانِي يرسم: ' + t);
  // الفيديو بلا صورة: «make me a video» طلب فيديو مبهم (كان يذهب لـ/api/video-create)
  assert.equal(h.wantsVideo('make me a video', false) && h.vague('make me a video'), true);
});

test('٤. مع صورة: عبارات التحريك فيديو (تأكيد الكلفة من الخادم)، والكلمات المتصرّفة وحدها لا', () => {
  for (const t of ['خل الصورة تتحرك', 'خلها تتحرك', 'ابيها تتحرك', 'ابيها تتحرك كأنها فيديو', 'خلها متحركة', 'سوها فيديو', 'حولها لفيديو', 'حركها شوي', 'animate it']) {
    assert.equal(h.wantsVideo(t, true), true, 'فيديو: ' + t);
  }
  for (const t of ['خلها كرتون', 'خل الخلفية بحر', 'متحرك', 'يتحرك', 'المحرك', 'خلها ابيض واسود']) {
    assert.equal(h.wantsVideo(t, true), false, 'ليس فيديو: ' + t);
  }
  // «خلها تتحرك» وحدها = حرّك الصورة كما هي (صورتك أوّل إطار) مثل «حرّكها» وحدها؛ كلمة مشهد = يُبنى إطار
  const m = h.SRC.match(/const __ANIM_ONLY_RE = (\/.+\/i);/);
  const only = vm.runInNewContext(m[1]);
  const keep = (t) => t.split(/[\s،,.!؟?()"'«»:؛\-]+/).filter(Boolean).every((w) => only.test(w));
  for (const t of ['خلها تتحرك', 'خل الصورة تتحرك', 'خلها متحركة', 'سوها فيديو', 'حركها']) assert.equal(keep(t), true, 'الصورة نفسها: ' + t);
  assert.equal(keep('خلها تتحرك وهي ترقص في السوق'), false);
});

test('٥. مع صورة: نسخ النصّ منها قراءة، والكتابة عليها وتلوين نصّها تعديل', () => {
  for (const t of ['حول اللي في الصورة لنص', 'حول الكلام اللي فيها لنص اقدر انسخه', 'حولها لنص', 'اكتب النص اللي في الصورة', 'اكتب الكلام اللي فيها', 'انسخ النص', 'convert this image to text']) {
    assert.ok(R.attVision.test(t), 'قراءة: ' + t);
  }
  for (const t of ['اكتب عليها جمعة مباركة', 'حول النص للون الأحمر', 'حول الصورة الى كرتون', 'خلها ابيض واسود', 'حط عليها فلتر قديم', 'اكتب «عيد مبارك» في الأعلى']) {
    assert.ok(!R.attVision.test(t), 'تعديل: ' + t);
  }
});

test('٦. أفعال الرغبة والطلب المهذّب: فيديو وصورة وتصميم، والطلب المهذّب بعد أداة طلب فقط', () => {
  for (const t of ['ودي فيديو لسيارة تمشي في الصحراء', 'نبي فيديو قصير عن القهوة العربية', 'ابي كليب لشروق الشمس', 'ممكن تعمل لي فيديو لشلال', 'تقدر تسوي مقطع لطائرة', 'ممكن فيديو قصير لشخص يشرب قهوة', 'سو مقطع انيميشن للأطفال عن غسل اليدين']) {
    assert.ok(R.VID_MAKE.test(t) && !R.VID_Q.test(t), 'صانع الفيديو: ' + t);
  }
  for (const t of ['شرح لي طريقة تسوي فيديو للتيك توك', 'رأيك في فيلم عن الحرب', 'عندي فيلم قصير عن الصقور', 'سو لي مقطع صوتي يقول صباح الخير']) {
    assert.ok(!R.VID_MAKE.test(t), 'ليس طلب فيديو: ' + t);
  }
  assert.ok(R.VID_Q.test('تقدر تسوي فيديو؟'), 'السؤال يُستثنى كما كان');
  for (const t of ['تقدر تصمم لي شعار لمطعم', 'ممكن تصمم لي كرت معايدة للعيد', 'تكفى صمم لي ستيكر لقهوة عربية', 'سو لي لوقو لمقهى']) assert.ok(R.designMake.test(t), 'تصميم: ' + t);
  // مراجعة الدفعة A (rel-5): «ممكن ترسم…» بلا مفعول صورة، وأفعال الرغبة الجديدة + صورة — بانٍ فقط إن قال المصنّف image (__rtLaneImgRe)
  for (const t of ['ممكن ترسم لي بيت', 'لو سمحت ترسم لي وردة', 'يا ليت ترسم لي غيمة', 'حاب صورة كرتونية لطفل يدرس', 'نبي صورة لبرج خليفة']) {
    assert.ok(R.laneImg.test(t) && !R.txtOnly.test(t) && !R.unifiedBuild.test(t), 'رسم بشرط المصنّف: ' + t);
  }
  for (const t of ['ممكن تسوي لي صورة لقطة', 'ودي صورة لجمل']) assert.ok(R.unifiedBuild.test(t), 'صورة: ' + t);
  for (const t of ['كيف ترسم وجه', 'متى ترسم اللوحة', 'ليش تصمم كذا']) {
    assert.ok(!R.txtOnly.test(t) && !R.designMake.test(t) && !R.unifiedBuild.test(t), 'ليس طلبًا: ' + t);
  }
  // المصنّف يُستشار لأفعال الرغبة والطلب المهذّب (له حقّ الفيتو)، والكلام عن الوسائط لا ينتظره
  for (const t of ['ودي صورة لجمل', 'نبي فيديو قصير عن القهوة', 'يا ليت ترسم لي غيمة', 'لو سمحت ترسم لي وردة']) assert.equal(h.classifierCalled(t), true, 'مصنّف: ' + t);
  for (const t of ['رأيك في فيلم الأمس', 'شفت صورة حلوة اليوم']) assert.equal(h.classifierCalled(t), false, 'لا انتظار: ' + t);
});

/* مراجعة الدفعة A — rel-1 · rel-2 · rel-3 · rel-4 · rel-5 · rel-7 على التعابير والشروط الحقيقيّة (السطر نفسه من الكود). */
const gateLine = (() => { const i = h.SRC.indexOf('       (__rtDesignImg /* v-route-design */'); return h.SRC.slice(i, h.SRC.indexOf('){\n', i)).trim(); })();
function builds(text, lane) { // شرط بانِي الصور بنصّه، وما قبله من البوّابة (ليس none/video، ولا كود)
  const ctx = { text, __mediaLane: lane, __rtDesignImg: R.designMake.test(text) || (lane === 'image' && R.designWant.test(text)), __explicitImageTextRequest: false,
    omranLaneImgAsk: (t, l) => l === 'image' && R.laneImg.test(t), __txtOnlyImgRe: R.txtOnly, __imgGenIntentRe: R.imgGen, __unifiedBuildRe: R.unifiedBuild, __nanoQ: R.nanoQ };
  return lane !== 'none' && lane !== 'video' && !R.codeWord.test(text) && !!vm.runInNewContext(gateLine, ctx);
}

test('٧. rel-1 · rel-5: لوحة/خلفية بعد فعل رغبة أو طلب مهذّب، و«ممكن ترسم» المجازيّة، والرغبة الجديدة + صورة — لا صورة مدفوعة بلا «image» من المصنّف', () => {
  assert.ok(gateLine.includes('omranLaneImgAsk(text, __mediaLane)'), 'البوّابة تسأل المسار المشروط');
  const talk = ['حاب لوحة مفاتيح عربية للابتوب بسعر معقول', 'نبي لوحة سيارة مميزة للوالد', 'حاب خلفية بسيطة عن تاريخ الدولة العثمانية', 'نبي لوحة تحكم للمتجر نتابع فيها الطلبات',
    'حابب لوحة الدرجات تطلع بالترتيب', 'ممكن تسوي لي لوحة تحكم للمتجر', 'تقدر تعمل لي خلفية عن الشركة للعرض التقديمي', 'ابي لوحة مفاتيح جديدة'];
  for (const t of talk) for (const lane of [null, 'none']) assert.equal(builds(t, lane), false, 'كلام (المصنّف ' + lane + '): ' + t);
  for (const t of ['ممكن ترسم لي مسار مهني كمحاسب مبتدئ', 'نبغى صورة واضحة عن الوضع المالي للشركة قبل الاجتماع']) {
    assert.equal(builds(t, null), false, 'المصنّف متعذّر: كلام — ' + t);
    assert.equal(builds(t, 'image'), true, 'المصنّف قال image: صورة — ' + t);
  }
  // الصورة الحقيقيّة باقية: الأمر الصريح، والموصوف، والرغبة القديمة + صورة، وكلّ ما قال فيه المصنّف image
  for (const t of ['ارسم لي لوحة لغروب الشمس', 'حاب لوحة زيتية لقرية جبلية', 'ابغى خلفية للجوال فيها بحر', 'ودي صورة لجمل في الصحراء وقت الغروب', 'سوي لي صورة لقطة']) assert.equal(builds(t, null), true, 'صورة: ' + t);
  for (const t of ['نبغى رسمة كرتونية لعائلة على البحر', 'ممكن ترسم لي حصان عربي أبيض', 'ابي لوحة لغروب الشمس']) assert.equal(builds(t, 'image'), true, 'صورة بقول المصنّف: ' + t);
});

test('٨. rel-5: فعل رغبة + مقطع/فيلم ليس صانع فيديو إن تلاه «من قصيدة/رواية» أو «أشوف/انصحني» أو «صوتي»؛ طلب المشهد يبقى', () => {
  for (const t of ['ابي مقطع من قصيدة المتنبي عن الشجاعة', 'نبي مقطع صوتي للأذان بصوت هادي', 'ودي فيلم رعب اشوفه الليلة مع العيال', 'ابغا مقطع من رواية ساق البامبو', 'ودي فيلم وثائقي عن الفضاء انصحني']) {
    assert.ok(!R.VID_MAKE.test(t), 'ليس طلب فيديو: ' + t);
  }
  for (const t of ['ودي مقطع قصير لشلال في غابة', 'ابي فيديو لصقر يطير فوق الجبال', 'ابغا كليب لسيارة تمشي في دبي بالليل', 'سوي لي مقطع من قصيدة المتنبي مع صور صحراء', 'اريد فيلم قصير عن جمل يمشي']) {
    assert.ok(R.VID_MAKE.test(t), 'صانع الفيديو: ' + t);
  }
});

test('٩. rel-2: بعد صورة مولَّدة «ابي فيديو منها» يفتح صانع الفيديو ببطل الصورة نفسها؛ طلب فيديو بموضوعه جديد بلا بطل', () => {
  assert.ok(h.videoHero, 'omranLastImageHero موجودة');
  for (const t of ['ابي فيديو منها', 'ابي فيديو', 'ودي فيديو لها وهي تلعب', 'نبي فيديو من هالصورة', 'ابغى فيديو منها', 'اريد فيديو منها']) assert.equal(h.videoHero(t), true, 'البطل الصورة: ' + t);
  for (const t of ['ابي فيديو لصقر يطير فوق الجبال', 'نبي فيديو لطفل يلعب كورة في الحارة']) assert.equal(h.videoHero(t), false, 'طلب جديد: ' + t);
  const i = h.SRC.indexOf('    const __heroAtt = ');
  assert.ok(i > h.SRC.indexOf('    const __vidOwnWords = __vidOwnWordsOf(text);') && h.SRC.slice(i, h.SRC.indexOf('\n', i)).includes('omranLastImageHero(getCurrent(), text, __vidOwnWords.length)'), 'البطل بعد كلام المستخدم، وgetCurrent() لا cur (TDZ)');
});

test('١٠. rel-3: نسخ النصّ مرسًى على الصورة نفسها؛ الكتابة على الصورة بأسلوبها و«حوّل … لكتابة» تعديل', () => {
  for (const t of ['اكتب الكلام اللي بين القوسين على الصورة (مبروك التخرج)', 'اكتب النص اللي بالأسفل بخط ذهبي: عيد سعيد', 'اكتب الكلام اللي على الكرت بخط أوضح',
    'حول اسمي لكتابة بالخط الديواني', 'حول الاسم لكتابة عربية', 'اكتب الكلام اللي على الصورة بخط أكبر', 'اكتب النص اللي بالرسالة على الصورة']) {
    assert.ok(!R.attVision.test(t), 'تعديل/كتابة: ' + t);
  }
  for (const t of ['اكتب النص اللي في الصورة', 'اكتب الكلام اللي فيها', 'اكتب النص اللي بخط اليد بشكل مرتب', 'حول اللي في الصورة لنص', 'حولها لنص اقدر انسخه', 'اكتب النص اللي في الصورة لو سمحت']) {
    assert.ok(R.attVision.test(t), 'قراءة: ' + t);
  }
  assert.equal(h.after('حول الاسم لكتابة عربية', 'ارسم لي بطاقة فيها اسم Omar بخط حلو').edit, true, 'بعد صورة مولَّدة: تعديل');
});

test('١١. rel-4: المشروع المفتوح — ملاحظة المالك في كلّ دور تعمل فيه الأدوات، ولا «موضوع جديد» على دور فيه فعل تعديل', () => {
  const ownerLine = h.SRC.slice(h.SRC.indexOf('      } else if(__ownerFree && '), h.SRC.indexOf('\n', h.SRC.indexOf('      } else if(__ownerFree && ')));
  assert.ok(ownerLine.includes('__ownerFree && !!cur.code && __toolsWillRun'), 'لا على __routeFix وحده: ' + ownerLine.slice(0, 80));
  const branchStart = h.SRC.indexOf('      } else if(__ownerFree && ');
  const branch = h.SRC.slice(branchStart, h.SRC.indexOf('      // v469: Q&A system prompt', branchStart));
  assert.ok(branch.includes('omranOwnerRepoNote'), 'طلب التطبيق يُصرف للمستودع لا المعاينة');
  assert.ok(h.SRC.includes("'المشروع المفتوح = عدّله في الردّ"), 'الملاحظة ما زالت');
  const topic = h.SRC.slice(h.SRC.indexOf("      if(typeof window.omranTopicSwitch === 'function'"), h.SRC.indexOf('\n', h.SRC.indexOf("      if(typeof window.omranTopicSwitch === 'function'")));
  assert.ok(topic.includes('!__editVerbHit'), 'فيتو فعل التعديل على ملاحظة الموضوع');
  // __editVerbHit بنصّه: المشروع مفتوح + فعل تعديل («كم منتج اقدر احط؟» فيها «حط»)
  const i = h.SRC.indexOf('  const __editVerbRe = ');
  const src = [h.SRC.slice(i, h.SRC.indexOf('\n', i)), h.SRC.slice(h.SRC.indexOf('  const __editObjRe = '), h.SRC.indexOf('\n', h.SRC.indexOf('  const __editObjRe = '))),
    h.SRC.slice(h.SRC.indexOf('  const __questionStartRe = '), h.SRC.indexOf('\n', h.SRC.indexOf('  const __questionStartRe = '))),
    h.SRC.slice(h.SRC.indexOf('  const __editVerbHit = '), h.SRC.indexOf('\n', h.SRC.indexOf('  const __editVerbHit = '))), 'this.hit = __editVerbHit;'].join('\n');
  const hit = (text, code) => { const c = { text, cur: { code }, __imgWriteAsk: false }; vm.runInNewContext(src, c); return c.hit; };
  for (const t of ['كم منتج اقدر احط؟', 'كيف اضيف ميزة البحث؟', 'متى تضيف الدفع الالكتروني', 'شو رايك تضيف عداد زوار']) assert.equal(hit(t, '<html></html>'), true, 'فعل تعديل والمشروع مفتوح: ' + t);
  assert.equal(hit('كم منتج اقدر احط؟', ''), false, 'بلا مشروع: كما كان');
});

test('١٢. rel-7: الرفض أو الموافقة المكرّرة بعد صورة ليست تعديلًا («لا لا»، «no no»)، و«لا لا كبرها» تعديل', () => {
  for (const t of ['لا لا', 'لا لا لا', 'no no', 'ok no', 'نعم نعم', 'ايه ايه', 'لا تمام']) {
    assert.ok(R.ack.test(t), 'شكر/رفض: ' + t);
    assert.equal(h.after(t, 'ارسم لي فراشة ملونة').edit, false, 'ليس تعديلًا: ' + t);
  }
  assert.equal(h.after('لا لا كبرها', 'ارسم لي فراشة ملونة').edit, true, 'تعديل');
});
