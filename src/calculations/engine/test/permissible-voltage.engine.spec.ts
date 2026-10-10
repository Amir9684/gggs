import { computePermissibleVoltages } from '../permissible-voltage.engine';
import { computeMeshVoltage } from '../mesh-voltage.engine';
import { computeStepVoltage } from '../step-voltage.engine';

describe('computePermissibleVoltages', () => {
  it('matches the hand-computed Dalziel values (no surface layer)', () => {
    // Cs = 1, rho_s = 0 -> base = 1000 for touch and step.
    const v = computePermissibleVoltages(1, 0, 0.5);
    const root = Math.sqrt(0.5);
    expect(v.kg50.touch).toBeCloseTo((1000 * 0.116) / root, 9);
    expect(v.kg50.step).toBeCloseTo((1000 * 0.116) / root, 9);
    expect(v.kg70.touch).toBeCloseTo((1000 * 0.157) / root, 9);
    expect(v.kg70.step).toBeCloseTo((1000 * 0.157) / root, 9);
  });

  it('applies 1.5 for touch and 6 for step with a surface layer', () => {
    const v = computePermissibleVoltages(0.8, 2500, 0.5);
    const root = Math.sqrt(0.5);
    expect(v.kg70.touch).toBeCloseTo(
      ((1000 + 1.5 * 0.8 * 2500) * 0.157) / root,
      9,
    );
    expect(v.kg70.step).toBeCloseTo(
      ((1000 + 6 * 0.8 * 2500) * 0.157) / root,
      9,
    );
  });

  it('70 kg limits are larger than 50 kg limits, and step exceeds touch', () => {
    const v = computePermissibleVoltages(0.9, 3000, 0.4);
    expect(v.kg70.touch).toBeGreaterThan(v.kg50.touch);
    expect(v.kg70.step).toBeGreaterThan(v.kg50.step);
    expect(v.kg50.step).toBeGreaterThan(v.kg50.touch);
  });

  it('agrees with the single-weight mesh and step engines', () => {
    const cs = 0.85;
    const rhoS = 2500;
    const ts = 0.5;
    const v = computePermissibleVoltages(cs, rhoS, ts);
    for (const [weight, set] of [
      [50, v.kg50],
      [70, v.kg70],
    ] as const) {
      const mesh = computeMeshVoltage(
        100,
        1,
        1,
        1000,
        100,
        cs,
        rhoS,
        ts,
        weight,
      );
      const step = computeStepVoltage(
        100,
        1,
        1,
        1000,
        100,
        cs,
        rhoS,
        ts,
        weight,
      );
      expect(set.touch).toBeCloseTo(mesh.permissibleTouchVoltage, 9);
      expect(set.step).toBeCloseTo(step.permissibleStepVoltage, 9);
    }
  });

  it('throws for invalid shock duration or Cs', () => {
    expect(() => computePermissibleVoltages(1, 0, 0)).toThrow();
    expect(() => computePermissibleVoltages(0, 0, 0.5)).toThrow();
  });
});
