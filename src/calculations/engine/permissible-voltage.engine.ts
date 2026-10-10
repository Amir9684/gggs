import type { PermissibleVoltages } from './types';

/**
 * Permissible touch and step voltages for BOTH reference body weights.
 *
 * Dalziel's equations, IEEE Std 80 §8.3 (same formulas the Windows GGGS
 * app evaluates in `calculatevoltages`):
 *
 *   Estep  = (1000 + 6   · Cs · ρs) · k / √ts
 *   Etouch = (1000 + 1.5 · Cs · ρs) · k / √ts
 *
 *   k = 0.116 for a 50 kg body, 0.157 for a 70 kg body.
 *
 * `mesh-voltage.engine` and `step-voltage.engine` still pick ONE weight
 * (from `CaseSetting.bodyWeight`) for the safe / not-safe verdict. This
 * engine exists so results can show both limits side by side, as the
 * Windows app does.
 */
export const DALZIEL_K_50KG = 0.116;
export const DALZIEL_K_70KG = 0.157;

export function computePermissibleVoltages(
  cs: number,
  surfaceLayerResistivity: number,
  shockDuration: number,
): PermissibleVoltages {
  if (shockDuration <= 0) {
    throw new Error('Shock duration must be positive.');
  }
  if (cs <= 0) {
    throw new Error('Surface layer derating factor Cs must be positive.');
  }

  const root = Math.sqrt(shockDuration);
  const touchBase = 1000 + 1.5 * cs * surfaceLayerResistivity;
  const stepBase = 1000 + 6 * cs * surfaceLayerResistivity;

  return {
    kg50: {
      touch: (touchBase * DALZIEL_K_50KG) / root,
      step: (stepBase * DALZIEL_K_50KG) / root,
    },
    kg70: {
      touch: (touchBase * DALZIEL_K_70KG) / root,
      step: (stepBase * DALZIEL_K_70KG) / root,
    },
  };
}
