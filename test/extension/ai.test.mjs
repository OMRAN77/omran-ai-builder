// The AI learner must stay honest: a fair session must read "not predictable",
// while planted biases (wheel sector, transition pattern) must be caught, with the
// matching expert taking the lead. Also covers frame decoding, field discovery and
// history-snapshot merging used by the live inspector.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ext = path.join(dir, '..', '..', 'extension');
const sandbox = { window: {}, location: { href: 'https://x/', hostname: 'x' }, crypto: globalThis.crypto, URL: globalThis.URL, atob: globalThis.atob, TextEncoder: globalThis.TextEncoder, Math, console };
vm.createContext(sandbox);
for (const f of ['core.js', 'predict.js', 'ai.js']) vm.runInContext(fs.readFileSync(path.join(ext, f), 'utf8'), sandbox);
const T = sandbox.window.TARYAM;
const AI = T.ai;
const rng = AI.mulberry32;

test('fair seeded sessions read as NOT predictable', () => {
  for (const seed of [1, 42, 2024]) {
    const r0 = rng(seed);
    const spins = Array.from({ length: 1200 }, () => Math.floor(r0() * 37));
    const r = AI.analyzeSession(spins);
    assert.strictEqual(r.n, 1200);
    assert.strictEqual(r.predictable, false, `seed ${seed}: fair wheel flagged (p=${r.pAnytime}, rate=${r.rate})`);
    assert.ok(Math.abs(r.rate - r.chance) < 0.04, `seed ${seed}: rate ${r.rate.toFixed(3)} near chance`);
    assert.ok(r.pAnytime > 0.01, `seed ${seed}: anytime p ${r.pAnytime}`);
  }
});

test('a wheel-sector bias IS detected', () => {
  const r0 = rng(7);
  const arc = [0, 32, 15, 19, 4, 21, 2];
  const spins = Array.from({ length: 900 }, () => (r0() < 0.35 ? arc[Math.floor(r0() * arc.length)] : Math.floor(r0() * 37)));
  const r = AI.analyzeSession(spins);
  assert.strictEqual(r.predictable, true, `p=${r.pAnytime} rate=${r.rate}`);
  assert.ok(r.rate > r.chance + 0.08, `rate ${r.rate.toFixed(3)}`);
  assert.ok(['sector', 'hot'].includes(r.leader.id), `leader ${r.leader.id}`);
});

test('a transition (markov) bias IS detected and a transition expert leads', () => {
  const r0 = rng(99);
  const next = Array.from({ length: 37 }, () => Math.floor(r0() * 37)); // fixed successor map
  const spins = [Math.floor(r0() * 37)];
  for (let i = 1; i < 1500; i++) spins.push(r0() < 0.4 ? next[spins[i - 1]] : Math.floor(r0() * 37));
  const r = AI.analyzeSession(spins);
  assert.strictEqual(r.predictable, true, `p=${r.pAnytime} rate=${r.rate}`);
  assert.ok(['markov1', 'markov2', 'mlp'].includes(r.leader.id), `leader ${r.leader.id}`);
});

test('the neural network learns a transition pattern above chance', () => {
  const r0 = rng(5);
  const next = Array.from({ length: 37 }, () => Math.floor(r0() * 37));
  const spins = [3];
  for (let i = 1; i < 1500; i++) spins.push(r0() < 0.5 ? next[spins[i - 1]] : Math.floor(r0() * 37));
  const r = AI.analyzeSession(spins);
  const mlp = r.experts.find((e) => e.id === 'mlp');
  assert.ok(mlp.hitRate > r.chance + 0.1, `mlp hit ${mlp.hitRate.toFixed(3)}`);
  assert.ok(mlp.avgLoss < Math.log(37), `mlp loss ${mlp.avgLoss.toFixed(3)} below chance`);
});

test('the learner is deterministic and ignores invalid values', () => {
  const r0 = rng(11);
  const spins = Array.from({ length: 300 }, () => Math.floor(r0() * 37));
  const a = AI.analyzeSession(spins), b = AI.analyzeSession([...spins, -1, 37, 'x', 3.5]);
  assert.strictEqual(a.n, b.n);
  assert.deepStrictEqual([...a.top], [...b.top]);
  assert.strictEqual(a.G, b.G);
});

