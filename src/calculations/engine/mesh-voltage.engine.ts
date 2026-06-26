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

export function computeEffectiveMeshLength(
  totalConductorLength: number,
  totalRodLength: number,
  length: number,
  width: number,
): number {
  if (totalRodLength <= 0) {
    return totalConductorLength;
  }

  const diagonal = Math.sqrt(length ** 2 + width ** 2);
  return (
    totalConductorLength +
    (1.55 + 1.22 * (totalRodLength / diagonal)) * totalRodLength
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
