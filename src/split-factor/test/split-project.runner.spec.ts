import { complex } from '../engine/complex';
import { computeIeee80SplitFactor } from '../engine/ieee80-split-factor.engine';
import { computeRamezaniSplitFactor } from '../engine/ramezani.engine';
import { computeGroundWireImpedance } from '../engine/ground-wire-impedance.engine';
import { computeSoniSplitFactor } from '../engine/soni.engine';
import {
  runSplitProject,
  wireIdsOf,
  type SplitProjectInput,
} from '../split-project.runner';
import { buildSoniInput, type CatalogWire } from '../soni-input.builder';

const wire: CatalogWire = {
  acResistance: 0.5,
  dcResistance: 0.45,
  gmr: 0.003,
  reactance: 0.1,
};

const soniDirect: SplitProjectInput = {
  method: 'SONI',
  input: {
    gridResistance: 0.2,
    frequency: 50,
    terminals: [
      {
        name: 'T1',
        faultCurrent: { re: 400, im: -500 },
        spanLength: 500,
        towerFootingResistance: 10,
        groundWire: { source: 'DIRECT', impedance: { re: 0.55, im: 0.9 } },
        mutualImpedance: { re: 0.00005, im: 0.00038 },
      },
    ],
  },
};

const soniCatalog: SplitProjectInput = {
  method: 'SONI',
  input: {
    gridResistance: 0.2,
    frequency: 50,
    terminals: [
      {
        faultCurrent: { re: 400, im: -500 },
        spanLength: 500,
        towerFootingResistance: 10,
        groundWire: {
          source: 'CATALOG',
          groundWireId: 'w1',
          earthResistivity: 1000,
          resistanceSource: 'AC',
          reactanceSource: 'GMR',
        },
        mutualImpedance: { re: 0, im: 0 },
      },
    ],
  },
};

const ieee80: SplitProjectInput = {
  method: 'IEEE80',
  input: {
    faultType: 1,
    footingSet: 1,
    transmissionLines: 2,
    distributionLines: 4,
    gridResistance: 0.5,
  },
};

describe('runSplitProject', () => {
  it('runs the Soni method on a directly typed impedance and keeps the details', () => {
    const outcome = runSplitProject(soniDirect, new Map());

    const expected = computeSoniSplitFactor(
      buildSoniInput(soniDirect.input, new Map()),
    );
    expect(outcome.splitFactor).toBeCloseTo(expected.splitFactor, 10);
    expect(outcome.splitFactor).toBeGreaterThan(0);
    expect(outcome.splitFactor).toBeLessThan(100);

    const details = outcome.details as {
      gridCurrent: { magnitude: number };
      terminals: Array<{ name: string | null }>;
    };
    expect(details.gridCurrent.magnitude).toBeGreaterThan(0);
    expect(details.terminals[0].name).toBe('T1');
  });

  it('computes a catalog wire impedance from the stored wire', () => {
    const outcome = runSplitProject(soniCatalog, new Map([['w1', wire]]));

    const zgw = computeGroundWireImpedance(
      { ...wire, resistanceSource: 'AC', reactanceSource: 'GMR' },
      1000,
      50,
    );
    const expected = computeSoniSplitFactor({
      gridResistance: 0.2,
      terminals: [
        {
          faultCurrent: complex(400, -500),
          spanLength: 500,
          towerFootingResistance: 10,
          groundWireImpedance: zgw,
          mutualImpedance: complex(0, 0),
        },
      ],
    });
    expect(outcome.splitFactor).toBeCloseTo(expected.splitFactor, 10);
  });

  it('fails when a catalog wire is missing', () => {
    expect(() => runSplitProject(soniCatalog, new Map())).toThrow();
  });

  it('runs the IEEE 80 curves method', () => {
    const outcome = runSplitProject(ieee80, new Map());

    expect(outcome.splitFactor).toBeCloseTo(
      computeIeee80SplitFactor(ieee80.input).splitFactor,
      10,
    );
    expect(outcome.details).toEqual({ clamped: null });
  });

  it('passes an engine error on, for a combination with no curve', () => {
    expect(() =>
      runSplitProject(
        {
          method: 'IEEE80',
          input: {
            ...(ieee80.input as object),
            transmissionLines: 0,
            distributionLines: 0,
          } as never,
        },
        new Map(),
      ),
    ).toThrow();
  });
});

const ramezaniSpans = Array.from({ length: 10 }, () => ({
  length: 300,
  towerFootingResistance: 10,
}));

const ramezaniDirect: SplitProjectInput = {
  method: 'RAMEZANI',
  input: {
    gridResistance: 0.3,
    frequency: 50,
    groundFaultCurrent: { re: 0, im: 0 },
    terminals: [
      {
        name: 'T1',
        faultCurrent: { re: 400, im: -500 },
        groundWire: { source: 'DIRECT', impedance: { re: 0.55, im: 0.9 } },
        mutualImpedance: { re: 0.05, im: 0.38 },
        spans: ramezaniSpans,
        groundWireFraction: 1,
      },
    ],
  },
};

