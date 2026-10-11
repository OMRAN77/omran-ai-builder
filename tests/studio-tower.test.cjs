// v-studio-tower: لوحة برج الستايل أثناء التوليد — خمس لوحات بالتسلسل، صورة المستخدم في الدائرة، القطع تطفو، وتختفي مع النتيجة.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const js = read('js/app-13-stocks-init.js');

function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length) {
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('no SOF ' + file);
}
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('خمس لوحات ١٢٨٠×٦٩٩ ولكلّ واحدة لوحة قطع ١٥×٥٦', () => {
  for (let n = 1; n <= 5; n++) {
    assert.deepStrictEqual(jpegSize(path.join(root, 'assets/studio/tower', n + '.jpg')), { w: 1280, h: 699 }, n + '.jpg');
    assert.deepStrictEqual(pngSize(path.join(root, 'assets/studio/tower', n + '-items.png')), { w: 15 * 56, h: 56 }, n + '-items.png');
  }
});

test('التسلسل ١←٢←٣←٤←٥ ثمّ الأولى، محفوظ في الجهاز، بلا تخمين', () => {
  const block = js.slice(js.indexOf('function towerNext'), js.indexOf('function towerShow'));
  const store = {};
  const next = new Function('localStorage', '__swallow', 'TOWER_N', block + '; return towerNext;')(
    { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } }, () => {}, 5);
  assert.deepStrictEqual([next(), next(), next(), next(), next(), next(), next()], [1, 2, 3, 4, 5, 1, 2]);
  assert.strictEqual(store.studio_tower_idx, '2');
  assert.ok(!/Math\.random/.test(js.slice(js.indexOf('v-studio-tower'), js.indexOf('window.omranStudioTower'))), 'لا عشوائيّة');
});

test('تظهر مكان خانة «صورتك» عند «ولّد»، وتختفي في finally للمسارين، والصورة في الدائرة مصبوغة', () => {
  assert.match(js, /slots\.parentNode\.insertBefore\(el, slots\);\s*modal\.classList\.add\('studio-towering'\)/);
  assert.match(js, /setStatus\(t\('studioAiGenerating'\)\);\n[^\n]*\n\s*towerShow\(\);/);
  assert.match(js, /finally\{ btnGenerate\.disabled = false; towerHide\(\); \}/);
  assert.match(js, /btnGenerate\.disabled = false;\n\s*towerHide\(\);/);
  assert.match(js, /pi\.src = src; ph\.appendChild\(pi\)/);
  const css = read('css/modules.css');
  assert.ok(css.includes('#studioAiModal.studio-towering #studioAiSlots{display:none!important}'));
  assert.ok(css.includes('.stTowerPhoto span{position:absolute;inset:0;background:var(--tint,#fff);mix-blend-mode:color'));
  assert.ok(css.includes('animation:stTowerFloat') && css.includes('animation:stTowerRise'));
  assert.ok(/prefers-reduced-motion:reduce\)\{#studioAiModal \.stTower/.test(css), 'الحركة تُطفأ لمن طلب');
  assert.ok(read('index.html').includes('css/modules.css?v=678'));
});
