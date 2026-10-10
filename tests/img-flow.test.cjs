'use strict';
/* v-img-box + v-img-first + v-img-bare (فحص المالك للصور من الصفر ٢٣ سبتمبر): «كلّ ما أريد بناء صورة يطلع مربّع، ونجومه
   ذهبيّة لا بيضاء؛ احذف "يرسم الصورة" مع أيقونة الرسم؛ الردود آخر الصورة لا أوّلها». مسبار حيّ على ٣٠ طلبًا (لقطات
   في DECISIONS) أثبت: المربّع كان يظهر في نصف المسارات فقط، ومسار الأدوات يكتب «🎨 يرسم صورة…»، والترتيب يتقلّب. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('١. مربّع الإنشاء: نجوم ذهبيّة (والفاتح أغمق)، ويعود للصفحة إن أُعيد رسم القائمة', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    /* v-img-gold-dots: نقاط ذهبيّة ثابتة، إضاءة قُطريّة مرتّبة — لا خطوط ولا انفجار.
       v-img-dots-nobox (المالك: «أريده فقط الإضاءة بدون المستطيل البرواز»): البطاقة السوداء أُزيلت. */
    assert.ok(s.includes("st.id = 'omran-imggen-css2'") && s.includes('background:#e0ac2b'), f);
    assert.ok(!s.includes('background:#050505'), f + ': البطاقة السوداء رجعت خلف النقاط');
    assert.ok(s.includes('.omGen{position:relative;width:min(220px,55vw);aspect-ratio:9/14;max-width:100%;overflow:visible;margin:6px 0;background:transparent}'), f + ': شكل الحاوية — عموديّة بلا إطار ولا قصّ للهالة');
    /* v-img-dots-15x10: ١٥ صفًّا × ١٠ أعمدة، وقوس ٤٫٥ على زاويتَي اليسار، والتأخير القُطريّ كما هو */
    assert.ok(s.includes('const __C = 10, __R = 15, __steps = (__C - 1) + (__R - 1), __arc = 1;'), f + ': أبعاد الشبكة أو نصف القوس تغيّرا');
    assert.ok(s.includes('((__C - 1 - x) + y) / __steps * 1.9'), 'تأخير قُطريّ من فوق يمين');
    assert.ok(s.includes('if(x < __arc && y < __arc && Math.hypot(x - __arc, y - __arc) > __arc + 0.01) continue;'), 'قوس الزاوية العليا اليسرى وحدها');
    assert.ok(!s.includes('omGenWave') && !s.includes('--dx'), 'بلا خطوط وبلا حركة للخارج');
    assert.ok(s.includes('@media (prefers-reduced-motion:reduce){.omDot{animation:none;opacity:.6}}'), 'احترام تقليل الحركة');
    /* الوضع الفاتح صار مطابقًا للداكن: لا دائرة بيضاء ولا دوّامة، ولا يبقى له إلّا لون العنوان */
    assert.ok(!s.includes('.omGen{background:radial-gradient(circle,'), f + ': الدائرة البيضاء رجعت');
    assert.ok(!s.includes('--lx:') && !s.includes('var(--lx)'), f + ': دوّامة الفاتح رجعت');
    assert.ok(s.includes('html[data-mode=\\"light\\"] .omGenTxt{color:#8a6500;text-shadow:none}'), 'عنوان الفاتح يبقى مقروءًا على أبيض');
    assert.ok(!s.includes("'rgba(255,255,255,.35)'"), 'لا أبيض');
    /* v-parallel-chats: يعود للصفحة إن كانت محادثة الطلب هي المعروضة — لا يُلصق مربّع طلبٍ في الخلفيّة داخل محادثة أخرى */
    assert.ok(s.includes("if(!el.isConnected && __mine() && typeof messagesEl !== 'undefined' && messagesEl) messagesEl.appendChild(el);"), 'بعد هبوط بحث الصور');
  }
});

