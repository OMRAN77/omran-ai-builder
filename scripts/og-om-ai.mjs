#!/usr/bin/env node
// scripts/og-om-ai.mjs — صورة معاينة الرابط (واتساب، إكس، فيسبوك…) باسم التطبيق «OM Ai» بدل «عمران Ai» (v-og-om-ai).
// المالك ٩ نوفمبر: «التطبيق Om ai مش عمران ai — غيّر الاسم في كلّ التواصل الاجتماعي».
// تخطيط og-omran.jpg نفسه مقيسًا منها (١٢٠٠×٦٣٠، خلفيّة سوداء): الأيقونة ٢٦٢×٢٦٢ عند (٤٦٩، ١٠٠)، والاسم في وسط السطر
// السفليّ (مركزه ٤٩٥). الاسم icons/brand-om-s.png بمقاسه الأصليّ ٤٢٢×١٢٦ (لا تكبير) + نجوم رأس القائمة الثلاث (SVG).
// المخرج ملفّ جديد icons/og-om-ai.jpg — الأصل لا يُحفظ فوقه.   node scripts/og-om-ai.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
let pw; for (const c of ['playwright', 'playwright-core']) { try { pw = await import(pathToFileURL(req.resolve(c)).href); break; } catch (e) { /* التالي */ } }
if (!pw) throw new Error('playwright غير موجود');
const chromium = pw.chromium || pw.default.chromium;
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const url = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, f)).toString('base64');
const STAR = 'M0-12C1-4 4-1 12 0C4 1 1 4 0 12C-1 4-4 1-12 0C-4-1-1-4 0-12Z';
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0}html,body{width:1200px;height:630px;background:#000;overflow:hidden}
#icon{position:absolute;left:469px;top:100px;width:262px;height:262px;border-radius:58px}
#name{position:absolute;left:356px;top:432px;width:488px;height:126px}
#name img{position:absolute;left:0;top:0;width:422px;height:126px}
#name svg{position:absolute;left:418px;top:0;width:66px;height:126px;overflow:visible}
</style></head><body>
<img id="icon" src="${url('icons/icon-512-v2.png')}" alt="">
<div id="name"><img src="${url('icons/brand-om-s.png')}" alt="OM Ai"><svg viewBox="0 0 22 42">
<g transform="translate(7.5 14) scale(0.42)"><path fill="#04BAEC" d="${STAR}"/></g>
<g transform="translate(15 19) scale(0.62)"><path fill="#FEED01" d="${STAR}"/></g>
<g transform="translate(7.5 28) scale(0.38)"><path fill="#F049D7" d="${STAR}"/></g></svg></div>
</body></html>`;
const browser = await chromium.launch({ executablePath: exe });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => Promise.all([...document.images].map((im) => im.decode())));
  const out = path.join(ROOT, 'icons/og-om-ai.jpg');
  await page.screenshot({ path: out, type: 'jpeg', quality: 92 });
  console.log(out, Math.round(fs.statSync(out).size / 1024) + 'KB');
} finally { await browser.close(); }
