// Exact conditioning of a Gaussian on linear observations (docs/plans/MODELS.md, decision 8): the closed form the
// world's first nodes need, for a handful of figures at a time. A state has a prior mean and covariance; each
// observation is a sum of some of the state's components, each times a weight, plus noise of a known variance. The
// posterior follows in closed form, and so does what each observation would be predicted to be from all the others,
// with no refitting: the score of a model on evidence it did not see.
//
// Small and dense: a state of a few dozen components and as many observations, in the covariance form, so an
// observation may have no noise of its own at all.

/** An observation: Σ weight × state[index] + noise. */
export interface Row {
  /** the components it sums, and their weights */
  at: number[];
  w: number[];
  /** what was observed */
  y: number;
  /** the variance of its own noise; 0 for none */
  r: number;
}

export interface Posterior {
  mean: Float64Array;
  /** row-major, dim × dim */
  cov: Float64Array;
  /** each observation predicted from all the others: its mean, and its variance with its own noise */
  loo: { mean: number; v: number }[];
}

/** The Cholesky factor of a symmetric positive-definite matrix, in place below the diagonal; false if it is not one. */
function cholesky(a: Float64Array, n: number): boolean {
  for (let j = 0; j < n; j++) {
    let d = a[j * n + j];
    for (let k = 0; k < j; k++) d -= a[j * n + k] * a[j * n + k];
    if (!(d > 0)) return false;
    const l = Math.sqrt(d);
    a[j * n + j] = l;
    for (let i = j + 1; i < n; i++) {
      let s = a[i * n + j];
      for (let k = 0; k < j; k++) s -= a[i * n + k] * a[j * n + k];
      a[i * n + j] = s / l;
    }
  }
  return true;
}

/** Solve L Lᵀ x = b for x, with L from cholesky. */
function cholSolve(l: Float64Array, n: number, b: Float64Array): Float64Array {
  const x = Float64Array.from(b);
  for (let i = 0; i < n; i++) {
    let s = x[i];
    for (let k = 0; k < i; k++) s -= l[i * n + k] * x[k];
    x[i] = s / l[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let k = i + 1; k < n; k++) s -= l[k * n + i] * x[k];
    x[i] = s / l[i * n + i];
  }
  return x;
}

/**
 * The posterior of a Gaussian state given observations. A tiny jitter keeps two observations of one thing with no
 * noise from making the system singular; it is far below any spread the world's figures carry.
 */
export function condition(mean: Float64Array, cov: Float64Array, rows: Row[]): Posterior {
  const dim = mean.length;
  const n = rows.length;
  if (!n) return { mean: Float64Array.from(mean), cov: Float64Array.from(cov), loo: [] };
  // S = Σ Hᵀ, dim × n; C = H Σ Hᵀ + R.
  const S = new Float64Array(dim * n);
  for (let j = 0; j < n; j++) {
    const { at, w } = rows[j];
    for (let i = 0; i < dim; i++) {
      let s = 0;
      for (let k = 0; k < at.length; k++) s += cov[i * dim + at[k]] * w[k];
      S[i * n + j] = s;
    }
  }
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const { at, w } = rows[i];
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < at.length; k++) s += w[k] * S[at[k] * n + j];
      C[i * n + j] = s;
    }
  }
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, C[i * n + i]);
  for (let i = 0; i < n; i++) C[i * n + i] += rows[i].r + 1e-12 * Math.max(1, scale);
  // Symmetrize against rounding before factoring.
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) C[i * n + j] = C[j * n + i] = (C[i * n + j] + C[j * n + i]) / 2;
  const L = Float64Array.from(C);
  if (!cholesky(L, n)) throw new Error('the observations are not consistent with a Gaussian state: their covariance is not positive');
  const resid = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const { at, w, y } = rows[i];
    let m = 0;
    for (let k = 0; k < at.length; k++) m += w[k] * mean[at[k]];
    resid[i] = y - m;
  }
  const alpha = cholSolve(L, n, resid);
  const post = Float64Array.from(mean);
  for (let i = 0; i < dim; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += S[i * n + j] * alpha[j];
    post[i] += s;
  }
  // C⁻¹, column by column, for the posterior covariance and the scores of each observation left out.
  const Cinv = new Float64Array(n * n);
  const e = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    e.fill(0);
    e[j] = 1;
    const col = cholSolve(L, n, e);
    for (let i = 0; i < n; i++) Cinv[i * n + j] = col[i];
  }
  // Σ' = Σ − S C⁻¹ Sᵀ.
  const SC = new Float64Array(dim * n);
  for (let i = 0; i < dim; i++)
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += S[i * n + k] * Cinv[k * n + j];
      SC[i * n + j] = s;
    }
  const postCov = Float64Array.from(cov);
  for (let i = 0; i < dim; i++)
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += SC[i * n + k] * S[j * n + k];
      postCov[i * dim + j] -= s;
      if (j !== i) postCov[j * dim + i] = postCov[i * dim + j];
    }
  // Each observation from the others: y_i − α_i / C⁻¹_ii, with variance 1 / C⁻¹_ii (its own noise included).
  const loo = rows.map((row, i) => {
    const d = Cinv[i * n + i];
    return { mean: row.y - alpha[i] / d, v: 1 / d };
  });
  return { mean: post, cov: postCov, loo };
}