test('٢. كلّ مسار بناء يُظهر المربّع: التصميم المعماريّ، ومسار الأدوات بدل سطر «🎨 يرسم صورة…»', () => {
  const a = read('js/app-09-attach.js');
  assert.ok(a.includes("__showImgLoading(thinkingDiv, label, label); // v-img-box"), 'المعماريّ');
  assert.ok(!a.includes("chatPhase('⚙️', label, thinkingDiv);"));
  assert.ok(a.includes('window.__omranImgBox = function(){'), 'خطّاف مسار الأدوات');
  assert.ok(a.includes('thinkingDiv.parentNode.insertBefore(b, thinkingDiv)'), 'المربّع فوق الردّ كما تُعرض الصورة');
  const t = read('js/app-18-chat-tools.js');
  assert.ok(t.includes("if (ev.status && ev.k === 'stGenImage' && typeof window.__omranImgBox === 'function' && window.__omranImgBox())"));
  assert.ok(t.indexOf("ev.k === 'stGenImage'") < t.indexOf("else if (ev.status) note("), 'المربّع قبل السطر النصّيّ');
});

test('٣. الصورة أوّلًا ثمّ الردّ: مرفقات المساعد (تعديل/بحث/بانيات) تُدرج فوق النصّ كالمرسومة داخل الردّ', () => {
  const s = read('js/app-04-i18n-state.js');
  assert.ok(s.includes("if(m.role !== 'user' && textDiv.parentNode === div && m.attachments.some(a => a && (a.isImage || a.isVideo))) div.insertBefore(wrap, textDiv);"));
  assert.ok(s.indexOf('div.appendChild(genStrip);') < s.indexOf('div.appendChild(textDiv);'), 'المرسومة فوق النصّ كما كانت');
});

test('٤. «ارسم» وحدها تُسأل عن الموضوع بدل رسم عشوائيّ، و«ارسم قطة» تمرّ', () => {
  const a = read('js/app-09-attach.js');
  const m = a.match(/const __bareDraw = (\/.+\/i)\.test\(text\);/);
  assert.ok(m, 'الكاشف موجود');
  const re = eval(m[1]);
  for (const x of ['ارسم', 'ارسم لي', 'رسمة', 'draw', 'صمم؟']) assert.ok(re.test(x), x);
  for (const x of ['ارسم قطة', 'رسمة وردة', 'draw a cat']) assert.ok(!re.test(x), x);
  assert.ok(a.includes('if(__bareDraw || (!__txtOnlyImgRe.test(text) && __isVagueMediaRequest(text))){'));
});

test('٥. حلقة التعديل: بعد صورة، أيّ رسالة قصيرة ليست سؤالًا ولا شكرًا = تعديل على آخر نسخة', () => {
  const a = read('js/app-09-attach.js');
  const m = a.match(/const __ackOnly = (\/.+\/i);/);
  assert.ok(m);
  const ack = eval(m[1]);
  for (const x of ['شكرا', 'حلوة', 'تمام 👍', 'ok']) assert.ok(ack.test(x), x);
  for (const x of ['أكثر واقعية', 'نفس الشي بس مبتسمة', 'لا، الخلفية فقط', 'حلوة بس الإضاءة قوية']) assert.ok(!ack.test(x), x + ' = تعديل لا شكر');
  assert.ok(a.includes('const __FOLLOW_ANY = !!((!__srcImg || __srcImg._fromMemory) && cur.lastMsgWasImageEdit && cur.lastEditedImage && cur.lastEditedImage.b64 && String(text || \'\').trim() && text.length <= 300 && !__ackOnly.test(text) && !__nanoQ.test(text)'));
  assert.ok(a.includes('const __FOLLOW_DEFAULT = __FOLLOW_ANY || '));
});

