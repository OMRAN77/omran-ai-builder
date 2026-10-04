#!/usr/bin/env node
// scripts/ثيمات.mjs — خامات الثيمات الثلاثة عشر بعد «خشبي» (v-themes، أمر المالك ٤ أكتوبر: «كمّل الثيمات الباقية» على التصميم الجديد).
//   node scripts/ثيمات.mjs <مجلّد صور المالك>   ← يقصّ مشاهده (والسيارة المتوهّجة) وينظّفها ويرسم الخامات في assets/ثيمات/<ثيم>/
//   node scripts/ثيمات.mjs --مصغّرات            ← مصغّر كلّ ثيم (٣٦٠ عرضًا) من لقطة التطبيق نفسه بالثيم
// المشاهد من صور المالك نفسها: الغروب والشاطئ والشتاء (فيها مربّعات واجهة مرسومة — تُمسح بتعبئة من النسيج المحيط)،
// والترحيب الأربعة (كراج، أنمي، أمن سيبرانيّ، فصل) من صورته المربّعة بلا الكتابة. الباقي مرسوم إجرائيًّا هنا بلا صور خارجيّة،
// والزينة SVG مكتوبة باليد في assets/ثيمات/ (زهور-ذهبية، برمجة/شبكة، أطفال/أحجية، طهي/أدوات).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = path.join(ROOT, 'assets', 'ثيمات');
const req = createRequire(import.meta.url);
let pwMod = null;
for (const c of ['playwright', 'playwright-core']) { try { pwMod = await import(pathToFileURL(req.resolve(c)).href); break; } catch (e) { /* التالي */ } }
if (!pwMod) throw new Error('playwright غير موجود');
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

function save(dir, name, dataUrl) {
  const d = path.join(BASE, dir); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, name), Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  console.log(dir + '/' + name, Math.round(fs.statSync(path.join(d, name)).size / 1024) + 'KB');
}
const img64 = (f) => 'data:' + (f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg') + ';base64,' + fs.readFileSync(f).toString('base64');

// ── المعرّفات: [معرّف الثيم، مجلّده] ──
const THEMES = [['darkwood', 'خشب-داكن'], ['marble', 'رخام'], ['code', 'برمجة'], ['cars', 'مركبات'], ['kids', 'أطفال'], ['cuisine', 'طهي'],
  ['sunset', 'غروب'], ['beach', 'شاطئ'], ['winter', 'شتاء'], ['garage', 'كراج'], ['anime', 'أنمي'], ['cyber', 'أمن-سيبراني'], ['school', 'فصل']];

if (process.argv.includes('--مصغّرات')) {
  const only = process.argv.slice(process.argv.indexOf('--مصغّرات') + 1);
  for (const [id, dir] of THEMES) {
    if (only.length && !only.includes(id)) continue;
    const tmp = path.join(BASE, dir, '.shot');
    execFileSync('node', [path.join(ROOT, 'scripts', 'ui-shot.mjs'), '--out', tmp, '--user', 'omran', '--desktop', '--name', 't', '--viewport', '1440x900',
      '--eval', "(()=>{ const n=Date.now(); state.projects=['تطبيق مهام','صورة شخصيّة','فيديو قصير','موقع مطعم','خطّة دراسة','مشروع جديد'].map((t,i)=>({id:'p_'+(n-i*6e4),title:t,provider:'openai',messages:[]})); window.__renderHistSig=null; renderHistory(); window.خلفيات.طبّق(window.خلفيات.ثيم('" + dir + "'), false); })()", '--settle', '1800'], { stdio: 'ignore' });
    const url = await page.evaluate(async (src) => {
      const im = new Image(); im.src = src; await im.decode();
      const c = document.getElementById('c'); c.width = 360; c.height = Math.round(im.height * 360 / im.width);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.82);
    }, img64(path.join(tmp, 't.png')));
    save(dir, 'مصغّر.jpg', url);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  await browser.close();
  process.exit(0);
}

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) throw new Error('مرّر مجلّد صور المالك (20.webp غروب، 23.webp شاطئ، 24.webp شتاء، 17.webp الترحيب)');

