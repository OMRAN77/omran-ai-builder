// v-owner-model-badge (١٩ سبتمبر ٢٠٢٦): ما يعلنه الخادم عن الموديل الذي أجاب كان يُلتقط ولا يُعرض.
// الآن يُحفظ على رسالة الردّ ويظهر للمالك فوق كلّ ردّ مع اسم المزوّد؛ بقيّة المستخدمين كما كان (اسأل الكل فقط).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('app-09: الموديل المعلَن يُلتقط من نتيجة مسار الأدوات ويُحفظ على رسالة الردّ', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("let __ctModel = '';"), f + ': الحامل معلَن');
    assert.ok(s.includes("if(typeof __ct.model === 'string' && __ct.model) __ctModel = __ct.model; }"), f + ': الالتقاط');
    assert.ok(s.includes("providerLabel, providerKey, model: __ctModel || undefined /* v-owner-model-badge */, askA"), f + ': الحفظ على الرسالة');
  }
  // app-18 يعيد model من حدث modelLabel الذي يرسله الخادم
  assert.ok(read('js/app-18-chat-tools.js').includes("if (typeof ev.modelLabel === 'string') __model = ev.modelLabel;"));
});

test('app-04: للمالك يظهر الاسم + الموديل فوق كلّ ردّ؛ لغيره القاعدة القديمة (اسأل الكل فقط)', () => {
  for (const f of ['js/app-04-i18n-state.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("const __ownerBadge = (typeof omranOwnerUi === 'function' && omranOwnerUi());"), f);
    assert.ok(s.includes("if(__ownerBadge && m.model) __plbl = (__plbl ? __plbl + ' · ' : '') + m.model;"), f);
    assert.ok(s.includes("if(isAskAllReply || (__ownerBadge && __plbl)) div.appendChild(label);"), f + ': غير المالك يبقى على v464');
  }
});

test('الخادم: حدث modelLabel للمالك يحمل الموديل الذي خدم الطلب ثمّ الحساب', () => {
  const chat = read('api/_lib/chat.js');
  assert.ok(chat.includes("__usage.served = String((ev.message && ev.message.model) || '').trim() || __usage.served;"));
  assert.ok(chat.includes("return (u.served ? u.served + ' · ' : '') + 'كاش '"));
});
