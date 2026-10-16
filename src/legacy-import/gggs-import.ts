import {
  FAULT_DURATION_OPTIONS,
  GGGS_LAYOUTS,
  detectKindByRecordCount,
  type GggsFileKind,
} from './gggs-layouts';
import {
  VbRandomFileError,
  countRecords,
  readFields,
} from './vb-random-file.reader';

export class LegacyImportError extends Error {}

export type RodArrangement = 'NONE' | 'CORNERS' | 'PERIMETER' | 'INTERIOR';

/** Body of `POST /grid-elements/generate`, minus `gridId`. */
export interface GeneratorPayload {
  length: number;
  width: number;
  burialDepth: number;
  conductorDiameter: number;
  alongLengthCount: number;
  alongWidthCount: number;
  rods: { arrangement: RodArrangement; count: number; length: number };
}

/**
 * What a Windows `.gggs` file contains, in web-app terms. Nothing is saved:
 * a review screen shows it and the user decides what to create.
 */
export interface LegacyImportDraft {
  kind: GggsFileKind;
  recordCount: number;
  soil:
    | { type: 'ONE_LAYER'; resistivity: number }
    | {
        type: 'TWO_LAYER';
        upperResistivity: number;
        upperThickness: number;
        lowerResistivity: number;
        /** The one-layer resistivity of the Windows main form (kept for reference). */
        mainFormResistivity: number;
      };
  surfaceLayer: { resistivity: number; thickness: number };
  fault: {
    faultCurrent: number;
    shockDuration: number;
    /** From the fault-duration option buttons; `null` when none was selected. */
    faultDuration: number | null;
    splitFactor: number | null;
  };
  conductor: {
    name: string | null;
    allowableTemperature: number | null;
    crossSectionMm2: number;
    requiredAreaMm2: number;
    /** d = 2 * sqrt(A / pi), the diameter the Windows calculation uses (m). */
    diameterM: number | null;
  };
  grid: {
    shape: 'SQUARE' | 'RECTANGULAR' | 'L_SHAPED' | null;
    length: number;
    width: number;
    spacing: number;
    burialDepth: number;
    rodCount: number;
    rodLength: number;
    meshCount: number;
    /** `null` when the web generator cannot reproduce the grid (see warnings). */
    generator: GeneratorPayload | null;
  } | null;
  /** Numbers the Windows app had computed and stored in the file. */
  legacyResults: Record<string, number>;
  warnings: string[];
}

const toBoolean = (value: number | string | undefined): boolean | null => {
  const text = String(value ?? '').trim();
  if (/^(true|-1|1|yes)$/i.test(text)) return true;
  if (/^(false|0|no)$/i.test(text)) return false;
  return null;
};

const MAX_LINES = 200;

