import {
  computeStepVoltage,
  computeEffectiveStepLength,
} from '../step-voltage.engine';

describe('computeEffectiveStepLength', () => {
  it('computes Ls = 0.75*Lc + 0.85*Lr (Eq. 51)', () => {
    const ls = computeEffectiveStepLength(600, 100);
    expect(ls).toBeCloseTo(0.75 * 600 + 0.85 * 100, 9);
  });

  it('reduces to 0.75*Lc when there are no rods', () => {
    const ls = computeEffectiveStepLength(600, 0);
    expect(ls).toBeCloseTo(0.75 * 600, 9);
  });
});

describe('computeStepVoltage', () => {
  it('matches the IEEE 80-2013 Annex B permissible step voltage (Estep70 = 2696.097V)', () => {
    // Same rho_s=2500, hs=0.102 (Cs=0.743), ts=0.5s, 70kg as Annex B.
    const result = computeStepVoltage(
      400,
      0.4,
      2.272,
      1908,
      1000,
      0.7428571428571429,
      2500,
      0.5,
      70,
    );
    expect(result.permissibleStepVoltage).toBeCloseTo(2696.097, 1);
  });

  it('computes Es = rho*Ks*Ki*IG / Ls', () => {
    const rho = 400;
    const ks = 0.3;
    const ki = 1.8;
    const ig = 800;
    const ls = 450;
    const cs = 0.8;
    const rhos = 3000;
    const ts = 0.5;
    const bodyWeight = 70;

    const { stepVoltage } = computeStepVoltage(
      rho,
      ks,
      ki,
      ig,
      ls,
      cs,
      rhos,
      ts,
      bodyWeight,
    );

    const expected = (rho * ks * ki * ig) / ls;
    expect(stepVoltage).toBeCloseTo(expected, 9);
  });

  it('permissible step voltage uses coefficient 6 (vs 1.5 for touch) — always >= permissible touch voltage for same Cs/rhos/ts/weight', () => {
    const rho = 400;
    const cs = 0.8;
    const rhos = 3000;
    const ts = 0.5;
    const bodyWeight = 70;

    const stepResult = computeStepVoltage(
      rho,
      0.3,
      1.8,
      800,
      450,
      cs,
      rhos,
      ts,
      bodyWeight,
    );

    const touchPermissible = (1000 + 1.5 * cs * rhos) * (0.157 / Math.sqrt(ts));
    expect(stepResult.permissibleStepVoltage).toBeGreaterThan(touchPermissible);
  });

  it('flags safe/unsafe correctly relative to the permissible step voltage', () => {
    const safe = computeStepVoltage(50, 0.2, 1.2, 100, 2000, 1, 3000, 0.5, 70);
    expect(safe.isSafe).toBe(true);

    const unsafe = computeStepVoltage(
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
    expect(unsafe.isSafe).toBe(false);
  });

  it('throws for non-positive effective step length', () => {
    expect(() =>
      computeStepVoltage(400, 0.3, 1.8, 800, 0, 1, 3000, 0.5, 70),
    ).toThrow();
  });
});
