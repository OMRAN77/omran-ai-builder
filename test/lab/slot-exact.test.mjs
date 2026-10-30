import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { normalizeModel, applyCsv, modelFromForm, formFromModel, ModelError } from '../../lab/core/slot-model.js';
import { analyzeExact } from '../../lab/core/slot-exact.js';
import { Fraction } from '../../lab/core/fraction.js';

const SAMPLES = new URL('../../lab/samples/', import.meta.url);

// A single "reel" of roulette pockets: `covered` pockets win the bet and pay
// `returns` x the stake (stake included), the rest lose.
function rouletteBet(pockets, covered, returns) {
  const reel = [...new Array(covered).fill('WIN'), ...new Array(pockets - covered).fill('LOSE')];
  return { name: 'roulette', rows: 1, reels: [reel], lines: [[1]], paytable: { WIN: [returns] } };
}
const rtpOf = (raw) => analyzeExact(normalizeModel(raw));

test('European roulette: every standard bet has RTP 36/37 = 97.30%', () => {
  for (const [covered, returns] of [[1, 36], [2, 18], [3, 12], [4, 9], [6, 6], [12, 3], [18, 2]]) {
    const r = rtpOf(rouletteBet(37, covered, returns));
    assert.strictEqual(r.rtp.fraction, '36/37', `${covered} numbers`);
    assert.strictEqual(Number(r.rtp.percent).toFixed(2), '97.30');
  }
});

test('American roulette: 36/38 = 94.74%, and the five-number bet 35/38 = 92.11%', () => {
  for (const [covered, returns] of [[1, 36], [2, 18], [3, 12], [4, 9], [6, 6], [12, 3], [18, 2]]) {
    const r = rtpOf(rouletteBet(38, covered, returns));
    assert.strictEqual(r.rtp.fraction, '18/19', `${covered} numbers`);
    assert.strictEqual(Number(r.rtp.percent).toFixed(2), '94.74');
  }
  const five = rtpOf(rouletteBet(38, 5, 7));
  assert.strictEqual(five.rtp.fraction, '35/38');
  assert.strictEqual(Number(five.rtp.percent).toFixed(2), '92.11');
});

test('roulette sample files give 97.30% and 94.74%', () => {
  const eu = rtpOf(JSON.parse(fs.readFileSync(new URL('roulette-european.json', SAMPLES), 'utf8')));
  const us = rtpOf(JSON.parse(fs.readFileSync(new URL('roulette-american.json', SAMPLES), 'utf8')));
  assert.strictEqual(Number(eu.rtp.percent).toFixed(2), '97.30');
  assert.strictEqual(Number(us.rtp.percent).toFixed(2), '94.74');
});

test('3-reel game computed by hand: RTP 27/64, hit 10/64, variance 7783/4096, max 10', () => {
  const r = rtpOf({ rows: 1, reels: [['A', 'B', 'B', 'C'], ['A', 'B', 'B', 'C'], ['A', 'B', 'B', 'C']], paytable: { A: [0, 0, 10], B: [0, 0, 2], C: [0, 0, 1] } });
  assert.strictEqual(r.rtp.fraction, '27/64');
  assert.strictEqual(r.distribution.hitFrequency.fraction, '5/32');
  assert.strictEqual(r.distribution.variance.fraction, '7783/4096');
  assert.strictEqual(r.distribution.maxWin.base, 10);
  const bySym = Object.fromEntries(r.symbols.map((s) => [s.symbol, s.rtp.fraction]));
  assert.deepStrictEqual(bySym, { A: '5/32', B: '1/4', C: '1/64' });
});

