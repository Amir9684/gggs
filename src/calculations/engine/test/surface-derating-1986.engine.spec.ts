import { computeSurfaceDeratingFactor1986 } from '../surface-derating-1986.engine';
import { computeSurfaceDeratingFactor } from '../surface-derating.engine';

// Reference values: line-by-line transcription of `calculatevoltages`
// (Groundin.bas) evaluated outside this code base.
describe('computeSurfaceDeratingFactor1986', () => {
  it('matches the series for rho = 400, rhos = 2500, hs = 0.102', () => {
    expect(computeSurfaceDeratingFactor1986(400, 2500, 0.102).cs).toBeCloseTo(
      0.634057,
      5,
    );
  });

  it('matches the series for rho = 100, rhos = 3000, hs = 0.15', () => {
    expect(computeSurfaceDeratingFactor1986(100, 3000, 0.15).cs).toBeCloseTo(
      0.690747,
      5,
    );
  });

  it('is 1 without a surface layer or when rhos equals rho', () => {
    expect(computeSurfaceDeratingFactor1986(400, 2500, 0).cs).toBe(1);
    expect(computeSurfaceDeratingFactor1986(400, 400, 0.1).cs).toBe(1);
  });

  it('exceeds 1 when the surface layer is LESS resistive than the soil', () => {
    expect(computeSurfaceDeratingFactor1986(1000, 200, 0.1).cs).toBeGreaterThan(
      1,
    );
  });

  it('is lower (more conservative) than the 2013 curve fit for a rock layer on low-resistivity soil', () => {
    const series = computeSurfaceDeratingFactor1986(400, 2500, 0.102).cs;
    const curveFit = computeSurfaceDeratingFactor(400, 2500, 0.102).cs;
    expect(series).toBeLessThan(curveFit);
  });

  it('rejects a negative thickness', () => {
    expect(() => computeSurfaceDeratingFactor1986(400, 2500, -0.1)).toThrow();
  });
});
