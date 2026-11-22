#!/usr/bin/env node
// Shared-game test: two pages of the same world in headless Chromium. One opens a room, the other joins
// with the four digits, the host lets it in, and then the test checks that what one does the other sees:
// figures, blocks, a door, the time of day, the host's creatures, and being put out of the room.
//
// The site's own introduction code runs here (api/_lib/play-room.js) over an in-memory store, so the
// browsers go through the real requests; the players' link itself is real WebRTC on this machine.
//
//   node tools/nettest.cjs --page "styles/<key>/index.html?play" --world <key> --api /path/to/api/_lib/play-room.js
//                          [--root dir --prefix /blockworld --pick 'button[data-world="kawkab"]'] [--outdir out/_net] [--strict 1]

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
function parseArgs(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (!a.startsWith('--')) continue; const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) out[a.slice(2)] = true; else { out[a.slice(2)] = n; i++; } } return out; }
function memoryKV() {
  const data = new Map(), stats = { commands: 0 };
  const run = ([cmd, key, ...a]) => {
    stats.commands++;
    if (cmd === 'RPUSH') { const l = data.get(key) || []; l.push(a[0]); data.set(key, l); return l.length; }
    if (cmd === 'RPOP') { const l = data.get(key) || []; return l.pop() ?? null; }
    if (cmd === 'LPOP') { const l = data.get(key) || []; const out = l.splice(0, Number(a[0])); return out.length ? out : null; }
    if (cmd === 'EXPIRE') return 1;
    if (cmd === 'DEL') return data.delete(key) ? 1 : 0;
    throw new Error('unexpected command ' + cmd);
  };
  const one = (f) => async (...a) => { stats.commands++; return f(...a); };
  return { stats, kvGetRaw: one((k) => (typeof data.get(k) === 'string' ? data.get(k) : null)), kvSetRaw: one((k, v) => { data.set(k, String(v)); }), kvSetIfAbsent: one((k, v) => { if (data.has(k)) return false; data.set(k, String(v)); return true; }),
    kvIncr: one((k) => { const n = Number(data.get(k) || 0) + 1; data.set(k, String(n)); return n; }), kvExpire: one(() => {}), kvPipeline: async (cmds) => cmds.map(run) };
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const PROJECT = path.resolve(__dirname, '..');
  const root = path.resolve(PROJECT, String(args.root || '.')), prefix = args.prefix ? String(args.prefix).replace(/\/+$/, '') : '';
  const outdir = path.resolve(PROJECT, String(args.outdir || 'out/_net'));
  fs.mkdirSync(outdir, { recursive: true });
  const { act } = require(path.resolve(String(args.api || path.join(PROJECT, '..', 'api', '_lib', 'play-room.js'))));
  const K = memoryKV(), calls = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/system' && u.searchParams.get('action') === 'play-room') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', async () => { let j = null; try { j = JSON.parse(body); } catch (e) { j = null; } const out = await act(j, '127.0.0.1', K); calls.push((j && j.op) + ':' + out.status); res.writeHead(out.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out.json)); });
      return;
    }
    let rel = decodeURIComponent(u.pathname);
    if (prefix) { if (!rel.startsWith(prefix + '/')) { res.writeHead(404); res.end(); return; } rel = rel.slice(prefix.length); }
    const file = path.normalize(path.join(root, rel));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, s) => { if (err || !s.isFile()) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });      // the two pages are on one machine with no network: let them link over loopback
  const report = { world: String(args.world), checks: [], pageErrors: [], files: [] };
  const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); };
  let failed = false;
  try {
    const open = async (who) => {
      const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1, locale: 'ar' });
      if (args.strict) await ctx.addInitScript({ path: path.join(__dirname, 'strict-gl.js') });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => report.pageErrors.push(who + ': ' + String((e && e.stack) || e).slice(0, 500)));
      await page.goto('http://127.0.0.1:' + port + prefix + '/' + String(args.page).replace(/^\/+/, ''), { waitUntil: 'load', timeout: 180000 });
      if (args.pick) await page.click(String(args.pick), { timeout: 60000 });
      await page.waitForFunction(() => window.__READY === true && !!window.__play, null, { timeout: 240000 });
      await page.evaluate(() => { const p = window.__play; p.start0 = p.start; p.start = () => { p.state.running = true; }; window.__GAME_LIFE.setMonsters(false); window.__game.life.kinds.forEach((k) => { k.max0 = k.max; k.max = 0; }); });
      await page.click('#playPanel button');
      await page.evaluate(() => window.__play.tick(30));
      return page;
    };
    const A = await open('host'), B = await open('guest');
    const shot = async (page, name) => { const f = path.join(outdir, name + '.png'); await page.screenshot({ path: f, timeout: 120000 }); report.files.push(path.relative(PROJECT, f)); };
    const step = (page, n = 6) => page.evaluate((k) => { const p = window.__play; for (let i = 0; i < k; i++) p.advance(1 / 60); }, n);
    /** Let both games run a little, with real time passing for the messages between them. */
    const both = async (rounds = 6) => { for (let i = 0; i < rounds; i++) { await step(A); await step(B); await A.waitForTimeout(60); } };
    const until = async (page, fn, ms = 20000) => { const t0 = Date.now(); for (;;) { if (await page.evaluate(fn)) return true; if (Date.now() - t0 > ms) return false; await both(2); } };

    // the guest stands a few steps from the host, so each can see the other
    await B.evaluate(() => { const g = window.__game, s = g.play.state; s.pos.x += 2.5; s.pos.y += 1.2; g.play.tick(40); });
    // ---- the panel is reached from the pause menu
    const menu = await A.evaluate(() => { const g = window.__game; g.panel.show('pause'); const b = [...document.querySelectorAll('#playPanel button')].find((q) => q.textContent.includes('العب مع ربعك')); if (!b) return { button: false }; b.click(); const out = { button: true, panel: !document.getElementById('netPanel').hidden, pause: document.getElementById('playPanel').hidden }; return out; });
    check('the pause menu has «العب مع ربعك», and it opens the room panel', menu.button && menu.panel && menu.pause, menu);
    await shot(A, 'n1-panel');
    // ---- the host opens a room
    await A.click('#netPanel [data-host]');
    await A.waitForFunction(() => !!window.__GAME_NET.code, null, { timeout: 15000 });
    const room = await A.evaluate(() => ({ code: window.__GAME_NET.code, role: window.__GAME_NET.role, shown: (document.querySelector('#netPanel .code') || {}).textContent }));
    check('opening a room gives a code of four digits, shown large', /^\d{4}$/.test(room.code) && room.role === 'host' && room.shown === room.code, room);
    await shot(A, 'n2-code');
    // ---- a wrong code, then the right one
    await B.evaluate(() => { window.__game.panel.show('pause'); [...document.querySelectorAll('#playPanel button')].find((q) => q.textContent.includes('العب مع ربعك')).click(); });
    const wrong = room.code === '0000' ? '1111' : '0000';
    await B.fill('#netPanel input.c', wrong); await B.fill('#netPanel input.n', 'فاطمة');
    await B.click('#netPanel [data-join]');
    await B.waitForFunction(() => !!window.__GAME_NET.error, null, { timeout: 15000 });
    const bad = await B.evaluate(() => ({ error: window.__GAME_NET.error, role: window.__GAME_NET.role }));
    check('a wrong code is refused with a plain reason', bad.role === null && bad.error.includes('ما في غرفة'), bad);
    await B.fill('#netPanel input.c', room.code); await B.fill('#netPanel input.n', 'فاطمة');
    await B.click('#netPanel [data-join]');
    // ---- the host is asked, and lets the guest in
    await A.evaluate(() => window.__GAME_NET.poll());
    const asked = await until(A, () => window.__GAME_NET.asks.length > 0, 20000);
    const ask = await A.evaluate(() => ({ asks: window.__GAME_NET.asks.map((q) => q.name), row: (document.querySelector('#netPanel li.ask span') || {}).textContent }));
    check('the host sees who asks to come in', asked && ask.asks[0] === 'فاطمة' && ask.row === 'فاطمة', ask);
    await shot(A, 'n3-ask');
    await A.click('#netPanel li.ask [data-admit]');
    // while they connect: what each side's link says (kept in the report, so a failure here explains itself)
    await both(4);
    const diag = async (page) => page.evaluate(() => { const n = window.__GAME_NET; return { role: n.role, busy: n.busy, error: n.error, href: location.pathname + location.hash, links: [...n.peers.values()].map((p) => ({ state: p.pc.connectionState, ice: p.pc.iceConnectionState, gather: p.pc.iceGatheringState, signal: p.pc.signalingState, dc: p.dc ? p.dc.readyState : null, local: ((p.pc.localDescription || {}).sdp || '').split('\n').filter((l) => l.startsWith('a=candidate')).map((l) => l.split(' ').slice(4, 8).join(' ')), remote: ((p.pc.remoteDescription || {}).sdp || '').split('\n').filter((l) => l.startsWith('a=candidate')).length })) }; });
    report.linking = { host: await diag(A), guest: await diag(B) };
    const joined = await until(B, () => window.__GAME_NET.role === 'guest', 40000);
    if (!joined) report.linkingAfter = { host: await diag(A), guest: await diag(B), calls: calls.slice() };
    await both(10);
    const link = await A.evaluate(() => { const n = window.__GAME_NET; return { peers: n.peers.size, open: [...n.peers.values()].every((p) => p.dc && p.dc.readyState === 'open'), others: n.others.size }; });
    check('the guest is let in and the two are linked directly', joined && link.peers === 1 && link.open, { joined, link, calls: calls.slice(-12) });
    // back to the game on both sides
    await A.evaluate(() => { document.querySelector('#netPanel [data-back]').click(); window.__game.panel.hide(); window.__play.state.running = true; });
    await B.evaluate(() => { const b = document.querySelector('#netPanel [data-back]'); if (b) b.click(); window.__game.panel.hide(); window.__play.state.running = true; });
    await both(12);
    // ---- they see each other
    const see = async (page) => page.evaluate(() => { const n = window.__GAME_NET, s = window.__play.state, o = [...n.others.values()][0]; return o && o.s ? { name: o.name, p: o.s.p, shown: o.av.group.visible, mine: [s.pos.x, s.pos.y, s.pos.z] } : null; });
    const sa = await see(A), sb = await see(B);
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.2;
    check('each sees the other where they stand, with the name', !!sa && !!sb && sa.shown && sb.shown && sa.name === 'فاطمة' && near(sa.p, sb.mine) && near(sb.p, sa.mine), { sa, sb });
    await A.evaluate(() => { const g = window.__game, s = g.play.state, o = [...window.__GAME_NET.others.values()][0]; s.yaw = Math.atan2(-(o.s.p[0] - s.pos.x), -(o.s.p[2] - s.pos.z)); s.pitch = -0.1; g.play.tick(8); });
    await shot(A, 'n4-host-sees-guest');
    // ---- the guest's own design and a new name reach the host; the host makes the guest a helper, who may turn people away
    await B.evaluate(() => { const g = window.__game; g.bag.adv.wardrobe.design('shirt', '#ff0044'); window.__GAME_NET.setName('نورة'); });
    await both(10);
    const lookA = await A.evaluate(() => { const o = [...window.__GAME_NET.others.values()][0]; return { name: o.name, look: o.s && o.s.look, row: [...window.__GAME_NET.peers.values()][0].name }; });
    check('a guest\'s own colours and new name are seen by the host', lookA.name === 'نورة' && lookA.row === 'نورة' && !!lookA.look && !!lookA.look.c && lookA.look.c.shirt === '#ff0044', lookA);
    await A.evaluate(() => { const n = window.__GAME_NET; n.setAdmin([...n.peers.keys()][0], true); n.asks.push({ id: 'aaaaaaaaaaaa', name: 'زائر', offer: 'v=0' }); });
    await A.evaluate(() => { const n = window.__GAME_NET; n.setAdmin([...n.peers.keys()][0], true); });      // (tells the helper who is waiting)
    await both(8);
    const helper = await B.evaluate(() => { const n = window.__GAME_NET; return { admin: n.admin, asks: n.hostAsks.map((a) => a.name) }; });
    await B.evaluate(() => { const n = window.__GAME_NET; n.open(); const b = document.querySelector('#netPanel li.ask [data-deny]'); if (b) b.click(); n.close(); });
    await both(8);
    const afterDeny = await A.evaluate(() => window.__GAME_NET.asks.length);
    await A.evaluate(() => { const n = window.__GAME_NET; n.setAdmin([...n.peers.keys()][0], false); });
    await both(6);
    const plain = await B.evaluate(() => window.__GAME_NET.admin);
    check('the host makes a guest a helper, who sees who is waiting and may turn them away; made ordinary again, they may not', helper.admin === true && helper.asks[0] === 'زائر' && afterDeny === 0 && plain === false, { helper, afterDeny, plain });
    // ---- blocks: what one puts down or digs, the other gets
    const put = await B.evaluate(() => { const g = window.__game, p = g.play, s = p.state, x = Math.floor(s.pos.x) + 2, y = Math.floor(s.pos.y + 0.01) + 3, z = Math.floor(s.pos.z); g.terrain.setBlock(x, y, z, 104); p.net.place(x, y, z, 104, s.yaw); g.terrain.flush(); return [x, y, z]; });
    await both(10);
    const gotPut = await A.evaluate(([x, y, z]) => window.__game.world.get(x, y, z), put);
    await A.evaluate(([x, y, z]) => { const g = window.__game; g.terrain.setBlock(x, y, z, 0); g.play.net.dig(x, y, z); g.terrain.flush(); }, put);
    await both(10);
    const gotDig = await B.evaluate(([x, y, z]) => window.__game.world.get(x, y, z), put);
    check('a block the guest puts down appears for the host, and when the host digs it, it goes for the guest', gotPut === 104 && gotDig === 0, { put, gotPut, gotDig });
    // ---- a door placed by one opens for both
    const door = await A.evaluate(() => { const g = window.__game, p = g.play, s = p.state, x = Math.floor(s.pos.x) - 2, y = Math.floor(s.pos.y + 0.01) + 4, z = Math.floor(s.pos.z) + 1; g.terrain.setBlock(x, y, z, 173); g.kit.placed(x, y, z, 173, 0); p.net.place(x, y, z, 173, 0); g.bag.interact({ x, y, z, id: 173 }); g.terrain.flush(); return [x, y, z]; });
    await both(10);
    const doorB = await B.evaluate(([x, y, z]) => { const g = window.__game; return { low: g.world.get(x, y, z), top: g.world.get(x, y + 1, z), hung: g.kit.doors.size }; }, door);
    check('a door the host hangs and opens is hung and open for the guest', doorB.low === 175 && doorB.top === 176 && doorB.hung === 1, doorB);
    // ---- the host's time of day; the guest cannot change it
    const sky = await A.evaluate(() => { const w = window.__game.weather; if (!w) return null; w.set('night', true); return { time: window.__GAME_SKY.time }; });
    await both(8);
    if (sky) {
      const skyB = await B.evaluate(() => { const w = window.__game.weather, s = window.__GAME_SKY, before = [s.time, s.rain, s.locked]; w.set('morning', false); return { before, after: [s.time, s.rain] }; });
      check('the host sets night and rain for everyone, and the guest cannot change them', skyB.before[0] === 'night' && skyB.before[1] === true && skyB.before[2] === true && skyB.after[0] === 'night' && skyB.after[1] === true, skyB);
      await A.evaluate(() => window.__game.weather.set(window.__game.weather.state.time === 'night' ? 'morning' : 'morning', false));
      await both(6);
    }
    // ---- the host's creatures: the guest sees them, strikes one, and gets the meat
    const beast = await A.evaluate(() => { const g = window.__game, l = g.life, s = g.play.state, o = [...window.__GAME_NET.others.values()][0]; let e = null; for (let a = 0; a < 6.3 && !e; a += 0.5) e = l.spawnAt(l.kinds.find((k) => k.kind === 'animal').key, o.s.p[0] + Math.sin(a) * 2, o.s.p[2] + Math.cos(a) * 2); void s; return e ? { nid: e.nid, hp: e.hp, x: e.x, z: e.z } : null; });
    await both(10);
    const seenB = await B.evaluate(() => { const l = window.__game.life; return { n: l.ents.length, mode: l.share.mode, first: l.ents[0] ? { nid: l.ents[0].nid, hp: l.ents[0].hp, name: l.ents[0].k.name } : null }; });
    check('an animal on the host is seen by the guest', !!beast && seenB.mode === 'guest' && seenB.n === 1 && seenB.first.nid === beast.nid, { beast, seenB });
    await B.evaluate(() => { const g = window.__game, s = g.play.state, e = g.life.ents[0]; if (!e) return; s.pos.x = e.x + 1.3; s.pos.z = e.z; s.pos.y = e.y; s.vel.set(0, 0, 0); g.play.tick(3); });
    await shot(B, 'n5-guest-sees-animal');
    const meat0 = await B.evaluate(() => [...window.__play.state.slots, ...window.__play.state.pack].filter((q) => q && q.id === 200).reduce((a, q) => a + q.n, 0));
    for (let i = 0; i < 40; i++) {
      await B.evaluate(() => { const g = window.__game, p = g.play, s = p.state, e = g.life.ents.find((q) => !q.dead); if (!e) return; if (Math.hypot(e.x - s.pos.x, e.z - s.pos.z) > 2.2) { s.pos.x = e.x + 1.3; s.pos.z = e.z; s.pos.y = e.y; s.vel.set(0, 0, 0); } const ex = s.pos.x, ey = s.pos.y + p.tuning.eye, ez = s.pos.z; s.yaw = Math.atan2(-(e.x - ex), -(e.z - ez)); s.pitch = Math.atan2(e.y + e.k.height * 0.5 - ey, Math.hypot(e.x - ex, e.z - ez)); p.input.dig = true; for (let k = 0; k < 30; k++) p.advance(1 / 60); p.input.dig = false; });
      await step(A, 12); await A.waitForTimeout(60); await step(B, 4);
      if (await B.evaluate((m) => [...window.__play.state.slots, ...window.__play.state.pack].filter((q) => q && q.id === 200).reduce((a, q) => a + q.n, 0) > m, meat0)) break;
    }
    await both(8);
    const hunt = await B.evaluate((m) => { const s = window.__play.state; return { meat: [...s.slots, ...s.pack].filter((q) => q && q.id === 200).reduce((a, q) => a + q.n, 0) - m, kills: s.kills.animal }; }, meat0);
    const hostEnt = await A.evaluate((nid) => { const e = window.__game.life.ents.find((q) => q.nid === nid); return e ? { hp: e.hp, dead: !!e.dead } : 'gone'; }, beast ? beast.nid : -1);
    check('the guest hunts the host\'s animal and gets the meat', hunt.meat > 0 && hunt.kills >= 1 && (hostEnt === 'gone' || hostEnt.dead), { hunt, hostEnt });
    // ---- a monster of the host's goes for the guest and hurts it
    const hurt = await (async () => {
      await B.evaluate(() => { const v = window.__game.vitals.values; for (const k of Object.keys(v)) v[k] = 100; });
      const ok = await A.evaluate(() => { const g = window.__game, l = g.life, o = [...window.__GAME_NET.others.values()][0]; window.__GAME_LIFE.setMonsters(true); const mk = l.kinds.find((k) => k.kind === 'monster'); let e = null; for (let a = 0; a < 6.3 && !e; a += 0.5) e = l.spawnAt(mk.key, o.s.p[0] + Math.sin(a) * 1.6, o.s.p[2] + Math.cos(a) * 1.6); g.vitals.values.hp = 100; return !!e; });
      for (let i = 0; i < 40; i++) { await step(A, 20); await A.waitForTimeout(50); await step(B, 6); if (await B.evaluate(() => window.__game.vitals.values.hp < 100)) break; }
      const r = { spawned: ok, guestHp: await B.evaluate(() => window.__game.vitals.values.hp), hostHp: await A.evaluate(() => window.__game.vitals.values.hp), monOnGuest: await B.evaluate(() => window.__GAME_LIFE.monsters) };
      await A.evaluate(() => window.__GAME_LIFE.setMonsters(false));
      await both(8);
      r.afterOff = await B.evaluate(() => ({ monsters: window.__GAME_LIFE.monsters, ents: window.__game.life.ents.filter((e) => e.k.kind === 'monster' && !e.dead).length }));
      return r;
    })();
    check('a monster the host moves strikes the guest; switching monsters off clears them for both', hurt.spawned && hurt.guestHp < 100 && hurt.monOnGuest === true && hurt.afterOff.monsters === false && hurt.afterOff.ents === 0, hurt);
    // ---- pausing in a shared game does not stop the world
    const paused = await A.evaluate(() => { const g = window.__game, p = g.play, t0 = p.state.time; p.state.running = true; p.stop(); const held = p.state.modal && p.state.running; for (let i = 0; i < 10; i++) p.advance(1 / 60); const went = p.state.time > t0; p.start0(); return { held, went, modal: p.state.modal }; });
    check('the host\'s pause menu takes the controls but the world keeps going', paused.held === true && paused.went === true && paused.modal === false, paused);
    // ---- the host puts the guest out
    await A.evaluate(() => { const n = window.__GAME_NET; n.kick([...n.peers.keys()][0]); });
    const out = await until(B, () => window.__GAME_NET.role === null, 15000);
    await both(6);
    const after = { guest: await B.evaluate(() => ({ role: window.__GAME_NET.role, others: window.__GAME_NET.others.size, locked: window.__GAME_SKY ? window.__GAME_SKY.locked : false, mode: window.__game.life.share.mode, shared: window.__play.shared })), host: await A.evaluate(() => ({ peers: window.__GAME_NET.peers.size, others: window.__GAME_NET.others.size })) };
    check('the host puts the guest out: the guest is alone again and free to set its own world', out && after.guest.role === null && after.guest.others === 0 && after.guest.locked === false && after.guest.mode === null && after.guest.shared === false && after.host.peers === 0 && after.host.others === 0, after);
    report.siteCalls = { total: calls.length, storeCommands: K.stats.commands, byOp: calls.reduce((m, c) => { const k = c.split(':')[0]; m[k] = (m[k] || 0) + 1; return m; }, {}) };
  } catch (e) {
    failed = true;
    report.error = String((e && e.stack) || e).slice(0, 900);
  } finally {
    await browser.close();
    server.close();
  }
  if (report.pageErrors.length || report.checks.some((c) => !c.ok)) failed = true;
  report.passed = report.checks.filter((c) => c.ok).length + '/' + report.checks.length;
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed ? 1 : 0);
})();
