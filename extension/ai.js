// TARYAM AI — an online-learning ensemble that tries to predict the next roulette
// pocket and, more importantly, MEASURES whether that is possible at all.
//
// Seven experts each give a full probability over the 37 pockets: the plain chance
// wheel, hot numbers, one- and two-step transitions, a wheel-sector model on the real
// European rim order, colour/dozen/column, and a small neural network (MLP) trained
// online. A Bayesian mixture with fixed-share weights them by how well they have
// actually predicted so far, so the best-performing expert leads automatically.
//
// Every prediction is made BEFORE its spin is seen (prequential / walk-forward), so
// the scores are honest out-of-sample. The evidence test is a likelihood-ratio test
// martingale: G = sum ln(p_mix(x) * 37). On a sound wheel P(G ever >= ln(1/a)) <= a
// (Ville's inequality), so the verdict stays valid even when watched live round by
// round. On a sound wheel the chance expert leads and the verdict is "not
// predictable" — that is the expected, honest outcome. It reads only; it never bets.
(function () {
  const T = window.TARYAM || (window.TARYAM = {});
  const N = 37;
  const LN37 = Math.log(N);
  const EU_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const POS = new Int16Array(N); EU_ORDER.forEach((n, i) => { POS[n] = i; });
  const ringDist = (a, b) => { const d = Math.abs(POS[a] - POS[b]); return Math.min(d, N - d); };
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const colorIdx = (n) => (n === 0 ? 0 : RED.has(n) ? 1 : 2);
  const dozenIdx = (n) => (n === 0 ? 0 : Math.ceil(n / 12));
  const columnIdx = (n) => (n === 0 ? 0 : ((n - 1) % 3) + 1);

  function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const uniform = () => new Float64Array(N).fill(1 / N);
  function norm(p) { let s = 0; for (let i = 0; i < N; i++) s += p[i]; if (!(s > 0)) return uniform(); for (let i = 0; i < N; i++) p[i] /= s; return p; }

  // ---- Experts. Each: predict(hist) → Float64Array(37) summing to 1; learn(hist, x).
  function chanceExpert() { return { id: 'chance', predict: uniform, learn() {} }; }

  function hotExpert(alpha = 1) {
    const c = new Float64Array(N).fill(alpha);
    return { id: 'hot', predict() { return norm(Float64Array.from(c)); }, learn(h, x) { c[x] += 1; } };
  }

  // Dirichlet-smoothed transitions that back off to the overall frequency.
  function markov1Expert(beta = 6) {
    const c = new Float64Array(N * N), tot = new Float64Array(N), f = new Float64Array(N).fill(1); let ft = N;
    return {
      id: 'markov1',
      predict(h) {
        const p = new Float64Array(N);
        if (!h.length) { for (let i = 0; i < N; i++) p[i] = f[i] / ft; return p; }
        const a = h[h.length - 1], row = a * N;
        for (let i = 0; i < N; i++) p[i] = (c[row + i] + beta * f[i] / ft) / (tot[a] + beta);
        return norm(p);
      },
      learn(h, x) { if (h.length) { const a = h[h.length - 1]; c[a * N + x] += 1; tot[a] += 1; } f[x] += 1; ft += 1; },
    };
  }

  function markov2Expert(beta = 6) {
    const ctx = new Map(); const m1 = markov1Expert(beta);
    return {
      id: 'markov2',
      predict(h) {
        const base = m1.predict(h);
        if (h.length < 2) return base;
        const k = h[h.length - 2] * N + h[h.length - 1]; const e = ctx.get(k);
        if (!e) return base;
        const p = new Float64Array(N);
        for (let i = 0; i < N; i++) p[i] = (e.c[i] + beta * base[i]) / (e.t + beta);
        return norm(p);
      },
      learn(h, x) {
        if (h.length >= 2) { const k = h[h.length - 2] * N + h[h.length - 1]; let e = ctx.get(k); if (!e) { e = { c: new Float64Array(N), t: 0 }; ctx.set(k, e); } e.c[x] += 1; e.t += 1; }
        m1.learn(h, x);
      },
    };
  }

  // A physically biased wheel favours an arc: hits smear onto rim neighbours, with a
  // slow decay so a drifting bias is followed.
  function sectorExpert(sigma = 2, decay = 0.99) {
    const s = new Float64Array(N); const k = new Float64Array(N);
    for (let d = 0; d < N; d++) k[d] = Math.exp(-(d * d) / (2 * sigma * sigma));
    return {
      id: 'sector',
      predict() { const p = new Float64Array(N); for (let i = 0; i < N; i++) p[i] = s[i] + 0.5; return norm(p); },
      learn(h, x) { for (let i = 0; i < N; i++) s[i] = s[i] * decay + k[ringDist(x, i)]; },
    };
  }

  function categoryExpert() {
    const col = new Float64Array(3).fill(1), doz = new Float64Array(4).fill(1), cl = new Float64Array(4).fill(1);
    return {
      id: 'category',
      predict() {
        const p = new Float64Array(N);
        for (let n = 0; n < N; n++) p[n] = col[colorIdx(n)] * doz[dozenIdx(n)] * cl[columnIdx(n)];
        return norm(p);
      },
      learn(h, x) { col[colorIdx(x)] += 1; doz[dozenIdx(x)] += 1; cl[columnIdx(x)] += 1; },
    };
  }

  // A small neural network: one-hot of the last 3 pockets + their rim angle (sin/cos)
  // → 32 tanh units → softmax over 37. Trained online with Adam on each new spin plus a
  // few replayed past samples. Seeded, so the same session always gives the same run.
  function mlpExpert({ lags = 3, hidden = 32, lr = 0.003, l2 = 1e-4, replay = 3, seed = 1337 } = {}) {
    const IN = lags * N + lags * 2, H = hidden, O = N;
    const rnd = mulberry32(seed);
    const gauss = () => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const W1 = new Float64Array(IN * H).map(() => gauss() * Math.sqrt(1 / IN));
    const b1 = new Float64Array(H), W2 = new Float64Array(H * O).map(() => gauss() * Math.sqrt(1 / H) * 0.1), b2 = new Float64Array(O);
    const P = [W1, b1, W2, b2];
    const M = P.map((a) => new Float64Array(a.length)), V = P.map((a) => new Float64Array(a.length));
    let step = 0; const buf = []; const BUF = 512;
    const features = (h) => {
      const x = new Float64Array(IN);
      for (let l = 0; l < lags; l++) {
        const v = h[h.length - 1 - l];
        x[l * N + v] = 1;
        const ang = 2 * Math.PI * POS[v] / N;
        x[lags * N + l * 2] = Math.sin(ang); x[lags * N + l * 2 + 1] = Math.cos(ang);
      }
      return x;
    };
    function forward(x) {
      const z = new Float64Array(H);
      for (let j = 0; j < H; j++) z[j] = b1[j];
      for (let i = 0; i < IN; i++) { const xi = x[i]; if (xi === 0) continue; const r = i * H; for (let j = 0; j < H; j++) z[j] += xi * W1[r + j]; }
      const a = z.map(Math.tanh);
      const o = new Float64Array(O);
      for (let k = 0; k < O; k++) o[k] = b2[k];
      for (let j = 0; j < H; j++) { const aj = a[j], r = j * O; for (let k = 0; k < O; k++) o[k] += aj * W2[r + k]; }
      let mx = -Infinity; for (let k = 0; k < O; k++) if (o[k] > mx) mx = o[k];
      let s = 0; for (let k = 0; k < O; k++) { o[k] = Math.exp(o[k] - mx); s += o[k]; }
      for (let k = 0; k < O; k++) o[k] /= s;
      return { a, p: o };
    }
    function train(samples) {
      const G = P.map((a) => new Float64Array(a.length));
      for (const { x, y } of samples) {
        const { a, p } = forward(x);
        const dO = Float64Array.from(p); dO[y] -= 1;
        for (let k = 0; k < O; k++) G[3][k] += dO[k];
        const dA = new Float64Array(H);
        for (let j = 0; j < H; j++) { const r = j * O; let acc = 0; for (let k = 0; k < O; k++) { G[2][r + k] += a[j] * dO[k]; acc += W2[r + k] * dO[k]; } dA[j] = acc * (1 - a[j] * a[j]); }
        for (let j = 0; j < H; j++) G[1][j] += dA[j];
        for (let i = 0; i < IN; i++) { const xi = x[i]; if (xi === 0) continue; const r = i * H; for (let j = 0; j < H; j++) G[0][r + j] += xi * dA[j]; }
      }
      step++; const b1c = 1 - Math.pow(0.9, step), b2c = 1 - Math.pow(0.999, step), nS = samples.length;
      for (let q = 0; q < P.length; q++) {
        const w = P[q], g = G[q], m = M[q], v = V[q];
        for (let i = 0; i < w.length; i++) {
          const gi = g[i] / nS + l2 * w[i];
          m[i] = 0.9 * m[i] + 0.1 * gi; v[i] = 0.999 * v[i] + 0.001 * gi * gi;
          w[i] -= lr * (m[i] / b1c) / (Math.sqrt(v[i] / b2c) + 1e-8);
        }
      }
    }
    return {
      id: 'mlp',
      predict(h) { return h.length < lags ? uniform() : forward(features(h)).p; },
      learn(h, y) {
        if (h.length < lags) return;
        const s = { x: features(h), y };
        const batch = [s];
        for (let r = 0; r < replay && buf.length; r++) batch.push(buf[Math.floor(rnd() * buf.length)]);
        train(batch);
        if (buf.length < BUF) buf.push(s); else buf[Math.floor(rnd() * BUF)] = s;
      },
    };
  }

  const NAMES = {
    chance: 'الصدفة (عجلة سليمة)', hot: 'الأرقام الأسخن', markov1: 'الانتقال من الرقم السابق', markov2: 'الانتقال من آخر رقمين',
    sector: 'قطاع العجلة', category: 'اللون/الدستة/العمود', mlp: 'شبكة عصبية (MLP)',
  };

  // One-sided upper binomial tail (normal approximation, continuity-corrected).
  function binomUpper(hits, trials, p0) {
    if (!trials) return 1;
    const mean = trials * p0, sd = Math.sqrt(trials * p0 * (1 - p0));
    const z = (hits - 0.5 - mean) / sd;
    const erfc = T.erfc || ((v) => { const t = 1 / (1 + 0.5 * Math.abs(v)); const r = t * Math.exp(-v * v - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return v >= 0 ? r : 2 - r; });
    return Math.min(1, Math.max(0, 0.5 * erfc(z / Math.SQRT2)));
  }

  function createLearner({ k = 5, share = 0.01, seed = 1337, minTrials = 150, alpha = 0.01 } = {}) {
    const experts = [chanceExpert(), hotExpert(), markov1Expert(), markov2Expert(), sectorExpert(), categoryExpert(), mlpExpert({ seed })];
    const E = experts.length;
    let w = new Float64Array(E).fill(1 / E);
    const hist = [];
    const st = { n: 0, hits: 0, G: 0, maxG: 0, expLoss: new Float64Array(E), expHits: new Float64Array(E) };
    let cache = null;

    function mixture() {
      if (cache) return cache;
      const parts = experts.map((e) => e.predict(hist));
      const p = new Float64Array(N);
      for (let i = 0; i < E; i++) for (let n = 0; n < N; n++) p[n] += w[i] * parts[i][n];
      norm(p);
      cache = { p, parts };
      return cache;
    }
    const topOf = (p, kk) => [...p.keys()].sort((a, b) => p[b] - p[a] || a - b).slice(0, kk);

    // Score the standing prediction against the real spin, THEN learn from it.
    function observe(x) {
      x = Number(x);
      if (!Number.isInteger(x) || x < 0 || x >= N) return;
      const { p, parts } = mixture();
      if (topOf(p, k).includes(x)) st.hits++;
      st.G += Math.log(Math.max(p[x], 1e-300) * N);
      if (st.G > st.maxG) st.maxG = st.G;
      let s = 0;
      for (let i = 0; i < E; i++) {
        const pi = Math.max(parts[i][x], 1e-300);
        st.expLoss[i] += -Math.log(pi);
        if (topOf(parts[i], k).includes(x)) st.expHits[i]++;
        w[i] *= pi * N; s += w[i];
      }
      for (let i = 0; i < E; i++) w[i] = (1 - share) * (w[i] / s) + share / E; // fixed share: a better expert can take over
      for (const e of experts) e.learn(hist, x);
      hist.push(x); st.n++; cache = null;
    }

    function report() {
      const { p } = mixture();
      const top = topOf(p, k);
      const mass = top.reduce((a, n) => a + p[n], 0);
      const chance = k / N;
      const pTop = binomUpper(st.hits, st.n, chance);
      const pAnytime = Math.min(1, Math.exp(-st.maxG)); // Ville: valid under continuous monitoring
      const enough = st.n >= minTrials;
      const predictable = enough && pAnytime < alpha && st.hits / Math.max(1, st.n) > chance;
      const rank = experts.map((e, i) => ({ id: e.id, name: NAMES[e.id], weight: w[i], avgLoss: st.n ? st.expLoss[i] / st.n : LN37, hitRate: st.n ? st.expHits[i] / st.n : 0 }))
        .sort((a, b) => b.weight - a.weight);
      return {
        n: st.n, k, top, mass, chance,
        hits: st.hits, rate: st.n ? st.hits / st.n : 0, pTop,
        G: st.G, bitsPerSpin: st.n ? st.G / st.n / Math.LN2 : 0, pAnytime,
        enough, predictable, minTrials, leader: rank[0], experts: rank,
      };
    }

    return { observe, report, get n() { return st.n; } };
  }

  // Replay a recorded session from scratch (walk-forward) and return the report.
  function analyzeSession(spins, opts) { const L = createLearner(opts); for (const x of spins) L.observe(x); return L.report(); }

  T.ai = { createLearner, analyzeSession, NAMES, EU_ORDER, binomUpper, mulberry32 };
})();
