import { computeGeometricFactors } from '../geometric-factors.engine';
import type { GridGeometrySummary } from '../types';

function baseGeometry(
  overrides: Partial<GridGeometrySummary> = {},
): GridGeometrySummary {
  return {
    area: 4900,
    length: 70,
    width: 70,
    burialDepth: 0.5,
    totalConductorLength: 600,
    conductorDiameter: 0.0102,
    conductorCountAlongLength: 8,
    conductorCountAlongWidth: 8,
    averageSpacing: 10,
    rodCount: 0,
    totalRodLength: 0,
    hasPerimeterRods: false,
    ...overrides,
  };
}

describe('computeGeometricFactors', () => {
  it('computes n as the product of axis conductor counts (na*nb*nc*nd, nc=nd=1)', () => {
    const { n } = computeGeometricFactors(
      baseGeometry({
        conductorCountAlongLength: 8,
        conductorCountAlongWidth: 6,
      }),
    );
    expect(n).toBe(6 * 8); // na=width-count, nb=length-count, nc=nd=1
  });

  it('Ki increases with n (Eq. 71: Ki = 0.644 + 0.148n)', () => {
    const small = computeGeometricFactors(
      baseGeometry({
        conductorCountAlongLength: 2,
        conductorCountAlongWidth: 2,
      }),
    );
    const large = computeGeometricFactors(
      baseGeometry({
        conductorCountAlongLength: 10,
        conductorCountAlongWidth: 10,
      }),
    );

    expect(large.ki).toBeGreaterThan(small.ki);
    expect(small.ki).toBeCloseTo(0.644 + 0.148 * small.n, 9);
  });

  it('Kii = 1 when the grid has perimeter/distributed ground rods', () => {
    const { kii } = computeGeometricFactors(
      baseGeometry({ rodCount: 12, hasPerimeterRods: true }),
    );
    expect(kii).toBe(1);
  });

  it('Kii < 1 when the grid has no ground rods', () => {
    const { kii } = computeGeometricFactors(
      baseGeometry({ rodCount: 0, hasPerimeterRods: false }),
    );
    expect(kii).toBeLessThan(1);
  });

  it('Kh increases with burial depth (Eq. 64: Kh = sqrt(1 + h/h0))', () => {
    const shallow = computeGeometricFactors(baseGeometry({ burialDepth: 0.3 }));
    const deep = computeGeometricFactors(baseGeometry({ burialDepth: 1.5 }));

    expect(deep.kh).toBeGreaterThan(shallow.kh);
    expect(shallow.kh).toBeCloseTo(Math.sqrt(1 + 0.3 / 1), 9);
  });

  it('Km decreases as conductor spacing increases (wider mesh -> lower mesh voltage factor)', () => {
    const tight = computeGeometricFactors(baseGeometry({ averageSpacing: 5 }));
    const wide = computeGeometricFactors(baseGeometry({ averageSpacing: 20 }));

    expect(wide.km).toBeLessThan(tight.km);
  });

  it('Ks decreases as conductor spacing increases', () => {
    const tight = computeGeometricFactors(baseGeometry({ averageSpacing: 5 }));
    const wide = computeGeometricFactors(baseGeometry({ averageSpacing: 20 }));

    expect(wide.ks).toBeLessThan(tight.ks);
  });

  it('throws for non-positive spacing', () => {
    expect(() =>
      computeGeometricFactors(baseGeometry({ averageSpacing: 0 })),
    ).toThrow();
  });

  it('throws for non-positive conductor diameter', () => {
    expect(() =>
      computeGeometricFactors(baseGeometry({ conductorDiameter: 0 })),
    ).toThrow();
  });
});
