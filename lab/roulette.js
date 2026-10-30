// "Roulette: the truth in numbers" page controller: the true house-edge table per
// wheel, and the statistical read of a pasted sequence of winning numbers. Nothing
// leaves the page; everything is computed locally.
import { getLang, setLang } from './i18n.js';
import { text, fmt } from './roulette-text.js';
import { houseEdge, analyze, parseSpins, colorOf } from './core/roulette.js';

const $ = (s) => document.querySelector(s);
let lang = getLang();
const tr = (key) => text(key, lang);
const pct = (v, d = 2) => (v * 100).toFixed(d) + '%';
const num = (v, d = 1) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d });

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : String(c));
  return n;
}
const ltr = (s) => el('bdi', { dir: 'ltr' }, s);
function cards(list) {
  return el('div', { class: 'cards' }, list.filter(Boolean).map((c) => el('div', { class: 'card ' + (c.cls || '') }, el('div', { class: 'k' }, c.k), el('div', { class: 'v' }, c.v), c.s ? el('div', { class: 's' }, c.s) : null)));
}
function showError(id, msg) {
  const box = $('#err-' + id);
  box.hidden = !msg;
  box.textContent = msg || '';
}
function betLabel(key) {
  const row = tr('betNames').find((b) => b.k === key);
  return row ? (lang === 'en' ? row.en : row.ar) : key;
}

