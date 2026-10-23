import { DEFAULT_GALERKIN_SETTINGS } from '../../galerkin-settings';
import {
  buildGalerkinInput,
  type GalerkinElementLike,
} from '../galerkin-input.builder';
import { evaluateGalerkinGrid } from '../galerkin-safety.engine';

function gridElements(lines: number, size = 70): GalerkinElementLike[] {
  const elements: GalerkinElementLike[] = [];
  for (let i = 0; i < lines; i += 1) {
    const offset = (size / (lines - 1)) * i;
    elements.push({
      type: 0,
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, offset],
          [size, offset],
        ],
      },
      properties: {},
    });
    elements.push({
      type: 0,
      geometry: {
        type: 'LineString',
        coordinates: [
          [offset, 0],
          [offset, size],
        ],
      },
      properties: {},
    });
  }
  return elements;
}

function input(lines: number, current = 1908, size = 70) {
  return buildGalerkinInput({
    elements: gridElements(lines, size),
    burialDepth: 0.5,
    conductorRadius: 0.005,
    soilResistivity: 400,
    groundCurrent: current,
    settings: { ...DEFAULT_GALERKIN_SETTINGS, segmentLength: 7 },
  }).input;
}

describe('evaluateGalerkinGrid', () => {
  const generous = { touch: 1e9, step: 1e9 };

  it('returns Rg, GPR and sensible worst voltages', () => {
    const result = evaluateGalerkinGrid(input(11), generous);

    expect(result.gridResistance).toBeGreaterThan(2);
    expect(result.gridResistance).toBeLessThan(3.2);
    expect(result.gpr).toBeCloseTo(result.gridResistance * 1908, 6);
    expect(result.touchVoltage).toBeGreaterThan(0);
    expect(result.touchVoltage).toBeLessThan(result.gpr);
    expect(result.stepVoltage).toBeGreaterThan(0);
    expect(result.stepVoltage).toBeLessThan(result.touchVoltage);
  });

  it('judges safety against the permissible voltages', () => {
    const base = evaluateGalerkinGrid(input(11), generous);

    expect(base.safe).toBe(true);
    expect(
      evaluateGalerkinGrid(input(11), {
        touch: base.touchVoltage * 0.9,
        step: 1e9,
      }).safe,
    ).toBe(false);
    expect(
      evaluateGalerkinGrid(input(11), {
        touch: 1e9,
        step: base.stepVoltage * 0.9,
      }).safe,
    ).toBe(false);
  });

  it('scales the voltages with the injected current', () => {
    const one = evaluateGalerkinGrid(input(6, 1000), generous);
    const two = evaluateGalerkinGrid(input(6, 2000), generous);

    expect(two.touchVoltage / one.touchVoltage).toBeCloseTo(2, 6);
    expect(two.stepVoltage / one.stepVoltage).toBeCloseTo(2, 6);
  });

  it('gives a denser grid a lower touch voltage', () => {
    const sparse = evaluateGalerkinGrid(input(4), generous);
    const dense = evaluateGalerkinGrid(input(11), generous);

    expect(dense.touchVoltage / dense.gpr).toBeLessThan(
      sparse.touchVoltage / sparse.gpr,
    );
  });

  it('fills the maps and the diagonal profile', () => {
    const { samples } = evaluateGalerkinGrid(input(6), generous);

    expect(samples.touchVoltageMap).toHaveLength(400);
    expect(samples.stepVoltageMap).toHaveLength(400);
    expect(samples.voltageProfile).toHaveLength(20);
    expect(samples.voltageProfile[0]).toMatchObject({ x: 0, y: 0 });
    expect(samples.voltageProfile[19]).toMatchObject({ x: 70, y: 70 });
    expect(samples.touchVoltageMap.every((p) => p.value >= 0)).toBe(true);
  });

  it('reports the element counts and the surge impedance for 4 to 64 meshes', () => {
    // 5 x 5 conductors = 16 meshes.
    const small = evaluateGalerkinGrid(input(5), generous);
    expect(small.details.meshCount).toBe(16);
    expect(small.details.surgeImpedance).not.toBeNull();
    expect(small.details.surgeImpedance as number).toBeGreaterThan(
      small.gridResistance,
    );

    // 11 x 11 conductors = 100 meshes: outside the surge impedance range.
    const large = evaluateGalerkinGrid(input(11), generous);
    expect(large.details.meshCount).toBe(100);
    expect(large.details.surgeImpedance).toBeNull();
    expect(large.details.segmentCount).toBe(220);
  });
});
