import {
  computeSurfacePotential,
  solveGalerkin,
  type GalerkinInput,
  type HorizontalSegment,
} from '../galerkin.engine';
import { computeSurgeImpedance, meshFactor } from '../surge-impedance.engine';
import { solveRealSystem } from '../real-linear-system';
import { fx } from '../galerkin-kernels';

/** A size x size grid with `lines` conductors each way, cut into segments of about `segmentLength`. */
function squareGrid(
  size: number,
  lines: number,
  segmentLength: number,
  depth: number,
): HorizontalSegment[] {
  const segments: HorizontalSegment[] = [];
  const pieces = Math.max(1, Math.round(size / segmentLength));
  const step = size / pieces;
  const spacing = size / (lines - 1);

  for (let line = 0; line < lines; line += 1) {
    for (let piece = 0; piece < pieces; piece += 1) {
      const along = piece * step;
      segments.push({
        x1: along,
        y1: line * spacing,
        x2: along + step,
        y2: line * spacing,
        depth,
      });
      segments.push({
        x1: line * spacing,
        y1: along,
        x2: line * spacing,
        y2: along + step,
        depth,
      });
    }
  }
  return segments;
}

function gridInput(overrides: Partial<GalerkinInput> = {}): GalerkinInput {
  return {
    soilResistivity: 400,
    conductorRadius: 0.005,
    groundCurrent: 1000,
    horizontalSegments: squareGrid(70, 11, 7, 0.5),
    ...overrides,
  };
}

/** IEEE 80 simplified (Sverak) grid resistance for the same grid, as a yardstick. */
function sverakResistance(
  rho: number,
  length: number,
  area: number,
  depth: number,
): number {
  return (
    rho *
    (1 / length +
      (1 / Math.sqrt(20 * area)) * (1 + 1 / (1 + depth * Math.sqrt(20 / area))))
  );
}

describe('fx', () => {
  it('is even and matches x·asinh(x) − sqrt(1 + x²)', () => {
    expect(fx(2)).toBeCloseTo(fx(-2), 12);
    expect(fx(0)).toBeCloseTo(-1, 12);
    expect(fx(3)).toBeCloseTo(
      3 * Math.log(3 + Math.sqrt(10)) - Math.sqrt(10),
      12,
    );
  });
});

describe('solveRealSystem', () => {
  it('solves a small system', () => {
    const x = solveRealSystem(
      [
        [2, 1],
        [1, 3],
      ],
      [3, 5],
    );
    expect(x[0]).toBeCloseTo(0.8, 12);
    expect(x[1]).toBeCloseTo(1.4, 12);
  });

  it('rejects a singular matrix', () => {
    expect(() =>
      solveRealSystem(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 1],
      ),
    ).toThrow();
  });
});

