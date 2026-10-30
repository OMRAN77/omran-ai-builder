import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import * as C from '../../lab/core/casino.js';
import { prngFromSeed } from '../../lab/core/prng.js';
import { normalizeModel } from '../../lab/core/slot-model.js';
import { analyzeExact } from '../../lab/core/slot-exact.js';

const near = (a, b, tol, label = '') => assert.ok(Math.abs(a - b) <= tol, `${label} ${a} vs ${b}`);
const total = (dist) => dist.reduce((s, [, p]) => s + p, 0);

test('roulette: exact returns, win chances and spread', () => {
  const red = C.describe(C.rouletteEuRed());
  near(red.rtp, 36 / 37, 1e-15);
  near(red.houseEdge, 1 / 37, 1e-15);
  near(red.winChance, 18 / 37, 1e-15);
  near(red.sd, Math.sqrt(72 / 37 - (36 / 37) ** 2), 1e-12);
  near(C.describe(C.rouletteEuNumber()).rtp, 36 / 37, 1e-15);
  near(C.describe(C.rouletteEuNumber()).sd, 5.837838, 1e-6);
  near(C.describe(C.rouletteUsRed()).rtp, 18 / 19, 1e-15);
});

test('crash: P(reach m) = rtp / m, so every cash-out point returns the same 97%', () => {
  for (const m of [1.01, 1.5, 2, 10, 100, 1000]) {
    const d = C.crash({ cashout: m });
    near(total(d), 1, 1e-15);
    near(C.describe(d).rtp, 0.97, 1e-12, 'x' + m);
  }
  near(C.describe(C.crash({ cashout: 2 })).winChance, 0.485, 1e-15);
  near(C.describe(C.crash({ cashout: 100 })).winChance, 0.0097, 1e-15);
  assert.throws(() => C.crash({ cashout: 1 }), (e) => Boolean(e.ar && e.en));
});

test('mines: win chance from combinations, payout scaled to the published return', () => {
  // 3 mines in 25 tiles, 5 picks: C(22,5)/C(25,5) = 26334/53130.
  const d = C.mines({ mines: 3, picks: 5 });
  near(d[0][1], 26334 / 53130, 1e-15);
  near(d[0][0], 0.97 * 53130 / 26334, 1e-12);
  // One pick with one mine: 24/25.
  near(C.mines({ mines: 1, picks: 1 })[0][1], 24 / 25, 1e-15);
  for (const [m, k] of [[1, 24], [3, 1], [10, 10], [24, 1], [5, 20]]) near(C.describe(C.mines({ mines: m, picks: k })).rtp, 0.97, 1e-9, `${m}/${k}`);
  assert.throws(() => C.mines({ mines: 3, picks: 23 }), (e) => Boolean(e.ar));
  assert.throws(() => C.mines({ mines: 0, picks: 1 }), (e) => Boolean(e.ar));
});

test('blackjack approximation and a simple game return what they claim', () => {
  const bj = C.blackjack();
  near(total(bj), 1, 1e-15);
  near(C.describe(bj).rtp, 0.995, 1e-12);
  assert.ok(bj.every(([, p]) => p > 0));
  const g = C.simpleGame({ rtp: 0.96, winChance: 0.25 });
  near(g[0][0], 3.84, 1e-12);
  near(C.describe(g).rtp, 0.96, 1e-12);
  assert.throws(() => C.simpleGame({ rtp: 0.96, winChance: 1 }), (e) => Boolean(e.ar));
});

test('sampler draws outcomes with the given probabilities', async () => {
  const draw = C.sampler([[3, 0.2], [1, 0.3], [0, 0.5]]);
  const rng = await prngFromSeed('sampler');
  const counts = { 3: 0, 1: 0, 0: 0 };
  const n = 200000;
  for (let i = 0; i < n; i++) counts[draw(rng)]++;
  for (const [x, p] of [[3, 0.2], [1, 0.3], [0, 0.5]]) near(counts[x] / n, p, 4 * Math.sqrt(p * (1 - p) / n), 'x=' + x);
});

