import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { GridsService } from 'src/grids/grids.service';
import { GridElement } from 'src/grids/entities/grid-element.entity';
import { ProjectsService } from 'src/projects/projects.service';
import { SoilLayer } from 'src/soil/entities/soil-layer.entity';
import { SoilModelsService } from 'src/soil/soil-models.service';

import { CalculationsService } from './calculations.service';
import { createCalculationCaseSchema } from './dto/create-calculation-case.dto';
import { CalculationCase } from './entities/calculation-case.entity';
import { CalculationResult } from './entities/calculation-result.entity';
import { CaseConductor } from './entities/case-conductor.entity';
import { CaseFault } from './entities/case-fault.entity';
import { CaseSetting } from './entities/case-setting.entity';
import { StepVoltageMap } from './entities/step-voltage-map.entity';
import { TouchVoltageMap } from './entities/touch-voltage-map.entity';
import { VoltageProfile } from './entities/voltage-profile.entity';
import { ConductorMaterial, DesignMethod, SoilLayeringMethod } from './enum';

type Row = Record<string, unknown>;

/** A fake EntityManager that records what the service creates/saves/deletes. */
function makeManager() {
  const saved: { entity: unknown; row: Row }[] = [];
  const deleted: { entity: unknown; where: unknown }[] = [];
  const manager = {
    create: (entity: unknown, data: Row) => ({ ...data, __entity: entity }),
    save: (entity: unknown, row: Row) => {
      const withId = { ...row, id: `${(entity as { name: string }).name}-1` };
      saved.push({ entity, row: withId });
      return Promise.resolve(withId);
    },
    find: () => Promise.resolve([]),
    delete: (entity: unknown, where: unknown) => {
      deleted.push({ entity, where });
      return Promise.resolve();
    },
  };
  return { manager, saved, deleted };
}

async function build(overrides: {
  conductorFindOne?: Row | null;
  manager: ReturnType<typeof makeManager>['manager'];
}) {
  const project = { id: 'p1' };
  const caseRepo = {
    manager: {
      transaction: (cb: (m: unknown) => unknown) => cb(overrides.manager),
      getRepository: () => ({ count: () => Promise.resolve(0) }),
    },
    createQueryBuilder: () => {
      const qb = {
        leftJoinAndSelect: () => qb,
        where: () => qb,
        getOne: () =>
          Promise.resolve({
            id: 'case-1',
            project,
            grid: { id: 'g1' },
            soilModel: { id: 's1' },
          }),
      };
      return qb;
    },
  };
  const faultRepo = { findOne: () => Promise.resolve({ id: 'f1' }) };
  const settingRepo = { findOne: () => Promise.resolve({ id: 's1' }) };
  const conductorRepo = {
    findOne: () => Promise.resolve(overrides.conductorFindOne ?? null),
  };
  const resultRepo = { find: () => Promise.resolve([]) };
  const empty = {};

  const moduleRef = await Test.createTestingModule({
    providers: [
      CalculationsService,
      { provide: getRepositoryToken(CalculationCase), useValue: caseRepo },
      { provide: getRepositoryToken(CaseFault), useValue: faultRepo },
      { provide: getRepositoryToken(CaseSetting), useValue: settingRepo },
      { provide: getRepositoryToken(CaseConductor), useValue: conductorRepo },
      { provide: getRepositoryToken(CalculationResult), useValue: resultRepo },
      { provide: getRepositoryToken(StepVoltageMap), useValue: empty },
      { provide: getRepositoryToken(TouchVoltageMap), useValue: empty },
      { provide: getRepositoryToken(VoltageProfile), useValue: empty },
      { provide: getRepositoryToken(GridElement), useValue: empty },
      { provide: getRepositoryToken(SoilLayer), useValue: empty },
      {
        provide: ProjectsService,
        useValue: { findOwnedOrAdmin: () => Promise.resolve(project) },
      },
      {
        provide: GridsService,
        useValue: {
          findOwnedOrAdmin: () => Promise.resolve({ id: 'g1', project }),
        },
      },
      {
        provide: SoilModelsService,
        useValue: {
          findOwnedOrAdmin: () => Promise.resolve({ id: 's1', project }),
        },
      },
    ],
  }).compile();

  return moduleRef.get(CalculationsService);
}

const user = { id: 'u1' } as never;

