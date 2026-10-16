import { evaluateGroundingSafety } from '../../calculations/engine/safety-evaluation.engine';
import { generateRectangularGrid } from '../../calculations/engine/grid-generator.engine';
import { extractGridGeometry } from '../../calculations/engine/grid-geometry.extractor';
import { LegacyImportError, parseGggsFile } from '../gggs-import';
import { GGGS_LAYOUTS, type GggsFileKind } from '../gggs-layouts';
import { LegacyImportService } from '../legacy-import.service';
import { RECORD_LENGTH } from '../vb-random-file.reader';

/**
 * Writes a file the way VB6 does: `Put #1, , x` on a file opened `For Random`
 * with the default 128-byte record — one record per variable, a Single as a
 * little-endian float32, a String as a 2-byte length plus its characters.
 *
 * These files are produced by this spec from the layout read off the VB
 * source; they are not files exported by the Windows app.
 */
function writeVbFile(
  kind: GggsFileKind,
  values: Record<string, number | string>,
  options: { trimLastRecord?: boolean } = {},
): Buffer {
  const layout = GGGS_LAYOUTS[kind];
  const records = layout.map((field) => {
    const record = Buffer.alloc(RECORD_LENGTH);
    const value = values[field.name] ?? (field.type === 'Single' ? 0 : '');
    if (field.type === 'Single') {
      record.writeFloatLE(Number(value), 0);
    } else {
      const text = String(value);
      record.writeUInt16LE(text.length, 0);
      record.write(text, 2, 'latin1');
    }
    return record;
  });
  const file = Buffer.concat(records);
  return options.trimLastRecord ? file.subarray(0, file.length - 100) : file;
}

const grounding = {
  soilResistivity: 400,
  surfaceLayerResistivity: 2500,
  surfaceLayerThickness: 0.102,
  faultCurrent: 3180,
  shockDuration: 0.5,
  requiredConductorAreaMm2: 40.5,
  conductorAreaMm2: 78.53982, // d = 10 mm
  touchLimit50: 622.7,
  stepLimit50: 2400.1,
  touchLimit70: 842.9,
  stepLimit70: 2913.4,
  faultDuration0008: 'False',
  faultDuration01: 'False',
  faultDuration025: 'False',
  faultDuration05: 'True',
  uiMaterialLabel: 'Copper, annealed soft-drawn',
  uiFrameVisible: 'True',
  uiLabel11: 'x',
  uiLabel5: 'y',
  uiFormHeight: 6000,
};

const design = {
  ...grounding,
  conductorName: 'Copper, annealed soft-drawn',
  allowableTemperature: 450,
  length: 70,
  width: 70,
  spacing: 7,
  burialDepth: 0.5,
  rodCount: 8,
  rodLength: 3,
  resultGridResistance: 2.6,
  resultGpr: 4961.5,
  resultMeshVoltage: 847.92,
  resultStepVoltage: 599.14,
  shapeSquare: 'True',
  shapeRectangular: 'False',
  shapeLShaped: 'False',
  rodsOption1: 'True',
  rodsOption2: 'False',
  splitFactor: 0.6,
  lShapeText1: 30,
  lShapeText2: 50,
  lShapeText3: 15,
  lShapeText4: 20,
  uiLabel20: 'Resistivity',
  lineCountLl: 11,
  lineCountLw: 11,
  meshCount: 100,
};

