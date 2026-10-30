// "How the casino wins" page controller. Game cards, the 1,000-player calculator
// (simulated in worker.js) and the session check. Nothing leaves the browser: the
// page's CSP (connect-src 'none') blocks every network request.
import { getLang, setLang } from './i18n.js';
import { text, GAMES, CUSTOM_GAME } from './casino-text.js';
import * as C from './core/casino.js';
import * as samples from './samples.js';

const $ = (s) => document.querySelector(s);
let lang = getLang();
const tr = (key) => text(key, lang);
const pick = (p) => (lang === 'en' ? p[1] : p[0]);
const money = (v, d = 2) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d });
// A number kept left-to-right next to a unit word, so it reads correctly in both languages.
const withUnit = (n, unitKey) => [el('bdi', { dir: 'ltr' }, n), ' ', tr(unitKey)];
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
const SEED = 'taryam-casino';
const SVG = 'http://www.w3.org/2000/svg';

// Accepts Arabic-Indic digits and the Arabic decimal and thousands separators.
function num(id) {
  const s = $(id).value.trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, '.').replace(/[٬,\s]/g, '');
  return s === '' ? null : Number(s);
}

// ---------- worker ----------
let worker = null, nextId = 1;
const pending = new Map();
function runTask(task, payload, onProgress = () => {}) {
  if (!worker) {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      if (e.data.type === 'progress') { p.onProgress(e.data.value); return; }
      pending.delete(e.data.id);
      if (e.data.type === 'result') p.resolve(e.data.result); else p.reject(e.data.error);
    };
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, task, payload });
  });
}

// ---------- DOM helpers ----------
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) n.append(c instanceof Node ? c : String(c));
  return n;
}
function svg(tag, attrs = {}, ...children) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v);
  for (const c of children) n.append(c);
  return n;
}
function cards(list) {
  return el('div', { class: 'cards' }, list.filter(Boolean).map((c) => el('div', { class: 'card ' + (c.cls || '') }, el('div', { class: 'k' }, c.k), el('div', { class: 'v' }, c.v), c.s ? el('div', { class: 's' }, c.s) : null)));
}
function showError(id, err) {
  const box = $('#err-' + id);
  box.hidden = !err;
  box.textContent = err ? (lang === 'en' ? err.en : err.ar) || err.message || String(err) : '';
}

// ---------- game cards ----------
let slotFacts = null; // exact figures of the example slot, from the worker
const CALC_GAMES = [...GAMES.filter((g) => g.calc), CUSTOM_GAME];

function renderCards() {
  const box = $('#gameCards');
  box.replaceChildren();
  for (const g of GAMES) {
    const points = g.points.map(pick);
    if (g.id === 'slot' && slotFacts) {
      points.splice(1, 0, lang === 'en'
        ? `In the example game, ${pct(slotFacts.hit, 0)} of spins "win", but ${pct(slotFacts.belowBet, 0)} of all spins pay less than the bet: a loss with a winning sound.`
        : `في لعبة المثال: ${pct(slotFacts.hit, 0)} من اللفات فيها «ربح»، لكن ${pct(slotFacts.belowBet, 0)} من كل اللفات ترجع أقل من الرهان، أي خسارة بصوت فوز.`);
    }
    const figs = [];
    if (g.take) figs.push(el('div', { class: 'fig' }, el('div', { class: 'k' }, tr('houseTake')), el('div', { class: 'v' }, pick(g.take))));
    if (g.id === 'buyBonus') figs.push(el('div', { class: 'fig' }, el('div', { class: 'k' }, tr('houseTake')), el('div', { class: 'v' }, tr('likeSlots'))));
    if (g.win) figs.push(el('div', { class: 'fig' }, el('div', { class: 'k' }, tr('winRound')), el('div', { class: 'v' }, pick(g.win))));
    const btn = g.calc ? el('button', { type: 'button', 'data-calc': g.id }, tr('calcThis')) : null;
    if (btn) btn.addEventListener('click', () => { $('#c-game').value = g.id; onGameChange(); $('#calc').scrollIntoView({ behavior: 'smooth' }); runCalc(); });
    box.append(el('article', { class: 'game', id: 'game-' + g.id },
      el('h3', {}, pick(g.name)),
      g.examples ? el('div', { class: 'ex' }, g.examples) : null,
      figs.length ? el('div', { class: 'figs' }, figs) : null,
      el('ul', {}, points.map((p) => el('li', {}, p))),
      btn));
  }
}

