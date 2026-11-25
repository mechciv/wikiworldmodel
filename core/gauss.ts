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
