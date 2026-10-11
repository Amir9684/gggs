import { ConductorMaterial } from '../../enum';
import {
  computeConductorSizing,
  MM2_PER_KCMIL,
  roundUpToStandardSize,
  STANDARD_CONDUCTOR_SIZES_MM2,
} from '../conductor-sizing.engine';

describe('computeConductorSizing', () => {
  it('reproduces the IEEE 80 Kf value for annealed soft copper (about 7.0 kcmil per kA·√s)', () => {
    // IEEE 80 Table 2: Kf = 7.00 for copper annealed soft-drawn,
    // Tm = 1083 °C, Ta = 40 °C.  1 kA for 1 s -> ~7.0 kcmil.
    const r = computeConductorSizing({
      material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
      faultCurrent: 1000,
      duration: 1,
      ambientTemperature: 40,
    });
    expect(r.minimumAreaKcmil).toBeCloseTo(7.0, 1);
  });

  it('matches a hand-computed value (copper, 10 kA, 0.5 s, Ta 40)', () => {
    const r = computeConductorSizing({
      material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
      faultCurrent: 10000,
      duration: 0.5,
      ambientTemperature: 40,
    });
    const heating = (0.5 * 0.00393 * 1.7241 * 10000) / 3.422;
    const log = Math.log(1 + (1083 - 40) / (234 + 40));
    expect(r.minimumAreaMm2).toBeCloseTo(
      0.001 * 10000 * Math.sqrt(heating / log),
      9,
    );
    expect(r.minimumAreaMm2).toBeCloseTo(25.1, 1);
    expect(r.standardSizeMm2).toBe(35);
    expect(r.allowableTemperature).toBe(1083);
    expect(r.minimumAreaKcmil).toBeCloseTo(r.minimumAreaMm2 / MM2_PER_KCMIL, 9);
  });

  it('scales linearly with current and with the square root of time', () => {
    const base = computeConductorSizing({
      material: ConductorMaterial.ALUMINUM_EC_GRADE,
      faultCurrent: 5000,
      duration: 1,
      ambientTemperature: 40,
    });
    const doubleCurrent = computeConductorSizing({
      material: ConductorMaterial.ALUMINUM_EC_GRADE,
      faultCurrent: 10000,
      duration: 1,
      ambientTemperature: 40,
    });
    const quadTime = computeConductorSizing({
      material: ConductorMaterial.ALUMINUM_EC_GRADE,
      faultCurrent: 5000,
      duration: 4,
      ambientTemperature: 40,
    });
    expect(doubleCurrent.minimumAreaMm2 / base.minimumAreaMm2).toBeCloseTo(
      2,
      9,
    );
    expect(quadTime.minimumAreaMm2 / base.minimumAreaMm2).toBeCloseTo(2, 9);
  });

  it('needs a larger conductor when the allowable temperature is lower', () => {
    const fusing = computeConductorSizing({
      material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
      faultCurrent: 10000,
      duration: 0.5,
      ambientTemperature: 40,
    });
    const limited = computeConductorSizing({
      material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
      faultCurrent: 10000,
      duration: 0.5,
      ambientTemperature: 40,
      allowableTemperature: 250,
    });
    expect(limited.allowableTemperature).toBe(250);
    expect(limited.minimumAreaMm2).toBeGreaterThan(fusing.minimumAreaMm2);
  });

  it('gives a larger area for a higher ambient temperature', () => {
    const cool = computeConductorSizing({
      material: ConductorMaterial.STAINLESS_STEEL_304,
      faultCurrent: 8000,
      duration: 1,
      ambientTemperature: 20,
    });
    const hot = computeConductorSizing({
      material: ConductorMaterial.STAINLESS_STEEL_304,
      faultCurrent: 8000,
      duration: 1,
      ambientTemperature: 60,
    });
    expect(hot.minimumAreaMm2).toBeGreaterThan(cool.minimumAreaMm2);
  });

  it('returns no standard size above 300 mm²', () => {
    const r = computeConductorSizing({
      material: ConductorMaterial.ZINC_COATED_STEEL_1,
      faultCurrent: 60000,
      duration: 1,
      ambientTemperature: 40,
    });
    expect(r.minimumAreaMm2).toBeGreaterThan(300);
    expect(r.standardSizeMm2).toBeNull();
  });

  it('rejects invalid inputs', () => {
    const ok = {
      material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
      faultCurrent: 1000,
      duration: 1,
      ambientTemperature: 40,
    };
    expect(() => computeConductorSizing({ ...ok, faultCurrent: 0 })).toThrow();
    expect(() => computeConductorSizing({ ...ok, duration: -1 })).toThrow();
    expect(() =>
      computeConductorSizing({ ...ok, allowableTemperature: 40 }),
    ).toThrow();
    expect(() =>
      computeConductorSizing({ ...ok, ambientTemperature: 2000 }),
    ).toThrow();
  });
});

describe('roundUpToStandardSize (Windows rule: <= bound -> that size)', () => {
  it('uses the exact sizes 16 to 300 mm²', () => {
    expect([...STANDARD_CONDUCTOR_SIZES_MM2]).toEqual([
      16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300,
    ]);
  });

  it('keeps a value equal to a size and rounds anything above it up', () => {
    expect(roundUpToStandardSize(10)).toBe(16);
    expect(roundUpToStandardSize(16)).toBe(16);
    expect(roundUpToStandardSize(16.0001)).toBe(25);
    expect(roundUpToStandardSize(25)).toBe(25);
    expect(roundUpToStandardSize(95.5)).toBe(120);
    expect(roundUpToStandardSize(240)).toBe(240);
    expect(roundUpToStandardSize(300)).toBe(300);
  });

  it('returns null above 300', () => {
    expect(roundUpToStandardSize(300.01)).toBeNull();
  });
});