// ---------- calculator ----------
function fillGameSelect() {
  const sel = $('#c-game');
  const current = sel.value || 'slot';
  sel.replaceChildren(...CALC_GAMES.map((g) => el('option', { value: g.id }, pick(g.name))));
  sel.value = current;
}
function syncGameFields() {
  const id = $('#c-game').value;
  document.querySelectorAll('[data-for]').forEach((n) => { n.hidden = n.dataset.for !== id; });
}
function onGameChange() {
  syncGameFields();
  $('#c-rph').value = CALC_GAMES.find((g) => g.id === $('#c-game').value).rph;
}

// The selected game as an outcome distribution (or the slot model), with its figures.
function selectedGame() {
  const id = $('#c-game').value;
  if (id === 'slot') return { kind: 'slot', stats: { houseEdge: 1 - slotFacts.rtp, winChance: slotFacts.atLeastBet, winKey: 'atLeastBet' } };
  let dist;
  if (id === 'crash') dist = C.crash({ cashout: num('#c-cashout') });
  else if (id === 'mines') dist = C.mines({ mines: num('#c-mines'), picks: num('#c-picks') });
  else if (id === 'blackjack') dist = C.blackjack();
  else if (id === 'roulette') dist = C[$('#c-roulette').value]();
  else dist = C.simpleGame({ rtp: num('#c-rtp') / 100, winChance: num('#c-winChance') / 100 });
  return { kind: 'dist', dist, stats: C.describe(dist) };
}

const MAX_ROUNDS = 50000;
const ROUND_BUDGET = 3e6; // players × rounds per run
let last = null;

async function runCalc() {
  showError('calc', null);
  const btn = $('#run-calc'), prog = $('#prog-calc');
  btn.disabled = true; prog.hidden = false; prog.value = 0;
  try {
    if (!slotFacts) await loadSlotFacts();
    const game = selectedGame();
    const balance = num('#c-balance'), bet = num('#c-bet'), rph = num('#c-rph'), hours = num('#c-hours'), target = num('#c-target');
    if (!(rph > 0) || !(hours > 0)) throw new C.GameError('الجولات في الساعة وعدد الساعات لازم يكونوا أكبر من صفر', 'Rounds per hour and hours must be above zero');
    const rounds = Math.round(rph * hours);
    if (rounds < 1 || rounds > MAX_ROUNDS) throw new C.GameError(`عدد الجولات (${money(rounds, 0)}) لازم يكون من 1 إلى ${money(MAX_ROUNDS, 0)}`, `The number of rounds (${money(rounds, 0)}) must be from 1 to ${money(MAX_ROUNDS, 0)}`);
    const players = Math.max(60, Math.min(1000, Math.floor(ROUND_BUDGET / rounds)));
    const options = { players, rounds, bet, balance, target, checkpoints: 60, samplePaths: 12 };
    const result = await runTask('players', { kind: game.kind, dist: game.dist, raw: game.kind === 'slot' ? samples.desertGold : null, seed: SEED, options }, (v) => { prog.value = v; });
    last = { result, stats: game.stats, rph, hours, gameId: $('#c-game').value };
    renderCalc();
  } catch (e) {
    showError('calc', e);
  } finally {
    btn.disabled = false; prog.hidden = true;
  }
}

function hoursText(h) {
  if (lang === 'en') return h === 1 ? '1 hour' : `${money(h)} hours`;
  if (h === 1) return 'ساعة واحدة';
  if (h === 2) return 'ساعتين';
  if (Number.isInteger(h) && h >= 3 && h <= 10) return `${h} ساعات`;
  return `${money(h)} ساعة`;
}

