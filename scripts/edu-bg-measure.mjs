// scripts/edu-bg-measure.mjs — يقيس مستطيل «الشاشة الفاضية» في كلّ خلفيّة تعليم مولَّدة (assets/edu-bg/skin-<ثيم>-desktop|mobile.webp)
// ويكتب assets/edu-bg/meta.json: الأبعاد، كسور المستطيل (x0 y0 x1 y1 من 0 إلى 1)، ولون الشاشة المقيس. css/تعليم-خلفية.css يُبنى منه
// بـscripts/edu-bg-css.mjs — القياس من الصورة نفسها لا بالعين (درس v-edu-mock-bg: القياس على شبكة غير الأصل أخرج المسح من موضعه).
//
//   node scripts/edu-bg-measure.mjs [assets/edu-bg] [skin-x-desktop …]
// الطريقة: تصغير إلى ≤ ٥١٢ عرضًا، قناع «قريب من اللون السائد في وسط الصورة» (فرق ≤ ٢٨ لكلّ قناة بعد تنعيم ٣×٣)، ثمّ أكبر مستطيل
// محوريّ داخل القناع (خوارزميّة الهستوغرام)، ثمّ تضييقه ٠٫٨٪ من كلّ جهة حتّى لا يلامس الإطار. يرفض مستطيلًا أصغر من ٣٥٪ من المساحة.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const DIR = process.argv[2] || 'assets/edu-bg';
const ONLY = process.argv.slice(3);
const files = readdirSync(DIR).filter((f) => /^skin-[a-z]+-(desktop|mobile)\.webp$/.test(f) && (!ONLY.length || ONLY.includes(f.replace(/\.webp$/, '')))).sort();
const metaPath = DIR + '/meta.json';
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : { images: {} };
meta.images = meta.images || {};

function largestRect(mask, W, H) {
  // أكبر مستطيل من الآحاد — هستوغرام لكلّ صفّ ومكدّس
  const h = new Int32Array(W); let best = { area: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) h[x] = mask[y * W + x] ? h[x] + 1 : 0;
    const st = []; // [x, height]
    for (let x = 0; x <= W; x++) {
      const cur = x < W ? h[x] : 0; let start = x;
      while (st.length && st[st.length - 1][1] >= cur) {
        const [sx, sh] = st.pop(); const area = sh * (x - sx);
        if (area > best.area) best = { area, x0: sx, y0: y - sh + 1, x1: x, y1: y + 1 };
        start = sx;
      }
      st.push([start, cur]);
    }
  }
  return best;
}

for (const f of files) {
  const p = DIR + '/' + f;
  const img = sharp(p);
  const { width: FW, height: FH } = await img.metadata();
  const W = Math.min(512, FW), H = Math.round(FH * W / FW);
  const raw = await img.clone().resize(W, H, { kernel: 'lanczos3' }).blur(1.2).raw().toBuffer();
  // اللون السائد: متوسّط نافذة في وسط الصورة (الشاشة تغطّي الوسط في النسختين)
  const cx = Math.round(W * 0.62), cy = Math.round(H * 0.5), r = Math.round(Math.min(W, H) * 0.06);
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { const i = (y * W + x) * 3; sr += raw[i]; sg += raw[i + 1]; sb += raw[i + 2]; n++; }
  const ref = [sr / n, sg / n, sb / n];
  const TOL = 28;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const d = Math.max(Math.abs(raw[i * 3] - ref[0]), Math.abs(raw[i * 3 + 1] - ref[1]), Math.abs(raw[i * 3 + 2] - ref[2]));
    mask[i] = d <= TOL ? 1 : 0;
  }
  const b = largestRect(mask, W, H);
  const frac = b.area / (W * H);
  const pad = 0.008;
  const rect = { x0: +(b.x0 / W + pad).toFixed(4), y0: +(b.y0 / H + pad).toFixed(4), x1: +(b.x1 / W - pad).toFixed(4), y1: +(b.y1 / H - pad).toFixed(4) };
  const hex = '#' + ref.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const key = f.replace(/\.webp$/, '');
  const ok = frac >= 0.35;
  meta.images[key] = { w: FW, h: FH, rect, screen: hex, cover: +frac.toFixed(3), ok };
  console.log((ok ? '✓ ' : '✗ ') + key + ' ' + FW + '×' + FH + ' شاشة ' + Math.round(frac * 100) + '% ' + JSON.stringify(rect) + ' ' + hex);
}
writeFileSync(metaPath, JSON.stringify(meta, null, 1) + '\n');
console.log('كُتب ' + metaPath + ' (' + files.length + ' صورة)');
