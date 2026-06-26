import {
  computeMeshVoltage,
  computeEffectiveMeshLength,
} from '../mesh-voltage.engine';

describe('computeEffectiveMeshLength', () => {
  it('returns just the conductor length when there are no rods', () => {
    const lm = computeEffectiveMeshLength(600, 0, 70, 70);
    expect(lm).toBe(600);
  });

  it('adds a rod contribution larger than the raw rod length when rods are present (Eq. 49)', () => {
    const lm = computeEffectiveMeshLength(600, 100, 70, 70);
    expect(lm).toBeGreaterThan(600 + 100); // factor (1.55 + 1.22*...) > 1
  });
});

describe('computeMeshVoltage', () => {
  it('computes Em = rho*Km*Ki*IG / Lm', () => {
    const rho = 400;
    const km = 0.6;
    const ki = 1.8;
    const ig = 800;
    const lm = 600;
    const cs = 0.8;
    const rhos = 3000;
    const ts = 0.5;
    const bodyWeight = 70;

    const { meshVoltage } = computeMeshVoltage(
      rho,
      km,
      ki,
      ig,
      lm,
      cs,
      rhos,
      ts,
      bodyWeight,
    );

    const expected = (rho * km * ki * ig) / lm;
    expect(meshVoltage).toBeCloseTo(expected, 9);
  });

  it('uses the 70kg Dalziel coefficient (0.157) when body weight is 70', () => {
    const result = computeMeshVoltage(400, 0.6, 1.8, 800, 600, 1, 3000, 1, 70);
    const expected = (1000 + 1.5 * 1 * 3000) * (0.157 / Math.sqrt(1));
    expect(result.permissibleTouchVoltage).toBeCloseTo(expected, 6);
  });

  it('uses the 50kg Dalziel coefficient (0.116) when body weight is 50', () => {
    const result = computeMeshVoltage(400, 0.6, 1.8, 800, 600, 1, 3000, 1, 50);
    const expected = (1000 + 1.5 * 1 * 3000) * (0.116 / Math.sqrt(1));
    expect(result.permissibleTouchVoltage).toBeCloseTo(expected, 6);
  });

  it('permissible touch voltage decreases as shock duration increases (longer exposure -> less tolerable)', () => {
    const short = computeMeshVoltage(400, 0.6, 1.8, 800, 600, 1, 3000, 0.2, 70);
    const long = computeMeshVoltage(400, 0.6, 1.8, 800, 600, 1, 3000, 1.0, 70);

    expect(long.permissibleTouchVoltage).toBeLessThan(
      short.permissibleTouchVoltage,
    );
  });

  it('flags unsafe when mesh voltage exceeds the permissible touch voltage', () => {
    // Deliberately tiny Lm and huge IG to force Em above any reasonable Etouch.
    const result = computeMeshVoltage(
      400,
      0.6,
      1.8,
      1_000_000,
      1,
      1,
      3000,
      0.5,
      70,
    );
    expect(result.isSafe).toBe(false);
  });

  it('flags safe when mesh voltage is comfortably below the permissible touch voltage', () => {
    const result = computeMeshVoltage(
      50,
      0.4,
      1.2,
      100,
      2000,
      1,
      3000,
      0.5,
      70,
    );
    expect(result.isSafe).toBe(true);
  });

  it('throws for non-positive effective mesh length', () => {
    expect(() =>
      computeMeshVoltage(400, 0.6, 1.8, 800, 0, 1, 3000, 0.5, 70),
    ).toThrow();
  });

  it('throws for non-positive shock duration', () => {
    expect(() =>
      computeMeshVoltage(400, 0.6, 1.8, 800, 600, 1, 3000, 0, 70),
    ).toThrow();
  });
});
