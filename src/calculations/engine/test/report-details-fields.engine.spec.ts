import { evaluateGroundingSafety } from '../safety-evaluation.engine';
import { evaluateGroundingSafety1986 } from '../safety-evaluation-1986.engine';
import type { SafetyEvaluationInput } from '../types';

/**
 * The report templates print Lm, Ls, ρ, d and h next to the factors that
 * use them, so the engines keep those values in `details`.
 */
function input(rods: boolean): SafetyEvaluationInput {
  return {
    geometry: {
      area: 4900,
      length: 70,
      width: 70,
      burialDepth: 0.5,
      totalConductorLength: 1540,
      conductorDiameter: 0.01,
      conductorCountAlongLength: 11,
      conductorCountAlongWidth: 11,
      averageSpacing: 7,
      rodCount: rods ? 4 : 0,
      totalRodLength: rods ? 12 : 0,
      hasPerimeterRods: rods,
    },
    soil: { surfaceResistivity: 2500, apparentResistivity: 400 },
    fault: {
      faultCurrent: 3180,
      faultDuration: 0.5,
      splitFactor: 0.6,
      decrementFactor: 1,
      shockDuration: 0.5,
    },
    settings: {
      surfaceLayerResistivity: 2500,
      surfaceLayerThickness: 0.102,
      bodyWeight: 70,
      frequency: 60,
    },
  };
}

describe.each([
  ['IEEE 80-2013', evaluateGroundingSafety],
  ['IEEE 80-1986', evaluateGroundingSafety1986],
])('%s details for the report', (_label, evaluate) => {
  it('keeps the soil resistivity, conductor diameter and burial depth', () => {
    const { details } = evaluate(input(false));

    expect(details.apparentResistivity).toBe(400);
    expect(details.conductorDiameter).toBe(0.01);
    expect(details.burialDepth).toBe(0.5);
  });

  it('keeps the effective lengths for a grid without rods', () => {
    const { details } = evaluate(input(false));

    expect(details.effectiveMeshLength).toBeCloseTo(1540, 6);
    expect(details.effectiveStepLength).toBeCloseTo(0.75 * 1540, 6);
  });

  it('adds the rods to the effective lengths', () => {
    const { details } = evaluate(input(true));

    expect(details.effectiveMeshLength).toBeGreaterThan(1540);
    expect(details.effectiveStepLength).toBeCloseTo(0.75 * 1540 + 0.85 * 12, 6);
  });
});
