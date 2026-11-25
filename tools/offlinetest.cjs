#!/usr/bin/env node
// No-internet test: two players open the game once with the network (the service worker keeps it), then the network is
// cut: the first page and a world open from the device, and the two join a room with no site at all, by the codes their
// phones show each other (pasted here in place of the camera; the QR pictures are read back to check they hold the code).
//
//   node tools/offlinetest.cjs [--world barari] [--outdir out/_offline] [--strict 1]

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const n = process.argv[i + 1]; if (n === undefined || n.startsWith('--')) args[a.slice(2)] = true; else { args[a.slice(2)] = n; i++; } } }
const PROJECT = path.resolve(__dirname, '..');
const outdir = path.resolve(PROJECT, String(args.outdir || 'out/_offline'));
const world = String(args.world || 'barari');
fs.mkdirSync(outdir, { recursive: true });

(async () => {
  const root = PROJECT;
  let siteDown = false;
  const server = http.createServer((req, res) => {
    let rel; try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
    if (siteDown || rel.startsWith('/api/')) { req.socket.destroy(); return; }          // no internet: nothing answers
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, s) => { if (err || !s.isFile()) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const report = { world, checks: [], pageErrors: [], failed: [], files: [] };
  const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); };
  try {
    const ctxs = [];
    const open = async (who) => {
      const ctx = await browser.newContext({ viewport: { width: 900, height: 506 }, deviceScaleFactor: 1, locale: 'ar' });
      ctxs.push(ctx);
      if (args.strict) await ctx.addInitScript({ path: path.join(__dirname, 'strict-gl.js') });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => report.pageErrors.push(who + ': ' + String((e && e.stack) || e).slice(0, 500)));
      page.on('requestfailed', (r) => { if (!/\/api\//.test(r.url())) report.failed.push(who + ': ' + r.url().replace(base, '') + ' ' + ((r.failure() || {}).errorText || '')); });
      await page.goto(base, { waitUntil: 'load', timeout: 120000 });
      // (a promise is truthy to waitForFunction, so ask in a loop: kept on the device, and the page in the service worker's hands)
      let kept = false;
      for (let t0 = Date.now(); !kept && Date.now() - t0 < 180000;) { kept = await page.evaluate(async () => !!(await caches.match(new URL('__bw_ready', location.href).href)) && !!navigator.serviceWorker.controller); if (!kept) await page.waitForTimeout(500); }
      return { page, ctx, kept };
    };
    const A = await open('host'), B = await open('guest');
    check('the first visit keeps the whole game on the device', A.kept && B.kept, { host: A.kept, guest: B.kept });
    const nFiles = await A.page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks.find((k) => k.startsWith('bw-'))); return (await c.keys()).length; });
    report.keptFiles = nFiles;

    // ---- the internet goes
    siteDown = true;
    for (const x of [A, B]) await x.ctx.setOffline(true);
    const shot = async (page, name) => { const f = path.join(outdir, name + '.png'); await page.screenshot({ path: f, timeout: 120000 }); report.files.push(path.relative(PROJECT, f)); };
    for (const x of [A, B]) await x.page.reload({ waitUntil: 'load', timeout: 60000 });
    const first = await A.page.evaluate(async () => { await new Promise((r) => setTimeout(r, 800)); const o = document.querySelector('#menu .offline'); let api = 'answered'; try { await fetch('./api/play-room', { method: 'POST', body: '{}' }); } catch (e) { api = 'no network'; } return { cards: document.querySelectorAll('.cards .card').length, offline: o && !o.hidden ? o.textContent : '', online: navigator.onLine, api }; });
    check('with no internet the first page opens from the device and says so', first.cards === 5 && first.offline.includes('بدون نت') && first.online === false && first.api === 'no network', first);
    await shot(A.page, 'o1-first-page');

    // ---- a world opens with no internet, and the game starts
    const start = async (x) => {
      await x.page.click('button[data-world="' + world + '"]', { timeout: 30000 });
      const ok = await x.page.waitForFunction(() => window.__READY === true && !!window.__play, null, { timeout: 240000 }).then(() => true).catch(() => false);
      if (!ok) return false;
      await x.page.evaluate(() => { const p = window.__play; p.start = () => { p.state.running = true; }; if (window.__GAME_LIFE) window.__GAME_LIFE.setMonsters(false); });
      await x.page.click('#playPanel button');
      await x.page.evaluate(() => window.__play.tick(30));
      return true;
    };
    const wa = await start(A), wb = await start(B);
    check('the world opens and plays with no internet', wa && wb, { host: wa, guest: wb });
    const step = (page, n = 6) => page.evaluate((k) => { const p = window.__play; for (let i = 0; i < k; i++) p.advance(1 / 60); }, n);
    const both = async (rounds = 6) => { for (let i = 0; i < rounds; i++) { await step(A.page); await step(B.page); await A.page.waitForTimeout(60); } };
    const until = async (page, fn, ms = 20000) => { const t0 = Date.now(); for (;;) { if (await page.evaluate(fn)) return true; if (Date.now() - t0 > ms) return false; await both(2); } };
    const panelOf = (page) => page.evaluate(() => { if (document.pointerLockElement) document.exitPointerLock(); /* Esc lets the mouse go, in a real browser */ window.__game.panel.show('pause'); const b = [...document.querySelectorAll('#playPanel button')].find((q) => q.textContent.includes('العب مع ربعك')); if (b) b.click(); return !!b && !document.getElementById('netPanel').hidden; });

    // ---- the host opens a room with no internet
    const pa = await panelOf(A.page);
    const sect = await A.page.evaluate(() => { const box = document.querySelector('#netPanel .box'), l = box.querySelector('.local'); return { first: !!l && box.firstElementChild.nextElementSibling === l, text: l ? l.textContent : '' }; });
    check('with no internet the room panel shows «بدون نت» first', pa && sect.first && sect.text.includes('افتح غرفة بدون نت'), sect);
    await shot(A.page, 'o2-panel');
    // From here: a Wi-Fi or hotspot with no internet behind it. The local network is up and the site still answers nothing
    // (siteDown). The browser's own «offline» switch is let go: it also cuts the link between the two pages, which a
    // phone's Wi-Fi with no internet does not.
    for (const x of [A, B]) await x.ctx.setOffline(false);
    report.siteStillDown = await A.page.evaluate(async () => { try { await fetch('./api/play-room', { method: 'POST', body: '{}' }); return false; } catch (e) { return true; } });
    report.hit = await A.page.evaluate(() => { const b = document.querySelector('#netPanel [data-lhost]'), r = b.getBoundingClientRect(), at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { at: at && (at.tagName + '#' + at.id + '.' + at.className), r: [r.x, r.y, r.width, r.height], lock: !!document.pointerLockElement, n: document.querySelectorAll('#netPanel').length }; });
    await A.page.click('#netPanel [data-lhost]');
    await A.page.waitForSelector('#bwScan', { timeout: 10000 });
    const scanA = await A.page.evaluate(() => ({ role: window.__GAME_NET.role, local: window.__GAME_NET.local, title: document.querySelector('#bwScan h3').textContent }));
    check('opening the room asks to photograph the friend\'s code', scanA.role === 'host' && scanA.local && scanA.title.includes('صوّر كود'), scanA);
    await A.page.waitForTimeout(800);
    await shot(A.page, 'o3-host-camera');

    // ---- the guest shows its code
    await panelOf(B.page);
    await B.page.fill('#netPanel input.n', 'مزون');
    await B.page.click('#netPanel [data-ljoin]');
    const coded = await until(B.page, () => !!window.__GAME_NET.myCode, 15000);
    const gcode = await B.page.evaluate(async () => {
      const n = window.__GAME_NET, img = document.querySelector('#netPanel img.qr'), { readQR } = await import('./shared/localroom.js');
      await img.decode();
      return { code: n.myCode, len: n.myCode.length, readBack: await readQR(img, img.naturalWidth, img.naturalHeight), shown: img.getBoundingClientRect().width };
    });
    check('the guest\'s phone shows its code as a QR picture that reads back to the same code', coded && gcode.readBack === gcode.code && gcode.shown >= 180 && /^BWO1\./.test(gcode.code), { len: gcode.len, same: gcode.readBack === gcode.code, shown: gcode.shown });
    await shot(B.page, 'o4-guest-code');

    // ---- a wrong code first, then the guest's code, read by the host (pasted in place of the camera)
    const paste = async (page, text) => page.evaluate((t) => { const d = document.querySelector('#bwScan details'); d.open = true; d.querySelector('textarea').value = t; d.querySelector('button').click(); }, text);
    await paste(A.page, 'hello');
    await A.page.waitForTimeout(300);
    const wrongMsg = await A.page.evaluate(() => (document.querySelector('#bwScan .msg') || {}).textContent || '');
    check('a code that is not a room code is refused with a plain reason, and the camera stays open', wrongMsg.includes('مو كود') && !!(await A.page.$('#bwScan')), wrongMsg);
    await paste(A.page, gcode.code);
    const replied = await until(A.page, () => [...window.__GAME_NET.peers.values()].some((p) => p.reply), 15000);
    const reply = await A.page.evaluate(async () => {
      const p = [...window.__GAME_NET.peers.values()][0], img = document.querySelector('#netPanel img.qr'), { readQR } = await import('./shared/localroom.js');
      await img.decode();
      return { code: p.reply, name: p.name, readBack: await readQR(img, img.naturalWidth, img.naturalHeight), scanner: !!document.getElementById('bwScan') };
    });
    check('the host reads it, and shows its answer as a QR picture for the guest', replied && !reply.scanner && reply.name === 'مزون' && reply.readBack === reply.code && /^BWA1\./.test(reply.code), { name: reply.name, same: reply.readBack === reply.code, len: (reply.code || '').length });
    await shot(A.page, 'o5-host-answer');

    // ---- the guest reads the answer, and they are linked with no site at all
    await B.page.click('#netPanel [data-scan="answer"]');
    await B.page.waitForSelector('#bwScan', { timeout: 10000 });
    await paste(B.page, reply.code);
    const joined = await until(B.page, () => window.__GAME_NET.role === 'guest', 30000);
    await both(10);
    const link = await A.page.evaluate(() => { const n = window.__GAME_NET; return { peers: n.peers.size, open: [...n.peers.values()].every((p) => p.dc && p.dc.readyState === 'open'), others: n.others.size }; });
    const gText = await B.page.evaluate(() => document.querySelector('#netPanel .box').textContent);
    check('the guest is in the room, linked straight to the host over the local network (the site answering nothing)', joined && link.peers === 1 && link.open && gText.includes('غرفة بدون نت') && report.siteStillDown, { joined, link, siteDown: report.siteStillDown });
    await shot(B.page, 'o6-guest-in');

    // ---- what one does, the other sees
    for (const x of [A, B]) await x.page.evaluate(() => { const b = document.querySelector('#netPanel [data-back]'); if (b) b.click(); window.__game.panel.hide(); window.__play.state.running = true; });
    await both(12);
    const cell = await A.page.evaluate(() => { const s = window.__play.state, w = window.__play.world; const x = Math.floor(s.pos.x) + 2, z = Math.floor(s.pos.z) + 2; for (let y = Math.floor(s.pos.y) + 3; y > 1; y--) if (w.get(x, y, z)) return { x, y, z, id: w.get(x, y, z) }; return null; });
    await B.page.evaluate((c) => window.__play.net.dig(c.x, c.y, c.z), cell);
    const dug = await until(A.page, (c) => window.__play.world.get(c.x, c.y, c.z) === 0, 10000).catch(() => false);
    const dugNow = await A.page.evaluate((c) => window.__play.world.get(c.x, c.y, c.z), cell);
    check('a block the guest digs is dug in the host\'s world too', !!cell && dugNow === 0, { cell, dugNow, dug });
    const sees = await B.page.evaluate(() => { const o = [...window.__GAME_NET.others.values()][0]; return o && o.s ? { name: o.name, shown: o.av.group.visible } : null; });
    check('each sees the other', !!sees && sees.shown, sees);
    await shot(B.page, 'o7-guest-sees-host');
  } catch (e) {
    check('the test ran to the end', false, String((e && e.stack) || e).slice(0, 800));
  }
  check('no page errors', report.pageErrors.length === 0, report.pageErrors);
  check('nothing the game needs failed to load with no internet', report.failed.length === 0, report.failed.slice(0, 12));
  report.passed = report.checks.filter((c) => c.ok).length + '/' + report.checks.length;
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
  process.exit(report.checks.every((c) => c.ok) ? 0 : 1);
})();
