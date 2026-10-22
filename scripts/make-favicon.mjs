#!/usr/bin/env node
// v-favicon-gold: يولّد favicon.ico في الجذر بثلاثة مقاسات ١٦ و٣٢ و٤٨ — بلا أيّ اعتماديّة: فكّ PNG بـzlib،
// تصغير بمتوسّط المساحة في الضوء الخطّيّ، وكتابة كلّ مقاس صورةً BMP بعمق ٣٢ بت (الصيغة التي يقرؤها كلّ متصفّح وزاحف).
// المصدر icons/favicon-src.png (١٢٥٤×١٢٥٤): الأيقونة الذهبيّة gold-20260819 نفسها بعد تعديلها بمحرّر الصور في التطبيق
// بأمر المالك — نفس الشكل وكتابة Ai، أحدّ، والخلفيّة أسود #000000 مثل خلفيّة الدردشة بدل الكحلي. لا يُنشر (.vercelignore).
//   node scripts/make-favicon.mjs            → يكتب favicon.ico
//   node scripts/make-favicon.mjs --sheet x  → ويكتب أيضًا لوحة مكبّرة لكلّ مقاس (PNG) للمراجعة بالعين
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'icons/favicon-src.png');
const OUT = path.join(ROOT, 'favicon.ico');
const SIZES = [16, 32, 48];
// المالك (٢٢ أكتوبر، بعد اللوحة المكبّرة): مقاس ١٦ من الحلقة الذهبيّة وحدها — بلا الخلفيّة ولا كتابة Ai — ليقرأ في التبويب؛
// ٣٢ و٤٨ الأيقونة كاملة. القطع الناقص يحيط بالحافّة الخارجيّة للحلقة في المصدر ١٢٥٤ (Ai تبدأ تحته عند y≈880)، وما خارجه شفّاف.
const RING = { cx: 624, cy: 558, rx: 441, ry: 404 };

function decodePng(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig) throw new Error('ليس PNG');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (ctype !== 2 && ctype !== 6)) throw new Error(`صيغة PNG غير مدعومة: عمق ${depth} نوع ${ctype} تشابك ${interlace}`);
  const ch = ctype === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? px[(y - 1) * stride + x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * ch], g = px[i * ch + 1], bl = px[i * ch + 2];
    let al = ch === 4 ? px[i * ch + 3] : 255;
    if (ch === 3 && trns && trns.length >= 6 && r === trns.readUInt16BE(0) && g === trns.readUInt16BE(2) && bl === trns.readUInt16BE(4)) al = 0;
    rgba.set([r, g, bl, al], i * 4);
  }
  return { w, h, rgba };
}

const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));

// أوزان تغطية كسريّة: كلّ بكسل ناتج يأخذ متوسّط مساحة ما تحته من المصدر بالضبط (٥١٢/٤٨ ليس عددًا صحيحًا).
function weights(src, dst) {
  const s = src / dst, out = [];
  for (let o = 0; o < dst; o++) {
    const a = o * s, b = (o + 1) * s, list = [];
    for (let i = Math.floor(a); i < Math.ceil(b); i++) {
      const cov = Math.min(b, i + 1) - Math.max(a, i);
      if (cov > 1e-9) list.push([i, cov / s]);
    }
    out.push(list);
  }
  return out;
}

// تصغير في الضوء الخطّيّ مع ألفا مضروبة مسبقًا: الوهج الذهبيّ لا يبهت ولا يتّسخ الحدّ بلون الخلفيّة.
function resize(img, n) {
  const { w, h, rgba } = img;
  const lin = new Float64Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const al = rgba[i * 4 + 3] / 255;
    lin[i * 4] = toLin(rgba[i * 4]) * al; lin[i * 4 + 1] = toLin(rgba[i * 4 + 1]) * al; lin[i * 4 + 2] = toLin(rgba[i * 4 + 2]) * al; lin[i * 4 + 3] = al;
  }
  const wx = weights(w, n), wy = weights(h, n);
  const tmp = new Float64Array(n * h * 4);
  for (let y = 0; y < h; y++) for (let ox = 0; ox < n; ox++) for (const [x, k] of wx[ox]) for (let c = 0; c < 4; c++) tmp[(y * n + ox) * 4 + c] += lin[(y * w + x) * 4 + c] * k;
  const acc = new Float64Array(n * n * 4);
  for (let oy = 0; oy < n; oy++) for (const [y, k] of wy[oy]) for (let ox = 0; ox < n; ox++) for (let c = 0; c < 4; c++) acc[(oy * n + ox) * 4 + c] += tmp[(y * n + ox) * 4 + c] * k;
  const out = Buffer.alloc(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const al = acc[i * 4 + 3];
    out[i * 4 + 3] = Math.round(al * 255);
    for (let c = 0; c < 3; c++) out[i * 4 + c] = al > 0 ? toSrgb(acc[i * 4 + c] / al) : 0;
  }
  return { w: n, h: n, rgba: out };
}

