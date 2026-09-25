'use strict';
/**
 * tests/huawei-chat-tools.test.cjs
 *
 * التحقق من بطاقات أدوات هواوي في شاشة الترحيب (صندوق المحادثة):
 * - تظهر فقط لحزمة متجر هواوي (html.store-safe) في وضع الترحيب (body.omranWelcome).
 * - تختفي تلقائيًا بمجرد بدء المحادثة أو وجود رسائل.
 * - تضم الأدوات المطلوبة: أنماط الصور، التعليم، القبلة والمواقيت، الاقتراحات، وزر الأدوات الشاملة.
 * - جميع مفاتيح الترجمة موجودة في القاموس، والأزرار مربوطة بالأدوات المقابلة.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('index.html: وجود عنصر #huaweiHeroWrap والبطاقات الأربع وزر الأدوات', () => {
  const html = read('index.html');
  assert.ok(html.includes('id="huaweiHeroWrap"'), 'عنصر huaweiHeroWrap موجود داخل الصفحة');
  assert.ok(html.indexOf('id="huaweiHeroWrap"') > html.indexOf('id="omranHero"'), 'موجود داخل omranHero');

  const cards = ['hwCardPortrait', 'hwCardEdu', 'hwCardQibla', 'hwCardSuggestions'];
  for (const c of cards) {
    assert.ok(html.includes('id="' + c + '"'), 'بطاقة ' + c + ' موجودة');
  }
  assert.ok(html.includes('id="hwAllToolsBtn"'), 'زر استعراض جميع الأدوات موجود');

  // التحقق من مفاتيح الترجمة للأدوات
  assert.ok(html.includes('data-i18n="portraitBtnTitle"'), 'مفتاح أنماط الصور');
  assert.ok(html.includes('data-i18n="omranEduTitle"'), 'مفتاح التعليم');
  assert.ok(html.includes('data-i18n="qiblaTitle"'), 'مفتاح القبلة والمواقيت');
  assert.ok(html.includes('data-i18n="quickTemplatesTitle"'), 'مفتاح الاقتراحات');
  assert.ok(html.includes('data-i18n="omNavTools"'), 'مفتاح الأدوات');
});

test('css/redesign.css: إخفاء البطاقات افتراضيًا وعرضها فقط تحت html.store-safe و body.omranWelcome', () => {
  const css = read('css/redesign.css');
  assert.ok(css.includes('#huaweiHeroWrap{display:none !important;}'), 'مخفي افتراضيًا على الويب العادي');
  assert.ok(css.includes('html.store-safe body.omranWelcome #huaweiHeroWrap{'), 'يظهر فقط في متجر هواوي وعند خلو المحادثة');
  assert.ok(css.includes('.hwToolCard{'), 'تنسيق بطاقات الأدوات موجود');
  assert.ok(css.includes('.huawei-tools-grid{'), 'تنسيق الشبكة موجود');
});

test('js/ui-wiring.js: ربط نقرات البطاقات بالأدوات وكشف أجهزة هواوي', () => {
  const wiring = read('js/ui-wiring.js');
  assert.ok(wiring.includes("tap('#btnPortraitStyle')"), 'ربط بطاقة أنماط الصور');
  assert.ok(wiring.includes("tap('#btnOmranEdu')"), 'ربط بطاقة التعليم');
  assert.ok(wiring.includes("tap('#btnQibla')"), 'ربط بطاقة القبلة');
  assert.ok(wiring.includes("tap('#btnQuickTemplates')"), 'ربط بطاقة الاقتراحات');
  assert.ok(wiring.includes('sectionsToolsOverlay') && wiring.includes('hwAllToolsBtn'), 'ربط زر جميع الأدوات بمربع الأدوات');
  assert.ok(wiring.includes('/HUAWEI|HarmonyOS|HONOR|HuaweiBrowser|HMSCore/i.test(navigator.userAgent'), 'كشف أجهزة هواوي لإضافة store-safe');
});

test('البطاقات تختفي عند دخول صندوق الكتابة', () => {
  const css = read('css/redesign.css');
  assert.ok(css.includes('html.store-safe body.omranWelcome.hwChatting #huaweiHeroWrap{display:none !important;}'), 'قاعدة الإخفاء');
  const wiring = read('js/ui-wiring.js');
  assert.ok(/hwPrompt\.addEventListener\('focus'/.test(wiring) && /hwPrompt\.addEventListener\('input'/.test(wiring), 'مربوط بالتركيز والكتابة');
  assert.ok(wiring.includes("classList.toggle('hwChatting'"), 'يبدّل الصنف على body');
});

test('زرّ «جرّبه لي» 🧪 محذوف من الواجهة', () => {
  const html = read('index.html');
  assert.ok(!html.includes('id="omranTestBar"') && !html.includes('id="btnTestApp"'), 'لا شريط اختبار');
});

test('js/app-03-i18n-data.js: كل مفاتيح الترجمة المستخدمة موجودة في القاموس', () => {
  const dict = read('js/app-03-i18n-data.js');
  const usedKeys = [
    'quickToolsTitle',
    'portraitBtnTitle',
    'tcSub_btnPortraitStyle',
    'omranEduTitle',
    'tcSub_btnOmranEdu',
    'qiblaTitle',
    'tcSub_btnQibla',
    'quickTemplatesTitle',
    'tcSub_btnQuickTemplates',
    'omNavTools',
    'defaultShowcaseTitle'
  ];
  for (const k of usedKeys) {
    assert.ok(new RegExp('[\\s{,\'"]' + k + '["\']?\\s*:').test(dict), 'مفتاح ' + k + ' موجود في القاموس');
  }
});

test('index.html: استخدام الصور الحقيقية للأدوات بدلاً من الإيموجي', () => {
  const html = read('index.html');
  assert.ok(html.includes('/assets/tool-cards/s/btnPortraitStyle.jpg'), 'صورة أنماط الصور موجودة');
  assert.ok(html.includes('/assets/tool-cards/s/btnOmranEdu.jpg'), 'صورة التعليم موجودة');
  assert.ok(html.includes('/assets/tool-cards/s/btnQibla.jpg'), 'صورة القبلة موجودة');
  assert.ok(html.includes('/assets/tool-cards/s/btnQuickTemplates.jpg'), 'صورة الاقتراحات موجودة');
  assert.ok(!html.includes('hwCardIcon'), 'لا توجد إيموجيات أطفال كأيقونات');
});

test('الشاشة مفتوحة من الطرفين والكود النموذجي يبدأ فورًا', () => {
  const html = read('index.html');
  assert.ok(html.includes("localStorage.setItem('waCollapsed','0')"), 'لوحة المعاينة مفتوحة من البداية');
  assert.ok(html.includes("localStorage.setItem('sidebarCollapsed','0')"), 'القائمة الجانبية مفتوحة من البداية');

  const app04 = read('js/app-04-i18n-state.js');
  assert.ok(app04.includes('window.OMRAN_STARTER_APP_CODE ='), 'تعريف كود التطبيق النموذجي');
  assert.ok(app04.includes('defaultShowcaseTitle'), 'اسم المشروع النموذجي الافتراضي');

  const app05 = read('js/app-05-ui.js');
  assert.ok(app05.includes('window.OMRAN_STARTER_APP_CODE'), 'عرض التطبيق النموذجي في المعاينة عند خلو الكود');
});

test('حذف العنوان والشارة العلوية واختفاء بطاقات الأدوات فورًا عند دخول المحادثة', () => {
  const html = read('index.html');
  assert.ok(!html.includes('huawei-hero-head'), 'حذف عنصر رأس البطاقات huawei-hero-head');
  assert.ok(!html.includes('huawei-hero-title'), 'حذف عنوان أدوات سريعة من فوق البطاقات');

  const css = read('css/redesign.css');
  assert.ok(css.includes('body:not(.omranWelcome) #huaweiHeroWrap'), 'إخفاء قاطع للبطاقات خارج وضع الترحيب');

  const wiring = read('js/ui-wiring.js');
  assert.ok(wiring.includes('window.syncWelcome = syncWelcome'), 'إتاحة دالة syncWelcome على window');
  assert.ok(wiring.includes("hwHero.style.setProperty('display', 'none', 'important')"), 'إخفاء فوري للبطاقات بالخاصية المباشرة عند وجود رسائل');

  const app04 = read('js/app-04-i18n-state.js');
  assert.ok(app04.includes("document.body.classList.toggle('omranWelcome', !hasMsgs)"), 'تحديث وضع الترحيب فورًا في renderMessages');

  const app09 = read('js/app-09-attach.js');
  assert.ok(app09.includes("document.body.classList.remove('omranWelcome')"), 'إزالة وضع الترحيب فور إرسال رسالة في sendPrompt');
});