/** The log of the density of a normal distribution at a value. */
export const logNormalPdf = (x: number, mean: number, v: number): number => -0.5 * Math.log(2 * Math.PI * v) - ((x - mean) * (x - mean)) / (2 * v);

/** Standard normal density φ(z). */
export const normPdf = (z: number): number => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/** Standard normal cumulative distribution Φ(z), via Abramowitz & Stegun 7.1.26 (error < 1.5e-7). */
export function normCdf(z: number): number {
  const s = z < 0 ? -1 : 1;
  const a = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * a);
  const erf = s * (1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-a * a));
  return 0.5 * (1 + erf);
}

/**
 * A soft upper-bound (left-censored) observation: the sum Σ weight × state[index] was not listed at a benchmark whose
 * cutoff is `c`, with soft-cutoff log-width `tau` and listing coverage `rho` ∈ (0, 1]:
 *   P(unlisted | f) = (1 − rho) + rho · Φ((c − f) / tau).
 */
export interface CensorRow {
  at: number[];
  w: number[];
  /** log cutoff */
  c: number;
  /** soft cutoff log-width (> 0) */
  tau: number;
  /** probability a settlement well above the cutoff is listed, in (0, 1] */
  rho: number;
}

/** First derivative g = ∂ℓ/∂f ≤ 0 and positive curvature weight w = max(0, −∂²ℓ/∂f²) of log((1 − ρ) + ρ Φ((c − f)/τ)). */
function censorDerivs(f: number, c: number, tau: number, rho: number): { g: number; w: number } {
  const z = (c - f) / tau;
  const phi = normPdf(z);
  const Phi = normCdf(z);
  if (rho >= 1 - 1e-9) {
    // Pure log Φ(z) is strictly concave everywhere; use asymptotic Mills ratio in the far left tail.
    let r: number;
    if (z > -6) r = phi / Math.max(1e-300, Phi);
    else {
      const inv = 1 / z;
      r = -z - inv + 2 * inv * inv * inv;
    }
    return { g: -r / tau, w: Math.max(0, (r * (z + r)) / (tau * tau)) };
  }
  const q = 1 - rho + rho * Phi;
  if (!(q > 0)) return { g: 0, w: 0 };
  const d1 = (rho * phi) / q;
  const d2 = (-z * rho * phi * q - (rho * phi) * (rho * phi)) / (q * q);
  return { g: -d1 / tau, w: Math.max(0, -d2 / (tau * tau)) };
}

/**
 * Laplace approximation for conditioning a Gaussian state N(mean, cov) on soft upper-bound observations (left-censored
 * benchmark absences). Works in the M-dimensional space of censored functionals f = A θ via damped Gauss–Newton on the
 * SPD matrix B = I + W^(1/2) K W^(1/2), so the state covariance update follows in one Woodbury step.
 */
