import { HttpStatus } from 'src/common/types';

import { summarizeGridMeshes } from './engine/grid-mesh-summary.engine';
import { extractGridGeometry } from './engine/grid-geometry.extractor';
import type { GridElementLike } from './engine/grid-geometry.extractor';
import { computeApparentResistivity } from './engine/soil-apparent-resistivity.engine';
import type { SafetyEvaluationInput } from './engine/types';
import { SoilLayeringMethod } from './enum';

/**
 * Everything the engine needs, as loaded from the database or supplied by a
 * preview request. Numeric fields may be `number` or the decimal strings the
 * database driver returns.
 */
export interface EvaluationDataSource {
  soilLayering: SoilLayeringMethod | null;
  grid: {
    length: number | string;
    width: number | string;
    burialDepth: number | string;
  };
  elements: GridElementLike[];
  soilModel: { surfaceResistivity: number | string };
  layers: Array<{
    resistivity: number | string;
    thickness: number | string;
    layerOrder: number;
  }>;
  fault: {
    faultCurrent: number | string;
    faultDuration: number | string;
    splitFactor: number | string;
    decrementFactor: number | string;
    shockDuration: number | string;
  };
  settings: {
    surfaceLayerResistivity: number | string;
    surfaceLayerThickness: number | string;
    bodyWeight: number | string;
    frequency: number | string;
  };
}

export type BuildEvaluationInputResult =
  | { ok: true; input: SafetyEvaluationInput }
  | { ok: false; statusCode: HttpStatus.BAD_REQUEST; message: string };

const fail = (message: string): BuildEvaluationInputResult => ({
  ok: false,
  statusCode: HttpStatus.BAD_REQUEST,
  message,
});

/**
 * Validates the raw case data and reduces it to the engine's plain-data
 * input. Pure — no database access — so `run()` (persisting) and the
 * stateless preview share exactly the same checks and messages.
 */
