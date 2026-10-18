// tests/fx-mukhawara.test.cjs — v-fx-mukhawara (المالك ١٨ أكتوبر: «اريد اضافة مخوره لبس»، ثمّ صورة «هذا شكل المخوره»،
// ثمّ «في مليون فكره موجودة في المخاوير لا تخترع من عندك»): نمط «مخورة إماراتية» للنساء — الخيار واسمه بالـ١٤ لغة، وقائمة النساء،
// ووصف قصير يُبقي أقفال الحارس داخل ٨٠٠ حرف، و١٧٢٨ تصميمًا من خيارات موثّقة بمصادرها (الأوّل في كلّ محور صورة المالك)، محتشمة كلّها.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const V = require('../api/_lib/fashion-variety.js');
const L = require('../api/_lib/fashion-locks.js');
const LANGS12 = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

test('١. الخيار في النافذة باسمه، وترجمته في الجدولين (__OPT_XL و__BI) بالـ١٢ لغة بلا اسم مزوّد، ووسما الملفّين رُفعا', () => {
  const opt = '<option value="mukhawara" data-en="🪡 Emirati mukhawar">🪡 مخورة إماراتية</option>';
  const pc = read('js/partials-core.js');
  assert.ok(pc.includes(opt));
  assert.ok(pc.indexOf(opt) > pc.indexOf('<option value="jalabiya"') && pc.indexOf(opt) < pc.indexOf('</select>', pc.indexOf('id="fashionAiStyle"')), 'داخل سلكت الأنماط بعد الجلابية');
  const ctx = {};
  vm.runInNewContext(read('js/app-16-opt-xl.js').replace('window.__OPT_XL', 'this.X'), ctx);
  const mk = ctx.X['🪡 مخورة إماراتية'], jl = ctx.X['🌙 جلابية'];
  assert.ok(mk && jl);
  assert.deepEqual(Object.keys(mk).sort(), Object.keys(jl).sort(), 'اللغات نفسها');
  // بطاقة النمط ومعرضه وصفّ المقارنة تقرأ __BI عبر data-en (optLabel ← __bT) — كما للجلابية في كلّ ملفّ لغة
  for (const lg of LANGS12) {
    const line = read('i18n/' + lg + '.js').split('\n').find((l) => l.includes('"🪡 Emirati mukhawar":'));
    assert.ok(line, lg + ': بلا مدخل');
    assert.ok(line.includes('window.__BI["' + lg + '"]') && line.includes('"🌙 Jalabiya":'), lg + ': في سطر __BI نفسه مع الجلابية');
    const v = JSON.parse(line.match(/"🪡 Emirati mukhawar":("(?:[^"\\]|\\.)*")/)[1]);
    assert.ok(v.startsWith('🪡 ') && v.length > 4 && v !== '🪡 Emirati mukhawar', lg + ': ' + v);
  }
  for (const v of Object.values(mk)) assert.doesNotMatch(v, /gemini|gpt|openai|claude|flux|kimi/i);
  assert.ok(Number((/\/js\/partials-core\.js\?v=(\d+)/.exec(read('index.html')) || [])[1]) >= 666, 'وسم partials-core');
  assert.ok(Number((/'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/.exec(read('js/app-04-i18n-state.js')) || [])[1]) >= 751, 'وسم ملفّات اللغات');
});

test('٢. للنساء وحدهنّ في الواجهة ومولّد الصور بعد الجلابية، وصورة البطاقة على صورة المالك، وبطاقة النمط لا تنكمش بلا صورة', () => {
  const s = read('js/app-12-studios.js');
  const G = vm.runInNewContext('(' + s.match(/const GENDER_STYLES = (\{[\s\S]*?\n  \});/)[1] + ')');
  assert.equal(G.women[G.women.indexOf('jalabiya') + 1], 'mukhawara');
  assert.ok(!G.men.includes('mukhawara') && !G.kids.includes('mukhawara'));
  const th = read('scripts/thumbs-paid.mjs');
  assert.match(th, /const CARD_DESC = \{ women: \{ mukhawara: 'a traditional Emirati mukhawar: [^']*stand collar opening into a V[^']*small buttons[^']*printed floral[^']*modest' \} \};/);
  assert.ok(th.includes("(((CARD_DESC[g] || {})[v]) || desc)"), 'الوصف الأغنى للبطاقة وحدها');
  assert.ok(read('scripts/fashion-thumbs.mjs').includes("'jalabiya', 'mukhawara', 'hijabchic'"));
  // الصورة داخل صندوق ثابت بتدرّجه: إزالتها عند غيابها لا تغيّر ارتفاع البطاقة
  const rs = s.slice(s.indexOf('  function renderStyleCards(){'), s.indexOf('  renderStyleCards();\n'));
  assert.match(rs, /thumb\.style\.cssText = 'width:44px; height:58px; border-radius:8px; overflow:hidden; background:linear-gradient\(160deg,#23232a,#101014\); flex:none;';/);
  assert.match(rs, /thumb\.appendChild\(img\);/);
  assert.match(rs, /trig\.appendChild\(thumb\); trig\.appendChild\(info\); trig\.appendChild\(all\);/);
  const b = read('js/app.bundle.js');
  assert.ok(b.includes("'jalabiya', 'mukhawara', 'hijabchic'") && b.includes('thumb.appendChild(img);'), 'الحزمة مبنيّة');
});

test('٣. ١٧٢٨ تصميمًا محتشمًا كلّها، كلّ خيار موثّق بمصدر (أو صورة المالك)، بلا لون ولا شفّاف بلا بطانة ولا تكرار', () => {
  const axes = V.axesFor('women', 'mukhawara', true);
  assert.deepEqual(axes.map((a) => a.length), [12, 12, 12]);
  assert.equal(V.designTotal('women', 'mukhawara', false), 1728);
  assert.equal(V.designTotal('women', 'mukhawara', true), 1728, 'لا خيار غير محتشم يسقط');
  assert.ok(!/!/.test(V.CATALOG.women.mukhawara), 'لا «!» في الكتالوج');
  assert.ok(L.MODEST_STYLES.includes('mukhawara') && L.needsModest({ style: 'mukhawara' }));
  assert.equal(axes[0][0], 'a flowing floor-length A-line mukhawar', 'صورة المالك أوّلًا');
  const src = read('knowledge/mukhawar-sources.md');
  for (const ax of axes) {
    assert.equal(new Set(ax).size, ax.length, 'لا تكرار');
    for (const o of ax) {
      assert.doesNotMatch(o, /\b(red|green|blue|black|white|pink|purple|gold|golden|silver|teal|rainbow)\b/i, 'لون: ' + o);
      assert.doesNotMatch(o, /\b(voile|backless|slit at the thigh|cut-?out|sleeveless|short sleeves?|mini)\b/i, 'غير محتشم: ' + o);
      if (/\b(sheer|chiffon|tulle|organza)\b/i.test(o)) assert.match(o, /lining|inner dress/i, 'شفّاف بلا بطانة: ' + o);
      const line = src.split('\n').find((l) => l.startsWith('- ' + o + ' — '));
      assert.ok(line, 'بلا سطر مصدر: ' + o);
      assert.ok(/https?:\/\//.test(line) || /صورة المالك المرجعيّة/.test(line), 'بلا مصدر: ' + o);
      assert.doesNotMatch(line, /javasxript/);
    }
  }
  assert.ok(axes[0].every((o) => /mukhawar/.test(o)), 'كلّ قصّة مخورة');
});

test('٤. حدّ الحارس: الوصف + التصميم + قفلا العدالة والاحتشام (المقارنة) أو المجمّع والاحتشام داخل ٨٠٠ حرف في كلّ التصاميم', () => {
  const sd = read('api/_lib/fashion-create.js').match(/  mukhawara: '([^']*)',/)[1];
  assert.match(sd, /mukhawar/); assert.match(sd, /talli/); assert.match(sd, /modest/);
  const single = 'Output a single photorealistic image.';
  const coll = 'Output a single image laid out as a clean 3-panel collage side by side showing the SAME outfit and person from three angles: front view, side view, and back view.';
  assert.ok(read('api/_lib/fashion-create.js').includes(' ' + single + "'") && read('api/_lib/fashion-create.js').includes(' ' + coll + "'"), 'نصّا البند كما في الخادم');
  const lockA = (L.FAIRNESS_LOCK + L.MODEST_LOCK).trim(), lockB = L.MODEST_LOCK.trim();
  const seen = new Set();
  for (let v = 0; v < 1728; v++) {
    const d = V.designFor({ gender: 'women', style: 'mukhawara', variant: v, modest: true }).text;
    seen.add(d);
    assert.ok([sd, d, single, lockA].join(' ').length <= 800, 'المقارنة تقصّ القفل: ' + v);
    assert.ok([sd, d, coll, lockB].join(' ').length <= 800, 'المجمّع يقصّ القفل: ' + v);
  }
  assert.equal(seen.size, 1728, 'لا يتكرّر تصميم حتّى تنفد');
});
