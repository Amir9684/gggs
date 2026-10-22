/* eslint-disable @typescript-eslint/require-await -- mock-heavy spec */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import { HttpStatus } from 'src/common/types';
import type { IResponse } from 'src/common/types';
import { GridElement } from 'src/grids/entities/grid-element.entity';
import { GridsService } from 'src/grids/grids.service';
import { ProjectsService } from 'src/projects/projects.service';
import { SoilLayer } from 'src/soil/entities/soil-layer.entity';
import { SoilModelsService } from 'src/soil/soil-models.service';
import UserRole from 'src/users/enum';

import { CalculationsService } from './calculations.service';
import { CalculationCase } from './entities/calculation-case.entity';
import { CalculationResult } from './entities/calculation-result.entity';
import { CaseConductor } from './entities/case-conductor.entity';
import { CaseFault } from './entities/case-fault.entity';
import { CaseSetting } from './entities/case-setting.entity';
import { StepVoltageMap } from './entities/step-voltage-map.entity';
import { TouchVoltageMap } from './entities/touch-voltage-map.entity';
import { VoltageProfile } from './entities/voltage-profile.entity';
import { DesignMethod, SoilLayeringMethod } from './enum';
import type { PreviewCalculationDto } from './dto/preview-calculation.dto';
import { GridElementType } from 'src/grids/enum';

const user: TAuthenticatedUserType = {
  id: 'u1',
  username: 'u1',
  role: UserRole.ENGINEER,
};

type PreviewElement = NonNullable<PreviewCalculationDto['elements']>[number];

/** The payload of a response that is expected to carry data. */
function dataOf<T>(response: IResponse<T | null>): T {
  if (response.data === null) {
    throw new Error(
      `Expected a response with data, got ${response.statusCode}: ${response.messages.join(' ')}`,
    );
  }
  return response.data;
}

/** A 60 x 40 m grid, conductors every 10 m (7 x 5 lines), one 3 m rod. */
function gridElements(extra: { rodLengthKey?: 'length' | 'lengthM' } = {}) {
  const elements: PreviewElement[] = [];
  for (let y = 0; y <= 40; y += 10) {
    elements.push({
      type: 0,
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, y],
          [60, y],
        ],
      },
      properties: { crossSectionMm2: 70 },
    });
  }
  for (let x = 0; x <= 60; x += 10) {
    elements.push({
      type: 0,
      geometry: {
        type: 'LineString',
        coordinates: [
          [x, 0],
          [x, 40],
        ],
      },
      properties: { crossSectionMm2: 70 },
    });
  }
  elements.push({
    type: 1,
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: { [extra.rodLengthKey ?? 'lengthM']: 3 },
  });
  return elements;
}

interface FakeQueryBuilder<Row> {
  leftJoinAndSelect: () => FakeQueryBuilder<Row>;
  where: () => FakeQueryBuilder<Row>;
  getOne: () => Promise<Row>;
}

async function setup(
  overrides: {
    fault?: unknown;
    settings?: unknown;
    elements?: PreviewElement[];
  } = {},
) {
  const calculationCase = {
    id: 'c1',
    designMethod: DesignMethod.IEEE_80_2000,
    soilLayering: SoilLayeringMethod.ONE_LAYER,
    project: { id: 'p1' },
    grid: { id: 'g1', length: 60, width: 40, burialDepth: 0.5 },
    soilModel: { id: 's1', surfaceResistivity: 100 },
  };

  const fault =
    'fault' in overrides
      ? overrides.fault
      : {
          faultCurrent: 5000,
          faultDuration: 0.5,
          splitFactor: 0.6,
          decrementFactor: 1,
          shockDuration: 0.5,
        };
  const settings =
    'settings' in overrides
      ? overrides.settings
      : {
          surfaceLayerResistivity: 2500,
          surfaceLayerThickness: 0.1,
          bodyWeight: 70,
          frequency: 50,
        };

  const persisted = jest.fn();
  const calculationCaseRepository = {
    createQueryBuilder: () => {
      const qb: FakeQueryBuilder<typeof calculationCase> = {
        leftJoinAndSelect: () => qb,
        where: () => qb,
        getOne: async () => calculationCase,
      };
      return qb;
    },
  };
  const gridElementRepository = {
    find: jest.fn(async () => overrides.elements ?? gridElements()),
  };

  // Real dependency injection with fake providers: `useValue` is not
  // type-checked against the repositories, so the fakes only need the
  // members the service actually calls.
  const moduleRef = await Test.createTestingModule({
    providers: [
      CalculationsService,
      {
        provide: getRepositoryToken(CalculationCase),
        useValue: calculationCaseRepository,
      },
      {
        provide: getRepositoryToken(CaseFault),
        useValue: { findOne: async () => fault },
      },
      {
        provide: getRepositoryToken(CaseSetting),
        useValue: { findOne: async () => settings },
      },
      { provide: getRepositoryToken(CaseConductor), useValue: {} },
      {
        provide: getRepositoryToken(CalculationResult),
        useValue: {
          manager: {
            transaction: async (work: (m: unknown) => unknown) => {
              persisted();
              return work({
                create: (_entity: unknown, data: object) => data,
                save: async (_entity: unknown, data: object) =>
                  Array.isArray(data) ? data : { id: 'r1', ...data },
              });
            },
          },
          save: persisted,
        },
      },
      {
        provide: getRepositoryToken(StepVoltageMap),
        useValue: { save: persisted },
      },
      {
        provide: getRepositoryToken(TouchVoltageMap),
        useValue: { save: persisted },
      },
      {
        provide: getRepositoryToken(VoltageProfile),
        useValue: { save: persisted },
      },
      {
        provide: getRepositoryToken(GridElement),
        useValue: gridElementRepository,
      },
      {
        provide: getRepositoryToken(SoilLayer),
        useValue: {
          find: async () => [{ resistivity: 100, thickness: 0, layerOrder: 1 }],
        },
      },
      {
        provide: ProjectsService,
        useValue: { findOwnedOrAdmin: async () => ({ id: 'p1' }) },
      },
      { provide: GridsService, useValue: {} },
      { provide: SoilModelsService, useValue: {} },
    ],
  }).compile();

  const service = moduleRef.get(CalculationsService);

  return { service, persisted, gridElementRepository };
}

