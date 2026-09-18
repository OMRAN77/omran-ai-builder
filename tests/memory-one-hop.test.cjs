// v-memory-one-hop (١٨ سبتمبر ٢٠٢٦): صورة الذاكرة تُرفق تلقائيًّا قفزة واحدة بعد دور صورة فقط،
// لا مع كلّ رسالة قصيرة إلى الأبد؛ ومع ملاحظة للنموذج ألّا يذكرها إن لم تكن الرسالة عنها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('js/app-09-attach.js');

// الدالّة تُستخرج من المصدر نفسه وتُشغَّل معزولة (كود متصفّح بلا وحدات).
function extractFn() {
  const start = src.indexOf('function omranPrevTurnHadImage(messages){');
  assert.ok(start > 0, 'الدالّة موجودة في app-09');
  const end = src.indexOf('\n}\n', start);
  const body = src.slice(start, end + 3);
  const ctx = {};
  vm.runInNewContext(body + '\nthis.fn = omranPrevTurnHadImage;', ctx);
  return ctx.fn;
}
const img = (fromMemory) => ({ isImage: true, name: fromMemory ? 'memory.png' : 'photo.jpg', dataUrl: 'data:image/png;base64,AAAA', _fromMemory: !!fromMemory });

test('الدور السابق مباشرةً بصورة حقيقيّة (مستخدم أو مساعد) → نعم', () => {
  const fn = extractFn();
  assert.equal(fn([{ role: 'user', content: 'شوف الطاولة', attachments: [img(false)] }, { role: 'assistant', content: 'وصلتني الصورة 👍 شو تبي؟' }]), true, 'المستخدم أرفق ثمّ ردّ نصّيّ');
  assert.equal(fn([{ role: 'user', content: 'ارسم لي شعار' }, { role: 'assistant', content: '', attachments: [img(false)] }]), true, 'المساعد أخرج صورة');
});

test('صورة قبل رسالتين نصّيتين → لا (تنقطع السلسلة)، وصورة الذاكرة وحدها لا تُعدّ', () => {
  const fn = extractFn();
  const history = [
    { role: 'user', content: 'شوف الطاولة', attachments: [img(false)] },
    { role: 'assistant', content: 'وصلتني الصورة' },
    { role: 'user', content: 'كيف أنشر التطبيق في جوجل بلاي؟' },
    { role: 'assistant', content: 'تحتاج حساب مطوّر…' },
  ];
  assert.equal(fn(history), false, 'الموضوع تغيّر: لا إرفاق تلقائيّ');
  assert.equal(fn([{ role: 'user', content: 'x', attachments: [img(true)] }, { role: 'assistant', content: 'y' }]), false, 'memory.png لا تُعدّ صورة حقيقيّة');
  assert.equal(fn([]), false); assert.equal(fn(null), false); assert.equal(fn([null, { role: 'user' }]), false);
});

test('شرط v473c في الجزء والحزمة: القفزة الواحدة + ملاحظة النموذج، والإشارة الصريحة بلا شرط', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("cur.lastMsgWasImageEdit && text && text.length <= 220 && omranPrevTurnHadImage(cur.messages)){"), f + ': الشرط مقيّد بالدور السابق');
    assert.ok(s.includes('[ملاحظة للنموذج: الصورة memory.png أُرفقت تلقائيًّا من ذاكرة المحادثة'), f + ': ملاحظة التجاهل الصامت');
    assert.ok(s.includes("cur.lastEditedImage.b64 && text && __memRefRe.test(text)){"), f + ': الإشارة الصريحة كما هي');
  }
  // v574 (الصورة تبقى قابلة للمتابعة بالنيّة) لم يُمسّ
  assert.ok(src.includes("if(!(cur.lastEditedImage && cur.lastEditedImage.b64)) cur.lastMsgWasImageEdit = false;"));
});
