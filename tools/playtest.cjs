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
      // the survival mode (the default) has no catalogue page; the creative mode has it
      check('in the survival mode the bag has no catalogue page', await page.evaluate(() => { const b = document.querySelector('#bag [data-tab="all"]'); return !!b && b.hidden; }));
      await page.evaluate(() => { window.__GAME_RULES.set('mode', 'creative'); window.__game.bag.setTab('mine'); });
      check('in the creative mode it does', await page.evaluate(() => !document.querySelector('#bag [data-tab="all"]').hidden));
      await tapOn('#bag [data-tab="all"]');                   // the catalogue page
      await page.waitForTimeout(60);
      await page.evaluate((n) => document.querySelector('#bag [data-item="' + n + '"]').scrollIntoView({ block: 'center' }), want);
      await tapOn('#bag [data-sq="1"]');
      await tapOn('#bag [data-item="' + want + '"]');
      await page.waitForTimeout(80);
      const got = await page.evaluate(() => { const s = window.__play.state; return { sel: s.sel, id: s.slots[1].id, n: s.slots[1].n }; });
      check('a square is chosen, then the item lands in it', got.sel === 1 && got.id === 104 && got.n === 64, got);
      await page.evaluate(() => window.__GAME_RULES.set('mode', 'survival'));        // the rest of the checks are about the survival rules (hurt, hunger)
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
        // nothing spawns by itself during these checks (a second monster arriving by chance would end them early); the test puts in what it needs
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
        const carried = () => [...s.slots, ...s.pack].find((q) => q && q.id === 200);
        const meat0 = (carried() || { n: 0 }).n;
        p.input.dig = true;
        let hits = 0;
        for (let i = 0; i < 900 && a.hp > 0; i++) { if (Math.hypot(a.x - s.pos.x, a.z - s.pos.z) > 2.2) { s.pos.x = a.x + 1.4; s.pos.z = a.z; s.pos.y = a.y; s.vel.set(0, 0, 0); } face(a); p.advance(1 / 60); keep(); if (life.aimed === a) hits++; }
        p.input.dig = false; sim(80);
        out.animalDead = a.hp <= 0; out.aimedFrames = hits;
        const meat = carried();
        out.meat = meat ? meat.n - meat0 : 0;
        out.meatIn = meat ? (s.slots.includes(meat) ? 'bar' : 'pack') : null;
        // with a full hotbar the meat is in the backpack: the player moves it to a square (the bag does this) before eating
        if (meat && !s.slots.includes(meat)) { const k = s.slots.length - 1, i = s.pack.indexOf(meat); s.pack[i] = s.slots[k]; s.slots[k] = meat; p.changed(); }
        // eat: the place button on the meat square
        // look at the ground while eating: with the trader under the crosshair the same button would open his page instead
        if (meat) { p.select(s.slots.indexOf(meat)); v.hp = 40; if (v.food != null) v.food = 30; const n0 = meat.n; s.pitch = -1.45; p.advance(1 / 60); p.placeNow(); out.ate = { hp: v.hp, food: v.food ?? null, used: n0 - meat.n }; }
        // a monster comes and hurts
        keep(); v.hp = 100;
        const mk = life.kinds.find((k) => k.kind === 'monster');
        // from the start point, where the ground is open; a monster put down behind a wall or a prop stays there, so other sides are tried
        s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); sim(5);
        let m = null, d0 = 0, closest = 0, tries = 0;
        for (let a2 = 0; a2 < 6.28 && v.hp > 95; a2 += 0.7) {
          m = life.spawnAt(mk.key, s.pos.x + Math.sin(a2) * 7, s.pos.z + Math.cos(a2) * 7);
          if (!m) continue;
          tries++; d0 = Math.hypot(m.x - s.pos.x, m.z - s.pos.z); closest = d0;
          for (let i = 0; i < 600 && v.hp > 95; i++) { p.advance(1 / 60); for (const k of Object.keys(v)) if (k !== 'hp') v[k] = 80; closest = Math.min(closest, Math.hypot(m.x - s.pos.x, m.z - s.pos.z)); }
          if (v.hp > 95) { m.hp = 0; m.dead = 2; sim(2); }
        }
        if (!tries) return { ...out, error: 'no ground for a monster' };
        out.monster = { d0, closest, hp: v.hp, tries };
        // with monsters switched off they leave and do no harm
        window.__GAME_LIFE.setMonsters(false); v.hp = 100; sim(300);
        out.off = { monsters: life.ents.filter((e) => e.k.kind === 'monster' && e.hp > 0).length, hp: v.hp };
        window.__GAME_LIFE.setMonsters(true);
        life.kinds.forEach((k) => { if (k.max0 != null) k.max = k.max0; });
        return out;
      });
      check('an animal wanders on its own', !r.error && r.animalMoved >= 0.5, r);
      check('striking an animal kills it and gives meat', r.animalDead === true && r.meat > 0 && r.aimedFrames > 0, r);
      check('eating the meat feeds and restores some health', !!r.ate && r.ate.used === 1 && r.ate.hp > 45 && (r.ate.food === null || r.ate.food >= 65), { ...r.ate, modal: await page.evaluate(() => window.__play.state.modal), mode: await page.evaluate(() => window.__GAME_RULES.mode), bag: await page.evaluate(() => !document.getElementById('bag').hidden) });
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
        const keep = s.slots[s.sel];
        s.slots[s.sel] = { id: 220, kit: true, name: 'خوذة ألماس', n: 1, tool: true, use: 'wear', wear: 'head', prot: 0.08 };
        g.life.use(s.slots[s.sel]); p.tick(1);
        out.armor = [arm0, !document.querySelector('#statusStrip .armor').hidden, g.life.armor, !!s.gear.head && s.gear.head.id === 220];
        s.gear.head = null; s.slots[s.sel] = keep; p.changed(); p.tick(1);
        return out;
      });
      check('ten hearts and ten portions show health and food by halves', s1.strip && s1.hearts.full === 5 && s1.hearts.half === 1 && s1.food.full === 3 && s1.food.half === 0, s1);
      check('food runs down, and with none left health falls', s1.drain > 1.5 && s1.starve < 48, { drain: s1.drain, hp: s1.starve });
      check('ten points of experience make level 1', s1.level[0] === '0' && s1.level[1] === '1' && s1.level[2] >= 1, s1.level);      // quests and achievements may add points of their own on the same frame
      check('a worn piece of armour goes to its place and shows on the strip', s1.armor[0] === false && s1.armor[1] === true && s1.armor[2] > 0 && s1.armor[3] === true, s1.armor);
      const xp = await page.evaluate(() => window.__play.state.xp);
      check('breaking blocks and hunting earned experience', xp >= 10, { xp });
    }
    // ---- the backpack, clothing, crafting, the chest and the door (worlds whose bag has them)
    if (await page.evaluate(() => !!(window.__game && window.__game.bag && window.__game.bag.craft))) {
      const tapOn = async (sel) => { const r = await (await page.$(sel)).boundingBox(); if (touch) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); };
      const prep = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, kitItem = (id, n) => { const it = g.bag.items.find((q) => q.id === id); return { ...it, n: n ?? it.n }; };
        p.setFlying(false); s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); p.tick(5);
        s.pack.fill(null); for (const k of Object.keys(s.gear)) s.gear[k] = null;
        s.pack[0] = kitItem(140, 5); s.pack[1] = kitItem(220, 1);
        const woodId = g.bag.craft.mats.wood.ids[0];
        for (const list of [s.slots, s.pack]) for (const q of list) if (q && g.bag.craft.idsOf('wood').includes(q.id)) q.n = 0;      // only the pile the test puts in counts
        s.pack[2] = kitItem(woodId, 10);
        p.changed();
        return { bar: s.slots.length, woodId, wood: g.bag.craft.count('wood'), pile: !!p.itemOf && !!p.itemOf(woodId) };
      });
      check('the hotbar has nine squares on a desktop, and what is dug can start a new pile', (touch ? prep.bar >= 5 : prep.bar === 9) && prep.pile && prep.wood === 10, prep);
      if (touch) { const b = await (await page.$('[data-act="bag"]')).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); } else await page.keyboard.press('KeyE');
      await page.waitForTimeout(450);
      await tapOn('#bag [data-tab="mine"]');
      await page.waitForTimeout(60);
      const mine = await page.evaluate(() => ({ pack: document.querySelectorAll('#bag [data-z="pack"]').length, gear: document.querySelectorAll('#bag [data-z="gear"]').length, bar: document.querySelectorAll('#bag [data-z="bar"]').length, fits: document.querySelector('#bag .box').getBoundingClientRect().bottom <= window.innerHeight + 1 }));
      check('my things: 27 places, four for clothing and the other hand, and the hotbar', mine.pack === 27 && mine.gear === 5 && mine.bar >= 5 && mine.fits, mine);
      await tapOn('#bag [data-z="pack"][data-k="0"]'); await tapOn('#bag [data-z="pack"][data-k="12"]');
      await tapOn('#bag [data-z="pack"][data-k="1"]'); await tapOn('#bag [data-z="gear"][data-k="head"]');
      await tapOn('#bag [data-z="pack"][data-k="12"]'); await tapOn('#bag [data-z="gear"][data-k="chest"]');       // gold is not clothing: refused
      await tapOn('#bag [data-z="pack"][data-k="12"]');                                                             // (lets go of it again if it is still held)
      const moved = await page.evaluate(() => { const s = window.__play.state; return { from: s.pack[0], to: s.pack[12] && s.pack[12].id, n: s.pack[12] && s.pack[12].n, head: s.gear.head && s.gear.head.id, chest: s.gear.chest, armor: window.__game.life.armor }; });
      check('tap a thing, then a place: it moves; clothing goes on, and only where it fits', moved.from === null && moved.to === 140 && moved.n === 5 && moved.head === 220 && moved.chest === null && moved.armor > 0, moved);
      await page.evaluate(() => window.__play.tick(1));
      await shot('10-mine');
      // crafting: the workbench by hand, the chest only beside a workbench
      await tapOn('#bag [data-tab="craft"]');
      await page.waitForTimeout(60);
      await tapOn('#bag [data-rec="0"]');
      const made = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, all = [...s.slots, ...s.pack];
        const out = { table: all.filter((q) => q && q.id === 171).reduce((a, q) => a + q.n, 0), wood: g.bag.craft.count('wood'), crafted: s.crafted, far: g.bag.craft.make(5) };
        const x = Math.floor(s.pos.x) + 1, y = Math.floor(s.pos.y + 0.01), z = Math.floor(s.pos.z);
        out.was = g.world.get(x, y, z); g.terrain.setBlock(x, y, z, 171); g.terrain.flush();
        out.near = g.bag.craft.tableNear(); out.chest = g.bag.craft.make(5);
        out.has = [...s.slots, ...s.pack].some((q) => q && q.id === 170); out.woodLeft = g.bag.craft.count('wood');
        g.terrain.setBlock(x, y, z, out.was); g.terrain.flush();
        return out;
      });
      check('a workbench is made by hand from four wood', made.table === 1 && made.wood === 6 && made.crafted === 1, made);
      check('a chest needs a workbench nearby, and is made beside one', typeof made.far === 'string' && made.near === true && made.chest === true && made.has && made.woodLeft === 0, made);
      await page.evaluate(() => window.__play.tick(1));
      await shot('11-craft');
      await tapOn('#bag .x');
      await page.waitForTimeout(120);
      // the chest keeps things; the door opens and shuts
      const home = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, w = g.world, out = {};
        const y = Math.floor(s.pos.y + 0.01), fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
        const cx = Math.floor(s.pos.x + fx * 2.5), cz = Math.floor(s.pos.z + fz * 2.5);
        const keep = [[cx, y, cz], [cx, y + 1, cz], [cx + 1, y, cz]].map(([x, yy, z]) => [x, yy, z, w.get(x, yy, z)]);
        for (const [x, yy, z] of keep) g.terrain.setBlock(x, yy, z, 0);
        g.terrain.setBlock(cx, y, cz, 173); g.kit.placed(cx, y, cz, 173, s.yaw); g.terrain.flush();
        out.door = [w.get(cx, y, cz), w.get(cx, y + 1, cz), g.kit.doors.size, p.isSolid(w.get(cx, y, cz))];
        out.used = g.bag.interact({ x: cx, y: y + 1, z: cz, id: w.get(cx, y + 1, cz) });
        g.terrain.flush();
        out.open = [w.get(cx, y, cz), w.get(cx, y + 1, cz), p.isSolid(w.get(cx, y, cz)), s.modal];
        g.terrain.setBlock(cx + 1, y, cz, 170); g.terrain.flush();
        out.spot = [cx, y, cz];
        return out;
      });
      check('a door is two cells tall, shut it is solid, and the button opens it', home.door[0] === 173 && home.door[1] === 174 && home.door[2] === 1 && home.door[3] === true && home.used === true && home.open[0] === 175 && home.open[1] === 176 && home.open[2] === false && home.open[3] === false, home);
      await page.evaluate(() => { const s = window.__play.state; s.pitch = -0.1; window.__play.tick(2); });
      await shot('12-door');
      const chest = await page.evaluate((spot) => {
        const g = window.__game, s = g.play.state, [cx, y, cz] = spot;
        const opened = g.bag.interact({ x: cx + 1, y, z: cz, id: 170 });
        return { opened, modal: s.modal, cells: document.querySelectorAll('#bag [data-z="chest"]').length, count: s.opened };
      }, home.spot);
      await page.waitForTimeout(450);
      await tapOn('#bag [data-z="pack"][data-k="12"]'); await tapOn('#bag [data-z="chest"][data-k="0"]');
      await page.evaluate(() => window.__play.tick(1));
      await shot('13-chest');
      const stored = await page.evaluate((spot) => { const g = window.__game, s = g.play.state, [cx, y, cz] = spot, c = g.kit.chestAt(cx + 1, y, cz); return { inChest: c[0] && c[0].id, n: c[0] && c[0].n, pack: s.pack[12] }; }, home.spot);
      await tapOn('#bag .x');
      await page.waitForTimeout(120);
      const back = await page.evaluate((spot) => {
        const g = window.__game, p = g.play, s = p.state, [cx, y, cz] = spot;
        g.terrain.setBlock(cx + 1, y, cz, 0); g.kit.broke({ x: cx + 1, y, z: cz, id: 170 });           // breaking the chest gives back what was in it
        const gold = [...s.slots, ...s.pack].filter((q) => q && q.id === 140).reduce((a, q) => a + q.n, 0);
        g.bag.interact({ x: cx, y, z: cz, id: g.world.get(cx, y, cz) });                                 // shut the door again
        const shut = g.world.get(cx, y, cz);
        g.terrain.setBlock(cx, y, cz, 0); g.kit.broke({ x: cx, y, z: cz, id: 173 }); g.terrain.flush();
        const feats = window.__GAME_FEATS.list();
        return { gold, shut, gone: [g.world.get(cx, y, cz), g.world.get(cx, y + 1, cz), g.kit.doors.size], modal: s.modal, feats: feats.length, done: feats.filter((q) => q.done).map((q) => q.key) };
      }, home.spot);
      check('a chest opens, takes a thing, and gives it back when broken', chest.opened === true && chest.modal === true && chest.cells === 27 && chest.count >= 1 && stored.inChest === 140 && stored.n === 5 && stored.pack === null && back.gold === 5, { chest, stored, back });
      check('the door shuts again, and breaking it removes both halves', back.shut === 173 && back.gone[0] === 0 && back.gone[1] === 0 && back.gone[2] === 0 && back.modal === false, back);
      await page.evaluate(() => { const p = window.__play; for (let i = 0; i < 200; i++) p.advance(1 / 60); p.tick(1); });
      const feats = await page.evaluate(() => { const l = window.__GAME_FEATS.list(); return { n: l.length, done: l.filter((q) => q.done).map((q) => q.key) }; });
      check('achievements are earned from what was done (digging, making, the chest)', feats.n >= 12 && ['dig1', 'craft', 'chest'].every((k) => feats.done.includes(k)), feats);
    }
    // ---- quests, secrets, the day's treasure, outfits, the trader, the view from behind (worlds whose bag has the adventure)
    if (await page.evaluate(() => !!(window.__game && window.__game.bag && window.__game.bag.adv))) {
      const tapOn = async (sel) => { const r = await (await page.$(sel)).boundingBox(); if (touch) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); };
      const a0 = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, adv = g.bag.adv, kitItem = (id, n) => { const it = g.bag.items.find((q) => q.id === id); return { ...it, n: n ?? it.n }; };
        p.setFlying(false); s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); for (const k of Object.keys(g.vitals.values)) g.vitals.values[k] = 90;
        const t = adv.treasure, out = { treasure: t, block: t ? g.world.get(t.x, t.y, t.z) : -1, far: t ? Math.hypot(t.x - s.pos.x, t.z - s.pos.z) : 0, quests: adv.quests().length, secrets: adv.secrets().length, trader: adv.traderAt, deals: adv.deals.length };
        s.pack[20] = kitItem(g.bag.craft.mats.wood.ids[0], 8);                      // the first quest: eight wood
        for (let i = 0; i < 90; i++) p.advance(1 / 60);
        out.first = adv.quests()[0].done; out.xp = s.xp;
        return out;
      });
      check('a treasure chest stands somewhere away from the start, and there are quests and a trader', !!a0.treasure && a0.block === 170 && a0.far >= 24 && a0.quests >= 8 && !!a0.trader && a0.deals === 7, a0);
      check('doing what a quest asks completes it', a0.first === true, { first: a0.first, xp: a0.xp });
      if (touch) { const b = await (await page.$('[data-act="bag"]')).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); } else await page.keyboard.press('KeyE');
      await page.waitForTimeout(450);
      await tapOn('#bag [data-tab="quests"]');
      await page.waitForTimeout(80);
      const qp = await page.evaluate(() => { const cv = document.querySelector('#bag .tmap canvas'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; return { map: lit / (d.length / 4), items: document.querySelectorAll('#bag .quests li').length, looks: document.querySelectorAll('#bag .look').length, locked: document.querySelectorAll('#bag .look.locked').length }; });
      check('the quests page shows the map, the quests and the outfits', qp.map > 0.9 && qp.items >= 9 && qp.looks >= 12 && qp.locked >= 10, qp);
      await page.evaluate(() => window.__play.tick(1));
      await shot('14-quests');
      await tapOn('#bag .x');
      await page.waitForTimeout(120);
      // find the treasure: go to it, open it
      const tr = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, adv = g.bag.adv, t = adv.treasure;
        s.pos.set(t.x + 0.5, t.y, t.z + 2.2); s.vel.set(0, 0, 0); s.yaw = 0; s.pitch = -0.35; p.tick(3);
        const hit = s.hit && { x: s.hit.x, y: s.hit.y, z: s.hit.z, id: s.hit.id };
        const used = p.placeNow();
        return { hit, used, foundToday: adv.foundToday, found: adv.found, modal: s.modal, gold: (g.kit.chestAt(t.x, t.y, t.z)[0] || {}).id };
      });
      await page.waitForTimeout(450);
      await page.evaluate(() => window.__play.tick(1));
      await shot('15-treasure');
      check('the chest of the day is found by going to it and opening it', !!tr.hit && tr.hit.id === 170 && tr.used === true && tr.foundToday === true && tr.found === 1 && tr.modal === true && tr.gold === 140, tr);
      await tapOn('#bag .x');
      await page.waitForTimeout(120);
      // a secret: the top of the world; its rare outfit is put on
      const sec = await page.evaluate(() => { const g = window.__game, p = g.play, s = p.state; p.setFlying(true); s.pos.y = g.world.sy - 8; s.vel.set(0, 0, 0); for (let i = 0; i < 60; i++) { s.pos.y = g.world.sy - 8; p.advance(1 / 60); } return { secrets: g.bag.adv.secrets().map((q) => q.key) }; });
      await page.waitForTimeout(2600);
      const look = await page.evaluate(() => { const g = window.__game, p = g.play, s = p.state; p.setFlying(false); s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); s.yaw = g.vitals.spawn.yaw; s.pitch = 0; g.vitals.values.hp = 100; p.tick(3); return { current: g.bag.adv.wardrobe.current, owned: [...g.bag.adv.wardrobe.owned] }; });
      check('a secret is found by doing it, and gives a rare outfit that is put on', sec.secrets.includes('sky') && look.owned.includes('pilot') && look.current !== 'explorer', { sec, look });      // (finding the treasure is a secret too, with an outfit of its own)
      // the view from behind shows the figure and hides the hand
      const third = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, cam = g.camera;
        s.third = true; p.tick(2);
        let handShown = 0; cam.traverse((o) => { if (o !== cam && o.isMesh && o.layers.test(cam.layers) && o.visible) handShown++; });
        const out = { figure: g.bag.adv.me.group.visible, handShown };
        return out;
      });
      await shot('16-behind');
      const first = await page.evaluate(() => { const g = window.__game, p = g.play, s = p.state; s.third = false; p.tick(2); return { figure: g.bag.adv.me.group.visible }; });
      check('V shows the player from behind in the outfit, without the first-person hand', third.figure === true && third.handShown === 0 && first.figure === false, { third, first });
      // the trader: stand in front, press the place button, make a deal
      const deal = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, adv = g.bag.adv, t = adv.traderAt, kitItem = (id, n) => { const it = g.bag.items.find((q) => q.id === id); return { ...it, n: n ?? it.n }; };
        // stand a few steps away on whatever ground is there, then look at the trader's chest
        s.pos.set(t.x, t.y + 1.5, t.z + 2.6); s.vel.set(0, 0, 0); for (let i = 0; i < 60; i++) p.advance(1 / 60);
        const ex = s.pos.x, ey = s.pos.y + p.tuning.eye, ez = s.pos.z;
        s.yaw = Math.atan2(-(t.x - ex), -(t.z - ez)); s.pitch = Math.atan2(t.y + 1.05 - ey, Math.hypot(t.x - ex, t.z - ez)); p.tick(3);
        const near = adv.traderNear;
        s.pack[21] = kitItem(140, 9); s.pack[22] = kitItem(141, 4);
        const used = p.placeNow();
        return { near, used, modal: s.modal, tab: g.bag.tab };
      });
      await page.waitForTimeout(450);
      const offers = await page.evaluate(() => document.querySelectorAll('#bag [data-deal]').length);
      await tapOn('#bag [data-deal="6"]');                      // the trader's cloak, for four diamonds
      await page.evaluate(() => window.__play.tick(1));
      await shot('17-trade');
      const bought = await page.evaluate(() => { const g = window.__game, s = g.play.state; return { cloak: g.bag.adv.wardrobe.owned.has('merchant'), diamonds: g.bag.craft.count(141), traded: s.traded || 0 }; });
      check('the trader is spoken to with the place button, and a deal changes hands', deal.near === true && deal.used === true && deal.modal === true && deal.tab === 'trade' && offers === 7 && bought.cloak === true && bought.diamonds === 0 && bought.traded === 1, { deal, offers, bought });
      await tapOn('#bag .x');
      await page.waitForTimeout(120);
      await page.evaluate(() => { const g = window.__game, p = g.play, s = p.state, t = g.bag.adv.traderAt; s.pos.set(t.x + 1.2, t.y, t.z + 3.4); s.yaw = 0.35; s.pitch = -0.05; p.tick(2); });
      await shot('18-trader');
      // a bed at night: sleep till morning
      const slept = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state;
        if (!g.weather) return { skip: true };
        s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); p.tick(2);
        g.weather.set('night', false);
        const day = g.bag.interact({ x: 0, y: 0, z: 0, id: 160 });
        const t = window.__GAME_SKY.time;
        g.weather.set(g.weather.state.time === 'morning' ? (window.__GAME_SKY.time) : 'morning', false);
        g.weather.set('night', false);
        const used = g.bag.interact({ x: 0, y: 0, z: 0, id: 160 });
        const after = window.__GAME_SKY.time;
        g.weather.set('morning', false);
        const byDay = g.bag.interact({ x: 0, y: 0, z: 0, id: 160 });
        const dayAfter = window.__GAME_SKY.time;
        g.weather.set('morning', false);
        return { day, t, used, after, byDay, dayAfter, slept: s.slept };
      });
      if (!slept.skip) check('a bed at night sleeps the player through to the morning; by day it rests until night', slept.used === true && slept.after === 'morning' && slept.byDay === true && slept.dayAfter === 'night' && slept.slept >= 1, slept);
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
    // ---- fire that burns on contact, building on water, the day's cave with its gems, the diamond set, the player's own design
    if (await page.evaluate(() => !!(window.__game && window.__game.bag && window.__game.bag.adv && 'cave' in window.__game.bag.adv))) {
      const fw = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, v = g.vitals.values, w = g.world, out = {};
        window.__GAME_LIFE.setMonsters(false); g.life.kinds.forEach((k) => { if (k.max0 == null) k.max0 = k.max; k.max = 0; });
        p.setFlying(false); s.third = false; s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); p.tick(20);
        const x = Math.floor(s.pos.x), y = Math.floor(s.pos.y + 0.01), z = Math.floor(s.pos.z);
        // a fire in the next cell: standing against it burns, a step away does not
        const keep = [[x + 1, y, z], [x + 1, y + 1, z]].map(([a, b, c]) => [a, b, c, w.get(a, b, c)]);
        for (const [a, b, c] of keep) g.terrain.setBlock(a, b, c, 0);
        g.terrain.setBlock(x + 1, y, z, 151); g.terrain.flush();
        for (const k of Object.keys(v)) v[k] = 100;
        for (let i = 0; i < 90; i++) { s.pos.x = x + 0.2; s.pos.z = z + 0.5; p.advance(1 / 60); }
        out.away = v.hp;
        for (let i = 0; i < 90; i++) { s.pos.x = x + 0.66; s.pos.z = z + 0.5; p.advance(1 / 60); }
        out.touching = v.hp;
        for (const [a, b, c, id] of keep) g.terrain.setBlock(a, b, c, id);
        g.terrain.flush(); for (const k of Object.keys(v)) v[k] = 100;
        // water two blocks below eye level ahead: a block in hand is put on its surface
        s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); p.tick(3);
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), ax = Math.abs(fx) > Math.abs(fz) ? Math.sign(fx) : 0, az = ax ? 0 : Math.sign(fz);
        const X = Math.floor(s.pos.x), Y = Math.floor(s.pos.y + 0.01), Z = Math.floor(s.pos.z), pool = [];
        for (let d = 1; d <= 3; d++) for (const h of [0, 1, 2]) pool.push([X + ax * d, Y + h, Z + az * d]);
        const was = pool.map(([a, b, c]) => w.get(a, b, c));
        for (const [a, b, c] of pool) g.terrain.setBlock(a, b, c, 0);
        g.terrain.setBlock(X + ax * 2, Y, Z + az * 2, 150); g.terrain.flush();
        const paint = g.bag.items.find((q) => q.id === 104); s.slots[0] = { ...paint, n: 5 }; s.sel = 0; p.changed();
        s.yaw = Math.atan2(-ax, -az); s.pitch = Math.atan2(Y + 0.9 - (s.pos.y + p.tuning.eye), 2); p.tick(2);
        out.solidHit = s.hit && [s.hit.x, s.hit.y, s.hit.z, s.hit.id];
        out.placed = p.placeNow();
        out.onWater = w.get(X + ax * 2, Y + 1, Z + az * 2);
        pool.forEach(([a, b, c], i) => g.terrain.setBlock(a, b, c, was[i])); g.terrain.flush();
        return out;
      });
      check('fire burns whoever stands against it, not whoever stands a step away', fw.away === 100 && fw.touching < 90, { away: fw.away, touching: fw.touching });
      check('a block is built on the surface of water', fw.placed === true && fw.onWater === 104, fw);
      const cv = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, w = g.world, c = g.bag.adv.cave, kitItem = (id, n) => { const it = g.bag.items.find((q) => q.id === id); return { ...it, n: n ?? it.n }; };
        if (!c) return null;
        const out = { mouth: c.mouth, cells: c.cells, gold: c.gold.length, diamond: c.diamond.length, torches: c.torches, hall: w.get(c.hall.x, c.hall.y, c.hall.z), vein: w.get(c.diamond[0][0], c.diamond[0][1], c.diamond[0][2]) };
        // stand in the hall and dig the first diamond vein for real
        s.pos.set(c.hall.x + 0.5, c.hall.y - 2, c.hall.z + 0.5); s.vel.set(0, 0, 0); for (let i = 0; i < 40; i++) p.advance(1 / 60);
        out.standing = [s.onGround, Math.round(s.pos.y)];
        s.pack.fill(null);
        const gems0 = g.bag.craft.count(231);
        for (const d of c.diamond.slice(0, 4)) { const id = w.get(d[0], d[1], d[2]); g.terrain.setBlock(d[0], d[1], d[2], 0); p.give(kitItem(g.kit.dropOf(id), 1)); }
        g.terrain.flush();
        out.gems = g.bag.craft.count(231) - gems0;
        // the set of four pieces from four gems, beside a workbench
        const x = Math.floor(s.pos.x) + 1, y = Math.floor(s.pos.y + 0.01), z = Math.floor(s.pos.z), was = w.get(x, y, z);
        g.terrain.setBlock(x, y, z, 171); g.terrain.flush();
        const i = g.bag.craft.list().findIndex((r) => r.out === 220 && r.needs[0].what === 231);
        out.recipe = g.bag.craft.list()[i] && g.bag.craft.list()[i].item.name;
        out.made = g.bag.craft.make(i);
        out.pieces = [220, 211, 222, 223].map((id) => [...s.slots, ...s.pack].some((q) => q && q.id === id));
        out.gemsLeft = g.bag.craft.count(231);
        g.terrain.setBlock(x, y, z, was); g.terrain.flush();
        p.tick(2);
        return out;
      });
      check('today\'s cave is dug into the ground, lit, with veins of gold and diamond', !!cv && cv.cells > 300 && cv.diamond >= 4 && cv.gold >= 4 && cv.torches >= 3 && cv.hall === 0 && cv.vein === 179 && cv.standing[0] === true, cv);
      check('four gems dug in the cave make the set of four diamond pieces', !!cv && cv.gems === 4 && cv.made === true && cv.pieces.every(Boolean) && cv.gemsLeft === 0 && String(cv.recipe).includes('طقم'), cv);
      await page.evaluate(() => { const g = window.__game, s = g.play.state, c = g.bag.adv.cave; if (!c) return; s.yaw += 0.6; s.pitch = 0.05; g.play.tick(3); });
      await page.evaluate(() => { window.__game.panel.hide(); window.__play.state.running = true; window.__play.tick(1); });
      await shot('24-cave');
      const design = await page.evaluate(() => {
        const g = window.__game, wd = g.bag.adv.wardrobe, n = g.bag.net;
        const ok = wd.design('shirt', '#ff0044'), bad = wd.design('shirt', 'javascript:alert(1)'), cape = wd.design('cape', '#112233');
        const name = n.setName('  نورة<b>  ');
        return { ok, bad, cape, current: wd.current, shirt: wd.look.shirt, capeNow: wd.look.cape, listed: wd.list()[0].key, name, kept: window.localStorage.getItem('bw-name') };
      });
      check('the player designs their own look in colours, and changes their name', design.ok === true && design.bad === false && design.current === 'custom' && design.shirt === '#ff0044' && design.capeNow === '#112233' && design.listed === 'custom' && design.name === 'نورةb' && design.kept === 'نورةb', design);
    }
    // ---- gadgets, friendly creatures and surprises (worlds whose bag has them)
    if (await page.evaluate(() => !!(window.__GAME_GADGETS && window.__GAME_FRIENDS && window.__GAME_EVENTS))) {
      const home = () => page.evaluate(() => { const g = window.__game, p = g.play, s = p.state; if (!s.modal) { /* as it is */ } p.setFlying(false); s.third = false; s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); s.yaw = g.vitals.spawn.yaw; s.pitch = 0; for (const k of Object.keys(g.vitals.values)) g.vitals.values[k] = 100; p.tick(5); });
      await home();
      const gad = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, G = window.__GAME_GADGETS, adv = g.bag.adv, it = (id) => ({ ...g.bag.items.find((q) => q.id === id) }), out = {};
        out.catalogue = [240, 241, 242, 243, 244, 245, 246].every((id) => !!g.bag.items.find((q) => q.id === id));
        // the detector reads the way to a treasure put down by the test (today's own may be found already)
        s.slots[0] = it(240); s.sel = 0; p.changed(); p.tick(3);
        out.detector = { shown: !G.detect.hidden, text: G.detect.textContent };
        // the magic map
        s.slots[0] = it(242); p.changed(); p.tick(3); G.drawMap();
        const d = G.mapEl.querySelector('canvas').getContext('2d').getImageData(0, 0, 96, 96).data; let lit = 0, red = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] + d[i + 1] + d[i + 2] > 80) lit++; if (d[i] > 190 && d[i + 1] < 80 && d[i + 2] < 80) red++; }
        out.map = { shown: !G.mapEl.hidden, lit: lit / (96 * 96), red };
        // the place crystal: remember here, walk off, come back
        s.slots[0] = it(245); p.changed(); p.tick(2);
        out.putAway = { detector: G.detect.hidden, map: G.mapEl.hidden };      // neither is in the hand now: both are gone from the screen
        const here = [s.pos.x, s.pos.y, s.pos.z];
        const u1 = p.placeNow(); const marked = !!s.mark;
        s.pos.x += 9; s.pos.y += 6; p.tick(2);
        const u2 = p.placeNow(); p.tick(2);
        out.recall = { u1, marked, u2, back: Math.hypot(s.pos.x - here[0], s.pos.z - here[2]) < 0.2, cleared: s.mark === null };
        // the trader's caller
        s.slots[0] = it(244); p.changed();
        const u3 = p.placeNow(); out.phone = { u3, tab: g.bag.tab, modal: s.modal }; g.bag.close();
        // the extra pouch
        s.slots[0] = it(243); p.changed();
        const u4 = p.placeNow(); out.pouch = { u4, cells: document.querySelectorAll('#bag [data-z="chest"]').length, title: (document.querySelector('#bag .page:not([hidden]) h3') || {}).textContent }; g.bag.close();
        s.slots[0] = it(241); p.changed();
        return out;
      });
      const shotTaken = await page.evaluate(() => new Promise((res) => { const g = window.__game, p = g.play, G = window.__GAME_GADGETS; const used = p.placeNow(); let n = 0; const t = setInterval(() => { if (G.lastPhoto || ++n > 300) { clearInterval(t); res({ used, photo: G.lastPhoto, photos: p.state.photos }); } }, 100); }));      // (a phone-sized picture takes this headless browser a while to encode)
      check('the detector and the magic map work while held, and leave the screen when put away', gad.catalogue && gad.detector.shown && (gad.detector.text.includes('الكنز') || gad.detector.text.includes('كنز')) && gad.map.shown && gad.map.lit > 0.5 && gad.map.red > 5 && gad.putAway.detector === true && gad.putAway.map === true, { detector: gad.detector, map: gad.map, putAway: gad.putAway });
      check('the place crystal remembers a spot and brings the player back; the caller opens the trader; the pouch opens 27 places', gad.recall.u1 && gad.recall.marked && gad.recall.u2 && gad.recall.back && gad.recall.cleared && gad.phone.u3 === true && gad.phone.tab === 'trade' && gad.pouch.u4 === true && gad.pouch.cells === 27 && String(gad.pouch.title).includes('الشنطة'), gad);
      check('the camera takes a picture of the world and saves it', shotTaken.used === true && !!shotTaken.photo && shotTaken.photo.size > 5000 && shotTaken.photo.name.endsWith('.png') && shotTaken.photos >= 1, shotTaken);
      // the crystal fox leads to a treasure; the dragon hatches and carries
      await home();
      const fr = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, F = window.__GAME_FRIENDS, adv = g.bag.adv, it = (id) => ({ ...g.bag.items.find((q) => q.id === id) }), out = {};
        const goal = F.fox.goal();
        if (goal) {
          let shown = false, d0 = null, best = 1e9;
          for (let i = 0; i < 1500; i++) { p.advance(1 / 30); const e = F.fox.e; if (e.on) { if (!shown) { shown = true; d0 = Math.hypot(goal.x - e.x, goal.z - e.z); } best = Math.min(best, Math.hypot(goal.x - e.x, goal.z - e.z)); s.pos.x = e.x - 2; s.pos.z = e.z - 2; s.pos.y = e.y + 0.1; s.vel.set(0, 0, 0); } if (F.fox.arrived) break; }
          out.fox = { shown, d0: Math.round(d0), best: Math.round(best), arrived: F.fox.arrived };
        } else out.fox = { skip: true };
        s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); p.tick(3);
        s.slots[0] = it(246); s.sel = 0; p.changed();
        const used = p.placeNow();
        for (let i = 0; i < 90; i++) p.advance(1 / 60);
        const e = F.dragon;
        out.dragon = { used, pet: s.pet, on: e.on, near: Math.hypot(e.x - s.pos.x, e.z - s.pos.z) < 4, egg: s.slots[0] && s.slots[0].id };
        // look at it and press the button: its bags
        const ex = s.pos.x, ey = s.pos.y + p.tuning.eye, ez = s.pos.z;
        s.yaw = Math.atan2(-(e.x - ex), -(e.z - ez)); s.pitch = Math.atan2(e.y + 0.35 - ey, Math.hypot(e.x - ex, e.z - ez)); p.tick(1);
        // (the dragon keeps station by where the player looks, so it may drift: aim again on the frame the button is pressed)
        s.yaw = Math.atan2(-(e.x - ex), -(e.z - ez)); s.pitch = Math.atan2(e.y + 0.35 - ey, Math.hypot(e.x - ex, e.z - ez)); p.advance(1 / 600);
        out.bags = { near: F.dragonNear, used: F.dragonNear ? p.placeNow() : null, title: (document.querySelector('#bag .page:not([hidden]) h3') || {}).textContent };
        g.bag.close();
        return out;
      });
      check('the crystal fox comes and leads the player to the day\'s treasure', fr.fox.skip === true || (fr.fox.shown && fr.fox.arrived && fr.fox.best < fr.fox.d0), fr.fox);
      check('a dragon egg hatches into a dragon that follows and carries things', fr.dragon.used === true && fr.dragon.pet === true && fr.dragon.on && fr.dragon.near && fr.dragon.egg === 0, fr);
      await page.evaluate(() => { const g = window.__game, s = g.play.state, e = window.__GAME_FRIENDS.dragon; s.third = true; g.play.tick(3); void e; });
      await page.evaluate(() => { window.__game.panel.hide(); window.__play.state.running = true; window.__play.tick(1); });
      await shot('25-dragon');
      await page.evaluate(() => { window.__play.state.third = false; window.__play.tick(2); });
      // the stranger after sunset, the island, the gate and the maze
      await home();
      const ev = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, E = window.__GAME_EVENTS, w = g.world, it = (id, n) => { const q = { ...g.bag.items.find((x) => x.id === id) }; if (n != null) q.n = n; return q; }, out = {};
        out.message = E.message();
        if (g.weather) { g.weather.set('morning', false); p.tick(2); out.byDay = E.strangerHere(); g.weather.set('night', false); p.tick(2); out.byNight = E.strangerHere(); }
        // give the stranger whatever today's task asks, then hand it over
        const t = E.task; s.pack.fill(null);
        if (t.ask) { const what = t.ask[0], id = typeof what === 'number' ? what : g.bag.craft.idsOf(what)[0]; s.pack[0] = it(id, t.ask[1]); }
        p.changed();
        const r1 = E.deliver(); if (t.photo) { s.photos = (s.photos || 0) + 1; out.afterPhoto = E.deliver(); }
        out.task = { text: t.text, first: r1, done: s.strangerDone, again: E.deliver() };
        // the island: raised, its chest is there, sunk without a trace
        E.force = true; E.raiseIsland(); g.terrain.flush();
        const q = E.isle; out.island = { up: q.up, ground: w.get(q.x, q.y, q.z), chest: w.get(q.x, q.y + 1, q.z), loot: !!g.kit.chestAt(q.x, q.y + 1, q.z)[0], cells: q.cells.length };
        s.pos.set(q.x + 2.5, q.y + 1.2, q.z + 2.5); s.vel.set(0, 0, 0); for (let i = 0; i < 260; i++) p.advance(1 / 60);
        out.island.stood = s.onGround; out.island.visits = s.islandVisits || 0;
        return out;
      });
      await page.evaluate(() => { const s = window.__play.state, q = window.__GAME_EVENTS.isle; s.yaw = Math.atan2(-(q.x - s.pos.x), -(q.z - s.pos.z)); s.pitch = -0.25; window.__play.tick(3); });
      await page.evaluate(() => { window.__game.panel.hide(); window.__play.state.running = true; window.__play.tick(1); });
      await shot('26-island');
      const ev2 = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, E = window.__GAME_EVENTS, w = g.world, out = {};
        const q = E.isle; E.force = false; E.sinkIsland(); g.terrain.flush();
        out.sunk = { up: q.up, ground: w.get(q.x, q.y, q.z), chest: w.get(q.x, q.y + 1, q.z) };
        s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); p.tick(3);
        // a gate two steps away: walk into it
        const here = [s.pos.x, s.pos.y, s.pos.z];
        E.openGate({ x: s.pos.x + 0.4, y: s.pos.y, z: s.pos.z + 0.4 }); p.advance(1 / 60); p.advance(1 / 60);
        const m = E.maze;
        out.maze = { on: m.on, at: [Math.floor(s.pos.x) - m.x0, Math.floor(s.pos.z) - m.z0], floor: w.get(m.x0 + 1, m.y - 1, m.z0 + 1), exit: w.get(m.x0 + 11, m.y - 1, m.z0 + 11), walls: m.cells.size };
        for (let i = 0; i < 20; i++) p.advance(1 / 60);
        out.maze.standing = s.onGround; out.maze.noDig = s.noDig; out.maze.chip = !!document.body.textContent.match(/المتاهة · باقي/);
        // the walls move: after a shift the layout differs, and the player is never walled in
        const snap = () => { let k = ''; for (let z = 1; z < 12; z++) for (let x = 1; x < 12; x++) k += w.get(m.x0 + x, m.y, m.z0 + z) ? '#' : '.'; return k; };
        const a = snap(); for (let i = 0; i < 13 * 60; i++) p.advance(1 / 60); const b = snap();
        out.maze.moved = a !== b; out.maze.free = w.get(Math.floor(s.pos.x), m.y, Math.floor(s.pos.z)) === 0;
        out.maze.solvable = (() => { const lay = E.layout(77), seen = new Set(['1,1']), todo = [[1, 1]]; while (todo.length) { const [x, z] = todo.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, k = nx + ',' + nz; if (nx > 0 && nz > 0 && nx < 12 && nz < 12 && !lay[nz][nx] && !seen.has(k)) { seen.add(k); todo.push([nx, nz]); } } } return seen.has('11,11'); })();
        return out;
      });
      await page.evaluate(() => { const s = window.__play.state; s.pitch = -0.2; window.__play.tick(3); });
      await page.evaluate(() => { window.__game.panel.hide(); window.__play.state.running = true; window.__play.tick(1); });
      await shot('27-maze');
      const ev3 = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, E = window.__GAME_EVENTS, m = E.maze, w = g.world;
        const gems0 = g.bag.craft.count(231);
        s.pos.set(m.x0 + 11.5, m.y + 0.05, m.z0 + 11.5); s.vel.set(0, 0, 0); p.advance(1 / 60); p.advance(1 / 60);
        return { on: m.on, wins: s.mazeWins || 0, gems: g.bag.craft.count(231) - gems0, back: Math.hypot(s.pos.x - g.vitals.spawn.x, s.pos.z - g.vitals.spawn.z) < 1.5, cleared: w.get(m.x0 + 1, m.y - 1, m.z0 + 1) === 0 && m.cells.size === 0 };
      });
      check('the day\'s note says where to look, and the stranger is only there after the sun is low', ev.message.length > 30 && (ev.byDay === undefined || (ev.byDay === false && ev.byNight === true)), { message: ev.message, byDay: ev.byDay, byNight: ev.byNight });
      check('the stranger\'s task of the day is done once and rewarded', (ev.task.first === true || ev.afterPhoto === true) && ev.task.done === 1 && typeof ev.task.again === 'string', ev.task);
      check('the island rises with its chest, can be stood on, and sinks without a trace', ev.island.up && ev.island.ground === 108 && ev.island.chest === 170 && ev.island.loot && ev.island.stood === true && ev.island.visits >= 1 && ev2.sunk.up === false && ev2.sunk.ground === 0 && ev2.sunk.chest === 0, { island: ev.island, sunk: ev2.sunk });
      check('stepping into the gate leads into the maze, whose walls move without ever shutting the player in', ev2.maze.on === true && ev2.maze.at[0] === 1 && ev2.maze.at[1] === 1 && ev2.maze.floor === 101 && ev2.maze.exit === 140 && ev2.maze.walls > 150 && ev2.maze.standing === true && ev2.maze.noDig === true && ev2.maze.chip && ev2.maze.moved === true && ev2.maze.free === true && ev2.maze.solvable === true, ev2.maze);
      check('reaching the gold block wins the maze: a prize, back where the player was, and the maze is gone', ev3.on === false && ev3.wins === 1 && ev3.gems === 2 && ev3.back === true && ev3.cleared === true, ev3);
      const local = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, F = window.__GAME_FRIENDS, out = { world: null };
        if (F.deer) { out.world = 'dhalam'; g.weather.set('night', false); let on = false; for (let i = 0; i < 1200 && !on; i++) { p.advance(1 / 30); on = F.deer.on && Math.hypot(F.deer.x - s.pos.x, F.deer.z - s.pos.z) < 24; } out.deerAtNight = on; /* one that showed itself far away earlier is replaced by one near here */ if (on) { const e = F.deer; s.yaw = Math.atan2(-(e.x - s.pos.x), -(e.z - s.pos.z)); for (let i = 0; i < 90; i++) p.advance(1 / 60); out.seen = s.deerSeen || 0; s.pos.x = e.x + 2; s.pos.z = e.z; s.pos.y = e.y; for (let i = 0; i < 10; i++) p.advance(1 / 60); out.goneWhenNear = !e.on; } g.weather.set('morning', false); for (let i = 0; i < 10; i++) p.advance(1 / 60); out.goneByDay = !F.deer.on; }
        if (F.turtle) { out.world = 'waha'; const o = F.oasis; out.oasis = o && { pool: g.world.get(o.x, o.y - 1, o.z), chest: g.world.get(o.x + 2, o.y, o.z + 2), far: Math.hypot(o.x - g.vitals.spawn.x, o.z - g.vitals.spawn.z) > 40 }; if (o) { s.pos.set(o.x + 2.5, o.y + 0.1, o.z - 0.5); s.vel.set(0, 0, 0); for (let i = 0; i < 20; i++) p.advance(1 / 60); out.found = s.oasisFound || 0; } }
        s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); for (const k of Object.keys(g.vitals.values)) g.vitals.values[k] = 100; p.tick(3);
        return out;
      });
      if (local.world === 'dhalam') check('the shadow deer stands off in the night, is seen, and is gone when approached or when day comes', local.deerAtNight === true && local.seen >= 1 && local.goneWhenNear === true && local.goneByDay === true, local);
      if (local.world === 'waha') check('the desert has a hidden oasis with a pool and a chest, and reaching it is counted', !!local.oasis && local.oasis.pool === 150 && local.oasis.chest === 170 && local.oasis.far && local.found >= 1, local);
    }
    // ---- the pause menu: its eight choices, statistics, notes, settings, keys; then saving and coming back
    if (await page.evaluate(() => !!window.__GAME_SAVE)) {
      const tapOn = async (sel) => { const h = await page.$(sel); if (!h) throw new Error('not in the page: ' + sel); await h.scrollIntoViewIfNeeded(); const r = await h.boundingBox(); if (!r) throw new Error('not shown: ' + sel); if (touch) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); };
      const posted = [];
      await page.route(/\/api\/feedback/, (route) => { let b = null; try { b = JSON.parse(route.request().postData() || 'null'); } catch (e) { b = null; } posted.push(b); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
      await page.evaluate(() => { const g = window.__game, p = g.play, s = p.state; p.setFlying(false); s.pos.set(g.vitals.spawn.x, g.vitals.spawn.y, g.vitals.spawn.z); s.vel.set(0, 0, 0); for (const k of Object.keys(g.vitals.values)) g.vitals.values[k] = 90; p.tick(5); if (document.pointerLockElement) document.exitPointerLock(); g.panel.show('pause'); });      // (Esc itself lets the mouse go, in a real browser)
      await page.waitForTimeout(150);
      const menu = await page.evaluate(() => ({ labels: [...document.querySelectorAll('#playPanel .box:not(.sub) button')].map((b) => b.textContent.trim()), fits: document.querySelector('#playPanel .box:not(.sub)').getBoundingClientRect().height <= window.innerHeight }));
      const wants = ['الرجوع للعبة', 'الإنجازات', 'الإحصائيات', 'أرسل ملاحظة', 'بلّغ عن خطأ', 'الإعدادات', 'العب مع ربعك', 'احفظ'];
      check('Esc shows the eight choices, in order', menu.labels.length === 8 && wants.every((w, i) => menu.labels[i].startsWith(w)) && menu.fits, menu);
      await shot('19-esc');
      await tapOn('#playPanel [data-act="stats"]');
      const stats = await page.evaluate(() => { const s = window.__GAME_STATE; return { rows: document.querySelectorAll('#playPanel .cards.stats li').length, text: document.querySelector('#playPanel .cards.stats').textContent, broken: s.broken, walked: Math.round(s.walked) }; });
      check('statistics show what was really done (blocks broken, distance walked, time played)', stats.rows >= 15 && stats.broken > 0 && stats.text.includes(String(stats.broken)) && stats.text.includes(stats.walked + ' مكعب') && stats.text.includes('الوقت اللي لعبته'), { rows: stats.rows, broken: stats.broken, walked: stats.walked });
      await shot('20-stats');
      await tapOn('#playPanel .sub [data-act="back"]');
      await tapOn('#playPanel [data-act="feats"]');
      const feats = await page.evaluate(() => ({ all: document.querySelectorAll('#playPanel .cards li').length, done: document.querySelectorAll('#playPanel .cards li.done').length }));
      check('achievements list what is earned and what is still to do, each with its condition', feats.all >= 12 && feats.done >= 1 && feats.done < feats.all, feats);
      await tapOn('#playPanel .sub [data-act="back"]');
      // a note with stars, and a bug report: both go to the site's feedback list
      await tapOn('#playPanel [data-act="note"]');
      await page.fill('#playPanel textarea', 'اللعبة حلوة ونبي خيول');
      await tapOn('#playPanel [data-star="4"]');
      await tapOn('#playPanel [data-act="send"]');
      await page.waitForFunction(() => window.__game.panel.view === 'main', null, { timeout: 8000 }).catch(() => {});
      await tapOn('#playPanel [data-act="bug"]');
      await page.fill('#playPanel textarea', 'الباب ما ينفتح');
      await tapOn('#playPanel [data-act="send"]');
      await page.waitForFunction(() => window.__game.panel.view === 'main', null, { timeout: 8000 }).catch(() => {});
      const thanks = await page.evaluate(() => document.querySelector('#playPanel .box:not(.sub) .note').textContent);
      check('a note (with stars) and a bug report are sent to the site, marked as coming from this game', posted.length === 2 && posted[0].rating === 4 && posted[0].note.startsWith('[عالم المكعبات · ') && posted[0].note.includes('نبي خيول') && posted[1].chips[0] === 'fbChipBug' && posted[1].note.includes('خطأ') && posted[1].note.includes('الباب ما ينفتح') && posted[1].note.length <= 1000 && thanks.includes('وصل'), { posted, thanks });
      // settings: difficulty changes what a blow costs; a key is changed and the game obeys the new one
      await tapOn('#playPanel [data-act="options"]');
      await shot('21-options');
      const d0 = await page.evaluate(() => window.__GAME_DIFF.mode);
      await tapOn('#playPanel [data-act="diff"]');
      const d1 = await page.evaluate(() => ({ mode: window.__GAME_DIFF.mode, dmg: window.__GAME_DIFF.dmg, text: document.querySelector('#playPanel [data-act="diff"]').textContent }));
      await page.evaluate(() => window.__GAME_DIFF.set('normal'));
      check('settings: the difficulty changes, and with it what a monster\'s blow costs', d0 === 'normal' && d1.mode === 'hard' && d1.dmg > 1 && d1.text.includes('صعبة'), { d0, d1 });
      if (!touch) {
        await tapOn('#playPanel [data-act="keys"]');
        await tapOn('#playPanel [data-key="bag"]');
        await page.keyboard.press('KeyB');
        const k1 = await page.evaluate(() => ({ bag: window.__GAME_KEYS.map.bag, shown: document.querySelector('#playPanel [data-key="bag"]').textContent }));
        await shot('22-keys');
        await page.evaluate(() => { window.__game.panel.hide(); window.__play.state.running = true; });
        await page.keyboard.press('KeyE'); await page.waitForTimeout(120);
        const oldKey = await page.evaluate(() => !document.getElementById('bag').hidden);
        await page.keyboard.press('KeyB'); await page.waitForTimeout(450);
        const newKey = await page.evaluate(() => !document.getElementById('bag').hidden);
        await page.keyboard.press('Escape'); await page.waitForTimeout(120);
        await page.evaluate(() => { window.__GAME_KEYS.reset(); });
        check('settings: a key is changed in the menu and the game obeys the new key, not the old', k1.bag === 'KeyB' && k1.shown === 'B' && oldKey === false && newKey === true && (await page.evaluate(() => window.__GAME_KEYS.map.bag)) === 'KeyE', { k1, oldKey, newKey });
      } else await page.evaluate(() => { window.__game.panel.hide(); });
      // save, leave, come back: the world and the player are as they were
      const before = await page.evaluate(() => {
        const g = window.__game, p = g.play, s = p.state, kitItem = (id, n) => { const it = g.bag.items.find((q) => q.id === id); return { ...it, n: n ?? it.n }; };
        g.panel.hide(); s.running = true;
        const x = Math.floor(s.pos.x) + 3, y = Math.floor(s.pos.y + 0.01) + 5, z = Math.floor(s.pos.z) + 1;
        g.terrain.setBlock(x, y, z, 141); p.net.place(x, y, z, 141, 0);                      // a diamond block hung in the air: nothing natural is there
        g.terrain.setBlock(x + 1, y, z, 170); p.net.place(x + 1, y, z, 170, 0); g.kit.chestAt(x + 1, y, z)[4] = kitItem(140, 3);
        s.pack[26] = kitItem(131, 7); s.gear.feet = kitItem(223, 1);
        g.vitals.values.hp = 61; g.terrain.flush();
        const ok = window.__GAME_SAVE.save();
        return { ok, cell: [x, y, z], pos: [s.pos.x, s.pos.y, s.pos.z], broken: s.broken, xp: s.xp, played: s.played, log: g.bag.net.log.length, bytes: (window.localStorage.getItem(Object.keys(window.localStorage).find((k) => k.startsWith('bw-save-'))) || '').length };
      });
      await page.reload({ waitUntil: 'load', timeout: 180000 });
      // from the world picker the page may open the same world again by itself; if it shows the picker, choose the world as before
      if (args.pick) { await page.waitForFunction((sel) => !!window.__play || !!document.querySelector(sel), String(args.pick), { timeout: 120000 }); const b = await page.$(String(args.pick)); if (b && await b.isVisible() && !(await page.evaluate(() => !!window.__play))) await b.click(); }
      await page.waitForFunction(() => window.__READY === true && !!window.__play && !!window.__GAME_SAVE, null, { timeout: 240000 });
      await page.waitForTimeout(500);
      const after = await page.evaluate(([x, y, z]) => {
        const g = window.__game, s = g.play.state, c = g.kit.chestAt(x + 1, y, z);
        return { loaded: window.__GAME_SAVE.loaded, block: g.world.get(x, y, z), chestBlock: g.world.get(x + 1, y, z), chest: c[4] && [c[4].id, c[4].n], pack: s.pack[26] && [s.pack[26].id, s.pack[26].n], feet: s.gear.feet && s.gear.feet.id,
          pos: [s.pos.x, s.pos.y, s.pos.z], broken: s.broken, xp: s.xp, played: s.played, hp: Math.round(g.vitals.values.hp), start: (document.querySelector('#playPanel .go') || {}).textContent };
      }, before.cell);
      await shot('23-back');
      // (a quest or secret whose reward was still waiting is paid on the first frame back, so the experience may be higher, never lower)
      const near = Math.hypot(after.pos[0] - before.pos[0], after.pos[1] - before.pos[1], after.pos[2] - before.pos[2]) < 0.5;
      check('saving and coming back restores the world, the chest, what is carried and worn, the place, health and counts', before.ok === true && after.loaded === true && after.block === 141 && after.chestBlock === 170 && !!after.chest && after.chest[0] === 140 && after.chest[1] === 3 && !!after.pack && after.pack[0] === 131 && after.pack[1] === 7 && after.feet === 223 && near && after.broken === before.broken && after.xp >= before.xp && after.played >= before.played && after.hp === 61 && String(after.start).includes('كمّل عالمك'), { before, after });
      await page.evaluate(() => { window.__GAME_SAVE.clear(); });
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
