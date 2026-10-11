import {
  computeTwoLayerCorrection,
  resolveSoilResistivities,
} from '../two-layer-soil.engine';

// Reference values: line-by-line transcription of Towlay2000.frm
// (`Runbutton_Click`) evaluated outside this code base, for a 70 m x 70 m
// grid, 11 x 11 conductors, h = 0.5 m, d = 0.01 m.
const base = {
  area: 4900,
  burialDepth: 0.5,
  totalConductorLength: 1540,
  meshCount: 100,
};

describe('computeTwoLayerCorrection', () => {
  it('A: no rods, rho2 > rho1, hs < sqrt(A)', () => {
    const r = computeTwoLayerCorrection(
      { upperResistivity: 100, lowerResistivity: 300, upperThickness: 2 },
      { ...base, totalRodLength: 0 },
    );
    expect(r.xhor).toBeCloseTo(0.178811, 5);
    expect(r.yhor).toBeCloseTo(0.399015, 5);
    expect(r.meshCorrection).toBeCloseTo(1.217067, 5);
    expect(r.stepCorrection).toBeCloseTo(1.550166, 5);
  });

  it('B: rods, rho2 < rho1', () => {
    const r = computeTwoLayerCorrection(
      { upperResistivity: 300, lowerResistivity: 100, upperThickness: 2 },
      { ...base, totalRodLength: 24 },
    );
    expect(r.xhor).toBeCloseTo(0.42934, 5);
    expect(r.yhor).toBeCloseTo(0.660133, 5);
    expect(r.meshCorrection).toBeCloseTo(0.623954, 5);
    expect(r.stepCorrection).toBeCloseTo(0.484213, 5);
  });

  it('C: rods, rho2 > rho1', () => {
    const r = computeTwoLayerCorrection(
      { upperResistivity: 100, lowerResistivity: 300, upperThickness: 2 },
      { ...base, totalRodLength: 24 },
    );
    expect(r.xhor).toBeCloseTo(0.24338, 5);
    expect(r.yhor).toBeCloseTo(0.549443, 5);
    expect(r.meshCorrection).toBeCloseTo(1.306538, 5);
    expect(r.stepCorrection).toBeCloseTo(1.828735, 5);
  });

  it('D: no rods and a thick upper layer (hs >= sqrt(A)) gives no correction', () => {
    const r = computeTwoLayerCorrection(
      { upperResistivity: 100, lowerResistivity: 300, upperThickness: 80 },
      { ...base, totalRodLength: 0 },
    );
    expect(r.xhor).toBe(0);
    expect(r.yhor).toBe(0);
    expect(r.meshCorrection).toBe(1);
    expect(r.stepCorrection).toBe(1);
  });

  it('equal resistivities give Cm = Cs = 1', () => {
    const r = computeTwoLayerCorrection(
      { upperResistivity: 200, lowerResistivity: 200, upperThickness: 2 },
      { ...base, totalRodLength: 24 },
    );
    expect(r.meshCorrection).toBeCloseTo(1, 12);
    expect(r.stepCorrection).toBeCloseTo(1, 12);
  });

  it('rejects non-positive inputs and a rod grid with no mesh', () => {
    const layers = {
      upperResistivity: 100,
      lowerResistivity: 300,
      upperThickness: 2,
    };
    expect(() =>
      computeTwoLayerCorrection(
        { ...layers, upperThickness: 0 },
        { ...base, totalRodLength: 0 },
      ),
    ).toThrow();
    expect(() =>
      computeTwoLayerCorrection(
        { ...layers, lowerResistivity: 0 },
        { ...base, totalRodLength: 0 },
      ),
    ).toThrow();
    expect(() =>
      computeTwoLayerCorrection(layers, {
        ...base,
        totalRodLength: 24,
        meshCount: 0,
      }),
    ).toThrow();
  });
});

describe('resolveSoilResistivities', () => {
  it('uniform soil: every resistivity equals the apparent resistivity', () => {
    const r = resolveSoilResistivities(
      { surfaceResistivity: 3000, apparentResistivity: 400 },
      { ...base, totalRodLength: 0 },
    );
    expect(r.meshResistivity).toBe(400);
    expect(r.stepResistivity).toBe(400);
    expect(r.underSurfaceResistivity).toBe(400);
    expect(r.twoLayer).toBeNull();
  });

  it('two-layer soil: rho1 scaled by Cm / Cs, Cs derated against rho1', () => {
    const r = resolveSoilResistivities(
      {
        surfaceResistivity: 3000,
        apparentResistivity: 150,
        twoLayer: {
          upperResistivity: 100,
          lowerResistivity: 300,
          upperThickness: 2,
        },
      },
      { ...base, totalRodLength: 0 },
    );
    expect(r.meshResistivity).toBeCloseTo(121.7067, 3);
    expect(r.stepResistivity).toBeCloseTo(155.0166, 3);
    expect(r.underSurfaceResistivity).toBe(100);
    expect(r.twoLayer).not.toBeNull();
  });
});