test('٦. التراجع: «رجعها زي أول/تراجع» للنسخة السابقة و«للأصلية» للأولى، فوريّ بلا محرّك، وبنصّ الـ١٤ لغة', () => {
  const a = read('js/app-09-attach.js');
  const u = eval(a.match(/const __undoRe = (\/.+\/i);/)[1]);
  for (const x of ['رجعها زي أول', 'تراجع', 'رجعها', 'رجعها للأصلية', 'undo', 'الصورة السابقة']) assert.ok(u.test(x), x);
  for (const x of ['خلها ليل', 'أكثر واقعية', 'رجل على حصان']) assert.ok(!u.test(x), x);
  const o = eval(a.match(/const __wantOrig = (\/.+\/i)\.test\(text\);/)[1]);
  assert.ok(o.test('رجعها للأصلية') && o.test('الصورة الأولى') && !o.test('رجعها زي أول'));
  assert.ok(a.includes("content: t(__wantOrig ? 'imgUndoOrig' : 'imgUndoPrev'),") && a.includes("content: t('imgUndoNone') });"));
  const d = read('js/app-03-i18n-data.js');
  assert.equal((d.match(/imgUndoPrev:/g) || []).length, 2, 'عربيّ وإنجليزيّ');
  for (const lg of ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml']) {
    const s = read('i18n/' + lg + '.js');
    assert.ok(s.includes('"imgUndoPrev"') && s.includes('"imgUndoOrig"') && s.includes('"imgUndoNone"'), lg);
  }
});

test('٧. تقرير الصورة: للتوليد والتعديل، يصف المرئيّ فقط ويعترف بما لم يتحقّق', () => {
  /* v-img-honest (٢٣ سبتمبر): التقرير انتقل إلى image-verify مع حكم التنفيذ في النداء نفسه، ويصل sendImg جاهزًا للتوليد والتعديل */
  assert.ok(read('api/_lib/maha-image.js').includes('await sendImg(r.best.b64, r.best.mime, r.engine, r.report, r.best.verdict, r.best.noUpscale);')); /* v-img-cards: لوحة البطاقات بلا مكبّر */
  const s = read('api/_lib/image-verify.js');
  assert.ok(s.includes('source: srcVis') && s.includes("reportInstr(!!o.source)"), 'المصدر مع الناتج للتعديل');
  assert.ok(s.includes('if any part of the request is NOT visible or came out different, say so plainly'));
  assert.ok(s.includes('if any requested element is missing or different, add one line starting with "⚠️ "'));
  assert.ok(s.includes('never claim something is in the image when it is not'));
});

test('٨. طريق بناء واحد: كلّ صيغ طلب الصورة الجديدة تمرّ بالبانِي نفسه، والأسئلة لا', () => {
  const a = read('js/app-09-attach.js');
  const re = eval(a.match(/const __unifiedBuildRe = (\/.+\/i);/)[1]);
  for (const x of ['ولّد صورة سيارة رياضية', 'تخيل مدينة في المستقبل', 'لوحة زيتية للبحر', 'خلفية جوال فضاء', 'منظر طبيعي جبال وثلج', 'generate an image of a dog', 'أبي صورة قطة', 'صورني قطة كرتونية']) assert.ok(re.test(x), x);
  for (const x of ['تخيل لو كنت غني', 'كم عمر القطط', 'اشرح لي الذكاء الاصطناعي', 'عطني فكرة مشروع']) assert.ok(!re.test(x), x);
  assert.ok(a.includes('|| (__unifiedBuildRe.test(text) && !__nanoQ.test(text)))){'), 'يدخل بوّابة البانِي المباشر، والسؤال مستثنى');
});

test('٩. صور الإنترنت فقط بطلب صريح أو بالجمع — المفرد بناء', () => {
  const a = read('js/app-09-attach.js');
  const m = a.match(/const __realPhotoCue = (\/.+?\/i)\.test\(text\) \|\| (\/.+?\/i)\.test\(text\);/);
  assert.ok(m, 'الكاشف موجود');
  const [r1, r2] = [eval(m[1]), eval(m[2])];
  const cue = (x) => r1.test(x) || r2.test(x);
  for (const x of ['عطني صور ليوبارد 8', 'أبي صور حقيقية لبرج خليفة', 'عطني صورة من النت لسيارة كامري', 'show me photos of Paris']) assert.ok(cue(x), x);
  for (const x of ['أبي صورة قطة', 'عطني صورة غروب في دبي', 'صور لي قطة']) assert.ok(!cue(x), x);
  assert.ok(a.includes('const __isPhotoFetch = !__isLogoFetch && __realPhotoCue && __photoFetchRe.test(text) &&'));
});

