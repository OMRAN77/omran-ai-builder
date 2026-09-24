'use strict';
/* v-chip-func-name (أمر المالك ٢٣ سبتمبر «أبدله باسم وظيفي»): شريحة النموذج تحت صندوق الكتابة تعرض اللقب الوظيفيّ
   للمزوّد المختار لا اسم النموذج؛ الخريطة مطابقة لـPROVIDER_NICK_KEYS في app-05. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const modes = fs.readFileSync('js/modes.js', 'utf8');
const app05 = fs.readFileSync('js/app-05-ui.js', 'utf8');

const nickOf = (src, re) => { const m = src.match(re); assert.ok(m, 'الخريطة موجودة'); return Function('return (' + m[1] + ')')(); };

test('١. الشريحة تعرض اللقب الوظيفيّ لا اسم النموذج، والخريطة مطابقة لـapp-05', () => {
  assert.match(modes, /\(window\.__agentModeOn === true\) \? agentLabel\(\) : curProvFuncLabel\(\);/);
  assert.doesNotMatch(modes, /curProvModelLabel/);
  const a = nickOf(modes, /var NICK = (\{[^}]+\});/);
  const b = nickOf(app05, /const PROVIDER_NICK_KEYS = (\{[\s\S]*?\});/);
  assert.deepEqual(a, b);
  assert.match(fs.readFileSync('index.html', 'utf8'), /js\/modes\.js\?v=m240924a/);
});

test('٢. اللقب يُقرأ من الترجمة (١٤ لغة) مع احتياط، وبلا اسم مزوّد', () => {
  const src = modes.slice(modes.indexOf('var NICK_FB'), modes.indexOf('var ROW ='));
  const NICK = nickOf(modes, /var NICK = (\{[^}]+\});/);
  const ls = (p) => ({ getItem: () => p });
  const label = (p, tt) => { const g = new Function('NICK', 'AR', 't', 'localStorage', 'function curProv(){ return localStorage.getItem("aiapp_provider") || "openai"; }\n' + src + '; return curProvFuncLabel();'); return g(NICK, true, tt, ls(p)); };
  const ar = { provNickKing: 'الكينج', provNickFast: 'السريع', provNickDeep: 'العميق' };
  assert.equal(label('claude', (k) => ar[k]), 'الكينج');
  assert.equal(label('openai', (k) => ar[k]), 'العميق');
  assert.equal(label('groq', (k) => ar[k]), 'السريع');
  assert.equal(label('claude', (k) => k), 'الكينج', 'احتياط حين لا ترجمة');
  const packs = fs.readdirSync('i18n').filter((f) => /provNickKing/.test(fs.readFileSync('i18n/' + f, 'utf8')));
  assert.ok(packs.length >= 12, 'اللقب مترجم في ١٢ حزمة + العربيّة والإنجليزيّة في app-03');
  assert.equal((fs.readFileSync('js/app-03-i18n-data.js', 'utf8').match(/provNickKing:/g) || []).length, 2);
});
