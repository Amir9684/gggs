import {
  computeGroundWireImpedance,
  equivalentEarthDepth,
  type GroundWireData,
} from '../ground-wire-impedance.engine';

const wire: GroundWireData = {
  acResistance: 0.5,
  dcResistance: 0.45,
  gmr: 0.003,
  reactance: 0.1,
  resistanceSource: 'AC',
  reactanceSource: 'GMR',
};

describe('equivalentEarthDepth', () => {
  it('is 658.4 · sqrt(rho / f)', () => {
    expect(equivalentEarthDepth(1000, 50)).toBeCloseTo(
      658.4 * Math.sqrt(20),
      8,
    );
  });
  it('rejects non-positive resistivity', () => {
    expect(() => equivalentEarthDepth(0)).toThrow();
  });
});

describe('computeGroundWireImpedance', () => {
  it('adds the earth return resistance to the AC resistance', () => {
    const z = computeGroundWireImpedance(wire, 100, 50);
    expect(z.re).toBeCloseTo(0.5 + 0.000000987 * 50 * 1000, 10);
  });

  it('uses the DC resistance as is', () => {
    const z = computeGroundWireImpedance(
      { ...wire, resistanceSource: 'DC' },
      100,
      50,
    );
    expect(z.re).toBeCloseTo(0.45, 12);
  });

  it('takes the reactance from the GMR', () => {
    const z = computeGroundWireImpedance(wire, 100, 50);
    const de = 658.4 * Math.sqrt(100 / 50);
    expect(z.im).toBeCloseTo(
      0.000002894 * 50 * Math.log10(de / 0.003) * 1000,
      10,
    );
  });

  it('takes the reactance from the internal reactance', () => {
    const z = computeGroundWireImpedance(
      { ...wire, reactanceSource: 'REACTANCE' },
      100,
      50,
    );
    const de = 658.4 * Math.sqrt(100 / 50);
    expect(z.im).toBeCloseTo(
      0.000002894 * 50 * Math.log10(de) * 1000 + 0.1,
      10,
    );
  });

  it('rejects a non-positive GMR when the GMR is used', () => {
    expect(() =>
      computeGroundWireImpedance({ ...wire, gmr: 0 }, 100),
    ).toThrow();
  });
});
