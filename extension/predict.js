// TARYAM predictability test — NOT a winning system. It trains simple models on the
// recorded spins and measures, by walk-forward backtest, whether their top-K guess
// beats pure chance (K/37). On a sound wheel it will NOT: the honest verdict is
// "not predictable", which is itself the evidence that debunks every "predictor bot".
// Only if the hit rate is above chance by a confident margin is the wheel flagged as
// "predictable" (a real RNG flaw). It reads only; it never bets or sends anything.
(function () {
  const T = window.TARYAM || (window.TARYAM = {});

  // The real European wheel order (pocket sequence around the rim).
  const EU_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const N = 37;
  const POS = new Map(EU_ORDER.map((n, i) => [n, i]));
  const ringDist = (a, b) => { const i = POS.get(a), j = POS.get(b); if (i === undefined || j === undefined) return N; const d = Math.abs(i - j); return Math.min(d, N - d); };

  const dozenOf = (n) => (n === 0 ? 0 : Math.ceil(n / 12));          // 1,2,3 (0 = none)
  const columnOf = (n) => (n === 0 ? 0 : ((n - 1) % 3) + 1);          // 1,2,3 (0 = none)
  const colorOf = (n) => (T.colorOf ? T.colorOf(n) : (n === 0 ? 'green' : 'other'));

  const blankScores = () => { const m = new Map(); for (let n = 0; n < N; n++) m.set(n, 0); return m; };
  function normalise(m) {
    let s = 0; for (const v of m.values()) s += v;
    const out = new Map();
    if (s <= 0) { for (const k of m.keys()) out.set(k, 1 / N); return out; } // uniform when no signal
    for (const [k, v] of m) out.set(k, v / s);
    return out;
  }

  // 1. Hottest numbers: how often each pocket has come up.
  function hotScores(spins) { const m = blankScores(); for (const x of spins) if (m.has(x)) m.set(x, m.get(x) + 1); return normalise(m); }

  // 2. Transition: what tends to follow the last seen number.
  function transitionScores(spins) {
    const m = blankScores();
    if (!spins.length) return normalise(m);
    const last = spins[spins.length - 1];
    let any = false;
    for (let i = 1; i < spins.length; i++) if (spins[i - 1] === last) { m.set(spins[i], m.get(spins[i]) + 1); any = true; }
    return any ? normalise(m) : hotScores(spins); // no history for this predecessor → fall back
  }

  // 3. Wheel sector: a physically biased wheel favours an arc, so recent hits smear
  //    onto their neighbours on the real wheel order.
  function sectorScores(spins, win = 60, spread = 3) {
    const m = blankScores();
    const recent = spins.slice(-win);
    if (!recent.length) return normalise(m);
    for (const x of recent) for (let n = 0; n < N; n++) { const d = ringDist(x, n); m.set(n, m.get(n) + Math.exp(-(d * d) / (2 * spread * spread))); }
    return normalise(m);
  }

  // 4. Color / dozen / column: predict the likely category, then spread across the
  //    numbers inside it.
  function categoryScores(spins) {
    const m = blankScores();
    if (!spins.length) return normalise(m);
    const cnt = (f) => { const c = new Map(); for (const x of spins) { const k = f(x); c.set(k, (c.get(k) || 0) + 1); } return c; };
    const col = cnt(colorOf), doz = cnt(dozenOf), colu = cnt(columnOf);
    const p = (c, k) => ((c.get(k) || 0) + 1) / (spins.length + c.size); // Laplace-smoothed
    for (let n = 0; n < N; n++) m.set(n, p(col, colorOf(n)) * p(doz, dozenOf(n)) * p(colu, columnOf(n)));
    return normalise(m);
  }

  const MODELS = { hot: hotScores, transition: transitionScores, sector: sectorScores, category: categoryScores };

  // Ensemble: average the four models' probabilities.
  function ensembleScores(spins) {
    const acc = blankScores();
    const parts = Object.values(MODELS).map((f) => f(spins));
    for (const part of parts) for (const [k, v] of part) acc.set(k, acc.get(k) + v / parts.length);
    return acc;
  }
  const rankTop = (scores, k) => [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([n]) => n);

  // One-sided upper binomial test (normal approx with continuity correction), using
  // the shared erfc so the numbers match the rest of the tool.
  function binomUpper(hits, trials, p0) {
    if (!trials) return 1;
    const mean = trials * p0, sd = Math.sqrt(trials * p0 * (1 - p0));
    if (sd === 0) return hits > mean ? 0 : 1;
    const z = (hits - 0.5 - mean) / sd;
    const erfc = T.erfc || ((x) => (x >= 0 ? 0 : 2)); // erfc provided by core.js
    return Math.min(1, Math.max(0, 0.5 * erfc(z / Math.SQRT2)));
  }

  // Next-round prediction: the ranked guesses plus the argmax category. Confidence is
  // NOT invented — the caller fills it from the measured backtest hit rate.
  function predictNext(spins, k = 5) {
    const scores = ensembleScores(spins);
    const top = rankTop(scores, k);
    const argmax = (f) => { const c = new Map(); for (const x of spins) { const key = f(x); c.set(key, (c.get(key) || 0) + 1); } let best = null, bv = -1; for (const [key, v] of c) if (v > bv) { bv = v; best = key; } return best; };
    const sectorCentre = top.length ? top[0] : null;
    const sector = sectorCentre === null ? [] : EU_ORDER.filter((n) => ringDist(sectorCentre, n) <= 2);
    return { top, color: argmax(colorOf), dozen: argmax(dozenOf), column: argmax(columnOf), sector };
  }

  // Walk-forward backtest: for every spin past minTrain, train ONLY on the spins
  // before it and check whether the top-K guess contained it. No peeking.
  function backtest(spins, { k = 5, minTrain = 20 } = {}) {
    const p0 = k / N;
    let hits = 0, trials = 0;
    for (let i = Math.max(minTrain, 1); i < spins.length; i++) {
      const top = rankTop(ensembleScores(spins.slice(0, i)), k);
      if (top.includes(spins[i])) hits++;
      trials++;
    }
    const rate = trials ? hits / trials : 0;
    const pValue = binomUpper(hits, trials, p0);
    const enough = trials >= 150;
    const predictable = enough && pValue < 0.01 && rate > p0;
    return { k, trials, hits, rate, chance: p0, pValue, enough, predictable };
  }

  // How many rounds are needed for a trustworthy verdict (one-sided, alpha 0.01).
  // Returns the sample size to detect a given true hit rate with ~80% power, plus the
  // size for a tight "sound" confirmation (99% CI half-width).
  function sampleSizeFor(k = 5) {
    const p0 = k / N, za = 2.326, zb = 0.842;
    const nFor = (p1) => Math.ceil(Math.pow(za * Math.sqrt(p0 * (1 - p0)) + zb * Math.sqrt(p1 * (1 - p1)), 2) / Math.pow(p1 - p0, 2));
    const ciN = (half) => Math.ceil(Math.pow(2.576, 2) * p0 * (1 - p0) / (half * half));
    return {
      chance: p0,
      detectBigEdge: nFor(p0 * 2),      // double the chance rate
      detectSmallEdge: nFor(p0 + 0.065), // ~6.5 points above chance
      confirmSound: ciN(0.03),           // ±3% confidence interval
    };
  }

  T.predict = { EU_ORDER, ringDist, MODELS, ensembleScores, rankTop, predictNext, backtest, binomUpper, sampleSizeFor, dozenOf, columnOf };
})();