test('players simulation: reproducible, never below zero, broke players stop', async () => {
  const opts = { players: 400, rounds: 500, bet: 5, balance: 100 };
  const a = C.simulatePlayers(C.sampler(C.rouletteEuRed()), await prngFromSeed('players'), opts);
  const b = C.simulatePlayers(C.sampler(C.rouletteEuRed()), await prngFromSeed('players'), opts);
  assert.deepStrictEqual(a, b);
  assert.ok(a.worstFinal >= 0);
  assert.ok(a.broke > 0 && a.broke < opts.players);
  assert.strictEqual(a.at[0], 0);
  assert.strictEqual(a.at.at(-1), opts.rounds);
  assert.strictEqual(a.band.p50[0], opts.balance);
  assert.strictEqual(a.paths.length, 12);
  assert.ok(a.paths.every((p) => p.length === a.at.length && p.every((v) => v >= 0)));
  assert.ok(a.band.p10.every((v, i) => v <= a.band.p50[i] && a.band.p50[i] <= a.band.p90[i]));
});

test('players simulation: average loss matches the house edge when nobody can go broke', async () => {
  // Balance large enough that no player hits zero: mean loss = edge * bet * rounds.
  const s = C.simulatePlayers(C.sampler(C.rouletteEuRed()), await prngFromSeed('edge'), { players: 2000, rounds: 1000, bet: 1, balance: 10000 });
  assert.strictEqual(s.broke, 0);
  const sd = C.describe(C.rouletteEuRed()).sd * Math.sqrt(1000) / Math.sqrt(2000);
  near(10000 - s.meanFinal, 1000 / 37, 4 * sd, 'mean loss');
  near(s.meanWagered, 1000, 1e-9);
  // P(ahead after 1000 red bets) = P(more than 500 wins) = 0.18763 (binomial).
  near(s.ahead / 2000, 0.18763, 4 * Math.sqrt(0.18763 * 0.81237 / 2000), 'ahead');
});

test('players simulation: trying to double 100 with 2.5 bets on red works about 10% of the time', async () => {
  // Gambler's ruin: P(reach 80 units before 0, starting at 40) = (1 - r^40) / (1 - r^80), r = 19/18.
  const r = 19 / 18;
  const exact = (1 - r ** 40) / (1 - r ** 80);
  near(exact, 0.10315, 1e-5);
  const n = 3000;
  const s = C.simulatePlayers(C.sampler(C.rouletteEuRed()), await prngFromSeed('ruin'), { players: n, rounds: 100000, bet: 2.5, balance: 100, target: 200, checkpoints: 1 });
  assert.strictEqual(s.reached + s.broke, n);
  near(s.reached / n, exact, 4 * Math.sqrt(exact * (1 - exact) / n), 'doubled');
  assert.ok(s.medianBustRound > 0 && s.medianBustRound < 100000);
  assert.throws(() => C.simulatePlayers(C.sampler(C.rouletteEuRed()), null, { rounds: 10, bet: 1, balance: 100, target: 50 }), (e) => Boolean(e.ar));
});

test('slot sampler: Desert Gold returns its exact 95.5175% over many rounds', async () => {
  const model = normalizeModel(JSON.parse(fs.readFileSync(new URL('../../lab/samples/desert-gold.json', import.meta.url), 'utf8')));
  const exact = analyzeExact(model);
  const draw = C.slotSampler(model);
  const rng = await prngFromSeed('slot');
  const n = 500000;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += draw(rng);
  near(sum / n, exact.rtp.value, 4 * exact.distribution.sd / Math.sqrt(n) * 1.5, 'slot rtp');
});

test('session summary: return, house take and how many times the balance was bet', () => {
  const s = C.sessionSummary({ start: 1500, bets: 10000, wins: 8500 });
  near(s.net, -1500, 1e-9);
  near(s.returnRate, 0.85, 1e-12);
  near(s.houseTake, 0.15, 1e-12);
  near(s.turnover, 10000 / 1500, 1e-12);
  near(s.end, 0, 1e-9);
  assert.strictEqual(C.sessionSummary({ bets: 100, wins: 90 }).turnover, null);
  assert.throws(() => C.sessionSummary({ bets: 0, wins: 0 }), (e) => Boolean(e.ar));
});
