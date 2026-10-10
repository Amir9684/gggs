import type { DesignWarning, GridGeometrySummary } from './types';

/**
 * Validity-limit cautions and the "safe for every point" shortcut, as
 * shown by the Windows GGGS design forms.
 *
 * Validity limits (the Sverak/Schwarz-based formulas are only valid in
 * this range):
 *   - burial depth h:       0.25 m <= h <= 2.5 m
 *   - conductor diameter d: d < 0.25 · h
 *
 * Crossing a limit does not stop the calculation; it produces a warning
 * the UI can show next to the result.
 *
 * Safe for every point: when the GPR does not exceed the permissible
 * touch voltage, no point of the site can exceed the touch or step limit
 * (IEEE Std 80 design procedure), so no further analysis is needed.
 */
export const MIN_BURIAL_DEPTH_M = 0.25;
export const MAX_BURIAL_DEPTH_M = 2.5;
export const MAX_DIAMETER_TO_DEPTH_RATIO = 0.25;

export function evaluateDesignValidity(
  geometry: Pick<GridGeometrySummary, 'burialDepth' | 'conductorDiameter'>,
): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  const { burialDepth: h, conductorDiameter: d } = geometry;

  if (h < MIN_BURIAL_DEPTH_M || h > MAX_BURIAL_DEPTH_M) {
    warnings.push({
      code: 'BURIAL_DEPTH_OUT_OF_RANGE',
      message: `عمق دفن (${h} m) خارج از محدودهٔ اعتبار فرمول‌ها (بین ${MIN_BURIAL_DEPTH_M} تا ${MAX_BURIAL_DEPTH_M} متر) است.`,
      value: h,
      limit: h < MIN_BURIAL_DEPTH_M ? MIN_BURIAL_DEPTH_M : MAX_BURIAL_DEPTH_M,
    });
  }

  const maxDiameter = MAX_DIAMETER_TO_DEPTH_RATIO * h;
  if (d >= maxDiameter) {
    warnings.push({
      code: 'CONDUCTOR_DIAMETER_TOO_LARGE',
      message: `قطر هادی (${d} m) باید کمتر از ${MAX_DIAMETER_TO_DEPTH_RATIO} برابر عمق دفن (${maxDiameter} m) باشد.`,
      value: d,
      limit: maxDiameter,
    });
  }

  return warnings;
}

export function isSafeForEveryPoint(
  gpr: number,
  permissibleTouchVoltage: number,
): boolean {
  return gpr <= permissibleTouchVoltage;
}