// ضجيج قابل للتبليط + fbm للخامات، و«تعبئة موجَّهة» للمشاهد (التحرير بمجال التدرّج — Poisson): داخل المربّع المرسوم يُنسخ نسيج
// منطقة سليمة تُختار لكلّ مشهد (انعكاس السعفة حول جذعها، أو السماء المنعكسة فوق حافّة المربّع، أو طبقة الشجرة التي تحته)،
// ثمّ تُحلّ معادلة بواسون فتُطابق ألوانُ الحوافّ ما حولها بلا خطّ. المحاولتان قبلها (رقعة رقعة من الحافّة، وتعبئة لابلاس الناعمة)
// تركتا شريطًا ظاهرًا مكان المربّع.
await page.addScriptTag({ content: `
function hash(x, y, s){ let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, px, py, s){ const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const w = (t) => t * t * (3 - 2 * t);
  const g = (a, b) => hash(((a % px) + px) % px, ((b % py) + py) % py, s); const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
  const u = w(xf), v = w(yf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, px, py, s, oct){ let t = 0, amp = 0.5, f = 1, n = 0; for(let i = 0; i < oct; i++){ t += amp * vnoise(x * f, y * f, px * f, py * f, s + i); n += amp; amp *= 0.5; f *= 2; } return t / n; }
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function paint(w, h, fn){ const c = document.getElementById('c'); c.width = w; c.height = h; const x = c.getContext('2d'); const im = x.createImageData(w, h);
  for(let j = 0; j < h; j++) for(let i = 0; i < w; i++){ const p = fn(i, j); const k = (j * w + i) * 4; im.data[k] = p[0]; im.data[k + 1] = p[1]; im.data[k + 2] = p[2]; im.data[k + 3] = p.length > 3 ? p[3] : 255; }
  x.putImageData(im, 0, 0); return c; }
// guide(x, y) ← [sx, sy] أو [[sx, sy, وزن], …]: من أين يُؤخذ نسيج كلّ بكسل داخل الثقوب. يُعيد عدد العيّنات التي وقعت في ثقب (يجب ٠).
function guidedFill(d, W, H, holes, guide, forbid){
  const M = new Int32Array(W * H).fill(-1); const P = [];
  for(const [x0, y0, x1, y1] of holes) for(let y = Math.max(1, y0); y < Math.min(H - 1, y1); y++) for(let x = Math.max(1, x0); x < Math.min(W - 1, x1); x++){ const i = y * W + x; if(M[i] < 0){ M[i] = P.length; P.push(i); } }
  const inHole = (x, y) => (forbid || holes).some(([a, b, e, f]) => x >= a && x < e && y >= b && y < f);
  const src = d.slice(); const n = P.length; let bad = 0;
  const bil = (sx, sy, c) => { sx = Math.max(0, Math.min(W - 1.001, sx)); sy = Math.max(0, Math.min(H - 1.001, sy)); const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, k = (y0 * W + x0) * 4 + c;
    return (src[k] * (1 - fx) + src[k + 4] * fx) * (1 - fy) + (src[k + W * 4] * (1 - fx) + src[k + W * 4 + 4] * fx) * fy; };
  const G = (x, y) => { let r = guide(x, y); if(typeof r[0] === 'number') r = [[r[0], r[1], 1]]; const v = [0, 0, 0];
    for(const [sx, sy, w] of r){ if(w <= 0) continue; for(let c = 0; c < 3; c++) v[c] += w * bil(sx, sy, c); } return v; };
  const F = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], B = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], N = new Int32Array(n * 4);
  const off = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for(let k = 0; k < n; k++){ const x = P[k] % W, y = (P[k] / W) | 0; const gp = G(x, y);
    let r = guide(x, y); if(typeof r[0] === 'number') r = [[r[0], r[1], 1]]; for(const [sx, sy, w] of r) if(w > 0 && inHole(Math.round(sx), Math.round(sy))){ bad++; break; }
    for(let c = 0; c < 3; c++) F[c][k] = gp[c];
    off.forEach(([dx, dy], j) => { const q = (y + dy) * W + x + dx; N[k * 4 + j] = M[q]; const gq = G(x + dx, y + dy);
      for(let c = 0; c < 3; c++){ B[c][k] += gp[c] - gq[c]; if(M[q] < 0) B[c][k] += d[q * 4 + c]; } }); }
  for(let c = 0; c < 3; c++){ const f = F[c], b = B[c];
    for(let it = 0; it < 2500; it++) for(let k = 0; k < n; k++){ let s = b[k]; for(let j = 0; j < 4; j++){ const m = N[k * 4 + j]; if(m >= 0) s += f[m]; } f[k] += 1.9 * (s / 4 - f[k]); } }
  for(let k = 0; k < n; k++) for(let c = 0; c < 3; c++) d[P[k] * 4 + c] = Math.max(0, Math.min(255, Math.round(F[c][k])));
  return bad;
}
// passes: [[ثقوب، نصّ دالّة التوجيه]] بإحداثيّات الصورة الأصليّة، تُنفَّذ بالترتيب ثمّ يُقصّ المشهد ويُكبَّر
async function scene(src, crop, passes, outW, q){ const im = new Image(); im.src = src; await im.decode();
  const W = im.width, H = im.height; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  if(passes.length){ const id = x.getImageData(0, 0, W, H); const all = passes.flatMap((p) => p[0]); let left = all.slice();
    for(const [holes, g] of passes){ const bad = guidedFill(id.data, W, H, holes, (0, eval)(g), left); left = left.filter((h) => !holes.includes(h)); if(bad) console.log('عيّنات من داخل ثقب: ' + bad); }
    x.putImageData(id, 0, 0); }
  const [cx, cy, cw, ch] = crop; const o = document.createElement('canvas'); o.width = outW; o.height = Math.round(ch * outW / cw); const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high';
  ox.drawImage(c, cx, cy, cw, ch, 0, 0, o.width, o.height);
  return o.toDataURL('image/jpeg', q || 0.8); }
` });
page.on('console', (m) => console.log('  ' + m.text()));

