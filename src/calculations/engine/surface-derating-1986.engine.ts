import type { SurfaceDeratingResult } from './types';

/**
 * Surface layer derating factor, Cs — IEEE Std 80-1986 infinite series, as
 * evaluated by the Windows GGGS app (`calculatevoltages` in `Groundin.bas`):
 *
 *   K  = (ρ − ρs) / (ρ + ρs)
 *   Cs = (1 / 0.96) · [ 1 + 2 · Σ (n = 1..∞)  K^n / √(1 + (2·n·hs / 0.08)²) ]
 *
 * where ρ is the resistivity of the earth beneath the surface layer, ρs the
 * surface layer (e.g. crushed rock) resistivity and hs its thickness (m).
 *
 * Summation stops when a term drops below 1e-4, the same stopping rule the
 * Windows code uses. Cs = 1 when there is no surface layer (hs = 0) or when
 * ρs = ρ.
 *
 * IEEE 80-2000/2013 replaced this series by a curve fit
 * (`surface-derating.engine.ts`). The two are NOT interchangeable when the
 * surface layer is far more resistive than the soil: for ρ = 400 Ω·m,
 * ρs = 2500 Ω·m, hs = 0.102 m the series gives Cs = 0.634 and the curve fit
 * 0.743, i.e. the series gives lower (more conservative) permissible
 * voltages.
 */
const TERM_TOLERANCE = 1e-4;
const MAX_TERMS = 100_000;

export function computeSurfaceDeratingFactor1986(
  soilResistivity: number,
  surfaceLayerResistivity: number,
  surfaceLayerThickness: number,
): SurfaceDeratingResult {
  if (surfaceLayerThickness < 0) {
    throw new Error('Surface layer thickness cannot be negative.');
  }

  if (
    surfaceLayerThickness === 0 ||
    surfaceLayerResistivity <= 0 ||
    surfaceLayerResistivity === soilResistivity
  ) {
    return { cs: 1 };
  }

  const k =
    (soilResistivity - surfaceLayerResistivity) /
    (soilResistivity + surfaceLayerResistivity);

  let sigma = 0;
  let n = 1;
  let term = 1;

  while (Math.abs(term) >= TERM_TOLERANCE && n <= MAX_TERMS) {
    term =
      k ** n / Math.sqrt(1 + ((2 * n * surfaceLayerThickness) / 0.08) ** 2);
    sigma += term;
    n += 1;
  }

  return { cs: (1 + 2 * sigma) / 0.96 };
}
