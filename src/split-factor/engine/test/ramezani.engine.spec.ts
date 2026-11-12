import {
  abs,
  add,
  complex,
  div,
  mul,
  scale,
  sub,
  type Complex,
} from '../complex';
import {
  computeRamezaniSplitFactor,
  ladderImpedance,
  type RamezaniSpan,
  type RamezaniTerminal,
} from '../ramezani.engine';
import { computeSoniSplitFactor } from '../soni.engine';

const zgw = complex(0.55, 0.9);

const spans = (count: number, length = 300, footing = 10): RamezaniSpan[] =>
  Array.from({ length: count }, () => ({
    length,
    towerFootingResistance: footing,
  }));

function terminal(overrides: Partial<RamezaniTerminal> = {}): RamezaniTerminal {
  return {
    faultCurrent: complex(400, -500),
    groundWireImpedance: zgw,
    mutualImpedance: complex(0, 0),
    spans: spans(20),
    ...overrides,
  };
}

/** Independent ladder: fold the line from the far end, series Zg then R to earth. */
function foldedLadder(list: readonly RamezaniSpan[], z: Complex): Complex {
  const last = list[list.length - 1];
  let impedance = add(
    scale(z, last.length / 1000),
    complex(last.towerFootingResistance),
  );
  for (let i = list.length - 2; i >= 0; i -= 1) {
    const r = complex(list[i].towerFootingResistance);
    const shunt = div(mul(r, impedance), add(r, impedance));
    impedance = add(scale(z, list[i].length / 1000), shunt);
  }
  return impedance;
}

describe('ladderImpedance', () => {
  it('matches an independent fold from the far end, for equal and unequal spans', () => {
    const equal = spans(5);
    const unequal: RamezaniSpan[] = [
      { length: 200, towerFootingResistance: 8 },
      { length: 450, towerFootingResistance: 15 },
      { length: 300, towerFootingResistance: 5 },
      { length: 380, towerFootingResistance: 22 },
    ];

    for (const list of [equal, unequal]) {
      const { ze } = ladderImpedance(list, zgw);
      const expected = foldedLadder(list, zgw);
      expect(ze.re).toBeCloseTo(expected.re, 10);
      expect(ze.im).toBeCloseTo(expected.im, 10);
    }
  });

  it('approaches the endless ladder zs/2 + sqrt(zs²/4 + zs·R)', () => {
    const { ze } = ladderImpedance(spans(400), zgw);
    const zs = scale(zgw, 300 / 1000);
    const half = scale(zs, 0.5);
    // principal complex root of zs²/4 + zs·R
    const radicand = add(mul(half, half), scale(zs, 10));
    const modulus = Math.sqrt(abs(radicand));
    const angle = Math.atan2(radicand.im, radicand.re) / 2;
    const infinite = add(
      half,
      complex(modulus * Math.cos(angle), modulus * Math.sin(angle)),
    );

    expect(ze.re).toBeCloseTo(infinite.re, 6);
    expect(ze.im).toBeCloseTo(infinite.im, 6);
  });

  it('is Zg + R for a single span, with Ke = −R', () => {
    const { ze, ke } = ladderImpedance(spans(1, 500, 12), zgw);

    expect(ze.re).toBeCloseTo(0.55 * 0.5 + 12, 12);
    expect(ze.im).toBeCloseTo(0.9 * 0.5, 12);
    expect(ke.re).toBeCloseTo(-12, 12);
    expect(ke.im).toBeCloseTo(0, 12);
  });

  it('has a remote-end coefficient that fades on a long line', () => {
    const short = ladderImpedance(spans(2), zgw).ke;
    const long = ladderImpedance(spans(60), zgw).ke;

    expect(abs(long)).toBeLessThan(abs(short));
    expect(abs(long)).toBeLessThan(1e-3);
  });

  it('rejects bad spans', () => {
    expect(() => ladderImpedance([], zgw)).toThrow();
    expect(() =>
      ladderImpedance([{ length: 0, towerFootingResistance: 10 }], zgw),
    ).toThrow();
    expect(() =>
      ladderImpedance([{ length: 300, towerFootingResistance: 0 }], zgw),
    ).toThrow();
    expect(() => ladderImpedance(spans(3), complex(0, 1))).toThrow();
  });
});

