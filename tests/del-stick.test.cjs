'use strict';
/* v-del-stick (المالك ٤ أكتوبر: «اذا احذف الكل واضغط على المشروع الجديد ولا كاني حذفت اي شي… ترجع المحادثة كاملة»):
   سجلّ الحذف المحلّيّ (aiapp_deleted_chats) كان يُكتب ولا يُقرأ؛ فإن فشل حذف السيرفر (القاعدة ممتلئة) أعادت المزامنة
   نسخة السيرفر. الآن المحذوف محلّيًّا لا يعود أبدًا — ولو أرسله السيرفر. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fnSrc(src, head) {
  const a = src.indexOf(head);
  assert.ok(a >= 0, head);
  let d = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
  return src.slice(a, i + 1);
}

for (const f of ['js/app-04-i18n-state.js', 'js/app.bundle.js']) {
  test(f + ': المحذوف محلّيًّا لا ترجعه المزامنة، وغير المحذوف يُدمج كما كان', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const store = { aiapp_deleted_chats: JSON.stringify(['p_a', 'p_b']) };
    const ctx = {
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
      state: { projects: [{ id: 'p_new', title: 'محادثة جديدة', messages: [], code: '' }], currentId: 'p_new' },
      __swallow() {}, console,
      saveState() {}, renderAll() {}, renderHistory() {}, renderMessages() {}, renderCode() {}, loadPreview() {}, updateHistoryBadge() {},
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(src, 'function chatsDeletedIds(){') + '\n' + fnSrc(src, 'function __chatsMergeServer(server, deletedIds){'), ctx);
    const server = [
      { id: 'p_a', title: 'أ', messages: [{ role: 'user', content: 'سؤال أ' }] },
      { id: 'p_b', title: 'ب', messages: [{ role: 'user', content: 'سؤال ب' }] },
      { id: 'p_c', title: 'ج من جهاز آخر', messages: [{ role: 'user', content: 'سؤال ج' }] },
    ];
    try { vm.runInContext('__chatsMergeServer(' + JSON.stringify(server) + ', [])', ctx); } catch (e) { /* دوال رسم غير موجودة في السياق — الحالة هي المقياس */ }
    const ids = ctx.state.projects.map((p) => p.id).sort();
    assert.ok(!ids.includes('p_a') && !ids.includes('p_b'), 'المحذوفتان لم ترجعا: ' + ids);
    assert.ok(ids.includes('p_c'), 'محادثة جهاز آخر غير محذوفة تُدمج كما كانت: ' + ids);
  });
}
