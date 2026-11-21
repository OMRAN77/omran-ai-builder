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
    // creatures stay out of the way until their own section: a monster attack would disturb the other checks
    await page.evaluate(() => { if (window.__GAME_LIFE) window.__GAME_LIFE.setMonsters(false); if (window.__game && window.__game.life) { const l = window.__game.life; l.kinds.forEach((k) => { k.max0 = k.max; k.max = 0; }); } });
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
      // the hand holds what the selected square holds: a block here, the tool again on the tool's square
      const hand = await page.evaluate(() => {
        const p = window.__play;
        const find = () => { let g = null; window.__game.camera.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && Array.isArray(o.material) && o.parent && o.parent.visible && o.visible) g = o; }); return !!g; };
        const withBlock = find();
        const tool = p.state.slots.findIndex((q) => q && q.tool);
        if (tool >= 0) p.select(tool);
        const withTool = find();
        p.select(1);
        return { withBlock, withTool, tool };
      }).catch((e) => ({ error: String(e).slice(0, 200) }));
      if (!hand.error) check('the hand shows the selected block, and the tool on the tool square', hand.withBlock === true && hand.withTool === false, hand);

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
    // ---- living vitals (worlds that have them): needs run down, a fall hurts, the need's own cure works, death respawns
    if (await page.evaluate(() => !!(window.__game && window.__game.vitals))) {
      const sim2 = (n) => page.evaluate((k) => { const p = window.__play; for (let i = 0; i < k; i++) p.advance(1 / 60); }, n);
      const vals = () => page.evaluate(() => ({ ...window.__game.vitals.values }));
      await page.evaluate(() => { const g = window.__game, s = g.play.state; g.play.setFlying(false); s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); for (const k of Object.keys(g.vitals.values)) g.vitals.values[k] = 60; });
      await sim2(30);
      const v0 = await vals();
      await sim2(900);
      const v1 = await vals();
      const need = await page.evaluate(() => window.__game.vitals.needs.filter((n) => n.hurts !== false).map((n) => ({ key: n.key, how: n.how, home: n.home || null }))[0]);
      check('the need runs down over time', v1[need.key] < v0[need.key] - 2, { need: need.key, before: v0[need.key], after: v1[need.key] });
      // the cure
      const cured = await page.evaluate((n) => {
        const g = window.__game, p = g.play, s = p.state, w = g.world, before = g.vitals.values[n.key];
        const x = Math.floor(s.pos.x), y = Math.floor(s.pos.y + 0.01), z = Math.floor(s.pos.z);
        if (n.how === 'fire') { g.terrain.setBlock(x + 1, y, z, 151); g.kit.placed(x + 1, y, z, 151, 0); }
        else if (n.how === 'water') { g.terrain.setBlock(x, y, z, 150); }
        else if (n.how === 'home') { s.pos.x = n.home.x; s.pos.z = n.home.z; s.pos.y = w.sy - 6; s.vel.set(0, 0, 0); p.setFlying(true); }
        g.terrain.flush();
        for (let i = 0; i < 240; i++) p.advance(1 / 60);
        const after = g.vitals.values[n.key];
        if (n.how === 'fire') g.terrain.setBlock(x + 1, y, z, 0); else if (n.how === 'water') g.terrain.setBlock(x, y, z, 0); else p.setFlying(false);
        g.terrain.flush();
        return { before, after };
      }, need);
      check('the cure for it works (fire / water / home)', cured.after > cured.before + 10, { need, cured });
      // a long fall hurts
      const fall = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state;
        p.setFlying(false); s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y + 16, g.vitals.spawn.z); s.vel.set(0, 0, 0); g.vitals.values.hp = 90;
        for (let i = 0; i < 200; i++) p.advance(1 / 60);
        return { hp: g.vitals.values.hp, onGround: s.onGround };
      });
      check('a long fall costs health', fall.onGround && fall.hp < 88 && fall.hp > 0, fall);
      // an empty need drains health, and at zero the player is sent back with health restored
      const death = await page.evaluate((key) => {
        const g = window.__game, p = g.play, s = p.state, d0 = g.vitals.deaths;
        s.pos.x += 3; g.vitals.values[key] = 0; g.vitals.values.hp = 3;
        for (let i = 0; i < 400 && g.vitals.deaths === d0; i++) { g.vitals.values[key] = 0; p.advance(1 / 60); }
        return { deaths: g.vitals.deaths - d0, hp: g.vitals.values.hp, back: Math.hypot(s.pos.x - g.vitals.spawn.x, s.pos.z - g.vitals.spawn.z) < 0.6 };
      }, need.key);
      check('at zero health the player returns to the start with health restored', death.deaths === 1 && death.hp > 90 && death.back, death);
      check('the HUD shows the live numbers', await page.evaluate(() => { const g = window.__game, k = g.vitals.needs[0].key, n = Math.round(g.vitals.values[k]); return [...document.querySelectorAll('.num, .v-num')].some((el) => el.offsetParent !== null && el.textContent.trim().replace('%', '') === String(n)); }));
    }
    // ---- creatures (worlds that have them): an animal wanders and can be hunted for meat that heals; a monster comes and hurts
    if (await page.evaluate(() => !!(window.__game && window.__game.life))) {
      const r = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, life = g.life, v = g.vitals.values, out = {};
        const sim = (n) => { for (let i = 0; i < n; i++) p.advance(1 / 60); };
        const keep = () => { for (const k of Object.keys(v)) v[k] = Math.max(v[k], 80); };
        p.setFlying(false); s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); window.__GAME_LIFE.setMonsters(true);
        life.kinds.forEach((k) => { if (k.max0 != null) k.max = k.max0; });
        while (life.ents.length) { life.ents[0].hp = 0; life.ents[0].dead = 2; sim(1); }
        keep(); sim(5);
        // find open ground a few blocks away for the test animals
        const spot = (d) => { for (let a = 0; a < 6.28; a += 0.4) { const e = life.spawnAt(life.kinds.find((k) => k.kind === 'animal').key, s.pos.x + Math.sin(a) * d, s.pos.z + Math.cos(a) * d); if (e) return e; } return null; };
        const a = spot(5);
        if (!a) return { error: 'no ground for an animal' };
        const a0 = [a.x, a.z]; let moved = 0;
        for (let i = 0; i < 40 && moved < 0.5; i++) { sim(30); keep(); moved = Math.hypot(a.x - a0[0], a.z - a0[1]); }
        out.animalMoved = moved;
        // hunt it: stand next to it, face it, hold the hit
        const face = (e) => { const ex = s.pos.x, ey = s.pos.y + p.tuning.eye, ez = s.pos.z, tx = e.x, ty = e.y + e.k.height * 0.5, tz = e.z; s.yaw = Math.atan2(-(tx - ex), -(tz - ez)); s.pitch = Math.atan2(ty - ey, Math.hypot(tx - ex, tz - ez)); };
        const meat0 = (s.slots.find((q) => q && q.id === 200) || { n: 0 }).n;
        p.input.dig = true;
        let hits = 0;
        for (let i = 0; i < 900 && a.hp > 0; i++) { if (Math.hypot(a.x - s.pos.x, a.z - s.pos.z) > 2.2) { s.pos.x = a.x + 1.4; s.pos.z = a.z; s.pos.y = a.y; s.vel.set(0, 0, 0); } face(a); p.advance(1 / 60); keep(); if (life.aimed === a) hits++; }
        p.input.dig = false; sim(80);
        out.animalDead = a.hp <= 0; out.aimedFrames = hits;
        const meat = s.slots.find((q) => q && q.id === 200);
        out.meat = meat ? meat.n - meat0 : 0;
        // eat: the place button on the meat square
        if (meat) { p.select(s.slots.indexOf(meat)); v.hp = 40; if (v.food != null) v.food = 30; const n0 = meat.n; p.placeNow(); out.ate = { hp: v.hp, food: v.food ?? null, used: n0 - meat.n }; }
        // a monster comes and hurts
        keep(); v.hp = 100;
        const mk = life.kinds.find((k) => k.kind === 'monster');
        let m = null; for (let a2 = 0; a2 < 6.28 && !m; a2 += 0.4) m = life.spawnAt(mk.key, s.pos.x + Math.sin(a2) * 7, s.pos.z + Math.cos(a2) * 7);
        if (!m) return { ...out, error: 'no ground for a monster' };
        const d0 = Math.hypot(m.x - s.pos.x, m.z - s.pos.z);
        let closest = d0;
        for (let i = 0; i < 1200 && v.hp > 95; i++) { p.advance(1 / 60); for (const k of Object.keys(v)) if (k !== 'hp') v[k] = 80; closest = Math.min(closest, Math.hypot(m.x - s.pos.x, m.z - s.pos.z)); }
        out.monster = { d0, closest, hp: v.hp };
        // with monsters switched off they leave and do no harm
        window.__GAME_LIFE.setMonsters(false); v.hp = 100; sim(300);
        out.off = { monsters: life.ents.filter((e) => e.k.kind === 'monster' && e.hp > 0).length, hp: v.hp };
        window.__GAME_LIFE.setMonsters(true);
        return out;
      });
      check('an animal wanders on its own', !r.error && r.animalMoved >= 0.5, r);
      check('striking an animal kills it and gives meat', r.animalDead === true && r.meat > 0 && r.aimedFrames > 0, r);
      check('eating the meat feeds and restores some health', !!r.ate && r.ate.used === 1 && r.ate.hp > 45 && (r.ate.food === null || r.ate.food >= 65), r.ate);
      check('a monster closes in and hurts the player', !!r.monster && r.monster.closest < r.monster.d0 - 2 && r.monster.hp < 100, r.monster);
      check('with monsters switched off none remain and nothing hurts', !!r.off && r.off.monsters === 0 && r.off.hp === 100, r.off);
      await page.evaluate(() => { const g = window.__game, p = g.play, s = p.state; const a = g.life.spawnAt(g.life.kinds[0].key, s.pos.x, s.pos.z - 3) || g.life.spawnAt(g.life.kinds[0].key, s.pos.x + 3, s.pos.z); const m = g.life.spawnAt(g.life.kinds.find((k) => k.kind === 'monster').key, s.pos.x + 2.5, s.pos.z - 4); const t = a || m; if (t) { s.yaw = Math.atan2(-(t.x - s.pos.x), -(t.z - s.pos.z)); s.pitch = -0.12; } for (const k of Object.keys(g.vitals.values)) g.vitals.values[k] = 90; p.advance(1 / 60); p.tick(1); });
      await shot('7-creatures');
    }
    // ---- hearts, food, armour and experience over the hotbar (worlds that have the strip)
    if (await page.evaluate(() => !!(window.__game && window.__game.status))) {
      const s1 = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, v = g.vitals.values;
        window.__GAME_LIFE.setMonsters(false);
        g.life.kinds.forEach((k) => { k.max0 = k.max; k.max = 0; });
        for (let i = 0; i < 400 && g.life.ents.length; i++) { g.life.ents[0].hp = 0; g.life.ents[0].dead = 2; p.advance(1 / 60); }
        p.setFlying(false); s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0);
        for (const k of Object.keys(v)) v[k] = 80;
        const count = (sel) => ({ full: document.querySelectorAll('#statusStrip ' + sel + ' .cell.full').length, half: document.querySelectorAll('#statusStrip ' + sel + ' .cell.half').length });
        v.hp = 55; v.food = 30; p.tick(1);
        const out = { hearts: count('.hearts'), food: count('.food'), strip: document.getElementById('statusStrip').getBoundingClientRect().width > 200 };
        // food runs down by itself, and an empty stomach costs health
        const f0 = v.food; for (let i = 0; i < 900; i++) { p.advance(1 / 60); for (const k of Object.keys(v)) if (k !== 'food' && k !== 'hp') v[k] = 80; }
        out.drain = f0 - v.food;
        v.food = 0; v.hp = 50; for (let i = 0; i < 120; i++) { p.advance(1 / 60); v.food = 0; for (const k of Object.keys(v)) if (k !== 'food' && k !== 'hp') v[k] = 80; }
        out.starve = v.hp;
        for (const k of Object.keys(v)) v[k] = 90;
        // experience: a broken block is a point, ten points are the first level
        s.xp = 9; p.tick(1); const l0 = document.querySelector('#statusStrip .lvl').textContent;
        s.xp = 10; p.tick(1);
        out.level = [l0, document.querySelector('#statusStrip .lvl').textContent, g.status.level];
        // armour: wearing it shows on the strip
        const arm0 = !document.querySelector('#statusStrip .armor').hidden;
        g.life.use({ use: 'wear' }); p.tick(1);
        out.armor = [arm0, !document.querySelector('#statusStrip .armor').hidden, g.life.armor];
        g.life.use({ use: 'wear' }); p.tick(1);
        return out;
      });
      check('ten hearts and ten portions show health and food by halves', s1.strip && s1.hearts.full === 5 && s1.hearts.half === 1 && s1.food.full === 3 && s1.food.half === 0, s1);
      check('food runs down, and with none left health falls', s1.drain > 1.5 && s1.starve < 48, { drain: s1.drain, hp: s1.starve });
      check('ten points of experience make level 1', s1.level[0] === '0' && s1.level[1] === '1' && s1.level[2] === 1, s1.level);
      check('worn armour shows on the strip', s1.armor[0] === false && s1.armor[1] === true && s1.armor[2] > 0, s1.armor);
      const xp = await page.evaluate(() => window.__play.state.xp);
      check('breaking blocks and hunting earned experience', xp >= 10, { xp });
    }
    // ---- the world panel (worlds that have it): Q opens it; the time of day and the rain change the picture
    if (await page.evaluate(() => !!(window.__game && window.__game.weather))) {
      const tapOn = async (sel) => { const r = await (await page.$(sel)).boundingBox(); if (touch) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); };
      await page.evaluate(() => { const g = window.__game, p = g.play, s = p.state; p.setFlying(false); s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); s.yaw = g.vitals.spawn.yaw; s.pitch = 0.12; for (const k of Object.keys(g.vitals.values)) g.vitals.values[k] = 90; p.tick(30); });
      if (touch) { const b = await (await page.$('[data-act="bag"]')).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(450); await tapOn('#bag .extra'); } else await page.keyboard.press('KeyQ');
      await page.waitForTimeout(450);
      const open = await page.evaluate(() => ({ visible: !document.getElementById('skyPanel').hidden, modal: window.__play.state.modal, bag: !document.getElementById('bag').hidden, times: [...document.querySelectorAll('#skyPanel [data-time]')].map((b) => b.dataset.time), on: (document.querySelector('#skyPanel [data-time].on') || {}).textContent }));
      check('the world panel opens (Q, or the button in the bag) and the game stops taking input', open.visible && open.modal && !open.bag && open.times.length >= 3, open);
      // mean brightness of the drawn picture, read back right after a draw
      const lum = () => page.evaluate(() => {
        const p = window.__play; p.tick(2);
        const src = document.querySelector('canvas'), c = document.createElement('canvas'); c.width = 64; c.height = 36;
        const x = c.getContext('2d'); x.drawImage(src, 0, 0, 64, 36);
        const d = x.getImageData(0, 0, 64, 20).data; let s = 0;                  // the upper part: sky and far ground, clear of the hand
        for (let i = 0; i < d.length; i += 4) s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
        return s / (d.length / 4);
      });
      const seen = {};
      for (const t of open.times) {
        await tapOn('#skyPanel [data-time="' + t + '"]');
        await page.waitForTimeout(60);
        seen[t] = { lum: await lum(), state: await page.evaluate(() => window.__GAME_SKY.time) };
        await page.evaluate(() => { document.getElementById('skyPanel').style.visibility = 'hidden'; window.__play.tick(1); });
        await shot('8-' + t);
        await page.evaluate(() => { document.getElementById('skyPanel').style.visibility = ''; });
      }
      const day = open.times.find((t) => t !== 'night' && t !== 'sunset');
      check('each time of day is applied, and the night is darker than the day', open.times.every((t) => seen[t].state === t && Number.isFinite(seen[t].lum) && seen[t].lum > 1) && seen.night.lum < seen[day].lum * 0.8, seen);
      await tapOn('#skyPanel [data-time="' + day + '"]');
      await tapOn('#skyPanel [data-rain="1"]');
      await page.waitForTimeout(60);
      const rain = await page.evaluate(() => { const g = window.__game, p = g.play; for (let i = 0; i < 240; i++) g.weather.update(1 / 60); p.tick(2); return { state: window.__GAME_SKY.rain, visible: g.weather.rain.visible, amt: g.weather.rain.material.uniforms.uAmt.value, sound: window.__GAME_SOUND ? window.__GAME_SOUND.raining : null }; });
      const rainLum = await lum();
      check('rain falls, sounds, and dims the day', rain.state === true && rain.visible && rain.amt > 0.9 && rain.sound !== false && rainLum < seen[day].lum, { rain, rainLum, day: seen[day].lum });
      await page.evaluate(() => { document.getElementById('skyPanel').style.visibility = 'hidden'; window.__play.tick(1); });
      await shot('8-rain');
      await page.evaluate(() => { document.getElementById('skyPanel').style.visibility = ''; });
      await tapOn('#skyPanel [data-mon="0"]');
      const monOff = await page.evaluate(() => window.__GAME_LIFE.monsters);
      await tapOn('#skyPanel [data-mon="1"]');
      check('the panel switches the monsters off and on', monOff === false && (await page.evaluate(() => window.__GAME_LIFE.monsters)) === true, { monOff });
      await page.evaluate(() => window.__play.tick(1));
      await shot('9-panel');
      await tapOn('#skyPanel [data-rain="0"]');
      await tapOn('#skyPanel .x');
      await page.waitForTimeout(120);
      check('closing the panel gives the controls back', await page.evaluate(() => document.getElementById('skyPanel').hidden && !window.__play.state.modal));
    }
    const snd = await page.evaluate(() => { const s = window.__GAME_SOUND; return s ? { played: s.stats.played, muted: s.muted } : null; });
    check('sounds were played for digging, placing and walking', !!snd && snd.played >= 6, snd);
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
