#!/usr/bin/env node
// scripts/ثيم-خشبي.mjs — خامات ثيم «خشبي» (v-skin-wood، أمر المالك ٤ أكتوبر بصورة: «أعطني بالضبط مرتّبة نفس هذي في الخلفيّات،
// إذا اختارها يستوي نفسها»). تُرسم بضجيج إجرائيّ على Canvas في Chromium (بلا صور خارجيّة ولا حقوق)، وتُحفظ JPEG/WebP صغيرة
// في assets/ثيمات/خشبي/ — الرسم مرّة واحدة هنا أرخص من فلاتر SVG تُحسب عند كلّ رسم على أجهزة المعالج (v-cpu-calm).
//   node scripts/ثيم-خشبي.mjs            ← الخامات
//   node scripts/ثيم-خشبي.mjs --مصغّر    ← مصغّر الشبكة (٣٦٠ عرضًا) من لقطة التطبيق نفسه بالثيم
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'assets', 'ثيمات', 'خشبي');
fs.mkdirSync(OUT, { recursive: true });

async function pw() {
  const req = createRequire(import.meta.url);
  for (const c of ['playwright', 'playwright-core']) {
    try { return await import(pathToFileURL(req.resolve(c)).href); } catch (e) { /* التالي */ }
  }
  throw new Error('playwright غير موجود');
}
const pwMod = await pw();
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium); // CJS عبر import: الاسم قد يكون تحت default
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const save = async (name, dataUrl) => {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'));
  console.log(name, Math.round(fs.statSync(path.join(OUT, name)).size / 1024) + 'KB');
};

if (process.argv.includes('--مصغّر')) {
  // لقطة حاسوب بالثيم ثمّ تصغير إلى ٣٦٠ عرضًا (نفس مقاس مصغّرات الخلفيّات)
  const tmp = path.join(OUT, '.shot');
  execFileSync('node', [path.join(ROOT, 'scripts', 'ui-shot.mjs'), '--out', tmp, '--user', 'omran', '--desktop', '--name', 'wood',
    '--eval', "(()=>{ const n=Date.now(); state.projects=['تطبيق مهام','صورة شخصيّة','فيديو قصير','موقع مطعم','خطّة دراسة','مشروع جديد'].map((t,i)=>({id:'p_'+(n-i*6e4),title:t,provider:'openai',messages:[]})); window.__renderHistSig=null; renderHistory(); window.خلفيات.طبّق(window.خلفيات.ثيم('خشبي'), false); })()", '--settle', '1500'], { stdio: 'inherit' });
  const png = fs.readFileSync(path.join(tmp, 'wood.png')).toString('base64');
  const url = await page.evaluate(async (src) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
    const c = document.getElementById('c'); c.width = 360; c.height = Math.round(img.height * 360 / img.width);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }, png);
  await save('مصغّر.jpg', url);
  fs.rmSync(tmp, { recursive: true, force: true });
  await browser.close();
  process.exit(0);
}

// ضجيج قيمة قابل للتبليط (دوريّ بطول الدورة) + fbm — يُحقن في الصفحة
const NOISE = `
function hash(x, y, s){ let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, px, py, s){
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const w = (t) => t * t * (3 - 2 * t);
  const g = (a, b) => hash(((a % px) + px) % px, ((b % py) + py) % py, s);
  const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
  const u = w(xf), v = w(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, px, py, s, oct){ let t = 0, amp = 0.5, f = 1, n = 0; for(let i = 0; i < oct; i++){ t += amp * vnoise(x * f, y * f, px * f, py * f, s + i); n += amp; amp *= 0.5; f *= 2; } return t / n; }
const mix = (a, b, t) => a + (b - a) * t;
function paint(w, h, fn){ const c = document.getElementById('c'); c.width = w; c.height = h; const x = c.getContext('2d'); const im = x.createImageData(w, h);
  for(let j = 0; j < h; j++) for(let i = 0; i < w; i++){ const p = fn(i, j); const k = (j * w + i) * 4; im.data[k] = p[0]; im.data[k + 1] = p[1]; im.data[k + 2] = p[2]; im.data[k + 3] = p.length > 3 ? p[3] : 255; }
  x.putImageData(im, 0, 0); return c; }
`;
await page.addScriptTag({ content: NOISE });

// ١. خشب فاتح (ألواح القائمة والفقاعات): عروق أفقيّة متموّجة + ألياف دقيقة
await save('خشب.jpg', await page.evaluate(() => {
  const W = 640, H = 160;
  const c = paint(W, H, (i, j) => {
    const warp = fbm(i / 220, j / 34, 3, 5, 7, 4) * 7;
    const ring = 0.5 + 0.5 * Math.sin(j / 3.4 + warp + Math.sin(i / 120) * 0.8);
    const streak = fbm(i / 46, j / 0.8, 14, 200, 11, 2);
    const fiber = hash(i, j, 3);
    const knot = fbm(i / 60, j / 22, 11, 7, 3, 3);
    let t = 0.42 * Math.pow(ring, 3) + 0.33 * streak + 0.08 * fiber + 0.17 * knot;
    t = Math.min(1, Math.max(0, t));
    return [mix(238, 190, t), mix(220, 152, t), mix(190, 104, t)];
  });
  return c.toDataURL('image/jpeg', 0.84);
}));

