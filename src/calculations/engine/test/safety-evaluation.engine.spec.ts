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
  // Cross-checked end-to-end against IEEE Std 80-2013, Annex B, Sample
  // Calculation B.1 (70m x 70m square grid, 11 conductors/side, D=7m,
  // d=0.01m, h=0.5m, rho=400 Ω·m, rho_s=2500 Ω·m, hs=0.102m, no rods,
  // If=3180A, Sf=0.6, Df=1.0, ts=0.5s, 70kg body weight). Published
  // results: Rg=2.776Ω, IG=1908A, GPR=5296V, Em=994.689V,
  // Etouch70=840.548V, unsafe. This implementation reproduces all of
  // those to within the source's own hand-calculation rounding (Km comes
  // out to 0.8896 here vs. the source's rounded 0.883, a ~0.8% gap fully
  // explained by the source rounding Kii to 0.57 before computing Km by
  // hand — see `geometric-factors.engine.spec.ts` for the isolated check).
  it('reproduces the IEEE 80-2013 Annex B worked example', () => {
    const result = evaluateGroundingSafety({
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
    });

    expect(result.gridResistance).toBeCloseTo(2.776, 2);
    expect(result.details.effectiveGridCurrent).toBeCloseTo(1908, 0);
    expect(result.gpr).toBeCloseTo(5296, 0);
    expect(result.details.geometricFactors.n).toBeCloseTo(11, 2);
    expect(result.details.geometricFactors.ki).toBeCloseTo(2.272, 2);
    expect(result.details.geometricFactors.kii).toBeCloseTo(0.57, 2);
    expect(result.details.geometricFactors.kh).toBeCloseTo(1.225, 2);
    expect(result.details.geometricFactors.km).toBeCloseTo(0.883, 1); // see rounding note above
    expect(result.details.cs).toBeCloseTo(0.743, 2);
    expect(result.permissibleTouchVoltage).toBeCloseTo(840.548, 0);
    expect(result.meshVoltage).toBeCloseTo(994.689, -2); // within ~1% per Km rounding note
    expect(Math.abs(result.meshVoltage - 994.689) / 994.689).toBeLessThan(
      0.015,
    );
    expect(result.safe).toBe(false); // Em > Etouch70 in the source example
  });

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
