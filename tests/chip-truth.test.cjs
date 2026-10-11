// tests/chip-truth.test.cjs — v-chip-truth: الشريحة تحت الصندوق تقول دائمًا من سيردّ.
// لقطتا المالك ١١ أكتوبر: تحت «DeepSeek» والمجيب Gemini (فتح محادثة Gemini من القائمة ينقل المزوّد ولا يحدّث الشريحة)،
// ثمّ تحت «DeepSeek» والمجيب Claude Opus (الوكيل شُغّل من زرّه أو من ⋮ والشريحة لا تعرف). أُعيد إنتاج الاثنين بـPlaywright على
// main (الشريحة بقيت «DeepSeek V4 Pro» والمزوّد gemini، ثمّ والوكيل شغّال) واختفيا بعد الإصلاح («Gemini 3.8 Flash» ثمّ «الوكيل»).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ui = read('js/app-05-ui.js');
const attach = read('js/app-09-attach.js');
const modes = read('js/modes.js');
const fnBody = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); return src.slice(i, src.indexOf('\n}\n', i) + 2); };

test('provider switch (chip menu, history click, settings) refreshes the chip — after the premium/agent visibility pass', () => {
  const f = fnBody(ui, 'function updateProviderQuickBarActive(){');
  const iPrem = f.indexOf('updatePremiumToggleVisibility();'), iChip = f.indexOf('window.omModelChipSync();');
  assert.ok(iPrem > 0 && iChip > iPrem, 'الشريحة بعد مرور الوكيل/الاحترافيّ (قد يطفئ الوكيل لمزوّد لا يدعمه)');
  // فتح محادثة من القائمة يمرّ بهذه الدالّة حين ينقل المزوّد
  const hist = read('js/app-04-i18n-state.js');
  assert.match(hist, /localStorage\.setItem\('aiapp_provider', p\.provider\);[\s\S]{0,500}updateProviderQuickBarActive\(\)/);
  // وsel ectProviderKey كذلك
  assert.match(ui, /function selectProviderKey\(key\)\{[\s\S]*?updateProviderQuickBarActive\(\);/);
});

test('agent on/off (its own button, ⋮ menu, premium toggle) refreshes the chip before any early return', () => {
  const f = fnBody(attach, 'function updateAgentModeUI(){');
  const iChip = f.indexOf('window.omModelChipSync();'), iRet = f.indexOf('if(!btn || !lbl) return;');
  assert.ok(iChip > 0 && iChip < iRet, 'قبل الخروج المبكّر');
  assert.match(read('js/app-10-features.js'), /window\.__agentModeOn = !window\.__agentModeOn;\s*updateAgentModeUI\(\);/, 'زرّ ⋮');
  assert.match(read('js/premium.js'), /window\.__agentModeOn = \(window\.__premiumOn === true\);\s*try\{ if\(typeof updateAgentModeUI === 'function'\) updateAgentModeUI\(\);/, 'زرّ الوكيل');
});

test('the chip itself: agent on → agent label, otherwise the provider; and both call sites tolerate the chip not being built yet', () => {
  assert.match(modes, /window\.omModelChipSync = refresh;/);
  assert.match(modes, /nm\.textContent = \(window\.__omMode === 'cc'\) \? 'Claude Code' : \(window\.__agentModeOn === true\) \? agentLabel\(\) : curProvName\(\);/);
  // تنفيذ الدالّتين في سياق بلا شريحة (غير المالك أو قبل بناء الشريط) لا يرمي
  const ctx = { window: {}, document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null }, localStorage: { getItem: () => 'deepseek' }, __swallow: () => { throw new Error('لا يجب أن يُبلَّغ'); }, functionalLabel: (k) => k, lang: 'ar' };
  vm.createContext(ctx);
  vm.runInContext(fnBody(ui, 'function updateProviderQuickBarActive(){') + fnBody(attach, 'function updateAgentModeUI(){'), ctx);
  assert.doesNotThrow(() => { ctx.updateProviderQuickBarActive(); ctx.updateAgentModeUI(); });
  let n = 0; ctx.window.omModelChipSync = () => { n++; };
  ctx.updateProviderQuickBarActive(); ctx.updateAgentModeUI();
  assert.equal(n, 2, 'الشريحة تُحدَّث من الموضعين');
});
