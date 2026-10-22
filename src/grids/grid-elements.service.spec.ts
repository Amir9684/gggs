/* eslint-disable @typescript-eslint/require-await -- async fakes stand in for repository calls */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import { HttpStatus } from 'src/common/types';
import type { IResponse } from 'src/common/types';
import UserRole from 'src/users/enum';

import type { CreateGridElementsBulkDto } from './dto/create-grid-element.dto';
import { GridElementsService } from './grid-elements.service';
import { GridsService } from './grids.service';
import { Grid } from './entities/grid.entity';
import { GridElement } from './entities/grid-element.entity';
import { GridSnapshot } from './entities/grid-snapshot.entity';

const user: TAuthenticatedUserType = {
  id: 'u1',
  username: 'u1',
  role: UserRole.ENGINEER,
};

type BulkElement = CreateGridElementsBulkDto['elements'][number];

/** The payload of a response that is expected to carry data. */
function dataOf<T>(response: IResponse<T | null>): T {
  if (response.data === null) {
    throw new Error(
      `Expected a response with data, got ${response.statusCode}: ${response.messages.join(' ')}`,
    );
  }
  return response.data;
}

async function setup(options: { grid?: unknown; snapshotData?: string } = {}) {
  const calls: string[] = [];
  const manager = {
    update: jest.fn(
      async (entity: unknown, where: unknown, values: unknown) => {
        calls.push('update');
        return { entity, where, values };
      },
    ),
    delete: jest.fn(async () => {
      calls.push('delete');
    }),
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn(async (_entity: unknown, rows: object[]) => {
      calls.push('save');
      return rows.map((row, index) => ({
        id: `e${index}`,
        ...row,
      }));
    }),
  };
  const elementRepository = {
    manager: {
      transaction: jest.fn(async (work: (m: typeof manager) => unknown) =>
        work(manager),
      ),
    },
  };
  const snapshotQuery = {
    leftJoinAndSelect: () => snapshotQuery,
    where: () => snapshotQuery,
    getOne: async () => ({
      id: 's1',
      grid: { id: 'g1' },
      snapshotData: options.snapshotData ?? '[]',
    }),
  };
  const snapshotRepository = { createQueryBuilder: () => snapshotQuery };
  const gridsService = {
    findOwnedOrAdmin: jest.fn(async () =>
      'grid' in options ? options.grid : { id: 'g1' },
    ),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      GridElementsService,
      {
        provide: getRepositoryToken(GridElement),
        useValue: elementRepository,
      },
      {
        provide: getRepositoryToken(GridSnapshot),
        useValue: snapshotRepository,
      },
      { provide: GridsService, useValue: gridsService },
    ],
  }).compile();
  const service = moduleRef.get(GridElementsService);
  return { service, manager, elementRepository, calls };
}

const element: BulkElement = {
  type: 0,
  geometry: {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [10, 0],
    ],
  },
  properties: {},
};

describe('GridElementsService.createBulk', () => {
  it('replaces the elements inside one transaction', async () => {
    const { service, manager, elementRepository, calls } = await setup();

    const response = await service.createBulk(
      { gridId: 'g1', elements: [element, element] },
      user,
    );

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(dataOf(response)).toHaveLength(2);
    expect(elementRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.update).not.toHaveBeenCalled();
    expect(calls).toEqual(['delete', 'save']);
  });

  it('updates the grid dimensions in the same transaction, before the elements', async () => {
    const { service, manager, calls } = await setup();

    await service.createBulk(
      {
        gridId: 'g1',
        elements: [element],
        grid: { length: 60, width: 40, burialDepth: 0.6 },
      },
      user,
    );

    expect(manager.update).toHaveBeenCalledWith(
      Grid,
      { id: 'g1' },
      { length: 60, width: 40, burialDepth: 0.6 },
    );
    expect(manager.delete).toHaveBeenCalledWith(GridElement, {
      grid: { id: 'g1' },
    });
    expect(calls).toEqual(['update', 'delete', 'save']);
  });

  it('only updates the dimensions that were sent', async () => {
    const { service, manager } = await setup();

    await service.createBulk(
      { gridId: 'g1', elements: [element], grid: { burialDepth: 0.8 } },
      user,
    );

    expect(manager.update).toHaveBeenCalledWith(
      Grid,
      { id: 'g1' },
      { burialDepth: 0.8 },
    );
  });

  it("returns 404 and touches nothing when the grid is not the user's", async () => {
    const { service, elementRepository } = await setup({ grid: null });

    const response = await service.createBulk(
      { gridId: 'g1', elements: [element] },
      user,
    );

    expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(elementRepository.manager.transaction).not.toHaveBeenCalled();
  });
});

describe('GridElementsService.generate', () => {
  const parameters = {
    gridId: 'g1',
    length: 60,
    width: 40,
    burialDepth: 0.6,
    conductorDiameter: 0.01,
    alongLengthCount: 5,
    alongWidthCount: 7,
    rods: { arrangement: 'CORNERS' as const, count: 0, length: 3 },
  };

  it('replaces the elements and the grid dimensions in one transaction', async () => {
    const { service, manager, elementRepository, calls } = await setup();

    const response = await service.generate(parameters, user);

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    const { elements, summary } = dataOf(response);
    // 5 + 7 conductor lines and 4 corner rods
    expect(elements).toHaveLength(16);
    expect(summary.conductorCount).toBe(12);
    expect(summary.rodCount).toBe(4);
    expect(elementRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(
      Grid,
      { id: 'g1' },
      { length: 60, width: 40, burialDepth: 0.6 },
    );
    expect(manager.delete).toHaveBeenCalledWith(GridElement, {
      grid: { id: 'g1' },
    });
    expect(calls).toEqual(['update', 'delete', 'save']);
  });

  it("returns 404 and touches nothing when the grid is not the user's", async () => {
    const { service, elementRepository } = await setup({ grid: null });

    const response = await service.generate(parameters, user);

    expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(elementRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('returns 400 and saves nothing when the parameters cannot make a grid', async () => {
    const { service, elementRepository } = await setup();

    const response = await service.generate(
      {
        ...parameters,
        alongLengthCount: undefined,
        alongWidthCount: undefined,
        spacing: undefined,
      },
      user,
    );

    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(elementRepository.manager.transaction).not.toHaveBeenCalled();
  });
});

describe('GridElementsService.restoreSnapshot', () => {
  it('re-creates the stored elements inside one transaction', async () => {
    const { service, manager, calls } = await setup({
      snapshotData: JSON.stringify([
        { ...element, id: 'old1', createdAt: '2026-01-01T00:00:00.000Z' },
        { ...element, properties: null },
      ]),
    });

    const response = await service.restoreSnapshot('s1', user);

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(dataOf(response)).toHaveLength(2);
    expect(manager.delete).toHaveBeenCalledWith(GridElement, {
      grid: { id: 'g1' },
    });
    expect(calls).toEqual(['delete', 'save']);
  });

  it.each([
    ['not JSON', 'not json'],
    ['not an array', '{"type":0}'],
    ['an element without geometry', '[{"type":0,"properties":{}}]'],
  ])(
    'refuses a corrupted snapshot (%s) and saves nothing',
    async (_name, snapshotData) => {
      const { service, elementRepository } = await setup({ snapshotData });

      const response = await service.restoreSnapshot('s1', user);

      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(elementRepository.manager.transaction).not.toHaveBeenCalled();
    },
  );
});
