// Talking in a shared game: short written lines and faces (emotes). Only while playing together.
// A guest's line goes to the host, who checks it and passes it on to everyone with the sender's name;
// the host's own line goes straight to everyone. Nothing is kept: the lines fade and are gone with the room.
//
//   const chat = createChat({ play, net });      (net.js does this)
//   chat.open()      the line to write in (T or Enter, or the 💬 button on a phone)
//   chat.say(text)   chat.emote(key)

export const EMOTES = [
  ['wave', '👋', 'هلا'], ['laugh', '😂', 'ضحك'], ['love', '❤️', 'حب'], ['good', '👍', 'زين'],
  ['wow', '😮', 'واو'], ['sad', '😢', 'زعلان'], ['clap', '👏', 'تصفيق'], ['party', '🎉', 'فرحة'],
];
const FACE = Object.fromEntries(EMOTES.map(([k, f]) => [k, f]));
export const MAX_LINE = 120;
/** A line as it may be shown (always as text, never as HTML): no control or direction marks, at most MAX_LINE letters, '' when nothing is left. */
export const cleanLine = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LINE);
const cleanName = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim().slice(0, 16) || 'لاعب';

const CSS = `
#chatLog { position: fixed; left: 12px; top: 64px; z-index: 18; width: min(380px, calc(100vw - 24px)); direction: rtl; pointer-events: none; display: flex; flex-direction: column; gap: 3px; font: 600 14px/1.45 system-ui, sans-serif; }
#chatLog div { align-self: flex-end; max-width: 100%; padding: 3px 10px 4px; border-radius: 9px; background: rgba(8, 11, 16, .66); color: #f1f4f8; word-wrap: break-word; transition: opacity .6s; }
#chatLog div b { color: #ffd76a; margin-left: 6px; }
#chatLog div.me b { color: #9be36a; }
#chatLog div.old { opacity: 0; }
#chatLog.open div.old { opacity: 1; }
#chatBox { position: fixed; right: 12px; bottom: 52px; z-index: 53; width: min(420px, calc(100vw - 24px)); direction: rtl; display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 12px; background: rgba(8, 11, 16, .9); border: 1px solid rgba(255, 255, 255, .3); }
#chatBox[hidden] { display: none; }
#chatBox form { display: flex; gap: 6px; margin: 0; }
#chatBox input { flex: 1; min-width: 0; font: 600 16px/1.3 system-ui, sans-serif; color: #f1f4f8; background: rgba(255, 255, 255, .08); border: 1px solid rgba(255, 255, 255, .3); border-radius: 9px; padding: 8px 10px; -webkit-user-select: text; user-select: text; }
#chatBox button { font: 700 14px/1 system-ui, sans-serif; min-height: 40px; padding: 0 14px; border-radius: 9px; border: 0; cursor: pointer; color: #0b0f14; background: #ffd76a; }
#chatBox .faces { display: flex; flex-wrap: wrap; gap: 4px; }
#chatBox .faces button { font-size: 22px; padding: 0 8px; background: rgba(255, 255, 255, .1); color: inherit; }
#chatBox .x { background: none; color: #f1f4f8; border: 1px solid rgba(255, 255, 255, .3); }
#chatBtn { position: fixed; left: 12px; top: 50%; z-index: 21; width: 52px; height: 52px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .35); background: rgba(8, 11, 16, .7); font-size: 24px; cursor: pointer; }
#chatBtn[hidden] { display: none; }
.netTag .face { display: block; text-align: center; font-size: 30px; line-height: 1.1; }
`;

