'use strict';
/* v-chip-func-name (أمر المالك ٢٣ سبتمبر «أبدله باسم وظيفي»): شريحة النموذج تحت صندوق الكتابة تعرض اللقب الوظيفيّ
   للمزوّد المختار لا اسم النموذج؛ الخريطة مطابقة لـPROVIDER_NICK_KEYS في app-05. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const modes = fs.readFileSync('js/modes.js', 'utf8');
const app05 = fs.readFileSync('js/app-05-ui.js', 'utf8');

const nickOf = (src, re) => { const m = src.match(re); assert.ok(m, 'الخريطة موجودة'); return Function('return (' + m[1] + ')')(); };

// v-chip-own-name (أمر المالك ٤ أكتوبر «المزوّدين اللي تحت… أريد كلّ واحد واسمه»): الشريحة صارت باسم المزوّد المختار
// (الشريط للمالك وحده)؛ اللقب الوظيفيّ باقٍ احتياطًا لمزوّد غير معروف، وخريطته مطابقة لـapp-05 كما كانت.
test('١. الشريحة باسم المزوّد المختار لا اسم النموذج، والخريطة الوظيفيّة الاحتياطيّة مطابقة لـapp-05', () => {
  assert.match(modes, /\(window\.__agentModeOn === true && curProv\(\) === 'claude'\)[^?]*\? agentLabel\(\) : curProvName\(\);/); // v-prov-self: «الوكيل» مع Claude وحده
  assert.doesNotMatch(modes, /curProvModelLabel/);
  const a = nickOf(modes, /var NICK = (\{[^}]+\});/);
  const b = nickOf(app05, /const PROVIDER_NICK_KEYS = (\{[\s\S]*?\});/);
  assert.deepEqual(a, b);
  assert.match(fs.readFileSync('index.html', 'utf8'), /js\/modes\.js\?v=m211026/);
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

test('٣. كلّ مزوّد باسمه: Claude وGPT وGemini وKimi وDeepSeek… والوسيط باسم موديله (Grok/Qwen)', () => {
  const i = modes.indexOf('var PROVS = [');
  const j = modes.indexOf('var ROW =', i);
  const store = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null) };
  const run = new Function('localStorage', 'AR', 't', 'window', modes.slice(i, j) + '; return curProvName;');
  const name = run(ls, true, (k) => ({ provNickKing: 'الكينج', provNickFast: 'السريع', provNickDeep: 'العميق' }[k] || k), {});
  // v-chip-model: المزوّد + موديله المختار (الافتراضيّ هنا)، والاسم لا يتكرّر إن كان الموديل يبدأ به.
  const want = { claude: 'Claude Opus 5.5' /* v-owner-claude-all: افتراضيّ المالك */, openai: 'GPT-6 Sol', gemini: 'Gemini 3.8 Flash', kimi: 'Kimi K3', deepseek: 'DeepSeek V4 Pro', mistral: 'Mistral Medium 3.5', groq: 'Groq GPT-OSS 120B' /* v-owner-solo: الموديل الذي يجيب فعلًا عند Groq */, perplexity: 'Perplexity Sonar', cohere: 'Cohere Command A', openrouter: 'Grok' };
  const seen = new Set();
  for (const [k, v] of Object.entries(want)) { store.aiapp_provider = k; assert.equal(name(), v, k); seen.add(name()); }
  assert.equal(seen.size, Object.keys(want).length, 'لا اسمان متشابهان');
  store.aiapp_provider = 'openrouter'; store.aiapp_openrouter_model = 'qwen/qwen3.6-27b';
  assert.equal(name(), 'Qwen');
  // v-chip-model (المالك ٤ أكتوبر «شو عرفني أيّ كلاود اختار»): كلّ موديل كلود باسمه
  store.aiapp_provider = 'claude';
  const cl = new Set();
  // v-owner-claude-all: كلّ نماذج كلود الاثني عشر باسمها في الشريحة (الرئيسيّة و«نماذج أخرى»)
  const ALL = [['claude-opus-5-5', 'Opus 5.5'], ['claude-fable-5-1', 'Fable 5.1'], ['claude-sonnet-5-5', 'Sonnet 5.5'], ['claude-haiku-5-5', 'Haiku 5.5'], ['claude-haiku-4-5', 'Haiku 4.5'], ['claude-sonnet-5', 'Sonnet 5'], ['claude-opus-5', 'Opus 5'], ['claude-fable-5', 'Fable 5'], ['claude-opus-4-8', 'Opus 4.8'], ['claude-opus-4-7', 'Opus 4.7'], ['claude-opus-4-6', 'Opus 4.6'], ['claude-sonnet-4-6', 'Sonnet 4.6']];
  for (const [id, lbl] of ALL) {
    store.aiapp_claude_model = id; assert.equal(name(), 'Claude ' + lbl); cl.add(name());
  }
  assert.equal(cl.size, 12, 'اثنا عشر موديل كلود = اثنا عشر اسمًا');
  store.aiapp_provider = 'unknown';
  assert.equal(name(), 'العميق', 'مزوّد غير معروف → اللقب الوظيفيّ');
});
