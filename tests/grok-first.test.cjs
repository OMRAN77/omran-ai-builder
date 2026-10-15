// v-grok-first (المالك ١٣ أكتوبر: «اريد نفسك انته لي كل المزودين عندي واهم واحد كروك»):
// أسلوب العمل نفسه (لا تقف بعد القراءة — أكمل في نفس الردّ) يصل كلّ مزوّد عند المالك عبر OWNER_METHOD،
// وكروك أوّل القائمة وافتراضيّ المالك واحتياط الخادم. غير المالك يبقى GPT.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const PL = require(path.join(root, 'api/_lib/provider-level.js'));

function provs() {
  const m = read('js/modes.js');
  const i = m.indexOf('var PROVS = [');
  const src = m.slice(i, m.indexOf('\n      ];', i) + 9);
  return new Function(src + '\nreturn PROVS;')();
}

test('١. كروك أوّل منتقي المالك، وافتراضيّه grok-4.6، وغير المالك GPT', () => {
  const rows = provs();
  assert.equal(rows[0].key, 'openrouter');
  assert.equal(rows[0].grp, 1);
  assert.equal(rows[0].def, 'x-ai/grok-4.6');
  assert.ok(rows[0].models.some((x) => x[0] === 'x-ai/grok-4.6' && x[1] === 'Grok 4.6'));
  const m = read('js/modes.js');
  assert.match(m, /function curProv\(\)\{ try\{ return localStorage\.getItem\('aiapp_provider'\) \|\| \(isOwner\(\) \? 'openrouter' : 'openai'\); \}catch\(e\)\{ return isOwner\(\) \? 'openrouter' : 'openai'; \}/);
  const pin = (read('index.html').match(/js\/modes\.js\?v=([^"']+)/) || [])[1];
  assert.ok(pin && pin !== 'm111026c', 'وسم modes.js رُفع مع نقل كروك');
});

test('٢. احتياط الخادم لصفّ الوسيط = كروك، لا كلود', () => {
  const chat = read('api/_lib/chat.js');
  const or = chat.slice(chat.indexOf('const OR_MODELS = {'), chat.indexOf('};', chat.indexOf('const OR_MODELS = {')));
  assert.match(or, /openrouter:\s*'x-ai\/grok-4\.6'/);
  assert.doesNotMatch(or, /openrouter:\s*'anthropic\//);
  assert.equal(PL.familyOf('openrouter', '').key, 'grok');
  assert.match(PL.levelNote('openrouter', ''), /أكمل المهمّة في نفس الردّ/);
});

test('٥. تغذية كروك: اقرأ المستودع قبل الادّعاء، ولا تجب من التدريب (v-grok-high-feed)', () => {
  const n = PL.levelNote('openrouter', 'x-ai/grok-4.6');
  assert.match(n, /أكمل المهمّة في نفس الردّ/);
  assert.match(n, /صراحة ومباشرة/);
  assert.match(n, /DECISIONS\.md[^\n]*PITFALLS\.md[^\n]*read_github/);
  assert.match(n, /لا تجب عن الكود أو الحالة من تدريبك/);
  assert.match(n, /what=map/);
  const q = PL.levelNote('openrouter', 'qwen/qwen3.6-27b');
  assert.ok(!/لا تجب عن الكود أو الحالة من تدريبك/.test(q), 'Qwen لا يأخذ تغذية كروك');
});

test('٣. منهج العمل يصل كلّ مزوّد: لا تُنهَ الردّ بعد القراءة وحدها', () => {
  assert.match(PL.OWNER_METHOD, /ولا تُنهَ الردّ بعد القراءة وحدها: الجواب أو التعديل في نفس الدور/);
  assert.ok(PL.OWNER_METHOD.length > 1500 && PL.OWNER_METHOD.length < 3200, 'حجم المنهج: ' + PL.OWNER_METHOD.length);
  const def = read('js/app-05-ui.js');
  assert.match(def, /function omranDefaultProv\(\)\{ return omranOwnerUi\(\) \? 'openrouter' : 'openai'; \}/);
  for (const f of ['js/app-04-i18n-state.js', 'js/app-06-checkout.js', 'js/app-09-attach.js', 'js/app-22-session-new.js']) {
    assert.match(read(f), /omranDefaultProv\(\)/, f);
  }
});

test('٤. غير المالك لم يُمسّ: GPT افتراضيّه، ولا اسم مزوّد في النصّ الظاهر', () => {
  assert.match(read('js/premium.js'), /getItem\('aiapp_provider'\)\s*\|\|\s*'openai'/);
  const html = read('index.html');
  assert.doesNotMatch(html, /Grok 4\.6|x-ai\/grok/);
  assert.ok(!/كروك/.test(read('js/app-03-i18n-data.js')), 'لا اسم كروك في نصوص الواجهة العامّة');
});
