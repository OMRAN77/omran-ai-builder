#!/usr/bin/env node
// scripts/خلفيات.mjs — خلفيّات الشاشة (v-bg-images).
// يقرأ assets/خلفيات/*.jpg ويكتب: مصغّرات/<الاسم> (٣٦٠ بكسل عرضًا) وفهرس.json
// (الملفّ، المقاس، اللون المهيمن، فاتحة؟) الذي تقرؤه الواجهة — بلا قائمة يدويّة في الكود.
//
// لإضافة خلفيّة: ضع الصورة في assets/خلفيات/ باسم «NNN-اسم.jpg» (NNN = ترتيب العرض بثلاث خانات:
// 001، 042، 109 — الفرز حرفيّ فبلا الأصفار يسبق 100 الرقم 93) ثمّ:
//   node scripts/خلفيات.mjs            → مصغّرات + فهرس فقط (لا يمسّ الصور)
//   node scripts/خلفيات.mjs --قص       → قبلها: أيّ صورة تبدو لقطة شاشة هاتف (إطار داكن موحّد
//                                        حول مستطيل أضيق من ٨٠٪ من العرض) تُقصّ إلى الصورة الداخليّة
//                                        وتُحفظ مكانها، مع قصّ شارة العدّاد («7/10») إن وُجدت في زاويتها
//                                        العليا. الصور النظيفة لا تُلمس.
// يحتاج كروميوم (Playwright) — نفس ما تستعمله scripts/ui-shot.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DIR = path.join(ROOT, 'assets', 'خلفيات');
const THUMBS = path.join(DIR, 'مصغّرات');
const INDEX = path.join(DIR, 'فهرس.json');
const CROP = process.argv.includes('--قص');
const DRY = process.argv.includes('--جرب'); // مع --قص: يطبع المستطيلات ولا يكتب شيئًا
const THUMB_W = 360;

