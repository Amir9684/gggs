import { computeGridResistance } from './grid-resistance.engine';
import { computeGpr } from './gpr.engine';
import { computeGeometricFactors1986 } from './geometric-factors-1986.engine';
import { computeSurfaceDeratingFactor } from './surface-derating.engine';
import { computePermissibleVoltages } from './permissible-voltage.engine';
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
 * IEEE Std 80-1986 variant of `evaluateGroundingSafety`
 * (`safety-evaluation.engine.ts`). Same orchestration role and the same
 * "only file that composes engines together" seam — `CalculationsService`
 * picks between this and the 2013 version based on `CalculationCase.
 * designMethod` and never reaches into the individual engine files.
 *
 * What's actually different from the 2013 path, and what isn't:
 *
 *   - Rg (grid resistance), IG/GPR: IDENTICAL between editions — reused
 *     as-is from `grid-resistance.engine.ts`/`gpr.engine.ts`.
 *   - Km, Ks, Kii, Kh: Sverak's original formulas, unchanged since the
 *     1986 edition — reused as-is via `geometric-factors-1986.engine.ts`
 *     (which itself reuses the same functions `geometric-factors.engine.ts`
 *     uses, only feeding them the 1986 `n`).
 *   - n / Ki: GENUINELY DIFFERENT — see `geometric-factors-1986.engine.ts`.
 *     Two separate n/Ki pairs (mesh-side, step-side) rather than one.
 *   - Mesh/step voltage and permissible-voltage formulas themselves
 *     (Dalziel's equation): unchanged, reused from `mesh-voltage.engine.ts`
 *     / `step-voltage.engine.ts`.
 *
 *   - Cs (surface layer derating factor): the 1986 edition used a
 *     DIFFERENT, more conservative infinite-series formula than the
 *     2000/2013 closed-form Cs implemented in `surface-derating.
 *     engine.ts`. The only source found for the 1986 series' exact
 *     coefficients was OCR'd PDF math that could not be reproduced to
 *     match that same source's own worked example, so — per an explicit
 *     decision to not ship an unverified formula into a safety
 *     calculation — this function REUSES the 2000/2013 Cs as a documented
 *     approximation rather than a faithful 1986 reproduction. This makes
 *     results from this engine LESS conservative than a true 1986
 *     implementation for typical (Cs < 1, high-resistivity surface layer)
 *     cases. Replace `computeSurfaceDeratingFactor` here with a verified
 *     1986 implementation if/when one becomes available.
 */
export function evaluateGroundingSafety1986(
  input: SafetyEvaluationInput,
): SafetyEvaluationResult {
  const { geometry, soil, fault, settings } = input;

  const { gridResistance } = computeGridResistance(
    soil.apparentResistivity,
    geometry,
  );

  const { effectiveGridCurrent, gpr } = computeGpr(fault, gridResistance);

  const geometricFactors1986 = computeGeometricFactors1986(geometry);

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
    geometricFactors1986.km,
    geometricFactors1986.kiMesh,
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
    geometricFactors1986.ks,
    geometricFactors1986.kiStep,
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
    // Same reasoning as the 2013 path: Em IS the design touch voltage in
    // the mesh-voltage method, so the same value is reported under both
    // fields rather than computed twice.
    touchVoltage: meshResult.meshVoltage,
    stepVoltage: stepResult.stepVoltage,
    permissibleTouchVoltage: meshResult.permissibleTouchVoltage,
    permissibleStepVoltage: stepResult.permissibleStepVoltage,
    safe: meshResult.isSafe && stepResult.isSafe,
    details: {
      effectiveGridCurrent,
      cs,
      permissibleVoltages: computePermissibleVoltages(
        cs,
        settings.surfaceLayerResistivity,
        fault.shockDuration,
      ),
      geometricFactors: {
        km: geometricFactors1986.km,
        ki: geometricFactors1986.kiMesh,
        kii: geometricFactors1986.kii,
        kh: geometricFactors1986.kh,
        ks: geometricFactors1986.ks,
        n: geometricFactors1986.nMesh,
        nStep: geometricFactors1986.nStep,
        kiStep: geometricFactors1986.kiStep,
      },
    },
  };
}
