/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- mock-heavy spec */
import { HttpStatus } from 'src/common/types';

import { CalculationsService } from './calculations.service';
import { DesignMethod, SoilLayeringMethod } from './enum';

const user = { id: 'u1', role: 'USER' } as any;

/** A 60 x 40 m grid, conductors every 10 m (7 x 5 lines), one 3 m rod. */
function gridElements(extra: { rodLengthKey?: 'length' | 'lengthM' } = {}) {
  const elements: any[] = [];
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

function setup(
  overrides: { fault?: unknown; settings?: unknown; elements?: any[] } = {},
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
      const qb: any = {
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

  const service = new CalculationsService(
    calculationCaseRepository as any,
    { findOne: async () => fault } as any,
    { findOne: async () => settings } as any,
    {} as any,
    {
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
    } as any,
    { save: persisted } as any,
    { save: persisted } as any,
    { save: persisted } as any,
    gridElementRepository as any,
    {
      find: async () => [{ resistivity: 100, thickness: 0, layerOrder: 1 }],
    } as any,
    { findOwnedOrAdmin: async () => ({ id: 'p1' }) } as any,
    {} as any,
    {} as any,
  );

  return { service, persisted, gridElementRepository };
}

describe('CalculationsService.preview', () => {
  it('returns the engine numbers and persists nothing', async () => {
    const { service, persisted } = setup();

    const response: any = await service.preview('c1', {}, user);

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data.gridResistance).toBeGreaterThan(0);
    expect(response.data.gpr).toBeCloseTo(
      response.data.gridResistance * 5000 * 0.6,
      6,
    );
    expect(response.data.details.grid.conductorCountAlongLength).toBe(5);
    expect(response.data.details.grid.conductorCountAlongWidth).toBe(7);
    expect(persisted).not.toHaveBeenCalled();
  });

  it('counts the rods the editor draws (properties.lengthM)', async () => {
    const { service } = setup();
    const response: any = await service.preview('c1', {}, user);
    expect(response.data.grid.rodCount).toBe(1);
    expect(response.data.grid.totalRodLength).toBe(3);
  });

  it('scales GPR with an overridden fault current', async () => {
    const { service } = setup();

    const base: any = await service.preview('c1', {}, user);
    const doubled: any = await service.preview(
      'c1',
      { fault: { faultCurrent: 10000 } },
      user,
    );

    expect(doubled.data.gridResistance).toBeCloseTo(
      base.data.gridResistance,
      9,
    );
    expect(doubled.data.gpr).toBeCloseTo(base.data.gpr * 2, 6);
  });

  it('re-derives Df when only the fault duration is overridden', async () => {
    const { service } = setup();

    const response: any = await service.preview(
      'c1',
      { fault: { faultDuration: 0.1 } },
      user,
    );
    expect(response.data.decrementFactor).toBe(1.25);

    const explicit: any = await service.preview(
      'c1',
      { fault: { faultDuration: 0.1, decrementFactor: 1.4 } },
      user,
    );
    expect(explicit.data.decrementFactor).toBe(1.4);
  });

  it('previews unsaved elements without reading the saved ones', async () => {
    const { service, gridElementRepository } = setup();

    const elements = gridElements().filter((e) => e.type === 0);
    const response: any = await service.preview('c1', { elements }, user);

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data.grid.rodCount).toBe(0);
    expect(gridElementRepository.find).not.toHaveBeenCalled();
  });

  it('uses overridden grid dimensions', async () => {
    const { service } = setup();
    const response: any = await service.preview(
      'c1',
      { grid: { length: 80, width: 50 } },
      user,
    );
    expect(response.data.grid.area).toBe(4000);
  });

  it('rejects invalid overrides with the same messages as run()', async () => {
    const { service } = setup();
    const response: any = await service.preview(
      'c1',
      { fault: { splitFactor: 1.5 } },
      user,
    );
    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('refuses a case without fault data', async () => {
    const { service } = setup({ fault: null });
    const response: any = await service.preview('c1', {}, user);
    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('stores the same numbers when the case is run for real', async () => {
    const { service, persisted } = setup();

    const preview: any = await service.preview('c1', {}, user);
    expect(persisted).not.toHaveBeenCalled();

    const run: any = await service.run('c1', user);
    expect(run.statusCode).toBe(HttpStatus.CREATED);
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(run.data.gpr).toBe(preview.data.gpr);
    expect(run.data.touchVoltage).toBe(preview.data.touchVoltage);
    expect(run.data.stepVoltage).toBe(preview.data.stepVoltage);
    expect(run.data.safe).toBe(preview.data.safe);
  });
});
