import { computeGpr } from '../gpr.engine';
import type { FaultParameters } from '../types';

function baseFault(overrides: Partial<FaultParameters> = {}): FaultParameters {
  return {
    faultCurrent: 10000,
    faultDuration: 0.5,
    splitFactor: 0.6,
    decrementFactor: 1.0,
    shockDuration: 0.5,
    ...overrides,
  };
}

describe('computeGpr', () => {
  it('computes IG = If * Sf * Df and GPR = IG * Rg', () => {
    const fault = baseFault({
      faultCurrent: 10000,
      splitFactor: 0.6,
      decrementFactor: 1.1,
    });
    const gridResistance = 5;

    const { effectiveGridCurrent, gpr } = computeGpr(fault, gridResistance);

    expect(effectiveGridCurrent).toBeCloseTo(10000 * 0.6 * 1.1, 9);
    expect(gpr).toBeCloseTo(effectiveGridCurrent * gridResistance, 9);
  });

  it('GPR scales linearly with grid resistance', () => {
    const fault = baseFault();
    const at5ohm = computeGpr(fault, 5);
    const at10ohm = computeGpr(fault, 10);

    expect(at10ohm.gpr).toBeCloseTo(at5ohm.gpr * 2, 9);
  });

  it('decrement factor >= 1 always increases or maintains effective current vs no offset', () => {
    const fault = baseFault({ decrementFactor: 1.0 });
    const faultWithOffset = baseFault({ decrementFactor: 1.25 });

    const base = computeGpr(fault, 5);
    const withOffset = computeGpr(faultWithOffset, 5);

    expect(withOffset.effectiveGridCurrent).toBeGreaterThan(
      base.effectiveGridCurrent,
    );
  });

  it('throws for non-positive fault current', () => {
    expect(() => computeGpr(baseFault({ faultCurrent: 0 }), 5)).toThrow();
  });

  it('throws for split factor outside (0, 1]', () => {
    expect(() => computeGpr(baseFault({ splitFactor: 0 }), 5)).toThrow();
    expect(() => computeGpr(baseFault({ splitFactor: 1.5 }), 5)).toThrow();
  });

  it('throws for decrement factor below 1', () => {
    expect(() => computeGpr(baseFault({ decrementFactor: 0.9 }), 5)).toThrow();
  });

  it('throws for non-positive grid resistance', () => {
    expect(() => computeGpr(baseFault(), 0)).toThrow();
  });
});
