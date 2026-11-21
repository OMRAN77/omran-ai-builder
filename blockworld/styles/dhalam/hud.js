// Live HUD for "dhalam". The markup lives in index.html, where the play shot shows it as designed;
// this module finds its parts and keeps them up to date while the game runs. Health, warmth and
// the day clock are not simulated yet, so they are left exactly as drawn.

/** The starting bar. `id` (the block a slot places) is filled in by the world; slots without one are carried, not placed. */
export const SLOTS = [
  { key: 'axe', icon: 'axe', name: 'فأس', tool: 'axe' },
  { key: 'pick', icon: 'pick', name: 'معول حديدي', tool: 'pick' },
  { key: 'torch', icon: 'torch', name: 'مشعل', n: 12 },
  { key: 'log', icon: 'log', name: 'جذع صنوبر', n: 34 },
  { key: 'stone', icon: 'stone', name: 'حجر', n: 58 },
  { key: 'plank', icon: 'plank', name: 'ألواح خشب', n: 16 },
  { key: 'meat', icon: 'meat', name: 'لحم مجفف', n: 5 },
  { key: 'bandage', icon: 'bandage', name: 'ضماد', n: 2 },
];

const WINDS = ['ش', 'ش·ق', 'ق', 'ج·ق', 'ج', 'ج·غ', 'غ', 'ش·غ'];
/**
 * Compass strip: ticks every 15 degrees, the eight winds, and a pip at the bearing of home.
 * Angles in degrees, 0 = north, 90 = east; `heading` in [0, 360).
 */
export function drawCompass(heading, homeBearing, homeDist) {
  const strip = document.getElementById('compassStrip');
  const SPAN = 60, K = 50 / SPAN;                                   // per cent of the strip per degree
  const rel = (b) => ((b - heading + 540) % 360) - 180;
  let html = '';
  for (let b = 0; b < 360; b += 15) {
    const r = rel(b);
    if (Math.abs(r) > SPAN) continue;
    const major = b % 45 === 0;
    html += '<span class="c-tick' + (major ? ' c-major' : '') + '" style="--x:' + (r * K).toFixed(2) + '%"></span>';
    if (major) html += '<span class="c-dir' + (b % 90 === 0 ? ' c-card' : '') + '" style="--x:' + (r * K).toFixed(2) + '%">' + WINDS[b / 45] + '</span>';
  }
  const hr = Math.max(-SPAN + 4, Math.min(SPAN - 4, rel(homeBearing)));
  html += '<span class="c-pip" style="--x:' + (hr * K).toFixed(2) + '%"></span>';
  strip.innerHTML = html;
  document.getElementById('homeDist').textContent = Math.round(homeDist) + ' م';
}

export function initHud(root = document.getElementById('hud')) {
  const q = (sel) => root.querySelector(sel);
  const touch = document.body.classList.contains('touch');
  const bar = q('.bar'), label = q('.bar-label b'), more = q('.more');
  const slotEls = [...bar.querySelectorAll('.slot')].map((el) => ({ el, use: el.querySelector('use'), n: el.querySelector('.n'), icon: null, count: null, on: null }));
  const target = q('.target'), tUse = q('.target use'), tName = q('.t-name'), tBar = q('.t-bar i'), tNum = q('.t-num');
  let navH = -1, navB = 0, navD = -1, pct = -1, locked = false, tKey = '', lastSel = -1;

  // small desktop windows: the panels were laid out for a wide screen, so scale the whole overlay down a little
  const fit = () => { root.style.zoom = touch ? '' : String(Math.max(0.7, Math.min(1, window.innerWidth / 1200))); };
  fit();
  window.addEventListener('resize', fit);

  const showProgress = () => { tBar.style.setProperty('--v', pct + '%'); tNum.textContent = locked ? 'محمي' : (pct > 0 ? pct + '%' : ''); };
  return {
    touch,
    els: { stick: q('.stick'), knob: q('.s-knob'), jump: q('.tb-jump'), dig: q('.tb-break'), place: q('.tb-place'), look: q('.look'), bar, more },
    /** Update the bar from the game's slots: icons, counts, the chosen slot and its name. */
    setSlots(list, sel) {
      slotEls.forEach((s, i) => {
        const d = list[i];
        if (!d) return;
        if (s.icon !== d.icon) { s.icon = d.icon; s.use.setAttribute('href', '#i-' + d.icon); }
        const count = d.tool ? null : d.n;
        if (s.count !== count) {
          s.count = count;
          if (count === null) { if (s.n) s.n.hidden = true; }
          else { if (!s.n) { s.n = document.createElement('span'); s.n.className = 'n'; s.el.appendChild(s.n); } s.n.hidden = false; s.n.textContent = count; }
        }
        if (s.on !== (i === sel)) { s.on = i === sel; s.el.classList.toggle('on', s.on); }
      });
      const d = list[sel];
      label.textContent = d ? d.name + (d.tool || d.id ? '' : ' · قريبًا') : '';
      // phones show five slots at a time: a newly chosen slot brings its page with it
      if (touch && sel !== lastSel) bar.classList.toggle('p2', sel >= 5 || (bar.classList.contains('p2') && sel >= 3));
      lastSel = sel;
    },
    /** Phones: flip between the two pages of the bar (slots 1 to 5, slots 4 to 8). */
    page() { bar.classList.toggle('p2'); },
    /** heading / bearing of home in degrees (0 = north, 90 = east), distance in metres. */
    setNav(heading, homeBearing, homeDist) {
      const h = (((Math.round(heading * 2) / 2) % 360) + 360) % 360, b = Math.round(homeBearing), d = Math.round(homeDist);
      if (h === navH && b === navB && d === navD) return;
      navH = h; navB = b; navD = d;
      drawCompass(h, b, d);
    },
    /** What the crosshair is on: null, or { name, icon, locked } (locked = it cannot be broken). */
    setTarget(t) {
      target.hidden = !t;
      if (!t) { tKey = ''; return; }
      const key = t.name + '|' + t.icon + '|' + (t.locked ? 1 : 0);
      if (key === tKey) return;
      tKey = key;
      tName.textContent = t.name;
      tUse.setAttribute('href', '#i-' + t.icon);
      locked = !!t.locked;
      showProgress();
    },
    /** Dig progress, 0..1. */
    setProgress(p) {
      const v = Math.round(p * 100);
      if (v === pct) return;
      pct = v;
      showProgress();
    },
  };
}
