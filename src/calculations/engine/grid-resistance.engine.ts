import type { GridGeometrySummary, GridResistanceResult } from './types';

/**
 * Grid resistance, Rg — Sverak's simplified equation, IEEE Std 80-2013
 * §14.2, Eq. 52:
 *
 *   Rg = ρ · [ 1/LT + ( 1/√(20·A) ) · ( 1 + 1 / (1 + h·√(20/A)) ) ]
 *
 * where:
 *   ρ   = apparent soil resistivity (Ω·m)
 *   LT  = total buried conductor length, Lc + Lr (m)
 *   A   = grid area (m²)
 *   h   = burial depth (m)
 *
 * This is the standard's own approximation for the resistance of a grid
 * combining horizontal conductors and vertical ground rods — it does not
 * require rods and conductors to be solved separately; LT already
 * accounts for both via their combined buried length.
 */
export function computeGridResistance(
  apparentResistivity: number,
  geometry: GridGeometrySummary,
): GridResistanceResult {
  const { area, burialDepth, totalConductorLength, totalRodLength } = geometry;

  if (apparentResistivity <= 0) {
    throw new Error('Apparent resistivity must be positive.');
  }
  if (area <= 0) {
    throw new Error('Grid area must be positive.');
  }

  const totalBuriedLength = totalConductorLength + totalRodLength;
  if (totalBuriedLength <= 0) {
    throw new Error(
      'Total buried conductor/rod length must be positive — check that the grid has CONDUCTOR/ROD elements.',
    );
  }

  const term1 = 1 / totalBuriedLength;
  const term2 =
    (1 / Math.sqrt(20 * area)) *
    (1 + 1 / (1 + burialDepth * Math.sqrt(20 / area)));

  const gridResistance = apparentResistivity * (term1 + term2);

  return { gridResistance };
}