export function buildEvaluationInput(
  source: EvaluationDataSource,
): BuildEvaluationInputResult {
  const { grid, soilModel, fault, settings, layers } = source;

  // ---------------------------------------------------------
  // Convert database decimal values to numbers
  // ---------------------------------------------------------

  const gridLength = Number(grid.length);
  const gridWidth = Number(grid.width);
  const burialDepth = Number(grid.burialDepth);

  const faultCurrent = Number(fault.faultCurrent);
  const faultDuration = Number(fault.faultDuration);
  const splitFactor = Number(fault.splitFactor);
  const decrementFactor = Number(fault.decrementFactor);
  const shockDuration = Number(fault.shockDuration);

  const surfaceLayerResistivity = Number(settings.surfaceLayerResistivity);
  const surfaceLayerThickness = Number(settings.surfaceLayerThickness);
  const bodyWeight = Number(settings.bodyWeight);
  const frequency = Number(settings.frequency);

  const surfaceResistivity = Number(soilModel.surfaceResistivity);

  // ---------------------------------------------------------
  // Validate grid
  // ---------------------------------------------------------

  if (!Number.isFinite(gridLength) || gridLength <= 0) {
    return fail('طول شبکه باید بزرگ‌تر از صفر باشد.');
  }

  if (!Number.isFinite(gridWidth) || gridWidth <= 0) {
    return fail('عرض شبکه باید بزرگ‌تر از صفر باشد.');
  }

  if (!Number.isFinite(burialDepth) || burialDepth < 0) {
    return fail('عمق دفن شبکه نمی‌تواند منفی باشد.');
  }

  // ---------------------------------------------------------
  // Extract grid geometry
  // ---------------------------------------------------------

  const geometry = extractGridGeometry(
    {
      length: gridLength,
      width: gridWidth,
      burialDepth,
    },
    source.elements,
  );

  // A grounding grid must contain at least one
  // conductor or rod with a positive length.
  if (
    !Number.isFinite(geometry.totalConductorLength) ||
    !Number.isFinite(geometry.totalRodLength) ||
    geometry.totalConductorLength < 0 ||
    geometry.totalRodLength < 0
  ) {
    return fail('اطلاعات هادی‌ها یا میله‌های ارت شبکه نامعتبر است.');
  }

  if (geometry.totalConductorLength <= 0 && geometry.totalRodLength <= 0) {
    return fail(
      'امکان انجام محاسبات وجود ندارد. شبکه ارت فاقد هادی یا میله ارت است. لطفاً حداقل یک هادی یا میله ارت به شبکه اضافه کنید.',
    );
  }

  if (!Number.isFinite(geometry.area) || geometry.area <= 0) {
    return fail('مساحت شبکه باید بزرگ‌تر از صفر باشد.');
  }

  if (
    !Number.isFinite(geometry.averageSpacing) ||
    geometry.averageSpacing <= 0
  ) {
    return fail(
      'فاصله متوسط هادی‌های شبکه نامعتبر است. لطفاً آرایش هادی‌های شبکه را بررسی کنید.',
    );
  }

  if (
    !Number.isFinite(geometry.conductorDiameter) ||
    geometry.conductorDiameter <= 0
  ) {
    return fail('قطر هادی شبکه باید بزرگ‌تر از صفر باشد.');
  }

  // ---------------------------------------------------------
  // Validate soil model
  // ---------------------------------------------------------

  const soilLayers = layers.map((layer) => ({
    resistivity: Number(layer.resistivity),
    thickness: Number(layer.thickness),
    layerOrder: layer.layerOrder,
  }));

  const invalidSoilLayer = soilLayers.some(
    (layer) =>
      !Number.isFinite(layer.resistivity) ||
      layer.resistivity <= 0 ||
      !Number.isFinite(layer.thickness) ||
      layer.thickness < 0,
  );

  if (invalidSoilLayer) {
    return fail(
      'اطلاعات یکی از لایه‌های خاک نامعتبر است. مقاومت ویژه باید مثبت و ضخامت نمی‌تواند منفی باشد.',
    );
  }

  if (!Number.isFinite(surfaceResistivity) || surfaceResistivity <= 0) {
    return fail('مقاومت ویژه سطح خاک باید بزرگ‌تر از صفر باشد.');
  }

  // ---------------------------------------------------------
  // Calculate apparent soil resistivity
  // ---------------------------------------------------------

  const apparentResistivity = computeApparentResistivity(soilLayers);

  if (!Number.isFinite(apparentResistivity) || apparentResistivity <= 0) {
    return fail(
      'مقاومت ویژه ظاهری خاک نامعتبر است. لطفاً مدل خاک را بررسی کنید.',
    );
  }

  // ---------------------------------------------------------
  // Two-layer soil: exactly two layers, upper one has a thickness
  // ---------------------------------------------------------

  const isTwoLayer = source.soilLayering === SoilLayeringMethod.TWO_LAYER;

  if (isTwoLayer) {
    if (soilLayers.length !== 2) {
      return fail(
        `برای خاک دولایه، مدل خاک باید دقیقاً دو لایه داشته باشد (مدل انتخاب‌شده ${soilLayers.length} لایه دارد).`,
      );
    }

    if (soilLayers[0].thickness <= 0) {
      return fail(
        'برای خاک دولایه، ضخامت لایهٔ بالایی باید بزرگ‌تر از صفر باشد.',
      );
    }

    const { meshCount } = summarizeGridMeshes(geometry);
    if (geometry.totalRodLength > 0 && meshCount < 1) {
      return fail(
        'برای محاسبهٔ خاک دولایه با میله‌های زمین، شبکه باید حداقل یک مش داشته باشد.',
      );
    }
  }

  // ---------------------------------------------------------
  // Validate fault parameters
  // ---------------------------------------------------------

  if (!Number.isFinite(faultCurrent) || faultCurrent <= 0) {
    return fail('جریان خطا باید بزرگ‌تر از صفر باشد.');
  }

  if (!Number.isFinite(splitFactor) || splitFactor <= 0 || splitFactor > 1) {
    return fail('ضریب تقسیم جریان باید بیشتر از صفر و حداکثر برابر با ۱ باشد.');
  }

  if (!Number.isFinite(decrementFactor) || decrementFactor < 1) {
    return fail('ضریب کاهشی جریان باید بزرگ‌تر یا مساوی ۱ باشد.');
  }

  if (!Number.isFinite(faultDuration) || faultDuration <= 0) {
    return fail('مدت زمان خطا باید بزرگ‌تر از صفر باشد.');
  }

  if (!Number.isFinite(shockDuration) || shockDuration <= 0) {
    return fail('مدت زمان شوک باید بزرگ‌تر از صفر باشد.');
  }

  // ---------------------------------------------------------
  // Validate settings
  // ---------------------------------------------------------

  if (!Number.isFinite(surfaceLayerThickness) || surfaceLayerThickness < 0) {
    return fail('ضخامت لایه سطحی نمی‌تواند منفی باشد.');
  }

  if (
    !Number.isFinite(surfaceLayerResistivity) ||
    surfaceLayerResistivity < 0
  ) {
    return fail('مقاومت ویژه لایه سطحی نمی‌تواند منفی باشد.');
  }

  if (!Number.isFinite(bodyWeight) || bodyWeight <= 0) {
    return fail('وزن بدن باید بزرگ‌تر از صفر باشد.');
  }

  if (!Number.isFinite(frequency) || frequency <= 0) {
    return fail('فرکانس شبکه باید بزرگ‌تر از صفر باشد.');
  }

  // ---------------------------------------------------------
  // Build calculation input
  // ---------------------------------------------------------

  const evaluationInput: SafetyEvaluationInput = {
    geometry,

    soil: {
      surfaceResistivity,
      apparentResistivity,
      ...(isTwoLayer && {
        twoLayer: {
          upperResistivity: soilLayers[0].resistivity,
          lowerResistivity: soilLayers[1].resistivity,
          upperThickness: soilLayers[0].thickness,
        },
      }),
    },

    fault: {
      faultCurrent,
      faultDuration,
      splitFactor,
      decrementFactor,
      shockDuration,
    },

    settings: {
      surfaceLayerResistivity,
      surfaceLayerThickness,
      bodyWeight,
      frequency,
    },
  };

  return { ok: true, input: evaluationInput };
}
