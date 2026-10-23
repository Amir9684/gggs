import { computeApparentResistivity } from 'src/calculations/engine/soil-apparent-resistivity.engine';
import { computePermissibleVoltages } from 'src/calculations/engine/permissible-voltage.engine';
import { computeSurfaceDeratingFactor } from 'src/calculations/engine/surface-derating.engine';
import { extractGridGeometry } from 'src/calculations/engine/grid-geometry.extractor';

import {
  resolveGalerkinSettings,
  type GalerkinSettings,
} from './galerkin-settings';
import type { GalerkinSolverDetails } from './galerkin-solver-details';
import {
  GalerkinInputError,
  buildGalerkinInput,
  type GalerkinElementLike,
} from './engine/galerkin-input.builder';
import {
  evaluateGalerkinGrid,
  type GalerkinSamplePoint,
} from './engine/galerkin-safety.engine';

/** Plain-number case inputs (the service converts the database decimals first). */
export interface GalerkinCaseInput {
  grid: { length: number; width: number; burialDepth: number };
  fault: {
    faultCurrent: number;
    splitFactor: number;
    decrementFactor: number;
    shockDuration: number;
  };
  settings: {
    surfaceLayerResistivity: number;
    surfaceLayerThickness: number;
    bodyWeight: number;
  };
  /** Soil layers of the case's soil model; Galerkin needs exactly one. */
  soilLayers: ReadonlyArray<{ resistivity: number; thickness: number }>;
  elements: readonly GalerkinElementLike[];
  galerkinSettings: Partial<GalerkinSettings> | null | undefined;
}

export interface GalerkinCaseValues {
  gridResistance: number;
  gpr: number;
  meshVoltage: number;
  touchVoltage: number;
  stepVoltage: number;
  permissibleTouchVoltage: number;
  permissibleStepVoltage: number;
  safe: boolean;
  solverDetails: GalerkinSolverDetails;
}

export type GalerkinCaseOutcome =
  | {
      ok: true;
      values: GalerkinCaseValues;
      samples: {
        touchVoltageMap: GalerkinSamplePoint[];
        stepVoltageMap: GalerkinSamplePoint[];
        voltageProfile: GalerkinSamplePoint[];
      };
    }
  | { ok: false; message: string };

const fail = (message: string): GalerkinCaseOutcome => ({ ok: false, message });

/**
 * Runs the Galerkin method for a case: validates the inputs, builds the
 * solver input from the drawn grid, solves it, and derives the numbers a
 * stored result needs. The permissible voltages use the same Dalziel
 * equations and surface-layer Cs as the IEEE engines, with the body
 * weight picking the 50 kg or 70 kg limit.
 */
export function evaluateGalerkinCase(
  input: GalerkinCaseInput,
): GalerkinCaseOutcome {
  const { grid, fault, settings, soilLayers } = input;

  if (soilLayers.length !== 1) {
    return fail(
      `روش گالرکین فقط خاک تک‌لایه را پشتیبانی می‌کند (مدل خاک انتخاب‌شده ${soilLayers.length} لایه دارد).`,
    );
  }

  const checks: Array<[boolean, string]> = [
    [fault.faultCurrent > 0, 'جریان خطا باید بزرگ‌تر از صفر باشد.'],
    [
      fault.splitFactor > 0 && fault.splitFactor <= 1,
      'ضریب تقسیم جریان باید بیشتر از صفر و حداکثر برابر با ۱ باشد.',
    ],
    [
      fault.decrementFactor >= 1,
      'ضریب کاهشی جریان باید بزرگ‌تر یا مساوی ۱ باشد.',
    ],
    [fault.shockDuration > 0, 'مدت زمان شوک باید بزرگ‌تر از صفر باشد.'],
    [settings.bodyWeight > 0, 'وزن بدن باید بزرگ‌تر از صفر باشد.'],
    [
      settings.surfaceLayerThickness >= 0,
      'ضخامت لایه سطحی نمی‌تواند منفی باشد.',
    ],
    [
      settings.surfaceLayerResistivity >= 0,
      'مقاومت ویژه لایه سطحی نمی‌تواند منفی باشد.',
    ],
    [grid.length > 0 && grid.width > 0, 'ابعاد شبکه باید بزرگ‌تر از صفر باشد.'],
  ];
  for (const [ok, message] of checks) {
    if (
      !ok ||
      [fault, settings, grid].some((group) =>
        Object.values(group).some((v) => !Number.isFinite(v)),
      )
    ) {
      return fail(message);
    }
  }

  const soilResistivity = computeApparentResistivity(
    soilLayers.map((layer, index) => ({ ...layer, layerOrder: index })),
  );
  if (!Number.isFinite(soilResistivity) || soilResistivity <= 0) {
    return fail('مقاومت ویژه خاک نامعتبر است. لطفاً مدل خاک را بررسی کنید.');
  }

  const geometry = extractGridGeometry(grid, [...input.elements]);
  if (!(geometry.conductorDiameter > 0)) {
    return fail('قطر هادی شبکه باید بزرگ‌تر از صفر باشد.');
  }

  const galerkinSettings = resolveGalerkinSettings(input.galerkinSettings);
  const groundCurrent =
    fault.faultCurrent * fault.splitFactor * fault.decrementFactor;

  const { cs } = computeSurfaceDeratingFactor(
    soilResistivity,
    settings.surfaceLayerResistivity,
    settings.surfaceLayerThickness,
  );
  const permissible = computePermissibleVoltages(
    cs,
    settings.surfaceLayerResistivity,
    fault.shockDuration,
  );
  const limits =
    Math.abs(settings.bodyWeight - 50) <= Math.abs(settings.bodyWeight - 70)
      ? permissible.kg50
      : permissible.kg70;

  try {
    const { input: solverInput, summary } = buildGalerkinInput({
      elements: input.elements,
      burialDepth: grid.burialDepth,
      conductorRadius: geometry.conductorDiameter / 2,
      soilResistivity,
      groundCurrent,
      settings: galerkinSettings,
    });

    const result = evaluateGalerkinGrid(solverInput, limits);

    return {
      ok: true,
      values: {
        gridResistance: result.gridResistance,
        gpr: result.gpr,
        meshVoltage: result.touchVoltage,
        touchVoltage: result.touchVoltage,
        stepVoltage: result.stepVoltage,
        permissibleTouchVoltage: limits.touch,
        permissibleStepVoltage: limits.step,
        safe: result.safe,
        solverDetails: {
          method: 'GALERKIN',
          segmentLength: galerkinSettings.segmentLength,
          segmentCount: summary.segmentCount,
          rodCount: summary.rodCount,
          wellCount: summary.wellCount,
          meshCount: result.details.meshCount,
          surgeImpedance: result.details.surgeImpedance,
        },
      },
      samples: result.samples,
    };
  } catch (error) {
    if (error instanceof GalerkinInputError) {
      return fail(error.message);
    }
    return fail(
      `محاسبه با این داده‌ها ممکن نیست: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