async function loadPlaywright() {
  const req = createRequire(import.meta.url);
  for (const c of ['playwright', 'playwright-core']) {
    try { return await import(pathToFileURL(req.resolve(c)).href); } catch (e) { /* التالي */ }
  }
  throw new Error('playwright غير موجود — ثبّته: npm i --no-save playwright');
}
function chromiumPath() {
  if (process.env.PW_CHROMIUM && fs.existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM;
  const p = '/opt/pw-browsers/chromium';
  return fs.existsSync(p) ? p : undefined;
}

// يعمل داخل المتصفّح: يحلّل الصورة ويعيد القصّ (إن لزم) والمصغّر واللون.
const PAGE_FN = async ({ src, crop, thumbW }) => {
  const img = new Image(); img.src = src; await img.decode();
  let W = img.naturalWidth, H = img.naturalHeight;
  const full = document.createElement('canvas'); full.width = W; full.height = H;
  full.getContext('2d').drawImage(img, 0, 0);
  let box = null, diag = '';
  if (crop) {
    // التحليل على نسخة ٤٠٠ بكسل عرضًا للسرعة
    const w = 400, h = Math.round(H * 400 / W);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const px = (i, j) => { const k = (j * w + i) * 4; return [d[k], d[k + 1], d[k + 2]]; };
    const lum = (i, j) => { const p = px(i, j); return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]; };
    // لون الإطار = وسيط الزوايا الأربع
    const corners = [px(2, 2), px(w - 3, 2), px(2, h - 3), px(w - 3, h - 3)];
    const bg = [0, 1, 2].map((ch) => corners.map((p) => p[ch]).sort((a, b) => a - b)[1]);
    const bgLuma = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
    // «محتوى» = بعيد عن لون الإطار، أو فيه ملمس (إطار الواجهة أملس تمامًا؛ الصورة فيها تفاصيل ولو كانت داكنة)
    const isContent = (i, j) => {
      const p = px(i, j);
      if (Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2])) > 12) return true;
      if (i + 1 >= w || j + 1 >= h) return false;
      const l = lum(i, j);
      return Math.abs(l - lum(i + 1, j)) + Math.abs(l - lum(i, j + 1)) > 2.5;
    };
    const mean = (arr, a, b) => { let s = 0, n = 0; for (let k = Math.max(0, a); k <= Math.min(arr.length - 1, b); k++) { s += arr[k]; n++; } return n ? s / n : 0; };
    // أطول امتداد من الأعمدة/الصفوف الكثيفة، مع تسامح فجوات صغيرة (أيقونات الواجهة متفرّقة، الصورة كثيفة)
    const run = (dens, thr, gap) => {
      let best = [0, -1], start = -1, lastGood = -1;
      for (let i = 0; i <= dens.length; i++) {
        const ok = i < dens.length && dens[i] > thr;
        if (ok) { if (start < 0) start = i; lastGood = i; }
        else if (start >= 0 && (i - lastGood > gap || i === dens.length)) {
          if (lastGood - start > best[1] - best[0]) best = [start, lastGood];
          start = -1;
        }
      }
      return best;
    };
    const colDensity = [];
    for (let i = 0; i < w; i++) { let n = 0; for (let j = 0; j < h; j++) if (isContent(i, j)) n++; colDensity.push(n / h); }
    const [c0, c1] = run(colDensity, 0.2, 8);
    if (c1 > c0) {
      const rowDensity = [];
      for (let j = 0; j < h; j++) { let n = 0; for (let i = c0; i <= c1; i++) if (isContent(i, j)) n++; rowDensity.push(n / (c1 - c0 + 1)); }
      let [r0, r1] = run(rowDensity, 0.2, 8);
      // تشذيب الحافّتين: صفوف الصورة كثيفة، وسطر التعليق/الأزرار الملاصق لها متفرّق — يُسقَط
      while (r1 > r0 && rowDensity[r1] < 0.6) r1--;
      while (r0 < r1 && rowDensity[r0] < 0.6) r0++;
      const bw = (c1 - c0 + 1) / w, bh = (r1 - r0 + 1) / h;
      // الإطار حول المستطيل يجب أن يكون شبه فارغ (أيقونات قليلة) — وإلّا فهذه صورة كاملة داكنة الأطراف لا لقطة شاشة
      let outside = 0, outsideContent = 0;
      for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) {
        if (i >= c0 && i <= c1 && j >= r0 && j <= r1) continue;
        outside++; if (isContent(i, j)) outsideContent++;
      }
      const frameClean = outside > 0 && outsideContent / outside < 0.16;
      // حافّة قاطعة: الأعمدة/الصفوف داخل المستطيل مباشرة كثيفة، والتي خارجه مباشرة فارغة —
      // لقطة الشاشة هكذا؛ صورة نظيفة داكنة الأطراف (نجوم متناثرة) لا
      const inC = Math.min(mean(colDensity, c0, c0 + 3), mean(colDensity, c1 - 3, c1));
      const outC = Math.max(mean(colDensity, c0 - 7, c0 - 2), mean(colDensity, c1 + 2, c1 + 7));
      const inR = Math.min(mean(rowDensity, r0, r0 + 3), mean(rowDensity, r1 - 3, r1));
      const outR = Math.max(mean(rowDensity, r0 - 7, r0 - 2), mean(rowDensity, r1 + 2, r1 + 7));
      const sharp = inC > 0.3 && outC < 0.12 && inR > 0.3 && outR < 0.2;
      diag = `إطار=${bgLuma.toFixed(0)} عرض=${bw.toFixed(2)} ارتفاع=${bh.toFixed(2)} خارج=${(outsideContent / outside).toFixed(3)} حافّة(داخل/خارج)=${inC.toFixed(2)}/${outC.toFixed(2)} ${inR.toFixed(2)}/${outR.toFixed(2)} أعمدة=${c0}-${c1}/${w} صفوف=${r0}-${r1}/${h}`;
      if (bgLuma < 40 && bw > 0.25 && bw < 0.8 && bh > 0.3 && r1 > r0 && frameClean && sharp) {
        // ١٪ للداخل يتخلّص من حافّة التنعيم
        const X0 = (c0 / w + 0.01) * W, X1 = ((c1 + 1) / w - 0.01) * W;
        let Y0 = (r0 / h + 0.01) * H, Y1 = ((r1 + 1) / h - 0.01) * H;
        // شارة العدّاد («7/10»): سطر قصير من بكسلات شبه بيضاء في إحدى الزاويتين العلويّتين
        // (أعلى ١٠٪ × طرف ٢٢٪) — كلّ زاوية تُفحص وحدها كي لا يخدعنا محتوى فاتح في الزاوية الأخرى
        const bw2 = Math.round(X1 - X0), top = Math.round((Y1 - Y0) * 0.10), side = Math.round(bw2 * 0.22);
        const strip = full.getContext('2d').getImageData(Math.round(X0), Math.round(Y0), bw2, top).data;
        let cut = -1;
        for (const [a, b] of [[0, side], [bw2 - side, bw2]]) {
          let first = -1, last = -1;
          for (let j = 0; j < top; j++) {
            let n = 0;
            for (let i = a; i < b; i++) {
              const k = (j * bw2 + i) * 4;
              if (strip[k] > 205 && strip[k + 1] > 205 && strip[k + 2] > 205) n++;
            }
            if (n > 4) { if (first < 0) first = j; last = j; }
          }
          const band = last - first;
          if (first >= 0 && first < (Y1 - Y0) * 0.06 && band > (Y1 - Y0) * 0.01 && band < (Y1 - Y0) * 0.07) cut = Math.max(cut, last);
        }
        if (cut >= 0) Y0 += cut + Math.round((Y1 - Y0) * 0.012);
        // ذيل شارة داكنة على صورة فاتحة (النصّ فوق خطّ القصّ وأسفل الشارة تحته): كتلة في زاوية عليا
        // تخالف وسيط الزاوية بشدّة → ٣٪ إضافيّة من الأعلى
        {
          const zh = Math.round((Y1 - Y0) * 0.03);
          const zone = full.getContext('2d').getImageData(Math.round(X0), Math.round(Y0), bw2, zh).data;
          for (const [a, b] of [[0, side], [bw2 - side, bw2]]) {
            const L = [];
            for (let j = 0; j < zh; j++) for (let i = a; i < b; i++) { const k = (j * bw2 + i) * 4; L.push(0.299 * zone[k] + 0.587 * zone[k + 1] + 0.114 * zone[k + 2]); }
            const med = L.slice().sort((p, q) => p - q)[L.length >> 1];
            const odd = L.filter((v) => Math.abs(v - med) > 60).length / L.length;
            if (odd > 0.03 && odd < 0.5) { Y0 += zh; break; }
          }
        }
        // نقاط التمرير (• • •) أسفل منشورات الألبوم: بكسلات فاتحة في وسط أسفل ٨٪ — نقصّ حتّى ما فوقها
        {
          const bh3 = Math.round((Y1 - Y0) * 0.08), mid0 = Math.round(bw2 * 0.33), mid1 = Math.round(bw2 * 0.67);
          const bot = full.getContext('2d').getImageData(Math.round(X0), Math.round(Y1) - bh3, bw2, bh3).data;
          let firstDot = -1, lastDot = -1;
          for (let j = 0; j < bh3; j++) {
            let n = 0;
            for (let i = mid0; i < mid1; i++) { const k = (j * bw2 + i) * 4; if (bot[k] > 200 && bot[k + 1] > 200 && bot[k + 2] > 200) n++; }
            if (n > 3 && n < bw2 * 0.12) { if (firstDot < 0) firstDot = j; lastDot = j; }
          }
          const band = lastDot - firstDot;
          if (firstDot >= 0 && band > 0 && band < (Y1 - Y0) * 0.025) Y1 = Y1 - (bh3 - firstDot) - Math.round((Y1 - Y0) * 0.01);
        }
        box = [Math.round(X0), Math.round(Y0), Math.round(X1 - X0), Math.round(Y1 - Y0)];
      }
    }
  }
  if (box) {
    // أشرطة موحّدة اللون (بيضاء أو سوداء) على حوافّ المستطيل — منشور ضيّق داخل إطار مربّع — تُقصّ
    // (بحدّ ٤٠٪ من كلّ بُعد حتّى لا تأكل سماءً سوداء حقيقيّة)
    const fx = full.getContext('2d');
    const uni = (x, y, ww, hh) => {
      const d = fx.getImageData(x, y, ww, hh).data;
      let s = 0, s2 = 0; const n = d.length / 4;
      for (let k = 0; k < d.length; k += 4) { const l = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]; s += l; s2 += l * l; }
      const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m));
      return sd < 4 && (m > 230 || m < 22);
    };
    let [bx, by, bwid, bhei] = box;
    const st = Math.max(2, Math.round(bwid / 200)), minW = Math.round(bwid * 0.6), minH = Math.round(bhei * 0.6);
    // الأشرطة الجانبيّة تُفحص تحت أعلى ١٢٪ — شارة العدّاد تجلس على الشريط نفسه
    const top12 = Math.round(bhei * 0.12);
    while (bwid > minW && uni(bx, by + top12, st, bhei - top12)) { bx += st; bwid -= st; }
    while (bwid > minW && uni(bx + bwid - st, by + top12, st, bhei - top12)) bwid -= st;
    while (bhei > minH && uni(bx, by, bwid, st)) { by += st; bhei -= st; }
    while (bhei > minH && uni(bx, by + bhei - st, bwid, st)) bhei -= st;
    box = [bx, by, bwid, bhei];
  }
  let out = full;
  if (box) {
    const c = document.createElement('canvas'); c.width = box[2]; c.height = box[3];
    c.getContext('2d').drawImage(full, box[0], box[1], box[2], box[3], 0, 0, box[2], box[3]);
    out = c; W = box[2]; H = box[3];
  }
  // اللون المهيمن = متوسّط ١٦×١٦ — يكفي لاختيار نصّ فاتح/داكن وصبغة اللوحات
  const t = document.createElement('canvas'); t.width = 16; t.height = 16;
  const tx = t.getContext('2d'); tx.drawImage(out, 0, 0, 16, 16);
  const td = tx.getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0;
  for (let k = 0; k < td.length; k += 4) { r += td[k]; g += td[k + 1]; b += td[k + 2]; }
  const n = td.length / 4; r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const th = document.createElement('canvas'); th.width = thumbW; th.height = Math.round(H * thumbW / W);
  th.getContext('2d').drawImage(out, 0, 0, th.width, th.height);
  return {
    box, diag, w: W, h: H,
    color: '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''),
    light: luma > 0.55,
    thumb: th.toDataURL('image/jpeg', 0.82),
    cropped: box ? out.toDataURL('image/jpeg', 0.92) : null,
  };
};

