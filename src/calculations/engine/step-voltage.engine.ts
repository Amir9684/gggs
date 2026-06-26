import type { StepVoltageResult } from './types';

/**
 * Step voltage, Es — IEEE Std 80-2013 §16.5, Eq. 61 (applied):
 *
 *   Es = (ρ · Ks · Ki · IG) / Ls
 *
 * where Ls is the effective buried conductor length for step voltage,
 * §15.4, Eq. 51 (grid WITH ground rods):
 *
 *   Ls = 0.75 · Lc + 0.85 · Lr
 *
 * Permissible step voltage, Estep — Dalziel's equation, §8.3:
 *
 *   Estep(50kg) = (1000 + 6 · Cs · ρs) · 0.116 / √ts     (Eq. 30)
 *   Estep(70kg) = (1000 + 6 · Cs · ρs) · 0.157 / √ts     (Eq. 31)
 *
 * Same 50/70 kg nearest-tabulated-weight handling as the mesh voltage
 * engine (IEEE 80 does not provide an interpolation method between the
 * two reference weights).
 */

const DALZIEL_COEFFICIENT_50KG = 0.116;
const DALZIEL_COEFFICIENT_70KG = 0.157;

function dalzielCoefficient(bodyWeightKg: number): number {
  return Math.abs(bodyWeightKg - 50) <= Math.abs(bodyWeightKg - 70)
    ? DALZIEL_COEFFICIENT_50KG
    : DALZIEL_COEFFICIENT_70KG;
}

export function computeEffectiveStepLength(
  totalConductorLength: number,
  totalRodLength: number,
): number {
  return 0.75 * totalConductorLength + 0.85 * totalRodLength;
}

export function computeStepVoltage(
  apparentResistivity: number,
  ks: number,
  ki: number,
  effectiveGridCurrent: number,
  effectiveStepLength: number,
  cs: number,
  surfaceLayerResistivity: number,
  shockDuration: number,
  bodyWeightKg: number,
): StepVoltageResult {
  if (effectiveStepLength <= 0) {
    throw new Error('Effective step length (Ls) must be positive.');
  }
  if (shockDuration <= 0) {
    throw new Error('Shock duration must be positive.');
  }

  const stepVoltage =
    (apparentResistivity * ks * ki * effectiveGridCurrent) /
    effectiveStepLength;

  const coefficient = dalzielCoefficient(bodyWeightKg);
  const permissibleStepVoltage =
    (1000 + 6 * cs * surfaceLayerResistivity) *
    (coefficient / Math.sqrt(shockDuration));

  return {
    stepVoltage,
    permissibleStepVoltage,
    isSafe: stepVoltage <= permissibleStepVoltage,
  };
}
