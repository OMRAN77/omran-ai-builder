// Monte Carlo simulation of a normalized slot model (see slot-model.js) with the
// seeded generator in prng.js. Same model + seed + spin count => same numbers.
// Win amounts are kept in the model's integer units, so totals are exact.
const BUCKETS = [0, 1, 2, 5, 10, 20, 50, 100, 500];
const FS_CAP = 100000; // free spins per trigger before the run is flagged

function makeEvaluator(model) {
  const N = model.nReels, R = model.rows, L = model.lines.length;
  const window = new Int32Array(N * R);
  const evalWindow = () => {
    let win = 0;
    for (let l = 0; l < L; l++) {
      const line = model.lines[l];
      let w0 = 0;
      while (w0 < N && window[w0 * R + line[w0]] === model.wild) w0++;
      let best = model.wildPays[w0] || 0;
      if (w0 < N) {
        const t = window[w0 * R + line[w0]];
        if (t !== model.scatter) {
          let n = w0 + 1;
          while (n < N) {
            const x = window[n * R + line[n]];
            if (x !== t && x !== model.wild) break;
            n++;
          }
          const p = model.linePays[t][n];
          if (p > best) best = p;
        }
      }
      win += best;
    }
    let sc = 0;
    if (model.scatter >= 0) for (let i = 0; i < N * R; i++) if (window[i] === model.scatter) sc++;
    return { win: win + model.scatterPays[sc], scatters: sc };
  };
  const spin = (rng, strips) => {
    for (let k = 0; k < N; k++) {
      const s = strips[k];
      const stop = rng.nextBelow(s.length);
      for (let r = 0; r < R; r++) window[k * R + r] = s[(stop + r) % s.length];
    }
    return evalWindow();
  };
  return spin;
}

export function simulate(model, rng, spins, { onProgress = () => {}, progressEvery = 100000 } = {}) {
  const spin = makeEvaluator(model);
  const fs = model.freeSpins;
  const mult = fs ? fs.multiplier.toNumber() : 1;
  let total = 0, sumSq = 0, hits = 0, maxWin = 0, triggers = 0, fsPlayed = 0, capped = 0;
  const buckets = new Array(BUCKETS.length + 1).fill(0);
  for (let i = 0; i < spins; i++) {
    const base = spin(rng, model.reels);
    let win = base.win;
    let triggered = false;
    if (fs && base.scatters >= fs.trigger) {
      triggered = true;
      triggers++;
      let pending = fs.spins, played = 0, fsWin = 0;
      while (pending > 0) {
        pending--; played++;
        const r = spin(rng, fs.reels);
        fsWin += r.win;
        if (fs.retrigger && r.scatters >= fs.trigger) pending += fs.spins;
        if (played >= FS_CAP) { capped++; break; }
      }
      fsPlayed += played;
      win += fsWin * mult;
    }
    total += win;
    sumSq += win * win;
    if (win > 0 || triggered) hits++;
    if (win > maxWin) maxWin = win;
    const x = win / model.totalBetUnits;
    let b = 0;
    if (x > 0) { b = BUCKETS.length; for (let j = 1; j < BUCKETS.length; j++) if (x < BUCKETS[j]) { b = j; break; } }
    buckets[b]++;
    if ((i + 1) % progressEvery === 0) onProgress((i + 1) / spins);
  }
  onProgress(1);
  const tb = model.totalBetUnits;
  const mean = total / spins;
  const variance = Math.max(0, sumSq / spins - mean * mean) * spins / Math.max(1, spins - 1);
  const sd = Math.sqrt(variance) / tb;
  const se = sd / Math.sqrt(spins);
  const rtp = mean / tb;
  return {
    spins, totalWinUnits: total, rtp, sd, standardError: se, ci95: [rtp - 1.959964 * se, rtp + 1.959964 * se],
    hitFrequency: hits / spins, maxWin: maxWin / tb, triggers, freeSpinsPlayed: fsPlayed, cappedFeatures: capped,
    buckets: buckets.map((c, i) => ({ from: i === 0 ? 0 : BUCKETS[i - 1], to: i === 0 ? 0 : i < BUCKETS.length ? BUCKETS[i] : null, probability: c / spins })),
  };
}
