import { computeGridResistance } from './grid-resistance.engine';
import { computeGpr } from './gpr.engine';
import { computeGeometricFactors } from './geometric-factors.engine';
import { computeSurfaceDeratingFactor } from './surface-derating.engine';
import {
  computeMeshVoltage,
  computeEffectiveMeshLength,
} from './mesh-voltage.engine';
import {
  computeStepVoltage,
  computeEffectiveStepLength,
} from './step-voltage.engine';

import type { SafetyEvaluationInput, SafetyEvaluationResult } from './types';

/**
 * The single seam between "pure IEEE 80 math" and the rest of the app.
 *
 * This is the ONLY file that composes the individual engines together.
 * `CalculationsService` calls this one function and persists its output;
 * it never reaches into the individual engine files directly. If a single
 * formula needs fixing (say, the Km equation), only that one engine file
 * changes — this orchestrator and the service stay untouched as long as
 * the function signature of the engine in question doesn't change.
 *
 * Order of operations follows IEEE Std 80-2013's own structure:
 *   1. Apparent soil resistivity (caller-supplied, from soil-apparent-resistivity.engine)
 *   2. Grid resistance, Rg                              (§14.2)
 *   3. Effective grid current & GPR                     (§15.1)
 *   4. Geometric factors: n, Ki, Kii, Kh, Km, Ks         (§16.5)
 *   5. Surface layer derating factor, Cs                (§12.3)
 *   6. Mesh voltage & permissible touch voltage          (§16.5, §8.3)
 *   7. Step voltage & permissible step voltage            (§16.5, §8.3)
 *   8. Overall safety verdict = touch AND step both safe
 */
export function evaluateGroundingSafety(
  input: SafetyEvaluationInput,
): SafetyEvaluationResult {
  const { geometry, soil, fault, settings } = input;

  const { gridResistance } = computeGridResistance(
    soil.apparentResistivity,
    geometry,
  );

  const { effectiveGridCurrent, gpr } = computeGpr(fault, gridResistance);

  const geometricFactors = computeGeometricFactors(geometry);

  const { cs } = computeSurfaceDeratingFactor(
    soil.apparentResistivity,
    settings.surfaceLayerResistivity,
    settings.surfaceLayerThickness,
  );

  const effectiveMeshLength = computeEffectiveMeshLength(
    geometry.totalConductorLength,
    geometry.totalRodLength,
    geometry.length,
    geometry.width,
  );
  const meshResult = computeMeshVoltage(
    soil.apparentResistivity,
    geometricFactors.km,
    geometricFactors.ki,
    effectiveGridCurrent,
    effectiveMeshLength,
    cs,
    settings.surfaceLayerResistivity,
    fault.shockDuration,
    settings.bodyWeight,
  );

  const effectiveStepLength = computeEffectiveStepLength(
    geometry.totalConductorLength,
    geometry.totalRodLength,
  );
  const stepResult = computeStepVoltage(
    soil.apparentResistivity,
    geometricFactors.ks,
    geometricFactors.ki,
    effectiveGridCurrent,
    effectiveStepLength,
    cs,
    settings.surfaceLayerResistivity,
    fault.shockDuration,
    settings.bodyWeight,
  );

  return {
    gridResistance,
    gpr,
    meshVoltage: meshResult.meshVoltage,
    // `CalculationResult` has separate `meshVoltage`/`touchVoltage` columns,
    // but in IEEE 80's mesh-voltage method Em IS the design touch voltage
    // (the worst-case touch voltage within the grid) — there's no separate
    // formula for "touchVoltage" distinct from mesh voltage in this method,
    // so the same value is reported under both fields rather than computed
    // twice.
    touchVoltage: meshResult.meshVoltage,
    stepVoltage: stepResult.stepVoltage,
    permissibleTouchVoltage: meshResult.permissibleTouchVoltage,
    permissibleStepVoltage: stepResult.permissibleStepVoltage,
    safe: meshResult.isSafe && stepResult.isSafe,
    details: {
      effectiveGridCurrent,
      cs,
      geometricFactors,
    },
  };
}
