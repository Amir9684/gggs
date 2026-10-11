import type { ConductorMaterial } from '../enum';
import { getConductorMaterial } from './conductor-material.catalog';

/**
 * Minimum conductor cross-section for fusing, IEEE Std 80 Eq. 37, as
 * evaluated by the Windows GGGS app (`calculatevoltages` in Groundin.bas):
 *
 *   A [mm²] = 0.001 · I · sqrt( (tc · αr · ρr · 10⁴ / TCAP) / ln(1 + (Tm − Ta) / (K0 + Ta)) )
 *
 *   I   fault current (A)            tc  conduction time (s)
 *   Tm  allowable temperature (°C)   Ta  ambient temperature (°C)
 *   αr, ρr, TCAP, K0 from the material (see `conductor-material.catalog`).
 *
 * Windows then rounds UP to the next standard size. A result above the
 * largest standard size (300 mm²) gets no standard size in Windows; here
 * `standardSizeMm2` is `null` in that case so the caller can say so.
 */
export const STANDARD_CONDUCTOR_SIZES_MM2: readonly number[] = [
  16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300,
];

/** 1 kcmil = 0.5067 mm². */
export const MM2_PER_KCMIL = 0.5067;

export interface ConductorSizingInput {
  material: ConductorMaterial;
  /** Fault current, A. */
  faultCurrent: number;
  /** Conduction time tc, s. */
  duration: number;
  /** Ambient temperature Ta, °C. */
  ambientTemperature: number;
  /**
   * Allowable conductor temperature Tm, °C. Defaults to the material's
   * fusing temperature; pass a lower value to size for a limit such as a
   * connector rating.
   */
  allowableTemperature?: number;
}

export interface ConductorSizingResult {
  /** Minimum area in mm². */
  minimumAreaMm2: number;
  /** Minimum area in kcmil. */
  minimumAreaKcmil: number;
  /** Next standard size at or above the minimum; `null` above 300 mm². */
  standardSizeMm2: number | null;
  /** The Tm actually used (°C). */
  allowableTemperature: number;
}

/** Smallest standard size that is >= the given area, or `null` if none. */
export function roundUpToStandardSize(areaMm2: number): number | null {
  const size = STANDARD_CONDUCTOR_SIZES_MM2.find((s) => areaMm2 <= s);
  return size ?? null;
}

export function computeConductorSizing(
  input: ConductorSizingInput,
): ConductorSizingResult {
  const { faultCurrent, duration, ambientTemperature } = input;

  if (!(faultCurrent > 0)) {
    throw new Error('Fault current must be positive.');
  }
  if (!(duration > 0)) {
    throw new Error('Conduction time must be positive.');
  }

  const material = getConductorMaterial(input.material);
  const tm = input.allowableTemperature ?? material.fusingTemperature;

  if (!(tm > ambientTemperature)) {
    throw new Error(
      'Allowable temperature must be higher than the ambient temperature.',
    );
  }

  const heating =
    (duration * material.alphaR * material.rhoR * 10000) / material.tcap;
  const logTerm = Math.log(
    1 + (tm - ambientTemperature) / (material.k0 + ambientTemperature),
  );

  const minimumAreaMm2 = 0.001 * faultCurrent * Math.sqrt(heating / logTerm);

  return {
    minimumAreaMm2,
    minimumAreaKcmil: minimumAreaMm2 / MM2_PER_KCMIL,
    standardSizeMm2: roundUpToStandardSize(minimumAreaMm2),
    allowableTemperature: tm,
  };
}
