// Roulette forensics, computed locally: the true house edge of every bet type, and
// real statistical tests on a sequence of winning numbers — uniformity across the
// pockets, a per-pocket bias scan, the even-money binomial tests, and the lag-1
// serial correlation — to tell a fair wheel from a biased or a replayed one.
// Nothing here can predict the next number; a fair wheel has no memory. What it can
// do is prove, from enough real spins, whether a wheel is fair or exploitable.
import { chiSquareP, erfc } from './specfun.js';

// European single-zero (37 pockets) and American double-zero (38 pockets).
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function wheelPockets(wheel) {
  const n = [];
  for (let i = 0; i <= 36; i++) n.push(i);
  if (wheel === 'american') n.push('00');
  return n;
}

export function pocketCount(wheel) {
  return wheel === 'american' ? 38 : 37;
}

export function colorOf(n) {
  if (n === 0 || n === '00') return 'green';
  return RED.has(n) ? 'red' : 'black';
}

// Parse a pasted strip of winning numbers in either digit set. "00" is kept whole;
// a bare 0 is zero. Anything out of 0..36 (or 00) is rejected so a typo is caught.
export function parseSpins(text, wheel = 'european') {
  const t = String(text || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[^\d]+/g, ' ')
    .trim();
  const raw = String(text || '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
  // Keep "00" tokens whole before splitting on non-digits.
  const tokens = raw.match(/00|\d{1,2}/g) || [];
  const max = 36;
  const spins = [];
  for (const tok of tokens) {
    if (tok === '00') {
      if (wheel !== 'american') throw new Error('00 is only on an American wheel');
      spins.push('00');
      continue;
    }
    const v = Number(tok);
    if (!Number.isInteger(v) || v < 0 || v > max) throw new Error('number out of range: ' + tok);
    spins.push(v);
  }
  void t;
  return spins;
}

export function counts(spins, wheel = 'european') {
  const map = new Map();
  for (const p of wheelPockets(wheel)) map.set(String(p), 0);
  for (const s of spins) map.set(String(s), (map.get(String(s)) || 0) + 1);
  return map;
}

// Chi-square goodness of fit to a uniform wheel. df = pockets − 1. A fair wheel
// passes; p below 0.01 means the frequencies are not uniform (possible bias or a
// weak RNG); p above 0.999 means they are suspiciously even (possible fabrication).
export function uniformityTest(spins, wheel = 'european') {
  const K = pocketCount(wheel);
  const n = spins.length;
  const e = n / K;
  const c = counts(spins, wheel);
  let chi2 = 0;
  for (const v of c.values()) chi2 += (v - e) ** 2 / e;
  const df = K - 1;
  const p = chiSquareP(chi2, df);
  return {
    chi2, df, pValue: p, expectedPerPocket: e, n, pockets: K,
    enoughData: e >= 5,
    nonUniform: p < 0.01,
    tooUniform: p > 0.999,
    pass: p >= 0.01 && p <= 0.999,
  };
}

// Per-pocket z-scores with a Bonferroni threshold across the K pockets, so a single
// hot pocket is only flagged when it stands out above the multiple-comparison noise.
// This is the real wheel-bias question: does any number come up far more than 1/K?
export function biasScan(spins, wheel = 'european', { alpha = 0.01 } = {}) {
  const K = pocketCount(wheel);
  const n = spins.length;
  const e = n / K;
  const sd = Math.sqrt(n * (1 / K) * (1 - 1 / K));
  const c = counts(spins, wheel);
  const rows = [];
  for (const [pocket, obs] of c) {
    const z = sd > 0 ? (obs - e) / sd : 0;
    const pTwo = erfc(Math.abs(z) / Math.SQRT2);
    rows.push({ pocket, color: colorOf(pocket === '00' ? '00' : Number(pocket)), observed: obs, expected: e, z, pValue: pTwo });
  }
  rows.sort((a, b) => b.z - a.z);
  const threshold = alpha / K;
  const flagged = rows.filter((r) => r.pValue < threshold);
  return { rows, flagged, threshold, enoughData: e >= 5, hot: rows[0], cold: rows[rows.length - 1] };
}

// A binomial test on an even-money proposition (red/black, odd/even, high/low).
// Zeroes are excluded, as on the table they lose to both sides.
function evenMoney(spins, pick) {
  let hits = 0, trials = 0;
  for (const s of spins) {
    const v = pick(s);
    if (v === null) continue;
    trials++;
    if (v) hits++;
  }
  if (trials === 0) return { hits, trials, p: 0.5, z: 0, pValue: 1 };
  const mean = trials * 0.5;
  const sd = Math.sqrt(trials * 0.25);
  const z = sd > 0 ? (hits - mean) / sd : 0;
  const pValue = erfc(Math.abs(z) / Math.SQRT2);
  return { hits, trials, share: hits / trials, z, pValue, pass: pValue >= 0.01 };
}

export function evenMoneyTests(spins) {
  const red = (s) => (s === 0 || s === '00' ? null : RED.has(s));
  const odd = (s) => (s === 0 || s === '00' ? null : s % 2 === 1);
  const high = (s) => (s === 0 || s === '00' ? null : s >= 19);
  return {
    redBlack: evenMoney(spins, red),
    oddEven: evenMoney(spins, odd),
    highLow: evenMoney(spins, high),
  };
}

// Lag-1 serial correlation on the raw number sequence. A fair wheel has none; a
// predictable (weak-RNG or scripted) sequence can show a correlation here.
export function serialTest(spins) {
  const vals = spins.map((s) => (s === '00' ? 37 : s));
  const n = vals.length;
  if (n < 3) return { r: null, z: 0, pValue: 1, pass: true, n };
  let t1 = 0, sum = 0, sum2 = 0;
  for (let i = 0; i < n; i++) {
    const x = vals[i];
    t1 += x * vals[(i + 1) % n];
    sum += x;
    sum2 += x * x;
  }
  const den = n * sum2 - sum * sum;
  if (den === 0) return { r: null, z: 0, pValue: 1, pass: true, constant: true, n };
  const r = (n * t1 - sum * sum) / den;
  const z = r * Math.sqrt(n);
  const pValue = erfc(Math.abs(z) / Math.SQRT2);
  return { r, z, pValue, pass: pValue >= 0.01, n };
}

// The true house edge of every bet, for the chosen wheel. RTP = (payout+1)·p. On a
// single-zero wheel every bet returns 36/37 (edge 2.70%); double-zero returns 36/38
// (edge 5.26%), and the basket bet is worse still.
export function houseEdge(wheel = 'european') {
  const K = pocketCount(wheel);
  const def = [
    ['straight', 35, 1],
    ['split', 17, 2],
    ['street', 11, 3],
    ['corner', 8, 4],
    ['line', 5, 6],
    ['column', 2, 12],
    ['dozen', 2, 12],
    ['even', 1, 18],
  ];
  if (wheel === 'american') def.splice(5, 0, ['basket', 6, 5]);
  return def.map(([bet, payout, ways]) => {
    const p = ways / K;
    const rtp = (payout + 1) * p;
    return { bet, payout, ways, winProb: p, rtp, edge: 1 - rtp };
  });
}

// One combined read of a pasted sequence: how much data there is, whether the wheel
// looks fair, and — honestly — what can and cannot be concluded from it.
export function analyze(spins, wheel = 'european') {
  const n = spins.length;
  const uni = uniformityTest(spins, wheel);
  const bias = biasScan(spins, wheel);
  const even = evenMoneyTests(spins);
  const serial = serialTest(spins);
  const K = pocketCount(wheel);
  const enoughForPocket = n >= 5 * K; // ≥5 expected per pocket for a valid chi-square
  const enoughForEven = even.redBlack.trials >= 30;
  let verdict;
  if (!enoughForEven) verdict = 'insufficient';
  else if (uni.nonUniform || !even.redBlack.pass || !serial.pass || bias.flagged.length) verdict = 'anomaly';
  else verdict = 'fair';
  return {
    n, wheel, pockets: K, enoughForPocket, enoughForEven,
    uniformity: uni, bias, even, serial, verdict,
    spinsNeededForPocket: Math.max(0, 5 * K - n),
  };
}
