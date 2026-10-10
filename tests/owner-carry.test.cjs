// tests/owner-carry.test.cjs — v-owner-carry: خطّة بلا تنفيذ للمالك تُعاد للحلقة مرّة واحدة (لقطة Grok ١٠ أكتوبر).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const C = require('../api/_lib/owner-carry.js');

const GROK = 'أحدّد العنصر في الكود من نص اللقطة قبل أي حذف.أقرأ العلامات والأنماط اللي ترسم هالبلوك قبل أي حذف.اللقطة هي قائمة `#projMenuWrap` (المشاريع / بحث عن مشروع / حذف الكل). أتتبع كل مراجعها قبل الحذف.أقرأ الربط والمعالجات والاختبارات قبل حذف البلوك، عشان ما أنكسر «محادثة جديدة» ولا «حذف الكل» في التذييل.';

test('ردّ Grok في اللقطة = خطّة بلا تنفيذ', () => {
  assert.equal(C.stalledPlan(GROK, { usedTools: true }), true);
  assert.equal(C.stalledPlan(GROK, { ownerText: 'هذا (المشاريع / بحث عن مشروع / حذف الكل)', prevOwnerText: 'احذف هذي القائمة' }), true);
});

test('لا تنبيه: سؤال للمالك، أو تنفيذ تمّ، أو جواب عاديّ، أو دردشة', () => {
  assert.equal(C.stalledPlan('أقرأ الملف. تبيني أحذف القائمة كلها؟', { usedTools: true }), false);
  assert.equal(C.stalledPlan('أحذف القائمة: https://github.com/o/r/pull/5', { usedTools: true }), false);
  assert.equal(C.stalledPlan('أحذف القائمة الآن', { usedTools: true, pushed: true }), false);
  assert.equal(C.stalledPlan('القائمة في js/app-05-ui.js السطر 300.', { usedTools: true }), false);
  assert.equal(C.stalledPlan('سأشرح لك الفكرة ببساطة.', { ownerText: 'وش رأيك في الشعر' }), false);
  assert.equal(C.stalledPlan('', { usedTools: true }), false);
});

test('الربط: المحادثة والوكيل للمالك وحده، مرّة واحدة، وبمهلة كافية', () => {
  const chat = read('api/_lib/chat.js');
  assert.match(chat, /if \(stopReason !== 'tool_use' && __ownerReq && toolTurn && !__ownerCarried && steps < MAX_STEPS && Date\.now\(\) - t0 < MAX_MS - 45000\)/);
  assert.match(chat, /__ownerCarried = true;[\s\S]{0,300}__oc\.CARRY_NOTE[\s\S]{0,200}continue;/);
  const agent = read('api/_lib/agent.js');
  assert.match(agent, /if \(isOwner\(runUser\) && !ownerCarried && steps < MAX_STEPS && Date\.now\(\) - taskStart < MAX_TASK_MS - 45000\)/);
  assert.match(agent, /ownerCarried = true;[\s\S]{0,200}oc\.CARRY_NOTE[\s\S]{0,200}continue;/);
  assert.match(C.CARRY_NOTE, /ليس من المالك/);
});
