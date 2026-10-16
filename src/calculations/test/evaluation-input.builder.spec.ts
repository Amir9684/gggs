import {
  buildEvaluationInput,
  type EvaluationDataSource,
} from '../evaluation-input.builder';
import { SoilLayeringMethod } from '../enum';
import { generateRectangularGrid } from '../engine/grid-generator.engine';

const elements = generateRectangularGrid({
  length: 70,
  width: 70,
  burialDepth: 0.5,
  conductorDiameter: 0.01,
  lineCounts: { alongLength: 11, alongWidth: 11 },
  rods: { arrangement: 'PERIMETER', count: 8, length: 3 },
}).elements;

const source = (
  over: Partial<EvaluationDataSource> = {},
): EvaluationDataSource => ({
  soilLayering: SoilLayeringMethod.ONE_LAYER,
  // decimal columns come back from the database as strings
  grid: { length: '70', width: '70', burialDepth: '0.5' },
  elements,
  soilModel: { surfaceResistivity: '400' },
  layers: [{ resistivity: '400', thickness: '10', layerOrder: 0 }],
  fault: {
    faultCurrent: '3180',
    faultDuration: '0.5',
    splitFactor: '0.6',
    decrementFactor: '1',
    shockDuration: '0.5',
  },
  settings: {
    surfaceLayerResistivity: '2500',
    surfaceLayerThickness: '0.102',
    bodyWeight: '70',
    frequency: '60',
  },
  ...over,
});

const failure = (over: Partial<EvaluationDataSource>) => {
  const result = buildEvaluationInput(source(over));
  if (result.ok) throw new Error('expected a validation failure');
  return result.message;
};

describe('buildEvaluationInput', () => {
  it('turns database decimals into the engine input', () => {
    const result = buildEvaluationInput(source());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.input.geometry.length).toBe(70);
    expect(result.input.geometry.rodCount).toBe(8);
    expect(result.input.soil).toEqual({
      surfaceResistivity: 400,
      apparentResistivity: 400,
    });
    expect(result.input.fault.faultCurrent).toBe(3180);
    expect(result.input.settings.bodyWeight).toBe(70);
  });

  it('adds the two layers for a two-layer case', () => {
    const result = buildEvaluationInput(
      source({
        soilLayering: SoilLayeringMethod.TWO_LAYER,
        layers: [
          { resistivity: '100', thickness: '2', layerOrder: 0 },
          { resistivity: '300', thickness: '10', layerOrder: 1 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.soil.twoLayer).toEqual({
      upperResistivity: 100,
      lowerResistivity: 300,
      upperThickness: 2,
    });
  });

  it('rejects a two-layer case whose soil model does not have two layers', () => {
    expect(failure({ soilLayering: SoilLayeringMethod.TWO_LAYER })).toMatch(
      /دقیقاً دو لایه/,
    );
  });

  it('rejects a two-layer case with a zero-thickness upper layer', () => {
    expect(
      failure({
        soilLayering: SoilLayeringMethod.TWO_LAYER,
        layers: [
          { resistivity: '100', thickness: '0', layerOrder: 0 },
          { resistivity: '300', thickness: '10', layerOrder: 1 },
        ],
      }),
    ).toMatch(/ضخامت لایهٔ بالایی/);
  });

  it('rejects invalid grid dimensions', () => {
    expect(
      failure({ grid: { length: 0, width: 70, burialDepth: 0.5 } }),
    ).toMatch(/طول شبکه/);
    expect(
      failure({ grid: { length: 70, width: -1, burialDepth: 0.5 } }),
    ).toMatch(/عرض شبکه/);
    expect(
      failure({ grid: { length: 70, width: 70, burialDepth: -0.1 } }),
    ).toMatch(/عمق دفن/);
  });

  it('rejects a grid without conductors or rods', () => {
    expect(failure({ elements: [] })).toMatch(/فاقد هادی یا میله/);
  });

  it('rejects invalid soil data', () => {
    expect(
      failure({
        layers: [{ resistivity: '0', thickness: '10', layerOrder: 0 }],
      }),
    ).toMatch(/لایه‌های خاک/);
    expect(failure({ soilModel: { surfaceResistivity: 0 } })).toMatch(
      /مقاومت ویژه سطح خاک/,
    );
  });

  it('rejects invalid fault values', () => {
    const fault = source().fault;
    expect(failure({ fault: { ...fault, faultCurrent: 0 } })).toMatch(
      /جریان خطا/,
    );
    expect(failure({ fault: { ...fault, splitFactor: 1.2 } })).toMatch(
      /ضریب تقسیم/,
    );
    expect(failure({ fault: { ...fault, decrementFactor: 0.9 } })).toMatch(
      /ضریب کاهشی/,
    );
    expect(failure({ fault: { ...fault, faultDuration: 0 } })).toMatch(
      /مدت زمان خطا/,
    );
    expect(failure({ fault: { ...fault, shockDuration: 0 } })).toMatch(
      /مدت زمان شوک/,
    );
  });

  it('rejects invalid settings', () => {
    const settings = source().settings;
    expect(
      failure({ settings: { ...settings, surfaceLayerThickness: -1 } }),
    ).toMatch(/ضخامت لایه سطحی/);
    expect(failure({ settings: { ...settings, bodyWeight: 0 } })).toMatch(
      /وزن بدن/,
    );
    expect(failure({ settings: { ...settings, frequency: 0 } })).toMatch(
      /فرکانس/,
    );
  });
});
