import { ConductorMaterial } from './enum';
import { ConductorsService } from './conductors.service';
import { conductorSizingSchema } from './dto/conductor-sizing.dto';

describe('ConductorsService', () => {
  const service = new ConductorsService();

  it('lists the 14 materials and the standard sizes', async () => {
    const res = await service.getMaterials();
    expect(res.statusCode).toBe(200);
    expect(res.data?.materials).toHaveLength(14);
    expect(res.data?.standardSizesMm2).toEqual([
      16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300,
    ]);
  });

  it('calculates a sizing with rounding to a standard size', async () => {
    const res = await service.calculateSizing({
      material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
      faultCurrent: 10000,
      duration: 0.5,
      ambientTemperature: 40,
    });
    expect(res.statusCode).toBe(200);
    expect(res.data?.minimumAreaMm2).toBeCloseTo(25.1, 1);
    expect(res.data?.standardSizeMm2).toBe(35);
  });

  it('answers 400 with the engine message for invalid input', async () => {
    const res = await service.calculateSizing({
      material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
      faultCurrent: 10000,
      duration: 0.5,
      ambientTemperature: 40,
      allowableTemperature: 30,
    });
    expect(res.statusCode).toBe(400);
    expect(res.data).toBeNull();
    expect(res.messages.length).toBeGreaterThan(0);
  });
});

describe('conductorSizingSchema', () => {
  const valid = {
    material: ConductorMaterial.ALUMINUM_EC_GRADE,
    faultCurrent: 5000,
    duration: 1,
  };

  it('defaults the ambient temperature to 40 °C', () => {
    const parsed = conductorSizingSchema.parse(valid);
    expect(parsed.ambientTemperature).toBe(40);
    expect(parsed.allowableTemperature).toBeUndefined();
  });

  it('rejects an unknown material and non-positive values', () => {
    expect(
      conductorSizingSchema.safeParse({ ...valid, material: 'NOPE' }).success,
    ).toBe(false);
    expect(
      conductorSizingSchema.safeParse({ ...valid, faultCurrent: 0 }).success,
    ).toBe(false);
    expect(
      conductorSizingSchema.safeParse({ ...valid, duration: -1 }).success,
    ).toBe(false);
  });

  it('requires the allowable temperature to exceed the ambient temperature', () => {
    expect(
      conductorSizingSchema.safeParse({
        ...valid,
        ambientTemperature: 50,
        allowableTemperature: 50,
      }).success,
    ).toBe(false);
    expect(
      conductorSizingSchema.safeParse({
        ...valid,
        ambientTemperature: 50,
        allowableTemperature: 250,
      }).success,
    ).toBe(true);
  });
});
