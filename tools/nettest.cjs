#!/usr/bin/env node
// Shared-game test: two pages of the same world in headless Chromium. One opens a room, the other joins
// with the four digits, the host lets it in, and then the test checks that what one does the other sees:
// figures, blocks, a door, the time of day, the host's creatures, and being put out of the room.
//
// The site's own introduction code runs here (api/play-room.js) over an in-memory store, so the
// browsers go through the real requests; the players' link itself is real WebRTC on this machine.
//
//   node tools/nettest.cjs --page "styles/<key>/index.html?play" --world <key> [--api api/play-room.js]
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
    if (cmd === 'GET') return typeof data.get(key) === 'string' ? data.get(key) : null;
    // the public rooms (a sorted set): member -> score
    if (cmd === 'ZADD') { const z = data.get(key) || new Map(); z.set(a[1], Number(a[0])); data.set(key, z); return 1; }
    if (cmd === 'ZREM') { const z = data.get(key); return z && z.delete(a[0]) ? 1 : 0; }
    if (cmd === 'ZREMRANGEBYSCORE') { const z = data.get(key); if (!z) return 0; for (const [m, sc] of [...z]) if (sc <= Number(a[1])) z.delete(m); return 1; }
    if (cmd === 'ZRANGE') { const z = data.get(key) || new Map(); return [...z].filter(([, sc]) => sc >= Number(a[1])).sort((p, q) => q[1] - p[1]).slice(0, Number(a[6])).map(([m]) => m); }
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
  const { act } = require(path.resolve(String(args.api || path.join(PROJECT, 'api', 'play-room.js'))));
  const K = memoryKV(), calls = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/play-room') {
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
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });      // the two pages are on one machine with no network: let them link over loopback
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
    // ---- written lines and faces: the guest's reach the host with its name, the host's reach the guest
    const talkRes = await (async () => {
      const c0 = await A.evaluate(() => window.__GAME_CHAT.count);
      const sentB = await B.evaluate(() => window.__GAME_CHAT.say('هلا <b>والله</b>'));
      await both(8);
      const lineA = await A.evaluate(() => [...document.querySelectorAll('#chatLog div')].map((d) => d.textContent).pop() || '');
      const lineAHtml = await A.evaluate(() => document.querySelectorAll('#chatLog div > :not(b)').length);      // what was typed is text: no element made from it
      await A.waitForTimeout(800);
      const sentA = await A.evaluate(() => window.__GAME_CHAT.say('أهلين'));
      await both(8);
      const lineB = await B.evaluate(() => [...document.querySelectorAll('#chatLog div')].map((d) => d.textContent).pop() || '');
      await B.waitForTimeout(800);
      const faceB = await B.evaluate(() => window.__GAME_CHAT.emote('wave'));
      await both(4);
      const faceA = await A.evaluate(() => { const o = [...window.__GAME_NET.others.values()][0]; const f = o && o.tag.querySelector('.face'); return f ? f.textContent : ''; });
      // the box opens with T and keys typed in it are not the game's
      await A.evaluate(() => { const b = document.querySelector('#netPanel [data-back]'); if (b) b.click(); });
      await A.keyboard.press('KeyT');
      const opened = await A.evaluate(() => ({ open: window.__GAME_CHAT.isOpen, modal: window.__play.state.modal, focus: document.activeElement && document.activeElement.closest('#chatBox') !== null }));
      await A.keyboard.type('wasd');
      const typed = await A.evaluate(() => ({ value: document.querySelector('#chatBox input').value, moving: window.__play.input.fx !== 0 || window.__play.input.fz !== 0 }));
      await A.keyboard.press('Escape');
      const closed = await A.evaluate(() => ({ open: window.__GAME_CHAT.isOpen, modal: window.__play.state.modal }));
      return { c0, sentB, lineA, lineAHtml, sentA, lineB, faceB, faceA, opened, typed, closed };
    })();
    check('a written line from the guest reaches the host with its name (as text), the host\'s reaches the guest, and a face shows over the head', talkRes.sentB && talkRes.lineA.includes('فاطمة') && talkRes.lineA.includes('هلا <b>والله</b>') && talkRes.lineAHtml === 0 && talkRes.sentA && talkRes.lineB.includes('أهلين') && talkRes.faceB && talkRes.faceA === '👋', talkRes);
    check('T opens the line to write in, typing there does not move the player, and Esc closes it', talkRes.opened.open && talkRes.opened.modal && talkRes.opened.focus && talkRes.typed.value === 'wasd' && !talkRes.typed.moving && !talkRes.closed.open && !talkRes.closed.modal, talkRes);
    await A.evaluate(() => { window.__game.panel.hide(); window.__play.state.running = true; });
    await B.evaluate(() => { window.__game.panel.hide(); window.__play.state.running = true; });
    await A.evaluate(() => window.__GAME_CHAT.say('شوفوا'));
    await both(4);
    await shot(B, 'n4b-chat');
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
    // ---- voices: the guest switches its microphone on and the host receives sound; then the other way
    const inbound = (page) => page.evaluate(async () => { const n = window.__GAME_NET; let got = 0, level = 0; for (const p of n.peers.values()) { const st = await p.pc.getStats(); st.forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'audio') { got += r.packetsReceived || 0; level = Math.max(level, r.audioLevel || 0); } }); } return { got, level, heard: n.voice.heard.size, mic: n.voice.micOn }; });
    const quiet = await inbound(A);
    const micB = await B.evaluate(() => window.__GAME_NET.voice.setMic(true));
    await both(14); await A.waitForTimeout(1200); await both(4);
    const loudA = await inbound(A);
    const micA = await A.evaluate(() => window.__GAME_NET.voice.setMic(true));
    await both(14); await A.waitForTimeout(1200); await both(4);
    const loudB = await inbound(B);
    check('a guest\'s microphone is heard by the host, and the host\'s by the guest; both are off until switched on', micB === true && micA === true && loudA.heard === 1 && loudA.got > quiet.got + 20 && loudB.heard === 1 && loudB.got > 20 && quiet.mic === false, { quiet, loudA, loudB });
    await A.evaluate(() => window.__GAME_NET.voice.setMic(false)); await B.evaluate(() => window.__GAME_NET.voice.setMic(false));
    // ---- a gift: the guest looks at the host and hands over one of what it holds
    const gift = await (async () => {
      await B.evaluate(() => { const g = window.__game, p = g.play, s = p.state, o = [...window.__GAME_NET.others.values()][0]; s.slots[0] = { ...g.bag.items.find((q) => q.id === 140), n: 3 }; s.sel = 0; p.changed(); s.pos.set(o.s.p[0] + 1.6, o.s.p[1], o.s.p[2]); s.vel.set(0, 0, 0); });
      await both(10);
      const gold0 = await A.evaluate(() => window.__game.bag.craft.count(140));      // before the gift is sent: it arrives by itself, without waiting for the test
      const sent = await B.evaluate(() => { const g = window.__game, p = g.play, s = p.state, o = [...window.__GAME_NET.others.values()][0]; const ex = s.pos.x, ey = s.pos.y + p.tuning.eye, ez = s.pos.z; s.yaw = Math.atan2(-(o.x - ex), -(o.z - ez)); s.pitch = Math.atan2(o.y + 1.0 - ey, Math.hypot(o.x - ex, o.z - ez)); p.advance(1 / 60); const aimed = window.__GAME_PARTY.aimed; const used = p.placeNow(); return { aimed, used, left: s.slots[0].n }; });
      await both(10);
      return { sent, got: (await A.evaluate(() => window.__game.bag.craft.count(140))) - gold0 };
    })();
    check('looking at a friend and pressing the place button gives them one of what is in the hand', !!gift.sent.aimed && gift.sent.used === true && gift.sent.left === 2 && gift.got === 1, gift);
    // ---- the team goal counts everyone's share, and pays everyone
    const team = await (async () => {
      await both(12);
      const before = { a: await A.evaluate(() => window.__play.state.xp), b: await B.evaluate(() => window.__play.state.xp), chip: await B.evaluate(() => document.querySelector('#partyChips div:nth-child(2)').textContent) };
      await A.evaluate(() => { window.__play.state.broken += 25; }); await B.evaluate(() => { window.__play.state.broken += 40; });
      for (let i = 0; i < 6; i++) { await step(A, 70); await step(B, 70); await A.waitForTimeout(80); }
      return { before, a: await A.evaluate(() => ({ xp: window.__play.state.xp, wins: window.__play.state.teamWins || 0, done: window.__GAME_PARTY.team.done })), b: await B.evaluate(() => ({ xp: window.__play.state.xp, wins: window.__play.state.teamWins || 0 })) };
    })();
    check('the team goal adds up what everyone does, and rewards the whole room when it is met', team.before.chip.includes('مهمة الفريق') && team.a.done >= 1 && team.a.wins >= 1 && team.b.wins >= 1 && team.a.xp >= team.before.a + 20 && team.b.xp >= team.before.b + 20, team);
    // ---- a building contest: a theme and a clock for everyone, then a vote, then a winner
    const contest = await (async () => {
      const started = await A.evaluate(() => window.__GAME_PARTY.startContest());
      await both(8);
      const onB = await B.evaluate(() => ({ on: window.__GAME_PARTY.contest.on, theme: window.__GAME_PARTY.contest.theme, chip: document.querySelector('#partyChips div').textContent }));
      await A.evaluate(() => { window.__GAME_PARTY.contest.left = 0.05; }); await B.evaluate(() => { window.__GAME_PARTY.contest.left = 0.05; });
      await both(8);
      const voteB = await B.evaluate(() => ({ shown: !document.getElementById('partyVote').hidden, buttons: document.querySelectorAll('#partyVote [data-for]').length }));
      await B.evaluate(() => document.querySelector('#partyVote [data-for]').click());
      await A.evaluate(() => { const b = document.querySelector('#partyVote [data-for]'); if (b) b.click(); });
      await both(12);
      return { started, onB, voteB, a: await A.evaluate(() => ({ last: window.__GAME_PARTY.contest.last, wins: window.__play.state.contestWins || 0 })), b: await B.evaluate(() => ({ last: window.__GAME_PARTY.contest.last, wins: window.__play.state.contestWins || 0 })) };
    })();
    check('the host starts a building contest for the room; when the clock ends everyone votes and the winner is told to all', contest.started === true && contest.onB.on === true && contest.onB.theme.length > 1 && contest.onB.chip.includes('مسابقة بناء') && contest.voteB.shown && contest.voteB.buttons === 1 && !!contest.a.last && !!contest.b.last && contest.a.last.names.length === 2 && contest.a.wins === 1 && contest.b.wins === 1, contest);
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
      // stand beside the animal on its own level; a side where a block corner hides it is swapped for the next one
      await B.evaluate((i) => { const g = window.__game, p = g.play, s = p.state, e = g.life.ents.find((q) => !q.dead); if (!e) return; if (Math.hypot(e.x - s.pos.x, e.z - s.pos.z) > 2.2 || !g.life.aimed) { const a = i * 1.1; s.pos.x = e.x + Math.sin(a) * 1.4; s.pos.z = e.z + Math.cos(a) * 1.4; s.pos.y = e.y; s.vel.set(0, 0, 0); } const ex = s.pos.x, ey = s.pos.y + p.tuning.eye, ez = s.pos.z; s.yaw = Math.atan2(-(e.x - ex), -(e.z - ez)); s.pitch = Math.atan2(e.y + e.k.height * 0.5 - ey, Math.hypot(e.x - ex, e.z - ez)); p.input.dig = true; for (let k = 0; k < 30; k++) p.advance(1 / 60); p.input.dig = false; }, i);
      await step(A, 12); await A.waitForTimeout(60); await step(B, 4);
      if (await B.evaluate((m) => [...window.__play.state.slots, ...window.__play.state.pack].filter((q) => q && q.id === 200).reduce((a, q) => a + q.n, 0) > m, meat0)) break;
    }
    await both(8);
    const hunt = await B.evaluate((m) => { const s = window.__play.state; return { meat: [...s.slots, ...s.pack].filter((q) => q && q.id === 200).reduce((a, q) => a + q.n, 0) - m, kills: s.kills.animal }; }, meat0);
    const hostEnt = await A.evaluate((nid) => { const e = window.__game.life.ents.find((q) => q.nid === nid); return e ? { hp: e.hp, dead: !!e.dead } : 'gone'; }, beast ? beast.nid : -1);
    const why = await B.evaluate(() => { const g = window.__game, s = g.play.state, l = g.life; return { modal: s.modal, noDig: s.noDig, aimed: l.aimed ? l.aimed.nid : null, ents: l.ents.map((e) => [e.nid, e.hp, !!e.dead, Math.round(Math.hypot(e.x - s.pos.x, e.z - s.pos.z) * 10) / 10]), mode: l.share.mode, hit: s.hit ? [s.hit.id, Math.round(s.hit.t * 10) / 10] : null, vote: !document.getElementById('partyVote').hidden }; });
    check('the guest hunts the host\'s animal and gets the meat', hunt.meat > 0 && hunt.kills >= 1 && (hostEnt === 'gone' || hostEnt.dead), { hunt, hostEnt, why });
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
    // ---- a public room: opened by the host, it shows in the guest's list of public rooms, and joining from the list asks the host
    const pubRes = await (async () => {
      await A.evaluate(() => window.__GAME_NET.leave());
      await A.evaluate(() => window.__GAME_NET.host(true));
      await A.waitForFunction(() => !!window.__GAME_NET.code, null, { timeout: 15000 });
      const codeA = await A.evaluate(() => ({ code: window.__GAME_NET.code, pub: window.__GAME_NET.isPublic }));
      await B.evaluate(() => window.__GAME_NET.open());
      await B.waitForFunction(() => Array.isArray(window.__GAME_NET.rooms) && window.__GAME_NET.rooms.length > 0, null, { timeout: 15000 }).catch(() => {});
      const listB = await B.evaluate(() => ({ rooms: window.__GAME_NET.rooms, rows: [...document.querySelectorAll('#netPanel [data-pick]')].map((b) => b.dataset.pick) }));
      await shot(B, 'n6-public-rooms');
      // (a player who changed their own world starts it afresh before joining — a page reload, checked elsewhere; here the guest's world is left unchanged)
      await B.evaluate(() => { window.__GAME_NET.log.length = 0; });
      await B.click('#netPanel [data-pick]');
      await A.evaluate(() => window.__GAME_NET.poll());
      const askedPub = await until(A, () => window.__GAME_NET.asks.length > 0, 20000);
      return { codeA, listB, askedPub };
    })();
    check('a public room shows in the list of the same world, and a player joins from the list without the code (the host still lets them in)', pubRes.codeA.pub && pubRes.listB.rooms.some((q) => q.code === pubRes.codeA.code) && pubRes.listB.rows.includes(pubRes.codeA.code) && pubRes.askedPub, pubRes);
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
