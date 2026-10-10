import { evaluateGroundingSafety1986 } from '../safety-evaluation-1986.engine';
import { evaluateGroundingSafety } from '../safety-evaluation.engine';
import type { SafetyEvaluationInput } from '../types';

function baseInput(
  overrides: Partial<SafetyEvaluationInput> = {},
): SafetyEvaluationInput {
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
      rodCount: 0,
      totalRodLength: 0,
      hasPerimeterRods: false,
    },
    soil: { surfaceResistivity: 2500, apparentResistivity: 400 },
    fault: {
      faultCurrent: 3180,
      faultDuration: 0.5,
      splitFactor: 0.6,
      decrementFactor: 1.0,
      shockDuration: 0.5,
    },
    settings: {
      surfaceLayerResistivity: 2500,
      surfaceLayerThickness: 0.102,
      bodyWeight: 70,
      frequency: 60,
    },
    ...overrides,
  };
}

describe('evaluateGroundingSafety1986', () => {
  it('produces a fully populated, internally consistent result', () => {
    const result = evaluateGroundingSafety1986(baseInput());

    expect(result.gridResistance).toBeGreaterThan(0);
    expect(result.gpr).toBeCloseTo(
      result.details.effectiveGridCurrent * result.gridResistance,
      6,
    );
    expect(result.meshVoltage).toBe(result.touchVoltage);
    expect(result.meshVoltage).toBeGreaterThan(0);
    expect(result.stepVoltage).toBeGreaterThan(0);
    expect(result.permissibleTouchVoltage).toBeGreaterThan(0);
    expect(result.permissibleStepVoltage).toBeGreaterThan(0);
    expect(typeof result.safe).toBe('boolean');
  });

  it('Rg and GPR match the 2013 engine exactly \u2014 those formulas are unchanged between editions', () => {
    const result1986 = evaluateGroundingSafety1986(baseInput());
    const result2013 = evaluateGroundingSafety(baseInput());

    expect(result1986.gridResistance).toBeCloseTo(result2013.gridResistance, 9);
    expect(result1986.gpr).toBeCloseTo(result2013.gpr, 6);
    expect(result1986.details.effectiveGridCurrent).toBeCloseTo(
      result2013.details.effectiveGridCurrent,
      6,
    );
  });

  it('Cs matches the 2013 engine exactly \u2014 reused as a documented approximation, not a faithful 1986 series', () => {
    const result1986 = evaluateGroundingSafety1986(baseInput());
    const result2013 = evaluateGroundingSafety(baseInput());

    expect(result1986.details.cs).toBeCloseTo(result2013.details.cs, 9);
  });

  it('mesh voltage differs from the 2013 engine for a non-square axis-count split, because n genuinely differs', () => {
    const input = baseInput({
      geometry: {
        ...baseInput().geometry,
        conductorCountAlongLength: 8,
        conductorCountAlongWidth: 14,
      },
    });

    const result1986 = evaluateGroundingSafety1986(input);
    const result2013 = evaluateGroundingSafety(input);

    expect(result1986.details.geometricFactors.n).not.toBeCloseTo(
      result2013.details.geometricFactors.n,
      3,
    );
    expect(result1986.meshVoltage).not.toBeCloseTo(result2013.meshVoltage, 3);
  });

  it('reports separate nMesh/kiMesh (as n/ki) and nStep/kiStep, used by mesh vs step voltage respectively', () => {
    const input = baseInput({
      geometry: {
        ...baseInput().geometry,
        conductorCountAlongLength: 8,
        conductorCountAlongWidth: 14,
      },
    });
    const result = evaluateGroundingSafety1986(input);
    const { geometricFactors } = result.details;

    expect(geometricFactors.n).toBe(8 * 14); // nMesh
    expect(geometricFactors.nStep).toBe(14); // max(8, 14)
    expect(geometricFactors.ki).toBeCloseTo(
      0.644 + 0.148 * geometricFactors.n,
      9,
    );
    expect(geometricFactors.kiStep).toBeCloseTo(
      0.644 + 0.148 * (geometricFactors.nStep as number),
      9,
    );
    // The two Ki's genuinely differ here, unlike the 2013 method.
    expect(geometricFactors.ki).not.toBeCloseTo(
      geometricFactors.kiStep as number,
      3,
    );
  });

  it('safe is true only when both mesh and step voltages are within their permissible limits', () => {
    const result = evaluateGroundingSafety1986(baseInput());
    const meshSafe = result.meshVoltage <= result.permissibleTouchVoltage;
    const stepSafe = result.stepVoltage <= result.permissibleStepVoltage;

    expect(result.safe).toBe(meshSafe && stepSafe);
  });

  it('a much higher fault current pushes the design toward unsafe', () => {
    const moderate = evaluateGroundingSafety1986(baseInput());
    const severe = evaluateGroundingSafety1986(
      baseInput({
        fault: {
          faultCurrent: 200000,
          faultDuration: 0.5,
          splitFactor: 0.6,
          decrementFactor: 1.0,
          shockDuration: 0.5,
        },
      }),
    );

    expect(severe.gpr).toBeGreaterThan(moderate.gpr);
    expect(severe.meshVoltage).toBeGreaterThan(moderate.meshVoltage);
  });

  it('propagates an engine error (e.g. missing axis conductor counts) rather than swallowing it', () => {
    const noAxisCounts = baseInput({
      geometry: {
        ...baseInput().geometry,
        conductorCountAlongLength: 0,
      },
    });

    expect(() => evaluateGroundingSafety1986(noAxisCounts)).toThrow();
  });
});
