// Playing together. One player opens a room and gets a code of four digits; the others type the code,
// and the host lets each one in (or not), and can put anyone out again. The players' browsers then talk
// to each other directly (WebRTC); the site only introduces them (see api/_lib/play-room.js).
//
// What is shared: where everyone is and how they look, every block put down or dug and every door opened
// (a newcomer is first told everything done so far), the time of day, the weather and whether monsters roam
// (the host's to decide), and the host's animals and monsters, which everyone sees and can fight.
// What is not: what each player carries, and what is inside chests.
//
//   const net = createNet({ play, kit, camera, world: 'kawkab', adv });      (the bag does this)
//   net.host() -> code      net.join(code, name)      net.admit(id) / net.deny(id) / net.kick(id)      net.leave()

import * as THREE from 'three';
import { makeAvatar } from './avatar.js';

const API = '/api/system?action=play-room';
const RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const MAX_PLAYERS = 4, LOG_CAP = 20000;

const CSS = `
#netPanel { position: fixed; inset: 0; z-index: 52; display: flex; align-items: center; justify-content: center; direction: rtl; color: #f1f4f8;
  background: radial-gradient(ellipse at center, rgba(4, 8, 14, .58), rgba(2, 4, 8, .86)); -webkit-user-select: none; user-select: none; }
#netPanel[hidden] { display: none; }
#netPanel .box { box-sizing: border-box; width: min(520px, calc(100vw - 24px)); max-height: calc(100vh - 16px); overflow-y: auto; padding: 16px 20px 16px; border-radius: 14px; text-align: center;
  background: rgba(10, 14, 20, .92); border: 1px solid var(--np-line, rgba(255, 255, 255, .24)); box-shadow: 0 18px 60px rgba(0, 0, 0, .55); }
#netPanel h2 { margin: 0 0 6px; font-size: 22px; color: var(--np-accent, #fff); }
#netPanel p { margin: 6px 0; font-size: 13.5px; line-height: 1.6; opacity: .85; }
#netPanel .code { margin: 8px 0 4px; font: 700 54px/1.1 system-ui, sans-serif; letter-spacing: 10px; direction: ltr; color: var(--np-accent, #fff); -webkit-user-select: text; user-select: text; }
#netPanel input { box-sizing: border-box; font: inherit; font-size: 20px; text-align: center; color: #f1f4f8; background: rgba(255, 255, 255, .08); border: 1px solid rgba(255, 255, 255, .3); border-radius: 10px; padding: 8px 10px; margin: 4px; min-height: 46px; -webkit-user-select: text; user-select: text; }
#netPanel input.c { width: 150px; letter-spacing: 6px; direction: ltr; font-weight: 700; }
#netPanel input.n { width: 190px; }
#netPanel button { font: inherit; font-size: 15px; font-weight: 700; min-height: 44px; padding: 8px 20px; margin: 4px; border-radius: 10px; cursor: pointer; color: #0b0f14; background: var(--np-accent, #fff); border: 0; }
#netPanel button.soft { color: inherit; background: none; border: 1px solid var(--np-line, rgba(255, 255, 255, .3)); font-weight: 500; }
#netPanel button.no { color: #fff; background: #b3322b; }
#netPanel ul { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 6px; text-align: right; }
#netPanel li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, .14); font-size: 14.5px; }
#netPanel li span { flex: 1; font-weight: 700; }
#netPanel li small { opacity: .7; font-size: 12px; }
#netPanel li button { min-height: 38px; padding: 4px 14px; margin: 0; font-size: 13.5px; }
#netPanel li.ask { border-color: var(--np-accent, #fff); background: rgba(255, 255, 255, .08); }
#netPanel .err { color: #ffb0a6; min-height: 20px; }
.netTag { position: fixed; left: 0; top: 0; z-index: 19; pointer-events: none; padding: 2px 9px 3px; border-radius: 7px; background: rgba(8, 11, 16, .72); border: 1px solid rgba(255, 255, 255, .25); color: #f1f4f8; font: 700 12.5px/1.3 system-ui, sans-serif; white-space: nowrap; }
#netAsk { position: fixed; left: 50%; top: 10px; transform: translateX(-50%); z-index: 49; direction: rtl; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px; background: rgba(8, 11, 16, .92); border: 1px solid rgba(255, 255, 255, .35); color: #f1f4f8; font: 700 14px/1.4 system-ui, sans-serif; }
#netAsk[hidden] { display: none; }
#netAsk button { font: inherit; font-size: 13.5px; font-weight: 700; min-height: 40px; padding: 4px 14px; border-radius: 9px; border: 0; cursor: pointer; color: #0b0f14; background: #9be36a; }
#netAsk button.no { color: #fff; background: #b3322b; }
`;