function dto(conductor?: unknown) {
  return createCalculationCaseSchema.parse({
    projectId: 'p1',
    gridId: 'g1',
    soilModelId: 's1',
    name: 'case',
    designMethod: {
      method: DesignMethod.IEEE_80_2000,
      soilLayering: SoilLayeringMethod.ONE_LAYER,
    },
    fault: {
      faultCurrent: 10000,
      faultDuration: 0.5,
      splitFactor: 1,
      shockDuration: 0.5,
    },
    settings: { surfaceLayerResistivity: 3000, surfaceLayerThickness: 0.1 },
    ...(conductor ? { conductor } : {}),
  });
}

describe('CalculationsService: conductor on a case', () => {
  it('create() computes and stores the sizing, defaulting the duration to the fault duration', async () => {
    const { manager, saved } = makeManager();
    const service = await build({ manager });

    const res = await service.create(
      dto({
        material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
        crossSectionMm2: 20,
      }),
      user,
    );

    expect(res.statusCode).toBe(201);
    const conductorRow = saved.find((s) => s.entity === CaseConductor)?.row;
    expect(conductorRow).toBeDefined();
    expect(conductorRow).toMatchObject({
      material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
      ambientTemperature: 40,
      allowableTemperature: 1083,
      sizingDuration: 0.5,
      standardSizeMm2: 35,
      crossSectionMm2: 20,
    });
    expect(conductorRow?.minimumAreaMm2 as number).toBeCloseTo(25.1, 1);
    // 20 mm² is below the 25.1 mm² minimum.
    expect(res.data?.conductor?.crossSectionAdequate).toBe(false);
  });

  it('create() honours an explicit duration and allowable temperature', async () => {
    const { manager, saved } = makeManager();
    const service = await build({ manager });

    await service.create(
      dto({
        material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
        sizingDuration: 1,
        allowableTemperature: 250,
        crossSectionMm2: 120,
      }),
      user,
    );

    const row = saved.find((s) => s.entity === CaseConductor)?.row;
    expect(row).toMatchObject({ sizingDuration: 1, allowableTemperature: 250 });
  });

  it('create() without a conductor stores none and returns conductor: null', async () => {
    const { manager, saved } = makeManager();
    const service = await build({ manager });

    const res = await service.create(dto(), user);

    expect(res.statusCode).toBe(201);
    expect(saved.some((s) => s.entity === CaseConductor)).toBe(false);
    expect(res.data?.conductor).toBeNull();
  });

  it('getOne() returns the conductor with the adequacy flag', async () => {
    const { manager } = makeManager();
    const service = await build({
      manager,
      conductorFindOne: {
        id: 'c1',
        material: ConductorMaterial.ALUMINUM_EC_GRADE,
        minimumAreaMm2: 40,
        crossSectionMm2: 50,
        standardSizeMm2: 50,
      },
    });

    const res = await service.getOne('case-1', user);

    expect(res.statusCode).toBe(200);
    expect(res.data?.conductor).toMatchObject({
      material: ConductorMaterial.ALUMINUM_EC_GRADE,
      crossSectionAdequate: true,
    });
  });

  it('getOne() reports adequacy as null when no cross-section was entered, and conductor null when none stored', async () => {
    const { manager } = makeManager();
    const withStandardOnly = await build({
      manager,
      conductorFindOne: { id: 'c1', minimumAreaMm2: 40, crossSectionMm2: null },
    });
    const a = await withStandardOnly.getOne('case-1', user);
    expect(a.data?.conductor?.crossSectionAdequate).toBeNull();

    const without = await build({ manager });
    const b = await without.getOne('case-1', user);
    expect(b.data?.conductor).toBeNull();
  });

  it('delete() also removes the case conductor', async () => {
    const { manager, deleted } = makeManager();
    const service = await build({ manager });

    const res = await service.delete('case-1', user);

    expect(res.statusCode).toBe(200);
    expect(deleted.some((d) => d.entity === CaseConductor)).toBe(true);
    expect(deleted.some((d) => d.entity === CalculationCase)).toBe(true);
  });
});

describe('createCalculationCaseSchema: conductor', () => {
  it('is optional and defaults the ambient temperature to 40 °C', () => {
    expect(dto().conductor).toBeUndefined();
    const parsed = dto({ material: ConductorMaterial.ALUMINUM_EC_GRADE });
    expect(parsed.conductor?.ambientTemperature).toBe(40);
  });

  it('rejects an unknown material and an allowable temperature below ambient', () => {
    expect(() => dto({ material: 'NOPE' })).toThrow();
    expect(() =>
      dto({
        material: ConductorMaterial.ALUMINUM_EC_GRADE,
        ambientTemperature: 50,
        allowableTemperature: 40,
      }),
    ).toThrow();
  });
});