describe('computeRamezaniSplitFactor', () => {
  it('matches the closed form for one terminal inside the substation: Ie = (Rg − Ke)·Ir / (Rg + Ze)', () => {
    const t = terminal({ spans: spans(8) });
    const result = computeRamezaniSplitFactor({
      gridResistance: 0.3,
      terminals: [t],
    });
    const { ze, ke } = ladderImpedance(t.spans, zgw);

    const ie = div(
      mul(sub(complex(0.3), ke), t.faultCurrent),
      add(complex(0.3), ze),
    );
    const ig = sub(ie, t.faultCurrent);

    expect(result.splitFactor).toBeCloseTo(
      (abs(ig) / abs(t.faultCurrent)) * 100,
      8,
    );
    expect(result.terminalEarthCurrents[0].re).toBeCloseTo(ie.re, 8);
    expect(result.terminalEarthCurrents[0].im).toBeCloseTo(ie.im, 8);
  });

  it('agrees closely with the Soni method on a long line with no mutual coupling', () => {
    const ramezani = computeRamezaniSplitFactor({
      gridResistance: 0.3,
      terminals: [terminal({ spans: spans(200, 100, 10) })],
    });
    const soni = computeSoniSplitFactor({
      gridResistance: 0.3,
      terminals: [
        {
          faultCurrent: complex(400, -500),
          spanLength: 100,
          towerFootingResistance: 10,
          groundWireImpedance: zgw,
          mutualImpedance: complex(0, 0),
        },
      ],
    });

    expect(
      Math.abs(ramezani.splitFactor - soni.splitFactor) / soni.splitFactor,
    ).toBeLessThan(0.03);
  });

  it('conserves current: Ig + sum(Ie) = IG + sum(Ir) − IG for a fault inside', () => {
    const result = computeRamezaniSplitFactor({
      gridResistance: 0.4,
      terminals: [
        terminal(),
        terminal({
          spans: spans(12, 400, 6),
          faultCurrent: complex(250, -300),
        }),
      ],
    });
    const earth = result.terminalEarthCurrents.reduce(
      (s, c) => add(s, c),
      complex(0),
    );

    expect(result.gridCurrent.re).toBeCloseTo(
      earth.re - result.totalFaultCurrent.re,
      8,
    );
    expect(result.gridCurrent.im).toBeCloseTo(
      earth.im - result.totalFaultCurrent.im,
      8,
    );
  });

  it('lets mutual coupling change the result, in the same unit as Zgw', () => {
    const without = computeRamezaniSplitFactor({
      gridResistance: 0.4,
      terminals: [terminal()],
    });
    const withMutual = computeRamezaniSplitFactor({
      gridResistance: 0.4,
      terminals: [terminal({ mutualImpedance: complex(0.05, 0.38) })],
    });

    expect(
      Math.abs(withMutual.splitFactor - without.splitFactor),
    ).toBeGreaterThan(1);
    // zm = Zgm · Ze / Zgw
    const expected = div(
      mul(complex(0.05, 0.38), withMutual.equivalentImpedances[0]),
      zgw,
    );
    expect(withMutual.mutualFactors[0].re).toBeCloseTo(expected.re, 10);
  });

  it('uses IG for a fault in the vicinity and divides by it', () => {
    const t = terminal();
    const groundFault = complex(2000, -2500);
    const result = computeRamezaniSplitFactor({
      gridResistance: 0.4,
      terminals: [t],
      groundFaultCurrent: groundFault,
    });

    // Ig = IG − (Ir − Ie), Sf = |Ig / IG|
    const earth = result.terminalEarthCurrents[0];
    const ig = add(groundFault, sub(earth, t.faultCurrent));
    expect(result.gridCurrent.re).toBeCloseTo(ig.re, 8);
    expect(result.splitFactor).toBeCloseTo(
      (abs(ig) / abs(groundFault)) * 100,
      8,
    );

    const inside = computeRamezaniSplitFactor({
      gridResistance: 0.4,
      terminals: [t],
    });
    expect(result.splitFactor).not.toBeCloseTo(inside.splitFactor, 2);
  });

  it('treats a zero IG like a fault inside', () => {
    const t = terminal();
    const inside = computeRamezaniSplitFactor({
      gridResistance: 0.4,
      terminals: [t],
    });
    const zero = computeRamezaniSplitFactor({
      gridResistance: 0.4,
      terminals: [t],
      groundFaultCurrent: complex(0, 0),
    });

    expect(zero.splitFactor).toBeCloseTo(inside.splitFactor, 12);
  });

  it('scales the mutual term by Lt when the ground wire covers part of the line', () => {
    const coupled = (fraction?: number) =>
      computeRamezaniSplitFactor({
        gridResistance: 0.4,
        terminals: [
          terminal({
            mutualImpedance: complex(0.05, 0.38),
            groundWireFraction: fraction,
          }),
        ],
      }).splitFactor;

    expect(coupled(0.5)).not.toBeCloseTo(coupled(1), 3);
    expect(coupled(undefined)).toBeCloseTo(coupled(1), 12);
  });

  it('rejects bad input', () => {
    expect(() =>
      computeRamezaniSplitFactor({
        gridResistance: 0,
        terminals: [terminal()],
      }),
    ).toThrow();
    expect(() =>
      computeRamezaniSplitFactor({ gridResistance: 0.3, terminals: [] }),
    ).toThrow();
    expect(() =>
      computeRamezaniSplitFactor({
        gridResistance: 0.3,
        terminals: [terminal({ faultCurrent: complex(0, 0) })],
      }),
    ).toThrow();
    expect(() =>
      computeRamezaniSplitFactor({
        gridResistance: 0.3,
        terminals: [terminal({ groundWireFraction: 1.5 })],
      }),
    ).toThrow();
    expect(() =>
      computeRamezaniSplitFactor({
        gridResistance: 0.3,
        terminals: [terminal({ groundWireFraction: 0 })],
      }),
    ).toThrow();
  });
});
