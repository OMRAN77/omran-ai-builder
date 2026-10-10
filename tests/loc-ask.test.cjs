// tests/loc-ask.test.cjs — v-loc-not-build (لقطة المالك ١ أكتوبر: «دي تو دي عجمان — عطني الموقع» فظهرت فقاعة فارغة ثلاث مرّات).
// السبب مثبت من الكود: (١) «موقع» + «عطني» فتحتا بوّابة البناء فأُطفئت الأدوات وطُلب من النموذج «تبيني أبدأ البناء؟»؛
// (٢) الموديل ردّ برابط الخريطة، والعارض يحذف كلّ سطر فيه رابط خرائط فصار الردّ لا شيء — والمحتوى غير فارغ فلا سطر تشخيص.
// يثبّت: «الموقع/موقعه» بلا فعل بناء ليس بناءً، وفعل البناء الصريح يبقى بناءً؛ رابط الخريطة يظهر لمن طلب الموقع، ويُحذف من
// القوائم كما قرّر المالك، ولا يُمحى الردّ كلّه أبدًا؛ ونمط «طلب الموقع» واحد في العميل والخادم.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const ATTACH = fs.readFileSync(path.join(root, 'js/app-09-attach.js'), 'utf8');
const STATE = fs.readFileSync(path.join(root, 'js/app-04-i18n-state.js'), 'utf8');
const CHAT = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');

const line = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, 'مفقود: ' + head); return src.slice(i, src.indexOf('\n', i)); };
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); assert.ok(i >= 0, 'مفقود: ' + name); return src.slice(i, src.indexOf('\n}\n', i) + 2); };

/* البوّابة كما في الكود: النصّ المفحوص لكلمة البناء __gateText، والفعل والإصلاح والبناء الصريح على النصّ الأصليّ */
const ctx = {};
vm.runInNewContext([
  line(ATTACH, 'const __strongBuildRe = '),
  line(ATTACH, 'const GATE_BUILD_RE = '), line(ATTACH, 'const GATE_CMD_RE = '), line(ATTACH, 'const GATE_FIX_RE = '),
  line(ATTACH, 'const GATE_HARD_RE = '),
  'function gateText(text){ ' + line(ATTACH, 'const __gateText = ').replace('const __gateText = ', 'return ') + ' }',
  'this.gate = (text) => !!(text && ((GATE_BUILD_RE.test(gateText(text)) && GATE_CMD_RE.test(text)) || __strongBuildRe.test(text)) && !GATE_FIX_RE.test(text));',
].join('\n'), ctx);

test('١. البوّابة: «عطني الموقع» وأخواتها ليست طلب بناء موقع', () => {
  for (const t of ['دي تو دي عجمان\n\n\nعطني الموقع', 'عطني موقعه', 'ابي الموقع الالكتروني حقهم', 'ارسل لي موقعها', 'عطني الموقع واللوكيشن']) {
    assert.equal(ctx.gate(t), false, t);
  }
});

test('٢. البوّابة: طلب البناء الحقيقيّ يبقى بناءً كما كان', () => {
  for (const t of ['ابني لي موقع لمطعمي', 'اريد موقع لشركتي', 'سوي الموقع', 'عطني تطبيق للملاحظات', 'صمم لي الموقع']) {
    assert.equal(ctx.gate(t), true, t);
  }
  assert.equal(ctx.gate('صلح الموقع'), false, 'الإصلاح ليس بناءً كما كان');
  // الفحص الجديد في الموضعين: طلب البناء الكامل وفتح البوّابة
  assert.equal(ATTACH.split('GATE_BUILD_RE.test(__gateText) && GATE_CMD_RE.test(text)').length - 1, 2);
});

const r = {};
vm.runInNewContext(fnSrc(STATE, 'omranIsLocationAsk') + fnSrc(STATE, 'omranMapFilter') + '\nthis.loc = omranIsLocationAsk; this.filter = omranMapFilter;', r);
const OWNER_Q = 'دي تو دي عجمان\n\n\nعطني الموقع';

test('٣. العارض: من طلب الموقع يرى رابط الخريطة (كان سطره يُحذف فتفرغ الفقاعة)', () => {
  const reply = 'موقع دي تو دي عجمان على الخريطة: https://www.google.com/maps/search/?api=1&query=D2D+Ajman';
  assert.equal(r.filter(reply, OWNER_Q), reply);
  const card = 'D2D Ajman — Al Nuaimiya 1, Ajman\n[📍 الموقع على الخريطة](https://maps.google.com/?cid=42)';
  assert.equal(r.filter(card, 'وين موقعه؟'), card);
});

test('٤. العارض: القوائم بلا روابط خرائط كما قرّر المالك، ولا يُمحى الردّ كلّه أبدًا', () => {
  const list = '1. نستو\nhttps://maps.google.com/?cid=11\n2. كنز\nhttps://www.google.com/maps/place/x';
  assert.equal(r.filter(list, 'هايبرماركتات في عجمان'), '1. نستو\n2. كنز');
  const only = 'https://maps.google.com/?cid=11';
  assert.equal(r.filter(only, 'شو أقرب محل؟'), only, 'ردّ كلّه رابط = يبقى بدل فقاعة فارغة');
  assert.equal(r.filter('', 'x'), '');
  // التوصيل: العارض يمرّر آخر رسالة للمستخدم قبل الردّ
  assert.match(STATE, /__mc = omranMapFilter\(__mc, __prevU\);/);
  assert.ok(!/filter\(line => !__mapUrlRe\.test\(line\)\)/.test(STATE), 'الحذف القديم بلا شرط أزيل');
});

test('٥. «طلب الموقع» نمط واحد في العميل والخادم، ويعرف صيغ المالك', () => {
  const client = STATE.match(/function omranIsLocationAsk\(t\)\{\n\s+return (\/.+\/i)\.test/)[1];
  const server = CHAT.match(/const WHERE_ASK_RE = (\/.+\/i);/)[1];
  assert.equal(client, server);
  for (const t of [OWNER_Q, 'وين موقعه', 'عطني اللوكيشن', 'شو العنوان', 'where is D2D Ajman', 'send me the location', 'وين يقع المحل']) assert.ok(r.loc(t), t);
  for (const t of ['اريد عروضات في عجمان', 'كم سعر الذهب', 'ابني لي موقع لمطعمي']) assert.equal(r.loc(t), false, t);
});
