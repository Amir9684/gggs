/**
 * Minimal complex-number toolkit for the split factor engines.
 *
 * The Windows GGGS app does this with parallel real / imaginary arrays and
 * a cofactor-based determinant and inverse (`functions.bas`: `Det`,
 * `kehad`, `multi`, `div`). Those are O(n!) and divide by a determinant
 * that is "0" only by exact comparison. The web engines use plain complex
 * values and Gaussian elimination with partial pivoting, which solves the
 * same linear systems.
 */
export interface Complex {
  re: number;
  im: number;
}

export const complex = (re: number, im = 0): Complex => ({ re, im });

export const add = (a: Complex, b: Complex): Complex => ({
  re: a.re + b.re,
  im: a.im + b.im,
});

export const sub = (a: Complex, b: Complex): Complex => ({
  re: a.re - b.re,
  im: a.im - b.im,
});

export const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const scale = (a: Complex, k: number): Complex => ({
  re: a.re * k,
  im: a.im * k,
});

export const abs = (a: Complex): number => Math.hypot(a.re, a.im);

export function div(a: Complex, b: Complex): Complex {
  const denominator = b.re * b.re + b.im * b.im;
  if (denominator === 0) {
    throw new Error('Division by a zero complex number.');
  }
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  };
}

/**
 * Solves A · x = b for a square complex system by Gaussian elimination
 * with partial pivoting. Throws when the matrix is singular — the case
 * the Windows code reports as "invalid data!".
 */
export function solveLinearSystem(
  matrix: readonly (readonly Complex[])[],
  rhs: readonly Complex[],
): Complex[] {
  const size = rhs.length;
  if (matrix.length !== size || matrix.some((row) => row.length !== size)) {
    throw new Error('The system matrix must be square and match the vector.');
  }

  const a = matrix.map((row) => row.map((value) => ({ ...value })));
  const b = rhs.map((value) => ({ ...value }));

  // Pivot threshold relative to the matrix scale, so a matrix that is
  // singular up to rounding is still caught.
  let scaleOfMatrix = 0;
  for (const row of a) {
    for (const value of row) scaleOfMatrix = Math.max(scaleOfMatrix, abs(value));
  }
  const tolerance = scaleOfMatrix * 1e-13;

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (abs(a[row][column]) > abs(a[pivotRow][column])) pivotRow = row;
    }

    if (abs(a[pivotRow][column]) <= tolerance) {
      throw new Error('The system matrix is singular.');
    }

    [a[column], a[pivotRow]] = [a[pivotRow], a[column]];
    [b[column], b[pivotRow]] = [b[pivotRow], b[column]];

    for (let row = column + 1; row < size; row += 1) {
      const factor = div(a[row][column], a[column][column]);
      for (let k = column; k < size; k += 1) {
        a[row][k] = sub(a[row][k], mul(factor, a[column][k]));
      }
      b[row] = sub(b[row], mul(factor, b[column]));
    }
  }

  const x: Complex[] = new Array<Complex>(size);
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let k = row + 1; k < size; k += 1) {
      sum = sub(sum, mul(a[row][k], x[k]));
    }
    x[row] = div(sum, a[row][row]);
  }

  return x;
}
