/**
 * Solves A · x = b for a dense real square system by Gaussian elimination
 * with partial pivoting. Replaces the in-place "Gauss elimination inverse"
 * the Windows `khandnewn.frm` runs on its reduced system: both solve the
 * same equations, this one never forms the inverse.
 */
export function solveRealSystem(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] {
  const size = rhs.length;
  if (matrix.length !== size || matrix.some((row) => row.length !== size)) {
    throw new Error('The system matrix must be square and match the vector.');
  }

  const a = matrix.map((row) => Float64Array.from(row));
  const b = Float64Array.from(rhs);

  let scale = 0;
  for (const row of a) {
    for (const value of row) scale = Math.max(scale, Math.abs(value));
  }
  const tolerance = scale * 1e-14;

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (Math.abs(a[pivot][column]) <= tolerance) {
      throw new Error('The system matrix is singular.');
    }
    if (pivot !== column) {
      [a[column], a[pivot]] = [a[pivot], a[column]];
      [b[column], b[pivot]] = [b[pivot], b[column]];
    }

    const pivotRow = a[column];
    for (let row = column + 1; row < size; row += 1) {
      const factor = a[row][column] / pivotRow[column];
      if (factor === 0) continue;
      const target = a[row];
      for (let k = column; k < size; k += 1) target[k] -= factor * pivotRow[k];
      b[row] -= factor * b[column];
    }
  }

  const x = new Array<number>(size);
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let k = row + 1; k < size; k += 1) sum -= a[row][k] * x[k];
    x[row] = sum / a[row][row];
  }
  return x;
}
