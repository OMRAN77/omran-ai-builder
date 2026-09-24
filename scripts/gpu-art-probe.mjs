#!/usr/bin/env node
// scripts/gpu-art-probe.mjs — ميزانيّة البكسلات على مقاس جهاز المالك (HUAWEI Mate X7 داخل WebView خام).
//
//   node scripts/gpu-art-probe.mjs [--open tools|fashion|none] [--json]
//
// يخدم المستودع محلّيًّا (بلا شبكة ولا مفاتيح) ويفتح الصفحة بـUA وWebView وأبعاد جهاز المالك
// (٧٠٠×٧٧٠ بكثافة ٢٫٦٢٥ = ١٨٣٨×٢٠٢١ بكسلًا فيزيائيًّا)، ثمّ يجرد **كلّ** صورة محمَّلة ويقيس:
//   • كم صورة حُمّلت وكم ميغابايت بكسلات (عرض×ارتفاع×٤) — وكم منها معروض فعلًا على الشاشة.
//   • الصور داخل نوافذ مغلقة مجمَّعةً بنافذتها — هذي هي التي تملأ ذاكرة الرسم بلا أن يراها أحد.
//   • طلبات الصور وحجمها عند الإقلاع.
// سبب وجوده (v-art-defer): «التشويش» على أندرويد لا يُرى في Chromium البرمجيّ، لكن سببه
// (بكسلات محمَّلة بلا عرض) يُقاس هنا بالضبط. قبل التأجيل: ٧٤ صورة / ٥٠٫٤ م.ب والمعروض ٠٫١٨.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const OPEN = String(opt('open', 'none'));
const AS_JSON = !!opt('json', false);

const req = createRequire(import.meta.url);
const pwMod = await import(pathToFileURL(req.resolve('playwright')).href).catch(() => {
  throw new Error('playwright غير موجود — ثبّته: npm i --no-save playwright');
});
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4' };
const hits = [];
const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (p.startsWith('/api/')) { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end('{}'); return; }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  hits.push({ p, kb: +(fs.statSync(f).size / 1024).toFixed(1) });
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

// UA جهاز المالك: WebView أندرويد خام (علامة wv) على هواوي — لا كروم ولا TWA
const UA = 'Mozilla/5.0 (Linux; Android 12; HUAWEI Mate X7 Build/HUAWEIMateX7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 700, height: 770 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: UA, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  try { sessionStorage.setItem('omran_sess_v1', '1'); } catch (e) { /* guard-ok: تخطّي شاشة الجلسة */ }
  try {
    localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1');
    localStorage.setItem('aiapp_lang', 'ar'); localStorage.setItem('aiapp_username', 'omran');
    localStorage.setItem('aiapp_auth_token', 'local');
  } catch (e) { /* guard-ok: تخطّي المقدّمة والخصوصيّة */ }
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e).slice(0, 180)));

const survey = () => page.evaluate(() => {
  const L = [...document.images].filter((i) => i.naturalWidth);
  const mb = (a) => +a.reduce((s, i) => s + (i.naturalWidth * i.naturalHeight * 4) / 1048576, 0).toFixed(2);
  const onScreen = (i) => { const r = i.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(i).display !== 'none'; };
  const hostOf = (i) => {
    let e = i.parentElement, n = 0;
    while (e && n < 12) { if (getComputedStyle(e).display === 'none') return (e.id ? '#' + e.id : e.tagName.toLowerCase()) + ' [مغلقة]'; e = e.parentElement; n++; }
    return '(ظاهرة)';
  };
  const hidden = {};
  for (const i of L) {
    const h = hostOf(i); if (h === '(ظاهرة)') continue;
    hidden[h] = hidden[h] || { n: 0, mb: 0 };
    hidden[h].n++; hidden[h].mb = +(hidden[h].mb + (i.naturalWidth * i.naturalHeight * 4) / 1048576).toFixed(2);
  }
  const vis = L.filter(onScreen);
  return { loaded: L.length, loadedMb: mb(L), visible: vis.length, visibleMb: mb(vis), hidden, cls: document.documentElement.className };
});

await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForTimeout(8000);
await page.evaluate(() => { ['omranIntro', 'privacyConsent'].forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); }); });
const imgHits = hits.filter((h) => /\.(png|jpe?g|webp|svg)$/i.test(h.p));
const out = {
  device: '٧٠٠×٧٧٠ @2.625 (١٨٣٨×٢٠٢١) · WebView هواوي',
  boot: await survey(),
  imgRequests: imgHits.length,
  imgKb: Math.round(imgHits.reduce((s, h) => s + h.kb, 0)),
  pageErrors,
};
if (OPEN === 'tools') {
  await page.evaluate(() => { const o = document.getElementById('sectionsToolsOverlay'); if (o) { o.style.display = 'flex'; o.classList.add('show'); } });
  await page.waitForTimeout(3000); out.afterOpen = await survey();
} else if (OPEN === 'fashion') {
  await page.evaluate(() => { const m = document.getElementById('fashionAiModal'); if (m) m.style.display = 'flex'; });
  await page.waitForTimeout(3000); out.afterOpen = await survey();
}
await browser.close(); srv.close();

if (AS_JSON) { console.log(JSON.stringify(out, null, 1)); }
else {
  const b = out.boot;
  console.log('📐 ' + out.device + ' · ' + b.cls);
  console.log('🖼️  عند الإقلاع: ' + b.loaded + ' صورة = ' + b.loadedMb + ' م.ب بكسلات · المعروض ' + b.visible + ' = ' + b.visibleMb + ' م.ب');
  console.log('🌐 طلبات الصور: ' + out.imgRequests + ' = ' + out.imgKb + ' ك.ب');
  const h = Object.entries(b.hidden).sort((x, y) => y[1].mb - x[1].mb);
  if (h.length) { console.log('🚪 داخل نوافذ مغلقة (بكسلات بلا عارض):'); for (const [k, v] of h) console.log('   ' + String(v.mb).padStart(7) + ' م.ب · ' + String(v.n).padStart(3) + ' صورة · ' + k); }
  else console.log('🚪 لا صورة داخل نافذة مغلقة.');
  if (out.afterOpen) console.log('📂 بعد فتح ' + OPEN + ': ' + out.afterOpen.loaded + ' صورة = ' + out.afterOpen.loadedMb + ' م.ب · المعروض ' + out.afterOpen.visibleMb + ' م.ب');
  console.log(pageErrors.length ? '❌ أخطاء صفحة: ' + pageErrors.join(' | ') : '✅ بلا أخطاء صفحة');
}
if (pageErrors.length) process.exit(1);