// ── المشاهد من صور المالك ──
const S = (f) => img64(path.join(SRC, f));
const مشهد = (dir, file, crop, passes, q, outW, name) => page.evaluate(([s, c, p, qq, w]) => scene(s, c, p, w, qq), [S(file), crop, passes, q, outW || 1600]).then((u) => save(dir, name || 'مشهد.jpg', u));
// الغروب (يُقصّ قبل أغلب السعفة اليمنى — أطرافها خلف زجاج القائمة): زرّ «…» فوق السعف يُملأ من السعف الذي فوقه منعكسًا (مضغوطًا كي لا يبلغ دائرة الحساب)، ثمّ الفقاعة من السماء والسعف فوقها منعكسَين (مضغوطة ٠٫٨٢ عموديًّا كي لا تبلغ شريط الألسنة)
await مشهد('غروب', '20.webp', [0, 50, 1000, 605], [
  [[[978, 74, 1046, 132]], '(x, y) => [x, 73 - (y - 74) * 0.5]'],
  [[[614, 148, 1040, 268]], '(x, y) => [x, 147 - (y - 148) * 0.82]'],
]);
// الشاطئ: السعفة شبه متناظرة حول جذعها (x≈540) — يُعكس نصفها الأيسر مكان الفقاعة وزرّ الحساب والنقاط الثلاث
await مشهد('شاطئ', '23.webp', [0, 58, 1026, 590], [
  [[[594, 152, 1014, 270], [950, 76, 1012, 138], [916, 268, 1010, 292]], '(x, y) => [1080 - x, y]'],
]);
// الشتاء: أيقونات الحافّة أوّلًا (من السماء يسارها ومن الضباب تحتها)، ثمّ اللوحة الداكنة: الشجرة من طبقتها التي تحتها (أعرض فتُضغط أفقيًّا
// حول الجذع x≈668)، والسماء يمينها منعكسة فوق حافّة اللوحة، ومزج بينهما ٣٠px
await مشهد('شتاء', '24.webp', [0, 62, 1014, 578], [
  [[[938, 80, 998, 152]], '(x, y) => [x - 64, y]'],
  [[[910, 264, 996, 294]], '(x, y) => [x, y + 32]'],
  [[[588, 152, 998, 268]], `(x, y) => { const t = (y - 152) / 116, c = 668, k = 1.45 - 0.15 * t, hw = 65 + 55 * t;
    const w = x <= c ? 1 : 1 - smooth(hw, hw + 30, x - c); return [[c + (x - c) * k, y + 117, w], [x, Math.max(26, 303 - y), 1 - w]]; }`],
]);
// الترحيب: أرباع الصورة بلا إطاراتها
for (const [dir, crop] of [['كراج', [4, 4, 626, 406]], ['أنمي', [652, 4, 624, 406]], ['أمن-سيبراني', [4, 432, 626, 417]], ['فصل', [652, 432, 624, 417]]]) {
  await مشهد(dir, '17.webp', crop, [], 0.82);
}

