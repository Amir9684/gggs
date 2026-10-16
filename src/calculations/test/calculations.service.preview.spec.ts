import { CalculationsService } from '../calculations.service';
import { DesignMethod, SoilLayeringMethod } from '../enum';
import { generateRectangularGrid } from '../engine/grid-generator.engine';
import { previewCalculationSchema } from '../dto/preview-calculation.dto';

const user = { id: 'user-1' } as never;

const storedElements = generateRectangularGrid({
  length: 70,
  width: 70,
  burialDepth: 0.5,
  conductorDiameter: 0.01,
  lineCounts: { alongLength: 11, alongWidth: 11 },
  rods: { arrangement: 'PERIMETER', count: 8, length: 3 },
}).elements;

function makeService(
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

  const service = new CalculationsService(
    repo({ createQueryBuilder: jest.fn(() => queryBuilder) }) as never,
    repo({
      findOne: jest.fn().mockResolvedValue({
        faultCurrent: '3180',
        faultDuration: '0.5',
        splitFactor: '0.6',
        decrementFactor: '1',
        shockDuration: '0.5',
        ...overrides.fault,
      }),
    }) as never,
    repo({
      findOne: jest.fn().mockResolvedValue({
        surfaceLayerResistivity: '2500',
        surfaceLayerThickness: '0.102',
        bodyWeight: '70',
        frequency: '60',
      }),
    }) as never,
    repo() as never,
    repo() as never,
    repo() as never,
    repo() as never,
    repo() as never,
    repo({ find: jest.fn().mockResolvedValue(storedElements) }) as never,
    repo({
      find: jest
        .fn()
        .mockResolvedValue(
          overrides.layers ?? [
            { resistivity: '400', thickness: '10', layerOrder: 0 },
          ],
        ),
    }) as never,
    {
      findOwnedOrAdmin: jest.fn().mockResolvedValue({ id: 'project-1' }),
    } as never,
    {} as never,
    {} as never,
  );

  return { service, transaction, save };
}

const parse = (input: unknown) => previewCalculationSchema.parse(input);

describe('CalculationsService.preview', () => {
  it('evaluates the stored case without saving anything', async () => {
    const { service, transaction, save } = makeService();
    const res = await service.preview('case-1', parse({}), user);

    expect(res.statusCode).toBe(200);
    expect(res.data?.meshVoltage).toBeCloseTo(847.9199, 1);
    expect(res.data?.generated).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('re-derives Df when only the fault duration is overridden', async () => {
    const { service } = makeService();
    const stored = await service.preview('case-1', parse({}), user);
    const shorter = await service.preview(
      'case-1',
      parse({ fault: { faultDuration: 0.1 } }),
      user,
    );

    // stored Df = 1.0; 0.1 s -> Df 1.25, so the grid current grows by 25 %
    expect(shorter.data?.details.effectiveGridCurrent).toBeCloseTo(
      stored.data!.details.effectiveGridCurrent * 1.25,
      6,
    );
  });

  it('keeps an explicit Df over the derived one', async () => {
    const { service } = makeService();
    const res = await service.preview(
      'case-1',
      parse({ fault: { faultDuration: 0.1, decrementFactor: 1.0 } }),
      user,
    );
    const stored = await service.preview('case-1', parse({}), user);
    expect(res.data?.details.effectiveGridCurrent).toBeCloseTo(
      stored.data!.details.effectiveGridCurrent,
      6,
    );
  });

  it('uses a parametric grid instead of the stored one', async () => {
    const { service } = makeService();
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
    expect(res.data!.meshVoltage).toBeGreaterThan(847.9199);
  });

  it('derives line counts from a spacing', async () => {
    const { service } = makeService();
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
    const { service } = makeService();
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
    const { service } = makeService({ layering: SoilLayeringMethod.TWO_LAYER });
    const res = await service.preview('case-1', parse({}), user);
    expect(res.statusCode).toBe(400);
    expect(res.messages[0]).toMatch(/دقیقاً دو لایه/);
  });

  it('uses the 1986 engine for IEEE 80-86 cases', async () => {
    const a = await makeService({
      method: DesignMethod.IEEE_80_2000,
    }).service.preview('case-1', parse({}), user);
    const b = await makeService({
      method: DesignMethod.IEEE_80_86,
    }).service.preview('case-1', parse({}), user);
    expect(b.data!.meshVoltage).not.toBeCloseTo(a.data!.meshVoltage, 3);
  });

  it('refuses a method without an engine', async () => {
    const { service } = makeService({ method: DesignMethod.GALERKIN });
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
