import { IEEE80_CURVES } from '../ieee80-curves.data';
import {
  CURVE_GRID_RESISTANCES,
  computeIeee80SplitFactor,
  interpolateCurve,
  type Ieee80Input,
} from '../ieee80-split-factor.engine';

const input = (overrides: Partial<Ieee80Input> = {}): Ieee80Input => ({
  faultType: 1,
  footingSet: 1,
  transmissionLines: 2,
  distributionLines: 4,
  gridResistance: 1,
  ...overrides,
});

describe('IEEE 80 curve data', () => {
  it('holds 132 curves of 21 positive points, one per tabulated resistance', () => {
    const keys = Object.keys(IEEE80_CURVES);

    expect(keys).toHaveLength(132);
    for (const key of keys) {
      expect(IEEE80_CURVES[key]).toHaveLength(CURVE_GRID_RESISTANCES.length);
      expect(IEEE80_CURVES[key].every((value) => value > 0)).toBe(true);
    }
  });

  it('has every combination for fault type 1 except no lines at all, and only distribution-free curves for types 2 to 4', () => {
    const counts = [0, 1, 2, 4, 8, 12, 18];
    for (const footing of [1, 2]) {
      for (const t of counts) {
        for (const d of counts) {
          expect(`1:${footing}:${t}:${d}` in IEEE80_CURVES).toBe(
            !(t === 0 && d === 0),
          );
        }
      }
      for (const faultType of [2, 3, 4]) {
        for (const t of counts) {
          expect(`${faultType}:${footing}:${t}:0` in IEEE80_CURVES).toBe(
            t !== 0,
          );
        }
        expect(`${faultType}:${footing}:2:1` in IEEE80_CURVES).toBe(false);
      }
    }
  });

  it('starts the first figure at the Windows values', () => {
    expect(IEEE80_CURVES['1:1:1:1'].slice(0, 3)).toEqual([83, 80, 72]);
    expect(IEEE80_CURVES['1:1:1:1'][20]).toBe(3.8);
  });
});

describe('interpolateCurve', () => {
  const curve = IEEE80_CURVES['1:1:1:1'];

  it('returns the tabulated value on a grid resistance', () => {
    expect(interpolateCurve(curve, 1).value).toBeCloseTo(50, 10);
    expect(interpolateCurve(curve, 10).value).toBeCloseTo(9, 10);
    expect(interpolateCurve(curve, 0.1).value).toBeCloseTo(83, 10);
  });

  it('is linear in log-log between points', () => {
    // 1 ohm -> 50 %, 2 ohm -> 31 %: the geometric midpoint is sqrt(2) ohm.
    const mid = interpolateCurve(curve, Math.SQRT2).value;
    expect(mid).toBeCloseTo(Math.sqrt(50 * 31), 8);
  });

  it('uses the end values outside 0.1 to 25 ohm and reports it', () => {
    expect(interpolateCurve(curve, 0.05)).toEqual({
      value: 83,
      clamped: 'LOW',
    });
    expect(interpolateCurve(curve, 40)).toEqual({
      value: 3.8,
      clamped: 'HIGH',
    });
    expect(interpolateCurve(curve, 25)).toEqual({ value: 3.8, clamped: null });
  });
});

