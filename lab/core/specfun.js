// Special functions used by the statistical tests: log-gamma, regularized
// incomplete gamma functions, erfc, and the standard normal CDF / quantile.
// Accurate to ~1e-14 relative, far beyond the 6 digits NIST publishes.

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const EPS = 1e-16;
const FPMIN = 1e-300;

// Lower regularized incomplete gamma P(a, x) by its power series (x < a + 1).
function gammaSeries(a, x) {
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 0; n < 100000; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
}

// Upper regularized incomplete gamma Q(a, x) by continued fraction (x >= a + 1).
function gammaContinuedFraction(a, x) {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 100000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

// P(a, x): lower regularized incomplete gamma (NIST "igam").
export function igam(a, x) {
  if (x <= 0) return 0;
  return x < a + 1 ? gammaSeries(a, x) : 1 - gammaContinuedFraction(a, x);
}

// Q(a, x) = 1 - P(a, x): upper regularized incomplete gamma (NIST "igamc").
export function igamc(a, x) {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaContinuedFraction(a, x);
}

// erfc(x) = Q(1/2, x^2) for x >= 0.
export function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x === 0) return 1;
  return igamc(0.5, x * x);
}

export function normalCdf(z) {
  return 0.5 * erfc(-z / Math.SQRT2);
}

// Inverse of normalCdf by Newton iteration from a rational starting point.
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0, 1)');
  if (p < 0.5) return -normalQuantile(1 - p);
  const t = Math.sqrt(-2 * Math.log(1 - p));
  let z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  for (let i = 0; i < 50; i++) {
    const err = normalCdf(z) - p;
    const step = err / (Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI));
    z -= step;
    if (Math.abs(step) < 1e-15) break;
  }
  return z;
}

// P-value of a chi-square statistic with `df` degrees of freedom.
export function chiSquareP(chi2, df) {
  return igamc(df / 2, chi2 / 2);
}
