import type { SurfaceDeratingResult } from './types';

/**
 * Surface layer derating factor, Cs — IEEE Std 80-2013 §12.3, Eq. 27/28
 * (empirical curve-fit by Thapar et al., adopted in lieu of the
 * infinite-series form):
 *
 *   Cs = 1 − [ 0.09 · (1 − ρ/ρs) ] / (2·hs + 0.09)
 *
 * where:
 *   ρ  = resistivity of the earth beneath the surface layer (Ω·m)
 *   ρs = surface layer (e.g. crushed rock) resistivity (Ω·m)
 *   hs = surface layer thickness (m)
 *
 * Cs = 1 when there is no surface layer (hs = 0) or when ρs = ρ.
 */
export function computeSurfaceDeratingFactor(
  apparentResistivity: number,
  surfaceLayerResistivity: number,
  surfaceLayerThickness: number,
): SurfaceDeratingResult {
  if (surfaceLayerThickness < 0) {
    throw new Error('Surface layer thickness cannot be negative.');
  }

  if (surfaceLayerThickness === 0 || surfaceLayerResistivity <= 0) {
    return { cs: 1 };
  }

  const cs =
    1 -
    (0.09 * (1 - apparentResistivity / surfaceLayerResistivity)) /
      (2 * surfaceLayerThickness + 0.09);

  return { cs };
}