test('١٠. مؤشّر الصورة بلا إطار، والوضعان سواء، والشبكة ١٥×١٠ بقوس الزاوية العليا اليسرى', () => {
  const a = read('js/app-09-attach.js');
  /* v-img-dots-nobox + v-img-dots-15x10: الوضعان سواء — إضاءة وحدها بلا بطاقة ولا دائرة بيضاء */
  assert.ok(a.includes('overflow:visible;margin:6px 0;background:transparent}'), 'الحاوية ما زالت بإطار');
  assert.ok(!a.includes('background:#050505'), 'البطاقة السوداء رجعت');
  assert.ok(!a.includes('border-radius:24px'), 'زوايا البرواز رجعت');
  assert.ok(!a.includes('html[data-mode=\\"light\\"] .omGen{'), 'للوضع الفاتح حاوية خاصّة — يجب أن يطابق الداكن');
  assert.ok(!a.includes('html[data-mode=\\"light\\"] .omDot{'), 'للوضع الفاتح نقاط خاصّة — يجب أن يطابق الداكن');
  assert.ok(a.includes('html[data-mode=\\"light\\"] .omGenTxt{color:#8a6500;text-shadow:none}'), 'عنوان الفاتح يبقى مقروءًا');
  // ١٥ صفًّا × ١٠ أعمدة ناقصةً ما يقطعه قوس اليسار — العدد محسوب لا مخمَّن
  const C = 10, R = 15, ARC = 1; let n = 0, corners = { tl: 0, bl: 0, tr: 0, br: 0 }, rowsCut = [];
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    if (x < ARC && y < ARC && Math.hypot(x - ARC, y - ARC) > ARC + 0.01) continue;
    n++;
    if (x === 0 && y === 0) corners.tl++;
    if (x === 0 && y === R - 1) corners.bl++;
    if (x === C - 1 && y === 0) corners.tr++;
    if (x === C - 1 && y === R - 1) corners.br++;
  }
  assert.equal(C * R, 150, 'الشبكة ١٥ صفًّا × ١٠ أعمدة');
  assert.equal(n, 149, 'القوس الخفيف يقتطع نقطة الزاوية وحدها');
  // «أخفّ قليل»: لا يُمسّ إلّا الصفّ الأوّل — وفيه نقطة واحدة
  for (let y = 0; y < R; y++) { let cut = 0; for (let x = 0; x < C; x++) if (x < ARC && y < ARC && Math.hypot(x - ARC, y - ARC) > ARC + 0.01) cut++; if (cut) rowsCut.push(y); }
  assert.deepEqual(rowsCut, [0], 'القوس يمتدّ تحت الصفّ الأوّل — الحافّة اليسرى يجب أن تكون مستقيمة تحته');
  // الزاوية العليا اليسرى وحدها مقصوصة، والثلاث الباقية قائمة (رسمة المالك)
  assert.deepEqual(corners, { tl: 0, bl: 1, tr: 1, br: 1 }, 'قُصّت زاوية غير العليا اليسرى، أو بقيت هي');
});

test('١١. «غيّر الصور بدون تكرار الشخصيات» على لقطة بطاقات = تبديل أشخاص لا تعديل أمين يرجّع الصورة نفسها', () => {
  const ip = require('../api/_lib/image-prompt.js');
  for (const x of ['عطني نفس الاسامي وغير الصور بدون تكرار الصور الشخصيات', 'غير الصور اللي داخل البطاقات بدون تكرار', 'خل كل بطاقة شخص مختلف', 'بدون تكرار الشخصيات', 'غير الأشخاص في الصورة']) assert.ok(ip.isPersonSwapRequest(x), x);
  for (const x of ['غير الخلفية', 'خل الصورة ليل', 'غير لون السيارة', 'كبر الصورة', 'رجعها زي أول']) assert.ok(!ip.isPersonSwapRequest(x), x);
  const pr = ip.buildPersonSwapPrompt('غير الصور بدون تكرار', 'غير الصور بدون تكرار');
  assert.ok(/every piece of text and every label character-for-character/.test(pr), 'الأسماء تبقى');
  assert.ok(/identity must NOT be preserved/.test(pr));
  assert.ok(read('api/_lib/maha-image.js').includes(': (!isCreativeEdit && !isPersonSwap && !isBroadEdit));'), 'التبديل خارج المسار الأمين'); // v-merge-faces: فرع الصورة الواحدة
});