// ---- Independent brute force over every stop combination ----
function bruteForce(raw) {
  const N = raw.reels.length, R = raw.rows, L = raw.lines.length;
  const wild = raw.wild ? raw.wild.symbol : null;
  const sc = raw.scatter || null;
  const pt = (sym, n) => Fraction.of((raw.paytable[sym] || [])[n - 1] || 0);
  const wildPay = (n) => (wild && n > 0 ? Fraction.of((raw.wild.pays || [])[n - 1] || 0) : new Fraction(0n));
  const scPay = (c) => {
    if (!sc || !sc.pays || c === 0) return new Fraction(0n);
    const p = sc.pays;
    return Fraction.of(c <= p.length ? p[c - 1] || 0 : p[p.length - 1]);
  };
  const evalSpin = (reels) => {
    const stops = reels.map(() => 0);
    const outs = [];
    for (;;) {
      const win = (k, r) => reels[k][(stops[k] + r) % reels[k].length];
      let total = new Fraction(0n);
      for (const line of raw.lines) {
        const syms = line.map((row, k) => win(k, row - 1));
        let w0 = 0;
        while (w0 < N && syms[w0] === wild) w0++;
        let best = wildPay(w0);
        if (w0 < N && syms[w0] !== (sc && sc.symbol)) {
          const t = syms[w0];
          let n = w0;
          while (n < N && (syms[n] === t || syms[n] === wild)) n++;
          if (pt(t, n).cmp(best) > 0) best = pt(t, n);
        }
        total = total.add(best); // in line bets
      }
      let count = 0;
      if (sc) for (let k = 0; k < N; k++) for (let r = 0; r < R; r++) if (win(k, r) === sc.symbol) count++;
      total = total.add(scPay(count).mul(L));
      outs.push({ win: total.div(L), count }); // in total bets
      let k = 0;
      while (k < N && ++stops[k] === reels[k].length) { stops[k] = 0; k++; }
      if (k === N) break;
    }
    return outs;
  };
  const moments = (outs, trig) => {
    const n = outs.length;
    let s1 = new Fraction(0n), s2 = new Fraction(0n), sJ = 0, sXJ = new Fraction(0n), hits = 0, max = 0;
    for (const o of outs) {
      const J = trig && o.count >= sc.freeSpins.trigger;
      s1 = s1.add(o.win); s2 = s2.add(o.win.mul(o.win));
      if (J) { sJ++; sXJ = sXJ.add(o.win); }
      if (o.win.cmp(0) > 0 || J) hits++;
      max = Math.max(max, o.win.toNumber());
    }
    return { E: s1.div(n), E2: s2.div(n), pJ: new Fraction(BigInt(sJ), BigInt(n)), EXJ: sXJ.div(n), hit: new Fraction(BigInt(hits), BigInt(n)), max };
  };
  const base = moments(evalSpin(raw.reels), Boolean(sc && sc.freeSpins));
  if (!(sc && sc.freeSpins)) return { rtp: base.E, variance: base.E2.sub(base.E.mul(base.E)), hit: base.hit, max: base.max };
  const f = sc.freeSpins;
  if (f.retrigger) throw new Error('brute force covers free spins without retrigger');
  const m = Fraction.of(f.multiplier || 1);
  const x = moments(evalSpin(f.reels || raw.reels), false);
  const EX = x.E.mul(m), EX2 = x.E2.mul(m).mul(m), F = BigInt(f.spins);
  const EFv = EX.mul(F), EFv2 = EX2.mul(F).add(EX.mul(EX).mul(F * (F - 1n)));
  const EW = base.E.add(base.pJ.mul(EFv));
  const EW2 = base.E2.add(base.EXJ.mul(EFv).mul(2n)).add(base.pJ.mul(EFv2));
  return { rtp: EW, variance: EW2.sub(EW.mul(EW)), hit: base.hit, max: base.max };
}

const SMALL = {
  name: 'brute-force check', rows: 3,
  reels: [
    ['A', 'K', 'W', 'Q', 'S', 'K', 'B'], ['K', 'A', 'Q', 'W', 'B', 'S'], ['Q', 'S', 'A', 'K', 'W', 'B', 'K'],
    ['A', 'W', 'K', 'Q', 'B', 'S'], ['K', 'Q', 'A', 'B', 'S', 'W'],
  ],
  lines: [[2, 2, 2, 2, 2], [1, 1, 1, 1, 1], [3, 3, 3, 3, 3], [1, 2, 3, 2, 1], [3, 2, 1, 2, 3], [1, 1, 2, 3, 3], [2, 3, 2, 1, 2]],
  paytable: { A: [0, 2, 10, 40, 150], K: [0, 0, 5, 20, 75], Q: [0, 0, 2.5, 10, 50], B: [0, 0, 0, 0, 0] },
  wild: { symbol: 'W', pays: [0, 5, 25, 100, 500] },
  scatter: { symbol: 'S', pays: [0, 0, 2, 10, 40] },
};

test('exact engine equals brute force over all 31,752 combinations (wild, scatter, 7 lines)', () => {
  const r = rtpOf(SMALL);
  const b = bruteForce(SMALL);
  assert.strictEqual(r.rtp.fraction, b.rtp.toString());
  assert.strictEqual(r.distribution.variance.fraction, b.variance.toString());
  assert.strictEqual(r.distribution.hitFrequency.fraction, b.hit.toString());
  assert.strictEqual(r.distribution.maxWin.base, b.max);
});

