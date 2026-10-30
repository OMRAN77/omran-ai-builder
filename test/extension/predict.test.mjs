// The predictability test must stay honest: a fair (random) session must read as
// "not predictable" (hit rate near chance), while a session with a planted bias must
// be caught. Loads the real extension scripts into a sandbox and exercises them.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ext = path.join(dir, '..', '..', 'extension');
const sandbox = { window: {}, location: { href: 'https://x/', hostname: 'x' }, crypto: globalThis.crypto, URL: globalThis.URL, Math, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ext, 'core.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ext, 'predict.js'), 'utf8'), sandbox);
const P = sandbox.window.TARYAM.predict;

// Deterministic PRNG so the test is reproducible.
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('a fair random session reads as NOT predictable (hit rate near chance)', () => {
  const rnd = mulberry32(42);
  const spins = Array.from({ length: 900 }, () => Math.floor(rnd() * 37));
  const r = P.backtest(spins, { k: 5 });
  assert.ok(r.trials >= 150, 'enough trials');
  // Within a reasonable band around chance (5/37 = 13.51%).
  assert.ok(Math.abs(r.rate - r.chance) < 0.05, `rate ${r.rate.toFixed(3)} near chance ${r.chance.toFixed(3)}`);
  assert.strictEqual(r.predictable, false, 'a fair wheel must not be flagged predictable');
});

test('a session with a planted wheel-sector bias IS caught', () => {
  const rnd = mulberry32(7);
  const arc = [0, 32, 15, 19, 4, 21, 2]; // a contiguous arc on the European wheel
  const spins = Array.from({ length: 900 }, () => (rnd() < 0.45 ? arc[Math.floor(rnd() * arc.length)] : Math.floor(rnd() * 37)));
  const r = P.backtest(spins, { k: 5 });
  assert.ok(r.rate > r.chance + 0.08, `biased rate ${r.rate.toFixed(3)} well above chance ${r.chance.toFixed(3)}`);
  assert.strictEqual(r.predictable, true, 'a biased wheel must be flagged predictable');
  assert.ok(r.pValue < 0.01, 'binomial p-value is significant');
});

test('predictNext returns five pockets, a color, a dozen, a column and a sector', () => {
  const rnd = mulberry32(99);
  const spins = Array.from({ length: 200 }, () => Math.floor(rnd() * 37));
  const p = P.predictNext(spins, 5);
  assert.strictEqual(p.top.length, 5);
  assert.ok(p.top.every((n) => n >= 0 && n <= 36));
  assert.ok(['red', 'black', 'green'].includes(p.color));
  assert.ok([1, 2, 3].includes(p.dozen));
  assert.ok([1, 2, 3].includes(p.column));
  assert.ok(p.sector.length >= 1);
});

test('sample-size guidance is ordered and sane', () => {
  const s = P.sampleSizeFor(5);
  assert.ok(Math.abs(s.chance - 5 / 37) < 1e-9);
  assert.ok(s.detectBigEdge < s.detectSmallEdge, 'a bigger edge needs fewer rounds');
  assert.ok(s.confirmSound > 300, 'a tight sound-confirmation needs many rounds');
});