// السيارة المتوهّجة من صورة المالك الرباعيّة (الربع الأعلى الأيمن، شاشة ثيم السيارات — أمره بالصورة: «وهذي بعد»): ضعفا حجمها
await مشهد('مركبات', '19.webp', [906, 123, 300, 176], [], 0.88, 600, 'سيارة.jpg');

// ── الخامات المرسومة ──
async function draw(dir, name, body, type, q){
  const url = await page.evaluate(([b, t, qq]) => { const c = (new Function(b))(); return c.toDataURL(t, qq); }, [body, type || 'image/jpeg', q || 0.84]);
  save(dir, name, url);
}

// خشب داكن: عروق عموديّة (المحادثة)، ولوح أفقيّ داكن (المشاريع)، وجلد أسود (المعاينة)
await draw('خشب-داكن', 'خشب.jpg', `return paint(512, 1024, (i, j) => { const w = fbm(i / 30, j / 260, 17, 4, 5, 4) * 8; const ring = 0.5 + 0.5 * Math.sin(i / 3.1 + w);
  const st = fbm(i / 0.9, j / 40, 569, 26, 9, 2); const t = Math.min(1, 0.45 * Math.pow(ring, 2.5) + 0.35 * st + 0.2 * fbm(i / 60, j / 90, 9, 12, 3, 3));
  return [mix(70, 30, t), mix(48, 20, t), mix(32, 13, t)]; });`);
await draw('خشب-داكن', 'لوح.jpg', `return paint(640, 120, (i, j) => { const w = fbm(i / 200, j / 30, 3, 4, 21, 4) * 7; const ring = 0.5 + 0.5 * Math.sin(j / 3 + w);
  const st = fbm(i / 40, j / 0.8, 16, 150, 23, 2); const t = Math.min(1, 0.45 * Math.pow(ring, 2.5) + 0.35 * st + 0.2 * fbm(i / 50, j / 20, 13, 6, 25, 3));
  return [mix(92, 42, t), mix(62, 27, t), mix(40, 16, t)]; });`);
await draw('خشب-داكن', 'جلد.jpg', `return paint(256, 256, (i, j) => { const n = fbm(i / 9, j / 9, 28, 28, 31, 4); const cr = Math.abs(fbm(i / 22, j / 22, 11, 11, 33, 3) - 0.5) < 0.012 ? 0.5 : 0;
  const t = Math.min(1, n * 0.9 + cr); return [mix(30, 14, t), mix(28, 13, t), mix(30, 15, t)]; });`);
