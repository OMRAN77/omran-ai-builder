import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import fs from 'fs';
import { parsePlayLog, analyzePlayLog } from '../../lab/core/actual.js';
import { parseRngInput, chiSquareUniform, serialCorrelation } from '../../lab/core/rng-basic.js';
import { chiSquareP, normalQuantile, normalCdf, erfc } from '../../lab/core/specfun.js';
import { sha256Hex, hmacSha256, toHex, parseFairCsv, verifyHmacRounds, verifyHashChain, floatFromBytes } from '../../lab/core/fair.js';
import { Xoshiro128ss, prngFromSeed } from '../../lab/core/prng.js';
import { simulate } from '../../lab/core/montecarlo.js';
import { normalizeModel } from '../../lab/core/slot-model.js';
import { analyzeExact } from '../../lab/core/slot-exact.js';

const near = (a, b, tol, label = '') => assert.ok(Math.abs(a - b) <= tol, `${label} ${a} vs ${b}`);
const SAMPLES = new URL('../../lab/samples/', import.meta.url);

// ---- special functions ----
test('chi-square and normal tables', () => {
  near(chiSquareP(3.841459, 1), 0.05, 1e-6);
  near(chiSquareP(18.307038, 10), 0.05, 1e-6);
  near(chiSquareP(293.247835, 255), 0.05, 1e-6);
  near(normalQuantile(0.975), 1.959963985, 1e-9);
  near(normalQuantile(0.95), 1.644853627, 1e-9);
  near(normalQuantile(0.9995), 3.290526731, 1e-9);
  near(normalCdf(1.959963985), 0.975, 1e-9);
  near(erfc(1), 0.157299207050285, 1e-14);
});

// ---- actual RTP ----
test('play log: RTP, interval and test against the declared RTP', () => {
  const csv = 'bet,win\n' + Array.from({ length: 1000 }, (_, i) => `1,${i % 10 === 0 ? 9.5 : 0}`).join('\n');
  const log = parsePlayLog(csv);
  assert.strictEqual(log.bets.length, 1000);
  const r = analyzePlayLog(log, { declaredRtp: 0.95, confidence: 0.95 });
  near(r.rtp, 0.95, 1e-12);
  near(r.hitRate, 0.1, 1e-12);
  // Flat bets: SE = sample SD of the win / sqrt(n). Wins are 9.5 w.p. 0.1, else 0.
  const sd = Math.sqrt((100 * (9.5 - 0.95) ** 2 + 900 * 0.95 ** 2) / 999);
  near(r.standardError, sd / Math.sqrt(1000), 1e-12);
  near(r.ci[0], 0.95 - 1.959963985 * sd / Math.sqrt(1000), 1e-9);
  assert.strictEqual(r.declared.verdict, 'normal');
  assert.strictEqual(r.declared.insideCi, true);
});

test('play log: a clearly lower RTP is flagged suspicious; rounds needed follow (z*sigma/margin)^2', () => {
  const csv = 'stake,payout\n' + Array.from({ length: 200000 }, (_, i) => `2,${i % 2 === 0 ? 3.6 : 0}`).join('\n');
  const r = analyzePlayLog(parsePlayLog(csv), { declaredRtp: 0.96, confidence: 0.95, sigma: 0.9 });
  near(r.rtp, 0.9, 1e-12);
  assert.strictEqual(r.sigmaSource, 'declared');
  near(r.standardError, 0.9 / Math.sqrt(200000), 1e-12);
  assert.strictEqual(r.declared.verdict, 'suspicious');
  assert.strictEqual(r.declared.direction, 'below');
  assert.strictEqual(r.roundsNeeded.find((x) => x.margin === 0.01).rounds, Math.ceil((1.959963985 * 0.9 / 0.01) ** 2));
});

test('play log: variable bets use the ratio estimator; bad rows are reported, not counted', () => {
  const log = parsePlayLog('round,bet,win,note\n1,1,0,a\n2,3,6,b\n3,oops,1,c\n4,0,1,d\n5,2,1,e\n');
  assert.strictEqual(log.bets.length, 3);
  assert.deepStrictEqual(log.skipped.map((s) => s.line), [4, 5]);
  const r = analyzePlayLog(log);
  near(r.rtp, 7 / 6, 1e-12);
});

