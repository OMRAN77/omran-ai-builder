'use strict';
/* tests/en-ui-small.test.cjs — الدفعة ٥ «الواجهة الإنجليزيّة» (تدقيق ١٨ أكتوبر، أمر المالك ٢٠ أكتوبر): بنود صغيرة متفرّقة في الملفّات.
   - maha-call: تلميح زرّ «م» ووصف صورته باسم الشخصيّة بلغة الواجهة (mahaPersonaName) لا «مها» الثابت.
   - chat-jump-bottom: وصف زرّ «↓» لقارئ الشاشة بمفتاح الترجمة لا عربيّ ثابت.
   - portrait-open: اسم البطاقة = عنوان الورقة بلا رمزه في كلّ لغة («Photo styles» لا «Portrait styles»).
   - stats-section: «المزوّد المفضّل» يُحلّ من providerKey بلغة الواجهة (كان «العميق» في الإنجليزيّ).
   - style-open / decor-ideas-gallery: «Heritage/Traditional» و«Living room» يلتفّان سطرين بدل القصّ.
   - fashion-compare: A/B/C و«👍 Pick this» لغير العربيّة والأردو بدل «أ/ب» و«اضغطي للاختيار ✓». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LAZY = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];

const CORE = (() => {
  const DATA = read('js/app-03-i18n-data.js');
  const ast = acorn.parse(DATA, { ecmaVersion: 'latest', sourceType: 'script' });
  const parts = ast.body.filter((n) => (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === 'I18N'))
    || (n.type === 'ExpressionStatement' && DATA.slice(n.start, n.start + 18).startsWith('Object.assign(I18N'))).map((n) => DATA.slice(n.start, n.end));
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(parts.join('\n') + '\nthis.I18N = I18N;', sb);
  return sb.I18N;
})();
function lazy(lg) {
  const sb = { I18N: {} }; sb.window = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(read('i18n/' + lg + '.js'), sb);
  return Object.assign({}, CORE[lg] || {}, sb.I18N[lg]);
}
const DICT = { ar: CORE.ar, en: CORE.en };
for (const lg of LAZY) DICT[lg] = lazy(lg);

test('١. maha-call: التلميح ووصف الصورة من mahaPersonaName (بلغة الواجهة)، والاسم المعروض في المكالمة كما كان', () => {
  const src = read('js/app-08-maha.js');
  const fn = src.slice(src.indexOf('function mahaUpdatePersonaUI(){'), src.indexOf('\n}\n', src.indexOf('function mahaUpdatePersonaUI(){')));
  assert.match(fn, /const tip = \(typeof mahaPersonaName === 'function'\) \? mahaPersonaName\(\) : name;/);
  assert.match(fn, /if\(btnMahaEl\) btnMahaEl\.title = tip;/);
  assert.match(fn, /dock\.title = tip;/);
  assert.match(fn, /fabImg\.alt = tip;/);
  assert.doesNotMatch(fn, /\.title = name;/, 'لا تلميح بالاسم العربيّ الثابت');
  // mahaPersonaName الحقيقيّة: Maha بالإنجليزيّ، ومها بالعربيّ
  const a4 = read('js/app-04-i18n-state.js');
  const s = a4.indexOf('function mahaPersonaName(){');
  const body = a4.slice(s, a4.indexOf('\n}\n', s) + 3);
  const run = (lg) => { const sb = { lang: lg, localStorage: { getItem: () => null } }; vm.createContext(sb); vm.runInContext(body + '\nthis.f = mahaPersonaName;', sb); return sb.f(); };
  assert.equal(run('en'), 'Maha');
  assert.equal(run('ar'), 'مها');
});

test('٢. chat-jump-bottom: وصف قارئ الشاشة بمفتاح jumpLatestTitle الموجود بالـ١٤ لغة', () => {
  const tag = read('index.html').match(/<button[^>]*id="chatJumpBottom"[^>]*>/)[0];
  assert.ok(tag.includes('data-i18n="[aria-label]jumpLatestTitle"'), tag);
  for (const [lg, d] of Object.entries(DICT)) assert.ok(typeof d.jumpLatestTitle === 'string' && d.jumpLatestTitle.trim(), lg);
  assert.doesNotMatch(DICT.en.jumpLatestTitle, /[؀-ۿ]/);
});

test('٣. portrait-open: اسم البطاقة = عنوان الورقة بلا رمزه في كلّ اللغات', () => {
  for (const [lg, d] of Object.entries(DICT)) {
    const sheet = String(d.portraitStyleSheetTitle || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    assert.ok(sheet, lg + ': عنوان الورقة');
    assert.equal(d.portraitBtnTitle, sheet, lg);
  }
  assert.equal(DICT.en.portraitBtnTitle, 'Photo styles');
});

test('٤. stats-section: «المزوّد المفضّل» من providerKey بلغة الواجهة، والرسالة القديمة بلا مفتاح بتسميتها', () => {
  const a5 = read('js/app-05-ui.js');
  const s = a5.indexOf('function renderStats(){');
  const body = a5.slice(s, a5.indexOf('\n}\n', s) + 3);
  assert.match(body, /const key = \(m\.providerKey && typeof functionalLabel === 'function'\) \? functionalLabel\(m\.providerKey\) : m\.providerLabel\.replace\(\/\^🔄\\s\*\/, ''\);/);
});

test('٥. «Heritage/Traditional» و«Living room» يلتفّان سطرين بدل القصّ', () => {
  const a13 = read('js/app-13-stocks-init.js');
  assert.match(a13, /min-width:86px; height:104px;[^']*white-space:normal;'/, 'تبويب ستايل AI');
  assert.match(a13, /sp\.style\.cssText = 'position:relative; z-index:2; max-width:100%; text-align:center; line-height:1\.15; overflow-wrap:anywhere; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden;'/);
  const a12 = read('js/app-12-studios.js');
  assert.match(a12, /cap\.style\.cssText = 'position:absolute; left:50%; bottom:3%; transform:translateX\(-50%\); width:96%; white-space:normal; overflow-wrap:anywhere; line-height:1\.1; text-align:center;'/);
  assert.doesNotMatch(a12, /white-space:nowrap; max-width:96%; overflow:hidden; text-overflow:ellipsis;/);
});

test('٦. fashion-compare: A/B/C و«👍 Pick this» لغير العربيّة والأردو، وأ/ب/ج بالعربيّة كما كانت', () => {
  const a12 = read('js/app-12-studios.js');
  assert.match(a12, /const LABELS = \/\^\(ar\|ur\)\/\.test\(lang7\(\)\) \? \['أ', 'ب', 'ج'\] : \['A', 'B', 'C'\];/);
  assert.match(a12, /const PICK_HINT = bT\('اضغطي للاختيار ✓', '👍 Pick this'\);/);
  assert.doesNotMatch(a12, /AR_LABELS|>اضغطي للاختيار ✓<|'✓ اختيارك'/);
});
