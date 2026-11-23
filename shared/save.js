// Saving. The world is saved as the list of what was done to it (the same list a newcomer to a shared game is
// told), with what the player carries and wears, where they stand, their health and counts, what is in the
// chests, and the time of day. It is kept in this browser, one save per world, written every little while
// and when the page is left, and read back when the world is opened again.
//
//   const saver = createSave({ play, kit, net, world, fresh });      (the bag does this; fresh: start clean, do not load)
//   saver.save() -> true | false (saver.why says why not)      saver.clear()      saver.has()
//   saver.cloud: the account («حسابي», cloud.js) the save is also sent to when one is linked;  saver.pushNow() -> Promise<bool>

import { EMPTY } from './play.js';
import { createCloud, PUSH_EVERY } from './cloud.js';

const COUNTS = ['photos', 'broken', 'placed', 'eaten', 'crafted', 'opened', 'flown', 'swum', 'swumDist', 'walked', 'slept', 'played', 'deaths', 'jumps', 'traded', 'nightTime', 'stormTime', 'xp'];

/**
 * The same world from a shorter list: a block put down and dug again leaves nothing, and of several things
 * done to one cell only the last is kept (a dig of the ground that was there stays, since the ground is not
 * in the list). Doors: an even number of openings since the door was hung cancels out.
 */
export function compact(log) {
  const key = (a) => a[1] + ',' + a[2] + ',' + a[3];
  // one pass in order: what each cell ends as
  const cell = new Map();      // key -> { natural: the ground that was there has been dug, put: the last block put (or null), at: when, open: door parity }
  log.forEach((a, i) => {
    const k = key(a);
    let c = cell.get(k);
    if (!c) { c = { natural: false, put: null, at: i, open: false }; cell.set(k, c); }
    if (a[0] === 'put') { c.put = a; c.at = i; c.open = false; }
    else if (a[0] === 'dig') { if (c.put) c.put = null; else c.natural = true; c.at = i; c.open = false; }
    else if (a[0] === 'door' && c.put) c.open = !c.open;
  });
  // written out in the order things last happened, so what stands on what is laid in the same order
  const out = [];
  for (const [k, c] of [...cell].sort((p, q) => p[1].at - q[1].at)) {
    const [x, y, z] = k.split(',').map(Number);
    if (c.natural) out.push(['dig', x, y, z]);
    if (c.put) { out.push(c.put); if (c.open) out.push(['door', x, y, z]); }
  }
  return out;
}

