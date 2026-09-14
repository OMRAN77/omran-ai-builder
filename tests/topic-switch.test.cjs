'use strict';
/* v-topic-memory — «أتكلّم عن موضوع وأبدّله ثمّ أرجع للي قبله فكأنّي ما سألته أيّ شيء» (المالك ١٤ سبتمبر):
   الكاشف (js/app-04-topic.js) يصنّف الرسالة: new / follow / back، ومسار الإرسال لا يحذف التاريخ بل يضيف
   تعليمة الدور، والعودة تستدعي السؤال القديم وجوابه نصًّا. وجلسة Claude Code مربوطة بمحادثة التطبيق. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = (p) => path.join(__dirname, '..', p);

const src = fs.readFileSync(R('js/app-04-topic.js'), 'utf8');
const ctx = { window: {} }; ctx.window.window = ctx.window;
vm.runInNewContext(src, ctx);
const D = (t, pu, pa, earlier) => ctx.window.omranTopicSwitch(t, pu, pa, earlier || []);
const d = (t, pu, pa, earlier) => D(t, pu, pa, earlier).kind;

const AC_Q = 'اشرح لي كيف يعمل المكيف السبليت وكم يستهلك كهرباء';
const AC_A = 'المكيف السبليت يعمل بضاغط خارجيّ ووحدة داخليّة، ويستهلك نحو ١٫٥ كيلوواط في الساعة للطن الواحد…';
const POEM_Q = 'اكتب لي قصيدة عن الوطن';
const POEM_A = 'يا وطني أنت الحياةُ وأنت الأملْ…';

// موضوع جديد: بلا تقاطع مع الدور السابق ولا مع الأقدم
assert.strictEqual(d(POEM_Q, AC_Q, AC_A), 'new');
assert.strictEqual(d('نعم عندي مشكلة في المحادثة اللي فيها صوت من ثاني محادثة تستجيب', 'اكتبلي ١٠٠ سطر عن السيرة النبويّة', 'وُلد النبيّ ﷺ في مكّة عام الفيل…'), 'new');
assert.strictEqual(d('موضوع جديد: وش أفضل مكيف؟', AC_Q, AC_A), 'new', 'العلامة الصريحة تفرض الجديد ولو تقاطعت الكلمات');
// عودة إلى موضوع أقدم: تقاطع مع سؤال قديم بلا تقاطع مع الأخير — مع مؤشّر السؤال
const back = D('طيب المكيف كم سعره تقريبًا؟', POEM_Q, POEM_A, [AC_Q]);
assert.strictEqual(back.kind, 'back'); assert.strictEqual(back.backIndex, 0, 'يشير إلى سؤال المكيف');
assert.strictEqual(d('ارجع للموضوع الأول', POEM_Q, POEM_A, [AC_Q]), 'back'); assert.strictEqual(d('بخصوص المكيف اللي قبل', POEM_Q, POEM_A, [AC_Q]), 'back');
assert.strictEqual(D('ارجع للموضوع الأول', POEM_Q, POEM_A, []).backIndex, -1, 'إشارة رجوع بلا سؤال مطابق = تعليمة عامّة');
// متابعة: تقاطع مع الدور السابق، أو إشارة متابعة، أو رسالة قصيرة، أو أوّل رسالة
assert.strictEqual(d('وش أفضل مكيف سبليت للصالة؟', AC_Q, AC_A), 'follow', 'تقاطع مع الدور السابق = متابعة');
assert.strictEqual(d('كمل', AC_Q, AC_A), 'follow'); assert.strictEqual(d('وبعدين؟', AC_Q, AC_A), 'follow'); assert.strictEqual(d('ما رأيك بهذا؟', AC_Q, AC_A), 'follow');
assert.strictEqual(d('عدّل الجملة الأخيرة', AC_Q, AC_A), 'follow'); assert.strictEqual(d('ترجمه', AC_Q, AC_A), 'follow');
assert.strictEqual(d('طيب', AC_Q, AC_A), 'follow', 'كلمة واحدة'); assert.strictEqual(d(POEM_Q, '', ''), 'follow', 'أوّل رسالة');
// الكلمات: تطبيع «ال» والتاء المربوطة وحذف كلمات الوقف
assert.strictEqual(JSON.stringify(ctx.window.omranTopicWords(POEM_Q)), JSON.stringify(['قصيده', 'وطن']));

// مسار الإرسال: لا حذف للتاريخ — تعليمة دور فقط، والعودة تستدعي السؤال والجواب
const a09 = fs.readFileSync(R('js/app-09-attach.js'), 'utf8');
assert.ok(!/cur\.topicAnchor/.test(a09) && !/__historyMsgs = __historyMsgs\.slice\(__k\)/.test(a09), 'لا قصّ للتاريخ (الشريحة أُلغيت)');
assert.ok(a09.includes("window.omranTopicSwitch(text, __pu ? __txt(__pu.m) : '', __pa ? __txt(__pa) : '', __olderUsers.map(x => __txt(x.m)))"), 'الكاشف يرى الدور السابق والأسئلة الأقدم');
assert.ok(a09.includes('رسالة المستخدم الأخيرة موضوع جديد مختلف عمّا قبله') && a09.includes('تاريخ المحادثة كلّه يبقى في ذاكرتك'), 'تعليمة الموضوع الجديد تحفظ الذاكرة');
assert.ok(a09.includes('المستخدم يعود إلى موضوع سابق في هذه المحادثة نفسها') && a09.includes("'\\nسؤاله السابق كان: «'") && a09.includes("'\\nوجوابك عليه (مختصرًا): «'"), 'تعليمة العودة تستدعي السؤال والجواب نصًّا');
assert.ok(a09.includes("!__quietSocialTurn && !__routeFix && !__editIntent && !window.__buildOfferApproved && !__editedOriginal"), 'لا تعليمة في تعديل الكود أو موافقة البناء أو تعديل رسالة أو الدور الاجتماعيّ');
assert.ok(a09.includes('وإن عادت إلى موضوع سابق في هذه المحادثة فأنت تذكره كاملًا') && !a09.includes('تاريخ المحادثة خلفية فقط، وليس قائمة مهام.'), 'قاعدة الموضوع في العميل تحفظ الذاكرة');
const chat = fs.readFileSync(R('api/_lib/chat.js'), 'utf8');
assert.ok(chat.includes('تاريخ المحادثة كلّه ذاكرتك الحاضرة') && !chat.includes('تاريخ المحادثة خلفية فقط، وليس قائمة مهام'), 'قاعدة الموضوع في الخادم تحفظ الذاكرة');
// الترتيب في الحزمة: الكاشف قبل مسار الإرسال، والجزء لا يُنشر مفردًا
const parts = fs.readdirSync(R('js')).filter((f) => /^app-\d\d-.+\.js$/.test(f)).sort();
assert.ok(parts.indexOf('app-04-topic.js') < parts.indexOf('app-09-attach.js'), 'app-04-topic.js قبل app-09-attach.js');
assert.ok(fs.readFileSync(R('.vercelignore'), 'utf8').includes('js/app-04-topic.js'), 'الجزء لا يُنشر مفردًا');

// v-cc-session-per-chat: جلسة Claude Code في محادثة التطبيق
const cc = fs.readFileSync(R('js/app-29-cc.js'), 'utf8');
assert.ok(cc.includes("sessionId: String(cur.ccSessionId || ''), newSession: !cur.ccSessionId") && cc.includes("cur.ccSessionId = ev.init.sessionId || cur.ccSessionId || ''") && cc.includes("if(c.cmd === 'new'){ cur.ccSessionId = '';"), 'الجلسة مربوطة بالمحادثة الحاليّة');
assert.ok(!/S\.sessionId/.test(cc) && cc.includes("localStorage.removeItem('aiapp_cc_session')"), 'لا جلسة عامّة في المتصفّح');
console.log('✓ topic-memory: تبديل الموضوع لا يجرّ القديم، والعودة إليه لا تنساه، وجلسة Claude Code لكلّ محادثة');
