'use strict';
/* v-gold-badge-polish (تدقيق ١٨–١٩ أكتوبر، g04): أربع ملاحظات على مرفقات صندوق الكتابة:
   - plus-attach: البطاقة الذهبيّة ترسم مستطيلًا داكنًا (background-color حتّى حافّة الإطار) خلف إطارها المستدير، و✕ الصورة يبرز ٦px
     في فجوة ٨px فيلامسه.
   - attach-text-file: سطر الحجم وعدد الأسطر (.gbSub) ارتفاعه صفر في الصندوق — يرث line-height:0 من غلاف .goldBadgeWrap.
   - attach-drag-drop: «Drop the image here» فوق نصّ الصندوق التوضيحيّ (الطبقة ٥٥٪ سواد فقط).
   - paste-attach: «1 lines» — الخريطة بصيغة الجمع وحدها.
   الدوالّ الحقيقيّة من js/app-09-attach.js في vm بـDOM مزيّف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const AST = acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'script' });
const decl = (name) => {
  const n = AST.body.find((x) => (x.type === 'FunctionDeclaration' && x.id && x.id.name === name)
    || (x.type === 'VariableDeclaration' && x.declarations.some((d) => d.id && d.id.name === name)));
  assert.ok(n, name);
  return SRC.slice(n.start, n.end);
};
const LANGS = ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];

function env(lg) {
  const styles = [];
  const mk = (tag) => ({ tagName: tag, id: '', className: '', textContent: '', children: [], classList: { add() {} }, appendChild(c) { this.children.push(c); return c; } });
  const sb = {
    String, Math, Blob, Intl, console, lang: lg,
    localStorage: { getItem: () => null },
    document: { getElementById: (id) => styles.find((s) => s.id === id) || null, createElement: mk, head: { appendChild: (s) => styles.push(s) } },
  };
  vm.createContext(sb);
  vm.runInContext([decl('OMRAN_BADGE_T'), decl('omranBadgeT'), SRC.includes('function omranBadgeOne(') ? decl('omranBadgeOne') : '',
    decl('omranGoldBadgeCss'), decl('omranGoldBadgeFill')].join('\n'), sb);
  return { sb, styles, mk };
}
const rule = (css, sel) => { const i = css.indexOf(sel + '{'); assert.ok(i >= 0, 'قاعدة ' + sel); return css.slice(i, css.indexOf('}', i) + 1); };

test('١. البطاقة الذهبيّة مستديرة (border-radius ≥ نصف ارتفاعها تقريبًا) فلا مستطيل داكن خلف الإطار، وشريحة الصورة لها فسحة لـ✕', () => {
  const { sb, styles } = env('en');
  sb.omranGoldBadgeCss();
  const css = styles[0].textContent;
  for (const sel of ['.goldBadge', '.file-chip.goldBadge']) {
    const r = rule(css, sel);
    const m = r.match(/border-radius:(\d+)px/);
    assert.ok(m && Number(m[1]) >= 30, sel + ': ' + r.slice(0, 80));
  }
  const img = rule(css, '.attach-chip.img');
  assert.ok(/margin-inline-end:(\d+)px/.test(img) && Number(img.match(/margin-inline-end:(\d+)px/)[1]) >= 4, img);
});

test('٢. سطر الحجم والأسطر له ارتفاع داخل غلاف الصندوق: line-height غير صفريّ على .gbSub', () => {
  const { sb, styles } = env('ar');
  sb.omranGoldBadgeCss();
  const css = styles[0].textContent;
  assert.ok(/\.goldBadgeWrap\{[^}]*line-height:0/.test(css), 'الغلاف ما زال line-height:0 (لزرّ ✕)');
  const sub = rule(css, '.goldBadge .gbSub');
  const lh = sub.match(/line-height:([\d.]+)/);
  assert.ok(lh && Number(lh[1]) > 0, sub);
});

test('٤. «1 line» لا «1 lines»: المفرد من Intl.PluralRules، والجمع لغيره، وكلمة المفرد بالـ١٤ لغة', () => {
  const sub = (lg, text) => {
    const { sb, mk } = env(lg);
    const chip = mk('div');
    sb.omranGoldBadgeFill(chip, { name: 'a.txt', text });
    return chip.children[0].children[1].textContent;
  };
  assert.ok(/1⁩ line$/.test(sub('en', 'x'.repeat(1200))), sub('en', 'x'.repeat(1200)));
  assert.ok(/2⁩ lines$/.test(sub('en', 'a\n' + 'x'.repeat(1200))));
  assert.ok(/1⁩ ligne$/.test(sub('fr', 'x'.repeat(1200))));
  assert.ok(/1⁩ строка$/.test(sub('ru', 'x'.repeat(1200))));
  assert.ok(/1⁩ سطر$/.test(sub('ar', 'x'.repeat(1200))), 'العربيّة كما هي');
  const { sb } = env('en');
  const T = vm.runInContext('OMRAN_BADGE_T', sb);
  for (const lg of LANGS) assert.ok(T.line && typeof T.line[lg] === 'string' && T.line[lg], 'line: ' + lg);
});
