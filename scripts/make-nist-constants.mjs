#!/usr/bin/env node
// Regenerates the binary expansions of e and pi used as NIST SP 800-22 reference
// inputs (test/lab/fixtures). NIST's examples use "the first n binary digits in
// the expansion of e/pi", including the integer part (e = 10.1011..., pi = 11.0010...).
// Output: one byte per 8 bits, most significant bit first.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'lab', 'fixtures');
const E_BITS = 1048576 + 8; // enough for the Universal test example (2^20 bits)

// sum_{k=a}^{b-1} 1/(a*(a+1)*...*k) = P/Q, by binary splitting.
function split(a, b) {
  if (b - a === 1) return [1n, BigInt(a)];
  const m = (a + b) >> 1;
  const [p1, q1] = split(a, m);
  const [p2, q2] = split(m, b);
  return [p1 * q2 + p2, q1 * q2];
}

function eBits(nBits) {
  let k = 2;
  let log2fact = 0;
  while (log2fact < nBits + 64) { log2fact += Math.log2(k); k++; }
  const [p, q] = split(1, k); // e = 1 + p/q
  const fracBits = BigInt(nBits - 2); // integer part of e is 2 = binary "10"
  return ((q + p) << fracBits) / q; // floor(e * 2^(n-2)), exactly n bits
}

// pi by Machin's formula in fixed point (only a few hundred bits are needed).
function piBits(nBits) {
  const guard = 64n;
  const one = 1n << (BigInt(nBits) + guard);
  const atanInv = (x) => {
    const X = BigInt(x), x2 = X * X;
    let term = one / X, sum = term, k = 1n, sign = -1n;
    while (term !== 0n) {
      term /= x2;
      const t = term / (2n * k + 1n);
      sum += sign * t;
      sign = -sign;
      k++;
    }
    return sum;
  };
  const pi = 16n * atanInv(5) - 4n * atanInv(239);
  return pi >> (guard + 2n); // pi * 2^(n+guard) -> floor(pi * 2^(n-2)), integer part "11"
}

function toBytes(big, nBits) {
  const out = new Uint8Array(Math.ceil(nBits / 8));
  const hex = big.toString(2).padStart(nBits, '0');
  if (hex.length !== nBits) throw new Error('unexpected length ' + hex.length);
  for (let i = 0; i < nBits; i++) if (hex.charCodeAt(i) === 49) out[i >> 3] |= 0x80 >> (i & 7);
  return out;
}

const t0 = Date.now();
const e = eBits(E_BITS);
writeFileSync(path.join(OUT, 'e.bin'), toBytes(e, E_BITS));
const pi = piBits(1024);
writeFileSync(path.join(OUT, 'pi.bin'), toBytes(pi, 1024));
console.log('wrote e.bin (' + E_BITS + ' bits) and pi.bin (1024 bits) in ' + (Date.now() - t0) + ' ms');