// ---------- 1. house edge ----------
function renderEdge() {
  const wheel = $('#e-wheel').value;
  const box = $('#res-edge');
  box.replaceChildren();
  const rows = houseEdge(wheel);
  box.append(el('div', { class: 'table-wrap' }, el('table', { class: 'ladder', id: 'edge-table' },
    el('thead', {}, el('tr', {}, [tr('colBet'), tr('colPayout'), tr('colTrueOdds'), tr('colRtp'), tr('colEdge')].map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.map((r) => el('tr', {},
      el('td', {}, betLabel(r.bet)),
      el('td', { class: 'num' }, ltr(r.payout + ':1')),
      el('td', { class: 'num' }, ltr(num(r.winProb * 100) + '%')),
      el('td', { class: 'num' }, ltr(pct(r.rtp))),
      el('td', { class: 'num fail' }, ltr(pct(r.edge)))))))));
}

// ---------- 2. sequence analysis ----------
let result = null;
function runSeq() {
  showError('seq', null);
  $('#res-seq').replaceChildren();
  const wheel = $('#e-wheel').value;
  const raw = $('#s-nums').value.trim();
  if (!raw) { showError('seq', tr('seqNeed')); return; }
  try {
    const spins = parseSpins(raw, wheel);
    if (!spins.length) { showError('seq', tr('seqNeed')); return; }
    result = { a: analyze(spins, wheel), wheel };
    renderSeq();
  } catch (e) { showError('seq', e.message); }
}
function pm(p) { return p < 0.0001 ? '< 0.0001' : p.toFixed(4); }
function renderSeq() {
  const box = $('#res-seq');
  box.replaceChildren();
  if (!result) return;
  const { a } = result;
  const rb = a.even.redBlack;
  box.append(cards([
    { k: tr('cRounds'), v: num(a.n, 0), s: fmt(lang === 'en' ? '{p} pockets' : '{p} خانة', { p: a.pockets }) },
    { k: tr('cRedBlack'), v: rb.trials ? `${rb.hits} / ${rb.trials - rb.hits}` : '—', cls: rb.trials && !rb.pass ? 'bad' : 'accent', s: rb.trials ? 'p = ' + pm(rb.pValue) : '' },
    { k: tr('cUniform'), v: a.enoughForPocket ? pm(a.uniformity.pValue) : '—', cls: a.uniformity.nonUniform ? 'bad' : a.enoughForPocket ? 'good' : '' },
    { k: tr('cSerial'), v: a.serial.n >= 3 ? pm(a.serial.pValue) : '—', cls: !a.serial.pass ? 'bad' : 'good' },
    { k: tr('cHot'), v: a.bias.hot ? ltr(a.bias.hot.pocket) : '—', s: a.bias.hot ? `z = ${a.bias.hot.z.toFixed(2)}` : '' },
  ]));

  const cls = a.verdict === 'anomaly' ? 'suspicious' : a.verdict === 'insufficient' ? 'review' : 'normal';
  const msg = a.verdict === 'insufficient' ? fmt(tr('vInsufficient'), { need: a.spinsNeededForPocket }) : tr(a.verdict === 'anomaly' ? 'vAnomaly' : 'vFair');
  box.append(el('div', { class: 'verdict ' + cls, id: 'seq-verdict' }, msg));

  // Even-money breakdown
  const ev = [['evenRedBlack', a.even.redBlack], ['evenOddEven', a.even.oddEven], ['evenHighLow', a.even.highLow]];
  box.append(el('h3', { class: 'sub' }, tr('evenTitle')));
  box.append(cards(ev.map(([key, t]) => ({
    k: tr(key),
    v: t.trials ? fmt(tr('evenShare'), { hits: t.hits, trials: t.trials, share: pct(t.share || 0, 1) }) : '—',
    cls: t.trials && !t.pass ? 'bad' : 'good',
    s: t.trials ? (t.pass ? tr('evenOk') : tr('evenOff')) + ' · p = ' + pm(t.pValue) : '',
  }))));

  // Per-pocket bias table (top and bottom by z), shown when there is any data
  if (a.n) {
    box.append(el('h3', { class: 'sub' }, tr('biasTitle')));
    box.append(el('p', { class: 'small muted' }, tr('biasIntro')));
    const rows = a.bias.rows.filter((r) => r.observed > 0).sort((x, y) => y.z - x.z);
    const show = rows.slice(0, Math.min(rows.length, 12));
    const flaggedSet = new Set(a.bias.flagged.map((r) => r.pocket));
    box.append(el('div', { class: 'table-wrap' }, el('table', { class: 'ladder', id: 'bias-table' },
      el('thead', {}, el('tr', {}, [tr('colNum'), tr('colSeen'), tr('colExp'), tr('colZ')].map((h) => el('th', {}, h)))),
      el('tbody', {}, show.map((r) => el('tr', { class: flaggedSet.has(r.pocket) ? 'flagged' : '' },
        el('td', { class: 'num' }, ltr(r.pocket), flaggedSet.has(r.pocket) ? el('span', { class: 'tag' }, tr('flaggedTag')) : null),
        el('td', { class: 'num' }, String(r.observed)),
        el('td', { class: 'num' }, ltr(num(r.expected, 2))),
        el('td', { class: 'num ' + (flaggedSet.has(r.pocket) ? 'fail' : '') }, ltr((r.z >= 0 ? '+' : '') + r.z.toFixed(2)))))))));
  }
}
const EXAMPLE = '29 27 6 20 2 11 26 36 13 21 21 1 22 8';
function exampleSeq() {
  $('#e-wheel').value = 'european';
  $('#s-nums').value = EXAMPLE;
  renderEdge();
  runSeq();
}

// ---------- 3. live session for the committee ----------
let live = { start: null, rows: [] };
function liveNum(id) {
  const s = $(id).value.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/٫/g, '.').replace(/[٬,\s]/g, '');
  return s === '' ? null : Number(s);
}
function addLive() {
  showError('live', null);
  const wheel = $('#e-wheel').value;
  const start = liveNum('#lv-start');
  if (start === null || !Number.isFinite(start)) { showError('live', tr('lvStartNeed')); return; }
  const stake = liveNum('#lv-stake');
  const numRaw = $('#lv-num').value.trim();
  let spins;
  try { spins = parseSpins(numRaw, wheel); } catch (e) { showError('live', e.message); return; }
  if (spins.length !== 1 || !(stake > 0)) { showError('live', tr('lvNeed')); return; }
  let net = liveNum('#lv-net');
  if (net === null || !Number.isFinite(net)) net = -stake; // blank = the bet was lost
  live.start = start;
  live.rows.push({ num: spins[0], stake, net });
  $('#lv-num').value = ''; $('#lv-stake').value = ''; $('#lv-net').value = '';
  $('#lv-num').focus();
  renderLive();
}
function renderLive() {
  const box = $('#res-live');
  box.replaceChildren();
  if (!live.rows.length) return;
  const start = live.start || 0;
  const sumNet = live.rows.reduce((s, r) => s + r.net, 0);
  const wagered = live.rows.reduce((s, r) => s + r.stake, 0);
  const balNow = start + sumNet;
  const rtp = wagered > 0 ? (wagered + sumNet) / wagered : 0;
  const a = analyze(live.rows.map((r) => r.num), $('#e-wheel').value);
  box.append(cards([
    { k: tr('lvSpins'), v: num(live.rows.length, 0) },
    { k: tr('lvBalNow'), v: ltr(num(balNow, 2)), cls: balNow >= start ? 'good' : 'bad', s: ltr(tr('startBal') + ': ' + num(start, 2)) },
    { k: tr('lvNetTotal'), v: ltr((sumNet >= 0 ? '+' : '−') + num(Math.abs(sumNet), 2)), cls: sumNet >= 0 ? 'good' : 'bad' },
    { k: tr('lvWagered'), v: ltr(num(wagered, 2)) },
    { k: tr('lvReturn'), v: ltr(pct(rtp)), cls: rtp < 1 ? 'bad' : 'good' },
  ]));
  const grow = el('p', { class: 'headline', id: 'live-narrate' }, tr('lvNarrateGrow'));
  box.append(grow);
  if (a.verdict !== 'insufficient') {
    box.append(el('div', { class: 'verdict ' + (a.verdict === 'anomaly' ? 'suspicious' : 'normal'), id: 'live-verdict' }, tr(a.verdict === 'anomaly' ? 'lvNarrateAnomaly' : 'lvNarrateFair')));
  }
  let running = start;
  box.append(el('div', { class: 'table-wrap' }, el('table', { class: 'ladder', id: 'live-table' },
    el('thead', {}, el('tr', {}, [tr('lvColNum'), tr('lvColStake'), tr('lvColNet'), tr('lvColBal')].map((h) => el('th', {}, h)))),
    el('tbody', {}, live.rows.map((r) => {
      running += r.net;
      const color = colorOf(r.num);
      return el('tr', {},
        el('td', { class: 'num' }, ltr(String(r.num)), el('span', { class: 'tag', 'data-color': color }, lang === 'en' ? color : (color === 'red' ? 'أحمر' : color === 'black' ? 'أسود' : 'أخضر'))),
        el('td', { class: 'num' }, ltr(num(r.stake, 2))),
        el('td', { class: 'num ' + (r.net >= 0 ? '' : 'fail') }, ltr((r.net >= 0 ? '+' : '−') + num(Math.abs(r.net), 2))),
        el('td', { class: 'num' }, ltr(num(running, 2))));
    })))));
}
function undoLive() { live.rows.pop(); renderLive(); }
function resetLive() { live = { start: live.start, rows: [] }; $('#res-live').replaceChildren(); showError('live', null); }

// ---------- language and wiring ----------
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = tr('pageTitle') + ' — TARYAM';
  document.querySelectorAll('[data-t]').forEach((n) => {
    const v = tr(n.dataset.t);
    if (typeof v === 'string') n.textContent = v;
  });
  renderEdge();
  renderSeq();
  renderLive();
}

function init() {
  $('#langToggle').addEventListener('click', () => { lang = lang === 'ar' ? 'en' : 'ar'; setLang(lang); applyLang(); });
  $('#e-wheel').addEventListener('change', () => { renderEdge(); if (result) runSeq(); renderLive(); });
  $('#run-seq').addEventListener('click', runSeq);
  $('#example-seq').addEventListener('click', exampleSeq);
  $('#s-nums').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runSeq(); });
  $('#lv-add').addEventListener('click', addLive);
  $('#lv-undo').addEventListener('click', undoLive);
  $('#lv-reset').addEventListener('click', resetLive);
  for (const id of ['#lv-num', '#lv-stake', '#lv-net']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') addLive(); });
  applyLang();
}

init();
