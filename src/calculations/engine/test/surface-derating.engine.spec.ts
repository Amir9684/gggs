import { computeSurfaceDeratingFactor } from '../surface-derating.engine';

describe('computeSurfaceDeratingFactor', () => {
  it('returns Cs = 1 when there is no surface layer (thickness = 0)', () => {
    const { cs } = computeSurfaceDeratingFactor(100, 3000, 0);
    expect(cs).toBe(1);
  });

  it('returns Cs = 1 when surface resistivity equals apparent resistivity', () => {
    const { cs } = computeSurfaceDeratingFactor(100, 100, 0.1);
    expect(cs).toBe(1);
  });

  it('matches the hand-computed formula for a typical crushed-rock case', () => {
    const rho = 100;
    const rhos = 3000;
    const hs = 0.1;

    const { cs } = computeSurfaceDeratingFactor(rho, rhos, hs);

    const expected = 1 - (0.09 * (1 - rho / rhos)) / (2 * hs + 0.09);
    expect(cs).toBeCloseTo(expected, 9);
    // Cs should be well below 1 (a crushed rock layer meaningfully derates
    // the lethal current available at the body) but still positive.
    expect(cs).toBeGreaterThan(0);
    expect(cs).toBeLessThan(1);
  });

  it('Cs increases toward 1 (less derating) as surface layer thickness increases, when rhos > rho', () => {
    // As hs -> 0, Cs -> rho/rhos (the thin layer barely differs from bare
    // earth, so the touch-voltage formula gets little credit for it). As
    // hs -> infinity, Cs -> 1 (thick enough that a person's feet only
    // "see" the surface material, so the formula gives full credit for
    // rhos). So for rhos > rho, Cs *rises* monotonically toward 1 as the
    // layer gets thicker — the opposite of what a smaller test tolerance
    // might suggest from the word "derating" alone.
    const rho = 100;
    const rhos = 3000;
    const thin = computeSurfaceDeratingFactor(rho, rhos, 0.05);
    const thick = computeSurfaceDeratingFactor(rho, rhos, 0.3);

    expect(thick.cs).toBeGreaterThan(thin.cs);
  });

  it('throws for negative thickness', () => {
    expect(() => computeSurfaceDeratingFactor(100, 3000, -0.1)).toThrow();
  });
});
