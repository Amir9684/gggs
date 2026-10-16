/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- mock-heavy spec */
import { HttpStatus } from 'src/common/types';

import { GridElementsService } from './grid-elements.service';
import { Grid } from './entities/grid.entity';
import { GridElement } from './entities/grid-element.entity';

const user = { id: 'u1', role: 'USER' } as any;

function setup(options: { grid?: unknown } = {}) {
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
    save: jest.fn(async (_entity: unknown, rows: unknown[]) => {
      calls.push('save');
      return rows.map((row, index) => ({
        id: `e${index}`,
        ...(row as object),
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
  const gridsService = {
    findOwnedOrAdmin: jest.fn(async () =>
      'grid' in options ? options.grid : { id: 'g1' },
    ),
  };
  const service = new GridElementsService(
    elementRepository as any,
    {} as any,
    gridsService as any,
  );
  return { service, manager, elementRepository, calls };
}

const element = {
  type: 0,
  geometry: {
    type: 'LineString' as const,
    coordinates: [
      [0, 0],
      [10, 0],
    ] as [number, number][],
  },
  properties: {},
};

describe('GridElementsService.createBulk', () => {
  it('replaces the elements inside one transaction', async () => {
    const { service, manager, elementRepository, calls } = setup();

    const response: any = await service.createBulk(
      { gridId: 'g1', elements: [element, element] },
      user,
    );

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(response.data).toHaveLength(2);
    expect(elementRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.update).not.toHaveBeenCalled();
    expect(calls).toEqual(['delete', 'save']);
  });

  it('updates the grid dimensions in the same transaction, before the elements', async () => {
    const { service, manager, calls } = setup();

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
    const { service, manager } = setup();

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
    const { service, elementRepository } = setup({ grid: null });

    const response: any = await service.createBulk(
      { gridId: 'g1', elements: [element] },
      user,
    );

    expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(elementRepository.manager.transaction).not.toHaveBeenCalled();
  });
});
