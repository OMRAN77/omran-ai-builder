// Observed RTP from a play log (bet and win per round), its confidence interval,
// a test against the declared RTP, and how many rounds a reliable verdict needs.
import { forEachCsvRow, findColumn } from './csv.js';
import { normalQuantile, erfc } from './specfun.js';

const BET_NAMES = ['bet', 'stake', 'wager', 'betamount', 'الرهان', 'رهان', 'المبلغ'];
const WIN_NAMES = ['win', 'payout', 'return', 'won', 'prize', 'winamount', 'الربح', 'ربح', 'الفوز', 'فوز'];

export const CONFIDENCE_LEVELS = [0.9, 0.95, 0.99, 0.999];

export function parsePlayLog(text) {
  const bets = [], wins = [];
  const skipped = [];
  let betCol = 0, winCol = 1, first = true, header = null;
  forEachCsvRow(text, (row, line) => {
    if (first) {
      first = false;
      if (row.some((c) => c.trim() !== '' && !Number.isFinite(Number(c.trim())))) {
        header = row;
        betCol = findColumn(row, BET_NAMES);
        winCol = findColumn(row, WIN_NAMES);
        if (betCol < 0 || winCol < 0) throw new Error('header must contain a bet column and a win column (e.g. "bet,win")');
        return;
      }
    }
    const b = Number(String(row[betCol] ?? '').trim());
    const w = Number(String(row[winCol] ?? '').trim());
    if (!Number.isFinite(b) || !Number.isFinite(w) || String(row[betCol] ?? '').trim() === '') { skipped.push({ line, reason: 'not a number' }); return; }
    if (b <= 0) { skipped.push({ line, reason: 'bet must be > 0' }); return; }
    if (w < 0) { skipped.push({ line, reason: 'win must be ≥ 0' }); return; }
    bets.push(b); wins.push(w);
  });
  return { bets: Float64Array.from(bets), wins: Float64Array.from(wins), skipped, header };
}

// declaredRtp and sigma are fractions of the bet (0.96 for 96%); sigma is the
// declared per-round standard deviation per unit bet, if the game sheet gives one.
export function analyzePlayLog({ bets, wins }, { declaredRtp = null, confidence = 0.95, sigma = null } = {}) {
  const n = bets.length;
  if (n < 2) throw new Error('need at least 2 rounds');
  let sumBet = 0, sumWin = 0, sumBet2 = 0, hits = 0, maxMult = 0;
  for (let i = 0; i < n; i++) {
    sumBet += bets[i]; sumWin += wins[i]; sumBet2 += bets[i] * bets[i];
    if (wins[i] > 0) hits++;
    maxMult = Math.max(maxMult, wins[i] / bets[i]);
  }
  const rtp = sumWin / sumBet;
  const meanBet = sumBet / n;
  let ss = 0;
  for (let i = 0; i < n; i++) { const d = wins[i] - rtp * bets[i]; ss += d * d; }
  const sdResidual = Math.sqrt(ss / (n - 1));
  const sigmaObserved = sdResidual / meanBet; // per unit bet
  const seObserved = sdResidual / Math.sqrt(n) / meanBet; // ratio-estimator (delta method)
  const seDeclared = sigma ? sigma * Math.sqrt(sumBet2) / sumBet : null;
  const se = seDeclared ?? seObserved;
  const sigmaUsed = sigma ?? sigmaObserved;
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const out = {
    rounds: n, totalBet: sumBet, totalWin: sumWin, meanBet, rtp,
    hitRate: hits / n, maxWinMultiple: maxMult,
    sigmaObserved, sigmaUsed, sigmaSource: sigma ? 'declared' : 'observed',
    standardError: se, confidence,
    ci: [rtp - z * se, rtp + z * se],
    roundsNeeded: [0.001, 0.005, 0.01, 0.02].map((margin) => ({ margin, rounds: Math.ceil((z * sigmaUsed / margin) ** 2) })),
  };
  out.reliable = n >= out.roundsNeeded.find((r) => r.margin === 0.01).rounds;
  if (declaredRtp !== null && declaredRtp !== undefined) {
    const diff = rtp - declaredRtp;
    const zStat = diff / se;
    const p = erfc(Math.abs(zStat) / Math.SQRT2);
    out.declared = {
      rtp: declaredRtp, difference: diff, z: zStat, pValue: p,
      verdict: p >= 0.05 ? 'normal' : p >= 0.001 ? 'review' : 'suspicious',
      direction: diff < 0 ? 'below' : 'above',
      insideCi: declaredRtp >= out.ci[0] && declaredRtp <= out.ci[1],
      // Rounds to detect a gap this large at 5% significance with 80% power.
      roundsToDetect: diff === 0 ? null : Math.ceil(((normalQuantile(0.975) + normalQuantile(0.8)) * sigmaUsed / Math.abs(diff)) ** 2),
    };
  }
  return out;
}
