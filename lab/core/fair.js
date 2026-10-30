// Bulk verification of provably-fair rounds with the Web Crypto API (no network).
//
// Scheme "hmac": for every round, the published commitment must equal
// SHA-256(server seed), and the outcome is recomputed as
//   h = HMAC-SHA256(key, message), message built from a template such as
//   "{client}:{nonce}" (key = server seed by default), and
//   f = h[0]/256 + h[1]/256^2 + h[2]/256^3 + h[3]/256^4, a float in [0, 1).
// The outcome is then f itself, floor(f * 10001) / 100 (0.00-100.00), or
// floor(f * N) + offset.
// Scheme "chain": each hash must equal SHA-256 of the next one in the list
// (hex text or raw bytes), i.e. the list is one pre-committed hash chain.
import { forEachCsvRow, findColumn } from './csv.js';
import { chiSquareUniform } from './rng-basic.js';

const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;

export const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
export function fromHex(hex) {
  const h = hex.trim().toLowerCase();
  if (!/^([0-9a-f]{2})*$/.test(h)) throw new Error('not hex: ' + hex);
  return Uint8Array.from(h.match(/../g) || [], (b) => parseInt(b, 16));
}

export async function sha256Hex(data) {
  return toHex(await subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
}

export async function hmacSha256(key, message) {
  const k = await subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', k, typeof message === 'string' ? enc.encode(message) : message));
}

export function floatFromBytes(h) {
  return h[0] / 256 + h[1] / 256 ** 2 + h[2] / 256 ** 3 + h[3] / 256 ** 4;
}

export function mapOutcome(f, { type = 'float', range = 100, offset = 0 } = {}) {
  if (type === 'float') return f;
  if (type === 'dice') return Math.floor(f * 10001) / 100;
  if (type === 'int') return Math.floor(f * range) + offset;
  throw new Error('unknown outcome type ' + type);
}

const COLS = {
  server: ['serverseed', 'server_seed', 'server'],
  hash: ['serverseedhash', 'server_seed_hash', 'hashedserverseed', 'hash', 'commitment'],
  client: ['clientseed', 'client_seed', 'client'],
  nonce: ['nonce', 'round', 'roundid'],
  result: ['result', 'outcome', 'roll', 'value'],
};

export function parseFairCsv(text) {
  const rows = [];
  let header = null, idx = null;
  forEachCsvRow(text, (r, line) => {
    if (!header) {
      header = r;
      idx = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, findColumn(r, names)]));
      return;
    }
    const get = (k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
    rows.push({ line, server: get('server'), hash: get('hash'), client: get('client'), nonce: get('nonce'), result: get('result') });
  });
  if (!header) throw new Error('empty file');
  return { columns: idx, rows };
}

export async function verifyHmacRounds(rows, opts = {}, onProgress = () => {}) {
  const template = opts.template || '{client}:{nonce}';
  const keyFrom = opts.keyFrom || 'server';
  const outcome = { type: opts.outcomeType || 'float', range: opts.range || 100, offset: opts.offset || 0 };
  const tolerance = opts.tolerance ?? 1e-9;
  const keys = new Map();
  const keyFor = (k) => {
    if (!keys.has(k)) keys.set(k, subtle.importKey('raw', enc.encode(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
    return keys.get(k);
  };
  const hashes = new Map();
  const commitment = (seed) => { if (!hashes.has(seed)) hashes.set(seed, sha256Hex(seed)); return hashes.get(seed); };
  const summary = { rows: rows.length, commitmentsChecked: 0, commitmentFailures: [], resultsChecked: 0, mismatches: [], invalid: [] };
  const floats = new Float64Array(rows.length);
  const CHUNK = 256;
  for (let start = 0; start < rows.length; start += CHUNK) {
    const part = rows.slice(start, start + CHUNK);
    await Promise.all(part.map(async (r, j) => {
      const i = start + j;
      if (!r.server) { summary.invalid.push({ line: r.line, reason: 'missing server seed' }); return; }
      if (r.hash) {
        summary.commitmentsChecked++;
        if ((await commitment(r.server)) !== r.hash.toLowerCase()) summary.commitmentFailures.push({ line: r.line, expected: await commitment(r.server), claimed: r.hash });
      }
      const message = template.replace(/\{client\}/g, r.client).replace(/\{nonce\}/g, r.nonce).replace(/\{server\}/g, r.server);
      const key = keyFrom === 'client' ? r.client : r.server;
      const h = new Uint8Array(await subtle.sign('HMAC', await keyFor(key), enc.encode(message)));
      const f = floatFromBytes(h);
      floats[i] = f;
      const expected = mapOutcome(f, outcome);
      if (r.result !== '') {
        const claimed = Number(r.result);
        summary.resultsChecked++;
        if (!Number.isFinite(claimed) || Math.abs(claimed - expected) > tolerance) summary.mismatches.push({ line: r.line, expected, claimed: r.result });
      }
    }));
    onProgress(Math.min(1, (start + CHUNK) / rows.length));
  }
  // Recomputed floats should be uniform on [0, 1): 20 equal bins.
  const bins = Uint32Array.from(floats, (f) => Math.min(19, Math.floor(f * 20)));
  summary.uniformity = rows.length >= 100 ? chiSquareUniform(bins, 0, 19) : null;
  summary.ok = summary.commitmentFailures.length === 0 && summary.mismatches.length === 0 && summary.invalid.length === 0;
  return summary;
}

// hashes[i] must equal SHA-256(hashes[i + 1]) (newest first). With order 'oldest',
// hashes[i + 1] must equal SHA-256(hashes[i]).
export async function verifyHashChain(hashes, { order = 'newest', input = 'hex' } = {}, onProgress = () => {}) {
  const list = hashes.map((h) => h.trim().toLowerCase()).filter(Boolean);
  const breaks = [];
  for (let i = 0; i + 1 < list.length; i++) {
    const [parent, child] = order === 'newest' ? [list[i], list[i + 1]] : [list[i + 1], list[i]];
    const digest = await sha256Hex(input === 'hex' ? child : fromHex(child));
    if (digest !== parent) breaks.push({ index: i + 1, expected: digest, found: parent });
    if ((i & 1023) === 0) onProgress(i / list.length);
  }
  onProgress(1);
  return { hashes: list.length, links: Math.max(0, list.length - 1), breaks, ok: breaks.length === 0 };
}
