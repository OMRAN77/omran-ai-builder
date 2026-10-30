// Reading an RNG output file into bits / integer values, plus the chi-square
// uniformity test and the lag-1 serial correlation test.
import { igamc, erfc } from './specfun.js';

export function parseRngInput(bytes, { mode = 'auto', min = null, max = null } = {}) {
  const notes = [];
  let kind = mode;
  let text = null;
  if (mode !== 'binary') {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { text = null; }
  }
  if (kind === 'auto') {
    if (text !== null && /^[01\s,]*$/.test(text) && /[01]/.test(text)) kind = 'bits';
    else if (text !== null && /^[\s,;+\-0-9]*$/.test(text) && /\d/.test(text)) kind = 'integers';
    else kind = 'binary';
  }
  if (kind === 'bits') {
    if (text === null) throw new Error('bits mode needs a text file of 0 and 1');
    const bits = [];
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c === 48 || c === 49) bits.push(c - 48); }
    const b = Uint8Array.from(bits);
    const values = new Uint8Array(b.length >> 3);
    for (let i = 0; i < values.length; i++) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | b[i * 8 + j]; values[i] = v; }
    return { kind, bits: b, values, min: 0, max: 255, notes: values.length ? notes : ['too few bits for byte-level tests'] };
  }
  if (kind === 'binary') {
    const bits = new Uint8Array(bytes.length * 8);
    for (let i = 0; i < bits.length; i++) bits[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
    return { kind, bits, values: Uint8Array.from(bytes), min: 0, max: 255, notes };
  }
  if (text === null) throw new Error('integers mode needs a text file');
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const values = new Float64Array(parts.length);
  let lo = Infinity, hi = -Infinity;
  parts.forEach((p, i) => {
    const v = Number(p);
    if (!Number.isInteger(v)) throw new Error('not an integer: ' + p);
    values[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  });
  const rmin = min ?? lo, rmax = max ?? hi;
  if (lo < rmin || hi > rmax) throw new Error(`values outside the declared range ${rmin}..${rmax}`);
  if (min === null || max === null) notes.push(`range taken from the data: ${rmin}..${rmax}`);
  const K = rmax - rmin + 1;
  const k = Math.floor(Math.log2(K));
  const bitList = [];
  let dropped = 0;
  if (k >= 1) {
    for (const v of values) {
      const x = v - rmin;
      if (x >= 2 ** k) { dropped++; continue; }
      for (let j = k - 1; j >= 0; j--) bitList.push(Math.floor(x / 2 ** j) % 2);
    }
  }
  if (2 ** k !== K && k >= 1) notes.push(`range size ${K} is not a power of two: ${dropped} values ≥ ${rmin + 2 ** k} were left out of the bit tests to avoid bias`);
  return { kind, bits: Uint8Array.from(bitList), values, min: rmin, max: rmax, notes };
}

// Chi-square goodness of fit to the uniform distribution on min..max. Ranges with
// more than 65,536 values are grouped into 1,024 bins of near-equal width.
export function chiSquareUniform(values, min, max) {
  const K = max - min + 1;
  const bins = K <= 65536 ? K : 1024;
  const observed = new Float64Array(bins);
  for (const v of values) observed[Math.floor(((v - min) * bins) / K)]++;
  const n = values.length;
  let chi2 = 0, minExpected = Infinity;
  for (let b = 0; b < bins; b++) {
    const width = Math.ceil(((b + 1) * K) / bins) - Math.ceil((b * K) / bins);
    const e = (n * width) / K;
    minExpected = Math.min(minExpected, e);
    chi2 += (observed[b] - e) ** 2 / e;
  }
  const df = bins - 1;
  const p = igamc(df / 2, chi2 / 2);
  return { chi2, df, pValue: p, bins, minExpected, enoughData: minExpected >= 5, pass: p >= 0.01, tooUniform: p > 0.999 };
}

// Lag-1 serial correlation coefficient (with wraparound, as in Walker's ent);
// under independence r * sqrt(n) is approximately standard normal.
export function serialCorrelation(values) {
  const n = values.length;
  let t1 = 0, sum = 0, sum2 = 0;
  for (let i = 0; i < n; i++) {
    const x = values[i];
    t1 += x * values[(i + 1) % n];
    sum += x;
    sum2 += x * x;
  }
  const den = n * sum2 - sum * sum;
  if (den === 0) return { r: null, pValue: 0, pass: false, constant: true };
  const r = (n * t1 - sum * sum) / den;
  const z = r * Math.sqrt(n);
  const p = erfc(Math.abs(z) / Math.SQRT2);
  return { r, z, pValue: p, pass: p >= 0.01 };
}