test('decodeFrames unwraps SignalR, socket.io and nested JSON strings', () => {
  const sr = T.decodeFrames('{"type":1,"target":"result","arguments":[{"winningNumber":17}]}\x1e{"type":6}\x1e');
  assert.strictEqual(sr.length, 2);
  assert.strictEqual(sr[0].arguments[0].winningNumber, 17);
  const io = T.decodeFrames('42["gameResult",{"result":"{\\"number\\":5,\\"gameId\\":\\"g1\\"}"}]');
  assert.strictEqual(io.length, 1);
  assert.strictEqual(io[0][1].result.number, 5);
  assert.deepStrictEqual(Array.from(T.guessNumbers(io[0]), (x) => x.n), [5]);
  assert.strictEqual(T.decodeFrames('hello').length, 0);
});

test('XML frames are parsed into attribute objects', () => {
  const objs = T.decodeFrames('<game id="r9"><result score="23" color="red"/></game>');
  assert.ok(objs.length >= 1);
  const flat = JSON.stringify(objs);
  assert.ok(flat.includes('"score":"23"'), flat);
});

test('fieldCandidates finds the key that carries 0..36 numbers', () => {
  const bodies = [];
  for (let i = 0; i < 12; i++) bodies.push(JSON.stringify({ status: 0, seq: i * 100, t: { lastWin: (i * 7) % 37 }, code: 1 }));
  const c = T.fieldCandidates(bodies);
  assert.ok(c.length >= 1);
  assert.strictEqual(c[0].key, 'lastwin');
  assert.ok(!c.some((x) => ['status', 'seq', 'code'].includes(x.key)));
});

test('mergeSnapshot appends only new rounds from id-less history frames', () => {
  // newest-first history arrays (typical "last results" lists)
  let s = T.mergeSnapshot(null, [5, 9, 12, 0, 33]);
  assert.deepStrictEqual([...s.added], []); // first snapshot: orientation unknown → nothing yet
  s = T.mergeSnapshot(s.state, [7, 5, 9, 12, 0]);
  assert.deepStrictEqual([...s.added], [33, 0, 12, 9, 5, 7].slice(-6)); // seeds history oldest→newest
  s = T.mergeSnapshot(s.state, [7, 5, 9, 12, 0]);
  assert.deepStrictEqual([...s.added], []); // re-sent, nothing new
  s = T.mergeSnapshot(s.state, [21, 14, 7, 5, 9]);
  assert.deepStrictEqual([...s.added], [14, 21]);
  // oldest-first lists
  let o = T.mergeSnapshot(null, [1, 2, 3, 4]);
  o = T.mergeSnapshot(o.state, [2, 3, 4, 8]);
  assert.deepStrictEqual([...o.added], [1, 2, 3, 4, 8]);
  o = T.mergeSnapshot(o.state, [3, 4, 8, 6, 30]);
  assert.deepStrictEqual([...o.added], [6, 30]);
});

test('extractRounds: id rounds are singles, id-less history lists are lists', () => {
  const withIds = { last20Results: [{ result: '17', color: 'red', gameId: 'a1' }, { result: '0', color: 'green', gameId: 'a0' }] };
  const r1 = T.extractRounds(withIds, '');
  assert.deepStrictEqual(Array.from(r1.singles, (x) => [x.n, x.id]), [[0, 'a0'], [17, 'a1']]);
  assert.strictEqual(r1.lists.length, 0);
  const newestFirst = { last20Results: [{ result: 3, color: 'red', gameId: '1007' }, { result: 8, color: 'black', gameId: '1006' }, { result: 0, color: 'green', gameId: '1005' }] };
  assert.deepStrictEqual(Array.from(T.extractRounds(newestFirst, '').singles, (x) => x.n), [0, 8, 3]); // oldest → newest
  const noIds = { table: { recentResults: [5, 9, 12, 0, 33] } };
  const r2 = T.extractRounds(noIds, '');
  assert.strictEqual(r2.lists.length, 1);
  assert.deepStrictEqual([...r2.lists[0].items], [5, 9, 12, 0, 33]);
  assert.strictEqual(r2.lists[0].path, '.table.recentResults');
  const mapped = T.extractRounds({ t: { lastWin: 21 }, status: 0 }, 'lastwin');
  assert.deepStrictEqual(Array.from(mapped.singles, (x) => x.n), [21]);
  // Bare status-like "result" scalars are never taken as pockets.
  assert.strictEqual(T.extractRounds({ result: 0, ok: true }, '').singles.length, 0);
});

