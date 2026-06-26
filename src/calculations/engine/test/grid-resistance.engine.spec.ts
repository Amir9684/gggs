import { computeGridResistance } from '../grid-resistance.engine';
import type { GridGeometrySummary } from '../types';

function baseGeometry(
  overrides: Partial<GridGeometrySummary> = {},
): GridGeometrySummary {
  return {
    area: 4900, // 70m x 70m
    length: 70,
    width: 70,
    burialDepth: 0.5,
    totalConductorLength: 600,
    conductorDiameter: 0.0102, // ~2/0 AWG bare copper
    conductorCountAlongLength: 8,
    conductorCountAlongWidth: 8,
    averageSpacing: 10,
    rodCount: 0,
    totalRodLength: 0,
    hasPerimeterRods: false,
    ...overrides,
  };
}

describe('computeGridResistance', () => {
  it('matches a hand-computed value for a known geometry (Sverak Eq. 52)', () => {
    // ρ = 400 Ω·m, A = 4900 m², LT = 600 m, h = 0.5 m
    const rho = 400;
    const geometry = baseGeometry();

    const { gridResistance } = computeGridResistance(rho, geometry);

    // Hand-derived expected value from the same formula, computed
    // independently here (not copy-pasted from the engine) so the test
    // catches a transcription error in either place:
    //   term1 = 1/600
    //   term2 = (1/sqrt(20*4900)) * (1 + 1/(1 + 0.5*sqrt(20/4900)))
    const term1 = 1 / 600;
    const term2 =
      (1 / Math.sqrt(20 * 4900)) * (1 + 1 / (1 + 0.5 * Math.sqrt(20 / 4900)));
    const expected = rho * (term1 + term2);

    expect(gridResistance).toBeCloseTo(expected, 9);
    // Sanity range check: for this class of grid (large area, moderate
    // resistivity) Rg should land in the single-digit-to-low-double-digit
    // ohm range, not e.g. 0.01 Ω or 10,000 Ω.
    expect(gridResistance).toBeGreaterThan(1);
    expect(gridResistance).toBeLessThan(50);
  });

  it('decreases as total buried conductor length increases (more conductor → lower resistance)', () => {
    const rho = 400;
    const shortGrid = computeGridResistance(
      rho,
      baseGeometry({ totalConductorLength: 300 }),
    );
    const longGrid = computeGridResistance(
      rho,
      baseGeometry({ totalConductorLength: 1200 }),
    );

    expect(longGrid.gridResistance).toBeLessThan(shortGrid.gridResistance);
  });

  it('decreases as grid area increases (larger footprint → lower resistance)', () => {
    const rho = 400;
    const small = computeGridResistance(
      rho,
      baseGeometry({ area: 900, length: 30, width: 30 }),
    );
    const large = computeGridResistance(
      rho,
      baseGeometry({ area: 8100, length: 90, width: 90 }),
    );

    expect(large.gridResistance).toBeLessThan(small.gridResistance);
  });

  it('scales linearly with apparent resistivity', () => {
    const geometry = baseGeometry();
    const at100 = computeGridResistance(100, geometry);
    const at400 = computeGridResistance(400, geometry);

    expect(at400.gridResistance).toBeCloseTo(at100.gridResistance * 4, 9);
  });

  it('adding rod length (via totalRodLength) lowers resistance, same as adding conductor', () => {
    const rho = 400;
    const noRods = computeGridResistance(
      rho,
      baseGeometry({ totalRodLength: 0 }),
    );
    const withRods = computeGridResistance(
      rho,
      baseGeometry({ totalRodLength: 200 }),
    );

    expect(withRods.gridResistance).toBeLessThan(noRods.gridResistance);
  });

  it('throws for non-positive resistivity', () => {
    expect(() => computeGridResistance(0, baseGeometry())).toThrow();
    expect(() => computeGridResistance(-10, baseGeometry())).toThrow();
  });

  it('throws for non-positive area', () => {
    expect(() =>
      computeGridResistance(400, baseGeometry({ area: 0 })),
    ).toThrow();
  });

  it('throws when there is no buried conductor or rod length', () => {
    expect(() =>
      computeGridResistance(
        400,
        baseGeometry({ totalConductorLength: 0, totalRodLength: 0 }),
      ),
    ).toThrow();
  });
});
