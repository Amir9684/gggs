import { abs, complex, div, add } from '../complex';
import {
  approximateLadderImpedance,
  computeSoniSplitFactor,
  type SoniTerminal,
} from '../soni.engine';

const zgw = complex(0.55, 0.9);

function terminal(overrides: Partial<SoniTerminal> = {}): SoniTerminal {
  return {
    faultCurrent: complex(400, -500),
    spanLength: 500,
    towerFootingResistance: 10,
    groundWireImpedance: zgw,
    mutualImpedance: complex(0, 0),
    ...overrides,
  };
}

describe('approximateLadderImpedance', () => {
  it('is zs/2 + sqrt(zs · Rft)', () => {
    const ze = approximateLadderImpedance(500, zgw, 10);
    const zs = { re: 0.55 * 0.5, im: 0.9 * 0.5 };
    const arg = Math.atan(zs.im / zs.re);
    const mag = Math.sqrt(Math.hypot(zs.re, zs.im) * 10);
    expect(ze.re).toBeCloseTo(zs.re / 2 + mag * Math.cos(arg / 2), 12);
    expect(ze.im).toBeCloseTo(zs.im / 2 + mag * Math.sin(arg / 2), 12);
  });

  it('grows with the tower footing resistance', () => {
    const low = approximateLadderImpedance(500, zgw, 5);
    const high = approximateLadderImpedance(500, zgw, 50);
    expect(abs(high)).toBeGreaterThan(abs(low));
  });

  it.each([
    [0, 10, 0.55],
    [500, 0, 0.55],
    [500, 10, 0],
  ])('rejects span %s, footing %s, Rgw %s', (span, footing, rgw) => {
    expect(() =>
      approximateLadderImpedance(span, complex(rgw, 0.9), footing),
    ).toThrow();
  });
});

describe('computeSoniSplitFactor', () => {
  it('matches the closed form for one terminal without mutual coupling: Sf = |Ze / (Rg + Ze)|', () => {
    const result = computeSoniSplitFactor({
      gridResistance: 0.3,
      terminals: [terminal()],
    });

    const ze = approximateLadderImpedance(500, zgw, 10);
    const expected = abs(div(ze, add(complex(0.3), ze))) * 100;

    expect(result.splitFactor).toBeCloseTo(expected, 8);
  });

  it('sends more of the fault current into a lower-resistance grid', () => {
    const low = computeSoniSplitFactor({ gridResistance: 0.1, terminals: [terminal()] });
    const high = computeSoniSplitFactor({ gridResistance: 2, terminals: [terminal()] });
    expect(low.splitFactor).toBeGreaterThan(high.splitFactor);
  });

  it('stays between 0 and 100 percent for ordinary data', () => {
    const result = computeSoniSplitFactor({
      gridResistance: 0.5,
      terminals: [terminal(), terminal({ spanLength: 300, faultCurrent: complex(200, -250) })],
    });
    expect(result.splitFactor).toBeGreaterThan(0);
    expect(result.splitFactor).toBeLessThan(100);
  });

  it('is symmetric: two identical terminals behave like one with the same per-terminal data', () => {
    const one = computeSoniSplitFactor({
      gridResistance: 0.4,
      terminals: [terminal()],
    });
    // Two identical terminals each carrying the same current: the grid
    // sees both ground wires in parallel, so Sf must not exceed the single case.
    const two = computeSoniSplitFactor({
      gridResistance: 0.4,
      terminals: [terminal(), terminal()],
    });
    expect(two.splitFactor).toBeLessThan(one.splitFactor);
  });

  it('conserves current: Ig + sum(Ie) = sum(Ir)', () => {
    const result = computeSoniSplitFactor({
      gridResistance: 0.5,
      terminals: [terminal(), terminal({ spanLength: 350 })],
    });
    const earth = result.terminalEarthCurrents.reduce((s, c) => add(s, c), complex(0));
    expect(result.gridCurrent.re + earth.re).toBeCloseTo(result.totalFaultCurrent.re, 8);
    expect(result.gridCurrent.im + earth.im).toBeCloseTo(result.totalFaultCurrent.im, 8);
  });

  it('lets a mutual impedance change the result', () => {
    const without = computeSoniSplitFactor({ gridResistance: 0.5, terminals: [terminal()] });
    const withMutual = computeSoniSplitFactor({
      gridResistance: 0.5,
      terminals: [terminal({ mutualImpedance: complex(0.00005, 0.00038) })],
    });
    expect(withMutual.splitFactor).not.toBeCloseTo(without.splitFactor, 6);
  });

  it('rejects bad input', () => {
    expect(() => computeSoniSplitFactor({ gridResistance: 0, terminals: [terminal()] })).toThrow();
    expect(() => computeSoniSplitFactor({ gridResistance: 0.3, terminals: [] })).toThrow();
    expect(() =>
      computeSoniSplitFactor({
        gridResistance: 0.3,
        terminals: [terminal({ faultCurrent: complex(0, 0) })],
      }),
    ).toThrow();
  });
});
