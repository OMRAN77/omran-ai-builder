// tests/chat-edit-cancel.test.cjs — v-chat-edit-cancel (تدقيق ١٨–١٩ أكتوبر، g03 chat-edit-message وchat-jump-bottom).
// العرض: «تعديل الرسالة» يكتب نصّها فوق مسوّدة المستخدم بلا حفظها، و«إلغاء» يغلق الإشعار ويترك النصّ القديم في الصندوق فيرسله Enter
// نسخةً مكرّرة. وإظهار الإشعار يكبّر الصندوق فينقصّ شريط أيقونات آخر ردّ تحته (حاسوب). وزرّ الإلغاء وزرّ ↓ لهما وصف لقارئ الشاشة
// عربيّ ثابت في الواجهة الإنجليزيّة.
// الآن: البدء يحفظ المسوّدة والإلغاء يعيدها، والمحادثة تعود إلى الأسفل بعد ظهور الإشعار إن كان القارئ هناك، والوصفان بلغة الواجهة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const a9 = read('js/app-09-attach.js');
const html = read('index.html');
const block = a9.slice(a9.indexOf('function setChatEditNotice(on){'), a9.indexOf('window.chatRegenerateMessage = function'));

function env({ draft = '', near = true } = {}) {
  const prompt = { value: draft, focus() {}, setSelectionRange() {} };
  const cancelBtn = { onclick: null };
  const notice = { hidden: true, querySelector: () => cancelBtn };
  const messagesEl = { scrollTop: near ? 900 : 200, scrollHeight: 1500, clientHeight: 600 };
  const cur = { id: 'p1', messages: [{ role: 'user', content: 'السؤال الأوّل' }, { role: 'assistant', content: 'جواب' }, { role: 'user', content: 'السؤال الثاني' }, { role: 'assistant', content: 'جواب' }] };
  const calls = { jump: 0 };
  const ctx = {
    window: {}, genAbortController: null, messagesEl,
    document: { documentElement: { classList: { contains: () => false } } },
    $: (s) => (s === '#prompt' ? prompt : s === '#chatEditNotice' ? notice : null),
    getCurrent: () => cur, __swallow(e) { throw e; },
    requestAnimationFrame: (fn) => fn(),
    chatIsNearBottom: () => messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 160,
    syncChatJumpButton: () => { calls.jump++; },
  };
  ctx.window.__promptAutoGrow = () => { messagesEl.clientHeight -= 50; }; // الإشعار يكبّر الصندوق فيقصّر القائمة
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  return { ctx, prompt, notice, cancelBtn, messagesEl, calls };
}

test('١. مسوّدة «مرحبا» ← تعديل رسالة ← إلغاء = «مرحبا»، والطلب يُمسح والإشعار يختفي', () => {
  const e = env({ draft: 'مرحبا' });
  assert.equal(e.ctx.window.chatStartEditMessage(2), true);
  assert.equal(e.prompt.value, 'السؤال الثاني');
  assert.equal(e.notice.hidden, false);
  e.cancelBtn.onclick();
  assert.equal(e.prompt.value, 'مرحبا', 'المسوّدة رجعت');
  assert.equal(e.ctx.window.__chatEditRequest, null);
  assert.equal(e.notice.hidden, true);
});

test('٢. بلا مسوّدة ← الإلغاء يفرغ الصندوق (لا نسخة مكرّرة يرسلها Enter)', () => {
  const e = env();
  e.ctx.window.chatStartEditMessage(2);
  e.ctx.window.chatCancelEditMessage();
  assert.equal(e.prompt.value, '');
});

test('٣. تعديل رسالة ثمّ أخرى ثمّ إلغاء يعيد المسوّدة الأصليّة لا نصّ الرسالة الأولى', () => {
  const e = env({ draft: 'كنت أكتب' });
  e.ctx.window.chatStartEditMessage(0);
  e.ctx.window.chatStartEditMessage(2);
  e.ctx.window.chatCancelEditMessage();
  assert.equal(e.prompt.value, 'كنت أكتب');
});

test('٤. ظهور الإشعار لا يقصّ آخر ردّ: المحادثة تعود للأسفل إن كان القارئ هناك، ومن صعد يبقى مكانه', () => {
  const e = env({ near: true });
  e.ctx.window.chatStartEditMessage(2);
  assert.equal(e.messagesEl.scrollTop, e.messagesEl.scrollHeight);
  assert.ok(e.calls.jump >= 1, 'زرّ ↓ يُزامَن');
  const up = env({ near: false });
  up.ctx.window.chatStartEditMessage(2);
  assert.equal(up.messagesEl.scrollTop, 200);
});

test('٥. وصف زرّ ↓ وزرّ الإلغاء لقارئ الشاشة بلغة الواجهة', () => {
  const jump = /<button[^>]*id="chatJumpBottom"[^>]*>/.exec(html)[0];
  assert.match(jump, /data-i18n="\[aria-label\]jumpLatestTitle"/);
  const cancel = /<div id="chatEditNotice"[^>]*>[\s\S]*?<\/div>/.exec(html)[0];
  assert.ok(!/aria-label="[^"]*[؀-ۿ]/.test(cancel), 'لا aria-label عربيّ ثابت: ' + cancel);
  assert.match(cancel, /<button type="button" data-i18n="cancel">/);
  const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
  assert.equal((read('js/app-03-i18n-data.js').match(/\bjumpLatestTitle:\s*'[^']+'/g) || []).length, 2);
  for (const l of LANGS) assert.match(read('i18n/' + l + '.js'), /["']?jumpLatestTitle["']?\s*:\s*["'][^"']+["']/, l);
});