const WORLD_NAMES = { kawkab: 'كوكب', waha: 'واحة', dhalam: 'ظلام' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanName = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim().slice(0, 16) || 'لاعب';

export function createNet({ play, kit, camera, world, adv, fontFamily, accent, line, api = API, rtc = RTC }) {
  const st = play.state;
  const css = document.createElement('style');
  css.textContent = CSS;
  document.head.appendChild(css);

  let role = null, code = '', key = '', myId = 'host', myName = '', accepting = false, pollT = null, quietPolls = 0, error = '', busy = '';
  try { myName = cleanName(window.localStorage.getItem('bw-name') || ''); if (myName === 'لاعب') myName = ''; } catch (e) { /* storage may be closed */ }
  const peers = new Map();          // host: guest id -> { pc, dc, name, s }. guest: 'host' -> { pc, dc }
  const others = new Map();         // every other player this one sees: id -> { name, s: { p, yw, pt, mv, look, gear }, av, tag, x, y, z }
  const asks = [];                  // host: people waiting to be let in: { id, name, offer }
  const log = [];                   // everything done to the world since this game began: ['put', x, y, z, id, yaw] | ['dig', x, y, z] | ['door', x, y, z]
  const life = () => (window.__GAME_LIFE && window.__GAME_LIFE.life) || null;
  const sky = () => window.__GAME_SKY || null;

  // ---- talking to the site (introductions only)
  async function call(body) {
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j) throw new Error('offline');
    return j;
  }
  const WHY = { 'no-room': 'ما في غرفة بهذا الكود. تأكد من الأرقام، أو خل صاحبك يفتح الغرفة من جديد.', busy: 'الغرفة عليها زحمة. جرّب بعد شوي.', 'slow-down': 'محاولات كثيرة. انتظر دقيقة.', store: 'الغرف متوقفة الحين من جهة الموقع.', full: 'ما في أكواد فاضية الحين. جرّب بعد شوي.', offline: 'ما قدرت أوصل للموقع. اللعب الجماعي يشتغل من الموقع نفسه وبوجود نت.' };
  const why = (e) => WHY[e] || 'صار خطأ. جرّب مرة ثانية.';

  // ---- one connection
  function gathered(pc) {      // the whole description at once: wait till the browser has listed its addresses (or long enough)
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') { res(); return; }
      const t = setTimeout(res, 2500);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }
  const send = (dc, msg) => { if (dc && dc.readyState === 'open') { try { dc.send(JSON.stringify(msg)); } catch (e) { /* the line dropped: the close handler tidies up */ } } };
  const toHost = (msg) => { const h = peers.get('host'); if (h) send(h.dc, msg); };
  const toAll = (msg, except) => { for (const [id, p] of peers) if (id !== except) send(p.dc, msg); };
  const mine = () => ({ p: [+st.pos.x.toFixed(2), +st.pos.y.toFixed(2), +st.pos.z.toFixed(2)], yw: +st.yaw.toFixed(3), pt: +st.pitch.toFixed(2), mv: st.onGround ? +st.moving.toFixed(1) : 0, look: adv ? adv.wardrobe.current : 'explorer', gear: ['head', 'chest', 'legs', 'feet'].map((k) => (st.gear[k] ? st.gear[k].id : 0)) });

  // ---- the other players' figures
  function seen(id, name) {
    let o = others.get(id);
    if (!o) {
      const av = makeAvatar(), tag = document.createElement('div');
      tag.className = 'netTag'; tag.hidden = true; document.body.appendChild(tag);
      kit.scene.add(av.group);
      o = { name: '', s: null, av, tag, x: 0, y: 0, z: 0, yaw: 0, fresh: true };
      others.set(id, o);
    }
    if (name && name !== o.name) { o.name = name; o.tag.textContent = name; }
    return o;
  }
  function gone(id) {
    const o = others.get(id);
    if (!o) return;
    kit.scene.remove(o.av.group); o.tag.remove(); others.delete(id);
  }
  const looks = () => (adv ? adv.wardrobe.list() : []);
  function showOthers(dt) {
    const f = Math.min(1, 12 * dt), all = looks();
    for (const o of others.values()) {
      if (!o.s) { o.av.group.visible = false; o.tag.hidden = true; continue; }
      const [x, y, z] = o.s.p;
      if (o.fresh || Math.hypot(x - o.x, z - o.z) > 8) { o.x = x; o.y = y; o.z = z; o.yaw = o.s.yw; o.fresh = false; }
      o.x += (x - o.x) * f; o.y += (y - o.y) * f; o.z += (z - o.z) * f; o.yaw += (((o.s.yw - o.yaw + 9.4248) % 6.2832) - 3.1416) * f;
      const look = all.find((q) => q.key === o.s.look), g = o.s.gear || [];
      o.av.dress(look ? look.c : null, { head: g[0], chest: g[1], legs: g[2], feet: g[3] });
      o.av.place(o.x, o.y, o.z, o.yaw); o.av.walk(st.time, o.s.mv || 0); o.av.nod(o.s.pt || 0);
      o.av.group.visible = true;
      if (camera) {
        o.av.head.getWorldPosition(_v); _v.y += 0.55; _v.project(camera);
        o.tag.hidden = _v.z >= 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1;
        if (!o.tag.hidden) o.tag.style.transform = `translate(${((_v.x * 0.5 + 0.5) * window.innerWidth).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * window.innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
      }
    }
  }
  const _v = new THREE.Vector3();

  // ---- what happens to the world, here and there
  function note(a) { if (log.length < LOG_CAP) log.push(a); }
  function apply(a) {
    if (a[0] === 'put') play.remotePlace(a[1], a[2], a[3], a[4], a[5]);
    else if (a[0] === 'dig') play.remoteDig(a[1], a[2], a[3]);
    else if (a[0] === 'door') kit.remoteDoor(a[1], a[2], a[3]);
  }
  const okCell = (a) => a.slice(1, 4).every((n) => Number.isInteger(n) && n >= 0 && n < 4096);
  function did(a) {      // this player did it
    note(a);
    if (role === 'host') toAll({ t: 'do', a });
    else if (role === 'guest') toHost({ t: 'do', a });
  }
  play.net.place = (x, y, z, id, yaw) => did(['put', x, y, z, id, +yaw.toFixed(2)]);
  play.net.dig = (x, y, z) => did(['dig', x, y, z]);
  kit.onDoor = (x, y, z) => did(['door', x, y, z]);

  // ---- the host's side
  function roster() { return [{ id: 'host', name: myName || 'صاحب الغرفة', s: mine() }, ...[...peers].filter(([, p]) => p.s).map(([id, p]) => ({ id, name: p.name, s: p.s }))]; }
  function fromGuest(id, m) {
    const p = peers.get(id);
    if (!p || !m || typeof m !== 'object') return;
    if (m.t === 'me' && m.s && Array.isArray(m.s.p) && m.s.p.length === 3 && m.s.p.every(Number.isFinite)) { p.s = { p: m.s.p, yw: +m.s.yw || 0, pt: +m.s.pt || 0, mv: +m.s.mv || 0, look: String(m.s.look || '').slice(0, 20), gear: Array.isArray(m.s.gear) ? m.s.gear.slice(0, 4).map((n) => n | 0) : [] }; seen(id, p.name).s = p.s; }
    else if (m.t === 'do' && Array.isArray(m.a) && ['put', 'dig', 'door'].includes(m.a[0]) && okCell(m.a)) { const a = m.a.slice(0, 6); note(a); apply(a); toAll({ t: 'do', a }, id); }
    else if (m.t === 'hit') { const l = life(); if (l) l.remoteHit(m.e | 0, +m.pow || 0, id); }
  }
  async function admit(id) {
    const i = asks.findIndex((q) => q.id === id);
    if (i < 0) return false;
    const ask = asks.splice(i, 1)[0];
    drawAsk();
    if (peers.size >= MAX_PLAYERS - 1) { call({ op: 'deny', code, key, id }).catch(() => {}); play.notice('الغرفة مليانة (4 لاعبين).', false, 3000); draw(); return false; }
    const pc = new RTCPeerConnection(rtc), p = { pc, dc: null, name: cleanName(ask.name), s: null };
    peers.set(id, p);
    pc.ondatachannel = (ev) => {
      p.dc = ev.channel;
      p.dc.onopen = () => {
        send(p.dc, { t: 'welcome', id, world, log, sky: sky() ? { time: sky().time, rain: sky().rain } : null, mon: window.__GAME_LIFE ? window.__GAME_LIFE.monsters : true });
        play.notice(p.name + ' دخل الغرفة.', false, 3000);
        draw();
      };
      p.dc.onmessage = (e) => { let m = null; try { m = JSON.parse(e.data); } catch (err) { m = null; } fromGuest(id, m); };
      p.dc.onclose = () => drop(id, false);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(id, false); };
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: ask.offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      await call({ op: 'admit', code, key, id, answer: pc.localDescription.sdp });
    } catch (e) { drop(id, false); error = 'ما قدرت أدخّله. خله يجرّب مرة ثانية.'; }
    draw();
    return true;
  }
  function deny(id) { const i = asks.findIndex((q) => q.id === id); if (i < 0) return; asks.splice(i, 1); call({ op: 'deny', code, key, id }).catch(() => {}); drawAsk(); draw(); }
  function drop(id, kicked) {
    const p = peers.get(id);
    if (!p) return;
    peers.delete(id);
    if (kicked) send(p.dc, { t: 'kick' });
    setTimeout(() => { try { p.pc.close(); } catch (e) { /* already closed */ } }, kicked ? 300 : 0);
    gone(id);
    if (role === 'host') { toAll({ t: 'bye', id }); play.notice(p.name + (kicked ? ' طلّعته من الغرفة.' : ' طلع من الغرفة.'), false, 3000); }
    draw();
  }
  async function poll() {
    if (role !== 'host' || !accepting) return;
    try {
      const r = await call({ op: 'pending', code, key, keep: quietPolls % 5 === 0 ? 1 : 0 });
      if (r.error) { if (r.error === 'no-room') { accepting = false; error = 'انتهى وقت الكود. افتح الاستقبال من جديد وتاخذ كود جديد.'; code = ''; draw(); } return; }
      for (const j of r.joins || []) if (!asks.some((q) => q.id === j.id)) asks.push(j);
      if ((r.joins || []).length) { quietPolls = 0; if (play.sound) play.sound.ui(); play.notice(cleanName(r.joins[0].name) + ' يبي يدخل غرفتك. ' + (document.pointerLockElement ? 'اضغط Esc وافتح «العب مع ربعك».' : 'اضغط «دخّله» فوق.'), false, 7000); drawAsk(); draw(); }
      else if (++quietPolls > 75) { accepting = false; play.notice('وقّفت استقبال لاعبين جدد (5 دقايق بدون طلبات). تقدر تفتحه من «العب مع ربعك».', false, 6000); draw(); }      // about five minutes: stop asking the site
    } catch (e) { /* the site did not answer this time: the next poll tries again */ }
  }
  function listen(on) {
    accepting = on; quietPolls = 0;
    clearInterval(pollT);
    if (on) pollT = setInterval(poll, 4000);
  }
  async function host() {
    if (role === 'guest') return null;
    error = ''; busy = 'أفتح الغرفة…'; draw();
    try {
      const r = await call({ op: 'open', world });
      busy = '';
      if (r.error) { error = why(r.error); draw(); return null; }
      code = r.code; key = r.key; role = 'host'; myId = 'host';
      listen(true);
      const l = life();
      if (l) l.setShare('host', (to, msg) => { const p = peers.get(to); if (p) send(p.dc, msg); }, () => [...peers].filter(([, p]) => p.s).map(([id, p]) => ({ id, x: p.s.p[0], y: p.s.p[1], z: p.s.p[2] })));
      play.shared = true;
      draw();
      return code;
    } catch (e) { busy = ''; error = why('offline'); draw(); return null; }
  }

  // ---- the guest's side
  function fromHost(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'welcome') {
      myId = m.id; role = 'guest'; busy = '';
      for (const a of m.log || []) apply(a);
      const s = sky(), l = life();
      if (s) { s.locked = true; if (m.sky && s.set) s.set(m.sky.time, m.sky.rain, true); }
      if (window.__GAME_LIFE) window.__GAME_LIFE.setMonsters(!!m.mon, true);
      if (l) l.setShare('guest', (to, msg) => toHost(msg), null);
      play.shared = true;
      play.notice('دخلت الغرفة ' + code + '. صاحب الغرفة يتحكم بالوقت والجو والوحوش.', false, 6000);
      draw();
    } else if (m.t === 'ps' && Array.isArray(m.list)) {
      const ids = new Set();
      for (const q of m.list) { if (!q || q.id === myId || !q.s || !Array.isArray(q.s.p)) continue; ids.add(q.id); seen(q.id, cleanName(q.name)).s = q.s; }
      for (const id of [...others.keys()]) if (!ids.has(id)) gone(id);
    } else if (m.t === 'do' && Array.isArray(m.a)) apply(m.a);
    else if (m.t === 'sky') { const s = sky(); if (s && s.set) s.set(m.time, !!m.rain, true); }
    else if (m.t === 'mon') { if (window.__GAME_LIFE) window.__GAME_LIFE.setMonsters(!!m.on, true); }
    else if (m.t === 'ents' && Array.isArray(m.list)) { const l = life(); if (l) l.applySnapshot(m.list); }
    else if (m.t === 'hurt') { const l = life(); if (l) l.hurtPlayer(+m.d || 0); }
    else if (m.t === 'kill') { const l = life(); if (l) l.credit(m.kind === 'monster' ? 'monster' : 'animal', Math.min(4, m.meat | 0)); }
    else if (m.t === 'bye') gone(m.id);
    else if (m.t === 'kick') { left('صاحب الغرفة طلّعك.'); }
  }
  function left(text) {
    const h = peers.get('host');
    peers.clear();
    if (h) { try { h.pc.close(); } catch (e) { /* already closed */ } }
    for (const id of [...others.keys()]) gone(id);
    const s = sky(), l = life();
    if (s) s.locked = false;
    if (l) l.setShare(null);
    role = null; code = ''; busy = ''; play.shared = false;
    if (text) play.notice(text, false, 5000);
    draw();
  }
  async function join(c, name) {
    if (role) return false;
    c = String(c || '').replace(/\D/g, '').slice(0, 4);
    if (c.length !== 4) { error = 'الكود أربع أرقام.'; draw(); return false; }
    myName = cleanName(name);
    try { window.localStorage.setItem('bw-name', myName); } catch (e) { /* not kept */ }
    // what this player already changed in their own world would not be in the shared one: start the world afresh, then join
    if (st.broken + st.placed > 0 && !join.fresh) { try { window.sessionStorage.setItem('bw-join', JSON.stringify({ code: c, name: myName, world })); } catch (e) { /* no storage: join as things are */ } if (window.sessionStorage.getItem('bw-join')) { window.location.reload(); return false; } }
    error = ''; busy = 'أطلب الدخول…'; code = c; draw();
    const pc = new RTCPeerConnection(rtc), dc = pc.createDataChannel('bw');
    peers.set('host', { pc, dc });
    dc.onmessage = (e) => { let m = null; try { m = JSON.parse(e.data); } catch (err) { m = null; } fromHost(m); };
    dc.onclose = () => { if (role === 'guest') left('انقطع الاتصال بالغرفة.'); };
    pc.onconnectionstatechange = () => { if ((pc.connectionState === 'failed' || pc.connectionState === 'closed') && peers.get('host') && peers.get('host').pc === pc) left(role === 'guest' ? 'انقطع الاتصال بالغرفة.' : ''); };
    const fail = (text) => { peers.delete('host'); try { pc.close(); } catch (e) { /* already closed */ } busy = ''; code = ''; error = text; draw(); return false; };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const r = await call({ op: 'join', code: c, world, name: myName, offer: pc.localDescription.sdp });
      if (r.error === 'world') return fail('هذي الغرفة في عالم «' + (WORLD_NAMES[r.world] || r.world) + '». افتح نفس العالم وادخل الكود.');
      if (r.error) return fail(why(r.error));
      busy = 'ننتظر صاحب الغرفة يدخّلك…'; draw();
      for (let i = 0; i < 36; i++) {
        await new Promise((res) => setTimeout(res, 2500));
        if (!peers.get('host') || peers.get('host').pc !== pc) return false;        // gave up meanwhile
        const a = await call({ op: 'answer', code: c, id: r.id }).catch(() => ({ wait: true }));
        if (a.denied) return fail('صاحب الغرفة ما دخّلك.');
        if (a.answer) { await pc.setRemoteDescription({ type: 'answer', sdp: a.answer }); busy = 'أتصل…'; draw(); setTimeout(() => { if (role !== 'guest' && peers.get('host') && peers.get('host').pc === pc) fail('ما قدرت أتصل بصاحب الغرفة. بعض الشبكات تمنع الاتصال المباشر: جرّبوا نفس الواي فاي أو شبكة ثانية.'); }, 20000); return true; }
      }
      return fail('صاحب الغرفة ما ردّ. خله يفتح «العب مع ربعك» ويدخّلك.');
    } catch (e) { return fail(why('offline')); }
  }
  function leave() {
    if (role === 'host') { for (const id of [...peers.keys()]) drop(id, false); listen(false); call({ op: 'close', code, key }).catch(() => {}); const l = life(); if (l) l.setShare(null); role = null; code = ''; asks.length = 0; play.shared = false; drawAsk(); draw(); }
    else if (role === 'guest' || peers.size) left('طلعت من الغرفة.');
  }

  // ---- every frame: say where this player is; the host also passes everyone and the creatures on
  let tMe = 0, tEnts = 0;
  play.onTick((s, dt) => {
    showOthers(dt);
    if (!role) return;
    if ((tMe += dt) >= 0.1) {
      tMe = 0;
      if (role === 'guest') toHost({ t: 'me', s: mine() });
      else if (peers.size) { const list = roster(); toAll({ t: 'ps', list }); }
    }
    if (role === 'host' && peers.size && (tEnts += dt) >= 0.16) { tEnts = 0; const l = life(); if (l) toAll({ t: 'ents', list: l.snapshot() }); }
  });
  // the host's choices of time, weather and monsters go to everyone
  setTimeout(() => {
    const s = sky();
    if (s) s.onChange = (time, rain) => { if (role === 'host') toAll({ t: 'sky', time, rain }); };
    if (window.__GAME_LIFE) window.__GAME_LIFE.onChange = (on) => { if (role === 'host') toAll({ t: 'mon', on }); };
  }, 0);

  // ---- the panel (from the pause menu), and the little bar that asks the host about a newcomer
  const el = document.createElement('div');
  el.id = 'netPanel'; el.hidden = true;
  el.style.fontFamily = fontFamily || 'system-ui, sans-serif';
  if (accent) el.style.setProperty('--np-accent', accent);
  if (line) el.style.setProperty('--np-line', line);
  el.innerHTML = '<div class="box"></div>';
  document.body.appendChild(el);
  const box = el.firstChild;
  const askBar = document.createElement('div');
  askBar.id = 'netAsk'; askBar.hidden = true;
  document.body.appendChild(askBar);
  function drawAsk() {
    const a = asks[0];
    askBar.hidden = !a || !el.hidden;
    if (a) askBar.innerHTML = `<span>${esc(cleanName(a.name))} يبي يدخل</span><button type="button" data-admit="${a.id}">دخّله</button><button type="button" class="no" data-deny="${a.id}">ارفض</button>`;
  }
  function draw() {
    if (el.hidden) { drawAsk(); return; }
    let h = '<h2>العب مع ربعك</h2>';
    if (role === 'host') {
      h += code ? `<p>عط ربعك هذا الكود. يفتحون نفس العالم («${WORLD_NAMES[world] || world}») ويكتبونه في «العب مع ربعك».</p><div class="code">${code}</div>` : '';
      h += `<p>${accepting ? 'الاستقبال مفتوح: اللي يكتب الكود يطلع لك اسمه هني وأنت تدخّله.' : 'الاستقبال مسكّر: ما حد جديد يقدر يطلب الدخول.'}</p>`;
      h += '<ul>' + asks.map((a) => `<li class="ask"><span>${esc(cleanName(a.name))}</span><small>يبي يدخل</small><button type="button" data-admit="${a.id}">دخّله</button><button type="button" class="no" data-deny="${a.id}">ارفض</button></li>`).join('')
        + [...peers].map(([id, p]) => `<li><span>${esc(p.name)}</span><small>${p.dc && p.dc.readyState === 'open' ? 'في الغرفة' : 'يتصل…'}</small><button type="button" class="no" data-kick="${id}">طلّعه</button></li>`).join('') + '</ul>';
      if (!asks.length && !peers.size) h += '<p>ما حد في الغرفة للحين.</p>';
      h += `<button type="button" class="soft" data-listen="${accepting ? 0 : 1}">${accepting ? 'سكّر الاستقبال' : 'افتح الاستقبال'}</button><button type="button" class="no" data-leave="1">سكّر الغرفة</button>`;
    } else if (role === 'guest') {
      h += `<p>أنت في الغرفة <b dir="ltr">${code}</b>. صاحب الغرفة يتحكم بالوقت والجو والوحوش، ويقدر يطلّع أي لاعب.</p><ul>` + [...others.values()].map((o) => `<li><span>${esc(o.name)}</span><small>في الغرفة</small></li>`).join('') + '</ul><button type="button" class="no" data-leave="1">اطلع من الغرفة</button>';
    } else if (busy) {
      h += `<p>${busy}</p>` + (peers.size ? '<button type="button" class="soft" data-leave="1">إلغاء</button>' : '');
    } else {
      h += `<p>افتح غرفة وعط ربعك الكود، أو ادخل غرفة صاحبك بكوده. لازم الكل يكون في نفس العالم («${WORLD_NAMES[world] || world}»). لين 4 لاعبين.</p>`
        + '<button type="button" data-host="1">افتح غرفة</button>'
        + `<p style="margin-top:14px">أو ادخل بكود:</p><input class="c" inputmode="numeric" maxlength="4" placeholder="0000" aria-label="الكود"><input class="n" maxlength="16" placeholder="اسمك" aria-label="اسمك" value="${esc(myName)}"><br><button type="button" data-join="1">ادخل</button>`;
    }
    h += `<p class="err">${esc(error)}</p><button type="button" class="soft" data-back="1">رجوع</button>`;
    box.innerHTML = h;
    drawAsk();
  }
  let onBack = null;
  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.admit) admit(t.dataset.admit);
    else if (t.dataset.deny) deny(t.dataset.deny);
    else if (t.dataset.kick) drop(t.dataset.kick, true);
    else if (t.dataset.listen) { if (t.dataset.listen === '1' && !code) { role = null; host(); } else { listen(t.dataset.listen === '1'); draw(); } }
    else if (t.dataset.leave) leave();
    else if (t.dataset.host) host();
    else if (t.dataset.join) join(box.querySelector('input.c').value, box.querySelector('input.n').value);
    else if (t.dataset.back) { el.hidden = true; drawAsk(); if (onBack) onBack(); }
  }
  el.addEventListener('click', onClick);
  askBar.addEventListener('click', onClick);
  // a panel with text boxes: keys typed in them are not the game's
  el.addEventListener('keydown', (e) => e.stopPropagation());

  const net = {
    el, peers, others, asks, log,
    get role() { return role; }, get code() { return code; }, get accepting() { return accepting; }, get error() { return error; }, get busy() { return busy; }, get name() { return myName; },
    host, join, admit, deny, leave, listen, poll,
    kick: (id) => drop(id, true),
    /** Open the panel; back() is called when the player leaves it. */
    open(back) { onBack = back || null; error = ''; el.hidden = false; draw(); },
    close() { el.hidden = true; drawAsk(); },
  };
  window.__GAME_NET = net;
  // a join that had to start the world afresh first
  try {
    const j = JSON.parse(window.sessionStorage.getItem('bw-join') || 'null');
    if (j) { window.sessionStorage.removeItem('bw-join'); if (j.world === world) { const t = setInterval(() => { if (st.running) { clearInterval(t); join.fresh = true; join(j.code, j.name).finally(() => { join.fresh = false; }); } }, 400); } }
  } catch (e) { /* no storage: nothing to resume */ }
  return net;
}
