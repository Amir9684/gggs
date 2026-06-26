import type { GeometricFactors, GridGeometrySummary } from './types';

/**
 * Geometric correction factors used by the mesh-voltage (Em) and
 * step-voltage (Es) formulas — IEEE Std 80-2013 §16.5, Eqs. 60–68.
 *
 * All formulas here assume a (roughly) rectangular, axis-aligned grid
 * with conductors at uniform spacing — the same assumption baked into
 * the standard itself. `n`, the effective number of parallel conductors,
 * is derived from the grid's actual total conductor length and perimeter
 * (both taken from the drawn `GridElement`s / grid dimensions), following
 * the standard's own na/nb formula — not a literal axis-by-axis conductor
 * count, which the standard's Eq. 84–88 does not use.
 */

/**
 * Effective number of parallel conductors, n = na · nb · nc · nd
 * (IEEE 80-2013 Eqs. 84–88):
 *
 *   na = 2·Lc / Lp                                          (Eq. 85)
 *   nb = 1                          for square grids; else √( Lp / (4·√A) )   (Eq. 86)
 *   nc = ( Lx·Ly / A )^(0.5·n')      where n' = ln(area)/ln(2)... — for
 *        non-square rectangular grids, IEEE 80 sets nc = 1 (Eq. 87 applies
 *        only to non-rectangular grids)
 *   nd = Dm / √(Lx² + Ly²)           for grids with no irregularities; = 1
 *        for square, rectangular, or L-shaped grids (Eq. 88)
 *
 * Lp (grid perimeter) and Lc (total horizontal conductor length) come
 * from the grid's actual dimensions/drawn geometry — this is the
 * standard's own way of estimating "effective number of parallel
 * conductors" from total conductor length, rather than literally counting
 * conductors per axis (which the standard does not use directly in this
 * formula). nc = nd = 1 here since this implementation targets
 * rectangular, axis-aligned grids (the standard's own simplification for
 * that common case).
 */
function effectiveParallelConductors(geometry: GridGeometrySummary): number {
  const { totalConductorLength, length, width, area } = geometry;

  const perimeter = 2 * (length + width);
  if (perimeter <= 0) {
    throw new Error('Grid perimeter must be positive.');
  }

  const na = (2 * totalConductorLength) / perimeter;

  const isSquare = Math.abs(length - width) < 1e-6;
  const nb = isSquare ? 1 : Math.sqrt(perimeter / (4 * Math.sqrt(area)));

  const nc = 1; // rectangular grid assumption (Eq. 87 only applies to non-rectangular grids)
  const nd = 1; // no L-shape/perimeter irregularity assumption (Eq. 88)

  return na * nb * nc * nd;
}

/**
 * Irregularity factor, Ki — IEEE 80-2013 Eq. 71:
 *   Ki = 0.644 + 0.148 · n
 */
function irregularityFactor(n: number): number {
  return 0.644 + 0.148 * n;
}

/**
 * Corrosion/grid-depth correction factor, Kii — IEEE 80-2013 Eq. 63:
 *   Kii = 1 / (2n)^(2/n)   for grids WITHOUT ground rods (or rods only at corners)
 *   Kii = 1                for grids WITH ground rods along the perimeter
 *         or distributed throughout the grid (the more common, more
 *         conservative case, since rods help equalize potential).
 */
function corrosionFactor(n: number, hasRods: boolean): number {
  if (hasRods) return 1;
  return 1 / Math.pow(2 * n, 2 / n);
}

/**
 * Grid depth correction factor, Kh — IEEE 80-2013 Eq. 64:
 *   Kh = √(1 + h/h0),  h0 = 1 m (reference depth)
 */
function depthFactor(burialDepth: number): number {
  const h0 = 1;
  return Math.sqrt(1 + burialDepth / h0);
}

/**
 * Geometric spacing factor for mesh voltage, Km — IEEE 80-2013 Eq. 60:
 *
 *   Km = (1 / 2π) · [ ln( D² / (16·h·d) + (D + 2h)² / (8·D·d) − h / (4d) )
 *                     + (Kii / Kh) · ln( 8 / (π·(2n − 1)) ) ]
 */
function meshGeometricFactor(
  spacing: number,
  burialDepth: number,
  conductorDiameter: number,
  n: number,
  kii: number,
  kh: number,
): number {
  const D = spacing;
  const h = burialDepth;
  const d = conductorDiameter;

  const term1 = Math.log(
    Math.pow(D, 2) / (16 * h * d) +
      Math.pow(D + 2 * h, 2) / (8 * D * d) -
      h / (4 * d),
  );
  const term2 = (kii / kh) * Math.log(8 / (Math.PI * (2 * n - 1)));

  return (1 / (2 * Math.PI)) * (term1 + term2);
}

/**
 * Geometric spacing factor for step voltage, Ks — IEEE 80-2013 Eq. 65:
 *
 *   Ks = (1/π) · [ 1/(2h) + 1/(D + h) + (1/D)·(1 − 0.5^(n−2)) ]
 */
function stepGeometricFactor(
  spacing: number,
  burialDepth: number,
  n: number,
): number {
  const D = spacing;
  const h = burialDepth;

  return (
    (1 / Math.PI) *
    (1 / (2 * h) + 1 / (D + h) + (1 / D) * (1 - Math.pow(0.5, n - 2)))
  );
}

export function computeGeometricFactors(
  geometry: GridGeometrySummary,
): GeometricFactors {
  const { averageSpacing, burialDepth, conductorDiameter, hasPerimeterRods } =
    geometry;

  if (averageSpacing <= 0) {
    throw new Error('Average conductor spacing must be positive.');
  }
  if (conductorDiameter <= 0) {
    throw new Error('Conductor diameter must be positive.');
  }

  const n = effectiveParallelConductors(geometry);
  const ki = irregularityFactor(n);
  const kii = corrosionFactor(n, hasPerimeterRods || geometry.rodCount > 0);
  const kh = depthFactor(burialDepth);
  const km = meshGeometricFactor(
    averageSpacing,
    burialDepth,
    conductorDiameter,
    n,
    kii,
    kh,
  );
  const ks = stepGeometricFactor(averageSpacing, burialDepth, n);

  return { km, ki, kii, kh, ks, n };
}
