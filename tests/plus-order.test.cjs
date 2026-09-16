// 🔢 اختبار ترتيب بنود قائمة «+» (#plusToolsPopup) — v-plus-order4.
// الترتيب مُحكَم بالكامل بـ CSS order (flex-direction:column في css/tokens.css)،
// لا بترتيب الإدراج في DOM؛ فالاختبار يقرأ order كل بند من css/redesign.css
// ويتحقّق من تسلسله الصاعد بالترتيب الذي طلبه المالك.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../css/redesign.css'), 'utf8');

function orderOf(selector) {
  const re = new RegExp(escapeRe(selector) + '\\{[^}]*order:(\\d+)', 'i');
  const m = css.match(re);
  assert.ok(m, `لم أجد order للمحدّد: ${selector}`);
  return Number(m[1]);
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SEQUENCE = [
  ['#plusToolsPopup #btnImgToPdf', 'PDF'],
  ['#plusToolsPopup #btnAttach', 'إرفاق'],
  ['#plusToolsPopup .omModeItem[data-mode="image_hd"]', 'صورة 4K'],
  ['#plusToolsPopup .omModeItem[data-mode="image"]', 'إنشاء صورة'],
  ['#plusToolsPopup .omModeItem[data-mode="image_nano"]', 'محرّك نانو (خام)'],
  ['#plusToolsPopup .omModeItem[data-mode="image_text"]', 'صورة بنصّ دقيق'],
  ['#plusToolsPopup .omModeItem[data-mode="image_gpt"]', 'محرّك GPT (خام)'],
  ['#plusToolsPopup .omModeItem[data-mode="web"]', 'البحث على الويب'],
  ['#plusToolsPopup .omModeItem[data-mode="think"]', 'التفكير العميق'],
  ['#plusToolsPopup #btnSnapBuild', 'ورّني وأبنيه'],
  ['#plusToolsPopup #btnQuickTemplates', 'اقتراحات'],
  ['#plusToolsPopup #btnEmoji', 'إيموجي'],
  ['#plusToolsPopup #btnVoiceChat', 'محادثة صوتية'],
  ['#plusToolsPopup #btnPortraitStyle', 'أنماط الصور'],
  ['#plusToolsPopup #btnFeedback', 'رأيك يهمنا'],
  ['#plusToolsPopup .omModeSep', 'الفاصل'],
  ['#plusToolsPopup #btnDeleteChat', 'حذف المحادثة'],
];

const orders = SEQUENCE.map(([sel]) => orderOf(sel));
for (let i = 1; i < orders.length; i++) {
  assert.ok(
    orders[i] > orders[i - 1],
    `الترتيب مكسور بين «${SEQUENCE[i - 1][1]}» (${orders[i - 1]}) و«${SEQUENCE[i][1]}» (${orders[i]})`
  );
}
console.log('  ✓ تسلسل order صاعد يطابق ترتيب المالك من PDF إلى حذف المحادثة');

// حذف المحادثة يجب أن يبقى آخر بند ظاهر — أعلى order بين كل بنود القائمة.
const allOrderMatches = [...css.matchAll(/#plusToolsPopup[^{]*\{[^}]*order:(\d+)/g)].map((m) => Number(m[1]));
const deleteOrder = orderOf('#plusToolsPopup #btnDeleteChat');
const visibleMax = Math.max(...SEQUENCE.map(([sel]) => orderOf(sel)));
assert.strictEqual(deleteOrder, visibleMax, 'حذف المحادثة آخر بند ظاهر في القائمة');
console.log('  ✓ «حذف المحادثة» يبقى آخر بند بعد الفاصل');

// البنود المخفية (الأدوات القديم + تحويل PDF المكرّر) تبقى موجودة في الذيل بلا حذف.
assert.ok(/#plusToolsPopup #btnToolsBox,\s*#plusToolsPopup #btnChatToPdf\{order:(\d+)/.test(css), 'البندان المخفيّان موجودان بترتيب في الذيل');
const hiddenTailOrder = Number(css.match(/#plusToolsPopup #btnToolsBox,\s*#plusToolsPopup #btnChatToPdf\{order:(\d+)/)[1]);
assert.ok(hiddenTailOrder > deleteOrder, 'البنود المخفيّة بعد حذف المحادثة — لا تتوسّط القائمة الظاهرة');
console.log('  ✓ البنود المخفيّة (الأدوات + تحويل PDF المكرّر) باقية في الذيل بلا حذف');

// الأزرار والمعرّفات نفسها لم تُحذف ولا تغيّر سلوكها — index.html كما هو لهذه المعرّفات.
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
for (const id of ['btnImgToPdf', 'btnAttach', 'btnSnapBuild', 'btnQuickTemplates', 'btnEmoji', 'btnVoiceChat', 'btnPortraitStyle', 'btnFeedback', 'btnDeleteChat', 'btnToolsBox', 'btnChatToPdf']) {
  assert.ok(html.includes('id="' + id + '"'), `الزرّ ${id} لا يزال موجودًا في index.html`);
}
console.log('  ✓ كل الأزرار والمعرّفات باقية بلا حذف');