function renderCalc() {
  const box = $('#res-calc');
  box.replaceChildren();
  if (!last) return;
  const { result: r, stats, rph, hours } = last;
  const per100 = (n) => money((n / r.players) * 100, 1);
  const meanChange = r.meanFinal - r.balance;
  box.append(el('p', { class: 'headline', id: 'calc-headline' }, lang === 'en'
    ? `Of ${money(r.players, 0)} players who started with ${money(r.balance)} AED and played ${hoursText(hours)} (${money(r.rounds, 0)} rounds): ${money(r.ahead, 0)} left ahead and ${money(r.broke, 0)} lost their whole balance.`
    : `من ${money(r.players, 0)} لاعب بدأوا بـ${money(r.balance)} درهم ولعبوا ${hoursText(hours)} (${money(r.rounds, 0)} جولة): ${money(r.ahead, 0)} خرجوا رابحين، و${money(r.broke, 0)} خسروا كل رصيدهم.`));
  box.append(cards([
    { k: tr('aheadPer100'), v: per100(r.ahead), cls: 'good', s: `${money(r.ahead, 0)} / ${money(r.players, 0)}` },
    { k: tr('brokePer100'), v: per100(r.broke), cls: 'bad', s: [el('bdi', { dir: 'ltr' }, `${money(r.broke, 0)} / ${money(r.players, 0)}`), ' · ', tr('lessThanBet')] },
    r.reached !== undefined && r.reached > 0 && { k: tr('reachedPer100'), v: per100(r.reached), s: `${money(r.reached, 0)} / ${money(r.players, 0)}` },
    { k: tr(meanChange <= 0 ? 'avgLoss' : 'avgGain'), v: withUnit(money(Math.abs(meanChange)), 'aed'), cls: meanChange <= 0 ? 'bad' : 'good', s: [el('bdi', { dir: 'ltr' }, pct(Math.abs(meanChange) / r.balance, 0)), ' ', tr('ofBalance')] },
    { k: tr('avgWagered'), v: withUnit(money(r.meanWagered), 'aed'), s: [el('bdi', { dir: 'ltr' }, money(r.meanWagered / r.balance, 1) + '×'), ' ', tr('ofBalance')] },
    r.medianBustRound !== null && { k: tr('halfBroke'), v: withUnit(money((r.medianBustRound / rph) * 60, 0), 'minutes') },
    { k: tr('houseTake'), v: withUnit(money(stats.houseEdge * 100, 2), 'aed') },
    { k: tr(stats.winKey || 'winRound'), v: pct(stats.winChance, 1) },
    { k: tr('best'), v: withUnit(money(r.bestFinal), 'aed') },
  ]));
  box.append(chart(r, rph));
}

let redrawChart = null;
window.addEventListener('resize', () => { if (redrawChart) redrawChart(); });

// Balance over time: the 10–90% band, the median player, a few sample players and
// the starting balance. A crosshair tooltip reads the band at each checkpoint.
function chart(r, rph) {
  const wrap = el('div', { class: 'chart-block' });
  wrap.append(el('h3', { class: 'sub' }, tr('chartTitle')));
  const legend = el('div', { class: 'legend' },
    el('span', {}, el('i', { class: 'sw sw-median' }), tr('legendMedian')),
    el('span', {}, el('i', { class: 'sw sw-band' }), tr('legendBand')),
    el('span', {}, el('i', { class: 'sw sw-sample' }), tr('legendSample')),
    el('span', {}, el('i', { class: 'sw sw-start' }), tr('legendStart')));
  const holder = el('div', { class: 'chart-wrap' });
  wrap.append(legend, holder);
  const minutesAt = r.at.map((a) => (a / rph) * 60);
  const draw = () => {
    holder.replaceChildren();
    const W = Math.max(300, holder.clientWidth || 720), H = 300;
    const m = { l: 58, r: 14, t: 12, b: 38 };
    const xMax = minutesAt.at(-1) || 1;
    const yMax = Math.max(r.balance, ...r.band.p90, r.target || 0) * 1.1;
    const x = (v) => m.l + (v / xMax) * (W - m.l - m.r);
    const y = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': tr('chartTitle') });
    const grid = svg('g', { class: 'grid' });
    for (const v of niceTicks(0, yMax, 5)) {
      grid.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      grid.append(svg('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, document.createTextNode(money(v, 0))));
    }
    for (const v of niceTicks(0, xMax, 6)) grid.append(svg('text', { x: x(v), y: H - m.b + 18, 'text-anchor': 'middle' }, document.createTextNode(money(v, 0))));
    grid.append(svg('text', { x: (m.l + W - m.r) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axis-title' }, document.createTextNode(tr('axisTime'))));
    root.append(grid);
    // Sample players above the band's top are cut at the plot edge, not flattened onto it.
    const clipId = 'plot-clip';
    root.append(svg('defs', {}, svg('clipPath', { id: clipId }, svg('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }))));
    const line = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(minutesAt[i]).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const bandPath = line(r.band.p90) + r.band.p10.map((v, i) => i).reverse().map((i) => `L${x(minutesAt[i]).toFixed(1)},${y(r.band.p10[i]).toFixed(1)}`).join('') + 'Z';
    root.append(svg('path', { d: bandPath, class: 'band' }));
    for (const p of r.paths) root.append(svg('path', { d: line(p), class: 'sample', 'clip-path': `url(#${clipId})` }));
    root.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(r.balance), y2: y(r.balance), class: 'start' }));
    if (r.target) root.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(r.target), y2: y(r.target), class: 'target' }));
    root.append(svg('path', { d: line(r.band.p50), class: 'median' }));
    const cross = svg('line', { y1: m.t, y2: H - m.b, class: 'cross', visibility: 'hidden' });
    const dot = svg('circle', { r: 4.5, class: 'dot', visibility: 'hidden' });
    root.append(cross, dot);
    const hit = svg('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' });
    root.append(hit);
    const tip = el('div', { class: 'tip', hidden: true });
    holder.append(root, tip);
    const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('pointermove', (e) => {
      const box = root.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      const v = ((px - m.l) / (W - m.l - m.r)) * xMax;
      let i = 0;
      for (let j = 1; j < minutesAt.length; j++) if (Math.abs(minutesAt[j] - v) < Math.abs(minutesAt[i] - v)) i = j;
      const cx = x(minutesAt[i]);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', y(r.band.p50[i])); dot.setAttribute('visibility', 'visible');
      tip.replaceChildren(
        el('div', { class: 'tip-h' }, `${money(minutesAt[i], 0)} ${tr('minutes')}`),
        el('div', {}, `${tr('colMedian')}: ${money(r.band.p50[i])} ${tr('aed')}`),
        el('div', { class: 'muted' }, `${tr('legendBand')}: ${money(r.band.p10[i])} – ${money(r.band.p90[i])}`));
      tip.hidden = false;
      const left = (cx / W) * box.width;
      tip.style.left = Math.min(box.width - tip.offsetWidth - 4, Math.max(4, left + 12)) + 'px';
      tip.style.top = '8px';
    });
  };
  requestAnimationFrame(draw);
  redrawChart = draw;
  // Table view of the same numbers, every sixth checkpoint.
  const rows = r.at.map((_, i) => i).filter((i) => i % 6 === 0 || i === r.at.length - 1);
  wrap.append(el('details', { class: 'table-view' }, el('summary', {}, tr('tableView')),
    el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, [tr('colTime'), tr('colP10'), tr('colMedian'), tr('colP90')].map((h) => el('th', {}, h)))),
      el('tbody', {}, rows.map((i) => el('tr', {}, [money(minutesAt[i], 0), money(r.band.p10[i]), money(r.band.p50[i]), money(r.band.p90[i])].map((v) => el('td', { class: 'num' }, v)))))))));
  return wrap;
}

