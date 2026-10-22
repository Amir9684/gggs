import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import type { IResponse } from 'src/common/types';
import { GridElement } from 'src/grids/entities/grid-element.entity';
import { GridsService } from 'src/grids/grids.service';
import { ProjectsService } from 'src/projects/projects.service';
import { SoilLayer } from 'src/soil/entities/soil-layer.entity';
import { SoilModelsService } from 'src/soil/soil-models.service';
import UserRole from 'src/users/enum';

import { CalculationsService } from '../calculations.service';
import { previewCalculationSchema } from '../dto/preview-calculation.dto';
import { generateRectangularGrid } from '../engine/grid-generator.engine';
import { CalculationCase } from '../entities/calculation-case.entity';
import { CalculationResult } from '../entities/calculation-result.entity';
import { CaseConductor } from '../entities/case-conductor.entity';
import { CaseFault } from '../entities/case-fault.entity';
import { CaseSetting } from '../entities/case-setting.entity';
import { StepVoltageMap } from '../entities/step-voltage-map.entity';
import { TouchVoltageMap } from '../entities/touch-voltage-map.entity';
import { VoltageProfile } from '../entities/voltage-profile.entity';
import { DesignMethod, SoilLayeringMethod } from '../enum';

const user: TAuthenticatedUserType = {
  id: 'user-1',
  username: 'user-1',
  role: UserRole.ENGINEER,
};

/** The payload of a response that is expected to carry data. */
function dataOf<T>(response: IResponse<T | null>): T {
  if (response.data === null) {
    throw new Error(
      `Expected a response with data, got ${response.statusCode}: ${response.messages.join(' ')}`,
    );
  }
  return response.data;
}

const storedElements = generateRectangularGrid({
  length: 70,
  width: 70,
  burialDepth: 0.5,
  conductorDiameter: 0.01,
  lineCounts: { alongLength: 11, alongWidth: 11 },
  rods: { arrangement: 'PERIMETER', count: 8, length: 3 },
}).elements;

async function makeService(
  overrides: {
    method?: DesignMethod;
    layering?: SoilLayeringMethod | null;
    fault?: Record<string, unknown>;
    layers?: Array<Record<string, unknown>>;
  } = {},
) {
  const calculationCase = {
    id: 'case-1',
    designMethod: overrides.method ?? DesignMethod.IEEE_80_2000,
    soilLayering: overrides.layering ?? SoilLayeringMethod.ONE_LAYER,
    project: { id: 'project-1' },
    grid: { length: '70', width: '70', burialDepth: '0.5' },
    soilModel: { id: 'soil-1', surfaceResistivity: '400' },
  };

  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(calculationCase),
  };

  const transaction = jest.fn();
  const save = jest.fn();

  const repo = (extra: Record<string, unknown> = {}) => ({
    manager: { transaction },
    save,
    insert: jest.fn(),
    ...extra,
  });

  // Real dependency injection with fake providers (`useValue` is not
  // checked against the repositories' types), in the constructor's order.
  const moduleRef = await Test.createTestingModule({
    providers: [
      CalculationsService,
      {
        provide: getRepositoryToken(CalculationCase),
        useValue: repo({ createQueryBuilder: jest.fn(() => queryBuilder) }),
      },
      {
        provide: getRepositoryToken(CaseFault),
        useValue: repo({
          findOne: jest.fn().mockResolvedValue({
            faultCurrent: '3180',
            faultDuration: '0.5',
            splitFactor: '0.6',
            decrementFactor: '1',
            shockDuration: '0.5',
            ...overrides.fault,
          }),
        }),
      },
      {
        provide: getRepositoryToken(CaseSetting),
        useValue: repo({
          findOne: jest.fn().mockResolvedValue({
            surfaceLayerResistivity: '2500',
            surfaceLayerThickness: '0.102',
            bodyWeight: '70',
            frequency: '60',
          }),
        }),
      },
      { provide: getRepositoryToken(CaseConductor), useValue: repo() },
      { provide: getRepositoryToken(CalculationResult), useValue: repo() },
      { provide: getRepositoryToken(StepVoltageMap), useValue: repo() },
      { provide: getRepositoryToken(TouchVoltageMap), useValue: repo() },
      { provide: getRepositoryToken(VoltageProfile), useValue: repo() },
      {
        provide: getRepositoryToken(GridElement),
        useValue: repo({ find: jest.fn().mockResolvedValue(storedElements) }),
      },
      {
        provide: getRepositoryToken(SoilLayer),
        useValue: repo({
          find: jest
            .fn()
            .mockResolvedValue(
              overrides.layers ?? [
                { resistivity: '400', thickness: '10', layerOrder: 0 },
              ],
            ),
        }),
      },
      {
        provide: ProjectsService,
        useValue: {
          findOwnedOrAdmin: jest.fn().mockResolvedValue({ id: 'project-1' }),
        },
      },
      { provide: GridsService, useValue: {} },
      { provide: SoilModelsService, useValue: {} },
    ],
  }).compile();
  const service = moduleRef.get(CalculationsService);

  return { service, transaction, save };
}