// ---- RNG input, chi-square, serial correlation ----
test('chi-square by hand: counts [2,3,1] over 0..2 -> chi2 = 1, P = e^-0.5', () => {
  const r = chiSquareUniform([0, 0, 1, 1, 1, 2], 0, 2);
  near(r.chi2, 1, 1e-12);
  assert.strictEqual(r.df, 2);
  near(r.pValue, Math.exp(-0.5), 1e-12);
  const flat = chiSquareUniform(Array.from({ length: 6000 }, (_, i) => i % 6), 0, 5);
  near(flat.chi2, 0, 1e-12);
  near(flat.pValue, 1, 1e-12);
  assert.strictEqual(flat.tooUniform, true);
});

test('serial correlation by hand', () => {
  near(serialCorrelation([1, 2, 3, 4]).r, -0.2, 1e-12);
  near(serialCorrelation([0, 1, 0, 1, 0, 1]).r, -1, 1e-12);
  assert.strictEqual(serialCorrelation([5, 5, 5]).constant, true);
  const rng = new Xoshiro128ss(7, 8, 9, 10);
  const vals = Array.from({ length: 100000 }, () => rng.nextBelow(256));
  assert.strictEqual(serialCorrelation(vals).pass, true);
  assert.strictEqual(chiSquareUniform(vals, 0, 255).pass, true);
});

test('RNG input parsing: bits, integers (power of two and not), raw bytes', () => {
  const bits = parseRngInput(new TextEncoder().encode('0101 1100\n11110000'));
  assert.strictEqual(bits.kind, 'bits');
  assert.deepStrictEqual(Array.from(bits.bits), [0, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0]);
  assert.deepStrictEqual(Array.from(bits.values), [0x5c, 0xf0]);
  const ints = parseRngInput(new TextEncoder().encode('0 3 2 1'), { mode: 'integers', min: 0, max: 3 });
  assert.deepStrictEqual(Array.from(ints.bits), [0, 0, 1, 1, 1, 0, 0, 1]);
  const dice = parseRngInput(new TextEncoder().encode('1\n6\n4\n5'), { mode: 'integers', min: 1, max: 6 });
  assert.deepStrictEqual(Array.from(dice.bits), [0, 0, 1, 1]); // 1 -> 00, 4 -> 11; 6 and 5 are left out
  assert.ok(dice.notes.some((n) => n.includes('not a power of two')));
  const raw = parseRngInput(Uint8Array.from([0xff, 0x00, 0x80]), { mode: 'binary' });
  assert.strictEqual(raw.bits.length, 24);
  assert.deepStrictEqual(Array.from(raw.values), [255, 0, 128]);
});

