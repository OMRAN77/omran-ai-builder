import test from 'node:test';
import assert from 'node:assert';
import {
  parseSpins, colorOf, counts, uniformityTest, biasScan, evenMoneyTests,
  serialTest, houseEdge, analyze, pocketCount,
} from '../../lab/core/roulette.js';

const near = (a, b, tol, label = '') => assert.ok(Math.abs(a - b) <= tol, `${label} ${a} vs ${b}`);

// A reproducible fair wheel for the statistical tests.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fairSpins(n, seed = 1, pockets = 37) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(rng() * pockets));
  return out;
}

test('parse accepts both digit sets and the strip order; rejects out-of-range and stray 00', () => {
  assert.deepStrictEqual(parseSpins('29 27 6 20 2 11 26 36 13'), [29, 27, 6, 20, 2, 11, 26, 36, 13]);
  assert.deepStrictEqual(parseSpins('٣٦ ٠ 18'), [36, 0, 18]);
  assert.deepStrictEqual(parseSpins('0 00 5', 'american'), [0, '00', 5]);
  assert.throws(() => parseSpins('37 5'), /out of range/);
  assert.throws(() => parseSpins('00 5'), /American/);
});

test('colours follow the real wheel and pocket counts match the type', () => {
  assert.strictEqual(colorOf(0), 'green');
  assert.strictEqual(colorOf('00'), 'green');
  assert.strictEqual(colorOf(1), 'red');
  assert.strictEqual(colorOf(2), 'black');
  assert.strictEqual(pocketCount('european'), 37);
  assert.strictEqual(pocketCount('american'), 38);
  const c = counts([1, 1, 2], 'european');
  assert.strictEqual(c.get('1'), 2);
  assert.strictEqual(c.get('2'), 1);
  assert.strictEqual(c.get('0'), 0);
});

test('house edge: single-zero is 2.70% on every bet; double-zero is 5.26% and the basket worse', () => {
  for (const row of houseEdge('european')) {
    near(row.rtp, 36 / 37, 1e-12, row.bet);
    near(row.edge, 1 / 37, 1e-12, row.bet);
  }
  const us = houseEdge('american');
  for (const row of us) {
    if (row.bet === 'basket') { near(row.edge, 3 / 38, 1e-12); continue; }
    near(row.edge, 2 / 38, 1e-12, row.bet);
  }
});

test('a fair wheel passes every test; a biased one is caught', () => {
  const fair = fairSpins(4000, 7);
  const a = analyze(fair, 'european');
  assert.strictEqual(a.verdict, 'fair');
  assert.ok(a.uniformity.pass, 'uniform p=' + a.uniformity.pValue);
  assert.strictEqual(a.bias.flagged.length, 0);
  assert.ok(a.even.redBlack.pass && a.serial.pass);

  // Load pocket 17 heavily: the bias scan must flag it and uniformity must fail.
  const biased = fair.slice();
  for (let i = 0; i < 600; i++) biased.push(17);
  const b = analyze(biased, 'european');
  assert.strictEqual(b.verdict, 'anomaly');
  assert.ok(b.uniformity.nonUniform, 'p=' + b.uniformity.pValue);
  assert.ok(b.bias.flagged.some((r) => r.pocket === '17'));
  assert.strictEqual(b.bias.hot.pocket, '17');
});

test('even-money binomial catches a red-loaded shoe and ignores zeroes', () => {
  const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19];
  const spins = [];
  for (let i = 0; i < 80; i++) spins.push(reds[i % reds.length]);
  for (let i = 0; i < 20; i++) spins.push(2); // some black
  spins.push(0, 0); // zeroes excluded
  const t = evenMoneyTests(spins);
  assert.strictEqual(t.redBlack.trials, 100);
  assert.ok(t.redBlack.share > 0.7 && !t.redBlack.pass, JSON.stringify(t.redBlack));
});

test('serial correlation flags a scripted, repeating sequence but not a fair one', () => {
  const fair = serialTest(fairSpins(2000, 3));
  assert.ok(fair.pass, 'fair r p=' + fair.pValue);
  const scripted = [];
  for (let i = 0; i < 400; i++) scripted.push(Math.floor(i / 8) % 37); // stays, then steps: strong lag-1 correlation
  const s = serialTest(scripted);
  assert.ok(!s.pass, 'scripted p=' + s.pValue);
});

test('small sample is reported as insufficient, not fair', () => {
  const a = analyze(parseSpins('29 27 6 20 2 11 26 36 13 21 21 1 22 8'), 'european');
  assert.strictEqual(a.verdict, 'insufficient');
  assert.ok(!a.enoughForPocket && a.spinsNeededForPocket > 0);
});

test('bias scan threshold is Bonferroni across the pockets', () => {
  const b = biasScan(fairSpins(4000, 11), 'european');
  near(b.threshold, 0.01 / 37, 1e-18);
  assert.strictEqual(b.rows.length, 37);
});
