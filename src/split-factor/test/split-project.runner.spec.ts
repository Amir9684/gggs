import { complex } from '../engine/complex';
import { computeIeee80SplitFactor } from '../engine/ieee80-split-factor.engine';
import { computeGroundWireImpedance } from '../engine/ground-wire-impedance.engine';
import { computeSoniSplitFactor } from '../engine/soni.engine';
import {
  runSplitProject,
  wireIdsOf,
  type SplitProjectInput,
} from '../split-project.runner';
import { buildSoniInput, type CatalogWire } from '../soni-input.builder';

const wire: CatalogWire = { acResistance: 0.5, dcResistance: 0.45, gmr: 0.003, reactance: 0.1 };

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

    const expected = computeSoniSplitFactor(buildSoniInput(soniDirect.input as never, new Map()));
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

    expect(outcome.splitFactor).toBeCloseTo(computeIeee80SplitFactor(ieee80.input as never).splitFactor, 10);
    expect(outcome.details).toEqual({ clamped: null });
  });

  it('passes an engine error on, for a combination with no curve', () => {
    expect(() =>
      runSplitProject(
        { method: 'IEEE80', input: { ...(ieee80.input as object), transmissionLines: 0, distributionLines: 0 } as never },
        new Map(),
      ),
    ).toThrow();
  });
});

describe('wireIdsOf', () => {
  it('lists catalog wires of a Soni project and none for IEEE 80', () => {
    expect(wireIdsOf(soniCatalog)).toEqual(['w1']);
    expect(wireIdsOf(soniDirect)).toEqual([]);
    expect(wireIdsOf(ieee80)).toEqual([]);
  });
});
