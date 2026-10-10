// tests/quick-suggestions.test.cjs — v-quicksug-10 (٢١ سبتمبر ٢٠٢٦): قائمة «اقتراحات» (زرّ btnQuickTemplates) كانت
// ٢٠ بندًا مرتّبة بطول النصّ (يتغيّر مع كلّ لغة)، بلا برومبت لـ٧ لغات، والبوتات الثلاثة بلا ترجمة إلّا عربي/إنجليزي،
// ولا بند واحد يوصّل لأداة من أدوات التطبيق. صارت ١٠ بنود بترتيب صريح، كلّ بند بـ١٤ لغة، منها ٣ اختصارات أدوات.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const LANGS = ['ar','en','fr','hi','ur','bn','ne','ml','fil','id','zh','ru','tr','es'];

function loadSuggestions(){
  const src = fs.readFileSync(path.join(root, 'js/app-04-i18n-state.js'), 'utf8');
  const start = src.indexOf('const __BOT_LANG_NAME');
  const end = src.indexOf('function __quickSugLabel');
  assert.ok(start > 0 && end > start, 'كتلة QUICK_SUGGESTIONS موجودة');
  const ctx = {};
  vm.runInNewContext(src.slice(start, end) + '\nthis.Q = QUICK_SUGGESTIONS;', ctx);
  return { Q: ctx.Q, src };
}

test('١٠ بنود بالضبط، بترتيب order صريح فريد من ١ إلى ١٠، والبوتات الثلاثة (priority) في المقدّمة', () => {
  const { Q } = loadSuggestions();
  assert.equal(Q.length, 10);
  const orders = Q.map(s => s.order).sort((a,b) => a-b);
  assert.equal(JSON.stringify(orders), JSON.stringify([1,2,3,4,5,6,7,8,9,10]));
  const bots = Q.filter(s => s.priority);
  assert.equal(bots.length, 3);
  assert.equal(JSON.stringify(bots.map(s => s.order).sort()), '[1,2,3]');
});

test('كلّ بند له تسمية بالـ١٤ لغة، وكلّ بند برومبت (لا open) له برومبت بالـ١٤ لغة', () => {
  const { Q } = loadSuggestions();
  for (const s of Q) {
    for (const l of LANGS) assert.ok(s[l] && s[l].trim(), `${s.en}: تسمية ${l} ناقصة`);
    if (s.open) { assert.ok(!s.prompt, `${s.en}: اختصار أداة لا يحمل برومبت`); continue; }
    for (const l of LANGS) assert.ok(s.prompt[l] && s.prompt[l].trim(), `${s.en}: برومبت ${l} ناقص`);
  }
});

test('البوتات الثلاثة: كلّ برومبت يستعمل /api/search بكود لغته ويطلب الإجابة بلغته، والعربيّ محفوظ حرفيًّا', () => {
  const { Q } = loadSuggestions();
  for (const s of Q.filter(x => x.priority)) {
    for (const l of LANGS) {
      assert.match(s.prompt[l], /\/api\/search/, `${s.en}/${l}: بلا /api/search`);
      assert.match(s.prompt[l], new RegExp(`lang:"${l}"`), `${s.en}/${l}: كود اللغة غير مُمرَّر`);
    }
    assert.match(s.prompt.ar, /^أنشئ لي صفحة ويب واحدة/);
  }
});

test('اختصارات الأدوات الثلاثة تشير لأزرار موجودة فعلًا في index.html', () => {
  const { Q } = loadSuggestions();
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const opens = Q.filter(s => s.open).map(s => s.open);
  assert.equal(JSON.stringify(opens.sort()), JSON.stringify(['btnDesignAI','btnPortraitStyle','btnVideoMaker']));
  for (const id of opens) assert.ok(html.includes(`id="${id}"`), `${id} غير موجود في index.html`);
});

test('renderQuickChips يرتّب بـorder لا بطول النصّ، وrenderOmranBotChips لا يمسح الشرائح الثابتة', () => {
  const { src } = loadSuggestions();
  const rq = src.slice(src.indexOf('function renderQuickChips'), src.indexOf('function renderOmranBotChips'));
  assert.match(rq, /\.order\|\|99/);
  assert.doesNotMatch(rq, /\.length\s*-\s*\(QUICK_SUGGESTIONS/);
  const rb = src.slice(src.indexOf('function renderOmranBotChips'), src.indexOf('// v549'));
  assert.doesNotMatch(rb, /innerHTML\s*=\s*''/);
  assert.match(rb, /\.omChip\[data-bot\]/);
});