describe('parseGggsFile', () => {
  it('reads a grounding input file (20 records)', () => {
    const draft = parseGggsFile(writeVbFile('GROUNDING_INPUT', grounding));

    expect(draft.kind).toBe('GROUNDING_INPUT');
    expect(draft.recordCount).toBe(20);
    expect(draft.soil).toEqual({ type: 'ONE_LAYER', resistivity: 400 });
    expect(draft.surfaceLayer).toEqual({ resistivity: 2500, thickness: 0.102 });
    expect(draft.fault.faultCurrent).toBe(3180);
    expect(draft.fault.shockDuration).toBe(0.5);
    expect(draft.fault.faultDuration).toBe(0.5);
    expect(draft.fault.splitFactor).toBeNull();
    expect(draft.conductor.crossSectionMm2).toBeCloseTo(78.53982, 4);
    expect(draft.conductor.diameterM).toBeCloseTo(0.01, 6);
    expect(draft.grid).toBeNull();
    expect(draft.legacyResults.touchLimit70).toBe(842.9);
    expect(draft.warnings).toEqual([]);
  });

  it('reads an IEEE 80-2000 one-layer file (46 records) and rebuilds the grid', () => {
    const draft = parseGggsFile(writeVbFile('IEEE_80_2000', design));

    expect(draft.kind).toBe('IEEE_80_2000');
    expect(draft.recordCount).toBe(46);
    expect(draft.fault.splitFactor).toBe(0.6);
    expect(draft.conductor.name).toBe('Copper, annealed soft-drawn');
    expect(draft.conductor.allowableTemperature).toBe(450);
    expect(draft.grid?.shape).toBe('SQUARE');
    expect(draft.legacyResults.resultGridResistance).toBe(2.6);
    expect(draft.warnings).toEqual([]);
    expect(draft.grid?.generator).toEqual({
      length: 70,
      width: 70,
      burialDepth: 0.5,
      conductorDiameter: 0.01,
      alongLengthCount: 11,
      alongWidthCount: 11,
      rods: { arrangement: 'PERIMETER', count: 8, length: 3 },
    });
  });

  it('the imported grid reproduces the stored Windows Em / Es through the web engine', () => {
    const draft = parseGggsFile(writeVbFile('IEEE_80_2000', design));
    const payload = draft.grid!.generator!;

    const generated = generateRectangularGrid({
      length: payload.length,
      width: payload.width,
      burialDepth: payload.burialDepth,
      conductorDiameter: payload.conductorDiameter,
      lineCounts: {
        alongLength: payload.alongLengthCount,
        alongWidth: payload.alongWidthCount,
      },
      rods: payload.rods,
    });
    const geometry = extractGridGeometry(
      {
        length: payload.length,
        width: payload.width,
        burialDepth: payload.burialDepth,
      },
      generated.elements,
    );
    const result = evaluateGroundingSafety({
      geometry,
      soil: {
        surfaceResistivity: 2500,
        apparentResistivity:
          draft.soil.type === 'ONE_LAYER' ? draft.soil.resistivity : 0,
      },
      fault: {
        faultCurrent: draft.fault.faultCurrent,
        faultDuration: draft.fault.faultDuration!,
        splitFactor: draft.fault.splitFactor!,
        decrementFactor: 1.0,
        shockDuration: draft.fault.shockDuration,
      },
      settings: {
        surfaceLayerResistivity: draft.surfaceLayer.resistivity,
        surfaceLayerThickness: draft.surfaceLayer.thickness,
        bodyWeight: 70,
        frequency: 60,
      },
    });

    expect(result.meshVoltage).toBeCloseTo(
      draft.legacyResults.resultMeshVoltage,
      0,
    );
    expect(result.stepVoltage).toBeCloseTo(
      draft.legacyResults.resultStepVoltage,
      0,
    );
  });

  it('reads an IEEE 80-2000 two-layer file (47 records)', () => {
    const draft = parseGggsFile(
      writeVbFile('IEEE_80_2000_TWO_LAYER', {
        ...design,
        upperResistivity: 100,
        upperThickness: 2,
        lowerResistivity: 300,
      }),
    );

    expect(draft.kind).toBe('IEEE_80_2000_TWO_LAYER');
    expect(draft.recordCount).toBe(47);
    expect(draft.soil).toEqual({
      type: 'TWO_LAYER',
      upperResistivity: 100,
      upperThickness: 2,
      lowerResistivity: 300,
      mainFormResistivity: 400,
    });
    expect(draft.legacyResults.resultGridResistance).toBeUndefined();
  });

  it('swaps nll / nlw for a rectangular grid, as the Windows Lc formula does', () => {
    const draft = parseGggsFile(
      writeVbFile('IEEE_80_2000', {
        ...design,
        shapeSquare: 'False',
        shapeRectangular: 'True',
        length: 100,
        width: 50,
        spacing: 5,
        rodCount: 0,
        lineCountLl: 21, // lines spread along the 100 m length
        lineCountLw: 11, // lines spread along the 50 m width
      }),
    );

    expect(draft.grid?.shape).toBe('RECTANGULAR');
    expect(draft.grid?.generator).toMatchObject({
      length: 100,
      width: 50,
      alongLengthCount: 11,
      alongWidthCount: 21,
      rods: { arrangement: 'NONE', count: 0, length: 0 },
    });
    // Windows: Lc = nlw * L + nll * W = 11 * 100 + 21 * 50
    expect(
      generateRectangularGrid({
        length: 100,
        width: 50,
        burialDepth: 0.5,
        conductorDiameter: 0.01,
        lineCounts: { alongLength: 11, alongWidth: 21 },
        rods: { arrangement: 'NONE', count: 0, length: 0 },
      }).summary.totalConductorLength,
    ).toBe(2150);
    expect(draft.warnings).toEqual([]);
  });

  it('uses the length for the width of a square grid', () => {
    const draft = parseGggsFile(
      writeVbFile('IEEE_80_2000', { ...design, width: 0 }),
    );
    expect(draft.grid?.width).toBe(70);
    expect(draft.grid?.generator?.width).toBe(70);
  });

  it('maps rod option 2 to scattered interior rods', () => {
    const draft = parseGggsFile(
      writeVbFile('IEEE_80_2000', {
        ...design,
        rodCount: 4,
        rodsOption1: 'False',
        rodsOption2: 'True',
      }),
    );
    expect(draft.grid?.generator?.rods).toEqual({
      arrangement: 'INTERIOR',
      count: 4,
      length: 3,
    });
  });

  it('does not generate an L-shaped grid and says why', () => {
    const draft = parseGggsFile(
      writeVbFile('IEEE_80_2000', {
        ...design,
        shapeSquare: 'False',
        shapeLShaped: 'True',
      }),
    );
    expect(draft.grid?.shape).toBe('L_SHAPED');
    expect(draft.grid?.generator).toBeNull();
    expect(draft.warnings.join(' ')).toMatch(/L-shaped/);
  });

  it('warns about a missing fault duration and a spacing that does not match the counts', () => {
    const draft = parseGggsFile(
      writeVbFile('IEEE_80_2000', {
        ...design,
        faultDuration05: 'False',
        spacing: 10,
      }),
    );
    expect(draft.fault.faultDuration).toBeNull();
    expect(draft.warnings.join(' ')).toMatch(/fault duration/);
    expect(draft.warnings.join(' ')).toMatch(/spacing/);
  });

  it('accepts a last record shorter than 128 bytes', () => {
    const draft = parseGggsFile(
      writeVbFile('IEEE_80_2000', design, { trimLastRecord: true }),
    );
    expect(draft.recordCount).toBe(46);
    expect(draft.grid?.meshCount).toBe(100);
  });

  it('can be told the kind, and checks it against the record count', () => {
    const file = writeVbFile('IEEE_80_2000', design);
    expect(parseGggsFile(file, 'IEEE_80_2000').kind).toBe('IEEE_80_2000');
    expect(() => parseGggsFile(file, 'GROUNDING_INPUT')).toThrow(
      LegacyImportError,
    );
  });

  it('rejects an empty file, an unknown record count and a broken string', () => {
    expect(() => parseGggsFile(Buffer.alloc(0))).toThrow(LegacyImportError);
    expect(() => parseGggsFile(Buffer.alloc(30 * RECORD_LENGTH))).toThrow(
      /matches none/,
    );

    const broken = writeVbFile('GROUNDING_INPUT', grounding);
    broken.writeUInt16LE(500, 11 * RECORD_LENGTH); // string length > record
    expect(() => parseGggsFile(broken)).toThrow(/valid string/);
  });
});

describe('LegacyImportService.parse', () => {
  const service = new LegacyImportService();
  const base64 = (buffer: Buffer) => buffer.toString('base64');

  it('answers 200 with the draft', async () => {
    const res = await service.parse({
      contentBase64: base64(writeVbFile('IEEE_80_2000', design)),
      kind: 'AUTO',
    });
    expect(res.statusCode).toBe(200);
    expect(res.data?.kind).toBe('IEEE_80_2000');
  });

  it('answers 400 for a file it cannot read', async () => {
    const res = await service.parse({
      contentBase64: base64(Buffer.alloc(30 * RECORD_LENGTH)),
      kind: 'AUTO',
    });
    expect(res.statusCode).toBe(400);
    expect(res.data).toBeNull();
  });
});