describe('CalculationsService.preview', () => {
  it('returns the engine numbers and persists nothing', async () => {
    const { service, persisted } = await setup();

    const response = await service.preview('c1', {}, user);

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(dataOf(response).gridResistance).toBeGreaterThan(0);
    expect(dataOf(response).gpr).toBeCloseTo(
      dataOf(response).gridResistance * 5000 * 0.6,
      6,
    );
    expect(dataOf(response).details.grid.conductorCountAlongLength).toBe(5);
    expect(dataOf(response).details.grid.conductorCountAlongWidth).toBe(7);
    expect(persisted).not.toHaveBeenCalled();
  });

  it('counts the rods the editor draws (properties.lengthM)', async () => {
    const { service } = await setup();
    const response = await service.preview('c1', {}, user);
    expect(dataOf(response).grid.rodCount).toBe(1);
    expect(dataOf(response).grid.totalRodLength).toBe(3);
  });

  it('scales GPR with an overridden fault current', async () => {
    const { service } = await setup();

    const base = await service.preview('c1', {}, user);
    const doubled = await service.preview(
      'c1',
      { fault: { faultCurrent: 10000 } },
      user,
    );

    expect(dataOf(doubled).gridResistance).toBeCloseTo(
      dataOf(base).gridResistance,
      9,
    );
    expect(dataOf(doubled).gpr).toBeCloseTo(dataOf(base).gpr * 2, 6);
  });

  it('re-derives Df when only the fault duration is overridden', async () => {
    const { service } = await setup();

    const response = await service.preview(
      'c1',
      { fault: { faultDuration: 0.1 } },
      user,
    );
    expect(dataOf(response).decrementFactor).toBe(1.25);

    const explicit = await service.preview(
      'c1',
      { fault: { faultDuration: 0.1, decrementFactor: 1.4 } },
      user,
    );
    expect(dataOf(explicit).decrementFactor).toBe(1.4);
  });

  it('previews unsaved elements without reading the saved ones', async () => {
    const { service, gridElementRepository } = await setup();

    const elements = gridElements().filter(
      (e) => e.type === GridElementType.CONDUCTOR,
    );
    const response = await service.preview('c1', { elements }, user);

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(dataOf(response).grid.rodCount).toBe(0);
    expect(gridElementRepository.find).not.toHaveBeenCalled();
  });

  it('uses overridden grid dimensions', async () => {
    const { service } = await setup();
    const response = await service.preview(
      'c1',
      { grid: { length: 80, width: 50 } },
      user,
    );
    expect(dataOf(response).grid.area).toBe(4000);
  });

  it('rejects invalid overrides with the same messages as run()', async () => {
    const { service } = await setup();
    const response = await service.preview(
      'c1',
      { fault: { splitFactor: 1.5 } },
      user,
    );
    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('refuses a case without fault data', async () => {
    const { service } = await setup({ fault: null });
    const response = await service.preview('c1', {}, user);
    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('stores the same numbers when the case is run for real', async () => {
    const { service, persisted } = await setup();

    const preview = await service.preview('c1', {}, user);
    expect(persisted).not.toHaveBeenCalled();

    const run = await service.run('c1', user);
    expect(run.statusCode).toBe(HttpStatus.CREATED);
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(dataOf(run).gpr).toBe(dataOf(preview).gpr);
    expect(dataOf(run).touchVoltage).toBe(dataOf(preview).touchVoltage);
    expect(dataOf(run).stepVoltage).toBe(dataOf(preview).stepVoltage);
    expect(dataOf(run).safe).toBe(dataOf(preview).safe);
  });
});
