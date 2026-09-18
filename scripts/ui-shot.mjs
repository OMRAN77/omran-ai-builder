#!/usr/bin/env node
// scripts/ui-shot.mjs — لقطات تطبيق عمران محلّيًّا كما يراها المستخدم (حاسوب وجوّال) بلا خادم ولا مفاتيح.
//
// الاستعمال:
//   node scripts/ui-shot.mjs --out /tmp/shots [--user omran] [--both|--desktop|--mobile] [--path /]
//        [--settings accountSection] [--eval "JS يُنفَّذ في الصفحة قبل اللقطة"] [--wait 1500] [--full]
//        [--viewport 540x960] [--scale 2] [--name 01-tools] [--settle 400]
//        [--pw /path/to/node_modules/playwright-core]
//   --viewport/--scale يفرضان مقاس اللقطة (لقطات المتاجر ٩:١٦ مثلًا 540x960 ×2 = 1080×1920)،
//   --name يسمّي الملفّ بدل desktop/mobile، و--settle مهلة بعد --eval (فتح نافذة أداة قبل اللقطة).
//
// يخدم المستودع ثابتًا من جذره ويردّ على /api/* بـ{} (لا شبكة)، يتخطّى المقدّمة وإشعار الخصوصيّة
// وتبديل الجلسة التلقائيّ، ويحفظ desktop.png و/أو mobile.png ويطبع ملخّصًا JSON فيه أخطاء الصفحة.
// يُنهي بالرمز 1 إن وقع خطأ في الصفحة — «تمّ» لا تُقال قبل لقطة بلا أخطاء.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const OUT = String(opt('out', path.join(ROOT, '.shots')));
const USER = opt('user', '') === true ? 'omran' : String(opt('user', '') || '');
const PATHNAME = String(opt('path', '/'));
const SETTINGS = String(opt('settings', '') || '');
const EVAL = String(opt('eval', '') || '');
const WAIT = Number(opt('wait', 1500)) || 1500;
const FULL = !!opt('full', false);
const VP = String(opt('viewport', '') || '').match(/^(\d+)x(\d+)$/);
const VIEWPORT = VP ? { width: Number(VP[1]), height: Number(VP[2]) } : null;
const SCALE = Number(opt('scale', 0)) || 0;
const NAME = String(opt('name', '') || '');
const SETTLE = Number(opt('settle', 400)) || 400;
const which = opt('mobile', false) ? ['mobile'] : (opt('desktop', false) ? ['desktop'] : ['desktop', 'mobile']);

async function loadPlaywright() {
  const explicit = opt('pw', '');
  const cands = explicit ? [String(explicit)] : ['playwright', 'playwright-core'];
  const req = createRequire(import.meta.url);
  for (const c of cands) {
    try { return await import(pathToFileURL(req.resolve(c)).href); } catch (e) { /* التالي: مسار مجلّد يُحلّ عبر package.json */ }
  }
  throw new Error('playwright غير موجود — ثبّته: npm i --no-save playwright (أو مرّر --pw مسار playwright-core)');
}
function chromiumPath() {
  if (process.env.PW_CHROMIUM && fs.existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM;
  const p = '/opt/pw-browsers/chromium';
  return fs.existsSync(p) ? p : undefined;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (p.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

const pwMod = await loadPlaywright();
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium); // CJS عبر import: الاسم قد يكون تحت default
const browser = await chromium.launch({ executablePath: chromiumPath() });
fs.mkdirSync(OUT, { recursive: true });
const summary = { base, out: OUT, user: USER || null, shots: [], pageErrors: [], consoleErrors: [] };
try {
  for (const kind of which) {
    const mobile = kind === 'mobile';
    const ctx = await browser.newContext(mobile
      ? { viewport: VIEWPORT || { width: 400, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: SCALE || 2, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' }
      : { viewport: VIEWPORT || { width: 1280, height: 900 }, deviceScaleFactor: SCALE || 1 });
    await ctx.addInitScript((u) => {
      try { sessionStorage.setItem('omran_sess_v1', '1'); } catch (e) { /* لا شيء */ }
      try {
        localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', 'ar');
        if (u) { localStorage.setItem('aiapp_username', u); localStorage.setItem('aiapp_auth_token', 'local'); }
      } catch (e) { /* لا شيء */ }
    }, USER);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => summary.pageErrors.push(kind + ': ' + String(e && e.message || e).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') summary.consoleErrors.push(kind + ': ' + m.text().slice(0, 200)); });
    await page.goto(base + PATHNAME, { waitUntil: 'load' });
    await page.waitForTimeout(WAIT);
    await page.evaluate(() => { ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); }); });
    if (SETTINGS) {
      await page.evaluate((sid) => {
        const d = document.getElementById('settingsDialog');
        if (d) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
        if (typeof renderSettingsNavList === 'function') renderSettingsNavList();
        if (sid === 'home' && typeof showSettingsHome === 'function') showSettingsHome();
        else if (typeof showSettingsPage === 'function') showSettingsPage(sid);
      }, SETTINGS);
      await page.waitForTimeout(400);
    }
    if (EVAL) { await page.evaluate(EVAL); await page.waitForTimeout(SETTLE); }
    const file = path.join(OUT, (NAME ? NAME + (which.length > 1 ? '-' + kind : '') : kind) + '.png');
    await page.screenshot({ path: file, fullPage: FULL });
    summary.shots.push(file);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(JSON.stringify(summary, null, 1));
if (summary.pageErrors.length) process.exit(1);
