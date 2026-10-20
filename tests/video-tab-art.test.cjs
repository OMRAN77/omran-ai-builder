// v-vmk-tab-art: تبويبات صانع الفيديو بصور مربّعة واحدة المقاس (240×240) من لوحة المالك، والاسم المترجم تحتها.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('bad jpeg ' + file);
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('no SOF ' + file);
}

test('صورة لكلّ قسم من التسعة بمقاس واحد ٣٢٠×٣٢٠', () => {
  const js = read('js/video.js');
  const tabs = JSON.parse(js.match(/var TABS=(\[[^\]]+\]);/)[1].replace(/'/g, '"'));
  assert.strictEqual(tabs.length, 9);
  for (const t of tabs) {
    const f = path.join(root, 'assets/videos/tabs', t + '.jpg');
    assert.ok(fs.existsSync(f), t + '.jpg');
    assert.deepStrictEqual(jpegSize(f), { w: 320, h: 320 }, t);
  }
});

test('التبويب صورة ثمّ اسم مترجم، والصفّ لا يُعصر في الشبكة ولا في عمود الجوّال', () => {
  const js = read('js/video.js');
  assert.match(js, /im\.src=TAB_ART\[v\]\|\|'\/assets\/videos\/tabs\/'\+v\+'\.jpg\?v=2'/);
  assert.match(js, /lb\.className='vmk-tab-lbl'; lb\.textContent=tabLabel\(v\)/);
  assert.match(js, /b\.appendChild\(im\); b\.appendChild\(lb\); tb\.appendChild\(b\);/);
  const css = read('css/modules.css');
  assert.ok(css.includes('#videoMakerModal .vmk-tab-img{display:block;width:80px;height:80px;object-fit:cover'));
  assert.ok(css.includes('#videoMakerModal .vmk-tab{display:flex;flex-direction:column;align-items:center'));
  /* الحاسوب: بلا تمرير (صفّ التمرير يصفّر الحدّ الأدنى لارتفاعه في شبكة ثابتة الارتفاع فيُعصر إلى ١٨ بكسل — ثبت بالمسبار) */
  const desktop = css.slice(css.indexOf('/* v-vmk-tab-art'), css.indexOf('@media (max-width:640px){#videoMakerModal .vmk-tabs{flex-wrap:nowrap'));
  assert.ok(!/overflow-x:auto/.test(desktop), 'لا تمرير أفقيّ على الحاسوب');
  assert.ok(css.includes('@media (max-width:640px){#videoMakerModal .vmk-tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;min-height:max-content;flex-shrink:0;width:100%}}'));
  const h = read('index.html');
  assert.ok(h.includes('src="/js/video.js?v=454"') && h.includes('modules.css?v=689'));
});
