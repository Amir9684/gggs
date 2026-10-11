import type { MeshVoltageResult } from './types';

/**
 * Mesh voltage, Em — IEEE Std 80-2013 §16.5, Eq. 60 (applied):
 *
 *   Em = (ρ · Km · Ki · IG) / Lm
 *
 * where Lm is the effective buried conductor length for mesh voltage,
 * §15.4, Eq. 49 (grid WITH ground rods):
 *
 *   Lm = Lc + [ 1.55 + 1.22 · ( Lr / √(Lx² + Ly²) ) ] · Lr
 *
 * Permissible touch voltage, Etouch — Dalziel's equation, §8.3:
 *
 *   Etouch(50kg) = (1000 + 1.5 · Cs · ρs) · 0.116 / √ts     (Eq. 32)
 *   Etouch(70kg) = (1000 + 1.5 · Cs · ρs) · 0.157 / √ts     (Eq. 33)
 *
 * Body weight is taken from `CaseSetting.bodyWeight` (kg); 50 and 70 are
 * the two tabulated reference weights in the standard, so the nearer of
 * the two coefficients is used. Intermediate weights are not interpolated
 * by the standard — IEEE 80 explicitly only tabulates 50 kg and 70 kg.
 */

const DALZIEL_COEFFICIENT_50KG = 0.116;
const DALZIEL_COEFFICIENT_70KG = 0.157;

function dalzielCoefficient(bodyWeightKg: number): number {
  return Math.abs(bodyWeightKg - 50) <= Math.abs(bodyWeightKg - 70)
    ? DALZIEL_COEFFICIENT_50KG
    : DALZIEL_COEFFICIENT_70KG;
}

/** Rod layout needed to pick the right effective mesh length formula. */
export interface RodLayout {
  /** Number of ground rods (the individual rod length is total / count). */
  rodCount: number;
  /** True when rods stand in the corners or along the perimeter. */
  hasPerimeterRods: boolean;
}

/**
 * Effective buried length for the mesh voltage, Lm (IEEE 80-2013 §16.5,
 * and the "Rods arrangement" option of the Windows design forms):
 *
 *   rods in the corners / on the perimeter (and throughout the grid):
 *     Lm = Lc + [ 1.55 + 1.22 · ( Lr / √(Lx² + Ly²) ) ] · LR
 *   no rods, or only a few scattered rods away from the perimeter:
 *     Lm = Lc            (no rods)
 *     Lm = Lc + LR       (a few rods, none on the perimeter)
 *
 * `Lr` is the length of ONE rod and `LR` the total rod length. Without a
 * `rods` argument a single perimeter rod is assumed.
 */
export function computeEffectiveMeshLength(
  totalConductorLength: number,
  totalRodLength: number,
  length: number,
  width: number,
  rods: RodLayout = { rodCount: 1, hasPerimeterRods: true },
): number {
  if (totalRodLength <= 0) {
    return totalConductorLength;
  }

  if (!rods.hasPerimeterRods) {
    return totalConductorLength + totalRodLength;
  }

  const diagonal = Math.sqrt(length ** 2 + width ** 2);
  const singleRodLength = totalRodLength / Math.max(rods.rodCount, 1);
  return (
    totalConductorLength +
    (1.55 + 1.22 * (singleRodLength / diagonal)) * totalRodLength
  );
}

export function computeMeshVoltage(
  apparentResistivity: number,
  km: number,
  ki: number,
  effectiveGridCurrent: number,
  effectiveMeshLength: number,
  cs: number,
  surfaceLayerResistivity: number,
  shockDuration: number,
  bodyWeightKg: number,
): MeshVoltageResult {
  if (effectiveMeshLength <= 0) {
    throw new Error('Effective mesh length (Lm) must be positive.');
  }
  if (shockDuration <= 0) {
    throw new Error('Shock duration must be positive.');
  }

  const meshVoltage =
    (apparentResistivity * km * ki * effectiveGridCurrent) /
    effectiveMeshLength;

  const coefficient = dalzielCoefficient(bodyWeightKg);
  const permissibleTouchVoltage =
    (1000 + 1.5 * cs * surfaceLayerResistivity) *
    (coefficient / Math.sqrt(shockDuration));

  return {
    meshVoltage,
    permissibleTouchVoltage,
    isSafe: meshVoltage <= permissibleTouchVoltage,
  };
}
