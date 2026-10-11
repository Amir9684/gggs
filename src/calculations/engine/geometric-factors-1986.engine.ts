import {
  irregularityFactor,
  corrosionFactor,
  depthFactor,
  meshGeometricFactor,
  stepGeometricFactor,
} from './geometric-factors.engine';
import type { GridGeometrySummary } from './types';

/**
 * IEEE Std 80-1986 geometric correction factors.
 *
 * Cross-checked against Ma/Dawalibi/Southey, "Effects of the Changes in
 * IEEE Std. 80 on the Design and Analysis of Power System Grounding"
 * (SES Ltd.), and IEEE's own historical record (J.G. Sverak developed the
 * touch/step voltage and grid resistance equations used in the 1986
 * edition, and later refined `n` for the 2000 edition):
 *
 *   - Km, Ks (the log-based spacing factors), Kii (corrosion), Kh
 *     (depth): Sverak's ORIGINAL formulas, already part of the 1986
 *     edition — IDENTICAL to 2000/2013, reused as-is from
 *     `geometric-factors.engine.ts`.
 *   - n (effective number of parallel conductors): GENUINELY DIFFERENT.
 *     1986 uses literal per-axis conductor counts rather than 2000/2013's
 *     na·nb·nc·nd total-conductor-length-derived formula. Per the
 *     confirmed source: n = nx·ny for the Km/Ki/Em (mesh/touch)
 *     calculation, n = max(nx, ny) for the Ks/Ki/Es (step) calculation —
 *     two different n's, and therefore two different Ki's, unlike
 *     2000/2013 which uses one n/Ki for both.
 */
export interface GeometricFactors1986 {
  /** Mesh-side effective parallel conductors, n = nx · ny. */
  nMesh: number;
  /** Ki evaluated at nMesh — used for the mesh/touch (Em) calculation. */
  kiMesh: number;
  /** Step-side effective parallel conductors, n = max(nx, ny). */
  nStep: number;
  /** Ki evaluated at nStep — used for the step (Es) calculation. */
  kiStep: number;
  kii: number;
  kh: number;
  km: number;
  ks: number;
}

export function computeGeometricFactors1986(
  geometry: GridGeometrySummary,
): GeometricFactors1986 {
  const {
    averageSpacing,
    burialDepth,
    conductorDiameter,
    hasPerimeterRods,
    conductorCountAlongLength,
    conductorCountAlongWidth,
  } = geometry;

  if (averageSpacing <= 0) {
    throw new Error('Average conductor spacing must be positive.');
  }
  if (conductorDiameter <= 0) {
    throw new Error('Conductor diameter must be positive.');
  }
  if (conductorCountAlongLength <= 0 || conductorCountAlongWidth <= 0) {
    throw new Error(
      'Conductor counts along each axis must be positive for the IEEE 80-1986 method.',
    );
  }

  const nMesh = conductorCountAlongLength * conductorCountAlongWidth;
  const nStep = Math.max(conductorCountAlongLength, conductorCountAlongWidth);

  const kiMesh = irregularityFactor(nMesh);
  const kiStep = irregularityFactor(nStep);

  const kii = corrosionFactor(nMesh, hasPerimeterRods);
  const kh = depthFactor(burialDepth);

  const km = meshGeometricFactor(
    averageSpacing,
    burialDepth,
    conductorDiameter,
    nMesh,
    kii,
    kh,
  );
  const ks = stepGeometricFactor(averageSpacing, burialDepth, nStep);

  return { nMesh, kiMesh, nStep, kiStep, kii, kh, km, ks };
}