describe('computeIeee80SplitFactor', () => {
  it('reads a tabulated combination straight from its curve', () => {
    const result = computeIeee80SplitFactor(
      input({ transmissionLines: 4, distributionLines: 8, gridResistance: 5 }),
    );
    expect(result.splitFactor).toBeCloseTo(IEEE80_CURVES['1:1:4:8'][13], 10);
    expect(result.clamped).toBeNull();
  });

  it('interpolates linearly between line counts', () => {
    // 3 transmission lines sit half way between 2 and 4; 4 distribution lines are tabulated.
    const two = computeIeee80SplitFactor(
      input({ transmissionLines: 2 }),
    ).splitFactor;
    const four = computeIeee80SplitFactor(
      input({ transmissionLines: 4 }),
    ).splitFactor;
    const three = computeIeee80SplitFactor(
      input({ transmissionLines: 3 }),
    ).splitFactor;

    expect(three).toBeCloseTo((two + four) / 2, 10);

    // 6 distribution lines: half way between 4 and 8.
    const d4 = computeIeee80SplitFactor(
      input({ distributionLines: 4 }),
    ).splitFactor;
    const d8 = computeIeee80SplitFactor(
      input({ distributionLines: 8 }),
    ).splitFactor;
    const d6 = computeIeee80SplitFactor(
      input({ distributionLines: 6 }),
    ).splitFactor;
    expect(d6).toBeCloseTo((d4 + d8) / 2, 10);
  });

  it('interpolates both counts at once (bilinear)', () => {
    const corners = [
      [2, 4],
      [4, 4],
      [2, 8],
      [4, 8],
    ].map(
      ([t, d]) =>
        computeIeee80SplitFactor(
          input({ transmissionLines: t, distributionLines: d }),
        ).splitFactor,
    );
    const centre = computeIeee80SplitFactor(
      input({ transmissionLines: 3, distributionLines: 6 }),
    ).splitFactor;

    expect(centre).toBeCloseTo(corners.reduce((a, b) => a + b, 0) / 4, 10);
  });

  it('handles the top of the range (18 lines) and the missing (0, 0) curve', () => {
    const top = computeIeee80SplitFactor(
      input({
        transmissionLines: 18,
        distributionLines: 18,
        gridResistance: 3,
      }),
    );
    expect(top.splitFactor).toBeCloseTo(IEEE80_CURVES['1:1:18:18'][11], 10);

    expect(() =>
      computeIeee80SplitFactor(
        input({ transmissionLines: 0, distributionLines: 0 }),
      ),
    ).toThrow();
  });

  it('supports fault types 2 to 4 without distribution lines', () => {
    const remote75 = computeIeee80SplitFactor(
      input({
        faultType: 2,
        transmissionLines: 4,
        distributionLines: 0,
        gridResistance: 2,
      }),
    );
    expect(remote75.splitFactor).toBeCloseTo(IEEE80_CURVES['2:1:4:0'][10], 10);

    // A distribution line has no curve for a local source, and neither has zero transmission lines.
    expect(() =>
      computeIeee80SplitFactor(
        input({ faultType: 2, transmissionLines: 4, distributionLines: 2 }),
      ),
    ).toThrow();
    expect(() =>
      computeIeee80SplitFactor(
        input({ faultType: 3, transmissionLines: 0, distributionLines: 0 }),
      ),
    ).toThrow();
  });

  it('takes the poorly grounded curve for footing set 2', () => {
    const good = computeIeee80SplitFactor(input({ footingSet: 1 })).splitFactor;
    const poor = computeIeee80SplitFactor(input({ footingSet: 2 })).splitFactor;

    expect(poor).not.toBeCloseTo(good, 3);
    // The default input (2 transmission, 4 distribution lines, 1 ohm) is a tabulated curve.
    expect(poor).toBeCloseTo(
      interpolateCurve(IEEE80_CURVES['1:2:2:4'], 1).value,
      10,
    );
    expect(good).toBeCloseTo(
      interpolateCurve(IEEE80_CURVES['1:1:2:4'], 1).value,
      10,
    );
  });

  it('reports a clamped resistance', () => {
    expect(
      computeIeee80SplitFactor(input({ gridResistance: 0.05 })).clamped,
    ).toBe('LOW');
    expect(
      computeIeee80SplitFactor(input({ gridResistance: 60 })).clamped,
    ).toBe('HIGH');
  });

  it.each([
    ['a fractional line count', { transmissionLines: 2.5 }],
    ['more than 18 lines', { distributionLines: 19 }],
    ['a negative line count', { transmissionLines: -1 }],
    ['a zero resistance', { gridResistance: 0 }],
    ['a NaN resistance', { gridResistance: NaN }],
    ['an unknown fault type', { faultType: 5 as never }],
    ['an unknown footing set', { footingSet: 3 as never }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => computeIeee80SplitFactor(input(overrides))).toThrow();
  });

  it('gives a lower split factor for a higher grid resistance on a normal curve', () => {
    const low = computeIeee80SplitFactor(
      input({ gridResistance: 0.5 }),
    ).splitFactor;
    const high = computeIeee80SplitFactor(
      input({ gridResistance: 5 }),
    ).splitFactor;

    expect(low).toBeGreaterThan(high);
  });
});
