// tests/fx-mukhawara.test.cjs — v-fx-mukhawara (المالك ١٨ أكتوبر: «اريد اضافة مخوره لبس»):
// نمط «مخورة إماراتية» للنساء في استوديو الأزياء — الخيار واسمه بلغات «جلابية» نفسها، وقائمة النساء، ووصف الخادم،
// و≥١٠٠ تصميم محتشم كلّها، وقفل الاحتشام دائمًا. صورة البطاقة تنتظر موافقة المالك (توليد) فتظهر بديلها القائم حتّى تصل.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const V = require('../api/_lib/fashion-variety.js');
const L = require('../api/_lib/fashion-locks.js');

test('١. الخيار في النافذة باسمه، وترجمته بلغات «جلابية» نفسها بلا اسم مزوّد', () => {
  const opt = '<option value="mukhawara" data-en="🪡 Emirati mukhawar">🪡 مخورة إماراتية</option>';
  const pc = read('js/partials-core.js');
  assert.ok(pc.includes(opt));
  assert.ok(pc.indexOf(opt) > pc.indexOf('<option value="jalabiya"') && pc.indexOf(opt) < pc.indexOf('</select>', pc.indexOf('id="fashionAiStyle"')), 'داخل سلكت الأنماط بعد الجلابية');
  const ctx = {};
  vm.runInNewContext(read('js/app-16-opt-xl.js').replace('window.__OPT_XL', 'this.X'), ctx);
  const mk = ctx.X['🪡 مخورة إماراتية'], jl = ctx.X['🌙 جلابية'];
  assert.ok(mk && jl);
  assert.deepEqual(Object.keys(mk).sort(), Object.keys(jl).sort(), 'اللغات نفسها');
  for (const [l, v] of Object.entries(mk)) {
    assert.ok(v.startsWith('🪡 ') && v.length > 4, l);
    assert.doesNotMatch(v, /gemini|gpt|openai|claude|flux|kimi/i, l);
  }
  assert.ok(Number((/\/js\/partials-core\.js\?v=(\d+)/.exec(read('index.html')) || [])[1]) >= 666, 'وسم partials-core رُفع');
});

test('٢. للنساء وحدهنّ في الواجهة ومولّد الصور، وبعد الجلابية', () => {
  const s = read('js/app-12-studios.js');
  const G = vm.runInNewContext('(' + s.match(/const GENDER_STYLES = (\{[\s\S]*?\n  \});/)[1] + ')');
  assert.equal(G.women[G.women.indexOf('jalabiya') + 1], 'mukhawara');
  assert.ok(!G.men.includes('mukhawara') && !G.kids.includes('mukhawara'));
  const th = read('scripts/fashion-thumbs.mjs');
  assert.ok(th.includes("'jalabiya', 'mukhawara', 'hijabchic'"), 'قائمة المولّد تطابق الواجهة');
  assert.ok(read('js/app.bundle.js').includes("'jalabiya', 'mukhawara', 'hijabchic'"), 'الحزمة مبنيّة');
});

test('٣. الخادم: وصف المخورة، و٢١٦ تصميمًا محتشمًا كلّها، وقفل الاحتشام دائمًا', () => {
  const fc = read('api/_lib/fashion-create.js');
  assert.match(fc, /  mukhawara: 'a traditional Emirati mukhawar dress: [^']*talli[^']*modest',/);
  assert.equal(V.designTotal('women', 'mukhawara', false), 216);
  assert.equal(V.designTotal('women', 'mukhawara', true), 216, 'لا خيار غير محتشم يسقط');
  assert.ok(!/!/.test(V.CATALOG.women.mukhawara), 'لا «!» في الكتالوج');
  assert.ok(L.MODEST_STYLES.includes('mukhawara') && L.needsModest({ style: 'mukhawara' }));
  const seen = new Set();
  for (let v = 0; v < 216; v++) {
    const d = V.designFor({ gender: 'women', style: 'mukhawara', variant: v, modest: true }).text;
    assert.match(d, /mukhawar/, 'كلّ تصميم مخورة');
    assert.doesNotMatch(d, /\b(red|green|blue|black|white|pink|purple|gold|golden|silver)\b/i, 'لا لون في التصميم — اللون للمستخدم أو اللوحة');
    seen.add(d);
  }
  assert.equal(seen.size, 216, 'لا يتكرّر تصميم حتّى تنفد');
});