const parse = (input: unknown) => previewCalculationSchema.parse(input);

describe('CalculationsService.preview', () => {
  it('evaluates the stored case without saving anything', async () => {
    const { service, transaction, save } = await makeService();
    const res = await service.preview('case-1', parse({}), user);

    expect(res.statusCode).toBe(200);
    expect(res.data?.meshVoltage).toBeCloseTo(847.9199, 1);
    expect(res.data?.generated).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('re-derives Df when only the fault duration is overridden', async () => {
    const { service } = await makeService();
    const stored = await service.preview('case-1', parse({}), user);
    const shorter = await service.preview(
      'case-1',
      parse({ fault: { faultDuration: 0.1 } }),
      user,
    );

    // stored Df = 1.0; 0.1 s -> Df 1.25, so the grid current grows by 25 %
    expect(shorter.data?.details.effectiveGridCurrent).toBeCloseTo(
      dataOf(stored).details.effectiveGridCurrent * 1.25,
      6,
    );
  });

  it('keeps an explicit Df over the derived one', async () => {
    const { service } = await makeService();
    const res = await service.preview(
      'case-1',
      parse({ fault: { faultDuration: 0.1, decrementFactor: 1.0 } }),
      user,
    );
    const stored = await service.preview('case-1', parse({}), user);
    expect(res.data?.details.effectiveGridCurrent).toBeCloseTo(
      dataOf(stored).details.effectiveGridCurrent,
      6,
    );
  });

  it('uses a parametric grid instead of the stored one', async () => {
    const { service } = await makeService();
    const res = await service.preview(
      'case-1',
      parse({
        grid: {
          length: 70,
          width: 70,
          burialDepth: 0.5,
          conductorDiameter: 0.01,
          alongLengthCount: 6,
          alongWidthCount: 6,
          rods: { arrangement: 'NONE', count: 0, length: 0 },
        },
      }),
      user,
    );

    expect(res.statusCode).toBe(200);
    expect(res.data?.generated?.conductorCount).toBe(12);
    // fewer, wider-spaced conductors and no rods: higher mesh voltage
    expect(dataOf(res).meshVoltage).toBeGreaterThan(847.9199);
  });

  it('derives line counts from a spacing', async () => {
    const { service } = await makeService();
    const res = await service.preview(
      'case-1',
      parse({
        grid: {
          length: 70,
          width: 70,
          burialDepth: 0.5,
          conductorDiameter: 0.01,
          spacing: 7,
        },
      }),
      user,
    );
    expect(res.data?.generated?.conductorCount).toBe(22);
  });

  it('answers 400 for generator parameters the grid cannot satisfy', async () => {
    const { service } = await makeService();
    const res = await service.preview(
      'case-1',
      parse({
        grid: {
          length: 70,
          width: 70,
          burialDepth: 0.5,
          conductorDiameter: 0.01,
          alongLengthCount: 3,
          alongWidthCount: 3,
          rods: { arrangement: 'INTERIOR', count: 5, length: 3 },
        },
      }),
      user,
    );
    expect(res.statusCode).toBe(400);
    expect(res.data).toBeNull();
  });

  it("shares run()'s validation (two-layer soil needs two layers)", async () => {
    const { service } = await makeService({
      layering: SoilLayeringMethod.TWO_LAYER,
    });
    const res = await service.preview('case-1', parse({}), user);
    expect(res.statusCode).toBe(400);
    expect(res.messages[0]).toMatch(/دقیقاً دو لایه/);
  });

  it('uses the 1986 engine for IEEE 80-86 cases', async () => {
    const { service: serviceA } = await makeService({
      method: DesignMethod.IEEE_80_2000,
    });
    const a = await serviceA.preview('case-1', parse({}), user);
    const { service: serviceB } = await makeService({
      method: DesignMethod.IEEE_80_86,
    });
    const b = await serviceB.preview('case-1', parse({}), user);
    expect(dataOf(b).meshVoltage).not.toBeCloseTo(dataOf(a).meshVoltage, 3);
  });

  it('refuses a method without an engine', async () => {
    const { service } = await makeService({ method: DesignMethod.GALERKIN });
    const res = await service.preview('case-1', parse({}), user);
    expect(res.statusCode).toBe(400);
  });
});

describe('previewCalculationSchema', () => {
  it('rejects a grid with neither spacing nor line counts', () => {
    expect(
      previewCalculationSchema.safeParse({
        grid: {
          length: 70,
          width: 70,
          burialDepth: 0.5,
          conductorDiameter: 0.01,
        },
      }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range split factor', () => {
    expect(
      previewCalculationSchema.safeParse({ fault: { splitFactor: 1.5 } })
        .success,
    ).toBe(false);
  });
});