export function createSave({ play, kit, net, world, fresh = false }) {
  const st = play.state, KEY = 'bw-save-' + world;
  const api = { loaded: false, disabled: fresh ? 'guest' : '', why: '', at: 0, cloud: createCloud({ world }), fromCloud: false };
  const item = (q) => (q && !q.empty ? { ...q } : null);
  function snapshot() {
    const log = net.log.length > 6000 ? compact(net.log) : net.log;
    const v = window.__GAME_VITALS, sky = window.__GAME_SKY, life = window.__GAME_LIFE;
    return {
      v: 1, world, at: Date.now(), log,
      chests: [...kit.chests].map(([k, c]) => [k, c.map(item)]).filter(([, c]) => c.some(Boolean)),
      me: { pos: [st.pos.x, st.pos.y, st.pos.z], yaw: st.yaw, pitch: st.pitch, sel: st.sel, flying: st.flying, slots: st.slots.map(item), pack: st.pack.map(item), pouch: st.pouch.map(item), petBag: st.petBag.map(item), pet: !!st.pet, mark: st.mark, gear: Object.fromEntries(Object.entries(st.gear).map(([k, q]) => [k, item(q)])),
        counts: Object.fromEntries(COUNTS.map((k) => [k, st[k] || 0])), kills: { ...st.kills }, made: { ...st.made }, put: { ...st.put } },
      vit: v ? { ...v.values } : null, sky: sky ? { time: sky.time, rain: sky.rain } : null, monsters: life ? life.monsters : true,
    };
  }
  api.save = () => {
    if (api.disabled) { api.why = 'أنت ضيف في غرفة: العالم عالم صاحب الغرفة، وعالمك المحفوظ ما تغيّر.'; return false; }
    try { window.localStorage.setItem(KEY, JSON.stringify(snapshot())); api.at = Date.now(); api.why = ''; return true; }
    catch (e) { api.why = 'ما قدرت أحفظ: مساحة المتصفح مليانة أو مقفولة.'; return false; }
  };
  /** Save here, then send the same save to the account (when one is linked). */
  api.pushNow = async () => {
    if (!api.cloud.code || api.disabled || net.role === 'guest') return false;
    if (!api.save()) return false;
    let text = null;
    try { text = window.localStorage.getItem(KEY); } catch (e) { text = null; }
    return text ? api.cloud.push(text, api.at) : false;
  };
  api.has = () => { try { return !!window.localStorage.getItem(KEY); } catch (e) { return false; } };
  api.clear = () => { api.disabled = api.disabled || 'cleared'; try { window.localStorage.removeItem(KEY); } catch (e) { /* nothing to remove */ } };
  function load() {
    let d = null;
    try { d = JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || d.v !== 1 || d.world !== world || !Array.isArray(d.log) || !d.me) return false;
    for (const a of d.log) { if (Array.isArray(a)) { net.apply(a); net.log.push(a); } }
    for (const [k, c] of d.chests || []) { const [x, y, z] = String(k).split(',').map(Number); if ([x, y, z].every(Number.isFinite) && Array.isArray(c)) { const box = kit.chestAt(x, y, z); for (let i = 0; i < 27; i++) box[i] = c[i] || null; } }
    const m = d.me;
    // everything goes back where it was. The hotbar may be shorter here (a phone shows fewer squares): what does not fit goes to free places in the backpack
    for (let i = 0; i < st.slots.length; i++) st.slots[i] = (m.slots && m.slots[i]) || EMPTY;
    for (let i = 0; i < st.pack.length; i++) st.pack[i] = (m.pack && m.pack[i]) || null;
    for (let i = 0; i < st.pouch.length; i++) st.pouch[i] = (m.pouch && m.pouch[i]) || null;
    for (let i = 0; i < st.petBag.length; i++) st.petBag[i] = (m.petBag && m.petBag[i]) || null;
    st.pet = !!m.pet;
    st.mark = m.mark && [m.mark.x, m.mark.y, m.mark.z].every(Number.isFinite) ? { x: m.mark.x, y: m.mark.y, z: m.mark.z } : null;
    for (const q of (m.slots || []).slice(st.slots.length)) { if (!q) continue; const i = st.pack.indexOf(null); if (i >= 0) st.pack[i] = q; }
    for (const k of Object.keys(st.gear)) st.gear[k] = (m.gear && m.gear[k]) || null;
    for (const k of COUNTS) if (Number.isFinite(m.counts && m.counts[k])) st[k] = m.counts[k];
    Object.assign(st.kills, m.kills || {}); Object.assign(st.made, m.made || {}); Object.assign(st.put, m.put || {});
    if (Array.isArray(m.pos) && m.pos.every(Number.isFinite)) { st.pos.set(m.pos[0], m.pos[1] + 0.05, m.pos[2]); st.vel.set(0, 0, 0); st.yaw = +m.yaw || 0; st.pitch = +m.pitch || 0; }
    st.sel = Math.min(st.slots.length - 1, Math.max(0, m.sel | 0));
    if (m.flying) play.setFlying(true);
    const v = window.__GAME_VITALS, sky = window.__GAME_SKY, life = window.__GAME_LIFE;
    if (v && d.vit) for (const k of Object.keys(v.values)) if (Number.isFinite(d.vit[k])) v.values[k] = d.vit[k];
    if (sky && d.sky && sky.set) sky.set(d.sky.time, !!d.sky.rain, true);
    if (life && d.monsters === false) life.setMonsters(false, true);
    play.changed();
    play.tick(1);
    return true;
  }
  // read the save once everything else in the world exists (health, the sky, the creatures are made after the bag)
  setTimeout(async () => {
    // a linked account: its save is taken instead of this browser's when it is newer (played on another device since)
    if (!fresh && api.cloud.code) {
      api.disabled = 'pulling';
      try {
        const got = await Promise.race([api.cloud.pull(), new Promise((res) => setTimeout(() => res(null), 6000))]);
        let mine = 0;
        try { mine = (JSON.parse(window.localStorage.getItem(KEY) || 'null') || {}).at || 0; } catch (e) { mine = 0; }
        const d = got && got.at > mine ? JSON.parse(got.text) : null;
        if (d && d.v === 1 && d.world === world) { window.localStorage.setItem(KEY, got.text); api.fromCloud = true; }
      } catch (e) { /* the account did not answer or its save did not read: this browser's save is used */ }
      if (api.disabled === 'pulling') api.disabled = '';
    }
    if (!fresh) { try { api.loaded = load(); } catch (e) { api.loaded = false; api.disabled = 'broken'; api.why = 'الحفظ القديم ما انقرأ، وما راح أكتب فوقه. من الإعدادات تقدر تبدأ عالم جديد.'; } }
    if (api.loaded && window.__GAME_PANEL) window.__GAME_PANEL();
  }, 0);
  // write it every little while, and when the page is left
  let wait = 0, sent = 0;
  play.onTick((s, dt) => {
    sent += dt;
    if ((wait += dt) >= 20) {
      wait = 0;
      if (!api.disabled && net.role !== 'guest') { if (api.cloud.code && sent >= PUSH_EVERY) { sent = 0; api.pushNow(); } else api.save(); }
    }
  });
  const leaving = () => { if (st.running && !api.disabled && net.role !== 'guest') api.save(); };
  window.addEventListener('pagehide', leaving);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leaving(); });
  window.__GAME_SAVE = api;
  return api;
}