// رخام أسود بعروق ذهبيّة رفيعة متفرّقة (تشقّقات بعرض ثابت: بُعد خطّ المنتصف ÷ تدرّج الضجيج)، ومعدن مصقول داكن
await draw('رخام', 'رخام.jpg', `return paint(1200, 800, (i, j) => { const wx = fbm(i / 220, j / 220, 6, 4, 49, 3) * 60;
  const D = (s, sx, sy, oc, k) => { const f = (x, y) => { const u = x * 0.8 + y * 0.6 + wx * k, v = -x * 0.6 + y * 0.8; return fbm(u / sx, v / sy, 64, 64, s, oc); };
    const a = f(i, j); return Math.abs(a - 0.5) / (Math.hypot(f(i + 1, j) - a, f(i, j + 1) - a) + 1e-6); };
  const m = smooth(0.42, 0.62, fbm(i / 260, j / 260, 5, 4, 53, 3)), d1 = D(43, 620, 170, 5, 1), d2 = D(47, 260, 90, 4, 0.5);
  const vein = Math.min(1, m * (Math.exp(-((d1 / 1.1) ** 2)) + 0.14 * Math.exp(-((d1 / 6) ** 2))) + 0.32 * Math.exp(-((d2 / 0.7) ** 2)));
  const b = mix(8, 21, fbm(i / 50, j / 50, 24, 16, 45, 4));
  return [mix(b, 214, vein), mix(b, 162, vein), mix(b + 1, 74, vein)]; });`);
await draw('رخام', 'معدن.jpg', `return paint(512, 512, (i, j) => { const s = fbm(i / 260, j / 0.7, 2, 732, 51, 3); const sheen = 0.5 + 0.5 * Math.cos((i / 512) * Math.PI * 2.2);
  const t = 0.55 * s + 0.45 * sheen; return [mix(14, 52, t), mix(14, 52, t), mix(15, 54, t)]; });`);
// مركبات: معدن فضّيّ مصقول
await draw('مركبات', 'معدن.jpg', `return paint(512, 512, (i, j) => { const s = fbm(i / 300, j / 0.7, 2, 732, 61, 3); const sheen = 0.5 + 0.5 * Math.cos((i / 512) * Math.PI * 2);
  const t = 0.5 * s + 0.5 * sheen; return [mix(150, 222, t), mix(154, 225, t), mix(160, 230, t)]; });`);
// الغروب: ورق كريميّ عليه ظلال سعف خفيفة (ألواح المشاريع)
await draw('غروب', 'سعف.jpg', `const c = paint(640, 120, (i, j) => { const n = fbm(i / 60, j / 30, 11, 4, 71, 4); return [mix(246, 232, n), mix(232, 212, n), mix(206, 178, n)]; });
  const x = c.getContext('2d'); x.strokeStyle = 'rgba(150,110,60,.16)'; x.lineWidth = 1.4;
  for(let k = 0; k < 9; k++){ const cx = 30 + k * 72 + (k % 2) * 18, cy = 20 + (k * 37) % 80; x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + 40, cy - 30, cx + 80, cy - 4); x.stroke();
    for(let l = 0; l < 9; l++){ const t = l / 9, px = cx + 80 * t, py = cy - 26 * Math.sin(t * Math.PI) - 4 * t; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 8, py + 14); x.stroke(); x.beginPath(); x.moveTo(px, py); x.lineTo(px - 4, py - 13); x.stroke(); } }
  return c;`);
// الشاطئ: رمل بتموّجات
await draw('شاطئ', 'رمل.jpg', `return paint(640, 120, (i, j) => { const w = fbm(i / 120, j / 40, 6, 3, 81, 3) * 6; const r = 0.5 + 0.5 * Math.sin(j / 4.2 + i / 60 + w);
  const g = hash(i, j, 83); const t = Math.min(1, 0.35 * r + 0.25 * g + 0.4 * fbm(i / 30, j / 30, 22, 4, 85, 3)); return [mix(244, 220, t), mix(233, 205, t), mix(212, 176, t)]; });`);
// الشتاء: صقيع
await draw('شتاء', 'صقيع.jpg', `return paint(640, 120, (i, j) => { const n = fbm(i / 25, j / 12, 26, 10, 91, 4); const sp = hash(i, j, 93) > 0.985 ? 0.6 : 0;
  const t = Math.min(1, n * 0.8 + sp); return [mix(214, 246, t), mix(222, 249, t), mix(230, 252, t)]; });`);

await browser.close();