test('binary protobuf frames decode into f<n> fields that fieldCandidates can rank', () => {
  // message { f1: varint 900+i (seq), f3: varint pocket, f4: "roulette" }
  const enc = (seq, pocket) => {
    const v = (n) => { const o = []; do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; o.push(b); } while (n); return o; };
    const s = [...'roulette'].map((c) => c.charCodeAt(0));
    const bytes = [0x08, ...v(900 + seq), 0x18, ...v(pocket), 0x22, s.length, ...s];
    return '[binary ' + bytes.length + '] b64:' + Buffer.from(bytes).toString('base64');
  };
  const bodies = Array.from({ length: 10 }, (_, i) => enc(i, (i * 11) % 37));
  const o = T.decodeFrames(bodies[3])[0];
  assert.strictEqual(o.f3, 33);
  assert.strictEqual(o.f4, 'roulette');
  const c = T.fieldCandidates(bodies);
  assert.strictEqual(c[0].key, 'f3');
  assert.ok(!c.some((x) => x.key === 'f1'));
  assert.strictEqual(T.decodeFrames('[binary 3] b64://///w==').length, 0); // junk bytes are rejected
});

test('Turbo RNG frames: big frame parses, cut frame is repaired, history seeds oldest→newest, gameId 0 ignored', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const F = require('./fixtures/turbo.cjs');
  const r0 = rng(3); const hist = [];
  for (let i = 0; i < 58; i++) hist.push(F.round(22359000 + i * 4, Math.floor(r0() * 37), Date.UTC(2026, 9, 31, 2, 0, i * 10)));
  const body = F.frame(hist, 91.01);
  assert.ok(body.length > 20000, 'real frames exceed the old 20 KB cap');
  const objs = T.decodeFrames(body);
  assert.strictEqual(objs.length, 1);
  const ex = T.extractRounds(objs[0], '');
  const ids = new Set(Array.from(ex.singles, (s) => s.id));
  assert.ok(!ids.has('0'), 'gameId 0 is not an id');
  assert.ok(ids.has(String(hist[57].id)));
  const hs = ex.singles.filter((s) => s.path === '.arguments[].lastResults');
  assert.deepStrictEqual(Array.from(hs, (s) => s.n), hist.map((h) => h.n), 'lastResults sorted oldest → newest');
  // Cut at 12 000 chars (the raw buffer cap): still yields the finished round.
  const cut = T.decodeFrames(body.slice(0, 12000));
  assert.strictEqual(cut.length, 1);
  assert.strictEqual(T.extractRounds(cut[0], '').singles[0].n, hist[57].n);
  // Provably fair record: only the finished round, and its hash checks out.
  const fr = T.fairRecords(objs[0]);
  assert.strictEqual(fr.length, 1);
  assert.strictEqual(fr[0].n, hist[57].n);
  assert.strictEqual((await T.sha512Hex(fr[0].key + fr[0].salt)).toUpperCase(), fr[0].hash);
  assert.strictEqual(T.keyNum(fr[0].key), hist[57].n);
  assert.ok(T.isNotPocketKey('order') && T.isNotPocketKey('maintabwhitelist') && !T.isNotPocketKey('lastwin'));
});

test('3-number pick: scored before each spin, stays at chance on a fair wheel', () => {
  let x = 7; const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const L = T.ai.createLearner();
  let mine = 0;
  for (let i = 0; i < 1500; i++) {
    const pick = L.report().pick;
    assert.strictEqual(pick.length, 3);
    assert.strictEqual(new Set(pick).size, 3);
    const n = Math.floor(rnd() * 37);
    if (pick.includes(n)) mine++;
    L.observe(n);
  }
  const r = L.report();
  assert.strictEqual(r.pickHits, mine, 'pick hits counted on the pick shown before the spin');
  assert.ok(Math.abs(r.pickHits / r.n - 3 / 37) < 0.03, 'no edge on a fair wheel: ' + r.pickHits / r.n);
});
