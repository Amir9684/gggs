import { evaluateGroundingSafety } from '../safety-evaluation.engine';
import { evaluateGroundingSafety1986 } from '../safety-evaluation-1986.engine';
import type { SafetyEvaluationInput } from '../types';

/** Narrows a value the test depends on, failing with a readable message. */
function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what} to be present`);
  }
  return value;
}

/**
 * Parity with the Windows GGGS IEEE 80-2000 design forms.
 *
 * Expected Em / Es come from a line-by-line transcription of
 * `ieee2000.frm` / `Towlay2000.frm` `Runbutton_Click` (square-grid branch),
 * evaluated outside this code base — they are NOT numbers exported from a
 * running Windows installation. Grid: 70 m x 70 m, 11 x 11 conductors
 * (D = 7 m), h = 0.5 m, d = 0.01 m, If = 3180 A, Sf = 0.6, Df = 1.0.
 *
 * The square grid keeps `n` (web) equal to the conductor count `nll`
 * (Windows) in Ks, so the two formulas coincide.
 */
function input(
  rods: { count: number; length: number; perimeter: boolean },
  soil: SafetyEvaluationInput['soil'],
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
      rodCount: rods.count,
      totalRodLength: rods.count * rods.length,
      hasPerimeterRods: rods.perimeter,
    },
    soil,
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
  };
}

const twoLayer = (upper: number, lower: number, thickness: number) => ({
  surfaceResistivity: 2500,
  apparentResistivity: 150,
  twoLayer: {
    upperResistivity: upper,
    lowerResistivity: lower,
    upperThickness: thickness,
  },
});

const uniform400 = { surfaceResistivity: 2500, apparentResistivity: 400 };
const none = { count: 0, length: 0, perimeter: false };
const perimeter = { count: 8, length: 3, perimeter: true };
const scattered = { count: 4, length: 3, perimeter: false };

describe('IEEE 80-2000 parity with the Windows forms', () => {
  const cases: Array<[string, SafetyEvaluationInput, number, number, number]> =
    [
      [
        'one layer, no rods',
        input(none, uniform400),
        1001.6143,
        609.7269,
        1540,
      ],
      [
        'one layer, rods at corners/perimeter',
        input(perimeter, uniform400),
        847.9199,
        599.1446,
        1578.0873,
      ],
      [
        'one layer, a few rods none on the perimeter',
        input(scattered, uniform400),
        993.8699,
        604.3895,
        1552,
      ],
      [
        'two layer A: no rods, rho2 > rho1',
        input(none, twoLayer(100, 300, 2)),
        304.758,
        236.2945,
        1540,
      ],
      [
        'two layer B: rods, rho2 < rho1',
        input(perimeter, twoLayer(300, 100, 2)),
        396.7975,
        217.5851,
        1578.0873,
      ],
      [
        'two layer C: rods, rho2 > rho1',
        input(perimeter, twoLayer(100, 300, 2)),
        276.9599,
        273.9192,
        1578.0873,
      ],
      [
        'two layer D: no rods, thick upper layer',
        input(none, twoLayer(100, 300, 80)),
        250.4036,
        152.4317,
        1540,
      ],
      [
        'two layer E: a few rods none on the perimeter',
        input(scattered, twoLayer(100, 300, 2)),
        324.6322,
        276.3171,
        1552,
      ],
    ];

  it.each(cases)('%s', (_name, evaluationInput, em, es) => {
    const result = evaluateGroundingSafety(evaluationInput);
    expect(result.meshVoltage).toBeCloseTo(em, 1);
    expect(result.stepVoltage).toBeCloseTo(es, 1);
  });
});

describe('IEEE 80-86 two-layer path', () => {
  it('applies the same Cm / Cs correction on top of the 1986 factors', () => {
    const uniform = evaluateGroundingSafety1986(
      input(perimeter, {
        surfaceResistivity: 2500,
        apparentResistivity: 100,
      }),
    );
    const layered = evaluateGroundingSafety1986(
      input(perimeter, twoLayer(100, 300, 2)),
    );

    const correction = required(
      layered.details.twoLayer,
      'the two-layer correction',
    );
    // same rho1 = 100 and same geometry: Em / Es scale by exactly Cm / Cs
    expect(layered.meshVoltage / uniform.meshVoltage).toBeCloseTo(
      correction.meshCorrection,
      9,
    );
    expect(layered.stepVoltage / uniform.stepVoltage).toBeCloseTo(
      correction.stepCorrection,
      9,
    );
    expect(correction.meshCorrection).toBeCloseTo(1.306538, 5);
  });

  it('reports no correction for uniform soil', () => {
    expect(
      evaluateGroundingSafety1986(input(perimeter, uniform400)).details
        .twoLayer,
    ).toBeNull();
  });
});
