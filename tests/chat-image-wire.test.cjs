// tests/chat-image-wire.test.cjs — v-img-wire: الصورة المرفقة تصل النموذج فعلًا.
// لقطة المالك ١٢ سبتمبر: أرسل اللقطة بلا نصّ فجاءه «وصلتني الصورة 👍 شو تبي أسوي فيها؟»
// ثلاث مرّات بلا تحليل. التتبّع في متصفّح حقيقيّ كشف الأعمق: apiImages كان يُقرأ عند
// بناء الطلب ولا يُكتب في أيّ مكان، فلم تكن أيّ صورة مرفقة تصل النموذج على أيّ مسار،
// وapiText (نصّ الملفّات + ملاحظات الدور) كان يُحسب ولا يُرسل.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const client = read('js/app-09-attach.js');
const tools = read('js/app-18-chat-tools.js');

test('image with no text is sent to the model, never answered by a canned local reply', () => {
  assert.ok(!/content: \(lang === 'ar' \? 'وصلتني الصورة/.test(client), 'لا ردّ جاهز «وصلتني الصورة»');
  assert.ok(!client.includes("'Got the image 👍 What would you like to do with it?'"), 'ولا نظيره الإنجليزيّ');
  const i = client.indexOf("if(__srcImg && !(text || '').trim()){");
  assert.ok(i > 0, 'فرع الصورة بلا نصّ موجود');
  const block = client.slice(i, i + 3500);
  assert.ok(block.includes('حلّل هذه الصورة بالتفصيل') && block.includes('Analyze this image in detail'), 'طلب تحليل كامل بلا سياق');
  assert.ok(block.includes('استكمالًا لكلامنا أعلاه') && block.includes('follow-up to our conversation above'), 'ومع سياق: تُقرأ في ضوئه');
  assert.ok(!block.includes('return;'), 'الفرع لا يقطع الدور — يكمل إلى النموذج');
  assert.ok(!block.includes("'(ملاحظة للنظام") && !block.includes("'(System note"), 'بصوت المستخدم لا «ملاحظة للنظام»');
});

test('the current turn carries its images and its computed API text on the request', () => {
  // الصور: من مرفقات هذا الدور حين لا يحمل السجلّ apiImages (لم يُكتب يومًا)
  assert.ok(client.includes('const __turnImgs = (__lastM && __lastM.apiImages && __lastM.apiImages.length) ? __lastM.apiImages'), 'apiImages إن وُجد');
  assert.ok(client.includes("((__lastM === __nextUserMessage) ? imageAttachments.filter(function(a){ return a && a.isImage && a.dataUrl; })"), 'وإلا مرفقات الدور الحاليّ');
  assert.ok(client.includes("if(__lastTurn && __lastTurn.role === 'user' && !cur.adMode && __turnImgs.length) __lastTurn.images = __turnImgs;"), 'تُلحق بالدور الأخير');
  // النصّ: apiText + ما أُضيف إلى text بعد الدفع
  assert.ok(client.includes("const __textAtPush = String(text || '');"), 'مرجع النصّ عند الدفع');
  assert.ok(client.includes('const __curApiText = (function(){'), 'حساب نصّ الدور');
  assert.ok(client.includes("const __curText = (__lastM === __nextUserMessage && __curApiText) ? __curApiText : String((__lastM.apiText !== undefined ? __lastM.apiText : __lastM.content) || '');"), 'يُرسل بدل content الفقاعة');
  // كاشف «نصّ ملصوق» لا يلتقط طلب التحليل المولَّد
  assert.ok(client.includes('const __pastedDoc = !!(text && !(imageAttachments.length && !__textAtPush)'), 'الطلب المولَّد ليس نصًّا ملصوقًا');
  // مسار الأدوات يحوّل images إلى كتل رؤية بصيغة Anthropic
  assert.ok(tools.includes("content.push({ type: 'image', source: { type: 'base64', media_type: (img && img.mime) || 'image/jpeg', data: b64 } });"), 'كتلة الصورة');
});

test('per-turn text delta logic: appended notes ride after the base, a replaced empty text rides before the attachments tag', () => {
  // نسخة مطابقة لمنطق __curApiText (محقونة هنا لاختبار الحالات)
  function curApiText(apiText, text, textAtPush) {
    var base = String(apiText || ''), now = String(text || ''), delta = '';
    if (now !== textAtPush) delta = (now.indexOf(textAtPush) === 0) ? now.slice(textAtPush.length) : now;
    delta = delta.trim();
    var out = !delta ? base : (!base ? delta : (textAtPush ? (base + '\n\n' + delta) : (delta + '\n\n' + base)));
    if (out.length > 200000) out = out.slice(0, 200000) + '\n… (قُصّ النصّ لطوله)';
    return out;
  }
  const src = client.slice(client.indexOf('const __curApiText = (function(){'), client.indexOf('const __curApiText = (function(){') + 900);
  for (const frag of ["if(now !== __textAtPush) delta = (now.indexOf(__textAtPush) === 0) ? now.slice(__textAtPush.length) : now;", "var out = !delta ? base : (!base ? delta : (__textAtPush ? (base + '\\n\\n' + delta) : (delta + '\\n\\n' + base)));", 'if(out.length > 200000)']) {
    assert.ok(src.includes(frag), 'النسخة المختبَرة مطابقة للمصدر: ' + frag.slice(0, 40));
  }
  assert.equal(curApiText('سؤال', 'سؤال', 'سؤال'), 'سؤال', 'بلا تغيير');
  assert.equal(curApiText('[مرفقات: a.png]', 'حلّل هذه الصورة', ''), 'حلّل هذه الصورة\n\n[مرفقات: a.png]', 'صورة بلا نصّ: الطلب أوّلًا ثمّ وسم المرفقات');
  assert.equal(curApiText('صمّم لي\n\n[مرفقات: logo.png]', 'صمّم لي\n(ملاحظة للنظام: x)', 'صمّم لي'), 'صمّم لي\n\n[مرفقات: logo.png]\n\n(ملاحظة للنظام: x)', 'ملاحظة مُلحقة تُذيَّل');
  assert.equal(curApiText('', 'حلّل', ''), 'حلّل');
  assert.equal(curApiText('نصّ الملفّ', '', ''), 'نصّ الملفّ', 'لا دلتا = apiText كما هو');
  assert.ok(curApiText('x'.repeat(250000), 'x'.repeat(250000), 'x'.repeat(250000)).length < 200100, 'سقف الحجم');
});