export function parseGggsFile(
  buffer: Buffer,
  requestedKind: GggsFileKind | 'AUTO' = 'AUTO',
): LegacyImportDraft {
  const recordCount = countRecords(buffer);
  if (buffer.length === 0) {
    throw new LegacyImportError('The file is empty.');
  }

  const detected = detectKindByRecordCount(recordCount);
  const kind = requestedKind === 'AUTO' ? detected : requestedKind;

  if (!kind) {
    throw new LegacyImportError(
      `This file has ${recordCount} records, which matches none of the supported GGGS files (` +
        Object.entries(GGGS_LAYOUTS)
          .map(([name, layout]) => `${name}: ${layout.length}`)
          .join(', ') +
        ').',
    );
  }
  if (detected !== kind) {
    throw new LegacyImportError(
      `The file has ${recordCount} records but ${kind} files have ${GGGS_LAYOUTS[kind].length}.`,
    );
  }

  let fields: Record<string, number | string>;
  try {
    fields = readFields(buffer, GGGS_LAYOUTS[kind]);
  } catch (error) {
    if (error instanceof VbRandomFileError) {
      throw new LegacyImportError(error.message);
    }
    throw error;
  }

  const num = (name: string) => fields[name] as number;
  const warnings: string[] = [];

  // ---- fault duration (option buttons) ----
  const selectedDurations = FAULT_DURATION_OPTIONS.filter(
    (option) => toBoolean(fields[option.field]) === true,
  );
  let faultDuration: number | null = null;
  if (selectedDurations.length === 1) {
    faultDuration = selectedDurations[0].seconds;
  } else if (selectedDurations.length === 0) {
    warnings.push('No fault duration option was selected in the file.');
  } else {
    warnings.push('More than one fault duration option is set in the file.');
  }

  // ---- soil ----
  const twoLayer = kind === 'IEEE_80_2000_TWO_LAYER';
  const soil: LegacyImportDraft['soil'] = twoLayer
    ? {
        type: 'TWO_LAYER',
        upperResistivity: num('upperResistivity'),
        upperThickness: num('upperThickness'),
        lowerResistivity: num('lowerResistivity'),
        mainFormResistivity: num('soilResistivity'),
      }
    : { type: 'ONE_LAYER', resistivity: num('soilResistivity') };

  // ---- conductor ----
  const area = num('conductorAreaMm2');
  const diameterM = area > 0 ? (2 * Math.sqrt(area / Math.PI)) / 1000 : null;
  if (diameterM === null) {
    warnings.push('The conductor cross-section is not positive.');
  }
  const designFile = kind !== 'GROUNDING_INPUT';

  // ---- grid ----
  let grid: LegacyImportDraft['grid'] = null;
  if (designFile) {
    const square = toBoolean(fields.shapeSquare);
    const rectangular = toBoolean(fields.shapeRectangular);
    const lShaped = toBoolean(fields.shapeLShaped);
    const shape = square
      ? 'SQUARE'
      : rectangular
        ? 'RECTANGULAR'
        : lShaped
          ? 'L_SHAPED'
          : null;
    if (!shape) warnings.push('No grid shape was selected in the file.');

    const length = num('length');
    // Windows copies the length into the width for a square grid.
    const width = shape === 'SQUARE' ? length : num('width');
    const rodCount = Math.round(num('rodCount'));
    const lineCountLl = Math.round(num('lineCountLl'));
    const lineCountLw = Math.round(num('lineCountLw'));

    // In the Windows forms a square grid uses Lc = nll*L + nlw*W, a
    // rectangular grid Lc = nlw*L + nll*W: `nll` counts the lines spread
    // ALONG the length, so for a rectangle the lines parallel to the length
    // are `nlw`.
    const alongLengthCount =
      shape === 'RECTANGULAR' ? lineCountLw : lineCountLl;
    const alongWidthCount = shape === 'RECTANGULAR' ? lineCountLl : lineCountLw;

    const option1 = toBoolean(fields.rodsOption1);
    const option2 = toBoolean(fields.rodsOption2);
    if (option1 === null && option2 === null) {
      warnings.push('The rod arrangement option could not be read.');
    }
    const arrangement: RodArrangement =
      rodCount <= 0 ? 'NONE' : option2 === true ? 'INTERIOR' : 'PERIMETER';

    let generator: GeneratorPayload | null = null;
    if (shape === 'L_SHAPED') {
      warnings.push(
        'L-shaped grids are not supported by the web engine yet, so no grid can be generated.',
      );
    } else if (shape === null) {
      // warned above
    } else if (
      !(length > 0) ||
      !(width > 0) ||
      !(num('burialDepth') > 0) ||
      diameterM === null
    ) {
      warnings.push(
        'The grid dimensions, burial depth or conductor size are not positive, so no grid can be generated.',
      );
    } else if (
      alongLengthCount < 2 ||
      alongWidthCount < 2 ||
      alongLengthCount > MAX_LINES ||
      alongWidthCount > MAX_LINES
    ) {
      warnings.push(
        `The conductor line counts (${alongLengthCount} and ${alongWidthCount}) cannot be used to generate a grid.`,
      );
    } else {
      generator = {
        length,
        width,
        burialDepth: num('burialDepth'),
        conductorDiameter: Number(diameterM.toPrecision(7)),
        alongLengthCount,
        alongWidthCount,
        rods: {
          arrangement,
          count: arrangement === 'NONE' ? 0 : rodCount,
          length: arrangement === 'NONE' ? 0 : num('rodLength'),
        },
      };

      const fileSpacing = num('spacing');
      const spacingAlongWidth = length / (alongWidthCount - 1);
      if (
        fileSpacing > 0 &&
        Math.abs(spacingAlongWidth - fileSpacing) / fileSpacing > 0.02
      ) {
        warnings.push(
          `The file's spacing (${fileSpacing} m) differs from the spacing its line counts give (${Number(spacingAlongWidth.toFixed(3))} m); the line counts are used.`,
        );
      }
    }

    grid = {
      shape,
      length,
      width,
      spacing: num('spacing'),
      burialDepth: num('burialDepth'),
      rodCount,
      rodLength: num('rodLength'),
      meshCount: Math.round(num('meshCount')),
      generator,
    };
  }

  // ---- stored results, for comparing the web engine against Windows ----
  const legacyResults: Record<string, number> = {
    touchLimit50: num('touchLimit50'),
    stepLimit50: num('stepLimit50'),
    touchLimit70: num('touchLimit70'),
    stepLimit70: num('stepLimit70'),
  };
  for (const name of [
    'resultGridResistance',
    'resultGpr',
    'resultMeshVoltage',
    'resultStepVoltage',
  ]) {
    if (name in fields) legacyResults[name] = num(name);
  }

  const finiteChecks = [
    [
      'soil resistivity',
      soil.type === 'ONE_LAYER' ? soil.resistivity : soil.upperResistivity,
    ],
    ['fault current', num('faultCurrent')],
    ['shock duration', num('shockDuration')],
  ] as const;
  for (const [label, value] of finiteChecks) {
    if (!Number.isFinite(value) || value <= 0) {
      warnings.push(`The ${label} in the file is not a positive number.`);
    }
  }

  return {
    kind,
    recordCount,
    soil,
    surfaceLayer: {
      resistivity: num('surfaceLayerResistivity'),
      thickness: num('surfaceLayerThickness'),
    },
    fault: {
      faultCurrent: num('faultCurrent'),
      shockDuration: num('shockDuration'),
      faultDuration,
      splitFactor: designFile ? num('splitFactor') : null,
    },
    conductor: {
      name: designFile ? String(fields.conductorName) : null,
      allowableTemperature: designFile ? num('allowableTemperature') : null,
      crossSectionMm2: area,
      requiredAreaMm2: num('requiredConductorAreaMm2'),
      diameterM: diameterM === null ? null : Number(diameterM.toPrecision(7)),
    },
    grid,
    legacyResults,
    warnings,
  };
}
