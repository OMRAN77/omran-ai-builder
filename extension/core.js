// Analysis helpers for the TARYAM live inspector, shared by the content script.
// Plain script (no modules): everything hangs off window.TARYAM. It only reads and
// measures; it never changes a request, a result or a balance.
(function () {
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

  function colorOf(n) {
    if (n === 0 || n === '00') return 'green';
    return RED.has(Number(n)) ? 'red' : 'black';
  }

  // Abramowitz & Stegun 7.1.26: erfc to ~1e-7, enough for a live z-test readout.
  function erfc(x) {
    const z = Math.abs(x);
    const t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
      t * (-0.82215223 + t * 0.17087277))))))))); 
    return x >= 0 ? r : 2 - r;
  }
  const pFromZ = (z) => erfc(Math.abs(z) / Math.SQRT2);

  // The true house edge of every bet, per wheel. On a single-zero wheel every bet
  // returns 36/37 (2.70% edge); double-zero returns 36/38 (5.26%).
  function houseEdge(wheel) {
    const K = wheel === 'american' ? 38 : 37;
    const def = [['straight', 35, 1], ['split', 17, 2], ['street', 11, 3], ['corner', 8, 4], ['line', 5, 6], ['column', 2, 12], ['dozen', 2, 12], ['even', 1, 18]];
    if (wheel === 'american') def.splice(4, 0, ['basket', 6, 5]);
    return def.map(([bet, payout, ways]) => {
      const p = ways / K;
      const rtp = (payout + 1) * p;
      return { bet, payout, ways, winProb: p, rtp, edge: 1 - rtp };
    });
  }

  // Red/black (and other even-money) binomial z, zeroes excluded.
  function evenTest(spins, pick) {
    let hits = 0, trials = 0;
    for (const s of spins) { const v = pick(s); if (v === null) continue; trials++; if (v) hits++; }
    if (!trials) return { hits, trials, share: 0, z: 0, pValue: 1, pass: true };
    const z = (hits - trials * 0.5) / Math.sqrt(trials * 0.25);
    return { hits, trials, share: hits / trials, z, pValue: pFromZ(z), pass: pFromZ(z) >= 0.01 };
  }

  // Each pocket's z against 1/K, with a hottest number and a Bonferroni flag.
  function bias(spins, wheel) {
    const K = wheel === 'american' ? 38 : 37;
    const n = spins.length;
    const e = n / K;
    const sd = Math.sqrt(n * (1 / K) * (1 - 1 / K));
    const c = new Map();
    for (const s of spins) c.set(String(s), (c.get(String(s)) || 0) + 1);
    const rows = [...c.entries()].map(([pocket, observed]) => {
      const z = sd > 0 ? (observed - e) / sd : 0;
      return { pocket, observed, expected: e, z, pValue: pFromZ(z), color: colorOf(pocket === '00' ? '00' : Number(pocket)) };
    }).sort((a, b) => b.z - a.z);
    const threshold = 0.01 / K;
    return { rows, hot: rows[0], flagged: rows.filter((r) => r.pValue < threshold), threshold, expected: e, enough: e >= 5 };
  }

  function analyze(spins, wheel) {
    const red = (s) => (s === 0 || s === '00' ? null : RED.has(Number(s)));
    const odd = (s) => (s === 0 || s === '00' ? null : Number(s) % 2 === 1);
    const high = (s) => (s === 0 || s === '00' ? null : Number(s) >= 19);
    const even = { redBlack: evenTest(spins, red), oddEven: evenTest(spins, odd), highLow: evenTest(spins, high) };
    const b = bias(spins, wheel);
    const K = wheel === 'american' ? 38 : 37;
    const enoughEven = even.redBlack.trials >= 30;
    let verdict = 'insufficient';
    if (enoughEven) verdict = (!even.redBlack.pass || b.flagged.length) ? 'anomaly' : 'fair';
    return { n: spins.length, wheel, pockets: K, even, bias: b, verdict, enoughPocket: spins.length >= 5 * K };
  }

  // Certified provider host fragments. A roulette served from one of these is the
  // genuine, licensed game; served from the casino's own domain or an unknown host,
  // it is the casino that controls the outcome — the central forensic question.
  const PROVIDERS = [
    'evolution.com', 'evo-games.com', 'egcvx.com', 'netent.com', 'netentstatic.com',
    'pragmaticplay.net', 'ppgames.net', 'pragmaticplay.com', 'pragmaticplaylive.net',
    'playtech.com', 'ptitv.com', 'microgaming', 'quickfire', 'games-cdn', 'ezugi.com',
    'hacksawgaming.com', 'nolimitcity.com', 'redtiger', 'relaxg.com', 'playngonetwork.com',
    'authenticgaming', 'vivogaming', 'luckystreak', 'absolutelivegaming',
  ];
  function hostOf(url) { try { return new URL(url, location.href).hostname.toLowerCase(); } catch (e) { return ''; } }
  function registrable(host) { const p = host.split('.'); return p.slice(-2).join('.'); }
  function classifyHost(url, casinoHost) {
    const host = hostOf(url);
    if (!host) return { host: '', kind: 'unknown' };
    if (PROVIDERS.some((p) => host.includes(p))) return { host, kind: 'provider' };
    const casinoReg = registrable(casinoHost || hostOf(location.href));
    if (casinoReg && (host === casinoReg || host.endsWith('.' + casinoReg) || registrable(host) === casinoReg)) return { host, kind: 'casino' };
    return { host, kind: 'unknown' };
  }

  // Heuristics over a captured JSON/text payload: pull plausible roulette results
  // (0..36) and a balance-like number, so the panel can work before it is tuned to
  // the exact field names of a given casino.
  function guessNumbers(obj) {
    const out = [];
    const walk = (v, key) => {
      if (v === null || v === undefined) return;
      if (Array.isArray(v)) { for (const x of v) walk(x, key); return; }
      if (typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k], k.toLowerCase()); return; }
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= 36 && /result|number|winning|outcome|pocket|spin|num|draw/.test(key || '')) out.push(n);
    };
    walk(obj, '');
    return out;
  }
  function guessBalance(obj) {
    let best = null;
    const walk = (v, key) => {
      if (v === null || v === undefined) return;
      if (Array.isArray(v)) { for (const x of v) walk(x, key); return; }
      if (typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k], k.toLowerCase()); return; }
      const n = Number(v);
      if (Number.isFinite(n) && /balance|wallet|cash|credit|amount|funds|bal/.test(key || '')) best = n;
    };
    walk(obj, '');
    return best;
  }

  window.TARYAM = { RED, colorOf, erfc, pFromZ, houseEdge, analyze, bias, classifyHost, hostOf, registrable, guessNumbers, guessBalance, PROVIDERS };
})();
