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
      totalConductorLength: 600,
      conductorDiameter: 0.0102,
      conductorCountAlongLength: 8,
      conductorCountAlongWidth: 8,
      averageSpacing: 10,
      rodCount: 8,
      totalRodLength: 24,
      hasPerimeterRods: true,
    },
    soil: {
      surfaceResistivity: 3000,
      apparentResistivity: 400,
    },
    fault: {
      faultCurrent: 10000,
      faultDuration: 0.5,
      splitFactor: 0.6,
      decrementFactor: 1.0,
      shockDuration: 0.5,
    },
    settings: {
      surfaceLayerResistivity: 3000,
      surfaceLayerThickness: 0.1,
      bodyWeight: 70,
      frequency: 60,
    },
    ...overrides,
  };
}

describe('evaluateGroundingSafety', () => {
  it('produces a fully populated, internally consistent result', () => {
    const result = evaluateGroundingSafety(baseInput());

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

  it('safe is true only when both mesh and step voltages are within their permissible limits', () => {
    const result = evaluateGroundingSafety(baseInput());
    const meshSafe = result.meshVoltage <= result.permissibleTouchVoltage;
    const stepSafe = result.stepVoltage <= result.permissibleStepVoltage;

    expect(result.safe).toBe(meshSafe && stepSafe);
  });

  it('a much higher fault current pushes the design toward unsafe', () => {
    const moderate = evaluateGroundingSafety(baseInput());
    const severe = evaluateGroundingSafety(
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

  it('adding a high-resistivity surface layer raises the permissible touch/step voltages', () => {
    const noSurfaceLayer = evaluateGroundingSafety(
      baseInput({
        settings: {
          surfaceLayerResistivity: 400,
          surfaceLayerThickness: 0,
          bodyWeight: 70,
          frequency: 60,
        },
      }),
    );
    const withCrushedRock = evaluateGroundingSafety(
      baseInput({
        settings: {
          surfaceLayerResistivity: 3000,
          surfaceLayerThickness: 0.15,
          bodyWeight: 70,
          frequency: 60,
        },
      }),
    );

    expect(withCrushedRock.permissibleTouchVoltage).toBeGreaterThan(
      noSurfaceLayer.permissibleTouchVoltage,
    );
    expect(withCrushedRock.permissibleStepVoltage).toBeGreaterThan(
      noSurfaceLayer.permissibleStepVoltage,
    );
  });

  it('propagates an engine error (e.g. missing conductor geometry) rather than swallowing it', () => {
    const noConductors = baseInput({
      geometry: {
        ...baseInput().geometry,
        totalConductorLength: 0,
        totalRodLength: 0,
      },
    });

    expect(() => evaluateGroundingSafety(noConductors)).toThrow();
  });
});