// ---- provably fair ----
test('SHA-256 and HMAC-SHA256 known answers (FIPS 180, RFC 4231)', async () => {
  assert.strictEqual(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.strictEqual(toHex(await hmacSha256(new Uint8Array(20).fill(0x0b), 'Hi There')), 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  assert.strictEqual(toHex(await hmacSha256('Jefe', 'what do ya want for nothing?')), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
});

function fairRows(n) {
  const rows = ['server_seed,server_seed_hash,client_seed,nonce,result'];
  for (let i = 0; i < n; i++) {
    const server = 'server-seed-' + Math.floor(i / 500);
    const h = crypto.createHmac('sha256', server).update('player-abc:' + i).digest();
    const f = h[0] / 256 + h[1] / 65536 + h[2] / 16777216 + h[3] / 4294967296;
    rows.push([server, crypto.createHash('sha256').update(server).digest('hex'), 'player-abc', i, (Math.floor(f * 10001) / 100).toFixed(2)].join(','));
  }
  return rows;
}

test('bulk HMAC verification: 5,000 rounds made with node:crypto all verify', async () => {
  const { rows } = parseFairCsv(fairRows(5000).join('\n'));
  const r = await verifyHmacRounds(rows, { outcomeType: 'dice', tolerance: 1e-9 });
  assert.strictEqual(r.rows, 5000);
  assert.strictEqual(r.commitmentsChecked, 5000);
  assert.strictEqual(r.resultsChecked, 5000);
  assert.deepStrictEqual([r.commitmentFailures.length, r.mismatches.length], [0, 0]);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.uniformity.pass, true);
});

test('bulk HMAC verification finds a changed result and a wrong commitment by line', async () => {
  const lines = fairRows(1200);
  const parts = lines[701].split(',');
  parts[4] = (Number(parts[4]) + 0.01).toFixed(2);
  lines[701] = parts.join(',');
  const p2 = lines[900].split(',');
  p2[1] = '0'.repeat(64);
  lines[900] = p2.join(',');
  const r = await verifyHmacRounds(parseFairCsv(lines.join('\n')).rows, { outcomeType: 'dice' });
  assert.deepStrictEqual(r.mismatches.map((m) => m.line), [702]);
  assert.deepStrictEqual(r.commitmentFailures.map((m) => m.line), [901]);
  assert.strictEqual(r.ok, false);
});

test('float derivation matches the documented formula', () => {
  near(floatFromBytes([0x80, 0, 0, 0]), 0.5, 0);
  near(floatFromBytes([0xff, 0xff, 0xff, 0xff]), 1 - 2 ** -32, 0);
});

test('hash chain: intact chain verifies, one altered hash is located', async () => {
  const chain = [crypto.randomBytes(32).toString('hex')];
  for (let i = 0; i < 2000; i++) chain.unshift(crypto.createHash('sha256').update(chain[0]).digest('hex'));
  assert.strictEqual((await verifyHashChain(chain)).ok, true);
  const bad = chain.slice();
  bad[1234] = crypto.createHash('sha256').update('x').digest('hex');
  const r = await verifyHashChain(bad);
  assert.deepStrictEqual(r.breaks.map((b) => b.index), [1234, 1235]);
});

// ---- PRNG and Monte Carlo ----
test('xoshiro128** matches the reference C implementation', () => {
  // Generated by compiling the reference algorithm (Blackman & Vigna) with gcc.
  const r = new Xoshiro128ss(1, 2, 3, 4);
  assert.deepStrictEqual(Array.from({ length: 10 }, () => r.nextU32()),
    [11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597, 4258142804]);
  const r2 = new Xoshiro128ss(0x9e3779b9, 0x7f4a7c15, 0xdeadbeef, 0x01234567);
  for (let i = 0; i < 1000; i++) r2.nextU32();
  assert.deepStrictEqual(Array.from({ length: 5 }, () => r2.nextU32()), [1011553451, 783761104, 1056879273, 2410485982, 3351825658]);
});

test('same seed, same simulation; different seed, different result', async () => {
  const model = normalizeModel(JSON.parse(fs.readFileSync(new URL('desert-gold.json', SAMPLES), 'utf8')));
  const a = simulate(model, await prngFromSeed('audit-2026'), 50000);
  const b = simulate(model, await prngFromSeed('audit-2026'), 50000);
  const c = simulate(model, await prngFromSeed('audit-2027'), 50000);
  assert.deepStrictEqual(a, b);
  assert.notStrictEqual(a.totalWinUnits, c.totalWinUnits);
});

test('simulation agrees with the exact engine within 4 standard errors', async () => {
  const eu = normalizeModel(JSON.parse(fs.readFileSync(new URL('roulette-european.json', SAMPLES), 'utf8')));
  const s = simulate(eu, await prngFromSeed('roulette'), 1000000);
  near(s.rtp, 36 / 37, 4 * s.standardError, 'roulette');
  const raw = JSON.parse(fs.readFileSync(new URL('desert-gold.json', SAMPLES), 'utf8'));
  const model = normalizeModel(raw);
  const exact = analyzeExact(model);
  const sim = simulate(model, await prngFromSeed('desert'), 1000000);
  near(sim.rtp, exact.rtp.value, 4 * sim.standardError, 'desert gold RTP');
  near(sim.hitFrequency, exact.distribution.hitFrequency.value, 4 * Math.sqrt(0.25 / 1e6), 'hit frequency');
  near(sim.sd, exact.distribution.sd, 0.1 * exact.distribution.sd, 'sd');
  assert.ok(sim.maxWin <= exact.distribution.maxWin.base || sim.triggers > 0);
});
