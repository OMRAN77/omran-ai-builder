// v-light-imgs + v-picker-wide: صور حقيقيّة للإضاءة الأربع ذات الأسماء نفسها، بطاقة أفقيّة على الحاسوب، والجوّال كما كان.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sels = fs.readFileSync(path.join(root, 'js/design-sels.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/app-05-ui.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js/partials-core.js'), 'utf8');

test('١. لكلّ خيار إضاءة بالاسم نفسه صورته، و«بدون تغيير» بلا صورة', () => {
  const sel = core.slice(core.indexOf('id="designAiLighting"'), core.indexOf('</select>', core.indexOf('id="designAiLighting"')));
  const vals = [...sel.matchAll(/value="([^"]*)"/g)].map(m => m[1]);
  assert.deepStrictEqual(vals, ['', 'warm', 'cool', 'bright', 'dim']);
  for (const v of vals.slice(1)) {
    const st = fs.statSync(path.join(root, 'assets/design/opts/lighting-' + v + '.webp'));
    assert.ok(st.size > 4000 && st.size < 120000, 'حجم معقول: ' + v);
  }
  assert.ok(sels.includes("'assets/design/opts/'+id.replace('designAi','').toLowerCase()+'-'+v+'.webp'"), 'المسار من اسم القائمة والقيمة');
});

test('٢. معرض الإضاءة وحده بنسبة ١٦/٩ وعمود أعرض', () => {
  assert.ok(sels.includes('var WIDE={designAiLighting:1};'));
  assert.ok(sels.includes("aspect: WIDE[s.id] ? '16/9' : undefined, minCol: WIDE[s.id] ? 240 : undefined"));
});

test('٣. المعرض: النسبة من cfg وإلّا ٣/٤، والعمود الأعرض للحاسوب وحده', () => {
  assert.ok(ui.includes("'position:relative;aspect-ratio:' + (cfg.aspect || '3/4') + ';"));
  assert.ok(ui.includes("((!document.documentElement.classList.contains('mobile-ui') && Number(cfg.minCol)) || 150)"));
});