const files = fs.readdirSync(DIR).filter((f) => /\.jpe?g$/i.test(f)).sort((a, b) => a.localeCompare(b, 'ar'));
if (!files.length) { console.error('لا صور في assets/خلفيات/'); process.exit(1); }
fs.mkdirSync(THUMBS, { recursive: true });

const pwMod = await loadPlaywright();
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset=utf-8>');
const b64 = (u) => Buffer.from(u.split(',')[1], 'base64');
const entries = [];
for (const f of files) {
  const src = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64');
  const r = await page.evaluate(PAGE_FN, { src, crop: CROP, thumbW: THUMB_W });
  if (r.cropped) console.log(`✂ ${f}: [${r.box.join(', ')}]${DRY ? ' (تجربة — لم يُكتب)' : ''}`);
  if (DRY && r.diag) console.log(`   ${r.diag}`);
  if (!DRY) {
    if (r.cropped) fs.writeFileSync(path.join(DIR, f), b64(r.cropped));
    fs.writeFileSync(path.join(THUMBS, f), b64(r.thumb));
  }
  // v-bg-desktop: نسخة حاسوب (حاسوب/<الاسم>، الشريط الأوسط ١٦:٩ موضَّح إلى ٢٥٦٠ عرضًا) للصور الضيّقة التي يمدّها الحاسوب — يعلّمها الفهرس
  const desk = fs.existsSync(path.join(DIR, 'حاسوب', f));
  entries.push(Object.assign({ ملف: f, عرض: r.w, ارتفاع: r.h, لون: r.color, فاتحة: r.light }, desk ? { حاسوب: true } : {}));
  console.log(`✓ ${f} ${r.w}×${r.h} ${r.color} ${r.light ? 'فاتحة' : 'داكنة'}`);
}
await browser.close();
if (DRY) { console.log('تجربة فقط — لا مصغّرات ولا فهرس'); process.exit(0); }
// مصغّرات يتيمة (صورة حُذفت) تُزال
for (const f of fs.readdirSync(THUMBS)) if (!files.includes(f)) fs.unlinkSync(path.join(THUMBS, f));
if (fs.existsSync(path.join(DIR, 'حاسوب'))) for (const f of fs.readdirSync(path.join(DIR, 'حاسوب'))) if (!files.includes(f)) fs.unlinkSync(path.join(DIR, 'حاسوب', f)); // v-bg-desktop: نسخة حاسوب يتيمة
fs.writeFileSync(INDEX, JSON.stringify({ نسخة: 1, صور: entries }, null, 1) + '\n');
console.log(`فهرس: ${entries.length} خلفيّة → ${path.relative(ROOT, INDEX)}`);
