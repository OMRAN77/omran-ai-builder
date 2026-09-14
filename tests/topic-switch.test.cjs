'use strict';
/* v-topic-segments — «المواضيع كلّها تتداخل… إذا أبي أغيّر الموضوع لازم محادثة جديدة» (المالك ١٤ سبتمبر):
   الكشف عن تبديل الموضوع حتميّ في العميل (js/app-04-topic.js) لا نصّيّ في التعليمات، ومسار الإرسال
   يقصّ التاريخ إلى الشريحة الجديدة. وجلسة Claude Code مربوطة بمحادثة التطبيق (v-cc-session-per-chat). */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = (p) => path.join(__dirname, '..', p);

const src = fs.readFileSync(R('js/app-04-topic.js'), 'utf8');
const ctx = { window: {} }; ctx.window.window = ctx.window;
vm.runInNewContext(src, ctx);
const d = (t, pu, pa) => ctx.window.omranTopicSwitch(t, pu, pa).kind;

const PU = 'اشرح لي كيف يعمل المكيف السبليت وكم يستهلك كهرباء';
const PA = 'المكيف السبليت يعمل بضاغط خارجيّ ووحدة داخليّة، ويستهلك نحو ١٫٥ كيلوواط في الساعة للطن الواحد…';

// موضوع جديد: رسالة مستقلّة بلا تقاطع كلمات ولا إشارة متابعة
assert.strictEqual(d('اكتب لي قصيدة عن الوطن', PU, PA), 'new');
assert.strictEqual(d('نعم عندي مشكلة في المحادثة اللي فيها صوت من ثاني محادثة تستجيب', 'اكتبلي ١٠٠ سطر عن السيرة النبويّة', 'وُلد النبيّ ﷺ في مكّة عام الفيل…'), 'new');
assert.strictEqual(d('موضوع جديد: وش أفضل سيّارة اقتصاديّة؟', PU, PA), 'new', 'العلامة الصريحة تفرض التبديل ولو تقاطعت الكلمات');
// متابعة: تقاطع كلمات، أو إشارة متابعة، أو رسالة قصيرة، أو أوّل رسالة
assert.strictEqual(d('وش أفضل مكيف سبليت للصالة؟', PU, PA), 'follow', 'تقاطع الكلمات = متابعة');
assert.strictEqual(d('كمل', PU, PA), 'follow'); assert.strictEqual(d('وبعدين؟', PU, PA), 'follow'); assert.strictEqual(d('ما رأيك بهذا؟', PU, PA), 'follow');
assert.strictEqual(d('عدّل الجملة الأخيرة', PU, PA), 'follow', 'فعل تعديل = متابعة'); assert.strictEqual(d('ترجمه', PU, PA), 'follow');
assert.strictEqual(d('طيب', PU, PA), 'follow', 'كلمة واحدة'); assert.strictEqual(d('اكتب لي قصيدة عن الوطن', '', ''), 'follow', 'أوّل رسالة');
// رجوع صريح
assert.strictEqual(d('ارجع للموضوع الأول', PU, PA), 'back'); assert.strictEqual(d('بخصوص المكيف اللي قبل', PU, PA), 'back');
// الكلمات: تطبيع «ال» والتاء المربوطة وحذف كلمات الوقف
assert.deepStrictEqual(JSON.stringify(ctx.window.omranTopicWords('اكتب لي قصيدة عن الوطن')), JSON.stringify(['قصيده', 'وطن']));

// مسار الإرسال: الشريحة تُطبَّق على التاريخ، وتُستثنى الحالات التي تحتاج الماضي
const a09 = fs.readFileSync(R('js/app-09-attach.js'), 'utf8');
assert.ok(a09.includes("window.omranTopicSwitch(text,") && a09.includes('cur.topicAnchor = cur.messages.indexOf(__curMsg);') && a09.includes('__historyMsgs = __historyMsgs.slice(__k);'), 'الشريحة تقصّ التاريخ المرسل');
assert.ok(a09.includes("!__quietSocialTurn && !__routeFix && !__editIntent && !window.__buildOfferApproved && !__editedOriginal"), 'لا تبديل في تعديل الكود أو موافقة البناء أو تعديل رسالة أو الدور الاجتماعيّ');
assert.ok(a09.includes("if(__d.kind === 'back'){ cur.topicAnchor = 0; }"), '«ارجع» يرفع الشريحة');
assert.ok(a09.indexOf('v-topic-segments') < a09.indexOf('const MAX_TURNS = 24;'), 'القصّ قبل نافذة الأدوار والمرساة الأصليّة');
// الترتيب في الحزمة: الكاشف قبل مسار الإرسال
const parts = fs.readdirSync(R('js')).filter((f) => /^app-\d\d-.+\.js$/.test(f)).sort();
assert.ok(parts.indexOf('app-04-topic.js') < parts.indexOf('app-09-attach.js'), 'app-04-topic.js قبل app-09-attach.js');
assert.ok(fs.readFileSync(R('.vercelignore'), 'utf8').includes('js/app-04-topic.js'), 'الجزء لا يُنشر مفردًا');

// v-cc-session-per-chat: جلسة Claude Code في محادثة التطبيق
const cc = fs.readFileSync(R('js/app-29-cc.js'), 'utf8');
assert.ok(cc.includes("sessionId: String(cur.ccSessionId || ''), newSession: !cur.ccSessionId") && cc.includes("cur.ccSessionId = ev.init.sessionId || cur.ccSessionId || ''") && cc.includes("if(c.cmd === 'new'){ cur.ccSessionId = '';"), 'الجلسة مربوطة بالمحادثة الحاليّة');
assert.ok(!/S\.sessionId/.test(cc) && cc.includes("localStorage.removeItem('aiapp_cc_session')"), 'لا جلسة عامّة في المتصفّح');
console.log('✓ topic-switch: تبديل الموضوع حتميّ في العميل، وجلسة Claude Code لكلّ محادثة');
