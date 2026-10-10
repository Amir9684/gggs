import { deriveDecrementFactor } from '../decrement-factor.engine';

describe('deriveDecrementFactor', () => {
  it('matches the four Windows GGGS choices', () => {
    expect(deriveDecrementFactor(0.008)).toBe(1.65);
    expect(deriveDecrementFactor(0.1)).toBe(1.25);
    expect(deriveDecrementFactor(0.25)).toBe(1.1);
    expect(deriveDecrementFactor(0.5)).toBe(1.0);
  });

  it('uses 1.0 for any duration of 0.5 s or more', () => {
    expect(deriveDecrementFactor(1)).toBe(1.0);
    expect(deriveDecrementFactor(3)).toBe(1.0);
  });

  it('rounds durations in between down to the next listed duration', () => {
    expect(deriveDecrementFactor(0.05)).toBe(1.65);
    expect(deriveDecrementFactor(0.2)).toBe(1.25);
    expect(deriveDecrementFactor(0.3)).toBe(1.1);
    expect(deriveDecrementFactor(0.49)).toBe(1.1);
  });

  it('never returns less than 1 and never increases with duration', () => {
    const durations = [0.005, 0.008, 0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 2];
    const factors = durations.map(deriveDecrementFactor);
    factors.forEach((f) => expect(f).toBeGreaterThanOrEqual(1));
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeLessThanOrEqual(factors[i - 1]);
    }
  });

  it('throws for non-positive or non-finite durations', () => {
    expect(() => deriveDecrementFactor(0)).toThrow();
    expect(() => deriveDecrementFactor(-1)).toThrow();
    expect(() => deriveDecrementFactor(Number.NaN)).toThrow();
  });
});
