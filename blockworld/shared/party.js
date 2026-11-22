// Things friends do together in a shared game, on top of the link (net.js):
//   a gift       look at a friend and press the place button: one of what is in the hand goes to them
//   a contest    the host starts a building contest with a theme and a clock; when it ends everyone votes
//   a team goal  one goal for the whole room, counted across everyone
//
//   createParty({ play, net, adv, world })      (net.js makes it)

const THEMES = ['بيت', 'برج', 'جسر', 'قلعة', 'سفينة', 'حديقة', 'تمثال', 'مطعم', 'مدرسة', 'ملعب'];
const GOALS = [['اكسروا 60 مكعب مع بعض', (s) => s.broken, 60], ['حطوا 80 مكعب مع بعض', (s) => s.placed, 80], ['اقضوا على 6 وحوش مع بعض', (s) => s.kills.monster, 6], ['صيدوا 5 حيوانات مع بعض', (s) => s.kills.animal, 5]];
const CONTEST_SECS = 300, VOTE_SECS = 30;

export function createParty({ play, net, adv }) {
  const st = play.state;
  const css = document.createElement('style');
  css.textContent = `#partyChips { position: fixed; left: 50%; top: 4px; transform: translateX(-50%); z-index: 22; display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none; direction: rtl; }
#partyChips div { padding: 4px 12px; border-radius: 9px; background: rgba(8, 11, 16, .82); border: 1px solid rgba(155, 227, 106, .7); color: #e9ffd8; font: 700 12.5px/1.4 system-ui, sans-serif; white-space: nowrap; }
#partyChips div[hidden] { display: none; }
#partyVote { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 53; direction: rtl; padding: 14px 18px; border-radius: 14px; background: rgba(10, 14, 20, .94); border: 1px solid rgba(155, 227, 106, .8); color: #f1f4f8; font: 700 15px/1.6 system-ui, sans-serif; text-align: center; }
#partyVote[hidden] { display: none; }
#partyVote button { font: inherit; font-size: 14.5px; min-height: 44px; margin: 6px 4px 0; padding: 6px 18px; border-radius: 10px; border: 0; cursor: pointer; color: #0b0f14; background: #9be36a; }
#partyGift { position: fixed; left: 50%; top: 58%; transform: translateX(-50%); z-index: 20; pointer-events: none; direction: rtl; padding: 5px 12px; border-radius: 8px; background: rgba(8, 11, 16, .82); border: 1px solid rgba(255, 255, 255, .28); color: #f1f4f8; font: 700 13px/1.4 system-ui, sans-serif; white-space: nowrap; }
#partyGift[hidden] { display: none; }`;
  document.head.appendChild(css);
  const chips = document.createElement('div'); chips.id = 'partyChips';
  chips.innerHTML = '<div hidden></div><div hidden></div>';
  const vote = document.createElement('div'); vote.id = 'partyVote'; vote.hidden = true;
  const giftTag = document.createElement('div'); giftTag.id = 'partyGift'; giftTag.hidden = true;
  document.body.append(chips, vote, giftTag);
  const [contestChip, teamChip] = chips.children;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nameOf = (id) => (id === net.myId ? 'أنت' : (net.others.get(id) || {}).name || 'لاعب');

  // ---- gifts
  let aimed = null;
  function give() {
    const s = st.slots[st.sel];
    if (!aimed || !s || s.empty || !s.id || (!s.tool && !(s.n > 0))) return false;
    const to = aimed;
    net.say(to, { t: 'gift', item: { id: s.id, n: 1 } });
    if (s.tool) play.setSlot(st.sel, adv.empty); else { s.n--; play.setSlot(st.sel, s.n > 0 ? s : (s.kit ? adv.empty : s)); }
    st.gifts = (st.gifts || 0) + 1;
    play.notice('عطيت ' + nameOf(to) + ' ' + s.name + '.', false, 2600);
    if (play.sound) play.sound.ui();
    return true;
  }
  net.on('gift', (m, from) => {
    const id = m.item && (m.item.id | 0), it = id ? (play.itemOf && play.itemOf(id)) || adv.item(id, 1) : null;      // only things this game knows, one at a time
    if (!it) return;
    if (!play.give({ ...it, n: 1 })) { play.notice(nameOf(from) + ' عطاك ' + it.name + ' بس حقيبتك مليانة.', false, 3500); return; }
    play.notice(nameOf(from) + ' عطاك ' + it.name + '.', false, 3500);
    if (play.sound) play.sound.pick();
  });
  play.onUseFirst(() => (aimed ? give() : false));

  // ---- the building contest
  const contest = { on: false, theme: '', left: 0, voting: false, ballots: new Map(), voteLeft: 0 };
  function startContest() {
    if (net.role !== 'host' || contest.on || contest.voting) return false;
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
    net.say(null, { t: 'contest', theme, secs: CONTEST_SECS });
    begin(theme, CONTEST_SECS);
    return true;
  }
  function begin(theme, secs) { contest.on = true; contest.theme = theme; contest.left = secs; contest.voting = false; play.notice('مسابقة بناء! الموضوع: ' + theme + '. عندكم ' + Math.round(secs / 60) + ' دقايق، وبعدها الكل يصوّت.', false, 8000); if (play.sound && play.sound.level) play.sound.level(); }
  net.on('contest', (m) => begin(String(m.theme || '').slice(0, 20), Math.max(10, Math.min(900, +m.secs || CONTEST_SECS))));
  function askVote() {
    contest.on = false; contest.voting = true; contest.voteLeft = VOTE_SECS;
    const ids = [...net.others.keys()];
    vote.innerHTML = '<div>خلص وقت البناء. صوّت لأحلى «' + esc(contest.theme) + '»:</div>' + ids.map((id) => `<button type="button" data-for="${esc(id)}">${esc(nameOf(id))}</button>`).join('');
    vote.hidden = ids.length === 0;
    if (!vote.hidden && !st.modal) { play.setModal(true); contest.held = true; }      // the mouse is let go for the vote without that counting as Esc
  }
  net.on('vote', () => askVote());
  const voted = () => { vote.hidden = true; if (contest.held) { contest.held = false; play.setModal(false); } };
  vote.addEventListener('click', (e) => { const b = e.target.closest('[data-for]'); if (!b) return; voted(); if (net.role === 'host') contest.ballots.set('host', b.dataset.for); else net.say('host', { t: 'ballot', for: b.dataset.for }); });
  net.on('ballot', (m, from) => { if (net.role === 'host' && contest.voting && typeof m.for === 'string' && m.for !== from) contest.ballots.set(from, m.for); });
  function finish() {
    contest.voting = false; voted();
    const tally = new Map();
    for (const f of contest.ballots.values()) tally.set(f, (tally.get(f) || 0) + 1);
    contest.ballots.clear();
    const top = Math.max(0, ...tally.values()), winners = top ? [...tally].filter(([, n]) => n === top).map(([id]) => id) : [];
    const names = winners.map((id) => (id === 'host' ? net.name || 'صاحب الغرفة' : (net.peers.get(id) || {}).name || 'لاعب'));
    net.say(null, { t: 'result', winners, names, theme: contest.theme });
    result({ winners, names, theme: contest.theme });
  }
  function result(m) {
    contest.on = false; contest.voting = false; voted();
    const names = Array.isArray(m.names) ? m.names.map((n) => String(n).slice(0, 16)) : [], mine = Array.isArray(m.winners) && m.winners.includes(net.myId);
    contest.last = { winners: m.winners, names };
    play.notice(names.length ? 'الفايز في مسابقة «' + String(m.theme || '') + '»: ' + names.join(' و') + (mine ? ' — مبروك! (+30 خبرة)' : '') : 'ما حد صوّت في المسابقة.', false, 8000);
    if (mine) { st.xp = (st.xp || 0) + 30; st.contestWins = (st.contestWins || 0) + 1; if (adv.wardrobe) adv.wardrobe.grant('architect'); if (play.sound && play.sound.level) play.sound.level(); }
  }
  net.on('result', (m) => result(m));

  // ---- the team goal
  const team = { i: 0, base: null, have: 0, need: 0, text: '', done: 0 };
  const mineNow = () => GOALS.map(([, f]) => f(st));
  function myShare() { if (!team.base) team.base = mineNow(); return mineNow().map((v, k) => v - team.base[k]); }
  net.on('team', (m) => { team.text = String(m.text || '').slice(0, 60); team.have = +m.have || 0; team.need = +m.need || 0; });
  net.on('teamdone', (m) => { st.xp = (st.xp || 0) + 20; st.teamWins = (st.teamWins || 0) + 1; play.notice('خلصتوا مهمة الفريق: ' + String(m.text || '') + ' (+20 خبرة للكل)', false, 6000); if (play.sound && play.sound.level) play.sound.level(); });
  net.on('share', (m, from) => { const p = net.peers.get(from); if (p && Array.isArray(m.v)) p.share = m.v.slice(0, GOALS.length).map((n) => Math.max(0, Math.min(1e5, +n || 0))); });

  let slow = 0;
  play.onTick((s, dt) => {
    // who the player is looking at, close enough to hand something to
    aimed = null;
    if (net.role && !st.modal) {
      const cp = Math.cos(st.pitch), vx = -Math.sin(st.yaw) * cp, vy = Math.sin(st.pitch), vz = -Math.cos(st.yaw) * cp, ey = st.pos.y + play.tuning.eye;
      let best = 4.2;
      for (const [id, o] of net.others) { if (!o.s) continue; const cx = o.x - st.pos.x, cy = o.y + 1.0 - ey, cz = o.z - st.pos.z, t = cx * vx + cy * vy + cz * vz; if (t > 0 && t < best && cx * cx + cy * cy + cz * cz - t * t < 0.7) { best = t; aimed = id; } }
    }
    const held = st.slots[st.sel], can = aimed && held && !held.empty && held.id && (held.tool || held.n > 0);
    const text = can ? nameOf(aimed) + ' · زر البناء يعطيه ' + held.name : '';
    if (giftTag.textContent !== text) giftTag.textContent = text;
    if (giftTag.hidden === !!text) giftTag.hidden = !text;
    if (!can) aimed = null;
    // the contest clock
    if (contest.on) { contest.left -= dt; const t = Math.max(0, Math.ceil(contest.left)); contestChip.hidden = false; contestChip.textContent = 'مسابقة بناء: ' + contest.theme + ' · ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); if (contest.left <= 0 && net.role === 'host') { net.say(null, { t: 'vote' }); askVote(); } else if (contest.left <= -5) contest.on = false; }
    else if (contest.voting) { contestChip.hidden = false; contestChip.textContent = 'التصويت شغّال…'; if (net.role === 'host') { contest.voteLeft -= dt; if (contest.voteLeft <= 0 || contest.ballots.size >= net.peers.size + 1) finish(); } }
    else if (!contestChip.hidden) contestChip.hidden = true;
    // the team goal: everyone reports their share, the host adds them up
    if (!net.role) { if (!teamChip.hidden) teamChip.hidden = true; team.base = null; return; }
    if ((slow -= dt) > 0) return;
    slow = 1;
    const share = myShare();
    if (net.role === 'guest') net.say('host', { t: 'share', v: share });
    else {
      const [text, , need] = GOALS[team.i % GOALS.length], k = team.i % GOALS.length;
      let have = share[k] - (team.from ? team.from.host || 0 : 0);
      for (const [id, p] of net.peers) have += ((p.share || [])[k] || 0) - (team.from ? team.from[id] || 0 : 0);
      team.text = text; team.need = need; team.have = Math.max(0, have);
      net.say(null, { t: 'team', text, have: team.have, need });
      if (team.have >= need) {
        net.say(null, { t: 'teamdone', text }); st.xp = (st.xp || 0) + 20; st.teamWins = (st.teamWins || 0) + 1; play.notice('خلصتوا مهمة الفريق: ' + text + ' (+20 خبرة للكل)', false, 6000);
        team.i++; team.done++;
        // the next goal counts from here
        const nk = team.i % GOALS.length; team.from = { host: share[nk] }; for (const [id, p] of net.peers) team.from[id] = (p.share || [])[nk] || 0;
      }
    }
    teamChip.hidden = false; teamChip.textContent = 'مهمة الفريق: ' + team.text + ' · ' + Math.min(team.have, team.need) + '/' + team.need;
  });
  const api = { give, startContest, contest, team, finish, askVote, get aimed() { return aimed; }, themes: THEMES };
  window.__GAME_PARTY = api;
  return api;
}
