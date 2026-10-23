import {
  evaluateGalerkinCase,
  type GalerkinCaseInput,
} from '../galerkin-case.evaluator';
import type { GalerkinElementLike } from '../engine/galerkin-input.builder';

function gridElements(lines: number): GalerkinElementLike[] {
  const elements: GalerkinElementLike[] = [];
  for (let i = 0; i < lines; i += 1) {
    const o = (70 / (lines - 1)) * i;
    elements.push({
      type: 0,
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, o],
          [70, o],
        ],
      },
      properties: { diameterMm: 10 },
    });
    elements.push({
      type: 0,
      geometry: {
        type: 'LineString',
        coordinates: [
          [o, 0],
          [o, 70],
        ],
      },
      properties: { diameterMm: 10 },
    });
  }
  return elements;
}

function caseInput(
  overrides: Partial<GalerkinCaseInput> = {},
): GalerkinCaseInput {
  return {
    grid: { length: 70, width: 70, burialDepth: 0.5 },
    fault: {
      faultCurrent: 3180,
      splitFactor: 0.6,
      decrementFactor: 1,
      shockDuration: 0.5,
    },
    settings: {
      surfaceLayerResistivity: 2500,
      surfaceLayerThickness: 0.102,
      bodyWeight: 70,
    },
    soilLayers: [{ resistivity: 400, thickness: 0 }],
    elements: gridElements(6),
    galerkinSettings: { segmentLength: 7 },
    ...overrides,
  };
}

describe('evaluateGalerkinCase', () => {
  it('produces a stored-result shape with the permissible voltages for the body weight', () => {
    const outcome = evaluateGalerkinCase(caseInput());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { values } = outcome;

    expect(values.gridResistance).toBeGreaterThan(2);
    expect(values.gpr).toBeCloseTo(values.gridResistance * 3180 * 0.6, 4);
    expect(values.meshVoltage).toBe(values.touchVoltage);
    // Cs for 0.102 m of 2500 ohm·m rock over 400 ohm·m soil, 70 kg body.
    expect(values.permissibleTouchVoltage).toBeGreaterThan(700);
    expect(values.permissibleTouchVoltage).toBeLessThan(1000);
    expect(values.solverDetails.method).toBe('GALERKIN');
    expect(values.solverDetails.segmentCount).toBe(12 * 10);
    expect(values.solverDetails.segmentLength).toBe(7);
    expect(outcome.samples.touchVoltageMap).toHaveLength(400);
  });

  it('uses the 50 kg limit for a light body', () => {
    const heavy = evaluateGalerkinCase(caseInput());
    const light = evaluateGalerkinCase(
      caseInput({
        settings: {
          surfaceLayerResistivity: 2500,
          surfaceLayerThickness: 0.102,
          bodyWeight: 50,
        },
      }),
    );

    if (!heavy.ok || !light.ok) throw new Error('expected both to succeed');
    expect(light.values.permissibleTouchVoltage).toBeLessThan(
      heavy.values.permissibleTouchVoltage,
    );
  });

  it('injects IG = If · Sf · Df', () => {
    const outcome = evaluateGalerkinCase(
      caseInput({
        fault: {
          faultCurrent: 3180,
          splitFactor: 0.6,
          decrementFactor: 1.2,
          shockDuration: 0.5,
        },
      }),
    );
    if (!outcome.ok) throw new Error(outcome.message);

    expect(outcome.values.gpr / outcome.values.gridResistance).toBeCloseTo(
      3180 * 0.6 * 1.2,
      4,
    );
  });

  it.each([
    [
      'two soil layers',
      {
        soilLayers: [
          { resistivity: 100, thickness: 2 },
          { resistivity: 400, thickness: 0 },
        ],
      },
    ],
    ['no soil layer', { soilLayers: [] }],
    ['no conductors', { elements: [] }],
    [
      'a diagonal conductor',
      {
        elements: [
          {
            type: 0,
            geometry: {
              type: 'LineString' as const,
              coordinates: [
                [0, 0],
                [10, 10],
              ],
            },
            properties: {},
          },
        ],
      },
    ],
    [
      'a zero burial depth',
      { grid: { length: 70, width: 70, burialDepth: 0 } },
    ],
    [
      'a zero fault current',
      {
        fault: {
          faultCurrent: 0,
          splitFactor: 0.6,
          decrementFactor: 1,
          shockDuration: 0.5,
        },
      },
    ],
    [
      'a split factor above 1',
      {
        fault: {
          faultCurrent: 3180,
          splitFactor: 1.5,
          decrementFactor: 1,
          shockDuration: 0.5,
        },
      },
    ],
  ])('refuses %s with a message', (_label, overrides) => {
    const outcome = evaluateGalerkinCase(caseInput(overrides));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message.length).toBeGreaterThan(0);
  });
});
