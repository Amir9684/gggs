import { ConductorMaterial } from '../../enum';
import {
  CONDUCTOR_MATERIALS,
  getConductorMaterial,
} from '../conductor-material.catalog';

describe('conductor material catalog', () => {
  it('has the 14 Windows GGGS materials, one per enum value', () => {
    expect(CONDUCTOR_MATERIALS).toHaveLength(14);
    const ids = CONDUCTOR_MATERIALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(14);
    expect([...ids].sort()).toEqual(Object.values(ConductorMaterial).sort());
  });

  it('matches the Windows values for annealed soft copper', () => {
    expect(
      getConductorMaterial(ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN),
    ).toMatchObject({
      alphaR: 0.00393,
      k0: 234,
      fusingTemperature: 1083,
      rhoR: 1.7241,
      tcap: 3.422,
      defaultDuration: 0.5,
    });
  });

  it('matches the Windows values for stainless steel 304 and zinc-coated steel', () => {
    expect(
      getConductorMaterial(ConductorMaterial.STAINLESS_STEEL_304),
    ).toMatchObject({
      alphaR: 0.0013,
      k0: 746,
      fusingTemperature: 1400,
      rhoR: 72,
      tcap: 4.032,
    });
    expect(
      getConductorMaterial(ConductorMaterial.ZINC_COATED_STEEL_1),
    ).toMatchObject({
      fusingTemperature: 419,
      rhoR: 20.1,
    });
  });

  it('keeps every constant physically sensible', () => {
    for (const m of CONDUCTOR_MATERIALS) {
      expect(m.alphaR).toBeGreaterThan(0);
      expect(m.k0).toBeGreaterThan(0);
      expect(m.fusingTemperature).toBeGreaterThan(100);
      expect(m.rhoR).toBeGreaterThan(0);
      expect(m.tcap).toBeGreaterThan(0);
      expect([0.5, 1]).toContain(m.defaultDuration);
    }
  });

  it('throws for an unknown material id', () => {
    expect(() => getConductorMaterial('NOPE' as ConductorMaterial)).toThrow();
  });
});
