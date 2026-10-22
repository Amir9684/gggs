/**
 * Closed-form and quadrature kernels of the Galerkin (method of moments)
 * impedance matrix, ported from `khandnewn.frm` (`okbutton_Click`).
 *
 * Every conductor is a straight segment carrying a uniform leakage
 * current. The ground is uniform soil with ONE mirror image (the free
 * surface at z = 0); the Windows solver has no layered-soil image series.
 */

/** 10-point Gauss-Legendre nodes and weights, with the digits the Windows code uses. */
export const GAUSS_NODES: readonly number[] = [
  0.148874339, -0.148874339, 0.433395394, -0.433395394, 0.679409568,
  -0.679409568, 0.865063367, -0.865063367, 0.973906528, -0.973906528,
];

export const GAUSS_WEIGHTS: readonly number[] = [
  0.295524225, 0.295524225, 0.269266719, 0.269266719, 0.219086363, 0.219086363,
  0.149451349, 0.149451349, 0.066671344, 0.066671344,
];

/** fx(x) = x · asinh(x) − sqrt(1 + x²), the antiderivative the Windows `fx` function evaluates. */
export function fx(x: number): number {
  return x * Math.asinh(x) - Math.sqrt(1 + x * x);
}

/**
 * Self term of a straight element of length `length` and radius
 * `radius`, with the 1 / (4·pi·length²) normalisation already applied by
 * `factor`:  factor · (2a + a·fx(L/a) + a·fx(−L/a)).
 */
export function straightElementTerm(
  factor: number,
  length: number,
  radius: number,
): number {
  return (
    factor *
    (2 * radius + radius * fx(length / radius) + radius * fx(-length / radius))
  );
}

/**
 * Integral over two parallel segments lying on the same line (distance
 * zero apart), where the closed form degenerates to q·(ln|q| − 1) terms.
 * `ends` are the four end differences (j2−i2, j2−i1, j1−i2, j1−i1).
 */
export function collinearIntegral(
  factor: number,
  j2MinusI2: number,
  j2MinusI1: number,
  j1MinusI2: number,
  j1MinusI1: number,
): number {
  const term = (q: number) => (q === 0 ? 0 : q * (Math.log(Math.abs(q)) - 1));
  return (
    factor *
    (-term(j2MinusI2) + term(j2MinusI1) + term(j1MinusI2) - term(j1MinusI1))
  );
}

/**
 * Integral over two parallel segments a perpendicular distance `distance`
 * apart: factor · distance · (−fx(d22) + fx(d21) + fx(d12) − fx(d11)),
 * each d being the along-axis end difference divided by `distance`.
 */
export function parallelIntegral(
  factor: number,
  distance: number,
  j2MinusI2: number,
  j2MinusI1: number,
  j1MinusI2: number,
  j1MinusI1: number,
): number {
  return (
    factor *
    distance *
    (-fx(j2MinusI2 / distance) +
      fx(j2MinusI1 / distance) +
      fx(j1MinusI2 / distance) -
      fx(j1MinusI1 / distance))
  );
}

/**
 * Mutual term of two vertical elements (rod or well) a horizontal
 * `distance` apart, both of length `length` and top depth `topDepth`,
 * with the free-surface image:
 *   K · d · [ 2 + fx(L/d) + fx(−L/d)  +  fx((2L+2h)/d) − 2·fx((2h+L)/d) + fx(2h/d) ]
 * written exactly as the two Windows terms Res1 and Res2.
 */
export function verticalPairTerm(
  factor: number,
  distance: number,
  length: number,
  topDepth: number,
): number {
  const direct =
    2 * distance +
    distance * fx(length / distance) +
    distance * fx(-length / distance);
  const image =
    distance *
    (fx((2 * length + 2 * topDepth) / distance) -
      2 * fx((2 * topDepth + length) / distance) +
      fx((2 * topDepth) / distance));
  return factor * (direct + image);
}

/**
 * Mutual term of a ring well (length `wellLength`) and a rod (length
 * `rodLength`) a horizontal `distance` apart, as in the Windows code.
 */
export function wellRodTerm(
  factor: number,
  distance: number,
  wellLength: number,
  rodLength: number,
  topDepth: number,
): number {
  const direct =
    distance *
    (-fx((-rodLength + wellLength) / distance) +
      fx(-rodLength / distance) +
      fx(wellLength / distance) +
      1);
  const image =
    distance *
    (fx((rodLength + wellLength + 2 * topDepth) / distance) -
      fx((2 * topDepth + rodLength) / distance) -
      fx((2 * topDepth + wellLength) / distance) +
      fx((2 * topDepth) / distance));
  return factor * (direct + image);
}