describe('solveGalerkin', () => {
  it('gives a grid resistance close to the IEEE 80 simplified value', () => {
    const { gridResistance } = solveGalerkin(gridInput());
    const reference = sverakResistance(400, 1540, 70 * 70, 0.5);

    expect(gridResistance).toBeGreaterThan(reference * 0.9);
    expect(gridResistance).toBeLessThan(reference * 1.1);
  });

  it('keeps the injected current: the element currents add up to IG', () => {
    const solution = solveGalerkin(gridInput());
    const total = solution.currents.reduce((sum, value) => sum + value, 0);

    expect(total).toBeCloseTo(1000, 6);
    expect(solution.gpr).toBeCloseTo(solution.gridResistance * 1000, 8);
  });

  it('scales linearly with resistivity and not with the current', () => {
    const base = solveGalerkin(gridInput());
    const doubledSoil = solveGalerkin(gridInput({ soilResistivity: 800 }));
    const doubledCurrent = solveGalerkin(gridInput({ groundCurrent: 2000 }));

    expect(doubledSoil.gridResistance).toBeCloseTo(2 * base.gridResistance, 8);
    expect(doubledCurrent.gridResistance).toBeCloseTo(base.gridResistance, 10);
    expect(doubledCurrent.gpr).toBeCloseTo(2 * base.gpr, 6);
  });

  it('barely depends on how finely the conductors are cut', () => {
    const coarse = solveGalerkin(
      gridInput({ horizontalSegments: squareGrid(70, 6, 14, 0.5) }),
    );
    const fine = solveGalerkin(
      gridInput({ horizontalSegments: squareGrid(70, 6, 7, 0.5) }),
    );

    expect(
      Math.abs(coarse.gridResistance - fine.gridResistance) /
        fine.gridResistance,
    ).toBeLessThan(0.03);
  });

  it('is lower for a denser grid and for a grid with rods', () => {
    const sparse = solveGalerkin(
      gridInput({ horizontalSegments: squareGrid(70, 6, 7, 0.5) }),
    );
    const dense = solveGalerkin(
      gridInput({ horizontalSegments: squareGrid(70, 11, 7, 0.5) }),
    );
    expect(dense.gridResistance).toBeLessThan(sparse.gridResistance);

    const withRods = solveGalerkin(
      gridInput({
        rods: {
          positions: [
            { x: 0, y: 0 },
            { x: 70, y: 0 },
            { x: 0, y: 70 },
            { x: 70, y: 70 },
          ],
          length: 3,
          radius: 0.01,
        },
      }),
    );
    expect(withRods.gridResistance).toBeLessThan(dense.gridResistance);
    expect(withRods.counts).toEqual({
      horizontal: dense.counts.horizontal,
      rods: 4,
      wells: 0,
    });
    expect(withRods.currents.reduce((s, v) => s + v, 0)).toBeCloseTo(1000, 6);
  });

  it('puts more current into the perimeter than into the interior', () => {
    const solution = solveGalerkin(gridInput());
    // Segment 0 lies on the y = 0 edge, a central X segment on the y = 35 line.
    const perimeter = solution.currents[0];
    const interiorIndex = solution.input.horizontalSegments.findIndex(
      (segment) => segment.y1 === 35 && segment.y2 === 35 && segment.x1 === 28,
    );

    expect(interiorIndex).toBeGreaterThan(0);
    expect(perimeter).toBeGreaterThan(solution.currents[interiorIndex]);
  });

  it('handles wells together with rods', () => {
    const solution = solveGalerkin(
      gridInput({
        rods: { positions: [{ x: 0, y: 0 }], length: 3, radius: 0.01 },
        wells: {
          positions: [{ x: 70, y: 70 }],
          length: 5,
          diameter: 0.3,
          kro: 1,
        },
      }),
    );
    expect(solution.counts.wells).toBe(1);
    expect(solution.currents.reduce((s, v) => s + v, 0)).toBeCloseTo(1000, 6);
    expect(solution.gridResistance).toBeGreaterThan(0);
  });

  it('supports a second burial depth for part of the grid', () => {
    const shallow = squareGrid(70, 6, 7, 0.5);
    const mixed = shallow.map((segment, index) =>
      index % 2 === 0 ? segment : { ...segment, depth: 1.5 },
    );
    const solution = solveGalerkin(gridInput({ horizontalSegments: mixed }));

    expect(solution.gridResistance).toBeGreaterThan(0);
    expect(solution.currents.reduce((s, v) => s + v, 0)).toBeCloseTo(1000, 6);
  });

  it.each([
    [
      'a diagonal segment',
      { horizontalSegments: [{ x1: 0, y1: 0, x2: 5, y2: 5, depth: 0.5 }] },
    ],
    ['no segments', { horizontalSegments: [] }],
    ['a zero resistivity', { soilResistivity: 0 }],
    ['a zero current', { groundCurrent: 0 }],
    [
      'a segment shorter than the conductor diameter',
      { horizontalSegments: [{ x1: 0, y1: 0, x2: 0.005, y2: 0, depth: 0.5 }] },
    ],
    [
      'a segment above ground',
      { horizontalSegments: [{ x1: 0, y1: 0, x2: 5, y2: 0, depth: 0 }] },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(() => solveGalerkin(gridInput(overrides))).toThrow();
  });

  it('rejects two rods at the same place and wells without rods', () => {
    expect(() =>
      solveGalerkin(
        gridInput({
          rods: {
            positions: [
              { x: 0, y: 0 },
              { x: 0, y: 0 },
            ],
            length: 3,
            radius: 0.01,
          },
        }),
      ),
    ).toThrow();
    expect(() =>
      solveGalerkin(
        gridInput({
          wells: {
            positions: [{ x: 0, y: 0 }],
            length: 5,
            diameter: 0.3,
            kro: 1,
          },
        }),
      ),
    ).toThrow();
  });
});

describe('computeSurfacePotential', () => {
  const solution = solveGalerkin(gridInput());

  it('falls off like rho·IG / (2·pi·r) far from the grid', () => {
    const distance = 5000;
    const potential = computeSurfacePotential(solution, 35 + distance, 35);
    const point = (400 * 1000) / (2 * Math.PI * distance);

    expect(potential / point).toBeGreaterThan(0.98);
    expect(potential / point).toBeLessThan(1.02);
  });

  it('stays below the GPR inside the grid and above zero outside', () => {
    const center = computeSurfacePotential(solution, 35, 35);
    const overConductor = computeSurfacePotential(solution, 35, 0);
    const outside = computeSurfacePotential(solution, 90, 35);

    expect(center).toBeGreaterThan(0);
    expect(center).toBeLessThan(solution.gpr);
    expect(overConductor).toBeGreaterThan(0.6 * solution.gpr);
    expect(overConductor).toBeLessThan(solution.gpr);
    expect(outside).toBeLessThan(center);
  });

  it('is symmetric for a symmetric grid', () => {
    const a = computeSurfacePotential(solution, 10, 20);
    const b = computeSurfacePotential(solution, 60, 20);
    const c = computeSurfacePotential(solution, 20, 10);

    // The quadrature treats each segment pair in order (as the Windows
    // code does), so symmetry holds to a few parts per million, not exactly.
    expect(Math.abs(a - b) / a).toBeLessThan(1e-4);
    expect(Math.abs(a - c) / a).toBeLessThan(1e-4);
  });

  it('includes the rod contribution', () => {
    const withRod = solveGalerkin(
      gridInput({
        rods: { positions: [{ x: 35, y: 35 }], length: 3, radius: 0.01 },
      }),
    );
    const onTop = computeSurfacePotential(withRod, 35, 35);

    expect(Number.isFinite(onTop)).toBe(true);
    expect(onTop).toBeGreaterThan(0);
    expect(onTop).toBeLessThan(withRod.gpr);
  });
});

describe('surge impedance', () => {
  it('uses the tabulated mesh factors', () => {
    expect(meshFactor(4)).toBeCloseTo(2.04, 10);
    expect(meshFactor(16)).toBeCloseTo(3.75, 10);
    expect(meshFactor(36)).toBeCloseTo(5.28, 10);
    expect(meshFactor(64)).toBeCloseTo(7.15, 10);
    expect(meshFactor(10)).toBeCloseTo(3.75 - (1.71 / 12) * 6, 10);
  });

  it('exceeds the grid resistance because of the inductance', () => {
    const z = computeSurgeImpedance({
      gridResistance: 2.7,
      soilResistivity: 400,
      meshCount: 36,
      meanSegmentLength: 7,
      conductorRadius: 0.005,
    });

    expect(z).toBeGreaterThan(2.7);
  });

  it('rejects mesh counts outside 4 to 64', () => {
    const base = {
      gridResistance: 2.7,
      soilResistivity: 400,
      meanSegmentLength: 7,
      conductorRadius: 0.005,
    };
    expect(() => computeSurgeImpedance({ ...base, meshCount: 3 })).toThrow();
    expect(() => computeSurgeImpedance({ ...base, meshCount: 65 })).toThrow();
  });
});
