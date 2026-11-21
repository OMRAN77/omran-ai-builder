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
    const shot = async (name) => { const f = path.join(outdir, name + (touch ? '-touch' : '') + '.png'); await page.screenshot({ path: f, timeout: 120000 }); report.files.push(path.relative(PROJECT, f)); };

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

    // ---- running, flying, the bag and the building kit (worlds that have them)
    if (await page.evaluate(() => !!(window.__game && window.__game.bag && window.__game.kit))) {
      // simulate without drawing: every drawn frame costs seconds in software rendering and they queue up
      // a wide double-tap window: on a loaded machine two scripted presses can be far apart
      await page.evaluate(() => { window.__play.tuning.doubleTap = 900; window.__sim = (n) => { const p = window.__play; for (let i = 0; i < n; i++) p.advance(1 / 60); }; });
      const sim = (n) => page.evaluate((k) => window.__sim(k), n);
      const tap = async (code) => { await page.keyboard.down(code); await page.keyboard.up(code); };
      const jumpBox = touch ? await (await page.$('[data-act="jump"], .btn.jump')).boundingBox() : null;
      const holdJump = (on) => cdp.send('Input.dispatchTouchEvent', on ? { type: 'touchStart', touchPoints: [{ x: jumpBox.x + jumpBox.width / 2, y: jumpBox.y + jumpBox.height / 2, id: 9 }] } : { type: 'touchEnd', touchPoints: [] });
      const tapJump = async () => { await holdJump(true); await holdJump(false); };
      if (!touch) {
        await tap('KeyW'); await page.keyboard.down('KeyW');
        await sim(20);
        const run = await page.evaluate(() => window.__play.input.sprint);
        await page.keyboard.up('KeyW');
        await sim(10);
        check('double W runs, and stops when W is released', run === true && (await page.evaluate(() => window.__play.input.sprint)) === false, { run });
      }
      // fly: double Space (double tap on the jump button on a phone)
      if (touch) { await tapJump(); await tapJump(); } else { await tap('Space'); await tap('Space'); }
      await page.waitForTimeout(60);
      const f0 = await page.evaluate(() => { window.__sim(2); const s = window.__play.state; return { flying: s.flying, y: s.pos.y }; });
      if (touch) await holdJump(true); else await page.keyboard.down('Space');
      await page.waitForTimeout(1100);                                  // long enough that the next presses are not read as a double tap with this one
      const f1 = await page.evaluate(() => { window.__sim(50); return window.__play.state.pos.y; });
      if (touch) await holdJump(false); else await page.keyboard.up('Space');
      await page.waitForTimeout(60);
      const f2 = await page.evaluate(() => { window.__sim(60); const a = window.__play.state.pos.y; window.__sim(60); return { settled: a, later: window.__play.state.pos.y, flying: window.__play.state.flying }; });
      check('double Space flies: rises while held, hovers when released', f0.flying === true && f1 - f0.y > 2 && Math.abs(f2.later - f2.settled) < 0.05 && f2.flying === true, { f0, f1, f2 });
      await page.waitForTimeout(1100);
      if (touch) { await tapJump(); await tapJump(); } else { await tap('Space'); await tap('Space'); }
      await page.waitForTimeout(60);
      const f3 = await page.evaluate(() => { window.__sim(150); const s = window.__play.state; return { flying: s.flying, onGround: s.onGround }; });
      check('double Space again stops flying and the player comes down', f3.flying === false && f3.onGround === true, f3);

      // the bag: open, choose a square, choose an item
      if (touch) { const b = await (await page.$('[data-act="bag"]')).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); } else await page.keyboard.press('KeyE');
      await page.waitForTimeout(450);
      const bagOpen = await page.evaluate(() => ({ visible: !document.getElementById('bag').hidden, modal: window.__play.state.modal }));
      check('the bag opens and the game stops taking input', bagOpen.visible && bagOpen.modal, bagOpen);
      await page.evaluate(() => window.__play.tick(1));
      await shot('5-bag');
      const want = await page.evaluate(() => window.__game.bag.items.findIndex((it) => it.id === 104));
      const tapOn = async (sel) => { const r = await (await page.$(sel)).boundingBox(); if (touch) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); };
      await page.evaluate((n) => document.querySelector('#bag [data-item="' + n + '"]').scrollIntoView({ block: 'center' }), want);
      await tapOn('#bag [data-sq="1"]');
      await tapOn('#bag [data-item="' + want + '"]');
      await page.waitForTimeout(80);
      const got = await page.evaluate(() => { const s = window.__play.state; return { sel: s.sel, id: s.slots[1].id, n: s.slots[1].n }; });
      check('a square is chosen, then the item lands in it', got.sel === 1 && got.id === 104 && got.n === 64, got);
      await tapOn('#bag .x');
      await page.waitForTimeout(120);
      check('closing the bag gives the controls back', await page.evaluate(() => document.getElementById('bag').hidden && !window.__play.state.modal));
      check('the hotbar shows the new item', await page.evaluate(() => { const el = document.querySelector('[data-i="1"]'); return !!el && !!el.querySelector('img'); }));

      // kit blocks in the world. The test lays its own flat floor in the air and stands on it, so every world
      // gives the same open ground; each block is then placed by aiming at a chosen floor cell.
      const floor = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, w = g.world;
        const bx = Math.floor(s.pos.x), bz = Math.floor(s.pos.z), by = Math.min(w.sy - 8, Math.floor(s.pos.y) + 7);
        for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { g.terrain.setBlock(bx + dx, by, bz + dz, 101); for (let h = 1; h <= 4; h++) g.terrain.setBlock(bx + dx, by + h, bz + dz, 0); }
        g.terrain.flush();
        p.setFlying(false); s.pos.set(bx + 0.5, by + 1, bz + 0.5); s.vel.set(0, 0, 0); window.__sim(20);
        return { bx, by, bz, standing: s.onGround, y: s.pos.y };
      });
      check('the player stands on a floor of kit blocks', floor.standing && Math.abs(floor.y - (floor.by + 1)) < 0.01, floor);
      const put = (id, dx, dz) => page.evaluate(([id, dx, dz, f]) => {
        const g = window.__game, p = g.play, s = p.state;
        p.setSlot(s.sel, { id, n: 64, name: g.kit.nameOf(id), kit: true });
        const tx = f.bx + dx + 0.5, ty = f.by + 1, tz = f.bz + dz + 0.5, ex = s.pos.x, ey = s.pos.y + p.tuning.eye, ez = s.pos.z;
        s.yaw = Math.atan2(-(tx - ex), -(tz - ez)); s.pitch = Math.atan2(ty - ey, Math.hypot(tx - ex, tz - ez)); p.advance(0);
        const h = s.hit, c = { x: f.bx + dx, y: f.by + 1, z: f.bz + dz };
        if (!h || h.x !== c.x || h.y !== f.by || h.z !== c.z || h.ny !== 1) return { ok: false, why: 'aim missed', hit: h && [h.x, h.y, h.z, h.ny] };
        const ok = p.placeNow(); p.advance(0);
        return { ok, c, id: g.world.get(c.x, c.y, c.z) };
      }, [id, dx, dz, floor]);
      const paint = await put(104, 2, 0);
      check('a painted block is placed', paint.ok && paint.id === 104, paint);
      const slab = await put(120, -2, 0);
      const onSlab = slab.ok ? await page.evaluate((c) => { const s = window.__play.state, keep = s.pos.clone(); s.pos.set(c.x + 0.5, c.y + 2, c.z + 0.5); s.vel.set(0, 0, 0); window.__sim(90); const dy = s.pos.y - c.y; s.pos.copy(keep); s.vel.set(0, 0, 0); window.__sim(30); return dy; }, slab.c) : null;
      check('a half block is half a block high to stand on', slab.ok && Math.abs(onSlab - 0.5) < 0.02, { slab, onSlab });
      const lamp = await put(130, 0, 2);
      const lit = await page.evaluate(() => { const g = window.__game; window.__sim(30); return { tracked: g.kit.glow.size, on: g.kit.lights.filter((l) => l.intensity > 0).length }; });
      check('a lamp lights up', lamp.ok && lit.tracked >= 1 && lit.on >= 1, { lamp, lit });
      const bed = await put(160, 0, -2);
      const mate = bed.ok ? await page.evaluate((c) => { const w = window.__game.world; return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.get(c.x + dx, c.y, c.z + dz) === 161); }, bed.c) : false;
      check('a bed is two blocks long', bed.ok && mate, { bed, mate });
      const fire = await put(151, 2, 2);
      check('fire is placed', fire.ok && fire.id === 151, fire);
      const water = await put(150, -2, -2);
      const wet = water.ok ? await page.evaluate((c) => { const p = window.__play, s = p.state, keep = s.pos.clone(); s.pos.set(c.x + 0.5, c.y, c.z + 0.5); s.vel.set(0, 0, 0); p.advance(1 / 60); const w = s.inWater; s.pos.copy(keep); s.vel.set(0, 0, 0); window.__sim(20); return w; }, water.c) : false;
      check('placed water is water you swim in', water.ok && wet, { water, wet });
      // step back and look at what was built
      await page.evaluate((f) => { const p = window.__play, s = p.state; s.pos.set(f.bx + 0.5, f.by + 1, f.bz + 4.4); s.vel.set(0, 0, 0); s.yaw = 0; s.pitch = -0.42; p.advance(0); p.tick(1); }, floor);
      await shot('6-kit');
    }
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
