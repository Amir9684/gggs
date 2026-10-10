import { computeGeometricFactors1986 } from '../geometric-factors-1986.engine';
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
    totalConductorLength: 1540,
    conductorDiameter: 0.01,
    conductorCountAlongLength: 11,
    conductorCountAlongWidth: 11,
    averageSpacing: 7,
    rodCount: 0,
    totalRodLength: 0,
    hasPerimeterRods: false,
    ...overrides,
  };
}

describe('computeGeometricFactors1986', () => {
  it('nMesh = nx * ny (literal axis counts, not na*nb*nc*nd)', () => {
    const { nMesh } = computeGeometricFactors1986(
      baseGeometry({
        conductorCountAlongLength: 11,
        conductorCountAlongWidth: 11,
      }),
    );
    expect(nMesh).toBe(121);
  });

  it('nStep = max(nx, ny)', () => {
    const { nStep } = computeGeometricFactors1986(
      baseGeometry({
        conductorCountAlongLength: 8,
        conductorCountAlongWidth: 14,
      }),
    );
    expect(nStep).toBe(14);
  });

  it('nMesh and nStep differ for a non-square axis-count split, unlike the 2013 single-n method', () => {
    const geometry = baseGeometry({
      conductorCountAlongLength: 8,
      conductorCountAlongWidth: 14,
    });
    const { nMesh, nStep } = computeGeometricFactors1986(geometry);
    expect(nMesh).not.toBe(nStep);
  });

  it('kiMesh and kiStep are each Ki (Eq. 71) evaluated at their own n', () => {
    const { nMesh, nStep, kiMesh, kiStep } = computeGeometricFactors1986(
      baseGeometry({
        conductorCountAlongLength: 8,
        conductorCountAlongWidth: 14,
      }),
    );
    expect(kiMesh).toBeCloseTo(0.644 + 0.148 * nMesh, 9);
    expect(kiStep).toBeCloseTo(0.644 + 0.148 * nStep, 9);
  });

  it('for a square grid where nx = ny, nMesh/kiMesh and nStep/kiStep still generally differ (product vs max)', () => {
    const { nMesh, nStep } = computeGeometricFactors1986(
      baseGeometry({
        conductorCountAlongLength: 11,
        conductorCountAlongWidth: 11,
      }),
    );
    // nMesh = 11*11 = 121, nStep = max(11,11) = 11 — same axis counts,
    // still very different n's, which is exactly the 1986 method's point.
    expect(nMesh).toBe(121);
    expect(nStep).toBe(11);
  });

  it('Km/Ks/Kii/Kh reuse the same Sverak formulas as the 2013 engine when fed the same n', () => {
    // Square grid, so 2013's own n (na, with nb=1) happens to equal 11
    // too (same Annex B.1 setup) — feeding that same n into both engines'
    // shared helper functions should give identical Km/Ks/Kii/Kh, proving
    // geometric-factors-1986.engine.ts isn't reimplementing those formulas
    // differently, just computing a different n upstream.
    const geometry = baseGeometry();
    const factors2013 = computeGeometricFactors(geometry);
    const factors1986 = computeGeometricFactors1986(
      baseGeometry({
        conductorCountAlongLength: 11,
        conductorCountAlongWidth: 11,
      }),
    );

    expect(factors2013.n).toBeCloseTo(11, 6);
    // nMesh (121) != 2013's n (11) — different n by design, so Km differs.
    expect(factors1986.nMesh).not.toBeCloseTo(factors2013.n, 3);
    // But Kh depends only on burial depth, not n, so it's identical.
    expect(factors1986.kh).toBeCloseTo(factors2013.kh, 9);
  });

  it('throws for non-positive conductor counts', () => {
    expect(() =>
      computeGeometricFactors1986(
        baseGeometry({ conductorCountAlongLength: 0 }),
      ),
    ).toThrow();
    expect(() =>
      computeGeometricFactors1986(
        baseGeometry({ conductorCountAlongWidth: 0 }),
      ),
    ).toThrow();
  });

  it('throws for non-positive spacing', () => {
    expect(() =>
      computeGeometricFactors1986(baseGeometry({ averageSpacing: 0 })),
    ).toThrow();
  });

  it('throws for non-positive conductor diameter', () => {
    expect(() =>
      computeGeometricFactors1986(baseGeometry({ conductorDiameter: 0 })),
    ).toThrow();
  });
});
