'use strict';
/* v-maha-subs (أمر المالك ٢٦ سبتمبر: «مها ما تشتغل عند المشتركين… فعلها» ← «نفس الي في الاشتراكات»):
   قفل v-maha-pause (٣١ أغسطس) كان يُبقي زرّ «م» ظاهرًا لغير المالك ويُرجع mahaStartCall فورًا — لا شيء
   يحدث. رُفع؛ والخادم (realtime-session) يحكم: دقائق مها ثمّ النقاط. رفضه يفتح اشتراكات مها بدل الوضع
   الأساسيّ المجّانيّ، والضيف يُعرض عليه الدخول. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const maha = fs.readFileSync('js/app-08-maha.js', 'utf8');
const i18n = fs.readFileSync('js/app-04-i18n-state.js', 'utf8');

test('١. قفل المالك وحده رُفع: لا __mahaPaused ولا إخفاء الأزرار، ولا حارس في mahaStartCall', () => {
  assert.doesNotMatch(maha + i18n, /__mahaPaused|mahaPauseCss|__ownerAcct/);
  const start = maha.slice(maha.indexOf('async function mahaStartCall('), maha.indexOf('if(btnMahaEl) btnMahaEl.onclick'));
  assert.match(start, /if\(mahaCallActive \|\| mahaCallStarting\) return;/);
  assert.doesNotMatch(start, /omran|owner/i);
});

test('٢. رفض الخادم (٤٠٢) يغلق المكالمة ويفتح الاشتراكات — لا هبوط مجّانيّ للوضع الأساسيّ', () => {
  assert.match(maha, /tokenRes\.status === 402\)\{[\s\S]{0,200}guest_trial_used' \? '__guest__' : '__points__'/);
  const c = maha.slice(maha.indexOf("mahaShowModeTag('hd');"), maha.indexOf("mahaShowModeTag('basic');"));
  const refuse = c.indexOf("e.message === '__points__' || e.message === '__guest__'");
  assert.ok(refuse > 0 && refuse < c.indexOf('falling back to classic pipeline'));
  assert.match(c.slice(refuse, refuse + 200), /mahaEndCall\(\);\s*mahaOpenPlans\(e\.message === '__guest__'\);\s*return;/);
});

function openPlans(token, guest){
  const src = maha.slice(maha.indexOf('function mahaOpenPlans('), maha.indexOf('async function mahaStartCall('));
  const calls = [];
  const window = { requireLogin: (r) => calls.push('login:' + r) };
  const document = { getElementById: (id) => (id === 'btnSettings' ? { click: () => calls.push('settings') } : null) };
  new Function('window', 'document', 'authGet', 'showSettingsPage', 'showPriceTab', '__swallow', src + '\nmahaOpenPlans(' + JSON.stringify(guest) + ');')(
    window, document, () => token, (s) => calls.push('page:' + s), (t) => calls.push('tab:' + t), () => {});
  return calls;
}

test('٣. المسجَّل بلا دقائق ولا نقاط: الإعدادات ← الباقات ← قسم مها؛ الضيف: شاشة الدخول', () => {
  assert.deepEqual(openPlans('tok', false), ['settings', 'page:pricingSection', 'tab:maha']);
  assert.deepEqual(openPlans('', false), ['login:guestLimit']);
  assert.deepEqual(openPlans('tok', true), ['login:guestLimit']);
});
