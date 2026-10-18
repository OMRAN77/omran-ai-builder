// scripts/maha-dock-probe.mjs — v-maha-dock-bar (المالك ١٨ أكتوبر: ««م» فوق نافذة مها: لا يغطي شي من محتوى النافذة… وتأكد إن ما في
// شي مخفي تحته»). على الصفحة والحزمة الحقيقيّتين محلّيًّا (الـAPI يردّ {})، بمكالمة مها مُحاكاة كما يبدؤها mahaStartCallInner: لكلّ
// هدف تفتحه مها، أعلى التمرير وأسفله:
//  ١) ما تحت «م» الظاهر (شبكة elementsFromPoint ٧×٧): محتوى النافذة = فشل.
//  ٢) ما يظهر مكان الشريط العلويّ لو أُخفي لحظة: محتوى نافذة = كان مخفيًّا تحته = فشل.
//  ٣) «م» في الأعلى (elementFromPoint في وسطه = هو)، ولا شريط عالق بعد الإغلاق.
//  ٤) لمسات يد حقيقيّة: داخل النافذة والشريط الفارغ لا يُنهيان، و«م» يُنهي ويزول الشريط.
// الاستعمال: node scripts/maha-dock-probe.mjs [d1366,d1920,m390] [all|video,studio,…] [dark|light]   (اللقطات في $OUT أو /tmp/maha-dock)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || '/tmp/maha-dock';
fs.mkdirSync(OUT, { recursive: true });
async function loadPlaywright() {
  const reqs = [createRequire(import.meta.url), createRequire('/opt/node22/lib/node_modules/')];
  for (const req of reqs) for (const c of ['playwright', 'playwright-core']) {
    try { return await import(pathToFileURL(req.resolve(c)).href); } catch (e) { /* التالي */ }
  }
  throw new Error('playwright غير موجود — ثبّته: npm i --no-save playwright');
}
const pwMod = await loadPlaywright();
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
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
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const KINDS = (process.argv[2] || 'd1366,d1920,m390').split(',');
const ALL = ['tools', 'portrait', 'video', 'video-trends', 'video-templates', 'video-ai', 'video-cinematic', 'video-actor', 'video-enhance', 'studio', 'fashion', 'design', 'construction', 'edu', 'docs', 'religion', 'qibla', 'stocks', 'feedback', 'settings', 'settings-language', 'settings-account', 'settings-wallpapers', 'settings-backgrounds', 'settings-font', 'settings-voice', 'settings-memory', 'settings-plans', 'settings-about'];
const TARGETS = (process.argv[3] && process.argv[3] !== 'all') ? process.argv[3].split(',') : ALL;
const MODE = process.argv[4] || 'dark';
const SHOTS = new Set(['video', 'portrait', 'settings-wallpapers', 'tools', 'studio', 'docs', 'settings-account', 'fashion']);
const VP = { d1366: { width: 1366, height: 768 }, d1920: { width: 1920, height: 1080 }, m390: { width: 390, height: 844 } };
const out = [];
let fails = 0;
try {
  for (const kind of KINDS) {
    const mobile = kind.startsWith('m');
    const ctx = await browser.newContext(mobile
      ? { viewport: VP[kind], isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' }
      : { viewport: VP[kind], deviceScaleFactor: 2 });
    await ctx.addInitScript((mode) => { try { sessionStorage.setItem('omran_sess_v1', '1'); localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', 'ar'); localStorage.setItem('aiapp_username', 'omran'); localStorage.setItem('aiapp_auth_token', 'local'); if (mode === 'light') localStorage.setItem('aiapp_mode', 'light'); } catch (e) { /* لا شيء */ } }, MODE);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e && e.message || e).slice(0, 200)));
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.evaluate((mode) => {
      ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
      
      if (mode === 'light') document.documentElement.setAttribute('data-mode', 'light');
    }, MODE);
    const startCall = () => page.evaluate(() => {
      if (!window.__origEnd) { window.__origEnd = mahaEndCall; mahaEndCall = function(){ window.__ended = (window.__ended || 0) + 1; }; }
      mahaCallMode = 'assistant'; mahaCallActive = true;
      const cs = document.getElementById('mahaCallScreen'); cs.style.display = 'flex'; mahaAvatarDisplay(true);
      mahaHideComposer(); cs.classList.add('maha-goldband'); document.body.classList.add('maha-band-on'); mahaStartCloseWatch(); mahaSetState('listening');
      mahaAppControl = true; mahaAppHello();
    });
    await startCall();
    await page.waitForTimeout(300);
    for (const target of TARGETS) {
      const res = await page.evaluate(async (t) => mahaAppTool('open_in_app', { target: t }), target);
      await page.waitForTimeout(500);
      const measure = (mode) => page.evaluate(async (mode) => {
        const desc = (e) => { if (!e) return null; const cls = (e.className && typeof e.className === 'string') ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''; return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cls; };
        const R = (r) => [r.left, r.top, r.width, r.height].map((v) => Math.round(v));
        const dlg = document.getElementById('settingsDialog');
        const top = window.omranSwipeBack && window.omranSwipeBack.top();
        const win = (dlg && dlg.open) ? dlg : top;
        const bar = document.getElementById('mahaWinBar');
        const dockEl = document.getElementById('mahaDockMirror');
        if (!bar || !dockEl) return { noBar: true, win: win && desc(win), body: document.body.className };
        const br = bar.getBoundingClientRect();
        const dr = dockEl.getBoundingClientRect();
        const INTER = 'button,a[href],input,select,textarea,label,summary,[role=button],[role=tab],[onclick],[tabindex]:not([tabindex="-1"])';
        const ownText = (e) => Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
        let scroller = null;
        if (win) {
          const cand = [win, ...win.querySelectorAll('*')].filter((e) => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 4 && e.getBoundingClientRect().height > 100; });
          cand.sort((a, b) => b.getBoundingClientRect().height * b.getBoundingClientRect().width - a.getBoundingClientRect().height * a.getBoundingClientRect().width);
          scroller = cand[0] || null;
          if (scroller) scroller.scrollTop = mode === 'bottom' ? scroller.scrollHeight : 0;
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const c = document.elementFromPoint(dr.left + dr.width / 2, dr.top + dr.height / 2);
        const dockTop = !!c && (c === dockEl || dockEl.contains(c));
        const N = 7; let content = 0; const under = {};
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const x = dr.left + (i + 0.5) * dr.width / N, y = dr.top + (j + 0.5) * dr.height / N;
          for (const e of document.elementsFromPoint(x, y)) {
            if (e === dockEl || dockEl.contains(e) || e === bar || e === document.documentElement || e === document.body) continue;
            if (!win || !win.contains(e) || e === win) continue;
            const cs = getComputedStyle(e); if (cs.visibility === 'hidden') continue;
            const it = e.closest(INTER);
            if (it || ownText(e) || /^(img|video|svg|canvas|iframe)$/i.test(e.tagName)) { content++; const k = desc(it || e); under[k] = (under[k] || 0) + 1; break; }
          }
        }
        // ما الذي كان سيظهر مكان الشريط لو لم يكن؟ يُخفى الشريط لحظة وتُسأل شبكة نقاط على مساحته: محتوى نافذة هناك = كان مخفيًّا تحته.
        const inBar = [];
        bar.style.visibility = 'hidden';
        const GX = 24, GY = 4;
        for (let i = 0; i < GX; i++) for (let j = 0; j < GY; j++) {
          const x = br.left + (i + 0.5) * br.width / GX, y = br.top + (j + 0.5) * br.height / GY;
          const e = document.elementFromPoint(x, y);
          if (!e || !win || !win.contains(e) || e === win || bar.contains(e)) continue;
          const it = e.closest(INTER);
          if (it || ownText(e) || /^(img|video|svg|canvas|iframe)$/i.test(e.tagName)) inBar.push({ el: desc(it || e), at: [Math.round(x), Math.round(y)], text: ownText(e).slice(0, 20) });
        }
        bar.style.visibility = '';
        const wr = win ? win.getBoundingClientRect() : null;
        return { win: win && desc(win), winRect: wr && R(wr), bar: R(br), barHost: bar.parentElement && (bar.parentElement.id || bar.parentElement.tagName), dock: R(dr), dockTop, contentUnderDock: content, under, inBarCount: inBar.length, inBar: inBar.slice(0, 5), scroll: scroller ? Math.round(scroller.scrollTop) : null };
      }, mode);
      const a = await measure('top');
      if (SHOTS.has(target)) await page.screenshot({ path: path.join(OUT, MODE + '-' + kind + '-' + target + '.png') });
      const b = await measure('bottom');
      if (SHOTS.has(target) && b.scroll) await page.screenshot({ path: path.join(OUT, MODE + '-' + kind + '-' + target + '-scrolled.png') });
      const bad = !res.ok ? false : (a.noBar || b.noBar || a.contentUnderDock || b.contentUnderDock || a.inBarCount || b.inBarCount || !a.dockTop || !b.dockTop);
      if (bad) fails++;
      out.push({ kind, target, open: res.ok, msg: res.ok ? '' : res.message, bad: !!bad, atTop: a, atBottom: b });
      console.log((bad ? '✗ ' : (res.ok ? '✓ ' : '· ')) + kind + ' ' + target + (res.ok ? '' : ' (لم تُفتح: ' + res.message + ')') + (bad ? ' ' + JSON.stringify({ a: [a.noBar, a.contentUnderDock, a.inBarCount, a.dockTop, a.under, a.inBar], b: [b.noBar, b.contentUnderDock, b.inBarCount, b.dockTop, b.under, b.inBar] }) : ''));
      await page.evaluate(async () => { await mahaAppTool('app_action', { action: 'close_window' }); if (document.documentElement.classList.contains('mobile-ui') && typeof closeDrawers === 'function') closeDrawers(); });
      await page.waitForTimeout(400);
      const left = await page.evaluate(() => ({ bar: !!document.getElementById('mahaWinBar'), win: document.body.classList.contains('maha-win'), dlg: document.body.classList.contains('maha-dlg'), top: !!(window.omranSwipeBack && window.omranSwipeBack.top()) }));
      if (left.bar && !left.top && !(document.getElementById && false)) {
        const dlgOpen = await page.evaluate(() => { const d = document.getElementById('settingsDialog'); return !!(d && d.open); });
        if (!dlgOpen) { fails++; console.log('✗ ' + kind + ' ' + target + ': شريط عالق بعد الإغلاق ' + JSON.stringify(left)); }
      }
      if (!(await page.evaluate(() => mahaCallActive))) await startCall();
    }
    // طبقات تفتحها نافذة مها فوق نفسها (مراجعة النقض): عارض فيديو الصانع ومحرّر «كتابة وصوت» — زرّ الإغلاق يُلمس هو لا «م» ولا الشريط
    if (!(await page.evaluate(() => mahaCallActive))) await startCall();
    await page.evaluate(async () => mahaAppTool('open_in_app', { target: 'video' }));
    await page.waitForTimeout(800);
    const base0 = await page.evaluate(() => Array.from(document.querySelectorAll('.maha-gap-shift')).map((e) => e.id || e.className));
    const nested = [];
    for (const [label, opener, sel] of [['عارض الفيديو', '#vmkTutLink', '.vmk-lb .vmk-lb-x'], ['كتابة وصوت', '#vedTabBtn', '#vedModal .ved-x']]) {
      const opened = await page.evaluate((o) => { const b = document.querySelector(o); if (!b) return false; b.click(); return true; }, opener);
      await page.waitForTimeout(900);
      const r = await page.evaluate((sel) => {
        const x = document.querySelector(sel); if (!x) return { missing: true };
        const q = x.getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        return { self: !!h && (h === x || x.contains(h)), hit: h && (h.id || h.className), top: Math.round(q.top) };
      }, sel);
      const okN = opened && !r.missing && r.self;
      if (!okN) fails++;
      nested.push(label);
      console.log((okN ? '✓ ' : '✗ ') + kind + ' ' + label + ': زرّ الإغلاق ' + (r.missing ? 'غائب' : (r.self ? 'يُلمس (أعلاه ' + r.top + 'px)' : 'تحت ' + r.hit)) + (opened ? '' : ' (لم يُفتح)'));
      await page.evaluate((sel) => { const x = document.querySelector(sel); if (x) x.click(); }, sel);
      await page.waitForTimeout(400);
    }
    console.log('  مُزاح بلا طبقة مفتوحة: ' + JSON.stringify(base0));
    await page.evaluate(async () => { await mahaAppTool('app_action', { action: 'close_window' }); });
    await page.waitForTimeout(400);
    // لمسات يد حقيقيّة: داخل النافذة لا تُنهي، الشريط الفارغ لا يُنهي، «م» يُنهي
    await page.evaluate(() => { mahaEndCall = window.__origEnd; window.__ended = 0; });
    if (!(await page.evaluate(() => mahaCallActive))) await startCall();
    await page.evaluate(() => { mahaLastActivity = Date.now(); }); // مهلة السكوت (٢٠ ث) تبدأ من الآن
    const ov = await page.evaluate(async () => { const d = document.getElementById('settingsDialog'); if (d && d.open) closeDialogSafe(d); await new Promise((r) => setTimeout(r, 400)); const r = await mahaAppTool('open_in_app', { target: 'video' }); return { r, active: mahaCallActive, bar: !!document.getElementById('mahaWinBar'), body: document.body.className }; });
    await page.waitForTimeout(600);
    if (!ov.r || !ov.r.ok) console.log('  فتح للّمس: ' + JSON.stringify(ov));
    const pts = await page.evaluate(() => {
      const bar = document.getElementById('mahaWinBar').getBoundingClientRect();
      const m = document.getElementById('mahaDockMirror').getBoundingClientRect();
      const w = window.omranSwipeBack.top();
      for (const e of [w, ...w.querySelectorAll('*')]) { if (e.scrollTop) e.scrollTop = 0; }
      // نقطة ظاهرة داخل بطاقة النافذة (لا خلفيّتها): أوّل عنوان أو نصّ مرئيّ تحت الشريط
      let hr = null;
      for (const e of w.querySelectorAll('h3,h4,p,span,label')) { const r = e.getBoundingClientRect(); if (r.width > 20 && r.height > 8 && r.top > bar.bottom + 4 && r.bottom < innerHeight - 4) { const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (c && w.contains(c) && c !== w) { hr = r; break; } } }
      hr = hr || { left: innerWidth / 2 - 1, top: bar.bottom + 80, width: 2, height: 2 };
      const emptyX = document.documentElement.dir === 'rtl' ? bar.right - 40 : bar.left + 40;
      return { inside: [hr.left + hr.width / 2, hr.top + hr.height / 2], bar: [emptyX, bar.top + bar.height / 2], dock: [m.left + m.width / 2, m.top + m.height / 2] };
    });
    const tap = async (p) => { if (mobile) await page.touchscreen.tap(p[0], p[1]); else await page.mouse.click(p[0], p[1]); await page.waitForTimeout(350); return page.evaluate(() => mahaCallActive); };
    const t1 = await tap(pts.inside), t2 = await tap(pts.bar), t3 = await tap(pts.dock);
    const after = await page.evaluate(() => ({ bar: !!document.getElementById('mahaWinBar'), win: document.body.classList.contains('maha-win') }));
    const tapsOk = t1 === true && t2 === true && t3 === false && !after.bar;
    if (!tapsOk) fails++;
    console.log((tapsOk ? '✓ ' : '✗ ') + kind + ' لمسات: داخل النافذة→' + (t1 ? 'باقية' : 'انتهت') + ' · الشريط الفارغ→' + (t2 ? 'باقية' : 'انتهت') + ' · «م»→' + (t3 ? 'باقية' : 'انتهت') + ' · الشريط بعدها: ' + (after.bar ? 'باقٍ' : 'زال'));
    await page.screenshot({ path: path.join(OUT, MODE + '-' + kind + '-after-end.png') });
    if (errs.length) { console.log('أخطاء الصفحة ' + kind + ': ' + JSON.stringify(errs.slice(0, 5))); }
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}
fs.writeFileSync(path.join(OUT, 'real-' + MODE + '.json'), JSON.stringify(out, null, 1));
console.log(fails ? '✗ فشل ' + fails : '✓ كلّه سليم');
process.exit(fails ? 1 : 0);