test('free spins with multiplier on separate reels (no retrigger) equal brute force', () => {
  const g = JSON.parse(JSON.stringify(SMALL));
  g.scatter.freeSpins = { trigger: 3, spins: 8, multiplier: 3, retrigger: false, reels: SMALL.reels.map((r) => [...r, 'W']) };
  const r = rtpOf(g);
  const b = bruteForce(g);
  assert.strictEqual(r.rtp.fraction, b.rtp.toString());
  assert.strictEqual(r.distribution.variance.fraction, b.variance.toString());
  assert.strictEqual(r.distribution.hitFrequency.fraction, b.hit.toString());
  const c = r.contributions;
  const sum = Fraction.of(0).add(new Fraction(...c.lines.fraction.split('/').map(BigInt))).add(new Fraction(...c.scatter.fraction.split('/').map(BigInt))).add(new Fraction(...c.freeSpins.fraction.split('/').map(BigInt)));
  assert.strictEqual(sum.toString(), r.rtp.fraction, 'contributions add up to the RTP');
});

test('retrigger: expected spins per trigger = F / (1 - pF)', () => {
  const g = JSON.parse(JSON.stringify(SMALL));
  g.scatter.freeSpins = { trigger: 5, spins: 5, multiplier: 2, retrigger: true };
  const r = rtpOf(g);
  const p = new Fraction(...r.freeSpins.retriggerProbability.fraction.split('/').map(BigInt));
  const expected = new Fraction(5n).div(new Fraction(1n).sub(p.mul(5n)));
  assert.strictEqual(r.freeSpins.expectedSpinsPerTrigger.fraction, expected.toString());
  assert.strictEqual(r.distribution.maxWin.unbounded, true);
  g.scatter.freeSpins.spins = 1000;
  assert.throws(() => rtpOf(g), ModelError);
});

test('per-symbol contributions add up to the line RTP', () => {
  const r = rtpOf(SMALL);
  let sum = new Fraction(0n);
  for (const s of r.symbols) sum = sum.add(new Fraction(...s.rtp.fraction.split('/').map(BigInt)));
  assert.strictEqual(sum.toString(), r.contributions.lines.fraction);
});

test('CSV and form inputs describe the same game as JSON', () => {
  const reels = 'reel1,reel2,reel3\nA,A,A\nB,B,B\nB,B,B\nC,C,C\n';
  const pays = 'symbol,type,1,2,3\nA,normal,0,0,10\nB,normal,0,0,2\nC,,0,0,1\n';
  let raw = applyCsv({ rows: 1 }, reels, 'reels.csv');
  raw = applyCsv(raw, pays, 'paytable.csv');
  assert.strictEqual(rtpOf(raw).rtp.fraction, '27/64');
  const back = modelFromForm(formFromModel(raw));
  assert.strictEqual(rtpOf(back).rtp.fraction, '27/64');
  assert.strictEqual(rtpOf(modelFromForm(formFromModel(SMALL))).rtp.fraction, rtpOf(SMALL).rtp.fraction);
});

test('invalid models are rejected with a message in both languages', () => {
  const bad = [
    { rows: 0, reels: [['A']] },
    { rows: 1, reels: [] },
    { rows: 1, reels: [['A']], lines: [[2]] },
    { rows: 1, reels: [['A']], paytable: { A: [-1] } },
    { rows: 1, reels: [['A']], wild: { symbol: 'Z' } },
  ];
  for (const raw of bad) {
    assert.throws(() => normalizeModel(raw), (e) => e instanceof ModelError && Boolean(e.ar && e.en));
  }
});

test('Desert Gold sample: JSON and the three CSV files give the same exact RTP', () => {
  const read = (f) => fs.readFileSync(new URL(f, SAMPLES), 'utf8');
  const json = JSON.parse(read('desert-gold.json'));
  let raw = { rows: 3, scatter: json.scatter };
  raw = applyCsv(raw, read('desert-gold-reels.csv'), 'reels');
  raw = applyCsv(raw, read('desert-gold-paytable.csv'), 'paytable');
  raw = applyCsv(raw, read('desert-gold-lines.csv'), 'lines');
  const a = rtpOf(json), b = rtpOf(raw);
  assert.strictEqual(b.rtp.fraction, a.rtp.fraction);
  assert.strictEqual(a.rtp.percent, '95.517500');
  assert.strictEqual(b.distribution.variance.fraction, a.distribution.variance.fraction);
});

test('lab/samples.js matches the sample JSON files (regenerate with scripts/make-lab-samples.mjs)', async () => {
  const samples = await import('../../lab/samples.js');
  const read = (f) => JSON.parse(fs.readFileSync(new URL(f, SAMPLES), 'utf8'));
  assert.deepStrictEqual(samples.desertGold, read('desert-gold.json'));
  assert.deepStrictEqual(samples.rouletteEuropean, read('roulette-european.json'));
  assert.deepStrictEqual(samples.rouletteAmerican, read('roulette-american.json'));
});