// ٢. رقّ (القائمة الجانبيّة): بقع منخفضة التردّد + حبيبات + تعتيم أطراف
await save('رق.jpg', await page.evaluate(() => {
  const W = 420, H = 900;
  const c = paint(W, H, (i, j) => {
    const blot = fbm(i / 120, j / 120, 4, 8, 21, 5);
    const grain = hash(i, j, 5) * 0.5 + fbm(i / 2, j / 2, 210, 450, 9, 1) * 0.5;
    const ex = Math.min(i, W - 1 - i) / W, ey = Math.min(j, H - 1 - j) / H;
    const edge = Math.max(0, 0.09 - Math.min(ex, ey * 2)) * 6;
    const t = Math.min(1, 0.55 * blot + 0.12 * grain + edge);
    return [mix(244, 214, t), mix(234, 196, t), mix(214, 160, t)];
  });
  return c.toDataURL('image/jpeg', 0.82);
}));

// ٣. كتّان فاتح (خلفيّة المحادثة) — قابل للتبليط ٢٥٦
await save('كتان.jpg', await page.evaluate(() => {
  const S = 256;
  const c = paint(S, S, (i, j) => {
    const wx = 0.5 + 0.5 * Math.sin(i * Math.PI / 2), wy = 0.5 + 0.5 * Math.sin(j * Math.PI / 2);
    const th = fbm(i / 1.5, j / 24, 171, 11, 4, 2) * 0.6 + fbm(i / 24, j / 1.5, 11, 171, 8, 2) * 0.4;
    const slub = fbm(i / 16, j / 16, 16, 16, 13, 3);
    const t = Math.min(1, 0.18 * (wx * wy) + 0.42 * th + 0.25 * slub);
    return [mix(242, 222, t), mix(236, 211, t), mix(224, 188, t)];
  });
  return c.toDataURL('image/jpeg', 0.84);
}));

// ٤. كتّان بنّيّ (لوحة المعاينة) — قابل للتبليط ٢٥٦
await save('كتان-بني.jpg', await page.evaluate(() => {
  const S = 256;
  const c = paint(S, S, (i, j) => {
    const th = fbm(i / 1.5, j / 22, 171, 12, 31, 2) * 0.55 + fbm(i / 22, j / 1.5, 12, 171, 33, 2) * 0.45;
    const slub = fbm(i / 18, j / 18, 14, 14, 35, 3);
    const t = Math.min(1, 0.6 * th + 0.4 * slub);
    return [mix(132, 98, t), mix(110, 80, t), mix(92, 64, t)];
  });
  return c.toDataURL('image/jpeg', 0.84);
}));

// ٥. رقّ ممزّق الحوافّ (إطار أعلى المحادثة) — WebP بشفافيّة
await save('رق-ممزق.webp', await page.evaluate(() => {
  const W = 560, H = 360;
  const c = document.getElementById('c'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const torn = (inset, amp, seed) => {
    const pts = [], step = 6;
    const edge = (len, k) => { const out = []; for(let s = 0; s <= len; s += step) out.push((fbm(s / 18, k, 64, 4, seed, 3) - 0.5) * amp * 2 + (hash(s, k, seed) - 0.5) * amp * 0.6); return out; };
    const top = edge(W - 2 * inset, 1), right = edge(H - 2 * inset, 2), bot = edge(W - 2 * inset, 3), left = edge(H - 2 * inset, 0);
    top.forEach((d, k) => pts.push([inset + k * step, inset + d]));
    right.forEach((d, k) => pts.push([W - inset + d, inset + k * step]));
    bot.forEach((d, k) => pts.push([W - inset - k * step, H - inset + d]));
    left.forEach((d, k) => pts.push([inset + d, H - inset - k * step]));
    x.beginPath(); pts.forEach((p, k) => (k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath();
  };
  const tex = (r0, g0, b0, r1, g1, b1, seed) => {
    const t = document.createElement('canvas'); t.width = W; t.height = H; const tx = t.getContext('2d'); const im = tx.createImageData(W, H);
    for(let j = 0; j < H; j++) for(let i = 0; i < W; i++){ const n = Math.min(1, 0.65 * fbm(i / 70, j / 70, 8, 6, seed, 5) + 0.15 * hash(i, j, seed)); const k = (j * W + i) * 4;
      im.data[k] = mix(r0, r1, n); im.data[k + 1] = mix(g0, g1, n); im.data[k + 2] = mix(b0, b1, n); im.data[k + 3] = 255; }
    tx.putImageData(im, 0, 0); return x.createPattern(t, 'no-repeat');
  };
  x.clearRect(0, 0, W, H);
  // الطبقة الخارجيّة: ورق أغمق بظلّ
  x.save(); x.shadowColor = 'rgba(70,45,20,.45)'; x.shadowBlur = 18; x.shadowOffsetY = 6;
  torn(14, 7, 41); x.fillStyle = tex(214, 190, 150, 168, 132, 88, 43); x.fill(); x.restore();
  // حافّة محروقة رفيعة
  torn(14, 7, 41); x.lineWidth = 2; x.strokeStyle = 'rgba(110,72,36,.55)'; x.stroke();
  // الطبقة الداخليّة: رقّ فاتح
  x.save(); x.shadowColor = 'rgba(90,60,30,.35)'; x.shadowBlur = 8;
  torn(40, 5, 47); x.fillStyle = tex(242, 232, 210, 222, 203, 166, 49); x.fill(); x.restore();
  return c.toDataURL('image/webp', 0.86);
}));

await browser.close();
