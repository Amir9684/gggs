import { evaluateGroundingSafety } from '../safety-evaluation.engine';
import {
  generateRectangularGrid,
  lineCountsFromSpacing,
  type GridGeneratorParams,
} from '../grid-generator.engine';
import { extractGridGeometry } from '../grid-geometry.extractor';

/** Narrows a value the test depends on, failing with a readable message. */
function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what} to be present`);
  }
  return value;
}

const base = (
  over: Partial<GridGeneratorParams> = {},
): GridGeneratorParams => ({
  length: 70,
  width: 70,
  burialDepth: 0.5,
  conductorDiameter: 0.01,
  lineCounts: { alongLength: 11, alongWidth: 11 },
  rods: { arrangement: 'NONE', count: 0, length: 0 },
  ...over,
});

describe('generateRectangularGrid', () => {
  it('lays out one conductor per line in each direction', () => {
    const grid = generateRectangularGrid(
      base({ lineCounts: { alongLength: 4, alongWidth: 6 } }),
    );
    expect(grid.summary.conductorCount).toBe(10);
    expect(grid.summary.totalConductorLength).toBe(4 * 70 + 6 * 70);
    expect(grid.summary.spacingAlongLength).toBeCloseTo(70 / 3, 9);
    expect(grid.summary.spacingAlongWidth).toBeCloseTo(70 / 5, 9);
    expect(grid.elements).toHaveLength(10);
  });

  it('writes the same properties the grid editor writes', () => {
    const grid = generateRectangularGrid(
      base({ rods: { arrangement: 'CORNERS', count: 4, length: 3 } }),
    );
    const conductor = required(
      grid.elements.find((e) => e.type === 0),
      'a conductor',
    );
    const rod = required(
      grid.elements.find((e) => e.type === 1),
      'a rod',
    );

    const { crossSectionMm2, ...conductorRest } = conductor.properties;
    expect(conductorRest).toEqual({ material: 'COPPER_ANNEALED_SOFT_DRAWN' });
    expect(crossSectionMm2).toBeCloseTo(78.53982, 4);

    expect(rod.properties).toEqual({ lengthM: 3, diameterMm: 16 });
  });

  it('round-trips through the geometry extractor', () => {
    const grid = generateRectangularGrid(base());
    const geometry = extractGridGeometry(
      { length: 70, width: 70, burialDepth: 0.5 },
      grid.elements,
    );
    expect(geometry.conductorCountAlongLength).toBe(11);
    expect(geometry.conductorCountAlongWidth).toBe(11);
    expect(geometry.totalConductorLength).toBeCloseTo(1540, 9);
    expect(geometry.averageSpacing).toBeCloseTo(7, 9);
    expect(geometry.conductorDiameter).toBeCloseTo(0.01, 12);
    expect(geometry.rodCount).toBe(0);
  });

  describe('rods', () => {
    const geometryOf = (rods: GridGeneratorParams['rods']) =>
      extractGridGeometry(
        { length: 70, width: 70, burialDepth: 0.5 },
        generateRectangularGrid(base({ rods })).elements,
      );

    it('CORNERS places exactly four rods on the perimeter', () => {
      const g = geometryOf({ arrangement: 'CORNERS', count: 0, length: 3 });
      expect(g.rodCount).toBe(4);
      expect(g.totalRodLength).toBe(12);
      expect(g.hasPerimeterRods).toBe(true);
    });

    it('PERIMETER places the corners first, then spreads the rest', () => {
      const grid = generateRectangularGrid(
        base({ rods: { arrangement: 'PERIMETER', count: 8, length: 3 } }),
      );
      const rodPoints = grid.elements
        .filter((e) => e.type === 1)
        .flatMap((e) =>
          e.geometry.type === 'Point' ? [e.geometry.coordinates] : [],
        );
      expect(rodPoints).toHaveLength(8);
      expect(new Set(rodPoints.map((p) => p.join(','))).size).toBe(8);
      expect(rodPoints.slice(0, 4)).toEqual([
        [0, 0],
        [70, 0],
        [70, 70],
        [0, 70],
      ]);
      for (const [x, y] of rodPoints) {
        expect(x === 0 || x === 70 || y === 0 || y === 70).toBe(true);
      }
    });

    it('PERIMETER with fewer than four rods uses corners only', () => {
      expect(
        geometryOf({ arrangement: 'PERIMETER', count: 2, length: 3 }).rodCount,
      ).toBe(2);
    });

    it('INTERIOR keeps every rod away from the perimeter', () => {
      const g = geometryOf({ arrangement: 'INTERIOR', count: 4, length: 3 });
      expect(g.rodCount).toBe(4);
      expect(g.hasPerimeterRods).toBe(false);
    });

    it('rejects more rods than nodes available', () => {
      expect(() =>
        generateRectangularGrid(
          base({
            lineCounts: { alongLength: 3, alongWidth: 3 },
            rods: { arrangement: 'INTERIOR', count: 2, length: 3 },
          }),
        ),
      ).toThrow(/interior nodes/);
      expect(() =>
        generateRectangularGrid(
          base({
            lineCounts: { alongLength: 2, alongWidth: 2 },
            rods: { arrangement: 'PERIMETER', count: 5, length: 3 },
          }),
        ),
      ).toThrow(/perimeter nodes/);
    });

    it('rejects a non-positive rod length or count', () => {
      expect(() =>
        generateRectangularGrid(
          base({ rods: { arrangement: 'CORNERS', count: 4, length: 0 } }),
        ),
      ).toThrow(/Rod length/);
      expect(() =>
        generateRectangularGrid(
          base({ rods: { arrangement: 'PERIMETER', count: 0, length: 3 } }),
        ),
      ).toThrow(/rod count/);
    });
  });

  it('rejects invalid dimensions and line counts', () => {
    expect(() => generateRectangularGrid(base({ length: 0 }))).toThrow();
    expect(() =>
      generateRectangularGrid(base({ conductorDiameter: 0 })),
    ).toThrow();
    expect(() =>
      generateRectangularGrid(
        base({ lineCounts: { alongLength: 1, alongWidth: 5 } }),
      ),
    ).toThrow();
    expect(() =>
      generateRectangularGrid(
        base({ lineCounts: { alongLength: 2.5, alongWidth: 5 } }),
      ),
    ).toThrow();
    expect(() =>
      generateRectangularGrid(
        base({ lineCounts: { alongLength: 500, alongWidth: 5 } }),
      ),
    ).toThrow();
  });

  it('reproduces the Windows ieee2000.frm result for the 70 m x 70 m, 11 x 11 grid with 8 perimeter rods', () => {
    // Same grid as windows-parity.engine.spec.ts case "one layer, rods at
    // corners/perimeter": Em = 847.9199 V, Es = 599.1446 V.
    const grid = generateRectangularGrid(
      base({ rods: { arrangement: 'PERIMETER', count: 8, length: 3 } }),
    );
    const geometry = extractGridGeometry(
      { length: 70, width: 70, burialDepth: 0.5 },
      grid.elements,
    );
    const result = evaluateGroundingSafety({
      geometry,
      soil: { surfaceResistivity: 2500, apparentResistivity: 400 },
      fault: {
        faultCurrent: 3180,
        faultDuration: 0.5,
        splitFactor: 0.6,
        decrementFactor: 1.0,
        shockDuration: 0.5,
      },
      settings: {
        surfaceLayerResistivity: 2500,
        surfaceLayerThickness: 0.102,
        bodyWeight: 70,
        frequency: 60,
      },
    });
    expect(result.meshVoltage).toBeCloseTo(847.9199, 1);
    expect(result.stepVoltage).toBeCloseTo(599.1446, 1);
  });
});

describe('lineCountsFromSpacing', () => {
  it('turns a target spacing into whole line counts', () => {
    expect(lineCountsFromSpacing(70, 70, 7)).toEqual({
      alongLength: 11,
      alongWidth: 11,
    });
    expect(lineCountsFromSpacing(100, 50, 10)).toEqual({
      alongLength: 6,
      alongWidth: 11,
    });
  });

  it('never goes below two lines and rejects a bad spacing', () => {
    expect(lineCountsFromSpacing(10, 10, 100)).toEqual({
      alongLength: 2,
      alongWidth: 2,
    });
    expect(() => lineCountsFromSpacing(10, 10, 0)).toThrow();
  });
});
