// tests/actor-notice.test.cjs — v-actor-notice (تدقيق ١٨ أكتوبر، صفّ video-mode-actor: «تنبيه «اكتب أول شي…» يطلع فوق خارج الشاشة وما ينشاف»
// في الجوّال؛ قرار المالك ٢١ أكتوبر: «صندوق الممثل في الجوال: إذا كان مخرّب أو مغطّى صلّحه، بدون ما تضيف شي جديد»).
// القياس المحلّيّ قبل الإصلاح: موضع التنبيه −٣٥٩ (٣٥٤px) و−٢٣٢ (٧٣٢px) والزرّ عند ٥٥٠ — سطر الحالة في عمود المعاينة فوق الحقول.
// بعده: ١ (ظاهر) في الجوّال، و٢٦٨ في الحاسوب كما كان.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-11-video.js'), 'utf8');

function helpers() {
  const a = SRC.indexOf('  function setStatus(text){');
  const b = SRC.indexOf('  function ensureLongMinutesOption(');
  assert.ok(a > 0 && b > a, 'setStatus في مكانه');
  const scrolls = [];
  const statusEl = { style: {}, textContent: '', scrollIntoView: (o) => scrolls.push(o) };
  const ctx = { statusEl, __swallow: () => {} };
  vm.createContext(ctx);
  vm.runInContext(SRC.slice(a, b) + '\nthis.setStatus = setStatus; this.showNotice = typeof showNotice === "function" ? showNotice : null;', ctx);
  return { ctx, statusEl, scrolls };
}

test('١. تنبيه الممثل يُمرَّر إلى العين (nearest — لا حركة حين يُرى)، وسطر التقدّم العاديّ لا يشدّ الشاشة', () => {
  const h = helpers();
  assert.equal(typeof h.ctx.showNotice, 'function', 'لا مُظهِر للتنبيه — كان setStatus وحده فيُكتب خارج الشاشة');
  h.ctx.setStatus('⏳ يولّد…');
  assert.equal(h.scrolls.length, 0, 'تقدّم التوليد يُكتب كلّ ثوانٍ — لا يُمرَّر');
  h.ctx.showNotice('🗣️ اكتب أول شي وش يقول الممثل.');
  assert.equal(h.statusEl.textContent, '🗣️ اكتب أول شي وش يقول الممثل.');
  assert.equal(h.statusEl.style.display, 'block');
  assert.equal(h.scrolls.length, 1);
  assert.equal(h.scrolls[0].block, 'nearest', 'الحاسوب (التنبيه ظاهر) لا يتحرّك');
});

test('٢. تنبيها صندوق الممثل (خانة الكلام فارغة، والمحرّك للمالك وحده) يمرّان بالمُظهِر', () => {
  assert.match(SRC, /showNotice\(bT\('🗣️ اكتب أول شي وش يقول الممثل\.','🗣️ Write what the actor should say first\.'\)\);/);
  assert.match(SRC, /if\(creationMode === 'veo' \|\| creationMode === 'actor'\)\{\n\s+try\{\n\s+if\(!isOwnerAccount\(\)\)\{\n\s+showNotice\(bT\('🔒 المحرّك السينمائيّ مقتصر/);
  assert.doesNotMatch(SRC, /setStatus\(bT\('🗣️ اكتب أول شي وش يقول الممثل/);
});