function niceTicks(lo, hi, count) {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

// ---------- session check ----------
function runSession() {
  showError('session', null);
  const box = $('#res-session');
  box.replaceChildren();
  try {
    const s = C.sessionSummary({ start: num('#s-start'), bets: num('#s-bets'), wins: num('#s-wins') });
    box.append(cards([
      { k: tr('sNet'), v: withUnit((s.net >= 0 ? '+' : '−') + money(Math.abs(s.net)), 'aed'), cls: s.net >= 0 ? 'good' : 'bad' },
      { k: tr('sReturn'), v: withUnit(money(s.returnRate * 100), 'aed') },
      { k: tr('sTake'), v: withUnit(money(s.houseTake * 100), 'aed'), cls: s.houseTake > 0 ? 'bad' : 'good' },
      s.turnover !== null && { k: tr('sTurnover'), v: withUnit(money(s.turnover, 1), 'times') },
      s.end !== null && { k: tr('sEnd'), v: withUnit(money(s.end), 'aed') },
    ]));
    const verdict = s.net > 0 ? ['warn', 'sAhead'] : s.houseTake > 0.06 ? ['warn', 'sHigh'] : ['normal', 'sUsual'];
    box.append(el('div', { class: 'verdict ' + verdict[0], id: 'session-verdict' }, tr(verdict[1])));
  } catch (e) {
    showError('session', e);
  }
}

// ---------- language and wiring ----------
async function loadSlotFacts() {
  const x = await runTask('exact', { raw: samples.desertGold });
  const b = x.distribution.buckets;
  slotFacts = {
    rtp: x.rtp.value,
    hit: x.distribution.hitFrequency.value,
    belowBet: b[1].probability.value, // base-round wins above 0 and below 1× bet
    atLeastBet: 1 - b[0].probability.value - b[1].probability.value,
  };
  renderCards();
}

function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = tr('pageTitle') + ' — TARYAM';
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = tr(n.dataset.t); });
  fillGameSelect();
  renderCards();
  renderCalc();
  if ($('#res-session').childElementCount) runSession();
}

function init() {
  $('#langToggle').addEventListener('click', () => { lang = lang === 'ar' ? 'en' : 'ar'; setLang(lang); applyLang(); });
  $('#c-game').addEventListener('change', onGameChange);
  $('#run-calc').addEventListener('click', runCalc);
  $('#run-session').addEventListener('click', runSession);
  $('#example-session').addEventListener('click', () => {
    $('#s-start').value = '1500'; $('#s-bets').value = '10000'; $('#s-wins').value = '8500';
    runSession();
  });
  applyLang();
  onGameChange();
  loadSlotFacts().catch((e) => showError('calc', e));
}

init();
