// tests/sharp-assets.test.cjs — v-sharp (المالك ١٦ أكتوبر: «الصور بعدها مغبّشة»؛ فحص الغباش الشامل): المصغّرات ٣٦٠ بكسل
// يكبّرها الجوّال ١٫٤ مرّة (والإكسسوارات ٢ والأدوات ١٫٨)، فوُضّحت مرّة واحدة بـReal-ESRGAN x4 على المعالج (scripts/sr، بلا مفتاح
// ولا رصيد) إلى المقاس الذي تحتاجه الشاشة. والصورة بالاسم نفسه لا تصل المستخدم بلا وسم (العامل الخدميّ + max-age يوم).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ls = (dir, re) => fs.readdirSync(path.join(root, dir)).filter((n) => re.test(n)).map((n) => dir + '/' + n);
function dims(rel) {
  const b = fs.readFileSync(path.join(root, rel));
  if (b.toString('ascii', 0, 4) === 'RIFF') {
    const c = b.toString('ascii', 12, 16);
    if (c === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
    if (c === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (c === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}

test('١. المصغّرات بالمقاس الذي يحتاجه الجوّال (لا ٣٦٠ ممطوطة)', () => {
  const sets = [
    [ls('assets/design/styles', /\.webp$/).concat(ls('assets/design/opts', /^place-.*\.webp$/)), 540],
    [['women', 'men', 'kids', 'occasion', 'season', 'category'].flatMap((d) => ls('assets/fashion/looks/' + d, /\.webp$/)), 540],
    [ls('assets/studio/options', /\.webp$/), 540],
    [ls('assets/portrait/styles', /\.webp$/).concat(['assets/portrait/before.webp']), 540],
    [ls('assets/fashion/looks/extras', /\.webp$/), 1080],
  ];
  let n = 0;
  for (const [files, w] of sets) {
    assert.ok(files.length > 0);
    for (const f of files) { const d = dims(f); assert.ok(d, 'مقاس مقروء: ' + f); assert.equal(d[0], w, f + ' ' + d.join('×')); n++; }
  }
  assert.ok(n >= 345, 'كلّ المجموعات: ' + n); // ٣٤٩ يوم التوضيح
});

test('٢. كلّ رابط إلى صورة موضَّحة يحمل وسمًا يكسر الكاش', () => {
  // الوسم يُقرأ ولا يُثبَّت (سقّاطة vPinTests): كلّ رابط يحمل ?v= برقم ≥ ٢ (الرقم الأوّل بعد التوضيح).
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = (src, lit) => { const m = new RegExp(esc(lit) + '\\?v=(\\d+)').exec(src); return m ? Number(m[1]) : 0; };
  const sels = read('js/design-sels.js');
  assert.ok(tag(sels, "return 'assets/design/styles/'+v+'.webp") >= 2 && tag(sels, ".toLowerCase()+'-'+v+'.webp") >= 2, 'الأنماط والأماكن');
  const studios = read('js/app-12-studios.js');
  assert.match(studios, /const PSTYLE_IMG_V = '(\d+)';/); assert.ok(Number(studios.match(/const PSTYLE_IMG_V = '(\d+)';/)[1]) >= 16);
  for (const s of ["'assets/portrait/before.webp", "'assets/fashion/looks/' + gender + '/' + value + '.webp", "'assets/fashion/looks/' + g + '/' + v + '.webp", "'assets/design/styles/' + v + '.webp"]) assert.ok(tag(studios, s) >= 2, s);
  assert.ok(!/'assets\/portrait\/before\.webp'/.test(studios), 'لا رابط بلا وسم');
  assert.ok(tag(read('js/app-13-stocks-init.js'), "const asset = 'assets/studio/options/' + f + '-' + v + '.webp") >= 2, 'خيارات الاستوديو');
  const gen = read('js/design-gen.js');
  const looks = [...gen.matchAll(/\.webp\?v=(\d+)'/g)];
  assert.ok(looks.length === 4 && looks.every((m) => Number(m[1]) >= 2), 'روابط الأزياء الأربعة');
  assert.ok(!/LOOKS\+[^;]*\.webp'(?!\?)/.test(gen.replace(/\.webp\?v=\d+'/g, '')), 'لا رابط أزياء بلا وسم');
  const html = read('index.html');
  assert.ok(tag(html, '/js/design-gen.js') >= 611, 'وسم design-gen المنفصل');
});

test('٣. أداة التوضيح: الأوزان مثبّتة ببصمتها، والمجموعات تطابق ما على القرص، ولا torch', () => {
  const wf = read('.github/workflows/design-thumbs-free.yml');
  assert.ok(wf.includes('4fa0d38905f75ac06eb49a7951b426670021be3018265fd191d2125df9d682f1  x4plus.pth" | sha256sum -c -'), 'بصمة RealESRGAN_x4plus');
  assert.match(wf, /sharpen:\n\s+if: \$\{\{ startsWith\(inputs\.mode, 'sr:'\) \}\}/);
  assert.match(wf, /thumbs:\n\s+if: \$\{\{ !startsWith\(inputs\.mode, 'sr:'\) \}\}/);
  assert.ok(wf.includes('MODE: ${{ inputs.mode }}      # عبر البيئة لا داخل السطر'), 'لا حقن أوامر');
  // مراجعة نقض: سطر ملخّص المهمّة كان يضع الوضع (نصّ حرّ) خامًا في run:، وحزم التوضيح بلا إصدار ورمز الدفع محفوظ في .git/config.
  const modeLines = wf.split('\n').filter((l) => l.includes('inputs.mode'));
  assert.ok(modeLines.length >= 5 && modeLines.every((l) => /^\s*(MODE:|group:|if:)/.test(l)), 'الوضع لا يدخل سطر أوامر: ' + modeLines.filter((l) => !/^\s*(MODE:|group:|if:)/.test(l)).join(' | '));
  assert.match(wf, /pip install --quiet --only-binary=:all: onnxruntime==\d+\.\d+\.\d+ onnx==\d+\.\d+\.\d+ numpy==\d+\.\d+\.\d+ pillow==\d+\.\d+\.\d+/, 'حزم مثبّتة الإصدار وعجلات فقط');
  const sh = read('scripts/sr/sharpen.py');
  assert.ok(sh.includes('if not 1 <= k <= n:') && sh.includes('if not fs:') && sh.includes("if name not in SETS or name == '_':"), 'الوضع الخاطئ يفشل برسالة لا بتتبّع خام');
  const sets = JSON.parse(read('scripts/sr/sets.json'));
  for (const k of ['decor', 'fashion', 'extras', 'studio', 'portrait', 'scenes', 'decoropts']) assert.ok(sets[k] && sets[k].globs.length, k);
  // بطاقات الأدوات مستثناة عمدًا: v-gpu-lite (600×360 ≤ 0.9 م.ب مفكوكة) — الأكبر يرسم مستطيلات سوداء في WebView أندرويد.
  assert.ok(!sets.tools && !Object.values(sets).some((x) => x && x.globs && x.globs.some((g) => g.includes('tool-cards'))), 'لا توضيح لبطاقات الأدوات');
  const conv = read('scripts/sr/pth2onnx.py');
  assert.ok(conv.includes("raise pickle.UnpicklingError") && !/import torch/.test(conv), 'مفكّك مقيّد بلا torch');
});
