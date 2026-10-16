import {
  extractGridGeometry,
  GridElementLike,
} from '../grid-geometry.extractor';

const GRID_ELEMENT_TYPE = { CONDUCTOR: 0, ROD: 1 } as const;

function conductor(
  coordinates: [number, number][],
  diameter?: number,
): GridElementLike {
  return {
    type: GRID_ELEMENT_TYPE.CONDUCTOR,
    geometry: { type: 'LineString', coordinates },
    properties: diameter ? { diameter } : {},
  };
}

function rod(coordinates: [number, number], length?: number): GridElementLike {
  return {
    type: GRID_ELEMENT_TYPE.ROD,
    geometry: { type: 'Point', coordinates },
    properties: length ? { length } : {},
  };
}

describe('extractGridGeometry', () => {
  const grid = { length: 60, width: 40, burialDepth: 0.5 };

  it('sums total conductor length across all CONDUCTOR elements', () => {
    const elements: GridElementLike[] = [
      conductor([
        [0, 0],
        [60, 0],
      ]), // 60m, along length axis
      conductor([
        [0, 20],
        [60, 20],
      ]), // 60m, along length axis
      conductor([
        [0, 0],
        [0, 40],
      ]), // 40m, along width axis
    ];

    const summary = extractGridGeometry(grid, elements);
    expect(summary.totalConductorLength).toBeCloseTo(160, 6);
  });

  it('classifies conductors by axis based on direction angle', () => {
    const elements: GridElementLike[] = [
      conductor([
        [0, 0],
        [60, 0],
      ]), // along length (x)
      conductor([
        [0, 20],
        [60, 20],
      ]), // along length (x)
      conductor([
        [0, 0],
        [0, 40],
      ]), // along width (y)
      conductor([
        [30, 0],
        [30, 40],
      ]), // along width (y)
    ];

    const summary = extractGridGeometry(grid, elements);
    expect(summary.conductorCountAlongLength).toBe(2);
    expect(summary.conductorCountAlongWidth).toBe(2);
  });

  it('does not classify diagonal conductors into either axis count, but still counts their length', () => {
    const elements: GridElementLike[] = [
      conductor([
        [0, 0],
        [60, 40],
      ]), // diagonal brace
    ];

    const summary = extractGridGeometry(grid, elements);
    expect(summary.conductorCountAlongLength).toBe(0);
    expect(summary.conductorCountAlongWidth).toBe(0);
    expect(summary.totalConductorLength).toBeGreaterThan(0);
  });

  it('averages explicit per-element diameters', () => {
    const elements: GridElementLike[] = [
      conductor(
        [
          [0, 0],
          [60, 0],
        ],
        0.008,
      ),
      conductor(
        [
          [0, 20],
          [60, 20],
        ],
        0.012,
      ),
    ];

    const summary = extractGridGeometry(grid, elements);
    expect(summary.conductorDiameter).toBeCloseTo(0.01, 6);
  });

  it('falls back to a default diameter when no element specifies one', () => {
    const elements: GridElementLike[] = [
      conductor([
        [0, 0],
        [60, 0],
      ]),
    ];
    const summary = extractGridGeometry(grid, elements);
    expect(summary.conductorDiameter).toBeGreaterThan(0);
  });

  it('counts rods and sums their length', () => {
    const elements: GridElementLike[] = [rod([5, 5], 3), rod([55, 35], 3)];

    const summary = extractGridGeometry(grid, elements);
    expect(summary.rodCount).toBe(2);
    expect(summary.totalRodLength).toBeCloseTo(6, 6);
  });

  it('detects perimeter rods near the grid edge', () => {
    const elements: GridElementLike[] = [rod([1, 1], 3)]; // near corner (0,0)
    const summary = extractGridGeometry(grid, elements);
    expect(summary.hasPerimeterRods).toBe(true);
  });

  it('does not flag interior rods as perimeter rods', () => {
    const elements: GridElementLike[] = [rod([30, 20], 3)]; // grid center
    const summary = extractGridGeometry(grid, elements);
    expect(summary.hasPerimeterRods).toBe(false);
  });

  it('computes average spacing from distinct parallel conductor offsets', () => {
    const elements: GridElementLike[] = [
      conductor([
        [0, 0],
        [60, 0],
      ]),
      conductor([
        [0, 10],
        [60, 10],
      ]),
      conductor([
        [0, 20],
        [60, 20],
      ]),
    ];

    const summary = extractGridGeometry(grid, elements);
    // offsets at y=0,10,20 -> gaps of 10,10 -> average 10
    expect(summary.averageSpacing).toBeCloseTo(10, 6);
  });

  it('falls back to a rough estimate when no conductors are axis-classified', () => {
    const summary = extractGridGeometry(grid, []);
    expect(summary.averageSpacing).toBeGreaterThan(0);
  });

  it('carries through the grid dimensions unchanged', () => {
    const summary = extractGridGeometry(grid, []);
    expect(summary.length).toBe(60);
    expect(summary.width).toBe(40);
    expect(summary.burialDepth).toBe(0.5);
    expect(summary.area).toBe(2400);
  });

  describe('properties written by the grid editor', () => {
    const editorConductor = (
      properties: Record<string, unknown>,
    ): GridElementLike => ({
      type: GRID_ELEMENT_TYPE.CONDUCTOR,
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [60, 0],
        ],
      },
      properties,
    });

    it('reads the rod length from `lengthM`', () => {
      const elements: GridElementLike[] = [
        {
          type: GRID_ELEMENT_TYPE.ROD,
          geometry: { type: 'Point', coordinates: [5, 5] },
          properties: { lengthM: 3, diameterMm: 16 },
        },
        {
          type: GRID_ELEMENT_TYPE.ROD,
          geometry: { type: 'Point', coordinates: [55, 35] },
          properties: { lengthM: 2.5 },
        },
      ];

      const summary = extractGridGeometry(grid, elements);
      expect(summary.totalRodLength).toBeCloseTo(5.5, 6);
    });

    it('prefers `length` over `lengthM` when both are present', () => {
      const summary = extractGridGeometry(grid, [
        {
          type: GRID_ELEMENT_TYPE.ROD,
          geometry: { type: 'Point', coordinates: [5, 5] },
          properties: { length: 4, lengthM: 3 },
        },
      ]);
      expect(summary.totalRodLength).toBeCloseTo(4, 6);
    });

    it('derives the conductor diameter from the cross-section like Windows', () => {
      // dia = 0.002 * sqrt(A / pi): 70 mm2 -> 9.441 mm
      const summary = extractGridGeometry(grid, [
        editorConductor({ crossSectionMm2: 70 }),
      ]);
      expect(summary.conductorDiameter).toBeCloseTo(0.009441, 6);
    });

    it('uses `diameterMm` before the cross-section, and `diameter` before both', () => {
      expect(
        extractGridGeometry(grid, [
          editorConductor({ diameterMm: 12, crossSectionMm2: 70 }),
        ]).conductorDiameter,
      ).toBeCloseTo(0.012, 6);

      expect(
        extractGridGeometry(grid, [
          editorConductor({ diameter: 0.02, diameterMm: 12 }),
        ]).conductorDiameter,
      ).toBeCloseTo(0.02, 6);
    });

    it('ignores non-positive or non-numeric values', () => {
      const summary = extractGridGeometry(grid, [
        {
          type: GRID_ELEMENT_TYPE.ROD,
          geometry: { type: 'Point', coordinates: [5, 5] },
          properties: { lengthM: -3 },
        },
        editorConductor({ crossSectionMm2: 'abc', diameterMm: 0 }),
      ]);
      expect(summary.totalRodLength).toBe(0);
      expect(summary.conductorDiameter).toBeCloseTo(0.01, 6);
    });
  });
});