// مربّع حول الحلقة، وكلّ بكسل خارج القطع الناقص شفّاف؛ التصغير بعده بمتوسّط المساحة ينعّم الحافّة وحده.
function ringOnly(img, { cx, cy, rx, ry }) {
  const side = 2 * rx, x0 = cx - rx, y0 = cy - rx;
  const rgba = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const sx = x0 + x, sy = y0 + y, d = (y * side + x) * 4;
    if (((sx + 0.5 - cx) / rx) ** 2 + ((sy + 0.5 - cy) / ry) ** 2 > 1) continue;
    img.rgba.copy(rgba, d, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
  }
  return { w: side, h: side, rgba };
}

// مدخل ICO بصيغة BMP: رأس BITMAPINFOHEADER (الارتفاع مضاعف: الصورة + قناع AND)، صفوف من الأسفل، BGRA، ثمّ قناع ١ بت.
function bmpEntry(img) {
  const { w, h, rgba } = img;
  const maskStride = Math.ceil(w / 32) * 4;
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0); head.writeInt32LE(w, 4); head.writeInt32LE(h * 2, 8);
  head.writeUInt16LE(1, 12); head.writeUInt16LE(32, 14); head.writeUInt32LE(0, 16);
  head.writeUInt32LE(w * h * 4 + maskStride * h, 20);
  const pix = Buffer.alloc(w * h * 4), mask = Buffer.alloc(maskStride * h);
  for (let y = 0; y < h; y++) {
    const row = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = (row * w + x) * 4;
      pix[d] = rgba[s + 2]; pix[d + 1] = rgba[s + 1]; pix[d + 2] = rgba[s]; pix[d + 3] = rgba[s + 3];
      if (rgba[s + 3] === 0) mask[row * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([head, pix, mask]);
}

function buildIco(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length), bodies = [];
  let offset = 6 + dir.length;
  images.forEach((img, i) => {
    const body = bmpEntry(img);
    dir[i * 16] = img.w & 255; dir[i * 16 + 1] = img.h & 255; dir[i * 16 + 2] = 0; dir[i * 16 + 3] = 0;
    dir.writeUInt16LE(1, i * 16 + 4); dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(body.length, i * 16 + 8); dir.writeUInt32LE(offset, i * 16 + 12);
    offset += body.length; bodies.push(body);
  });
  return Buffer.concat([head, dir, ...bodies]);
}

// PNG بسيط (RGBA) للوحة المراجعة فقط.
function encodePng({ w, h, rgba }) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// لوحة المراجعة: كلّ مقاس مكبّرًا بالجار الأقرب (بكسلاته كما هي) على خلفيّة فاتحة وأخرى داكنة كتبويب المتصفّح.
function sheet(images) {
  const scale = 10, pad = 24, cell = 48 * scale;
  const W = pad + images.length * (cell + pad), H = pad + 2 * (cell + pad);
  const rgba = Buffer.alloc(W * H * 4);
  const bgs = [[241, 243, 244], [32, 33, 36]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const bg = bgs[y < H / 2 ? 0 : 1]; rgba.set([...bg, 255], (y * W + x) * 4); }
  bgs.forEach((bg, r) => images.forEach((img, i) => {
    const k = Math.floor(cell / img.w), ox = pad + i * (cell + pad) + (cell - img.w * k) / 2, oy = pad + r * (cell + pad) + (cell - img.h * k) / 2;
    for (let y = 0; y < img.h * k; y++) for (let x = 0; x < img.w * k; x++) {
      const s = (Math.floor(y / k) * img.w + Math.floor(x / k)) * 4, a = img.rgba[s + 3] / 255, d = ((oy + y) * W + ox + x) * 4;
      for (let c = 0; c < 3; c++) rgba[d + c] = Math.round(img.rgba[s + c] * a + bg[c] * (1 - a));
    }
  }));
  return encodePng({ w: W, h: H, rgba });
}

const src = decodePng(fs.readFileSync(SRC));
const images = SIZES.map((n) => resize(n === 16 ? ringOnly(src, RING) : src, n));
fs.writeFileSync(OUT, buildIco(images));
console.log(`favicon.ico: ${fs.statSync(OUT).size} بايت — ${SIZES.join('/')} من ${path.relative(ROOT, SRC)} (${src.w}×${src.h})`);
const si = process.argv.indexOf('--sheet');
if (si > 0 && process.argv[si + 1]) {
  fs.writeFileSync(process.argv[si + 1], sheet(images));
  console.log(`اللوحة: ${process.argv[si + 1]}`);
}
