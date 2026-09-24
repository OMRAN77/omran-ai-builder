// tests/chats-keep-local-images.test.cjs — v-keep-local-attachments (٢١ سبتمبر ٢٠٢٦):
// بلاغ المالك «الصورة ما تثبت في المحادثة، تختفي وترجع». السبب في
// __chatsMergeServer (app-04-i18n-state.js): كلما أضاف جهاز آخر رسالة جديدة لنفس
// المحادثة (فصار طول قائمة السيرفر أكبر من المحلي)، كل الرسائل السابقة المشتركة
// كانت تُستبدل افتراضيًّا بنسخة السيرفر (sm) ما لم يكن لها نصّ (content) أطول
// محليًّا — رسالة صورة بلا نصّ (content فارغ) تسقط من الشرطين النصّيين فتُستبدل
// بصمت بنسخة السيرفر المضغوطة (serverThumb) أو المكسورة ('[media]' لو فشل الضغط)،
// رغم أنّ الجهاز الحاليّ يملك أصلًا نسخة أوضح لنفس الرسالة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync('js/app-04-i18n-state.js', 'utf8');
const __end = src.indexOf('\n}\n/* v376: تنزيل نسخة السيرفر');
const body = src.slice(src.indexOf('function __chatsMergeServer('), __end + 2); // +2 يشمل "\n}" إغلاق الدالّة

function run(state, server, deletedIds) {
  const calls = { saveState: 0, renderHistory: 0 };
  const fn = new Function(
    'state', '__swallow', 'saveState', 'renderHistory', 'renderAll', 'buildChatList',
    body + '\n; return __chatsMergeServer(arguments[6], arguments[7]);'
  );
  const changed = fn(state, () => {}, () => calls.saveState++, () => calls.renderHistory++, () => {}, () => {}, server, deletedIds);
  return { changed, calls };
}

test('رسالة صورة بلا نصّ موجودة محليًّا تبقى كاملة الجودة حتى لو أضاف جهاز آخر رسالة جديدة لاحقة', () => {
  const localImg = 'data:image/jpeg;base64,' + 'L'.repeat(300000); // نسخة محليّة كاملة الجودة
  const state = {
    projects: [{
      id: 'p_1', title: 'محادثة', provider: 'x',
      messages: [
        { role: 'user', content: '', attachments: [{ name: 'a.jpg', isImage: true, dataUrl: localImg }] },
      ],
    }],
  };
  // نسخة السيرفر لنفس المشروع: نفس الرسالة الأولى لكن بصورة متدهورة (thumb مضغوط)،
  // بالإضافة لرسالة ثانية جديدة أضافها جهاز آخر (فصار طول قائمة السيرفر أكبر).
  const server = [{
    id: 'p_1', title: 'محادثة', provider: 'x',
    messages: [
      { role: 'user', content: '', attachments: [{ name: 'a.jpg', isImage: true, dataUrl: 'data:image/jpeg;base64,thumb' }] },
      { role: 'assistant', content: 'ردّ من جهاز آخر' },
    ],
  }];
  const { changed } = run(state, server, []);
  assert.ok(changed, 'الدمج غيّر شيئًا (رسالة جديدة انضافت)');
  assert.equal(state.projects[0].messages.length, 2, 'الرسالة الجديدة من الجهاز الآخر وصلت');
  assert.equal(
    state.projects[0].messages[0].attachments[0].dataUrl, localImg,
    'صورة الرسالة الأولى بقيت النسخة المحليّة الكاملة الجودة — لم تُستبدل بنسخة السيرفر المتدهورة'
  );
  assert.equal(state.projects[0].messages[1].content, 'ردّ من جهاز آخر');
});

test('رسالة صورة بلا نصّ محليًّا: لو السيرفر أرسل [media] (فشل الضغط) تبقى المحليّة لا المكسورة', () => {
  const localImg = 'data:image/png;base64,' + 'L'.repeat(300000);
  const state = {
    projects: [{
      id: 'p_2', title: 'محادثة', provider: '',
      messages: [{ role: 'user', content: '', attachments: [{ name: 'a.png', isImage: true, dataUrl: localImg }] }],
    }],
  };
  const server = [{
    id: 'p_2', title: 'محادثة', provider: '',
    messages: [
      { role: 'user', content: '', attachments: [{ name: 'a.png', isImage: true, dataUrl: '[media]' }] },
      { role: 'assistant', content: 'جديد' },
    ],
  }];
  run(state, server, []);
  assert.equal(state.projects[0].messages[0].attachments[0].dataUrl, localImg, 'لا تُستبدل بـ[media] المكسورة');
});

test('رسالة نصّية صرفة (بلا مرفقات) تتبع السلوك القديم كما هو — لا تغيير في هذا المسار', () => {
  const state = {
    projects: [{ id: 'p_3', title: 'محادثة', provider: '', messages: [{ role: 'user', content: 'سؤال' }] }],
  };
  const server = [{
    id: 'p_3', title: 'محادثة', provider: '',
    messages: [{ role: 'user', content: 'سؤال' }, { role: 'assistant', content: 'ردّ' }],
  }];
  run(state, server, []);
  assert.equal(state.projects[0].messages[0].content, 'سؤال', 'النصّ الصرف سليم كسابقًا');
  assert.equal(state.projects[0].messages[1].content, 'ردّ');
});

console.log('✓ chats-keep-local-images: صور الرسائل المحليّة لا تُستبدل بنسخة سيرفر متدهورة لمجرّد وصول رسالة جديدة');