const ramezaniCatalog: SplitProjectInput = {
  method: 'RAMEZANI',
  input: {
    gridResistance: 0.3,
    frequency: 50,
    groundFaultCurrent: { re: 0, im: 0 },
    terminals: [
      {
        faultCurrent: { re: 400, im: -500 },
        groundWire: {
          source: 'CATALOG',
          groundWireId: 'w1',
          earthResistivity: 1000,
          resistanceSource: 'AC',
          reactanceSource: 'GMR',
        },
        mutualImpedance: { re: 0, im: 0 },
        spans: ramezaniSpans,
        groundWireFraction: 1,
      },
    ],
  },
};

describe('Ramezani projects', () => {
  it('runs the Ramezani engine and keeps per-terminal details', () => {
    const outcome = runSplitProject(ramezaniDirect, new Map());

    const expected = computeRamezaniSplitFactor({
      gridResistance: 0.3,
      terminals: [
        {
          faultCurrent: complex(400, -500),
          groundWireImpedance: complex(0.55, 0.9),
          mutualImpedance: complex(0.05, 0.38),
          spans: ramezaniSpans,
          groundWireFraction: 1,
        },
      ],
    });
    expect(outcome.splitFactor).toBeCloseTo(expected.splitFactor, 10);

    const details = outcome.details as {
      terminals: Array<{
        name: string | null;
        spanCount: number;
        lineLength: number;
        groundWireImpedance: { re: number };
      }>;
    };
    expect(details.terminals[0]).toMatchObject({ name: 'T1', spanCount: 10 });
    expect(details.terminals[0].lineLength).toBeCloseTo(3, 10);
    expect(details.terminals[0].groundWireImpedance.re).toBe(0.55);
  });

  it('computes a catalog wire impedance and lists the wire ids', () => {
    expect(wireIdsOf(ramezaniCatalog)).toEqual(['w1']);
    expect(wireIdsOf(ramezaniDirect)).toEqual([]);

    const outcome = runSplitProject(ramezaniCatalog, new Map([['w1', wire]]));
    const zgw = computeGroundWireImpedance(
      { ...wire, resistanceSource: 'AC', reactanceSource: 'GMR' },
      1000,
      50,
    );
    const details = outcome.details as {
      terminals: Array<{ groundWireImpedance: { re: number; im: number } }>;
    };

    expect(details.terminals[0].groundWireImpedance.re).toBeCloseTo(zgw.re, 10);
    expect(() => runSplitProject(ramezaniCatalog, new Map())).toThrow();
  });

  it('passes the vicinity fault current on to the engine', () => {
    const inside = runSplitProject(ramezaniDirect, new Map());
    const vicinity = runSplitProject(
      {
        method: 'RAMEZANI',
        input: {
          ...(ramezaniDirect.input as object),
          groundFaultCurrent: { re: 2000, im: -2500 },
        } as never,
      },
      new Map(),
    );

    expect(vicinity.splitFactor).not.toBeCloseTo(inside.splitFactor, 2);
  });
});

describe('warnings and details', () => {
  it('keeps the ground wire impedance each terminal used', () => {
    const catalog = runSplitProject(soniCatalog, new Map([['w1', wire]]));
    const zgw = computeGroundWireImpedance(
      { ...wire, resistanceSource: 'AC', reactanceSource: 'GMR' },
      1000,
      50,
    );
    const details = catalog.details as {
      terminals: Array<{ groundWireImpedance: { re: number; im: number } }>;
    };

    expect(details.terminals[0].groundWireImpedance.re).toBeCloseTo(zgw.re, 10);
    expect(details.terminals[0].groundWireImpedance.im).toBeCloseTo(zgw.im, 10);

    const direct = runSplitProject(soniDirect, new Map());
    const directDetails = direct.details as {
      terminals: Array<{ groundWireImpedance: { re: number } }>;
    };
    expect(directDetails.terminals[0].groundWireImpedance.re).toBe(0.55);
  });

  it('has no warnings for ordinary data', () => {
    expect(runSplitProject(soniDirect, new Map()).warnings).toEqual([]);
    expect(runSplitProject(ieee80, new Map()).warnings).toEqual([]);
  });

  it('warns when Rg is outside the IEEE 80 curves', () => {
    const outcome = runSplitProject(
      {
        method: 'IEEE80',
        input: { ...(ieee80.input as object), gridResistance: 0.05 } as never,
      },
      new Map(),
    );

    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0]).toContain('۰٫۱');
  });

  it('warns when the Soni split factor exceeds 100 %', () => {
    // A very strong mutual coupling pushes the grid current above the fault current.
    const strong: SplitProjectInput = {
      method: 'SONI',
      input: {
        gridResistance: 0.05,
        frequency: 50,
        terminals: [
          {
            faultCurrent: { re: 400, im: -500 },
            spanLength: 500,
            towerFootingResistance: 10,
            groundWire: { source: 'DIRECT', impedance: { re: 0.55, im: 0.9 } },
            mutualImpedance: { re: 0, im: -100 },
          },
        ],
      },
    };
    const outcome = runSplitProject(strong, new Map());

    expect(outcome.splitFactor).toBeGreaterThan(100);
    expect(outcome.warnings).toHaveLength(1);
  });
});

describe('wireIdsOf', () => {
  it('lists catalog wires of a Soni project and none for IEEE 80', () => {
    expect(wireIdsOf(soniCatalog)).toEqual(['w1']);
    expect(wireIdsOf(soniDirect)).toEqual([]);
    expect(wireIdsOf(ieee80)).toEqual([]);
  });
});