export function conditionCensored(mean: Float64Array, cov: Float64Array, cens: CensorRow[]): { mean: Float64Array; cov: Float64Array } {
  const dim = mean.length;
  const M = cens.length;
  if (!M) return { mean: Float64Array.from(mean), cov: Float64Array.from(cov) };
  // Project prior onto f = A θ: mf (length M), SA = Σ Aᵀ (dim × M), K = A Σ Aᵀ (M × M).
  const mf = new Float64Array(M);
  const SA = new Float64Array(dim * M);
  const K = new Float64Array(M * M);
  for (let m = 0; m < M; m++) {
    const { at, w } = cens[m];
    let mu = 0;
    for (let k = 0; k < at.length; k++) mu += w[k] * mean[at[k]];
    mf[m] = mu;
    for (let i = 0; i < dim; i++) {
      let s = 0;
      for (let k = 0; k < at.length; k++) s += cov[i * dim + at[k]] * w[k];
      SA[i * M + m] = s;
    }
  }
  for (let m = 0; m < M; m++) {
    const { at, w } = cens[m];
    for (let n = 0; n < M; n++) {
      let s = 0;
      for (let k = 0; k < at.length; k++) s += w[k] * SA[at[k] * M + n];
      K[m * M + n] = s;
    }
  }
  for (let i = 0; i < M; i++) for (let j = 0; j < i; j++) K[i * M + j] = K[j * M + i] = (K[i * M + j] + K[j * M + i]) / 2;

  const solveB = (B: Float64Array, rhs: Float64Array): Float64Array | null => {
    const L = Float64Array.from(B);
    if (!cholesky(L, M)) return null;
    return cholSolve(L, M, rhs);
  };

  const f = Float64Array.from(mf);
  const g = new Float64Array(M);
  const w = new Float64Array(M);
  const sW = new Float64Array(M);
  const B = new Float64Array(M * M);
  const r = new Float64Array(M);
  const Kr = new Float64Array(M);
  const sWKr = new Float64Array(M);
  const alpha = new Float64Array(M);

  for (let iter = 0; iter < 16; iter++) {
    for (let m = 0; m < M; m++) {
      const d = censorDerivs(f[m], cens[m].c, cens[m].tau, cens[m].rho);
      g[m] = d.g;
      w[m] = d.w;
      sW[m] = Math.sqrt(d.w);
    }
    for (let i = 0; i < M; i++)
      for (let j = 0; j < M; j++) B[i * M + j] = (i === j ? 1 : 0) + sW[i] * K[i * M + j] * sW[j];
    for (let m = 0; m < M; m++) r[m] = g[m] + w[m] * (f[m] - mf[m]);
    for (let i = 0; i < M; i++) {
      let s = 0;
      for (let j = 0; j < M; j++) s += K[i * M + j] * r[j];
      Kr[i] = s;
      sWKr[i] = sW[i] * s;
    }
    const sol = solveB(B, sWKr);
    if (!sol) break;
    for (let i = 0; i < M; i++) alpha[i] = r[i] - sW[i] * sol[i];
    let maxStep = 0;
    const step = iter > 6 ? 0.5 : 1;
    for (let i = 0; i < M; i++) {
      let s = 0;
      for (let j = 0; j < M; j++) s += K[i * M + j] * alpha[j];
      const delta = mf[i] + s - f[i];
      maxStep = Math.max(maxStep, Math.abs(delta));
      f[i] += step * delta;
    }
    if (maxStep < 1e-5) break;
  }

  for (let m = 0; m < M; m++) {
    const d = censorDerivs(f[m], cens[m].c, cens[m].tau, cens[m].rho);
    g[m] = d.g;
    w[m] = d.w;
    sW[m] = Math.sqrt(d.w);
  }
  const postMean = Float64Array.from(mean);
  for (let i = 0; i < dim; i++) {
    let s = 0;
    for (let m = 0; m < M; m++) s += SA[i * M + m] * g[m];
    postMean[i] += s;
  }
  for (let i = 0; i < M; i++)
    for (let j = 0; j < M; j++) B[i * M + j] = (i === j ? 1 : 0) + sW[i] * K[i * M + j] * sW[j];
  const L = Float64Array.from(B);
  const postCov = Float64Array.from(cov);
  if (cholesky(L, M)) {
    const Q = new Float64Array(M * M);
    const e = new Float64Array(M);
    for (let j = 0; j < M; j++) {
      e.fill(0);
      e[j] = 1;
      const col = cholSolve(L, M, e);
      for (let i = 0; i < M; i++) Q[i * M + j] = sW[i] * col[i] * sW[j];
    }
    const SAQ = new Float64Array(dim * M);
    for (let i = 0; i < dim; i++)
      for (let j = 0; j < M; j++) {
        let s = 0;
        for (let k = 0; k < M; k++) s += SA[i * M + k] * Q[k * M + j];
        SAQ[i * M + j] = s;
      }
    for (let i = 0; i < dim; i++)
      for (let j = 0; j <= i; j++) {
        let s = 0;
        for (let k = 0; k < M; k++) s += SAQ[i * M + k] * SA[j * M + k];
        postCov[i * dim + j] -= s;
        if (j !== i) postCov[j * dim + i] = postCov[i * dim + j];
      }
  }
  return { mean: postMean, cov: postCov };
}
