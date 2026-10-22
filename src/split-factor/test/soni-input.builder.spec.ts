import { computeGroundWireImpedance } from '../engine/ground-wire-impedance.engine';
import type { SoniCalculateInput } from '../dto/soni-calculate.dto';
import {
  buildSoniInput,
  requestedWireIds,
  type CatalogWire,
} from '../soni-input.builder';

const wire: CatalogWire = {
  acResistance: 0.5,
  dcResistance: 0.45,
  gmr: 0.003,
  reactance: 0.1,
};

function request(
  groundWire: SoniCalculateInput['terminals'][number]['groundWire'],
): SoniCalculateInput {
  return {
    gridResistance: 0.4,
    frequency: 50,
    terminals: [
      {
        faultCurrent: { re: 400, im: -500 },
        spanLength: 500,
        towerFootingResistance: 10,
        groundWire,
        mutualImpedance: { re: 0, im: 0 },
      },
    ],
  };
}

describe('buildSoniInput', () => {
  it('keeps a directly typed impedance', () => {
    const input = buildSoniInput(
      request({ source: 'DIRECT', impedance: { re: 0.55, im: 0.9 } }),
      new Map(),
    );
    expect(input.terminals[0].groundWireImpedance).toEqual({
      re: 0.55,
      im: 0.9,
    });
    expect(input.gridResistance).toBe(0.4);
  });

  it('computes the impedance of a catalog wire from the earth resistivity', () => {
    const input = buildSoniInput(
      request({
        source: 'CATALOG',
        groundWireId: 'w1',
        earthResistivity: 100,
        resistanceSource: 'AC',
        reactanceSource: 'GMR',
      }),
      new Map([['w1', wire]]),
    );
    const expected = computeGroundWireImpedance(
      { ...wire, resistanceSource: 'AC', reactanceSource: 'GMR' },
      100,
      50,
    );
    expect(input.terminals[0].groundWireImpedance).toEqual(expected);
  });

  it('fails when the catalog wire is missing', () => {
    expect(() =>
      buildSoniInput(
        request({
          source: 'CATALOG',
          groundWireId: 'missing',
          earthResistivity: 100,
          resistanceSource: 'AC',
          reactanceSource: 'GMR',
        }),
        new Map(),
      ),
    ).toThrow();
  });
});

describe('requestedWireIds', () => {
  it('lists each catalog wire once and skips direct entries', () => {
    const base = request({ source: 'DIRECT', impedance: { re: 1, im: 1 } });
    const catalog = (id: string) =>
      request({
        source: 'CATALOG',
        groundWireId: id,
        earthResistivity: 100,
        resistanceSource: 'AC',
        reactanceSource: 'GMR',
      }).terminals[0];

    const ids = requestedWireIds({
      ...base,
      terminals: [...base.terminals, catalog('a'), catalog('a'), catalog('b')],
    });
    expect(ids).toEqual(['a', 'b']);
  });
});
