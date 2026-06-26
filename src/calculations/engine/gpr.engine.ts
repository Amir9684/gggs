import type { FaultParameters, GprResult } from './types';

/**
 * Ground Potential Rise — IEEE Std 80-2013 §15.1, Eq. 56 (and the
 * effective grid current it depends on, §15.1, Eq. 55):
 *
 *   IG  = If · Sf · Df
 *   GPR = IG · Rg
 *
 * where:
 *   If  = symmetrical grid fault current (A)
 *   Sf  = current division (split) factor
 *   Df  = decrement factor (sub-transient DC offset correction)
 *   Rg  = grid resistance (Ω), from `grid-resistance.engine`
 */
export function computeGpr(
  fault: FaultParameters,
  gridResistance: number,
): GprResult {
  const { faultCurrent, splitFactor, decrementFactor } = fault;

  if (faultCurrent <= 0) {
    throw new Error('Fault current must be positive.');
  }
  if (splitFactor <= 0 || splitFactor > 1) {
    throw new Error('Split factor must be in the range (0, 1].');
  }
  if (decrementFactor < 1) {
    throw new Error('Decrement factor must be >= 1.');
  }
  if (gridResistance <= 0) {
    throw new Error('Grid resistance must be positive.');
  }

  const effectiveGridCurrent = faultCurrent * splitFactor * decrementFactor;
  const gpr = effectiveGridCurrent * gridResistance;

  return { effectiveGridCurrent, gpr };
}
