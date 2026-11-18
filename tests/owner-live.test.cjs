'use strict';
/* v-owner-live (المالك ١٨ نوفمبر: «أيّ محادثة في التطبيق أريدها في نفس الوقت، وأيّ شخص يسجّل يوصل في نفس الوقت، مش اليوم الثاني»):
   إشعار Web Push فوريّ للمالك لكلّ دور محادثة لغير المالك ولكلّ حساب جديد — الإيميل اليوميّ باقٍ كما هو.
   ١ الدور: الاسم/الزائر، الكلام والردّ والخطأ مقصوصة ونظيفة من المفاتيح، وسم ثابت لكلّ مستخدم، والمالك لا يُبلَّغ عن نفسه
   ٢ الحساب الجديد: الاسم والطريقة والدولة، ويبقى على الشاشة
   ٣ الربط: من chat-mail.noteTurnLater (كلّ دور، ولو بلا إعدادات الإيميل) ومن signup-notify (المسارات الثلاثة، ولو بلا الإيميل)
   ٤ الهاتف: sw.js يحترم الوسم والبقاء، وجهاز المالك المسموح له يجدّد اشتراكه عند الفتح
   ٥ OWNER_LIVE=off يطفئه، وفشل الدفع لا يرمي */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const live = require('../api/_lib/owner-live.js');
const owner = require('../api/_lib/_owner.js').ownerList()[0] || 'omran';

function cap() { const out = []; return { out, push: async (p) => { out.push(p); return { sent: 1 }; } }; }

test('١ الدور: إشعار فوريّ بالكلام والردّ، ووسم لكلّ مستخدم', async () => {
  const c = cap();
  assert.equal(await live.turn({ user: 'sara', text: 'ابي دعاية للحذاء sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', reply: 'أكيد! ارفق صورة الحذاء', country: 'ae' }, { push: c.push, env: {} }), 'sent');
  const p = c.out[0];
  assert.equal(p.title, '💬 sara · AE');
  assert.match(p.body, /^ابي دعاية للحذاء/);
  assert.doesNotMatch(p.body, /sk-ant-api03-/, 'المفتاح محذوف');
  assert.match(p.body, /\n↩ أكيد! ارفق صورة الحذاء$/);
  assert.equal(p.sticky, false);
  assert.match(p.tag, /^om-chat-[0-9a-f]{10}$/);
  await live.turn({ user: 'sara', text: 'ثانية' }, { push: c.push, env: {} });
  await live.turn({ user: 'ali', text: 'هلا' }, { push: c.push, env: {} });
  assert.equal(c.out[1].tag, p.tag, 'رسائل المستخدم نفسه تحلّ محلّ بعضها');
  assert.notEqual(c.out[2].tag, p.tag);
  // زائر، صورة بلا نصّ، خطأ، نصّ طويل
  await live.turn({ guestId: 'g-123', image: true, error: 'upstream 529 overloaded' }, { push: c.push, env: {} });
  assert.match(c.out[3].title, /^⚠️ زائر-[0-9a-f]{6} \(زائر\)$/);
  assert.match(c.out[3].body, /^📷 صورة\n⚠️ upstream 529/);
  await live.turn({ user: 'long', text: 'ك'.repeat(1000) }, { push: c.push, env: {} });
  assert.ok(c.out[4].body.length <= live.Q_MAX, 'مقصوص');
  // المالك لا يُبلَّغ عن نفسه، والفارغ لا شيء
  assert.equal(await live.turn({ user: owner, text: 'تجربة' }, { push: c.push, env: {} }), 'owner');
  assert.equal(await live.turn({ user: 'x', text: '   ' }, { push: c.push, env: {} }), 'skip');
  assert.equal(c.out.length, 5);
});

test('٢ الحساب الجديد: إشعار يبقى على الشاشة', async () => {
  const c = cap();
  assert.equal(await live.signup({ key: 'nora', user: { username: 'Nora', email: 'n@x.com' }, method: 'google', req: { headers: { 'x-vercel-ip-country': 'SA' } } }, { push: c.push, env: {} }), 'sent');
  assert.deepEqual(c.out[0], { title: '👤 حساب جديد: Nora', body: 'Google · SA · n@x.com', url: '/', tag: c.out[0].tag, sticky: true });
  assert.match(c.out[0].tag, /^om-signup-/);
  assert.equal(await live.signup({ key: '', user: null }, { push: c.push, env: {} }), 'skip');
});

test('٣ الربط: كلّ دور وكلّ تسجيل، ولو بلا إعدادات الإيميل', async () => {
  const c = cap();
  live._seam.push = c.push; live._seam.waitUntil = (p) => p;
  try {
    const mail = require('../api/_lib/chat-mail.js');
    const saved = { O: process.env.OWNER_NOTIFY_EMAIL, R: process.env.RESEND_API_KEY };
    delete process.env.OWNER_NOTIFY_EMAIL; delete process.env.RESEND_API_KEY;
    try {
      await mail.noteTurnLater({ user: 'sara', text: 'مرحبا' });
      require('../api/_lib/signup-notify.js').notifyNewAccount({ key: 'k1', user: { username: 'k1' }, method: 'password', req: {} });
      await new Promise((r) => setTimeout(r, 10));
    } finally { if (saved.O !== undefined) process.env.OWNER_NOTIFY_EMAIL = saved.O; if (saved.R !== undefined) process.env.RESEND_API_KEY = saved.R; }
    assert.deepEqual(c.out.map((p) => p.title), ['💬 sara', '👤 حساب جديد: k1']);
  } finally { live._seam.push = null; live._seam.waitUntil = null; }
  assert.ok(read('api/_lib/chat.js').includes("require('./chat-mail.js').noteTurnLater({ user: usage.username"), 'كلّ دور لغير المالك يمرّ بـnoteTurnLater');
  for (const f of ['api/_lib/auth.js', 'api/_lib/auth-google-callback.js']) assert.match(read(f), /notifyNewAccount\(/, f);
});

test('٤ الهاتف: الوسم والبقاء، وتجديد اشتراك جهاز المالك', () => {
  const sw = read('sw.js');
  assert.ok(sw.includes("tag: data.tag || ('maha-reminder-' + Date.now()),"));
  assert.ok(sw.includes('requireInteraction: data.sticky !== false,'), 'التذكيرات القديمة تبقى كما كانت');
  const m = read('js/app-08-maha.js');
  assert.ok(m.includes("if(typeof omranOwnerUi === 'function' && omranOwnerUi() && window.Notification && Notification.permission === 'granted') mahaEnsurePushSubscribed();"), 'بلا نافذة إذن جديدة');
});

test('٥ الإطفاء، والفشل لا يرمي', async () => {
  const c = cap();
  assert.equal(await live.turn({ user: 'sara', text: 'x' }, { push: c.push, env: { OWNER_LIVE: 'off' } }), 'off');
  assert.equal(await live.signup({ key: 'a', user: { username: 'a' } }, { push: c.push, env: { OWNER_LIVE: 'OFF' } }), 'off');
  assert.equal(c.out.length, 0);
  assert.equal(await live.turn({ user: 'sara', text: 'x' }, { push: async () => { throw new Error('boom'); }, env: {} }), 'error');
  assert.equal(await live.turn({ user: 'sara', text: 'x' }, { push: async () => ({ sent: 0, reason: 'no-subscription' }), env: {} }), 'no-subscription');
});
