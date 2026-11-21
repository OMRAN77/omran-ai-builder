#!/usr/bin/env node
// Play test: opens a world in game mode in headless Chromium and checks that the controls
// really work (walk, turn, dig, place, hotbar; and the touch controls on a phone profile).
//
//   node tools/playtest.cjs --page "styles/<key>/index.html?play" --outdir out/<key>/_play
//                           [--device "iPhone 14 Pro landscape"]   touch run instead of desktop
//                           [--root dist --prefix /a/b]            serve another folder under a sub-path
//                           [--w 960 --h 540]
//                           [--strict 1]                           undefined shader maths gives NaN, as on real GPUs
//
// The page must expose window.__play (createPlay result) and window.__game = { world, ... }.
// Prints a JSON report; exit code 1 if any check failed or the page logged an error.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true; else { out[a.slice(2)] = next; i++; }
  }
  return out;
}
function serve(root, prefix) {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
    if (prefix) { if (!rel.startsWith(prefix + '/')) { res.writeHead(404); res.end('outside prefix: ' + rel); return; } rel = rel.slice(prefix.length); }
    const file = path.normalize(path.join(root, rel));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + rel); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.page) { console.error('usage: node tools/playtest.cjs --page "styles/<key>/index.html?play" [--device ..] [--outdir ..]'); process.exit(2); }
  const PROJECT = path.resolve(__dirname, '..');
  const root = path.resolve(PROJECT, String(args.root || '.'));
  const prefix = args.prefix ? String(args.prefix).replace(/\/+$/, '') : '';
  const outdir = path.resolve(PROJECT, String(args.outdir || 'out/_play'));
  fs.mkdirSync(outdir, { recursive: true });
  const touch = !!args.device;
  let contextOpts;
  if (touch) {
    const d = devices[String(args.device)];
    if (!d) { console.error('unknown device'); process.exit(2); }
    contextOpts = { ...d };
  } else contextOpts = { viewport: { width: Number(args.w || 960), height: Number(args.h || 540) }, deviceScaleFactor: 1 };
  contextOpts.locale = 'ar';

  const server = await serve(root, prefix);
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const report = { page: String(args.page), mode: touch ? 'touch' : 'desktop', checks: [], consoleErrors: [], pageErrors: [], failedRequests: [], files: [] };
  const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); };
  let failed = false;
  try {
    const ctx = await browser.newContext(contextOpts);
    // --strict 1: undefined shader maths gives NaN, as on real GPUs (see tools/strict-gl.js)
    if (args.strict) await ctx.addInitScript({ path: path.join(__dirname, 'strict-gl.js') });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 400)); });
    page.on('pageerror', (e) => report.pageErrors.push(String((e && e.stack) || e).slice(0, 700)));
    page.on('response', (r) => { if (r.status() >= 400) report.failedRequests.push(r.status() + ' ' + r.url().replace('http://127.0.0.1:' + port, '')); });
    if (args.cdn) {
      // The hosted build loads three.js from jsDelivr, which this sandbox cannot reach: serve the same pinned files from vendor/.
      await ctx.route('https://cdn.jsdelivr.net/npm/three@0.187.0/**', (route) => {
        const u = new URL(route.request().url()).pathname.replace('/npm/three@0.187.0/', '');
        const f = u.startsWith('build/') ? path.join(PROJECT, 'vendor', u.slice(6)) : u.startsWith('examples/jsm/') ? path.join(PROJECT, 'vendor/addons', u.slice(13)) : null;
        if (!f || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'not vendored: ' + u });
        report.cdn = (report.cdn || 0) + 1;
        return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
      });
      await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => { report.fontRequests = (report.fontRequests || 0) + 1; return route.fulfill({ status: 200, contentType: route.request().url().includes('googleapis') ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: '' }); });
    }
    const t0 = Date.now();
    await page.goto('http://127.0.0.1:' + port + prefix + '/' + String(args.page).replace(/^\/+/, ''), { waitUntil: 'load', timeout: 180000 });
    if (args.pick) await page.click(String(args.pick), { timeout: 60000 });          // e.g. a world card in the launcher
    await page.waitForFunction(() => window.__READY === true && !!window.__play, null, { timeout: 240000 });
    report.loadMs = Date.now() - t0;
    const shot = async (name) => { const f = path.join(outdir, name + (touch ? '-touch' : '') + '.png'); await page.screenshot({ path: f }); report.files.push(path.relative(PROJECT, f)); };

    check('start panel is shown', await page.isVisible('#playPanel'), await page.textContent('#playPanel h1'));
    await shot('1-start');
    // Software rendering takes seconds per frame, so a free-running loop would bury the GPU in queued
    // frames. Start the game without its frame loop and step it by hand instead.
    await page.evaluate(() => { const p = window.__play; p.start = () => { p.state.running = true; }; });
    await page.click('#playPanel button');
    await page.waitForTimeout(200);
    check('game is running after pressing start', await page.evaluate(() => window.__play.state.running));
    check('start panel is hidden', !(await page.isVisible('#playPanel')));
    // drive the simulation by hand from here on: frames are very slow in software rendering
    const snap = () => page.evaluate(() => { const s = window.__play.state; return { x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.yaw, pitch: s.pitch, onGround: s.onGround, hit: s.hit && { x: s.hit.x, y: s.hit.y, z: s.hit.z, id: s.hit.id, nx: s.hit.nx, ny: s.hit.ny, nz: s.hit.nz }, sel: s.sel, slots: s.slots.map((q) => ({ id: q.id || 0, n: q.n ?? null })), broken: s.broken, placed: s.placed }; });
    report.pointerLock = await page.evaluate(() => !!document.pointerLockElement);
    await page.evaluate(() => { window.__play.tick(30); });     // settle on the ground
    const a = await snap();
    check('player stands on the ground at spawn', a.onGround && Number.isFinite(a.y), a);

    // ---- dig the block under the crosshair
    check('a block is targeted at spawn', !!a.hit, a.hit);
    if (a.hit) {
      const before = await page.evaluate((h) => window.__game.world.get(h.x, h.y, h.z), a.hit);
      await page.evaluate(() => { const p = window.__play; p.input.dig = true; p.tick(90); p.input.dig = false; p.tick(1); });
      const b = await snap();
      const after = await page.evaluate((h) => window.__game.world.get(h.x, h.y, h.z), a.hit);
      check('holding dig removes the targeted block', before !== 0 && after === 0, { before, after, broken: b.broken });
      check('the terrain mesh was rebuilt around the edit', await page.evaluate(() => window.__game.terrain.liveChunks()) > 0);
      const gained = b.slots.some((q, i) => q.n !== null && a.slots[i].n !== null && q.n === a.slots[i].n + 1);
      report.collected = gained;
      await shot('2-dug');
      // ---- place a block from the first block slot that has stock
      const idx = b.slots.findIndex((q) => q.id && q.n > 0);
      await page.evaluate((i) => { const p = window.__play; p.state.yaw += Math.PI; p.state.pitch = -0.9; if (i >= 0) p.select(i); p.tick(1); }, idx);   // face away from the hole, look at the ground ahead
      const c0 = await snap();
      if (idx >= 0 && c0.hit) {
        const ok = await page.evaluate(() => window.__play.placeNow());
        const c1 = await snap();
        const put = await page.evaluate((h) => window.__game.world.get(h.x + h.nx, h.y + h.ny, h.z + h.nz), c0.hit);
        check('place puts the selected block in the world', ok && put === c0.slots[idx].id && c1.placed === c0.placed + 1 && c1.slots[idx].n === c0.slots[idx].n - 1, { ok, slot: idx, put, n0: c0.slots[idx].n, n1: c1.slots[idx].n });
        await page.evaluate(() => window.__play.tick(1));
        await shot('3-placed');
      } else check('place puts the selected block in the world', false, { idx, hit: c0.hit });
      await page.evaluate(() => { window.__play.state.pitch = -0.15; });
    }

    // ---- jump, on the ground where the game starts (the walk below can end in water or under a roof)
    const cdpJ = touch ? await ctx.newCDPSession(page) : null;
    const j0 = await snap();
    if (touch) { const r = await (await page.$('[data-act="jump"], .btn.jump')).boundingBox(); await cdpJ.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 7 }] }); }
    else await page.keyboard.down('Space');
    await page.waitForTimeout(60);
    await page.evaluate(() => { window.__play.advance(1 / 60); });
    if (touch) await cdpJ.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.keyboard.up('Space');
    await page.waitForTimeout(60);
    const jy = await page.evaluate(() => { const p = window.__play; let top = p.state.pos.y; for (let i = 0; i < 40; i++) { p.advance(1 / 60); top = Math.max(top, p.state.pos.y); } p.tick(40); return top; });
    check('jump lifts the player about one block', jy - j0.y > 0.9 && jy - j0.y < 2.2, { rise: jy - j0.y });

    // ---- walk and turn
    const w0 = await snap();
    let cdp = null, stickAt = null;
    if (touch) {
      // real touch events: push the stick up, drag the view, press jump
      cdp = await ctx.newCDPSession(page);
      const box = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
      const st = await box('[data-act="stick"], .stick'), vw = page.viewportSize();
      stickAt = { x: st.x, y: st.y - st.h * 0.4 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: st.x, y: st.y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: st.x, y: st.y - st.h * 0.4, id: 1 }] });
      await page.waitForTimeout(100);
      const fz = await page.evaluate(() => window.__play.input.fz);
      check('touch: pushing the stick up walks forward', fz > 0.5, { fz });
      await page.evaluate(() => window.__play.tick(60));
      const yaw0 = (await snap()).yaw;
      const lx = vw.width * 0.62, ly = vw.height * 0.45;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: st.x, y: st.y - st.h * 0.4, id: 1 }, { x: lx, y: ly, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: st.x, y: st.y - st.h * 0.4, id: 1 }, { x: lx + 80, y: ly, id: 2 }] });
      await page.waitForTimeout(100);
      const yaw1 = (await snap()).yaw;
      check('touch: dragging on the screen turns the view', Math.abs(yaw1 - yaw0) > 0.2, { yaw0, yaw1 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(100);
      check('touch: releasing the stick stops', (await page.evaluate(() => window.__play.input.fz)) === 0);
      for (const [name, sel, probe] of [['jump', '[data-act="jump"], .btn.jump', 'jump'], ['dig', '[data-act="dig"], .btn.dig', 'dig']]) {
        const el = await page.$(sel);
        if (!el) { check('touch: ' + name + ' button exists', false, sel); continue; }
        const r = await el.boundingBox();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 3 }] });
        await page.waitForTimeout(80);
        const on = await page.evaluate((k) => { const p = window.__play; p.advance(0); return k === 'jump' ? p.input.jump : p.input.dig; }, probe);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(80);
        const off = await page.evaluate((k) => { const p = window.__play; p.advance(0); return k === 'jump' ? p.input.jump : p.input.dig; }, probe);
        check('touch: holding the ' + name + ' button acts, releasing stops', on === true && off === false, { on, off });
      }
      // tapping a hotbar slot selects it
      const slot = await page.$('[data-i="2"]');
      if (slot) { const r = await slot.boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(80); check('touch: tapping a hotbar slot selects it', (await snap()).sel === 2, (await snap()).sel); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: st.x, y: st.y, id: 5 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stickAt.x, y: stickAt.y, id: 5 }] });
      await page.waitForTimeout(80);
    } else {
      // real keyboard + mouse events
      await page.keyboard.down('KeyW');
      await page.evaluate(() => window.__play.tick(60));
      await page.keyboard.up('KeyW');
      const k1 = await snap();
      check('keyboard: W walks forward', Math.hypot(k1.x - w0.x, k1.z - w0.z) > 1.5, { moved: Math.hypot(k1.x - w0.x, k1.z - w0.z) });
      if (report.pointerLock) {
        // headless Chromium reports no movement for scripted mouse moves while the pointer is captured, so send the event itself
        await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 120, movementY: 0, bubbles: true })));
        check('mouse: moving the mouse turns the view', Math.abs((await snap()).yaw - k1.yaw) > 0.1, { yaw0: k1.yaw, yaw1: (await snap()).yaw });
      }
      await page.keyboard.press('Digit3');
      check('keyboard: digit keys select a slot', (await snap()).sel === 2, (await snap()).sel);
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(50);
      check('mouse wheel moves the selection', (await snap()).sel === 3, (await snap()).sel);
      await page.keyboard.down('KeyW');
    }
    await page.evaluate(() => { window.__play.tick(150); });
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.keyboard.up('KeyW');
    await page.waitForTimeout(60);
    await page.evaluate(() => { window.__play.tick(20); });
    const w1 = await snap();
    const dist = Math.hypot(w1.x - w0.x, w1.z - w0.z);
    check('walking moves the player and keeps them on the terrain', dist > 2 && Number.isFinite(w1.y) && w1.y > 0 && w1.y < 200, { dist, from: [w0.x, w0.y, w0.z], to: [w1.x, w1.y, w1.z] });
    const inside = await page.evaluate(() => { const p = window.__play, s = p.state, T = p.tuning, w = window.__game.world; let bad = 0; for (let y = Math.floor(s.pos.y + 0.01); y <= Math.floor(s.pos.y + T.height - 0.01); y++) { const id = w.get(Math.floor(s.pos.x), y, Math.floor(s.pos.z)); if (id && p.isSolid(id)) bad++; } return bad; });
    check('the player is not stuck inside a block', inside === 0, { inside });
    await shot('4-walked');
    report.final = await snap();
    report.info = await page.evaluate(() => (typeof window.__info === 'function' ? window.__info() : null));
  } catch (e) {
    failed = true;
    report.error = String((e && e.stack) || e).slice(0, 900);
  } finally {
    await browser.close();
    server.close();
  }
  if (report.pageErrors.length || report.consoleErrors.length || report.failedRequests.length || report.checks.some((c) => !c.ok)) failed = true;
  report.passed = report.checks.filter((c) => c.ok).length + '/' + report.checks.length;
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed ? 1 : 0);
})();