export function createChat({ play, net }) {
  const css = document.createElement('style');
  css.textContent = CSS;
  document.head.appendChild(css);
  const logEl = document.createElement('div'); logEl.id = 'chatLog'; document.body.appendChild(logEl);
  const box = document.createElement('div'); box.id = 'chatBox'; box.hidden = true;
  box.innerHTML = '<form><input maxlength="' + MAX_LINE + '" placeholder="اكتب لربعك…" aria-label="رسالة" autocomplete="off"><button type="submit">أرسل</button><button type="button" class="x" data-x="1">✕</button></form><div class="faces">'
    + EMOTES.map(([k, f, t]) => `<button type="button" data-face="${k}" title="${t}" aria-label="${t}">${f}</button>`).join('') + '</div>';
  document.body.appendChild(box);
  const input = box.querySelector('input');
  const btn = document.createElement('button'); btn.id = 'chatBtn'; btn.type = 'button'; btn.hidden = true; btn.textContent = '💬'; btn.setAttribute('aria-label', 'الدردشة');
  document.body.appendChild(btn);

  const lines = [];                 // what is on screen: { el, at }
  let lastSent = 0;
  const heard = new Map();          // host: guest id -> times of their last lines (too many too fast are dropped)
  const nameOf = (id) => (id === 'host' ? (net.role === 'host' ? net.name || 'صاحب الغرفة' : (net.others.get('host') || {}).name || 'صاحب الغرفة') : id === net.myId ? net.name || 'أنا' : ((net.peers.get(id) || {}).name || (net.others.get(id) || {}).name || 'لاعب'));

  function show(name, text, mine) {
    const d = document.createElement('div');
    if (mine) d.className = 'me';
    const b = document.createElement('b'); b.textContent = cleanName(name);
    d.append(b, document.createTextNode(text));
    logEl.appendChild(d);
    lines.push({ el: d, at: performance.now() });
    while (lines.length > 8) lines.shift().el.remove();
    api.count++;
  }
  /** A face over a player's head for a few seconds (or over the screen for this player). */
  function face(id, key) {
    const f = FACE[key];
    if (!f) return;
    const o = id === net.myId || (id === 'host' && net.role === 'host') ? null : net.others.get(id);
    if (o && o.tag) {
      o.tag.querySelector('.face')?.remove();
      const s = document.createElement('span'); s.className = 'face'; s.textContent = f;
      o.tag.prepend(s);
      setTimeout(() => s.remove(), 3500);
    }
    api.faces++;
  }
  const allowed = (id) => {      // host: at most 5 lines or faces in 4 seconds from one guest
    const now = Date.now(), t = (heard.get(id) || []).filter((x) => now - x < 4000);
    if (t.length >= 5) { heard.set(id, t); return false; }
    t.push(now); heard.set(id, t); return true;
  };

  // what arrives. At the host it comes from a guest (pass it on with who said it); at a guest it comes from the host
  net.on('chat', (m, from) => {
    const text = cleanLine(m.s);
    if (!text) return;
    if (net.role === 'host') {
      if (!allowed(from)) return;
      show(nameOf(from), text, false);
      net.say(null, { t: 'chat', s: text, who: from, n: nameOf(from) });
    } else {
      const who = typeof m.who === 'string' ? m.who : 'host';
      if (who === net.myId) return;            // our own line coming back
      show(who === 'host' ? nameOf('host') : m.n || 'لاعب', text, false);
    }
  });
  net.on('emo', (m, from) => {
    if (!FACE[m.e]) return;
    if (net.role === 'host') {
      if (!allowed(from)) return;
      face(from, m.e); show(nameOf(from), FACE[m.e], false);
      net.say(null, { t: 'emo', e: m.e, who: from, n: nameOf(from) });
    } else {
      const who = typeof m.who === 'string' ? m.who : 'host';
      if (who === net.myId) return;
      face(who, m.e); show(who === 'host' ? nameOf('host') : m.n || 'لاعب', FACE[m.e], false);
    }
  });

  function say(text) {
    text = cleanLine(text);
    if (!text || !net.role) return false;
    if (Date.now() - lastSent < 700) return false;
    lastSent = Date.now();
    show(net.name || 'أنا', text, true);
    net.say(net.role === 'host' ? null : 'host', { t: 'chat', s: text });
    return true;
  }
  function emote(key) {
    if (!FACE[key] || !net.role) return false;
    if (Date.now() - lastSent < 700) return false;
    lastSent = Date.now();
    show(net.name || 'أنا', FACE[key], true);
    play.notice(FACE[key], false, 1500);
    net.say(net.role === 'host' ? null : 'host', { t: 'emo', e: key });
    return true;
  }
  function open() {
    if (!net.role || !box.hidden) return;
    box.hidden = false; logEl.classList.add('open');
    play.setModal(true);
    input.value = '';
    input.focus();
    setTimeout(() => { if (!box.hidden) input.focus(); }, 30);      // (again, once the panel that was up has let go of the keyboard)
  }
  function close() {
    if (box.hidden) return;
    box.hidden = true; logEl.classList.remove('open'); input.blur();
    play.setModal(false);
  }
  box.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); if (say(input.value)) input.value = ''; close(); });
  box.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.face) { emote(t.dataset.face); close(); }
    else if (t.dataset.x) close();
  });
  // keys typed in the box are not the game's; Esc closes it
  box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } });
  box.addEventListener('keyup', (e) => e.stopPropagation());
  btn.addEventListener('click', () => open());
  window.addEventListener('keydown', (e) => {
    if (!net.role || !box.hidden || play.state.modal || e.repeat) return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); open(); }
  }, true);
  // lines fade after a while; the 💬 button is there on a touch screen while in a room
  play.onTick(() => {
    const now = performance.now();
    for (const l of lines) if (now - l.at > 9000) l.el.classList.add('old');
    const want = !net.role || !matchMedia('(pointer: coarse)').matches;
    if (btn.hidden !== want) btn.hidden = want;
    if (!net.role && !box.hidden) close();
  });

  const api = { open, close, say, emote, count: 0, faces: 0, get isOpen() { return !box.hidden; } };
  window.__GAME_CHAT = api;
  return api;
}
